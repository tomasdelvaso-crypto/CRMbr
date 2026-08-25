// playwright.config.ts
// QA de punta a punta del Ventus v3.
//
// ══════════════════════════════════════════════════════════════════════════
// LO PRIMERO, PORQUE ES LO QUE NO SE PUEDE EQUIVOCAR
// ══════════════════════════════════════════════════════════════════════════
// El dev server de las pruebas arranca con `VITE_SUPABASE_URL` apuntando a
// `https://stub.supabase.test`, un host que NO EXISTE. La base real
// (wtrbvgqxgcfjacqcndmb) no aparece en ningún lado de este archivo ni puede
// aparecer en el bundle de prueba: aunque una prueba quisiera escribirle, no
// tendría la URL. Encima, el fixture intercepta y aborta cualquier pedido a
// `*.supabase.co`. Dos candados independientes para el mismo riesgo.
//
// EL BINARIO DEL NAVEGADOR ES EL PREINSTALADO. `PLAYWRIGHT_BROWSERS_PATH`
// tiene un Chromium 141 (revisión 1194) y este @playwright/test espera la
// 1234, así que la resolución automática no lo encuentra. Se le pasa el
// `executablePath` a mano y se corre con lo que hay: nunca
// `playwright install`, que en esta máquina no tiene salida a internet.
//
// LOS PROYECTOS son tres y cubren dos formas de usar la app: teléfono (los
// dos que el equipo tiene en la mano — un iPhone y un Android — con touch,
// que es donde vive el 100% del uso de campo) y escritorio (el Painel do
// Gestor y el teclado, que es donde vive la accesibilidad).

import { defineConfig, devices } from '@playwright/test'

/** Puerto propio: no pisa el 5173 de quien esté desarrollando al lado. */
const PORTA = 5288
const BASE_URL = `http://127.0.0.1:${String(PORTA)}`

/** Chromium preinstalado. Ver el encabezado. */
const CHROMIUM = process.env['PLAYWRIGHT_CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium'

const launchOptions = {
  executablePath: CHROMIUM,
  args: [
    // El camino de Registrar y las notas de voz de la Golden Hour usan
    // getUserMedia + MediaRecorder de verdad. Sin micrófono falso, la mitad
    // del producto no se puede probar.
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
}

export default defineConfig({
  testDir: './e2e',
  // Los artefactos NO pueden vivir dentro de lo que Vite observa: cada
  // captura de una prueba fallida disparaba un HMR («page reload …/traces/…»)
  // que recargaba la página de LAS OTRAS pruebas en pleno gesto. Adentro de
  // node_modules el watcher de Vite no mira y git tampoco.
  outputDir: './node_modules/.tmp/playwright',
  // Las pruebas comparten un único dev server y cada una siembra su propio
  // IndexedDB en un contexto aislado, así que corren en paralelo sin pisarse.
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : 4,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    permissions: ['microphone'],
    launchOptions,
  },

  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        // El descriptor del iPhone pide WebKit y acá sólo hay Chromium: se
        // conserva la pantalla, el DPR, el user agent y el touch, y se
        // cambia el motor. Es emulación de forma, no de motor, y está dicho.
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        launchOptions,
      },
    },
    {
      name: 'mobile-pixel7',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        launchOptions,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        launchOptions,
      },
    },
  ],

  webServer: {
    command: `npx vite --port ${String(PORTA)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      // ⚠️ El candado. Ver el encabezado.
      VITE_SUPABASE_URL: 'https://stub.supabase.test',
      VITE_SUPABASE_ANON_KEY: 'chave-anon-de-teste',
      // Los dos backends que todavía no están desplegados contestan con su
      // mock declarado, para que el camino de la pantalla sea determinístico.
      VITE_INGEST_MOCK: 'on',
      VITE_VENTUS_MOCK: 'on',
    },
  },
})
