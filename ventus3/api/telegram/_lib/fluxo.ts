// api/telegram/_lib/fluxo.ts
// El registro: borrador → cliente resuelto → gate con fecha → confirmación →
// escritura. Y `/desfazer`.
//
// ══════════════════════════════════════════════════════════════════════════
// TODA ESCRITURA PASA POR EL MISMO VENTUS QUE LA APP
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 escribe a mano con `service_role`: inserta en `activities`,
// hace UPDATE de `opportunities.next_action` (que la web después BORRA), y en
// leads mantiene un contador denormalizado que ignora la CADENCE_SCHEDULE y
// nunca mueve `leads.stage`. Tres fuentes de verdad distintas.
//
// Acá no hay un segundo backend:
//   · la atividade y a task van por `proporAcao` de `api/_lib/propose`, con
//     `idempotency_key` (dos taps en ✅ = un registro) y línea de auditoría;
//   · el toque de cadencia va por `ventus_commit_action` → RPC
//     `registrar_touchpoint`, que aplica la CADENCE_SCHEDULE, mueve
//     `leads.stage` y recalcula `next_touchpoint_date` en Postgres;
//   · la próxima acción se escribe como `task`, que es la fuente de verdad, y
//     el trigger de 0001 la denormaliza en `opportunities.next_action`. Así el
//     panel de la web deja de borrarla al primer uso.
//   · las escalas PPVVCC se PROPONEN y quedan en la bandeja de Revisão. El
//     score no se toca sin confirmación humana con evidencia.
//
// La propiedad se revalida en TypeScript con `exigirPropriedade`: el bot habla
// como `service_role` y para Postgres eso es `__service__`, que puede todo.

import { randomUUID } from 'node:crypto'
import type { Channel, IsoDate, Lead, Opportunity, TouchpointResult } from '../../../src/core'
import { getScaleScores, todayBr } from '../../../src/core'
import type { AuthContext } from '../../_lib/auth'
import { exigirPropriedade } from '../../_lib/auth'
import { auditar, proporAcao } from '../../_lib/propose'
import { serviceClient } from '../../_lib/supabase'
import type { CarteiraDoVendedor } from '../../_lib/carteira'
import { citacaoVerificada } from './extracao'
import type { RegistroBruto } from './extracao'
import { oportunidadeDe, leadDe, rotuloDe } from './dados'
import type { RascunhoDeRegistro, UltimoRegistro } from './sessoes'

/* ══════════════════════════════════════════════════════════════════════════
   Del bruto del modelo al borrador
   ══════════════════════════════════════════════════════════════════════════ */

const CANAIS: readonly Channel[] = ['linkedin', 'whatsapp', 'email', 'phone']

export function montarRascunho(
  bruto: RegistroBruto,
  transcricao: string,
  carteira: CarteiraDoVendedor,
): RascunhoDeRegistro {
  // El match se INTERSECTA contra la cartera real: un id que el modelo
  // devolvió pero que no está en la cartera del vendedor no existe.
  const valido = (a: { kind: 'opportunity' | 'lead'; id: number }): boolean =>
    a.kind === 'opportunity' ? oportunidadeDe(carteira, a.id) !== null : leadDe(carteira, a.id) !== null

  const alvo =
    bruto.alvo && valido(bruto.alvo)
      ? { kind: bruto.alvo.kind, id: bruto.alvo.id, rotulo: rotuloDe(carteira, bruto.alvo.kind, bruto.alvo.id) }
      : null

  const candidatos = bruto.candidatos
    .filter(valido)
    .slice(0, 5)
    .map((c) => ({ kind: c.kind, id: c.id, rotulo: rotuloDe(carteira, c.kind, c.id) }))

  return {
    alvo,
    candidatos,
    tipo: bruto.tipo,
    resumo: bruto.resumo,
    resultado: bruto.resultado,
    resultadoNota: bruto.resultado_nota,
    canal: CANAIS.includes(bruto.canal) ? bruto.canal : 'phone',
    resultadoLead: bruto.resultado_lead,
    proximaAcao: bruto.proxima_acao,
    proximaAcaoData: (bruto.proxima_acao_data as IsoDate | null) ?? null,
    // Regra da prova: solo sobrevive la escala cuya cita aparece TEXTUALMENTE
    // en la transcripción. El modelo parafrasea sin querer.
    escalas: bruto.escalas.filter((e) => citacaoVerificada(e.citacao, transcricao)),
    contatos: bruto.contatos,
    transcricao,
    idempotencyKey: randomUUID(),
  }
}

/** ¿Está listo para escribirse? */
export function rascunhoCompleto(r: RascunhoDeRegistro): boolean {
  return r.alvo !== null && r.proximaAcaoData !== null
}

/* ══════════════════════════════════════════════════════════════════════════
   Escritura
   ══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoDoRegistro {
  ok: boolean
  rotulo: string
  ultimo: UltimoRegistro
  /** Escalas que quedaron esperando confirmación en la bandeja de Revisão. */
  escalasPropostas: number
  aviso: string | null
}

export async function gravarRegistro(
  ctx: AuthContext,
  rascunho: RascunhoDeRegistro,
  carteira: CarteiraDoVendedor,
): Promise<ResultadoDoRegistro> {
  const alvo = rascunho.alvo
  if (!alvo) throw new Error('rascunho sem alvo')
  if (!rascunho.proximaAcaoData) throw new Error('rascunho sem data de próxima ação')

  return alvo.kind === 'opportunity'
    ? gravarNaOportunidade(ctx, rascunho, carteira)
    : gravarNoLead(ctx, rascunho, carteira)
}

/** La cita que sostiene el registro: la transcripción, recortada. */
function citacaoDoRelato(rascunho: RascunhoDeRegistro): string {
  const t = rascunho.transcricao.trim()
  return t.length >= 8 ? t.slice(0, 500) : `${rascunho.resumo}`.slice(0, 500)
}

async function gravarNaOportunidade(
  ctx: AuthContext,
  rascunho: RascunhoDeRegistro,
  carteira: CarteiraDoVendedor,
): Promise<ResultadoDoRegistro> {
  const alvo = rascunho.alvo as { kind: 'opportunity'; id: number; rotulo: string }
  const opp = oportunidadeDe(carteira, alvo.id)
  if (!opp) throw new Error(`oportunidade ${alvo.id} fora da carteira`)
  exigirPropriedade(ctx, opp.vendor)

  const citacao = citacaoDoRelato(rascunho)

  // ── 1. A atividade ──
  const atividade = await proporAcao({
    ctx,
    tool: 'ventus_registrar_atividade',
    dono: opp.vendor,
    entidade: { kind: 'opportunity', id: opp.id },
    payload: {
      activity_type: rascunho.tipo,
      description: descricaoComNota(rascunho),
      // ENUM, no prosa. Es el arreglo del bug de los 12 valores conviviendo.
      result: rascunho.resultado,
      next_action: rascunho.proximaAcao,
      next_action_date: rascunho.proximaAcaoData,
    },
    confianca: 'alta',
    resumo: `Registrar ${rascunho.tipo} em ${alvo.rotulo}`,
    mudancas: [
      { campo: 'atividade', rotulo: 'Atividade', de: null, para: rascunho.resumo },
      { campo: 'result', rotulo: 'Resultado', de: null, para: rascunho.resultado },
    ],
    citacao,
    superficie: 'telegram',
    idempotencyKey: `${rascunho.idempotencyKey}:atividade`,
    evidencia: { transcricao: rascunho.transcricao.slice(0, 2000), canal: 'telegram' },
  })

  const activityId = numeroDe(atividade.resultado?.['activity_id'])
  if (activityId !== null && rascunho.resultadoNota) {
    await gravarNotaDeResultado(activityId, rascunho.resultadoNota)
  }

  // ── 2. A próxima ação como task (fonte de verdade) ──
  await criarTaskDeProximaAcao(ctx, rascunho, { opportunity_id: opp.id }, opp.vendor ?? ctx.vendorName)

  // ── 3. Contatos: só preenchem campos VAZIOS ──
  await preencherContatosVazios(ctx, opp, rascunho)

  // ── 4. Escalas: propostas, nunca aplicadas sem confirmação ──
  const escalasPropostas = await proporEscalas(ctx, opp, rascunho, citacao)

  return {
    ok: true,
    rotulo: alvo.rotulo,
    ultimo: {
      kind: 'opportunity',
      rotulo: alvo.rotulo,
      actionId: atividade.actionId,
      activityId,
      touchpointId: null,
      leadId: null,
      leadAntes: null,
      em: new Date().toISOString(),
    },
    escalasPropostas,
    aviso: activityId === null ? 'O registro entrou, mas não consegui confirmar o id da atividade.' : null,
  }
}

async function gravarNoLead(
  ctx: AuthContext,
  rascunho: RascunhoDeRegistro,
  carteira: CarteiraDoVendedor,
): Promise<ResultadoDoRegistro> {
  const alvo = rascunho.alvo as { kind: 'lead'; id: number; rotulo: string }
  const lead = leadDe(carteira, alvo.id)
  if (!lead) throw new Error(`lead ${alvo.id} fora da carteira`)
  exigirPropriedade(ctx, lead.vendor)

  const antes = {
    stage: lead.stage,
    status: lead.status,
    touchpoints_count: lead.touchpoints_count,
    last_touchpoint_date: lead.last_touchpoint_date,
    next_touchpoint_date: lead.next_touchpoint_date,
  }

  const resultado: TouchpointResult = rascunho.resultadoLead ?? inferirResultadoDeLead(rascunho)

  // La RPC hace TODO el dominio: sequence_number, CADENCE_SCHEDULE, movimiento
  // de `leads.stage`, auto-archivo en TP7 y la línea de auditoría.
  const toque = await proporAcao({
    ctx,
    tool: 'ventus_criar_touchpoint',
    dono: lead.vendor,
    entidade: { kind: 'lead', id: lead.id },
    payload: {
      canal: rascunho.canal,
      resultado,
      notas: descricaoComNota(rascunho),
      client_uuid: rascunho.idempotencyKey,
    },
    confianca: 'alta',
    resumo: `Registrar toque ${rascunho.canal} em ${alvo.rotulo}`,
    mudancas: [{ campo: 'touchpoint', rotulo: 'Toque', de: null, para: `${rascunho.canal} → ${resultado}` }],
    citacao: citacaoDoRelato(rascunho),
    superficie: 'telegram',
    idempotencyKey: `${rascunho.idempotencyKey}:toque`,
    evidencia: { transcricao: rascunho.transcricao.slice(0, 2000), canal: 'telegram' },
  })

  // La fecha que el vendedor eligió vive en `tasks`. La RPC ya puso
  // `next_touchpoint_date` por cadencia y no se pisa: son dos cosas distintas
  // —lo que la metodología manda y lo que la persona se comprometió a hacer—
  // y la task es la que el planner mira.
  await criarTaskDeProximaAcao(ctx, rascunho, { lead_id: lead.id }, lead.vendor)

  return {
    ok: true,
    rotulo: alvo.rotulo,
    ultimo: {
      kind: 'lead',
      rotulo: alvo.rotulo,
      actionId: toque.actionId,
      activityId: null,
      touchpointId: numeroDe(toque.resultado?.['touchpoint_id']),
      leadId: lead.id,
      leadAntes: antes,
      em: new Date().toISOString(),
    },
    escalasPropostas: 0,
    aviso:
      toque.resultado === null
        ? 'O toque foi proposto mas não consegui confirmar a execução. Confere na Cadência.'
        : null,
  }
}

/** Sin resultado explícito, el desfecho canónico sale del enum del registro. */
function inferirResultadoDeLead(rascunho: RascunhoDeRegistro): TouchpointResult {
  if (rascunho.tipo === 'meeting' || rascunho.tipo === 'demo') return 'meeting_scheduled'
  switch (rascunho.resultado) {
    case 'positivo':
      return 'interested'
    case 'negativo':
      return 'not_interested'
    case 'pendente':
      return 'no_response'
    default:
      return 'other'
  }
}

function descricaoComNota(rascunho: RascunhoDeRegistro): string {
  return rascunho.resultadoNota ? `${rascunho.resumo}\n— ${rascunho.resultadoNota}` : rascunho.resumo
}

function numeroDe(valor: unknown): number | null {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * `activities.result_note` todavía no existe en la base (el ALTER está en el
 * plano, §Mudanças no modelo de dados). Se intenta escribir y, si la columna
 * no está, se sigue sin ella: la prosa ya quedó dentro de `description`, así
 * que no se pierde nada. El día que la migración entre, esto empieza a
 * funcionar solo.
 */
async function gravarNotaDeResultado(activityId: number, nota: string): Promise<void> {
  const { error } = await serviceClient()
    .from('activities')
    .update({ result_note: nota })
    .eq('id', activityId)
  if (!error) return
  if (error.code === '42703' || error.code === 'PGRST204') return
  console.warn(`[fluxo] result_note falhou: ${error.code} ${error.message}`)
}

async function criarTaskDeProximaAcao(
  ctx: AuthContext,
  rascunho: RascunhoDeRegistro,
  alvo: { opportunity_id?: number; lead_id?: number },
  dono: string,
): Promise<void> {
  if (!rascunho.proximaAcaoData) return
  await proporAcao({
    ctx,
    tool: 'ventus_agendar_lembrete',
    dono,
    entidade: alvo.opportunity_id
      ? { kind: 'opportunity', id: alvo.opportunity_id }
      : { kind: 'lead', id: alvo.lead_id as number },
    payload: {
      ...alvo,
      titulo: rascunho.proximaAcao ?? `Retomar ${rascunho.alvo?.rotulo ?? 'o contato'}`,
      due_date: rascunho.proximaAcaoData,
      canal: canalDeTask(rascunho.canal),
    },
    confianca: 'alta',
    resumo: `Agendar «${rascunho.proximaAcao ?? 'retomar contato'}» para ${rascunho.proximaAcaoData}`,
    mudancas: [
      {
        campo: 'proxima_acao',
        rotulo: 'Próxima ação',
        de: null,
        para: `${rascunho.proximaAcao ?? 'retomar contato'} — ${rascunho.proximaAcaoData}`,
      },
    ],
    citacao: citacaoDoRelato(rascunho),
    superficie: 'telegram',
    idempotencyKey: `${rascunho.idempotencyKey}:task`,
  })
}

/** `tasks_canal_chk` no acepta `phone` ni `linkedin` con esos nombres. */
function canalDeTask(canal: Channel): string {
  switch (canal) {
    case 'phone':
      return 'call'
    case 'whatsapp':
      return 'whatsapp'
    case 'email':
      return 'email'
    case 'linkedin':
      return 'linkedin'
    default:
      return 'other'
  }
}

/**
 * Los contactos que el vendedor nombró solo rellenan campos VACÍOS. Nunca
 * pisan lo que alguien cargó a mano: es parte del contrato escrito del README
 * del bot y se conserva palabra por palabra.
 */
async function preencherContatosVazios(
  ctx: AuthContext,
  opp: Opportunity,
  rascunho: RascunhoDeRegistro,
): Promise<void> {
  if (rascunho.contatos.length === 0) return
  const atualizacoes: Record<string, string> = {}
  for (const c of rascunho.contatos) {
    const atual = (opp[c.papel] ?? '').trim()
    if (atual === '') atualizacoes[c.papel] = c.nome
  }
  if (Object.keys(atualizacoes).length === 0) return

  const { error } = await serviceClient()
    .from('opportunities')
    .update(atualizacoes)
    .eq('id', opp.id)
    .eq('vendor', opp.vendor)
  if (error) {
    console.warn(`[fluxo] contatos falharam: ${error.code} ${error.message}`)
    return
  }
  await auditar({
    actor: ctx.vendorName,
    evento: 'manual_write',
    entityKind: 'opportunity',
    entityId: String(opp.id),
    depois: atualizacoes,
    contexto: { origem: 'telegram', regra: 'so_preenche_vazio' },
  })
}

/**
 * Las escalas se PROPONEN. `ventus_atualizar_escala` no está en
 * `TOOLS_AUTOCOMMIT` a propósito: mover una escala corrompe el forecast del
 * equipo entero y es lo único que el plano exige que confirme un humano con la
 * evidencia delante. Quedan en la bandeja de Revisão de la app.
 */
async function proporEscalas(
  ctx: AuthContext,
  opp: Opportunity,
  rascunho: RascunhoDeRegistro,
  citacao: string,
): Promise<number> {
  if (rascunho.escalas.length === 0) return 0
  const atuais = getScaleScores(opp.scales)
  let propostas = 0

  for (const escala of rascunho.escalas) {
    const anterior = atuais[escala.escala]
    if (escala.para <= anterior) continue
    await proporAcao({
      ctx,
      tool: 'ventus_atualizar_escala',
      dono: opp.vendor,
      entidade: { kind: 'opportunity', id: opp.id },
      payload: {
        scale_key: escala.escala,
        score_anterior: anterior,
        score_novo: escala.para,
        quote: escala.citacao,
        fonte: 'telegram',
      },
      confianca: 'media',
      resumo: `Subir ${escala.escala.toUpperCase()} de ${anterior} para ${escala.para} em ${rascunho.alvo?.rotulo ?? ''}`,
      mudancas: [
        {
          campo: `scales.${escala.escala}`,
          rotulo: escala.escala.toUpperCase(),
          de: String(anterior),
          para: String(escala.para),
        },
      ],
      citacao: escala.citacao || citacao,
      superficie: 'telegram',
      idempotencyKey: `${rascunho.idempotencyKey}:escala:${escala.escala}`,
    })
    propostas += 1
  }
  return propostas
}

/* ══════════════════════════════════════════════════════════════════════════
   /desfazer
   ══════════════════════════════════════════════════════════════════════════ */

export type ResultadoDeDesfazer =
  | { ok: true; rotulo: string }
  | { ok: false; motivo: 'nada' | 'velho' | 'falhou' }

/** Ventana de arrepentimiento. Más allá de un día, el histórico es histórico. */
export const JANELA_DE_DESFAZER_MS = 24 * 3600_000

export const MENSAGEM_DE_DESFAZER: Readonly<Record<'nada' | 'velho' | 'falhou', string>> = {
  nada: 'Não tem nenhum registro recente meu pra desfazer neste chat.',
  velho: 'Esse registro já tem mais de 24 h. Histórico não se apaga por aqui — corrige no app.',
  falhou: 'Não consegui desfazer agora. Confere no app antes de registrar de novo.',
}

/**
 * Revierte el último registro confirmado por este chat.
 *
 * Es el ÚNICO camino del bot que escribe directo con `service_role` en vez de
 * pasar por una RPC de dominio: no existe una `desfazer_touchpoint()` y
 * inventarla acá sería peor. A cambio: ventana de 24 h, filtro explícito por
 * `vendor` en cada consulta, y una línea de `ventus_audit` con el antes y el
 * después. Nada se borra en silencio.
 */
export async function desfazerUltimo(
  ctx: AuthContext,
  ultimo: UltimoRegistro | null,
): Promise<ResultadoDeDesfazer> {
  if (!ultimo) return { ok: false, motivo: 'nada' }
  if (Date.now() - new Date(ultimo.em).getTime() > JANELA_DE_DESFAZER_MS) {
    return { ok: false, motivo: 'velho' }
  }

  const db = serviceClient()

  try {
    if (ultimo.kind === 'opportunity') {
      if (ultimo.activityId === null) return { ok: false, motivo: 'nada' }
      const { error } = await db
        .from('activities')
        .delete()
        .eq('id', ultimo.activityId)
        .eq('vendor', ctx.vendorName)
        .eq('source', 'ai_parsed')
      if (error) throw new Error(`${error.code} ${error.message}`)
    } else {
      if (ultimo.touchpointId === null || ultimo.leadId === null) return { ok: false, motivo: 'nada' }
      const dono = await db.from('leads').select('vendor').eq('id', ultimo.leadId).maybeSingle()
      exigirPropriedade(ctx, (dono.data as { vendor?: string } | null)?.vendor ?? null)

      const apagado = await db.from('touchpoints').delete().eq('id', ultimo.touchpointId)
      if (apagado.error) throw new Error(`${apagado.error.code} ${apagado.error.message}`)

      if (ultimo.leadAntes) {
        const restaurado = await db.from('leads').update(ultimo.leadAntes).eq('id', ultimo.leadId)
        if (restaurado.error) throw new Error(`${restaurado.error.code} ${restaurado.error.message}`)
      }
    }

    // La task de la próxima acción se cancela junto con el registro que la
    // creó: dejarla suelta sería peor que no haberla creado.
    if (ultimo.actionId) {
      await db
        .from('ventus_actions')
        .update({ status: 'dismissed', dismissed_reason: 'ja_fiz', dismissed_at: new Date().toISOString() })
        .eq('id', ultimo.actionId)
        .eq('vendor', ctx.vendorName)
    }

    await auditar({
      actionId: ultimo.actionId,
      actor: ctx.vendorName,
      evento: 'manual_write',
      entityKind: ultimo.kind,
      entityId: String(ultimo.leadId ?? ultimo.activityId ?? ''),
      antes: { ...ultimo },
      depois: { desfeito: true },
      contexto: { origem: 'telegram', comando: '/desfazer' },
    })

    return { ok: true, rotulo: ultimo.rotulo }
  } catch (erro) {
    console.error('[fluxo] desfazer falhou:', erro)
    return { ok: false, motivo: 'falhou' }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Botões de card: marcar feito / adiar
   ══════════════════════════════════════════════════════════════════════════ */

/** Marca hecha la próxima acción de una oportunidad desde el `/hoje`. */
export async function marcarAcaoFeita(ctx: AuthContext, opp: Opportunity): Promise<boolean> {
  exigirPropriedade(ctx, opp.vendor)
  const db = serviceClient()

  const tasks = await db
    .from('tasks')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('opportunity_id', opp.id)
    .eq('vendor', opp.vendor)
    .eq('status', 'pending')
    .select('id')

  if (tasks.error && tasks.error.code !== '42P01' && tasks.error.code !== 'PGRST205') {
    console.error(`[fluxo] marcar task falhou: ${tasks.error.code} ${tasks.error.message}`)
  }

  const { error } = await db
    .from('opportunities')
    .update({ next_action_done: true })
    .eq('id', opp.id)
    .eq('vendor', opp.vendor)
  // `opportunities` no tiene next_action_done en el v2: si la columna no
  // existe, la task ya quedó cerrada y eso es lo que mira el planner.
  if (error && error.code !== '42703' && error.code !== 'PGRST204') {
    console.error(`[fluxo] marcar feita falhou: ${error.code} ${error.message}`)
    return (tasks.data ?? []).length > 0
  }

  await auditar({
    actor: ctx.vendorName,
    evento: 'manual_write',
    entityKind: 'opportunity',
    entityId: String(opp.id),
    depois: { next_action_done: true },
    contexto: { origem: 'telegram', botao: 'feito' },
  })
  return true
}

/** Reprograma la próxima acción a una fecha concreta. Nunca la borra. */
export async function adiarPara(
  ctx: AuthContext,
  alvo: { kind: 'opportunity' | 'lead'; id: number; dono: string; rotulo: string },
  data: IsoDate,
): Promise<boolean> {
  exigirPropriedade(ctx, alvo.dono)
  const proposta = await proporAcao({
    ctx,
    tool: 'ventus_adiar_acao',
    dono: alvo.dono,
    entidade: { kind: alvo.kind, id: alvo.id },
    payload: {
      ...(alvo.kind === 'opportunity' ? { opportunity_id: alvo.id } : { lead_id: alvo.id }),
      titulo: `Retomar ${alvo.rotulo}`,
      due_date: data,
    },
    confianca: 'alta',
    resumo: `Adiar ${alvo.rotulo} para ${data}`,
    mudancas: [{ campo: 'due_date', rotulo: 'Nova data', de: null, para: data }],
    citacao: `Adiado pelo ${ctx.vendorName} no Telegram em ${todayBr()}`,
    superficie: 'telegram',
    idempotencyKey: `adiar:${alvo.kind}:${alvo.id}:${data}:${ctx.vendorName}`,
  })
  return proposta.resultado !== null || proposta.actionId !== null
}

/* ══════════════════════════════════════════════════════════════════════════
   Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

/** Registra el toque de la sesión de Golden Hour, con el mismo camino de dominio. */
export async function toqueDeGolden(
  ctx: AuthContext,
  lead: Lead,
  resultado: TouchpointResult,
  canal: Channel,
): Promise<boolean> {
  exigirPropriedade(ctx, lead.vendor)
  const proposta = await proporAcao({
    ctx,
    tool: 'ventus_criar_touchpoint',
    dono: lead.vendor,
    entidade: { kind: 'lead', id: lead.id },
    payload: {
      canal,
      resultado,
      notas: 'Golden Hour pelo Telegram',
      client_uuid: randomUUID(),
    },
    confianca: 'alta',
    resumo: `Toque ${canal} em ${lead.company_name} → ${resultado}`,
    mudancas: [{ campo: 'touchpoint', rotulo: 'Toque', de: null, para: resultado }],
    citacao: `Golden Hour de ${ctx.vendorName} em ${todayBr()} pelo Telegram`,
    superficie: 'telegram',
    idempotencyKey: `gh:${lead.id}:${todayBr()}:${lead.touchpoints_count}`,
  })
  return proposta.resultado !== null
}
