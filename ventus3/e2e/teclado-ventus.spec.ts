// e2e/teclado-ventus.spec.ts
// O TECLADO do Android não pode comer o compositor do Ventus.
//
// ══════════════════════════════════════════════════════════════════════════
// O BUG QUE ISTO FECHA (primeiro teste em Android físico)
// ══════════════════════════════════════════════════════════════════════════
// Com o teclado aberto, o campo de texto do Ventus desaparecia atrás dele —
// sobrava só uma linha fina do seu topo, sem ver o que se escrevia nem o
// botão de enviar. Dois bugs distintos se somavam:
//
//  1. `useAlturaDoTeclado()` — o hook que já existia (e que Registrar usa
//     para a sua barra fixa) — nunca se conectou dentro do Ventus. O
//     compositor era `sticky bottom-0`, e esse `bottom` não se move quando o
//     teclado abre: no Android o LAYOUT viewport não se redimensiona (só o
//     visualViewport encolhe), então `bottom: 0` fica exatamente onde o
//     teclado tapa. Corrigido conectando o hook em Conversa.tsx.
//
//  2. Dentro do sheet da barra de comando (BarraDeComando.tsx), o compositor
//     vivia como filho comum da área rolável — e essa área SEMPRE mede
//     contra o snap MAIS ALTO (ver o comentário grande em Sheet.tsx, «El pie
//     no puede quedar abajo de la pantalla»). Com uma conversa curta e o
//     sheet no snap baixo (0,6, o de abertura), o compositor `sticky`
//     terminava fora da tela mesmo SEM teclado nenhum. Corrigido movendo o
//     compositor para o `footer` do Sheet — o único lugar que o próprio
//     Sheet sabe manter visível em qualquer snap —, ver `semCompositor` em
//     Conversa.tsx e `CompositorDoRodape` em BarraDeComando.tsx.
//
// ══════════════════════════════════════════════════════════════════════════
// COMO SE SIMULA UM TECLADO SEM TECLADO (headless não tem um de verdade)
// ══════════════════════════════════════════════════════════════════════════
// Não basta encolher o viewport do Playwright: isso encolhe innerHeight E
// visualViewport JUNTOS, e nesse caso `useAlturaDoTeclado()` calcularia zero
// — exatamente o oposto do bug real, em que só o visualViewport encolhe. Por
// isso se troca `window.visualViewport` por um objeto falso ANTES da app
// montar (`addInitScript`), controlável por teste, e se dispara `resize`
// nele — é a mesma conta que o hook lê (`innerHeight - vv.height`).

import { expect, test } from './fixtures/app'

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

const ALTURA_TECLADO_SIMULADA = 320
/** Altura da área que sobra acima do teclado falso, neste viewport. */
const ALTURA_VISIVEL = 780 - ALTURA_TECLADO_SIMULADA

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

test.describe('o compositor do Ventus fica visível acima do teclado', () => {
  test('tela cheia (/ventus): campo e botão de enviar ficam acima do teclado', async ({
    page,
    ventus,
  }) => {
    await instalarVisualViewportFalso(page)
    await ventus.semear()
    await ventus.ir('/ventus')

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    await campo.click()

    await abrirTecladoFalso(page, ALTURA_TECLADO_SIMULADA)
    await page.waitForTimeout(250)

    const enviar = page.getByRole('button', { name: 'Enviar' })
    const boxCampo = await campo.boundingBox()
    const boxEnviar = await enviar.boundingBox()
    if (!boxCampo || !boxEnviar) throw new Error('Campo ou botão de enviar não encontrados')

    // Visíveis por completo ACIMA de onde o teclado começa.
    expect(boxCampo.y + boxCampo.height).toBeLessThanOrEqual(ALTURA_VISIVEL + 5)
    expect(boxEnviar.y + boxEnviar.height).toBeLessThanOrEqual(ALTURA_VISIVEL + 5)
    // O textarea não colapsou a uma linha fina: mantém sua altura mínima real.
    expect(boxCampo.height).toBeGreaterThanOrEqual(40)
  })

  test('sheet da barra de comando: campo e botão de enviar ficam acima do teclado', async ({
    page,
    ventus,
  }) => {
    await instalarVisualViewportFalso(page)
    await ventus.semear()
    await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible()
    await page.getByRole('button', { name: 'Perguntar ao Ventus' }).click()

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    // O sheet abre no snap baixo (0,6): é justamente o caso que o bug 2
    // quebrava, mesmo sem teclado nenhum ainda.
    await expect(campo).toBeInViewport()
    await campo.click()

    await abrirTecladoFalso(page, ALTURA_TECLADO_SIMULADA)
    await page.waitForTimeout(250)

    const enviar = page.getByRole('button', { name: 'Enviar' })
    const boxCampo = await campo.boundingBox()
    const boxEnviar = await enviar.boundingBox()
    if (!boxCampo || !boxEnviar) throw new Error('Campo ou botão de enviar não encontrados')

    expect(boxCampo.y + boxCampo.height).toBeLessThanOrEqual(ALTURA_VISIVEL + 5)
    expect(boxEnviar.y + boxEnviar.height).toBeLessThanOrEqual(ALTURA_VISIVEL + 5)
    expect(boxCampo.height).toBeGreaterThanOrEqual(40)
  })

  test('sheet: mesmo com a conversa vazia (snap baixo), o compositor já está visível sem teclado', async ({
    page,
    ventus,
  }) => {
    // Regressão específica do bug 2: sem teclado nenhum, uma conversa recém
    // aberta (curta) no snap de abertura (0,6) já deixava o compositor fora
    // da tela porque a área rolável do sheet media contra o snap mais alto.
    await ventus.semear()
    await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible()
    await page.getByRole('button', { name: 'Perguntar ao Ventus' }).click()

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    await expect(campo).toBeInViewport()
    const enviar = page.getByRole('button', { name: 'Enviar' })
    await expect(enviar).toBeInViewport()
  })
})
