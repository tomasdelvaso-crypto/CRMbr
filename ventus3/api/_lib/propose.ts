// api/_lib/propose.ts
// El flujo propose → commit (M8). Es el corazón de que el Ventus escriba sin
// corromper el CRM.
//
// ══════════════════════════════════════════════════════════════════════════
// CONFIANZA GRADUADA — LAS TRES PUERTAS
// ══════════════════════════════════════════════════════════════════════════
//   alta   el cliente lo dijo TEXTUAL y hay cita → auto-commit con aviso.
//          Solo para tools reversibles y de bajo daño (TOOLS_AUTOCOMMIT).
//          Mover una escala o avanzar una etapa NUNCA auto-commitea, por más
//          textual que sea: son las dos cosas que corrompen el forecast de
//          todo el equipo, y las dos que M6/M10 existen para proteger.
//   media  es inferencia → va a `ventus_actions` con status 'proposed' y
//          aparece en la Revisão, aceptable/editable/descartable POR CAMPO.
//   baixa  el modelo está adivinando → NO se propone nada. Ventus pregunta.
//
// ══════════════════════════════════════════════════════════════════════════
// STALENESS E IDEMPOTENCIA
// ══════════════════════════════════════════════════════════════════════════
// El hash de precondición se toma AL PROPONER, contra el estado real de la
// fila (`ventus_precondition_hash` en Postgres, no un hash calculado acá con
// datos que el cliente mandó). Al confirmar, `ventus_commit_action` lo vuelve
// a calcular y rechaza si cambió. La `idempotency_key` es UNIQUE en la tabla:
// el reintento del outbox no duplica, y confirmar dos veces devuelve el mismo
// resultado con `idempotente: true`.
//
// Cuando `0003`/`0009` todavía no están aplicadas, `proporAcao` degrada a
// «propuesta efímera»: devuelve la propuesta con `actionId: null` para que la
// pantalla la muestre, y lo dice en el log. Lo que NO hace es fingir que
// escribió.

import { createHash, randomUUID } from 'node:crypto'
import type { Confianca, VentusActionKind, VentusEntityKind, VentusSurface } from '../../src/core'
import type { AuthContext } from './auth'
import { exigirPropriedade } from './auth'
import { HttpError } from './http'
import { serviceClient } from './supabase'
import { TOOLS_AUTOCOMMIT, TOOLS_LEITURA, TOOL_LABELS } from './tools'
import type { VentusTool } from './tools'

/* ══════════════════════════════════════════════════════════════════════════
   Mapeo tool → tipo de acción de la tabla
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `ventus_actions.tipo` no tiene CHECK (0003 lo dejó abierto a propósito),
 * pero `ventus_commit_action` solo despacha estos cinco. Una tool que mapea a
 * `null` se propone igual y se ejecuta por fuera de la RPC — hoy son las que
 * no escriben en el dominio (redigir_mensagem) o las que esperan una RPC que
 * todavía no existe.
 */
const TIPO_POR_TOOL: Readonly<Record<VentusTool, VentusActionKind | null>> = {
  ventus_registrar_atividade: 'registrar_atividade',
  ventus_definir_proxima_acao: 'criar_task',
  ventus_atualizar_escala: 'atualizar_escala',
  ventus_avancar_etapa: 'avancar_etapa',
  ventus_criar_touchpoint: 'registrar_touchpoint',
  ventus_converter_lead: 'converter_lead',
  ventus_marcar_commitment: 'marcar_commitment' as VentusActionKind,
  ventus_redigir_mensagem: null,
  ventus_adiar_acao: 'criar_task',
  ventus_registrar_sinal_comprador: 'registrar_sinal' as VentusActionKind,
  ventus_arquivar_lead: 'arquivar_lead',
  ventus_buscar_carteira: null,
  ventus_ler_oportunidade: null,
  ventus_agendar_lembrete: 'criar_task',
}

export function tipoDeAcao(tool: VentusTool): VentusActionKind | null {
  return TIPO_POR_TOOL[tool]
}

/* ══════════════════════════════════════════════════════════════════════════
   Proponer
   ══════════════════════════════════════════════════════════════════════════ */

export interface MudancaProposta {
  campo: string
  rotulo: string
  de: string | null
  para: string
}

export interface PedidoDeProposta {
  ctx: AuthContext
  tool: VentusTool
  /** Dueño de la fila que se va a tocar. Puede no ser el que propone (admin). */
  dono?: string | null
  entidade: { kind: VentusEntityKind; id: number | string } | null
  /** Argumentos ya resueltos a ids y validados. Es lo que ejecuta la RPC. */
  payload: Record<string, unknown>
  confianca: Confianca
  /** Frase imperativa en PT-BR: «Marcar visita na Tetra Pak para quinta». */
  resumo: string
  mudancas: readonly MudancaProposta[]
  /** Cita textual que la justifica. Sin cita, `alta` se degrada a `media`. */
  citacao?: string | null
  evidencia?: Record<string, unknown>
  superficie?: VentusSurface
  /** Idempotencia del turno; si no viene, se genera. */
  idempotencyKey?: string
}

export interface PropostaCriada {
  /** id de `ventus_actions`, o null si la tabla todavía no existe. */
  actionId: string | null
  tool: VentusTool
  resumo: string
  mudancas: readonly MudancaProposta[]
  confianca: Confianca
  citacao: string | null
  expiraEm: string
  precisaConfirmar: boolean
  /** Cuando se auto-commiteó, lo que devolvió la ejecución. */
  resultado: Record<string, unknown> | null
}

/** 48 h, igual que la bandeja de Revisão. */
export const VALIDADE_MS = 48 * 3600_000

/**
 * Degrada la confianza declarada por el modelo a la que se puede sostener.
 *
 * Un `alta` sin cita es una opinión con voz firme. La regla es del plano y no
 * es negociable: sin prueba textual no hay auto-commit.
 */
export function confiancaEfetiva(declarada: Confianca, citacao: string | null | undefined): Confianca {
  if (declarada === 'alta' && (!citacao || citacao.trim().length < 8)) return 'media'
  return declarada
}

export function podeAutoCommit(tool: VentusTool, confianca: Confianca): boolean {
  return confianca === 'alta' && TOOLS_AUTOCOMMIT.has(tool)
}

/** Hash del estado actual de la entidad, calculado EN Postgres. */
export async function hashDePrecondicao(
  kind: VentusEntityKind | null,
  id: number | string | null,
): Promise<string | null> {
  if (!kind || id === null) return null
  const { data, error } = await serviceClient().rpc('ventus_precondition_hash', {
    p_entity_kind: kind,
    p_entity_id: String(id),
  })
  if (error) {
    console.warn(`[propose] ventus_precondition_hash indisponível (${error.code}): sem staleness check`)
    return null
  }
  return (data as string | null) ?? null
}

/**
 * Hash local de respaldo. Solo se usa cuando la RPC no existe todavía: sirve
 * para detectar que el payload cambió entre proponer y confirmar, que es menos
 * que el staleness real pero no es nada.
 */
export function hashLocal(objeto: unknown): string {
  return createHash('sha256').update(JSON.stringify(objeto)).digest('hex').slice(0, 32)
}

export async function proporAcao(pedido: PedidoDeProposta): Promise<PropostaCriada> {
  const confianca = confiancaEfetiva(pedido.confianca, pedido.citacao)
  const expiraEm = new Date(Date.now() + VALIDADE_MS).toISOString()
  const idempotencyKey = pedido.idempotencyKey ?? randomUUID()
  const dono = pedido.dono ?? pedido.ctx.vendorName
  exigirPropriedade(pedido.ctx, dono)

  const base: PropostaCriada = {
    actionId: null,
    tool: pedido.tool,
    resumo: pedido.resumo,
    mudancas: pedido.mudancas,
    confianca,
    citacao: pedido.citacao ?? null,
    expiraEm,
    precisaConfirmar: !TOOLS_LEITURA.has(pedido.tool),
    resultado: null,
  }

  // Confianza baja: el Ventus pregunta, no propone. Se devuelve la forma para
  // que la pantalla pueda mostrar la duda, pero no se escribe fila ninguna.
  if (confianca === 'baixa') return base

  const hash = await hashDePrecondicao(pedido.entidade?.kind ?? null, pedido.entidade?.id ?? null)

  const { data, error } = await serviceClient()
    .from('ventus_actions')
    .insert({
      vendor: dono,
      vendor_id: pedido.ctx.vendorId,
      tipo: tipoDeAcao(pedido.tool) ?? pedido.tool,
      payload: pedido.payload,
      evidencia: {
        ...(pedido.evidencia ?? {}),
        citacao: pedido.citacao ?? null,
        tool: pedido.tool,
        rotulo: TOOL_LABELS[pedido.tool],
        mudancas: pedido.mudancas,
        payload_hash: hashLocal(pedido.payload),
      },
      confianca,
      // Si la RPC de hash no existe todavía, se guarda null y NO hay staleness
      // check: es preferible decirlo que fingir una huella con el payload, que
      // compararía dos cosas distintas y siempre daría «obsoleta».
      precondition_hash: hash,
      idempotency_key: idempotencyKey,
      status: 'proposed',
      entity_kind: pedido.entidade?.kind ?? null,
      entity_id: pedido.entidade ? String(pedido.entidade.id) : null,
      superficie: pedido.superficie ?? 'app',
      motivo: pedido.resumo,
      expires_at: expiraEm,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = ya existe una propuesta con esa idempotency_key. Es el reintento
    // haciendo su trabajo: se recupera la que ya está, no se crea otra.
    if (error.code === '23505') {
      const existente = await serviceClient()
        .from('ventus_actions')
        .select('id, status, resultado')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      const fila = existente.data as { id: string; status: string; resultado: Record<string, unknown> | null } | null
      if (fila) {
        return {
          ...base,
          actionId: fila.id,
          precisaConfirmar: fila.status === 'proposed',
          resultado: fila.resultado,
        }
      }
    }
    console.warn(`[propose] ventus_actions indisponível (${error.code} ${error.message}): proposta efêmera`)
    return base
  }

  const actionId = (data as { id: string }).id
  await auditar({
    actionId,
    actor: 'ventus',
    evento: 'proposed',
    entityKind: pedido.entidade?.kind ?? null,
    entityId: pedido.entidade ? String(pedido.entidade.id) : null,
    depois: pedido.payload,
    contexto: { tool: pedido.tool, confianca, vendor: dono },
  })

  const proposta: PropostaCriada = { ...base, actionId }

  if (podeAutoCommit(pedido.tool, confianca)) {
    const resultado = await commitAcao(actionId, pedido.ctx)
    return { ...proposta, precisaConfirmar: false, resultado }
  }

  return proposta
}

/* ══════════════════════════════════════════════════════════════════════════
   Confirmar
   ══════════════════════════════════════════════════════════════════════════ */

interface FilaDeAcao {
  id: string
  vendor: string
  status: string
  tipo: string
  payload: Record<string, unknown> | null
  entity_kind: string | null
  entity_id: string | null
  precondition_hash: string | null
  resultado: Record<string, unknown> | null
  expires_at: string
}

/** Traduce el SQLSTATE de la RPC a algo que la pantalla sabe pintar. */
function erroDeCommit(codigo: string | undefined, mensagem: string): HttpError {
  const texto = mensagem.toLowerCase()
  if (texto.includes('obsoleta')) {
    return new HttpError(
      409,
      'obsoleta',
      'Esse registro mudou depois que o Ventus propôs. Dá uma olhada e proponha de novo.',
      mensagem,
    )
  }
  if (texto.includes('expirou')) {
    return new HttpError(410, 'expirada', 'Essa proposta venceu. Peça uma nova ao Ventus.', mensagem)
  }
  switch (codigo) {
    case '42501':
      return new HttpError(403, 'sem_permissao', 'Isso está fora da sua carteira.', mensagem)
    case 'P0002':
      return new HttpError(404, 'nao_encontrada', 'Essa proposta não existe mais.', mensagem)
    case '23514':
      return new HttpError(
        422,
        'sem_prova',
        'Sem a citação do cliente o banco recusa mover a escala. Registre a frase primeiro.',
        mensagem,
      )
    case '55000':
      return new HttpError(409, 'estado_invalido', 'Essa proposta já foi resolvida.', mensagem)
    default:
      return new HttpError(500, 'commit_falhou', 'Não deu para executar agora. Tente de novo.', mensagem)
  }
}

/**
 * Los tipos que `ventus_commit_action` sabe despachar (0009).
 *
 * El resto se ejecuta acá en TS. No es una debilidad del diseño: la RPC cubre
 * lo que toca el forecast —etapa, escalas, cadencia, tareas—, que es donde el
 * gate y la regra da prova TIENEN que vivir en Postgres porque escriben cuatro
 * superficies distintas. Registrar una actividad o archivar un lead no tiene
 * gate que evadir, y meterlos en la RPC obligaría a una migración más por cada
 * tool nueva.
 */
const DESPACHA_RPC = new Set(['criar_task', 'atualizar_escala', 'avancar_etapa', 'registrar_touchpoint', 'promover_lead'])

/** Ejecuta en TS los tipos que la RPC no despacha. */
async function executarLocalmente(acao: FilaDeAcao, ctx: AuthContext): Promise<Record<string, unknown>> {
  const db = serviceClient()
  const p = acao.payload ?? {}
  const idNum = acao.entity_id !== null ? Number(acao.entity_id) : null

  switch (acao.tipo) {
    case 'registrar_atividade':
    case 'registrar_sinal': {
      if (idNum === null || Number.isNaN(idNum)) {
        throw new HttpError(422, 'sem_entidade', 'Essa proposta perdeu a referência do cliente.')
      }
      const { data, error } = await db
        .from('activities')
        .insert({
          opportunity_id: idNum,
          vendor: acao.vendor,
          activity_type: acao.tipo === 'registrar_sinal' ? 'note' : (p['activity_type'] ?? 'note'),
          description: p['description'] ?? p['resumo'] ?? '',
          result: p['result'] ?? null,
          methodology_code: p['methodology_code'] ?? null,
          next_action: p['next_action'] ?? null,
          next_action_date: p['next_action_date'] ?? null,
          source: 'ai_parsed',
          activity_date: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (error) throw erroDeCommit(error.code, error.message)
      return { ok: true, tipo: acao.tipo, activity_id: (data as { id: number }).id }
    }

    case 'converter_lead': {
      if (idNum === null) throw new HttpError(422, 'sem_entidade', 'Essa proposta perdeu a referência do lead.')
      const { data, error } = await db.rpc('converter_lead', {
        p_lead_id: idNum,
        p_name: p['name'] ?? null,
        p_value: p['value'] ?? null,
        p_product_line: p['product_line'] ?? null,
        p_client_uuid: p['client_uuid'] ?? null,
      })
      if (error) throw erroDeCommit(error.code, error.message)
      return (data as Record<string, unknown> | null) ?? { ok: true, tipo: acao.tipo }
    }

    case 'arquivar_lead': {
      if (idNum === null) throw new HttpError(422, 'sem_entidade', 'Essa proposta perdeu a referência do lead.')
      const reciclar = p['recycle_after']
      const { error } = await db
        .from('leads')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          recycle_after: typeof reciclar === 'string' ? reciclar : null,
        })
        .eq('id', idNum)
      if (error) throw erroDeCommit(error.code, error.message)
      return { ok: true, tipo: acao.tipo, lead_id: idNum }
    }

    case 'marcar_commitment': {
      // El id viaja en el payload, no en entity_id: ver el comentario en
      // api/ventus.ts, caso ventus_marcar_commitment.
      const commitmentId = Number(p['commitment_id'])
      if (!Number.isFinite(commitmentId)) {
        throw new HttpError(422, 'sem_entidade', 'Essa proposta perdeu a referência do compromisso.')
      }
      const { error } = await db
        .from('commitments')
        .update({
          status: p['status'] ?? 'done',
          verdict_notes: p['notas'] ?? null,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', commitmentId)
      if (error) throw erroDeCommit(error.code, error.message)
      return { ok: true, tipo: acao.tipo, commitment_id: commitmentId }
    }

    default:
      throw new HttpError(
        422,
        'tipo_desconhecido',
        'O Ventus propôs algo que este servidor ainda não sabe executar.',
        `tipo ${acao.tipo} (vendor ${ctx.vendorName})`,
      )
  }
}

/**
 * Ejecuta una propuesta. Valida propiedad acá (el backend usa `service_role`,
 * que en Postgres pasa como `__service__` y tiene permiso sobre todo — sin
 * esta comprobación en TS la autorización no existiría) y delega staleness e
 * idempotencia a `ventus_commit_action`.
 */
export async function commitAcao(
  actionId: string,
  ctx: AuthContext,
  payloadEditado?: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const db = serviceClient()

  const { data, error } = await db
    .from('ventus_actions')
    .select('id, vendor, status, tipo, payload, entity_kind, entity_id, precondition_hash, resultado, expires_at')
    .eq('id', actionId)
    .maybeSingle()

  if (error) throw erroDeCommit(error.code, error.message)
  const acao = data as FilaDeAcao | null
  if (!acao) throw new HttpError(404, 'nao_encontrada', 'Essa proposta não existe mais.')

  exigirPropriedade(ctx, acao.vendor)

  if (acao.status === 'committed') {
    return { ...(acao.resultado ?? {}), idempotente: true }
  }
  if (acao.status !== 'proposed') {
    throw new HttpError(409, 'estado_invalido', 'Essa proposta já foi resolvida.', `status ${acao.status}`)
  }

  // Aceptar POR CAMPO: la Revisão puede editar antes de confirmar. Se hace
  // ANTES del commit para que el staleness check corra sobre lo que se ejecuta.
  if (payloadEditado && Object.keys(payloadEditado).length > 0) {
    const { error: erroEdicao } = await db
      .from('ventus_actions')
      .update({ payload: { ...(acao.payload ?? {}), ...payloadEditado } })
      .eq('id', actionId)
      .eq('status', 'proposed')
    if (erroEdicao) throw erroDeCommit(erroEdicao.code, erroEdicao.message)
  }

  const payloadFinal = { ...(acao.payload ?? {}), ...(payloadEditado ?? {}) }

  if (DESPACHA_RPC.has(acao.tipo)) {
    // La RPC hace staleness + gate + evidencia + audit en UNA transacción.
    const { data: resultado, error: erroRpc } = await db.rpc('ventus_commit_action', { p_action_id: actionId })
    if (erroRpc) throw erroDeCommit(erroRpc.code, erroRpc.message)
    return (resultado as Record<string, unknown> | null) ?? { ok: true }
  }

  // ── Camino local: el staleness check hay que hacerlo a mano ──
  if (new Date(acao.expires_at).getTime() <= Date.now()) {
    await db.from('ventus_actions').update({ status: 'expired' }).eq('id', actionId).eq('status', 'proposed')
    throw new HttpError(410, 'expirada', 'Essa proposta venceu. Peça uma nova ao Ventus.')
  }
  if (acao.precondition_hash) {
    const atual = await hashDePrecondicao(acao.entity_kind as VentusEntityKind | null, acao.entity_id)
    if (atual !== null && atual !== acao.precondition_hash) {
      await db
        .from('ventus_actions')
        .update({ status: 'dismissed', dismissed_reason: 'dado_errado', dismissed_at: new Date().toISOString() })
        .eq('id', actionId)
        .eq('status', 'proposed')
      await auditar({
        actionId,
        actor: ctx.vendorName,
        evento: 'stale',
        entityKind: acao.entity_kind,
        entityId: acao.entity_id,
        antes: { hash_proposta: acao.precondition_hash },
        depois: { hash_atual: atual },
      })
      throw new HttpError(
        409,
        'obsoleta',
        'Esse registro mudou depois que o Ventus propôs. Dá uma olhada e proponha de novo.',
      )
    }
  }

  const resultado = await executarLocalmente({ ...acao, payload: payloadFinal }, ctx)

  // Idempotencia: solo la primera transición proposed→committed escribe.
  const { data: fechada, error: erroFecho } = await db
    .from('ventus_actions')
    .update({ status: 'committed', committed_at: new Date().toISOString(), resultado })
    .eq('id', actionId)
    .eq('status', 'proposed')
    .select('id')
  if (erroFecho) throw erroDeCommit(erroFecho.code, erroFecho.message)
  if ((fechada ?? []).length === 0) {
    // Otro request ganó la carrera. La ejecución local ya corrió, así que se
    // deja rastro: es preferible una línea de auditoría de más que un
    // duplicado silencioso sin explicación.
    console.warn(`[propose] corrida no commit de ${actionId}: já estava fechada`)
  }

  await auditar({
    actionId,
    actor: ctx.vendorName,
    evento: 'committed',
    entityKind: acao.entity_kind,
    entityId: acao.entity_id,
    depois: resultado,
    contexto: { tipo: acao.tipo, local: true },
  })

  return resultado
}

/** Descarta una propuesta con una de las tres razones fijas. */
export async function descartarAcao(
  actionId: string,
  ctx: AuthContext,
  motivo: 'dado_errado' | 'ja_fiz' | 'nao_e_prioridade' | 'outro',
): Promise<void> {
  const db = serviceClient()
  const { data, error } = await db
    .from('ventus_actions')
    .select('id, vendor, status, entity_kind, entity_id')
    .eq('id', actionId)
    .maybeSingle()
  if (error) throw erroDeCommit(error.code, error.message)
  const acao = data as Pick<FilaDeAcao, 'id' | 'vendor' | 'status' | 'entity_kind' | 'entity_id'> | null
  if (!acao) throw new HttpError(404, 'nao_encontrada', 'Essa proposta não existe mais.')
  exigirPropriedade(ctx, acao.vendor)
  if (acao.status !== 'proposed') return

  const { error: erroUpdate } = await db
    .from('ventus_actions')
    .update({ status: 'dismissed', dismissed_reason: motivo, dismissed_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('status', 'proposed')
  if (erroUpdate) throw erroDeCommit(erroUpdate.code, erroUpdate.message)

  await auditar({
    actionId,
    actor: ctx.vendorName,
    evento: 'dismissed',
    entityKind: acao.entity_kind,
    entityId: acao.entity_id,
    contexto: { motivo },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Auditoría
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaDeAuditoria {
  actionId?: string | null
  actor: string
  evento: 'proposed' | 'committed' | 'dismissed' | 'expired' | 'manual_write' | 'stale'
  entityKind?: string | null
  entityId?: string | null
  antes?: unknown
  depois?: unknown
  contexto?: Record<string, unknown>
}

/**
 * Escribe en `ventus_audit`. NUNCA lanza: perder una línea de auditoría es
 * malo, pero tirar abajo una escritura que ya ocurrió es peor — dejaría al
 * vendedor creyendo que falló algo que sí pasó.
 */
export async function auditar(entrada: EntradaDeAuditoria): Promise<void> {
  try {
    const { error } = await serviceClient()
      .from('ventus_audit')
      .insert({
        action_id: entrada.actionId ?? null,
        actor: entrada.actor,
        evento: entrada.evento,
        entity_kind: entrada.entityKind ?? null,
        entity_id: entrada.entityId ?? null,
        antes: entrada.antes ?? null,
        depois: entrada.depois ?? null,
        contexto: entrada.contexto ?? null,
      })
    if (error) console.error(`[audit] insert falhou: ${error.code} ${error.message}`)
  } catch (erro) {
    console.error('[audit] insert explodiu:', erro)
  }
}
