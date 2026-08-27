// @vitest-environment jsdom
// src/install/__tests__/atualizacao.test.ts
// Quién decide cuándo se recarga la app.
//
// Nos pasó tres veces en dos días: se despliega un arreglo, el teléfono ya
// instalado no toca el toast «Nova versão», y se queda con el bundle de antes
// PARA SIEMPRE. Con el bundle viejo /api/ventus y /api/ingest ni se alcanzaban
// y la app quedaba muda con el servidor sano.
//
// La regla que estos tests fijan:
//   · arranque en frío (antes del primer toque) → se aplica sola
//   · después del primer toque                  → toast, la persona decide
//   · una sola aplicación automática por pestaña (nada de bucle de recargas)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('política de atualização', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no arranque a frio aplica sozinha, sem toast', async () => {
    const mod = await import('../atualizacao')
    const toast = vi.fn()
    // Sem service worker no jsdom, aplicarAtualizacao() cai no reload direto.
    const recarregar = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: recarregar },
    })

    expect(mod.emArranqueFrio()).toBe(true)
    mod.atenderNovaVersao(toast)

    expect(toast).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(recarregar).toHaveBeenCalled()
    })
  })

  it('depois do primeiro toque, NUNCA aplica sozinha: oferece o toast', async () => {
    const mod = await import('../atualizacao')
    const toast = vi.fn()

    // O vendedor tocou a tela — pode estar ditando uma nota de 40 segundos.
    mod.marcarInteracao()
    expect(mod.emArranqueFrio()).toBe(false)

    mod.atenderNovaVersao(toast)
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('passada a janela de arranque, também é toast — mesmo sem ninguém tocar', async () => {
    const mod = await import('../atualizacao')
    const toast = vi.fn()
    const agora = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(agora + mod.JANELA_ARRANQUE_MS + 1)

    expect(mod.emArranqueFrio()).toBe(false)
    mod.atenderNovaVersao(toast)
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('aplica sozinha UMA vez por aba: sem isso, um SKIP_WAITING que falha vira um loop', async () => {
    const mod = await import('../atualizacao')
    const toast = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    })

    mod.atenderNovaVersao(toast)
    expect(toast).not.toHaveBeenCalled()

    // Segunda vez na MESMA aba (a recarga não pegou): já não se aplica sozinha.
    expect(mod.emArranqueFrio()).toBe(false)
    mod.atenderNovaVersao(toast)
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('ao voltar do background só reoferece depois de meia hora', async () => {
    const mod = await import('../atualizacao')
    const toast = vi.fn()
    mod.marcarInteracao()

    // Nunca se ofereceu nada: pode oferecer.
    expect(mod.deveReoferecer()).toBe(true)
    mod.atenderNovaVersao(toast)

    // Voltar dois minutos depois não repete o aviso.
    const agora = Date.now()
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora + 2 * 60_000)
    expect(mod.deveReoferecer()).toBe(false)

    // Meia hora depois, sim: é o que impede um telefone preso a um bundle velho.
    relogio.mockReturnValue(agora + mod.ESPERA_PARA_REOFERECER_MS)
    expect(mod.deveReoferecer()).toBe(true)
  })
})
