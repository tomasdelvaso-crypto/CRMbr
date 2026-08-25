// src/core/__tests__/fixtures.ts
// Constructores de datos de prueba. Reflejan el esquema real: todos los
// campos nullable arrancan en null, como vienen de Supabase.

import type {
  Activity,
  ActivityType,
  Commitment,
  Evidence,
  IsoDate,
  Lead,
  LeadStage,
  Opportunity,
  ScalesRecord,
  StageId,
  Task,
  Touchpoint,
  TouchpointResult,
  TouchpointSeq,
} from '../types'

let seq = 0
export const nextId = (): number => (seq += 1)

/** Escalas con las 6 claves canónicas en el valor que se pida. */
export function escalas(v: Partial<Record<keyof ScalesRecord, number>>): ScalesRecord {
  const out: ScalesRecord = {}
  for (const [k, n] of Object.entries(v)) {
    out[k as keyof ScalesRecord] = { score: n as number, description: '' }
  }
  return out
}

export function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: nextId(),
    created_at: '2026-01-10T12:00:00Z',
    name: 'Fechamento de caixas',
    client: 'Cliente Teste',
    vendor: 'Renata',
    value: 80_000,
    stage: 3 as StageId,
    priority: 'media',
    expected_close: null,
    next_action: null,
    next_action_date: null,
    product: null,
    product_lines: null,
    power_sponsor: null,
    sponsor: 'Marcelo',
    influencer: null,
    support_contact: null,
    probability: null,
    last_update: null,
    last_activity_date: null,
    scales: escalas({ dor: 5, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
    health_score: null,
    is_stalled: null,
    industry: null,
    loss_reason: null,
    outcome: null,
    outcome_notes: null,
    updated_at: null,
    ...over,
  }
}

export function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: nextId(),
    vendor: 'Renata',
    source: 'market_sweep',
    company_name: 'Embalagens Vale',
    company_domain: null,
    contact_name: 'Ana Souza',
    contact_title: 'Gerente de Logística',
    contact_email: 'ana@vale.com.br',
    contact_phone: '(11) 98765-4321',
    contact_whatsapp: null,
    contact_linkedin: null,
    active_channels: null,
    stage: '1b' as LeadStage,
    status: 'active',
    touchpoints_count: 2,
    next_touchpoint_date: null,
    last_touchpoint_date: null,
    opportunity_id: null,
    notes: null,
    archived_at: null,
    recycle_after: null,
    created_at: '2026-02-01T12:00:00Z',
    updated_at: '2026-02-01T12:00:00Z',
    ...over,
  }
}

export function atividade(
  opportunityId: number,
  date: IsoDate,
  over: Partial<Activity> = {},
): Activity {
  return {
    id: nextId(),
    opportunity_id: opportunityId,
    vendor: 'Renata',
    created_at: `${date}T12:00:00Z`,
    activity_date: date,
    activity_type: 'call' as ActivityType,
    description: 'Conversa sobre violação em trânsito',
    result: 'positivo',
    stage_at_time: null,
    methodology_code: null,
    ai_suggested_action: null,
    ai_suggested_scales: null,
    ai_confidence: null,
    next_action: null,
    next_action_date: null,
    next_action_done: null,
    source: 'manual',
    ...over,
  }
}

export function tarefa(
  target: Task['target'],
  dueDate: IsoDate | null,
  over: Partial<Task> = {},
): Task {
  return {
    id: `task-${nextId()}`,
    vendor: 'Renata',
    kind: 'next_action',
    target,
    title: 'Ligar para o Marcelo',
    due_date: dueDate,
    status: 'pending',
    snoozed_until: null,
    created_at: '2026-02-01T12:00:00Z',
    ...over,
  }
}

export function compromisso(over: Partial<Commitment> = {}): Commitment {
  return {
    id: nextId(),
    opportunity_id: null,
    lead_id: null,
    vendor: 'Renata',
    committed_action: 'Enviar plano de avaliação',
    due_date: null,
    week_of: '2026-08-24',
    commitment_type: 'opportunity',
    source_file: null,
    status: 'pending',
    verdict_notes: null,
    evidence_activity_ids: null,
    evaluated_at: null,
    created_at: null,
    ...over,
  }
}

export function toque(
  leadId: number,
  n: TouchpointSeq,
  result: TouchpointResult = 'no_response',
): Touchpoint {
  return {
    id: nextId(),
    lead_id: leadId,
    sequence_number: n,
    channel: 'whatsapp',
    result,
    notes: null,
    executed_at: '2026-08-20T12:00:00Z',
  }
}

export function evidencia(
  opportunityId: number,
  scale: Evidence['scale'],
  occurredAt: IsoDate,
  over: Partial<Evidence> = {},
): Evidence {
  return {
    id: `ev-${nextId()}`,
    opportunity_id: opportunityId,
    scale,
    level: 6,
    kind: 'quote',
    quote: 'A gente perde umas 30 caixas por mês em trânsito',
    source_name: 'Marcelo',
    source_title: 'Gerente de Expedição',
    occurred_at: occurredAt,
    created_at: `${occurredAt}T12:00:00Z`,
    created_by: 'Renata',
    verified: true,
    ...over,
  }
}
