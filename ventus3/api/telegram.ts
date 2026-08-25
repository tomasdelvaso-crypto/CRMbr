// api/telegram.ts — Webhook de Telegram: ack <1s y encola.
// Comparte el dominio con el front por import relativo (../src/core), igual
// que el v2 comparte api/_lib/ppvvcc.js.

import type { ApiHandler } from './_lib/http.js'
import { handlePreflight, notImplemented } from './_lib/http.js'

const handler: ApiHandler = (req, res) => {
  if (handlePreflight(req, res)) return
  notImplemented(res, '/api/telegram')
}

export default handler
