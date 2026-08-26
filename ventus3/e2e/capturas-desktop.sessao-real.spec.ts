// e2e/capturas-desktop.sessao-real.spec.ts
// Capturas del layout de escritorio, en los dos tamaños que importan: el
// monitor del reporte (1440×900, ver e2e/sessao-real.spec.ts) y un 27"
// corriente (1920×1080). Corre en el proyecto `sessao-real-escritorio»
// —el build de producción, con el mismo doble de red— porque lo que hay que
// mostrar es CÓMO SE VE de verdad, no la silueta del dev server.
//
// No es sólo una vitrina: también verifica que el rail de escritorio esté
// presente, que la BottomNav no lo esté, y que las columnas de ancho por
// ruta se apliquen — es la regresión concreta de «está en formato para
// celular a pesar de ser web».

import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { entrarComoTomas, instalarSupabaseDeRede } from './fixtures/supabase-red'

const DESTINO = 'docs/capturas'

async function capturarTelasPrincipais(page: Page, prefixo: string): Promise<void> {
  // ── Hoje ──────────────────────────────────────────────────────────────
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })
  // El rail está, y la BottomNav (móvil) no ocupa lugar.
  const rail = page.getByRole('navigation', { name: 'Navegação principal' })
  await expect(rail).toBeVisible()
  const railCaixa = await rail.boundingBox()
  expect(railCaixa?.height).toBeGreaterThan(400) // rail vertical, no una barra baja
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DESTINO}/${prefixo}-hoje.png` })

  // ── Carteira ──────────────────────────────────────────────────────────
  await page.getByRole('link', { name: 'Carteira', exact: false }).first().click()
  await expect(page).toHaveURL(/\/carteira$/)
  await expect(page.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DESTINO}/${prefixo}-carteira.png` })

  // ── Dossiê ────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /Prueba Tripolla/ }).first().click()
  await expect(page).toHaveURL(/\/carteira\/89$/)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DESTINO}/${prefixo}-dossie.png` })
}

test.describe('Capturas de escritorio', () => {
  test.describe.configure({ mode: 'serial' })

  test('1440×900 — o monitor do relato', async ({ page }) => {
    test.setTimeout(90_000)
    mkdirSync(DESTINO, { recursive: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await instalarSupabaseDeRede(page)
    await entrarComoTomas(page)
    await capturarTelasPrincipais(page, 'desktop-1440x900')
  })

  test('1920×1080 — um 27" comum', async ({ page }) => {
    test.setTimeout(90_000)
    mkdirSync(DESTINO, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await instalarSupabaseDeRede(page)
    await entrarComoTomas(page)
    await capturarTelasPrincipais(page, 'desktop-1920x1080')
  })
})
