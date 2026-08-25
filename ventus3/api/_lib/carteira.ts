// api/_lib/carteira.ts
// La cartera del vendedor leída del servidor: es el único universo contra el
// que el modelo puede matchear un cliente.
//
// ══════════════════════════════════════════════════════════════════════════
// TOLERANCIA A TABLAS QUE TODAVÍA NO EXISTEN
// ══════════════════════════════════════════════════════════════════════════
// Las migraciones 0001-0010 están escritas y NINGUNA fue aplicada (ESTADO.md
// §5.1). `tasks`, `scale_evidence` y `ventus_actions` pueden no existir el día
// que esto se despliegue. Un backend que devuelve 500 porque falta una tabla
// que el plano todavía no aplicó es un backend inútil: `consultarTolerante`
// se traga el 42P01 (tabla inexistente) y el 42703 (columna inexistente) y
// devuelve vacío, dejando rastro en el log. El resto del pipeline funciona:
// rankDay() sabe trabajar sin tasks, solo pierde el factor de tarea vencida.

import type { PostgrestError } from '@supabase/supabase-js'
import type {
  Activity,
  Commitment,
  Lead,
  Opportunity,
  Task,
  Touchpoint,
  Vendor,
} from '../../src/core'
import { addDays, getDaysSinceLastContact, getScaleScores, getStageName, todayBr } from '../../src/core'
import type { AuthContext } from './auth'
import { erroAlvoAmbiguo, erroAlvoNaoEncontrado } from './tools'
import { serviceClient } from './supabase'

/** Códigos de Postgres que significan «eso todavía no existe». */
const AUSENTE = new Set(['42P01', '42703', 'PGRST205', 'PGRST202'])

function tolerar<T>(tabela: string, erro: PostgrestError | null, dados: T[] | null): T[] {
  if (!erro) return dados ?? []
  if (AUSENTE.has(erro.code)) {
    console.warn(`[carteira] ${tabela} indisponível (${erro.code}): seguindo sem ela`)
    return []
  }
  console.error(`[carteira] ${tabela} falhou: ${erro.code} ${erro.message}`)
  return []
}

/* ══════════════════════════════════════════════════════════════════════════
   Carga
   ══════════════════════════════════════════════════════════════════════════ */

export interface CarteiraDoVendedor {
  vendor: string
  vendorInfo: Vendor | null
  oportunidades: Opportunity[]
  leads: Lead[]
  /** Últimos 90 días. Es lo que mide el silencio de verdad. */
  atividades: Activity[]
  tarefas: Task[]
  compromissos: Commitment[]
  touchpoints: Touchpoint[]
  hoje: string
}

export interface OpcoesDeCarteira {
  /** Días de historial de actividad. 90 por defecto, igual que el cache local. */
  diasDeAtividade?: number
  /** El admin puede pedir la cartera del equipo entero. */
  todosOsVendedores?: boolean
}

export async function carregarCarteira(
  ctx: AuthContext,
  opcoes: OpcoesDeCarteira = {},
): Promise<CarteiraDoVendedor> {
  const db = serviceClient()
  const hoje = todayBr()
  const desde = addDays(hoje, -(opcoes.diasDeAtividade ?? 90))
  const global = opcoes.todosOsVendedores === true && ctx.isAdmin
  // El filtro por dueño se aplica con `like`, no con `eq`, para poder pedir la
  // cartera del equipo con '%' sin duplicar las cinco consultas. Los seis
  // nombres de vendedor son texto plano: no hay comodines que escapar.
  const dono = global ? '%' : ctx.vendorName
  const q = (tabela: string) => db.from(tabela).select('*').like('vendor', dono)

  const [opps, leads, atividades, tarefas, compromissos, vendedor] = await Promise.all([
    q('opportunities').is('outcome', null).limit(500),
    q('leads').eq('status', 'active').limit(500),
    q('activities').gte('activity_date', desde).limit(2000),
    q('tasks').in('status', ['pending', 'snoozed']).limit(500),
    q('commitments').eq('status', 'pending').limit(200),
    db.from('vendors').select('*').eq('name', ctx.vendorName).maybeSingle(),
  ])

  const listaLeads = tolerar<Lead>('leads', leads.error, leads.data as Lead[] | null)

  // Los touchpoints se piden por lead: no hay columna vendor en la tabla.
  let listaTouchpoints: Touchpoint[] = []
  if (listaLeads.length > 0) {
    const tp = await db
      .from('touchpoints')
      .select('*')
      .in(
        'lead_id',
        listaLeads.map((l) => l.id),
      )
      .limit(3000)
    listaTouchpoints = tolerar<Touchpoint>('touchpoints', tp.error, tp.data as Touchpoint[] | null)
  }

  return {
    vendor: ctx.vendorName,
    vendorInfo: (vendedor.data as Vendor | null) ?? null,
    oportunidades: tolerar<Opportunity>('opportunities', opps.error, opps.data as Opportunity[] | null),
    leads: listaLeads,
    atividades: tolerar<Activity>('activities', atividades.error, atividades.data as Activity[] | null),
    tarefas: tolerar<Task>('tasks', tarefas.error, tarefas.data as Task[] | null),
    compromissos: tolerar<Commitment>('commitments', compromissos.error, compromissos.data as Commitment[] | null),
    touchpoints: listaTouchpoints,
    hoje,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Identificadores naturales
   ══════════════════════════════════════════════════════════════════════════ */

export interface AlvoDaCarteira {
  kind: 'opportunity' | 'lead'
  id: number
  /** Nombre del negocio o de la empresa. */
  nome: string
  /** Empresa / cliente. */
  cliente: string
}

/** Sin acentos, sin puntuación, sin sufijos societarios. El equipo escribe rápido. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|s\.?a\.?|eireli|me|epp|do brasil|brasil|brazil|inc|corp)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function alvosDaCarteira(carteira: CarteiraDoVendedor): AlvoDaCarteira[] {
  const alvos: AlvoDaCarteira[] = carteira.oportunidades.map((o) => ({
    kind: 'opportunity' as const,
    id: o.id,
    nome: o.name ?? o.client ?? `Oportunidade ${o.id}`,
    cliente: o.client ?? o.name ?? `Oportunidade ${o.id}`,
  }))
  for (const l of carteira.leads) {
    alvos.push({ kind: 'lead', id: l.id, nome: l.company_name, cliente: l.company_name })
  }
  return alvos
}

/**
 * Resuelve un nombre natural a una entidad concreta.
 *
 * Tres pasadas, de más estricta a menos: igualdad normalizada, prefijo de
 * palabra, contención. Si la pasada que acierta devuelve más de uno, es
 * ambiguo y se PREGUNTA — elegir por score acá es exactamente cómo el bot del
 * v2 terminó registrando visitas en el cliente equivocado.
 */
export function resolverAlvo(
  nome: string,
  alvos: readonly AlvoDaCarteira[],
  tipo?: 'opportunity' | 'lead',
): AlvoDaCarteira {
  const universo = tipo ? alvos.filter((a) => a.kind === tipo) : alvos
  const alvo = normalizar(nome)
  if (alvo === '') {
    throw erroAlvoNaoEncontrado(nome, universo.slice(0, 5).map((a) => a.nome))
  }

  const chaves = universo.map((a) => ({ a, n: normalizar(a.nome), c: normalizar(a.cliente) }))

  const exatos = chaves.filter((k) => k.n === alvo || k.c === alvo)
  if (exatos.length === 1) return (exatos[0] as { a: AlvoDaCarteira }).a
  if (exatos.length > 1) throw erroAlvoAmbiguo(nome, exatos.map((k) => k.a.nome))

  const porPrefixo = chaves.filter((k) => k.n.startsWith(alvo) || k.c.startsWith(alvo))
  if (porPrefixo.length === 1) return (porPrefixo[0] as { a: AlvoDaCarteira }).a
  if (porPrefixo.length > 1) throw erroAlvoAmbiguo(nome, porPrefixo.map((k) => k.a.nome))

  const contidos = chaves.filter((k) => k.n.includes(alvo) || k.c.includes(alvo) || alvo.includes(k.c))
  if (contidos.length === 1) return (contidos[0] as { a: AlvoDaCarteira }).a
  if (contidos.length > 1) throw erroAlvoAmbiguo(nome, contidos.map((k) => k.a.nome))

  // Nada. Se devuelven los más parecidos por palabra compartida, para que el
  // modelo tenga de dónde elegir en vez de inventar.
  const palavras = alvo.split(' ')
  const parecidos = chaves
    .filter((k) => palavras.some((p) => p.length > 2 && (k.n.includes(p) || k.c.includes(p))))
    .slice(0, 5)
    .map((k) => k.a.nome)
  throw erroAlvoNaoEncontrado(nome, parecidos)
}

/* ══════════════════════════════════════════════════════════════════════════
   Render para el prompt
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Días de silencio de UNA oportunidad, medidos sobre SUS actividades.
 *
 * `getDaysSinceLastContact` recibe el historial ya filtrado: pasarle la
 * cartera entera haría que la última llamada a cualquier cliente «revivera»
 * a todos los demás. Es un error fácil de cometer y de no ver nunca.
 */
export function diasSemContato(opp: Opportunity, carteira: CarteiraDoVendedor): number {
  const doCliente = carteira.atividades.filter((a) => a.opportunity_id === opp.id)
  return getDaysSinceLastContact(opp.last_update, doCliente)
}

/**
 * La cartera en texto plano. Una línea por entidad, corta: el modelo la usa
 * para matchear nombres, no para razonar sobre el negocio.
 */
export function carteiraTexto(carteira: CarteiraDoVendedor): string {
  const linhas: string[] = []
  for (const o of carteira.oportunidades) {
    const dias = diasSemContato(o, carteira)
    linhas.push(
      `[oportunidade ${o.id}] ${o.client ?? o.name ?? '?'}` +
        (o.name && o.client && o.name !== o.client ? ` — ${o.name}` : '') +
        ` · etapa ${o.stage ?? '?'} ${getStageName(o.stage)}` +
        ` · ${dias} dias sem contato`,
    )
  }
  for (const l of carteira.leads) {
    linhas.push(
      `[lead ${l.id}] ${l.company_name} · ${l.stage} · TP ${l.touchpoints_count}/7` +
        (l.next_touchpoint_date ? ` · próximo toque ${l.next_touchpoint_date}` : ' · sem próximo toque'),
    )
  }
  if (linhas.length === 0) {
    return 'CARTEIRA DO VENDEDOR: vazia. Não existe nenhum cliente para matchear — não invente nenhum.'
  }
  return `CARTEIRA DO VENDEDOR (a ÚNICA lista válida para matchear clientes; fora dela não existe ninguém):\n${linhas.join('\n')}`
}

/** Ficha completa de una oportunidad, para coaching y diagnóstico. */
export function fichaDaOportunidade(
  opp: Opportunity,
  carteira: CarteiraDoVendedor,
  atividades = 8,
): string {
  const escalas = getScaleScores(opp.scales)
  const dias = diasSemContato(opp, carteira)
  const contatos = [
    opp.power_sponsor ? `Power Sponsor (decide): ${opp.power_sponsor}` : null,
    opp.sponsor ? `Sponsor: ${opp.sponsor}` : null,
    opp.influencer ? `Influenciador: ${opp.influencer}` : null,
    opp.support_contact ? `Contato operacional: ${opp.support_contact}` : null,
  ].filter((c): c is string => c !== null)

  const timeline = carteira.atividades
    .filter((a) => a.opportunity_id === opp.id)
    .sort((a, b) => (b.activity_date ?? '').localeCompare(a.activity_date ?? ''))
    .slice(0, atividades)
    .map((a) => `  ${a.activity_date ?? '?'} · ${a.activity_type} · ${a.description}${a.result ? ` → ${a.result}` : ''}`)

  const partes = [
    `FICHA: ${opp.client ?? opp.name ?? '?'}${opp.name && opp.name !== opp.client ? ` (${opp.name})` : ''}`,
    `Indústria: ${opp.industry ?? 'não informada'} · Produto: ${opp.product ?? 'não informado'} · Linhas: ${(opp.product_lines ?? []).join(', ') || 'não definidas'}`,
    `Valor: R$ ${(opp.value ?? 0).toLocaleString('pt-BR')} · Etapa ${opp.stage ?? '?'} ${getStageName(opp.stage)} · ${dias} dias sem contato real`,
    `Escalas: ${Object.entries(escalas).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ')}`,
    contatos.length > 0 ? `Contatos:\n  ${contatos.join('\n  ')}` : 'Contatos: NENHUM mapeado (single-threaded)',
    opp.next_action
      ? `Próxima ação: ${opp.next_action}${opp.next_action_date ? ` em ${opp.next_action_date}` : ' — SEM DATA'}`
      : 'Próxima ação: NÃO EXISTE',
    opp.expected_close ? `Fechamento esperado: ${opp.expected_close}` : null,
    timeline.length > 0 ? `Últimas atividades:\n${timeline.join('\n')}` : 'Sem atividades registradas nos últimos 90 dias.',
  ].filter((p): p is string => p !== null)

  return partes.join('\n')
}

/** Busca una oportunidad ya cargada por id. */
export function oportunidadePorId(carteira: CarteiraDoVendedor, id: number): Opportunity | null {
  return carteira.oportunidades.find((o) => o.id === id) ?? null
}
