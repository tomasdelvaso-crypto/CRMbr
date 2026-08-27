// e2e/jornada-dono.spec.ts
// EL RECORRIDO DEL DUEÑO DEL PRODUCTO, DE PUNTA A PUNTA, EN SU TELÉFONO.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE ARCHIVO EXISTE SI YA ESTÁN golden-estreito, toque-real,
// teclado-ventus Y resiliencia
// ══════════════════════════════════════════════════════════════════════════
// Porque cada uno de esos prueba SU bug en aislamiento, arrancando de una app
// recién montada. El dueño no hizo eso: hizo UNA sesión sola, entrando y
// saliendo de las pantallas con el mismo bundle vivo, y los cinco bugs le
// aparecieron encadenados. Un latch que sobrevive a un cambio de ruta, un
// `--spacing-chrome` que quedó escrito de la pantalla anterior o un teclado
// que no se cierra al navegar no se ven probando cada pantalla de cero.
//
// Acá se recorre el reporte COMPLETO, en orden, sin recargar el bundle entre
// pasos:
//
//   Golden Hour (nada encimado, scroll interno, botones visibles)
//     → salir
//     → /placar (swipe TÁCTIL vertical mueve el scroll)
//     → chat del Ventus
//     → teclado abierto: se ve lo que se escribe Y el botón de enviar
//     → preguntar con el servidor devolviendo 500 la primera y 200 la segunda
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE ESTE ARCHIVO ENCONTRÓ Y LOS OTROS NO PODÍAN ENCONTRAR
// ══════════════════════════════════════════════════════════════════════════
// En /ventus el botón «Enviar» del compositor NO SE PODÍA TOCAR. Dos capas
// fijas `z-40` le caían encima y el compositor es `sticky` —sin z-index—, así
// que las dos le ganaban:
//
//   · la bottom nav (`fixed inset-x-0 bottom-0 z-40`). Un `sticky bottom: 0`
//     se pega al borde del SCROLLPORT, o sea del viewport, que es justo donde
//     vive la nav. El `pb-nav-safe` del `<main>` empuja el contenido en flujo
//     pero al sticky no lo mueve. Medido a 360x640: «Enviar» en y=585..629,
//     nav en 576..640.
//
//   · el FAB flotante «Registrar por voz» (`fixed right-4 z-40`), que además
//     sobra en esta pantalla porque el compositor ya trae su propio «Ditar».
//     Medido a 360x780: FAB en y=644..700, «Enviar» en y=608..652.
//
// `resiliencia.spec.ts` había esquivado esto a propósito mandando la pregunta
// con Enter (ver `enviarPergunta` allá y el comentario que lo explica), porque
// no era su frente. Acá NO se puede esquivar: el dueño no tiene tecla Enter,
// tiene un dedo. Se toca con `enviar.tap()` —el locator, no una coordenada
// suelta— para que el hit-test de Playwright falle si algo vuelve a taparlo.
//
// El tamaño es 360x640: el Android del dueño. Corre en su propio proyecto
// (`jornada-dono`, ver playwright.config.ts) por la misma razón que
// `golden-estreito` — a 390x844 el HUD entra en una fila y el bug no existe.

import { mkdirSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { abrir, desconectar, expect, test } from './fixtures/app'

const PASTA = 'docs/capturas/hardware-real'

/* ══════════════════════════════════════════════════════════════════════════
   Gestos y teclado de verdad
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un swipe vertical DE VERDAD: touchstart, varios touchmove y touchend por el
 * protocolo. Mismo helper que `toque-real.spec.ts` — el mouse no ejercita
 * `touch-action`, que es justo lo que el dueño reportó roto en /placar.
 */
async function swipeVertical(
  page: Page,
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

const ALTURA_TECLADO = 280

/**
 * Reemplaza `window.visualViewport` por un objeto falso ANTES de que la app
 * monte. Headless no tiene teclado: achicar el viewport de Playwright achica
 * `innerHeight` Y `visualViewport` juntos, y el hook calcularía cero —
 * exactamente lo contrario del bug real de Android, donde sólo el
 * visualViewport se achica. Mismo truco que `teclado-ventus.spec.ts`.
 */
async function instalarVisualViewportFalso(page: Page): Promise<void> {
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

async function abrirTeclado(page: Page, altura: number): Promise<void> {
  await page.evaluate((h) => {
    const falso = (window as unknown as { __vvFalso: EventTarget & { height: number } }).__vvFalso
    falso.height = window.innerHeight - h
    falso.dispatchEvent(new Event('resize'))
  }, altura)
}

interface Caixa {
  x: number
  y: number
  width: number
  height: number
}

/** El rectángulo de un locator, o una falla clara si no está en pantalla. */
async function caixa(alvo: Locator, nome: string): Promise<Caixa> {
  const box = await alvo.boundingBox()
  if (!box) throw new Error(`«${nome}» não tem caixa: não está na tela`)
  return box
}

function seSobrepoem(a: Caixa, b: Caixa): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Ningún par del conjunto se pisa. Cada entrada lleva su nombre para que una
 * falla diga QUÉ dos elementos se superponen, no un bounding box pelado.
 */
async function semSobreposicoes(elementos: ReadonlyArray<[string, Locator]>): Promise<void> {
  const caixas: Array<[string, Caixa]> = []
  for (const [nome, locator] of elementos) {
    caixas.push([nome, await caixa(locator, nome)])
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

/** Un turno SSE completo, tal como lo manda /api/ventus. */
function corpoSSE(texto: string): string {
  return (
    `data: ${JSON.stringify({ tipo: 'abertura', turnoId: 't', modelo: 'duplo' })}\n\n` +
    `data: ${JSON.stringify({ tipo: 'texto', delta: texto })}\n\n` +
    `data: ${JSON.stringify({ tipo: 'fim', texto })}\n\n`
  )
}

const PERGUNTA_1 = 'escreve uma mensagem para o cliente da linha 4'
const PERGUNTA_2 = 'redig um e-mail curto para a Tetra Pak'
const RESPOSTA_BOA = 'Segue o rascunho combinado.'

/* ══════════════════════════════════════════════════════════════════════════
   El recorrido
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('o relato do dono, de ponta a ponta em 360x640', () => {
  test('Golden Hour → sair → /placar → chat com teclado → 500 e depois 200', async ({
    page,
    ventus,
  }) => {
    // El mock declarado se apaga EN EL APARATO: el chat tiene que usar la red
    // de verdad para que el doble de abajo entre en juego.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado: no aplica */
      }
    })
    await instalarVisualViewportFalso(page)

    // El servidor: 500 la primera vez, 200 la segunda. Es la falla exacta que
    // vivió el teléfono del dueño (FUNCTION_INVOCATION_FAILED por el import
    // roto) y su recuperación.
    const chamadas: string[] = []
    await page.route('**/api/ventus', async (rota) => {
      chamadas.push(rota.request().method())
      if (chamadas.length === 1) {
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

    await ventus.semear()

    /* ── 1. GOLDEN HOUR ────────────────────────────────────────────────
       Nada encimado, el contenido del card rola por dentro y los cuatro
       botones de resultado siguen visibles. Es el bug B. */
    await abrir(page, '/golden')
    await expect(page.getByRole('button', { name: 'Começar a hora' })).toBeVisible()
    await page.getByRole('button', { name: 'Começar a hora' }).click()
    await expect(page.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()

    // El "59:48" NO puede montarse sobre los contadores ni sobre «Encerrar»:
    // esa superposición ES la captura que mandó el dueño.
    const hud = page.getByRole('banner')
    const encerrar = hud.getByRole('button', { name: /Encerrar|Fechar/ })
    await semSobreposicoes([
      ['relógio', hud.locator('[aria-label^="Faltam"]')],
      ['botão Encerrar/Fechar', encerrar],
      ['contador de toques', hud.locator('p', { hasText: 'toques' })],
      ['contador de conversas', hud.locator('p', { hasText: /convers/i })],
    ])

    // El contenido del card rola POR DENTRO con el dedo — «la pantalla no se
    // mueve» era esto — y los cuatro botones de resultado siguen visibles.
    const card = page.locator('article[aria-current="true"]')
    const scroller = card.locator('> div').first()
    const caixaScroller = await caixa(scroller, 'card do contato')
    await swipeVertical(
      page,
      caixaScroller.x + caixaScroller.width / 2,
      caixaScroller.y + caixaScroller.height - 16,
      caixaScroller.y + 16,
    )
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop), {
        message: 'o card da Golden Hour não rolou com o gesto de toque',
      })
      .toBeGreaterThan(0)

    for (const nome of ['Ligou', 'Falou', 'Agendou', 'Passar']) {
      await expect(page.getByRole('button', { name: new RegExp(nome) })).toBeInViewport()
    }

    /* ── 2. SALIR DE LA GOLDEN HOUR ────────────────────────────────────
       Sin recargar el bundle: es una navegación de la SPA, que es lo que
       hace que el paso siguiente pruebe algo que los specs aislados no
       pueden probar (el `--spacing-chrome` de la pantalla anterior). */
    // Se registra un resultado y se encierra por el ritual completo — el
    // fechamento de 60 s no se saltea, y a 640 px de alto el botón de sellar
    // tiene que quedar ALCANZABLE, que es el mismo modo de falla que el
    // teclado del Ventus (un botón «habilitado» que nadie llega a tocar).
    await page.getByRole('button', { name: /Ligou/ }).click()
    await encerrar.click()
    await expect(page.getByRole('heading', { name: 'Fechamento' })).toBeVisible()

    const selo = page.getByRole('button', { name: /Selar a Hora Cheia|Encerrar a hora/ })
    await expect(selo).toBeDisabled()
    await page.getByRole('button', { name: 'Preço' }).click()
    await page.getByRole('button', { name: 'Nenhuma hoje' }).click()
    await page.getByRole('button', { name: 'Ligar mais cedo' }).click()
    await expect(selo).toBeEnabled()
    await expect(selo).toBeInViewport()
    await selo.click()
    await expect(
      page.getByRole('heading', { name: /Hora Cheia selada|Hora encerrada/ }),
    ).toBeVisible()

    /* ── 3. /PLACAR: EL SWIPE TÁCTIL VERTICAL MUEVE EL SCROLL ──────────
       Es el bug C, y se prueba con el dedo, no con la rueda. */
    await ventus.ir('/placar')
    await expect(page.getByRole('heading', { name: /placar/i }).first()).toBeVisible()

    // Se espera a que haya de verdad algo que scrollear.
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), {
        timeout: 15_000,
      })
      .toBeGreaterThan(50)

    const antes = await page.evaluate(() => window.scrollY)
    await swipeVertical(page, 180, 520, 160)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois, 'o swipe táctil vertical não moveu o scroll de /placar').toBeGreaterThan(antes)

    /* ── 4. EL CHAT DEL VENTUS CON EL TECLADO ABIERTO ──────────────────
       Bug D: se tiene que ver lo que se escribe Y el botón de enviar. */
    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    const enviar = page.getByRole('button', { name: 'Enviar' })

    /* ── 4a. ANTES DEL TECLADO: NADA FIJO TAPA EL COMPOSITOR ───────────
       El compositor es `sticky`, y un sticky se pega al borde del VIEWPORT
       —que es exactamente donde vive la bottom nav (`fixed bottom-0
       z-40`)—. El `pb-nav-safe` del `<main>` empuja el contenido en flujo,
       pero al sticky no lo mueve. A 360x640 «Enviar» caía en y=585..629
       con la nav ocupando 576..640: el dueño escribía y no podía mandar.

       Y el FAB flotante «Registrar por voz» (`fixed right-4 z-40`) le
       ganaba también: en /ventus sobra —el compositor ya tiene «Ditar»— y
       encima tapaba el botón. Las dos cosas se miden acá. */
    await expect(
      page.getByRole('button', { name: /Registrar por voz/ }),
      'o FAB flutuante não pode existir em /ventus: tapa o «Enviar» do compositor',
    ).toHaveCount(0)

    const nav = page.getByRole('navigation', { name: 'Navegação principal' })
    await semSobreposicoes([
      ['botão Enviar', enviar],
      ['botão Ditar', page.getByRole('button', { name: 'Ditar' })],
      ['bottom nav', nav],
    ])

    /* ── 4b. CON EL TECLADO ABIERTO ────────────────────────────────────
       Bug D: se tiene que ver lo que se escribe Y el botón de enviar. */
    await campo.click()
    await abrirTeclado(page, ALTURA_TECLADO)
    await page.waitForTimeout(250)

    const alturaVisivel = 640 - ALTURA_TECLADO
    const boxCampo = await caixa(campo, 'campo de texto')
    const boxEnviar = await caixa(enviar, 'Enviar')

    expect(
      boxCampo.y + boxCampo.height,
      'o campo de texto fica atrás do teclado',
    ).toBeLessThanOrEqual(alturaVisivel + 5)
    expect(
      boxEnviar.y + boxEnviar.height,
      'o botão de enviar fica atrás do teclado',
    ).toBeLessThanOrEqual(alturaVisivel + 5)
    // No quedó aplastado en «una delgada línea verde».
    expect(boxCampo.height, 'o campo colapsou a uma linha fina').toBeGreaterThanOrEqual(40)

    /* ── 5. LA PRIMERA PREGUNTA: EL SERVIDOR ESTÁ ROTO ─────────────────
       Se manda TOCANDO «Enviar» con el dedo, no con Enter: el dueño no
       tiene teclado físico, y es así como se descubre si algo está
       tapando el botón. */
    // `enviar.tap()` y NO `page.touchscreen.tap(x, y)`: el segundo dispara el
    // toque en una coordenada a ciegas, así que «acierta» aunque haya otra
    // cosa encima — con él esta prueba pasaba en verde mientras el botón
    // estaba tapado. `locator.tap()` hace el hit-test de Playwright y falla
    // con «… intercepts pointer events», que es justamente el bug que hay que
    // no volver a introducir.
    await campo.fill(PERGUNTA_1)
    await enviar.tap()

    await expect(page.getByText(/servidor do Ventus está com problemas/i)).toBeVisible()
    await expect(page.getByText('Servidor com problemas · resposta local')).toBeVisible()
    // El texto honesto: NO le echa la culpa a la red del vendedor.
    await expect(page.getByText('Sem conexão · resposta local')).toHaveCount(0)
    expect(chamadas, 'a primeira pergunta não saiu à API').toHaveLength(1)

    /* ── 6. LA SEGUNDA PREGUNTA: EL SERVIDOR YA SE CURÓ ────────────────
       La prueba del latch: con el bug viejo, `ativarMockPorFallback` había
       dejado la sesión entera en el camino local y esta llamada nunca
       habría salido. */
    await campo.fill(PERGUNTA_2)
    await enviar.tap()

    await expect(page.getByText(RESPOSTA_BOA)).toBeVisible()
    expect(chamadas, 'a segunda pergunta não voltou à API: o latch segue grudado').toHaveLength(2)
    // Y la respuesta buena NO viene marcada como local.
    await expect(page.getByText('Servidor com problemas · resposta local')).toHaveCount(1)
  })

  test('sem rede de verdade, o texto volta a falar de rede — e só aí', async ({ page, ventus }) => {
    // El contrapunto del paso 5: cuando el problema SÍ es la red del
    // vendedor, el texto tiene que decir eso. Si no, el arreglo del mensaje
    // habría cambiado una mentira por otra.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ventus.chat.mock', 'off')
      } catch {
        /* modo privado: no aplica */
      }
    })
    await ventus.semear()
    await ventus.ir('/ventus')

    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()

    await desconectar(page, true)
    await campo.fill(PERGUNTA_1)
    await campo.press('Enter')

    await expect(page.getByText('Sem conexão · resposta local')).toBeVisible()
    await expect(page.getByText('Servidor com problemas · resposta local')).toHaveCount(0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Capturas antes/depois — sólo con CAPTURAS=1.
   ══════════════════════════════════════════════════════════════════════════
   Mismo patrón que golden-estreito.spec.ts y capturas-resiliencia.spec.ts:
   una suite de QA no escribe en docs/ en cada corrida.

   El «antes» NO está actuado: pide correr este MISMO archivo contra el código
   de ANTES del arreglo. Los comandos exactos, que son los que se usaron:

     git stash push -- src/screens/Ventus/Conversa.tsx src/screens/Ventus/rotas.ts src/app/Shell.tsx
     CAPTURAS=1 npx playwright test --project=jornada-dono -g "antes"
     git stash pop
     CAPTURAS=1 npx playwright test --project=jornada-dono -g "depois"

   Las dos fotos son del MISMO estado: /ventus con la pregunta escrita y sin
   teclado. Lo que cambia entre una y otra es si el botón «Enviar» se puede
   tocar o si lo tapan la bottom nav y el FAB del micrófono.
   ══════════════════════════════════════════════════════════════════════════ */
const LIGADO = process.env['CAPTURAS'] === '1'

test.describe('capturas — o compositor do Ventus a 360x640', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o rodapé do arquivo.')

  test.beforeAll(() => {
    mkdirSync(PASTA, { recursive: true })
  })

  /** Deja /ventus con la pregunta escrita, listo para la foto. */
  async function prepararCompositor(page: Page, ventus: { semear: () => Promise<void>; ir: (r: string) => Promise<void> }): Promise<void> {
    await ventus.semear()
    await ventus.ir('/ventus')
    const campo = page.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(campo).toBeVisible()
    await campo.fill('escreve uma mensagem para o cliente da linha 4')
    // Sin esto la foto sale con el cursor parpadeando a mitad de camino.
    await page.waitForTimeout(300)
  }

  test('antes — «Enviar» tapado pela bottom nav e pelo FAB', async ({ page, ventus }) => {
    await prepararCompositor(page, ventus)
    await page.screenshot({ path: `${PASTA}/ventus-compositor-tapado-antes.png` })
  })

  test('depois — «Enviar» livre acima do chrome fixo', async ({ page, ventus }) => {
    await prepararCompositor(page, ventus)
    await page.screenshot({ path: `${PASTA}/ventus-compositor-tapado-depois.png` })
  })
})
