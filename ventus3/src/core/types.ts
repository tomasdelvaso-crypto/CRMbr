// src/core/types.ts
// Tipos del dominio Ventus v3. Reflejan el esquema real de Supabase
// (proyecto wtrbvgqxgcfjacqcndmb) más los tipos derivados que produce el
// motor determinístico. Isomórfico: no importa nada de red ni del DOM.

/* ══════════════════════════════════════════════════════════════════════════
   Escalas PPVVCC
   ══════════════════════════════════════════════════════════════════════════ */

/** Las 6 escalas de la metodología, en orden canónico. */
export type ScaleKey = 'dor' | 'poder' | 'visao' | 'valor' | 'controle' | 'compras'

/** Nivel válido de una escala: entero 0..10. */
export type ScaleLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** Aliases legados en inglés que todavía aparecen en registros viejos. */
export type LegacyScaleKey = 'pain' | 'power' | 'vision' | 'value' | 'control' | 'purchase'

/** Valor de una escala tal como está guardado en opportunities.scales (jsonb). */
export interface ScaleValue {
  score: number
  description?: string
  /** Cita textual que justifica el nivel. Exigida por encima de 5. */
  evidence?: string
  /** Quién lo dijo (nombre + cargo), para poder auditar la evidencia. */
  evidence_source?: string
  /** ISO date de cuándo se registró la evidencia. */
  evidence_at?: string
  /** Vendedor que movió la escala. */
  updated_by?: string
  updated_at?: string
}

/**
 * El jsonb crudo: puede traer number suelto, objeto, alias en inglés o nada.
 * Nunca leerlo directo — usar getScale/getScaleValue de ppvvcc.ts.
 */
export type ScalesRecord = Partial<Record<ScaleKey | LegacyScaleKey, ScaleValue | number | null>>

/** Las 6 escalas ya normalizadas a número. */
export type ScaleScores = Record<ScaleKey, number>

/** Un nivel del catálogo de definiciones (11 por escala). */
export interface ScaleDefinition {
  level: ScaleLevel
  text: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Funil de oportunidades (6 etapas)
   ══════════════════════════════════════════════════════════════════════════ */

/** Id de etapa del funil: 1 Prospecção … 6 Fechado. */
export type StageId = 1 | 2 | 3 | 4 | 5 | 6

export type StageName =
  | 'Prospecção'
  | 'Qualificação'
  | 'Apresentação'
  | 'Validação/Teste'
  | 'Negociação'
  | 'Fechado'

export interface Stage {
  id: StageId
  name: StageName
  probability: number
  requirements: readonly string[]
}

/** Requisito mínimo de escala para SALIR de una etapa. */
export interface StageGate {
  scale: ScaleKey
  min: number
}

/** Resultado de evaluar los gates de una etapa. */
export interface GateCheck {
  stage: StageId
  passed: boolean
  /** Gates incumplidos, con el valor actual, para poder redactar el mensaje. */
  blocking: Array<StageGate & { current: number }>
}

/* ══════════════════════════════════════════════════════════════════════════
   Produtos
   ══════════════════════════════════════════════════════════════════════════ */

export type ProductLine =
  | 'better_pack'
  | 'better_pack_venom'
  | 'ecomfill_resmas'
  | 'ecombag'
  | 'servico_manutencao'

/* ══════════════════════════════════════════════════════════════════════════
   Oportunidade (public.opportunities)
   ══════════════════════════════════════════════════════════════════════════ */

export type Priority = 'baixa' | 'media' | 'alta'
export type Outcome = 'won' | 'lost' | 'abandoned'

export interface Opportunity {
  id: number
  created_at: string
  name: string | null
  client: string | null
  /** Nombre del vendedor (texto, no FK — así está en producción). */
  vendor: string | null
  value: number | null
  stage: StageId | null
  priority: Priority | string | null
  expected_close: string | null
  next_action: string | null
  next_action_date: string | null
  product: string | null
  product_lines: ProductLine[] | null
  power_sponsor: string | null
  sponsor: string | null
  influencer: string | null
  support_contact: string | null
  probability: number | null
  last_update: string | null
  last_activity_date: string | null
  scales: ScalesRecord | null
  /** Columna legada (38/65 desincronizadas). Preferir calculateHealthScore. */
  health_score: number | null
  is_stalled: boolean | null
  industry: string | null
  loss_reason: string | null
  outcome: Outcome | null
  outcome_notes: string | null
  updated_at: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Atividade (public.activities)
   ══════════════════════════════════════════════════════════════════════════ */

export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'whatsapp'
  | 'linkedin'
  | 'demo'
  | 'test'
  | 'proposal'
  | 'negotiation'
  | 'note'
  | 'ai_suggestion'
  | 'stage_change'

export type ActivitySource = 'manual' | 'ai_parsed' | 'ai_generated' | 'system'

export interface Activity {
  id: number
  opportunity_id: number
  vendor: string
  created_at: string | null
  activity_date: string | null
  activity_type: ActivityType
  description: string
  result: string | null
  stage_at_time: number | null
  /** Código del cookbook, ej. '3B'. Ver methodology.ts. */
  methodology_code: string | null
  ai_suggested_action: string | null
  ai_suggested_scales: ScalesRecord | null
  ai_confidence: number | null
  next_action: string | null
  next_action_date: string | null
  next_action_done: boolean | null
  source: ActivitySource | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Funil de prospecção: leads e touchpoints
   ══════════════════════════════════════════════════════════════════════════ */

/** 1a empresa identificada · 1b contato · 1c interesse · 1d reunião agendada. */
export type LeadStage = '1a' | '1b' | '1c' | '1d'
export type LeadStatus = 'active' | 'archived' | 'converted'
export type Channel = 'linkedin' | 'whatsapp' | 'email' | 'phone'

export interface Lead {
  id: number
  vendor: string
  source: string | null
  company_name: string
  company_domain: string | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  contact_phone: string | null
  contact_whatsapp: string | null
  contact_linkedin: string | null
  active_channels: Channel[] | null
  stage: LeadStage
  status: LeadStatus
  /** 0..7 — cuántos toques de la cadencia ya se ejecutaron. */
  touchpoints_count: number
  next_touchpoint_date: string | null
  last_touchpoint_date: string | null
  opportunity_id: number | null
  notes: string | null
  archived_at: string | null
  recycle_after: string | null
  created_at: string
  updated_at: string
}

export type TouchpointResult =
  | 'no_response'
  | 'interested'
  | 'not_now'
  | 'not_interested'
  | 'meeting_scheduled'
  | 'other'

/** Número de toque dentro de la cadencia de 7. */
export type TouchpointSeq = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface Touchpoint {
  id: number
  lead_id: number
  sequence_number: TouchpointSeq
  channel: Channel
  result: TouchpointResult
  notes: string | null
  executed_at: string
}

/** Una entrada del CADENCE_SCHEDULE: TP n, día n, canal y objetivo. */
export interface CadenceStep {
  tp: TouchpointSeq
  /** Día del ciclo desde el TP1: 1, 3, 6, 10, 13, 17, 21. */
  day: number
  channel: Channel
  label: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Vendedor (public.vendors)
   ══════════════════════════════════════════════════════════════════════════ */

export interface Vendor {
  id: number
  name: string
  email: string | null
  role: string | null
  phone: string | null
  is_admin: boolean | null
  is_active: boolean | null
  monthly_target: number | null
  auth_user_id: string | null
  auth_id: string | null
  telegram_id: number | null
  telegram_username: string | null
  created_at: string | null
}

/** Metas semanales autodefinidas (cookbook). Ver Ajustes. */
export interface Cookbook {
  vendor: string
  touches_per_week: number
  conversations_per_week: number
  meetings_per_week: number
  advances_per_week: number
  /** Frase si-entonces de la Golden Hour, ej. 'Se são 9h de terça, eu…'. */
  golden_hour_cue: string | null
  golden_hour_days: number[]
  golden_hour_start: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Compromissos (public.commitments)
   ══════════════════════════════════════════════════════════════════════════ */

export type CommitmentType = 'opportunity' | 'prospecting' | 'general'
export type CommitmentStatus = 'pending' | 'done' | 'partial' | 'missed' | 'cancelled'

export interface Commitment {
  id: number
  opportunity_id: number | null
  lead_id: number | null
  vendor: string
  committed_action: string
  due_date: string | null
  /** Segunda-feira de la semana del compromiso. */
  week_of: string
  commitment_type: CommitmentType | null
  source_file: string | null
  status: CommitmentStatus
  verdict_notes: string | null
  evidence_activity_ids: number[] | null
  evaluated_at: string | null
  created_at: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Notificações (public.notifications)
   ══════════════════════════════════════════════════════════════════════════ */

export type Severity = 'info' | 'warning' | 'critical'

export interface Notification {
  id: number
  created_at: string | null
  opportunity_id: number | null
  vendor: string
  type: string
  severity: Severity | string
  message: string
  days_inactive: number | null
  read: boolean | null
  read_at: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Mapa de mercado (public.market_sweep)
   ══════════════════════════════════════════════════════════════════════════ */

export interface MarketSweepEntry {
  id: number
  company_name: string
  name_normalized: string
  cnpj_raiz: string | null
  domain_normalized: string | null
  city: string | null
  uf: string | null
  ring: number | null
  corridor: string | null
  sector: string | null
  size_employees: number | null
  target_line: ProductLine | string | null
  vendor: string | null
  status: string
  lote: string | null
  recycle_after: string | null
  source: string | null
  discard_reason: string | null
  crm_lead_id: number | null
  crm_opportunity_id: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Tarefas — la unidad accionable que consume a pantalla Hoje
   ══════════════════════════════════════════════════════════════════════════ */

export type TaskKind =
  | 'touchpoint'
  | 'next_action'
  | 'scale_evidence'
  | 'commitment'
  | 'stage_gate'
  | 'reactivate'
  | 'ritual'

export type TaskStatus = 'pending' | 'done' | 'snoozed' | 'dismissed'

/**
 * Vocabulario de `tasks.canal` en Postgres (CHECK `tasks_canal_chk`).
 *
 * NO es `Channel`: aquel es el canal de un toque de cadencia ('phone' incluido,
 * 'meeting' no) y éste es el medio por el que se hace la próxima acción. Que se
 * parezcan es la trampa — mandar 'phone' acá viola el CHECK y el ítem del
 * outbox queda en 'erro' para siempre.
 */
export type CanalTarefa =
  | 'call'
  | 'whatsapp'
  | 'email'
  | 'linkedin'
  | 'meeting'
  | 'visit'
  | 'demo'
  | 'proposal'
  | 'other'

/** Vocabulario de `tasks.origem` (CHECK `tasks_origem_chk`). Quién la creó. */
export type OrigemTarefa = 'manual' | 'ia' | 'bot' | 'cron' | 'planner'

/** Prioridad de `tasks.prioridade`: 1 = arriba de todo (CHECK 1..3). */
export type PrioridadeTarefa = 1 | 2 | 3

/** Referencia polimórfica a la entidad sobre la que se actúa. */
export type EntityRef =
  | { kind: 'opportunity'; id: number }
  | { kind: 'lead'; id: number }
  | { kind: 'commitment'; id: number }

export interface Task {
  id: string
  vendor: string
  kind: TaskKind
  target: EntityRef
  /** Texto imperativo en PT-BR, ej. 'Ligar para o Marcelo da Tetra'. */
  title: string
  due_date: string | null
  status: TaskStatus
  snoozed_until: string | null
  created_at: string

  /* ── Columnas de public.tasks que el motor no usa para rankear ──────────
     Viajan intactas en los dos sentidos: el pull las deja como vinieron y el
     outbox las manda cuando la mutación las tiene. Opcionales porque una fila
     vieja —o una recién creada offline— puede no traerlas. */
  /** Medio por el que se hace la próxima acción. */
  canal?: CanalTarefa | null
  prioridade?: PrioridadeTarefa | null
  /** Escala del cookbook que esta tarea busca subir. */
  target_scale?: ScaleKey | null
  /** Borrador del mensaje/e-mail, listo para copiar. */
  draft_content?: string | null
  /** Qué tiene que quedar cierto cuando esté hecha. */
  expected_outcome?: string | null
  origem?: OrigemTarefa | null
  created_by?: string | null
  /** Instante en que se marcó hecha. Obligatorio si status='done' (CHECK). */
  done_at?: IsoDateTime | null
  /**
   * FK a `vendors.id`. Opcional porque una fila vieja del pull puede no
   * traerla, y porque el servidor la completa solo (`trg_tasks_before_write`)
   * a partir de `vendor` cuando llega null.
   */
  vendor_id?: number | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Salida del motor determinístico (planner.ts / risk.ts)
   ══════════════════════════════════════════════════════════════════════════ */

/** Por qué el motor eligió esta acción. Estructurado, nunca prosa libre. */
export interface RankReason {
  code:
    | 'gate_blocked'
    | 'no_contact'
    | 'task_overdue'
    | 'touchpoint_late'
    | 'high_value'
    | 'single_threaded'
    | 'commitment_due'
    | 'closing_soon'
  /** Texto ya en PT-BR para el chip «Por que isto?». */
  label: string
  /** Aporte de este factor al score final. */
  weight: number
}

export interface RankedAction {
  /** Identificador estable del día, para deduplicar y para el undo. */
  id: string
  target: EntityRef
  /** Nombre visible del cliente o empresa. */
  clientLabel: string
  /** La acción concreta a ejecutar, en PT-BR imperativo. */
  action: string
  score: number
  reasons: RankReason[]
  /** Escala que esta acción busca mover, si aplica. */
  targetScale: ScaleKey | null
  /** Preguntas SPIN listas para copiar. */
  suggestedQuestions: string[]
  /** Canal sugerido cuando el target es un lead en cadencia. */
  channel: Channel | null
}

export type RiskCode =
  | 'single_threaded'
  | 'silence_late_stage'
  | 'scale_regression'
  | 'false_gate'
  | 'action_overdue'
  | 'proposal_no_answer'

export interface DealRisk {
  code: RiskCode
  severity: Severity
  /** Mensaje en PT-BR, accionable. */
  message: string
  opportunityId: number
}

/* ══════════════════════════════════════════════════════════════════════════
   Gamificação (scoring.ts)
   ══════════════════════════════════════════════════════════════════════════ */

export type RingKey = 'contato' | 'conversa' | 'avanco'

export interface RingProgress {
  key: RingKey
  current: number
  goal: number
  /** 0..1 ya saturado. */
  ratio: number
}

export interface DailyScore {
  vendor: string
  /** Fecha local BRT en formato YYYY-MM-DD. */
  date: string
  rings: Record<RingKey, RingProgress>
  /** Pontos de Avanço del día, ya con techo aplicado. */
  points: number
  /** Racha de Golden Hour en días hábiles. */
  streak: number
  shields: number
}

export type TrophyKey = 'motor' | 'escalador' | 'conversador' | 'zelador' | 'reanimador'

/* ══════════════════════════════════════════════════════════════════════════
   SPIN
   ══════════════════════════════════════════════════════════════════════════ */

export type SpinCategory = 'situacao' | 'problema' | 'implicacao' | 'necessidade'

export interface SpinQuestion {
  scale: ScaleKey
  category: SpinCategory
  text: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Propose-then-commit (escrituras del agente)
   ══════════════════════════════════════════════════════════════════════════ */

export type Confidence = 'alta' | 'media' | 'baixa'

/** Alias PT-BR: es el nombre que usa la columna `confianca` de la tabla. */
export type Confianca = Confidence

/** Una propuesta de cambio de UN campo, revisable en la bandeja Revisão. */
export interface FieldProposal<T = unknown> {
  field: string
  oldValue: T
  newValue: T
  /** Cita textual que la justifica. Sin cita, la confianza nunca es alta. */
  quote: string | null
  sourceKind: 'audio' | 'email' | 'meeting' | 'whatsapp' | 'manual'
  confidence: Confidence
}

/* ── public.ventus_actions ───────────────────────────────────────────────── */

/**
 * Estados del ciclo propose-then-commit.
 * Espeja el CHECK ventus_actions_status_chk de 0003_ventus_actions.sql.
 */
export type VentusActionStatus = 'proposed' | 'committed' | 'dismissed' | 'expired'

/** Superficie desde la que se propuso. CHECK ventus_actions_surf_chk. */
export type VentusSurface = 'app' | 'telegram' | 'tma' | 'cron'

/** Entidades sobre las que el Ventus puede proponer. CHECK ventus_actions_kind_chk. */
export type VentusEntityKind =
  | 'opportunity'
  | 'lead'
  | 'task'
  | 'touchpoint'
  | 'activity'
  | 'market_sweep'

/**
 * Por qué el vendedor descartó la propuesta. CHECK ventus_actions_dismiss_chk.
 * 'dado_errado' es el único que además dispara revisión del prompt: los otros
 * tres son decisiones legítimas del humano, no fallos del modelo.
 */
export type DismissReason = 'dado_errado' | 'ja_fiz' | 'nao_e_prioridade' | 'outro'

/**
 * Herramientas que el Ventus puede proponer.
 *
 * OJO: la tabla NO tiene CHECK sobre `tipo` — 0003 lo dejó abierto a propósito
 * para no tener que migrar la base cada vez que el bot gana una tool. Esta
 * unión es el contrato del CLIENTE: el mapeo ventus_actions → RevisaoItem
 * descarta lo que no reconoce en vez de pintar una tarjeta que no sabe rendir.
 */
export type VentusActionKind =
  | 'criar_task'
  | 'atualizar_escala'
  | 'avancar_etapa'
  | 'registrar_touchpoint'
  | 'registrar_atividade'
  | 'converter_lead'
  | 'promover_do_sweep'
  | 'arquivar_lead'

/**
 * Fila de public.ventus_actions, tal cual está en la base.
 *
 * Vive en core y no en src/data porque la escriben TRES productores —la app,
 * el bot de Telegram y los jobs de pg_cron— y los tres tienen que estar de
 * acuerdo en la forma. Es el mirror de la tabla: nombres snake_case y tipos
 * de Postgres, sin adornos. La forma que consume la pantalla es RevisaoItem.
 */
export interface VentusAction {
  id: string
  vendor: string
  vendor_id: number | null
  tipo: VentusActionKind
  /** Argumentos de la tool. Su forma depende de `tipo`. */
  payload: Record<string, unknown>
  /** Señales que justifican la propuesta — el «Por que isto?» de la tarjeta. */
  evidencia: Record<string, unknown> | null
  confianca: Confianca
  /** Huella del estado previo. Si cambió, el commit se rechaza por staleness. */
  precondition_hash: string | null
  idempotency_key: string
  status: VentusActionStatus
  entity_kind: VentusEntityKind | null
  /** TEXTO en la base: conviven ids bigint (opportunities) y uuid (tasks). */
  entity_id: string | null
  superficie: VentusSurface | null
  motivo: string | null
  /** Lo que devolvió la ejecución, una vez commiteada. */
  resultado: Record<string, unknown> | null
  expires_at: IsoDateTime
  created_at: IsoDateTime
  committed_at: IsoDateTime | null
  dismissed_at: IsoDateTime | null
  dismissed_reason: DismissReason | null
}

/**
 * Un ítem de la bandeja Revisão: la propuesta ya resuelta para pintarla.
 *
 * NO es la fila: es su proyección. La tarjeta necesita el nombre del cliente y
 * el valor ACTUAL de cada campo, que en la tabla no están (`entity_id` es un
 * id suelto y `payload` solo trae el valor propuesto). El mapeo cruza la
 * acción con la copia local de la entidad — por eso vive del lado del cliente
 * y por eso el vendedor acepta o descarta POR CAMPO, no la propuesta entera.
 *
 * Se comparte con la Telegram Mini App, que pinta la misma bandeja.
 */
export interface RevisaoItem {
  /** El id de la fila de ventus_actions: es lo que se commitea o descarta. */
  id: string
  vendor: string
  tipo: VentusActionKind
  /** Entidad ya resuelta a nombre y cliente — la misma que usa PlannedAction. */
  entidade: EntidadeRef
  /** Un campo por fila de la tarjeta, cada uno aceptable por separado. */
  campos: FieldProposal[]
  /** Explicación en PT-BR, mostrable tal cual. */
  motivo: string
  confianca: Confianca
  precondition_hash: string | null
  criado_em: IsoDateTime
  expira_em: IsoDateTime | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Utilitarios
   ══════════════════════════════════════════════════════════════════════════ */

/** Fecha sin hora, formato YYYY-MM-DD, siempre en huso America/Sao_Paulo. */
export type IsoDate = string
/** Instante completo ISO-8601 con offset. */
export type IsoDateTime = string

/** Origen de un evento del timeline unificado. */
export type EventOrigin = 'voz' | 'bot' | 'manual' | 'whatsapp'

/* ══════════════════════════════════════════════════════════════════════════
   Alias en PT-BR / ES para el vocabulario del dominio.
   La UI y el bot hablan portugués; los tipos de arriba nacieron en inglés
   porque replican el esquema de Supabase. Estos alias son el mismo tipo con
   el nombre que usa el equipo — no hay conversión ni costo en runtime.
   ══════════════════════════════════════════════════════════════════════════ */

/** Igual que ScaleValue: una escala tal como está en el jsonb. */
export type Scale = ScaleValue
/** Igual que ScalesRecord: el jsonb crudo de opportunities.scales. */
export type Scales = ScalesRecord
/** Igual que Channel: linkedin | whatsapp | email | phone. */
export type Canal = Channel
/** Igual que MarketSweepEntry: una fila del mapa de mercado. */
export type MarketSweepRow = MarketSweepEntry

/* ══════════════════════════════════════════════════════════════════════════
   Evidência (M6) — la prueba que sostiene el nivel de una escala
   ══════════════════════════════════════════════════════════════════════════ */

/** De dónde salió la prueba. Determina cuánta confianza merece. */
export type EvidenceKind =
  | 'quote'      // cita textual del cliente
  | 'audio'      // nota de voz transcripta
  | 'email'      // correo recibido
  | 'document'   // archivo adjunto (proposta, ata, specs)
  | 'meeting'    // acta de reunión
  | 'system'     // derivado de otro registro (ej. touchpoint)

/**
 * Una prueba fechada de que una escala está donde dice estar.
 * Sin evidencia de los últimos EVIDENCE_FRESH_DAYS la escala cuenta 0 en el
 * health verificado — ver healthVerificado() en ppvvcc.ts.
 */
export interface Evidence {
  id: string
  opportunity_id: number
  scale: ScaleKey
  /** Nivel que esta prueba sostiene. */
  level: number
  kind: EvidenceKind
  /** Cita textual. Obligatoria por encima del nivel 5. */
  quote: string
  /** Quién lo dijo: nombre y cargo. Sin fuente no es prueba, es opinión. */
  source_name: string | null
  source_title: string | null
  /** Fecha del hecho probado (no la de carga). */
  occurred_at: IsoDate
  created_at: IsoDateTime
  created_by: string
  /** Revisada y aceptada en la bandeja Revisão. */
  verified: boolean | null
}

/** Salida de healthVerificado(): el número honesto junto al declarado. */
export interface HealthVerificado {
  /** Media simple de las 6 escalas tal como las declaró el vendedor. */
  declarado: number
  /** Misma media, pero las escalas sin prueba fresca cuentan 0. */
  verificado: number
  /** Escalas sin evidencia fresca, en orden canónico. */
  escalasSemProva: ScaleKey[]
  /** Escalas con prueba vigente, con la antigüedad de la prueba en días. */
  escalasComProva: Array<{ escala: ScaleKey; nivel: number; idadeDias: number }>
}

/** Salida de gateFaltante(): qué falta para salir de la etapa actual. */
export interface GateFaltante {
  stage: StageId
  stageName: StageName
  escala: ScaleKey
  minimo: number
  atual: number
  falta: number
  /** Texto PT-BR listo para pintar en un chip. */
  texto: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Planner (M1) — la forma rica de una acción del día
   ══════════════════════════════════════════════════════════════════════════ */

export type Urgencia = 'critica' | 'alta' | 'media' | 'baixa'

/** Tipo de acción: gobierna el ícono, el verbo y el destino del swipe. */
export type TipoAcao =
  | 'ligar'
  | 'mensagem'
  | 'email'
  | 'reuniao'
  | 'visita'
  | 'proposta'
  | 'evidencia'
  | 'tarefa'
  | 'compromisso'
  | 'reativar'

/** Una señal que empujó esta acción hacia arriba. Nunca prosa libre. */
export interface MotivoEstruturado {
  /** Etiqueta corta del factor, ej. 'Gate travado'. */
  sinal: string
  /** El detalle con los números concretos, ej. 'VALOR 4 < 6 exigido'. */
  detalhe: string
  /** Cuánto sumó al score. Auditable: la suma da el score final. */
  peso: number
  /** Código estable para métricas de accept-rate por regla. */
  codigo: RankReason['code']
}

/** Referencia a la entidad sobre la que se actúa, ya resuelta a texto. */
export interface EntidadeRef {
  kind: 'opportunity' | 'lead'
  id: number
  /** Nombre del negocio o de la empresa. */
  nome: string
  /** Cliente / empresa, para poder diversificar por cuenta. */
  cliente: string
}

/** La acción tal como la consume la pantalla Hoje y el /hoje de Telegram. */
export interface PlannedAction {
  id: string
  tipo: TipoAcao
  entidade: EntidadeRef
  /** Qué hacer, concreto, imperativo y en PT-BR. */
  acao: string
  /** 2-3 señales. La suma de los pesos es el score. */
  porque: MotivoEstruturado[]
  escalaAlvo?: ScaleKey
  perguntasSugeridas?: string[]
  canal?: Canal
  urgencia: Urgencia
  score: number
  /** Fecha límite en PT-BR humano: 'hoje', 'atrasada há 3 dias'. */
  prazo?: string
  /**
   * Id de la task pendiente que ORIGINÓ esta tarjeta, cuando la hay.
   * Es lo que permite que «Adiar» posponga esa task y «Feito» la concluya,
   * en vez de crear una segunda: sin este campo, adiar una tarjeta nacida
   * de una task duplicaba la task en silencio y la tarjeta volvía mañana.
   */
  tarefaId?: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Alertas y riesgos
   ══════════════════════════════════════════════════════════════════════════ */

export type AlertType = 'critical' | 'urgent' | 'warning' | 'opportunity'

/** Port del generateAlerts del v2, sin emojis embebidos en el mensaje. */
export interface Alert {
  type: AlertType
  /** 1 = arriba de todo. */
  priority: 1 | 2 | 3
  message: string
  action: string
  opportunityId: number
}

/** Salida de cada una de las 6 reglas de risk.ts. */
export interface RiskSignal {
  codigo: RiskCode
  severidade: Severity
  mensagem: string
  sugestao: string
  opportunityId: number
}

/* ══════════════════════════════════════════════════════════════════════════
   Gamificação — eventos y reglas (scoring.ts)
   ══════════════════════════════════════════════════════════════════════════ */

/** Eventos que generan Pontos de Avanço. La tabla vive en REGRAS_PADRAO. */
export type ScoringEventKind =
  | 'escala_delta'          // Δ±1 en una escala (corregir también avanza)
  | 'reuniao_agendada'      // provisorio: 10 PA, se clava al realizarse
  | 'reuniao_realizada'     // 40 PA con prueba
  | 'etapa_avancada'        // 60 PA, exige gate cumplido
  | 'sinal_comprador'       // 15-50 PA, el único no fabricable en soledad
  | 'commitment_cumprido'
  | 'lead_novo'
  | 'sweep_para_lead'
  | 'touchpoint'
  | 'nota_sem_resultado'

/** Un evento candidato a puntuar. Puro dato: lo evalúa calcularPA(). */
export interface ScoringEvent {
  id: string
  vendor: string
  kind: ScoringEventKind
  /** Fecha civil BRT del evento. */
  date: IsoDate
  target: EntityRef | null
  /** Magnitud, para los eventos de rango (sinal do comprador, Δ de escala). */
  magnitude?: number
  /** Id de la evidencia que lo sostiene. Sin esto no acredita si la exige. */
  evidenceId?: string | null
  /** true cuando la prueba ya fue revisada y aceptada. */
  provado?: boolean
}
