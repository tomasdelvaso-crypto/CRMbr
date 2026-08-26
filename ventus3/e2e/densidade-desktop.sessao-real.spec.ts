// e2e/densidade-desktop.sessao-real.spec.ts
// La vitrina de la pasada de DENSIDAD de escritorio: una captura a 1920×1080
// de cada ruta que el dueño del producto nombró, con la sesión real de Tomás
// y sus datos reales.
//
// Corre contra el build de producción (proyecto `sessao-real-escritorio`,
// ver playwright.config.ts) porque lo que hay que mirar es CÓMO SE VE de
// verdad, no la silueta del dev server.
//
// La fase la elige `FASE_DENSIDADE` (antes|depois): las dos corridas escriben
// el mismo juego de archivos con prefijo distinto en
// docs/capturas/desktop-density/, para poder comparar el mismo píxel.

import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { entrarComoTomas, instalarSupabaseDeRede } from './fixtures/supabase-red'

const DESTINO = 'docs/capturas/desktop-density'
const FASE = process.env['FASE_DENSIDADE'] ?? 'antes'

// Sin `FASE_DENSIDADE` este archivo NO corre. No es pereza: es una vitrina que
// ESCRIBE en docs/capturas/, y correr en la suite normal significaba pisar la
// captura del «antes» con el código del «después» — que es exactamente lo que
// pasó una vez y deja la comparación mintiendo.
const CORRE = process.env['FASE_DENSIDADE'] !== undefined

/** Cada ruta con la señal que dice «ya pintó», para no capturar esqueletos. */
interface Parada {
  arquivo: string
  rota: string
  esperar: (page: Page) => Promise<void>
}

const PARADAS: readonly Parada[] = [
  {
    arquivo: '1-cadencia',
    rota: '/cadencia',
    esperar: async (page) => {
      await expect(page.getByRole('button', { name: 'Mapa', exact: false }).first()).toBeVisible({
        timeout: 20_000,
      })
    },
  },
  {
    arquivo: '2-carteira',
    rota: '/carteira',
    esperar: async (page) => {
      await expect(page.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible({
        timeout: 20_000,
      })
    },
  },
  {
    arquivo: '3-hoje',
    rota: '/',
    esperar: async (page) => {
      await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
        timeout: 20_000,
      })
    },
  },
  {
    arquivo: '4-revisao',
    rota: '/revisao',
    esperar: async (page) => {
      await expect(page.getByRole('heading', { name: 'Revisão do Ventus' })).toBeVisible({
        timeout: 20_000,
      })
    },
  },
  {
    arquivo: '5-placar',
    rota: '/placar',
    esperar: async (page) => {
      await expect(page.getByRole('heading', { name: 'Placar da Semana' })).toBeVisible({
        timeout: 20_000,
      })
    },
  },
  {
    arquivo: '6-dossie',
    rota: '/carteira/89',
    esperar: async (page) => {
      await expect(page.getByText('Prueba Tripolla').first()).toBeVisible({ timeout: 20_000 })
    },
  },
  // Las dos rutas que NO cambian de ancho. Están acá por el punto 7 del
  // encargo —«el header de cada ruta alineado con el contenido»—: si alguien
  // vuelve a tocar `larguraDe()` y se olvida de una, se ve en la imagen.
  {
    arquivo: '8-mais',
    rota: '/mais',
    esperar: async (page) => {
      await expect(page.getByRole('heading', { name: 'Mais' })).toBeVisible({ timeout: 20_000 })
    },
  },
  {
    arquivo: '9-gestor',
    rota: '/gestor',
    esperar: async (page) => {
      await expect(page.getByRole('heading', { name: 'Painel do Gestor' })).toBeVisible({
        timeout: 20_000,
      })
    },
  },
]

test.describe('Densidade de escritorio — 1920×1080', () => {
  test.describe.configure({ mode: 'serial' })

  test(`capturas ${FASE}`, async ({ page }) => {
    test.skip(!CORRE, 'vitrine: só com FASE_DENSIDADE')
    test.setTimeout(180_000)
    mkdirSync(DESTINO, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await instalarSupabaseDeRede(page)
    await entrarComoTomas(page)

    for (const parada of PARADAS) {
      await page.goto(parada.rota, { waitUntil: 'domcontentloaded' })
      await parada.esperar(page)
      // El tiempo que tardan las animaciones de entrada en asentarse.
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${DESTINO}/${FASE}-${parada.arquivo}.png` })
    }

    // ── El final del scroll ────────────────────────────────────────────
    // La barra «Perguntar ao Ventus» es `fixed`: la pregunta que hay que
    // poder contestar mirando una imagen es si TAPA la última línea de la
    // pantalla más larga. El Placar lo es. La reserva vive en
    // `--spacing-chrome` (ver index.css) y esta captura es su testigo.
    await page.goto('/placar', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Placar da Semana' })).toBeVisible({
      timeout: 20_000,
    })
    // Se lleva a la vista el ÚLTIMO control de la pantalla. Es más fiable que
    // empujar un scroller a mano: el Placar scrollea con el documento y con el
    // scroller interno del PullToRefresh según el alto, y `scrollIntoView`
    // resuelve los dos casos sin saber cuál es.
    await page.getByRole('button', { name: 'Ajustes do jogo' }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${DESTINO}/${FASE}-7-placar-fim-do-scroll.png` })
  })
})
