// src/screens/Ventus/motor.ts
// El motor determinístico del chat: las respuestas que NO cuestan tokens.
//
// La regla del producto es explícita: pendências, status de cliente, «sem toque
// há N dias», pipeline y compromissos se responden con @/core sobre la cartera
// que ya está en Dexie. Solo lo que necesita REDACCIÓN o DIAGNÓSTICO va al LLM.
//
// Por qué importa más de lo que parece:
//  · es instantáneo (<50 ms contra 3-8 s del modelo)
//  · funciona sin señal, que es donde el vendedor está la mitad del día
//  · no puede alucinar un número: los números salen de las mismas funciones
//    que pintan la Carteira
//
// Cómo se decide: intenciones por patrón, con la más específica primero. Si
// ninguna matchea, devuelve null y el turno va al servidor. Nunca «casi
// entiende»: o responde con datos, o se aparta.

import {
  analisarCarteira,
  calculateHealthScore,
  daysBetween,
  detectRisks,
  escalaMaisFraca,
  formatarBRL,
  getDaysSinceLastContact,
  getStageName,
  rankDay,
  SCALE_LABELS,
  todayBr,
  type Activity,
  type IsoDate,
  type PlannedAction,
} from '@/core'
import { normalizarBusca, type CarteiraLocal } from '@/data'

/* ══════════════════════════════════════════════════════════════════════════
   Forma de la respuesta local
   ══════════════════════════════════════════════════════════════════════════ */

export type IntencaoLocal =
  | 'pendencias'
  | 'status_cliente'
  | 'sem_toque'
  | 'pipeline'
  | 'compromissos'

/** Un enlace a una ficha. La respuesta local siempre lleva a algún lado. */
export interface AtalhoLocal {
  rotulo: string
  opportunityId?: number
  rota?: string
}

export interface RespostaLocal {
  intencao: IntencaoLocal
  /** Markdown-lite: solo saltos de línea y «· » de viñeta. Se pinta tal cual. */
  texto: string
  atalhos: AtalhoLocal[]
  /**
   * Hechos ya resueltos, para mandárselos al servidor si el vendedor sigue
   * preguntando. Evita que el modelo recalcule lo que el motor ya sabe.
   */
  fatos: Record<string, unknown>
}

/* ══════════════════════════════════════════════════════════════════════════
   Reconocimiento de intención
   ══════════════════════════════════════════════════════════════════════════ */

const PADROES: ReadonlyArray<{ intencao: IntencaoLocal; re: RegExp }> = [
  // Lo más específico primero: «sem toque há 15 dias» también contiene
  // «toque», que aparece en varias otras preguntas.
  { intencao: 'sem_toque', re: /sem\s+(toque|contato|falar|resposta)|parad[oa]s?|esquecid/i },
  { intencao: 'compromissos', re: /compromisso|prometi|combinad|semana|agenda|reuni(ão|ao|ões|oes)/i },
  { intencao: 'pipeline', re: /pipeline|funil|carteira|quanto\s+(tenho|vale)|valor\s+total|previs(ão|ao)/i },
  { intencao: 'pendencias', re: /pend(ê|e)ncia|o\s+que\s+(eu\s+)?(fa(ç|c)o|devo)|hoje|prioridade|primeiro/i },
  { intencao: 'status_cliente', re: /como\s+(está|esta|vai|anda)|status|situa(ç|c)(ã|a)o|resumo\s+d[oa]/i },
]

/** Devuelve la intención local, o null si esto es trabajo del modelo. */
export function detectarIntencao(pergunta: string): IntencaoLocal | null {
  const texto = pergunta.trim()
  if (texto === '') return null
  // Redacción y diagnóstico NUNCA son locales, aunque mencionen un cliente.
  if (/escrev|redig|rascunho|mensagem\s+(para|pro)|e-?mail\s+(para|pro)|como\s+(eu\s+)?(fa(ç|c)o\s+para\s+)?convenc/i.test(texto)) {
    return null
  }
  if (/por\s+que|porque|diagn(ó|o)stic|conselho|dica|estrat(é|e)gia|deveria/i.test(texto)) return null

  for (const p of PADROES) {
    if (p.re.test(texto)) return p.intencao
  }
  return null
}

/** «sem toque há 15 dias» → 15. Sin número explícito, el default es 10. */
export function diasDaPergunta(pergunta: string, padrao = 10): number {
  const m = /(\d{1,3})\s*(dias?|d\b)/i.exec(pergunta)
  if (m?.[1]) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return Math.min(365, n)
  }
  return padrao
}

/* ══════════════════════════════════════════════════════════════════════════
   Utilidades
   ══════════════════════════════════════════════════════════════════════════ */

function indexarAtividades(activities: readonly Activity[]): Map<number, Activity[]> {
  const mapa = new Map<number, Activity[]>()
  for (const a of activities) {
    const lista = mapa.get(a.opportunity_id)
    if (lista) lista.push(a)
    else mapa.set(a.opportunity_id, [a])
  }
  return mapa
}

function nomeDe(o: { name: string | null; client: string | null; id: number }): string {
  return o.name ?? o.client ?? `Oportunidade ${String(o.id)}`
}

/** Busca la oportunidad que el vendedor nombró. Tolerante a acentos y a «a». */
export function acharOportunidade(
  carteira: CarteiraLocal,
  pergunta: string,
): CarteiraLocal['opportunities'][number] | null {
  const texto = normalizarBusca(pergunta)
  let melhor: { opp: CarteiraLocal['opportunities'][number]; peso: number } | null = null
  for (const o of carteira.opportunities) {
    if (o.outcome) continue
    for (const candidato of [o.client, o.name]) {
      if (candidato === null || candidato.trim().length < 3) continue
      const alvo = normalizarBusca(candidato)
      if (!texto.includes(alvo)) continue
      // El nombre más largo gana: 'tetra pak brasil' antes que 'tetra'.
      if (melhor === null || alvo.length > melhor.peso) melhor = { opp: o, peso: alvo.length }
    }
  }
  return melhor?.opp ?? null
}

function linhaDeAcao(a: PlannedAction, i: number): string {
  const motivo = a.porque[0]?.sinal ?? ''
  const prazo = a.prazo ? ` (${a.prazo})` : ''
  return `${String(i + 1)}. ${a.entidade.cliente} — ${a.acao}${prazo}\n   ${motivo}`
}

/* ══════════════════════════════════════════════════════════════════════════
   Las cinco respuestas
   ══════════════════════════════════════════════════════════════════════════ */

function responderPendencias(carteira: CarteiraLocal, hoje: IsoDate, vendor: string): RespostaLocal {
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

  if (plano.top.length === 0) {
    return {
      intencao: 'pendencias',
      texto: 'Nada pendente para hoje. Se quiser adiantar, o mapa tem empresas suas ainda sem lead.',
      atalhos: [{ rotulo: 'Ver o mapa', rota: '/revisao' }],
      fatos: { pendencias: 0 },
    }
  }

  const corpo = plano.top.map(linhaDeAcao).join('\n')
  const resto =
    plano.restantes > 0
      ? `\n\nSobram ${String(plano.restantes)} na fila, mas hoje são estas três.`
      : ''

  return {
    intencao: 'pendencias',
    texto: `Suas três de hoje:\n\n${corpo}${resto}`,
    atalhos: [
      { rotulo: 'Abrir Hoje', rota: '/' },
      ...plano.top
        .filter((a) => a.entidade.kind === 'opportunity')
        .slice(0, 3)
        .map((a) => ({ rotulo: a.entidade.cliente, opportunityId: a.entidade.id })),
    ],
    fatos: {
      pendencias: plano.todas.length,
      top: plano.top.map((a) => ({ cliente: a.entidade.cliente, acao: a.acao, score: a.score })),
    },
  }
}

function responderStatusCliente(
  carteira: CarteiraLocal,
  pergunta: string,
  hoje: IsoDate,
): RespostaLocal | null {
  const opp = acharOportunidade(carteira, pergunta)
  if (opp === null) return null

  const atividades = indexarAtividades(carteira.activities).get(opp.id) ?? []
  const dias = getDaysSinceLastContact(opp.last_update, atividades)
  const saude = calculateHealthScore(opp.scales)
  const fraca = escalaMaisFraca(opp)
  const riscos = detectRisks(opp, atividades, hoje)
  const etapa = getStageName(opp.stage) || 'sem etapa'

  const linhas = [
    `${nomeDe(opp)} — ${etapa}, ${formatarBRL(opp.value)}.`,
    `Saúde ${String(saude)}/10. Escala mais fraca: ${SCALE_LABELS[fraca.escala]} em ${String(fraca.valor)}.`,
    dias < 0 ? 'Nunca houve contato registrado.' : `${String(dias)} dias sem contato.`,
    opp.next_action !== null
      ? `Próxima ação: ${opp.next_action}${opp.next_action_date !== null ? ` em ${opp.next_action_date}` : ' — sem data'}.`
      : 'Sem próxima ação definida. Esse é o buraco.',
  ]
  if (riscos.length > 0) {
    linhas.push('', 'Riscos abertos:')
    for (const r of riscos.slice(0, 3)) linhas.push(`· ${r.message}`)
  }

  return {
    intencao: 'status_cliente',
    texto: linhas.join('\n'),
    atalhos: [{ rotulo: 'Abrir a ficha', opportunityId: opp.id }],
    fatos: {
      opportunityId: opp.id,
      etapa: opp.stage,
      saude,
      diasSemContato: dias,
      escalaMaisFraca: fraca.escala,
      riscos: riscos.map((r) => r.code),
    },
  }
}

function responderSemToque(
  carteira: CarteiraLocal,
  pergunta: string,
  hoje: IsoDate,
): RespostaLocal {
  const limite = diasDaPergunta(pergunta, 10)
  const porOpp = indexarAtividades(carteira.activities)

  const paradas = carteira.opportunities
    .filter((o) => !o.outcome)
    .map((o) => ({ o, dias: getDaysSinceLastContact(o.last_update, porOpp.get(o.id) ?? []) }))
    .filter((x) => x.dias < 0 || x.dias >= limite)
    .sort((a, b) => (b.o.value ?? 0) - (a.o.value ?? 0))

  // Los leads con el toque vencido son la otra mitad del problema: en
  // producción 48 de 54 están así.
  const leadsVencidos = carteira.leads.filter(
    (l) =>
      l.archived_at === null &&
      l.status !== 'converted' &&
      l.next_touchpoint_date !== null &&
      daysBetween(l.next_touchpoint_date as IsoDate, hoje) > 0,
  )

  if (paradas.length === 0 && leadsVencidos.length === 0) {
    return {
      intencao: 'sem_toque',
      texto: `Nenhuma conta sua está há ${String(limite)} dias ou mais sem contato. A cadência está em dia.`,
      atalhos: [{ rotulo: 'Ver a carteira', rota: '/carteira' }],
      fatos: { limite, paradas: 0, leadsVencidos: 0 },
    }
  }

  const linhas: string[] = []
  if (paradas.length > 0) {
    const valor = paradas.reduce((s, x) => s + (x.o.value ?? 0), 0)
    linhas.push(
      `${String(paradas.length)} contas há ${String(limite)}+ dias sem contato (${formatarBRL(valor)} parados):`,
      '',
    )
    for (const { o, dias } of paradas.slice(0, 6)) {
      linhas.push(
        `· ${nomeDe(o)} — ${dias < 0 ? 'nunca' : `${String(dias)} dias`} · ${formatarBRL(o.value)}`,
      )
    }
    if (paradas.length > 6) linhas.push(`· …e mais ${String(paradas.length - 6)}.`)
  }
  if (leadsVencidos.length > 0) {
    if (linhas.length > 0) linhas.push('')
    linhas.push(`E ${String(leadsVencidos.length)} leads com o toque da cadência vencido.`)
  }

  return {
    intencao: 'sem_toque',
    texto: linhas.join('\n'),
    atalhos: [
      { rotulo: 'Ver a carteira', rota: '/carteira' },
      ...(leadsVencidos.length > 0
        ? [{ rotulo: 'Abrir a cadência', rota: '/cadencia' }]
        : []),
      ...paradas.slice(0, 2).map((x) => ({ rotulo: nomeDe(x.o), opportunityId: x.o.id })),
    ],
    fatos: { limite, paradas: paradas.length, leadsVencidos: leadsVencidos.length },
  }
}

/** Días de silencio a partir de los cuales una cuenta cuenta como parada. */
const LIMITE_SILENCIO_DIAS = 14

function responderPipeline(carteira: CarteiraLocal, hoje: IsoDate): RespostaLocal {
  const saude = analisarCarteira(carteira.opportunities, carteira.activities, hoje)
  const vivas = carteira.opportunities.filter((o) => !o.outcome)
  const total = vivas.reduce((s, o) => s + (o.value ?? 0), 0)

  // Los dos agujeros que la auditoría encontró en producción: 51 de 54 sin
  // next_action_date y las cuentas en silencio. analisarCarteira no los
  // devuelve, así que se cuentan acá con las mismas funciones del dominio.
  const porOpp = indexarAtividades(carteira.activities)
  const semProximaAcao = vivas.filter((o) => o.next_action_date === null).length
  const paradas = vivas.filter(
    (o) => getDaysSinceLastContact(o.last_update, porOpp.get(o.id) ?? []) >= LIMITE_SILENCIO_DIAS,
  ).length

  const porEtapa = new Map<number, { n: number; valor: number }>()
  for (const o of vivas) {
    const etapa = o.stage ?? 0
    const atual = porEtapa.get(etapa) ?? { n: 0, valor: 0 }
    atual.n += 1
    atual.valor += o.value ?? 0
    porEtapa.set(etapa, atual)
  }

  const linhas = [
    `${String(vivas.length)} oportunidades vivas, ${formatarBRL(total)} em pipeline.`,
    '',
  ]
  for (const [etapa, dados] of [...porEtapa.entries()].sort((a, b) => a[0] - b[0])) {
    const nome = getStageName(etapa as never) || `Etapa ${String(etapa)}`
    linhas.push(`· ${nome}: ${String(dados.n)} · ${formatarBRL(dados.valor)}`)
  }
  linhas.push('')
  linhas.push(
    `Sem próxima ação com data: ${String(semProximaAcao)}. Paradas há mais de ${String(LIMITE_SILENCIO_DIAS)} dias: ${String(paradas)}.`,
  )
  if (saude.emRisco > 0) {
    linhas.push(
      `Em risco: ${String(saude.emRisco)} negócios, ${formatarBRL(saude.valorEmRisco)}.`,
    )
  }

  return {
    intencao: 'pipeline',
    texto: linhas.join('\n'),
    atalhos: [{ rotulo: 'Ver a carteira', rota: '/carteira' }],
    fatos: {
      vivas: vivas.length,
      total,
      semProximaAcao,
      paradas,
      emRisco: saude.emRisco,
      saudeMedia: saude.saudeMedia,
    },
  }
}

function responderCompromissos(carteira: CarteiraLocal, hoje: IsoDate): RespostaLocal {
  const abertos = carteira.commitments.filter((c) => c.status === 'pending')
  const tarefas = carteira.tasks.filter((t) => t.status === 'pending' || t.status === 'snoozed')
  const vencidas = tarefas.filter((t) => t.due_date !== null && t.due_date < hoje)

  if (abertos.length === 0 && tarefas.length === 0) {
    return {
      intencao: 'compromissos',
      texto: 'Nenhum compromisso aberto e nenhuma tarefa pendente. Semana limpa.',
      atalhos: [{ rotulo: 'Abrir Hoje', rota: '/' }],
      fatos: { compromissos: 0, tarefas: 0 },
    }
  }

  const linhas: string[] = []
  if (abertos.length > 0) {
    linhas.push(`${String(abertos.length)} compromissos assumidos e ainda abertos:`, '')
    for (const c of abertos.slice(0, 5)) {
      linhas.push(`· ${c.committed_action}${c.due_date !== null ? ` — ${c.due_date}` : ''}`)
    }
    if (abertos.length > 5) linhas.push(`· …e mais ${String(abertos.length - 5)}.`)
  }
  if (tarefas.length > 0) {
    if (linhas.length > 0) linhas.push('')
    linhas.push(
      vencidas.length > 0
        ? `${String(tarefas.length)} tarefas pendentes, ${String(vencidas.length)} já vencidas.`
        : `${String(tarefas.length)} tarefas pendentes, nenhuma vencida.`,
    )
  }

  return {
    intencao: 'compromissos',
    texto: linhas.join('\n'),
    atalhos: [
      { rotulo: 'Abrir Hoje', rota: '/' },
      { rotulo: 'Rituais da semana', rota: '/rituais' },
    ],
    fatos: {
      compromissos: abertos.length,
      tarefas: tarefas.length,
      tarefasVencidas: vencidas.length,
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Entrada única
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Intenta responder SIN red y SIN tokens.
 * Devuelve null cuando la pregunta necesita redacción o diagnóstico: ahí es
 * trabajo del modelo y el chat abre el stream.
 */
export function responderLocalmente(
  pergunta: string,
  carteira: CarteiraLocal,
  vendor: string,
  hoje: IsoDate = todayBr(),
): RespostaLocal | null {
  const intencao = detectarIntencao(pergunta)
  if (intencao === null) return null

  switch (intencao) {
    case 'pendencias':
      return responderPendencias(carteira, hoje, vendor)
    case 'status_cliente':
      return responderStatusCliente(carteira, pergunta, hoje)
    case 'sem_toque':
      return responderSemToque(carteira, pergunta, hoje)
    case 'pipeline':
      return responderPipeline(carteira, hoje)
    case 'compromissos':
      return responderCompromissos(carteira, hoje)
    default:
      return null
  }
}

/**
 * La red de seguridad del modo avión: cuando NO hay señal y la pregunta no
 * cae en ninguna intención, se responde igual con lo que el motor sí sabe, y
 * se dice claramente que el Ventus está fuera del ar.
 */
export function respostaOffline(
  carteira: CarteiraLocal,
  vendor: string,
  hoje: IsoDate = todayBr(),
): RespostaLocal {
  const base = responderPendencias(carteira, hoje, vendor)
  return {
    ...base,
    texto: `Estou sem conexão, então respondo com o que já está no aparelho — sem inventar nada.\n\n${base.texto}`,
  }
}
