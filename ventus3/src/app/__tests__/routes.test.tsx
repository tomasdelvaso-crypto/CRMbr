// @vitest-environment jsdom
// src/app/__tests__/routes.test.tsx
//
// Smoke test del router. Un curl al dev server devuelve 200 para CUALQUIER
// ruta —es una SPA, siempre sirve el mismo index.html—, así que no prueba nada.
// Esto sí: monta cada ruta de verdad con React y falla si la pantalla explota,
// si el errorElement se activa o si el Shell no pinta.

import './setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../ThemeProvider'
import { routes } from '../routes'

/** Todas las rutas declaradas, aplanadas a rutas absolutas navegables. */
function caminhos(): string[] {
  const saida: string[] = []
  for (const rota of routes) {
    const base = rota.path ?? '/'
    if (base !== '/' || !rota.children) saida.push(base)
    for (const filho of rota.children ?? []) {
      if (filho.index === true) {
        saida.push('/')
        continue
      }
      if (typeof filho.path === 'string') {
        // Los parámetros se rellenan con un id plausible.
        saida.push(`/${filho.path}`.replace(':opportunityId', '46'))
      }
    }
  }
  return [...new Set(saida)]
}

let root: Root | null = null
let host: HTMLDivElement | null = null

/**
 * Monta con la MISMA composición que App.tsx. Ni el ThemeProvider ni el
 * QueryClientProvider son decorativos:
 *  · KitchenSink usa useTheme() y sin el provider la ruta cae en el
 *    errorElement — este test lo detectó.
 *  · toda pantalla enganchada a @/data usa hooks de TanStack Query y sin
 *    cliente lanza «No QueryClient set» contra el errorElement. El cliente es
 *    uno por montaje (nunca compartido) para que una ruta no herede el cache
 *    de otra, y sin persister: acá no se prueba Dexie.
 */
async function montar(children: ReactNode): Promise<string> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: 'offlineFirst' },
      mutations: { retry: false, networkMode: 'offlineFirst' },
    },
  })
  await act(async () => {
    criado.render(
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>,
    )
  })
  // Las pantallas son lazy(): el primer render devuelve el fallback de
  // Suspense y el módulo llega uno o más microtasks después. Sin esta espera
  // el test estaría mirando el esqueleto del chunk, o sea: nada. El fallback
  // de routes.tsx se marca con `data-rota-carregando`, que es SÓLO suyo (un
  // Skeleton normal dentro de una pantalla ya montada no lo lleva).
  // Se cede el turno con un macrotask, no con un microtask: resolver un
  // import() dinámico pasa por el loader de módulos y no alcanza con vaciar
  // la cola de promesas.
  //
  // La espera se mide en TIEMPO, no en vueltas. Antes eran 100 × 5 ms = 500 ms
  // fijos, y bajo la carga de la suite completa el chunk más pesado
  // (/registrar) a veces no llegaba a tiempo: el test fallaba de forma
  // intermitente, que es la peor clase de test — el que enseña al equipo a
  // ignorar el rojo. Aislado siempre pasaba, y eso mismo era la pista.
  const LIMITE_MS = 8_000
  const arranque = Date.now()
  while (host.innerHTML.includes('data-rota-carregando')) {
    if (Date.now() - arranque > LIMITE_MS) {
      throw new Error(
        `La pantalla no terminó de cargar en ${LIMITE_MS} ms: el chunk lazy nunca resolvió. ` +
          'Si pasa sólo en la suite completa es lentitud de la máquina; si pasa aislado, ' +
          'el import dinámico está roto.',
      )
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  return host.innerHTML
}

afterEach(() => {
  const atual = root
  if (atual) act(() => atual.unmount())
  host?.remove()
  root = null
  host = null
  // Los hosts de Toast/Confirm son portales a document.body.
  document.body.innerHTML = ''
})

describe('router', () => {
  it('declara las 17 rutas del plan sin duplicados', () => {
    const lista = caminhos()
    expect(lista).toContain('/')
    expect(lista).toContain('/carteira')
    expect(lista).toContain('/carteira/46')
    expect(lista).toContain('/golden')
    expect(lista).toContain('/kitchen')
    expect(lista).toContain('/login')
    expect(lista).toContain('/instalar')
    expect(new Set(lista).size).toBe(lista.length)
  })

  for (const caminho of caminhos()) {
    it(`monta ${caminho} sin activar el errorElement`, async () => {
      const router = createMemoryRouter(routes, { initialEntries: [caminho] })
      const html = await montar(<RouterProvider router={router} />)

      // El errorElement es RouteError: se reconoce por su role=alert.
      expect(html).not.toContain('role="alert"')
      expect(html).not.toContain('Algo deu errado')
      // Algo se pintó de verdad, no un contenedor vacío.
      expect(html.length).toBeGreaterThan(50)
      // Y es la pantalla de verdad, no el esqueleto esperando el chunk.
      expect(html).not.toContain('data-rota-carregando')
    }, 20_000)
  }

  it('las rutas del Shell traen la navegação principal; a Golden Hour não', async () => {
    const comNav = createMemoryRouter(routes, { initialEntries: ['/carteira'] })
    expect(await montar(<RouterProvider router={comNav} />)).toContain('Navegação principal')
  })

  it('a Golden Hour é modo foco: sem bottom nav', async () => {
    const foco = createMemoryRouter(routes, { initialEntries: ['/golden'] })
    expect(await montar(<RouterProvider router={foco} />)).not.toContain('Navegação principal')
  })
})
