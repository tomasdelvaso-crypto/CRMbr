// e2e/a11y.spec.ts
// Accesibilidad de las pantallas principales, probada como se usa: con el
// teclado.
//
// No es una casilla que tildar. El equipo trabaja con guantes de planta y con
// el teléfono en una mano, y la mitad de los gestos de esta app tienen que
// existir también como botón — el propio SwipeRow lo dice: «todo lo que se
// puede hacer arrastrando se puede hacer tocando». Lo que se verifica acá:
//
//  · Tabulando se llega a las acciones de las 3 tarjetas del día, y el foco
//    SE VE (el anillo de 2 px del design system, no el outline del navegador
//    apagado con `outline: none` y nada en su lugar).
//  · Las acciones del swipe existen como botones reales alcanzables por
//    teclado, y funcionan.
//  · Escape cierra los sheets y el foco vuelve a donde estaba.
//  · Ningún control interactivo se queda sin nombre accesible.

import { abrir, expect, secaoDoDia, test } from './fixtures/app'
import type { Locator, Page } from '@playwright/test'

/** ¿El elemento enfocado se distingue del resto? */
async function focoVisivel(page: Page): Promise<{ marcador: string; nome: string }> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { marcador: 'sem foco', nome: '' }
    const cs = getComputedStyle(el)
    const outline =
      cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
        ? `outline ${cs.outlineWidth} ${cs.outlineColor}`
        : ''
    const sombra = cs.boxShadow !== 'none' ? `box-shadow` : ''
    const anel = el.matches(':focus-visible') ? 'focus-visible' : ''
    return {
      marcador: [outline, sombra, anel].filter(Boolean).join(' + ') || 'nenhum',
      nome: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
    }
  })
}

/** Tabula hasta encontrar el elemento pedido, o falla diciendo cuántos probó. */
async function tabularAte(page: Page, alvo: Locator, maximo = 40): Promise<number> {
  for (let i = 1; i <= maximo; i++) {
    await page.keyboard.press('Tab')
    if (await alvo.evaluate((el) => el === document.activeElement).catch(() => false)) return i
  }
  throw new Error(`Não cheguei ao alvo em ${String(maximo)} tabulações`)
}

test.describe('Acessibilidade', () => {
  test('a tela Hoje se percorre com o teclado e o foco se vê', async ({ app }) => {
    await app.locator('body').click({ position: { x: 5, y: 5 } })

    // Primer Tab: algo recibe el foco y ese algo SE VE.
    await app.keyboard.press('Tab')
    const primeiro = await focoVisivel(app)
    expect(primeiro.marcador).not.toBe('nenhum')
    expect(primeiro.marcador).not.toBe('sem foco')

    // Tabulando se llega al botón principal de la primera tarjeta.
    const fazerAgora = secaoDoDia(app).getByRole('button', { name: 'Fazer agora' }).first()
    await tabularAte(app, fazerAgora)
    const noBotao = await focoVisivel(app)
    expect(noBotao.marcador).toContain('outline')

    // Y Enter hace lo mismo que el toque.
    await app.keyboard.press('Enter')
    await expect(app).toHaveURL(/\/registrar$/)
  })

  test('as ações do swipe existem como botões de teclado e funcionam', async ({ app }) => {
    const primeiroCartao = secaoDoDia(app).locator('> ul > li').first()

    // Están en el DOM desde el principio, no aparecen por hover.
    const feito = primeiroCartao.getByRole('button', { name: 'Feito' })
    await expect(feito).toHaveCount(1)

    // Se llega tabulando y, al recibir foco, dejan de ser sr-only: quien
    // navega con teclado tiene que VER lo que va a activar.
    await app.locator('body').click({ position: { x: 5, y: 5 } })
    await tabularAte(app, feito)
    await expect(feito).toBeVisible()

    await app.keyboard.press('Enter')
    await expect(app.getByRole('button', { name: 'Desfazer' })).toBeVisible()
    await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Faltam 2 de 3')
  })

  test('Escape fecha o sheet e o foco volta para quem o abriu', async ({ app }) => {
    await abrir(app, '/carteira/101')
    const gatilho = app.getByRole('button', { name: /^5\s*Dor/ })
    await gatilho.click()

    const editor = app.getByRole('dialog')
    await expect(editor).toBeVisible()
    // El sheet es modal y se anuncia como tal.
    await expect(editor).toHaveAttribute('aria-modal', 'true')

    await app.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)

    // El foco vuelve al botón de la escala, no al principio del documento.
    await expect(gatilho).toBeFocused()
  })

  test('nenhum controle das telas principais fica sem nome acessível', async ({ app }) => {
    for (const rota of ['/', '/carteira', '/cadencia', '/placar', '/mais']) {
      await abrir(app, rota)
      await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()

      const anonimos = await app.evaluate(() => {
        const nome = (el: Element): string => {
          const rotulo = el.getAttribute('aria-label')
          if (rotulo && rotulo.trim() !== '') return rotulo
          const porId = el.getAttribute('aria-labelledby')
          if (porId) {
            const alvo = document.getElementById(porId)
            if (alvo?.textContent?.trim()) return alvo.textContent
          }
          const titulo = el.getAttribute('title')
          if (titulo && titulo.trim() !== '') return titulo
          return (el.textContent ?? '').trim()
        }
        const visivel = (el: Element): boolean => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        return [...document.querySelectorAll('button, a[href], [role="button"]')]
          .filter((el) => visivel(el) && nome(el) === '')
          .map((el) => el.outerHTML.slice(0, 120))
      })

      expect(anonimos, `controles sem nome em ${rota}`).toEqual([])
    }
  })

  test('os alvos de toque das telas principais chegam a 44 px', async ({ app }) => {
    // WCAG 2.5.5 y regla del design system. Con guantes de planta, un control
    // de 32 px es un control que se erra.
    //
    // No se mide el rectángulo del elemento: se PALPA el área táctil con
    // elementFromPoint en los cuatro extremos del cuadrado de 44 px. Es la
    // única medición honesta, porque varios controles del design system son
    // chicos a propósito y agrandan el área con un ::before —el chip «Por que
    // isto?» dibuja 28 px de alto y toca 44—, y porque de paso detecta lo que
    // un rectángulo no ve: un control tapado por otra cosa.
    await expect(secaoDoDia(app).locator('> ul > li')).toHaveCount(3)
    await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
    await app.waitForTimeout(300)

    const pequenos = await app.evaluate(() => {
      const MEIA = 21 // 44 / 2, menos 1 px para no caer en el borde exacto.

      const escondidoDeVista = (el: Element): boolean => {
        const cs = getComputedStyle(el)
        // sr-only: existe para el lector de pantalla y el teclado, no para el
        // dedo. Medirlo como alvo táctil no significa nada.
        return cs.clipPath !== 'none' || cs.clip !== 'auto'
      }

      /** El overlay fijo más cercano (bottom nav, FAB, barra do Ventus). */
      const capaFixa = (no: Element | null): Element | null => {
        for (let e = no; e !== null; e = e.parentElement) {
          if (getComputedStyle(e).position === 'fixed') return e
        }
        return null
      }

      const alcancavel = (el: Element): boolean => {
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        const pontos: Array<[number, number]> = [
          [x, y - MEIA],
          [x, y + MEIA],
          [x - MEIA, y],
          [x + MEIA, y],
        ]
        return pontos.every(([px, py]) => {
          // Fuera de la ventana no se puede juzgar: no cuenta como falla.
          if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) return true
          const acertado = document.elementFromPoint(px, py)
          if (acertado === null) return true
          // Tapado por la bottom nav o por el FAB: eso se resuelve
          // scrolleando dos centímetros, no es un alvo chico. Lo que sí sería
          // un problema —y esto lo detecta— es un control tapado por algo que
          // vive en la MISMA capa y no se puede correr.
          if (capaFixa(acertado) !== capaFixa(el)) return true
          return acertado === el || el.contains(acertado)
        })
      }

      return [...document.querySelectorAll('button, a[href], [role="button"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return false
          if (escondidoDeVista(el)) return false
          if (r.height >= 44 && r.width >= 44) return false
          return !alcancavel(el)
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          const rotulo = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()
          return `${rotulo.slice(0, 30)} — ${String(Math.round(r.width))}×${String(Math.round(r.height))}`
        })
    })
    expect(pequenos).toEqual([])
  })
})
