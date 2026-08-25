// @vitest-environment jsdom
// src/screens/Hoje/__tests__/Hoje.test.tsx
//
// La tela Hoje montada de verdad: Dexie con datos, TanStack Query encima,
// router y sesión. Lo que se prueba acá no es que React renderice, es que las
// tres promesas del producto se cumplan en pantalla:
//
//   · exactamente 3 tarjetas, de 3 clientes distintos
//   · el chip «Por que isto?» despliega las señales con su peso
//   · resolver las 3 lleva a «Pronto por hoje» y NO trae otras tres

import '@/app/__tests__/setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, definirTransporte } from '@/data'
import { concluirAcaoDoDia, fetchPlanoFixado } from '@/data'
import { todayBr } from '@/core'
import { opp } from '@/core/__tests__/fixtures'
import { SessionContext, type SessionContextValue } from '@/app/session-context'
import HojeScreen from '../index'

const VENDOR = 'Renata'
const CLIENTES = ['Tetra Pak', 'Ambev', 'Natura', 'Suzano']

let db: VentusDatabase
let contador = 0
let root: Root | null = null
let host: HTMLDivElement | null = null

const sessao: SessionContextValue = {
  session: null,
  vendor: null,
  vendorName: VENDOR,
  isAdmin: false,
  loading: false,
  signOut: async () => {},
}

function montar(children: ReactNode): HTMLDivElement {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado
  act(() => {
    criado.render(
      <QueryClientProvider client={cliente}>
        <SessionContext.Provider value={sessao}>
          <MemoryRouter>{children}</MemoryRouter>
        </SessionContext.Provider>
      </QueryClientProvider>,
    )
  })
  return host
}

/**
 * Deja correr las queries de Dexie, que son asíncronas aunque sean locales.
 *
 * Espera a una CONDICIÓN, no a un reloj: un sleep fijo pasa en la máquina del
 * que lo escribió y falla en CI cuando el worker está cargado. Ese es el
 * mecanismo exacto por el que un test flaky termina siendo ignorado.
 */
async function assentar(pronto: () => boolean = () => true, limiteMs = 3000): Promise<void> {
  const ate = Date.now() + limiteMs
  for (;;) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    if (pronto() || Date.now() > ate) return
  }
}

/** La lista de las 3 tarjetas, o null mientras el plano no llegó. */
function listaDeAcoes(el: HTMLElement): Element | null {
  return el.querySelector('[aria-label="Suas 3 ações de hoje"] ul')
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-hoje-ui-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte({ enviar: async () => {} })

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
})

afterEach(async () => {
  const atual = root
  if (atual) await act(async () => atual.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

describe('tela Hoje', () => {
  it('mostra exatamente 3 cartões, de 3 clientes distintos', async () => {
    const el = montar(<HojeScreen />)
    await assentar(() => listaDeAcoes(el) !== null)

    expect(listaDeAcoes(el)?.children.length).toBe(3)

    const visiveis = CLIENTES.filter((c) => el.textContent?.includes(c))
    expect(visiveis).toHaveLength(3)
  })

  it('o chip «Por que isto?» abre a conta que o motor fez', async () => {
    const el = montar(<HojeScreen />)
    await assentar(() => el.textContent?.includes('Por que isto?') === true)

    expect(el.textContent).toContain('Por que isto?')
    expect(el.textContent).not.toContain('pontos de prioridade')

    const chip = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Por que isto?',
    )
    expect(chip).toBeDefined()
    await act(async () => {
      chip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(el.textContent).toContain('pontos de prioridade')
  })

  it('mostra o anel de Contato com a largada dotada de 2', async () => {
    const el = montar(<HojeScreen />)
    await assentar(() => el.querySelector('[aria-label="Contato"]') !== null)

    const anel = el.querySelector('[aria-label="Contato"]')
    expect(anel?.getAttribute('aria-valuenow')).toBe('2')
    expect(el.textContent).toContain('contatos de largada')
  })

  it('com as três resolvidas chega a «Pronto por hoje» e NÃO traz outras três', async () => {
    // Se resuelven fuera de la UI: lo que se prueba es que la pantalla lea el
    // estado congelado y no vuelva a pedirle tres nuevas al planner.
    const plano = await fetchPlanoFixado(VENDOR, todayBr())
    for (const item of plano.fixadas) {
      await concluirAcaoDoDia({ vendor: VENDOR, dia: todayBr(), acao: item.acao })
    }

    const el = montar(<HojeScreen />)
    await assentar(() => el.textContent?.includes('Pronto por hoje') === true)

    expect(el.textContent).toContain('Pronto por hoje')
    // Suzano quedó fuera del top y NO sube a reemplazar a nadie.
    expect(listaDeAcoes(el)?.children.length).toBe(3)
    expect(el.textContent).toContain('Amanhã o Ventus traz as próximas')
  })

  it('a fila completa vem fechada: abrir é uma decisão', async () => {
    const el = montar(<HojeScreen />)
    const achar = () =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Ver tudo ('))
    await assentar(() => achar() !== undefined)

    const botao = achar()
    expect(botao).toBeDefined()
    expect(botao?.getAttribute('aria-expanded')).toBe('false')
  })
})
