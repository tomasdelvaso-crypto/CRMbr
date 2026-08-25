// src/host/detectar.ts
// Qué host es este, decidido UNA vez por carga.
//
// La detección no puede cambiar en caliente: un mismo documento no pasa de ser
// una pestaña a ser un Mini App. Cachear el host es lo que permite que
// `useHost()` funcione fuera del provider —igual que `useVendorDaSessao()`
// tolera la falta de `SessionProvider`— sin crear dos adaptadores que se
// pisarían los botones nativos.

import { dentroDoTelegram } from './ponte-telegram'
import { criarHostTelegram } from './telegram'
import { criarHostWeb } from './web'
import type { Host, TipoDeHost } from './tipos'

let cache: Host | null = null

/** El host de esta carga. Idempotente. */
export function hostAtual(): Host {
  if (cache !== null) return cache
  cache = dentroDoTelegram() ? criarHostTelegram() : criarHostWeb()
  return cache
}

export function tipoDeHost(): TipoDeHost {
  return hostAtual().tipo
}

/** Solo para tests: vuelve a detectar en la próxima llamada. */
export function redefinirHost(): void {
  cache = null
}
