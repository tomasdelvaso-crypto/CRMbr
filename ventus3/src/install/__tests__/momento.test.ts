// src/install/__tests__/momento.test.ts
// El «cuándo ofrecer instalar» es la parte del flujo que no se puede probar a
// mano: hay que esperar días, o tres sesiones, o siete días de silencio.
// Por eso la lógica es pura y el reloj entra por parámetro.

import { describe, expect, it } from 'vitest'
import {
  DISPENSAS_MAXIMAS,
  ESPERA_APOS_DISPENSA_MS,
  JANELA_DE_SESSAO_MS,
  MEMORIA_VAZIA,
  SEGUNDOS_MINIMOS,
  SESSOES_MINIMAS,
  deveOferecer,
  esperaAteOferecer,
  normalizarMemoria,
  registrarDispensa,
  registrarSessao,
  rotaAceitaConvite,
  type MemoriaDeConvite,
} from '../momento'

const AGORA = 1_800_000_000_000

/** Memoria de alguien que ya usó la app lo suficiente. */
function memoriaMadura(): MemoriaDeConvite {
  return { sessoes: SESSOES_MINIMAS, ultimaSessaoEm: AGORA, dispensas: 0, dispensadoEm: 0 }
}

const CONTEXTO_OK = {
  segundosNaSessao: SEGUNDOS_MINIMOS,
  temOQueOferecer: true,
  instalado: false,
}

describe('registrarSessao', () => {
  it('cuenta una sesión nueva en el primer arranque', () => {
    expect(registrarSessao(MEMORIA_VAZIA, AGORA).sessoes).toBe(1)
  })

  it('no cuenta dos veces una recarga dentro de la ventana', () => {
    const primera = registrarSessao(MEMORIA_VAZIA, AGORA)
    const recarga = registrarSessao(primera, AGORA + JANELA_DE_SESSAO_MS - 1)
    expect(recarga.sessoes).toBe(1)
    expect(recarga.ultimaSessaoEm).toBe(AGORA + JANELA_DE_SESSAO_MS - 1)
  })

  it('cuenta de nuevo pasada la ventana', () => {
    const primera = registrarSessao(MEMORIA_VAZIA, AGORA)
    expect(registrarSessao(primera, AGORA + JANELA_DE_SESSAO_MS + 1).sessoes).toBe(2)
  })

  it('no muta la memoria que recibe', () => {
    const antes = { ...MEMORIA_VAZIA }
    registrarSessao(antes, AGORA)
    expect(antes).toEqual(MEMORIA_VAZIA)
  })
})

describe('deveOferecer', () => {
  it('ofrece cuando se cumplen sesiones y tiempo adentro', () => {
    expect(deveOferecer(memoriaMadura(), AGORA, CONTEXTO_OK)).toBe(true)
  })

  it('nunca ofrece si ya está instalada', () => {
    expect(deveOferecer(memoriaMadura(), AGORA, { ...CONTEXTO_OK, instalado: true })).toBe(false)
  })

  it('no ofrece antes de la tercera sesión', () => {
    const nueva = { ...memoriaMadura(), sessoes: SESSOES_MINIMAS - 1 }
    expect(deveOferecer(nueva, AGORA, CONTEXTO_OK)).toBe(false)
  })

  it('no interrumpe en los primeros segundos', () => {
    expect(deveOferecer(memoriaMadura(), AGORA, { ...CONTEXTO_OK, segundosNaSessao: 2 })).toBe(false)
  })

  it('respeta los siete días de silencio después de un «agora não»', () => {
    const dispensada = registrarDispensa(memoriaMadura(), AGORA)
    expect(deveOferecer(dispensada, AGORA + ESPERA_APOS_DISPENSA_MS - 1000, CONTEXTO_OK)).toBe(false)
    expect(deveOferecer(dispensada, AGORA + ESPERA_APOS_DISPENSA_MS + 1000, CONTEXTO_OK)).toBe(true)
  })

  it('deja de preguntar después de tres negativas', () => {
    let memoria = memoriaMadura()
    for (let i = 0; i < DISPENSAS_MAXIMAS; i += 1) memoria = registrarDispensa(memoria, AGORA)
    const muyDespues = AGORA + 10 * ESPERA_APOS_DISPENSA_MS
    expect(deveOferecer(memoria, muyDespues, CONTEXTO_OK)).toBe(false)
  })

  it('no ofrece si no hay nada que ofrecer', () => {
    expect(deveOferecer(memoriaMadura(), AGORA, { ...CONTEXTO_OK, temOQueOferecer: false })).toBe(
      false,
    )
  })
})

describe('esperaAteOferecer', () => {
  it('devuelve lo que falta para cumplir los segundos mínimos', () => {
    const espera = esperaAteOferecer(memoriaMadura(), AGORA, {
      ...CONTEXTO_OK,
      segundosNaSessao: SEGUNDOS_MINIMOS - 30,
    })
    expect(espera).toBe(30_000)
  })

  it('devuelve 0 cuando ya se cumplió el tiempo', () => {
    expect(esperaAteOferecer(memoriaMadura(), AGORA, CONTEXTO_OK)).toBe(0)
  })

  it('devuelve null cuando hoy no va a pasar', () => {
    const nueva = { ...memoriaMadura(), sessoes: 1 }
    expect(esperaAteOferecer(nueva, AGORA, CONTEXTO_OK)).toBeNull()
  })
})

describe('rotaAceitaConvite', () => {
  it('no interrumpe la Golden Hour', () => {
    expect(rotaAceitaConvite('/golden')).toBe(false)
    expect(rotaAceitaConvite('/golden/3')).toBe(false)
  })

  it('no aparece en login, instalar ni registrar', () => {
    expect(rotaAceitaConvite('/login')).toBe(false)
    expect(rotaAceitaConvite('/instalar')).toBe(false)
    expect(rotaAceitaConvite('/registrar')).toBe(false)
  })

  it('sí en las pantallas de trabajo', () => {
    expect(rotaAceitaConvite('/')).toBe(true)
    expect(rotaAceitaConvite('/carteira')).toBe(true)
    expect(rotaAceitaConvite('/carteira/46')).toBe(true)
  })
})

describe('normalizarMemoria', () => {
  it('sobrevive a basura en localStorage', () => {
    expect(normalizarMemoria(null)).toEqual(MEMORIA_VAZIA)
    expect(normalizarMemoria('nada')).toEqual(MEMORIA_VAZIA)
    expect(normalizarMemoria({ sessoes: 'muchas' })).toEqual(MEMORIA_VAZIA)
    expect(normalizarMemoria({ sessoes: Number.NaN })).toEqual(MEMORIA_VAZIA)
  })

  it('conserva lo que sí es válido', () => {
    expect(normalizarMemoria({ sessoes: 4, dispensadoEm: AGORA })).toEqual({
      sessoes: 4,
      ultimaSessaoEm: 0,
      dispensas: 0,
      dispensadoEm: AGORA,
    })
  })
})
