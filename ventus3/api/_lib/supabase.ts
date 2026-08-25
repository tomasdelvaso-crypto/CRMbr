// api/_lib/supabase.ts
// Cliente de servidor con service_role. NUNCA se expone al bundle: este
// archivo solo puede importarse desde api/.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function serviceClient(): SupabaseClient {
  if (cached) return cached
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados')
  }
  cached = createClient(url, key, { auth: { persistSession: false } })
  return cached
}
