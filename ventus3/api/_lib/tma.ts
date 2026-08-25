// api/_lib/tma.ts
// Validación del `initData` de un Telegram Mini App. Lógica PURA: sin red, sin
// Supabase, sin `process.env` obligatorio. Todo lo sucio vive en api/tma-auth.ts.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO ES LA ÚNICA PUERTA DEL MINI APP
// ══════════════════════════════════════════════════════════════════════════
// `window.Telegram.WebApp.initDataUnsafe.user.id` es exactamente lo que dice
// su nombre: **unsafe**. Es un objeto de JavaScript en el teléfono del cliente
// y cualquiera puede escribirlo desde la consola del WebView, o directamente
// abrir la URL del Mini App a mano con el `tgWebAppData` que se le ocurra. Si
// el servidor confiara en ese id, un vendedor podría registrar visitas a
// nombre de Victor Hugo con dos líneas de consola.
//
// Lo único confiable es el string CRUDO `initData`, porque viene firmado por
// los servidores de Telegram con una clave derivada del token del bot — que
// solo tenemos nosotros. La verificación es:
//
//   1. data-check-string = todos los pares `clave=valor` MENOS `hash`,
//      ordenados alfabéticamente por clave, unidos con '\n'
//   2. secret_key = HMAC-SHA256(key: "WebAppData", msg: botToken)
//   3. esperado  = HMAC-SHA256(key: secret_key,   msg: dataCheckString)
//   4. esperado === hash  (comparación en tiempo constante)
//
// `signature` NO se excluye del data-check-string. Telegram lo calcula ANTES
// que el `hash` (es la firma Ed25519 para validación por terceros), así que
// para nuestra comprobación con el bot token es un campo más. Excluirlo hace
// que TODO initData de un cliente moderno falle. Solo `validar3rd` —que acá no
// existe— excluye los dos.
//
// ══════════════════════════════════════════════════════════════════════════
// LA EXPIRACIÓN NO ES OPCIONAL
// ══════════════════════════════════════════════════════════════════════════
// El `hash` no vence nunca por sí solo: es un HMAC sobre datos estáticos. Un
// `initData` capturado de un log, de una URL compartida o de un proxy sirve
// para siempre si no se mira `auth_date`. Por eso `vencido` es un motivo de
// rechazo de primera clase y el TTL por defecto es de UNA HORA, no de un día.
// Telegram reemite el initData cada vez que se abre el Mini App, así que un
// TTL corto no molesta a nadie salvo al que robó el string.

import { createHmac, timingSafeEqual } from 'node:crypto'

/* ══════════════════════════════════════════════════════════════════════════
   Tipos
   ══════════════════════════════════════════════════════════════════════════ */

/** El `user` de Telegram, ya parseado. Solo los campos que usamos. */
export interface UsuarioDoTelegram {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
  allows_write_to_pm?: boolean
}

export interface InitDataValido {
  usuario: UsuarioDoTelegram
  /** Segundos epoch, tal como vino. */
  authDate: number
  /** Antigüedad del initData al momento de validar, en segundos. */
  idadeSeg: number
  /** `startapp=` del deep link. Máximo 64 chars por contrato de Telegram. */
  startParam: string | null
  queryId: string | null
  chatInstance: string | null
  chatType: string | null
}

/** Todas las formas de NO entrar. Cada una se loguea; ninguna se le cuenta al cliente. */
export type MotivoInvalido =
  | 'vazio'
  | 'malformado'
  | 'sem_hash'
  | 'hash_invalido'
  | 'sem_auth_date'
  | 'auth_date_invalido'
  | 'vencido'
  | 'futuro'
  | 'sem_usuario'
  | 'usuario_ilegivel'
  | 'bot'
  | 'sem_token'

export type ResultadoInitData =
  | { ok: true; dados: InitDataValido }
  | { ok: false; motivo: MotivoInvalido; detalhe: string }

export interface OpcoesDeValidacao {
  /** Cuánto vale un initData, en segundos. Por defecto 1 hora. */
  ttlSeg?: number
  /** Reloj inyectable para los tests. */
  agora?: Date
  /** Tolerancia de desfase de reloj, en segundos. */
  toleranciaSeg?: number
}

/** Una hora. Telegram reemite el initData en cada apertura del Mini App. */
export const TTL_PADRAO_SEG = 3600

/** Los teléfonos del equipo se desfasan de verdad. Mismo valor que _lib/auth.ts. */
export const TOLERANCIA_PADRAO_SEG = 60

/** Contrato de Telegram: `start_param` nunca pasa de 64 caracteres. */
export const MAX_START_PARAM = 64

/* ══════════════════════════════════════════════════════════════════════════
   Data-check-string
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Arma el data-check-string: todos los pares menos `hash`, ordenados
 * alfabéticamente por clave, unidos con '\n'.
 *
 * Se ordena con `<` sobre el string y no con `localeCompare`: Telegram compara
 * bytes, y `localeCompare` en un locale con reglas propias reordenaría claves
 * que empiezan igual. Un orden distinto = otro hash = 401 para todo el equipo.
 */
export function montarDataCheckString(pares: Iterable<readonly [string, string]>): string {
  const linhas: string[] = []
  for (const [chave, valor] of pares) {
    if (chave === 'hash') continue
    linhas.push(`${chave}=${valor}`)
  }
  linhas.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return linhas.join('\n')
}

/** secret_key = HMAC-SHA256(key: "WebAppData", msg: botToken). */
export function chaveSecreta(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest()
}

/** El hash esperado, en hex minúscula. Exportado para los tests. */
export function hashEsperado(dataCheckString: string, botToken: string): string {
  return createHmac('sha256', chaveSecreta(botToken)).update(dataCheckString).digest('hex')
}

/** Comparación en tiempo constante de dos hex del mismo largo. */
function hexIguais(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let bufA: Buffer
  let bufB: Buffer
  try {
    bufA = Buffer.from(a, 'hex')
    bufB = Buffer.from(b, 'hex')
  } catch {
    return false
  }
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return timingSafeEqual(bufA, bufB)
}

/* ══════════════════════════════════════════════════════════════════════════
   Validación
   ══════════════════════════════════════════════════════════════════════════ */

function usuarioDe(bruto: string): UsuarioDoTelegram | null {
  let objeto: unknown
  try {
    objeto = JSON.parse(bruto)
  } catch {
    return null
  }
  if (typeof objeto !== 'object' || objeto === null) return null
  const u = objeto as Record<string, unknown>
  const id = typeof u['id'] === 'number' ? u['id'] : Number(u['id'])
  if (!Number.isFinite(id) || id <= 0) return null

  const texto = (chave: string): string | undefined =>
    typeof u[chave] === 'string' ? (u[chave] as string) : undefined

  const usuario: UsuarioDoTelegram = { id: Math.trunc(id) }
  if (typeof u['is_bot'] === 'boolean') usuario.is_bot = u['is_bot']
  if (typeof u['allows_write_to_pm'] === 'boolean') {
    usuario.allows_write_to_pm = u['allows_write_to_pm']
  }
  const primeiro = texto('first_name')
  if (primeiro !== undefined) usuario.first_name = primeiro
  const ultimo = texto('last_name')
  if (ultimo !== undefined) usuario.last_name = ultimo
  const username = texto('username')
  if (username !== undefined) usuario.username = username
  const idioma = texto('language_code')
  if (idioma !== undefined) usuario.language_code = idioma
  const foto = texto('photo_url')
  if (foto !== undefined) usuario.photo_url = foto
  return usuario
}

/**
 * Valida un `initData` crudo contra el token del bot. **Fail-closed**: cualquier
 * duda es `{ ok: false }`; no existe un camino que devuelva ok con el hash sin
 * comprobar.
 *
 * El orden de las comprobaciones importa: primero el HMAC, después el reloj.
 * Al revés, un initData falsificado con `auth_date` viejo se rechazaría por
 * «vencido» y el log diría lo que no es.
 */
export function validarInitData(
  initData: string,
  botToken: string,
  opcoes: OpcoesDeValidacao = {},
): ResultadoInitData {
  if (typeof botToken !== 'string' || botToken.trim() === '') {
    return { ok: false, motivo: 'sem_token', detalhe: 'TELEGRAM_BOT_TOKEN ausente' }
  }
  if (typeof initData !== 'string' || initData.trim() === '') {
    return { ok: false, motivo: 'vazio', detalhe: 'initData vazio' }
  }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, motivo: 'malformado', detalhe: 'initData não é query-string' }
  }

  const hash = params.get('hash')
  if (hash === null || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { ok: false, motivo: 'sem_hash', detalhe: 'hash ausente ou fora de formato' }
  }

  const dataCheckString = montarDataCheckString(params)
  if (dataCheckString === '') {
    return { ok: false, motivo: 'malformado', detalhe: 'initData só traz o hash' }
  }

  if (!hexIguais(hashEsperado(dataCheckString, botToken), hash.toLowerCase())) {
    return { ok: false, motivo: 'hash_invalido', detalhe: 'HMAC não confere' }
  }

  // ── A partir de acá los datos están FIRMADOS por Telegram ───────────────
  const authDateBruto = params.get('auth_date')
  if (authDateBruto === null) {
    return { ok: false, motivo: 'sem_auth_date', detalhe: 'initData assinado sem auth_date' }
  }
  const authDate = Number(authDateBruto)
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, motivo: 'auth_date_invalido', detalhe: `auth_date=${authDateBruto}` }
  }

  const ttl = opcoes.ttlSeg ?? TTL_PADRAO_SEG
  const tolerancia = opcoes.toleranciaSeg ?? TOLERANCIA_PADRAO_SEG
  const agoraSeg = Math.floor((opcoes.agora ?? new Date()).getTime() / 1000)
  const idadeSeg = agoraSeg - authDate

  if (idadeSeg > ttl) {
    return {
      ok: false,
      motivo: 'vencido',
      detalhe: `initData de ${String(idadeSeg)}s, teto ${String(ttl)}s`,
    }
  }
  if (idadeSeg < -tolerancia) {
    return {
      ok: false,
      motivo: 'futuro',
      detalhe: `auth_date ${String(-idadeSeg)}s no futuro`,
    }
  }

  const userBruto = params.get('user')
  if (userBruto === null || userBruto.trim() === '') {
    // Pasa en canales y en algunos inline: sin usuario no hay a quién ligar.
    return { ok: false, motivo: 'sem_usuario', detalhe: 'initData sem campo user' }
  }
  const usuario = usuarioDe(userBruto)
  if (usuario === null) {
    return { ok: false, motivo: 'usuario_ilegivel', detalhe: 'user não é JSON com id' }
  }
  if (usuario.is_bot === true) {
    return { ok: false, motivo: 'bot', detalhe: `user ${String(usuario.id)} é bot` }
  }

  const start = params.get('start_param')
  const startParam =
    start !== null && start !== '' && start.length <= MAX_START_PARAM ? start : null

  return {
    ok: true,
    dados: {
      usuario,
      authDate,
      idadeSeg,
      startParam,
      queryId: params.get('query_id'),
      chatInstance: params.get('chat_instance'),
      chatType: params.get('chat_type'),
    },
  }
}
