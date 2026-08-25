// src/core/methodology.ts
// Catálogo de tipos de actividad válidos (los del CHECK de public.activities),
// resultados de touchpoint, y el cookbook de hitos 1A-6C que documentan avance
// real. Todo dato: acá no hay ifs anidados, hay tablas.

import type {
  ActivityType,
  Canal,
  Opportunity,
  ScaleKey,
  StageId,
  TouchpointResult,
} from './types'
import {
  SCALE_LABELS,
  gateFaltante,
  getScaleScores,
  getStageName,
  lowestBlockingScale,
  proximoNivel,
} from './ppvvcc'

/* ── Tipos de actividad (CHECK de public.activities) ─────────────────────── */

/**
 * Los 12 valores que acepta activities.activity_type en producción.
 * Escribir uno fuera de esta lista hace fallar el INSERT en Postgres, así que
 * la validación del cliente usa exactamente esta constante.
 */
export const ACTIVITY_TYPES = [
  'call',
  'email',
  'meeting',
  'whatsapp',
  'linkedin',
  'demo',
  'test',
  'proposal',
  'negotiation',
  'note',
  'ai_suggestion',
  'stage_change',
] as const

export interface ActivityTypeConfig {
  label: string
  icon: string
  /** false para los que genera el sistema: no se ofrecen en el formulario. */
  selectable: boolean
  /** Canal equivalente, cuando lo hay: permite reusar los deep links. */
  channel: Canal | null
  /** true si por naturaleza implica interacción bidireccional (anillo Conversa). */
  bidirectional: boolean
}

export const ACTIVITY_TYPE_CONFIG: Readonly<Record<ActivityType, ActivityTypeConfig>> = {
  call: { label: 'Ligação', icon: '📞', selectable: true, channel: 'phone', bidirectional: true },
  email: { label: 'E-mail', icon: '📧', selectable: true, channel: 'email', bidirectional: false },
  meeting: { label: 'Reunião', icon: '🤝', selectable: true, channel: null, bidirectional: true },
  whatsapp: { label: 'WhatsApp', icon: '💬', selectable: true, channel: 'whatsapp', bidirectional: false },
  linkedin: { label: 'LinkedIn', icon: '🔗', selectable: true, channel: 'linkedin', bidirectional: false },
  demo: { label: 'Demo', icon: '🖥️', selectable: true, channel: null, bidirectional: true },
  test: { label: 'Teste/POC', icon: '🧪', selectable: true, channel: null, bidirectional: true },
  proposal: { label: 'Proposta', icon: '📋', selectable: true, channel: null, bidirectional: false },
  negotiation: { label: 'Negociação', icon: '💰', selectable: true, channel: null, bidirectional: true },
  note: { label: 'Nota', icon: '📝', selectable: true, channel: null, bidirectional: false },
  ai_suggestion: { label: 'Sugestão do Ventus', icon: '🤖', selectable: false, channel: null, bidirectional: false },
  stage_change: { label: 'Mudança de etapa', icon: '📊', selectable: false, channel: null, bidirectional: false },
}

/** true si ese tipo se ofrece en el formulario de registro. */
export function isSelectableActivityType(type: ActivityType): boolean {
  return ACTIVITY_TYPE_CONFIG[type].selectable
}

/** true si el string es un activity_type que Postgres va a aceptar. */
export function isValidActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value)
}

/* ── Resultado de una actividad (activities.result) ──────────────────────── */

export type ActivityResult = 'positivo' | 'neutro' | 'negativo' | 'pendente'

export const ACTIVITY_RESULTS = ['positivo', 'neutro', 'negativo', 'pendente'] as const

export const ACTIVITY_RESULT_LABELS: Readonly<Record<ActivityResult, string>> = {
  positivo: 'Positivo',
  neutro: 'Neutro',
  negativo: 'Negativo',
  pendente: 'Pendente',
}

/* ── RESULT_CONFIG: resultados de touchpoint del funil de prospección ───── */

export interface ResultConfig {
  label: string
  icon: string
  /** Tono semántico — la UI lo mapea a color, el bot lo ignora. */
  tone: 'neutro' | 'bom' | 'atencao' | 'ruim' | 'otimo'
  /** true si hubo respuesta del cliente: cuenta para el anillo Conversa. */
  respondeu: boolean
  /** true si el lead sale de la cadencia después de esto. */
  encerraCadencia: boolean
}

/**
 * Port del RESULT_CONFIG del v2 (CadenciaComponents.jsx), sin las clases de
 * Tailwind — el dominio no sabe de colores, devuelve un tono semántico.
 */
export const RESULT_CONFIG: Readonly<Record<TouchpointResult, ResultConfig>> = {
  no_response: {
    label: 'Sem resposta',
    icon: '⏳',
    tone: 'neutro',
    respondeu: false,
    encerraCadencia: false,
  },
  interested: {
    label: 'Respondeu interessado',
    icon: '🟢',
    tone: 'bom',
    respondeu: true,
    encerraCadencia: false,
  },
  not_now: {
    label: 'Respondeu "não agora"',
    icon: '🟡',
    tone: 'atencao',
    respondeu: true,
    encerraCadencia: false,
  },
  not_interested: {
    label: 'Não tem interesse',
    icon: '🔴',
    tone: 'ruim',
    respondeu: true,
    encerraCadencia: true,
  },
  meeting_scheduled: {
    label: 'Reunião agendada',
    icon: '🎯',
    tone: 'otimo',
    respondeu: true,
    encerraCadencia: true,
  },
  other: {
    label: 'Outro',
    icon: '📝',
    tone: 'neutro',
    respondeu: false,
    encerraCadencia: false,
  },
}

/* ── Cookbook de hitos ───────────────────────────────────────────────────── */

/** Un hito del cookbook, ej. '3B — Apresentar visão diferenciada'. */
export interface MethodologyActivity {
  /** Código canónico: etapa (1..6) + letra (A..). */
  code: string
  stage: StageId
  label: string
  /** Escala que este hito hace avanzar. */
  scale: ScaleKey | null
  /** Tipo de activity con el que normalmente se registra. */
  suggestedType: ActivityType
  /** Qué tiene que quedar registrado para dar el hito por hecho. */
  evidencia: string
}

/**
 * Catálogo de hitos, ordenados por etapa. Es la traducción operativa del
 * PPVVCC: cada hito mueve UNA escala y deja UNA prueba.
 */
export const METHODOLOGY_ACTIVITIES: readonly MethodologyActivity[] = [
  // ── 1 · Prospecção ─────────────────────────────────────────────────────
  { code: '1A', stage: 1, label: 'Empresa qualificada (porte, setor, volume de caixas)', scale: null, suggestedType: 'note', evidencia: 'Volume mensal estimado e linha de produto alvo anotados' },
  { code: '1B', stage: 1, label: 'Contato nomeado com cargo identificado', scale: 'poder', suggestedType: 'linkedin', evidencia: 'Nome e cargo do contato no registro' },
  { code: '1C', stage: 1, label: 'Primeiro contato executado', scale: 'dor', suggestedType: 'whatsapp', evidencia: 'Touchpoint registrado com canal e resultado' },
  { code: '1D', stage: 1, label: 'Reunião de descoberta agendada', scale: 'poder', suggestedType: 'meeting', evidencia: 'Data e hora da reunião confirmadas pelo cliente' },

  // ── 2 · Qualificação ───────────────────────────────────────────────────
  { code: '2A', stage: 2, label: 'Diagnóstico da operação de embalagem (SPIN situação)', scale: 'dor', suggestedType: 'meeting', evidencia: 'Volume/mês, tipo de caixa, método de fechamento atual' },
  { code: '2B', stage: 2, label: 'Contato admite os sintomas (caixa violada, retrabalho)', scale: 'dor', suggestedType: 'meeting', evidencia: 'Citação textual do contato descrevendo o sintoma' },
  { code: '2C', stage: 2, label: 'Dor quantificada com números do cliente', scale: 'dor', suggestedType: 'note', evidencia: '% de devoluções, custo por caixa ou horas de retrabalho ditos pelo cliente' },
  { code: '2D', stage: 2, label: 'Dor documentada e devolvida por escrito ao contato', scale: 'dor', suggestedType: 'email', evidencia: 'E-mail de confirmação com o de-acordo do contato' },
  { code: '2E', stage: 2, label: 'Processo de decisão revelado', scale: 'poder', suggestedType: 'call', evidencia: 'Quem aprova, quem influencia e quem paga, com nomes' },
  { code: '2F', stage: 2, label: 'Acesso ao Tomador de Decisão acordado', scale: 'poder', suggestedType: 'call', evidencia: 'Contato aceita apresentar o decisor, com data' },

  // ── 3 · Apresentação ───────────────────────────────────────────────────
  { code: '3A', stage: 3, label: 'Tomador de Decisão acessado', scale: 'poder', suggestedType: 'meeting', evidencia: 'Reunião realizada com quem assina' },
  { code: '3B', stage: 3, label: 'Visão diferenciada criada com o contato (SPI)', scale: 'visao', suggestedType: 'demo', evidencia: 'Ata da conversa com situação/problema/implicação' },
  { code: '3C', stage: 3, label: 'Demo com a caixa e o volume DO cliente', scale: 'visao', suggestedType: 'demo', evidencia: 'Foto ou vídeo da demo com o material do cliente' },
  { code: '3D', stage: 3, label: 'Caso de referência do setor apresentado', scale: 'visao', suggestedType: 'email', evidencia: 'Caso enviado e comentado pelo cliente' },
  { code: '3E', stage: 3, label: 'Visão documentada e concordada por escrito', scale: 'visao', suggestedType: 'email', evidencia: 'Resposta do cliente confirmando o documento' },
  { code: '3F', stage: 3, label: 'Mapa de stakeholders com 3+ nomes', scale: 'poder', suggestedType: 'note', evidencia: 'Sponsor, influenciador e decisor preenchidos' },

  // ── 4 · Validação/Teste ────────────────────────────────────────────────
  { code: '4A', stage: 4, label: 'Critérios de valor definidos com o decisor', scale: 'valor', suggestedType: 'meeting', evidencia: 'Lista de critérios acordada por escrito' },
  { code: '4B', stage: 4, label: 'Plano de avaliação enviado ao Tomador de Decisão', scale: 'controle', suggestedType: 'email', evidencia: 'Plano com etapas, datas e responsáveis' },
  { code: '4C', stage: 4, label: 'Plano de avaliação aprovado ou ajustado pelo decisor', scale: 'controle', suggestedType: 'email', evidencia: 'Resposta do decisor sobre o plano' },
  { code: '4D', stage: 4, label: 'Teste/POC rodando na planta', scale: 'valor', suggestedType: 'test', evidencia: 'Registro de início do teste com data e responsável' },
  { code: '4E', stage: 4, label: 'Resultado do teste medido com o cliente', scale: 'valor', suggestedType: 'test', evidencia: 'Números do antes/depois medidos na operação do cliente' },
  { code: '4F', stage: 4, label: 'Business case construído com números do cliente', scale: 'valor', suggestedType: 'note', evidencia: 'Planilha de economia anual validada pelo cliente' },
  { code: '4G', stage: 4, label: 'Análise de valor aceita pelo Tomador de Decisão', scale: 'valor', suggestedType: 'meeting', evidencia: 'Confirmação por escrito das conclusões' },

  // ── 5 · Negociação ─────────────────────────────────────────────────────
  { code: '5A', stage: 5, label: 'Processo de compras confirmado pelo decisor', scale: 'compras', suggestedType: 'call', evidencia: 'Fluxo, prazos e alçadas confirmados' },
  { code: '5B', stage: 5, label: 'Condições comerciais validadas com o cliente', scale: 'compras', suggestedType: 'negotiation', evidencia: 'Prazo, preço e escopo aceitos verbalmente' },
  { code: '5C', stage: 5, label: 'Proposta formal enviada', scale: 'compras', suggestedType: 'proposal', evidencia: 'PDF da proposta e data de envio' },
  { code: '5D', stage: 5, label: 'Proposta aprovada pelo decisor para negociação final', scale: 'controle', suggestedType: 'negotiation', evidencia: 'Aprovação verbal ou escrita do decisor' },
  { code: '5E', stage: 5, label: 'Negociação com o departamento de compras iniciada', scale: 'compras', suggestedType: 'negotiation', evidencia: 'Contato de compras nomeado e reunião registrada' },
  { code: '5F', stage: 5, label: 'Condições formalizadas e aprovadas internamente', scale: 'compras', suggestedType: 'negotiation', evidencia: 'E-mail de aprovação interna do cliente' },

  // ── 6 · Fechado ────────────────────────────────────────────────────────
  { code: '6A', stage: 6, label: 'Contrato assinado', scale: 'compras', suggestedType: 'proposal', evidencia: 'Contrato assinado anexado' },
  { code: '6B', stage: 6, label: 'Pedido de compra recebido', scale: 'compras', suggestedType: 'note', evidencia: 'Número do PO registrado' },
  { code: '6C', stage: 6, label: 'Implantação combinada e primeira entrega agendada', scale: 'controle', suggestedType: 'meeting', evidencia: 'Data de instalação/entrega acordada' },
] as const

const POR_CODIGO = new Map(METHODOLOGY_ACTIVITIES.map((a) => [a.code, a]))

/** Hito por código, ej. '4A'. Case-insensitive: el bot recibe '4a'. */
export function getMethodologyActivity(code: string): MethodologyActivity | undefined {
  return POR_CODIGO.get(code.trim().toUpperCase())
}

/** Hitos que corresponden a una etapa del funil. */
export function activitiesForStage(stage: StageId): MethodologyActivity[] {
  return METHODOLOGY_ACTIVITIES.filter((a) => a.stage === stage)
}

/** Hitos que mueven una escala concreta, en orden de etapa. */
export function activitiesForScale(scale: ScaleKey): MethodologyActivity[] {
  return METHODOLOGY_ACTIVITIES.filter((a) => a.scale === scale)
}

/**
 * Siguiente paso metodológico sugerido, cruzando la etapa actual, los gates
 * bloqueados y los hitos ya registrados.
 *
 * Prioridad:
 *   1. Un hito pendiente de la etapa actual que mueva la escala que traba el
 *      gate. Es el único que destraba el avance.
 *   2. Cualquier hito pendiente de la etapa actual.
 *   3. El primer hito de la etapa siguiente (ya está todo hecho acá).
 */
export function getSuggestedNextStep(
  opportunity: Opportunity,
  doneCodes: readonly string[],
): MethodologyActivity | null {
  const stage = (opportunity.stage ?? 1) as StageId
  const feitos = new Set(doneCodes.map((c) => c.trim().toUpperCase()))
  const pendentes = activitiesForStage(stage).filter((a) => !feitos.has(a.code))

  const travando = lowestBlockingScale(opportunity.scales, stage)
  if (travando) {
    const alvo = pendentes.find((a) => a.scale === travando)
    if (alvo) return alvo
  }
  if (pendentes[0]) return pendentes[0]

  if (stage < 6) {
    const proxima = activitiesForStage((stage + 1) as StageId).filter((a) => !feitos.has(a.code))
    return proxima[0] ?? null
  }
  return null
}

/** Cobertura del cookbook: qué porcentaje de hitos de la etapa está cubierto. */
export function cookbookCoverage(stage: StageId, doneCodes: readonly string[]): number {
  const total = activitiesForStage(stage)
  if (total.length === 0) return 100
  const feitos = new Set(doneCodes.map((c) => c.trim().toUpperCase()))
  const cubiertos = total.filter((a) => feitos.has(a.code)).length
  return Math.round((cubiertos / total.length) * 100)
}

/* ── Sugestão de próximo passo, redactada ────────────────────────────────── */

export interface SugestaoProximoPasso {
  /** Escala que la sugerencia busca mover. */
  escala: ScaleKey
  /** Nivel actual de esa escala. */
  nivelAtual: number
  /** Texto del nivel siguiente — el destino concreto. */
  proximoNivel: string | null
  /** El hito del cookbook que corresponde, si hay uno. */
  hito: MethodologyActivity | null
  /** Qué hacer, imperativo y en PT-BR. */
  acao: string
  /** Por qué esa escala y no otra. */
  motivo: string
  /** Tipo de actividad con el que se va a registrar. */
  tipoSugerido: ActivityType
}

/**
 * El próximo paso concreto para mover UNA escala.
 *
 * Si no se pasa `escalaAlvo`, elige la que traba el gate de la etapa actual;
 * si el gate está limpio, la escala más baja de las seis (lo que sobra para
 * avanzar hoy es lo que va a faltar en la etapa siguiente).
 */
export function sugestaoDeProximoPasso(
  opp: Opportunity,
  escalaAlvo?: ScaleKey,
  doneCodes: readonly string[] = [],
): SugestaoProximoPasso {
  const stage = (opp.stage ?? 1) as StageId
  const scores = getScaleScores(opp.scales)

  let escala: ScaleKey
  let motivo: string

  if (escalaAlvo) {
    escala = escalaAlvo
    motivo = `Escala escolhida manualmente: ${SCALE_LABELS[escala]}.`
  } else {
    const travando = lowestBlockingScale(opp.scales, stage)
    if (travando) {
      escala = travando
      motivo = gateFaltante(opp.scales, stage)?.texto ?? `${SCALE_LABELS[escala]} trava o avanço.`
    } else {
      const chaves: ScaleKey[] = ['dor', 'poder', 'visao', 'valor', 'controle', 'compras']
      escala = chaves.reduce((menor, k) => (scores[k] < scores[menor] ? k : menor), chaves[0] as ScaleKey)
      const nomeEtapa = getStageName(stage) || 'a etapa atual'
      motivo = `O gate de ${nomeEtapa} está cumprido; ${SCALE_LABELS[escala]} é a escala mais baixa (${scores[escala]}).`
    }
  }

  const feitos = new Set(doneCodes.map((c) => c.trim().toUpperCase()))
  const hito =
    activitiesForScale(escala).find((a) => a.stage === stage && !feitos.has(a.code)) ??
    activitiesForScale(escala).find((a) => !feitos.has(a.code)) ??
    null

  const alvoTexto = proximoNivel(escala, scores[escala])
  const contato = opp.sponsor ?? opp.power_sponsor ?? opp.influencer ?? 'o contato'
  const acao =
    hito?.label ??
    (alvoTexto
      ? `Levar ${SCALE_LABELS[escala]} ao nível ${scores[escala] + 1} com ${contato}: ${alvoTexto}`
      : `${SCALE_LABELS[escala]} já está no máximo — proteger o que foi conquistado`)

  return {
    escala,
    nivelAtual: scores[escala],
    proximoNivel: alvoTexto,
    hito,
    acao,
    motivo,
    tipoSugerido: hito?.suggestedType ?? 'call',
  }
}
