/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { lerUrlPublica } from './scripts/url-publica.mjs'

// ══════════════════════════════════════════════════════════════════════════
// La URL pública, inyectada en index.html
// ══════════════════════════════════════════════════════════════════════════
// og:image y og:url tienen que ser absolutas: WhatsApp —por donde se manda el
// link de /instalar— no resuelve rutas relativas y el link llega como texto
// pelado. Absoluta significa que el host queda escrito en el HTML, y ahí es
// donde se pudría: quedaba `ventus.ventapel.com.br`, un dominio que todavía
// no existe, mientras el sitio vivía en otro lado.
//
// Ahora el HTML escribe `%VENTUS_URL%` y este plugin lo reemplaza en build y
// en dev con el valor de config/url-publica.txt (o de la variable VENTUS_URL).
// Va con `order: 'pre'` para correr antes del reemplazo de %VITE_*% que hace
// el propio Vite, que no conoce esta clave y la dejaría intacta.
function urlPublicaNoHtml(): Plugin {
  return {
    name: 'ventus-url-publica',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('%VENTUS_URL%', lerUrlPublica())
      },
    },
  }
}

// Configuración única de Ventus v3.
// Una sola app Vite: el dominio (src/core) se comparte con api/ por import relativo.
export default defineConfig({
  plugins: [
    urlPublicaNoHtml(),
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: el service worker es nuestro (src/sw.ts), Workbox solo
      // inyecta la lista de assets precacheados en self.__WB_MANIFEST.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt' y NUNCA 'autoUpdate': la app no puede recargarse sola mientras
      // el vendedor está dictando una nota.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      // ══════════════════════════════════════════════════════════════════
      // EL MANIFEST — todos los íconos salen de scripts/gerar-icones.mjs
      // ══════════════════════════════════════════════════════════════════
      // Decisiones que no son obvias:
      //
      //  · `theme_color` es el AZUL DE MARCA y no el fondo de la app. En
      //    tiempo de ejecución manda el <meta name="theme-color"> de
      //    index.html, que ya está partido por `prefers-color-scheme`; el
      //    del manifest se ve en la tarjeta de instalación y en el
      //    conmutador de apps de Android, donde lo que tiene que aparecer
      //    es la marca.
      //  · `background_color` es el fondo OSCURO aunque el tema por defecto
      //    sea «sistema»: es el color del splash de Android 12+, y un
      //    destello blanco a la noche en un galpón es mucho peor que un
      //    destello oscuro a las tres de la tarde.
      //  · `display_override` pide standalone y baja a minimal-ui: si algún
      //    navegador no soporta standalone, mejor una barra mínima que caer
      //    a `browser` y perder la ilusión de app entera.
      //  · Los íconos `any` y `maskable` son ARCHIVOS DISTINTOS. Declarar
      //    `purpose: 'any maskable'` sobre el mismo PNG es el error que hace
      //    que Android le coma las puntas al chevron.
      manifest: {
        id: '/',
        name: 'Ventus',
        short_name: 'Ventus',
        description: 'CRM de campo da Ventapel Brasil — metodologia PPVVCC',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#2563eb',
        background_color: '#0b1220',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/?source=pwa',
        categories: ['business', 'productivity', 'utilities'],
        // Abrir un atajo o un link no abre una segunda instancia con el
        // outbox a medio vaciar: enfoca la que ya está viva.
        launch_handler: { client_mode: 'focus-existing' },
        handle_links: 'preferred',
        prefer_related_applications: false,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Sin `screenshots`, Android muestra el mini-infobar de dos líneas en
        // vez de la ficha de instalación con imágenes. Narrow y wide tienen
        // que ir juntas: Chrome descarta el set si falta el form_factor.
        screenshots: [
          {
            src: '/screenshots/hoje.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'As três ações de hoje, com os anéis do dia',
          },
          {
            src: '/screenshots/golden.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Golden Hour: uma empresa por vez, com a pergunta pronta',
          },
          {
            src: '/screenshots/gestor.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Painel do gestor: as filas que precisam de decisão',
          },
        ],
        // Los tres atajos del press-and-hold en el ícono. Son las tres cosas
        // que el vendedor hace sin pensar; cualquier cuarta es ruido.
        shortcuts: [
          {
            name: 'Registrar por voz',
            short_name: 'Registrar',
            description: 'Ditar o que aconteceu na visita, mesmo sem sinal',
            url: '/registrar?atalho=voz',
            icons: [{ src: '/atalho-registrar.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Golden Hour',
            short_name: 'Golden',
            description: 'Entrar direto no modo foco da hora de prospecção',
            url: '/golden?atalho=1',
            icons: [{ src: '/atalho-golden.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Hoje',
            short_name: 'Hoje',
            description: 'As três próximas melhores ações do dia',
            url: '/?atalho=hoje',
            icons: [{ src: '/atalho-hoje.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
        // Compartir desde WhatsApp/Câmera/Gmail cae en Registrar con el
        // contenido ya cargado. POST multipart porque las fotos no viajan por
        // querystring; el service worker intercepta el POST, guarda el
        // paquete y redirige a /registrar?compartilhado=<id>.
        // Ver src/sw.ts y src/install/compartilhado.ts.
        share_target: {
          action: '/registrar',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'arquivos',
                accept: ['image/*', 'audio/*', 'application/pdf', 'text/plain'],
              },
            ],
          },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Las capturas y el og-image son material de vitrina: se sirven
        // desde la red cuando alguien instala o comparte el link, y no
        // tienen por qué gastar 300 kB del plan de datos del vendedor.
        globIgnores: ['**/screenshots/**', '**/og-image.png'],
        // 4 MB: el bundle entero tiene que caber para que la Golden Hour
        // funcione en modo avión.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    // Vitest cubre el dominio puro (src/core), la capa de datos offline
    // (src/data), el smoke test del router (src/app) y las funciones
    // serverless (api/): auth, cache breakpoint, tools y propose→commit.
    //
    // El entorno por defecto es Node: el dominio no renderiza nada y la capa
    // de datos corre con fake-indexeddb (ver setup.ts). Los tests que SÍ
    // montan React piden jsdom con el docblock `@vitest-environment jsdom`,
    // para no pagar el arranque de un DOM en los 251 tests que no lo usan.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
    setupFiles: ['src/data/__tests__/setup.ts'],
    globals: false,
  },
})
