// e2e/capturas-toque-teclado.spec.ts
// Antes/depois dos dois bugs do compositor do Ventus. Mesma convenção que
// capturas-resiliencia.spec.ts: apagadas por defecto, ancho real do
// aparelho (360 CSS px), CAPTURAS=1 para ligar.
//
//   CAPTURAS=1 npx playwright test --project=mobile-pixel7 capturas-toque-teclado.spec.ts
//
// Dois pares, porque eram dois bugs distintos (ver o comentário grande em
// Conversa.tsx):
//
//   1. ventus-sheet-snap-baixo-*: o compositor ficava fora da tela no snap
//      de abertura (0,6) mesmo SEM teclado — é um bug de layout puro, se
//      reproduz igual em qualquer navegador, sem precisar simular nada.
//
//   2. ventus-teclado-*: o teclado do Android tapava o compositor porque
//      `useAlturaDoTeclado()` nunca se conectou. Headless não tem teclado de
//      verdade — só dá para fingir o SINAL (`window.visualViewport`), não a
//      composição visual —, então a captura desenha um retângulo translúcido
//      no lugar exato que o teclado ocuparia: dá para ver a olho se o campo
//      fica por cima ou por baixo dele.
//
// O «antes» roda contra o código de ANTES do arreglo (checkout temporário
// via `git stash` de Conversa.tsx/BarraDeComando.tsx) e o «depois» contra o
// código atual.

import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures/app'

const PASTA = 'docs/capturas/hardware-real'
const LIGADO = process.env['CAPTURAS'] === '1'

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

/**
 * El mismo truco que teclado-ventus.spec.ts: se reemplaza
 * `window.visualViewport` por un objeto falso ANTES de que la app monte,
 * para simular que el teclado de Android achica el visualViewport sin tocar
 * el layout viewport (headless no tiene teclado de verdad).
 */
async function instalarVisualViewportFalso(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    class FalsoVisualViewport extends EventTarget {
      height = window.innerHeight
      offsetTop = 0
      width = window.innerWidth
      scale = 1
    }
    const falso = new FalsoVisualViewport()
    Object.defineProperty(window, 'visualViewport', { value: falso, configurable: true })
    ;(window as unknown as { __vvFalso: FalsoVisualViewport }).__vvFalso = falso
  })
}

async function abrirTecladoFalso(page: import('@playwright/test').Page, altura: number): Promise<void> {
  await page.evaluate((h) => {
    const falso = (window as unknown as { __vvFalso: EventTarget & { height: number } }).__vvFalso
    falso.height = window.innerHeight - h
    falso.dispatchEvent(new Event('resize'))
  }, altura)
}

/** Pinta onde o teclado falso ocuparia: só existe o SINAL, não a composição. */
async function desenharTecladoFalso(page: import('@playwright/test').Page, altura: number): Promise<void> {
  await page.evaluate((h) => {
    const div = document.createElement('div')
    div.id = 'teclado-falso-captura'
    div.style.cssText = `
      position: fixed; left: 0; right: 0; bottom: 0; height: ${String(h)}px;
      background: repeating-linear-gradient(135deg, rgba(0,0,0,0.55) 0 10px, rgba(0,0,0,0.4) 10px 20px);
      z-index: 2147483647; pointer-events: none;
      display: flex; align-items: flex-start; justify-content: center;
      color: #fff; font: 600 13px system-ui; padding-top: 8px;
    `
    div.textContent = '↓ área tapada pelo teclado do Android ↓'
    document.body.appendChild(div)
  }, altura)
}

/**
 * Preenche e foca o campo SEM passar pela checagem de «está na tela» que
 * `locator.click()`/`fill()` exigem — no bug do «antes» o campo do sheet
 * fica literalmente fora do viewport, e essa checagem travaria o teste em
 * vez de deixar a captura mostrar o problema.
 */
async function focarEEscrever(
  page: import('@playwright/test').Page,
  placeholder: string,
  texto: string,
): Promise<void> {
  await page.evaluate(
    ([ph, valor]) => {
      const campo = document.querySelector<HTMLTextAreaElement>(`textarea[placeholder="${ph}"]`)
      if (!campo) throw new Error('Campo não encontrado')
      campo.focus()
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setter?.call(campo, valor)
      campo.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [placeholder, texto] as const,
  )
}

test.describe('os dois bugs do compositor do Ventus', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o encabezado do arquivo.')

  test.beforeAll(() => {
    mkdirSync(PASTA, { recursive: true })
  })

  // ── Bug 1: compositor fora da tela no snap baixo, sem teclado nenhum ────
  test('sheet no snap de abertura (0,6), sem teclado (fase atual do código)', async ({
    page,
    ventus,
  }) => {
    await ventus.semear()
    await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible()
    await page.getByRole('button', { name: 'Perguntar ao Ventus' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(400)

    await page.screenshot({ path: `${PASTA}/ventus-sheet-snap-baixo.png`, fullPage: false })
  })

  // ── Bug 2: o teclado tapa o compositor porque useAlturaDoTeclado() nunca
  //    se conectou (ver o comentário grande em Conversa.tsx) ──────────────
  test('tela cheia /ventus, com o teclado (fase atual do código)', async ({ page, ventus }) => {
    await instalarVisualViewportFalso(page)
    await ventus.semear()
    await ventus.ir('/ventus')

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    await focarEEscrever(page, 'Pergunte ou peça algo ao Ventus', 'Quem está sem contato há 15 dias?')

    await abrirTecladoFalso(page, 320)
    await page.waitForTimeout(200)
    await desenharTecladoFalso(page, 320)
    await page.waitForTimeout(150)

    await page.screenshot({ path: `${PASTA}/ventus-teclado-tela-cheia.png`, fullPage: false })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   O pan vertical real (auditoria — não houve bug de código, ver
   toque-real.spec.ts e o comentário no topo desse arquivo). Este par não é
   antes/depois de um arreglo: é a prova visual de que o dedo já sobe o
   /placar de ponta a ponta, com toque de verdade (CDP), no ancho real do
   aparelho que reportou os cinco bugs.
   ══════════════════════════════════════════════════════════════════════════ */

async function swipeVerticalReal(
  page: import('@playwright/test').Page,
  x: number,
  yInicio: number,
  yFim: number,
  passos = 12,
): Promise<void> {
  const client = await page.context().newCDPSession(page)
  const ponto = (y: number) => [{ x, y, radiusX: 5, radiusY: 5, force: 1 }]
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(yInicio) })
    for (let i = 1; i <= passos; i++) {
      const y = yInicio + ((yFim - yInicio) * i) / passos
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(y) })
      await page.waitForTimeout(16)
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await client.detach()
  }
}

test.describe('pan vertical real no /placar (auditoria)', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o encabezado do arquivo.')

  test('um swipe táctil de verdade sobe a página, de ponta a ponta', async ({ page, ventus }) => {
    await ventus.semear()
    await ventus.ir('/placar')
    await expect(page.getByRole('heading', { name: 'Os cinco da semana' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(300)

    await page.screenshot({ path: `${PASTA}/placar-toque-antes.png`, fullPage: false })

    // Arranca sobre um cartão do carrossel horizontal — o ponto que a
    // hipótese original suspeitava que ia «comer» o gesto vertical.
    await swipeVerticalReal(page, 120, 650, 120)
    await page.waitForTimeout(300)

    await page.screenshot({ path: `${PASTA}/placar-toque-depois.png`, fullPage: false })
  })
})
