// src/data/ajustes.ts
// Todo lo que la tela Ajustes lee y escribe: cookbook negociado, Golden Hour,
// notificaciones, Telegram, estado de sincronización y las reglas del juego.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTE MÓDULO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. EL COOKBOOK YA VIVE EN `placar.ts` Y NO SE DUPLICA. Ahí están
//    `chaveCookbook`, `lerCookbookDaSemana` y `gravarCookbook`. Acá se agrega
//    lo único que faltaba: de dónde sale la PROPUESTA (el histórico de 4
//    semanas) y la configuración de la Golden Hour, que comparte el mismo
//    registro `Cookbook` de Dexie. Dos llaves distintas para la misma meta
//    serían dos metas, y la de Ajustes contradiría a la del Placar.
//
// 2. LA PROPUESTA SE CUENTA CON `anelDoDia()`, NO CON UN CLASIFICADOR NUEVO.
//    Qué es un contato, qué es una conversa y qué es un avanço ya está
//    decidido en `core/scoring.ts`. Reimplementarlo acá haría que la meta y el
//    anillo que la mide contaran cosas distintas — el defecto exacto que
//    vuelve inútil cualquier meta. Sólo se descuentan los 2 contatos de
//    largada, que son un regalo del día y no historia.
//
// 3. LAS PREFERENCIAS VIVEN EN DEXIE, NO EN EL SERVIDOR. `notification_prefs`
//    existe en la migración 0005 pero NINGUNA migración fue aplicada todavía.
//    Guardar en Dexie hace que Ajustes funcione hoy, offline y en el primer
//    arranque; el día que la tabla exista, `sincronizarPrefs()` es un empujón
//    de una sola dirección y nada de la UI cambia.
//
// 4. EL PERMISO DE NOTIFICACIÓN NUNCA SE PIDE SOLO. `pedirPermissaoDeAviso()`
//    existe para que la pantalla la llame DESDE UN TAP. En iOS, un
//    `Notification.requestPermission()` disparado en un efecto se rechaza en
//    silencio y quema el permiso para siempre: no hay segunda oportunidad.

import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import {
  CONTATOS_DE_LARGADA,
  REGRAS_PADRAO,
  addDays,
  anelDoDia,
  clampMetaNegociada,
  ehDiaUtil,
  metasDaRampa,
  nomeCurtoDoDia,
  semanaDesdeInicio,
  todayBr,
  weekStart,
  type Activity,
  type Cookbook,
  type IsoDate,
  type MetasDosAneis,
  type RegraPA,
  type Touchpoint,
} from '@/core'
import { carregarCarteira, gravarMeta, lerCursor, lerMeta, storageEstimate } from './db'
import { chaveCookbook, chaveInicioDoJogo, gravarCookbook, lerCookbookDaSemana } from './placar'
import { comProblema, flush, pendingCount, storePendentes } from './outbox'
import { TABELAS_SYNC, syncNow } from './sync'
import { supabase } from './supabase'
import type { SyncTable } from './local-types'

/* ══════════════════════════════════════════════════════════════════════════
   0 · Llaves de cache
   ══════════════════════════════════════════════════════════════════════════ */

export const chavesAjustes = {
  cookbook: (vendor: string) => ['ajustes', vendor, 'cookbook'] as const,
  golden: (vendor: string) => ['ajustes', vendor, 'golden'] as const,
  avisos: (vendor: string) => ['ajustes', vendor, 'avisos'] as const,
  telegram: (vendorId: number) => ['ajustes', 'telegram', vendorId] as const,
  sincronizacao: (vendor: string) => ['ajustes', vendor, 'sync'] as const,
  regras: () => ['ajustes', 'regras'] as const,
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · Cookbook: la propuesta sale del histórico de 4 semanas
   ══════════════════════════════════════════════════════════════════════════ */

/** Cuántas semanas cerradas se miran para proponer. */
export const SEMANAS_DE_HISTORICO = 4

/** Banda de negociación sobre la propuesta. Lo impone `clampMetaNegociada`. */
export const BANDA_DE_NEGOCIACAO = 0.3

export interface MetasSemanais extends MetasDosAneis {
  /** Reuniões e demos da semana. No es un anillo: es una meta aparte. */
  reuniao: number
}

export interface SemanaDoHistorico {
  /** Segunda-feira de la semana. */
  semana: IsoDate
  contato: number
  conversa: number
  avanco: number
  reuniao: number
  /** Días hábiles reales de esa semana (sin feriados). */
  diasUteis: number
}

export interface PropostaDoCookbook {
  /** Lo que el sistema propone para la semana que viene. */
  proposta: MetasSemanais
  /** Lo que está guardado hoy, o la propuesta si nunca se negoció. */
  atual: MetasSemanais
  /** De dónde salió la propuesta. */
  origem: 'historico' | 'rampa'
  /** Las 4 semanas miradas, de la más vieja a la más nueva. */
  historico: SemanaDoHistorico[]
  /** Media semanal del histórico, sin redondear a la meta. */
  media: MetasSemanais
  /** Piso del equipo para esta semana de rampa. */
  rampa: MetasSemanais
  semanaDaRampa: number
  /** Ya negociado por la persona (≠ heredado de la rampa). */
  negociado: boolean
  /** Bandas de ±30 % por métrica, ya calculadas. */
  bandas: Record<keyof MetasSemanais, { min: number; max: number }>
}

/** Días hábiles de la semana de `iso`, contados con el calendario BR/SP. */
function diasUteisNaSemana(iso: IsoDate): number {
  const inicio = weekStart(iso)
  let n = 0
  for (let i = 0; i < 7; i += 1) if (ehDiaUtil(addDays(inicio, i))) n += 1
  return Math.max(1, n)
}

function dataDaAtividade(a: Activity): string {
  return a.activity_date ?? a.created_at ?? ''
}

/** Reuniões e demos: la meta que el equipo mira además de los tres anillos. */
function ehReuniao(a: Activity): boolean {
  return a.activity_type === 'meeting' || a.activity_type === 'demo'
}

/**
 * Agrega una semana con el MISMO clasificador que pinta los anillos.
 * `anelDoDia` regala 2 contatos de largada por día; acá se restan porque el
 * histórico tiene que ser lo que la persona hizo, no lo que se le acreditó.
 */
export function agregarSemana(
  semana: IsoDate,
  atividades: readonly Activity[],
  touchpoints: readonly Touchpoint[],
): SemanaDoHistorico {
  const inicio = weekStart(semana)
  const fim = addDays(inicio, 7)

  const doPeriodo = atividades.filter((a) => {
    const d = dataDaAtividade(a).slice(0, 10)
    return d >= inicio && d < fim
  })
  const tpsDoPeriodo = touchpoints.filter((t) => {
    const d = t.executed_at.slice(0, 10)
    return d >= inicio && d < fim
  })

  const aneis = anelDoDia(doPeriodo, undefined, tpsDoPeriodo)
  return {
    semana: inicio,
    contato: Math.max(0, aneis.contato.current - CONTATOS_DE_LARGADA),
    conversa: aneis.conversa.current,
    avanco: aneis.avanco.current,
    reuniao: doPeriodo.filter(ehReuniao).length,
    diasUteis: diasUteisNaSemana(inicio),
  }
}

function rampaSemanal(semanaDaRampa: number, diasUteis: number): MetasSemanais {
  const diaria = metasDaRampa(semanaDaRampa)
  return {
    contato: diaria.contato * diasUteis,
    conversa: diaria.conversa * diasUteis,
    avanco: diaria.avanco * diasUteis,
    // Una reunião por semana es el piso: por debajo, no hay pipeline nuevo.
    reuniao: 1,
  }
}

const METRICAS: readonly (keyof MetasSemanais)[] = ['contato', 'conversa', 'avanco', 'reuniao']

/**
 * La propuesta.
 *
 * Regla, en una línea: **la media de las 4 semanas cerradas, con la rampa como
 * piso**. Si la persona ya hace más que la rampa, la meta no puede bajarle el
 * listón; si hace menos, la rampa no puede pedirle 20× el baseline real (12
 * toques semanales para TODO el equipo, mediana de 17 semanas). Sin histórico
 * ninguno, manda la rampa y se dice que es la rampa.
 */
export function montarProposta(
  historico: readonly SemanaDoHistorico[],
  semanaDaRampa: number,
  diasUteis: number,
  guardado: Cookbook | undefined,
): PropostaDoCookbook {
  const comDados = historico.filter(
    (h) => h.contato + h.conversa + h.avanco + h.reuniao > 0,
  )
  const n = Math.max(1, comDados.length)
  const media: MetasSemanais = {
    contato: comDados.reduce((s, h) => s + h.contato, 0) / n,
    conversa: comDados.reduce((s, h) => s + h.conversa, 0) / n,
    avanco: comDados.reduce((s, h) => s + h.avanco, 0) / n,
    reuniao: comDados.reduce((s, h) => s + h.reuniao, 0) / n,
  }

  const rampa = rampaSemanal(semanaDaRampa, diasUteis)
  const temHistorico = comDados.length > 0

  const proposta: MetasSemanais = {
    contato: Math.max(rampa.contato, Math.round(media.contato)),
    conversa: Math.max(rampa.conversa, Math.round(media.conversa)),
    avanco: Math.max(rampa.avanco, Math.round(media.avanco)),
    reuniao: Math.max(rampa.reuniao, Math.round(media.reuniao)),
  }

  const negociado = guardado !== undefined
  const atual: MetasSemanais = negociado
    ? {
        contato: Math.max(1, Math.round(guardado.touches_per_week)),
        conversa: Math.max(1, Math.round(guardado.conversations_per_week)),
        avanco: Math.max(1, Math.round(guardado.advances_per_week)),
        reuniao: Math.max(1, Math.round(guardado.meetings_per_week)),
      }
    : { ...proposta }

  const bandas = {} as Record<keyof MetasSemanais, { min: number; max: number }>
  for (const m of METRICAS) {
    bandas[m] = {
      min: Math.max(1, Math.floor(proposta[m] * (1 - BANDA_DE_NEGOCIACAO))),
      max: Math.ceil(proposta[m] * (1 + BANDA_DE_NEGOCIACAO)),
    }
  }

  return {
    proposta,
    atual,
    origem: temHistorico ? 'historico' : 'rampa',
    historico: [...historico],
    media,
    rampa,
    semanaDaRampa,
    negociado,
    bandas,
  }
}

/** Lee Dexie una sola vez y arma la propuesta completa. */
export async function fetchPropostaDoCookbook(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<PropostaDoCookbook> {
  const [carteira, guardado, inicioGuardado] = await Promise.all([
    carregarCarteira(vendor),
    lerMeta<Cookbook>(chaveCookbook(vendor)),
    lerMeta<IsoDate>(chaveInicioDoJogo(vendor)),
  ])

  const estaSemana = weekStart(hoje)
  // Las 4 semanas CERRADAS: la actual todavía se está escribiendo y meterla
  // haría que la meta del lunes fuera siempre más baja que la del viernes.
  const historico: SemanaDoHistorico[] = []
  for (let i = SEMANAS_DE_HISTORICO; i >= 1; i -= 1) {
    const semana = addDays(estaSemana, -7 * i)
    historico.push(agregarSemana(semana, carteira.activities, carteira.touchpoints))
  }

  const inicio = inicioGuardado ?? estaSemana
  return montarProposta(
    historico,
    semanaDesdeInicio(inicio, hoje),
    diasUteisNaSemana(hoje),
    guardado,
  )
}

export function usePropostaDoCookbook(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<PropostaDoCookbook> {
  return useQuery({
    queryKey: chavesAjustes.cookbook(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => fetchPropostaDoCookbook(vendor as string, hoje),
    staleTime: 60_000,
  })
}

export interface EntradaCookbook {
  vendor: string
  proposta: MetasSemanais
  escolhida: MetasSemanais
}

/**
 * Guarda las metas negociadas. `gravarCookbook` ya aplica el clamp de ±30 %
 * sobre los tres anillos; las reuniões se clampan acá con la misma función.
 */
export async function definirCookbook(entrada: EntradaCookbook): Promise<void> {
  const anterior = await lerMeta<Cookbook>(chaveCookbook(entrada.vendor))
  await gravarCookbook(
    entrada.vendor,
    entrada.proposta,
    entrada.escolhida,
    anterior?.golden_hour_cue ?? null,
  )
  // meetings_per_week no pasa por gravarCookbook: se completa acá, ya clampado.
  const guardado = await lerMeta<Cookbook>(chaveCookbook(entrada.vendor))
  if (guardado) {
    await gravarMeta(chaveCookbook(entrada.vendor), {
      ...guardado,
      meetings_per_week: clampMetaNegociada(entrada.proposta.reuniao, entrada.escolhida.reuniao),
    } satisfies Cookbook)
  }
}

export function useDefinirCookbook(): UseMutationResult<void, Error, EntradaCookbook> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: definirCookbook,
    networkMode: 'always',
    onSuccess: (_r, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['ajustes', vars.vendor] })
      // El Placar y la tela Hoje leen el MISMO cookbook.
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
      void queryClient.invalidateQueries({ queryKey: ['hoje'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Golden Hour — horario, días y la frase se-então
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 16h por defecto. No es un número elegido en una reunión: es la hora en la
 * que el equipo YA prospecta. Una Golden Hour a las 9h sería una hora nueva
 * que hay que inventar; a las 16h es un hábito existente al que se le pone
 * nombre, y eso es lo único que se sostiene sin vigilancia.
 */
export const HORA_GOLDEN_PADRAO = 16

/** 1 = segunda … 5 = sexta. Domingo es 0, como `weekdayBr`. */
export const DIAS_GOLDEN_PADRAO: readonly number[] = [1, 2, 3, 4, 5]

export const NOME_DO_DIA: Readonly<Record<number, string>> = {
  0: 'domingo',
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
}

export interface ConfigGoldenHour {
  /** Hora local de São Paulo, 0-23. */
  hora: number
  /** Días de la semana, 0=domingo. */
  dias: number[]
  /** La frase se-então, tal como la escribió la persona. */
  frase: string | null
}

export const GOLDEN_HOUR_PADRAO: Readonly<ConfigGoldenHour> = Object.freeze({
  hora: HORA_GOLDEN_PADRAO,
  dias: [...DIAS_GOLDEN_PADRAO],
  frase: null,
})

function horaDaString(valor: string | null | undefined): number {
  if (!valor) return HORA_GOLDEN_PADRAO
  const h = Number.parseInt(valor.slice(0, 2), 10)
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : HORA_GOLDEN_PADRAO
}

/**
 * Los días guardados vienen del v2 en base 1-7 (`golden_hour_days: [2..6]` =
 * segunda a sexta). Se normalizan a base 0-6 restando 1, que es la convención
 * de `weekdayBr` y la única que usa el resto del v3.
 */
function diasNormalizados(valor: number[] | null | undefined): number[] {
  if (!valor || valor.length === 0) return [...DIAS_GOLDEN_PADRAO]
  const base1 = valor.every((d) => d >= 1 && d <= 7)
  const convertidos = base1 ? valor.map((d) => d - 1) : valor
  const limpos = [...new Set(convertidos.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
  return limpos.length > 0 ? limpos : [...DIAS_GOLDEN_PADRAO]
}

export async function lerConfigGoldenHour(vendor: string): Promise<ConfigGoldenHour> {
  const guardado = await lerMeta<Cookbook>(chaveCookbook(vendor))
  return {
    hora: horaDaString(guardado?.golden_hour_start),
    dias: diasNormalizados(guardado?.golden_hour_days),
    frase: guardado?.golden_hour_cue ?? null,
  }
}

/**
 * La frase se-então, armada a partir de la configuración.
 * Implementation intention («se X, então Y»): la literatura de hábitos es
 * consistente en que la versión con disparador concreto se cumple ~2× más que
 * la intención genérica. Por eso la frase nombra la hora y el día, no «todos
 * los días».
 */
export function fraseSeEntao(config: ConfigGoldenHour): string {
  if (config.frase && config.frase.trim() !== '') return config.frase.trim()
  const dias = [...config.dias].sort((a, b) => a - b)
  const nomes = dias.map((d) => NOME_DO_DIA[d] ?? '').filter((n) => n !== '')

  let quando: string
  if (nomes.length === 0) quando = 'todo dia'
  else if (nomes.length === 1) quando = `de ${nomes[0]}`
  else if (nomes.length === 5 && dias.join(',') === '1,2,3,4,5') quando = 'de um dia útil'
  else quando = `de ${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`

  return `Se são ${config.hora}h ${quando}, eu abro a Golden Hour com a lista da véspera.`
}

/** La frase con el día de HOY adentro — la que se muestra en el ritual. */
export function fraseDeHoje(config: ConfigGoldenHour, hoje: IsoDate = todayBr()): string {
  if (config.frase && config.frase.trim() !== '') return config.frase.trim()
  return `Se são ${config.hora}h de ${nomeCurtoDoDia(hoje).toLowerCase()}, eu abro a Golden Hour com a lista da véspera.`
}

export interface EntradaGoldenHour extends ConfigGoldenHour {
  vendor: string
}

export async function gravarConfigGoldenHour(entrada: EntradaGoldenHour): Promise<void> {
  const anterior = await lerMeta<Cookbook>(chaveCookbook(entrada.vendor))
  const cookbook = await lerCookbookDaSemana(entrada.vendor)
  const frase = entrada.frase?.trim()

  const proximo: Cookbook = {
    vendor: entrada.vendor,
    touches_per_week: anterior?.touches_per_week ?? cookbook.metasSemanais.contato,
    conversations_per_week: anterior?.conversations_per_week ?? cookbook.metasSemanais.conversa,
    meetings_per_week: anterior?.meetings_per_week ?? 1,
    advances_per_week: anterior?.advances_per_week ?? cookbook.metasSemanais.avanco,
    golden_hour_cue: frase === undefined || frase === '' ? null : frase,
    // Se guarda en base 1-7 para no romper lo que el v2 ya escribió.
    golden_hour_days: [...entrada.dias].sort((a, b) => a - b).map((d) => d + 1),
    golden_hour_start: `${String(entrada.hora).padStart(2, '0')}:00`,
  }
  await gravarMeta(chaveCookbook(entrada.vendor), proximo)
}

export function useConfigGoldenHour(vendor: string | null): UseQueryResult<ConfigGoldenHour> {
  return useQuery({
    queryKey: chavesAjustes.golden(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => lerConfigGoldenHour(vendor as string),
    staleTime: 60_000,
  })
}

export function useDefinirGoldenHour(): UseMutationResult<void, Error, EntradaGoldenHour> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: gravarConfigGoldenHour,
    networkMode: 'always',
    onSuccess: (_r, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['ajustes', vars.vendor] })
      void queryClient.invalidateQueries({ queryKey: ['rituais'] })
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Notificaciones — presupuesto, silencio y tipos
   ══════════════════════════════════════════════════════════════════════════ */

export type CanalDeAviso = 'telegram' | 'push'

export const CANAIS_DE_AVISO: readonly CanalDeAviso[] = ['telegram', 'push']

export const ROTULO_DO_CANAL: Readonly<Record<CanalDeAviso, string>> = {
  telegram: 'Telegram',
  push: 'Notificação do celular',
}

/** Los tipos que el dispatcher sabe emitir. El código es el de la migración 0005. */
export const TIPOS_DE_AVISO = [
  {
    codigo: 'golden_hour',
    rotulo: 'Golden Hour',
    descricao: 'Um lembrete quando chega a sua hora, com a fila já pronta.',
  },
  {
    codigo: 'acao_vencida',
    rotulo: 'Ação vencida',
    descricao: 'Um compromisso que você marcou e a data passou.',
  },
  {
    codigo: 'risco',
    rotulo: 'Risco no negócio',
    descricao: 'Silêncio longo, proposta sem resposta, negócio com uma pessoa só.',
  },
  {
    codigo: 'revisao',
    rotulo: 'Revisão do Ventus',
    descricao: 'O Ventus propôs algo e está esperando você confirmar.',
  },
  {
    codigo: 'ritual',
    rotulo: 'Rituais',
    descricao: 'Abertura da manhã, encerramento do dia, segunda e sexta.',
  },
  {
    codigo: 'jogo',
    rotulo: 'Anéis, racha e troféus',
    descricao: 'Só a camada de jogo. Desligar aqui não esconde nenhum dado.',
  },
] as const

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number]['codigo']

export interface PrefsDeAviso {
  /** Máximo de empujones por día. El v2 llegó a 17 y por eso nadie lee nada. */
  orcamentoDiario: number
  /** Inicio del silencio, hora local de São Paulo. */
  silencioDe: number
  /** Fin del silencio. */
  silencioAte: number
  canais: CanalDeAviso[]
  /** Tipos apagados. Lo que NO está acá, llega. */
  tiposMutados: TipoDeAviso[]
}

/**
 * 4 por día es el techo del PLANO y no es negociable hacia arriba sin fricción:
 * el dispatcher del v2 mandaba 17 diarios y la tasa de lectura de las 4.521
 * notificaciones históricas es 0,0 %. Un aviso que nadie lee no es un aviso,
 * es ruido con costo de batería.
 */
export const ORCAMENTO_RECOMENDADO = 4
export const ORCAMENTO_MAXIMO = 12

export const PREFS_DE_AVISO_PADRAO: Readonly<PrefsDeAviso> = Object.freeze({
  orcamentoDiario: ORCAMENTO_RECOMENDADO,
  silencioDe: 20,
  silencioAte: 7,
  canais: ['telegram', 'push'] as CanalDeAviso[],
  tiposMutados: [] as TipoDeAviso[],
})

export function chavePrefsDeAviso(vendor: string): string {
  return `avisos:prefs:${vendor}`
}

export async function lerPrefsDeAviso(vendor: string): Promise<PrefsDeAviso> {
  const guardadas = await lerMeta<Partial<PrefsDeAviso>>(chavePrefsDeAviso(vendor))
  return {
    ...PREFS_DE_AVISO_PADRAO,
    ...(guardadas ?? {}),
    canais: guardadas?.canais ?? [...PREFS_DE_AVISO_PADRAO.canais],
    tiposMutados: guardadas?.tiposMutados ?? [],
  }
}

export interface EntradaPrefsDeAviso {
  vendor: string
  mudancas: Partial<PrefsDeAviso>
}

export async function gravarPrefsDeAviso(entrada: EntradaPrefsDeAviso): Promise<PrefsDeAviso> {
  const atuais = await lerPrefsDeAviso(entrada.vendor)
  const proximas: PrefsDeAviso = { ...atuais, ...entrada.mudancas }
  proximas.orcamentoDiario = Math.min(
    ORCAMENTO_MAXIMO,
    Math.max(0, Math.round(proximas.orcamentoDiario)),
  )
  await gravarMeta(chavePrefsDeAviso(entrada.vendor), proximas)
  return proximas
}

export function usePrefsDeAviso(vendor: string | null): UseQueryResult<PrefsDeAviso> {
  return useQuery({
    queryKey: chavesAjustes.avisos(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => lerPrefsDeAviso(vendor as string),
    staleTime: 60_000,
  })
}

export function useDefinirPrefsDeAviso(): UseMutationResult<
  PrefsDeAviso,
  Error,
  EntradaPrefsDeAviso
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: gravarPrefsDeAviso,
    networkMode: 'always',
    onSuccess: (prefs, vars) => {
      queryClient.setQueryData(chavesAjustes.avisos(vars.vendor), prefs)
    },
  })
}

/* ── Permiso del navegador ────────────────────────────────────────────────── */

export type PermissaoDeAviso = 'concedida' | 'negada' | 'por_pedir' | 'indisponivel'

export function permissaoDeAviso(): PermissaoDeAviso {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel'
  const atual = Notification.permission
  if (atual === 'granted') return 'concedida'
  if (atual === 'denied') return 'negada'
  return 'por_pedir'
}

/**
 * Pide el permiso. **Sólo desde un handler de tap.**
 *
 * En iOS 16.4+ el prompt exige gesto del usuario Y que la app esté instalada
 * en la pantalla de inicio. Llamado dentro de un `useEffect` no aparece
 * ningún diálogo, la promesa resuelve 'denied' y el permiso queda quemado
 * para siempre: Safari no vuelve a preguntar. Por eso esta función no se
 * exporta como hook — un hook invita a llamarla en un efecto.
 */
export async function pedirPermissaoDeAviso(): Promise<PermissaoDeAviso> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'indisponivel'
  if (Notification.permission === 'granted') return 'concedida'
  if (Notification.permission === 'denied') return 'negada'
  try {
    const resposta = await Notification.requestPermission()
    return resposta === 'granted' ? 'concedida' : resposta === 'denied' ? 'negada' : 'por_pedir'
  } catch {
    return 'indisponivel'
  }
}

/**
 * ¿Estamos en iOS sin instalar? Es el único caso donde el permiso NO se puede
 * pedir todavía, y hay que decirlo en vez de mostrar un botón que no hace nada.
 */
export function precisaInstalarParaAviso(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
  if (!iOS) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !standalone
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Telegram — código de emparejamiento de 6 dígitos
   ══════════════════════════════════════════════════════════════════════════ */

/** Vida del código. Coincide con el default de `pairing_codes.expira_em`. */
export const TTL_DO_CODIGO_MS = 10 * 60_000

export interface CodigoDePareamento {
  /** Seis dígitos. Se muestra separado en dos grupos de tres. */
  codigo: string
  /** ISO del momento en que deja de servir. */
  expiraEm: string
}

export interface EstadoDoTelegram {
  vinculado: boolean
  verificadoEm: string | null
  ultimoUsoEm: string | null
  /** false cuando la migración 0006 todavía no fue aplicada. */
  disponivel: boolean
}

export class ErroDePareamento extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDePareamento'
  }
}

export function chaveCodigoDePareamento(vendorId: number): string {
  return `telegram:codigo:${vendorId}`
}

interface LinhaCanal {
  verificado_em: string | null
  ultimo_uso_em: string | null
  is_active: boolean | null
}

/**
 * Estado del vínculo. La app sólo puede leer las columnas que la 0006 le
 * concede (`grant select (id, vendor_id, kind, verificado_em, is_active,
 * ultimo_uso_em)`): nunca ve el `chat_id` de nadie, ni el propio.
 */
export async function fetchEstadoDoTelegram(vendorId: number): Promise<EstadoDoTelegram> {
  const vazio: EstadoDoTelegram = {
    vinculado: false,
    verificadoEm: null,
    ultimoUsoEm: null,
    disponivel: true,
  }
  try {
    const { data, error } = await supabase
      .from('vendor_channels')
      .select('verificado_em, ultimo_uso_em, is_active')
      .eq('vendor_id', vendorId)
      .eq('kind', 'telegram')
      .limit(1)

    if (error) {
      // 42P01 = la tabla todavía no existe. No es un fallo del vendedor.
      const codigo = (error as { code?: string }).code
      if (codigo === '42P01' || codigo === 'PGRST205') return { ...vazio, disponivel: false }
      return vazio
    }

    const linha = (data as LinhaCanal[] | null)?.[0]
    if (!linha || linha.is_active === false) return vazio
    return {
      vinculado: linha.verificado_em !== null,
      verificadoEm: linha.verificado_em,
      ultimoUsoEm: linha.ultimo_uso_em,
      disponivel: true,
    }
  } catch {
    // Sin red: no se puede afirmar ni que está ni que no está vinculado.
    return vazio
  }
}

export function useEstadoDoTelegram(vendorId: number | null): UseQueryResult<EstadoDoTelegram> {
  return useQuery({
    queryKey: chavesAjustes.telegram(vendorId ?? 0),
    enabled: vendorId !== null,
    queryFn: () => fetchEstadoDoTelegram(vendorId as number),
    staleTime: 30_000,
  })
}

/**
 * Genera el código de emparejamiento.
 *
 * NUNCA se vincula por @username: un username de Telegram cambia de dueño en
 * cuanto el original lo libera, y el bot del v2 hace exactamente eso — quien
 * agarre el username de un vendedor hereda su cartera. El código es de un solo
 * uso, dura 10 minutos y lo emite el servidor con `service_role`, porque
 * `pairing_codes` le está revocada al rol `authenticated` a propósito.
 *
 * El cliente NO inventa el número: si lo hiciera, cualquiera podría escribir
 * seis dígitos en el bot y quedarse con la cartera del otro.
 */
export async function gerarCodigoDePareamento(vendorId: number): Promise<CodigoDePareamento> {
  const { data, error } = await supabase.functions.invoke<{
    codigo?: string
    expira_em?: string
  }>('pairing-code', { body: { vendor_id: vendorId } })

  if (error || !data?.codigo) {
    throw new ErroDePareamento(
      'Não deu para gerar o código agora. Confira o sinal e tente de novo; se persistir, avise o Jordi.',
    )
  }

  const codigo: CodigoDePareamento = {
    codigo: data.codigo,
    expiraEm: data.expira_em ?? new Date(Date.now() + TTL_DO_CODIGO_MS).toISOString(),
  }
  // Se guarda para que el contador siga corriendo si la pantalla se recarga.
  await gravarMeta(chaveCodigoDePareamento(vendorId), codigo)
  return codigo
}

/** Código todavía vivo de un intento anterior, o null. */
export async function lerCodigoVivo(vendorId: number): Promise<CodigoDePareamento | null> {
  const guardado = await lerMeta<CodigoDePareamento>(chaveCodigoDePareamento(vendorId))
  if (!guardado) return null
  return Date.parse(guardado.expiraEm) > Date.now() ? guardado : null
}

export function useGerarCodigoDePareamento(): UseMutationResult<
  CodigoDePareamento,
  Error,
  number
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: gerarCodigoDePareamento,
    networkMode: 'always',
    retry: false,
    onSuccess: (_c, vendorId) => {
      void queryClient.invalidateQueries({ queryKey: chavesAjustes.telegram(vendorId) })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Estado de sincronización
   ══════════════════════════════════════════════════════════════════════════ */

export interface UsoDeArmazenamento {
  usado: number
  cota: number
  /** 0..1. -1 cuando el navegador no informa cuota (Safari en modo privado). */
  fracao: number
}

export interface EstadoDeSincronizacao {
  /** Mutaciones esperando salir del outbox. */
  pendentes: number
  /** Mutaciones que fallaron y necesitan una decisión. */
  comProblema: number
  /** Último pull exitoso de cualquier tabla, o null si nunca hubo. */
  ultimoSync: string | null
  /** Filas aplicadas en el último pull, por tabla. */
  porTabela: { tabela: SyncTable; ultimoSync: string | null; linhas: number }[]
  armazenamento: UsoDeArmazenamento
}

export async function fetchEstadoDeSincronizacao(): Promise<EstadoDeSincronizacao> {
  const tabelas = TABELAS_SYNC.map((c) => c.tabla)
  const [pendentes, problemas, cursores, uso] = await Promise.all([
    pendingCount(),
    comProblema(),
    Promise.all(tabelas.map((t) => lerCursor(t))),
    storageEstimate(),
  ])

  let ultimoSync: string | null = null
  const porTabela = cursores.map((c) => {
    if (c.ultimo_sync_em && (ultimoSync === null || c.ultimo_sync_em > ultimoSync)) {
      ultimoSync = c.ultimo_sync_em
    }
    return { tabela: c.tabla, ultimoSync: c.ultimo_sync_em, linhas: c.ultimas_linhas }
  })

  return {
    pendentes,
    comProblema: problemas.length,
    ultimoSync,
    porTabela,
    armazenamento: {
      usado: uso.usage,
      cota: uso.quota,
      fracao: uso.quota > 0 ? uso.usage / uso.quota : -1,
    },
  }
}

export function useEstadoDeSincronizacao(
  vendor: string | null,
): UseQueryResult<EstadoDeSincronizacao> {
  return useQuery({
    queryKey: chavesAjustes.sincronizacao(vendor ?? ''),
    queryFn: fetchEstadoDeSincronizacao,
    // Refresca solo mientras la pantalla está abierta: es un panel de estado.
    refetchInterval: 5_000,
    staleTime: 0,
  })
}

export interface ResultadoDeEnvio {
  enviados: number
  falhados: number
  conflitos: number
  /** Filas bajadas del servidor en el pull que siguió al envío. */
  baixados: number
}

/**
 * «Forçar envio»: primero sube y DESPUÉS baja. Al revés, el pull traería el
 * estado anterior del servidor y pisaría lo que todavía está en la cola.
 */
export async function forcarEnvio(vendor: string): Promise<ResultadoDeEnvio> {
  const envio = await flush({ forcar: true })
  let baixados = 0
  try {
    const relatorio = await syncNow(vendor)
    baixados = relatorio.puxados
  } catch {
    // Sin red el envío igual quedó intentado: se reporta lo que sí pasó.
  }
  return {
    enviados: envio.enviados,
    falhados: envio.falhados,
    conflitos: envio.conflitos,
    baixados,
  }
}

export function useForcarEnvio(): UseMutationResult<ResultadoDeEnvio, Error, string> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: forcarEnvio,
    networkMode: 'always',
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['ajustes'] })
    },
  })
}

/** Bytes a algo legible en PT-BR. */
export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`
  return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Regras do jogo
   ══════════════════════════════════════════════════════════════════════════ */

export interface MudancaDeRegra {
  evento: string
  versao: number
  pa: number
  /** Desde cuándo rige. Nunca retroactivo: lo impone un trigger en Postgres. */
  validoDe: string
  validoAte: string | null
  descricao: string | null
  autor: string | null
}

export interface RegrasDoJogo {
  /** Las reglas que la app está aplicando ahora mismo. */
  vigentes: readonly RegraPA[]
  /** Historial versionado, de la más nueva a la más vieja. */
  historico: MudancaDeRegra[]
  /** false cuando `scoring_rules` todavía no existe: se muestran los defaults. */
  historicoDisponivel: boolean
}

export const CHAVE_HISTORICO_DE_REGRAS = 'jogo:regras:historico'

interface LinhaRegra {
  evento: string
  versao: number
  pa: number
  valido_de: string
  valido_ate: string | null
  descricao: string | null
  vendors?: { name?: string | null } | null
}

/**
 * El historial. Se cachea en Dexie porque «Regras do jogo» tiene que abrir
 * offline: es la página a la que alguien va justamente cuando desconfía de un
 * puntaje, y esa desconfianza no espera a que haya señal.
 */
export async function fetchRegrasDoJogo(): Promise<RegrasDoJogo> {
  const cacheado = await lerMeta<MudancaDeRegra[]>(CHAVE_HISTORICO_DE_REGRAS)

  try {
    const { data, error } = await supabase
      .from('scoring_rules')
      .select('evento, versao, pa, valido_de, valido_ate, descricao, vendors(name)')
      .order('valido_de', { ascending: false })
      .limit(100)

    if (error) throw error

    const historico: MudancaDeRegra[] = ((data as LinhaRegra[] | null) ?? []).map((r) => ({
      evento: r.evento,
      versao: r.versao,
      pa: r.pa,
      validoDe: r.valido_de,
      validoAte: r.valido_ate,
      descricao: r.descricao,
      autor: r.vendors?.name ?? null,
    }))
    await gravarMeta(CHAVE_HISTORICO_DE_REGRAS, historico)
    return { vigentes: REGRAS_PADRAO, historico, historicoDisponivel: true }
  } catch {
    return {
      vigentes: REGRAS_PADRAO,
      historico: cacheado ?? [],
      historicoDisponivel: cacheado !== undefined,
    }
  }
}

export function useRegrasDoJogo(): UseQueryResult<RegrasDoJogo> {
  return useQuery({
    queryKey: chavesAjustes.regras(),
    queryFn: fetchRegrasDoJogo,
    staleTime: 10 * 60_000,
    // Las reglas VIGENTES son una constante del dominio: están compiladas en
    // el bundle. Mostrar un esqueleto mientras se espera al servidor sería
    // esconder detrás de una consulta de red algo que ya está en memoria — y
    // «Regras do jogo» es justamente la página a la que alguien entra cuando
    // desconfía de un puntaje, que es cuando menos se puede pedir paciencia.
    // Lo único que llega por red es el historial, y su sección lo dice.
    placeholderData: { vigentes: REGRAS_PADRAO, historico: [], historicoDisponivel: false },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · Dos hooks del chrome de la app
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Registros esperando salir del outbox, en vivo.
 *
 * `useSyncExternalStore` y no `useQuery`: el contador lo mueve el propio
 * outbox (cada encolado y cada flush), no una consulta. Con una query habría
 * que invalidarla desde la capa de datos y el badge llegaría tarde justo
 * cuando importa — el segundo siguiente a grabar una nota de voz sin señal.
 */
export function usePendentesDoOutbox(): number {
  return useSyncExternalStore(
    storePendentes.subscribe,
    storePendentes.getSnapshot,
    // En el servidor no hay outbox: cero, y sin badge.
    () => 0,
  )
}

/**
 * ¿Hay red?
 *
 * `navigator.onLine` miente hacia arriba (dice true en el wifi de un hotel sin
 * salida) pero nunca hacia abajo. Sirve para AVISAR que no hay señal, nunca
 * para asumir que sí la hay.
 */
export function useEstaOnline(): boolean {
  return useSyncExternalStore(
    (aviso) => {
      window.addEventListener('online', aviso)
      window.addEventListener('offline', aviso)
      return () => {
        window.removeEventListener('online', aviso)
        window.removeEventListener('offline', aviso)
      }
    },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    () => true,
  )
}
