import { describe, it, expect } from 'vitest'
import { calculateHealthScore as frontendHealth } from './scoring'
import { calculateHealthScore as apiHealth } from '../../api/lib/scoring.js'

// Este test es la red de seguridad contra la divergencia histórica del health
// score entre la UI (src/lib/scoring.ts) y el backend (api/lib/scoring.js).
// Ambos deben producir el MISMO valor numérico para los mismos datos.
// El backend devuelve string ("7.4") por contrato; lo comparamos vía Number().

const cases = [
  [0, 0, 0, 0, 0, 0],
  [6, 6, 6, 6, 6, 6],
  [10, 10, 10, 10, 10, 10],
  [8, 8, 8, 8, 6, 6], // 7.333 -> 7.3
  [8, 8, 8, 8, 8, 5], // 7.5
  [1, 2, 3, 4, 5, 6],
  [9, 7, 5, 3, 1, 0],
]

describe('consistencia del health score front/back', () => {
  it.each(cases)(
    'dor=%i poder=%i visao=%i valor=%i controle=%i compras=%i',
    (dor, poder, visao, valor, controle, compras) => {
      const frontScales = {
        dor: { score: dor, description: '' },
        poder: { score: poder, description: '' },
        visao: { score: visao, description: '' },
        valor: { score: valor, description: '' },
        controle: { score: controle, description: '' },
        compras: { score: compras, description: '' },
      }
      const apiScales = {
        dor: { score: dor },
        poder: { score: poder },
        visao: { score: visao },
        valor: { score: valor },
        controle: { score: controle },
        compras: { score: compras },
      }

      const front = frontendHealth(frontScales)
      const back = Number(apiHealth(apiScales))

      expect(front).toBe(back)
    },
  )
})
