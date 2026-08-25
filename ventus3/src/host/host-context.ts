// src/host/host-context.ts
// El contexto vive aparte del provider: un archivo que exporta un componente
// Y una constante pierde el fast refresh (misma razón por la que existen
// `theme-context.ts` y `session-context.ts`).

import { createContext } from 'react'
import type { Host, ResultadoDeEntrada } from './tipos'

/** Dónde está la entrada automática del Mini App. */
export type EstadoDeEntrada =
  /** Host web: no hay entrada automática y nunca la habrá. */
  | 'nao_aplica'
  /** Mini App: comprobando si ya hay sesión. */
  | 'verificando'
  /** Mini App: hablando con /api/tma-auth. */
  | 'entrando'
  | 'pronto'
  | 'falhou'

export interface HostContextValue {
  host: Host
  entrada: EstadoDeEntrada
  /** Solo cuando `entrada === 'falhou'`. Texto en PT-BR, mostrable. */
  falha: Extract<ResultadoDeEntrada, { ok: false }> | null
  tentarDeNovo: () => void
}

export const HostContext = createContext<HostContextValue | null>(null)
