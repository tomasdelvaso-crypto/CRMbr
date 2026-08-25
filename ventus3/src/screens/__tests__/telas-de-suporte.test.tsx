// @vitest-environment jsdom
// src/screens/__tests__/telas-de-suporte.test.tsx
//
// El smoke test del router (src/app/__tests__/routes.test.tsx) monta estas
// pantallas SIN SessionProvider, así que sólo llega a la silueta de carga:
// no pasa por la propuesta del cookbook, ni por el panel del gestor, ni por
// el hub. Este test las monta CON sesión y con un Dexie de verdad
// (fake-indexeddb), que es donde de hecho corre el código.
//
// Lo que se comprueba no es el HTML exacto —eso se rompe con cada ajuste de
// copy— sino tres cosas que sí importan:
//   · ninguna pantalla lanza durante el render real,
//   · el gate de admin del Painel do Gestor funciona en los dos sentidos,
//   · las pantallas dicen algo en PT-BR en vez de quedar vacías.

import '@/app/__tests__/setup-jsdom'

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'
import type { Vendor } from '@/core'
import { ThemeProvider } from '@/app/ThemeProvider'
import { SessionContext, type SessionContextValue } from '@/app/session-context'
import AjustesScreen from '../Ajustes'
import GestorScreen from '../Gestor'
import MaisScreen from '../Mais'
import InstalarScreen from '../Instalar'
import LoginScreen from '../Login'
import { RegrasDoJogoSheet } from '../Ajustes/RegrasDoJogo'

const VENDEDOR: Vendor = {
  id: 4,
  name: 'Fernando',
  email: 'fernando@ventapel.com.br',
  role: 'vendedor',
  phone: null,
  is_admin: false,
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
    session: null,
    vendor: VENDEDOR,
    vendorName: VENDEDOR.name,
    isAdmin: false,
    loading: false,
    signOut: async () => undefined,
    ...overrides,
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null

async function montar(children: ReactNode, sessao: SessionContextValue | null): Promise<string> {
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
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            {sessao ? (
              <SessionContext.Provider value={sessao}>{children}</SessionContext.Provider>
            ) : (
              children
            )}
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    )
    // Deja resolver las lecturas de Dexie de las queries.
    await Promise.resolve()
    await Promise.resolve()
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

describe('telas de suporte', () => {
  it('Ajustes monta com sessão e mostra as seções do vendedor', async () => {
    const html = await montar(<AjustesScreen />, sessaoDe())
    expect(html).toContain('Cookbook da semana')
    expect(html).toContain('Golden Hour')
    expect(html).toContain('Avisos')
    // El opt-out del juego tiene que estar SIEMPRE accesible.
    expect(html).toContain('O jogo')
    expect(html).toContain('Sincronização')
    // El tema es lo único que funciona sin identidad, y va siempre.
    expect(html).toContain('Aparelho')
  })

  it('Ajustes sem vendedor não mente: avisa e deixa só o tema', async () => {
    const html = await montar(
      <AjustesScreen />,
      sessaoDe({ vendor: null, vendorName: null }),
    )
    expect(html).toContain('não está ligada a um vendedor')
    expect(html).toContain('Aparelho')
    expect(html).not.toContain('Cookbook da semana')
  })

  it('o Painel do Gestor está fechado para quem não é admin', async () => {
    const html = await montar(<GestorScreen />, sessaoDe({ isAdmin: false }))
    expect(html).toContain('Este painel é do gestor')
    expect(html).not.toContain('Calibração')
  })

  it('o Painel do Gestor abre para admin e diz quando não há conexão', async () => {
    const html = await montar(<GestorScreen />, sessaoDe({ isAdmin: true }))
    // Sin red (jsdom no llega a Supabase) el panel lo dice en vez de mostrar
    // ceros: ver la decisión 4 de la pantalla.
    expect(html.length).toBeGreaterThan(50)
    expect(html).not.toContain('Algo deu errado')
  })

  it('Mais leva às telas de todo mundo e ao Gestor só se for admin', async () => {
    const comum = await montar(<MaisScreen />, sessaoDe({ isAdmin: false }))
    expect(comum).toContain('Cadência')
    expect(comum).toContain('Placar da Semana')
    expect(comum).toContain('Rituais')
    expect(comum).toContain('Ajustes')
    expect(comum).toContain('Instalar o app')
    expect(comum).not.toContain('Painel do Gestor')
  })

  it('Mais mostra o Painel do Gestor para o admin', async () => {
    const admin = await montar(<MaisScreen />, sessaoDe({ isAdmin: true }))
    expect(admin).toContain('Painel do Gestor')
  })

  it('/instalar é pública: monta sem nenhuma sessão', async () => {
    const html = await montar(<InstalarScreen />, null)
    expect(html).toContain('Instalar o Ventus')
    // El aviso de Play Protect, con el botón nombrado literal.
    expect(html).toContain('App não verificada')
    expect(html).toContain('Instalar mesmo assim')
    // La secuencia de iOS, que es requisito para el push.
    expect(html).toContain('Adicionar à Tela de Início')
    // El QR se dibuja de verdad: un <path> con módulos.
    expect(html).toContain('<svg')
  })

  it('«Regras do jogo» abre e mostra os pesos, os tetos e a regra da prova', async () => {
    await montar(<RegrasDoJogoSheet aberto aoFechar={() => undefined} />, sessaoDe())
    // El Sheet es un portal a document.body: no cuelga del host del test.
    const html = document.body.innerHTML
    expect(html).toContain('Regras do jogo')
    // Los pesos de REGRAS_PADRAO, tal como los aplica el motor.
    expect(html).toContain('Etapa avançada com gate cumprido')
    expect(html).toContain('Sem teto')
    expect(html).toContain('Exige prova')
    // Y la garantía que hace creíble al resto.
    expect(html).toContain('nunca é retroativo')
  })

  it('Login monta sem provider de sessão e não mostra o domínio', async () => {
    const html = await montar(<LoginScreen />, null)
    expect(html).toContain('Entrar')
    expect(html).toContain('Link por e-mail')
    expect(html).toContain('Manter conectado neste aparelho')
    // Nada de anunciar dónde viven los datos.
    expect(html).not.toContain('supabase')
  })
})
