// src/data/gestor.ts
// El Painel do Gestor: lo que Jordi y Tomás miran una vez por semana.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTE MÓDULO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. ES LA ÚNICA LECTURA DE LA APP QUE SALE DE DEXIE Y VA A LA RED. El resto
//    del v3 lee la cartera local porque cada vendedor sincroniza SOLO la suya
//    — que es exactamente lo que hace que la app abra dentro del galpón. El
//    gestor, por definición, necesita las seis carteras, y esas seis no están
//    ni pueden estar en su teléfono. Por eso este módulo consulta el servidor,
//    y por eso es el único que tiene un estado «offline» honesto en vez de
//    fingir datos.
//
// 2. NO PENALIZA A NADIE SOLO. La cola de calibración marca patrones (ráfagas
//    de registros, escalas altas sin transcripción, etapas que oscilan) para
//    MIRARLOS JUNTOS. Ninguno de los tres patrones prueba nada por sí mismo:
//    una ráfaga puede ser el viernes a las 18h descargando la semana. Por eso
//    el tipo se llama `PadraoDeCalibracao` y no `Infracao`, y por eso cada uno
//    trae la pregunta que abre la conversación, no un veredicto.
//
// 3. UNA SOLA SUGERENCIA DE COACHING POR VENDEDOR, ANCLADA EN PPVVCC. Tres
//    sugerencias son cero sugerencias: el gestor las lee, asiente y no cambia
//    nada. La única se elige por valor en riesgo × escala más floja, y viene
//    con la pregunta SPIN literal para que la conversación empiece con algo
//    que decir y no con «hay que trabajar más el valor».
//
// 4. LOS NOMBRES DE ETAPA SALEN DE `STAGES`, SIEMPRE. El v2 muestra
//    «Negociación» donde el proceso dice «Validação/Teste» y eso ya produjo
//    dos pronósticos equivocados. `getStageName()` es la única fuente.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  STAGES,
  addDays,
  avaliarRiscos,
  calculateHealthScore,
  daysBetween,
  ehDiaUtil,
  escalaMaisFraca,
  formatarBRL,
  gateFaltante,
  getScaleScores,
  getStageName,
  proximoNivel,
  textosParaAvancar,
  todayBr,
  weekStart,
  type Activity,
  type Commitment,
  type IsoDate,
  type Opportunity,
  type RiskSignal,
  type ScaleKey,
  type StageId,
  type Vendor,
} from '@/core'
import { supabase } from './supabase'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Tipos del panel
   ══════════════════════════════════════════════════════════════════════════ */

/** Algo que se movió de verdad en la semana, con su evidencia al lado. */
export interface MovimentoDoVendedor {
  opportunityId: number
  cliente: string
  /** Qué pasó, en una línea PT-BR. */
  oQue: string
  quando: IsoDate
  /**
   * Hay artefacto (transcripción, nota larga, registro por voz) que respalda
   * el movimiento. Mientras `scale_evidence` no esté aplicada, esto es el
   * proxy honesto: se dice «declarado» y no «provado».
   */
  comProva: boolean
  /** Primeros 160 caracteres del registro, para leer en voz alta en la 1:1. */
  citacao: string | null
}

/** Una oportunidad que dejó de moverse. */
export interface EstagnadoDoVendedor {
  opportunityId: number
  cliente: string
  etapa: string
  diasSemToque: number
  valor: number | null
  valorFormatado: string
}

export interface SugestaoDeCoaching {
  opportunityId: number
  cliente: string
  escala: ScaleKey
  nivelAtual: number
  /** Titular de una línea. */
  titulo: string
  /** Por qué esta y no otra. */
  porque: string
  /** La pregunta lista para usar. Sale de las 192 preguntas SPIN del negocio. */
  jogada: string
}

export interface CompromissosDoVendedor {
  total: number
  cumpridos: number
  /** null cuando no hubo compromisos: 0 % sería una mentira. */
  percentual: number | null
}

export interface VendedorNoPainel {
  vendor: string
  nome: string
  isAdmin: boolean
  /** Oportunidades vivas bajo su nombre. */
  carteira: number
  pipeline: number
  pipelineFormatado: string
  moveu: MovimentoDoVendedor[]
  estagnou: EstagnadoDoVendedor[]
  compromissos: CompromissosDoVendedor
  /** Registros de la semana contra la meta de la rampa del equipo. */
  registrosDaSemana: number
  /** Días hábiles con al menos un registro, sobre los días hábiles de la semana. */
  diasAtivos: number
  diasUteis: number
  riscos: RiskSignal[]
  coaching: SugestaoDeCoaching | null
}

export type CodigoDeCalibracao = 'rajada' | 'salto_sem_prova' | 'oscilacao_de_etapa'

export interface PadraoDeCalibracao {
  codigo: CodigoDeCalibracao
  vendor: string
  titulo: string
  detalhe: string
  /** La pregunta que abre la conversación. Nunca una acusación. */
  perguntaParaAConversa: string
  quando: IsoDate
  opportunityId: number | null
  cliente: string | null
}

export interface AdocaoDoVendedor {
  vendor: string
  nome: string
  diasAtivos: number
  diasUteis: number
  /** 0..1 */
  fracao: number
}

export interface SaudeDoSistema {
  /** Aceptación de lo que propone el Ventus, por tipo. null = tabla sin aplicar. */
  aceitacao: { tipo: string; propostas: number; aceitas: number; taxa: number }[] | null
  /** Tasa de lectura de las notificaciones enviadas. */
  leituraDeAvisos: { enviados: number; lidos: number; taxa: number } | null
  /** Ratio de registros con artefacto detrás. */
  eventosComProva: { total: number; comProva: number; taxa: number }
  adocao: AdocaoDoVendedor[]
}

export type OrigemDoPainel = 'servidor' | 'offline'

export interface PainelDoGestor {
  semana: IsoDate
  fimDaSemana: IsoDate
  vendedores: VendedorNoPainel[]
  calibracao: PadraoDeCalibracao[]
  saude: SaudeDoSistema
  origem: OrigemDoPainel
  pipelineTotal: number
  pipelineTotalFormatado: string
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Umbrales — todos con su porqué
   ══════════════════════════════════════════════════════════════════════════ */

/** Días sin ningún toque para llamar «estancada» a una oportunidad. */
export const DIAS_PARA_ESTAGNAR = 14

/** Registros en la misma ventana para marcar una ráfaga. */
export const RAJADA_MINIMA = 6
export const RAJADA_JANELA_MIN = 10

/** Nivel de escala desde el cual el PLANO exige prueba (EVIDENCE_REQUIRED_ABOVE). */
export const NIVEL_QUE_PEDE_PROVA = 6

/** Caracteres mínimos para que una descripción cuente como artefacto. */
export const MINIMO_DE_TEXTO_COM_PROVA = 120

/** Cuántas oportunidades estancadas se muestran por vendedor. */
const MAX_ESTAGNADAS = 4
const MAX_MOVIMENTOS = 5
const MAX_RISCOS = 3

/* ══════════════════════════════════════════════════════════════════════════
   3 · Agregación (pura: se puede testear sin red)
   ══════════════════════════════════════════════════════════════════════════ */

export interface DadosDoPainel {
  vendors: Vendor[]
  opportunities: Opportunity[]
  activities: Activity[]
  commitments: Commitment[]
  /** Enviadas y leídas de los últimos 30 días. null si la tabla no respondió. */
  avisos: { enviados: number; lidos: number } | null
  /** Propuestas del Ventus por tipo. null mientras `ventus_actions` no exista. */
  acoesDoVentus: { tipo: string; estado: string }[] | null
}

function dataDaAtividade(a: Activity): string {
  return (a.activity_date ?? a.created_at ?? '').slice(0, 10)
}

function rotulo(opp: Opportunity): string {
  return opp.client ?? opp.name ?? `Oportunidade ${opp.id}`
}

function diasUteisNaSemana(inicio: IsoDate): number {
  let n = 0
  for (let i = 0; i < 7; i += 1) if (ehDiaUtil(addDays(inicio, i))) n += 1
  return Math.max(1, n)
}

/**
 * ¿Este registro trae artefacto?
 *
 * Un registro dictado por voz llega como `ai_parsed` con la transcripción
 * entera adentro; uno tecleado a las apuradas tiene doce caracteres. La
 * longitud no es una métrica de calidad, pero sí distingue «quedó constancia
 * de lo que se dijo» de «quedó constancia de que hubo algo».
 */
export function temProva(a: Activity): boolean {
  if (a.source === 'ai_parsed') return true
  return (a.description ?? '').trim().length >= MINIMO_DE_TEXTO_COM_PROVA
}

function citacaoDe(a: Activity): string | null {
  const texto = (a.description ?? '').trim()
  if (texto === '') return null
  return texto.length <= 160 ? texto : `${texto.slice(0, 157)}…`
}

/** Movimientos reales de la semana: cambios de etapa y escalas actualizadas. */
function movimentosDaSemana(
  atividades: readonly Activity[],
  porOportunidade: ReadonlyMap<number, Opportunity>,
): MovimentoDoVendedor[] {
  const saida: MovimentoDoVendedor[] = []
  for (const a of atividades) {
    const opp = porOportunidade.get(a.opportunity_id)
    const cliente = opp ? rotulo(opp) : `Oportunidade ${a.opportunity_id}`

    if (a.activity_type === 'stage_change') {
      const de = a.stage_at_time
      const nome = opp?.stage ? getStageName(opp.stage) : ''
      const deNome = de ? getStageName(de as StageId) : ''
      saida.push({
        opportunityId: a.opportunity_id,
        cliente,
        oQue: deNome && nome ? `${deNome} → ${nome}` : `Mudou de etapa${nome ? ` para ${nome}` : ''}`,
        quando: dataDaAtividade(a) as IsoDate,
        comProva: temProva(a),
        citacao: citacaoDe(a),
      })
      continue
    }

    if (a.ai_suggested_scales) {
      const scores = getScaleScores(a.ai_suggested_scales)
      const maior = (Object.keys(scores) as ScaleKey[]).reduce(
        (m, k) => (scores[k] > scores[m] ? k : m),
        'dor' as ScaleKey,
      )
      saida.push({
        opportunityId: a.opportunity_id,
        cliente,
        oQue: `Escalas atualizadas — ${maior.toUpperCase()} em ${scores[maior]}`,
        quando: dataDaAtividade(a) as IsoDate,
        comProva: temProva(a),
        citacao: citacaoDe(a),
      })
    }
  }

  // Lo que tiene prueba primero: es lo que se puede celebrar sin reservas.
  return saida
    .sort((a, b) => {
      if (a.comProva !== b.comProva) return a.comProva ? -1 : 1
      return b.quando.localeCompare(a.quando)
    })
    .slice(0, MAX_MOVIMENTOS)
}

function estagnadasDe(
  oportunidades: readonly Opportunity[],
  ultimoToque: ReadonlyMap<number, string>,
  hoje: IsoDate,
): EstagnadoDoVendedor[] {
  const saida: EstagnadoDoVendedor[] = []
  for (const opp of oportunidades) {
    if (opp.outcome || opp.stage === 6) continue
    const toque = ultimoToque.get(opp.id) ?? opp.last_activity_date?.slice(0, 10) ?? null
    const dias = toque ? daysBetween(toque as IsoDate, hoje) : 999
    if (dias < DIAS_PARA_ESTAGNAR) continue
    saida.push({
      opportunityId: opp.id,
      cliente: rotulo(opp),
      etapa: opp.stage ? getStageName(opp.stage) : 'Sem etapa',
      diasSemToque: dias,
      valor: opp.value,
      valorFormatado: formatarBRL(opp.value),
    })
  }
  // Por valor: el gestor tiene 20 minutos por vendedor y no puede repasar 30.
  return saida.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)).slice(0, MAX_ESTAGNADAS)
}

/**
 * La única sugerencia. Se elige la oportunidad con MÁS valor en riesgo entre
 * las que tienen un gate bloqueado o la escala más floja por debajo de 5, y se
 * devuelve la pregunta SPIN que sirve para ese nivel exacto.
 */
export function sugerirCoaching(
  oportunidades: readonly Opportunity[],
  atividades: readonly Activity[],
): SugestaoDeCoaching | null {
  let melhor: { opp: Opportunity; escala: ScaleKey; nivel: number; peso: number } | null = null

  for (const opp of oportunidades) {
    if (opp.outcome || opp.stage === 6) continue
    const { escala, valor } = escalaMaisFraca(opp)
    const gate = opp.stage ? gateFaltante(opp.scales, opp.stage) : null
    // Sin gate bloqueado y con la escala floja ya en 5, no hay nada urgente.
    if (!gate && valor >= 5) continue

    const escalaAlvo = gate ? gate.escala : escala
    const nivel = gate ? gate.atual : valor
    // Valor del negocio × cuánto falta: lo caro y trabado antes que lo barato.
    const falta = gate ? gate.falta : Math.max(1, 5 - valor)
    const peso = Math.log10(Math.max(1, opp.value ?? 1)) * falta

    if (!melhor || peso > melhor.peso) {
      melhor = { opp, escala: escalaAlvo, nivel, peso }
    }
  }

  if (!melhor) return null

  const { opp, escala, nivel } = melhor
  const usados = atividades
    .filter((a) => a.opportunity_id === opp.id)
    .map((a) => a.description ?? '')
  const jogada = textosParaAvancar(escala, nivel, usados, 1)[0]
  const proximo = proximoNivel(escala, nivel)
  const gate = opp.stage ? gateFaltante(opp.scales, opp.stage) : null

  return {
    opportunityId: opp.id,
    cliente: rotulo(opp),
    escala,
    nivelAtual: nivel,
    titulo: `${escala.toUpperCase()} em ${nivel} na ${rotulo(opp)}`,
    porque:
      gate?.texto ??
      (proximo
        ? `O próximo nível é: «${proximo}». Enquanto isso não existir, o avanço é declarado, não real.`
        : 'A escala mais fraca desta oportunidade é a que segura o negócio.'),
    jogada: jogada ?? 'Peça ao vendedor a última frase literal que o cliente disse sobre isto.',
  }
}

/** Los tres patrones de la auditoría automática. Para revisar juntos. */
export function padroesDeCalibracao(
  atividades: readonly Activity[],
  porOportunidade: ReadonlyMap<number, Opportunity>,
): PadraoDeCalibracao[] {
  const saida: PadraoDeCalibracao[] = []

  /* ── Ráfaga: >6 registros en <10 minutos ─────────────────────────────── */
  const porVendedor = new Map<string, Activity[]>()
  for (const a of atividades) {
    const lista = porVendedor.get(a.vendor)
    if (lista) lista.push(a)
    else porVendedor.set(a.vendor, [a])
  }

  for (const [vendor, lista] of porVendedor) {
    const ordenadas = [...lista]
      .filter((a) => a.created_at !== null)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

    for (let i = 0; i + RAJADA_MINIMA - 1 < ordenadas.length; i += 1) {
      const primeiro = ordenadas[i]
      const ultimo = ordenadas[i + RAJADA_MINIMA - 1]
      if (!primeiro?.created_at || !ultimo?.created_at) continue
      const minutos = (Date.parse(ultimo.created_at) - Date.parse(primeiro.created_at)) / 60_000
      if (minutos > RAJADA_JANELA_MIN) continue

      saida.push({
        codigo: 'rajada',
        vendor,
        titulo: `${RAJADA_MINIMA} registros em ${Math.max(1, Math.round(minutos))} minutos`,
        detalhe:
          'Vários registros seguidos costumam ser a semana inteira sendo descarregada de uma vez. Não é errado — só quer dizer que o detalhe se perdeu no caminho.',
        perguntaParaAConversa:
          'Foi um bloco de atualização no fim do dia? Vale a pena testar registrar por voz na hora, logo depois da ligação.',
        quando: dataDaAtividade(primeiro) as IsoDate,
        opportunityId: primeiro.opportunity_id,
        cliente: porOportunidade.get(primeiro.opportunity_id)
          ? rotulo(porOportunidade.get(primeiro.opportunity_id) as Opportunity)
          : null,
        // Una sola marca por ráfaga: se salta la ventana entera.
      })
      i += RAJADA_MINIMA - 1
    }
  }

  /* ── Escala alta sin artefacto ───────────────────────────────────────── */
  for (const a of atividades) {
    if (!a.ai_suggested_scales || temProva(a)) continue
    const scores = getScaleScores(a.ai_suggested_scales)
    const chaves = Object.keys(scores) as ScaleKey[]
    const alta = chaves.find((k) => scores[k] >= NIVEL_QUE_PEDE_PROVA)
    if (!alta) continue

    const opp = porOportunidade.get(a.opportunity_id)
    saida.push({
      codigo: 'salto_sem_prova',
      vendor: a.vendor,
      titulo: `${alta.toUpperCase()} em ${scores[alta]} sem citação`,
      detalhe: `A partir do nível ${NIVEL_QUE_PEDE_PROVA} a metodologia pede a frase do cliente. Este registro tem ${(a.description ?? '').trim().length} caracteres.`,
      perguntaParaAConversa:
        'Qual foi a frase literal que sustenta este número? Se ela existe, vale colar; se não existe, o número ainda não é este.',
      quando: dataDaAtividade(a) as IsoDate,
      opportunityId: a.opportunity_id,
      cliente: opp ? rotulo(opp) : null,
    })
  }

  /* ── Oscilación de etapa ─────────────────────────────────────────────── */
  const mudancasPorOpp = new Map<number, Activity[]>()
  for (const a of atividades) {
    if (a.activity_type !== 'stage_change') continue
    const lista = mudancasPorOpp.get(a.opportunity_id)
    if (lista) lista.push(a)
    else mudancasPorOpp.set(a.opportunity_id, [a])
  }

  for (const [oppId, lista] of mudancasPorOpp) {
    if (lista.length < 2) continue
    const ordenadas = [...lista].sort((a, b) =>
      dataDaAtividade(a).localeCompare(dataDaAtividade(b)),
    )
    for (let i = 1; i < ordenadas.length; i += 1) {
      const antes = ordenadas[i - 1]
      const depois = ordenadas[i]
      if (!antes || !depois) continue
      const a0 = antes.stage_at_time
      const a1 = depois.stage_at_time
      if (a0 === null || a1 === null || a1 >= a0) continue

      const opp = porOportunidade.get(oppId)
      saida.push({
        codigo: 'oscilacao_de_etapa',
        vendor: depois.vendor,
        titulo: `Etapa voltou de ${getStageName(a0 as StageId)} para ${getStageName(a1 as StageId)}`,
        detalhe:
          'Voltar de etapa é sinal de honestidade, não de erro. O que vale olhar é o que fez a etapa subir antes da hora.',
        perguntaParaAConversa:
          'O que parecia estar resolvido e não estava? Isso costuma apontar uma escala que subiu sem a prova.',
        quando: dataDaAtividade(depois) as IsoDate,
        opportunityId: oppId,
        cliente: opp ? rotulo(opp) : null,
      })
    }
  }

  return saida.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 20)
}

/** Arma el panel entero. Función pura sobre los datos ya traídos. */
export function montarPainel(
  dados: DadosDoPainel,
  origem: OrigemDoPainel,
  hoje: IsoDate = todayBr(),
): PainelDoGestor {
  const semana = weekStart(hoje)
  const fimDaSemana = addDays(semana, 6)
  const diasUteis = diasUteisNaSemana(semana)

  const porOportunidade = new Map<number, Opportunity>()
  for (const o of dados.opportunities) porOportunidade.set(o.id, o)

  // Último toque real por oportunidad. No se usa `last_update`: se pisa con
  // cualquier edición y por eso miente sistemáticamente en el v2.
  const ultimoToque = new Map<number, string>()
  for (const a of dados.activities) {
    const d = dataDaAtividade(a)
    if (d === '') continue
    const atual = ultimoToque.get(a.opportunity_id)
    if (!atual || d > atual) ultimoToque.set(a.opportunity_id, d)
  }

  const daSemana = dados.activities.filter((a) => {
    const d = dataDaAtividade(a)
    return d >= semana && d <= fimDaSemana
  })

  const vendedores: VendedorNoPainel[] = []
  let pipelineTotal = 0

  for (const v of dados.vendors) {
    if (v.is_active === false) continue

    const minhas = dados.opportunities.filter((o) => o.vendor === v.name)
    const vivas = minhas.filter((o) => !o.outcome && o.stage !== 6)
    const pipeline = vivas.reduce((s, o) => s + (o.value ?? 0), 0)
    pipelineTotal += pipeline

    const minhasAtividades = dados.activities.filter((a) => a.vendor === v.name)
    const minhasDaSemana = daSemana.filter((a) => a.vendor === v.name)

    const diasComRegistro = new Set(
      minhasDaSemana.map((a) => dataDaAtividade(a)).filter((d) => d !== ''),
    )

    const meusCompromissos = dados.commitments.filter(
      (c) => c.vendor === v.name && c.week_of.slice(0, 10) === semana,
    )
    const cumpridos = meusCompromissos.filter(
      (c) => c.status === 'done' || c.status === 'partial',
    ).length

    // Riesgos: los más severos de toda la cartera, no de una oportunidad.
    const riscos: RiskSignal[] = []
    for (const opp of vivas) {
      riscos.push(...avaliarRiscos(opp, minhasAtividades, hoje))
    }

    vendedores.push({
      vendor: v.name,
      nome: v.name,
      isAdmin: v.is_admin === true,
      carteira: vivas.length,
      pipeline,
      pipelineFormatado: formatarBRL(pipeline),
      moveu: movimentosDaSemana(minhasDaSemana, porOportunidade),
      estagnou: estagnadasDe(vivas, ultimoToque, hoje),
      compromissos: {
        total: meusCompromissos.length,
        cumpridos,
        percentual:
          meusCompromissos.length === 0
            ? null
            : Math.round((cumpridos / meusCompromissos.length) * 100),
      },
      registrosDaSemana: minhasDaSemana.length,
      diasAtivos: diasComRegistro.size,
      diasUteis,
      riscos: riscos.slice(0, MAX_RISCOS),
      coaching: sugerirCoaching(vivas, minhasAtividades),
    })
  }

  // El de más pipeline arriba: es donde una hora de coaching rinde más.
  vendedores.sort((a, b) => b.pipeline - a.pipeline)

  const comProva = dados.activities.filter(temProva).length
  const aceitacao =
    dados.acoesDoVentus === null
      ? null
      : agruparAceitacao(dados.acoesDoVentus)

  return {
    semana,
    fimDaSemana,
    vendedores,
    calibracao: padroesDeCalibracao(dados.activities, porOportunidade),
    saude: {
      aceitacao,
      leituraDeAvisos:
        dados.avisos === null
          ? null
          : {
              enviados: dados.avisos.enviados,
              lidos: dados.avisos.lidos,
              taxa:
                dados.avisos.enviados === 0 ? 0 : dados.avisos.lidos / dados.avisos.enviados,
            },
      eventosComProva: {
        total: dados.activities.length,
        comProva,
        taxa: dados.activities.length === 0 ? 0 : comProva / dados.activities.length,
      },
      adocao: vendedores.map((v) => ({
        vendor: v.vendor,
        nome: v.nome,
        diasAtivos: v.diasAtivos,
        diasUteis: v.diasUteis,
        fracao: v.diasUteis === 0 ? 0 : v.diasAtivos / v.diasUteis,
      })),
    },
    origem,
    pipelineTotal,
    pipelineTotalFormatado: formatarBRL(pipelineTotal),
  }
}

function agruparAceitacao(
  acoes: readonly { tipo: string; estado: string }[],
): { tipo: string; propostas: number; aceitas: number; taxa: number }[] {
  const mapa = new Map<string, { propostas: number; aceitas: number }>()
  for (const a of acoes) {
    const atual = mapa.get(a.tipo) ?? { propostas: 0, aceitas: 0 }
    atual.propostas += 1
    if (a.estado === 'committed' || a.estado === 'aceito') atual.aceitas += 1
    mapa.set(a.tipo, atual)
  }
  return [...mapa.entries()]
    .map(([tipo, v]) => ({
      tipo,
      propostas: v.propostas,
      aceitas: v.aceitas,
      taxa: v.propostas === 0 ? 0 : v.aceitas / v.propostas,
    }))
    .sort((a, b) => b.propostas - a.propostas)
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Lectura
   ══════════════════════════════════════════════════════════════════════════ */

export const chavesGestor = {
  painel: (semana: string) => ['gestor', 'painel', semana] as const,
}

/** Semanas de actividad que se traen. 8 cubre el mes anterior con margen. */
const SEMANAS_DE_ATIVIDADE = 8

async function talvez<T>(promessa: PromiseLike<{ data: T | null; error: unknown }>): Promise<
  T | null
> {
  try {
    const { data, error } = await promessa
    if (error) return null
    return data
  } catch {
    return null
  }
}

/**
 * Trae las seis carteras. Cinco consultas en paralelo, ninguna por fila:
 * con 65 oportunidades y 151 actividades esto es un payload de kilobytes.
 */
export async function fetchPainelDoGestor(hoje: IsoDate = todayBr()): Promise<PainelDoGestor> {
  const desde = addDays(weekStart(hoje), -7 * SEMANAS_DE_ATIVIDADE)

  const [vendors, opportunities, activities, commitments, avisos, acoes] = await Promise.all([
    talvez<Vendor[]>(supabase.from('vendors').select('*')),
    talvez<Opportunity[]>(supabase.from('opportunities').select('*')),
    talvez<Activity[]>(
      supabase.from('activities').select('*').gte('activity_date', desde).limit(5000),
    ),
    talvez<Commitment[]>(supabase.from('commitments').select('*').gte('week_of', desde)),
    talvez<{ read: boolean | null }[]>(
      supabase.from('notifications').select('read').gte('created_at', desde),
    ),
    talvez<{ tipo: string; estado: string }[]>(
      supabase.from('ventus_actions').select('tipo, estado').gte('created_at', desde),
    ),
  ])

  // Sin vendedores no hay panel: es la señal de que no hubo red, no de que la
  // empresa se quedó sin equipo.
  if (vendors === null || opportunities === null) {
    return montarPainel(
      {
        vendors: [],
        opportunities: [],
        activities: [],
        commitments: [],
        avisos: null,
        acoesDoVentus: null,
      },
      'offline',
      hoje,
    )
  }

  return montarPainel(
    {
      vendors,
      opportunities,
      activities: activities ?? [],
      commitments: commitments ?? [],
      avisos:
        avisos === null
          ? null
          : { enviados: avisos.length, lidos: avisos.filter((n) => n.read === true).length },
      acoesDoVentus: acoes,
    },
    'servidor',
    hoje,
  )
}

/** El panel sólo se pide cuando quien mira es admin. */
export function usePainelDoGestor(
  ativo: boolean,
  hoje: IsoDate = todayBr(),
): UseQueryResult<PainelDoGestor> {
  return useQuery({
    queryKey: chavesGestor.painel(hoje),
    enabled: ativo,
    queryFn: () => fetchPainelDoGestor(hoje),
    staleTime: 5 * 60_000,
    // Es la única lectura de la app que va a la red: no se reintenta sola.
    retry: false,
    networkMode: 'always',
  })
}

/** Etapas en el orden y con los nombres del proceso. Para los filtros. */
export const ETAPAS_DO_PAINEL = STAGES.map((s) => ({ id: s.id, nome: s.name }))

/** Salud declarada vs. lo que las escalas realmente sostienen. */
export function healthDeclarado(opp: Opportunity): number {
  return calculateHealthScore(opp.scales)
}
