// api/act.ts — o commit do propose-then-commit.
//
// Es la única puerta por la que una propuesta del Ventus se convierte en una
// escritura. Hace cuatro cosas, en este orden y sin excepciones:
//
//   1. AUTORIZA en TypeScript. El backend habla con Postgres como
//      `service_role`, que `ventus_actor()` traduce a `__service__` y para el
//      que `ventus_autorizado()` devuelve true SIEMPRE. Si la propiedad no se
//      comprueba acá, no se comprueba en ningún lado.
//   2. VALIDA STALENESS. El hash de precondición se recalcula contra el estado
//      actual. Si el registro cambió desde que el Ventus lo leyó, se rechaza
//      con 409 y se le pide una propuesta nueva. Un asistente que pisa un
//      cambio del vendedor pierde la confianza y no la recupera.
//   3. EJECUTA UNA SOLA VEZ. `idempotency_key` es UNIQUE y la transición
//      proposed → committed es condicional: el reintento del outbox devuelve
//      el mismo resultado con `idempotente: true`, no un segundo touchpoint.
//   4. AUDITA. Antes/después en `ventus_audit`, que es append-only por trigger
//      y por permisos. El chat NO es audit trail.
//
// Y devuelve el resultado VERIFICADO: lo que la base contestó, no lo que el
// cliente pidió.

import type { ApiHandler } from './_lib/http'
import { exigirMetodo, header, lerJson, pedidoInvalido, rota } from './_lib/http'
import { requireAuth } from './_lib/auth'
import { commitAcao, descartarAcao } from './_lib/propose'
import { checarCota } from './_lib/usage'

type MotivoDescarte = 'dado_errado' | 'ja_fiz' | 'nao_e_prioridade' | 'outro'

const MOTIVOS: readonly MotivoDescarte[] = ['dado_errado', 'ja_fiz', 'nao_e_prioridade', 'outro']

export interface ActRequest {
  acao: 'confirmar' | 'descartar'
  /** id de `public.ventus_actions`. */
  actionId: string
  /**
   * Campos editados antes de confirmar. Es lo que hace posible el
   * accept/edit/dismiss POR CAMPO de la Revisão: el vendedor corrige la fecha
   * y confirma el resto, sin tener que descartar la propuesta entera.
   */
  payload?: Record<string, unknown> | null
  motivo?: MotivoDescarte | null
}

export interface ActResponse {
  ok: true
  actionId: string
  acao: 'confirmar' | 'descartar'
  /** Lo que devolvió la ejecución. `idempotente: true` si ya estaba hecha. */
  resultado: Record<string, unknown> | null
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)
  await checarCota(ctx, 'act')

  const corpo = await lerJson<ActRequest>(req)
  const actionId = (corpo.actionId ?? '').trim()

  if (!RE_UUID.test(actionId)) {
    throw pedidoInvalido('Essa proposta não tem um identificador válido.', 'action_id_invalido')
  }

  if (corpo.acao === 'descartar') {
    const motivo = corpo.motivo ?? 'outro'
    if (!MOTIVOS.includes(motivo)) {
      throw pedidoInvalido(`Motivo desconhecido. Use um destes: ${MOTIVOS.join(', ')}.`, 'motivo_invalido')
    }
    await descartarAcao(actionId, ctx, motivo)
    const resposta: ActResponse = { ok: true, actionId, acao: 'descartar', resultado: null }
    res.status(200).json(resposta)
    return
  }

  if (corpo.acao !== 'confirmar') {
    throw pedidoInvalido('Ação desconhecida. Use "confirmar" ou "descartar".', 'acao_invalida')
  }

  // La clave de idempotencia del header es informativa: la de verdad ya está
  // en la fila (`idempotency_key` UNIQUE) y la ejecución es condicional al
  // estado 'proposed'. Se loguea para poder correlacionar reintentos.
  const chaveDoCliente = header(req, 'x-idempotency-key')
  if (chaveDoCliente) console.info(`[act] ${actionId} · idempotency ${chaveDoCliente}`)

  const resultado = await commitAcao(actionId, ctx, corpo.payload ?? null)

  const resposta: ActResponse = { ok: true, actionId, acao: 'confirmar', resultado }
  res.status(200).json(resposta)
}

export default rota('/api/act', handler)
