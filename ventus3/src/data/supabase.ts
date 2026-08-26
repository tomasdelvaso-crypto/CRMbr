// src/data/supabase.ts
// Cliente Supabase del navegador. ÚNICO punto de creación en todo el bundle:
// nunca instanciar otro createClient (el v2 tenía dos, en src/supabaseClient.ts
// y dentro de un módulo de features, y eso rompía la sesión de forma
// intermitente — el token se refrescaba en una instancia y la otra seguía con
// el viejo hasta el siguiente reload).
//
// Regla de la app: ningún componente importa este módulo. Las lecturas pasan
// por queries.ts (Dexie) y las escrituras por mutations.ts → outbox.ts.

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

import { configPublica } from './config-publica'

// Si faltara la configuración, main.tsx muestra la pantalla de diagnóstico y
// nunca llega a importar este módulo. Ver src/data/config-publica.ts.
const { url, anonKey } = configPublica()

/** Clave de storage de la sesión. Fija: si cambia, el equipo se desloguea. */
export const AUTH_STORAGE_KEY = 'ventus.auth'

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'ventus3' },
  },
  realtime: {
    // Techo de eventos por segundo. Con 6 personas y ~10 tablas alcanza y
    // sobra; evita que una reindexación del servidor inunde el socket.
    params: { eventsPerSecond: 5 },
  },
})

/** Sesión actual, o null. No lanza: sin red devuelve la persistida. */
export async function sessaoAtual(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session
}

/** ¿Hay sesión viva? Se usa para distinguir 'nunca entró' de 'iOS purgó'. */
export async function temSessao(): Promise<boolean> {
  return (await sessaoAtual()) !== null
}

/**
 * ¿Hay red? `navigator.onLine` miente hacia arriba (dice true en un wifi de
 * hotel sin salida) pero nunca hacia abajo: si dice false, no hay red. Se usa
 * solo para NO intentar, jamás para asumir que el envío va a funcionar.
 */
export function talvezOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}
