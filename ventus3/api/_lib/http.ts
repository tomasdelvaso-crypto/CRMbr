// api/_lib/http.ts
// Contrato mínimo del runtime Node de Vercel (handler estilo Express).
// Se declara acá en vez de depender de @vercel/node para no arrastrar una
// dependencia entera solo por dos interfaces — y además así los tests pueden
// construir un request/response falso sin levantar un servidor.

import { ErroDeConfiguracao, origensPermitidas } from './env.js'

export interface ApiRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
  body?: unknown
  /**
   * El runtime de Node entrega el request como stream asíncrono. Es opcional
   * porque en los tests el cuerpo llega ya materializado en `body`.
   */
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
  send(body: string): void
  setHeader(name: string, value: string | string[]): void
  end(body?: string): void
  /** Necesario para SSE. Ausente solo en respuestas falsas de test. */
  write?(chunk: string): boolean
  /** Fuerza el envío de los headers antes del primer chunk (SSE). */
  flushHeaders?(): void
  readonly writableEnded?: boolean
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>

/** Origen permitido por defecto. CORS específico, nunca '*' (el v2 abría todo). */
export const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'https://ventus.ventapel.com.br'

/* ══════════════════════════════════════════════════════════════════════════
   Errores
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Error con código de estado y código estable para el cliente.
 *
 * `mensagem` SIEMPRE en PT-BR y siempre mostrable: es lo que va a leer el
 * vendedor. El detalle técnico va en `detalhe`, que solo se loguea.
 */
export class HttpError extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhe: string | null

  constructor(status: number, codigo: string, mensagem: string, detalhe?: string) {
    super(mensagem)
    this.name = 'HttpError'
    this.status = status
    this.codigo = codigo
    this.detalhe = detalhe ?? null
  }
}

export const naoAutorizado = (msg = 'Sua sessão expirou. Entre de novo.', detalhe?: string) =>
  new HttpError(401, 'sem_sessao', msg, detalhe)

export const proibido = (msg = 'Isso está fora da sua carteira.', detalhe?: string) =>
  new HttpError(403, 'sem_permissao', msg, detalhe)

export const pedidoInvalido = (msg: string, codigo = 'pedido_invalido', detalhe?: string) =>
  new HttpError(400, codigo, msg, detalhe)

export const limiteExcedido = (msg = 'Muitas perguntas em pouco tempo. Tente daqui a um minuto.') =>
  new HttpError(429, 'limite_de_uso', msg)

/* ══════════════════════════════════════════════════════════════════════════
   CORS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El host por el que ENTRÓ este pedido.
 *
 * En Vercel, `host` ya viene reescrito al dominio público, pero detrás de
 * cualquier proxy el que manda es `x-forwarded-host`. Se mira primero ése.
 */
function hostDoPedido(req: ApiRequest): string | null {
  const bruto = header(req, 'x-forwarded-host') ?? header(req, 'host')
  if (!bruto) return null
  // Un `x-forwarded-host` con varios saltos llega como lista separada por comas.
  const primeiro = bruto.split(',')[0]?.trim()
  return primeiro && primeiro !== '' ? primeiro.toLowerCase() : null
}

/**
 * ¿El Origin del pedido es el propio host de la app?
 *
 * Esto existe porque cada deploy de Vercel tiene su URL larga
 * (`ventus3-abc123-equipe.vercel.app`) y esa URL NUNCA va a estar en
 * ALLOWED_ORIGIN. Hoy no rompe —el navegador no exige CORS para un pedido
 * same-origin— pero es una trampa esperando: basta con que algo empiece a
 * mandar `Origin` (un `fetch` con `mode: 'cors'`, una preflight por un header
 * nuevo) para que el mismo dominio que sirve la app se quede sin header y el
 * teléfono vuelva a quedarse mudo. Un pedido cuyo origen es el host que lo
 * está atendiendo no es cross-origin por definición.
 *
 * El protocolo también se compara: `http://` contra un host que se sirve por
 * `https://` no es el mismo origen, y aflojar eso sería regalar el candado.
 */
export function ehMesmaOrigem(req: ApiRequest, origem: string): boolean {
  const host = hostDoPedido(req)
  if (host === null) return false
  let url: URL
  try {
    url = new URL(origem)
  } catch {
    return false
  }
  if (url.host.toLowerCase() !== host) return false
  const proto = (header(req, 'x-forwarded-proto') ?? 'https').split(',')[0]?.trim()
  return url.protocol === `${proto ?? 'https'}:`
}

/**
 * Resuelve el origen a devolver. Devuelve null si el origen no está en la
 * lista NI es el propio host: en ese caso NO se manda el header y el navegador
 * bloquea. Fail-closed también acá.
 */
export function resolverOrigem(req: ApiRequest): string | null {
  const permitidas = origensPermitidas()
  const cabecalho = req.headers['origin']
  const origem = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho
  if (!origem) return permitidas[0] ?? null
  if (permitidas.includes(origem)) return origem
  return ehMesmaOrigem(req, origem) ? origem : null
}

export function aplicarCors(req: ApiRequest, res: ApiResponse): void {
  const origem = resolverOrigem(req)
  if (origem) res.setHeader('Access-Control-Allow-Origin', origem)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Idempotency-Key, X-Client-Version',
  )
  res.setHeader('Vary', 'Origin')
}

/** Responde el preflight. Devuelve true si ya cerró la respuesta. */
export function handlePreflight(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method !== 'OPTIONS') return false
  aplicarCors(req, res)
  res.setHeader('Access-Control-Max-Age', '600')
  res.status(204).end()
  return true
}

/* ══════════════════════════════════════════════════════════════════════════
   Respuestas
   ══════════════════════════════════════════════════════════════════════════ */

/** Error uniforme en PT-BR. */
export function fail(res: ApiResponse, status: number, message: string, code?: string): void {
  res.status(status).json({ error: { message, code: code ?? null } })
}

/** Stub estándar: 501 hasta que el endpoint esté implementado. */
export function notImplemented(res: ApiResponse, endpoint: string): void {
  res.status(501).json({
    error: {
      code: 'not_implemented',
      message: `Endpoint ${endpoint} ainda não implementado.`,
    },
  })
}

/**
 * Traduce cualquier excepción a una respuesta.
 *
 * Regla del plano: sin env var → 500 con mensaje CLARO en el log y GENÉRICO al
 * cliente. Un stack trace en el cuerpo de la respuesta es una filtración.
 */
export function responderErro(res: ApiResponse, erro: unknown, rota: string): void {
  if (erro instanceof HttpError) {
    if (erro.status >= 500) console.error(`[${rota}] ${erro.codigo}: ${erro.detalhe ?? erro.message}`)
    fail(res, erro.status, erro.message, erro.codigo)
    return
  }
  if (erro instanceof ErroDeConfiguracao) {
    console.error(`[${rota}] configuração incompleta: ${erro.variavel}`)
    fail(res, 500, 'O Ventus não está configurado neste ambiente.', 'nao_configurado')
    return
  }
  const detalhe = erro instanceof Error ? `${erro.name}: ${erro.message}\n${erro.stack ?? ''}` : String(erro)
  console.error(`[${rota}] erro inesperado: ${detalhe}`)
  fail(res, 500, 'Algo quebrou do lado do Ventus. Não foi você.', 'interno')
}

/* ══════════════════════════════════════════════════════════════════════════
   Cuerpo del pedido
   ══════════════════════════════════════════════════════════════════════════ */

/** 25 MB: un audio de 10 minutos en opus pesa ~1,2 MB; el margen es enorme. */
export const MAX_CORPO_BYTES = 25 * 1024 * 1024

function ehStream(req: ApiRequest): req is ApiRequest & AsyncIterable<Uint8Array> {
  return typeof req[Symbol.asyncIterator] === 'function'
}

/**
 * Lee el cuerpo crudo. Vercel parsea JSON y urlencoded por su cuenta; para
 * multipart hay que leer el stream a mano (no queremos `busboy` por dos campos).
 */
export async function lerCorpoBruto(
  req: ApiRequest,
  maxBytes: number = MAX_CORPO_BYTES,
): Promise<Buffer> {
  const corpo = req.body
  if (Buffer.isBuffer(corpo)) return corpo
  if (typeof corpo === 'string') return Buffer.from(corpo, 'utf8')
  if (!ehStream(req)) return Buffer.alloc(0)

  const partes: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw new HttpError(413, 'muito_grande', 'O arquivo é grande demais para o Ventus.')
    }
    partes.push(buf)
  }
  return Buffer.concat(partes)
}

/** Cuerpo JSON ya parseado, o parseado acá si vino crudo. */
export async function lerJson<T = unknown>(req: ApiRequest): Promise<T> {
  const corpo = req.body
  if (corpo !== undefined && corpo !== null && typeof corpo === 'object' && !Buffer.isBuffer(corpo)) {
    return corpo as T
  }
  const bruto = await lerCorpoBruto(req)
  if (bruto.length === 0) throw pedidoInvalido('Pedido sem corpo.')
  try {
    return JSON.parse(bruto.toString('utf8')) as T
  } catch {
    throw pedidoInvalido('Corpo do pedido não é JSON válido.')
  }
}

/** Header simple, ya normalizado a string. */
export function header(req: ApiRequest, nome: string): string | undefined {
  const valor = req.headers[nome.toLowerCase()]
  return Array.isArray(valor) ? valor[0] : valor
}

/** Exige un método concreto. Lanza 405 si no coincide. */
export function exigirMetodo(req: ApiRequest, metodo: 'GET' | 'POST'): void {
  if ((req.method ?? 'GET').toUpperCase() !== metodo) {
    throw new HttpError(405, 'metodo_invalido', `Use ${metodo} nesta rota.`)
  }
}

/**
 * Envoltorio estándar de todos los endpoints: preflight, CORS, no-store y
 * traducción de errores. Sin esto cada handler repite las mismas 8 líneas y
 * alguna se olvida — que es exactamente lo que pasó en el v2.
 */
export function rota(nome: string, handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    if (handlePreflight(req, res)) return
    aplicarCors(req, res)
    res.setHeader('Cache-Control', 'no-store')
    try {
      await handler(req, res)
    } catch (erro) {
      if (res.writableEnded) {
        // La respuesta ya salió (típico en SSE): solo queda dejar rastro.
        console.error(`[${nome}] erro depois de responder:`, erro)
        return
      }
      responderErro(res, erro, nome)
    }
  }
}
