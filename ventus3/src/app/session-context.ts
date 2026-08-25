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
  loading: boolean
  signOut: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)
