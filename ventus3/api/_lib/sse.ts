// api/_lib/sse.ts
// Server-Sent Events sobre POST.
//
// POR QUÉ SSE SOBRE POST Y NO EventSource: EventSource solo hace GET y no
// permite mandar `Authorization`. El cliente lee con fetch + ReadableStream,
// que es lo que soportan Chrome Android e iOS 16.4+ (ver contrato.ts de la
// tela Ventus).
//
// POR QUÉ EL PING DE 15 s: los proxies móviles brasileños cortan conexiones
// ociosas entre 30 y 60 segundos. Un turno de coaching con opus puede tardar
// 25 s antes del primer token si hay tool use de por medio. Sin keepalive, el
// vendedor ve un stream que muere solo y lo lee como «la app se colgó», que es
// exactamente el 504 silencioso que el v3 viene a matar.
//
// `X-Accel-Buffering: no` es lo que impide que un proxy intermedio acumule el
// stream y lo entregue entero al final — con eso, el streaming existe en el
// servidor y no existe en el teléfono.

import type { ApiResponse } from './http.js'

export interface CanalSse {
  /** Manda un evento. Devuelve false si la conexión ya se cerró. */
  enviar(dado: unknown): boolean
  /** Cierra el stream y apaga el ping. */
  fechar(): void
  readonly aberto: boolean
}

/** Intervalo del keepalive. Ver la cabecera del archivo. */
export const PING_MS = 15_000

export function abrirSse(res: ApiResponse, aoPing: () => unknown = () => ({ tipo: 'ping' })): CanalSse {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  let aberto = true
  const escrever = (texto: string): boolean => {
    if (!aberto || res.writableEnded) return false
    if (!res.write) {
      // Respuesta sin streaming (test): se acumula y sale al cerrar.
      return false
    }
    try {
      res.write(texto)
      return true
    } catch {
      aberto = false
      return false
    }
  }

  const timer = setInterval(() => {
    if (!escrever(`data: ${JSON.stringify(aoPing())}\n\n`)) {
      clearInterval(timer)
    }
  }, PING_MS)
  // No mantener viva la lambda solo por el ping.
  if (typeof timer.unref === 'function') timer.unref()

  return {
    enviar(dado: unknown): boolean {
      // Una línea por evento: el cliente hace JSON.parse de cada `data:`.
      return escrever(`data: ${JSON.stringify(dado)}\n\n`)
    },
    fechar(): void {
      if (!aberto) return
      aberto = false
      clearInterval(timer)
      if (!res.writableEnded) res.end()
    },
    get aberto(): boolean {
      return aberto && !res.writableEnded
    },
  }
}
