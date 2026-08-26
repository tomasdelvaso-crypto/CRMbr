// src/sw.ts
// Service worker propio (estrategia injectManifest de vite-plugin-pwa).
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CINCO REGLAS DE ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NUNCA INTERCEPTA /api NI SUPABASE. Un CRM que sirve una carteira vieja
//    desde el cache es peor que uno que dice «sem conexão»: el vendedor toma
//    decisiones con datos que ya no existen. Lo que se precachea es la
//    CÁSCARA (JS, CSS, íconos, index.html); los datos van siempre a la red y
//    el offline de verdad lo resuelve la capa de datos (IndexedDB + outbox).
//
// 2. LA NAVEGACIÓN OFFLINE NUNCA MUESTRA EL DINOSAURIO. Toda navegación se
//    responde con el app-shell precacheado. Y si el precache falta —primera
//    visita sin red, cache desalojado por el sistema— hay un catch handler
//    con una página propia en PT-BR que explica qué pasa. La página del
//    navegador dice «no hay internet»; la nuestra dice «lo que dictaste está
//    guardado».
//
// 3. LA ACTUALIZACIÓN NO SE APLICA SOLA. `skipWaiting()` sólo corre cuando la
//    app manda SKIP_WAITING, y la app sólo lo manda cuando la persona toca
//    «Atualizar» en el toast. Recargar de golpe mientras alguien dicta una
//    nota es perder la nota. Ver src/install/atualizacao.ts.
//
// 4. EL SHARE TARGET ES UN POST Y SE ATIENDE ACÁ. Android manda el
//    «Compartilhar» de WhatsApp/Câmera como POST multipart contra /registrar.
//    Un POST no se puede responder con index.html sin perder el cuerpo: el SW
//    lo guarda en Cache Storage y redirige a /registrar?compartilhado=<id>,
//    que la app lee con src/install/compartilhado.ts.
//
// 5. EL PUSH VIVE EN OTRO ARCHIVO. Un único import, abajo, y nada más.

/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing'
import {
  CACHE_COMPARTILHADO,
  CAMPO_ARQUIVOS,
  HEADER_NOME,
  PARAM_COMPARTILHADO,
  VALIDADE_COMPARTILHADO_MS,
  instanteDoId,
  novoId,
  urlDoArquivo,
  urlDoPacote,
  type PacoteCompartilhado,
} from './install/contrato-share'

// Web Push: 'push', 'notificationclick' y 'pushsubscriptionchange'. Vive en su
// propio módulo y se registra al importarse — este import es TODA la superficie
// que el push ocupa en este archivo.
import './sw-push'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Workbox inyecta acá la lista de assets del build.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

/* ══════════════════════════════════════════════════════════════════════════
   1 · Todo lo que el SW NO toca
   ══════════════════════════════════════════════════════════════════════════ */

/** ¿Esta URL es dato vivo (nuestra API o Supabase) y no cáscara? */
function ehDadoVivo(url: URL): boolean {
  if (url.pathname.startsWith('/api/')) return true
  if (url.hostname.endsWith('.supabase.co')) return true
  if (url.hostname.endsWith('.supabase.in')) return true
  return false
}

// Passthrough explícito. Sin esta ruta el resultado sería el mismo —Workbox
// deja pasar lo que no matchea—, pero declararla es lo que impide que un
// `registerRoute` futuro con un matcher generoso se coma la API sin que nadie
// lo note hasta que un vendedor vea un valor de ayer.
const passarDeLargo = ({ url }: { url: URL }): boolean => ehDadoVivo(url)
const soRede = ({ request }: { request: Request }): Promise<Response> => fetch(request)
registerRoute(passarDeLargo, soRede)
registerRoute(passarDeLargo, soRede, 'POST')
registerRoute(passarDeLargo, soRede, 'PUT')
registerRoute(passarDeLargo, soRede, 'DELETE')

/* ══════════════════════════════════════════════════════════════════════════
   2 · Share target: el POST de «Compartilhar»
   ══════════════════════════════════════════════════════════════════════════ */

/** Borra los paquetes compartidos que ya pasaron las 24 h. */
async function varrerCompartilhados(cache: Cache, agora: number): Promise<void> {
  const chaves = await cache.keys()
  for (const chave of chaves) {
    const partes = new URL(chave.url).pathname.split('/')
    const id = partes[2]
    if (!id) continue
    const instante = instanteDoId(id)
    if (instante === null || agora - instante > VALIDADE_COMPARTILHADO_MS) {
      await cache.delete(chave)
    }
  }
}

/**
 * Guarda el paquete compartido y devuelve el redirect a /registrar.
 *
 * Si algo falla (formData ilegible, cache lleno) igual redirige, pero SIN el
 * parámetro: es preferible abrir Registrar vacío que quedarse en una pantalla
 * de error dentro de la app instalada.
 */
async function receberCompartilhamento(request: Request): Promise<Response> {
  const destino = new URL('/registrar', self.location.origin)
  try {
    const agora = Date.now()
    const id = novoId(agora, Math.random().toString(36).slice(2, 8))
    const form = await request.formData()
    const cache = await caches.open(CACHE_COMPARTILHADO)
    await varrerCompartilhados(cache, agora)

    const arquivos = form.getAll(CAMPO_ARQUIVOS).filter((v): v is File => typeof v !== 'string')
    for (let i = 0; i < arquivos.length; i += 1) {
      const arquivo = arquivos[i]
      if (!arquivo) continue
      await cache.put(
        new Request(new URL(urlDoArquivo(id, i), self.location.origin)),
        new Response(arquivo, {
          headers: {
            'Content-Type': arquivo.type || 'application/octet-stream',
            [HEADER_NOME]: encodeURIComponent(arquivo.name || `arquivo-${i}`),
          },
        }),
      )
    }

    const texto = (chave: string): string => {
      const valor = form.get(chave)
      return typeof valor === 'string' ? valor : ''
    }
    const pacote: PacoteCompartilhado = {
      titulo: texto('title'),
      texto: texto('text'),
      url: texto('url'),
      arquivos: arquivos.length,
      criadoEm: agora,
    }
    await cache.put(
      new Request(new URL(urlDoPacote(id), self.location.origin)),
      new Response(JSON.stringify(pacote), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    destino.searchParams.set(PARAM_COMPARTILHADO, id)
  } catch {
    // Se ignora a propósito: el redirect de abajo es la salida digna.
  }
  // 303: obliga al navegador a convertir el POST en un GET. Sin esto el
  // navegador reintenta el POST contra /registrar y Vercel devuelve 405.
  return Response.redirect(destino.href, 303)
}

registerRoute(
  ({ url, request }) => request.method === 'POST' && url.pathname === '/registrar',
  ({ request }) => receberCompartilhamento(request),
  'POST',
)

/* ══════════════════════════════════════════════════════════════════════════
   3 · Navegación: el app-shell, y una red de contención debajo
   ══════════════════════════════════════════════════════════════════════════ */

// Navegaciones: app-shell desde el precache, EXCEPTO /api y /.well-known
// (assetlinks.json tiene que salir del servidor con su Content-Type real).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/\.well-known\//, /^\/sw\.js$/],
  }),
)

/**
 * La página de contención. Sólo se ve si el precache no tiene index.html —
 * primera visita sin red, o cache desalojado por falta de espacio.
 *
 * Es HTML plano, sin CSS externo ni JS de la app, porque en el escenario en
 * que aparece NO HAY NADA MÁS DISPONIBLE. Sigue el sistema visual (colores de
 * src/index.css, safe areas, claro y oscuro) para no parecer otra aplicación.
 */
const PAGINA_OFFLINE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Ventus — sem conexão</title>
<style>
  :root{--bg:#f8fafc;--fg:#0f172a;--tenue:#64748b;--marca:#2563eb;--borda:#e2e8f0;--sup:#fff}
  @media (prefers-color-scheme:dark){
    :root{--bg:#0b1220;--fg:#e2e8f0;--tenue:#94a3b8;--marca:#3b82f6;--borda:#1e293b;--sup:#131c2f}
  }
  *{box-sizing:border-box}
  body{margin:0;min-height:100svh;display:flex;align-items:center;justify-content:center;
    padding:calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);
    background:var(--bg);color:var(--fg);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
  main{max-width:26rem;text-align:center}
  svg{margin-bottom:20px}
  h1{font-size:1.5rem;line-height:1.25;margin:0 0 8px;letter-spacing:-.02em}
  p{margin:0 0 12px;color:var(--tenue);font-size:.95rem}
  .caixa{margin-top:20px;padding:14px 16px;border:1px solid var(--borda);border-radius:14px;
    background:var(--sup);text-align:left;font-size:.9rem;color:var(--tenue)}
  .caixa strong{color:var(--fg)}
  button{margin-top:20px;width:100%;min-height:48px;border:0;border-radius:12px;
    background:var(--marca);color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
  button:active{opacity:.85}
</style>
</head>
<body>
<main>
  <svg width="72" height="72" viewBox="0 0 512 512" aria-hidden="true">
    <rect width="512" height="512" rx="115" fill="#2563eb"/>
    <path d="M133 160 L256 344 L379 160" fill="none" stroke="#fff" stroke-width="63"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <h1>Sem conexão agora</h1>
  <p>O Ventus não conseguiu abrir esta tela porque o aparelho está sem rede e esta é a primeira
     vez que ela é aberta neste celular.</p>
  <div class="caixa">
    <strong>Nada do que você registrou se perdeu.</strong> O que foi ditado ou escrito fica
    guardado no aparelho e sobe sozinho assim que o sinal voltar.
  </div>
  <button type="button" onclick="location.reload()">Tentar de novo</button>
</main>
</body>
</html>`

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return new Response(PAGINA_OFFLINE, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  return Response.error()
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · Ciclo de vida
   ══════════════════════════════════════════════════════════════════════════ */

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

// ── Limpeza de caches alheios ───────────────────────────────────────────────
// Este domínio pode ter sido servido antes por OUTRA app: o projeto Vercel do
// Ventus fez o primeiro deploy a partir da raiz do repositório — o CRM v2, que
// também é uma PWA — antes de o Root Directory apontar para ventus3/. O service
// worker daquele build registrou-se nesta origem e deixou os caches dele para
// trás. Sem esta varredura eles ficam ocupando quota para sempre.
//
// Conservador de propósito: só sobrevive o que a gente reconhece.
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys()
      await Promise.all(
        nomes
          .filter((nome) => !nome.startsWith('workbox-precache') && nome !== CACHE_COMPARTILHADO)
          .map((nome) => caches.delete(nome)),
      )
    })(),
  )
})

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
