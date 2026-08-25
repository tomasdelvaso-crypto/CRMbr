// e2e/desempenho.spec.ts
// Las dos mediciones que el producto promete y que se pueden verificar en un
// navegador de verdad:
//
//  1. LEER EL DÍA DE DEXIE. `fetchPlanoFixado()` hace UNA lectura de la
//     cartera y corre `rankDay()` encima. Es lo único que separa «abrí la app»
//     de «sé qué hago ahora», y tiene que costar menos que un parpadeo.
//  2. PINTAR LA TELA HOJE con el bundle ya cargado. Es el caso real de campo:
//     la app está instalada, el service worker tiene los chunks, y el vendedor
//     la abre en el galpón. Objetivo: por debajo de 100 ms.
//
// Lo que NO se mide acá es el arranque en frío con descarga: el dev server
// sirve cientos de módulos sin empaquetar y ese número no se parece en nada al
// de producción. Ese va aparte, contra el build, en scripts/medir-arranque.mjs.

import { expect, secaoDoDia, test } from './fixtures/app'

/** Mediana: una pasada lenta por el GC no puede definir el número. */
function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(orden.length / 2)
  if (orden.length % 2 === 1) return orden[meio] ?? 0
  return ((orden[meio - 1] ?? 0) + (orden[meio] ?? 0)) / 2
}

test.describe('Desempenho', () => {
  test('ler o dia de Dexie custa menos de 100 ms', async ({ app }, info) => {
    // El especificador va por parámetro y no como literal: '/src/data/…' lo
    // sirve Vite, no el disco, y TypeScript intentaría resolverlo.
    const amostras = await app.evaluate(async (modulo) => {
      const mod = (await import(/* @vite-ignore */ modulo)) as {
        fetchPlanoFixado: (vendor: string, hoje?: string) => Promise<{ fixadas: unknown[] }>
      }
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
        new Date(),
      )
      const medidas: number[] = []
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now()
        const plano = await mod.fetchPlanoFixado('Renata', hoje)
        medidas.push(performance.now() - t0)
        if (plano.fixadas.length !== 3) throw new Error('A semente não deu 3 cartões')
      }
      return medidas
    }, '/src/data/plano-do-dia.ts')

    const p50 = mediana(amostras)
    const pior = Math.max(...amostras)
    info.annotations.push({
      type: 'desempenho',
      description: `fetchPlanoFixado: mediana ${p50.toFixed(1)} ms · pior ${pior.toFixed(1)} ms · ${String(amostras.length)} amostras`,
    })
    console.log(
      `\n  ⏱  Ler o dia de Dexie — mediana ${p50.toFixed(1)} ms · pior ${pior.toFixed(1)} ms\n`,
    )

    expect(p50).toBeLessThan(100)
  })

  test('voltar para Hoje pinta os 3 cartões sem esperar a rede', async ({ app }, info) => {
    // Se navega por dentro del router: el bundle ya está, como en el teléfono
    // con la app instalada. Lo que se mide es Dexie + render, sin red.
    //
    // El techo de la aserción es 400 ms y NO es el objetivo del producto: acá
    // se corre en el dev server, sin minificar y con StrictMode renderizando
    // todo dos veces, y con hasta cuatro workers peleando por la CPU de la
    // misma máquina. Sirve para cazar una regresión de orden de magnitud —una
    // query por fila, un render en cascada—, no para certificar los 100 ms.
    // Los 100 ms se miden contra el build, en scripts/medir-arranque.mjs.
    const medidas: number[] = []
    for (let i = 0; i < 5; i++) {
      await app.getByRole('link', { name: 'Carteira' }).click()
      await expect(app.getByRole('heading', { level: 1 })).toHaveText('Carteira')

      const ms = await app.evaluate(async () => {
        const inicio = performance.now()
        const link = [...document.querySelectorAll('a')].find(
          (a) => a.getAttribute('href') === '/',
        )
        link?.click()
        await new Promise<void>((resolve) => {
          const pronto = (): boolean =>
            document.querySelector('section[aria-label*="ações de hoje"] > ul > li') !== null
          if (pronto()) {
            resolve()
            return
          }
          const obs = new MutationObserver(() => {
            if (pronto()) {
              obs.disconnect()
              resolve()
            }
          })
          obs.observe(document.body, { childList: true, subtree: true })
        })
        // Un frame más: hasta acá el nodo existe, pero todavía no se pintó.
        await new Promise((r) => requestAnimationFrame(r))
        return performance.now() - inicio
      })
      medidas.push(ms)
      await expect(secaoDoDia(app).locator('> ul > li')).toHaveCount(3)
    }

    const p50 = mediana(medidas)
    const pior = Math.max(...medidas)
    info.annotations.push({
      type: 'desempenho',
      description: `Hoje pintada: mediana ${p50.toFixed(1)} ms · pior ${pior.toFixed(1)} ms`,
    })
    console.log(
      `\n  ⏱  Pintar a tela Hoje (dev) — mediana ${p50.toFixed(1)} ms · pior ${pior.toFixed(1)} ms\n`,
    )

    expect(p50).toBeLessThan(400)
  })
})
