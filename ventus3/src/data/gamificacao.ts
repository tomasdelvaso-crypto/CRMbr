// src/data/gamificacao.ts
// Las dos piezas transversales del juego: la PREFERENCIA (opt-out real) y los
// KUDOS.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL OPT-OUT VIVE EN LA CAPA DE DATOS Y NO EN LA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
// El PLANO es explícito: «cualquiera puede apagar anillos y rachas y quedarse
// con agenda y recordatorios, SIN PERDER ACCESO A NADA». Un opt-out que vive
// en el estado de una pantalla es un opt-out falso: al día siguiente vuelve, y
// la Corrente do time del compañero sigue mostrando tu anillo.
//
// Por eso la preferencia se guarda en `meta` (Dexie), la leen todas las
// pantallas que muestran juego, y apagar el juego NUNCA esconde un dato: el
// Placar apagado sigue mostrando el resumen factual de la semana. Se apaga la
// capa lúdica —puntos, trofeos, carriles, celebraciones—, no la información.
//
// Con 4 personas que se conocen, un tono equivocado no produce churn de
// usuario: produce resentimiento con la empresa. El interruptor es la única
// garantía estructural contra eso.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { todayBr, weekStart, type IsoDate } from '@/core'
import { gravarMeta, lerMeta } from './db'
import { novoClientUuid } from './outbox'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Preferencias del juego
   ══════════════════════════════════════════════════════════════════════════ */

export interface PreferenciasDoJogo {
  /**
   * Interruptor maestro. En false: sin PA, sin trofeos, sin carriles, sin
   * celebraciones. El Placar pasa a ser un resumen de la semana y la app
   * entera sigue funcionando igual.
   */
  ligado: boolean
  /** Confetti + háptico de celebración. Cada uno baja el volumen del suyo. */
  celebracoes: boolean
  /** Ver el carril de los compañeros. Nunca hay posiciones; esto es solo ver. */
  carrisDoTime: boolean
  /** Recibir kudos y poder darlos. */
  kudos: boolean
}

/**
 * El default es el juego encendido y completo: el equipo lo estrena así el día
 * del lanzamiento. Apagarlo es una decisión de la persona, no un estado
 * inicial que haya que descubrir.
 */
export const PREFERENCIAS_PADRAO_DO_JOGO: Readonly<PreferenciasDoJogo> = Object.freeze({
  ligado: true,
  celebracoes: true,
  carrisDoTime: true,
  kudos: true,
})

export function chavePreferenciasDoJogo(vendor: string): string {
  return `jogo:prefs:${vendor}`
}

export async function lerPreferenciasDoJogo(vendor: string): Promise<PreferenciasDoJogo> {
  const guardadas = await lerMeta<Partial<PreferenciasDoJogo>>(chavePreferenciasDoJogo(vendor))
  return { ...PREFERENCIAS_PADRAO_DO_JOGO, ...(guardadas ?? {}) }
}

export async function gravarPreferenciasDoJogo(
  vendor: string,
  mudancas: Partial<PreferenciasDoJogo>,
): Promise<PreferenciasDoJogo> {
  const atuais = await lerPreferenciasDoJogo(vendor)
  const proximas: PreferenciasDoJogo = { ...atuais, ...mudancas }
  await gravarMeta(chavePreferenciasDoJogo(vendor), proximas)
  return proximas
}

export const chavesGamificacao = {
  // Cuelga de 'placar', que es la raíz que el sync ya invalida.
  prefs: (vendor: string) => ['placar', vendor, 'prefs'] as const,
  kudos: (vendor: string, semana: IsoDate) => ['placar', vendor, semana, 'kudos'] as const,
}

export function usePreferenciasDoJogo(vendor: string | null): UseQueryResult<PreferenciasDoJogo> {
  return useQuery({
    queryKey: chavesGamificacao.prefs(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => lerPreferenciasDoJogo(vendor as string),
    // La preferencia es del teléfono y del dueño: no hay motivo para
    // revalidarla contra nada.
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export interface EntradaPreferenciasDoJogo {
  vendor: string
  mudancas: Partial<PreferenciasDoJogo>
}

export function useDefinirPreferenciasDoJogo(): UseMutationResult<
  PreferenciasDoJogo,
  Error,
  EntradaPreferenciasDoJogo
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vendor, mudancas }: EntradaPreferenciasDoJogo) =>
      gravarPreferenciasDoJogo(vendor, mudancas),
    onSuccess: (proximas, { vendor }) => {
      queryClient.setQueryData(chavesGamificacao.prefs(vendor), proximas)
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Kudos
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cinco por semana y NO se acumulan. La escasez es lo que los hace valer algo:
 * si sobraran, se repartirían por cortesía y dejarían de significar nada.
 *
 * No dan PA a propósito (cuatro personas que se conocen intercambiarían
 * favores en una semana). Dan escudos y cuentan para el trofeo Companheiro.
 */
export const KUDOS_POR_SEMANA = 5

/** Largo mínimo del texto. Un kudo sin hecho concreto es ruido educado. */
export const KUDO_TEXTO_MINIMO = 12

export interface Kudo {
  id: string
  de: string
  para: string
  /** El hecho concreto. Obligatorio: sin esto el kudo no se puede enviar. */
  texto: string
  /** Semana (segunda-feira) a la que se imputa. */
  semana: IsoDate
  em: string
}

export interface KudosDaSemana {
  semana: IsoDate
  enviados: Kudo[]
  recebidos: Kudo[]
  /** Cuántos quedan de los 5. Nunca negativo. */
  restantes: number
}

export function chaveKudos(vendor: string, semana: IsoDate): string {
  return `jogo:kudos:${vendor}:${semana}`
}

/** Buzón de entrada local. Lo llena el realtime / el bot; acá solo se lee. */
export function chaveKudosRecebidos(vendor: string): string {
  return `jogo:kudos-recebidos:${vendor}`
}

export async function fetchKudosDaSemana(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<KudosDaSemana> {
  const semana = weekStart(hoje)
  const [enviados, caixa] = await Promise.all([
    lerMeta<Kudo[]>(chaveKudos(vendor, semana)),
    lerMeta<Kudo[]>(chaveKudosRecebidos(vendor)),
  ])
  const meus = enviados ?? []
  const recebidos = (caixa ?? []).filter((k) => k.semana === semana)
  return {
    semana,
    enviados: meus,
    recebidos,
    restantes: Math.max(0, KUDOS_POR_SEMANA - meus.length),
  }
}

export interface EntradaKudo {
  de: string
  para: string
  texto: string
  hoje?: IsoDate
}

/** El texto obligatorio no se valida solo en la UI: acá también. */
export class ErroKudo extends Error {
  constructor(
    message: string,
    readonly motivo: 'sem_texto' | 'sem_saldo' | 'para_si',
  ) {
    super(message)
    this.name = 'ErroKudo'
  }
}

export async function enviarKudo(entrada: EntradaKudo): Promise<Kudo> {
  const hoje = entrada.hoje ?? todayBr()
  const semana = weekStart(hoje)
  const texto = entrada.texto.trim()

  if (entrada.para === entrada.de) {
    throw new ErroKudo('Um kudo é para outra pessoa do time.', 'para_si')
  }
  if (texto.length < KUDO_TEXTO_MINIMO) {
    throw new ErroKudo(
      'Conte o que a pessoa fez. Um kudo sem o fato concreto não diz nada.',
      'sem_texto',
    )
  }

  const atual = (await lerMeta<Kudo[]>(chaveKudos(entrada.de, semana))) ?? []
  if (atual.length >= KUDOS_POR_SEMANA) {
    throw new ErroKudo('Seus 5 kudos da semana já saíram. Na segunda vêm outros 5.', 'sem_saldo')
  }

  const kudo: Kudo = {
    id: novoClientUuid(),
    de: entrada.de,
    para: entrada.para,
    texto,
    semana,
    em: new Date().toISOString(),
  }
  await gravarMeta(chaveKudos(entrada.de, semana), [...atual, kudo])
  return kudo
}

export function useKudosDaSemana(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<KudosDaSemana> {
  return useQuery({
    queryKey: chavesGamificacao.kudos(vendor ?? '', weekStart(hoje)),
    enabled: vendor !== null,
    queryFn: () => fetchKudosDaSemana(vendor as string, hoje),
  })
}

export function useEnviarKudo(): UseMutationResult<Kudo, Error, EntradaKudo> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: enviarKudo,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}
