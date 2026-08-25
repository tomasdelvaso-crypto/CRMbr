// api/ventus.ts — Chat del agente, con streaming obligatorio.
// Comparte el dominio con el front por import relativo (../src/core), igual
// que el v2 comparte api/_lib/ppvvcc.js.

import type { ApiHandler } from './_lib/http'
import { handlePreflight, notImplemented } from './_lib/http'

const handler: ApiHandler = (req, res) => {
  if (handlePreflight(req, res)) return
  notImplemented(res, '/api/ventus')
}

export default handler
