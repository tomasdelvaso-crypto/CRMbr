// src/core/cadence.ts
// Cadencia de prospección: 7 toques en 21 días y progresión 1a → 1d.
// Portado del v2 (src/CadenciaComponents.jsx).
//
// Regla de producto: la etapa 1a→1d NUNCA se arrastra a mano. Se DERIVA del
// resultado del último toque. Un kanban con drag&drop deja que el vendedor
// mueva la tarjeta sin que haya pasado nada; acá mover la tarjeta exige
// registrar qué contestó el cliente.

import type {
  CadenceStep,
  Channel,
  IsoDate,
  Lead,
  LeadStage,
  Touchpoint,
  TouchpointResult,
  TouchpointSeq,
} from './types'
import { addDays, daysBetween, todayBr, toBrDate } from './dates'

/** Los 7 toques, con su día del ciclo y su canal. No reordenar. */
export const CADENCE_SCHEDULE: readonly CadenceStep[] = [
  { tp: 1, day: 1, channel: 'linkedin', label: 'Conexão + mensagem personalizada' },
  { tp: 2, day: 3, channel: 'whatsapp', label: 'Apresentação curta, pedir reunião' },
  { tp: 3, day: 6, channel: 'email', label: 'Email de valor com caso de referência' },
  { tp: 4, day: 10, channel: 'whatsapp', label: 'Follow-up, perguntar se viu o email' },
  { tp: 5, day: 13, channel: 'phone', label: 'Chamada direta' },
  { tp: 6, day: 17, channel: 'email', label: 'Último email formal' },
  { tp: 7, day: 21, channel: 'whatsapp', label: 'Mensagem de despedida' },
] as const

export const MAX_TOUCHPOINTS = 7

export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  phone: 'Telefone',
}

export const LEAD_STAGE_LABELS: Readonly<Record<LeadStage, string>> = {
  '1a': '1A · Empresa identificada',
  '1b': '1B · Contato identificado',
  '1c': '1C · Estimulando interesse',
  '1d': '1D · Reunião agendada',
}

export const TOUCHPOINT_RESULT_LABELS: Readonly<Record<TouchpointResult, string>> = {
  no_response: 'Sem resposta',
  interested: 'Respondeu interessado',
  not_now: 'Respondeu "não agora"',
  not_interested: 'Não tem interesse',
  meeting_scheduled: 'Reunião agendada',
  other: 'Outro',
}

/** Orden de las etapas del funil de prospección. Solo se sube, nunca se baja. */
export const LEAD_STAGE_ORDER: readonly LeadStage[] = ['1a', '1b', '1c', '1d'] as const

/** Resultados que cuentan como conversa real (bidireccional). */
export const RESULTADOS_COM_RESPOSTA: readonly TouchpointResult[] = [
  'interested',
  'not_now',
  'not_interested',
  'meeting_scheduled',
] as const

/* ── Programa de la cadencia ─────────────────────────────────────────────── */

/**
 * El paso de cadencia que toca ahora, dado cuántos toques ya se hicieron.
 * count = 0 → TP1. Mismo indexado que el v2: CADENCE_SCHEDULE[count].
 */
export function nextCadenceStep(touchpointsCount: number): CadenceStep | null {
  const idx = Math.max(0, Math.trunc(touchpointsCount))
  return CADENCE_SCHEDULE[idx] ?? null
}

/** Alias PT-BR: el próximo toque que le corresponde al lead. */
export function proximoTouchpoint(lead: Pick<Lead, 'touchpoints_count'>): CadenceStep | null {
  return nextCadenceStep(lead.touchpoints_count ?? 0)
}

/** Canal del toque número n (1..7). null si n está fuera de la cadencia. */
export function canalDoToque(n: number): Channel | null {
  return CADENCE_SCHEDULE.find((s) => s.tp === n)?.channel ?? null
}

/** El paso completo del toque número n (1..7). */
export function passoDoToque(n: number): CadenceStep | null {
  return CADENCE_SCHEDULE.find((s) => s.tp === n) ?? null
}

/**
 * Fecha del próximo toque a partir del contador y la fecha de referencia.
 * El intervalo es la diferencia de días entre el paso siguiente y el anterior
 * (1, 2, 3, 4, 3, 4, 4), no el día absoluto del calendario: si el vendedor se
 * atrasó no le comprimimos toda la cadencia contra el día 21.
 */
export function calcNextTouchpointDate(
  touchpointsCount: number,
  fromDate: IsoDate | Date,
): IsoDate | null {
  const idx = Math.max(0, Math.trunc(touchpointsCount))
  const proximo = CADENCE_SCHEDULE[idx]
  if (!proximo) return null
  const anterior = idx > 0 ? CADENCE_SCHEDULE[idx - 1]?.day ?? 0 : 0
  return addDays(toBrDate(fromDate), proximo.day - anterior)
}

/**
 * Días de atraso del próximo toque respecto de hoy. 0 si está al día.
 *
 * Si el lead nunca tuvo un next_touchpoint_date (los importados de
 * market_sweep no lo tienen) usamos la fecha del último toque + el intervalo;
 * y si tampoco hay último toque, la fecha de creación. Un lead sin fecha no
 * puede quedar invisible: son 48 los que hoy están así en producción.
 */
export function touchpointDelayDays(lead: Lead, today: Date | IsoDate = new Date()): number {
  const hoje = toBrDate(today)
  if (isCadenceExhausted(lead)) return 0

  let previsto = lead.next_touchpoint_date ? toBrDate(lead.next_touchpoint_date) : null

  if (!previsto) {
    const base = lead.last_touchpoint_date ?? lead.created_at
    previsto = base ? calcNextTouchpointDate(lead.touchpoints_count ?? 0, toBrDate(base)) : null
  }
  if (!previsto) return 0

  const atraso = daysBetween(previsto, hoje)
  return atraso > 0 ? atraso : 0
}

/** Alias PT-BR de touchpointDelayDays. */
export function atrasoEmDias(lead: Lead, hoje: IsoDate | Date = todayBr()): number {
  return touchpointDelayDays(lead, hoje)
}

/** true si el lead agotó los 7 toques y debe archivarse/reciclarse. */
export function isCadenceExhausted(lead: Pick<Lead, 'touchpoints_count'>): boolean {
  return (lead.touchpoints_count ?? 0) >= MAX_TOUCHPOINTS
}

/** Número de secuencia del próximo touchpoint (1..7), o null si se agotó. */
export function nextSequenceNumber(touchpoints: readonly Touchpoint[]): TouchpointSeq | null {
  let maximo = 0
  for (const tp of touchpoints) {
    if (tp.sequence_number > maximo) maximo = tp.sequence_number
  }
  const proximo = maximo + 1
  if (proximo > MAX_TOUCHPOINTS) return null
  return proximo as TouchpointSeq
}

/* ── Derivación de la etapa 1a → 1d ──────────────────────────────────────── */

/**
 * La etapa que IMPLICA un resultado de toque, por sí solo.
 *
 *   meeting_scheduled → 1d  el objetivo del funil previo: reunião marcada
 *   interested        → 1c  respondió y hay interés: estamos estimulando
 *   not_now           → 1c  respondió; el interés existe, el timing no
 *   no_response       → 1b  le hablamos a alguien con nombre, no contestó
 *   not_interested    → 1b  hubo contacto; el descarte lo hace el status
 *   other             → 1b
 *
 * NUNCA se usa sola para escribir: pasala por advanceLeadStage, que garantiza
 * que la etapa no retroceda.
 */
export function stageFromResult(result: TouchpointResult): LeadStage {
  switch (result) {
    case 'meeting_scheduled':
      return '1d'
    case 'interested':
    case 'not_now':
      return '1c'
    case 'no_response':
    case 'not_interested':
    case 'other':
      return '1b'
    default:
      return '1b'
  }
}

/** Índice ordinal de una etapa de lead (0..3). */
export function leadStageIndex(stage: LeadStage): number {
  const i = LEAD_STAGE_ORDER.indexOf(stage)
  return i < 0 ? 0 : i
}

/**
 * Etapa que le corresponde al lead tras registrar un toque.
 * El máximo entre la etapa actual y la que implica el resultado: la cadencia
 * avanza el funil, no lo retrocede. Un 'não tenho interesse' no baja la
 * etapa — archiva el lead, que es otra decisión y otro campo.
 */
export function advanceLeadStage(lead: Pick<Lead, 'stage'>, result: TouchpointResult): LeadStage {
  const atual = lead.stage ?? '1a'
  const implicada = stageFromResult(result)
  return leadStageIndex(implicada) > leadStageIndex(atual) ? implicada : atual
}

/** true si el resultado fue una interacción bidireccional (anillo Conversa). */
export function ehConversaReal(result: TouchpointResult): boolean {
  return RESULTADOS_COM_RESPOSTA.includes(result)
}

/* ── Cola de la Golden Hour ──────────────────────────────────────────────── */

/**
 * Cola de la Golden Hour: leads ordenados por urgencia real de cadencia.
 *
 * Criterio, en orden:
 *   1. Solo leads activos y con cadencia viva (menos de 7 toques).
 *   2. Más atrasados primero — cada día de atraso pierde respuesta.
 *   3. A igual atraso, el que está más arriba del funil (1c antes que 1a):
 *      es plata más cerca de la mano.
 *   4. Desempate estable por id, para que la cola no baile entre renders.
 */
export function buildGoldenQueue(leads: readonly Lead[], today: Date | IsoDate = new Date()): Lead[] {
  const hoje = toBrDate(today)
  return leads
    .filter((l) => l.status === 'active' && !isCadenceExhausted(l))
    .map((l) => ({ lead: l, atraso: touchpointDelayDays(l, hoje) }))
    .filter((x) => x.atraso >= 0)
    .sort((a, b) => {
      if (b.atraso !== a.atraso) return b.atraso - a.atraso
      const etapa = leadStageIndex(b.lead.stage) - leadStageIndex(a.lead.stage)
      if (etapa !== 0) return etapa
      return a.lead.id - b.lead.id
    })
    .map((x) => x.lead)
}

/* ── Rascunhos y deep links ──────────────────────────────────────────────── */

/** Primer nombre del contacto, o un tratamiento neutro si no lo tenemos. */
function primeiroNome(lead: Pick<Lead, 'contact_name'>): string {
  const nome = (lead.contact_name ?? '').trim()
  if (nome === '') return 'Olá'
  return nome.split(/\s+/)[0] ?? nome
}

/**
 * Rascunho del mensaje para ese canal y ese toque, en PT-BR.
 * Es un punto de partida editable, nunca se manda solo: el vendedor lo abre en
 * WhatsApp/LinkedIn ya escrito y ajusta. Sin números inventados — la conta
 * concreta sale siempre del cliente.
 */
export function draftForStep(lead: Lead, step: CadenceStep): string {
  const nome = primeiroNome(lead)
  const empresa = lead.company_name

  switch (step.tp) {
    case 1:
      return `${nome}, tudo bem? Trabalho com a Ventapel — a gente resolve fechamento de caixas em operações como a da ${empresa}. Mandei o convite pra acompanhar seu trabalho por aqui.`
    case 2:
      return `${nome}, aqui é da Ventapel. A gente trabalha com fechamento de caixas com fita ativada por água: acaba com caixa violada em trânsito e reduz retrabalho de embalagem. Faz sentido 15 minutos essa semana pra eu entender como é hoje na ${empresa}?`
    case 3:
      return `${nome}, seguindo nosso contato: separei um caso de uma operação parecida com a da ${empresa}, com o antes e o depois de violação em trânsito e custo por caixa. Te mando? Se preferir, marco 15 minutos e te mostro na tela.`
    case 4:
      return `${nome}, cheguei a te mandar um material por e-mail — chegou aí? Se o tema não é prioridade agora, me diz que eu paro de insistir. Se for, me dá 15 minutos.`
    case 5:
      return `Ligação para ${nome} (${empresa}). Abertura: "estou ligando porque trabalhamos com operações do mesmo porte e o padrão que a gente vê é caixa aberta em trânsito e retrabalho na expedição — como está isso aí hoje?" Objetivo: agendar 15 minutos ou descartar com clareza.`
    case 6:
      return `${nome}, último e-mail meu sobre isso. Se fechamento de caixa e violação em trânsito não estão no radar da ${empresa} agora, sem problema — me avisa e eu retomo daqui uns meses. Se estiver, respondo hoje mesmo com uma agenda.`
    case 7:
      return `${nome}, vou encerrar meu contato por aqui pra não virar chateação. Deixo meu canal aberto: se o tema de embalagem e violação voltar pra pauta da ${empresa}, é só me chamar. Sucesso!`
    default:
      return `${nome}, retomando nosso contato sobre embalagem e fechamento de caixas na ${empresa}.`
  }
}

/**
 * Normaliza un teléfono BR a E.164 (+55DDDNNNNNNNN) para wa.me y tel:.
 * Acepta lo que la gente escribe de verdad: '(11) 98765-4321', '11987654321',
 * '+55 11 98765 4321', '0800…'. Devuelve null si no puede garantizar el número.
 */
export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = raw.replace(/\D/g, '')
  if (d === '') return null

  // Prefijo internacional escrito como 0055.
  if (d.startsWith('00')) d = d.slice(2)
  // Ya trae el 55 del país.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  // Cero de operadora antes del DDD.
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1)

  // 10 dígitos = fijo con DDD, 11 = móvil con DDD y el 9.
  if (d.length !== 10 && d.length !== 11) return null
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return null
  return `+55${d}`
}

/** Deep link accionable del canal (wa.me, tel:, mailto:, LinkedIn). */
export function channelDeepLink(
  channel: Channel,
  lead: Lead,
  message?: string,
): string | null {
  switch (channel) {
    case 'whatsapp': {
      const tel = normalizeBrPhone(lead.contact_whatsapp ?? lead.contact_phone)
      if (!tel) return null
      const base = `https://wa.me/${tel.replace('+', '')}`
      return message ? `${base}?text=${encodeURIComponent(message)}` : base
    }
    case 'phone': {
      const tel = normalizeBrPhone(lead.contact_phone ?? lead.contact_whatsapp)
      return tel ? `tel:${tel}` : null
    }
    case 'email': {
      const mail = (lead.contact_email ?? '').trim()
      if (mail === '') return null
      const assunto = encodeURIComponent(`Ventapel · ${lead.company_name}`)
      const corpo = message ? `&body=${encodeURIComponent(message)}` : ''
      return `mailto:${mail}?subject=${assunto}${corpo}`
    }
    case 'linkedin': {
      const li = (lead.contact_linkedin ?? '').trim()
      if (li === '') return null
      if (li.startsWith('http://') || li.startsWith('https://')) return li
      return `https://www.linkedin.com/in/${li.replace(/^\/+|\/+$/g, '')}`
    }
    default:
      return null
  }
}

/** true si el lead tiene por dónde ejecutar ese canal. */
export function canalDisponivel(lead: Lead, channel: Channel): boolean {
  return channelDeepLink(channel, lead) !== null
}

/**
 * Canal realmente ejecutable para el toque que toca: si el paso pide LinkedIn
 * y no tenemos perfil, cae al primer canal disponible en vez de dejar al
 * vendedor mirando un botón muerto.
 */
export function canalExecutavel(lead: Lead, step: CadenceStep): Channel | null {
  if (canalDisponivel(lead, step.channel)) return step.channel
  const ordem: readonly Channel[] = ['whatsapp', 'phone', 'email', 'linkedin']
  return ordem.find((c) => canalDisponivel(lead, c)) ?? null
}
