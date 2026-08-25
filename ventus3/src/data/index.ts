// src/data/index.ts
// La capa de datos offline-first de Ventus. Un solo punto de entrada:
// `import { useHoje, registrarAtividade } from '@/data'`.
//
// Mapa:
//   supabase     cliente único (auth persistida). Nadie más crea uno.
//   db           Dexie: la cartera del vendedor, versionada y con migraciones
//   outbox       cola de mutaciones con client_uuid, backoff y badge
//   transport    cómo una mutación encolada llega a Supabase
//   sync         pull incremental + los tres disparadores del flush
//   conflicts    append-only, LWW por campo y la regla dura del outbox
//   realtime     suscripciones en vivo pasando por el mismo reconciliador
//   queries      lectura con TanStack Query montada sobre Dexie
//   mutations    las 10 escrituras de dominio, todas optimistas

import type { QueryClient } from '@tanstack/react-query'
import { conectarCacheAoSync } from './queries'
import { registrarMutationDefaults } from './mutations'
import { instalarGatilhosDeSync, iniciarSync } from './sync'
import { subscribePortfolio } from './realtime'

export * from './local-types'
export * from './supabase'
export * from './db'
export * from './outbox'
// transport.ts NO se reexporta a propósito. outbox.ts lo carga con import()
// dinámico para que la cola se pueda testear sin red y sin variables de
// entorno; reexportarlo acá lo volvía estático otra vez y anulaba esa
// separación (rolldown lo reportaba como INEFFECTIVE_DYNAMIC_IMPORT). Quien
// necesite el transporte lo importa de '@/data/transport'.
export * from './conflicts'
export * from './sync'
export * from './realtime'
export * from './queries'
export * from './mutations'

export interface OpcoesCamadaDeDados {
  /** Desactiva el realtime aunque la flag de build lo permita. */
  semRealtime?: boolean
}

/**
 * Enciende toda la capa de datos para un vendedor y devuelve la limpieza.
 *
 * Orden obligatorio:
 *   1. setMutationDefaults ANTES de hidratar el cache persistido — si no, las
 *      mutaciones pausadas se restauran sin mutationFn y no se reanudan nunca.
 *   2. los disparadores de sync (online / visibilitychange / SW).
 *   3. el realtime, que es el único opcional de los tres.
 */
export function montarCamadaDeDados(
  queryClient: QueryClient,
  vendor: string,
  opcoes: OpcoesCamadaDeDados = {},
): () => void {
  registrarMutationDefaults(queryClient)

  const desconectarCache = conectarCacheAoSync(queryClient)
  const desinstalarGatilhos = instalarGatilhosDeSync(vendor)
  const desconectarRealtime = opcoes.semRealtime === true ? null : subscribePortfolio(vendor)

  void iniciarSync(vendor).catch(() => {
    // Arrancar sin red es el caso normal: Dexie ya tiene la cartera.
  })

  return () => {
    desconectarRealtime?.()
    desinstalarGatilhos()
    desconectarCache()
  }
}
