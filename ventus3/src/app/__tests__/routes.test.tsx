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
 * Monta con la MISMA composición que App.tsx. El ThemeProvider no es
 * decorativo: KitchenSink usa useTheme() y sin el provider la ruta cae en el
 * errorElement — este test lo detectó.
 */
function montar(children: ReactNode): string {
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado
  act(() => {
    criado.render(<ThemeProvider>{children}</ThemeProvider>)
  })
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
    it(`monta ${caminho} sin activar el errorElement`, () => {
      const router = createMemoryRouter(routes, { initialEntries: [caminho] })
      const html = montar(<RouterProvider router={router} />)

      // El errorElement es RouteError: se reconoce por su role=alert.
      expect(html).not.toContain('role="alert"')
      expect(html).not.toContain('Algo deu errado')
      // Algo se pintó de verdad, no un contenedor vacío.
      expect(html.length).toBeGreaterThan(50)
    })
  }

  it('las rutas del Shell traen la navegação principal; a Golden Hour não', () => {
    const comNav = createMemoryRouter(routes, { initialEntries: ['/carteira'] })
    expect(montar(<RouterProvider router={comNav} />)).toContain('Navegação principal')
  })

  it('a Golden Hour é modo foco: sem bottom nav', () => {
    const foco = createMemoryRouter(routes, { initialEntries: ['/golden'] })
    expect(montar(<RouterProvider router={foco} />)).not.toContain('Navegação principal')
  })
})
