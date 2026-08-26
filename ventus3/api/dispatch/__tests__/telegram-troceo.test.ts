// api/dispatch/__tests__/telegram-troceo.test.ts
// El dispatcher y el bot trocean con la MISMA función.
//
// Este archivo existe porque durante un tiempo hubo dos: `api/dispatch/
// _telegram.ts` tenía su propio `trocear()` que cortaba duro a `limite` cuando
// una línea no entraba, sin mirar si el corte caía dentro de un `<b>`. Telegram
// no perdona eso: rechaza el mensaje ENTERO con «400 can't parse entities», y
// como el dispatcher solo lo escribe en el log del servidor, el aviso largo
// —justo el que más importa, el preparo de una reunión— desaparecía en
// silencio. Es el mismo bug que el encabezado de ese archivo promete no
// repetir.
//
// Ahora el dispatcher importa `trocear` de `api/telegram/_lib/tg.ts`, que
// cierra y reabre las etiquetas al cortar. Estos tests fijan las dos mitades
// del invariante: que es la misma función, y que lo que devuelve es HTML
// balanceado.

import { describe, expect, it } from 'vitest'

import { MAX_CHARS } from '../_telegram.js'
import { LIMITE_MENSAGEM, trocear } from '../../telegram/_lib/tg.js'

/** Etiquetas abiertas menos cerradas. 0 = balanceado. */
function desbalance(html: string): number {
  const abre = (html.match(/<(b|i|u|s|code|pre|a|em|strong|blockquote)\b[^>]*>/g) ?? []).length
  const cierra = (html.match(/<\/(b|i|u|s|code|pre|a|em|strong|blockquote)>/g) ?? []).length
  return abre - cierra
}

describe('el troceo del dispatcher', () => {
  it('usa el MISMO límite que la biblioteca del bot', () => {
    // Dos constantes con el mismo 4096 se separan el día que Telegram lo
    // cambie: acá `MAX_CHARS` es un reexport, no una segunda copia.
    expect(MAX_CHARS).toBe(LIMITE_MENSAGEM)
    expect(MAX_CHARS).toBe(4096)
  })

  it('corta una línea larguísima sin partir una etiqueta por la mitad', () => {
    // Una sola línea, más larga que el límite, envuelta en <b>: es exactamente
    // la forma del título de un aviso. El troceo viejo cortaba en el medio y
    // dejaba `<b>…` sin cerrar en un trozo y `…</b>` huérfano en el otro.
    const linha = `<b>${'preparo da reunião '.repeat(400)}</b>`
    expect(linha.length).toBeGreaterThan(MAX_CHARS)

    const partes = trocear(linha)

    expect(partes.length).toBeGreaterThan(1)
    for (const parte of partes) {
      expect(parte.length).toBeLessThanOrEqual(MAX_CHARS)
      expect(desbalance(parte)).toBe(0)
    }
  })

  it('no pierde texto al trocear', () => {
    const linha = `<b>${'x '.repeat(3000)}</b>`
    const semTags = (t: string): string => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const juntas = trocear(linha).map(semTags).join(' ').replace(/\s+/g, ' ').trim()
    expect(juntas).toBe(semTags(linha))
  })

  it('respeta los saltos de línea cuando puede', () => {
    // El cuerpo de un aviso viene en bullets. Cortar por `\n` deja HTML válido
    // sin hacer nada, y por eso es el corte preferido.
    const corpo = Array.from({ length: 300 }, (_, i) => `<b>Item ${String(i)}</b> — ligar hoje`).join('\n')
    expect(corpo.length).toBeGreaterThan(MAX_CHARS)

    for (const parte of trocear(corpo)) {
      expect(desbalance(parte)).toBe(0)
      // Ningún trozo empieza ni termina cortando un item por la mitad.
      expect(parte.startsWith('<b>Item ')).toBe(true)
      expect(parte.endsWith('ligar hoje')).toBe(true)
    }
  })
})

describe('el presupuesto del troceo incluye el cierre de las etiquetas', () => {
  // Regresión directa: cerrar las etiquetas DESPUÉS de llenar los 4096
  // producía trozos de 4100 y Telegram los rechazaba enteros. El corte tiene
  // que reservar el lugar del `</b>`.
  it('ningún trozo se pasa del límite, ni con anidamiento profundo', () => {
    const nucleo = 'preparo da reunião com o cliente '.repeat(300)
    const casos = [
      `<b>${nucleo}</b>`,
      `<b><i>${nucleo}</i></b>`,
      `<b><i><u><code>${nucleo}</code></u></i></b>`,
      `<blockquote><b>${nucleo}</b> e <i>${nucleo}</i></blockquote>`,
    ]
    for (const caso of casos) {
      for (const parte of trocear(caso)) {
        expect(parte.length).toBeLessThanOrEqual(MAX_CHARS)
      }
    }
  })

  it('aguanta límites chicos sin colgarse ni desbordar', () => {
    // Con un límite chico el cierre es una fracción grande del presupuesto: es
    // donde el reajuste tiene que funcionar de verdad.
    for (const limite of [16, 20, 32, 64, 128]) {
      const partes = trocear(`<b><i>${'palavra '.repeat(200)}</i></b>`, limite)
      expect(partes.length).toBeGreaterThan(1)
      for (const parte of partes) expect(parte.length).toBeLessThanOrEqual(limite)
    }
  })

  it('no pierde texto ni con etiquetas anidadas', () => {
    const semTags = (t: string): string => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const original = `<b><i>${'palavra '.repeat(900)}</i></b>`
    const juntas = trocear(original).map(semTags).join(' ').replace(/\s+/g, ' ').trim()
    expect(juntas).toBe(semTags(original))
  })
})
