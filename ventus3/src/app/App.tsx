// src/app/App.tsx
// Composición raíz: tema → cache persistido → sesión → capa de datos → router.
//
// El orden NO es arbitrario:
//  1. ThemeProvider primero: pinta el fondo antes que nada para que no haya
//     un flash blanco en el arranque en modo oscuro.
//  2. Los mutation defaults se registran ANTES de hidratar el cache. Si se
//     hidratan mutaciones pausadas y todavía no hay mutationFn por
//     mutationKey, esas mutaciones NO se reanudan nunca y el vendedor pierde
//     lo que escribió offline. Por eso van en el inicializador del useState,
//     que corre antes del primer efecto.
//  3. HostProvider decide si esto es la PWA o el Telegram Mini App y, en el
//     Mini App, abre la sesión con el initData ANTES de montar el router: si
//     el router montara primero, la guardia del Shell mandaría a /login — la
//     única pantalla que el Mini App existe para no mostrar.
//  4. SessionProvider resuelve QUIÉN es el vendedor.
//  5. CamadaDeDados enciende sync/outbox/realtime, y solo entonces.

import { useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import {
  CHAVE_CACHE_QUERY,
  criarPersisterDexie,
  criarQueryClient,
  registrarMutationDefaults,
} from '@/data'
import { HostProvider } from '@/host'
import { CamadaPWA } from '@/install'
import { ThemeProvider } from './ThemeProvider'
import { SessionProvider } from './SessionProvider'
import { CamadaDeDados } from './CamadaDeDados'
import { routes } from './routes'

// createBrowserRouter una sola vez, fuera del render: recrearlo remonta todo.
// v7_startTransition y las view transitions ya son el comportamiento por
// defecto en react-router 7.
const router = createBrowserRouter(routes)

/**
 * Buster del cache persistido. Cambiarlo descarta lo guardado en el teléfono
 * de todo el equipo: subirlo SOLO cuando cambia la forma de los datos.
 */
const CACHE_BUSTER = 'v3.0.0'

/** Una semana. Más viejo que esto, la cartera se vuelve a pedir entera. */
const CACHE_MAX_AGE = 7 * 24 * 60 * 60_000

function iniciarQueryClient(): QueryClient {
  const queryClient = criarQueryClient()
  registrarMutationDefaults(queryClient)
  return queryClient
}

export function App() {
  const [queryClient] = useState(iniciarQueryClient)
  const [persister] = useState(() => criarPersisterDexie(CHAVE_CACHE_QUERY))

  return (
    <ThemeProvider>
      <HostProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, buster: CACHE_BUSTER, maxAge: CACHE_MAX_AGE }}
          onSuccess={() => {
            // Hidratado el cache: las mutaciones que quedaron pausadas por falta
            // de red ya tienen su mutationFn y pueden reanudarse.
            void queryClient.resumePausedMutations()
          }}
        >
          <SessionProvider>
            <CamadaDeDados>
              <RouterProvider router={router} />
              {/* Instalación y actualización. Fuera del router a propósito:
                  no navega, y así no se re-monta en cada cambio de pantalla. */}
              <CamadaPWA />
            </CamadaDeDados>
          </SessionProvider>
        </PersistQueryClientProvider>
      </HostProvider>
    </ThemeProvider>
  )
}
