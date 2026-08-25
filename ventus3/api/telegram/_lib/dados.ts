// api/telegram/_lib/dados.ts
// Las lecturas del bot. Una sola carga de cartera por interacción.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ MEMOIZAR LA CARTERA
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 llama a `getPortfolio()` en `processInput`, otra vez en
// `applyCorrection`, otra en `fillNextAction` y otra en el callback de `pick:`.
// Son cuatro round-trips a Postgres y, peor, cuatro reinyecciones de la
// cartera completa en el prompt dentro de la MISMA interacción. Acá se carga
// una vez por invocación y se reusa: el ahorro es de latencia y de tokens.
//
// El TTL es corto (30 s) y vive en memoria del proceso: en Vercel cada
// invocación es un proceso nuevo o casi, así que esto no es un caché
// distribuido ni pretende serlo. Es un memo de la vida de un request.

import type {
  Activity,
  Commitment,
  IsoDate,
  Lead,
  Opportunity,
  PlannedAction,
  Task,
  Touchpoint,
} from '../../../src/core/index.js'
import {
  DEFAULT_RING_GOALS,
  MAX_TOUCHPOINTS,
  addDays,
  anelDoDia,
  atrasoEmDias,
  computeDailyScore,
  daysBetween,
  estadoDaSequencia,
  gatesFaltantes,
  getScaleScores,
  getStageName,
  proximoTouchpoint,
  rankDay,
  todayBr,
  weekStart,
} from '../../../src/core/index.js'
import type { AuthContext } from '../../_lib/auth.js'
import type { CarteiraDoVendedor } from '../../_lib/carteira.js'
import { carregarCarteira, diasSemContato, resolverAlvo, alvosDaCarteira } from '../../_lib/carteira.js'
import type { AlvoDaCarteira } from '../../_lib/carteira.js'
import { serviceClient } from '../../_lib/supabase.js'

/* ══════════════════════════════════════════════════════════════════════════
   Memo de cartera
   ══════════════════════════════════════════════════════════════════════════ */

interface CarteiraEmCache {
  carteira: CarteiraDoVendedor
  em: number
}

const CARTEIRA_TTL_MS = 30_000
const memo = new Map<string, CarteiraEmCache>()

/** Solo para tests y para el re-drive: fuerza recarga. */
export function limparMemoDeCarteira(): void {
  memo.clear()
}

export async function carteiraDoBot(ctx: AuthContext): Promise<CarteiraDoVendedor> {
  const chave = ctx.vendorName
  const guardada = memo.get(chave)
  if (guardada && Date.now() - guardada.em < CARTEIRA_TTL_MS) return guardada.carteira

  const carteira = await carregarCarteira(ctx, { diasDeAtividade: 90 })
  memo.set(chave, { carteira, em: Date.now() })
  return carteira
}

/**
 * La cartera en texto para el prompt. Una línea por entidad, con los días de
 * silencio ya calculados: el modelo la usa para matchear nombres, no para
 * razonar sobre el negocio.
 */
export function carteiraParaPrompt(carteira: CarteiraDoVendedor): string {
  const linhas: string[] = []
  for (const o of carteira.oportunidades) {
    const nome = o.client ?? o.name ?? `Oportunidade ${o.id}`
    const extra = o.name && o.client && o.name !== o.client ? ` — ${o.name}` : ''
    linhas.push(`[opportunity ${o.id}] ${nome}${extra} · etapa ${o.stage ?? '?'} · vendedor ${o.vendor}`)
  }
  for (const l of carteira.leads) {
    const contato = l.contact_name ? ` (${l.contact_name})` : ''
    linhas.push(`[lead ${l.id}] ${l.company_name}${contato} · ${l.stage} · TP ${l.touchpoints_count}/7 · vendedor ${l.vendor}`)
  }
  if (linhas.length === 0) {
    return 'CARTEIRA DISPONÍVEL PARA MATCH: vazia. Devolva alvo null e candidatos vazio — não invente ninguém.'
  }
  return `CARTEIRA DISPONÍVEL PARA MATCH (a ÚNICA lista válida; fora dela não existe ninguém):\n${linhas.join('\n')}`
}

/* ══════════════════════════════════════════════════════════════════════════
   `tasks`: la fila de Postgres no es el tipo del dominio
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `carregarCarteira` hace `select('*')` y castea a `Task[]`, pero la tabla
 * tiene `titulo`/`opportunity_id`/`lead_id` y el dominio espera
 * `title`/`target`. Mientras `tasks` esté en cero filas nadie lo nota; en
 * cuanto se llene, `indexarTasks` reventaría contra `t.target.kind`. Se
 * normaliza acá, que es donde el bot consume la tabla.
 */
interface FilaDeTask {
  id?: unknown
  vendor?: unknown
  opportunity_id?: unknown
  lead_id?: unknown
  titulo?: unknown
  title?: unknown
  due_date?: unknown
  status?: unknown
  snoozed_to?: unknown
  created_at?: unknown
  target?: unknown
}

export function normalizarTasks(brutas: readonly unknown[]): Task[] {
  const saida: Task[] = []
  for (const bruta of brutas) {
    const f = bruta as FilaDeTask
    if (f.target && typeof f.target === 'object') {
      saida.push(bruta as Task)
      continue
    }
    const oppId = typeof f.opportunity_id === 'number' ? f.opportunity_id : null
    const leadId = typeof f.lead_id === 'number' ? f.lead_id : null
    if (oppId === null && leadId === null) continue
    const status = typeof f.status === 'string' ? f.status : 'pending'
    saida.push({
      id: String(f.id ?? ''),
      vendor: String(f.vendor ?? ''),
      kind: 'next_action',
      target: oppId !== null ? { kind: 'opportunity', id: oppId } : { kind: 'lead', id: leadId as number },
      title: String(f.titulo ?? f.title ?? ''),
      due_date: typeof f.due_date === 'string' ? f.due_date : null,
      status: status === 'cancelled' ? 'dismissed' : (status as Task['status']),
      snoozed_until: typeof f.snoozed_to === 'string' ? f.snoozed_to : null,
      created_at: String(f.created_at ?? ''),
    })
  }
  return saida
}

/* ══════════════════════════════════════════════════════════════════════════
   Resolución de entidades
   ══════════════════════════════════════════════════════════════════════════ */

export function oportunidadeDe(carteira: CarteiraDoVendedor, id: number): Opportunity | null {
  return carteira.oportunidades.find((o) => o.id === id) ?? null
}

export function leadDe(carteira: CarteiraDoVendedor, id: number): Lead | null {
  return carteira.leads.find((l) => l.id === id) ?? null
}

export function rotuloDe(carteira: CarteiraDoVendedor, kind: 'opportunity' | 'lead', id: number): string {
  if (kind === 'opportunity') {
    const o = oportunidadeDe(carteira, id)
    if (!o) return `Oportunidade ${id}`
    const cliente = o.client ?? o.name ?? `Oportunidade ${id}`
    return o.name && o.client && o.name !== o.client ? `${cliente} — ${o.name}` : cliente
  }
  const l = leadDe(carteira, id)
  return l ? `${l.company_name}${l.contact_name ? ` (${l.contact_name})` : ''}` : `Lead ${id}`
}

/** `/status <cliente>`: resuelve por nombre natural. Lanza si es ambiguo. */
export function buscarPorNome(carteira: CarteiraDoVendedor, nome: string): AlvoDaCarteira {
  return resolverAlvo(nome, alvosDaCarteira(carteira))
}

/* ══════════════════════════════════════════════════════════════════════════
   /hoje — las 3 tarjetas, con el mismo motor que la app
   ══════════════════════════════════════════════════════════════════════════ */

export function planoDoDia(carteira: CarteiraDoVendedor): PlannedAction[] {
  return rankDay({
    vendor: carteira.vendor,
    today: carteira.hoje as IsoDate,
    opportunities: carteira.oportunidades,
    leads: carteira.leads,
    activities: carteira.atividades,
    tasks: normalizarTasks(carteira.tarefas),
    commitments: carteira.compromissos,
    touchpoints: carteira.touchpoints,
    vendorInfo: carteira.vendorInfo,
  }).top
}

/* ══════════════════════════════════════════════════════════════════════════
   /status — resumen + escalas + gate + días de inactividad
   ══════════════════════════════════════════════════════════════════════════ */

export interface FichaDeStatus {
  kind: 'opportunity' | 'lead'
  rotulo: string
  /** Solo oportunidades. */
  etapa: number | null
  etapaNome: string
  valor: number | null
  escalas: Array<{ escala: string; nivel: number }>
  saudeDeclarada: number
  gates: string[]
  diasSemContato: number
  proximaAcao: { texto: string; data: string | null } | null
  ultimasAtividades: Array<{ data: string; tipo: string; descricao: string; resultado: string | null }>
  /** Solo leads. */
  toques: { feitos: number; total: number; proximoCanal: string | null; atraso: number } | null
  contatos: string[]
}

export async function fichaDeStatus(
  carteira: CarteiraDoVendedor,
  alvo: AlvoDaCarteira,
): Promise<FichaDeStatus | null> {
  if (alvo.kind === 'opportunity') {
    const o = oportunidadeDe(carteira, alvo.id)
    if (!o) return null
    const escalas = getScaleScores(o.scales)
    const stage = (o.stage ?? 1) as 1 | 2 | 3 | 4 | 5 | 6
    const timeline = carteira.atividades
      .filter((a) => a.opportunity_id === o.id)
      .sort((a, b) => (b.activity_date ?? '').localeCompare(a.activity_date ?? ''))
      .slice(0, 5)

    return {
      kind: 'opportunity',
      rotulo: rotuloDe(carteira, 'opportunity', o.id),
      etapa: o.stage ?? null,
      etapaNome: getStageName(o.stage) || '—',
      valor: o.value ?? null,
      escalas: Object.entries(escalas).map(([escala, nivel]) => ({ escala, nivel })),
      saudeDeclarada:
        Math.round((Object.values(escalas).reduce((s, v) => s + v, 0) / 6) * 10) / 10,
      gates: gatesFaltantes(o.scales, stage).map((g) => g.texto),
      diasSemContato: diasSemContato(o, carteira),
      proximaAcao: o.next_action ? { texto: o.next_action, data: o.next_action_date ?? null } : null,
      ultimasAtividades: timeline.map((a: Activity) => ({
        data: (a.activity_date ?? a.created_at ?? '').slice(0, 10),
        tipo: a.activity_type,
        descricao: a.description,
        resultado: a.result,
      })),
      toques: null,
      contatos: [
        o.power_sponsor ? `Power sponsor: ${o.power_sponsor}` : null,
        o.sponsor ? `Sponsor: ${o.sponsor}` : null,
        o.influencer ? `Influenciador: ${o.influencer}` : null,
        o.support_contact ? `Apoio: ${o.support_contact}` : null,
      ].filter((c): c is string => c !== null),
    }
  }

  const l = leadDe(carteira, alvo.id)
  if (!l) return null
  const toques = carteira.touchpoints
    .filter((t) => t.lead_id === l.id)
    .sort((a, b) => b.executed_at.localeCompare(a.executed_at))
    .slice(0, 5)
  const passo = proximoTouchpoint(l)

  return {
    kind: 'lead',
    rotulo: rotuloDe(carteira, 'lead', l.id),
    etapa: null,
    etapaNome: l.stage,
    valor: null,
    escalas: [],
    saudeDeclarada: 0,
    gates: [],
    diasSemContato: l.last_touchpoint_date ? daysBetween(l.last_touchpoint_date, carteira.hoje) : -1,
    proximaAcao: l.next_touchpoint_date
      ? { texto: passo ? passo.label : 'Próximo toque', data: l.next_touchpoint_date }
      : null,
    ultimasAtividades: toques.map((t: Touchpoint) => ({
      data: t.executed_at.slice(0, 10),
      tipo: t.channel,
      descricao: t.notes ?? '',
      resultado: t.result,
    })),
    toques: {
      feitos: l.touchpoints_count,
      total: MAX_TOUCHPOINTS,
      proximoCanal: passo?.channel ?? null,
      atraso: atrasoEmDias(l, carteira.hoje as IsoDate),
    },
    contatos: [l.contact_name ? `${l.contact_name}${l.contact_title ? ` — ${l.contact_title}` : ''}` : null].filter(
      (c): c is string => c !== null,
    ),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /pendentes · /parados · /pipeline · /compromissos
   ══════════════════════════════════════════════════════════════════════════ */

export interface Pendencia {
  kind: 'opportunity' | 'lead' | 'task' | 'commitment'
  id: number | string
  rotulo: string
  texto: string
  data: string | null
  vencida: boolean
  /** opportunities.vendor y leads.vendor admiten null en la base. */
  vendor: string | null
}

export function pendencias(carteira: CarteiraDoVendedor, ate?: IsoDate): Pendencia[] {
  const hoje = carteira.hoje as IsoDate
  const limite = ate ?? weekEndBr(hoje)
  const saida: Pendencia[] = []

  for (const o of carteira.oportunidades) {
    const data = o.next_action_date
    if (!data || data > limite) continue
    saida.push({
      kind: 'opportunity',
      id: o.id,
      rotulo: rotuloDe(carteira, 'opportunity', o.id),
      texto: o.next_action ?? 'Próxima ação sem descrição',
      data,
      vencida: data < hoje,
      vendor: o.vendor,
    })
  }
  for (const l of carteira.leads) {
    const data = l.next_touchpoint_date
    if (!data || data > limite) continue
    const passo = proximoTouchpoint(l)
    saida.push({
      kind: 'lead',
      id: l.id,
      rotulo: l.company_name,
      texto: passo ? `TP${passo.tp} · ${passo.label}` : 'Próximo toque',
      data,
      vencida: data < hoje,
      vendor: l.vendor,
    })
  }
  for (const t of normalizarTasks(carteira.tarefas)) {
    const data = t.due_date
    if (!data || data > limite || t.status !== 'pending') continue
    saida.push({
      kind: 'task',
      id: t.id,
      rotulo: rotuloDe(carteira, t.target.kind === 'lead' ? 'lead' : 'opportunity', t.target.id),
      texto: t.title,
      data,
      vencida: data < hoje,
      vendor: t.vendor,
    })
  }
  for (const c of carteira.compromissos) {
    const data = c.due_date ?? null
    if (data && data > limite) continue
    saida.push({
      kind: 'commitment',
      id: c.id,
      rotulo: 'Compromisso da segunda',
      texto: c.committed_action,
      data,
      vencida: data !== null && data < hoje,
      vendor: c.vendor,
    })
  }

  return saida.sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999'))
}

/** Fin de semana civil (domingo) de la semana de `iso`. */
function weekEndBr(iso: IsoDate): IsoDate {
  return addDays(weekStart(iso), 6)
}

export interface Parada {
  id: number
  rotulo: string
  dias: number
  etapa: string
  valor: number
  /** opportunities.vendor admite null en la base. */
  vendor: string | null
}

export function paradas(carteira: CarteiraDoVendedor, dias = 15): Parada[] {
  return carteira.oportunidades
    .map((o) => ({
      id: o.id,
      rotulo: rotuloDe(carteira, 'opportunity', o.id),
      dias: diasSemContato(o, carteira),
      etapa: getStageName(o.stage) || '—',
      valor: o.value ?? 0,
      vendor: o.vendor,
    }))
    .filter((p) => p.dias >= dias)
    .sort((a, b) => b.dias - a.dias)
}

export interface LinhaDePipeline {
  etapa: number
  nome: string
  quantidade: number
  valor: number
}

export function pipeline(carteira: CarteiraDoVendedor): {
  linhas: LinhaDePipeline[]
  total: { quantidade: number; valor: number }
  semProximaAcao: number
} {
  const porEtapa = new Map<number, LinhaDePipeline>()
  let semProximaAcao = 0

  for (const o of carteira.oportunidades) {
    const etapa = o.stage ?? 1
    const linha = porEtapa.get(etapa) ?? {
      etapa,
      nome: getStageName(etapa) || `Etapa ${etapa}`,
      quantidade: 0,
      valor: 0,
    }
    linha.quantidade += 1
    linha.valor += Number(o.value ?? 0)
    porEtapa.set(etapa, linha)
    if (!o.next_action_date) semProximaAcao += 1
  }

  const linhas = [...porEtapa.values()].sort((a, b) => a.etapa - b.etapa)
  return {
    linhas,
    total: {
      quantidade: linhas.reduce((s, l) => s + l.quantidade, 0),
      valor: linhas.reduce((s, l) => s + l.valor, 0),
    },
    semProximaAcao,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /anel · /placar
   ══════════════════════════════════════════════════════════════════════════ */

function doDia<T extends { activity_date?: string | null; executed_at?: string }>(
  itens: readonly T[],
  dia: string,
): T[] {
  return itens.filter((i) => {
    const marca = i.activity_date ?? i.executed_at ?? ''
    return String(marca).slice(0, 10) === dia
  })
}

export function aneisDeHoje(carteira: CarteiraDoVendedor): ReturnType<typeof anelDoDia> {
  return anelDoDia(
    doDia(carteira.atividades, carteira.hoje),
    DEFAULT_RING_GOALS,
    doDia(carteira.touchpoints, carteira.hoje),
  )
}

/**
 * La racha sale de `golden_sessions` selladas. Si la tabla todavía está vacía
 * el estado dice «sua sequência começa hoje» — nunca un 0 inventado.
 */
export async function sequenciaDoVendedor(
  vendorName: string,
  hoje: IsoDate,
): Promise<ReturnType<typeof estadoDaSequencia>> {
  const db = serviceClient()
  const [sessoes, streak] = await Promise.all([
    db
      .from('golden_sessions')
      .select('dia, hora_cheia')
      .eq('vendor', vendorName)
      .eq('hora_cheia', true)
      .gte('dia', addDays(hoje, -180))
      .limit(400),
    db.from('streaks').select('escudos').eq('vendor', vendorName).maybeSingle(),
  ])

  const historico = sessoes.error
    ? []
    : ((sessoes.data ?? []) as Array<{ dia: string }>).map((s) => s.dia as IsoDate)
  const fila = streak.data as { escudos: number | null } | null
  return estadoDaSequencia(historico, fila?.escudos ?? 0, hoje)
}

export function placarDaSemana(carteira: CarteiraDoVendedor): {
  dias: ReturnType<typeof computeDailyScore>[]
  pa: number
} {
  const inicio = weekStart(carteira.hoje as IsoDate)
  const dias: ReturnType<typeof computeDailyScore>[] = []
  for (let i = 0; i < 7; i += 1) {
    const dia = addDays(inicio, i)
    if (dia > carteira.hoje) break
    dias.push(
      computeDailyScore(
        carteira.vendor,
        dia,
        doDia(carteira.atividades, dia),
        doDia(carteira.touchpoints, dia),
        carteira.compromissos,
      ),
    )
  }
  return { dias, pa: dias.reduce((s, d) => s + d.points, 0) }
}

/* ══════════════════════════════════════════════════════════════════════════
   /golden — la fila de prospección
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La cola de la Golden Hour: leads con toque atrasado o de hoy, ordenados por
 * atraso. Se congela al abrir la sesión (se guardan los ids en `bot_sessions`)
 * para que servir el lead 4 no dependa de que la cola no se haya movido.
 */
export function filaGolden(carteira: CarteiraDoVendedor, limite = 12): Lead[] {
  const hoje = carteira.hoje as IsoDate
  return carteira.leads
    .filter((l) => l.status === 'active' && l.touchpoints_count < MAX_TOUCHPOINTS)
    .filter((l) => l.next_touchpoint_date === null || l.next_touchpoint_date <= hoje)
    .sort((a, b) => atrasoEmDias(b, hoje) - atrasoEmDias(a, hoje))
    .slice(0, limite)
}

/* ══════════════════════════════════════════════════════════════════════════
   /compromissos
   ══════════════════════════════════════════════════════════════════════════ */

export function compromissosDaSemana(carteira: CarteiraDoVendedor): Commitment[] {
  const segunda = weekStart(carteira.hoje as IsoDate)
  return carteira.compromissos.filter((c) => (c.week_of ?? '') >= addDays(segunda, -7))
}

/* ══════════════════════════════════════════════════════════════════════════
   Actividades y toques del período, para el digest
   ══════════════════════════════════════════════════════════════════════════ */

export interface MovimentoDoDia {
  vendor: string
  atividades: Activity[]
  touchpoints: Array<Touchpoint & { lead_vendor: string; company_name: string }>
  leadsNovos: string[]
}

export async function movimentoDoPeriodo(deIso: string, ateIso: string): Promise<MovimentoDoDia[]> {
  const db = serviceClient()
  const de = `${deIso}T00:00:00-03:00`
  const ate = `${ateIso}T00:00:00-03:00`

  const [acts, tps, leads] = await Promise.all([
    db
      .from('activities')
      .select('*')
      .gte('created_at', de)
      .lt('created_at', ate)
      .neq('source', 'ai_generated')
      .limit(1000),
    db
      .from('touchpoints')
      .select('*, leads(vendor, company_name)')
      .gte('executed_at', de)
      .lt('executed_at', ate)
      .limit(1000),
    db.from('leads').select('vendor, company_name').gte('created_at', de).lt('created_at', ate).limit(500),
  ])

  const por = new Map<string, MovimentoDoDia>()
  const balde = (vendor: string): MovimentoDoDia => {
    const chave = vendor || '?'
    let b = por.get(chave)
    if (!b) {
      b = { vendor: chave, atividades: [], touchpoints: [], leadsNovos: [] }
      por.set(chave, b)
    }
    return b
  }

  for (const a of (acts.data ?? []) as Activity[]) balde(a.vendor).atividades.push(a)
  for (const t of (tps.data ?? []) as Array<Touchpoint & { leads?: { vendor?: string; company_name?: string } }>) {
    const vendor = t.leads?.vendor ?? ''
    if (!vendor) continue
    balde(vendor).touchpoints.push({
      ...t,
      lead_vendor: vendor,
      company_name: t.leads?.company_name ?? '?',
    })
  }
  for (const l of (leads.data ?? []) as Array<{ vendor: string; company_name: string }>) {
    balde(l.vendor).leadsNovos.push(l.company_name)
  }

  return [...por.values()]
}

/** Vendedores activos con su canal de Telegram verificado, para el dispatcher. */
export async function destinatariosDoDigest(): Promise<
  Array<{ vendorId: number; vendorName: string; isAdmin: boolean; chatId: number }>
> {
  const db = serviceClient()
  const [canais, vendedores] = await Promise.all([
    db
      .from('vendor_channels')
      .select('vendor_id, chat_id, kind, is_active, verificado_em')
      .eq('is_active', true)
      .eq('kind', 'telegram')
      .not('verificado_em', 'is', null)
      .limit(100),
    db.from('vendors').select('id, name, is_admin, is_active, telegram_id').eq('is_active', true).limit(100),
  ])

  const porVendor = new Map<number, number>()
  for (const c of (canais.data ?? []) as Array<{ vendor_id: number; chat_id: number }>) {
    porVendor.set(c.vendor_id, c.chat_id)
  }

  const saida: Array<{ vendorId: number; vendorName: string; isAdmin: boolean; chatId: number }> = []
  for (const v of (vendedores.data ?? []) as Array<{
    id: number
    name: string
    is_admin: boolean | null
    telegram_id: number | null
  }>) {
    // Canal verificado primero; `vendors.telegram_id` como respaldo legado.
    const chatId = porVendor.get(v.id) ?? v.telegram_id
    if (chatId === null || chatId === undefined) continue
    saida.push({ vendorId: v.id, vendorName: v.name, isAdmin: v.is_admin === true, chatId: Number(chatId) })
  }
  return saida
}

export { todayBr }
