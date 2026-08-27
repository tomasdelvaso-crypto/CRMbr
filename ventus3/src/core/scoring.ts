// src/core/scoring.ts
// Economia de Pontos de Avanço, os três anéis diários, a racha de Golden Hour
// e os troféus semanais.
//
// PRINCÍPIO RECTOR (PLANO.md § Gamificação): uma moeda só, gerada por MUDANÇA
// DE ESTADO DO NEGÓCIO, nunca por volume de registros. E as regras vivem em
// DADOS — REGRAS_PADRAO — nunca em ifs aninhados: elas são versionadas,
// editáveis por admin e jamais retroativas. Se para mudar um peso houver que
// tocar código, a regra "nunca modificada no meio de uma temporada" não se
// pode cumprir.
//
// Nada aqui premia o resultado que o vendedor não controla, e nada aqui
// mostra ninguém como último.

import type {
  Activity,
  Commitment,
  DailyScore,
  IsoDate,
  RingKey,
  RingProgress,
  ScoringEvent,
  ScoringEventKind,
  Touchpoint,
  TouchpointResult,
  TrophyKey,
} from './types.js'
import { addDays, daysBetween, ehDiaUtil, todayBr } from './dates.js'
import { ACTIVITY_TYPE_CONFIG, RESULT_CONFIG } from './methodology.js'

/* ══════════════════════════════════════════════════════════════════════════
   1 · REGRAS_PADRAO — a tabela de PA
   ══════════════════════════════════════════════════════════════════════════ */

export interface RegraPA {
  kind: ScoringEventKind
  /** Rótulo PT-BR que aparece no detalhe tocável de cada ponto. */
  rotulo: string
  /** PA base do evento. */
  pa: number
  /** Para eventos de faixa (sinal do comprador), o máximo alcançável. */
  paMax?: number
  /** Exige artefato para acreditar (regra da prova). */
  exigeProva: boolean
  /** Teto de PA por dia deste tipo. null = sem teto. */
  tetoDiario: number | null
  /**
   * Mensagem que aparece quando o teto foi atingido. Nunca é uma bronca:
   * redireciona para o que ainda soma.
   */
  msgTeto?: string
}

/**
 * A tabela do PLANO, verbatim. Ordem: primeiro o que só o cliente pode
 * produzir, no fim o que o vendedor fabrica sozinho.
 *
 * Leitura da coluna teto: o volume é trivial de fabricar (por isso tem teto
 * baixo), a conversa real e o avanço com prova não são (por isso não têm).
 */
export const REGRAS_PADRAO: readonly RegraPA[] = [
  {
    kind: 'etapa_avancada',
    rotulo: 'Etapa avançada com gate cumprido',
    pa: 60,
    exigeProva: true,
    tetoDiario: null,
  },
  {
    kind: 'sinal_comprador',
    rotulo: 'Sinal do comprador',
    pa: 15,
    paMax: 50,
    exigeProva: true,
    tetoDiario: null,
  },
  {
    kind: 'reuniao_realizada',
    rotulo: 'Reunião realizada',
    pa: 40,
    exigeProva: true,
    tetoDiario: null,
  },
  {
    kind: 'commitment_cumprido',
    rotulo: 'Compromisso cumprido',
    pa: 25,
    exigeProva: true,
    tetoDiario: null,
  },
  {
    kind: 'escala_delta',
    rotulo: 'Δ de escala PPVVCC',
    pa: 10,
    exigeProva: true, // só acima do nível 5 — ver exigeProvaPara()
    tetoDiario: null,
  },
  {
    kind: 'reuniao_agendada',
    rotulo: 'Reunião agendada (provisório)',
    pa: 10,
    exigeProva: false,
    tetoDiario: null,
  },
  {
    kind: 'lead_novo',
    rotulo: 'Lead novo com contato nomeado',
    pa: 8,
    exigeProva: false,
    tetoDiario: 40,
    msgTeto: 'já no máximo de leads novos hoje — o que soma agora é conversa e avanço',
  },
  {
    kind: 'sweep_para_lead',
    rotulo: 'Empresa do mapa virou lead',
    pa: 5,
    exigeProva: false,
    tetoDiario: 25,
    msgTeto: 'já no máximo do mapa de mercado hoje — pegue o telefone',
  },
  {
    kind: 'touchpoint',
    rotulo: 'Touchpoint de cadência',
    pa: 3,
    exigeProva: false,
    tetoDiario: 45,
    msgTeto: 'já no máximo de contatos hoje — o que soma agora é conversa e avanço',
  },
  {
    kind: 'nota_sem_resultado',
    rotulo: 'Nota / ligação sem resultado',
    pa: 1,
    exigeProva: false,
    tetoDiario: 20,
    msgTeto: 'já no máximo de registros hoje — o que soma agora é conversa e avanço',
  },
] as const

const REGRA_POR_KIND = new Map(REGRAS_PADRAO.map((r) => [r.kind, r]))

/** A regra vigente para um tipo de evento. */
export function regraDe(kind: ScoringEventKind): RegraPA | undefined {
  return REGRA_POR_KIND.get(kind)
}

/** Todo evento acima deste valor exige artefato (defesa (a) do PLANO). */
export const PA_LIMIAR_DE_PROVA = 20

/** Acima deste nível, mexer numa escala exige citação textual. */
export const NIVEL_QUE_EXIGE_PROVA = 5

/**
 * Faixa 15-50 do sinal do comprador. É a única moeda que o vendedor NÃO pode
 * fabricar sozinho, e por isso a única que habilita subir dor, poder, valor e
 * compras. Traduz o PPVVCC para a economia: o placar deixa de ser solitário.
 */
export const SINAIS_DO_COMPRADOR = [
  { codigo: 'respondeu', rotulo: 'Respondeu um contato ativo', pa: 15 },
  { codigo: 'pediu_material', rotulo: 'Pediu material ou proposta', pa: 20 },
  { codigo: 'pediu_amostra', rotulo: 'Pediu amostra ou teste', pa: 30 },
  { codigo: 'mandou_specs', rotulo: 'Mandou specs, volumes ou desenho da caixa', pa: 35 },
  { codigo: 'apresentou_pessoa', rotulo: 'Apresentou outra pessoa da empresa', pa: 40 },
  { codigo: 'foi_a_compras', rotulo: 'Levou o assunto para compras', pa: 50 },
] as const

export type SinalDoComprador = (typeof SINAIS_DO_COMPRADOR)[number]['codigo']

const PA_POR_SINAL = new Map(SINAIS_DO_COMPRADOR.map((s) => [s.codigo, s]))

/* — Compat: derivações da tabela, para quem só precisa do número — */

export type PaEvent = ScoringEventKind

/** PA base por tipo, derivado de REGRAS_PADRAO (nunca duplicar números). */
export const PA_VALUES: Readonly<Record<PaEvent, number>> = Object.freeze(
  Object.fromEntries(REGRAS_PADRAO.map((r) => [r.kind, r.pa])) as Record<PaEvent, number>,
)

/** Teto diário por tipo. Infinity quando a regra não tem teto. */
export const PA_DAILY_CAPS: Readonly<Record<PaEvent, number>> = Object.freeze(
  Object.fromEntries(
    REGRAS_PADRAO.map((r) => [r.kind, r.tetoDiario ?? Number.POSITIVE_INFINITY]),
  ) as Record<PaEvent, number>,
)

/* ══════════════════════════════════════════════════════════════════════════
   2 · calcularPA — o cálculo de um evento contra o contexto do dia
   ══════════════════════════════════════════════════════════════════════════ */

/** O que já aconteceu hoje. Puro dado: quem chama é quem acumula. */
export interface ContextoDoDia {
  date: IsoDate
  /** PA já creditados hoje, por tipo de evento. */
  paPorTipo: Readonly<Partial<Record<ScoringEventKind, number>>>
}

export interface ResultadoPA {
  /** PA que este evento credita de verdade, já com teto aplicado. */
  pa: number
  /** PA que teria creditado sem teto nem pendência de prova. */
  paBruto: number
  /** Por que deu esse número. Vai no detalhe tocável de cada ponto. */
  motivo: string
  /** true se o teto diário comeu parte ou todo o valor. */
  capped: boolean
  /** true se falta artefato: fica pending_evidence e não credita ainda. */
  pendenteDeProva: boolean
  regra: RegraPA | null
}

/** Contexto vazio de um dia que ainda não começou. */
export function contextoVazio(date: IsoDate = todayBr()): ContextoDoDia {
  return { date, paPorTipo: {} }
}

/** Este evento exige artefato? Combina a regra com o limiar de 20 PA. */
export function exigeProvaPara(evento: ScoringEvent, paBruto: number): boolean {
  const regra = regraDe(evento.kind)
  if (!regra) return false
  // Δ de escala: só exige prova quando o nível resultante passa de 5.
  if (evento.kind === 'escala_delta') {
    return (evento.magnitude ?? 0) > NIVEL_QUE_EXIGE_PROVA
  }
  return regra.exigeProva || paBruto > PA_LIMIAR_DE_PROVA
}

/** PA bruto de um evento, antes de teto e de prova. */
function paBrutoDe(evento: ScoringEvent, regra: RegraPA): number {
  if (evento.kind === 'sinal_comprador') {
    // magnitude carrega o PA já resolvido pelo botão "O cliente fez algo";
    // se vier fora da faixa, clampeamos em vez de confiar.
    const bruto = evento.magnitude ?? regra.pa
    return Math.max(regra.pa, Math.min(regra.paMax ?? regra.pa, Math.round(bruto)))
  }
  if (evento.kind === 'escala_delta') {
    // Corrigir é avançar: |Δ|. Baixar uma escala com evidência vale o mesmo
    // que subi-la. Sem isso ninguém corrige nunca e o pipeline se infla só.
    const delta = Math.abs(evento.magnitude ?? 1)
    return regra.pa * Math.max(1, Math.round(delta))
  }
  return regra.pa
}

/**
 * Quanto vale este evento HOJE.
 *
 * Aplica, nesta ordem:
 *   1. o PA base da regra (ou a faixa, para sinal do comprador),
 *   2. a regra da prova — sem artefato fica pendente e credita 0,
 *   3. o teto diário com rendimentos decrescentes — passado o teto o evento
 *      REGISTRA-SE igual mas vale 0, com mensagem explícita.
 *
 * Nunca devolve negativo e nunca lança: um evento sujo vale 0 e diz por quê.
 */
export function calcularPA(evento: ScoringEvent, contextoDoDia: ContextoDoDia): ResultadoPA {
  const regra = regraDe(evento.kind)
  if (!regra) {
    return {
      pa: 0,
      paBruto: 0,
      motivo: 'Evento sem regra vigente — não pontua.',
      capped: false,
      pendenteDeProva: false,
      regra: null,
    }
  }

  const paBruto = paBrutoDe(evento, regra)

  if (exigeProvaPara(evento, paBruto) && !(evento.provado ?? Boolean(evento.evidenceId))) {
    return {
      pa: 0,
      paBruto,
      motivo: `${regra.rotulo}: ${paBruto} PA aguardando evidência. Anexe o áudio, o nome com cargo ou a data combinada e o ponto entra.`,
      capped: false,
      pendenteDeProva: true,
      regra,
    }
  }

  if (regra.tetoDiario === null) {
    return {
      pa: paBruto,
      paBruto,
      motivo: `${regra.rotulo}: ${paBruto} PA.`,
      capped: false,
      pendenteDeProva: false,
      regra,
    }
  }

  const jaHoje = contextoDoDia.paPorTipo[evento.kind] ?? 0
  const espaco = Math.max(0, regra.tetoDiario - jaHoje)
  const creditado = Math.min(paBruto, espaco)
  const capped = creditado < paBruto

  const motivo = capped
    ? creditado === 0
      ? `${regra.rotulo}: registrado, 0 PA — ${regra.msgTeto ?? `teto diário de ${regra.tetoDiario} PA atingido`}.`
      : `${regra.rotulo}: ${creditado} de ${paBruto} PA — ${regra.msgTeto ?? `teto diário de ${regra.tetoDiario} PA`}.`
    : `${regra.rotulo}: ${creditado} PA.`

  return { pa: creditado, paBruto, motivo, capped, pendenteDeProva: false, regra }
}

/** Fold puro de um dia inteiro de eventos, respeitando os tetos em ordem. */
export function calcularPADoDia(
  eventos: readonly ScoringEvent[],
  date: IsoDate = todayBr(),
): { total: number; detalhes: ResultadoPA[]; pendentes: number } {
  const paPorTipo: Partial<Record<ScoringEventKind, number>> = {}
  const detalhes: ResultadoPA[] = []
  let total = 0
  let pendentes = 0

  for (const ev of eventos) {
    const r = calcularPA(ev, { date, paPorTipo })
    detalhes.push(r)
    if (r.pendenteDeProva) pendentes += 1
    if (r.pa > 0) {
      paPorTipo[ev.kind] = (paPorTipo[ev.kind] ?? 0) + r.pa
      total += r.pa
    }
  }
  return { total, detalhes, pendentes }
}

/** PA de um sinal do comprador pelo código do botão. */
export function paDoSinal(codigo: SinalDoComprador): number {
  return PA_POR_SINAL.get(codigo)?.pa ?? 15
}

/**
 * Clawback diferido: uma reunião que virou no-show, ou uma etapa que
 * retrocedeu sem evento externo, devolve os PA como "ajuste". Sem castigo
 * social, sem saldo negativo, sem menção no canal.
 */
export function applyClawback(points: number, revokedEvents: readonly PaEvent[]): number {
  const devolver = revokedEvents.reduce((s, k) => s + (PA_VALUES[k] ?? 0), 0)
  return Math.max(0, points - devolver)
}

/** Compat simples: PA de uma lista de tipos, com tetos. */
export function dailyPoints(events: readonly PaEvent[]): number {
  const eventos: ScoringEvent[] = events.map((kind, i) => ({
    id: `sint-${i}`,
    vendor: '',
    kind,
    date: todayBr(),
    target: null,
    provado: true,
  }))
  return calcularPADoDia(eventos).total
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Os três anéis diários e a rampa
   ══════════════════════════════════════════════════════════════════════════ */

export const RING_LABELS: Readonly<Record<RingKey, string>> = {
  contato: 'Contato',
  conversa: 'Conversa',
  avanco: 'Avanço',
}

export const RING_HINTS: Readonly<Record<RingKey, string>> = {
  contato: 'Toques executados',
  conversa: 'Interações em que o cliente respondeu',
  avanco: 'Escala movida com evidência ou reunião realizada',
}

/**
 * Largada dotada: o anel de Contato começa em 2/12, dados por confirmar a
 * agenda e revisar as 3 prioridades. A meta apresenta-se como 12, não como
 * 10, para o presente ser real — e as duas ações "de graça" são justamente as
 * que queremos que virem hábito.
 */
export const CONTATOS_DE_LARGADA = 2

export interface MetasDosAneis {
  contato: number
  conversa: number
  avanco: number
}

/** Metas por defeito quando o vendedor ainda não negociou o cookbook. */
export const DEFAULT_RING_GOALS: Readonly<MetasDosAneis> = { contato: 12, conversa: 3, avanco: 1 }

/**
 * A rampa 4 → 8 → 12, calibrada contra o baseline real (12 touchpoints por
 * semana para TODO o time, mediana de 17 semanas).
 *
 * 4/dia já são 80 toques/semana do time: 6,6× o baseline. Pôr 12/dia na
 * semana 1 seria 20× e o time lê isso como ficção. A rampa comunica-se de
 * entrada para sentir-se progresso, não vara que sobe.
 *
 * Fronteiras: semanas 1-2 é o piso; "Mês 2" começa na semana 3 e vai até a 8;
 * "Mês 3+" da semana 9 em diante.
 */
export function metasDaRampa(semanaDesdeInicio: number): MetasDosAneis {
  const s = Math.max(1, Math.floor(semanaDesdeInicio));
  if (s <= 2) return { contato: 4, conversa: 1, avanco: 1 }
  if (s <= 8) return { contato: 8, conversa: 2, avanco: 1 }
  return { contato: 12, conversa: 3, avanco: 1 }
}

/**
 * Cookbook negociado: o vendedor ajusta ±30% sobre a proposta do sistema.
 * Fora disso não é meta negociada, é outra coisa — e o clamp é o que impede
 * que a autonomia vire vigilância ou piada.
 */
export function clampMetaNegociada(proposta: number, escolhida: number): number {
  const min = Math.max(1, Math.floor(proposta * 0.7))
  const max = Math.ceil(proposta * 1.3)
  return Math.min(max, Math.max(min, Math.round(escolhida)))
}

/** Uma atividade conta para o anel Contato? */
function ehContato(a: Activity): boolean {
  return ACTIVITY_TYPE_CONFIG[a.activity_type]?.selectable === true && a.activity_type !== 'note'
}

/** Uma atividade conta como conversa real (bidirecional)? */
function ehConversa(a: Activity): boolean {
  const cfg = ACTIVITY_TYPE_CONFIG[a.activity_type]
  if (!cfg) return false
  if (cfg.bidirectional) return true
  // Um e-mail ou WhatsApp com resultado positivo/negativo teve resposta:
  // o resultado só existe porque alguém do outro lado disse algo.
  return a.result === 'positivo' || a.result === 'negativo'
}

/** Uma atividade conta como avanço real? */
function ehAvanco(a: Activity): boolean {
  if (a.activity_type === 'meeting' || a.activity_type === 'demo' || a.activity_type === 'test') {
    return a.result === 'positivo' || a.result === 'neutro'
  }
  if (a.activity_type === 'stage_change') return true
  // Um registro com escalas sugeridas e aceitas moveu a metodologia.
  return a.ai_suggested_scales !== null && a.result === 'positivo'
}

function progresso(key: RingKey, current: number, goal: number): RingProgress {
  const meta = Math.max(1, goal)
  return { key, current, goal: meta, ratio: Math.min(1, current / meta) }
}

/**
 * Os três anéis do dia. Codificam o funil inteiro e tornam visível na hora o
 * padrão perigoso: muito anel 1 e zero anel 3 = alguém ocupado sem vender.
 */
export function anelDoDia(
  atividades: readonly Activity[],
  metas: MetasDosAneis = DEFAULT_RING_GOALS,
  touchpoints: readonly Touchpoint[] = [],
): Record<RingKey, RingProgress> & { fechado: boolean } {
  let contato = CONTATOS_DE_LARGADA
  let conversa = 0
  let avanco = 0

  for (const a of atividades) {
    if (ehContato(a)) contato += 1
    if (ehConversa(a)) conversa += 1
    if (ehAvanco(a)) avanco += 1
  }
  for (const tp of touchpoints) {
    contato += 1
    if (RESULT_CONFIG[tp.result]?.respondeu) conversa += 1
    if (tp.result === 'meeting_scheduled') avanco += 1
  }

  const aneis = {
    contato: progresso('contato', contato, metas.contato),
    conversa: progresso('conversa', conversa, metas.conversa),
    avanco: progresso('avanco', avanco, metas.avanco),
  }
  const fechado = aneis.contato.ratio >= 1 && aneis.conversa.ratio >= 1 && aneis.avanco.ratio >= 1
  return { ...aneis, fechado }
}

/** Compat com a firma inglesa. */
export function computeRings(
  activities: readonly Activity[],
  touchpoints: readonly Touchpoint[],
  goals: MetasDosAneis = DEFAULT_RING_GOALS,
): Record<RingKey, RingProgress> {
  const r = anelDoDia(activities, goals, touchpoints)
  return { contato: r.contato, conversa: r.conversa, avanco: r.avanco }
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · A racha — de Golden Hour, não de login
   ══════════════════════════════════════════════════════════════════════════ */

/** Escudos que protegem a racha sem regalá-la. Dois é o ponto ótimo. */
export const MAX_SHIELDS = 2

/** Hitos da racha, em dias úteis. */
export const MARCOS_DE_SEQUENCIA = [5, 10, 21, 50, 100] as const

export interface EstadoSequencia {
  /** Dias úteis consecutivos com Hora Cheia. */
  dias: number
  /** O número que a UI mostra. NUNCA 0 quando houve racha antes. */
  exibicao: number
  escudosRestantes: number
  /** Dias cobertos por escudo, do mais recente ao mais antigo. */
  diasCobertos: IsoDate[]
  /** Copo de neve do dia seguinte: "Terça foi coberta pelo seu escudo." */
  avisoDeEscudo: string | null
  /** Resgate disponível: uma Hora Cheia + um avanço restauram anterior − 1. */
  resgate: { disponivel: boolean; ate: string; restauraPara: number } | null
  /** Próximo marco (5, 10, 21, 50, 100) e quanto falta. */
  proximoMarco: { marco: number; faltam: number } | null
  texto: string
}

/** Dia útil anterior a uma data. */
function diaUtilAnterior(iso: IsoDate): IsoDate {
  let cur = addDays(iso, -1)
  for (let i = 0; i < 15 && !ehDiaUtil(cur); i += 1) cur = addDays(cur, -1)
  return cur
}

/**
 * Estado da racha de Golden Hour.
 *
 * Conta DIAS ÚTEIS com Hora Cheia selada (ver avaliarHoraCheia). Abrir a app,
 * escrever notas ou "estar online" não conta absolutamente nada.
 *
 * Regras que a fazem sobreviver ao mundo real:
 *  - Calendário útil: fins de semana e feriados nacionais e de SP não quebram
 *    nada. Castigar alguém por não prospectar no 12 de outubro destrói a
 *    credibilidade do sistema inteiro.
 *  - Escudos: consomem-se EM SILÊNCIO; o aviso aparece só no dia seguinte.
 *  - Nunca falhar duas vezes: se quebrou sem escudo, a app JAMAIS mostra 0.
 *    Mostra "Resgate disponível até amanhã 18h" e restaura para anterior − 1.
 *  - Hoje nunca quebra a racha: o dia ainda está aberto.
 *
 * @param historico dias úteis com Hora Cheia selada (YYYY-MM-DD, qualquer ordem)
 * @param escudos   escudos ganhos disponíveis (máx. MAX_SHIELDS)
 * @param hoje      data civil BRT de referência
 */
export function estadoDaSequencia(
  historico: readonly IsoDate[],
  escudos: number,
  hoje: IsoDate = todayBr(),
  resgatesNoMes = 0,
): EstadoSequencia {
  const selados = new Set(historico)
  let escudosRestantes = Math.max(0, Math.min(MAX_SHIELDS, Math.floor(escudos)))
  const diasCobertos: IsoDate[] = []

  // Hoje só soma se já está selado. Se não, o dia ainda está aberto: não
  // quebra nada, apenas não conta. De qualquer forma a caminhada para trás
  // arranca no dia útil anterior (diaUtilAnterior já pula fim de semana e
  // feriado, então serve igual se hoje for sábado).
  let dias = 0
  if (ehDiaUtil(hoje) && selados.has(hoje)) dias += 1
  let cursor = diaUtilAnterior(hoje)

  let quebrouEm: IsoDate | null = null
  // Cota dura de 400 dias úteis: mais que isso é histórico, não racha viva.
  for (let i = 0; i < 400; i += 1) {
    if (!ehDiaUtil(cursor)) {
      cursor = diaUtilAnterior(cursor)
      continue
    }
    if (selados.has(cursor)) {
      dias += 1
      cursor = diaUtilAnterior(cursor)
      continue
    }
    if (escudosRestantes > 0) {
      escudosRestantes -= 1
      diasCobertos.push(cursor)
      cursor = diaUtilAnterior(cursor)
      continue
    }
    quebrouEm = cursor
    break
  }

  // Aviso do copo de neve: só do dia coberto imediatamente anterior a hoje.
  const ontemUtil = diaUtilAnterior(hoje)
  const cobertoOntem = diasCobertos.includes(ontemUtil)
  const avisoDeEscudo = cobertoOntem
    ? `${nomeCurtoDoDia(ontemUtil)} foi coberta pelo seu escudo. Resta${escudosRestantes === 1 ? '' : 'm'} ${escudosRestantes}.`
    : null

  // Resgate: só quando a quebra é fresca (o dia útil anterior), ainda não se
  // usou o resgate do mês E havia mesmo uma racha para resgatar. Oferecer
  // resgate a quem nunca teve sequência seria inventar uma perda que não
  // existiu — exatamente a linguagem de fracasso que o PLANO proíbe.
  const quebraFresca = quebrouEm !== null && quebrouEm === ontemUtil
  const valorAnterior = dias > 0 ? dias : rachaAntesDaQuebra(selados, quebrouEm)
  const podeResgatar = quebraFresca && resgatesNoMes < 1 && valorAnterior > 0
  const resgate = podeResgatar
    ? {
        disponivel: true,
        ate: 'amanhã 18h',
        restauraPara: Math.max(1, valorAnterior - 1),
      }
    : null

  // Nunca mostrar 0: se há resgate na mesa, mostramos o que vai voltar.
  const exibicao = dias > 0 ? dias : resgate ? resgate.restauraPara : 0

  const proximo = MARCOS_DE_SEQUENCIA.find((m) => m > dias)
  const proximoMarco = proximo !== undefined ? { marco: proximo, faltam: proximo - dias } : null

  const texto = resgate
    ? `Resgate disponível até ${resgate.ate}: uma Hora Cheia e um avanço real trazem a sequência de volta para ${resgate.restauraPara}.`
    : dias === 0
      ? 'Sua sequência começa na próxima Hora Cheia.'
      : `${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} de Hora Cheia.`

  return {
    dias,
    exibicao,
    escudosRestantes,
    diasCobertos,
    avisoDeEscudo,
    resgate,
    proximoMarco,
    texto,
  }
}

/** Quantos dias úteis selados seguidos havia ANTES do dia que quebrou. */
function rachaAntesDaQuebra(selados: ReadonlySet<IsoDate>, quebrouEm: IsoDate | null): number {
  if (!quebrouEm) return 0
  let n = 0
  let cursor = diaUtilAnterior(quebrouEm)
  for (let i = 0; i < 400; i += 1) {
    if (!ehDiaUtil(cursor)) {
      cursor = diaUtilAnterior(cursor)
      continue
    }
    if (!selados.has(cursor)) break
    n += 1
    cursor = diaUtilAnterior(cursor)
  }
  return n
}

const DIAS_CURTOS_SEQ = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function nomeCurtoDoDia(iso: IsoDate): string {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay()
  const nome = DIAS_CURTOS_SEQ[d] ?? 'O dia'
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/** Compat com a firma inglesa. */
export function computeStreak(
  sealedDays: readonly IsoDate[],
  today: IsoDate,
  shields = 0,
): number {
  return estadoDaSequencia(sealedDays, shields, today).dias
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Hora Cheia
   ══════════════════════════════════════════════════════════════════════════ */

/** Duração mínima de uma Hora Cheia. Menos que isso é um intervalo. */
export const HORA_CHEIA_MIN_MINUTOS = 40

export interface SessaoGoldenHour {
  date: IsoDate
  /** Minutos efetivos em modo foco. */
  duracaoMin: number
  /** Toques executados durante o bloco. */
  toques: number
  /** Meta de toques combinada para o dia. */
  metaToques: number
  /** Resultados dos toques do bloco — daqui sai a conversa real. */
  resultados?: readonly TouchpointResult[]
  /** Conversas reais, se já vierem contadas. */
  conversasReais?: number
  /** Debrief de 60s respondido. */
  debriefFeito: boolean
}

export interface CriterioHoraCheia {
  chave: 'duracao' | 'toques' | 'conversa' | 'debrief'
  rotulo: string
  ok: boolean
  detalhe: string
}

export interface AvaliacaoHoraCheia {
  /** Sela o dia e alimenta a racha. */
  cheia: boolean
  criterios: CriterioHoraCheia[]
  /** Rótulos do que falta, para o HUD do modo foco. */
  faltando: string[]
  /** PA da hora, quando fechada. */
  pa: number
  texto: string
}

/**
 * A Hora Cheia exige as QUATRO coisas: ≥40 min em foco, a meta de toques,
 * pelo menos 1 conversa real e o debrief.
 *
 * Discar números mortos não ganha racha — é o critério da conversa real que
 * impede que a mecânica premie atividade vazia. E sem debrief a hora é só
 * atividade; com debrief é a única fonte sistemática de inteligência de
 * mercado que a Ventapel vai ter.
 */
export function avaliarHoraCheia(sessao: SessaoGoldenHour): AvaliacaoHoraCheia {
  const conversas =
    sessao.conversasReais ??
    (sessao.resultados ?? []).filter((r) => RESULT_CONFIG[r]?.respondeu).length

  const criterios: CriterioHoraCheia[] = [
    {
      chave: 'duracao',
      rotulo: 'Bloco de 40 minutos',
      ok: sessao.duracaoMin >= HORA_CHEIA_MIN_MINUTOS,
      detalhe: `${Math.round(sessao.duracaoMin)} de ${HORA_CHEIA_MIN_MINUTOS} min`,
    },
    {
      chave: 'toques',
      rotulo: 'Meta de toques',
      ok: sessao.toques >= sessao.metaToques,
      detalhe: `${sessao.toques} de ${sessao.metaToques}`,
    },
    {
      chave: 'conversa',
      rotulo: 'Pelo menos 1 conversa real',
      ok: conversas >= 1,
      detalhe: conversas === 0 ? 'ninguém respondeu ainda' : `${conversas} conversa(s)`,
    },
    {
      chave: 'debrief',
      rotulo: 'Debrief de 60 segundos',
      ok: sessao.debriefFeito,
      detalhe: sessao.debriefFeito ? 'feito' : 'pendente',
    },
  ]

  const faltando = criterios.filter((c) => !c.ok).map((c) => c.rotulo)
  const cheia = faltando.length === 0

  return {
    cheia,
    criterios,
    faltando,
    pa: cheia ? 12 : 0,
    texto: cheia
      ? 'Hora Cheia selada. A sequência segue.'
      : `Falta ${faltando.length === 1 ? '' : 'm'}: ${faltando.join(', ').toLowerCase()}.`,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Resumo diário e troféus
   ══════════════════════════════════════════════════════════════════════════ */

export const TROPHY_LABELS: Readonly<Record<TrophyKey, string>> = {
  motor: 'Motor',
  escalador: 'Escalador',
  conversador: 'Conversador',
  zelador: 'Zelador',
  reanimador: 'Reanimador',
}

export const TROPHY_HINTS: Readonly<Record<TrophyKey, string>> = {
  motor: 'Mais Pontos de Avanço da semana',
  escalador: 'Maior Δ PPVVCC com evidência',
  conversador: 'Melhor razão conversas por toque',
  zelador: 'Zero compromissos vencidos e campos em dia',
  reanimador: 'Mais contas dormidas reativadas com resposta',
}

/** Resumo diário completo do vendedor. */
export function computeDailyScore(
  vendor: string,
  date: IsoDate,
  activities: readonly Activity[],
  touchpoints: readonly Touchpoint[],
  commitments: readonly Commitment[],
  opcoes: {
    metas?: MetasDosAneis
    eventos?: readonly ScoringEvent[]
    historicoHoraCheia?: readonly IsoDate[]
    escudos?: number
  } = {},
): DailyScore {
  const metas = opcoes.metas ?? DEFAULT_RING_GOALS
  const aneis = anelDoDia(activities, metas, touchpoints)

  const eventos: ScoringEvent[] =
    opcoes.eventos !== undefined ? [...opcoes.eventos] : derivarEventos(vendor, date, activities, touchpoints, commitments)

  const { total } = calcularPADoDia(eventos, date)
  const seq = estadoDaSequencia(opcoes.historicoHoraCheia ?? [], opcoes.escudos ?? 0, date)

  return {
    vendor,
    date,
    rings: { contato: aneis.contato, conversa: aneis.conversa, avanco: aneis.avanco },
    points: total,
    streak: seq.dias,
    shields: seq.escudosRestantes,
  }
}

/**
 * Deriva eventos pontuáveis do que já está registrado. Es la ruta por defecto
 * cuando todavía no existe la tabla de eventos: nunca inventa pruebas, así que
 * todo lo que exige artefato queda pendiente y no acredita.
 */
export function derivarEventos(
  vendor: string,
  date: IsoDate,
  activities: readonly Activity[],
  touchpoints: readonly Touchpoint[],
  commitments: readonly Commitment[],
): ScoringEvent[] {
  const out: ScoringEvent[] = []
  let n = 0
  const novo = (kind: ScoringEventKind, extra: Partial<ScoringEvent> = {}): ScoringEvent => ({
    id: `${date}-${vendor}-${kind}-${n++}`,
    vendor,
    kind,
    date,
    target: null,
    ...extra,
  })

  for (let i = 0; i < touchpoints.length; i += 1) out.push(novo('touchpoint', { provado: true }))
  for (const a of activities) {
    if (a.activity_type === 'meeting' && a.result === 'positivo') {
      out.push(novo('reuniao_realizada', { provado: Boolean(a.description?.trim()) }))
    } else if (a.activity_type === 'stage_change') {
      out.push(novo('etapa_avancada', { provado: Boolean(a.description?.trim()) }))
    } else {
      out.push(novo('nota_sem_resultado', { provado: true }))
    }
  }
  for (const c of commitments) {
    if (c.status === 'done') {
      out.push(novo('commitment_cumprido', { provado: (c.evidence_activity_ids ?? []).length > 0 }))
    }
  }
  return out
}

/**
 * Os 5 troféus da semana. Ninguém ganha dois; atribui-se o melhor disponível.
 * Com 4 pessoas e 5 títulos, todos ganham algo quase sempre — e o placar
 * nunca produz um último público.
 */
export function weeklyTrophies(
  scoresByVendor: Readonly<Record<string, readonly DailyScore[]>>,
): Array<{ trophy: TrophyKey; vendor: string; detail: string }> {
  const vendors = Object.keys(scoresByVendor)
  if (vendors.length === 0) return []

  const agregado = new Map<string, { pa: number; contato: number; conversa: number; avanco: number }>()
  for (const v of vendors) {
    const dias = scoresByVendor[v] ?? []
    agregado.set(v, {
      pa: dias.reduce((s, d) => s + d.points, 0),
      contato: dias.reduce((s, d) => s + d.rings.contato.current, 0),
      conversa: dias.reduce((s, d) => s + d.rings.conversa.current, 0),
      avanco: dias.reduce((s, d) => s + d.rings.avanco.current, 0),
    })
  }

  const criterios: Array<{ trophy: TrophyKey; valor: (v: string) => number; detalhe: (v: string) => string }> = [
    { trophy: 'motor', valor: (v) => agregado.get(v)?.pa ?? 0, detalhe: (v) => `${agregado.get(v)?.pa ?? 0} PA na semana` },
    { trophy: 'escalador', valor: (v) => agregado.get(v)?.avanco ?? 0, detalhe: (v) => `${agregado.get(v)?.avanco ?? 0} avanços com evidência` },
    {
      trophy: 'conversador',
      valor: (v) => {
        const a = agregado.get(v)
        if (!a || a.contato === 0) return 0
        return a.conversa / a.contato
      },
      detalhe: (v) => {
        const a = agregado.get(v)
        const r = a && a.contato > 0 ? Math.round((a.conversa / a.contato) * 100) : 0
        return `${r}% dos toques viraram conversa`
      },
    },
    { trophy: 'zelador', valor: (v) => agregado.get(v)?.conversa ?? 0, detalhe: (v) => `${agregado.get(v)?.conversa ?? 0} conversas registradas em dia` },
    { trophy: 'reanimador', valor: (v) => agregado.get(v)?.contato ?? 0, detalhe: (v) => `${agregado.get(v)?.contato ?? 0} contatos executados` },
  ]

  const jaGanhou = new Set<string>()
  const out: Array<{ trophy: TrophyKey; vendor: string; detail: string }> = []

  for (const c of criterios) {
    const candidatos = vendors.filter((v) => !jaGanhou.has(v) && c.valor(v) > 0)
    if (candidatos.length === 0) continue
    const ganhador = candidatos.reduce((melhor, v) => (c.valor(v) > c.valor(melhor) ? v : melhor), candidatos[0] as string)
    jaGanhou.add(ganhador)
    out.push({ trophy: c.trophy, vendor: ganhador, detail: c.detalhe(ganhador) })
  }
  return out
}

/**
 * «Eu vs eu»: esta semana contra a média das 4 anteriores.
 * É a única comparação que o produto faz sem pedir permissão — comparar-se
 * com outra pessoa exige que a outra pessoa aceite.
 */
export function selfComparison(
  current: readonly DailyScore[],
  previousWeeks: readonly (readonly DailyScore[])[],
): Record<RingKey, { current: number; average: number; delta: number }> {
  const soma = (dias: readonly DailyScore[], k: RingKey): number =>
    dias.reduce((s, d) => s + d.rings[k].current, 0)

  const out = {} as Record<RingKey, { current: number; average: number; delta: number }>
  for (const k of ['contato', 'conversa', 'avanco'] as const) {
    const atual = soma(current, k)
    const medias = previousWeeks.map((w) => soma(w, k))
    const media = medias.length === 0 ? 0 : medias.reduce((a, b) => a + b, 0) / medias.length
    out[k] = {
      current: atual,
      average: Math.round(media * 10) / 10,
      delta: Math.round((atual - media) * 10) / 10,
    }
  }
  return out
}

/** Semana (1-based) desde o início do vendedor, para a rampa. */
export function semanaDesdeInicio(inicio: IsoDate, hoje: IsoDate = todayBr()): number {
  const dias = daysBetween(inicio, hoje)
  if (dias < 0) return 1
  return Math.floor(dias / 7) + 1
}
