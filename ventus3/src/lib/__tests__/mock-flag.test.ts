// src/lib/__tests__/mock-flag.test.ts
// El latch del mock y el backoff del servidor.
//
// Esto existe por un bug de campo con nombre y fecha: primer test en un
// teléfono real, /api/ventus devolvió 500 durante unos minutos, y el aparato
// se quedó en modo local TODA la sesión con señal perfecta y el servidor ya
// sano. Cada test de acá abajo es una de las cosas que no puede volver a pasar.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  criarBandeiraDeMock,
  ESPERA_APOS_FALHA_MS,
  FALHAS_ANTES_DE_ESPERAR,
} from '../mock-flag'

/** localStorage de mentira: los tests corren en Node, sin DOM. */
function instalarLocalStorage(): Map<string, string> {
  const dados = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => dados.set(k, v),
      removeItem: (k: string) => dados.delete(k),
    },
  })
  return dados
}

let armazem: Map<string, string>

beforeEach(() => {
  armazem = instalarLocalStorage()
})

afterEach(() => {
  vi.useRealTimers()
})

function bandeira(valorDaEnv?: string) {
  return criarBandeiraDeMock({ valorDaEnv, chave: 'teste.mock' })
}

describe('latch permanente — só para 404/501', () => {
  it('um 501 (endpoint que não existe) liga o mock para o resto da sessão', () => {
    const b = bandeira()
    expect(b.modoMock()).toBe(false)
    b.ativarMockPorFallback()
    expect(b.modoMock()).toBe(true)
    expect(b.mockPorFallbackAtivo()).toBe(true)
  })

  it('um 500 NÃO liga o mock — nem depois de cinco seguidos', () => {
    const b = bandeira()
    for (let i = 0; i < 5; i += 1) b.registrarFalhaDoServidor()
    expect(b.modoMock()).toBe(false)
    expect(b.mockPorFallbackAtivo()).toBe(false)
  })

  it('a env em "off" desliga até o latch — um 501 tem que se ver como erro', () => {
    const b = bandeira('off')
    b.ativarMockPorFallback()
    expect(b.modoMock()).toBe(false)
  })
})

describe('backoff — a próxima pergunta sempre volta a tentar a API', () => {
  it('depois da PRIMEIRA falha, tenta de novo na hora', () => {
    const b = bandeira()
    b.registrarFalhaDoServidor(1_000)
    expect(b.podeTentarApi(1_001)).toBe(true)
  })

  it('depois da segunda falha seguida, espera um minuto antes de insistir', () => {
    const b = bandeira()
    b.registrarFalhaDoServidor(1_000)
    b.registrarFalhaDoServidor(2_000)
    expect(b.podeTentarApi(2_001)).toBe(false)
    expect(b.podeTentarApi(2_000 + ESPERA_APOS_FALHA_MS - 1)).toBe(false)
    expect(b.podeTentarApi(2_000 + ESPERA_APOS_FALHA_MS)).toBe(true)
  })

  it('o backoff NUNCA vira permanente: passado o minuto, tenta de novo sozinho', () => {
    const b = bandeira()
    for (let i = 0; i < 20; i += 1) b.registrarFalhaDoServidor(1_000)
    expect(b.podeTentarApi(1_000 + ESPERA_APOS_FALHA_MS)).toBe(true)
    // E o mock segue desligado: um servidor com problemas não é um mock.
    expect(b.modoMock()).toBe(false)
  })

  it('uma resposta boa apaga a racha inteira', () => {
    const b = bandeira()
    b.registrarFalhaDoServidor(1_000)
    b.registrarFalhaDoServidor(2_000)
    expect(b.podeTentarApi(2_001)).toBe(false)
    b.registrarSucesso()
    expect(b.podeTentarApi(2_002)).toBe(true)
    expect(b.servidorComProblemas()).toBe(false)
  })

  it('tolera exatamente FALHAS_ANTES_DE_ESPERAR falhas sem esperar', () => {
    const b = bandeira()
    for (let i = 0; i < FALHAS_ANTES_DE_ESPERAR - 1; i += 1) b.registrarFalhaDoServidor(1_000)
    expect(b.podeTentarApi(1_001)).toBe(true)
    b.registrarFalhaDoServidor(1_000)
    expect(b.podeTentarApi(1_001)).toBe(false)
  })

  it('marca «servidor com problemas» para a UI, sem tocar no mock', () => {
    const b = bandeira()
    expect(b.servidorComProblemas()).toBe(false)
    b.registrarFalhaDoServidor()
    expect(b.servidorComProblemas()).toBe(true)
    expect(b.modoMock()).toBe(false)
  })
})

describe('o interruptor do aparelho', () => {
  it('localStorage "off" desliga o mock mesmo com a env em "on"', () => {
    const b = bandeira('on')
    expect(b.modoMock()).toBe(true)
    armazem.set('teste.mock', 'off')
    expect(b.modoMock()).toBe(false)
  })

  it('localStorage "on" liga o mock sem rebuildar', () => {
    const b = bandeira()
    armazem.set('teste.mock', 'on')
    expect(b.modoMock()).toBe(true)
  })

  it('reiniciar() apaga latch e racha — é o botão de «tenta de novo agora»', () => {
    const b = bandeira()
    b.ativarMockPorFallback()
    b.registrarFalhaDoServidor(1_000)
    b.registrarFalhaDoServidor(2_000)
    b.reiniciar()
    expect(b.modoMock()).toBe(false)
    expect(b.podeTentarApi(2_001)).toBe(true)
  })

  it('não explode se localStorage lançar (Safari privado)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem() {
          throw new Error('SecurityError')
        },
      },
    })
    const b = bandeira()
    expect(b.modoMock()).toBe(false)
  })
})
