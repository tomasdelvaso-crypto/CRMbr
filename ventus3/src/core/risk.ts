// src/core/risk.ts
// Las 6 reglas de riesgo de negocio. Determinísticas y accionables:
// cada riesgo detectado tiene que poder convertirse en una acción concreta.
// Si una regla no sabe decir QUÉ HACER, no entra acá.

import type {
  Activity,
  DealRisk,
  IsoDate,
  Opportunity,
  RiskCode,
  RiskSignal,
  ScaleKey,
  ScalesRecord,
  Severity,
  StageId,
} from './types.js'
import { daysBetween, formatarBRL, todayBr } from './dates.js'
import {
  SCALE_KEYS,
  SCALE_LABELS,
  calculateHealthScore,
  getDaysSinceLastContact,
  getScaleScores,
  getScaleValue,
  getStageName,
  maxStageAllowed,
} from './ppvvcc.js'

/** Umbrales de las reglas. Expuestos para test y calibración. */
export interface RiskThresholds {
  /** Silencio en etapa ≥ 4 que dispara alerta. */
  silenceDaysLateStage: number
  /** Días vencidos de una próxima acción. */
  actionOverdueDays: number
  /** Días sin respuesta tras enviar propuesta. */
  proposalNoAnswerDays: number
  /** Etapa a partir de la cual el silencio es crítico. */
  lateStageFrom: number
  /** Días sin evidencia que vuelven «vieja» una escala alta. */
  staleEvidenceDays: number
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  silenceDaysLateStage: 21,
  actionOverdueDays: 7,
  proposalNoAnswerDays: 14,
  lateStageFrom: 4,
  staleEvidenceDays: 45,
}

/** Peso de cada regla en el riesgo agregado de la cartera (0..100). */
const PESO_RISCO: Readonly<Record<RiskCode, number>> = {
  false_gate: 25,
  silence_late_stage: 22,
  proposal_no_answer: 18,
  single_threaded: 15,
  action_overdue: 12,
  scale_regression: 8,
}

const SEVERIDADE_PESO: Readonly<Record<Severity, number>> = {
  critical: 1,
  warning: 0.6,
  info: 0.3,
}

/* ── Utilidades ──────────────────────────────────────────────────────────── */

/** Los contactos nombrados de la oportunidad, sin vacíos ni duplicados. */
export function stakeholders(opportunity: Opportunity): string[] {
  const brutos = [
    opportunity.power_sponsor,
    opportunity.sponsor,
    opportunity.influencer,
    opportunity.support_contact,
  ]
  const vistos = new Set<string>()
  const out: string[] = []
  for (const b of brutos) {
    const nome = (b ?? '').trim()
    if (nome === '') continue
    const chave = nome.toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    out.push(nome)
  }
  return out
}

/** Nombre del contacto con el que hablar, o un tratamiento neutro. */
function contatoPrincipal(opp: Opportunity): string {
  return opp.sponsor ?? opp.power_sponsor ?? opp.influencer ?? 'o contato'
}

/** Etiqueta legible del negocio, para el mensaje. */
function rotulo(opp: Opportunity): string {
  return opp.client ?? opp.name ?? `Oportunidade #${opp.id}`
}

/** true si solo hay un contacto conocido: single-threading. */
export function isSingleThreaded(opportunity: Opportunity): boolean {
  return stakeholders(opportunity).length <= 1
}

/**
 * Gate falso: la etapa está por encima de lo que las escalas habilitan.
 * No mira evidencia (eso lo hace healthVerificado): mira si alguien arrastró
 * la tarjeta sin cumplir el gate — el pecado original del kanban del v2.
 */
export function hasFalseGate(opportunity: Opportunity): boolean {
  const stage = opportunity.stage
  if (stage === null || stage === undefined) return false
  if (stage === 6) return false
  return stage > maxStageAllowed(opportunity.scales)
}

/** Última actividad de un tipo dado, o undefined. */
function ultimaAtividadeDoTipo(
  activities: readonly Activity[],
  tipos: readonly Activity['activity_type'][],
): Activity | undefined {
  let melhor: Activity | undefined
  for (const a of activities) {
    if (!tipos.includes(a.activity_type)) continue
    const data = a.activity_date ?? a.created_at
    if (!data) continue
    const atualData = melhor?.activity_date ?? melhor?.created_at
    if (!melhor || !atualData || data > atualData) melhor = a
  }
  return melhor
}

/* ── Las 6 reglas ────────────────────────────────────────────────────────── */

/**
 * R1 · Single-threaded. Un solo contacto conocido en un negocio que ya vale
 * plata. Si esa persona cambia de área, el negocio desaparece con ella.
 */
export function regraSingleThreaded(opp: Opportunity): RiskSignal | null {
  if (!isSingleThreaded(opp)) return null
  const stage = opp.stage ?? 1
  const valor = opp.value ?? 0
  // Un lead recién abierto siempre es single-threaded: no es noticia.
  if (stage < 2 && valor < 50_000) return null

  const unico = stakeholders(opp)[0]
  const severidade: Severity = stage >= 4 || valor >= 100_000 ? 'critical' : 'warning'
  return {
    codigo: 'single_threaded',
    severidade,
    mensagem: unico
      ? `${rotulo(opp)} depende de uma pessoa só: ${unico}. Se ${unico} sair, o negócio sai junto.`
      : `${rotulo(opp)} não tem nenhum contato nomeado no registro.`,
    sugestao: unico
      ? `Peça a ${unico} para te apresentar quem mais é impactado — operação, qualidade ou compras — e registre nome e cargo.`
      : 'Descubra e registre pelo menos um nome com cargo antes do próximo toque.',
    opportunityId: opp.id,
  }
}

/**
 * R2 · Silêncio > N dias em etapa ≥ 4. Estar callado en prospección es normal;
 * estarlo después de un teste o de una proposta es un negocio muriendo.
 */
export function regraSilencioEtapaAvancada(
  opp: Opportunity,
  activities: readonly Activity[],
  hoje: IsoDate,
  th: RiskThresholds,
): RiskSignal | null {
  const stage = opp.stage ?? 1
  if (stage < th.lateStageFrom || stage === 6) return null
  const dias = getDaysSinceLastContact(opp.last_update, activities, new Date(`${hoje}T12:00:00Z`))
  if (dias < th.silenceDaysLateStage) return null

  const contato = contatoPrincipal(opp)
  return {
    codigo: 'silence_late_stage',
    severidade: dias >= th.silenceDaysLateStage * 2 ? 'critical' : 'warning',
    mensagem: `${rotulo(opp)} está em ${getStageName(stage as StageId)} há ${dias} dias sem contato real${opp.value ? ` — ${formatarBRL(opp.value)} parados` : ''}.`,
    sugestao: `Ligue hoje para ${contato} com um motivo novo (resultado do teste, caso do setor, mudança de prazo) e saia da ligação com data marcada.`,
    opportunityId: opp.id,
  }
}

/**
 * R3 · Regressão de escala. Bajar una escala está BIEN (corregir es avanzar),
 * pero tiene que quedar registrado por qué. Una caída silenciosa suele ser
 * alguien limpiando el pipeline sin decirlo.
 */
export function regraRegressaoDeEscala(
  opp: Opportunity,
  anterior: ScalesRecord | null | undefined,
): RiskSignal | null {
  if (!anterior) return null
  const antes = getScaleScores(anterior)
  const agora = getScaleScores(opp.scales)
  const caidas: Array<{ escala: ScaleKey; de: number; para: number }> = []
  for (const k of SCALE_KEYS) {
    if (agora[k] < antes[k]) caidas.push({ escala: k, de: antes[k], para: agora[k] })
  }
  if (caidas.length === 0) return null

  const pior = caidas.reduce((p, c) => (c.de - c.para > p.de - p.para ? c : p), caidas[0] as { escala: ScaleKey; de: number; para: number })
  const lista = caidas.map((c) => `${SCALE_LABELS[c.escala].toUpperCase()} ${c.de}→${c.para}`).join(', ')
  return {
    codigo: 'scale_regression',
    severidade: pior.de - pior.para >= 3 ? 'warning' : 'info',
    mensagem: `${rotulo(opp)} teve escala em queda: ${lista}.`,
    sugestao: `Registre em uma frase o que aconteceu para ${SCALE_LABELS[pior.escala]} cair — corrigir vale os mesmos pontos que subir, mas sem o motivo ninguém aprende nada.`,
    opportunityId: opp.id,
  }
}

/**
 * R4 · Gate falso. La etapa está más adelante de lo que las escalas permiten.
 * Es el riesgo más caro: infla el forecast y esconde el trabajo que falta.
 */
export function regraGateFalso(opp: Opportunity): RiskSignal | null {
  if (!hasFalseGate(opp)) return null
  const stage = (opp.stage ?? 1) as StageId
  const permitido = maxStageAllowed(opp.scales)
  const scores = getScaleScores(opp.scales)
  const faltando = SCALE_KEYS.filter((k) => scores[k] < 5)
    .map((k) => `${SCALE_LABELS[k].toUpperCase()} ${scores[k]}`)
    .join(', ')

  return {
    codigo: 'false_gate',
    severidade: 'critical',
    mensagem: `${rotulo(opp)} está em ${getStageName(stage)} mas as escalas só sustentam ${getStageName(permitido)}${faltando ? ` (${faltando})` : ''}.`,
    sugestao: `Ou volta a etapa para ${getStageName(permitido)}, ou sobe a escala que trava com evidência. Manter como está infla o forecast.`,
    opportunityId: opp.id,
  }
}

/**
 * R5 · Ação vencida > N dias. La próxima acción prometida y no ejecutada.
 * Es la promesa rota más barata de arreglar y la que más credibilidad cuesta.
 */
export function regraAcaoVencida(
  opp: Opportunity,
  hoje: IsoDate,
  th: RiskThresholds,
): RiskSignal | null {
  const acao = (opp.next_action ?? '').trim()
  const prazo = opp.next_action_date
  if (acao === '' || !prazo) return null
  const atraso = daysBetween(prazo, hoje)
  if (atraso < th.actionOverdueDays) return null

  return {
    codigo: 'action_overdue',
    severidade: atraso >= th.actionOverdueDays * 3 ? 'critical' : 'warning',
    mensagem: `"${acao}" venceu há ${atraso} dias em ${rotulo(opp)}.`,
    sugestao: `Faça agora ou reprograme com data nova. Uma ação vencida há ${atraso} dias já não é um plano, é ruído.`,
    opportunityId: opp.id,
  }
}

/**
 * R6 · Proposta sem resposta > N dias. Después de mandar la propuesta el
 * silencio no es "está pensando": es que la propuesta no llegó a quien decide.
 */
export function regraPropostaSemResposta(
  opp: Opportunity,
  activities: readonly Activity[],
  hoje: IsoDate,
  th: RiskThresholds,
): RiskSignal | null {
  const proposta = ultimaAtividadeDoTipo(activities, ['proposal'])
  if (!proposta) return null
  const enviadaEm = proposta.activity_date ?? proposta.created_at
  if (!enviadaEm) return null
  const diasDesdeProposta = daysBetween(enviadaEm, hoje)
  if (diasDesdeProposta < th.proposalNoAnswerDays) return null

  // ¿Hubo alguna interacción bidireccional después de mandarla?
  const houveResposta = activities.some((a) => {
    const data = a.activity_date ?? a.created_at
    if (!data || data <= enviadaEm) return false
    return (
      ['call', 'meeting', 'negotiation', 'whatsapp'].includes(a.activity_type) &&
      a.result !== 'negativo'
    )
  })
  if (houveResposta) return null

  const contato = contatoPrincipal(opp)
  return {
    codigo: 'proposal_no_answer',
    severidade: diasDesdeProposta >= th.proposalNoAnswerDays * 2 ? 'critical' : 'warning',
    mensagem: `Proposta de ${rotulo(opp)} enviada há ${diasDesdeProposta} dias sem nenhuma resposta.`,
    sugestao: `Ligue para ${contato} e pergunte direto: a proposta chegou em quem assina? Peça um sim, um não ou uma data — as três respostas servem.`,
    opportunityId: opp.id,
  }
}

/* ── Orquestación ────────────────────────────────────────────────────────── */

/** Contexto opcional que hace más ricas algunas reglas. */
export interface RiskContext {
  /** Snapshot anterior de las escalas, para detectar regresión. */
  scalesAnteriores?: ScalesRecord | null
}

/** Evalúa las 6 reglas sobre una oportunidad, ordenadas por severidad. */
export function avaliarRiscos(
  opportunity: Opportunity,
  activities: readonly Activity[],
  hoje: IsoDate = todayBr(),
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
  ctx: RiskContext = {},
): RiskSignal[] {
  // Un negocio cerrado o perdido ya no tiene riesgo que gestionar.
  if (opportunity.outcome || opportunity.stage === 6) return []

  const doOpp = activities.filter((a) => a.opportunity_id === opportunity.id)
  const sinais: Array<RiskSignal | null> = [
    regraGateFalso(opportunity),
    regraSilencioEtapaAvancada(opportunity, doOpp, hoje, thresholds),
    regraPropostaSemResposta(opportunity, doOpp, hoje, thresholds),
    regraSingleThreaded(opportunity),
    regraAcaoVencida(opportunity, hoje, thresholds),
    regraRegressaoDeEscala(opportunity, ctx.scalesAnteriores),
  ]

  const ordem: Readonly<Record<Severity, number>> = { critical: 0, warning: 1, info: 2 }
  return sinais
    .filter((s): s is RiskSignal => s !== null)
    .sort((a, b) => {
      const d = ordem[a.severidade] - ordem[b.severidade]
      if (d !== 0) return d
      return PESO_RISCO[b.codigo] - PESO_RISCO[a.codigo]
    })
}

/** Compat con la firma inglesa que consume src/data/queries.ts. */
export function detectRisks(
  opportunity: Opportunity,
  activities: readonly Activity[],
  today: IsoDate,
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): DealRisk[] {
  return avaliarRiscos(opportunity, activities, today, thresholds).map((s) => ({
    code: s.codigo,
    severity: s.severidade,
    message: s.mensagem,
    opportunityId: s.opportunityId,
  }))
}

/** Escalas que bajaron respecto del snapshot anterior, una por escala. */
export function detectScaleRegression(
  previous: ScalesRecord | null | undefined,
  current: ScalesRecord | null | undefined,
): DealRisk[] {
  if (!previous) return []
  const antes = getScaleScores(previous)
  const agora = getScaleScores(current)
  const out: DealRisk[] = []
  for (const k of SCALE_KEYS) {
    if (agora[k] >= antes[k]) continue
    const queda = antes[k] - agora[k]
    out.push({
      code: 'scale_regression',
      severity: queda >= 3 ? 'warning' : 'info',
      message: `${SCALE_LABELS[k].toUpperCase()} caiu de ${antes[k]} para ${agora[k]}. Registre o motivo.`,
      opportunityId: 0,
    })
  }
  return out
}

/**
 * Riesgo agregado 0..100 de la cartera de un vendedor.
 * Ponderado por el valor del negocio: 4 riesgos en un deal de R$ 5.000 no
 * pueden pesar lo mismo que uno solo en el de R$ 1,1M.
 */
export function portfolioRiskScore(
  opportunities: readonly Opportunity[],
  activities: readonly Activity[],
  today: IsoDate,
): number {
  const vivas = opportunities.filter((o) => !o.outcome && o.stage !== 6)
  if (vivas.length === 0) return 0

  const valorTotal = vivas.reduce((s, o) => s + Math.max(o.value ?? 0, 1), 0)
  let acumulado = 0

  for (const opp of vivas) {
    const sinais = avaliarRiscos(opp, activities, today)
    const bruto = sinais.reduce(
      (s, r) => s + PESO_RISCO[r.codigo] * SEVERIDADE_PESO[r.severidade],
      0,
    )
    // Cada oportunidad aporta como mucho 100 puntos de riesgo propio.
    const propio = Math.min(bruto, 100)
    const peso = Math.max(opp.value ?? 0, 1) / valorTotal
    acumulado += propio * peso
  }

  return Math.round(Math.min(100, acumulado))
}

/** Semáforo de riesgo para la fila compacta de Carteira. */
export function riskLevel(risks: readonly DealRisk[] | readonly RiskSignal[]): 'ok' | 'atencao' | 'critico' {
  let temCritico = false
  let temAviso = false
  for (const r of risks) {
    const sev = 'severity' in r ? r.severity : r.severidade
    if (sev === 'critical') temCritico = true
    else if (sev === 'warning') temAviso = true
  }
  if (temCritico) return 'critico'
  if (temAviso) return 'atencao'
  return 'ok'
}

/** Rótulo PT-BR del semáforo. */
export const RISK_LEVEL_LABELS: Readonly<Record<'ok' | 'atencao' | 'critico', string>> = {
  ok: 'Sob controle',
  atencao: 'Atenção',
  critico: 'Crítico',
}

/** Salud + riesgo en una línea, para la fila de Carteira. */
export function resumoDeRisco(
  opp: Opportunity,
  activities: readonly Activity[],
  hoje: IsoDate = todayBr(),
): { nivel: 'ok' | 'atencao' | 'critico'; health: number; sinais: RiskSignal[] } {
  const sinais = avaliarRiscos(opp, activities, hoje)
  return { nivel: riskLevel(sinais), health: calculateHealthScore(opp.scales), sinais }
}

/** Escala más débil de una oportunidad — atajo que usan planner y dossiê. */
export function escalaMaisFraca(opp: Opportunity): { escala: ScaleKey; valor: number } {
  const scores = getScaleScores(opp.scales)
  let pior: ScaleKey = 'dor'
  for (const k of SCALE_KEYS) if (scores[k] < scores[pior]) pior = k
  return { escala: pior, valor: getScaleValue(scores[pior]) }
}
