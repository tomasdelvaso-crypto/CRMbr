// src/screens/GoldenHour/sessao.ts
// Estado de UNA Golden Hour: qué se tocó, cuánto falta y en qué fase está.
//
// Vive en el store `meta` de Dexie, no en memoria de React. Motivos:
//  · Si el teléfono se queda sin batería a los 20 minutos, al reabrir la hora
//    retoma con el reloj corriendo y la fila donde estaba, en vez de regalarle
//    al vendedor una hora en blanco.
//  · El reloj se calcula contra `fimPrevisto` (una marca de tiempo absoluta),
//    nunca acumulando ticks: un setInterval en segundo plano en iOS se
//    congela, y una hora medida así mentiría por diez minutos.
//  · Todo es local. La sesión sube UNA vez, al cerrarla, por
//    registrarSessaoGolden(). Durante la hora no se toca la red.

import {
  avaliarHoraCheia,
  ehConversaReal,
  todayBr,
  type AvaliacaoHoraCheia,
  type Channel,
  type IsoDate,
  type TouchpointResult,
} from '@/core'
import { agora, gravarMeta, lerMeta } from '@/data'

/** Fases del ritual. No hay navegación entre ellas: solo avanza. */
export type FaseGolden = 'abertura' | 'foco' | 'fechamento' | 'selada'

export interface RegistroToque {
  leadId: number
  empresa: string
  contato: string | null
  canal: Channel
  resultado: TouchpointResult
  em: string
}

export interface Debrief {
  melhor_conversa: string
  objecao_frequente: string
  o_que_muda: string
}

export const DEBRIEF_VAZIO: Debrief = {
  melhor_conversa: '',
  objecao_frequente: '',
  o_que_muda: '',
}

export interface SessaoLocal {
  /** Versión del formato: si cambia, la sesión vieja se descarta sin romper. */
  v: 1
  vendor: string
  day: IsoDate
  fase: FaseGolden
  duracaoMin: number
  metaToques: number
  iniciadaEm: string | null
  /** Marca absoluta del final. El reloj se deriva de acá. */
  fimPrevisto: string | null
  terminadaEm: string | null
  /**
   * La fila CONGELADA al arrancar, en orden, por lead_id.
   *
   * No se recalcula durante la hora a propósito: `buildGoldenQueue` ordena por
   * atraso, y cada toque registrado mueve el next_touchpoint_date del lead —
   * con la fila viva, el carrusel se reordenaría bajo el dedo después de cada
   * botón. La fila del día se decide una vez y se respeta.
   */
  fila: number[]
  registros: RegistroToque[]
  /** leadIds que el vendedor pasó. No consumen toque de la cadencia. */
  puladas: number[]
  /** client_uuid de cada nota de voz guardada en Dexie durante la hora. */
  notasDeVoz: string[]
  debrief: Debrief
  /** Índice del carrusel, para retomar donde quedó. */
  indice: number
}

/** Duraciones ofrecidas, en minutos. 60 es el default del plano. */
export const DURACOES: readonly number[] = [30, 45, 60, 90]
export const DURACAO_PADRAO = 60
/** Piso y techo de la meta de toques, para que el Stepper no ofrezca ficción. */
export const META_MIN = 4
export const META_MAX = 20

export function chaveSessao(vendor: string, day: IsoDate): string {
  return `golden:${vendor}:${day}`
}

/** Meta sugerida: la fila entera, dentro de la rampa 4 → 12 del plano. */
export function metaSugerida(tamanhoDaFila: number): number {
  if (tamanhoDaFila <= 0) return META_MIN
  return Math.min(12, Math.max(META_MIN, tamanhoDaFila))
}

export function sessaoNova(
  vendor: string,
  day: IsoDate,
  metaToques: number,
  fila: readonly number[],
): SessaoLocal {
  return {
    v: 1,
    vendor,
    day,
    fase: 'abertura',
    duracaoMin: DURACAO_PADRAO,
    metaToques,
    iniciadaEm: null,
    fimPrevisto: null,
    terminadaEm: null,
    fila: [...fila],
    registros: [],
    puladas: [],
    notasDeVoz: [],
    debrief: { ...DEBRIEF_VAZIO },
    indice: 0,
  }
}

/** Lee la sesión del día. `null` si no hay ninguna o si es de otro formato. */
export async function lerSessao(vendor: string, day: IsoDate): Promise<SessaoLocal | null> {
  const bruto = await lerMeta<SessaoLocal>(chaveSessao(vendor, day))
  if (!bruto || bruto.v !== 1 || bruto.vendor !== vendor || bruto.day !== day) return null
  return bruto
}

export async function gravarSessao(sessao: SessaoLocal): Promise<void> {
  await gravarMeta(chaveSessao(sessao.vendor, sessao.day), sessao)
}

/** Arranca el bloque: fija el inicio y el final absolutos. */
export function iniciar(sessao: SessaoLocal, duracaoMin: number): SessaoLocal {
  const inicio = agora()
  const fim = new Date(new Date(inicio).getTime() + duracaoMin * 60_000).toISOString()
  return { ...sessao, fase: 'foco', duracaoMin, iniciadaEm: inicio, fimPrevisto: fim }
}

/* ── Números derivados ───────────────────────────────────────────────────── */

export interface ResumoSessao {
  toques: number
  conversas: number
  reunioes: number
  puladas: number
  notasDeVoz: number
  /** Minutos efectivos en foco, topeados por la duración elegida. */
  duracaoMin: number
  restanteMs: number
  /** El bloque ya llegó a cero. */
  esgotado: boolean
  debriefFeito: boolean
  avaliacao: AvaliacaoHoraCheia
  /** La objeción que más se repitió, cuando hay con qué decirlo. */
  empresasComConversa: string[]
}

/** Cuenta las tres respuestas del debrief como hechas. */
export function debriefCompleto(d: Debrief): boolean {
  return (
    d.melhor_conversa.trim() !== '' &&
    d.objecao_frequente.trim() !== '' &&
    d.o_que_muda.trim() !== ''
  )
}

export function resumir(sessao: SessaoLocal, agoraMs: number): ResumoSessao {
  const toques = sessao.registros.length
  const conversas = sessao.registros.filter((r) => ehConversaReal(r.resultado)).length
  const reunioes = sessao.registros.filter((r) => r.resultado === 'meeting_scheduled').length

  const inicioMs = sessao.iniciadaEm ? new Date(sessao.iniciadaEm).getTime() : agoraMs
  const refMs = sessao.terminadaEm ? new Date(sessao.terminadaEm).getTime() : agoraMs
  // Topeado por la duración elegida: la app abierta toda la tarde no compra
  // una Hora Cheia. El criterio del core son 40 minutos reales de bloque.
  const decorridos = Math.max(0, Math.min((refMs - inicioMs) / 60_000, sessao.duracaoMin))

  const fimMs = sessao.fimPrevisto ? new Date(sessao.fimPrevisto).getTime() : agoraMs
  const restanteMs = Math.max(0, fimMs - agoraMs)

  const debriefFeito = debriefCompleto(sessao.debrief)

  return {
    toques,
    conversas,
    reunioes,
    puladas: sessao.puladas.length,
    notasDeVoz: sessao.notasDeVoz.length,
    duracaoMin: decorridos,
    restanteMs,
    esgotado: sessao.iniciadaEm !== null && restanteMs <= 0,
    debriefFeito,
    avaliacao: avaliarHoraCheia({
      date: sessao.day,
      duracaoMin: decorridos,
      toques,
      metaToques: sessao.metaToques,
      resultados: sessao.registros.map((r) => r.resultado),
      debriefFeito,
    }),
    empresasComConversa: sessao.registros
      .filter((r) => ehConversaReal(r.resultado))
      .map((r) => r.empresa),
  }
}

/** `mm:ss` con dígitos tabulares. Nunca negativo. */
export function formatarRelogio(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(total / 60)
  const seg = total % 60
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
}

/** Frase del back del sistema: «Sair da Golden Hour? Faltam 22 min». */
export function textoDeSaida(restanteMs: number): string {
  const min = Math.ceil(restanteMs / 60_000)
  if (min <= 0) return 'O bloco já terminou. Falta só o fechamento de 60 segundos.'
  if (min === 1) return 'Falta 1 minuto.'
  return `Faltam ${min} min.`
}

/** El día de hoy en São Paulo. Un solo lugar para que la clave no baile. */
export function diaDeHoje(): IsoDate {
  return todayBr()
}
