// @vitest-environment jsdom
// src/screens/Dossie/__tests__/tela.test.tsx
//
// Smoke test de la ficha con datos REALES en Dexie. No prueba estilos: prueba
// que lo que el vendedor abre en el estacionamiento tenga las cuatro cosas que
// justifican la pantalla —el gate redactado, los dos números de saúde, el mapa
// de poder con sus huecos y el timeline con su badge de origen— y que la ficha
// pinte igual con datos pobres, que es como está la base hoy.

import '@/app/__tests__/setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste } from '@/data/db'
import { definirTransporte } from '@/data/outbox'
import { escalas, opp } from '@/core/__tests__/fixtures'
import DossieScreen from '../index'

const VENDOR = 'Renata'

let db: VentusDatabase
let contador = 0
let root: Root | null = null
let host: HTMLDivElement | null = null

async function montar(children: ReactNode): Promise<string> {
  host = document.createElement('div')
  document.body.appendChild(host)
  const criado = createRoot(host)
  root = criado
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'offlineFirst' } },
  })
  await act(async () => {
    criado.render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>)
  })
  // Un tick más: la query lee Dexie de forma asíncrona.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return host.innerHTML
}

function tela(id: number): ReactNode {
  return (
    <MemoryRouter initialEntries={[`/carteira/${String(id)}`]}>
      <Routes>
        <Route path="/carteira/:opportunityId" element={<DossieScreen />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-tela-dossie-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte({ enviar: async () => {} })
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

describe('a tela do dossiê', () => {
  it('pinta o gate redactado, os dois números e os buracos do mapa de poder', async () => {
    await db.opportunities.put(
      opp({
        id: 46,
        vendor: VENDOR,
        client: 'Tetra Pak',
        name: 'Fechamento com fita gomada',
        stage: 4,
        value: 120_000,
        sponsor: 'Marcelo Silva',
        power_sponsor: null,
        influencer: null,
        support_contact: null,
        scales: escalas({ dor: 6, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
      }),
    )
    await db.activities.put({
      uid: 'a-1',
      client_uuid: 'a-1',
      pendente: 0,
      id: 5001,
      opportunity_id: 46,
      vendor: VENDOR,
      created_at: '2026-08-20T13:00:00.000Z',
      activity_date: '2026-08-20',
      activity_type: 'meeting',
      description: 'Visita à planta de Monte Mor.',
      result: null,
      stage_at_time: null,
      methodology_code: '3B',
      ai_suggested_action: null,
      ai_suggested_scales: null,
      ai_confidence: null,
      next_action: null,
      next_action_date: null,
      next_action_done: null,
      source: 'ai_parsed',
    })

    const html = await montar(tela(46))

    // Nunca el errorElement, nunca un vacío mudo.
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('Fechamento com fita gomada')
    // El gate, redactado por el dominio.
    expect(html).toContain('VALOR ≥ 6')
    // Los dos números: verificado (0,0 sin prueba) y declarado (4,0).
    expect(html).toContain('verificada')
    expect(html).toContain('4,0 declarada')
    // El mapa de poder muestra los huecos, no los esconde.
    expect(html).toContain('Não mapeado')
    expect(html).toContain('Power Sponsor')
    // El timeline con su badge de origen: la nota vino dictada.
    expect(html).toContain('Visita à planta de Monte Mor.')
    expect(html).toContain('🎙')
  })

  it('com dados pobres oferece a ação em vez de dizer «sem dados»', async () => {
    await db.opportunities.put(
      opp({
        id: 47,
        vendor: VENDOR,
        client: 'Suzano',
        name: 'Piloto E-comfill',
        stage: 2,
        next_action: null,
        next_action_date: null,
        scales: escalas({ dor: 0, poder: 0, visao: 0, valor: 0, controle: 0, compras: 0 }),
      }),
    )

    const html = await montar(tela(47))

    expect(html).toContain('Sem próximo passo')
    expect(html).toContain('Definir próximo passo')
    expect(html).toContain('Nenhum registro ainda')
    expect(html).not.toContain('sem dados')
    // Sem histórico nem compromisso, a coluna VERIFICAR não tem com o que
    // sustentar uma segunda coluna ao lado da esquerda: cai numa só, na mesma
    // ordem DECIDIR → VERIFICAR que já usa o telefone. Ver §0-ter de ESTADO.md
    // («coluna direita vazia quilométrica»).
    expect(html).not.toContain('lg:grid-cols-2')
    expect(html).toContain('lg:space-y-6')
  })

  it('com histórico de verdade, o dossiê abre as duas colunas', async () => {
    await db.opportunities.put(
      opp({
        id: 48,
        vendor: VENDOR,
        client: 'Ambev',
        name: 'Expansão da linha 3',
        stage: 3,
        scales: escalas({ dor: 5, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
      }),
    )
    for (let i = 0; i < 3; i += 1) {
      await db.activities.put({
        uid: `hist-${String(i)}`,
        client_uuid: `hist-${String(i)}`,
        pendente: 0,
        id: 6000 + i,
        opportunity_id: 48,
        vendor: VENDOR,
        created_at: `2026-08-2${String(i)}T13:00:00.000Z`,
        activity_date: `2026-08-2${String(i)}`,
        activity_type: 'call',
        description: `Toque ${String(i)}`,
        result: null,
        stage_at_time: null,
        methodology_code: null,
        ai_suggested_action: null,
        ai_suggested_scales: null,
        ai_confidence: null,
        next_action: null,
        next_action_date: null,
        next_action_done: null,
        source: 'manual',
      })
    }

    const html = await montar(tela(48))
    expect(html).toContain('lg:grid-cols-2')
  })

  it('uma ficha que não está na carteira offline não quebra a rota', async () => {
    const html = await montar(tela(9999))
    expect(html).not.toContain('role="alert"')
    expect(html).toContain('Ficha não encontrada')
  })
})
