// src/lib/scoring.ts
//
// Lógica pura de scoring PPVVCC compartida por la UI del CRM.
// Extraída de CRMVentapel.tsx para poder testearla de forma aislada y evitar
// implementaciones divergentes del cálculo de salud del deal.
//
// IMPORTANTE: mantener esta lógica alineada con api/lib/scoring.js.
// El test src/lib/scoring.consistency.test.ts verifica que ambos lados
// produzcan el mismo health score para los mismos datos.

export interface Scale {
  score: number
  description: string
}

export interface Scales {
  dor: Scale
  poder: Scale
  visao: Scale
  valor: Scale
  controle: Scale
  compras: Scale
}

/** Escalas vacías (todas en 0, sin descripción). */
export const emptyScales = (): Scales => ({
  dor: { score: 0, description: '' },
  poder: { score: 0, description: '' },
  visao: { score: 0, description: '' },
  valor: { score: 0, description: '' },
  controle: { score: 0, description: '' },
  compras: { score: 0, description: '' },
})

/**
 * Normaliza el score de una escala que puede venir como:
 * objeto `{ score }`, número suelto, null o undefined.
 */
export const getScaleScore = (scale: Scale | number | undefined | null): number => {
  if (scale === null || scale === undefined) return 0
  if (typeof scale === 'number') return scale
  if (typeof scale === 'object' && 'score' in scale) {
    return typeof scale.score === 'number' ? scale.score : 0
  }
  return 0
}

/**
 * Score de salud del deal: promedio de las 6 escalas PPVVCC,
 * redondeado a 1 decimal (0–10). Devuelve 0 si no hay escalas.
 *
 * Nota: se redondea a 1 decimal (ej. 7.4) de forma unificada con el backend.
 */
export const calculateHealthScore = (scales: Scales | null | undefined): number => {
  if (!scales) return 0

  const scores = [
    getScaleScore(scales.dor),
    getScaleScore(scales.poder),
    getScaleScore(scales.visao),
    getScaleScore(scales.valor),
    getScaleScore(scales.controle),
    getScaleScore(scales.compras),
  ]

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return Math.round(avg * 10) / 10
}

/**
 * ¿Cumple la oportunidad los requisitos de escalas para la etapa dada?
 * Las etapas sin requisitos explícitos (1, 6, ...) devuelven true.
 */
export const checkStageRequirements = (
  opportunity: { scales?: Scales | null },
  stageId: number,
): boolean => {
  if (!opportunity.scales) return false

  const scales = opportunity.scales || emptyScales()

  switch (stageId) {
    case 2:
      return getScaleScore(scales.dor) >= 5 && getScaleScore(scales.poder) >= 4
    case 3:
      return getScaleScore(scales.visao) >= 5
    case 4:
      return getScaleScore(scales.valor) >= 6
    case 5:
      return getScaleScore(scales.controle) >= 7 && getScaleScore(scales.compras) >= 6
    default:
      return true
  }
}

/**
 * ¿Han pasado al menos `days` días desde `lastUpdate`?
 * Se apoya en la fecha actual del sistema.
 */
export const checkInactivity = (lastUpdate: string, days: number): boolean => {
  const lastUpdateDate = new Date(lastUpdate)
  const today = new Date()
  const diffTime = Math.abs(today.getTime() - lastUpdateDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays >= days
}
