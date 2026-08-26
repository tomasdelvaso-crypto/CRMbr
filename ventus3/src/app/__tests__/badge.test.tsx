// @vitest-environment jsdom
// src/app/__tests__/badge.test.tsx
//
// El badge del ícono cuenta LO QUE ESPERA UNA DECISIÓN: tarjetas del día sin
// resolver + propuestas del Ventus sin revisar. Nada más.
//
// Lo que este test fija y se rompió antes: había DOS escritores del badge —la
// bandeja de Revisão por un lado y el Shell por otro—, el último en correr
// ganaba y el número terminaba contando la mitad del trabajo. Acá se prueba la
// suma y se prueba que llegar a cero LIMPIA el badge en vez de pintar un «0»,
// que en el ícono se lee como una acusación.

import './setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VentusDatabase, _setDbParaTeste, chaveAcoesVentus, definirTransporte, gravarMeta } from '@/data'
import { opp } from '@/core/__tests__/fixtures'
import type { VentusAction } from '@/core'
import { SessionContext, type SessionContextValue } from '@/app/session-context'
import { Shell } from '../Shell'

const VENDOR = 'Renata'
const CLIENTES = ['Tetra Pak', 'Ambev', 'Natura', 'Suzano']

let db: VentusDatabase
let contador = 0
let root: Root | null = null
let caixa: HTMLDivElement | null = null

const postos: number[] = []
let limpezas = 0

const sessao: SessionContextValue = {
  // El Shell manda a /login sin sesión y el efecto del badge no llegaría a
  // correr con datos. Alcanza con un objeto: nada de acá lee sus campos.
  session: { user: { id: 'u1' } } as unknown as SessionContextValue['session'],
  vendor: null,
  vendorName: VENDOR,
  isAdmin: false,
  loading: false,
  vendorAusente: false,
  revalidarVendor: () => undefined,
  signOut: async () => {},
}

function daquiA(horas: number): string {
  return new Date(Date.now() + horas * 3_600_000).toISOString()
}

function proposta(id: string, entityId: number): VentusAction {
  return {
    id,
    vendor: VENDOR,
    vendor_id: null,
    tipo: 'criar_task',
    payload: { title: 'Ligar para o comprador', due_date: '2026-09-01' },
    evidencia: null,
    confianca: 'media',
    precondition_hash: null,
    idempotency_key: id,
    status: 'proposed',
    entity_kind: 'opportunity',
    entity_id: String(entityId),
    superficie: 'app',
    motivo: null,
    resultado: null,
    expires_at: daquiA(40),
    created_at: new Date().toISOString(),
    committed_at: null,
    dismissed_at: null,
    dismissed_reason: null,
  }
}

function montar(children: ReactNode): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  caixa = document.createElement('div')
  document.body.appendChild(caixa)
  const criado = createRoot(caixa)
  root = criado
  act(() => {
    criado.render(
      <QueryClientProvider client={cliente}>
        <SessionContext.Provider value={sessao}>
          <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
        </SessionContext.Provider>
      </QueryClientProvider>,
    )
  })
}

async function assentar(pronto: () => boolean, limiteMs = 3000): Promise<void> {
  const ate = Date.now() + limiteMs
  for (;;) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    if (pronto() || Date.now() > ate) return
  }
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-badge-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte({ enviar: async () => {} })

  postos.length = 0
  limpezas = 0
  Object.defineProperty(navigator, 'setAppBadge', {
    configurable: true,
    writable: true,
    value: (n?: number) => {
      postos.push(n ?? 0)
      return Promise.resolve()
    },
  })
  Object.defineProperty(navigator, 'clearAppBadge', {
    configurable: true,
    writable: true,
    value: () => {
      limpezas += 1
      return Promise.resolve()
    },
  })
})

afterEach(async () => {
  const atual = root
  if (atual) await act(async () => atual.unmount())
  caixa?.remove()
  root = null
  caixa = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

function palco(): ReactNode {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<div>conteúdo</div>} />
      </Route>
    </Routes>
  )
}

describe('badge do ícone', () => {
  it('soma as cartas do dia sem resolver e as propostas sem revisar', async () => {
    await db.opportunities.bulkPut(
      CLIENTES.map((cliente, i) =>
        opp({
          id: 100 + i,
          client: cliente,
          name: `Fechamento ${cliente}`,
          vendor: VENDOR,
          last_update: '2026-04-01T12:00:00Z',
          value: 90_000 + i * 1_000,
        }),
      ),
    )
    await gravarMeta(chaveAcoesVentus(VENDOR), [proposta('p-1', 100), proposta('p-2', 101)])

    montar(palco())
    // 3 tarjetas congeladas + 2 propuestas = 5. El día congela en 3 aunque la
    // carteira tenga 4 negocios: ese límite es del producto, no del badge.
    await assentar(() => postos.includes(5))

    expect(postos).toContain(5)
  })

  it('sem trabalho pendente o badge se apaga, não pinta um zero', async () => {
    montar(palco())
    await assentar(() => limpezas > 0)

    expect(limpezas).toBeGreaterThan(0)
    expect(postos).not.toContain(0)
  })
})
