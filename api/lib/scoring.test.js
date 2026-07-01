import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getScaleValue,
  getScaleDescription,
  calculateHealthScore,
  getDaysSinceLastContact,
  calculateProbability,
} from './scoring.js'

describe('getScaleValue', () => {
  it('devuelve 0 para valores nulos', () => {
    expect(getScaleValue(null)).toBe(0)
    expect(getScaleValue(undefined)).toBe(0)
  })

  it('acepta objeto { score } o número suelto', () => {
    expect(getScaleValue({ score: 8 })).toBe(8)
    expect(getScaleValue(4)).toBe(4)
  })

  it('score 0 dentro de un objeto se respeta', () => {
    expect(getScaleValue({ score: 0 })).toBe(0)
  })
})

describe('getScaleDescription', () => {
  it('devuelve string vacío si no hay descripción', () => {
    expect(getScaleDescription(null)).toBe('')
    expect(getScaleDescription({ score: 5 })).toBe('')
    expect(getScaleDescription(5)).toBe('')
  })

  it('extrae la descripción de un objeto', () => {
    expect(getScaleDescription({ score: 5, description: 'cliente admite dor' })).toBe(
      'cliente admite dor',
    )
  })
})

describe('calculateHealthScore', () => {
  it('devuelve 0 si no hay escalas', () => {
    expect(calculateHealthScore(null)).toBe(0)
  })

  it('devuelve un string con 1 decimal (contrato del backend)', () => {
    const result = calculateHealthScore({
      dor: { score: 6 },
      poder: { score: 6 },
      visao: { score: 6 },
      valor: { score: 6 },
      controle: { score: 6 },
      compras: { score: 6 },
    })
    expect(result).toBe('6.0')
    expect(typeof result).toBe('string')
  })

  it('acepta claves en inglés (pain/power/...) como fallback', () => {
    const result = calculateHealthScore({
      pain: 10,
      power: 10,
      vision: 10,
      value: 10,
      control: 10,
      purchase: 10,
    })
    expect(result).toBe('10.0')
  })
})

describe('getDaysSinceLastContact', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve 999 si no hay fecha', () => {
    expect(getDaysSinceLastContact(null)).toBe(999)
    expect(getDaysSinceLastContact(undefined)).toBe(999)
  })

  it('cuenta los días transcurridos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
    expect(getDaysSinceLastContact('2026-06-21T12:00:00Z')).toBe(10)
    expect(getDaysSinceLastContact('2026-07-01T00:00:00Z')).toBe(0)
  })
})

describe('calculateProbability', () => {
  it('mapea el health score a los tramos base', () => {
    expect(calculateProbability(8, 0)).toBe(85)
    expect(calculateProbability(7, 0)).toBe(70)
    expect(calculateProbability(5, 0)).toBe(40)
    expect(calculateProbability(3, 0)).toBe(20)
    expect(calculateProbability(2, 0)).toBe(5)
  })

  it('respeta los bordes exactos de cada tramo', () => {
    expect(calculateProbability(7.9, 0)).toBe(70) // < 8
    expect(calculateProbability(6.9, 0)).toBe(40) // < 7
    expect(calculateProbability(4.9, 0)).toBe(20) // < 5
    expect(calculateProbability(2.9, 0)).toBe(5) // < 3
  })

  it('penaliza por días sin contacto con piso mínimo', () => {
    expect(calculateProbability(8, 31)).toBe(35) // 85 - 50
    expect(calculateProbability(8, 15)).toBe(65) // 85 - 20
    expect(calculateProbability(8, 8)).toBe(75) // 85 - 10
  })

  it('nunca baja del piso definido por cada tramo de penalización', () => {
    expect(calculateProbability(2, 31)).toBe(5) // max(5-50, 5)
    expect(calculateProbability(3, 15)).toBe(10) // max(20-20, 10)
    expect(calculateProbability(3, 8)).toBe(15) // max(20-10, 15) = 15
  })
})
