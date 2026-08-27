// src/core/planner.ts
// EL algoritmo del Plano do Dia. Función pura, corre offline, <5ms, cero
// tokens. La capa LLM redacta y explica, pero NUNCA decide prioridad.
//
// ══════════════════════════════════════════════════════════════════════════
// CÓMO SE DISEÑÓ EL SCORE (leer antes de tocar un peso)
// ══════════════════════════════════════════════════════════════════════════
// El score es una SUMA de aportes independientes. Cada aporte genera un
// MotivoEstruturado con su peso, y la suma de los pesos ES el score. Eso es
// deliberado: el vendedor tiene que poder abrir el chip «Por que isto?» y ver
// una cuenta que cierra. Un score que no se puede reconstruir sumando los
// motivos que se muestran es un score en el que nadie va a creer, y este
// equipo es de cuatro personas desconfiadas que se conocen.
//
// Orden de los factores por peso máximo, y por qué:
//
//  1. TAREFA/AÇÃO VENCIDA (hasta 55). Es lo único que el vendedor YA se
//     prometió a sí mismo o al cliente. Una promesa rota es el daño más caro
//     y el más barato de reparar. Crece con el atraso porque a los 15 días ya
//     no es una tarea, es una relación deteriorándose.
//
//  2. SILÊNCIO (hasta 50). getDaysSinceLastContact sobre actividades REALES,
//     nunca sobre last_update (que se pisa con cualquier edición y por eso
//     miente sistemáticamente en el v2). No es lineal: el salto grande está
//     entre 7 y 30 días, que es donde un negocio se enfría. Más allá de 45 se
//     aplana — un muerto de 200 días no es más urgente que uno de 60, es la
//     misma llamada de rescate.
//
//  3. GATE TRAVADO (hasta 42). La escala que impide avanzar de etapa,
//     ponderada por CUÁNTO falta y por lo avanzado del funil. Un gate trabado
//     en Negociação vale mucho más que uno en Qualificação: hay más plata y
//     más tiempo invertido detrás.
//
//  4. COMPROMISSO DA SEMANA (hasta 30). Lo que el vendedor declaró el lunes.
//     Menos que una tarea vencida porque el horizonte es semanal.
//
//  5. TOUCHPOINT ATRASADO (hasta 45, solo leads). La cadencia es el motor de
//     la prospección: 7 toques en 21 días. Un toque atrasado pierde respuesta
//     todos los días. Hay 48 leads en producción con el toque vencido.
//
//  6. FECHAMENTO PRÓXIMO (hasta 24). expected_close cerca o pasado. Sube
//     fuerte cuando la fecha ya pasó: un forecast vencido es un dato falso.
//
//  7. VALOR (hasta 15). Logarítmico a propósito. Lineal, la oportunidad de
//     R$ 1,15M de Victor Hugo copaba las 3 tarjetas todos los días y el resto
//     de la cartera se moría de hambre. El valor DESEMPATA, no MANDA.
//
//  8. SINGLE-THREADED (hasta 14). Solo cuando ya hay algo que perder.
//
// Y una resta: RUÍDO RECENTE. Si ya se tocó hoy o ayer, el negocio baja. No
// para castigar: para que la lista de mañana no sea la de hoy y el vendedor
// no llame dos veces a la misma persona.
//
// DIVERSIFICACIÓN. El top 3 nunca trae dos acciones del mismo cliente. Tres
// tarjetas del mismo logo se leen como «el sistema está roto», aunque el
// score tenga razón. La segunda acción de una cuenta queda en «Ver tudo».

import type {
  Activity,
  Commitment,
  EntidadeRef,
  EntityRef,
  IsoDate,
  Lead,
  MotivoEstruturado,
  Opportunity,
  PlannedAction,
  RankedAction,
  RankReason,
  ScaleKey,
  StageId,
  Task,
  TipoAcao,
  Urgencia,
  Vendor,
} from './types.js'
import { daysBetween, formatarBRL, formatarDataCurta, todayBr } from './dates.js'
import {
  SCALE_LABELS,
  calculateHealthScore,
  getDaysSinceLastContact,
  getScaleScores,
  getStageName,
  gateFaltante,
  lowestBlockingScale,
  proximoNivel,
} from './ppvvcc.js'
import {
  atrasoEmDias,
  canalExecutavel,
  isCadenceExhausted,
  proximoTouchpoint,
} from './cadence.js'
import { isSingleThreaded, stakeholders } from './risk.js'
import { textosParaAvancar } from './spin.js'

/** Todo lo que rankDay necesita. Se arma desde Dexie, sin ir a la red. */
export interface PlannerInput {
  vendor: string
  today: IsoDate
  opportunities: readonly Opportunity[]
  leads: readonly Lead[]
  /** Actividades de los últimos 90 días, para los días sin contacto reales. */
  activities: readonly Activity[]
  tasks: readonly Task[]
  commitments: readonly Commitment[]
  touchpoints?: readonly import('./types.js').Touchpoint[]
  /** Ficha del vendedor. Solo se usa para el saludo y las metas. */
  vendorInfo?: Vendor | null
}

/** Alias PT-BR del input, para quien lo arma desde el bot. */
export interface EntradaDoPlano {
  oportunidades: readonly Opportunity[]
  leads: readonly Lead[]
  tasks: readonly Task[]
  activities: readonly Activity[]
  touchpoints?: readonly import('./types.js').Touchpoint[]
  commitments: readonly Commitment[]
  vendor: string
  hoje: IsoDate
  vendorInfo?: Vendor | null
}

/** Pesos del score. Expuestos para poder testearlos y calibrarlos. */
export interface PlannerWeights {
  gateBlocked: number
  daysSinceContact: number
  taskOverdue: number
  touchpointLate: number
  value: number
  singleThreaded: number
  commitmentDue: number
  closingSoon: number
}

export const DEFAULT_WEIGHTS: PlannerWeights = {
  gateBlocked: 30,
  daysSinceContact: 2,
  taskOverdue: 25,
  touchpointLate: 20,
  value: 15,
  singleThreaded: 12,
  commitmentDue: 22,
  closingSoon: 18,
}

/** Cuántas acciones muestra la pantalla Hoje. Nunca más de 3. */
export const DAILY_ACTION_LIMIT = 3

/** Topes por factor. Ningún factor puede secuestrar el ranking él solo. */
const TETO = {
  taskOverdue: 55,
  silencio: 50,
  gate: 42,
  commitment: 30,
  touchpoint: 45,
  closing: 24,
  valor: 15,
  singleThread: 14,
} as const

/* ── Utilidades internas ─────────────────────────────────────────────────── */

function motivo(
  codigo: RankReason['code'],
  sinal: string,
  detalhe: string,
  peso: number,
): MotivoEstruturado {
  return { codigo, sinal, detalhe, peso: Math.round(peso * 10) / 10 }
}

/** Ancla horaria para getDaysSinceLastContact: mediodía UTC del día civil. */
function instanteDe(hoje: IsoDate): Date {
  return new Date(`${hoje}T12:00:00Z`)
}

/** Actividades de una oportunidad, sin recorrer el array entero N veces. */
function indexarAtividades(activities: readonly Activity[]): Map<number, Activity[]> {
  const idx = new Map<number, Activity[]>()
  for (const a of activities) {
    const lista = idx.get(a.opportunity_id)
    if (lista) lista.push(a)
    else idx.set(a.opportunity_id, [a])
  }
  return idx
}

/**
 * Tareas pendientes agrupadas por entidad.
 *
 * `t.target` se comprueba en vez de darse por hecho, y no es paranoia: una
 * fila de `tasks` sin `target` —porque llegó del servidor sin normalizar, o
 * porque no apunta ni a una oportunidad ni a un lead— hacía que este `for`
 * lanzara un TypeError. Ese throw se lleva puesto TODO `rankDay()`, o sea el
 * plan del día entero, y la tela Hoje se queda con el último resultado bueno
 * —la cartera vacía del arranque— sin un solo botón que tocar. Una tarea rota
 * puede costar una tarjeta; nunca la pantalla.
 */
function indexarTasks(tasks: readonly Task[]): Map<string, Task[]> {
  const idx = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.status !== 'pending') continue
    const alvo: EntityRef | undefined = t.target
    if (!alvo || typeof alvo.kind !== 'string' || typeof alvo.id !== 'number') continue
    const chave = `${alvo.kind}:${String(alvo.id)}`
    const lista = idx.get(chave)
    if (lista) lista.push(t)
    else idx.set(chave, [t])
  }
  return idx
}

function indexarCommitments(commitments: readonly Commitment[]): Map<string, Commitment[]> {
  const idx = new Map<string, Commitment[]>()
  for (const c of commitments) {
    if (c.status !== 'pending' && c.status !== 'partial') continue
    const id = c.opportunity_id ?? c.lead_id
    if (id === null || id === undefined) continue
    const chave = `${c.opportunity_id !== null ? 'opportunity' : 'lead'}:${id}`
    const lista = idx.get(chave)
    if (lista) lista.push(c)
    else idx.set(chave, [c])
  }
  return idx
}

/** Urgencia derivada del score, con un piso por atraso grave. */
function urgenciaDe(score: number, atrasoMax: number): Urgencia {
  if (atrasoMax >= 14 || score >= 75) return 'critica'
  if (atrasoMax >= 3 || score >= 45) return 'alta'
  if (score >= 22) return 'media'
  return 'baixa'
}

/** Nombre del contacto con quien hablar. */
function contatoDe(opp: Opportunity): string {
  return opp.sponsor ?? opp.power_sponsor ?? opp.influencer ?? opp.support_contact ?? 'o contato'
}

/* ══════════════════════════════════════════════════════════════════════════
   Scoring de una oportunidad
   ══════════════════════════════════════════════════════════════════════════ */

/** Resultado interno con todo lo necesario para redactar la acción. */
interface Avaliacao {
  score: number
  motivos: MotivoEstruturado[]
  atrasoMax: number
  tarefaVencida: Task | null
  compromissoVencido: Commitment | null
  diasSemContato: number
  escalaAlvo: ScaleKey | null
}

function avaliarOportunidade(
  opp: Opportunity,
  input: PlannerInput,
  weights: PlannerWeights,
  ctx: {
    atividades: Map<number, Activity[]>
    tasks: Map<string, Task[]>
    commitments: Map<string, Commitment[]>
  },
): Avaliacao {
  const hoje = input.today
  const motivos: MotivoEstruturado[] = []
  let score = 0
  let atrasoMax = 0

  const stage = (opp.stage ?? 1) as StageId
  const atividades = ctx.atividades.get(opp.id) ?? []

  /* 1 · Tarefa ou próxima ação vencida ─────────────────────────────────── */
  const tarefas = ctx.tasks.get(`opportunity:${opp.id}`) ?? []
  let tarefaVencida: Task | null = null
  let atrasoTarefa = 0
  for (const t of tarefas) {
    if (!t.due_date) continue
    const atraso = daysBetween(t.due_date, hoje)
    if (atraso >= 0 && atraso >= atrasoTarefa) {
      atrasoTarefa = atraso
      tarefaVencida = t
    }
  }
  // La próxima acción escrita en la oportunidad vale igual que una tarea:
  // 51 de 54 oportunidades del v2 no tienen tasks, pero muchas sí next_action.
  const acaoTexto = (opp.next_action ?? '').trim()
  if (!tarefaVencida && acaoTexto !== '' && opp.next_action_date) {
    const atraso = daysBetween(opp.next_action_date, hoje)
    if (atraso >= 0) atrasoTarefa = atraso
  }

  if (tarefaVencida || (acaoTexto !== '' && opp.next_action_date && atrasoTarefa >= 0)) {
    // Base al vencer + 3 por día de atraso. A los 10 días toca el techo.
    const bruto = Math.min(TETO.taskOverdue, weights.taskOverdue + atrasoTarefa * 3)
    score += bruto
    atrasoMax = Math.max(atrasoMax, atrasoTarefa)
    const titulo = tarefaVencida?.title ?? acaoTexto
    motivos.push(
      motivo(
        'task_overdue',
        atrasoTarefa === 0 ? 'Vence hoje' : 'Ação vencida',
        atrasoTarefa === 0
          ? `"${titulo}" vence hoje`
          : `"${titulo}" venceu há ${atrasoTarefa} ${atrasoTarefa === 1 ? 'dia' : 'dias'}`,
        bruto,
      ),
    )
  }

  /* 2 · Silêncio ───────────────────────────────────────────────────────── */
  const diasSemContato = getDaysSinceLastContact(opp.last_update, atividades, instanteDe(hoje))
  if (diasSemContato >= 5) {
    // Curva: lineal hasta 30, después se aplana. Un negocio de 200 días no es
    // 6 veces más urgente que uno de 35: es la misma llamada de rescate.
    const efetivos = diasSemContato > 45 ? 45 + (diasSemContato - 45) * 0.1 : diasSemContato
    const bruto = Math.min(TETO.silencio, efetivos * weights.daysSinceContact)
    score += bruto
    motivos.push(
      motivo(
        'no_contact',
        diasSemContato >= 30 ? 'Negócio parado' : 'Sem contato',
        diasSemContato >= 999
          ? 'nenhuma atividade registrada'
          : `${diasSemContato} dias desde a última conversa real`,
        bruto,
      ),
    )
  }

  /* 3 · Gate travado ───────────────────────────────────────────────────── */
  const falta = gateFaltante(opp.scales, stage)
  let escalaAlvo: ScaleKey | null
  if (falta) {
    escalaAlvo = falta.escala
    // Cuánto falta (0..1) × cuán avanzada está la etapa (2 → 0.5, 5 → 1.0).
    const proporcao = Math.min(1, falta.falta / 5)
    const pesoEtapa = 0.4 + (stage / 5) * 0.6
    const bruto = Math.min(TETO.gate, weights.gateBlocked * proporcao * pesoEtapa + 6)
    score += bruto
    motivos.push(
      motivo(
        'gate_blocked',
        'Gate travado',
        `${SCALE_LABELS[falta.escala].toUpperCase()} ${falta.atual} < ${falta.minimo} para sair de ${falta.stageName}`,
        bruto,
      ),
    )
  } else {
    escalaAlvo = lowestBlockingScale(opp.scales, stage)
  }

  /* 4 · Compromisso da semana ──────────────────────────────────────────── */
  const compromissos = ctx.commitments.get(`opportunity:${opp.id}`) ?? []
  let compromissoVencido: Commitment | null = null
  let atrasoCompromisso = -1
  for (const c of compromissos) {
    const prazo = c.due_date ?? c.week_of
    if (!prazo) continue
    const atraso = daysBetween(prazo, hoje)
    if (atraso >= -1 && atraso > atrasoCompromisso) {
      atrasoCompromisso = atraso
      compromissoVencido = c
    }
  }
  if (compromissoVencido) {
    const bruto = Math.min(TETO.commitment, weights.commitmentDue + Math.max(0, atrasoCompromisso) * 2)
    score += bruto
    atrasoMax = Math.max(atrasoMax, Math.max(0, atrasoCompromisso))
    motivos.push(
      motivo(
        'commitment_due',
        atrasoCompromisso > 0 ? 'Compromisso vencido' : 'Compromisso da semana',
        `"${compromissoVencido.committed_action}"`,
        bruto,
      ),
    )
  }

  /* 5 · Fechamento próximo ─────────────────────────────────────────────── */
  if (opp.expected_close) {
    const paraFechar = daysBetween(hoje, opp.expected_close)
    if (paraFechar < 0) {
      const bruto = Math.min(TETO.closing, weights.closingSoon + Math.min(6, -paraFechar * 0.2))
      score += bruto
      motivos.push(
        motivo(
          'closing_soon',
          'Previsão vencida',
          `fechamento previsto para ${formatarDataCurta(opp.expected_close, hoje)}, já passou`,
          bruto,
        ),
      )
    } else if (paraFechar <= 30) {
      const bruto = weights.closingSoon * (1 - paraFechar / 30)
      if (bruto >= 2) {
        score += bruto
        motivos.push(
          motivo(
            'closing_soon',
            'Fecha em breve',
            `previsão de fechamento em ${paraFechar} ${paraFechar === 1 ? 'dia' : 'dias'}`,
            bruto,
          ),
        )
      }
    }
  }

  /* 6 · Valor (logarítmico: desempata, no manda) ───────────────────────── */
  const valor = opp.value ?? 0
  if (valor > 0) {
    const ratio = Math.min(1, Math.log10(1 + valor / 1000) / 3)
    const bruto = Math.min(TETO.valor, weights.value * ratio)
    if (bruto >= 2) {
      score += bruto
      motivos.push(motivo('high_value', 'Valor em jogo', formatarBRL(valor), bruto))
    }
  }

  /* 7 · Single-threaded ────────────────────────────────────────────────── */
  if (isSingleThreaded(opp) && (stage >= 3 || valor >= 100_000)) {
    const bruto = Math.min(TETO.singleThread, weights.singleThreaded)
    score += bruto
    const unico = stakeholders(opp)[0]
    motivos.push(
      motivo(
        'single_threaded',
        'Um contato só',
        unico ? `tudo depende de ${unico}` : 'nenhum contato nomeado',
        bruto,
      ),
    )
  }

  /* 8 · Ruído recente (resta) ──────────────────────────────────────────── */
  if (diasSemContato <= 1 && !tarefaVencida) {
    const penal = -12
    score += penal
    motivos.push(
      motivo(
        'no_contact',
        'Falado agora',
        diasSemContato === 0 ? 'já houve contato hoje' : 'houve contato ontem',
        penal,
      ),
    )
  }

  return {
    score: Math.round(score * 10) / 10,
    motivos,
    atrasoMax,
    tarefaVencida,
    compromissoVencido,
    diasSemContato,
    escalaAlvo,
  }
}

/** Score de una única oportunidad, con el desglose de factores. */
export function scoreOpportunity(
  opportunity: Opportunity,
  input: PlannerInput,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
): { score: number; reasons: RankReason[] } {
  const av = avaliarOportunidade(opportunity, input, weights, {
    atividades: indexarAtividades(input.activities),
    tasks: indexarTasks(input.tasks),
    commitments: indexarCommitments(input.commitments),
  })
  return {
    score: av.score,
    reasons: av.motivos.map((m) => ({ code: m.codigo, label: `${m.sinal}: ${m.detalhe}`, weight: m.peso })),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Scoring de un lead
   ══════════════════════════════════════════════════════════════════════════ */

function avaliarLead(
  lead: Lead,
  input: PlannerInput,
  weights: PlannerWeights,
  tasksIdx: Map<string, Task[]>,
): Avaliacao {
  const hoje = input.today
  const motivos: MotivoEstruturado[] = []
  let score = 0
  let atrasoMax = 0

  /* 1 · Toque de cadência atrasado ─────────────────────────────────────── */
  const atraso = atrasoEmDias(lead, hoje)
  const passo = proximoTouchpoint(lead)
  if (atraso > 0 && passo) {
    const bruto = Math.min(TETO.touchpoint, weights.touchpointLate + atraso * 2.5)
    score += bruto
    atrasoMax = Math.max(atrasoMax, atraso)
    motivos.push(
      motivo(
        'touchpoint_late',
        'Cadência atrasada',
        `TP${passo.tp} venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`,
        bruto,
      ),
    )
  } else if (passo && lead.next_touchpoint_date && daysBetween(hoje, lead.next_touchpoint_date) === 0) {
    const bruto = weights.touchpointLate * 0.8
    score += bruto
    motivos.push(motivo('touchpoint_late', 'Toque de hoje', `TP${passo.tp} por ${passo.channel}`, bruto))
  }

  /* 2 · Etapa do funil de prospecção ───────────────────────────────────── */
  // 1c/1d ya respondieron: son plata más cerca de la mano que un 1a frío.
  const bonusEtapa: Record<Lead['stage'], number> = { '1a': 0, '1b': 4, '1c': 12, '1d': 16 }
  const bonus = bonusEtapa[lead.stage] ?? 0
  if (bonus > 0) {
    score += bonus
    motivos.push(
      motivo(
        'high_value',
        lead.stage === '1d' ? 'Reunião marcada' : 'Já respondeu',
        lead.stage === '1d' ? 'confirmar a reunião' : 'contato já demonstrou interesse',
        bonus,
      ),
    )
  }

  /* 3 · Silêncio desde o último toque ──────────────────────────────────── */
  if (lead.last_touchpoint_date) {
    const dias = daysBetween(lead.last_touchpoint_date, hoje)
    if (dias >= 7) {
      const bruto = Math.min(20, dias * 1.2)
      score += bruto
      motivos.push(motivo('no_contact', 'Sem toque', `${dias} dias desde o último contato`, bruto))
    }
  } else {
    // Nunca tocado: es el que más rápido se pudre en la base.
    const bruto = 10
    score += bruto
    motivos.push(motivo('no_contact', 'Nunca tocado', 'lead ainda sem nenhum toque', bruto))
  }

  /* 4 · Tarefa vencida sobre el lead ───────────────────────────────────── */
  const tarefas = tasksIdx.get(`lead:${lead.id}`) ?? []
  let tarefaVencida: Task | null = null
  let atrasoTarefa = 0
  for (const t of tarefas) {
    if (!t.due_date) continue
    const a = daysBetween(t.due_date, hoje)
    if (a >= 0 && a >= atrasoTarefa) {
      atrasoTarefa = a
      tarefaVencida = t
    }
  }
  if (tarefaVencida) {
    const bruto = Math.min(TETO.taskOverdue, weights.taskOverdue + atrasoTarefa * 3)
    score += bruto
    atrasoMax = Math.max(atrasoMax, atrasoTarefa)
    motivos.push(
      motivo(
        'task_overdue',
        'Ação vencida',
        `"${tarefaVencida.title}"${atrasoTarefa > 0 ? ` há ${atrasoTarefa} dias` : ''}`,
        bruto,
      ),
    )
  }

  /* 5 · Cadência esgotada (resta) ──────────────────────────────────────── */
  if (isCadenceExhausted(lead)) {
    const penal = -25
    score += penal
    motivos.push(
      motivo('touchpoint_late', 'Cadência esgotada', 'os 7 toques já foram feitos', penal),
    )
  }

  return {
    score: Math.round(score * 10) / 10,
    motivos,
    atrasoMax,
    tarefaVencida,
    compromissoVencido: null,
    diasSemContato: lead.last_touchpoint_date ? daysBetween(lead.last_touchpoint_date, hoje) : 999,
    escalaAlvo: null,
  }
}

/** Score de un lead del funil de prospección. */
export function scoreLead(
  lead: Lead,
  input: PlannerInput,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
): { score: number; reasons: RankReason[] } {
  const av = avaliarLead(lead, input, weights, indexarTasks(input.tasks))
  return {
    score: av.score,
    reasons: av.motivos.map((m) => ({ code: m.codigo, label: `${m.sinal}: ${m.detalhe}`, weight: m.peso })),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Redacción de la acción
   ══════════════════════════════════════════════════════════════════════════ */

function acaoDeOportunidade(
  opp: Opportunity,
  av: Avaliacao,
  hoje: IsoDate,
): { acao: string; tipo: TipoAcao; prazo?: string; tarefaId?: string } {
  const contato = contatoDe(opp)
  const stage = (opp.stage ?? 1) as StageId

  if (av.tarefaVencida) {
    return {
      acao: av.tarefaVencida.title,
      tipo: 'tarefa',
      prazo: av.tarefaVencida.due_date
        ? formatarDataCurta(av.tarefaVencida.due_date, hoje)
        : undefined,
      // La tarjeta ES esta task: Adiar y Feito operan sobre ella, no crean otra.
      tarefaId: av.tarefaVencida.id,
    }
  }

  const acaoEscrita = (opp.next_action ?? '').trim()
  if (acaoEscrita !== '' && opp.next_action_date && daysBetween(opp.next_action_date, hoje) >= 0) {
    return {
      acao: acaoEscrita,
      tipo: 'tarefa',
      prazo: formatarDataCurta(opp.next_action_date, hoje),
    }
  }

  if (av.compromissoVencido) {
    return {
      acao: av.compromissoVencido.committed_action,
      tipo: 'compromisso',
      prazo: av.compromissoVencido.due_date
        ? formatarDataCurta(av.compromissoVencido.due_date, hoje)
        : undefined,
    }
  }

  if (av.diasSemContato >= 30) {
    return {
      acao: `Ligação de resgate para ${contato}: retomar com um motivo novo e sair com data marcada`,
      tipo: 'reativar',
    }
  }

  if (av.escalaAlvo) {
    const scores = getScaleScores(opp.scales)
    const alvo = proximoNivel(av.escalaAlvo, scores[av.escalaAlvo])
    const nome = SCALE_LABELS[av.escalaAlvo]
    const acao = alvo
      ? `Conversar com ${contato} para levar ${nome} de ${scores[av.escalaAlvo]} para ${scores[av.escalaAlvo] + 1}: ${alvo.toLowerCase()}`
      : `Proteger ${nome} com ${contato}: já está no topo da escala`
    const tipo: TipoAcao =
      stage >= 5 ? 'proposta' : av.escalaAlvo === 'poder' ? 'reuniao' : 'ligar'
    return { acao, tipo }
  }

  if (av.diasSemContato >= 7) {
    return {
      acao: `Ligar para ${contato} em ${getStageName(stage)}: confirmar o próximo passo e marcar data`,
      tipo: 'ligar',
    }
  }

  return {
    acao: `Registrar evidência do que ${contato} disse na última conversa`,
    tipo: 'evidencia',
  }
}

function acaoDeLead(lead: Lead, hoje: IsoDate): { acao: string; tipo: TipoAcao; prazo?: string } {
  const passo = proximoTouchpoint(lead)
  const nome = lead.contact_name ?? lead.company_name
  if (!passo) {
    return {
      acao: `Cadência esgotada em ${lead.company_name}: arquivar ou reciclar o lead`,
      tipo: 'tarefa',
    }
  }
  if (lead.stage === '1d') {
    return { acao: `Confirmar a reunião com ${nome} (${lead.company_name})`, tipo: 'reuniao' }
  }
  const tipo: TipoAcao =
    passo.channel === 'phone' ? 'ligar' : passo.channel === 'email' ? 'email' : 'mensagem'
  return {
    acao: `TP${passo.tp} por ${passo.channel} com ${nome} (${lead.company_name}): ${passo.label.toLowerCase()}`,
    tipo,
    prazo: lead.next_touchpoint_date
      ? formatarDataCurta(lead.next_touchpoint_date, hoje)
      : undefined,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   rankDay
   ══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoDoDia {
  /** Las 3 mejores, ya diversificadas por cliente. */
  top: PlannedAction[]
  /** La lista completa ordenada por score — alimenta «Ver tudo (17)». */
  todas: PlannedAction[]
  /** Cuántas quedaron fuera del top. */
  restantes: number
  hoje: IsoDate
  vendor: string
}

/** Normaliza el input PT-BR al canónico. */
function normalizarEntrada(input: PlannerInput | EntradaDoPlano): PlannerInput {
  if ('today' in input) return input
  return {
    vendor: input.vendor,
    today: input.hoje,
    opportunities: input.oportunidades,
    leads: input.leads,
    activities: input.activities,
    tasks: input.tasks,
    commitments: input.commitments,
    ...(input.touchpoints !== undefined ? { touchpoints: input.touchpoints } : {}),
    ...(input.vendorInfo !== undefined ? { vendorInfo: input.vendorInfo } : {}),
  }
}

/** Toda la lista, ordenada y sin recortar. */
export function rankAll(
  entrada: PlannerInput | EntradaDoPlano,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
): PlannedAction[] {
  const input = normalizarEntrada(entrada)
  const hoje = input.today
  const ctx = {
    atividades: indexarAtividades(input.activities),
    tasks: indexarTasks(input.tasks),
    commitments: indexarCommitments(input.commitments),
  }

  const acoes: PlannedAction[] = []

  for (const opp of input.opportunities) {
    // Cerradas, perdidas y abandonadas no piden nada a nadie.
    if (opp.outcome || opp.stage === 6) continue
    const av = avaliarOportunidade(opp, input, weights, ctx)
    if (av.score <= 0) continue

    const { acao, tipo, prazo, tarefaId } = acaoDeOportunidade(opp, av, hoje)
    const entidade: EntidadeRef = {
      kind: 'opportunity',
      id: opp.id,
      nome: opp.name ?? opp.client ?? `Oportunidade #${opp.id}`,
      cliente: opp.client ?? opp.name ?? `#${opp.id}`,
    }

    const perguntas = av.escalaAlvo
      ? textosParaAvancar(av.escalaAlvo, getScaleScores(opp.scales)[av.escalaAlvo], [], 3)
      : []

    acoes.push({
      id: `opp-${opp.id}-${hoje}`,
      tipo,
      entidade,
      acao,
      // Máximo 3 motivos: el chip tiene que caber en una pantalla de teléfono.
      porque: [...av.motivos].sort((a, b) => b.peso - a.peso).slice(0, 3),
      ...(av.escalaAlvo ? { escalaAlvo: av.escalaAlvo } : {}),
      ...(perguntas.length > 0 ? { perguntasSugeridas: perguntas } : {}),
      urgencia: urgenciaDe(av.score, av.atrasoMax),
      score: av.score,
      ...(prazo !== undefined ? { prazo } : {}),
      ...(tarefaId !== undefined ? { tarefaId } : {}),
    })
  }

  for (const lead of input.leads) {
    if (lead.status !== 'active') continue
    const av = avaliarLead(lead, input, weights, ctx.tasks)
    if (av.score <= 0) continue

    const { acao, tipo, prazo } = acaoDeLead(lead, hoje)
    const passo = proximoTouchpoint(lead)
    const canal = passo ? canalExecutavel(lead, passo) : null

    acoes.push({
      id: `lead-${lead.id}-${hoje}`,
      tipo,
      entidade: {
        kind: 'lead',
        id: lead.id,
        nome: lead.contact_name ?? lead.company_name,
        cliente: lead.company_name,
      },
      acao,
      porque: [...av.motivos].sort((a, b) => b.peso - a.peso).slice(0, 3),
      ...(canal ? { canal } : {}),
      urgencia: urgenciaDe(av.score, av.atrasoMax),
      score: av.score,
      ...(prazo !== undefined ? { prazo } : {}),
    })
  }

  // Orden estable: score, después atraso implícito por urgencia, después id.
  const pesoUrgencia: Record<Urgencia, number> = { critica: 3, alta: 2, media: 1, baixa: 0 }
  return acoes.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const u = pesoUrgencia[b.urgencia] - pesoUrgencia[a.urgencia]
    if (u !== 0) return u
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Las 3 mejores acciones del día + la lista completa ordenada.
 *
 * DIVERSIFICACIÓN: el top nunca trae dos acciones del mismo cliente. Se hace
 * en una pasada greedy sobre la lista ya ordenada; si no alcanzan los clientes
 * distintos (cartera chica, o un solo cliente con todo vencido) se completa
 * con lo que quedó, porque devolver 2 tarjetas cuando hay trabajo sería peor.
 */
export function rankDay(
  entrada: PlannerInput | EntradaDoPlano,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
  limite: number = DAILY_ACTION_LIMIT,
): ResultadoDoDia {
  const input = normalizarEntrada(entrada)
  const todas = rankAll(input, weights)

  const top: PlannedAction[] = []
  const clientesUsados = new Set<string>()

  // Pasada 1: uno por cliente.
  for (const a of todas) {
    if (top.length >= limite) break
    const chave = a.entidade.cliente.trim().toLowerCase()
    if (clientesUsados.has(chave)) continue
    clientesUsados.add(chave)
    top.push(a)
  }
  // Pasada 2: completar si faltan, repitiendo cliente solo como último recurso.
  if (top.length < limite) {
    for (const a of todas) {
      if (top.length >= limite) break
      if (top.some((t) => t.id === a.id)) continue
      top.push(a)
    }
  }

  return {
    top,
    todas,
    restantes: Math.max(0, todas.length - top.length),
    hoje: input.today,
    vendor: input.vendor,
  }
}

/** Atajo: solo las 3 tarjetas de la pantalla Hoje. */
export function topAcoesDoDia(
  entrada: PlannerInput | EntradaDoPlano,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
): PlannedAction[] {
  return rankDay(entrada, weights).top
}

/* ══════════════════════════════════════════════════════════════════════════
   «Por que isto?»
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Texto del chip «Por que isto?». Muestra la cuenta completa: cada señal con
 * su aporte y el total. Si el vendedor no puede auditar el número, no le cree
 * al sistema — y con razón.
 */
export function explicarScore(acao: PlannedAction): string {
  if (acao.porque.length === 0) return 'Sem sinais registrados.'
  const linhas = acao.porque.map(
    (m) => `• ${m.sinal}: ${m.detalhe} (${m.peso >= 0 ? '+' : ''}${m.peso})`,
  )
  return `${linhas.join('\n')}\n= ${acao.score} pontos de prioridade`
}

/** Una línea sola, para el subtítulo de la tarjeta o el /hoje de Telegram. */
export function resumirMotivos(acao: PlannedAction): string {
  return acao.porque.map((m) => m.detalhe).join(' · ')
}

/** Texto PT-BR del chip a partir de los motivos crudos. */
export function explainReasons(reasons: readonly RankReason[]): string {
  if (reasons.length === 0) return 'Sem sinais registrados.'
  return reasons.map((r) => `• ${r.label} (${r.weight >= 0 ? '+' : ''}${r.weight})`).join('\n')
}

/** Puente al tipo inglés que consume la capa de datos. */
export function toRankedAction(a: PlannedAction): RankedAction {
  return {
    id: a.id,
    target: { kind: a.entidade.kind, id: a.entidade.id } as RankedAction['target'],
    clientLabel: a.entidade.cliente,
    action: a.acao,
    score: a.score,
    reasons: a.porque.map((m) => ({ code: m.codigo, label: `${m.sinal}: ${m.detalhe}`, weight: m.peso })),
    targetScale: a.escalaAlvo ?? null,
    suggestedQuestions: a.perguntasSugeridas ?? [],
    channel: a.canal ?? null,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Salud de la cartera (port de analyzePipelineHealth)
   ══════════════════════════════════════════════════════════════════════════ */

export interface SaudeDaCarteira {
  total: number
  valorTotal: number
  valorPonderado: number
  emRisco: number
  valorEmRisco: number
  saudeMedia: number
  /** Los negocios calientes que hay que empujar. */
  topDeals: Array<{ id: number; cliente: string; valor: number; saude: number; acao: string }>
}

/**
 * Resumen de la cartera. Port del analyzePipelineHealth del v2, con dos
 * arreglos: usa calculateHealthScore (no la columna health_score, que está
 * desincronizada) y los días sin contacto salen de las actividades reales.
 */
export function analisarCarteira(
  opportunities: readonly Opportunity[],
  activities: readonly Activity[] = [],
  hoje: IsoDate = todayBr(),
): SaudeDaCarteira {
  const vivas = opportunities.filter((o) => !o.outcome)
  if (vivas.length === 0) {
    return {
      total: 0,
      valorTotal: 0,
      valorPonderado: 0,
      emRisco: 0,
      valorEmRisco: 0,
      saudeMedia: 0,
      topDeals: [],
    }
  }

  const idx = indexarAtividades(activities)
  const agora = instanteDe(hoje)

  const valorTotal = vivas.reduce((s, o) => s + (o.value ?? 0), 0)
  const valorPonderado = vivas.reduce((s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100, 0)

  const emRisco = vivas.filter((o) => {
    const saude = calculateHealthScore(o.scales)
    const dias = getDaysSinceLastContact(o.last_update, idx.get(o.id) ?? [], agora)
    return saude < 4 || dias > 7
  })

  const topDeals = vivas
    .filter((o) => calculateHealthScore(o.scales) > 6 && (o.stage ?? 1) >= 3)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      cliente: o.client ?? o.name ?? `#${o.id}`,
      valor: o.value ?? 0,
      saude: calculateHealthScore(o.scales),
      acao: o.stage === 5 ? 'Fechar agora' : 'Acelerar o fechamento',
    }))

  const saudeMedia =
    Math.round((vivas.reduce((s, o) => s + calculateHealthScore(o.scales), 0) / vivas.length) * 10) / 10

  return {
    total: vivas.length,
    valorTotal,
    valorPonderado: Math.round(valorPonderado),
    emRisco: emRisco.length,
    valorEmRisco: emRisco.reduce((s, o) => s + (o.value ?? 0), 0),
    saudeMedia,
    topDeals,
  }
}
