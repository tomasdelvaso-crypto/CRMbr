// api/_lib/http.ts
// Contrato mínimo del runtime Node de Vercel (handler estilo Express).
// Se declara acá en vez de depender de @vercel/node para no arrastrar una
// dependencia entera solo por dos interfaces.

export interface ApiRequest {
  method?: string | undefined
  url?: string | undefined
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
  body?: unknown
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
  send(body: string): void
  setHeader(name: string, value: string | string[]): void
  end(body?: string): void
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>

/** Origen permitido. CORS específico, nunca '*' (el v2 abría todo). */
export const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'https://ventus.ventapel.com.br'

/** Responde el preflight. Devuelve true si ya cerró la respuesta. */
export function handlePreflight(req: ApiRequest, res: ApiResponse): boolean {
  if (req.method !== 'OPTIONS') return false
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Idempotency-Key')
  res.setHeader('Vary', 'Origin')
  res.status(204).end()
  return true
}

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
