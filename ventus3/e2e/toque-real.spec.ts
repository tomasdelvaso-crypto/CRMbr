// e2e/toque-real.spec.ts
// El PAN VERTICAL con el dedo tiene que funcionar SIEMPRE, en las cinco
// rutas que el vendedor abre todos los días — no sólo con el mouse.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE ARCHIVO EXISTE Y NO CONFÍA EN `page.mouse.wheel` NI EN
// `scrollIntoView`
// ══════════════════════════════════════════════════════════════════════════
// El resto de la suite (layout.spec.ts, capturas*.spec.ts) mueve el scroll
// con la RUEDA o con JS (`el.scrollTop = ...`, `scrollIntoView`). Eso
// ejercita el DOM — confirma que hay overflow y que nada tiene
// `overflow: hidden` de más — pero NO ejercita el camino que un dedo de
// verdad recorre: `touch-action`, `overscroll-behavior` y el
// reconocedor de gestos del compositor, que sólo entran en juego con
// eventos táctiles reales.
//
// `page.touchscreen` (la API pública de Playwright) sólo sabe hacer `tap`;
// no hay `swipe`. Por eso acá se arma el gesto a mano con el protocolo
// (`Input.dispatchTouchEvent`, touchstart → varios touchmove → touchend),
// que es el camino que SÍ pasa por la pila de touch del navegador — el mismo
// que un finger swipe real dispara — y no por el atajo del mouse.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE ENCONTRÓ AL AUDITAR
// ══════════════════════════════════════════════════════════════════════════
// No hay ningún `touch-action: none` ni `pan-x` heredado sobre contenido
// vertical en las cinco rutas: los carruseles horizontales (Eu vs eu,
// Troféus, Golden Hour) usan `overflow-x-auto` nativo sin tocar
// `touch-action` —que es lo correcto: el navegador decide el eje del gesto
// solo, y un swipe vertical que arranca ENCIMA de una tarjeta del carrusel
// sigue subiendo la página—. No se usa ninguna librería de gestos
// (`@use-gesture` no está en package.json ni se importa en ningún lado); la
// única sospecha de la hipótesis original no aplica a este código.
//
// Sí se encontró — y se corrige en Conversa.tsx/BarraDeComando.tsx, ver
// e2e/teclado-ventus.spec.ts — un bug real de layout (el compositor del
// Ventus quedaba fuera de pantalla), pero nada de `touch-action`.
//
// Este archivo es la RED que iba a faltar: si algún cambio futuro le pone
// `touch-action: none` a un contenedor por accidente (un `<Sheet>` mal
// copiado, un `overflow-hidden` de más), estos tests lo agarran.

import { abrir, expect, test } from './fixtures/app'
import { diasAtras, leadDeCadencia, oportunidade, propostaCriarTask, vendedor } from './fixtures/dados'
import type { Semente } from './fixtures/dados'

/** El ancho real del aparato que reportó los cinco bugs (355-360 CSS px). */
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true })

/**
 * Un swipe vertical DE VERDAD: touchstart, varios touchmove intermedios (el
 * lock de eje y el reconocedor de gestos del navegador necesitan más de un
 * punto) y touchend. Se arma con el protocolo porque `page.touchscreen` no
 * tiene `swipe`, sólo `tap`.
 */
async function swipeVertical(
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

/**
 * Una cartera grande — la que hace que CADA una de las cinco rutas tenga de
 * verdad más contenido que una pantalla de 780 px. Con la semilla por
 * defecto (9 negocios), Hoje y Carteira no llegan a desbordar y el test
 * pasaría por las razones equivocadas (nada para scrollear, no que el
 * scroll funcione).
 */
function semilhaTransbordante(): Semente {
  const opportunities = Array.from({ length: 20 }, (_, i) =>
    oportunidade({
      id: 900 + i,
      client: `Cliente Transbordo ${i}`,
      name: `Negócio de transbordo ${i}`,
      value: 10_000 * (i + 1),
      last_update: `${diasAtras(5 + i)}T12:00:00Z`,
      last_activity_date: diasAtras(5 + i),
    }),
  )
  const leads = Array.from({ length: 15 }, (_, i) =>
    leadDeCadencia({
      id: 950 + i,
      company_name: `Empresa Transbordo ${i}`,
      contact_name: `Contato ${i}`,
      next_touchpoint_date: diasAtras(i % 5),
      last_touchpoint_date: diasAtras(5 + i),
    }),
  )
  const propostas = Array.from({ length: 15 }, (_, i) =>
    propostaCriarTask({
      id: `99999999-9999-4999-8999-99999999999${i}`,
      idempotency_key: `e2e-transbordo-${i}`,
      entity_id: String(900 + (i % 20)),
      payload: { titulo: `Ligar sobre negócio ${i}`, due_date: diasAtras(-i), canal: 'phone' },
    }),
  )
  return {
    vendors: [vendedor()],
    opportunities,
    leads,
    tasks: [],
    commitments: [],
    servidor: { ventus_actions: propostas },
  }
}

test.describe('pan vertical com o dedo (touch de verdade, não mouse)', () => {
  test('/placar: um swipe táctil move o scroll do documento', async ({ app }) => {
    const page = app
    await abrir(page, '/placar')
    await expect(page.getByRole('heading', { name: 'Os cinco da semana' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(200)

    const antes = await page.evaluate(() => window.scrollY)
    expect(antes).toBe(0)
    // O swipe arranca EM CIMA de um cartão do carrossel horizontal (Eu vs
    // eu): é o ponto que a hipótese original suspeitava que ia «comer» o
    // gesto vertical. Não come.
    await swipeVertical(page, 120, 650, 150)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois).toBeGreaterThan(100)
  })

  test('/rituais: um swipe táctil move o scroll do documento', async ({ app }) => {
    const page = app
    await abrir(page, '/rituais')
    await page.waitForTimeout(500)

    const antes = await page.evaluate(() => window.scrollY)
    await swipeVertical(page, 180, 650, 150)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois).toBeGreaterThan(antes)
  })

  test('/: com uma fila de hoje transbordante, o swipe táctil scrolla o documento', async ({
    page,
    ventus,
  }) => {
    await ventus.semear(semilhaTransbordante())
    await abrir(page, '/')
    await page.waitForTimeout(500)

    const antes = await page.evaluate(() => window.scrollY)
    await swipeVertical(page, 180, 650, 150)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois).toBeGreaterThan(antes)
  })

  test('/revisao: com propostas de sobra, o swipe táctil scrolla o documento', async ({
    page,
    ventus,
  }) => {
    await ventus.semear(semilhaTransbordante())
    await abrir(page, '/revisao')
    await expect(page.getByRole('heading', { name: 'Revisão do Ventus' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(500)

    const antes = await page.evaluate(() => window.scrollY)
    await swipeVertical(page, 180, 650, 150)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois).toBeGreaterThan(antes)
  })

  // ── Carteira é diferente A PROPÓSITO ────────────────────────────────────
  // «Uma sola región de scroll»: el encabezado queda fijo y sólo la lista
  // VIRTUALIZADA scrollea — es la propia pantalla la que dice, en su
  // comentario, que un scroll anidado (página + lista) es el defecto táctil
  // que este diseño existe para matar. Por eso acá NO se mide
  // `window.scrollY` —tiene que quedarse en cero— sino el `scrollTop` de la
  // lista.
  test('/carteira: o swipe táctil scrolla a lista virtualizada, não o documento', async ({
    page,
    ventus,
  }) => {
    await ventus.semear(semilhaTransbordante())
    await abrir(page, '/carteira')
    await page.waitForTimeout(700)

    const alvo = page.locator('ul[aria-label="Oportunidades da carteira"]')
    await expect(alvo).toBeVisible()
    const caixa = await alvo.evaluate((ul) => {
      const scroller = ul.parentElement?.parentElement as HTMLElement
      const r = scroller.getBoundingClientRect()
      return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom, scrollTop: scroller.scrollTop }
    })

    await swipeVertical(page, caixa.x, caixa.bottom - 30, caixa.top + 30)
    await page.waitForTimeout(300)

    const depois = await alvo.evaluate((ul) => {
      const scroller = ul.parentElement?.parentElement as HTMLElement
      return { scrollTop: scroller.scrollTop, docScrollY: window.scrollY }
    })
    expect(depois.scrollTop).toBeGreaterThan(caixa.scrollTop)
    // La página en sí no se movió: es UNA sola región de scroll, no dos.
    expect(depois.docScrollY).toBe(0)
  })

  test('/placar: o swipe que arranca sobre um cartão do carrossel horizontal também sobe a página', async ({
    app,
  }) => {
    const page = app
    await abrir(page, '/placar')
    await expect(page.getByRole('heading', { name: 'Os cinco da semana' })).toBeVisible({
      timeout: 15_000,
    })
    await page.waitForTimeout(200)

    const cartao = await page.evaluate(() => {
      const btn = document.querySelector('section[aria-label="Eu contra eu mesmo"] li button')
      if (!btn) return null
      const r = btn.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    if (!cartao) throw new Error('Não achei nenhum cartão do carrossel Eu vs eu')

    const antes = await page.evaluate(() => window.scrollY)
    await swipeVertical(page, cartao.x, cartao.y, cartao.y - 300)
    await page.waitForTimeout(300)
    const depois = await page.evaluate(() => window.scrollY)
    expect(depois).toBeGreaterThan(antes)
  })
})
