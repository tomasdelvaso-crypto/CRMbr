// @vitest-environment jsdom
// src/app/__tests__/PerfilChip.test.tsx
//
// O reclamo real que originou este componente: o dono do produto entrou com
// seu usuário admin e não tinha como saber que era admin. Este teste fixa os
// TRÊS estados que o `PerfilChip` precisa distinguir — admin, vendedor comum
// e sessão sem vendedor ligado — porque confundir qualquer um deles de volta
// é como esse reclamo reaparece.

import './setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Vendor } from '@/core'
import { SessionContext, type SessionContextValue } from '../session-context'
import { PerfilChip } from '../PerfilChip'

const VENDEDOR: Vendor = {
  id: 4,
  name: 'Tomás',
  email: 'tripoll@ventapel.com',
  role: 'Admin',
  phone: null,
  is_admin: true,
  is_active: true,
  monthly_target: null,
  auth_user_id: null,
  auth_id: 'auth-4',
  telegram_id: null,
  telegram_username: null,
  created_at: '2026-01-05T12:00:00.000Z',
}

function sessaoDe(overrides: Partial<SessionContextValue> = {}): SessionContextValue {
  return {
    session: { user: { id: 'u1' } } as unknown as SessionContextValue['session'],
    vendor: VENDEDOR,
    vendorName: VENDEDOR.name,
    isAdmin: true,
    loading: false,
    vendorAusente: false,
    revalidarVendor: () => undefined,
    signOut: async () => undefined,
    ...overrides,
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function montar(children: ReactNode, sessao: SessionContextValue | null): string {
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado

  act(() => {
    criado.render(
      <MemoryRouter>
        {sessao ? (
          <SessionContext.Provider value={sessao}>{children}</SessionContext.Provider>
        ) : (
          children
        )}
      </MemoryRouter>,
    )
  })

  return host.innerHTML
}

afterEach(() => {
  const atual = root
  if (atual) act(() => atual.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

describe('PerfilChip', () => {
  it('admin: mostra nome, e-mail e o chip «Administrador»', () => {
    const html = montar(
      <PerfilChip tamanho="lg" comEmail />,
      sessaoDe({ isAdmin: true }),
    )
    expect(html).toContain('Tomás')
    expect(html).toContain('tripoll@ventapel.com')
    expect(html).toContain('Administrador')
    expect(html).not.toContain('>Vendedor<')
  })

  it('vendedor comum: mostra o chip «Vendedor», nunca «Administrador»', () => {
    const html = montar(
      <PerfilChip tamanho="lg" comEmail />,
      sessaoDe({ isAdmin: false, vendorName: 'Renata', vendor: { ...VENDEDOR, name: 'Renata', is_admin: false } }),
    )
    expect(html).toContain('Renata')
    expect(html).toContain('Vendedor')
    expect(html).not.toContain('Administrador')
  })

  it('sessão sem vendedor: avisa e não mostra chip de papel nenhum', () => {
    const html = montar(
      <PerfilChip tamanho="lg" comEmail />,
      sessaoDe({ vendor: null, vendorName: null }),
    )
    expect(html).toContain('Sessão sem vendedor')
    expect(html).toContain('Jordi')
    expect(html).not.toContain('Administrador')
    expect(html).not.toContain('>Vendedor<')
  })

  it('sem e-mail quando `comEmail` não é passado', () => {
    const html = montar(<PerfilChip tamanho="lg" />, sessaoDe())
    expect(html).toContain('Tomás')
    expect(html).not.toContain('tripoll@ventapel.com')
  })

  it('sem sessão (smoke test do router) não quebra: não pinta nada', () => {
    const html = montar(<PerfilChip />, null)
    expect(html).toBe('')
  })

  it('`link={false}` não navega: sem <a> por baixo', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    const criado = createRoot(host)
    root = criado
    act(() => {
      criado.render(
        <MemoryRouter>
          <SessionContext.Provider value={sessaoDe()}>
            <PerfilChip tamanho="lg" link={false} />
          </SessionContext.Provider>
        </MemoryRouter>,
      )
    })
    expect(host.querySelector('a')).toBeNull()
  })

  it('por padrão (rail) é um link acessível para «Mais», com o papel no aria-label', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    const criado = createRoot(host)
    root = criado
    act(() => {
      criado.render(
        <MemoryRouter>
          <SessionContext.Provider value={sessaoDe({ isAdmin: true })}>
            <PerfilChip />
          </SessionContext.Provider>
        </MemoryRouter>,
      )
    })
    const link = host.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/mais')
    expect(link?.getAttribute('aria-label')).toContain('Administrador')
  })
})
