// api/act.ts — propose-then-commit: valida staleness y ejecuta con idempotency key.
// Comparte el dominio con el front por import relativo (../src/core), igual
// que el v2 comparte api/_lib/ppvvcc.js.

import type { ApiHandler } from './_lib/http'
import { handlePreflight, notImplemented } from './_lib/http'

const handler: ApiHandler = (req, res) => {
  if (handlePreflight(req, res)) return
  notImplemented(res, '/api/act')
}

export default handler
