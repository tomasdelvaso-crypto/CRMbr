// src/core/dates.ts
// Fechas en huso America/Sao_Paulo, a prueba de DST y del corrimiento de
// medianoche que produce new Date('YYYY-MM-DD') (que parsea en UTC).
// Port de ventus-bot/lib/dates.js.
//
// ESTRATEGIA (importante, todo lo demás depende de esto):
//   1) Una "fecha civil" es siempre el string YYYY-MM-DD tal como lo ve un
//      brasileño. Nunca un Date.
//   2) Para hacer aritmética sobre fechas civiles anclamos en las 12:00 UTC.
//      Brasil vive entre UTC-2 y UTC-5 en toda su historia, así que el mediodía
//      UTC nunca cae en otro día civil y sumar/restar días jamás se corre,
//      exista o no horario de verano. Brasil abolió el DST en 2019, pero las
//      oportunidades del CRM tienen fechas de 2018 y la racha mira hacia atrás.
//   3) Para pasar de instante real (Date) a fecha civil usamos Intl, que es la
//      única fuente correcta de la conversión.

import type { IsoDate, IsoDateTime } from './types'

export const BR_TIMEZONE = 'America/Sao_Paulo'

/** Atajos de fecha que ofrece el gate de próxima acción (nunca texto libre). */
export type DateShortcut = 'hoje' | 'amanha' | 'segunda' | 'mais7' | 'escolher'

const MS_POR_DIA = 86_400_000

/** dom..sáb — el orden de Date.getUTCDay(). */
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
const DIAS_LONGOS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

/** Formateador cacheado: crear un Intl.DateTimeFormat por llamada es caro. */
const FMT_DATA_BR = new Intl.DateTimeFormat('en-CA', {
  timeZone: BR_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const FMT_HORA_BR = new Intl.DateTimeFormat('en-GB', {
  timeZone: BR_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const FMT_OFFSET_BR = new Intl.DateTimeFormat('en-US', {
  timeZone: BR_TIMEZONE,
  timeZoneName: 'longOffset',
})

const RE_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** true si el string es una fecha civil YYYY-MM-DD sintácticamente válida. */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && RE_ISO_DATE.test(value)
}

/* ── Núcleo: fecha civil ⇄ ancla UTC ─────────────────────────────────────── */

/**
 * Ancla de una fecha civil: el Date de las 12:00 UTC de ese día.
 * Solo para aritmética interna — nunca lo expongas como "el momento".
 */
function ancla(iso: IsoDate): Date {
  const m = RE_ISO_DATE.exec(iso)
  if (!m) throw new RangeError(`Data civil inválida: ${String(iso)}`)
  const [, y, mo, d] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0))
}

/** Vuelve de un ancla UTC a la fecha civil. */
function desdeAncla(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

/** Hoy en BRT como YYYY-MM-DD. */
export function todayBr(now: Date = new Date()): IsoDate {
  return FMT_DATA_BR.format(now)
}

/** Alias PT-BR de todayBr(). */
export const hojeBRT = todayBr

/** Convierte un instante a la fecha civil BRT (YYYY-MM-DD). */
export function toBrDate(value: Date | IsoDateTime | IsoDate): IsoDate {
  if (value instanceof Date) return FMT_DATA_BR.format(value)
  // Ya es fecha civil: devolverla tal cual evita reinterpretarla como UTC.
  if (isIsoDate(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new RangeError(`Data inválida: ${String(value)}`)
  return FMT_DATA_BR.format(d)
}

/** Parsea YYYY-MM-DD como mediodía BRT: evita el salto de día por UTC. */
export function parseBrDate(iso: IsoDate): Date {
  return ancla(iso)
}

/** Offset vigente del huso en ese instante, ej. '-03:00'. */
export function brOffset(now: Date = new Date()): string {
  const parte = FMT_OFFSET_BR.formatToParts(now).find((p) => p.type === 'timeZoneName')
  const bruto = parte?.value ?? 'GMT-03:00'
  // 'GMT-03:00' → '-03:00'. 'GMT' (imposible en BR, pero por si acaso) → '+00:00'.
  const sinGmt = bruto.replace('GMT', '')
  return sinGmt === '' ? '+00:00' : sinGmt
}

/**
 * Ahora en BRT, como ISO-8601 con offset real: '2026-08-24T15:04:09-03:00'.
 * Devolver el offset (y no una 'Z' mentirosa) es lo que permite mandarlo a
 * Postgres sin que se corra tres horas.
 */
export function agoraBRT(now: Date = new Date()): IsoDateTime {
  return `${FMT_DATA_BR.format(now)}T${FMT_HORA_BR.format(now)}${brOffset(now)}`
}

/** Minutos desde la medianoche BRT. Lo usa la ventana de la Golden Hour. */
export function minutosDoDiaBRT(now: Date = new Date()): number {
  const [h = '0', m = '0'] = FMT_HORA_BR.format(now).split(':')
  return Number(h) * 60 + Number(m)
}

/** Suma días calendario a una fecha civil, sin romperse en el cambio de DST. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = ancla(iso)
  d.setUTCDate(d.getUTCDate() + Math.trunc(days))
  return desdeAncla(d)
}

/** Días calendario entre dos fechas civiles (b - a). Negativo si b es antes. */
export function daysBetween(a: IsoDate | Date, b: IsoDate | Date): number {
  const da = ancla(toBrDate(a))
  const db = ancla(toBrDate(b))
  return Math.round((db.getTime() - da.getTime()) / MS_POR_DIA)
}

/** Día de la semana de una fecha civil: 0 domingo … 6 sábado. */
export function weekdayBr(iso: IsoDate): number {
  return ancla(iso).getUTCDay()
}

/** true si la fecha es sábado o domingo en BRT. */
export function isWeekend(iso: IsoDate): boolean {
  const wd = weekdayBr(iso)
  return wd === 0 || wd === 6
}

/* ── Feriados ────────────────────────────────────────────────────────────── */

export type HolidayScope = 'nacional' | 'estadual-sp' | 'municipal-sp'

export interface Holiday {
  date: IsoDate
  name: string
  scope: HolidayScope
  /** Los móviles se calculan desde la Páscoa; los fijos son de calendario. */
  movable: boolean
}

/** dd de mes con dos dígitos. */
function dosDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Domingo de Páscoa del año (algoritmo gregoriano anónimo, Meeus/Jones/Butcher).
 * Todo el bloque móvil del calendario brasileño cuelga de esta fecha.
 */
export function pascoa(ano: number): IsoDate {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${dosDigitos(mes)}-${dosDigitos(dia)}`
}

const CACHE_FERIADOS = new Map<number, readonly Holiday[]>()

/**
 * Feriados nacionales + los de São Paulo (estado y ciudad).
 *
 * Se incluyen Carnaval y Corpus Christi aunque sean ponto facultativo: en la
 * práctica no se prospecta esos días y contarlos como hábiles rompería la
 * racha de gente que no hizo nada mal.
 *
 * Consciência Negra (20/11) es feriado nacional desde la Ley 14.759/2023;
 * antes de 2024 solo valía como municipal en la capital paulista.
 */
export function feriadosBR(ano: number): readonly Holiday[] {
  const cacheado = CACHE_FERIADOS.get(ano)
  if (cacheado) return cacheado

  const p = pascoa(ano)
  const lista: Holiday[] = [
    // Fijos nacionales
    { date: `${ano}-01-01`, name: 'Confraternização Universal', scope: 'nacional', movable: false },
    { date: `${ano}-04-21`, name: 'Tiradentes', scope: 'nacional', movable: false },
    { date: `${ano}-05-01`, name: 'Dia do Trabalho', scope: 'nacional', movable: false },
    { date: `${ano}-09-07`, name: 'Independência do Brasil', scope: 'nacional', movable: false },
    { date: `${ano}-10-12`, name: 'Nossa Senhora Aparecida', scope: 'nacional', movable: false },
    { date: `${ano}-11-02`, name: 'Finados', scope: 'nacional', movable: false },
    { date: `${ano}-11-15`, name: 'Proclamação da República', scope: 'nacional', movable: false },
    { date: `${ano}-12-25`, name: 'Natal', scope: 'nacional', movable: false },
    // Móviles (todos relativos a la Páscoa)
    { date: addDays(p, -48), name: 'Carnaval (segunda)', scope: 'nacional', movable: true },
    { date: addDays(p, -47), name: 'Carnaval', scope: 'nacional', movable: true },
    { date: addDays(p, -2), name: 'Sexta-feira Santa', scope: 'nacional', movable: true },
    { date: addDays(p, 60), name: 'Corpus Christi', scope: 'nacional', movable: true },
    // São Paulo
    { date: `${ano}-07-09`, name: 'Revolução Constitucionalista', scope: 'estadual-sp', movable: false },
    { date: `${ano}-01-25`, name: 'Aniversário de São Paulo', scope: 'municipal-sp', movable: false },
  ]

  lista.push({
    date: `${ano}-11-20`,
    name: 'Consciência Negra',
    scope: ano >= 2024 ? 'nacional' : 'municipal-sp',
    movable: false,
  })

  lista.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const congelada: readonly Holiday[] = Object.freeze(lista)
  CACHE_FERIADOS.set(ano, congelada)
  return congelada
}

/** El feriado de esa fecha, o undefined. */
export function feriadoDe(iso: IsoDate): Holiday | undefined {
  const ano = Number(iso.slice(0, 4))
  return feriadosBR(ano).find((f) => f.date === iso)
}

/** true si es feriado nacional o del estado/ciudad de São Paulo. */
export function isBrHoliday(iso: IsoDate): boolean {
  return feriadoDe(iso) !== undefined
}

/** true si es día hábil: ni fin de semana ni feriado. */
export function ehDiaUtil(iso: IsoDate): boolean {
  return !isWeekend(iso) && !isBrHoliday(iso)
}

/** Próximo día hábil BR ESTRICTAMENTE posterior a iso. */
export function nextBusinessDay(iso: IsoDate): IsoDate {
  let cur = addDays(iso, 1)
  // Cota dura: nunca hay 15 días no hábiles seguidos, pero no queremos bucles.
  for (let i = 0; i < 15 && !ehDiaUtil(cur); i += 1) cur = addDays(cur, 1)
  return cur
}

/** Alias PT-BR: próximo día hábil (o el mismo día si ya es hábil). */
export function proximoDiaUtil(iso: IsoDate): IsoDate {
  return ehDiaUtil(iso) ? iso : nextBusinessDay(iso)
}

/**
 * Días hábiles en el intervalo [a, b). Media abierta a propósito: contar
 * "cuántos días hábiles pasaron desde el lunes" no debe incluir hoy.
 * Si b < a devuelve el negativo del intervalo inverso.
 */
export function diasUteisEntre(a: IsoDate, b: IsoDate): number {
  if (a === b) return 0
  if (b < a) return -diasUteisEntre(b, a)
  let n = 0
  let cur = a
  while (cur < b) {
    if (ehDiaUtil(cur)) n += 1
    cur = addDays(cur, 1)
  }
  return n
}

/** Segunda-feira de la semana de esa fecha — clave del ciclo semanal. */
export function weekStart(iso: IsoDate): IsoDate {
  const wd = weekdayBr(iso)
  // Domingo (0) pertenece a la semana que ya terminó: retrocede 6 días.
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

/** Sexta-feira de la semana de esa fecha — cierre del ciclo y de los trofeos. */
export function weekEnd(iso: IsoDate): IsoDate {
  return addDays(weekStart(iso), 4)
}

/* ── Atajos de fecha ─────────────────────────────────────────────────────── */

const NOMES_DIA: Readonly<Record<string, number>> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  terça: 2,
  'terca-feira': 2,
  'terça-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
  sábado: 6,
}

/** Próxima ocurrencia de ese día de la semana, estrictamente futura. */
function proximoDiaDaSemana(desde: IsoDate, alvo: number): IsoDate {
  const atual = weekdayBr(desde)
  const delta = ((alvo - atual + 7) % 7) || 7
  return addDays(desde, delta)
}

/** Resuelve un atajo del gate de fecha a una fecha civil concreta. */
export function resolveShortcut(shortcut: DateShortcut, from?: IsoDate): IsoDate | null {
  const base = from ?? todayBr()
  switch (shortcut) {
    case 'hoje':
      return base
    case 'amanha':
      return addDays(base, 1)
    case 'segunda':
      return proximoDiaDaSemana(base, 1)
    case 'mais7':
      return addDays(base, 7)
    case 'escolher':
      // El usuario abre el date picker: no hay fecha que resolver acá.
      return null
    default:
      return null
  }
}

/**
 * Parser tolerante de atajos escritos a mano o dictados por voz.
 * Acepta: 'hoje', 'amanhã', 'depois de amanhã', 'ontem', 'segunda'…'sexta',
 * '+7d', '-3d', '+2s' (semanas), '15/09', '15/09/2026' y YYYY-MM-DD.
 * Devuelve null cuando no entiende — nunca adivina.
 */
export function parseAtalhoDeData(entrada: string, from?: IsoDate): IsoDate | null {
  const base = from ?? todayBr()
  const t = entrada
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

  if (t === '') return null
  // Ojo: no usar isIsoDate() acá. Como IsoDate es un alias de string, el type
  // predicate narrowea el resto de la función a never y el archivo no compila.
  if (RE_ISO_DATE.test(t)) return t

  if (t === 'hoje' || t === 'hoy') return base
  if (t === 'amanha' || t === 'amanhã' || t === 'manana' || t === 'mañana') return addDays(base, 1)
  if (t === 'ontem' || t === 'ayer') return addDays(base, -1)
  if (t === 'depois de amanha' || t === 'depois de amanhã') return addDays(base, 2)
  if (t === 'proximo dia util' || t === 'próximo dia útil') return nextBusinessDay(base)
  if (t === 'fim de semana') return proximoDiaDaSemana(base, 6)

  // '+7d' / '-3 d' / '+2s' / '+1 semana'
  const rel = /^([+-])\s*(\d{1,3})\s*(d|dias?|s|sem|semanas?|u)$/.exec(t)
  if (rel) {
    const [, signo, cant, unidad] = rel
    const n = Number(cant) * (signo === '-' ? -1 : 1)
    if (unidad === undefined) return null
    if (unidad.startsWith('s')) return addDays(base, n * 7)
    if (unidad === 'u') {
      // Días ÚTILES: '+3u' salta fines de semana y feriados.
      let cur = base
      const paso = n < 0 ? -1 : 1
      for (let i = 0; i < Math.abs(n); i += 1) {
        do {
          cur = addDays(cur, paso)
        } while (!ehDiaUtil(cur))
      }
      return cur
    }
    return addDays(base, n)
  }

  // Día de la semana por nombre, con o sin 'próxima'.
  const semNome = t.replace(/^(na |próxima |proxima |prox |na próxima )/, '')
  const alvo = NOMES_DIA[semNome]
  if (alvo !== undefined) return proximoDiaDaSemana(base, alvo)

  // dd/mm o dd/mm/aaaa
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t)
  if (br) {
    const [, dd, mm, yy] = br
    const dia = Number(dd)
    const mes = Number(mm)
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null
    let ano = Number(base.slice(0, 4))
    if (yy !== undefined) ano = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
    const candidato = `${ano}-${dosDigitos(mes)}-${dosDigitos(dia)}`
    // Sin año explícito y ya pasó: el vendedor quiere decir el año que viene.
    if (yy === undefined && candidato < base) {
      return `${ano + 1}-${dosDigitos(mes)}-${dosDigitos(dia)}`
    }
    return candidato
  }

  return null
}

/* ── Formato ─────────────────────────────────────────────────────────────── */

/** Formato de fecha corto PT-BR: '03/03'. */
export function formatShortBr(iso: IsoDate | IsoDateTime): string {
  const d = toBrDate(iso)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`
}

/**
 * Formato humano de la agenda: 'hoje', 'amanhã', 'ontem', 'seg 15/09'.
 * Es el que va en los chips de prazo — corto y sin ambigüedad.
 */
export function formatarDataCurta(iso: IsoDate | IsoDateTime, hoje?: IsoDate): string {
  const d = toBrDate(iso)
  const base = hoje ?? todayBr()
  const delta = daysBetween(base, d)
  if (delta === 0) return 'hoje'
  if (delta === 1) return 'amanhã'
  if (delta === -1) return 'ontem'
  const dia = DIAS_CURTOS[weekdayBr(d)] ?? ''
  return `${dia} ${formatShortBr(d)}`
}

/** Nombre largo del día en PT-BR, ej. 'terça-feira'. */
export function nomeDoDia(iso: IsoDate): string {
  return DIAS_LONGOS[weekdayBr(iso)] ?? ''
}

/**
 * Nombre corto del día en PT-BR, ej. 'ter'. Lo consume la capa de UI
 * (src/ui/datas.ts) para rotular pastillas de fecha sin volver a construir su
 * propia tabla de días — el calendario civil se define UNA sola vez, acá.
 */
export function nomeCurtoDoDia(iso: IsoDate): string {
  return DIAS_CURTOS[weekdayBr(iso)] ?? ''
}

/** Formato humano PT-BR con pasado explícito: 'hoje', 'há 12 dias', 'em 3 dias'. */
export function formatRelativeBr(iso: IsoDate | IsoDateTime, now: Date = new Date()): string {
  const d = toBrDate(iso)
  const base = todayBr(now)
  const delta = daysBetween(base, d)
  if (delta === 0) return 'hoje'
  if (delta === 1) return 'amanhã'
  if (delta === -1) return 'ontem'
  if (delta < 0) {
    const dias = Math.abs(delta)
    if (dias < 7) return `há ${dias} dias`
    if (dias < 30) return `há ${Math.floor(dias / 7)} sem`
    if (dias < 365) return `há ${Math.floor(dias / 30)} meses`
    return `há ${Math.floor(dias / 365)} anos`
  }
  if (delta < 7) return `em ${delta} dias`
  const dia = DIAS_CURTOS[weekdayBr(d)] ?? ''
  return `${dia} ${formatShortBr(d)}`
}

/** Valor en R$ con separadores PT-BR y sin centavos: 'R$ 1.150.000'. */
export function formatarBRL(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'R$ —'
  return `R$ ${Math.round(valor).toLocaleString('pt-BR')}`
}
