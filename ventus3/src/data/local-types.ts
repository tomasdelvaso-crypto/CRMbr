// src/data/local-types.ts
// Tipos que SOLO existen en la capa de datos local: no describen el dominio
// (eso es src/core/types.ts), describen la maquinaria del offline —outbox,
// conflictos, cursores de sync, blobs de audio.
//
// NOTA(unificación): src/core/types.ts lo escribe otro agente en paralelo.
// Todo lo que hay acá es candidato a mudarse a core SOLO si el bot o las
// funciones serverless lo necesitan. Mientras tanto vive acá para no pisar a
// nadie. Ver 'todos' del PR.

import type { Activity, IsoDate, IsoDateTime, RingKey, Touchpoint } from '@/core'

/* ══════════════════════════════════════════════════════════════════════════
   Tablas sincronizables
   ══════════════════════════════════════════════════════════════════════════ */

/** Tablas de Supabase que la app espeja en Dexie. */
export type SyncTable =
  | 'opportunities'
  | 'leads'
  | 'tasks'
  | 'activities'
  | 'touchpoints'
  | 'commitments'
  | 'vendors'

/** Las dos tablas append-only: cada fila nace con client_uuid y no se edita. */
export const TABELAS_APPEND_ONLY = ['activities', 'touchpoints'] as const
export type TabelaAppendOnly = (typeof TABELAS_APPEND_ONLY)[number]

/* ══════════════════════════════════════════════════════════════════════════
   Outbox
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Operación encolada.
 *  - `insert` append-only con client_uuid (activities, touchpoints, …)
 *  - `update` parcial sobre una fila existente, con LWW por campo
 *  - `rpc`    función de dominio en Postgres (gates, cadencia, promociones)
 */
export type OutboxOp = 'insert' | 'update' | 'rpc'

/**
 * Estados del ciclo de vida.
 *  pendente  esperando ventana de red
 *  enviando  in-flight ahora mismo (se resetea a pendente si la app muere)
 *  erro      falló de forma permanente: necesita retry() explícito del humano
 *  conflito  el servidor rechazó por staleness — hay que mostrarlo
 */
export type OutboxEstado = 'pendente' | 'enviando' | 'erro' | 'conflito'

/** Una mutación en la cola. El `id` es el client_uuid: también es la idempotency key. */
export interface OutboxMutation {
  /** client_uuid v4 generado en el dispositivo. Clave primaria y anti-duplicado. */
  id: string
  /**
   * Tabla AFECTADA — siempre, también en las mutaciones por RPC. Es la que se
   * cruza con row_id para saber qué campos están bloqueados para el realtime.
   */
  tabla: string
  op: OutboxOp
  /** Nombre de la función de Postgres cuando op='rpc'. null en el resto. */
  rpc: string | null
  /** Fila afectada. null en inserts append-only (todavía no hay id de servidor). */
  row_id: string | number | null
  /** Cuerpo a enviar: columnas para insert/update, argumentos para rpc. */
  payload: Record<string, unknown>
  /**
   * Campos que esta mutación toca. Ruta con punto para jsonb anidado:
   * 'scales.dor'. Es la lista que bloquea al realtime.
   */
  campos_tocados: string[]
  /** Timestamp local por campo tocado — el reloj del LWW por campo. */
  ts_por_campo: Record<string, IsoDateTime>
  /** Va en el header/argumento para que el servidor deduplique reintentos. */
  idempotency_key: string
  intentos: number
  ultimo_error: string | null
  estado: OutboxEstado
  criado_em: IsoDateTime
  /** No reintentar antes de este instante (backoff exponencial). */
  proxima_tentativa_em: IsoDateTime
}

/** Lo que hace falta para encolar: el resto lo completa enqueue(). */
export interface EntradaOutbox {
  tabla: string
  op: OutboxOp
  /** Obligatorio cuando op='rpc': el nombre de la función de dominio. */
  rpc?: string | null
  payload: Record<string, unknown>
  row_id?: string | number | null
  campos_tocados?: readonly string[]
  /** Si no se pasa, enqueue() usa el instante actual para todos los campos. */
  ts_por_campo?: Record<string, IsoDateTime>
  /** Para forzar un client_uuid ya conocido (el mismo que fue a Dexie). */
  id?: string
}

export interface ResultadoFlush {
  enviados: number
  falhados: number
  conflitos: number
  /** Quedaron para más tarde por backoff o por falta de red. */
  adiados: number
}

/** Clasificación del fallo: decide si se reintenta o si para la cola. */
export type TipoErroOutbox =
  /** Sin red, timeout, 5xx: se reintenta con backoff. */
  | 'rede'
  /** 4xx de validación, RLS, constraint: reintentar no arregla nada. */
  | 'permanente'
  /** El servidor ya tiene esta fila (client_uuid duplicado): éxito disfrazado. */
  | 'duplicado'
  /** La fila cambió desde que la leímos: hay que mostrar el conflicto. */
  | 'conflito'

/** Error del transporte, ya clasificado. */
export class ErroOutbox extends Error {
  readonly tipo: TipoErroOutbox
  readonly detalhe: unknown

  constructor(mensagem: string, tipo: TipoErroOutbox, detalhe?: unknown) {
    super(mensagem)
    this.name = 'ErroOutbox'
    this.tipo = tipo
    this.detalhe = detalhe
  }
}

/**
 * Transporte del outbox. Se inyecta para poder testear la cola sin red y sin
 * Supabase (ver src/data/__tests__/outbox.test.ts).
 */
export interface TransporteOutbox {
  enviar(mutacao: OutboxMutation): Promise<void>
}

/* ══════════════════════════════════════════════════════════════════════════
   Conflictos
   ══════════════════════════════════════════════════════════════════════════ */

/** Quién ganó y por qué. Se guarda SIEMPRE, aunque gane el local. */
export type ResolucaoConflito =
  /** Había mutación local pendiente sobre ese campo: la regla dura. */
  | 'local_pendente'
  /** LWW: el timestamp local es más nuevo. */
  | 'local_mais_novo'
  /** LWW: el timestamp remoto es más nuevo. */
  | 'remoto_mais_novo'
  /** Sin reloj de ninguno de los dos lados: gana el servidor. */
  | 'remoto_por_padrao'

/** Una fila de conflict_log, espejada en local para poder mostrarla offline. */
export interface ConflictRecord {
  /** Autoincremental de Dexie. */
  id?: number
  tabla: string
  row_id: string | number
  /** Ruta del campo, con punto para jsonb: 'scales.dor'. */
  campo: string
  valor_local: unknown
  valor_remoto: unknown
  /** El que quedó guardado. */
  valor_vencedor: unknown
  resolucao: ResolucaoConflito
  ts_local: IsoDateTime | null
  ts_remoto: IsoDateTime | null
  vendor: string | null
  criado_em: IsoDateTime
  /** El vendedor ya lo vio en la bandeja. */
  visto: 0 | 1
}

/** Timestamps por campo. La clave '*' es el fallback para toda la fila. */
export type RelogioDeCampos = Record<string, IsoDateTime>

/* ══════════════════════════════════════════════════════════════════════════
   Filas locales (dominio + metadatos de sincronización)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clave local estable de una fila append-only.
 * Es el client_uuid propio, o 'srv:<id>' cuando la fila nació en el servidor
 * (bot, otro dispositivo, importación). Así una fila creada offline y después
 * confirmada por el servidor ocupa UNA sola entrada, nunca dos.
 */
export interface ChaveLocal {
  uid: string
}

/** Actividad tal como vive en Dexie. */
export type LocalActivity = Activity &
  ChaveLocal & {
    client_uuid: string | null
    /** 1 mientras la fila todavía no fue confirmada por el servidor. */
    pendente: 0 | 1
  }

/** Touchpoint tal como vive en Dexie. */
export type LocalTouchpoint = Touchpoint &
  ChaveLocal & {
    client_uuid: string | null
    pendente: 0 | 1
    /** Denormalizado para poder filtrar la cola del vendedor sin join. */
    vendor: string | null
  }

/* ══════════════════════════════════════════════════════════════════════════
   Meta, cola de Golden Hour, anillos y audio
   ══════════════════════════════════════════════════════════════════════════ */

/** Store clave-valor: cursores de sync, cache de TanStack Query, flags. */
export interface MetaRecord {
  chave: string
  valor: unknown
  atualizado_em: IsoDateTime
}

/** Cursor incremental de una tabla. */
export interface SyncCursor {
  tabla: SyncTable
  /** Último updated_at ya traído. null = nunca se sincronizó. */
  desde: IsoDateTime | null
  ultimo_sync_em: IsoDateTime | null
  /** Filas aplicadas en el último pull, para el bloque de estado de Ajustes. */
  ultimas_linhas: number
}

/** Una entrada de la cola aprobada la víspera para la Golden Hour. */
export interface GoldenQueueEntry {
  /** `${vendor}:${day}:${lead_id}`. */
  uid: string
  vendor: string
  day: IsoDate
  lead_id: number
  ordem: number
  /** Etiqueta ya resuelta, para pintar la cola sin join. */
  empresa: string
  canal_sugerido: string | null
  /** Pendiente, hecho o saltado durante la sesión. */
  estado: 'pendente' | 'feito' | 'pulado'
}

/** Snapshot diario de los tres anillos, cacheado para pintar sin recalcular. */
export interface RingsSnapshot {
  /** `${vendor}:${day}`. */
  uid: string
  vendor: string
  day: IsoDate
  contatos: number
  conversas: number
  avancos: number
  metas: Record<RingKey, number>
  fechado: 0 | 1
  atualizado_em: IsoDateTime
}

/** Nota de voz esperando transcripción. El audio NO se pierde si Groq falla. */
export interface AudioBlobRecord {
  /** client_uuid: el mismo que llevará la activity resultante. */
  id: string
  blob: Blob
  mime: string
  duracao_seg: number
  vendor: string
  /** Oportunidad o lead al que se va a adjuntar. */
  alvo: { kind: 'opportunity' | 'lead'; id: number } | null
  estado: 'gravado' | 'enviando' | 'transcrito' | 'erro'
  ultimo_error: string | null
  criado_em: IsoDateTime
}

/* ══════════════════════════════════════════════════════════════════════════
   Revisão do Ventus
   ══════════════════════════════════════════════════════════════════════════ */

// RevisaoItem se MUDÓ a src/core/types.ts junto con VentusAction, el mirror de
// public.ventus_actions. Motivo: la bandeja Revisão la pintan dos clientes (la
// app y la Telegram Mini App) y la escriben tres productores (app, bot, cron).
// Acá había una tercera definición que no coincidía con la tabla del 0003
// —`tool_name` en vez de `tipo`, `entity_id` numérico cuando en la base es
// texto— y core tenía a su vez ActionProposal/FieldProposal sin usar.
// Importarlo de '@/core'.
