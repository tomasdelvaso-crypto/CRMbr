// e2e/capturas-resiliencia.spec.ts
// Las capturas del antes y el después, al ancho del teléfono que reportó el
// bug: 360 CSS px (el Android del dueño mide ~355-360), no los 390 del iPhone
// con los que corre el resto de la suite.
//
// EL «ANTES» NO ESTÁ ACTUADO: se siembra en Dexie el historial TAL COMO el
// teléfono lo guardó aquel día —`offline: true` y el texto viejo— y la pantalla
// lo pinta con la regla de compatibilidad, que es exactamente lo que el
// vendedor tenía delante. El «depois» corre el camino real contra un doble que
// devuelve 500.

import { mkdirSync } from 'node:fs'
import { expect, test, VENDEDOR } from './fixtures/app'

const PASTA = 'docs/capturas/hardware-real'

/**
 * Apagadas por defecto, como el resto de las capturas: una suite de QA no
 * escribe en docs/ cada vez que corre. Se piden a propósito:
 *
 *   CAPTURAS=1 npx playwright test --project=mobile-pixel7 capturas-resiliencia.spec.ts
 */
const LIGADO = process.env['CAPTURAS'] === '1'

/** El ancho real del aparato que reportó los cinco bugs. */
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

const CHAVE_HISTORICO = `ventus:chat:${VENDEDOR}:geral`

test.describe('a verdade na tela', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o encabezado do arquivo.')

  test.beforeAll(() => {
    mkdirSync(PASTA, { recursive: true })
  })

  test('antes — um 500 do servidor mostrado como «sem conexão»', async ({ app, ventus }) => {
    const page = app
    // El historial que el teléfono guardó de verdad: mensaje del vendedor +
    // respuesta marcada `offline: true` con el texto viejo.
    await page.evaluate(
      async ([modulo, chave, vendedor]) => {
        const mod = (await import(/* @vite-ignore */ modulo)) as {
          getDb: () => {
            open: () => Promise<unknown>
            table: (n: string) => { put: (linha: unknown) => Promise<unknown> }
          }
        }
        const db = mod.getDb()
        await db.open()
        await db.table('meta').put({
          chave,
          atualizado_em: new Date().toISOString(),
          valor: [
            {
              id: 'antes-1',
              papel: 'vendedor',
              texto: 'escreve uma mensagem para o cliente da linha 4',
              em: new Date().toISOString(),
            },
            {
              id: 'antes-2',
              papel: 'ventus',
              texto:
                'Algo quebrou do lado do Ventus. Não foi você.\n\nEstou sem conexão, então respondo com o que já está no aparelho — sem inventar nada.\n\n' +
                `${vendedor}, hoje não há pendências urgentes na sua carteira.`,
              em: new Date().toISOString(),
              offline: true,
              erro: 'interno',
            },
          ],
        })
      },
      ['/src/data/db.ts', CHAVE_HISTORICO, VENDEDOR] as const,
    )

    await ventus.ir('/ventus')
    // La marca vive al pie de una respuesta larga: hay que bajar hasta ella,
    // que es exactamente lo que hizo el vendedor antes de sacar su captura.
    const marca = page.getByText('Sem conexão · resposta local')
    await expect(marca).toBeVisible()
    // scrollIntoViewIfNeeded no alcanza: la marca cae DEBAJO del compositor y
    // de la barra inferior, que son fijos, así que el navegador la considera
    // «visible» y no mueve nada. Se baja el scroll a mano hasta el final.
    // (El que la última línea de una resposta quede tapada por el chrome fijo
    //  a 360 px es un bug de layout aparte, no de este frente.)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${PASTA}/ventus-500-antes.png`, fullPage: false })
    // Y la burbuja sola: la respuesta de socorro es larga y en 360 px no entra
    // entera en pantalla, así que el chip se captura con su bolha completa.
    await marca.locator('xpath=ancestor::li[1]').screenshot({
      path: `${PASTA}/ventus-500-antes-bolha.png`,
    })
  })

  test('depois — o mesmo 500, dito como o que é', async ({ app, ventus }) => {
    const page = app
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado */
      }
    })
    await page.route('**/api/ventus', (rota) =>
      rota.fulfill({ status: 500, contentType: 'text/plain', body: 'FUNCTION_INVOCATION_FAILED' }),
    )

    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await campo.fill('escreve uma mensagem para o cliente da linha 4')
    // Enter y no el botón: a 360 px el FAB de «Registrar por voz» se le monta
    // encima al botón de enviar. Eso es el bug D/B, y lo arregla otro frente.
    await campo.press('Enter')

    const marca = page.getByText('Servidor com problemas · resposta local')
    await expect(marca).toBeVisible()
    // scrollIntoViewIfNeeded no alcanza: la marca cae DEBAJO del compositor y
    // de la barra inferior, que son fijos, así que el navegador la considera
    // «visible» y no mueve nada. Se baja el scroll a mano hasta el final.
    // (El que la última línea de una resposta quede tapada por el chrome fijo
    //  a 360 px es un bug de layout aparte, no de este frente.)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${PASTA}/ventus-500-depois.png`, fullPage: false })
    await marca.locator('xpath=ancestor::li[1]').screenshot({
      path: `${PASTA}/ventus-500-depois-bolha.png`,
    })
  })

  test('depois — sem rede segue dizendo «sem conexão», que aí é verdade', async ({
    app,
    ventus,
  }) => {
    const page = app
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado */
      }
    })

    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    await page.context().setOffline(true)

    await campo.fill('escreve uma mensagem para o cliente da linha 4')
    // Enter y no el botón: a 360 px el FAB de «Registrar por voz» se le monta
    // encima al botón de enviar. Eso es el bug D/B, y lo arregla otro frente.
    await campo.press('Enter')

    const marca = page.getByText('Sem conexão · resposta local')
    await expect(marca).toBeVisible()
    // scrollIntoViewIfNeeded no alcanza: la marca cae DEBAJO del compositor y
    // de la barra inferior, que son fijos, así que el navegador la considera
    // «visible» y no mueve nada. Se baja el scroll a mano hasta el final.
    // (El que la última línea de una resposta quede tapada por el chrome fijo
    //  a 360 px es un bug de layout aparte, no de este frente.)
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${PASTA}/ventus-sem-rede-depois.png`, fullPage: false })
    await marca.locator('xpath=ancestor::li[1]').screenshot({
      path: `${PASTA}/ventus-sem-rede-depois-bolha.png`,
    })
    await page.context().setOffline(false)
  })
})
