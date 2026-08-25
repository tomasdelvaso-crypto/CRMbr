// src/sw.ts
// Service worker propio (estrategia injectManifest de vite-plugin-pwa).
// Regla dura: el SW NUNCA intercepta /api ni Supabase. Los datos siempre
// frescos; lo que se precachea es la cáscara de la app.

/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Workbox inyecta acá la lista de assets del build.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Navegaciones: app-shell desde el precache, EXCEPTO /api y /.well-known
// (assetlinks.json tiene que salir del servidor con su Content-Type real).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/\.well-known\//, /^\/sw\.js$/],
  }),
)

// 'prompt': solo se activa la versión nueva cuando la app lo pide
// explícitamente. Nunca en medio de una nota de voz.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data
  if (typeof data === 'object' && data !== null && 'type' in data) {
    if ((data as { type: unknown }).type === 'SKIP_WAITING') {
      void self.skipWaiting()
    }
  }
})

clientsClaim()

// ── Background Sync del outbox ──────────────────────────────────────────────
// Solo existe en Chromium. En iOS no hay Background Sync ni Periodic Sync, y
// el flush real lo dispara 'visibilitychange' desde la app (ver src/data/sync.ts).
//
// El SW NO envía nada por su cuenta: no tiene acceso a la sesión de Supabase
// ni a la lógica del outbox. Lo único que hace es despertar a la app abierta,
// o abrirla si no lo está — el envío siempre lo hace el cliente.

/** Mismo string que SYNC_TAG en src/data/sync.ts. */
const TAG_OUTBOX = 'ventus-outbox'
/** Mismo string que MENSAGEM_SW_SYNC en src/data/sync.ts. */
const MENSAGEM_FLUSH = 'ventus:flush-outbox'

interface EventoSync extends ExtendableEvent {
  readonly tag: string
}

async function avisarClientes(): Promise<void> {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const janela of janelas) janela.postMessage({ type: MENSAGEM_FLUSH })
}

self.addEventListener('sync', (event: Event) => {
  const evento = event as EventoSync
  if (evento.tag !== TAG_OUTBOX) return
  evento.waitUntil(avisarClientes())
})
