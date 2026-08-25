// src/data/plano-do-dia.ts
// El estado del día de la tela Hoje: las 3 acciones CONGELADAS, sus
// resoluciones, la racha de Golden Hour y la Corrente do time.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL PLAN SE CONGELA (leer antes de sacar el freeze)
// ══════════════════════════════════════════════════════════════════════════
// rankDay() es una función pura del estado actual de la cartera: cada
// actividad registrada cambia el ranking. Si la pantalla Hoje mostrara
// siempre `rankDay().top`, resolver una tarjeta traería OTRA tarjeta en su
// lugar y el vendedor nunca llegaría a «Pronto por hoje». Eso convierte el
// límite de 3 —la decisión de producto entera de M2— en una cinta sin fin, que
// es exactamente el panel infinito del v2 que venimos a matar.
//
// Por eso el primer render del día fija los ids del top y los guarda en `meta`
// (Dexie). Todo el día se muestran ESOS, resueltos o no. Mañana el planner
// vuelve a decidir desde cero.
//
// Consecuencia deseada: la lista de las 9h y la de las 16h son la misma. El
// resto de la cola vive en «Ver tudo», que hay que abrir a propósito.
//
// Todo lo de acá lee y escribe SOLO Dexie y el outbox. Ni una llamada a
// supabase: la pantalla Hoje tiene que abrir dentro del galpón, sin señal.

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import {
  CONTATOS_DE_LARGADA,
  DEFAULT_RING_GOALS,
  anelDoDia,
  estadoDaSequencia,
  rankDay,
  getStageName,
  LEAD_STAGE_LABELS,
  proximoTouchpoint,
  canalExecutavel,
  todayBr,
  type ActivityType,
  type EntityRef,
  type EstadoSequencia,
  type IsoDate,
  type PlannedAction,
  type RingKey,
  type RingProgress,
  type TaskKind,
  type TipoAcao,
  type Vendor,
} from '@/core'
import { carregarCarteira, getDb, gravarMeta, lerMeta } from './db'
import { criarTask, registrarAtividade, registrarTouchpoint } from './mutations'

/* ══════════════════════════════════════════════════════════════════════════
   1 · El estado del día en `meta`
   ══════════════════════════════════════════════════════════════════════════ */

export type MotivoResolucao = 'feito' | 'adiado'

export interface ResolucaoDoDia {
  acaoId: string
  motivo: MotivoResolucao
  /** Cuándo se resolvió, ISO completo. */
  em: string
  /** Solo para 'adiado': hasta cuándo. */
  ate?: IsoDate
  /** true cuando la resolvió el propio registro, no el swipe. */
  automatica?: boolean
}

export interface EstadoDoDia {
  vendor: string
  dia: IsoDate
  /** Instante en que se congelaron los ids. Ancla del auto-resuelto. */
  fixadoEm: string
  /** Ids de PlannedAction, en orden. Nunca más de 3. */
  ids: string[]
  /**
   * Las acciones tal como se congelaron.
   *
   * No es redundante con `ids`: el id de una PlannedAction depende del estado
   * de la entidad, así que en cuanto se registra algo el planner emite OTRA
   * acción para el mismo negocio, con otro id. Sin este espejo, la tarjeta
   * resuelta desaparecía de la lista —la de la mañana decía «Suas 3 de hoje»
   * y la de la tarde decía «As 2 de hoje estão resolvidas»— y, peor, el día
   * podía darse por cerrado con trabajo pendiente adentro.
   *
   * Opcional porque los teléfonos del equipo pueden tener el estado del día
   * escrito por una versión anterior; ahí se degrada al comportamiento viejo.
   */
  acoes?: PlannedAction[]
  resolucoes: ResolucaoDoDia[]
}

const PREFIXO_ESTADO = 'hoje:'

export function chaveEstadoDoDia(vendor: string, dia: IsoDate): string {
  return `${PREFIXO_ESTADO}${vendor}:${dia}`
}

export async function lerEstadoDoDia(
  vendor: string,
  dia: IsoDate,
): Promise<EstadoDoDia | null> {
  const guardado = await lerMeta<EstadoDoDia>(chaveEstadoDoDia(vendor, dia))
  if (!guardado || !Array.isArray(guardado.ids)) return null
  return { ...guardado, resolucoes: guardado.resolucoes ?? [] }
}

/**
 * Congela los ids del día. Idempotente: si ya había un estado, no lo pisa —
 * volver a fijar sería justamente la cinta sin fin que el freeze evita.
 */
async function fixarPlano(
  vendor: string,
  dia: IsoDate,
  acoes: readonly PlannedAction[],
): Promise<EstadoDoDia> {
  const existente = await lerEstadoDoDia(vendor, dia)
  if (existente) return existente

  const novo: EstadoDoDia = {
    vendor,
    dia,
    fixadoEm: new Date().toISOString(),
    ids: acoes.map((a) => a.id),
    acoes: [...acoes],
    resolucoes: [],
  }
  await gravarMeta(chaveEstadoDoDia(vendor, dia), novo)
  await podarEstadosAntigos(vendor, dia)
  return novo
}

/** Los días viejos no le sirven a nadie y `meta` no tiene por qué crecer. */
async function podarEstadosAntigos(vendor: string, dia: IsoDate): Promise<void> {
  const db = getDb()
  const meu = `${PREFIXO_ESTADO}${vendor}:`
  const chaves = await db.meta.toCollection().primaryKeys()
  const velhas = chaves.filter((k) => k.startsWith(meu) && k !== chaveEstadoDoDia(vendor, dia))
  if (velhas.length > 0) await db.meta.bulkDelete(velhas)
}

async function anotarResolucao(
  vendor: string,
  dia: IsoDate,
  resolucao: ResolucaoDoDia,
): Promise<void> {
  const estado = await lerEstadoDoDia(vendor, dia)
  if (!estado) return
  const semAntiga = estado.resolucoes.filter((r) => r.acaoId !== resolucao.acaoId)
  await gravarMeta(chaveEstadoDoDia(vendor, dia), {
    ...estado,
    resolucoes: [...semAntiga, resolucao],
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · El plan congelado, tal como lo pinta la pantalla
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Las tres zonas del funil que la tarjeta muestra como chip. No son las 6
 * etapas: el vendedor no necesita saber que Tetra está en «Validação/Teste»
 * para decidir a quién llamar ahora, necesita saber si está buscando negocio,
 * empujándolo o cerrándolo.
 */
export type ZonaDoFunil = 'prospeccao' | 'avanco' | 'fechamento'

export const ROTULO_DA_ZONA: Readonly<Record<ZonaDoFunil, string>> = {
  prospeccao: 'Prospecção',
  avanco: 'Avanço',
  fechamento: 'Fechamento',
}

export interface AcaoDoDia {
  acao: PlannedAction
  /** null mientras sigue pendiente. */
  resolucao: ResolucaoDoDia | null
  zona: ZonaDoFunil
  /** Nombre PT-BR de la etapa, o la etapa del lead ('1b · Contato'). */
  etapa: string
  /** Valor del negocio en R$; null para leads y oportunidades sin valor. */
  valor: number | null
}

export interface PlanoFixado {
  hoje: IsoDate
  /** Las 3 (o menos) tarjetas del día. Congeladas. */
  fixadas: AcaoDoDia[]
  /** Cuántas de las fixadas ya están resueltas. */
  resolvidas: number
  /** true cuando había trabajo y ya no queda nada pendiente. */
  pronto: boolean
  /** El resto de la cola, para «Ver tudo (N)». */
  resto: AcaoDoDia[]
  /**
   * true cuando no hay NADA en Dexie todavía. Distingue «não há nada urgente»
   * (un vacío legítimo, que invita a prospectar) de «a carteira ainda não
   * baixou» (un vacío transitorio). Decirle a alguien con 25 oportunidades que
   * não tem nada a fazer porque el pull no terminó es perder su confianza en
   * el primer minuto de uso.
   */
  carteiraVazia: boolean
}

/**
 * Devuelve una acción por cada id congelado, aunque el planner ya no la
 * proponga: si el negocio bajó de score porque el vendedor lo trabajó, la
 * tarjeta tiene que seguir ahí para poder marcarla, no evaporarse.
 */
export async function fetchPlanoFixado(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<PlanoFixado> {
  // UNA sola lectura de la cartera. fetchHoje() haría exactamente esto, pero
  // acá hacen falta además las entidades crudas (etapa, valor, actividades de
  // hoy) y cargar la cartera dos veces es el tipo de derroche que se paga en
  // el primer render, que es el único que el vendedor mira.
  const carteira = await carregarCarteira(vendor)
  const plano = rankDay({
    vendor,
    today: hoje,
    opportunities: carteira.opportunities,
    leads: carteira.leads,
    activities: carteira.activities,
    tasks: carteira.tasks,
    commitments: carteira.commitments,
    touchpoints: carteira.touchpoints,
    ...(carteira.vendor ? { vendorInfo: carteira.vendor } : {}),
  })

  let estado = await lerEstadoDoDia(vendor, hoje)
  if (!estado) {
    // Sin acciones no se congela nada: la cartera puede estar sincronizando
    // todavía y congelar el vacío dejaría la pantalla muerta todo el día.
    if (plano.top.length === 0) {
      return {
        hoje,
        fixadas: [],
        resolvidas: 0,
        pronto: false,
        resto: [],
        carteiraVazia: carteira.opportunities.length === 0 && carteira.leads.length === 0,
      }
    }
    estado = await fixarPlano(vendor, hoje, plano.top)
  }

  const porId = new Map(plano.todas.map((a) => [a.id, a]))
  // El espejo del congelado manda cuando el planner ya no propone esa acción.
  const congeladas = new Map((estado.acoes ?? []).map((a) => [a.id, a]))
  const resolvidasPorId = new Map(estado.resolucoes.map((r) => [r.acaoId, r]))
  const oppPorId = new Map(carteira.opportunities.map((o) => [o.id, o]))
  const leadPorId = new Map(carteira.leads.map((l) => [l.id, l]))

  const enriquecer = (acao: PlannedAction, resolucao: ResolucaoDoDia | null): AcaoDoDia => {
    if (acao.entidade.kind === 'opportunity') {
      const opp = oppPorId.get(acao.entidade.id)
      const etapa = opp ? getStageName(opp.stage) : ''
      return {
        acao,
        resolucao,
        zona: zonaDaEtapa(opp?.stage ?? null),
        etapa: etapa === '' ? 'Oportunidade' : etapa,
        valor: opp?.value ?? null,
      }
    }
    const lead = leadPorId.get(acao.entidade.id)
    const rotulo = lead ? LEAD_STAGE_LABELS[lead.stage] : ''
    return {
      acao,
      resolucao,
      zona: 'prospeccao',
      etapa: lead ? `${lead.stage} · ${rotulo}` : 'Lead',
      valor: null,
    }
  }

  /**
   * ¿La entidad de una tarjeta congelada sigue viva? Una oportunidad cerrada
   * o un lead archivado no tienen por qué seguir ocupando una de las 3.
   */
  const entidadeViva = (acao: PlannedAction): boolean => {
    if (acao.entidade.kind === 'opportunity') {
      const opp = oppPorId.get(acao.entidade.id)
      return opp !== undefined && opp.outcome === null
    }
    const lead = leadPorId.get(acao.entidade.id)
    return lead !== undefined && lead.status === 'active'
  }

  const fixadas: AcaoDoDia[] = []
  for (const id of estado.ids) {
    // El planner puede dejar de listar una acción por dos motivos muy
    // distintos: porque el vendedor la trabajó —y entonces sigue siendo una de
    // las 3 del día, ahora resuelta— o porque la entidad se cerró. El espejo
    // del congelado cubre el primero; el segundo sigue saliendo de la lista.
    const viva = porId.get(id)
    const congelada = congeladas.get(id)
    const acao =
      viva ??
      (congelada && (resolvidasPorId.has(id) || entidadeViva(congelada)) ? congelada : undefined)
    if (!acao) continue
    const resolucao =
      resolvidasPorId.get(id) ?? detectarResolucaoAutomatica(acao, estado.fixadoEm, carteira)
    fixadas.push(enriquecer(acao, resolucao))
  }

  const idsFixados = new Set(estado.ids)
  const resto = plano.todas.filter((a) => !idsFixados.has(a.id)).map((a) => enriquecer(a, null))
  const resolvidas = fixadas.filter((f) => f.resolucao !== null).length

  return {
    hoje,
    fixadas,
    resolvidas,
    pronto: fixadas.length > 0 && resolvidas === fixadas.length,
    resto,
    carteiraVazia: false,
  }
}

/**
 * Etapa 1 es el embudo de prospección; 5 (Negociação) ya es cerrar. Todo lo
 * del medio —qualificar, apresentar, validar— es empujar el negocio.
 */
function zonaDaEtapa(stage: number | null): ZonaDoFunil {
  if (stage === null || stage <= 1) return 'prospeccao'
  if (stage >= 5) return 'fechamento'
  return 'avanco'
}

type CarteiraLocal = Awaited<ReturnType<typeof carregarCarteira>>

/**
 * Auto-resuelto: si desde que se congeló el plan quedó registrada una
 * actividad (o un toque) sobre esa entidad, la acción está hecha. Es lo que
 * hace que «Fazer agora» → registrar → volver deje la tarjeta cerrada sin que
 * el vendedor tenga que marcarla dos veces.
 *
 * El corte es `fixadoEm` y no «hoy» a propósito: lo que se registró ANTES de
 * ver la tarjeta no la resuelve — si lo resolviera, un contacto de la mañana
 * cerraría una tarjeta que el planner propuso justamente porque falta algo más.
 */
function detectarResolucaoAutomatica(
  acao: PlannedAction,
  fixadoEm: string,
  carteira: CarteiraLocal,
): ResolucaoDoDia | null {
  if (acao.entidade.kind === 'opportunity') {
    const hit = carteira.activities.find(
      (a) =>
        a.opportunity_id === acao.entidade.id &&
        typeof a.created_at === 'string' &&
        a.created_at >= fixadoEm,
    )
    if (hit?.created_at) {
      return { acaoId: acao.id, motivo: 'feito', em: hit.created_at, automatica: true }
    }
    return null
  }

  const toque = carteira.touchpoints.find(
    (t) => t.lead_id === acao.entidade.id && t.executed_at >= fixadoEm,
  )
  if (toque) {
    return { acaoId: acao.id, motivo: 'feito', em: toque.executed_at, automatica: true }
  }
  return null
}

export const chavesPlanoDoDia = {
  fixado: (vendor: string, dia: IsoDate) => ['plano', vendor, dia, 'fixado'] as const,
  corrente: (vendor: string, dia: IsoDate) => ['rings', vendor, dia, 'corrente'] as const,
  sequencia: (vendor: string, dia: IsoDate) => ['rings', vendor, dia, 'sequencia'] as const,
}

/**
 * Las claves cuelgan de `plano` y `rings` A PROPÓSITO: son las raíces que
 * conectarCacheAoSync ya invalida cuando el pull trae filas nuevas. Una raíz
 * propia quedaría fuera del sync y la pantalla mostraría datos viejos.
 */
export function usePlanoFixado(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<PlanoFixado> {
  return useQuery({
    queryKey: chavesPlanoDoDia.fixado(vendor ?? '', hoje),
    enabled: vendor !== null,
    queryFn: () => fetchPlanoFixado(vendor as string, hoje),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Resolver una acción
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * De qué tipo es la actividad que deja «Feito».
 *
 * Los tres tipos que NO son un contacto (evidência, tarefa, compromisso) caen
 * en 'note' a propósito: registrarlos como contacto inflaría el anel de
 * Contato con trabajo interno, que es la primera forma de corromper el dato.
 */
const ATIVIDADE_POR_TIPO: Readonly<Record<TipoAcao, ActivityType>> = {
  ligar: 'call',
  mensagem: 'whatsapp',
  email: 'email',
  reuniao: 'meeting',
  visita: 'meeting',
  proposta: 'proposal',
  evidencia: 'note',
  tarefa: 'note',
  compromisso: 'note',
  reativar: 'call',
}

const TAREFA_POR_TIPO: Readonly<Record<TipoAcao, TaskKind>> = {
  ligar: 'next_action',
  mensagem: 'next_action',
  email: 'next_action',
  reuniao: 'next_action',
  visita: 'next_action',
  proposta: 'next_action',
  evidencia: 'scale_evidence',
  tarefa: 'next_action',
  compromisso: 'commitment',
  reativar: 'reactivate',
}

export interface EntradaResolucao {
  vendor: string
  dia: IsoDate
  acao: PlannedAction
}

/**
 * «Feito» del swipe. Deja un registro REAL, no solo una marca local:
 *
 *  · oportunidad → una activity del tipo de la acción, con la acción como
 *    descripción. Es lo que mueve el anel de Contato en el mismo gesto.
 *  · lead → un touchpoint de la cadencia con resultado `no_response`, que es
 *    lo que de verdad pasó al mandar el toque. El resultado se corrige después
 *    en la Golden Hour o en Registrar; inventar 'interested' acá sería
 *    fabricar una conversa que nadie tuvo.
 *
 * La ventana de deshacer se resuelve ANTES, en la pantalla: acá ya no hay
 * vuelta atrás porque la fila entró al outbox.
 */
export async function concluirAcaoDoDia(entrada: EntradaResolucao): Promise<void> {
  const { vendor, dia, acao } = entrada

  if (acao.entidade.kind === 'opportunity') {
    await registrarAtividade({
      vendor,
      opportunityId: acao.entidade.id,
      tipo: ATIVIDADE_POR_TIPO[acao.tipo],
      descricao: acao.acao,
      data: dia,
      origem: 'manual',
    })
  } else {
    const lead = await getDb().leads.get(acao.entidade.id)
    const passo = lead ? proximoTouchpoint(lead) : null
    if (lead && passo) {
      await registrarTouchpoint({
        vendor,
        leadId: lead.id,
        sequencia: passo.tp,
        canal: acao.canal ?? canalExecutavel(lead, passo) ?? passo.channel,
        resultado: 'no_response',
        notas: acao.acao,
      })
    }
  }

  await anotarResolucao(vendor, dia, {
    acaoId: acao.id,
    motivo: 'feito',
    em: new Date().toISOString(),
  })
}

export interface EntradaAdiamento extends EntradaResolucao {
  /** Nueva fecha. La pantalla ofrece Hoje / Amanhã / Segunda / +7d. */
  ate: IsoDate
}

/**
 * «Adiar». No es un dismiss: crea una tarea con fecha, que es la entidad que
 * M3 pone de primera clase. Adiar sin dejar fecha es exactamente cómo el v2
 * llegó a 51 de 54 oportunidades sin próxima acción.
 */
export async function adiarAcaoDoDia(entrada: EntradaAdiamento): Promise<void> {
  const { vendor, dia, acao, ate } = entrada
  const target: EntityRef = { kind: acao.entidade.kind, id: acao.entidade.id }

  await criarTask({
    vendor,
    kind: TAREFA_POR_TIPO[acao.tipo],
    target,
    title: acao.acao,
    dueDate: ate,
  })

  await anotarResolucao(vendor, dia, {
    acaoId: acao.id,
    motivo: 'adiado',
    em: new Date().toISOString(),
    ate,
  })
}

function useInvalidarDia(): (vendor: string, dia: IsoDate) => void {
  const queryClient = useQueryClient()
  return (vendor, dia) => {
    void queryClient.invalidateQueries({ queryKey: chavesPlanoDoDia.fixado(vendor, dia) })
    void queryClient.invalidateQueries({ queryKey: ['rings'] })
    void queryClient.invalidateQueries({ queryKey: ['carteira'] })
    void queryClient.invalidateQueries({ queryKey: ['cadencia'] })
  }
}

export function useConcluirAcao(): UseMutationResult<void, Error, EntradaResolucao> {
  const invalidar = useInvalidarDia()
  return useMutation({
    mutationFn: concluirAcaoDoDia,
    onSettled: (_d, _e, vars) => invalidar(vars.vendor, vars.dia),
  })
}

export function useAdiarAcao(): UseMutationResult<void, Error, EntradaAdiamento> {
  const invalidar = useInvalidarDia()
  return useMutation({
    mutationFn: adiarAcaoDoDia,
    onSettled: (_d, _e, vars) => invalidar(vars.vendor, vars.dia),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · La racha de Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se guarda en `meta`. La verdad del servidor vive en `streaks` (0004). */
export interface SequenciaGuardada {
  /** Días útiles con Hora Cheia sellada. */
  selados: IsoDate[]
  escudos: number
  resgatesNoMes: number
}

export function chaveSequencia(vendor: string): string {
  return `sequencia:${vendor}`
}

export async function fetchSequencia(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<EstadoSequencia> {
  const guardada = await lerMeta<SequenciaGuardada>(chaveSequencia(vendor))
  return estadoDaSequencia(
    guardada?.selados ?? [],
    guardada?.escudos ?? 0,
    hoje,
    guardada?.resgatesNoMes ?? 0,
  )
}

export function useSequencia(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<EstadoSequencia> {
  return useQuery({
    queryKey: chavesPlanoDoDia.sequencia(vendor ?? '', hoje),
    enabled: vendor !== null,
    queryFn: () => fetchSequencia(vendor as string, hoje),
  })
}

/**
 * Sella un día de Hora Cheia. Lo llama el cierre de la Golden Hour; acá está
 * porque es el mismo `meta` que lee la racha y no puede haber dos formatos.
 */
export async function selarDiaDeHoraCheia(vendor: string, dia: IsoDate): Promise<void> {
  const guardada = await lerMeta<SequenciaGuardada>(chaveSequencia(vendor))
  const selados = new Set(guardada?.selados ?? [])
  selados.add(dia)
  await gravarMeta(chaveSequencia(vendor), {
    selados: [...selados].sort(),
    escudos: guardada?.escudos ?? 0,
    resgatesNoMes: guardada?.resgatesNoMes ?? 0,
  } satisfies SequenciaGuardada)
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Corrente do time
   ══════════════════════════════════════════════════════════════════════════ */

export interface EloDoTime {
  vendorName: string
  /** true para el vendedor logueado. */
  euMesmo: boolean
  avanco: RingProgress
  /**
   * false cuando no hay dato local del compañero. El pull baja la cartera de
   * UN vendedor, así que el avanço ajeno solo se conoce por el snapshot que
   * deja el cierre del día (tabla `rings`) o por el realtime del equipo.
   * Se dibuja el anillo vacío y se dice «sem dados», nunca un 0 inventado:
   * la Corrente no puede fabricar perdedores.
   */
  temDados: boolean
}

export async function fetchCorrenteDoTime(
  vendor: string,
  dia: IsoDate = todayBr(),
): Promise<EloDoTime[]> {
  const db = getDb()
  const [vendedores, snapshots, carteira] = await Promise.all([
    db.vendors.toArray(),
    db.rings.where('day').equals(dia).toArray(),
    carregarCarteira(vendor),
  ])

  const doDia = carteira.activities.filter(
    (a) => (a.activity_date ?? a.created_at ?? '').startsWith(dia),
  )
  const toquesDoDia = carteira.touchpoints.filter((t) => t.executed_at.startsWith(dia))
  const meus = anelDoDia(doDia, DEFAULT_RING_GOALS, toquesDoDia)

  const porVendor = new Map(snapshots.map((s) => [s.vendor, s]))

  const ativos = vendedores
    .filter((v: Vendor) => v.is_active !== false)
    .sort((a: Vendor, b: Vendor) => a.name.localeCompare(b.name, 'pt-BR'))

  // El vendedor logueado siempre está, aunque `vendors` todavía no bajó.
  const nomes = ativos.map((v) => v.name)
  if (!nomes.includes(vendor)) nomes.unshift(vendor)

  return nomes.map((nome) => {
    if (nome === vendor) {
      return { vendorName: nome, euMesmo: true, avanco: meus.avanco, temDados: true }
    }
    const snap = porVendor.get(nome)
    const meta = Math.max(1, snap?.metas.avanco ?? DEFAULT_RING_GOALS.avanco)
    const valor = snap?.avancos ?? 0
    return {
      vendorName: nome,
      euMesmo: false,
      avanco: { key: 'avanco', current: valor, goal: meta, ratio: Math.min(1, valor / meta) },
      temDados: snap !== undefined,
    }
  })
}

export function useCorrenteDoTime(
  vendor: string | null,
  dia: IsoDate = todayBr(),
): UseQueryResult<EloDoTime[]> {
  return useQuery({
    queryKey: chavesPlanoDoDia.corrente(vendor ?? '', dia),
    enabled: vendor !== null,
    queryFn: () => fetchCorrenteDoTime(vendor as string, dia),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Anéis del día con la largada dotada explícita
   ══════════════════════════════════════════════════════════════════════════ */

export interface AneisComLargada {
  aneis: Record<RingKey, RingProgress>
  fechado: boolean
  /** Cuántos contactos vinieron de regalo. Se muestra: el regalo tiene que verse. */
  largada: number
}

/**
 * Los tres anéis + la largada dotada. Es fetchRings() de queries.ts más el
 * dato de cuántos contactos son de regalo, que la pantalla necesita para
 * poder decirlo en voz alta («2 de largada»).
 */
export async function fetchAneisDoDia(
  vendor: string,
  dia: IsoDate = todayBr(),
): Promise<AneisComLargada> {
  const { activities, touchpoints } = await carregarCarteira(vendor)
  const doDia = activities.filter((a) => (a.activity_date ?? a.created_at ?? '').startsWith(dia))
  const tpsDoDia = touchpoints.filter((t) => t.executed_at.startsWith(dia))
  const r = anelDoDia(doDia, DEFAULT_RING_GOALS, tpsDoDia)
  return {
    aneis: { contato: r.contato, conversa: r.conversa, avanco: r.avanco },
    fechado: r.fechado,
    largada: CONTATOS_DE_LARGADA,
  }
}

export function useAneisDoDia(
  vendor: string | null,
  dia: IsoDate = todayBr(),
): UseQueryResult<AneisComLargada> {
  return useQuery({
    queryKey: ['rings', vendor ?? '', dia, 'largada'] as const,
    enabled: vendor !== null,
    queryFn: () => fetchAneisDoDia(vendor as string, dia),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · Rollover de medianoche
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El vendedor deja la app abierta toda la noche. Sin esto, a las 00:05 sigue
 * viendo el plan de ayer con «Pronto por hoje» y cree que el sistema se colgó.
 * Devuelve el día vigente y se rerenderiza solo cuando cambia.
 */
export function useDiaVigente(intervaloMs = 60_000): IsoDate {
  const [dia, setDia] = useState<IsoDate>(() => todayBr())
  useEffect(() => {
    const id = window.setInterval(() => {
      const agora = todayBr()
      setDia((anterior) => (anterior === agora ? anterior : agora))
    }, intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs])
  return dia
}
