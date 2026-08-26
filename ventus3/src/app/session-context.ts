// src/app/session-context.ts
// Contexto de sesión, separado del provider por el fast refresh.

import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Vendor } from '@/core'

export interface SessionContextValue {
  /** null = no logueado. Nunca undefined: para eso está `loading`. */
  session: Session | null
  /** Vendedor de la tabla vendors ligado a auth_user_id. */
  vendor: Vendor | null
  /** Nombre tal como aparece en opportunities.vendor. */
  vendorName: string | null
  isAdmin: boolean
  /**
   * `true` mientras la app todavía no sabe QUIÉN es: ni si hay sesión, ni —
   * habiéndola— a qué vendedor está ligada.
   *
   * Incluye la resolución del vendedor A PROPÓSITO. Casi todas las pantallas
   * piden sus datos con `enabled: vendorName !== null`, y TanStack Query
   * reporta una query deshabilitada como `isPending`. Si `loading` bajara
   * antes de tener el vendedor, esas pantallas pintarían su esqueleto sin
   * ningún control encima — una app que se ve cargada y no responde a nada.
   */
  loading: boolean
  /**
   * Hay sesión, la resolución YA terminó y no hay vendedor ligado. Es un
   * estado terminal y hay que decirlo: nunca un esqueleto eterno.
   */
  vendorAusente: boolean
  /** Vuelve a intentar resolver el vendedor. Para el botón «Tentar de novo». */
  revalidarVendor: () => void
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)
