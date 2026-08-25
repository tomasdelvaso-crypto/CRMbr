// api/dispatch/_cron.ts
// Autenticación de los endpoints que dispara pg_cron. FAIL-CLOSED.
//
// El v2 hacía exactamente lo contrario: `/api/digest` seguía funcionando si
// faltaba `CRON_SECRET` (fail-OPEN), así que cualquiera con la URL podía
// disparar el digest del equipo entero. Acá, sin secreto configurado, el
// endpoint devuelve 500 y no ejecuta nada. Es preferible un job que no corre a
// un job que corre para cualquiera.

import { timingSafeEqual } from 'node:crypto'
import { requireEnv } from '../_lib/env'
import type { ApiRequest } from '../_lib/http'
import { header, naoAutorizado } from '../_lib/http'

/** Comparación en tiempo constante, tolerante a longitudes distintas. */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * Exige el secreto del cron. Lanza 401 si no coincide y `ErroDeConfiguracao`
 * (→ 500) si `CRON_SECRET` no está puesto: nunca deja pasar por omisión.
 */
export function exigirCron(req: ApiRequest): void {
  const esperado = requireEnv('CRON_SECRET')
  const bearer = header(req, 'authorization')
  const direto = header(req, 'x-cron-secret')
  const recebido =
    bearer !== undefined && bearer.toLowerCase().startsWith('bearer ')
      ? bearer.slice(7).trim()
      : (direto ?? '')

  if (recebido === '' || !igual(recebido, esperado)) {
    throw naoAutorizado('Chamada não autorizada.', 'CRON_SECRET inválido ou ausente')
  }
}
