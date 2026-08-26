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

/* ══════════════════════════════════════════════════════════════════════════
   DENSIDADE DE ESCRITORIO
   ══════════════════════════════════════════════════════════════════════════
   El defecto que estas pruebas cierran es el que el dueño del producto
   reportó con la captura en la mano: el rail estaba, pero el CONTENIDO no
   usaba el espacio. El kanban de Cadência metía cuatro columnas de ~150 px
   en el centro de un área de 1.700, con los nombres de empresa cortados, y
   la barra «Perguntar ao Ventus» flotaba centrada sobre la ventana en vez de
   alinearse con la columna que dice comandar.

   Miden GEOMETRÍA, no clases de CSS: `larguraDe()` puede cambiar de valores
   sin romperlas, y no pueden pasar por accidente si alguien vuelve a poner
   un `max-w-4xl` en el medio.

   Sólo en el proyecto `desktop`. En los dos teléfonos ni el rail existe.
   ══════════════════════════════════════════════════════════════════════════ */
test.describe('Escritorio · o conteúdo usa a largura', () => {
  // Por ANCHO y no por nombre de proyecto: `lg` es 1024 px y es el único
  // número que decide si hay rail y si hay segunda columna.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'só faz sentido em lg+')

  test('Cadência: o kanban ocupa a área toda e os nomes não são cortados', async ({ app }) => {
    await abrir(app, '/cadencia')

    const primeiraColuna = app.getByRole('heading', { name: /^1A/ })
    await expect(primeiraColuna).toBeVisible({ timeout: 15_000 })

    // El área de contenido = lo que queda a la derecha del rail.
    const area = await app.evaluate(() => {
      const rail = document.querySelector('nav[aria-label="Navegação principal"]')
      const esquerda = rail ? rail.getBoundingClientRect().right : 0
      return { esquerda, largura: window.innerWidth - esquerda }
    })

    // Las CUATRO columnas del kanban, medidas de verdad.
    const colunas = await app.evaluate(() => {
      const titulos = [...document.querySelectorAll('main h3')]
      return titulos.map((h) => {
        const b = (h.parentElement ?? h).getBoundingClientRect()
        return { x: b.x, largura: b.width }
      })
    })
    expect(colunas).toHaveLength(4)

    // El kanban entero cubre casi toda el área: es la regresión de «896 px
    // flotando en el medio de 1.700». Con el defecto, este número era 0,53.
    const primeira = colunas[0]
    const ultima = colunas[3]
    expect(primeira).toBeDefined()
    expect(ultima).toBeDefined()
    if (!primeira || !ultima) return
    const ocupado = ultima.x + ultima.largura - primeira.x
    expect(ocupado / area.largura).toBeGreaterThan(0.9)

    // Y cada columna es ancha de verdad, no una tira de 150 px.
    for (const coluna of colunas) {
      expect(coluna.largura).toBeGreaterThan(200)
    }

    // Ningún nombre de empresa cortado: el texto entra en su caja.
    const cortados = await app.evaluate(() => {
      const nomes = [...document.querySelectorAll('main ul li button > span:first-child')]
      return nomes
        .filter((s) => s.scrollWidth > s.clientWidth + 1)
        .map((s) => s.textContent ?? '')
    })
    expect(cortados, 'nomes de empresa cortados no kanban').toEqual([])
  })

  test('a barra do Ventus se alinha à coluna de conteúdo, não à janela', async ({ app }) => {
    // Dos rutas de anchos MUY distintos: una tabla a todo lo ancho y la tela
    // de foco. La barra tiene que seguir a las dos.
    for (const rota of ['/cadencia', '/']) {
      await abrir(app, rota)
      // La barra sólo se pinta con vendedor resuelto: sin esta espera se mide
      // el frame anterior a que la sesión termine de resolver.
      await expect(app.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible({
        timeout: 15_000,
      })

      const medidas = await app.evaluate(() => {
        const titulo = document.querySelector('header h1')
        const barra = document.querySelector('div.fixed.inset-x-0.z-30')
        const campo = barra?.querySelector(':scope > div > div')
        if (!titulo || !campo) return null
        return {
          titulo: titulo.getBoundingClientRect().x,
          campo: campo.getBoundingClientRect().x,
        }
      })
      expect(medidas, `sem barra ou sem título em ${rota}`).not.toBeNull()
      if (!medidas) continue

      // Mismo eje. Antes había 112 px de diferencia en /cadencia: el título
      // vivía en una columna de 896 px y la barra en una de 672, las dos
      // centradas contra el mismo viewport.
      expect(Math.abs(medidas.campo - medidas.titulo), `barra desalinhada em ${rota}`).toBeLessThanOrEqual(1)
    }
  })

  test('Carteira: a linha vira tabela — cliente, etapa, saúde e próxima ação', async ({ app }) => {
    await abrir(app, '/carteira')
    await expect(app.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible({
      timeout: 15_000,
    })

    // Las columnas de escritorio existen y se ven. Son las que en el teléfono
    // viven amontonadas en el subtítulo truncado de la fila.
    const primeira = app.getByRole('button', { name: /CD Guarulhos/ }).first()
    await expect(primeira).toBeVisible()
    await expect(primeira.getByText('declarada')).toBeVisible()
    await expect(primeira.getByText('com prova')).toBeVisible()

    // Y el encabezado de la tabla, que sólo existe en lg+.
    for (const coluna of ['Negócio', 'Etapa', 'Saúde', 'Contato', 'Próxima ação', 'Valor']) {
      await expect(app.getByText(coluna, { exact: true }).first()).toBeVisible()
    }
  })

  test('Carteira: o nome do negócio sobrevive em TODA largura de escritorio', async ({ app }) => {
    // ── Por qué esta prueba existe ──────────────────────────────────────
    // La de arriba comprobaba que las columnas EXISTIERAN y pasaba en verde
    // con el nombre del negocio en 38 px a 1280. El nombre es el único
    // elemento flexible de la fila (`flex-1 min-w-0`) y por eso es el único
    // que se encoge cuando los anchos fijos no entran: a 1024 px medía
    // EXACTAMENTE 0 y la fila no decía de qué negocio se trataba. Una prueba
    // de geometría que no mide el elemento flexible no ve lo único que cede.
    //
    // Se recorren los seis anchos donde cambia algo: los tres breakpoints
    // (lg/xl/2xl) y los tres portátiles corrientes de la vida real.
    for (const largura of [1024, 1152, 1280, 1366, 1440, 1920]) {
      await app.setViewportSize({ width: largura, height: 900 })
      await abrir(app, '/carteira')
      await expect(app.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible({
        timeout: 15_000,
      })

      const nome = await app.evaluate(() => {
        const fila = [...document.querySelectorAll('main button')].find((b) =>
          (b.textContent ?? '').includes('CD Guarulhos'),
        )
        const alvo = fila?.querySelector('span > span:first-child')
        if (!alvo) return null
        const caixa = alvo.getBoundingClientRect()
        return {
          largura: caixa.width,
          cortado: alvo.scrollWidth > alvo.clientWidth + 1,
        }
      })

      expect(nome, `sem a linha de CD Guarulhos em ${String(largura)} px`).not.toBeNull()
      if (!nome) continue
      // 200 px es el ancho de «CD Guarulhos — caixa violada» con holgura: el
      // número no es redondo, es el texto más largo de la semilla.
      expect(nome.largura, `nome do negócio esmagado em ${String(largura)} px`).toBeGreaterThan(200)
      expect(nome.cortado, `nome do negócio cortado em ${String(largura)} px`).toBe(false)
    }
  })

  test('Hoje: o contexto do dia vira coluna secundária à direita', async ({ app }) => {
    await abrir(app, '/')
    await expect(cartoesDoDia(app)).toHaveCount(3)

    const caixas = await app.evaluate(() => {
      const secao = document.querySelector('[aria-label="ações de hoje"], [aria-label*="ações de hoje"]')
      const aside = document.querySelector('aside[aria-label="Contexto do dia"]')
      if (!secao || !aside) return null
      const a = secao.getBoundingClientRect()
      const b = aside.getBoundingClientRect()
      return { foco: { x: a.x, right: a.right }, lateral: { x: b.x, right: b.right } }
    })
    expect(caixas, 'a coluna secundária não existe em lg+').not.toBeNull()
    if (!caixas) return

    // La columna secundaria está AL LADO, no debajo: empieza donde termina la
    // de foco. Es la diferencia entre usar el espacio lateral y apilarlo.
    expect(caixas.lateral.x).toBeGreaterThanOrEqual(caixas.foco.right - 1)
  })

  test('Hoje num portátil baixo: a faixa da sequência aparece UMA vez', async ({ app }) => {
    // 1920×800 cumple LAS DOS condiciones que reparten el bloque de contexto:
    // es «tela curta» (≤880 px de alto, la regla del iPhone) y es escritorio
    // (≥1024 px de ancho, la regla del rail). Las dos reglas mandaban pintar
    // la racha, cada una en su lugar, y salía dos veces. Es el tamaño de un
    // portátil corriente, no un caso de laboratorio.
    await app.setViewportSize({ width: 1920, height: 800 })
    await abrir(app, '/')
    await expect(cartoesDoDia(app)).toHaveCount(3)

    const escudos = app.locator('[aria-label$="escudos disponíveis"]')
    await expect(escudos).toHaveCount(1)
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
