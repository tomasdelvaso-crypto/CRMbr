// e2e/layout.spec.ts
// Los tres defectos de superficie que el barrido de Playwright encontró y que
// habían quedado anotados sin arreglar (QA.md §5). Cada prueba de acá mide la
// GEOMETRÍA real del navegador —no una clase de CSS— porque los tres eran
// exactamente eso: capas que se pisaban a pesar de que cada componente por
// separado estaba bien.
//
// Corren en los tres perfiles a propósito. El iPhone 14 (664 px de alto) es
// donde duelen; el Pixel 7 y el escritorio son la prueba de que arreglarlos no
// rompió a los que ya entraban.

import { abrir, cartoesDoDia, expect, secaoDoDia, test } from './fixtures/app'

const TETRA = 101

/** Rectángulos del chrome fijo de abajo: barra del Ventus, nav y FAB si flota. */
async function chromeFixo(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const caixa = (el: Element | null) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return null
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }
    }
    return {
      barra: caixa(document.querySelector('div.fixed.inset-x-0.z-30')),
      nav: caixa(document.querySelector('nav')),
      fab: caixa(document.querySelector('button.fixed[aria-label^="Registrar por voz"]')),
    }
  })
}

test.describe('Tela Hoje · o primeiro cartão cabe na tela', () => {
  test('o primeiro cartão do dia está inteiro à vista, sem rolar', async ({ app }) => {
    await expect(cartoesDoDia(app)).toHaveCount(3)

    // La ventana de scroll de Hoje. Su alto ya descuenta header, bottom nav y
    // barra de comando: lo que entra acá es lo que el vendedor ve al abrir.
    const janela = await secaoDoDia(app).evaluate((sec) => {
      // El scroller real es el hijo con overflow-y de PullToRefresh, no el
      // envoltorio con overflow-hidden: sólo el primero tiene scrollTop.
      const scroller = sec.closest('[class*="overflow-y-auto"]')
      const b = (scroller ?? sec).getBoundingClientRect()
      return { top: b.top, bottom: b.bottom, rolagem: scroller?.scrollTop ?? 0 }
    })
    // Nadie scrolleó: es la primera impresión de la pantalla, no un estado al
    // que se llega.
    expect(janela.rolagem).toBe(0)

    const cartao = await cartoesDoDia(app).first().boundingBox()
    expect(cartao).not.toBeNull()
    if (!cartao) return

    // COMPLETAMENTE visible: arriba y abajo dentro de la ventana de scroll.
    expect(cartao.y).toBeGreaterThanOrEqual(janela.top - 0.5)
    expect(cartao.y + cartao.height).toBeLessThanOrEqual(janela.bottom + 0.5)

    // Y ninguna capa fija encima. Antes la barra de comando le comía 67 px y
    // el FAB del micrófono otros 56 justo sobre el texto de la acción.
    const chrome = await chromeFixo(app)
    const intersecta = (r: { top: number; bottom: number; left: number; right: number } | null) =>
      r !== null &&
      r.top < cartao.y + cartao.height &&
      r.bottom > cartao.y &&
      r.left < cartao.x + cartao.width &&
      r.right > cartao.x

    expect(intersecta(chrome.barra), 'a barra do Ventus tapa o cartão').toBe(false)
    expect(intersecta(chrome.nav), 'a bottom nav tapa o cartão').toBe(false)
    expect(intersecta(chrome.fab), 'o FAB tapa o cartão').toBe(false)
  })

  test('o fim da lista é alcançável: a barra não se apoia no conteúdo', async ({ app }) => {
    await expect(cartoesDoDia(app)).toHaveCount(3)

    // Se scrollea hasta el fondo y se mira el ÚLTIMO elemento del contenido.
    // Sin la reserva de `--spacing-chrome` la barra quedaba encima de él y esa
    // última línea no se podía leer con ningún gesto.
    const fundo = await secaoDoDia(app).evaluate(async (sec) => {
      const scroller = sec.closest('[class*="overflow-y-auto"]') as HTMLElement | null
      if (!scroller) return null
      scroller.scrollTop = scroller.scrollHeight
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const conteudo = scroller.querySelector('div.px-4')
      const ultimo = conteudo?.lastElementChild
      if (!ultimo) return null
      const b = ultimo.getBoundingClientRect()
      return { bottom: b.bottom, limite: scroller.getBoundingClientRect().bottom }
    })
    expect(fundo).not.toBeNull()
    if (!fundo) return
    expect(fundo.bottom).toBeLessThanOrEqual(fundo.limite + 0.5)

    const chrome = await chromeFixo(app)
    // La barra empieza donde termina la ventana de scroll, no antes.
    if (chrome.barra) expect(chrome.barra.top).toBeGreaterThanOrEqual(fundo.limite - 1)
  })
})

test.describe('Editor de escala · não desborda na horizontal', () => {
  test('o conteúdo cabe na largura do sheet, e focar «Cargo» não o desloca', async ({ app }) => {
    await abrir(app, `/carteira/${String(TETRA)}`)
    await app.getByRole('button', { name: /^5\s*Dor/ }).click()

    const editor = app.getByRole('dialog')
    await expect(editor).toBeVisible()
    // Nivel 9: es el estado donde aparece el bloque de evidencia entero.
    await editor.getByRole('button', { name: 'Tomador de Decisão admite dor' }).click()

    const medir = () =>
      editor.evaluate((el) => {
        const scroller = el.querySelector('[class*="overflow-y"]') ?? el
        return {
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          scrollLeft: scroller.scrollLeft,
        }
      })

    // La aserción del defecto: 419 contra 388 en un iPhone 14. El culpable no
    // era la grilla de dos columnas de la evidencia (356 px, entra) sino el
    // control segmentado de SPIN, cuyos botones no podían encoger.
    const antes = await medir()
    expect(antes.scrollWidth).toBeLessThanOrEqual(antes.clientWidth)

    // Y el síntoma que se veía: enfocar «Cargo» corría el sheet de costado.
    await editor.getByLabel('Cargo').focus()
    const depois = await medir()
    expect(depois.scrollLeft).toBe(0)
    expect(depois.scrollWidth).toBeLessThanOrEqual(depois.clientWidth)
  })
})

test.describe('Dossiê · nomes acessíveis únicos', () => {
  test('os dois botões de voz não se chamam igual', async ({ app }) => {
    await abrir(app, `/carteira/${String(TETRA)}`)

    // El de la ficha dice a QUIÉN registra; el del Shell es la captura sin
    // cliente. Un lector de pantalla los tiene que poder distinguir.
    const daFicha = app.getByRole('button', { name: /^Registrar conversa por voz em / })
    await expect(daFicha).toBeVisible()

    const doShell = app.getByRole('button', { name: 'Registrar por voz', exact: true })
    await expect(doShell).toBeVisible()

    // Ningún nombre accesible repetido entre los controles visibles.
    const repetidos = await app.evaluate(() => {
      const nomes = [...document.querySelectorAll('button[aria-label]')]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => b.getAttribute('aria-label') ?? '')
      const vistos = new Set<string>()
      const dobles = new Set<string>()
      for (const n of nomes) {
        if (vistos.has(n)) dobles.add(n)
        vistos.add(n)
      }
      return [...dobles]
    })
    expect(repetidos, 'nomes acessíveis repetidos no Dossiê').toEqual([])
  })
})
