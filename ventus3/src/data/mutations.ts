// src/data/mutations.ts
// Las mutaciones de dominio. TODAS son optimistas y TODAS pasan por el outbox.
//
// Regla dura de la app: ningún componente llama a supabase. Escribe acá, o no
// escribe. El camino es siempre el mismo:
//
//     1. validar en el cliente lo que se pueda (la validación real es del
//        servidor: los gates se revalidan SIEMPRE en Postgres)
//     2. aplicar el cambio en Dexie  → la UI ya lo muestra
//     3. encolar en el outbox        → el envío es problema del motor de sync
//     4. pedir un flush sin esperarlo → si no hay red, no pasa nada
//
// El paso 2 antes del 3 no es un detalle: si encoláramos primero y un flush
// instantáneo ganara la carrera, el pull podría traer la fila del servidor
// antes de que exista la copia local y el vendedor vería su nota parpadear.

import { useMutation, type QueryClient, type UseMutationResult } from '@tanstack/react-query'
import {
  advanceLeadStage,
  calcNextTouchpointDate,
  EVIDENCE_REQUIRED_ABOVE,
  todayBr,
  type ActivitySource,
  type ActivityType,
  type CanalTarefa,
  type Channel,
  type EntityRef,
  type IsoDate,
  type Opportunity,
  type OrigemTarefa,
  type PrioridadeTarefa,
  type ScaleKey,
  type StageId,
  type Task,
  type TaskKind,
  type TouchpointResult,
  type TouchpointSeq,
} from '@/core'
import { agora, getDb } from './db'
import { enqueue, flush, novoClientUuid } from './outbox'
import type { LocalActivity, LocalTouchpoint } from './local-types'

/* ══════════════════════════════════════════════════════════════════════════
   Nombres de las RPC de dominio
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Las funciones SECURITY DEFINER que validan del lado del servidor.
 * TODO(F2-F4): definirlas en supabase/migrations. Mientras no existan, la
 * mutación se encola igual y queda en 'erro' con un mensaje claro — nunca se
 * pierde lo que el vendedor escribió.
 */
export const RPC = {
  atualizarEscala: 'atualizar_escala',
  avancarEtapa: 'avancar_etapa',
  registrarTouchpoint: 'registrar_touchpoint',
  converterLead: 'converter_lead',
  promoverDoSweep: 'promote_sweep_to_lead',
} as const

/* ══════════════════════════════════════════════════════════════════════════
   Ids provisorios
   ══════════════════════════════════════════════════════════════════════════ */

let contadorProvisorio = 0

/**
 * Id local para una fila append-only que todavía no tiene id del servidor.
 * Negativo a propósito: nunca puede chocar con un bigserial y se distingue de
 * un vistazo en el depurador. La clave real de la fila es `uid`.
 */
function idProvisorio(): number {
  contadorProvisorio += 1
  return -contadorProvisorio
}

/** Encola y pide el flush sin bloquear al que llamó. */
async function encolarEDisparar(
  entrada: Parameters<typeof enqueue>[0],
): Promise<string> {
  const id = await enqueue(entrada)
  void flush().catch(() => undefined)
  return id
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · registrarAtividade — append-only, el 80 % del tráfico
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaAtividade {
  vendor: string
  // NO lleva vendorId: `public.activities` no tiene columna `vendor_id`
  // (verificado por MCP) — a diferencia de `tasks` y `golden_sessions`. Mandarla
  // sería el mismo 400 PGRST204 que ya rompió `criarTask` una vez (ver
  // conflicts.ts). Si el día de mañana la tabla gana la columna, threadear acá
  // Y agregar 'activities' a TABLAS_COM_CLIENT_UUID en transport.ts si aplica.
  opportunityId: number
  tipo: ActivityType
  descricao: string
  resultado?: string | null
  /** Fecha del hecho, no la de carga. Default: hoy en BRT. */
  data?: IsoDate
  /** Código del cookbook, ej. '3B'. */
  codigoMetodologia?: string | null
  proximaAcao?: string | null
  proximaAcaoData?: IsoDate | null
  origem?: ActivitySource
  /** Para atar la actividad a un audio ya guardado en audioBlobs. */
  clientUuid?: string
}

/**
 * Registra una actividad. Es append-only con client_uuid: reintentarla es
 * inofensivo y dos dispositivos nunca la duplican.
 */
export async function registrarAtividade(entrada: EntradaAtividade): Promise<string> {
  const uuid = entrada.clientUuid ?? novoClientUuid()
  const data = entrada.data ?? todayBr()
  const criadoEm = agora()

  const linha: LocalActivity = {
    uid: uuid,
    client_uuid: uuid,
    pendente: 1,
    id: idProvisorio(),
    opportunity_id: entrada.opportunityId,
    vendor: entrada.vendor,
    created_at: criadoEm,
    activity_date: data,
    activity_type: entrada.tipo,
    description: entrada.descricao,
    result: entrada.resultado ?? null,
    stage_at_time: null,
    methodology_code: entrada.codigoMetodologia ?? null,
    ai_suggested_action: null,
    ai_suggested_scales: null,
    ai_confidence: null,
    next_action: entrada.proximaAcao ?? null,
    next_action_date: entrada.proximaAcaoData ?? null,
    next_action_done: false,
    source: entrada.origem ?? 'manual',
  }

  const db = getDb()
  await db.activities.put(linha)

  // Reflejo local del trigger touch_last_activity(): la Carteira tiene que
  // dejar de decir "9 dias sem contato" en el mismo instante.
  const opp = await db.opportunities.get(entrada.opportunityId)
  if (opp) {
    await db.opportunities.put({ ...opp, last_activity_date: data, last_update: criadoEm })
  }

  await encolarEDisparar({
    id: uuid,
    tabla: 'activities',
    op: 'insert',
    row_id: null,
    campos_tocados: [],
    payload: {
      opportunity_id: linha.opportunity_id,
      vendor: linha.vendor,
      activity_date: linha.activity_date,
      activity_type: linha.activity_type,
      description: linha.description,
      result: linha.result,
      methodology_code: linha.methodology_code,
      next_action: linha.next_action,
      next_action_date: linha.next_action_date,
      source: linha.source,
    },
  })
  return uuid
}

/* ══════════════════════════════════════════════════════════════════════════
   2-4 · Tarefas
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaTask {
  vendor: string
  /**
   * FK a `vendors.id`. Opcional a propósito: `trg_tasks_before_write` (0001)
   * resuelve `vendor_id` a partir de `vendor` (nombre) del lado del servidor
   * cuando llega null, así que una llamada vieja sin este campo sigue
   * funcionando. Mandarlo desde acá evita depender SOLO del match por nombre
   * y deja la copia optimista de Dexie con el id correcto antes del próximo
   * pull — que es lo que necesita cualquier agregación por vendor_id (ej. un
   * futuro Painel do Gestor) para no ver null en las tareas recién creadas.
   */
  vendorId?: number | null
  kind: TaskKind
  /**
   * Sobre qué se actúa. `public.tasks` exige opportunity_id O lead_id
   * (CHECK `tasks_owner_chk`): una tarea sin negocio detrás no tiene dónde
   * guardarse, así que un EntityRef de otro tipo se rechaza acá y no envenena
   * la cola con un 400 que reintentaría para siempre.
   */
  target: EntityRef
  /** Texto imperativo en PT-BR: 'Ligar para o Marcelo da Tetra'. */
  title: string
  /** Fecha obligatoria: una tarea sin fecha no existe (51 de 54 en el v2). */
  dueDate: IsoDate

  /* ── Lo que el modelo local no usa pero la tabla sí guarda ─────────────
     Todos opcionales: solo viajan cuando quien llama de verdad los tiene.
     Ninguna clave inventada sale de acá — la lista de columnas reales vive en
     COLUNAS_TASKS (src/data/conflicts.ts) y el flush la aplica. */
  /** Medio de la próxima acción. Lo pasa el gate de Registrar. */
  canal?: CanalTarefa | null
  prioridade?: PrioridadeTarefa | null
  /** Escala del cookbook que la tarea busca mover. */
  escalaAlvo?: ScaleKey | null
  /** Borrador listo para copiar (mensaje, e-mail). */
  rascunho?: string | null
  /** Qué queda cierto cuando esté hecha. */
  resultadoEsperado?: string | null
  /** Quién la generó. Default 'manual': la escribió una persona. */
  origem?: OrigemTarefa
  /** Marca de procedencia, como el 'backfill-v2' de las filas del v2. */
  criadoPor?: string | null
}

/** Prioridad por defecto de `tasks.prioridade` en Postgres. */
const PRIORIDADE_PADRAO: PrioridadeTarefa = 2

export async function criarTask(entrada: EntradaTask): Promise<string> {
  const alvo = entrada.target
  if (alvo.kind !== 'opportunity' && alvo.kind !== 'lead') {
    throw new Error('Uma tarefa precisa estar ligada a uma oportunidade ou a um lead.')
  }
  const titulo = entrada.title.trim()
  if (titulo === '') {
    // CHECK `tasks_titulo_chk`. Mejor fallar acá, donde la pantalla lo puede
    // mostrar, que dejar un ítem muerto en la cola.
    throw new Error('A tarefa precisa de um título.')
  }

  const id = novoClientUuid()
  const criadoEm = agora()

  // El resto de las columnas solo existen en la fila si quien llamó las trajo:
  // undefined nunca llega al payload (lo corta desnormalizarLocal) y así el
  // default de Postgres sigue mandando.
  const extras = {
    ...(entrada.vendorId !== undefined ? { vendor_id: entrada.vendorId } : {}),
    ...(entrada.canal !== undefined ? { canal: entrada.canal } : {}),
    ...(entrada.escalaAlvo !== undefined ? { target_scale: entrada.escalaAlvo } : {}),
    ...(entrada.rascunho !== undefined ? { draft_content: entrada.rascunho } : {}),
    ...(entrada.resultadoEsperado !== undefined
      ? { expected_outcome: entrada.resultadoEsperado }
      : {}),
    ...(entrada.criadoPor !== undefined ? { created_by: entrada.criadoPor } : {}),
  }

  const linha: Task = {
    id,
    vendor: entrada.vendor,
    kind: entrada.kind,
    target: alvo,
    title: titulo,
    due_date: entrada.dueDate,
    status: 'pending',
    snoozed_until: null,
    created_at: criadoEm,
    prioridade: entrada.prioridade ?? PRIORIDADE_PADRAO,
    origem: entrada.origem ?? 'manual',
    ...extras,
  }
  await getDb().tasks.put(linha)

  // El payload sale con la forma LOCAL a propósito: la traducción a columnas
  // vive en el flush (desnormalizarLocal), que es el único lugar donde también
  // alcanza a los ítems que ya estaban encolados con la forma vieja.
  await encolarEDisparar({
    id,
    tabla: 'tasks',
    op: 'insert',
    row_id: id,
    campos_tocados: [],
    payload: {
      // `id` = `client_uuid` = el uuid local. La copia optimista de Dexie se
      // indexa por `id`, así que dejar que gen_random_uuid() invente otro
      // haría que el pull trajera la MISMA tarea como una segunda fila.
      id,
      vendor: entrada.vendor,
      kind: entrada.kind,
      target: alvo,
      title: titulo,
      due_date: entrada.dueDate,
      status: 'pending',
      prioridade: linha.prioridade,
      origem: linha.origem,
      ...extras,
    },
  })
  return id
}

export interface EntradaConcluirTask {
  taskId: string
  /** Actividad que la cierra. Si viene, se registra en el mismo gesto. */
  atividade?: EntradaAtividade
}

export async function concluirTask(entrada: EntradaConcluirTask): Promise<void> {
  const db = getDb()
  // `done_at` no es decoración: el CHECK `tasks_done_chk` exige que una fila
  // 'done' lo tenga. Mandar solo `status` es un 23514 permanente.
  const feitoEm = agora()
  const task = await db.tasks.get(entrada.taskId)
  if (task) await db.tasks.put({ ...task, status: 'done', done_at: feitoEm })

  if (entrada.atividade) await registrarAtividade(entrada.atividade)

  await encolarEDisparar({
    tabla: 'tasks',
    op: 'update',
    row_id: entrada.taskId,
    campos_tocados: ['status', 'done_at'],
    payload: { status: 'done', done_at: feitoEm },
  })
}

export interface EntradaAdiarTask {
  taskId: string
  /** Nueva fecha. La UI ofrece amanhã / 3 dias / próxima semana. */
  ate: IsoDate
}

export async function adiarTask(entrada: EntradaAdiarTask): Promise<void> {
  const db = getDb()
  const task = await db.tasks.get(entrada.taskId)
  if (task) {
    await db.tasks.put({
      ...task,
      status: 'snoozed',
      snoozed_until: entrada.ate,
      due_date: entrada.ate,
    })
  }

  // `snoozed_until` es el nombre LOCAL; en Postgres la columna se llama
  // `snoozed_to` y el CHECK `tasks_snooze_chk` exige que no sea null cuando el
  // status es 'snoozed'. La traducción la hace el flush, no esta función: así
  // los adiamientos que quedaron encolados antes del arreglo también salen bien.
  await encolarEDisparar({
    tabla: 'tasks',
    op: 'update',
    row_id: entrada.taskId,
    campos_tocados: ['status', 'snoozed_until', 'due_date'],
    payload: { status: 'snoozed', snoozed_until: entrada.ate, due_date: entrada.ate },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · atualizarEscala — con evidencia y LWW por campo
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaEscala {
  opportunityId: number
  escala: ScaleKey
  nivel: number
  /** Cita textual del cliente. OBLIGATORIA por encima del nivel 5. */
  citacao?: string | null
  /** Quién lo dijo: nombre y cargo. Sin fuente no es prueba, es opinión. */
  fonte?: string | null
  vendor: string
}

/** Se lanza cuando falta la prueba. La UI la muestra como sheet, nunca alert(). */
export class ErroRegraDaProva extends Error {
  constructor(escala: ScaleKey, nivel: number) {
    super(
      `Para colocar ${escala.toUpperCase()} em ${String(nivel)} é preciso uma citação do cliente.`,
    )
    this.name = 'ErroRegraDaProva'
  }
}

/**
 * Mueve UNA escala. Va por RPC y no por update directo a propósito: el jsonb
 * `scales` se actualiza con jsonb_set del lado del servidor, junto con el
 * timestamp de ESA escala en `scales_updated_at`. Un update del jsonb entero
 * pisaría las otras cinco escalas — que es exactamente el conflicto que este
 * diseño existe para evitar.
 */
export async function atualizarEscala(entrada: EntradaEscala): Promise<void> {
  if (entrada.nivel > EVIDENCE_REQUIRED_ABOVE && !entrada.citacao) {
    throw new ErroRegraDaProva(entrada.escala, entrada.nivel)
  }

  const uuid = novoClientUuid()
  const ts = agora()
  const campo = `scales.${entrada.escala}`
  const db = getDb()

  const opp = await db.opportunities.get(entrada.opportunityId)
  if (opp) {
    const scales = { ...(opp.scales ?? {}) }
    scales[entrada.escala] = {
      score: entrada.nivel,
      ...(entrada.citacao ? { evidence: entrada.citacao } : {}),
      ...(entrada.fonte ? { evidence_source: entrada.fonte } : {}),
      evidence_at: ts,
      updated_by: entrada.vendor,
      updated_at: ts,
    }
    await db.opportunities.put({ ...opp, scales })
  }

  await encolarEDisparar({
    id: uuid,
    tabla: 'opportunities',
    op: 'rpc',
    rpc: RPC.atualizarEscala,
    row_id: entrada.opportunityId,
    campos_tocados: [campo],
    ts_por_campo: { [campo]: ts },
    // Firma real: public.atualizar_escala(p_opportunity_id, p_escala, p_nivel,
    // p_citacao, p_fonte, p_autor, p_cargo, p_client_uuid). El instante NO se
    // manda: lo pone el servidor con now(), que es el único reloj en el que
    // dos teléfonos coinciden. p_client_uuid es la idempotencia.
    payload: {
      p_opportunity_id: entrada.opportunityId,
      p_escala: entrada.escala,
      p_nivel: entrada.nivel,
      p_citacao: entrada.citacao ?? null,
      p_fonte: entrada.fonte ?? null,
      p_client_uuid: uuid,
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · avancarEtapa — el gate se revalida SIEMPRE en Postgres
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaEtapa {
  opportunityId: number
  para: StageId
  /** Motivo del override cuando el gate no está cumplido. Queda auditado. */
  motivoOverride?: string | null
  vendor: string
}

export async function avancarEtapa(entrada: EntradaEtapa): Promise<void> {
  const ts = agora()
  const db = getDb()

  const opp = await db.opportunities.get(entrada.opportunityId)
  if (opp) await db.opportunities.put({ ...opp, stage: entrada.para, last_update: ts })

  await encolarEDisparar({
    tabla: 'opportunities',
    op: 'rpc',
    rpc: RPC.avancarEtapa,
    row_id: entrada.opportunityId,
    campos_tocados: ['stage'],
    ts_por_campo: { stage: ts },
    // Los nombres son los de public.avancar_etapa(p_opp_id, p_nova_etapa,
    // p_override_motivo) en 0009_rpcs.sql. PostgREST resuelve la función por el
    // conjunto exacto de nombres: `p_vendor` y `p_ts` sobraban y hacían
    // fallar la llamada entera con PGRST202. El vendedor lo deduce el servidor
    // con ventus_actor() y el instante lo pone now().
    payload: {
      p_opp_id: entrada.opportunityId,
      p_nova_etapa: entrada.para,
      p_override_motivo: entrada.motivoOverride ?? null,
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · registrarTouchpoint — append-only + avance de la cadencia
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaTouchpoint {
  leadId: number
  sequencia: TouchpointSeq
  canal: Channel
  resultado: TouchpointResult
  notas?: string | null
  /**
   * Lo que efectivamente se mandó, para que el toque siguiente no se repita.
   *
   * `public.touchpoints` NO tiene columna para esto (verificado contra
   * producción), así que se guarda dentro de `notes` con una etiqueta en vez de
   * perderse en silencio. Si el equipo la quiere consultable, hace falta una
   * migración que agregue touchpoints.sent_message.
   */
  mensagemEnviada?: string | null
  vendor: string
}

/** Junta notas y mensaje enviada en el único campo de texto que la tabla tiene. */
function notasComMensagem(entrada: EntradaTouchpoint): string | null {
  const notas = entrada.notas?.trim() ?? ''
  const enviada = entrada.mensagemEnviada?.trim() ?? ''
  if (enviada === '') return notas === '' ? null : notas
  const bloco = `Mensagem enviada: ${enviada}`
  return notas === '' ? bloco : `${notas}\n\n${bloco}`
}

/**
 * Registra un toque de la cadencia. El touchpoint es append-only; el avance
 * del lead (contador, próxima fecha, etapa 1a→1d) lo calcula el MISMO core que
 * corre en el servidor, así que la UI optimista y la RPC coinciden.
 */
export async function registrarTouchpoint(entrada: EntradaTouchpoint): Promise<string> {
  const uuid = novoClientUuid()
  const ts = agora()
  const db = getDb()

  const linha: LocalTouchpoint = {
    uid: uuid,
    client_uuid: uuid,
    pendente: 1,
    vendor: entrada.vendor,
    id: idProvisorio(),
    lead_id: entrada.leadId,
    sequence_number: entrada.sequencia,
    channel: entrada.canal,
    result: entrada.resultado,
    notes: entrada.notas ?? null,
    executed_at: ts,
  }
  await db.touchpoints.put(linha)

  const lead = await db.leads.get(entrada.leadId)
  const camposLead = ['touchpoints_count', 'last_touchpoint_date', 'next_touchpoint_date', 'stage']

  if (lead) {
    const contagem = lead.touchpoints_count + 1
    await db.leads.put({
      ...lead,
      touchpoints_count: contagem,
      last_touchpoint_date: ts.slice(0, 10),
      next_touchpoint_date: calcNextTouchpointDate(contagem, ts.slice(0, 10)),
      stage: advanceLeadStage(lead, entrada.resultado),
      updated_at: ts,
    })
  }

  await encolarEDisparar({
    id: uuid,
    tabla: 'leads',
    op: 'rpc',
    rpc: RPC.registrarTouchpoint,
    row_id: entrada.leadId,
    campos_tocados: camposLead,
    ts_por_campo: Object.fromEntries(camposLead.map((c) => [c, ts])),
    // Firma real: public.registrar_touchpoint(p_lead_id, p_canal, p_resultado,
    // p_notas, p_client_uuid). El número de secuencia NO se manda: lo calcula
    // el servidor con `for update` sobre el lead, que es la única forma de que
    // dos teléfonos registrando a la vez no escriban el mismo TP. p_client_uuid
    // es la idempotencia de esta función (tabla ventus_idempotency).
    payload: {
      p_lead_id: entrada.leadId,
      p_canal: entrada.canal,
      p_resultado: entrada.resultado,
      p_notas: notasComMensagem(entrada),
      p_client_uuid: uuid,
    },
  })
  return uuid
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · converterLead — el lead se vuelve oportunidad
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaConversao {
  leadId: number
  /** Nombre del negocio. Default: el de la empresa del lead. */
  nome?: string | null
  valor?: number | null
  linhaProduto?: string | null
  vendor: string
}

/**
 * Convierte un lead en oportunidad.
 * La oportunidad la crea la RPC (necesita un bigserial y valida duplicados
 * contra los índices únicos de cnpj_raiz/domain), así que localmente sólo se
 * marca el lead como convertido. La oportunidad aparece en el próximo pull:
 * es el único punto de la app donde el optimismo tiene un límite honesto.
 */
export async function converterLead(entrada: EntradaConversao): Promise<void> {
  const uuid = novoClientUuid()
  const ts = agora()
  const db = getDb()

  const lead = await db.leads.get(entrada.leadId)
  if (lead) await db.leads.put({ ...lead, status: 'converted', updated_at: ts })

  await encolarEDisparar({
    id: uuid,
    tabla: 'leads',
    op: 'rpc',
    rpc: RPC.converterLead,
    row_id: entrada.leadId,
    campos_tocados: ['status', 'opportunity_id'],
    ts_por_campo: { status: ts, opportunity_id: ts },
    // Firma real: public.converter_lead(p_lead_id, p_name, p_value,
    // p_product_line, p_client_uuid). El vendedor sale de leads.vendor del
    // lado del servidor; mandarlo rompía la resolución de la función.
    payload: {
      p_lead_id: entrada.leadId,
      p_name: entrada.nome ?? lead?.company_name ?? null,
      p_value: entrada.valor ?? null,
      p_product_line: entrada.linhaProduto ?? null,
      p_client_uuid: uuid,
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · promoverDoSweep — del mapa de mercado a la cadencia
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaPromocao {
  /** market_sweep.id es bigint en producción, no uuid. */
  sweepId: number
  vendor: string
}

/**
 * Promueve una empresa del mapa de mercado a lead con la cadencia arrancada.
 * En producción hay 83 empresas 'asignada' con crm_lead_id NULL: por eso
 * Victor Hugo, Renata y Paulo tienen CERO leads. La RPC es la que valida el
 * anti-duplicado, así que acá no hay copia optimista: hay una promesa encolada.
 */
export async function promoverDoSweep(entrada: EntradaPromocao): Promise<void> {
  await encolarEDisparar({
    tabla: 'market_sweep',
    op: 'rpc',
    rpc: RPC.promoverDoSweep,
    row_id: entrada.sweepId,
    campos_tocados: ['crm_lead_id', 'promoted_at'],
    // Firma real: public.promote_sweep_to_lead(p_sweep_id bigint). No recibe
    // vendedor: la función lee market_sweep.assigned_to y verifica permiso con
    // ventus_autorizado(). Mandarle p_vendor rompía la resolución de la función.
    payload: { p_sweep_id: entrada.sweepId },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   10 · registrarSessaoGolden — la Hora Cheia
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaSessaoGolden {
  vendor: string
  /**
   * FK a `vendors.id`. A diferencia de `tasks`, `public.golden_sessions` NO
   * tiene trigger que la complete a partir del nombre: sin este campo la
   * columna queda null para siempre en todo lo que escribe la app.
   */
  vendorId?: number | null
  day: IsoDate
  iniciadaEm: string
  terminadaEm: string
  duracaoSegundos: number
  toques: number
  conversas: number
  reunioes: number
  puladas: number
  metaToques: number
  horaCheia: boolean
  /** {melhor_conversa, objecao_frequente, o_que_muda}. */
  debrief?: Record<string, string> | null
  superficie?: 'app' | 'telegram' | 'tma'
}

/**
 * Cierra la sesión de Golden Hour.
 *
 * NO es un insert append-only como `activities`: la tabla real se llama
 * `golden_sessions` (nunca `golden_hour_sessions`, que no existe en
 * Postgres) y tiene `unique (vendor, dia)` — `api/dispatch/jobs.ts` YA
 * escribió la fila del día la víspera a las 18h, con la `fila` aprobada y
 * cero resultados. Si esto insertara una fila nueva, chocaría contra ese
 * UNIQUE (23505), el outbox lo clasifica como 'duplicado' —éxito
 * disfrazado— y el resultado real de la hora (toques, debrief, hora_cheia)
 * nunca llegaría al servidor. Por eso viaja como upsert por la clave natural
 * (vendor, dia) y no por id: ver `transport.ts` (UPSERT_POR_TABELA). Los
 * nombres de columna son los reales de `public.golden_sessions`, verificados
 * por MCP — ninguno coincide por casualidad con el inglés de `EntradaSessaoGolden`.
 */
export async function registrarSessaoGolden(entrada: EntradaSessaoGolden): Promise<string> {
  const uuid = novoClientUuid()

  await encolarEDisparar({
    id: uuid,
    tabla: 'golden_sessions',
    op: 'insert',
    row_id: null,
    campos_tocados: [],
    payload: {
      vendor: entrada.vendor,
      vendor_id: entrada.vendorId ?? null,
      dia: entrada.day,
      inicio: entrada.iniciadaEm,
      fim: entrada.terminadaEm,
      duracao_segundos: entrada.duracaoSegundos,
      toques: entrada.toques,
      conversas: entrada.conversas,
      agendamentos: entrada.reunioes,
      pulados: entrada.puladas,
      meta_toques: entrada.metaToques,
      hora_cheia: entrada.horaCheia,
      debrief: entrada.debrief ?? null,
      superficie: entrada.superficie ?? 'app',
    },
  })
  return uuid
}

/* ══════════════════════════════════════════════════════════════════════════
   11 · atualizarContatos — SOLO rellena huecos, nunca pisa
   ══════════════════════════════════════════════════════════════════════════ */

/** Los cuatro papeles de contacto que `public.opportunities` guarda en texto. */
export const PAPEIS_CONTATO = [
  'power_sponsor',
  'sponsor',
  'influencer',
  'support_contact',
] as const

export type PapelContato = (typeof PAPEIS_CONTATO)[number]

export const PAPEL_CONTATO_LABELS: Readonly<Record<PapelContato, string>> = {
  power_sponsor: 'Power sponsor',
  sponsor: 'Sponsor',
  influencer: 'Influenciador',
  support_contact: 'Contato de apoio',
}

export interface EntradaContatos {
  opportunityId: number
  vendor: string
  /** Papel → nombre (y cargo, si vino). Se ignora todo lo que ya tenga valor. */
  contatos: Partial<Record<PapelContato, string>>
}

/** Un texto cuenta como «hueco» si es null, vacío o solo espacios. */
function ehVazio(valor: string | null | undefined): boolean {
  return valor === null || valor === undefined || valor.trim() === ''
}

/**
 * Rellena los contactos POR PAPEL que estén vacíos, y nada más.
 *
 * La regla no es una cortesía: la extracción de una nota de voz acierta el
 * nombre pero se equivoca de papel con facilidad («falei com o Marcelo» no
 * dice si Marcelo es el power sponsor o el comprador). Pisar un contacto que
 * el vendedor cargó a mano por lo que dedujo un modelo es exactamente cómo un
 * CRM pierde la confianza del equipo, y recuperarla cuesta meses.
 *
 * Devuelve los papeles efectivamente escritos: la UI avisa cuáles ignoró.
 */
export async function atualizarContatos(entrada: EntradaContatos): Promise<PapelContato[]> {
  const db = getDb()
  const opp = await db.opportunities.get(entrada.opportunityId)
  if (!opp) return []

  const ts = agora()
  const mudancas: Record<string, string> = {}
  const escritos: PapelContato[] = []

  for (const papel of PAPEIS_CONTATO) {
    const proposto = entrada.contatos[papel]
    if (proposto === undefined || proposto.trim() === '') continue
    if (!ehVazio(opp[papel])) continue
    mudancas[papel] = proposto.trim()
    escritos.push(papel)
  }

  if (escritos.length === 0) return []

  await db.opportunities.put({ ...opp, ...mudancas, last_update: ts })

  await encolarEDisparar({
    id: novoClientUuid(),
    tabla: 'opportunities',
    op: 'update',
    row_id: entrada.opportunityId,
    campos_tocados: escritos,
    ts_por_campo: Object.fromEntries(escritos.map((c) => [c, ts])),
    payload: mudancas,
  })

  return escritos
}

/* ══════════════════════════════════════════════════════════════════════════
   12 · agendarProximaAcao — darle fecha a lo que no la tiene
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaProximaAcao {
  opportunityId: number
  /** Nueva fecha de la próxima acción. Obligatoria: sin fecha no existe. */
  ate: IsoDate
  /** Texto de la acción. Si no viene y la oportunidad no tiene ninguno, se pone uno. */
  acao?: string | null
}

/** Lo que se escribe cuando el vendedor adia sin decir qué va a hacer. */
const ACAO_PADRAO = 'Retomar contato'

/**
 * Pone (o corre) la fecha de la próxima acción de una oportunidad.
 *
 * Es lo que hace el swipe «Adiar» de la Carteira, y no es cosmético: 51 de 54
 * oportunidades vivas del v2 no tienen `next_action_date`, así que la mitad de
 * la cartera es invisible para cualquier motor que ordene por urgencia. Adiar
 * desde la lista es el camino más barato que existe para darle fecha a una.
 *
 * `next_action_date` no dispara el trigger `enforce_stage_gates` (verificado:
 * ese trigger tiene `when (new.stage is distinct from old.stage)`), así que
 * este update nunca puede ser rechazado por el gate documental del v2.
 */
export async function agendarProximaAcao(entrada: EntradaProximaAcao): Promise<void> {
  const db = getDb()
  const opp = await db.opportunities.get(entrada.opportunityId)
  const ts = agora()

  const textoAtual = opp?.next_action ?? null
  const texto =
    entrada.acao !== undefined && entrada.acao !== null && entrada.acao.trim() !== ''
      ? entrada.acao.trim()
      : textoAtual !== null && textoAtual.trim() !== ''
        ? textoAtual
        : ACAO_PADRAO

  const campos = ['next_action', 'next_action_date']

  if (opp) {
    await db.opportunities.put({
      ...opp,
      next_action: texto,
      next_action_date: entrada.ate,
      updated_at: ts,
    })
  }

  await encolarEDisparar({
    id: novoClientUuid(),
    tabla: 'opportunities',
    op: 'update',
    row_id: entrada.opportunityId,
    campos_tocados: campos,
    ts_por_campo: Object.fromEntries(campos.map((c) => [c, ts])),
    payload: { next_action: texto, next_action_date: entrada.ate },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   13 · assumirOportunidade — sacar del pool y ponerlo en la propia cartera
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaAssumir {
  /** La fila completa: viene del pool, que NO está espejado en Dexie. */
  oportunidade: Opportunity
  vendor: string
}

/**
 * Asume una oportunidad sin dueño.
 *
 * La copia optimista se escribe entera en Dexie porque la fila no estaba: el
 * pool se lee de la red y vive solo en el cache de TanStack. Escribirla con el
 * vendedor puesto es lo que hace que aparezca en la Carteira en el mismo frame
 * del tap, incluso antes de que el update llegue al servidor.
 */
export async function assumirOportunidade(entrada: EntradaAssumir): Promise<void> {
  const ts = agora()

  await getDb().opportunities.put({
    ...entrada.oportunidade,
    vendor: entrada.vendor,
    updated_at: ts,
  })

  await encolarEDisparar({
    id: novoClientUuid(),
    tabla: 'opportunities',
    op: 'update',
    row_id: entrada.oportunidade.id,
    campos_tocados: ['vendor'],
    ts_por_campo: { vendor: ts },
    payload: { vendor: entrada.vendor },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Claves de mutación y defaults
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Las claves son parte del contrato: setMutationDefaults las usa para volver a
 * atar la mutationFn después de un reload. SIN ESTO, una mutación pausada
 * (offline) nunca se reanuda al reabrir la app — y ese es exactamente el caso
 * de uso central del producto.
 */
export const MUTATION_KEYS = {
  registrarAtividade: ['registrarAtividade'] as const,
  criarTask: ['criarTask'] as const,
  concluirTask: ['concluirTask'] as const,
  adiarTask: ['adiarTask'] as const,
  atualizarEscala: ['atualizarEscala'] as const,
  avancarEtapa: ['avancarEtapa'] as const,
  registrarTouchpoint: ['registrarTouchpoint'] as const,
  converterLead: ['converterLead'] as const,
  promoverDoSweep: ['promoverDoSweep'] as const,
  registrarSessaoGolden: ['registrarSessaoGolden'] as const,
  atualizarContatos: ['atualizarContatos'] as const,
  agendarProximaAcao: ['agendarProximaAcao'] as const,
  assumirOportunidade: ['assumirOportunidade'] as const,
} as const

/** Claves de query que invalida cada mutación al terminar. */
const INVALIDA: Readonly<Record<keyof typeof MUTATION_KEYS, readonly string[]>> = {
  registrarAtividade: ['dossie', 'carteira', 'plano', 'rings'],
  criarTask: ['plano', 'carteira', 'dossie'],
  concluirTask: ['plano', 'carteira', 'dossie', 'rings'],
  adiarTask: ['plano', 'carteira'],
  atualizarEscala: ['dossie', 'carteira', 'plano'],
  avancarEtapa: ['dossie', 'carteira', 'plano', 'rings'],
  registrarTouchpoint: ['cadencia', 'golden', 'rings', 'plano'],
  converterLead: ['cadencia', 'carteira', 'golden'],
  promoverDoSweep: ['cadencia', 'golden'],
  registrarSessaoGolden: ['rings', 'placar'],
  atualizarContatos: ['dossie', 'carteira'],
  agendarProximaAcao: ['carteira', 'plano', 'dossie'],
  // 'pool' además de 'carteira': la fila sale de una lista y entra en la otra.
  assumirOportunidade: ['carteira', 'pool', 'plano'],
}

/**
 * Registra la mutationFn de cada clave en el QueryClient.
 * Llamarla UNA vez, antes de hidratar el cache persistido.
 */
export function registrarMutationDefaults(queryClient: QueryClient): void {
  const registrar = <TVars>(
    chave: readonly string[],
    fn: (vars: TVars) => Promise<unknown>,
    invalida: readonly string[],
  ): void => {
    queryClient.setMutationDefaults(chave, {
      mutationFn: (vars: TVars) => fn(vars),
      onSettled: () => {
        for (const raiz of invalida) void queryClient.invalidateQueries({ queryKey: [raiz] })
      },
    })
  }

  registrar(MUTATION_KEYS.registrarAtividade, registrarAtividade, INVALIDA.registrarAtividade)
  registrar(MUTATION_KEYS.criarTask, criarTask, INVALIDA.criarTask)
  registrar(MUTATION_KEYS.concluirTask, concluirTask, INVALIDA.concluirTask)
  registrar(MUTATION_KEYS.adiarTask, adiarTask, INVALIDA.adiarTask)
  registrar(MUTATION_KEYS.atualizarEscala, atualizarEscala, INVALIDA.atualizarEscala)
  registrar(MUTATION_KEYS.avancarEtapa, avancarEtapa, INVALIDA.avancarEtapa)
  registrar(MUTATION_KEYS.registrarTouchpoint, registrarTouchpoint, INVALIDA.registrarTouchpoint)
  registrar(MUTATION_KEYS.converterLead, converterLead, INVALIDA.converterLead)
  registrar(MUTATION_KEYS.promoverDoSweep, promoverDoSweep, INVALIDA.promoverDoSweep)
  registrar(
    MUTATION_KEYS.registrarSessaoGolden,
    registrarSessaoGolden,
    INVALIDA.registrarSessaoGolden,
  )
  registrar(MUTATION_KEYS.atualizarContatos, atualizarContatos, INVALIDA.atualizarContatos)
  registrar(MUTATION_KEYS.agendarProximaAcao, agendarProximaAcao, INVALIDA.agendarProximaAcao)
  registrar(
    MUTATION_KEYS.assumirOportunidade,
    assumirOportunidade,
    INVALIDA.assumirOportunidade,
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Hooks
   ══════════════════════════════════════════════════════════════════════════ */

// Los hooks NO declaran mutationFn: la toman de los defaults por mutationKey.
// Es lo que permite que una mutación encolada offline se reanude sola tras un
// reload de la app.

export function useRegistrarAtividade(): UseMutationResult<string, Error, EntradaAtividade> {
  return useMutation<string, Error, EntradaAtividade>({
    mutationKey: MUTATION_KEYS.registrarAtividade,
  })
}

export function useCriarTask(): UseMutationResult<string, Error, EntradaTask> {
  return useMutation<string, Error, EntradaTask>({ mutationKey: MUTATION_KEYS.criarTask })
}

export function useConcluirTask(): UseMutationResult<void, Error, EntradaConcluirTask> {
  return useMutation<void, Error, EntradaConcluirTask>({ mutationKey: MUTATION_KEYS.concluirTask })
}

export function useAdiarTask(): UseMutationResult<void, Error, EntradaAdiarTask> {
  return useMutation<void, Error, EntradaAdiarTask>({ mutationKey: MUTATION_KEYS.adiarTask })
}

export function useAtualizarEscala(): UseMutationResult<void, Error, EntradaEscala> {
  return useMutation<void, Error, EntradaEscala>({ mutationKey: MUTATION_KEYS.atualizarEscala })
}

export function useAvancarEtapa(): UseMutationResult<void, Error, EntradaEtapa> {
  return useMutation<void, Error, EntradaEtapa>({ mutationKey: MUTATION_KEYS.avancarEtapa })
}

export function useRegistrarTouchpoint(): UseMutationResult<string, Error, EntradaTouchpoint> {
  return useMutation<string, Error, EntradaTouchpoint>({
    mutationKey: MUTATION_KEYS.registrarTouchpoint,
  })
}

export function useConverterLead(): UseMutationResult<void, Error, EntradaConversao> {
  return useMutation<void, Error, EntradaConversao>({ mutationKey: MUTATION_KEYS.converterLead })
}

export function usePromoverDoSweep(): UseMutationResult<void, Error, EntradaPromocao> {
  return useMutation<void, Error, EntradaPromocao>({ mutationKey: MUTATION_KEYS.promoverDoSweep })
}

export function useRegistrarSessaoGolden(): UseMutationResult<string, Error, EntradaSessaoGolden> {
  return useMutation<string, Error, EntradaSessaoGolden>({
    mutationKey: MUTATION_KEYS.registrarSessaoGolden,
  })
}

export function useAtualizarContatos(): UseMutationResult<
  PapelContato[],
  Error,
  EntradaContatos
> {
  return useMutation<PapelContato[], Error, EntradaContatos>({
    mutationKey: MUTATION_KEYS.atualizarContatos,
  })
}

export function useAgendarProximaAcao(): UseMutationResult<void, Error, EntradaProximaAcao> {
  return useMutation<void, Error, EntradaProximaAcao>({
    mutationKey: MUTATION_KEYS.agendarProximaAcao,
  })
}

export function useAssumirOportunidade(): UseMutationResult<void, Error, EntradaAssumir> {
  return useMutation<void, Error, EntradaAssumir>({
    mutationKey: MUTATION_KEYS.assumirOportunidade,
  })
}
