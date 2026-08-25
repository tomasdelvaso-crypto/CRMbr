/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Configuración única de Ventus v3.
// Una sola app Vite: el dominio (src/core) se comparte con api/ por import relativo.
export default defineConfig({
  plugins: [
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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Ventus — Ventapel Brasil',
        short_name: 'Ventus',
        description: 'CRM de campo da Ventapel Brasil — metodologia PPVVCC',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/?source=pwa',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
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
    // (src/data) y el smoke test del router (src/app).
    //
    // El entorno por defecto es Node: el dominio no renderiza nada y la capa
    // de datos corre con fake-indexeddb (ver setup.ts). Los tests que SÍ
    // montan React piden jsdom con el docblock `@vitest-environment jsdom`,
    // para no pagar el arranque de un DOM en los 251 tests que no lo usan.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/data/__tests__/setup.ts'],
    globals: false,
  },
})
