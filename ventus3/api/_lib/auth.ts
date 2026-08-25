// api/_lib/auth.ts
// Auth fail-CLOSED: verificación local de la firma del JWT contra el JWKS de
// Supabase, sin round-trip por request. Sin token válido no se responde nada.

import type { ApiRequest } from './http'

export interface AuthContext {
  /** sub del JWT de Supabase. */
  userId: string
  /** Nombre del vendedor tal como aparece en opportunities.vendor. */
  vendorName: string
  isAdmin: boolean
}

/** Extrae y valida el Bearer token. Lanza si es inválido o falta. */
export async function requireAuth(req: ApiRequest): Promise<AuthContext> {
  throw new Error('TODO: requireAuth')
}

/** Igual que requireAuth pero además exige is_admin. */
export async function requireAdmin(req: ApiRequest): Promise<AuthContext> {
  throw new Error('TODO: requireAdmin')
}

/** Cuota por vendedor, persistida. Lanza si se excedió. */
export async function checkRateLimit(vendorName: string, bucket: string): Promise<void> {
  throw new Error('TODO: checkRateLimit')
}
