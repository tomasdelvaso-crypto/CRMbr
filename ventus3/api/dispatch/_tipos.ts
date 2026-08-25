// api/dispatch/_tipos.ts
// Vocabulario del dispatcher. Un solo lugar donde vive la forma de un aviso,
// para que la política (pura, testeable) y los transportes (sucios, con red)
// no se pongan de acuerdo por casualidad.
//
// Los nombres de columna son los de `notification_queue` (migración 0005) tal
// cual: el repo no traduce, así una fila de la base y un objeto de acá son la
// misma cosa y no hay una capa de mapeo donde esconder un bug.

/** 1 = interrumpe (reunión, Golden Hour) · 4 = puede esperar al viernes. */
export type Prioridade = 1 | 2 | 3 | 4

/** Los dos transportes reales. Telegram primero: es el único que llega en iOS. */
export type Transporte = 'telegram' | 'push'

/** Lo que la fila declara como destino admisible. */
export type CanalDaFila = 'push' | 'telegram' | 'ambos'

/** Header `Urgency` de RFC 8030. El push service lo usa para no despertar el radio. */
export type UrgenciaPush = 'very-low' | 'low' | 'normal' | 'high'

/**
 * Motivos de supresión. Los cinco primeros son los del CHECK de 0005; los dos
 * últimos los agrega 0012_cron.sql:
 *   expirada  — el aviso perdió sentido antes de poder salir (TTL vencido)
 *   sem_canal — el vendedor no tiene ni Telegram vinculado ni push suscrito
 */
export type MotivoDeSupressao =
  | 'orcamento_diario'
  | 'horario_silencio'
  | 'tipo_mutado'
  | 'duplicada'
  | 'entidade_resolvida'
  | 'expirada'
  | 'sem_canal'

/** Por qué se corre el aviso más tarde en vez de tirarlo. */
export type MotivoDeAdiamento = 'horario_silencio' | 'bloco_golden_hour' | 'soneca'

/**
 * Acción directa. Regla dura del plano: **ninguna notificación dice "abra o
 * app"**. O trae botones que cierran la acción sin salir del canal, o trae un
 * deep link que aterriza EN la pantalla con el registro ya abierto.
 */
export interface AcaoDeAviso {
  /** Texto del botón, en PT-BR. */
  rotulo: string
  /** `callback_data` de Telegram: namespaced y versionado (`opp:1842:done:v3`). */
  callback?: string
  /** Deep link para Web Push / Mini App. */
  deep_link?: string
}

/** Una fila de `notification_queue` pendiente de despacho. */
export interface AvisoNaFila {
  id: string
  vendor: string
  vendor_id: number | null
  tipo: string
  prioridade: Prioridade
  titulo: string
  corpo: string
  canal: CanalDaFila
  topic: string | null
  ttl_segundos: number
  deep_link: string | null
  acoes: AcaoDeAviso[] | null
  dedupe_key: string
  /** ISO-8601 con offset. Nunca un Date: viaja por JSON y por Postgres. */
  agendado_para: string
  /** Snooze del vendedor o adiamiento previo del propio dispatcher. */
  adiado_para: string | null
  opportunity_id: number | null
  lead_id: number | null
  task_id: string | null
}

/** Lo que se va a insertar en la fila. `dedupe_key` es obligatoria a propósito. */
export interface NovoAviso {
  vendor: string
  vendor_id?: number | null
  tipo: string
  titulo: string
  corpo: string
  dedupe_key: string
  prioridade?: Prioridade
  canal?: CanalDaFila
  topic?: string | null
  ttl_segundos?: number
  deep_link?: string | null
  acoes?: AcaoDeAviso[] | null
  agendado_para?: string
  opportunity_id?: number | null
  lead_id?: number | null
  task_id?: string | null
  payload?: Record<string, unknown>
}

/** `notification_prefs`, ya con los defaults resueltos. */
export interface PreferenciasDeAviso {
  vendor: string
  orcamento_diario: number
  /** 'HH:MM' o 'HH:MM:SS' — se acepta lo que devuelve Postgres para `time`. */
  silencio_de: string
  silencio_ate: string
  canais: readonly Transporte[]
  tipos_mutados: readonly string[]
  avisos_de_jogo: boolean
  hora_aprendida: number | null
}

export const PREFS_PADRAO: Omit<PreferenciasDeAviso, 'vendor'> = Object.freeze({
  // 4/día. El v2 llegó a 17 y por eso la tasa de lectura es 0,0%.
  orcamento_diario: 4,
  silencio_de: '20:00',
  silencio_ate: '07:00',
  canais: Object.freeze(['telegram', 'push'] as const),
  tipos_mutados: Object.freeze([] as readonly string[]),
  avisos_de_jogo: true,
  hora_aprendida: null,
})

/** Qué transportes tiene realmente disponibles este vendedor ahora mismo. */
export interface CanaisDisponiveis {
  telegram: boolean
  push: boolean
}

/** Cuánto presupuesto ya se gastó hoy. Se cuenta de `notification_queue`. */
export interface GastoDoDia {
  /** Enviados hoy, de cualquier prioridad. */
  total: number
  /** Enviados hoy de prioridad 2-4. La reserva de la prioridad 1 vive de esto. */
  naoUrgentes: number
}

/** Ventana de la Golden Hour, en minutos desde la medianoche BRT. */
export interface JanelaGolden {
  de: number
  ate: number
}

/* ── Salida de la política ─────────────────────────────────────────────────── */

export interface EnvioPlanejado {
  aviso: AvisoNaFila
  transportes: Transporte[]
  /** Ya saneado para el header `Topic` (≤32 chars, alfabeto base64url). */
  topic: string
  urgencia: UrgenciaPush
  /** Segundos. Corto a propósito: un aviso viejo es peor que ninguno. */
  ttl: number
  /** Ids colapsados dentro de este envío (mismo topic). */
  colapsados: string[]
}

export interface AdiamentoPlanejado {
  id: string
  ate: string
  motivo: MotivoDeAdiamento
}

export interface SupressaoPlanejada {
  id: string
  motivo: MotivoDeSupressao
}

export interface PlanoDeDespacho {
  vendor: string
  envios: EnvioPlanejado[]
  adiados: AdiamentoPlanejado[]
  suprimidos: SupressaoPlanejada[]
  /** Los que no entraron en el presupuesto, ya empaquetados en UN aviso. */
  agregado: NovoAviso | null
  /** Los que quedan pendientes sin tocar (soneca vigente). */
  aguardando: string[]
}
