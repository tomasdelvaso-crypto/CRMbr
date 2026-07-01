// api/lib/scoring.js
//
// Lógica pura de scoring PPVVCC usada por los endpoints serverless (assistant.js).
// Extraída para poder testearla de forma aislada.
//
// IMPORTANTE: mantener alineada con src/lib/scoring.ts.
// El test src/lib/scoring.consistency.test.ts verifica que el health score de
// ambos lados coincida para los mismos datos.
//
// Nota de contrato: calculateHealthScore devuelve un STRING con 1 decimal
// (ej. "7.4"), tal como lo consumen los call sites de assistant.js
// (mayormente vía parseFloat, y en topDeals como valor JSON). No cambiar el
// tipo de retorno sin revisar esos usos.

/** Normaliza el score de una escala (objeto {score}, número, o nulo). */
export function getScaleValue(scale) {
  if (!scale) return 0
  if (typeof scale === 'object' && scale.score !== undefined) return scale.score
  if (typeof scale === 'number') return scale
  return 0
}

/** Extrae la descripción de una escala, o string vacío. */
export function getScaleDescription(scale) {
  if (!scale) return ''
  if (typeof scale === 'object' && scale.description !== undefined) {
    return scale.description || ''
  }
  return ''
}

/**
 * Score de salud del deal: promedio de las 6 escalas PPVVCC con 1 decimal.
 * Acepta claves en portugués (dor/poder/...) o en inglés (pain/power/...).
 * Devuelve un STRING (ej. "7.4"); ver nota de contrato arriba.
 */
export function calculateHealthScore(scales) {
  if (!scales) return 0
  const values = [
    getScaleValue(scales.dor || scales.pain),
    getScaleValue(scales.poder || scales.power),
    getScaleValue(scales.visao || scales.vision),
    getScaleValue(scales.valor || scales.value),
    getScaleValue(scales.controle || scales.control),
    getScaleValue(scales.compras || scales.purchase),
  ]
  const sum = values.reduce((acc, val) => acc + val, 0)
  return values.length > 0 ? (sum / values.length).toFixed(1) : 0
}

/** Días transcurridos desde el último contacto. 999 si no hay fecha. */
export function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999
  const last = new Date(lastUpdate)
  const now = new Date()
  return Math.floor((now - last) / (1000 * 60 * 60 * 24))
}

/**
 * Probabilidad de cierre (0–100) en función del health score y los días sin
 * contacto. Extraído de analyzeOpportunity para poder testear los umbrales.
 */
export function calculateProbability(healthScore, daysSince) {
  let probability = 0
  if (healthScore >= 8) probability = 85
  else if (healthScore >= 7) probability = 70
  else if (healthScore >= 5) probability = 40
  else if (healthScore >= 3) probability = 20
  else probability = 5

  if (daysSince > 30) probability = Math.max(probability - 50, 5)
  else if (daysSince > 14) probability = Math.max(probability - 20, 10)
  else if (daysSince > 7) probability = Math.max(probability - 10, 15)

  return probability
}
