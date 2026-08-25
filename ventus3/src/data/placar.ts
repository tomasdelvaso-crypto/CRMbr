// src/data/placar.ts
// La agregación semanal que pinta el Placar. Todo sale de Dexie: el Placar
// tiene que abrir sin señal como cualquier otra pantalla.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES QUE HACEN A ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NO HAY POSICIONES. Los carriles salen SIEMPRE ordenados alfabéticamente,
//    nunca por porcentaje. Con n=4, ordenar por resultado fabrica un último
//    público permanente que es el 25 % del equipo comercial, sentado en la
//    misma sala. Es la razón entera por la que el placar existe con esta
//    forma; si alguna vez alguien ordena esta lista por `pct`, el diseño se
//    perdió.
//
// 2. NUNCA SE INVENTA UN CERO. Del compañero solo conocemos lo que dejó el
//    snapshot de `rings`. Sin snapshot, el carril dice «sem dados» y se dibuja
//    vacío. Un 0 fabricado es peor que un hueco: acusa a alguien de no haber
//    trabajado cuando lo único que pasó es que su teléfono no sincronizó.
//
// 3. TODA MÉTRICA TRAE SU CUENTA. Cada número viaja con `comoCalculei`: la
//    fórmula, los insumos y la regla que la sostiene. Si el equipo sospecha
//    que los puntos son arbitrarios, el sistema muere en un mes y se lleva
//    puesta la credibilidad del CRM entero.
//
// La largada dotada (2 contactos por día) NO entra en los totales semanales:
// acá se cuenta lo que la persona tocó. El regalo es un mecanismo del anillo
// diario, no un número que se pueda presumir el viernes.

import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  CONTATOS_DE_LARGADA,
  DEFAULT_RING_GOALS,
  TROPHY_HINTS,
  TROPHY_LABELS,
  addDays,
  anelDoDia,
  calcularPADoDia,
  clampMetaNegociada,
  derivarEventos,
  ehDiaUtil,
  formatShortBr,
  metasDaRampa,
  minutosDoDiaBRT,
  semanaDesdeInicio,
  todayBr,
  weekEnd,
  weekStart,
  weekdayBr,
  weeklyTrophies,
  type Activity,
  type Commitment,
  type Cookbook,
  type DailyScore,
  type IsoDate,
  type MetasDosAneis,
  type Touchpoint,
  type TrophyKey,
  type Vendor,
} from '@/core'
import { carregarCarteira, getDb, gravarMeta, lerMeta } from './db'
import type { RingsSnapshot } from './local-types'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Vocabulario
   ══════════════════════════════════════════════════════════════════════════ */

/** Las métricas de «Eu vs eu». PA incluido: es la moneda del juego. */
export type MetricaDoPlacar = 'contato' | 'conversa' | 'avanco' | 'pa'

/**
 * Las métricas de los carriles del time. PA queda fuera A PROPÓSITO: del
 * compañero solo tenemos el snapshot de anillos, y calcularle PA a partir de
 * datos parciales daría siempre ganador al único que sí tiene la cartera
 * completa en este teléfono. Un número inventado es peor que un carril menos.
 */
export type MetricaDeCarril = 'contato' | 'conversa' | 'avanco'

export const METRICAS_DO_PLACAR: readonly MetricaDoPlacar[] = ['contato', 'conversa', 'avanco', 'pa']
export const METRICAS_DE_CARRIL: readonly MetricaDeCarril[] = ['contato', 'conversa', 'avanco']

export const ROTULO_DA_METRICA: Readonly<Record<MetricaDoPlacar, string>> = {
  contato: 'Contatos',
  conversa: 'Conversas',
  avanco: 'Avanços',
  pa: 'Pontos de Avanço',
}

export const DICA_DA_METRICA: Readonly<Record<MetricaDoPlacar, string>> = {
  contato: 'Toques que você executou',
  conversa: 'Interações em que o cliente respondeu',
  avanco: 'Escala movida com evidência ou reunião realizada',
  pa: 'A moeda do jogo, com teto e regra da prova aplicados',
}

/** Semanas de una temporada. El reset es lo único que mantiene el juego vivo. */
export const SEMANAS_POR_TEMPORADA = 4

/* ══════════════════════════════════════════════════════════════════════════
   2 · Las formas que consume la pantalla
   ══════════════════════════════════════════════════════════════════════════ */

export interface LinhaEuVsEu {
  metrica: MetricaDoPlacar
  rotulo: string
  /** Lo hecho en la semana en curso. */
  atual: number
  /** Promedio de las 4 semanas anteriores, con un decimal. */
  media4: number
  /** atual − media4. Puede ser negativo y está bien: es información. */
  delta: number
  /** Meta semanal propia derivada del cookbook. */
  meta: number
  /** 0..1 contra la meta propia, saturado. */
  pct: number
  /** Cuántas semanas anteriores había en Dexie. 0 = todavía no hay contra qué. */
  semanasComparadas: number
  /** Frase narrada: concreta, sin culpa, sin comparar con nadie. */
  narrativa: string
  /** El detalle tocable: fórmula, insumos y regla. */
  comoCalculei: string[]
}

export interface CarrilDoTime {
  vendorName: string
  euMesmo: boolean
  atual: number
  meta: number
  /** 0..1 contra SU meta, no contra la mía. */
  pct: number
  /**
   * false cuando el compañero no dejó snapshot. Se dibuja el carril vacío con
   * «sem dados» — nunca un 0, que sería una acusación.
   */
  temDados: boolean
}

export type OrigemDoTrofeu = 'oficial' | 'previa' | 'aguardando'

export interface TrofeuDaSemana {
  chave: TrophyKey
  rotulo: string
  criterio: string
  vencedor: string | null
  detalhe: string | null
  origem: OrigemDoTrofeu
}

export interface RevelacaoDosTrofeus {
  revelado: boolean
  /** «Sexta, 17h» o «Revelados na sexta às 17h». */
  texto: string
}

export interface MetaColetiva {
  /** Mes civil BRT, YYYY-MM. */
  mes: string
  atual: number
  meta: number
  pct: number
  /** Lo que el equipo votó. Sin voto todavía, lo dice con todas las letras. */
  recompensa: string | null
  comoCalculei: string[]
}

export interface TemporadaAtual {
  numero: number
  semanaNaTemporada: number
  comeca: IsoDate
  termina: IsoDate
  /** Un bilhete por evento de calidad verificado. */
  bilhetes: number
  comoCalculei: string[]
}

export interface RecordeHistorico {
  chave: string
  rotulo: string
  valor: number
  dono: string
  /** Semana (segunda-feira) en que se hizo. */
  semana: IsoDate
  /** true cuando lo derivamos del histórico local y no del servidor. */
  local: boolean
}

export interface CookbookDaSemana {
  metasDiarias: MetasDosAneis
  metasSemanais: MetasDosAneis
  /** 'negociado' cuando la persona lo fijó en el ritual de segunda. */
  origem: 'negociado' | 'rampa'
  semanaDaRampa: number
  fraseGoldenHour: string | null
}

export interface PlacarSemana {
  semana: IsoDate
  fim: IsoDate
  rotuloSemana: string
  /** Días hábiles de la semana, ya sin feriados. */
  diasUteis: IsoDate[]
  cookbook: CookbookDaSemana
  euVsEu: LinhaEuVsEu[]
  carris: Record<MetricaDeCarril, CarrilDoTime[]>
  trofeus: TrofeuDaSemana[]
  revelacao: RevelacaoDosTrofeus
  metaColetiva: MetaColetiva
  temporada: TemporadaAtual
  recordes: RecordeHistorico[]
  /** PA de la semana, ya con techos y regla de la prueba aplicados. */
  paDaSemana: number
  /** Eventos que esperan artefacto. Se dicen: no acreditan pero existen. */
  pendentesDeProva: number
  /**
   * true cuando en Dexie no hay NADA todavía. Distingue «a semana começou
   * agora» de «a carteira ainda não baixou», que no es lo mismo y no se puede
   * contar igual.
   */
  carteiraVazia: boolean
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Cookbook: la meta propia
   ══════════════════════════════════════════════════════════════════════════ */

export function chaveCookbook(vendor: string): string {
  return `jogo:cookbook:${vendor}`
}

/** Fecha en que el juego arrancó para esta persona. Ancla de la rampa. */
export function chaveInicioDoJogo(vendor: string): string {
  return `jogo:inicio:${vendor}`
}

/**
 * La meta semanal propia.
 *
 * Si la persona negoció su cookbook en el ritual de segunda, manda el suyo —
 * la autonomía sobre la meta es lo que separa gamificación de vigilancia.
 * Si no, la rampa 4 → 8 → 12 calibrada contra el baseline real del equipo
 * (12 toques por semana para los cuatro, mediana de 17 semanas). Poner 12/día
 * en la semana 1 sería 20× el baseline y el equipo lo lee como ficción.
 */
export async function lerCookbookDaSemana(
  vendor: string,
  hoje: IsoDate = todayBr(),
  diasUteis = 5,
): Promise<CookbookDaSemana> {
  const [guardado, inicioGuardado] = await Promise.all([
    lerMeta<Cookbook>(chaveCookbook(vendor)),
    lerMeta<IsoDate>(chaveInicioDoJogo(vendor)),
  ])

  const inicio = inicioGuardado ?? weekStart(hoje)
  if (inicioGuardado === undefined) await gravarMeta(chaveInicioDoJogo(vendor), inicio)

  const semanaDaRampa = semanaDesdeInicio(inicio, hoje)
  const rampa = metasDaRampa(semanaDaRampa)
  const dias = Math.max(1, diasUteis)

  if (!guardado) {
    return {
      metasDiarias: rampa,
      metasSemanais: {
        contato: rampa.contato * dias,
        conversa: rampa.conversa * dias,
        avanco: rampa.avanco * dias,
      },
      origem: 'rampa',
      semanaDaRampa,
      fraseGoldenHour: null,
    }
  }

  // El cookbook se guarda en semanal (es como se negocia) y se baja a diario
  // dividiendo por los días hábiles reales de ESTA semana: en una semana con
  // feriado la meta diaria no puede subir por accidente.
  const semanais: MetasDosAneis = {
    contato: Math.max(1, Math.round(guardado.touches_per_week)),
    conversa: Math.max(1, Math.round(guardado.conversations_per_week)),
    avanco: Math.max(1, Math.round(guardado.advances_per_week)),
  }
  return {
    metasDiarias: {
      contato: Math.max(1, Math.round(semanais.contato / dias)),
      conversa: Math.max(1, Math.round(semanais.conversa / dias)),
      avanco: Math.max(1, Math.round(semanais.avanco / dias)),
    },
    metasSemanais: semanais,
    origem: 'negociado',
    semanaDaRampa,
    fraseGoldenHour: guardado.golden_hour_cue,
  }
}

/**
 * Guarda el cookbook negociado. El ±30 % no es decorativo: fuera de esa banda
 * no es una meta negociada, es otra cosa. `clampMetaNegociada` lo impone.
 */
export async function gravarCookbook(
  vendor: string,
  proposta: MetasDosAneis,
  escolhida: MetasDosAneis,
  fraseGoldenHour: string | null,
): Promise<Cookbook> {
  const anterior = await lerMeta<Cookbook>(chaveCookbook(vendor))
  const cookbook: Cookbook = {
    vendor,
    touches_per_week: clampMetaNegociada(proposta.contato, escolhida.contato),
    conversations_per_week: clampMetaNegociada(proposta.conversa, escolhida.conversa),
    meetings_per_week: anterior?.meetings_per_week ?? 1,
    advances_per_week: clampMetaNegociada(proposta.avanco, escolhida.avanco),
    golden_hour_cue: fraseGoldenHour,
    golden_hour_days: anterior?.golden_hour_days ?? [2, 3, 4, 5, 6],
    golden_hour_start: anterior?.golden_hour_start ?? '16:00',
  }
  await gravarMeta(chaveCookbook(vendor), cookbook)
  return cookbook
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Agregación de una semana
   ══════════════════════════════════════════════════════════════════════════ */

/** Días hábiles de la semana de `iso`, ya sin fines de semana ni feriados. */
export function diasUteisDaSemana(iso: IsoDate): IsoDate[] {
  const inicio = weekStart(iso)
  const dias: IsoDate[] = []
  for (let i = 0; i < 7; i += 1) {
    const dia = addDays(inicio, i)
    if (ehDiaUtil(dia)) dias.push(dia)
  }
  return dias
}

interface TotaisDaSemana {
  contato: number
  conversa: number
  avanco: number
  pa: number
  pendentes: number
  scores: DailyScore[]
}

function doDia(linhas: readonly Activity[], dia: IsoDate): Activity[] {
  return linhas.filter((a) => (a.activity_date ?? a.created_at ?? '').startsWith(dia))
}

function toquesDoDia(linhas: readonly Touchpoint[], dia: IsoDate): Touchpoint[] {
  return linhas.filter((t) => t.executed_at.startsWith(dia))
}

/**
 * Suma una semana de la cartera propia.
 *
 * La largada dotada se RESTA: `anelDoDia` la incluye porque el anillo diario
 * la regala, pero un total semanal con 10 contactos que nadie hizo sería un
 * número que la persona no puede defender delante de sus compañeros.
 */
function somarSemana(
  vendor: string,
  dias: readonly IsoDate[],
  activities: readonly Activity[],
  touchpoints: readonly Touchpoint[],
  commitments: readonly Commitment[],
  metas: MetasDosAneis,
): TotaisDaSemana {
  let contato = 0
  let conversa = 0
  let avanco = 0
  let pa = 0
  let pendentes = 0
  const scores: DailyScore[] = []

  for (const dia of dias) {
    const acts = doDia(activities, dia)
    const tps = toquesDoDia(touchpoints, dia)
    const anel = anelDoDia(acts, metas, tps)

    const contatosDoDia = Math.max(0, anel.contato.current - CONTATOS_DE_LARGADA)
    contato += contatosDoDia
    conversa += anel.conversa.current
    avanco += anel.avanco.current

    const eventos = derivarEventos(vendor, dia, acts, tps, [])
    const dodia = calcularPADoDia(eventos, dia)
    pa += dodia.total
    pendentes += dodia.pendentes

    scores.push({
      vendor,
      date: dia,
      rings: {
        contato: { key: 'contato', current: contatosDoDia, goal: metas.contato, ratio: Math.min(1, contatosDoDia / Math.max(1, metas.contato)) },
        conversa: anel.conversa,
        avanco: anel.avanco,
      },
      points: dodia.total,
      streak: 0,
      shields: 0,
    })
  }

  // Los compromisos se cuentan UNA vez por semana, no una vez por día: son de
  // la semana (week_of), no de una fecha, y contarlos por día los multiplicaría.
  const semana = dias[0] ?? todayBr()
  const cumpridos = commitments.filter((c) => c.status === 'done')
  if (cumpridos.length > 0) {
    const eventos = derivarEventos(vendor, semana, [], [], cumpridos)
    const extra = calcularPADoDia(eventos, semana)
    pa += extra.total
    pendentes += extra.pendentes
    const ultimo = scores[scores.length - 1]
    if (ultimo) ultimo.points += extra.total
  }

  return { contato, conversa, avanco, pa, pendentes, scores }
}

/** El valor de una métrica dentro de los totales. */
function valorDaMetrica(t: TotaisDaSemana, m: MetricaDoPlacar): number {
  if (m === 'pa') return t.pa
  return t[m]
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Los troféus y su revelación
   ══════════════════════════════════════════════════════════════════════════ */

/** Hora en que se revelan los troféus: sexta, 17h de São Paulo. */
export const HORA_DA_REVELACAO = 17

export function chaveTrofeus(semana: IsoDate): string {
  return `jogo:trofeus:${semana}`
}

/**
 * ¿Ya se revelaron los de esta semana?
 *
 * Sexta 17h en adelante, y todo el fin de semana (weekStart(domingo) devuelve
 * la segunda de la semana que acaba de terminar, así que sábado y domingo
 * siguen mirando la misma semana ya cerrada).
 */
export function revelacaoDosTrofeus(
  hoje: IsoDate = todayBr(),
  agora: Date = new Date(),
): RevelacaoDosTrofeus {
  const wd = weekdayBr(hoje)
  const minutos = minutosDoDiaBRT(agora)
  const revelado = wd === 0 || wd === 6 || (wd === 5 && minutos >= HORA_DA_REVELACAO * 60)
  return {
    revelado,
    texto: revelado ? 'Revelados na sexta, 17h' : 'Os cinco saem sexta, às 17h',
  }
}

interface TrofeuGuardado {
  trophy: TrophyKey
  vendor: string
  detail: string
}

function montarTrofeus(
  oficiais: readonly TrofeuGuardado[] | undefined,
  previa: ReadonlyArray<{ trophy: TrophyKey; vendor: string; detail: string }>,
  revelado: boolean,
): TrofeuDaSemana[] {
  const fonte = oficiais && oficiais.length > 0 ? oficiais : revelado ? previa : []
  const origem: OrigemDoTrofeu =
    oficiais && oficiais.length > 0 ? 'oficial' : revelado && previa.length > 0 ? 'previa' : 'aguardando'
  const porChave = new Map(fonte.map((t) => [t.trophy, t]))

  return (Object.keys(TROPHY_LABELS) as TrophyKey[]).map((chave) => {
    const achado = porChave.get(chave)
    return {
      chave,
      rotulo: TROPHY_LABELS[chave],
      criterio: TROPHY_HINTS[chave],
      vencedor: achado?.vendor ?? null,
      detalhe: achado?.detail ?? null,
      origem: achado ? origem : 'aguardando',
    }
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Meta coletiva, temporada y récords
   ══════════════════════════════════════════════════════════════════════════ */

export interface MetaColetivaGuardada {
  mes: string
  meta: number
  recompensa: string | null
}

export function chaveMetaColetiva(mes: string): string {
  return `jogo:meta-coletiva:${mes}`
}

export function chaveRecordes(): string {
  return 'jogo:recordes'
}

export function chaveInicioDaTemporada(): string {
  return 'jogo:temporada:inicio'
}

/**
 * Meta por defecto del mes, POR VENDEDOR activo. Cinco eventos de calidad —
 * reuniones realizadas y etapas avanzadas — es exigente contra el baseline
 * real del equipo sin ser ficción. El equipo la sobreescribe cuando la vota.
 */
export const META_COLETIVA_POR_VENDEDOR = 5

/* ══════════════════════════════════════════════════════════════════════════
   7 · fetchPlacarSemana
   ══════════════════════════════════════════════════════════════════════════ */

export async function fetchPlacarSemana(
  vendor: string,
  hoje: IsoDate = todayBr(),
  agora: Date = new Date(),
): Promise<PlacarSemana> {
  const semana = weekStart(hoje)
  const fim = weekEnd(hoje)
  const dias = diasUteisDaSemana(hoje)

  const carteira = await carregarCarteira(vendor)
  const cookbook = await lerCookbookDaSemana(vendor, hoje, dias.length)

  const compromissosDaSemana = carteira.commitments.filter((c) => c.week_of?.startsWith(semana))
  const atual = somarSemana(
    vendor,
    dias,
    carteira.activities,
    carteira.touchpoints,
    compromissosDaSemana,
    cookbook.metasDiarias,
  )

  // Las 4 semanas anteriores. Dexie retiene 90 días de actividades, así que
  // las cuatro entran siempre; si alguna no tiene nada, no se promedia con 0
  // inventado: se cuenta cuántas había de verdad (semanasComparadas).
  const anteriores: TotaisDaSemana[] = []
  for (let i = 1; i <= 4; i += 1) {
    const inicio = addDays(semana, -7 * i)
    const diasAnt = diasUteisDaSemana(inicio)
    if (diasAnt.length === 0) continue
    const comps = carteira.commitments.filter((c) => c.week_of?.startsWith(inicio))
    anteriores.push(
      somarSemana(vendor, diasAnt, carteira.activities, carteira.touchpoints, comps, cookbook.metasDiarias),
    )
  }
  const comDados = anteriores.filter(
    (t) => t.contato + t.conversa + t.avanco + t.pa > 0,
  )

  const euVsEu: LinhaEuVsEu[] = METRICAS_DO_PLACAR.map((m) =>
    montarLinha(m, atual, comDados, cookbook, dias.length),
  )

  /* ── Carriles del time ───────────────────────────────────────────────── */

  const db = getDb()
  const [vendedores, snapshots] = await Promise.all([
    db.vendors.toArray(),
    db.rings.where('day').between(semana, fim, true, true).toArray(),
  ])

  const carris = montarCarris(vendor, vendedores, snapshots, atual, cookbook)

  /* ── Troféus ─────────────────────────────────────────────────────────── */

  const revelacao = revelacaoDosTrofeus(hoje, agora)
  const oficiais = await lerMeta<TrofeuGuardado[]>(chaveTrofeus(semana))
  const porVendedor = montarScoresDoTime(vendor, atual, vendedores, snapshots, cookbook)
  const previa = weeklyTrophies(porVendedor)
  const trofeus = montarTrofeus(oficiais, previa, revelacao.revelado)

  /* ── Meta coletiva del mes ───────────────────────────────────────────── */

  const mes = hoje.slice(0, 7)
  const metaColetiva = await montarMetaColetiva(
    mes,
    carteira.activities,
    snapshots,
    vendedores.length,
  )

  /* ── Temporada ───────────────────────────────────────────────────────── */

  const temporada = await montarTemporada(semana, atual, hoje)

  /* ── Récords ─────────────────────────────────────────────────────────── */

  const recordes = await montarRecordes(vendor, carteira.activities, carteira.touchpoints, cookbook)

  return {
    semana,
    fim,
    rotuloSemana: `${formatShortBr(semana)} a ${formatShortBr(fim)}`,
    diasUteis: dias,
    cookbook,
    euVsEu,
    carris,
    trofeus,
    revelacao,
    metaColetiva,
    temporada,
    recordes,
    paDaSemana: atual.pa,
    pendentesDeProva: atual.pendentes,
    carteiraVazia: carteira.opportunities.length === 0 && carteira.leads.length === 0,
  }
}

/* ── Piezas de fetchPlacarSemana ─────────────────────────────────────────── */

function metaSemanalDe(m: MetricaDoPlacar, cookbook: CookbookDaSemana): number {
  if (m === 'pa') {
    // La meta de PA no se declara: se deriva de la meta de conducta, con el
    // peso de cada evento de la tabla. 3 PA por toque, 25 por compromiso
    // cumplido, 40 por reunião. Es una referencia, no una vara.
    return Math.max(
      1,
      cookbook.metasSemanais.contato * 3 + cookbook.metasSemanais.avanco * 40,
    )
  }
  return Math.max(1, cookbook.metasSemanais[m])
}

function montarLinha(
  m: MetricaDoPlacar,
  atual: TotaisDaSemana,
  anteriores: readonly TotaisDaSemana[],
  cookbook: CookbookDaSemana,
  diasUteis: number,
): LinhaEuVsEu {
  const valor = valorDaMetrica(atual, m)
  const valores = anteriores.map((t) => valorDaMetrica(t, m))
  const media =
    valores.length === 0 ? 0 : Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10
  const delta = Math.round((valor - media) * 10) / 10
  const meta = metaSemanalDe(m, cookbook)

  return {
    metrica: m,
    rotulo: ROTULO_DA_METRICA[m],
    atual: valor,
    media4: media,
    delta,
    meta,
    pct: Math.min(1, valor / meta),
    semanasComparadas: valores.length,
    narrativa: narrar(m, valor, media, delta, valores.length),
    comoCalculei: explicar(m, atual, valores, meta, cookbook, diasUteis),
  }
}

/**
 * La frase de cada métrica. Ventus es narrador, no capataz: celebra en
 * concreto, y cuando el número baja no reprocha — describe y ofrece.
 */
function narrar(
  m: MetricaDoPlacar,
  valor: number,
  media: number,
  delta: number,
  semanas: number,
): string {
  const nome = ROTULO_DA_METRICA[m].toLowerCase()
  if (semanas === 0) {
    return valor === 0
      ? `Primeira semana medida em ${nome}. O número de hoje vira a sua régua.`
      : `${valor} em ${nome} — esta é a marca de partida da sua régua.`
  }
  if (delta > 0) {
    return `${valor} em ${nome}: ${formatarDelta(delta)} acima da sua média de ${media}.`
  }
  if (delta === 0) {
    return `${valor} em ${nome}, na sua média de ${media}. Semana constante.`
  }
  return `${valor} em ${nome}. Sua média é ${media} — a semana ainda tem espaço.`
}

function formatarDelta(delta: number): string {
  const abs = Math.abs(delta)
  return Number.isInteger(abs) ? `${abs}` : abs.toFixed(1).replace('.', ',')
}

/**
 * El detalle tocable. Cada línea tiene que poder discutirse con el número en
 * la mano: de dónde salió, con qué regla y contra qué se compara.
 */
function explicar(
  m: MetricaDoPlacar,
  atual: TotaisDaSemana,
  valores: readonly number[],
  meta: number,
  cookbook: CookbookDaSemana,
  diasUteis: number,
): string[] {
  const linhas: string[] = []

  if (m === 'pa') {
    linhas.push('Somei os Pontos de Avanço de cada dia útil da semana, com as regras vigentes.')
    linhas.push('Cada evento passa por três filtros, nesta ordem: valor da tabela → regra da prova (acima de 20 PA exige artefato) → teto diário.')
    linhas.push('Toque de cadência 3 PA (teto 45/dia) · reunião realizada 40 · etapa avançada com gate 60 · compromisso cumprido 25 · sinal do comprador 15 a 50.')
    if (atual.pendentes > 0) {
      linhas.push(`${atual.pendentes} evento(s) estão aguardando evidência e ainda não creditaram. Anexe o áudio, o nome com cargo ou a data combinada e eles entram.`)
    }
    linhas.push(`Referência da semana: ${meta} PA, derivada da sua meta de conduta (${cookbook.metasSemanais.contato} toques × 3 + ${cookbook.metasSemanais.avanco} avanços × 40).`)
  } else if (m === 'contato') {
    linhas.push('Contei os toques executados: touchpoints de cadência mais as atividades de contato (ligação, WhatsApp, e-mail, reunião, visita).')
    linhas.push(`Não incluí os ${CONTATOS_DE_LARGADA} contatos de largada de cada dia — aquilo é um presente do anel diário, não um toque que você deu.`)
    linhas.push('Notas e registros internos ficam de fora: registrar não é tocar.')
  } else if (m === 'conversa') {
    linhas.push('Conversa é interação em que o outro lado respondeu: reunião, ligação atendida, ou mensagem com resultado positivo ou negativo.')
    linhas.push('Mensagem sem resposta não conta. É o critério que impede o placar de premiar atividade vazia.')
  } else {
    linhas.push('Avanço é o que move o negócio: reunião realizada, mudança de etapa, ou escala movida com evidência.')
    linhas.push('Um avanço por dia já fecha o anel. É de propósito: é a métrica mais difícil de fabricar e a única que importa sozinha.')
  }

  linhas.push(`Semana de ${diasUteis} dias úteis (fins de semana e feriados de SP fora).`)

  if (valores.length === 0) {
    linhas.push('Ainda não há semanas anteriores registradas para comparar. A média aparece na próxima.')
  } else {
    linhas.push(`Média das ${valores.length} semana(s) anteriores: ${valores.join(' · ')} → média ${Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10}.`)
  }

  if (m !== 'pa') {
    linhas.push(
      cookbook.origem === 'negociado'
        ? `Meta de ${meta}: a que você negociou na segunda.`
        : `Meta de ${meta}: rampa da semana ${cookbook.semanaDaRampa} (${cookbook.metasDiarias[m]}/dia × ${diasUteis} dias). Você negocia a sua no ritual de segunda.`,
    )
  }
  return linhas
}

/**
 * Los cuatro carriles.
 *
 * ORDEN ALFABÉTICO, SIEMPRE. No ordenar por porcentaje no es un descuido:
 * es la decisión de producto entera. Ver la cabecera del archivo.
 */
function montarCarris(
  vendor: string,
  vendedores: readonly Vendor[],
  snapshots: readonly RingsSnapshot[],
  atual: TotaisDaSemana,
  cookbook: CookbookDaSemana,
): Record<MetricaDeCarril, CarrilDoTime[]> {
  const nomes = vendedores
    .filter((v) => v.is_active !== false)
    .map((v) => v.name)
  if (!nomes.includes(vendor)) nomes.push(vendor)
  nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const porVendedor = new Map<string, RingsSnapshot[]>()
  for (const s of snapshots) {
    const lista = porVendedor.get(s.vendor) ?? []
    lista.push(s)
    porVendedor.set(s.vendor, lista)
  }

  const carril = (m: MetricaDeCarril): CarrilDoTime[] =>
    nomes.map((nome) => {
      if (nome === vendor) {
        const meta = Math.max(1, cookbook.metasSemanais[m])
        const valor = valorDaMetrica(atual, m)
        return { vendorName: nome, euMesmo: true, atual: valor, meta, pct: Math.min(1, valor / meta), temDados: true }
      }
      const dias = porVendedor.get(nome) ?? []
      if (dias.length === 0) {
        // Sin snapshot no hay número. Se dibuja vacío y se dice «sem dados».
        return { vendorName: nome, euMesmo: false, atual: 0, meta: 1, pct: 0, temDados: false }
      }
      const valor = dias.reduce((s, d) => {
        if (m === 'contato') return s + Math.max(0, d.contatos - CONTATOS_DE_LARGADA)
        if (m === 'conversa') return s + d.conversas
        return s + d.avancos
      }, 0)
      const meta = Math.max(
        1,
        dias.reduce((s, d) => s + (d.metas[m] ?? DEFAULT_RING_GOALS[m]), 0),
      )
      return { vendorName: nome, euMesmo: false, atual: valor, meta, pct: Math.min(1, valor / meta), temDados: true }
    })

  return { contato: carril('contato'), conversa: carril('conversa'), avanco: carril('avanco') }
}

/**
 * Los DailyScore por vendedor que alimentan `weeklyTrophies`.
 * Del compañero solo entran los días con snapshot: sin dato no se compite.
 */
function montarScoresDoTime(
  vendor: string,
  atual: TotaisDaSemana,
  vendedores: readonly Vendor[],
  snapshots: readonly RingsSnapshot[],
  cookbook: CookbookDaSemana,
): Record<string, DailyScore[]> {
  const out: Record<string, DailyScore[]> = { [vendor]: atual.scores }

  for (const v of vendedores) {
    if (v.name === vendor) continue
    const dias = snapshots.filter((s) => s.vendor === v.name)
    if (dias.length === 0) continue
    out[v.name] = dias.map((d) => ({
      vendor: v.name,
      date: d.day,
      rings: {
        contato: linhaDeAnel('contato', Math.max(0, d.contatos - CONTATOS_DE_LARGADA), d.metas.contato ?? cookbook.metasDiarias.contato),
        conversa: linhaDeAnel('conversa', d.conversas, d.metas.conversa ?? cookbook.metasDiarias.conversa),
        avanco: linhaDeAnel('avanco', d.avancos, d.metas.avanco ?? cookbook.metasDiarias.avanco),
      },
      // PA del compañero: desconocido. Cero acá NO se muestra como cero en
      // ningún lado — solo hace que el trofeu Motor no se le asigne por un
      // número que no tenemos.
      points: 0,
      streak: 0,
      shields: 0,
    }))
  }
  return out
}

function linhaDeAnel(key: 'contato' | 'conversa' | 'avanco', current: number, goal: number) {
  const meta = Math.max(1, goal)
  return { key, current, goal: meta, ratio: Math.min(1, current / meta) } as const
}

async function montarMetaColetiva(
  mes: string,
  activities: readonly Activity[],
  snapshots: readonly RingsSnapshot[],
  vendedores: number,
): Promise<MetaColetiva> {
  const guardada = await lerMeta<MetaColetivaGuardada>(chaveMetaColetiva(mes))
  const meta = Math.max(
    1,
    guardada?.meta ?? META_COLETIVA_POR_VENDEDOR * Math.max(1, vendedores),
  )

  // Solo eventos de CALIDAD: reunião realizada, mudança de etapa. Los toques
  // no suman — si sumaran, la barra colectiva se llenaría con volumen y sería
  // la misma trampa que la barra existe para evitar.
  const meus = activities.filter((a) => {
    const data = a.activity_date ?? a.created_at ?? ''
    if (!data.startsWith(mes)) return false
    if (a.activity_type === 'stage_change') return true
    return (
      (a.activity_type === 'meeting' || a.activity_type === 'demo' || a.activity_type === 'test') &&
      (a.result === 'positivo' || a.result === 'neutro')
    )
  }).length

  const doTime = snapshots
    .filter((s) => s.day.startsWith(mes))
    .reduce((s, d) => s + d.avancos, 0)

  const atual = meus + doTime
  return {
    mes,
    atual,
    meta,
    pct: Math.min(1, atual / meta),
    recompensa: guardada?.recompensa ?? null,
    comoCalculei: [
      'Só entram eventos de qualidade: reunião realizada, demo ou teste com resultado, e etapa avançada.',
      'Toques de cadência NÃO somam aqui. Se somassem, a barra encheria com volume e deixaria de significar alguma coisa.',
      `Do seu lado: ${meus} evento(s) no mês.`,
      doTime > 0
        ? `Do resto do time, pelos snapshots que chegaram: ${doTime}.`
        : 'Do resto do time ainda não chegou snapshot deste mês — o número sobe quando os telefones sincronizarem.',
      guardada?.recompensa
        ? `Recompensa votada: ${guardada.recompensa}.`
        : 'A recompensa dos 100% ainda não foi votada. O catálogo está em Ajustes.',
    ],
  }
}

async function montarTemporada(
  semana: IsoDate,
  atual: TotaisDaSemana,
  hoje: IsoDate,
): Promise<TemporadaAtual> {
  const guardado = await lerMeta<IsoDate>(chaveInicioDaTemporada())
  const inicio = guardado ?? semana
  if (guardado === undefined) await gravarMeta(chaveInicioDaTemporada(), inicio)

  const semanasCorridas = Math.max(0, Math.floor(Math.max(0, semanaDesdeInicio(inicio, hoje) - 1)))
  const numero = Math.floor(semanasCorridas / SEMANAS_POR_TEMPORADA) + 1
  const semanaNaTemporada = (semanasCorridas % SEMANAS_POR_TEMPORADA) + 1
  const comeca = addDays(inicio, (numero - 1) * SEMANAS_POR_TEMPORADA * 7)
  const termina = addDays(comeca, SEMANAS_POR_TEMPORADA * 7 - 3)

  // Un bilhete por evento de calidad verificado. Los avanços de la semana son
  // exactamente eso: reunião realizada, etapa movida o escala con evidencia.
  const bilhetes = atual.avanco

  return {
    numero,
    semanaNaTemporada,
    comeca,
    termina,
    bilhetes,
    comoCalculei: [
      `Temporada ${numero}, semana ${semanaNaTemporada} de ${SEMANAS_POR_TEMPORADA}.`,
      'Cada evento de qualidade verificado desta semana vale um bilhete: reunião realizada, etapa avançada ou escala movida com evidência.',
      `Você tem ${bilhetes} bilhete(s) desta semana no sorteio do fim da temporada.`,
      'Quem trabalhou mais tem mais chance, nunca a certeza — e quem começou devagar segue com motivo na semana 4.',
      'No fim da temporada os PA da temporada zeram. Os históricos e os recordes não zeram nunca.',
    ],
  }
}

interface RecordeGuardado {
  chave: string
  rotulo: string
  valor: number
  dono: string
  semana: IsoDate
}

async function montarRecordes(
  vendor: string,
  activities: readonly Activity[],
  touchpoints: readonly Touchpoint[],
  cookbook: CookbookDaSemana,
): Promise<RecordeHistorico[]> {
  const doServidor = await lerMeta<RecordeGuardado[]>(chaveRecordes())
  if (doServidor && doServidor.length > 0) {
    return doServidor.map((r) => ({ ...r, local: false }))
  }

  // Sin récords del servidor, derivamos los propios de lo que hay en Dexie.
  // Es la ÚNICA lista ordenada del producto, y por eso mismo tiene que ser de
  // marcas históricas —que rara vez cambian de dueño— y nunca de personas.
  const semanas = new Map<IsoDate, { contato: number; conversa: number; avanco: number }>()
  const tocar = (data: string, campo: 'contato' | 'conversa' | 'avanco', n = 1): void => {
    if (data === '') return
    const s = weekStart(data.slice(0, 10))
    const linha = semanas.get(s) ?? { contato: 0, conversa: 0, avanco: 0 }
    linha[campo] += n
    semanas.set(s, linha)
  }

  for (const dia of new Set(
    [...activities.map((a) => (a.activity_date ?? a.created_at ?? '').slice(0, 10)), ...touchpoints.map((t) => t.executed_at.slice(0, 10))].filter(
      (d) => d !== '',
    ),
  )) {
    const anel = anelDoDia(doDia(activities, dia), cookbook.metasDiarias, toquesDoDia(touchpoints, dia))
    tocar(dia, 'contato', Math.max(0, anel.contato.current - CONTATOS_DE_LARGADA))
    tocar(dia, 'conversa', anel.conversa.current)
    tocar(dia, 'avanco', anel.avanco.current)
  }

  const melhor = (campo: 'contato' | 'conversa' | 'avanco'): RecordeHistorico | null => {
    let top: { semana: IsoDate; valor: number } | null = null
    for (const [s, linha] of semanas) {
      if (top === null || linha[campo] > top.valor) top = { semana: s, valor: linha[campo] }
    }
    if (!top || top.valor === 0) return null
    return {
      chave: `semana-${campo}`,
      rotulo: `Melhor semana em ${ROTULO_DA_METRICA[campo].toLowerCase()}`,
      valor: top.valor,
      dono: vendor,
      semana: top.semana,
      local: true,
    }
  }

  return (['contato', 'conversa', 'avanco'] as const)
    .map(melhor)
    .filter((r): r is RecordeHistorico => r !== null)
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · Hook
   ══════════════════════════════════════════════════════════════════════════ */

export const chavesPlacar = {
  semana: (vendor: string, semana: IsoDate) => ['placar', vendor, semana, 'semana'] as const,
}

export function usePlacarSemana(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<PlacarSemana> {
  return useQuery({
    queryKey: chavesPlacar.semana(vendor ?? '', weekStart(hoje)),
    enabled: vendor !== null,
    queryFn: () => fetchPlacarSemana(vendor as string, hoje),
  })
}
