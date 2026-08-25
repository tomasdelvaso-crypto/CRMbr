// api/health.ts — verificación de vida. Público y sin secretos.

import type { ApiHandler } from './_lib/http'
import { handlePreflight } from './_lib/http'

const handler: ApiHandler = (req, res) => {
  if (handlePreflight(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ok: true, service: 'ventus3', at: new Date().toISOString() })
}

export default handler
