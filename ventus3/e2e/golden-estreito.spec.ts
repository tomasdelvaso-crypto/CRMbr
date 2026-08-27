// e2e/golden-estreito.spec.ts
// A Golden Hour no Android real do dono do produto: 360x640 CSS px, mais
// estreito e mais baixo que os 390x844 do iPhone com que corre o resto da
// suite (`mobile`). É por isso que `golden.spec.ts` nunca viu estes bugs —
// nunca correu num aparelho tão pequeno. Este arquivo corre no seu próprio
// projeto (`golden-estreito`, ver playwright.config.ts) e cobre os dois
// tamanhos que a captura do dono e o diagnóstico citam: 360x640 e 355x700.
//
//  · O HUD: a 390 o relógio, os contadores e «Encerrar» entram numa fila só.
//    A 360 não entram — o "59:48" se monta em cima de «6 toques», que é
//    exatamente a captura do dono. Aqui se mede com bounding boxes: zero
//    interseções entre relógio, botão e os dois contadores, testado nos dois
//    tamanhos.
//
//  · O card do contato: nome + rascunho + links não cabem no que sobra do
//    HUD e dos 4 botões de resultado numa tela baixa. Antes disso ficava
//    cortado sem aviso — o Carrossel tem overflow-y-hidden e nada dentro do
//    card rolava. Agora o card rola por dentro (gesto de TOQUE de verdade via
//    CDP, não mouse — a diferença importa porque a rolagem depende de
//    touch-action, que o mouse não exercita) e os 4 botões — Ligou · Falou ·
//    Agendou · Passar — continuam visíveis e funcionais, porque vivem FORA
//    do contêiner que rola.
//
//  · O fechamento de 60s e a abertura, nos mesmos dois tamanhos: não são o
//    alvo do bug, mas o diagnóstico pede para confirmar que não quebraram.
//
// Capturas antes/depois de cada fix (HUD e scroll do card) em
// docs/capturas/hardware-real/, atrás de CAPTURAS=1 — ver o rodapé do
// arquivo, mesmo padrão de e2e/capturas-resiliencia.spec.ts.

import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { abrir, expect, test } from './fixtures/app'

const PASTA = 'docs/capturas/hardware-real'

/** Entra na hora e arranca o bloco. Deixa a tela em modo foco. */
async function entrarEmFoco(page: Page): Promise<void> {
  await abrir(page, '/golden')
  await expect(page.getByRole('button', { name: 'Começar a hora' })).toBeVisible()
  await page.getByRole('button', { name: 'Começar a hora' }).click()
  await expect(page.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()
}

interface Caixa {
  x: number
  y: number
  width: number
  height: number
}

function seSobrepoem(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Verifica que nenhum par do conjunto se sobreponha. Cada entrada é
 * [nome, locator] só para que uma falha diga QUAIS dois elementos se pisam,
 * em vez de um bounding box pelado.
 */
async function semSobreposicoes(
  elementos: ReadonlyArray<[string, { boundingBox: () => Promise<Caixa | null> }]>,
): Promise<void> {
  const caixas: Array<[string, Caixa]> = []
  for (const [nome, locator] of elementos) {
    const caixa = await locator.boundingBox()
    expect(caixa, `«${nome}» devia estar visível`).not.toBeNull()
    if (caixa) caixas.push([nome, caixa])
  }
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const [nomeA, caixaA] = caixas[i]!
      const [nomeB, caixaB] = caixas[j]!
      expect(
        seSobrepoem(caixaA, caixaB),
        `«${nomeA}» (${JSON.stringify(caixaA)}) se sobrepõe a «${nomeB}» (${JSON.stringify(caixaB)})`,
      ).toBe(false)
    }
  }
}

/** Sem rolagem horizontal: um layout estreito que vaza pro lado é outro bug. */
async function semRolagemHorizontal(page: Page): Promise<void> {
  const [scrollWidth, larguraJanela] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(larguraJanela + 1)
}

/**
 * Um arrasto de dedo de VERDADE, via CDP — não mouse.
 *
 * `page.touchscreen` do Playwright só sabe fazer `tap()`; para simular um
 * gesto de arrastar que o navegador reconheça como toque (e que por isso
 * respeite `touch-action`) é preciso despachar touchStart/touchMove/touchEnd
 * pelo protocolo, do mesmo jeito que faz internamente `page.touchscreen`.
 * Um `mouse.move` com o botão apertado NÃO conta como toque: o Chromium não
 * aplicaria `touch-action` a ele, e o teste passaria mesmo que a rolagem só
 * funcionasse com mouse — que é justamente o que NÃO reproduz o bug real.
 */
async function arrastarComToque(page: Page, x: number, yInicio: number, yFim: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const enviar = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number | null): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: y === null ? [] : [{ x, y }],
    })
  await enviar('touchStart', yInicio)
  const passos = 10
  for (let i = 1; i <= passos; i++) {
    await enviar('touchMove', yInicio + ((yFim - yInicio) * i) / passos)
    await page.waitForTimeout(16)
  }
  await enviar('touchEnd', null)
  await cdp.detach().catch(() => undefined)
}

const TAMANHOS: ReadonlyArray<{ largura: number; altura: number }> = [
  // O ancho que o Android do dono reportou na primeira prova.
  { largura: 360, altura: 640 },
  // O outro tamanho que o diagnóstico pede: ainda mais baixo e mais estreito.
  { largura: 355, altura: 700 },
]

for (const { largura, altura } of TAMANHOS) {
  test.describe(`Golden Hour a ${largura}x${altura}`, () => {
    test.use({ viewport: { width: largura, height: altura }, hasTouch: true, isMobile: true })

    test('o HUD não sobrepõe o relógio, os contadores e «Encerrar»', async ({ app }) => {
      await entrarEmFoco(app)

      const hud = app.getByRole('banner')
      await semSobreposicoes([
        ['relógio', hud.locator('[aria-label^="Faltam"]')],
        ['botão Encerrar/Fechar', hud.getByRole('button', { name: /Encerrar|Fechar/ })],
        ['contador de toques', hud.locator('p', { hasText: 'toques' })],
        ['contador de conversas', hud.locator('p', { hasText: /convers/i })],
      ])
      await semRolagemHorizontal(app)
    })

    test('o conteúdo do card rola por dentro e os 4 botões de resultado continuam visíveis', async ({
      app,
    }) => {
      await entrarEmFoco(app)

      const card = app.locator('article[aria-current="true"]')
      const scroller = card.locator('> div').first()
      await expect(scroller).toBeVisible()

      // A tela é baixa demais para o card inteiro (nome + rascunho + links)
      // entrar sem rolar — se isso deixasse de ser verdade o teste abaixo não
      // provaria nada.
      const [scrollHeight, clientHeight] = await scroller.evaluate((el) => [
        el.scrollHeight,
        el.clientHeight,
      ])
      expect(scrollHeight).toBeGreaterThan(clientHeight)

      const ligou = app.getByRole('button', { name: /Ligou/ })
      const passar = app.getByRole('button', { name: /Passar/ })
      const antesLigou = await ligou.boundingBox()
      const antesPassar = await passar.boundingBox()
      expect(antesLigou).not.toBeNull()
      expect(antesPassar).not.toBeNull()

      const caixaScroller = await scroller.boundingBox()
      if (!caixaScroller) throw new Error('o card não está visível')
      // De baixo para cima: o gesto de "ver o que falta" na tela.
      await arrastarComToque(
        app,
        caixaScroller.x + caixaScroller.width / 2,
        caixaScroller.y + caixaScroller.height - 16,
        caixaScroller.y + 16,
      )

      await expect
        .poll(() => scroller.evaluate((el) => el.scrollTop), {
          message: 'o card não rolou com o gesto de toque',
        })
        .toBeGreaterThan(0)

      // Os 4 botões vivem FORA do contêiner que rola — não se moveram nem um
      // píxel, e continuam clicáveis.
      expect(await ligou.boundingBox()).toEqual(antesLigou)
      expect(await passar.boundingBox()).toEqual(antesPassar)

      await ligou.click()
      await expect(app.getByRole('group', { name: /Contato \d+ de \d+/ })).toHaveAttribute(
        'aria-label',
        'Contato 2 de 4',
      )
      await semRolagemHorizontal(app)
    })

    test('o fechamento de 60s não se pode saltear', async ({ app }) => {
      await entrarEmFoco(app)
      await app.getByRole('button', { name: /Ligou/ }).click()
      await app.getByRole('button', { name: /Encerrar|Fechar/ }).click()

      await expect(app.getByRole('heading', { name: 'Fechamento' })).toBeVisible()
      const selo = app.getByRole('button', { name: /Selar a Hora Cheia|Encerrar a hora/ })
      await expect(selo).toBeDisabled()

      await app.getByRole('button', { name: 'Preço' }).click()
      await app.getByRole('button', { name: 'Nenhuma hoje' }).click()
      await app.getByRole('button', { name: 'Ligar mais cedo' }).click()
      await expect(selo).toBeEnabled()
      // O botão de sellar tem que estar de fato na tela, não só habilitado —
      // é o bug do teclado/viewport curto: um botão «habilitado» que ninguém
      // alcança não serve.
      await expect(selo).toBeInViewport()

      await selo.click()
      await expect(
        app.getByRole('heading', { name: /Hora Cheia selada|Hora encerrada/ }),
      ).toBeVisible()
      await semRolagemHorizontal(app)
    })

    test('a abertura mostra a fila e o botão de começar é alcançável rolando', async ({ app }) => {
      await abrir(app, '/golden')
      await expect(app.getByRole('heading', { name: '4 contatos prontos' })).toBeVisible()
      const comecar = app.getByRole('button', { name: 'Começar a hora' })
      // A Abertura já é uma tela com `overflow-y-auto` própria (Abertura.tsx):
      // numa tela de 640/700px de altura o botão pode cair abaixo da dobra, e
      // isso é esperado — o que importa é que role até ele e continue
      // clicável, não que aaparece sem rolar nenhum pouco.
      await comecar.scrollIntoViewIfNeeded()
      await expect(comecar).toBeInViewport()
      await semRolagemHorizontal(app)
    })
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Capturas antes/depois — só com CAPTURAS=1.
   ══════════════════════════════════════════════════════════════════════════
   «Antes» não está atuado: pedir essa versão exige rodar este MESMO arquivo
   contra o código de ANTES do fix (Hud.tsx e CartaoContato.tsx). Os testes
   «antes» de propósito NÃO usam nenhuma estrutura nova (o `<div>` único que
   agora envolve o card) — só entram na hora e tiram a foto tal como ficava
   — para que rodem sem quebrar tanto no código velho quanto no novo. O jeito
   de conseguir a versão «antes» de verdade é orquestrar por fora com git
   stash, comandos exatos:

     git stash push -- src/screens/GoldenHour/Hud.tsx src/screens/GoldenHour/CartaoContato.tsx
     CAPTURAS=1 npx playwright test --project=golden-estreito -g antes
     git stash pop
     CAPTURAS=1 npx playwright test --project=golden-estreito -g depois
   ══════════════════════════════════════════════════════════════════════════ */
const LIGADO = process.env['CAPTURAS'] === '1'

test.describe('capturas — Golden Hour a 360x640', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o rodapé do arquivo.')
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true })

  test.beforeAll(() => {
    mkdirSync(PASTA, { recursive: true })
  })

  test('antes — HUD do modo foco', async ({ app }) => {
    await entrarEmFoco(app)
    await app.waitForTimeout(150)
    await app.screenshot({ path: `${PASTA}/golden-estreito-hud-antes.png`, fullPage: false })
  })

  test('antes — card do contato', async ({ app }) => {
    await entrarEmFoco(app)
    await app.waitForTimeout(150)
    await app.screenshot({ path: `${PASTA}/golden-estreito-card-antes.png`, fullPage: false })
  })

  test('depois — HUD do modo foco, em duas filas', async ({ app }) => {
    await entrarEmFoco(app)
    await app.waitForTimeout(150)
    await app.screenshot({ path: `${PASTA}/golden-estreito-hud-depois.png`, fullPage: false })
  })

  test('depois — card do contato, rolado até o fim', async ({ app }) => {
    await entrarEmFoco(app)
    const card = app.locator('article[aria-current="true"]')
    const scroller = card.locator('> div').first()
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await app.waitForTimeout(150)
    await app.screenshot({ path: `${PASTA}/golden-estreito-card-depois.png`, fullPage: false })
  })
})
