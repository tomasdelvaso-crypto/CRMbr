// src/data/outbox.ts
// La cola de escrituras. Es la pieza por la que existe todo lo demás: un
// vendedor registra una visita dentro de un galpón sin señal, la UI la da por
// hecha, y la nota tiene que llegar igual cuando el teléfono vuelva al mundo.
//
// Garantías:
//  1. Nada se pierde: la cola vive en IndexedDB, sobrevive al cierre de la app
//     y al reinicio del teléfono.
//  2. Nada se duplica: cada mutación nace con un client_uuid que es a la vez
//     clave primaria local, UNIQUE en Postgres e idempotency_key. Reintentar
//     un insert de activities/touchpoints es literalmente inofensivo.
//  3. Nada se desordena: el flush es serial y, si una fila falla, se saltan
//     las mutaciones posteriores SOBRE ESA MISMA FILA (una escala no puede
//     aplicarse antes que el cambio de etapa que la precedía).
//
// Flush por tres vías (ver sync.ts): evento 'sync' del service worker (solo
// Chromium), evento 'online', y 'visibilitychange' — que en iOS no es un
// extra, es EL mecanismo: no hay Background Sync ni Periodic Sync.

import { agora, getDb } from './db'
import type {
  EntradaOutbox,
  LocalActivity,
  LocalTouchpoint,
  OutboxEstado,
  OutboxMutation,
  ResultadoFlush,
  TransporteOutbox,
} from './local-types'
import { ErroOutbox } from './local-types'

/* ══════════════════════════════════════════════════════════════════════════
   Backoff
   ══════════════════════════════════════════════════════════════════════════ */

/** Primer reintento a los 2s. */
export const BACKOFF_BASE_MS = 2_000
/** Tope: 5 minutos. Más que eso y el vendedor cree que la app se colgó. */
export const BACKOFF_TETO_MS = 5 * 60_000
/** Después de esto la mutación queda en 'erro' y espera un retry() humano. */
export const MAX_TENTATIVAS = 8

/**
 * Backoff exponencial con tope y jitter. El jitter evita que los 6 teléfonos
 * del equipo, que salen del subsuelo del mismo cliente al mismo tiempo,
 * peguen contra Supabase en el mismo milisegundo.
 */
export function calcularBackoff(tentativas: number, jitter: number = Math.random()): number {
  const n = Math.max(1, Math.trunc(tentativas))
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_TETO_MS)
  // ±20 %
  const fator = 0.8 + jitter * 0.4
  return Math.round(base * fator)
}

/* ══════════════════════════════════════════════════════════════════════════
   Identificadores
   ══════════════════════════════════════════════════════════════════════════ */

/** client_uuid v4. Fallback manual para WebViews viejas sin randomUUID. */
export function novoClientUuid(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  // Marcas de versión 4 y variante RFC 4122.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/* ══════════════════════════════════════════════════════════════════════════
   Contador observable (el badge 'X registros pendentes')
   ══════════════════════════════════════════════════════════════════════════ */

type Ouvinte = (pendentes: number) => void

const ouvintes = new Set<Ouvinte>()
let ultimoCount = 0

/**
 * Suscripción al contador de pendientes. Devuelve la función de baja.
 * Diseñada para useSyncExternalStore: getSnapshot devuelve un número estable.
 */
export function observarPendentes(ouvinte: Ouvinte, avisarAgora = true): () => void {
  ouvintes.add(ouvinte)
  // Primer disparo con el valor cacheado; el real llega del refresco async.
  if (avisarAgora) ouvinte(ultimoCount)
  void refrescarContador()
  return () => {
    ouvintes.delete(ouvinte)
  }
}

/** Último contador conocido, sin tocar IndexedDB. Para render síncrono. */
export function pendentesAgora(): number {
  return ultimoCount
}

/**
 * Store listo para useSyncExternalStore(subscribe, getSnapshot).
 * No avisa al suscribirse —React ya leyó el snapshot— y getSnapshot devuelve
 * siempre el mismo número hasta que el contador cambia de verdad.
 */
export const storePendentes = {
  subscribe(aviso: () => void): () => void {
    return observarPendentes(() => {
      aviso()
    }, false)
  },
  getSnapshot(): number {
    return ultimoCount
  },
}

async function refrescarContador(): Promise<void> {
  const n = await pendingCount()
  if (n === ultimoCount) return
  ultimoCount = n
  for (const o of ouvintes) o(n)
}

/* ══════════════════════════════════════════════════════════════════════════
   Transporte
   ══════════════════════════════════════════════════════════════════════════ */

let transporte: TransporteOutbox | null = null

/** Inyecta el transporte. Los tests le pasan uno de mentira; la app, Supabase. */
export function definirTransporte(t: TransporteOutbox | null): void {
  transporte = t
}

async function transporteAtual(): Promise<TransporteOutbox> {
  if (transporte) return transporte
  // Import perezoso: así los tests del outbox nunca cargan supabase.ts (que
  // exige variables de entorno) y el bundle no paga el cliente hasta el
  // primer envío real.
  const { transporteSupabase } = await import('./transport')
  transporte = transporteSupabase
  return transporte
}

/* ══════════════════════════════════════════════════════════════════════════
   Encolar
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Encola una escritura y devuelve su client_uuid.
 * NO dispara el flush: quien llama (mutations.ts) aplica primero el cambio
 * optimista en Dexie y recién después pide el flush, para que un flush
 * instantáneo no gane la carrera contra la escritura local.
 */
export async function enqueue(entrada: EntradaOutbox): Promise<string> {
  const id = entrada.id ?? novoClientUuid()
  const ts = agora()
  const campos =
    entrada.campos_tocados !== undefined
      ? [...entrada.campos_tocados]
      : Object.keys(entrada.payload)

  const tsPorCampo: Record<string, string> = { ...entrada.ts_por_campo }
  for (const campo of campos) tsPorCampo[campo] ??= ts

  const mutacao: OutboxMutation = {
    id,
    tabla: entrada.tabla,
    op: entrada.op,
    rpc: entrada.rpc ?? null,
    row_id: entrada.row_id ?? null,
    payload: entrada.payload,
    campos_tocados: campos,
    ts_por_campo: tsPorCampo,
    idempotency_key: id,
    intentos: 0,
    ultimo_error: null,
    estado: 'pendente',
    criado_em: ts,
    proxima_tentativa_em: ts,
  }

  await getDb().outbox.put(mutacao)
  await refrescarContador()
  return id
}

/* ══════════════════════════════════════════════════════════════════════════
   Consultas
   ══════════════════════════════════════════════════════════════════════════ */

/** Todo lo que espera envío, en orden de creación. */
export async function pending(): Promise<OutboxMutation[]> {
  const linhas = await getDb().outbox.toArray()
  return linhas.sort((a, b) => a.criado_em.localeCompare(b.criado_em))
}

/** Cuántos registros esperan envío — alimenta el badge del FAB. */
export async function pendingCount(): Promise<number> {
  return getDb().outbox.count()
}

/** Las que quedaron en 'erro' o 'conflito': las que el humano tiene que ver. */
export async function comProblema(): Promise<OutboxMutation[]> {
  return getDb().outbox.where('estado').anyOf('erro', 'conflito').toArray()
}

/**
 * Campos con mutación local pendiente sobre una fila.
 * ES LA REGLA DURA DEL SISTEMA: ningún evento remoto puede pisar un campo que
 * aparezca acá. El bug "el cambio del vendedor se revierte solo" mata la
 * confianza en la app y no se recupera.
 */
export async function pendingFields(
  tabla: string,
  rowId: string | number | null,
): Promise<string[]> {
  if (rowId === null) return []
  const linhas = await getDb()
    .outbox.where('[tabla+row_id]')
    .equals([tabla, rowId])
    .toArray()
  const campos = new Set<string>()
  for (const m of linhas) for (const c of m.campos_tocados) campos.add(c)
  return [...campos]
}

/** Timestamps locales por campo de una fila, para el LWW. */
export async function relogioPendente(
  tabla: string,
  rowId: string | number | null,
): Promise<Record<string, string>> {
  if (rowId === null) return {}
  const linhas = await getDb()
    .outbox.where('[tabla+row_id]')
    .equals([tabla, rowId])
    .toArray()
  const relogio: Record<string, string> = {}
  for (const m of linhas) {
    for (const [campo, ts] of Object.entries(m.ts_por_campo)) {
      const anterior = relogio[campo]
      if (anterior === undefined || anterior < ts) relogio[campo] = ts
    }
  }
  return relogio
}

/** client_uuids ya encolados para una tabla append-only. Anti-duplicado local. */
export async function uuidsEncolados(tabla: string): Promise<Set<string>> {
  const linhas = await getDb().outbox.where('tabla').equals(tabla).toArray()
  return new Set(linhas.map((m) => m.id))
}

/* ══════════════════════════════════════════════════════════════════════════
   Flush
   ══════════════════════════════════════════════════════════════════════════ */

let flushEmCurso: Promise<ResultadoFlush> | null = null

export interface OpcoesFlush {
  /** Ignorar el backoff: lo usa retry() y el botón 'Tentar agora'. */
  forcar?: boolean
  /**
   * Ignorar SOLO la ventana de espera, no el estado 'erro'.
   *
   * El backoff existe para no golpear un servidor que está fallando. Cuando lo
   * que falló fue el teléfono —sin señal en el galpón—, cada intento sube el
   * exponente igual, y al volver la señal la nota podía quedarse hasta cinco
   * minutos más en la cola esperando su turno. Volver a tener red es
   * información nueva: la espera ya no aplica. Lo que sí se respeta es el
   * 'erro' permanente, que no se arregla reintentando.
   */
  ignorarEspera?: boolean
  /** Tope de mutaciones por pasada. Evita bloquear el hilo al reconectar. */
  limite?: number
}

/**
 * Intenta enviar todo lo pendiente.
 * Idempotente y seguro en paralelo: si ya hay un flush corriendo, devuelve el
 * mismo promise en vez de arrancar otro (dos flushes simultáneos duplicarían
 * los intentos y desordenarían la cola).
 */
export async function flush(opcoes: OpcoesFlush = {}): Promise<ResultadoFlush> {
  if (flushEmCurso) return flushEmCurso
  flushEmCurso = executarFlush(opcoes).finally(() => {
    flushEmCurso = null
  })
  return flushEmCurso
}

async function executarFlush(opcoes: OpcoesFlush): Promise<ResultadoFlush> {
  const { forcar = false, ignorarEspera = false, limite = 200 } = opcoes
  const db = getDb()
  const resultado: ResultadoFlush = { enviados: 0, falhados: 0, conflitos: 0, adiados: 0 }

  const t = await transporteAtual()
  const agoraIso = agora()
  const todas = await pending()

  // Filas con una mutación fallida en esta pasada: sus mutaciones posteriores
  // esperan. Si no, un update #2 podría aplicarse sin el #1.
  const bloqueadas = new Set<string>()
  let procesadas = 0

  for (const mutacao of todas) {
    if (procesadas >= limite) {
      resultado.adiados += 1
      continue
    }
    const chaveFila = `${mutacao.tabla}:${String(mutacao.row_id ?? mutacao.id)}`

    if (bloqueadas.has(chaveFila)) {
      resultado.adiados += 1
      continue
    }
    if (mutacao.estado === 'conflito') {
      // Espera decisión humana: no se reintenta sola.
      continue
    }
    if (!forcar && mutacao.estado === 'erro') {
      continue
    }
    if (!forcar && !ignorarEspera && mutacao.proxima_tentativa_em > agoraIso) {
      resultado.adiados += 1
      continue
    }

    procesadas += 1
    await db.outbox.update(mutacao.id, { estado: 'enviando' satisfies OutboxEstado })

    try {
      await t.enviar(mutacao)
      await db.outbox.delete(mutacao.id)
      resultado.enviados += 1
    } catch (erro) {
      const classificado = classificarErro(erro)

      if (classificado.tipo === 'duplicado') {
        // El servidor ya la tiene: el reintento hizo su trabajo. Éxito.
        await db.outbox.delete(mutacao.id)
        resultado.enviados += 1
        continue
      }

      const tentativas = mutacao.intentos + 1
      bloqueadas.add(chaveFila)

      if (classificado.tipo === 'conflito') {
        await db.outbox.update(mutacao.id, {
          estado: 'conflito' satisfies OutboxEstado,
          intentos: tentativas,
          ultimo_error: classificado.message,
        })
        resultado.conflitos += 1
        continue
      }

      const permanente =
        classificado.tipo === 'permanente' || tentativas >= MAX_TENTATIVAS
      if (permanente) {
        await db.outbox.update(mutacao.id, {
          estado: 'erro' satisfies OutboxEstado,
          intentos: tentativas,
          ultimo_error: classificado.message,
        })
        resultado.falhados += 1
      } else {
        await db.outbox.update(mutacao.id, {
          estado: 'pendente' satisfies OutboxEstado,
          intentos: tentativas,
          ultimo_error: classificado.message,
          proxima_tentativa_em: new Date(Date.now() + calcularBackoff(tentativas)).toISOString(),
        })
        resultado.adiados += 1
      }
    }
  }

  await refrescarContador()
  return resultado
}

function classificarErro(erro: unknown): ErroOutbox {
  if (erro instanceof ErroOutbox) return erro
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  // Sin clasificación explícita se asume red: reintentar es más barato que
  // descartar una nota del vendedor.
  return new ErroOutbox(mensagem, 'rede', erro)
}

/* ══════════════════════════════════════════════════════════════════════════
   Reintentos y limpieza
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Vuelve a poner en cola lo que quedó en 'erro' (o una mutación puntual) y
 * dispara el flush. Es el botón 'Tentar de novo' de la bandeja de pendientes.
 */
export async function retry(id?: string): Promise<ResultadoFlush> {
  const db = getDb()
  const patch: Partial<OutboxMutation> = {
    estado: 'pendente',
    intentos: 0,
    ultimo_error: null,
    proxima_tentativa_em: agora(),
  }
  if (id !== undefined) {
    await db.outbox.update(id, patch)
  } else {
    await db.outbox.where('estado').anyOf('erro', 'enviando').modify(patch)
  }
  await refrescarContador()
  return flush({ forcar: true })
}

/**
 * Descarta una mutación. Solo desde la UI y con confirmación: es tirar a la
 * basura algo que el vendedor escribió.
 */
export async function descartar(id: string): Promise<void> {
  await getDb().outbox.delete(id)
  await refrescarContador()
}

/**
 * Rescata las que quedaron en 'enviando' porque la app murió en pleno envío.
 * Se llama al arrancar. No hay riesgo de duplicar: el client_uuid es UNIQUE
 * en el servidor y un reintento del mismo insert vuelve como 'duplicado'.
 */
export async function recuperarEnviando(): Promise<number> {
  const db = getDb()
  const n = await db.outbox
    .where('estado')
    .equals('enviando')
    .modify({ estado: 'pendente', proxima_tentativa_em: agora() } satisfies Partial<OutboxMutation>)
  await refrescarContador()
  return n
}

/**
 * Reconstruye en Dexie las filas optimistas de los inserts append-only que
 * siguen en la cola. Se usa después de un refetch completo por purga de iOS:
 * el store se vació, pero las notas que el vendedor escribió y todavía no se
 * enviaron tienen que seguir viéndose en el timeline.
 */
export async function reaplicarOtimistas(): Promise<number> {
  const db = getDb()
  const inserts = await db.outbox.where('estado').notEqual('conflito').toArray()
  let reaplicadas = 0

  for (const m of inserts) {
    if (m.op !== 'insert') continue
    if (m.tabla === 'activities') {
      const linha = { ...m.payload } as unknown as LocalActivity
      linha.uid = m.id
      linha.client_uuid = m.id
      linha.pendente = 1
      await db.activities.put(linha)
      reaplicadas += 1
    } else if (m.tabla === 'touchpoints') {
      const linha = { ...m.payload } as unknown as LocalTouchpoint
      linha.uid = m.id
      linha.client_uuid = m.id
      linha.pendente = 1
      await db.touchpoints.put(linha)
      reaplicadas += 1
    }
  }
  return reaplicadas
}

/** Alias en inglés del contador, por si alguna pantalla lo prefiere así. */
export const pendingObservable = storePendentes
