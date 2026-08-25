// @vitest-environment jsdom
// src/app/__tests__/boot.test.tsx
//
// Que las rutas monten no prueba que la APP arranque: App.tsx compone tema,
// cache persistido en Dexie, sesión de Supabase, capa de datos y router, y ese
// orden es frágil por diseño (los mutation defaults tienen que registrarse
// antes de hidratar el cache, o las mutaciones offline no se reanudan nunca).
//
// Este test monta App entera contra fake-indexeddb y falla si algo de esa
// cadena revienta en el arranque.

import './setup-jsdom'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { App } from '../App'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  const atual = root
  if (atual) act(() => atual.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

it('App monta a composição inteira sem estourar', async () => {
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado

  await act(async () => {
    criado.render(<App />)
    // Deja correr la hidratación del cache persistido (Dexie) y el getSession.
    await Promise.resolve()
  })

  // Sin sesión, el arranque cae en la ruta '/' dentro del Shell.
  expect(host.innerHTML.length).toBeGreaterThan(50)
  expect(host.innerHTML).not.toContain('Algo deu errado')
  // El tema se aplicó al documento: ThemeProvider corrió.
  expect(document.documentElement.style.colorScheme).toMatch(/light|dark/)
})
