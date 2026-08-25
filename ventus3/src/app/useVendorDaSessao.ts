// src/app/useVendorDaSessao.ts
// Lectura TOLERANTE del vendedor de la sesión. Una sola versión para toda la app.
//
// `useSession()` lanza fuera del <SessionProvider> y está bien que lo haga: es
// un error de composición en cualquier pantalla que edite datos. Pero varias
// pantallas se montan también fuera de esa composición —el smoke test del
// router monta cada ruta sola, y el Mini App de Telegram abre una ficha antes
// de que la sesión resuelva—, y ahí lo correcto es pintar el esqueleto o el
// estado «sem sessão», no reventar la ruta contra el errorElement.
//
// NOTA DE INTEGRACIÓN: este archivo unifica tres copias byte a byte idénticas
// que vivían en Dossie/, GoldenHour/ y Ventus/. Si necesitás la variante
// estricta, usá useSession().

import { useContext } from 'react'
import { SessionContext } from './session-context'

export interface VendorDaSessao {
  vendorName: string | null
  /** La sesión todavía se está resolviendo: toca esqueleto, no vacío. */
  carregando: boolean
}

export function useVendorDaSessao(): VendorDaSessao {
  const ctx = useContext(SessionContext)
  if (!ctx) return { vendorName: null, carregando: false }
  return { vendorName: ctx.vendorName, carregando: ctx.loading }
}
