// api/ventus/feedback.ts — o 👍/👎 de cada resposta do Ventus.
//
// Se guarda en `ventus_audit` (append-only) y no en una tabla nueva: es
// exactamente la trilha del agente, y las migraciones 0001-0010 todavía no
// fueron aplicadas — meter una tabla más en esa cola es bloquear la medición
// por una razón administrativa.
//
// Las tres razones del 👎 son FIJAS y no hay campo libre. Lo que se mide es la
// tasa por causa, y un texto libre no se agrega: 40 comentarios distintos no
// dicen si el problema es el prompt, el contexto o la ficha.

import { requireAuth } from '../_lib/auth'
import type { ApiHandler } from '../_lib/http'
import { exigirMetodo, lerJson, pedidoInvalido, rota } from '../_lib/http'
import { serviceClient } from '../_lib/supabase'

type FeedbackVoto = 'bom' | 'ruim'
type FeedbackMotivo = 'errado' | 'generico' | 'fora_de_contexto'

const VOTOS: readonly FeedbackVoto[] = ['bom', 'ruim']
const MOTIVOS: readonly FeedbackMotivo[] = ['errado', 'generico', 'fora_de_contexto']

export interface FeedbackRequest {
  vendor: string
  turnoId: string
  voto: FeedbackVoto
  motivo?: FeedbackMotivo | null
  opportunityId?: number | null
}

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)
  const corpo = await lerJson<FeedbackRequest>(req)

  if (!VOTOS.includes(corpo.voto)) {
    throw pedidoInvalido('Voto inválido. Use "bom" ou "ruim".', 'voto_invalido')
  }
  if (corpo.motivo && !MOTIVOS.includes(corpo.motivo)) {
    throw pedidoInvalido(`Motivo inválido. Use um destes: ${MOTIVOS.join(', ')}.`, 'motivo_invalido')
  }
  if (!corpo.turnoId) throw pedidoInvalido('Faltou o turno.', 'turno_invalido')

  const { error } = await serviceClient()
    .from('ventus_audit')
    .insert({
      actor: ctx.vendorName,
      evento: 'feedback',
      entity_kind: corpo.opportunityId ? 'opportunity' : null,
      entity_id: corpo.opportunityId ? String(corpo.opportunityId) : null,
      contexto: {
        turno: corpo.turnoId,
        voto: corpo.voto,
        motivo: corpo.motivo ?? null,
      },
    })

  if (error) {
    // El feedback no puede romperle la pantalla a nadie: se loguea y se
    // responde ok. Perder un voto es barato; un toast de error tras un 👍 es
    // la forma más rápida de que nadie vuelva a votar.
    console.error(`[feedback] insert falhou: ${error.code} ${error.message}`)
  }

  res.status(200).json({ ok: true })
}

export default rota('/api/ventus/feedback', handler)
