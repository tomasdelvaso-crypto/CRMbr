// @vitest-environment jsdom
// src/app/__tests__/sessao-sem-vendedor.test.tsx
//
// El estado terminal de una cuenta mal dada de alta: hay sessão de auth, mas
// `resolverVendorDaSessao` voltou null. Antes desta guardia, cada pantalla
// vivia esse limbo à sua maneira — a maioria nem vivia. Este teste fixa que
// o Shell corta ISSO uma vez, para QUALQUER rota, com uma saída de verdade.

import './setup-jsdom'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionContext, type SessionContextValue } from '../session-context'
import { Shell } from '../Shell'

let root: Root | null = null
let host: HTMLDivElement | null = null

function sessaoDe(overrides: Partial<SessionContextValue> = {}): SessionContextValue {
  return {
    session: { user: { id: 'u1' } } as unknown as SessionContextValue['session'],
    vendor: null,
    vendorName: null,
    isAdmin: false,
    loading: false,
    vendorAusente: true,
    revalidarVendor: () => undefined,
    signOut: async () => undefined,
    ...overrides,
  }
}

function montar(sessao: SessionContextValue, rota = '/'): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado
  act(() => {
    criado.render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={sessao}>
          <MemoryRouter initialEntries={[rota]}>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<div>conteúdo do Hoje</div>} />
                <Route path="ajustes" element={<div>conteúdo do Ajustes</div>} />
              </Route>
              <Route path="/login" element={<div>tela de login</div>} />
            </Routes>
          </MemoryRouter>
        </SessionContext.Provider>
      </QueryClientProvider>,
    )
  })
}

afterEach(() => {
  const atual = root
  if (atual) act(() => atual.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

describe('sessão sem vendedor', () => {
  it('corta QUALQUER rota com a mesma tela, e não a tela real por baixo', () => {
    montar(sessaoDe(), '/ajustes')
    const html = host?.innerHTML ?? ''
    expect(html).toContain('nome de vendedor')
    expect(html).toContain('Tentar de novo')
    expect(html).toContain('Sair da conta')
    expect(html).not.toContain('conteúdo do Ajustes')
  })

  it('mantém a bottom nav: a saída não fica encerrada', () => {
    montar(sessaoDe())
    expect(host?.innerHTML ?? '').toContain('Navegação principal')
  })

  it('«Tentar de novo» chama revalidarVendor', () => {
    const revalidar = vi.fn()
    montar(sessaoDe({ revalidarVendor: revalidar }))
    const botao = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'Tentar de novo',
    )
    expect(botao).toBeDefined()
    act(() => botao?.click())
    expect(revalidar).toHaveBeenCalledTimes(1)
  })

  it('«Sair da conta» pede confirmação e, ao confirmar, chama signOut e vai a /login', async () => {
    const signOut = vi.fn(async () => undefined)
    montar(sessaoDe({ signOut }))

    const sair = Array.from(host?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent === 'Sair da conta',
    )
    expect(sair).toBeDefined()
    act(() => sair?.click())

    // El Confirm es un portal a document.body: se busca ahí, no en `host`.
    const confirmar = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Sair',
    )
    expect(confirmar).toBeDefined()
    await act(async () => {
      confirmar?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(signOut).toHaveBeenCalledTimes(1)
    expect(host?.innerHTML ?? '').toContain('tela de login')
  })
})
