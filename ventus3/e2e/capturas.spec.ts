// e2e/capturas.spec.ts
// Las capturas de vitrina, en teléfono, claro y oscuro, a docs/capturas/.
//
// No son pruebas: no afirman nada. Existen para que el dueño del producto vea
// cómo quedó sin tener que levantar el proyecto, y para que un cambio de
// diseño se pueda comparar contra lo que había. Por eso están apagadas por
// defecto —una suite de QA no debería escribir en docs/ cada vez que corre— y
// se piden a propósito:
//
//   CAPTURAS=1 npx playwright test --project=mobile capturas.spec.ts
//
// La cartera es la misma semilla determinística del resto de la suite, así que
// dos corridas del mismo commit dan la misma imagen.

import { mkdirSync } from 'node:fs'
import { abrir, expect, secaoDoDia, test } from './fixtures/app'
import type { Page } from '@playwright/test'

const DESTINO = 'docs/capturas'
const LIGADO = process.env['CAPTURAS'] === '1'

test.describe('Capturas', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o encabezado do arquivo.')
  test.describe.configure({ mode: 'serial' })

  for (const tema of ['claro', 'escuro'] as const) {
    test(`telas principais — tema ${tema}`, async ({ app, ventus }) => {
      test.setTimeout(180_000)
      mkdirSync(DESTINO, { recursive: true })

      await app.emulateMedia({ colorScheme: tema === 'escuro' ? 'dark' : 'light' })
      await app.evaluate((valor) => {
        localStorage.setItem('ventus.theme', valor)
      }, tema === 'escuro' ? 'dark' : 'light')
      await app.reload()
      await expect(secaoDoDia(app)).toBeVisible()

      const tirar = async (nome: string): Promise<void> => {
        // Un frame extra: las transiciones de entrada del design system duran
        // ~200 ms y una captura a mitad de camino se ve rota.
        await app.waitForTimeout(450)
        await app.screenshot({ path: `${DESTINO}/${nome}-${tema}.png` })
      }

      await tirar('01-hoje')

      // «Por que isto?» abierto: es la pantalla que explica el producto.
      await secaoDoDia(app).getByRole('button', { name: 'Por que isto?' }).first().click()
      await tirar('02-hoje-por-que')

      await abrir(app, '/carteira')
      await expect(app.getByRole('heading', { level: 1 })).toHaveText('Carteira')
      await tirar('03-carteira')

      await abrir(app, '/carteira/101')
      await expect(app.getByRole('button', { name: /^5\s*Dor/ })).toBeVisible()
      await tirar('04-dossie')

      await app.getByRole('button', { name: /^5\s*Dor/ }).click()
      await expect(app.getByRole('dialog')).toBeVisible()
      await tirar('05-editor-de-escala')
      await app.keyboard.press('Escape')

      await abrir(app, '/golden')
      await expect(app.getByRole('button', { name: 'Começar a hora' })).toBeVisible()
      await tirar('06-golden-abertura')
      await app.getByRole('button', { name: 'Começar a hora' }).click()
      await expect(app.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()
      await tirar('07-golden-foco')
      await app.getByRole('button', { name: /Ligou/ }).click()
      await app.getByRole('button', { name: /Encerrar|Fechar/ }).click()
      await expect(app.getByRole('heading', { name: 'Fechamento' })).toBeVisible()
      await tirar('08-golden-fechamento')

      await capturarRegistrar(app)
      await tirar('09-registrar-confirmacao')

      for (const [nome, rota, marca] of [
        ['10-cadencia', '/cadencia', 'Cadência'],
        ['11-placar', '/placar', 'Placar da Semana'],
        ['12-rituais', '/rituais', 'Rituais'],
        ['13-ventus', '/ventus', 'Ventus'],
        ['14-mais', '/mais', 'Mais'],
        ['15-ajustes', '/ajustes', 'Ajustes'],
      ] as const) {
        await abrir(app, rota)
        await expect(app.getByRole('heading', { level: 1 })).toHaveText(marca)
        await tirar(nome)
      }

      // La cola sigue vacía: las capturas no escriben nada en el servidor.
      expect(ventus.pedidos.filter((p) => p.metodo === 'PATCH')).toHaveLength(0)
    })
  }
})

/** Graba una nota y deja la tarjeta de confirmación en pantalla. */
async function capturarRegistrar(page: Page): Promise<void> {
  await abrir(page, '/registrar?opportunityId=101')
  const microfone = page.getByRole('button', { name: 'Segure para gravar uma nota de voz' })
  const caixa = await microfone.boundingBox()
  if (!caixa) throw new Error('O microfone não está visível')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1600)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('radio', { name: 'Amanhã' }).click()
}
