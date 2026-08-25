// api/telegram/_lib/callback.ts
// `callback_data` con espacio de nombres y VERSIONADO por huella de estado.
//
// ══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA QUE RESUELVE
// ══════════════════════════════════════════════════════════════════════════
// Telegram no caduca los botones. Un mensaje de hace tres días sigue arriba en
// el chat con su ✅ intacto, y tocarlo vuelve a mandar exactamente el mismo
// `callback_data` que el día que se envió. El bot del v2 manda `'confirm'` a
// secas: si el vendedor sube por el chat y toca el ✅ de anteayer, se registra
// de nuevo la visita de anteayer, o peor, se aplica al borrador de hoy.
//
// El formato es `ns:id:acao:vHUELLA`:
//
//   opp:1842:done:v3q7x2      — marcar hecha la acción de la oportunidad 1842
//   lead:311:tp_interested:v1 — registrar el toque del lead 311
//   na:8452693743:amanha:vk29 — el gate de próxima acción de esta sesión
//
// La HUELLA se calcula sobre el estado que la acción da por supuesto (la etapa,
// la fecha de la próxima acción, la cantidad de toques…). Al llegar el
// callback se recalcula con el estado de AHORA: si no coincide, el botón está
// hablando de un mundo que ya no existe y se responde «esta ação já foi feita»
// en vez de duplicar.
//
// Límite de la Bot API: 64 BYTES. No 64 caracteres. Se valida al construir,
// porque un `callback_data` demasiado largo hace que `sendMessage` falle
// entero y el vendedor no ve ningún mensaje.

/** Espacios de nombres. Uno por familia de botones. */
export const NAMESPACES = [
  'opp', // acciones sobre una oportunidad
  'lead', // acciones sobre un lead
  'na', // gate de próxima acción (Hoje / Amanhã / Segunda / +7d)
  'reg', // confirmar / corrigir / cancelar un registro
  'gh', // sesión de Golden Hour
  'cmp', // veredicto de compromissos
  'und', // desfazer
  'nav', // paginación y navegación pura
] as const

export type Namespace = (typeof NAMESPACES)[number]

export interface AcaoDeCallback {
  ns: Namespace
  /** Id de la entidad, o la clave de sesión cuando la acción no tiene entidad. */
  id: string
  /** Verbo corto: `done`, `amanha`, `confirmar`, `pick`… */
  acao: string
  /** Huella del estado, siempre con prefijo `v`. */
  fp: string
}

export const MAX_CALLBACK_BYTES = 64

const PADRAO = /^([a-z]{2,4}):([A-Za-z0-9_-]{0,26}):([a-z0-9_]{1,18}):(v[A-Za-z0-9]{1,12})$/

/* ══════════════════════════════════════════════════════════════════════════
   Huella
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * FNV-1a de 32 bits en base36. No es criptográfico y no tiene por qué serlo:
 * lo único que hace falta es que dos estados distintos den huellas distintas
 * con altísima probabilidad, en 6 caracteres que quepan en los 64 bytes.
 */
export function fingerprint(estado: unknown): string {
  const texto = typeof estado === 'string' ? estado : JSON.stringify(estado ?? null)
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `v${h.toString(36)}`
}

/**
 * Huella de una oportunidad: lo que cualquier botón sobre ella da por supuesto.
 * Si el equipo movió la etapa o ya cerró la próxima acción, el botón viejo
 * deja de valer.
 */
export function fpOportunidade(o: {
  stage?: number | null
  next_action_date?: string | null
  next_action_done?: boolean | null
}): string {
  return fingerprint(`${o.stage ?? ''}|${o.next_action_date ?? ''}|${o.next_action_done ?? ''}`)
}

/** Huella de un lead: la etapa de prospección y cuántos toques lleva. */
export function fpLead(l: { stage?: string | null; touchpoints_count?: number | null }): string {
  return fingerprint(`${l.stage ?? ''}|${l.touchpoints_count ?? 0}`)
}

/** Huella de una tarea: su fecha objetivo y su estado. */
export function fpTask(t: { data_alvo?: string | null; status?: string | null }): string {
  return fingerprint(`${t.data_alvo ?? ''}|${t.status ?? ''}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   Serializar / leer
   ══════════════════════════════════════════════════════════════════════════ */

export class ErroDeCallback extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeCallback'
  }
}

/** Bytes UTF-8 reales, que es lo que Telegram cuenta. */
export function bytesDe(texto: string): number {
  return Buffer.byteLength(texto, 'utf8')
}

export function montarCallback(acao: AcaoDeCallback): string {
  const data = `${acao.ns}:${acao.id}:${acao.acao}:${acao.fp}`
  if (!PADRAO.test(data)) {
    throw new ErroDeCallback(`callback_data fora do formato: ${data}`)
  }
  if (bytesDe(data) > MAX_CALLBACK_BYTES) {
    throw new ErroDeCallback(`callback_data com ${bytesDe(data)} bytes (máx ${MAX_CALLBACK_BYTES}): ${data}`)
  }
  return data
}

/** Devuelve null si el dato no es nuestro o está corrupto. Nunca lanza. */
export function lerCallback(data: string | undefined | null): AcaoDeCallback | null {
  if (!data) return null
  const m = PADRAO.exec(data)
  if (!m) return null
  const ns = m[1] as Namespace
  if (!(NAMESPACES as readonly string[]).includes(ns)) return null
  return { ns, id: m[2] ?? '', acao: m[3] ?? '', fp: m[4] ?? '' }
}

/**
 * ¿El botón sigue hablando del estado actual?
 *
 * `fpAtual` null significa que la entidad desapareció: el botón tampoco vale.
 */
export function callbackVigente(acao: AcaoDeCallback, fpAtual: string | null): boolean {
  return fpAtual !== null && acao.fp === fpAtual
}

/** El texto exacto que ve el vendedor cuando toca un botón vencido. */
export const AVISO_BOTAO_VELHO = 'Esta ação já foi feita.'
