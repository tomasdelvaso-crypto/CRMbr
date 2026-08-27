// e2e/resiliencia.spec.ts
// Una falla pasajera del servidor NO puede dejar el teléfono mudo para siempre.
//
// ══════════════════════════════════════════════════════════════════════════
// EL BUG QUE ESTO CIERRA
// ══════════════════════════════════════════════════════════════════════════
// Primer test en un Android de verdad. /api/ventus devolvió 500 durante unos
// minutos (un import roto, ya arreglado). El vendedor —con cuatro barras de
// señal— siguió leyendo «Sem conexão · resposta local» el resto del día,
// porque la app se había quedado en el camino local y encima le echaba la
// culpa a su red.
//
// Acá el doble contesta 500 UNA vez y 200 después, y la prueba exige las dos
// cosas que faltaban:
//   1. la SEGUNDA pregunta vuelve a salir a la API (nada de latch pegajoso)
//   2. el texto del 500 habla del SERVIDOR, nunca de la conexión del vendedor
//
// Nota sobre el mock: el dev server de la suite arranca con
// VITE_VENTUS_MOCK=on, así que el chat jamás tocaría la red. Se apaga en el
// aparato con `localStorage['ventus.chat.mock'] = 'off'`, que es el mismo
// interruptor que existe para poder probar el endpoint real en el teléfono del
// vendedor sin rebuildear.

import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures/app'

/** Una pregunta que el motor determinístico NUNCA resuelve solo. */
const PERGUNTA_DE_REDACAO = 'escreve uma mensagem para o cliente da linha 4'
const OUTRA_PERGUNTA = 'redig um e-mail curto para a Tetra Pak'

/** Un turno SSE completo, tal como lo manda /api/ventus. */
function corpoSSE(texto: string): string {
  return (
    `data: ${JSON.stringify({ tipo: 'abertura', turnoId: 't', modelo: 'duplo' })}\n\n` +
    `data: ${JSON.stringify({ tipo: 'texto', delta: texto })}\n\n` +
    `data: ${JSON.stringify({ tipo: 'fim', texto })}\n\n`
  )
}

const RESPOSTA_BOA = 'Segue o rascunho combinado.'

/**
 * Manda la pregunta con Enter y no tocando «Enviar».
 *
 * No es comodidad: en las dos anchuras de teléfono el FAB flotante de
 * «Registrar por voz» se le monta encima al botón de enviar del compositor y
 * Playwright no lo puede tocar. Ese solapamiento es un bug de layout —de otro
 * frente— y esta prueba no es sobre eso; Enter recorre exactamente el mismo
 * `enviar()` del compositor.
 */
async function enviarPergunta(campo: Locator): Promise<void> {
  await campo.press('Enter')
}

test.describe('o servidor cai e se levanta', () => {
  test('um 500 não deixa o telefone mudo: a segunda pergunta volta à API', async ({
    page,
    ventus,
  }) => {
    // El mock declarado se apaga EN EL APARATO, para que el chat use la red.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado: la prueba no aplica */
      }
    })

    const chamadas: string[] = []
    await page.route('**/api/ventus', async (rota) => {
      chamadas.push(rota.request().method())
      if (chamadas.length === 1) {
        // FUNCTION_INVOCATION_FAILED, tal cual lo devolvió Vercel aquel día.
        await rota.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'FUNCTION_INVOCATION_FAILED',
        })
        return
      }
      await rota.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
        body: corpoSSE(RESPOSTA_BOA),
      })
    })

    await ventus.ir('/ventus')

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()

    // ── Primera pregunta: el servidor está roto ─────────────────────────
    await campo.fill(PERGUNTA_DE_REDACAO)
    await enviarPergunta(campo)

    await expect(page.getByText(/servidor do Ventus está com problemas/i)).toBeVisible()
    // La marca de procedencia dice de quién es el problema.
    await expect(page.getByText('Servidor com problemas · resposta local')).toBeVisible()
    // Y NO le echa la culpa a la red del vendedor.
    await expect(page.getByText('Sem conexão · resposta local')).toHaveCount(0)
    expect(chamadas).toHaveLength(1)

    // ── Segunda pregunta: el servidor ya se curó ────────────────────────
    await campo.fill(OUTRA_PERGUNTA)
    await enviarPergunta(campo)

    await expect(page.getByText(RESPOSTA_BOA)).toBeVisible()
    // LA PRUEBA: dos llamadas. Con el latch viejo habría quedado en una.
    expect(chamadas).toHaveLength(2)
  })

  test('sem rede, o texto fala de rede — e só nesse caso', async ({ page, ventus }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado */
      }
    })

    let bateuNaApi = false
    await page.route('**/api/ventus', async (rota) => {
      bateuNaApi = true
      await rota.abort('internetdisconnected')
    })

    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()

    // El teléfono se declara sin señal: `talvezOnline()` mira navigator.onLine.
    await page.context().setOffline(true)

    await campo.fill(PERGUNTA_DE_REDACAO)
    await enviarPergunta(campo)

    await expect(page.getByText('Sem conexão · resposta local')).toBeVisible()
    await expect(page.getByText('Servidor com problemas · resposta local')).toHaveCount(0)
    // Sin señal el pedido ni sale del teléfono: no se gastan 25 s de espera.
    expect(bateuNaApi).toBe(false)

    await page.context().setOffline(false)
  })

  test('com o mock declarado, a bolha diz que é um exemplo', async ({ page, ventus }) => {
    // Sin tocar el interruptor: el dev server trae VITE_VENTUS_MOCK=on, que es
    // el ambiente en el que el chat responde con un ejemplo.
    let bateuNaApi = false
    await page.route('**/api/ventus', async (rota) => {
      bateuNaApi = true
      await rota.fulfill({ status: 500, body: 'não deveria chegar aqui' })
    })

    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()

    await campo.fill(PERGUNTA_DE_REDACAO)
    await enviarPergunta(campo)

    await expect(page.getByText('Modo simulado · exemplo')).toBeVisible({ timeout: 20_000 })
    expect(bateuNaApi).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   «O áudio não transcreve» — o mesmo bug, do lado de Registrar
   ══════════════════════════════════════════════════════════════════════════
   Acá se prueba el TEXTO honesto, que es lo que el vendedor lee. Que la
   segunda nota vuelva a salir a la API se prueba en el unitario
   (src/screens/Registrar/__tests__/ingest.test.ts): en e2e, cada intento
   nuevo pasa por una recarga de la pantalla y con la recarga el estado en
   memoria se va — o sea, la prueba pasaría incluso con el latch viejo, que es
   la peor clase de prueba verde.
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('a ingestão cai e se levanta', () => {
  test('um 500 do /api/ingest não vira «sem rede»: o problema é nosso e se diz', async ({
    app,
    ventus,
  }) => {
    const page = app
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.ingest.mock', 'off')
      } catch {
        /* modo privado */
      }
    })

    const chamadas: string[] = []
    await page.route('**/api/ingest', async (rota) => {
      chamadas.push(rota.request().method())
      await rota.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'FUNCTION_INVOCATION_FAILED',
      })
    })

    await ventus.ir('/registrar')

    await page.getByRole('button', { name: 'Teclado' }).click()
    await page.getByLabel('Conteúdo').fill('Liguei para o Marcelo e ele pediu proposta nova.')
    await page.getByRole('button', { name: 'Analisar' }).click()

    // El aviso dice de quién es el problema, y NO manda a buscar señal.
    await expect(page.getByText('O servidor do Ventus está com problemas.')).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByText('Registro pendente de transcrição.')).toHaveCount(0)
    expect(chamadas).toHaveLength(1)
  })
})
