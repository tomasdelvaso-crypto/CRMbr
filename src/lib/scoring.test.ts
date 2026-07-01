import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  emptyScales,
  getScaleScore,
  calculateHealthScore,
  checkStageRequirements,
  checkInactivity,
  type Scales,
} from './scoring'

// Helper: construye escalas a partir de 6 números en orden PPVVCC.
const scalesOf = (
  dor: number,
  poder: number,
  visao: number,
  valor: number,
  controle: number,
  compras: number,
): Scales => ({
  dor: { score: dor, description: '' },
  poder: { score: poder, description: '' },
  visao: { score: visao, description: '' },
  valor: { score: valor, description: '' },
  controle: { score: controle, description: '' },
  compras: { score: compras, description: '' },
})

describe('emptyScales', () => {
  it('devuelve las 6 escalas en 0 con descripción vacía', () => {
    const s = emptyScales()
    expect(Object.keys(s)).toEqual(['dor', 'poder', 'visao', 'valor', 'controle', 'compras'])
    for (const key of Object.keys(s) as (keyof Scales)[]) {
      expect(s[key]).toEqual({ score: 0, description: '' })
    }
  })

  it('devuelve un objeto nuevo en cada llamada (sin estado compartido)', () => {
    const a = emptyScales()
    a.dor.score = 9
    expect(emptyScales().dor.score).toBe(0)
  })
})

describe('getScaleScore', () => {
  it('devuelve 0 para null y undefined', () => {
    expect(getScaleScore(null)).toBe(0)
    expect(getScaleScore(undefined)).toBe(0)
  })

  it('acepta un número suelto', () => {
    expect(getScaleScore(7)).toBe(7)
    expect(getScaleScore(0)).toBe(0)
  })

  it('extrae score de un objeto { score }', () => {
    expect(getScaleScore({ score: 5, description: 'x' })).toBe(5)
  })

  it('devuelve 0 si el objeto no tiene score numérico', () => {
    // @ts-expect-error probando entrada malformada a propósito
    expect(getScaleScore({ score: 'alto', description: '' })).toBe(0)
    // @ts-expect-error objeto sin score
    expect(getScaleScore({ description: '' })).toBe(0)
  })
})

describe('calculateHealthScore', () => {
  it('devuelve 0 si no hay escalas', () => {
    expect(calculateHealthScore(null)).toBe(0)
    expect(calculateHealthScore(undefined)).toBe(0)
  })

  it('promedia las 6 escalas', () => {
    expect(calculateHealthScore(scalesOf(6, 6, 6, 6, 6, 6))).toBe(6)
    expect(calculateHealthScore(emptyScales())).toBe(0)
    expect(calculateHealthScore(scalesOf(10, 10, 10, 10, 10, 10))).toBe(10)
  })

  it('redondea a 1 decimal (opción B: no a entero)', () => {
    // suma 44 / 6 = 7.333... -> 7.3
    expect(calculateHealthScore(scalesOf(8, 8, 8, 8, 6, 6))).toBe(7.3)
    // suma 45 / 6 = 7.5 -> 7.5 (antes se mostraba 8 por Math.round)
    expect(calculateHealthScore(scalesOf(8, 8, 8, 8, 8, 5))).toBe(7.5)
  })
})

describe('checkStageRequirements', () => {
  it('devuelve false si la oportunidad no tiene escalas', () => {
    expect(checkStageRequirements({ scales: null }, 2)).toBe(false)
  })

  it('etapa 2 exige dor>=5 y poder>=4', () => {
    expect(checkStageRequirements({ scales: scalesOf(5, 4, 0, 0, 0, 0) }, 2)).toBe(true)
    expect(checkStageRequirements({ scales: scalesOf(4, 4, 0, 0, 0, 0) }, 2)).toBe(false)
    expect(checkStageRequirements({ scales: scalesOf(5, 3, 0, 0, 0, 0) }, 2)).toBe(false)
  })

  it('etapa 3 exige visao>=5', () => {
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 5, 0, 0, 0) }, 3)).toBe(true)
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 4, 0, 0, 0) }, 3)).toBe(false)
  })

  it('etapa 4 exige valor>=6', () => {
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 0, 6, 0, 0) }, 4)).toBe(true)
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 0, 5, 0, 0) }, 4)).toBe(false)
  })

  it('etapa 5 exige controle>=7 y compras>=6', () => {
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 0, 0, 7, 6) }, 5)).toBe(true)
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 0, 0, 6, 6) }, 5)).toBe(false)
    expect(checkStageRequirements({ scales: scalesOf(0, 0, 0, 0, 7, 5) }, 5)).toBe(false)
  })

  it('etapas sin requisitos (1, 6) devuelven true', () => {
    expect(checkStageRequirements({ scales: emptyScales() }, 1)).toBe(true)
    expect(checkStageRequirements({ scales: emptyScales() }, 6)).toBe(true)
  })
})

describe('checkInactivity', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('detecta inactividad cuando pasaron >= N días', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
    // hace 10 días
    expect(checkInactivity('2026-06-21T12:00:00Z', 7)).toBe(true)
    expect(checkInactivity('2026-06-21T12:00:00Z', 30)).toBe(false)
  })

  it('el mismo día no cuenta como inactivo para umbral de 7', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
    expect(checkInactivity('2026-07-01T10:00:00Z', 7)).toBe(false)
  })
})
