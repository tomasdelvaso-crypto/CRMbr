// api/telegram/_lib/log.ts
// `bot_log`: dedup del webhook en DOS FASES y retención de 180 días.
//
// ══════════════════════════════════════════════════════════════════════════
// EL BUG QUE ESTO ARREGLA (4 audios perdidos, verificado)
// ══════════════════════════════════════════════════════════════════════════
// El `claimUpdate()` del v2 inserta el `update_id` ANTES de procesar y, si la
// inserción choca contra el UNIQUE, descarta el update. Suena bien hasta que
// Groq o Anthropic fallan a mitad: el handler explota, Telegram reintenta el
// MISMO update_id, el insert choca… y el reintento se tira a la basura. El
// audio se pierde para siempre. Pasó cuatro veces.
//
// Acá el claim tiene estado:
//
//   recebido       la fila está tomada, el procesamiento arrancó
//   ok:<motivo>    terminó bien. Cualquier reentrega es un duplicado real.
//   erro:<motivo>  terminó mal. Es REPROCESABLE.
//
// Un update que llega y ya tiene fila decide así:
//   · desfecho `ok:` → duplicado, se descarta (es el dedup de verdad)
//   · desfecho `erro:` → reprocesar (el reintento de Telegram hace su trabajo)
//   · `recebido` y viejo (> CLAIM_STALE_MS) → reprocesar: la invocación
//     anterior murió sin cerrar la fila
//   · `recebido` y reciente → duplicado: hay otra invocación trabajando ahora
//
// Además se guarda el update crudo en `parsed.update`, para que el re-drive
// pueda reprocesar sin depender de que Telegram vuelva a entregarlo.
//
// service_role acá es legítimo: `bot_log` y `bot_sessions` son las dos únicas
// tablas donde el v3 sigue escribiendo con la llave de servicio (§E del plano).

import { serviceClient } from '../../_lib/supabase'
import type { TelegramUpdate } from './tg'

/* ══════════════════════════════════════════════════════════════════════════
   Estados
   ══════════════════════════════════════════════════════════════════════════ */

export const OUTCOME_RECEBIDO = 'recebido'
export const PREFIXO_OK = 'ok:'
export const PREFIXO_ERRO = 'erro:'

/** Una invocación muerta deja la fila en `recebido`. 90 s la libera. */
export const CLAIM_STALE_MS = 90_000

/** El plano pide 180 días: `bot_log` guarda transcripciones íntegras. */
export const RETENCAO_DIAS = 180

export type DecisaoDeClaim = 'novo' | 'reprocessar' | 'duplicado'

export interface FilaDeLog {
  outcome: string | null
  created_at: string
}

export function ehDesfechoFinal(outcome: string | null | undefined): boolean {
  return typeof outcome === 'string' && outcome.startsWith(PREFIXO_OK)
}

/**
 * La decisión, pura y sin base de datos, para poder testearla de verdad.
 *
 * @param fila fila existente en bot_log, o null si el insert entró limpio
 */
export function decidirClaim(
  fila: FilaDeLog | null,
  agora: number = Date.now(),
  janelaMs: number = CLAIM_STALE_MS,
): DecisaoDeClaim {
  if (!fila) return 'novo'
  if (ehDesfechoFinal(fila.outcome)) return 'duplicado'
  if ((fila.outcome ?? '').startsWith(PREFIXO_ERRO)) return 'reprocessar'

  const idade = agora - new Date(fila.created_at).getTime()
  if (!Number.isFinite(idade)) return 'duplicado'
  return idade > janelaMs ? 'reprocessar' : 'duplicado'
}

/* ══════════════════════════════════════════════════════════════════════════
   Fase 1 — tomar el update
   ══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoDeClaim {
  decisao: DecisaoDeClaim
  updateId: number
}

/**
 * Toma el update para procesarlo. Devuelve `duplicado` cuando NO hay que
 * volver a procesarlo — y solo entonces.
 */
export async function reivindicarUpdate(
  update: TelegramUpdate,
  kind: string,
  telegramUserId: number | null,
): Promise<ResultadoDeClaim> {
  const db = serviceClient()
  const updateId = update.update_id

  const { error } = await db.from('bot_log').insert({
    update_id: updateId,
    kind,
    telegram_user_id: telegramUserId,
    outcome: OUTCOME_RECEBIDO,
    parsed: { update },
  })

  if (!error) return { decisao: 'novo', updateId }

  if (error.code !== '23505') {
    // Si `bot_log` está caído, procesar es mejor que no procesar: perder un
    // audio es peor que registrarlo dos veces, y el segundo lo frena la
    // idempotencia de `ventus_actions` / `registrar_touchpoint`.
    console.error(`[bot_log] claim falhou (${error.code}): seguindo sem dedup`)
    return { decisao: 'novo', updateId }
  }

  const { data } = await db
    .from('bot_log')
    .select('outcome, created_at')
    .eq('update_id', updateId)
    .maybeSingle()

  const decisao = decidirClaim((data as FilaDeLog | null) ?? null)

  if (decisao === 'reprocessar') {
    // Se vuelve a marcar `recebido` para que dos reintentos simultáneos no
    // entren los dos: el segundo verá la fila fresca y saldrá por duplicado.
    await db
      .from('bot_log')
      .update({ outcome: OUTCOME_RECEBIDO, created_at: new Date().toISOString() })
      .eq('update_id', updateId)
  }

  return { decisao, updateId }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fase 2 — anotar y cerrar
   ══════════════════════════════════════════════════════════════════════════ */

export interface CamposDeLog {
  vendor?: string | null
  input_text?: string | null
  parsed?: Record<string, unknown> | null
}

/** Anota datos intermedios. Nunca lanza: el log no puede tumbar el flujo. */
export async function anotarLog(updateId: number, campos: CamposDeLog): Promise<void> {
  try {
    const { error } = await serviceClient().from('bot_log').update(campos).eq('update_id', updateId)
    if (error) console.error(`[bot_log] update falhou: ${error.code} ${error.message}`)
  } catch (erro) {
    console.error('[bot_log] update explodiu:', erro)
  }
}

/** Cierra la fila con éxito: a partir de acá el update es un duplicado real. */
export async function fecharComExito(updateId: number, motivo: string): Promise<void> {
  try {
    await serviceClient()
      .from('bot_log')
      .update({ outcome: `${PREFIXO_OK}${motivo}`.slice(0, 200) })
      .eq('update_id', updateId)
  } catch (erro) {
    console.error('[bot_log] fecharComExito explodiu:', erro)
  }
}

/** Cierra la fila con error: queda reprocesable. */
export async function fecharComErro(updateId: number, motivo: string): Promise<void> {
  try {
    await serviceClient()
      .from('bot_log')
      .update({ outcome: `${PREFIXO_ERRO}${motivo}`.slice(0, 200) })
      .eq('update_id', updateId)
  } catch (erro) {
    console.error('[bot_log] fecharComErro explodiu:', erro)
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Re-drive y retención
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Updates que quedaron sin cerrar y siguen siendo reprocesables.
 *
 * Telegram deja de reintentar rápido; esta cola es lo que hace que un fallo de
 * Groq a las 18:04 no se lleve el audio del vendedor.
 */
export async function pendentesDeReprocesso(limite = 20): Promise<TelegramUpdate[]> {
  const corte = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data, error } = await serviceClient()
    .from('bot_log')
    .select('update_id, outcome, created_at, parsed')
    .or(`outcome.like.${PREFIXO_ERRO}%,outcome.eq.${OUTCOME_RECEBIDO}`)
    .lt('created_at', corte)
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(limite)

  if (error) {
    console.error(`[bot_log] pendentes falhou: ${error.code} ${error.message}`)
    return []
  }

  const filas = (data ?? []) as Array<{ parsed: { update?: TelegramUpdate } | null }>
  return filas
    .map((f) => f.parsed?.update)
    .filter((u): u is TelegramUpdate => Boolean(u && typeof u.update_id === 'number'))
}

/**
 * Purga por retención. `bot_log` guarda transcripciones íntegras de
 * conversaciones con clientes: sin TTL eso es un pasivo, no un activo.
 */
export async function purgarBotLog(dias: number = RETENCAO_DIAS): Promise<void> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { error } = await serviceClient().from('bot_log').delete().lt('created_at', corte)
  if (error) console.error(`[bot_log] purga falhou: ${error.code} ${error.message}`)
}
