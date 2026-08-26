// e2e/fixtures/supabase-red.ts
// El doble de RED de Supabase: intercepta el host REAL del proyecto y contesta
// con la FORMA REAL de las respuestas (auth + PostgREST), sin tocar la base.
//
// ══════════════════════════════════════════════════════════════════════════
// EN QUÉ SE DIFERENCIA DE e2e/fixtures/app.ts
// ══════════════════════════════════════════════════════════════════════════
// `app.ts` siembra Dexie por atrás y salta el login: sirve para probar
// pantallas, pero NO recorre el camino que recorre una persona real —
// formulario de login → POST /auth/v1/token → resolverVendorDaSessao() →
// pull de la cartera → pantalla Hoje. Este fixture recorre EXACTAMENTE ese
// camino: la app arranca sin nada en el aparato y todo lo que sabe se lo
// contesta este doble por la red, igual que producción en el primer login.
//
// Los datos son una copia de las filas REALES del vendedor Tomás
// (auth_id 7525a8ed…, is_admin=true) tomada de la base el 2026-08-26:
// mismas columnas, mismos tipos, mismos valores. Si el esquema cambia,
// refrescar esta copia consultando por MCP — nunca inventar columnas.
//
// El servidor simulado entiende el subconjunto de PostgREST que usa la app:
// filtros eq/gt/gte/lt/lte/in/is, order, limit y select=*. Con eso alcanza
// para el pull incremental (sync.ts) y para resolverVendorDaSessao().

import type { Page, Route } from '@playwright/test'

/** auth_id real de Tomás en la tabla vendors (admin). */
export const AUTH_ID_TOMAS = '7525a8ed-1e6b-4dfe-809d-22c4d5de5a92'
export const EMAIL_TOMAS = 'tripoll@ventapel.com'
/** auth_id real de Renata (vendedora, NO admin) — la variante «vendedor» de los tests de rol. */
export const AUTH_ID_RENATA = '0fd48e8e-e5f4-43f1-8c91-fc24a2b5b438'
export const EMAIL_RENATA = 'rmorais@ventapel.com'
/** La contraseña es de mentira: el doble acepta cualquiera para cualquier e-mail seedeado. */
export const SENHA_TOMAS = 'senha-de-teste'

/** Host real del proyecto. El fixture lo intercepta; nada sale del proceso. */
export const HOST_SUPABASE = 'wtrbvgqxgcfjacqcndmb.supabase.co'

/* ══════════════════════════════════════════════════════════════════════════
   Filas reales (copiadas de la base por MCP, 2026-08-26)
   ══════════════════════════════════════════════════════════════════════════ */

const VENDORS = [
  { id: 1, name: 'Victor Hugo', role: 'Vendedor', email: 'vhfarias@ventapel.com', phone: null, auth_id: 'c22e7266-44da-450f-bd4f-5197cb1d79f1', is_admin: false, is_active: true, created_at: '2025-09-12T10:53:16.536275', telegram_id: null, auth_user_id: 'c22e7266-44da-450f-bd4f-5197cb1d79f1', monthly_target: null, telegram_username: null },
  { id: 3, name: 'Renata', role: 'Vendedor', email: 'rmorais@ventapel.com', phone: null, auth_id: '0fd48e8e-e5f4-43f1-8c91-fc24a2b5b438', is_admin: false, is_active: true, created_at: '2025-09-12T10:54:10.850051', telegram_id: 8481060372, auth_user_id: '0fd48e8e-e5f4-43f1-8c91-fc24a2b5b438', monthly_target: null, telegram_username: 'ventapel' },
  { id: 4, name: 'Tomás', role: 'Admin', email: EMAIL_TOMAS, phone: null, auth_id: AUTH_ID_TOMAS, is_admin: true, is_active: true, created_at: '2025-09-21T12:08:04.144242', telegram_id: 8452693743, auth_user_id: AUTH_ID_TOMAS, monthly_target: null, telegram_username: null },
  { id: 5, name: 'Jordi', role: 'Director Comercial', email: 'jdalmau@ventapel.com', phone: null, auth_id: 'd5d6906d-02c1-405a-9d66-e67487a5f67c', is_admin: true, is_active: true, created_at: '2025-09-21T12:08:04.144242', telegram_id: 5304920299, auth_user_id: 'd5d6906d-02c1-405a-9d66-e67487a5f67c', monthly_target: null, telegram_username: 'jordalma' },
  { id: 6, name: 'Andre', role: 'Vendedor', email: 'adettmer@ventapel.com', phone: null, auth_id: '1ee41eff-ee40-4268-b601-0abbcc8bd249', is_admin: false, is_active: true, created_at: '2025-09-21T12:08:04.144242', telegram_id: null, auth_user_id: '1ee41eff-ee40-4268-b601-0abbcc8bd249', monthly_target: null, telegram_username: null },
  { id: 7, name: 'Paulo', role: 'Vendedor', email: 'psalvioni@ventapel.com', phone: null, auth_id: '02859652-9ac2-4353-9709-30bdb1d2cb1f', is_admin: false, is_active: true, created_at: '2026-03-24T21:36:06.2021', telegram_id: null, auth_user_id: '02859652-9ac2-4353-9709-30bdb1d2cb1f', monthly_target: null, telegram_username: null },
]

const ESCALAS_ZERO = {
  dor: { score: 0, description: '' },
  poder: { score: 0, description: '' },
  valor: { score: 0, description: '' },
  visao: { score: 0, description: '' },
  compras: { score: 0, description: '' },
  controle: { score: 0, description: '' },
}

const OPPORTUNITIES = [
  { id: 70, name: 'Prospecção — Pepito', stage: 1, value: 0, alerts: [], client: 'Pepito', scales: ESCALAS_ZERO, vendor: 'Tomás', outcome: 'abandoned', product: null, sponsor: 'Tomas', industry: null, priority: 'média', activities: [], created_at: '2026-04-09T16:51:08.179882+00:00', influencer: null, is_stalled: true, updated_at: '2026-08-26T10:00:00.286819+00:00', last_update: '2026-04-27', loss_reason: null, next_action: 'Reunião com Tomas — lead convertido da cadência', probability: 0, health_score: 0, outcome_notes: 'Auditoria 26/04: registro Pepito test/seed - descartado', power_sponsor: null, product_lines: [], expected_close: null, support_contact: null, next_action_date: null, scales_updated_at: {}, last_activity_date: '2026-04-09T16:51:08.179882' },
  { id: 91, name: 'Prospecção — Ventapel Brasil', stage: 1, value: 0, alerts: [], client: 'Ventapel Brasil', scales: ESCALAS_ZERO, vendor: 'Tomás', outcome: null, product: null, sponsor: 'Tomas Ripoll', industry: null, priority: 'média', activities: [], created_at: '2026-08-10T16:41:30.695497+00:00', influencer: null, is_stalled: true, updated_at: '2026-08-26T11:58:32.21753+00:00', last_update: '2026-08-10', loss_reason: null, next_action: 'Reunião com Tomas Ripoll — lead convertido da cadência', probability: 0, health_score: 0, outcome_notes: null, power_sponsor: null, product_lines: [], expected_close: null, support_contact: null, next_action_date: '2026-08-26', scales_updated_at: {}, last_activity_date: '2026-08-10T16:41:30.695497' },
  { id: 89, name: 'Prueba', stage: 2, value: 25000, alerts: [], client: 'Prueba Tripolla', scales: { ...ESCALAS_ZERO, dor: { score: 2, description: '' }, compras: { score: 5, description: '' }, controle: { score: 0, description: 'Fernando quer uma reunião com a equipe' } }, vendor: 'Tomás', outcome: null, product: null, sponsor: null, industry: null, priority: 'alta', activities: [], created_at: '2026-08-05T21:13:43.900875+00:00', influencer: 'Fernando', is_stalled: false, updated_at: '2026-08-18T17:26:17.545517+00:00', last_update: '2026-08-18', loss_reason: null, next_action: 'Ir com prova maior de 1000 caixas', probability: 20, health_score: 0, outcome_notes: null, power_sponsor: 'Mora', product_lines: [], expected_close: null, support_contact: 'Emma', next_action_date: '2026-08-28', scales_updated_at: {}, last_activity_date: '2026-08-18T17:26:17.164' },
]

const LEADS = [
  { id: 1, notes: null, stage: '1d', source: 'manual', status: 'converted', vendor: 'Tomás', created_at: '2026-04-09T15:29:17.263+00:00', updated_at: '2026-04-10T14:15:16.459187+00:00', archived_at: null, company_name: 'Ventapel Brasil', contact_name: 'Tomas Ripoll', contact_email: 'Tripoll@ventapel.com', contact_phone: '47999461810', contact_title: null, recycle_after: null, company_domain: 'Ventapel Brasil', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: null, contact_whatsapp: null, touchpoints_count: 3, last_touchpoint_date: '2026-04-10', next_touchpoint_date: '2026-04-14' },
  { id: 3, notes: null, stage: '1d', source: 'manual', status: 'converted', vendor: 'Tomás', created_at: '2026-04-09T16:50:02.736+00:00', updated_at: '2026-04-09T16:51:08.275313+00:00', archived_at: null, company_name: 'Pepito', contact_name: 'Tomas', contact_email: null, contact_phone: null, contact_title: 'Analista', recycle_after: null, company_domain: 'pepito.com', opportunity_id: 70, active_channels: [], origin_snapshot: null, contact_linkedin: null, contact_whatsapp: null, touchpoints_count: 4, last_touchpoint_date: '2026-04-09', next_touchpoint_date: '2026-04-12' },
  { id: 7, notes: null, stage: '1b', source: 'prospector', status: 'active', vendor: 'Tomás', created_at: '2026-04-09T20:10:37.278625+00:00', updated_at: '2026-04-10T14:05:51.846768+00:00', archived_at: null, company_name: 'Deep Logística', contact_name: 'Joel Fernandes', contact_email: 'email_not_unlocked@domain.com', contact_phone: '+55 49 99927-4009', contact_title: 'Operations Director', recycle_after: null, company_domain: 'http://www.deeplogistica.com.br', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/joel-fernandes-0b252519', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-10' },
  { id: 26, notes: null, stage: '1b', source: 'prospector', status: 'active', vendor: 'Tomás', created_at: '2026-04-21T17:47:02.435867+00:00', updated_at: '2026-04-21T17:47:02.435867+00:00', archived_at: null, company_name: 'TECADI Operador Logístico', contact_name: 'Rafael Morsch', contact_email: 'email_not_unlocked@domain.com', contact_phone: '+55 47 99963-6767', contact_title: 'COO - Chief Operating Officer', recycle_after: null, company_domain: 'http://www.tecadi.com.br', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/rafael-morsch-14ab808b', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-22' },
  { id: 27, notes: null, stage: '1b', source: 'prospmini', status: 'active', vendor: 'Tomás', created_at: '2026-04-21T17:53:34.195474+00:00', updated_at: '2026-04-21T17:53:34.195474+00:00', archived_at: null, company_name: 'Wester Moto Bike', contact_name: 'Sidnei Largura', contact_email: 'sidnei@wester.com.br', contact_phone: null, contact_title: 'Commercial Manager', recycle_after: null, company_domain: null, opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/sidnei-largura-3194ba13b', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-22' },
  { id: 28, notes: null, stage: '1b', source: 'prospector', status: 'active', vendor: 'Tomás', created_at: '2026-04-21T18:02:55.793841+00:00', updated_at: '2026-04-21T18:02:55.793841+00:00', archived_at: null, company_name: 'Bauer Express', contact_name: 'Evandro Assis', contact_email: 'evandro.assis@foxtime.com.br', contact_phone: '+55 45 98842-6760', contact_title: 'Operational Manager', recycle_after: null, company_domain: 'http://www.bauerexpress.com.br', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/evandro-marcos-de-assis-06183a92', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-22' },
  { id: 29, notes: null, stage: '1b', source: 'prospector', status: 'active', vendor: 'Tomás', created_at: '2026-04-21T18:20:17.836046+00:00', updated_at: '2026-04-21T18:20:17.836046+00:00', archived_at: null, company_name: 'Rodalog Soluções em Logística e Transporte Ltda', contact_name: 'Leandro Domingues', contact_email: null, contact_phone: null, contact_title: 'Logistics Manager', recycle_after: null, company_domain: 'http://www.rodalog.com.br', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/leandro-domingues-72b15977', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-22' },
  { id: 30, notes: null, stage: '1b', source: 'prospector', status: 'active', vendor: 'Tomás', created_at: '2026-04-21T18:20:58.705783+00:00', updated_at: '2026-04-21T18:20:58.705783+00:00', archived_at: null, company_name: 'Framento Transportes', contact_name: 'Gean Bellei', contact_email: 'gean@transframento.com.br', contact_phone: '+55 11 99991-8461', contact_title: 'Operational Manager', recycle_after: null, company_domain: 'http://www.framento.com.br', opportunity_id: null, active_channels: [], origin_snapshot: null, contact_linkedin: 'http://www.linkedin.com/in/gean-bellei-3a0b1118a', contact_whatsapp: null, touchpoints_count: 0, last_touchpoint_date: null, next_touchpoint_date: '2026-04-22' },
  { id: 56, notes: null, stage: '1d', source: 'manual', status: 'converted', vendor: 'Tomás', created_at: '2026-08-10T11:13:55.675+00:00', updated_at: '2026-08-10T16:41:30.746948+00:00', archived_at: null, company_name: 'Ventapel Brasil', contact_name: 'Tomas Ripoll', contact_email: 'Tripoll@ventapel.com', contact_phone: '47999461810', contact_title: null, recycle_after: null, company_domain: 'Ventapel Brasil', opportunity_id: 91, active_channels: [], origin_snapshot: null, contact_linkedin: null, contact_whatsapp: null, touchpoints_count: 7, last_touchpoint_date: '2026-08-10', next_touchpoint_date: null },
]

const TASKS = [
  { id: 'fae25c58-355c-436e-8828-10a417af9d75', canal: null, origem: 'manual', status: 'pending', titulo: 'Reunião com Tomas Ripoll — lead convertido da cadência', vendor: 'Tomás', done_at: null, lead_id: null, due_date: '2026-08-26', due_time: null, vendor_id: 4, created_at: '2026-08-26T11:58:32.21753+00:00', created_by: 'backfill-v2', prioridade: 2, snoozed_to: null, updated_at: '2026-08-26T11:58:32.21753+00:00', client_uuid: '4ba5b6be-8e8a-4343-9b41-24d2b4ce4e54', target_scale: null, draft_content: null, opportunity_id: 91, expected_outcome: null, resolved_activity_id: null },
  { id: 'b3b3c471-2f78-4a83-b97d-e8f3c19792d2', canal: null, origem: 'manual', status: 'pending', titulo: 'Ir com prova maior de 1000 caixas', vendor: 'Tomás', done_at: null, lead_id: null, due_date: '2026-08-28', due_time: null, vendor_id: 4, created_at: '2026-08-26T11:58:32.21753+00:00', created_by: 'backfill-v2', prioridade: 2, snoozed_to: null, updated_at: '2026-08-26T11:58:32.21753+00:00', client_uuid: '055213ca-35f9-4b4b-9d43-d1b54905b60a', target_scale: null, draft_content: null, opportunity_id: 89, expected_outcome: null, resolved_activity_id: null },
]

const ACTIVITIES = [
  { id: 174, result: 'demo realizada, cliente fechou teste de 500 caixas', source: 'ai_parsed', vendor: 'Tomás', created_at: '2026-08-18T17:26:17.04898+00:00', client_uuid: null, description: 'Demo realizada na Prueba Tripolla, fecharam 500 caixas de teste.', next_action: 'Ir com prova maior de 1000 caixas', activity_date: '2026-08-18', activity_type: 'demo', ai_confidence: null, stage_at_time: 2, opportunity_id: 89, methodology_code: null, next_action_date: '2026-08-28', next_action_done: false, ai_suggested_action: null, ai_suggested_scales: { controle: 'Cliente aceitou avançar para teste maior' } },
  { id: 173, result: 'demo realizada, contato interessado em agendar reunião', source: 'ai_parsed', vendor: 'Tomás', created_at: '2026-08-09T20:15:53.247163+00:00', client_uuid: null, description: 'Demo realizada para Firestone dentro da oportunidade Prueba Tripolla.', next_action: 'Reunirse en las instalaciones de ellos', activity_date: '2026-08-09', activity_type: 'demo', ai_confidence: null, stage_at_time: 2, opportunity_id: 89, methodology_code: null, next_action_date: '2026-08-13', next_action_done: false, ai_suggested_action: null, ai_suggested_scales: { controle: 'Fernando quer uma reunião com a equipe' } },
]

const TOUCHPOINTS = [
  { id: 171, notes: null, result: 'no_response', channel: 'linkedin', lead_id: 56, executed_at: '2026-08-10T11:14:45.781+00:00', sequence_number: 2 },
  { id: 172, notes: null, result: 'not_now', channel: 'phone', lead_id: 56, executed_at: '2026-08-10T11:14:55.119+00:00', sequence_number: 3 },
  { id: 173, notes: null, result: 'not_interested', channel: 'phone', lead_id: 56, executed_at: '2026-08-10T11:15:13.983+00:00', sequence_number: 4 },
  { id: 174, notes: 'Agendada videochamada com Tomás para quinta-feira às 15h.', result: 'meeting_scheduled', channel: 'phone', lead_id: 56, executed_at: '2026-08-10T11:17:19.282+00:00', sequence_number: 5 },
  { id: 175, notes: 'Pediu uma call na semana que vem e as fichas técnicas.', result: 'interested', channel: 'whatsapp', lead_id: 56, executed_at: '2026-08-10T11:25:55.43+00:00', sequence_number: 6 },
  { id: 177, notes: null, result: 'meeting_scheduled', channel: 'whatsapp', lead_id: 56, executed_at: '2026-08-10T16:41:25.304+00:00', sequence_number: 7 },
]

/* ══════════════════════════════════════════════════════════════════════════
   EL DOBLE VALIDA LAS ESCRITURAS
   ══════════════════════════════════════════════════════════════════════════
   Antes contestaba 201 a cualquier POST y 200 a cualquier PATCH. Por eso pasó
   inadvertido el bug de la ola anterior: `criarTask` mandaba `kind`, `title` y
   `snoozed_until` —columnas que NO EXISTEN en Postgres—, PostgREST contestaba
   400 en producción, y el ítem del outbox reintentaba para siempre mientras la
   suite entera seguía en verde.

   A partir de acá el doble se comporta como PostgREST: una clave que no es
   columna es 400 PGRST204, y un CHECK violado es 400 23514, con la MISMA forma
   de error. Cualquier regresión del camino de escritura sale roja en el acto.

   Las listas y los CHECK son copia literal del esquema real, leído por MCP el
   2026-08-26 (project wtrbvgqxgcfjacqcndmb). Si el esquema cambia, se refresca
   esto — nunca se inventa una columna para que un test pase.
   ══════════════════════════════════════════════════════════════════════════ */

const COLUNAS_REAIS: Readonly<Record<string, readonly string[]>> = {
  tasks: [
    'id', 'client_uuid', 'vendor', 'vendor_id', 'opportunity_id', 'lead_id', 'titulo',
    'canal', 'due_date', 'due_time', 'prioridade', 'target_scale', 'draft_content',
    'expected_outcome', 'status', 'origem', 'done_at', 'snoozed_to',
    'resolved_activity_id', 'created_by', 'created_at', 'updated_at',
  ],
  activities: [
    'id', 'opportunity_id', 'vendor', 'created_at', 'activity_type', 'description',
    'result', 'stage_at_time', 'methodology_code', 'ai_suggested_action',
    'ai_suggested_scales', 'ai_confidence', 'next_action', 'next_action_date',
    'next_action_done', 'source', 'activity_date', 'client_uuid',
  ],
  touchpoints: [
    'id', 'lead_id', 'sequence_number', 'channel', 'result', 'notes', 'executed_at',
  ],
}

const CANAIS_TAREFA = ['call', 'whatsapp', 'email', 'linkedin', 'meeting', 'visit', 'demo', 'proposal', 'other']
const ORIGENS_TAREFA = ['manual', 'ia', 'bot', 'cron', 'planner']
const STATUS_TAREFA = ['pending', 'done', 'snoozed', 'cancelled']
const ESCALAS = ['dor', 'poder', 'visao', 'valor', 'controle', 'compras']

/** Un error con la forma EXACTA que devuelve PostgREST. */
export interface ErroPostgrest {
  code: string
  message: string
  details: string | null
  hint: string | null
}

function erroDeColuna(tabela: string, coluna: string): ErroPostgrest {
  return {
    code: 'PGRST204',
    message: `Could not find the '${coluna}' column of '${tabela}' in the schema cache`,
    details: null,
    hint: null,
  }
}

function erroDeCheck(tabela: string, restricao: string, linha: Record<string, unknown>): ErroPostgrest {
  return {
    code: '23514',
    message: `new row for relation "${tabela}" violates check constraint "${restricao}"`,
    details: `Failing row contains ${JSON.stringify(linha)}.`,
    hint: null,
  }
}

/**
 * Los CHECK de `public.tasks` que el camino de escritura de la app puede violar
 * de verdad. `inserindo` distingue INSERT de PATCH: un PATCH parcial no ve la
 * fila entera, así que las reglas que necesitan las dos columnas solo se
 * aplican cuando las dos están en el cuerpo (o cuando es un INSERT).
 */
function violacaoDeTasks(linha: Record<string, unknown>, inserindo: boolean): string | null {
  const tem = (c: string): boolean => Object.hasOwn(linha, c) && linha[c] !== null
  const enumOk = (c: string, valores: readonly string[]): boolean =>
    !tem(c) || valores.includes(String(linha[c]))

  if (inserindo && !tem('opportunity_id') && !tem('lead_id')) return 'tasks_owner_chk'
  if (inserindo && String(linha['titulo'] ?? '').trim() === '') return 'tasks_titulo_chk'
  if (!enumOk('status', STATUS_TAREFA)) return 'tasks_status_chk'
  if (!enumOk('canal', CANAIS_TAREFA)) return 'tasks_canal_chk'
  if (!enumOk('origem', ORIGENS_TAREFA)) return 'tasks_origem_chk'
  if (!enumOk('target_scale', ESCALAS)) return 'tasks_target_scale_chk'
  if (tem('prioridade')) {
    const p = Number(linha['prioridade'])
    if (!Number.isInteger(p) || p < 1 || p > 3) return 'tasks_prioridade_chk'
  }
  if (linha['status'] === 'done' && !tem('done_at')) return 'tasks_done_chk'
  if (linha['status'] === 'snoozed' && !tem('snoozed_to')) return 'tasks_snooze_chk'
  return null
}

/**
 * Valida un cuerpo de escritura contra el esquema real. Devuelve el error de
 * PostgREST, o null si la fila puede entrar.
 */
export function validarEscrita(
  tabela: string,
  linha: Record<string, unknown>,
  inserindo: boolean,
): ErroPostgrest | null {
  const colunas = COLUNAS_REAIS[tabela]
  if (!colunas) return null
  for (const chave of Object.keys(linha)) {
    if (!colunas.includes(chave)) return erroDeColuna(tabela, chave)
  }
  if (tabela === 'tasks') {
    const restricao = violacaoDeTasks(linha, inserindo)
    if (restricao) return erroDeCheck(tabela, restricao, linha)
  }
  return null
}

/** Las tablas que el doble sabe contestar. Lo demás responde []. */
const TABELAS: Record<string, ReadonlyArray<Record<string, unknown>>> = {
  vendors: VENDORS,
  opportunities: OPPORTUNITIES,
  leads: LEADS,
  tasks: TASKS,
  commitments: [],
  activities: ACTIVITIES,
  touchpoints: TOUCHPOINTS,
}

/* ══════════════════════════════════════════════════════════════════════════
   Sesión: un JWT con la forma real, firmado con una firma de mentira
   ══════════════════════════════════════════════════════════════════════════ */

function base64url(valor: string): string {
  return Buffer.from(valor, 'utf8').toString('base64url')
}

/**
 * La respuesta de POST /auth/v1/token?grant_type=password, forma real, para
 * CUALQUIER usuario seedeado en `VENDORS` — no sólo Tomás. Necesario para los
 * tests de rol (§5 del encargo): «Painel do Gestor» tiene que aparecer con
 * Tomás (admin) y desaparecer con Renata (vendedora), y las dos sesiones
 * viajan por el MISMO doble de red.
 */
export function sessaoPara(authId: string, email: string): Record<string, unknown> {
  const agora = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: `https://${HOST_SUPABASE}/auth/v1`,
      sub: authId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      session_id: 'e2e-sessao-real',
      iat: agora,
      exp: agora + 60 * 60 * 8,
    }),
  )
  const user = {
    id: authId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: '2025-09-21T12:08:04Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2025-09-21T12:08:04Z',
    updated_at: '2026-08-26T00:00:00Z',
  }
  return {
    access_token: `${header}.${payload}.assinatura-de-teste`,
    token_type: 'bearer',
    expires_in: 60 * 60 * 8,
    expires_at: agora + 60 * 60 * 8,
    refresh_token: 'e2e-refresh-token',
    user,
  }
}

/** La sesión de Tomás (admin). Se mantiene como función propia: es la que usan
 * la mayoría de los specs, y no vale la pena que todos pasen el e-mail a mano. */
export function sessaoDeTomas(): Record<string, unknown> {
  return sessaoPara(AUTH_ID_TOMAS, EMAIL_TOMAS)
}

/** Busca por e-mail (case-insensitive) en `VENDORS`, para resolver el login. */
function vendorPorEmail(email: string): (typeof VENDORS)[number] | null {
  const alvo = email.trim().toLowerCase()
  return VENDORS.find((v) => v.email?.toLowerCase() === alvo) ?? null
}

/* ══════════════════════════════════════════════════════════════════════════
   Mini PostgREST: filtros de query string sobre las filas de arriba
   ══════════════════════════════════════════════════════════════════════════ */

/** Claves de la query string que NO son filtros de columna. */
const NO_FILTRO = new Set(['select', 'order', 'limit', 'offset', 'apikey', 'on_conflict', 'columns'])

function aplicarFiltro(
  filas: ReadonlyArray<Record<string, unknown>>,
  coluna: string,
  operacao: string,
): Array<Record<string, unknown>> {
  const ponto = operacao.indexOf('.')
  const op = ponto === -1 ? 'eq' : operacao.slice(0, ponto)
  const bruto = ponto === -1 ? operacao : operacao.slice(ponto + 1)

  const comparar = (v: unknown): boolean => {
    switch (op) {
      case 'eq':
        return String(v) === bruto
      case 'neq':
        return String(v) !== bruto
      case 'gt':
        return v !== null && v !== undefined && String(v) > bruto
      case 'gte':
        return v !== null && v !== undefined && String(v) >= bruto
      case 'lt':
        return v !== null && v !== undefined && String(v) < bruto
      case 'lte':
        return v !== null && v !== undefined && String(v) <= bruto
      case 'in': {
        const lista = bruto.replace(/^\(/, '').replace(/\)$/, '').split(',')
          .map((x) => x.trim().replace(/^"/, '').replace(/"$/, ''))
        return lista.includes(String(v))
      }
      case 'is':
        return bruto === 'null' ? v === null || v === undefined : String(v) === bruto
      default:
        return true
    }
  }
  return filas.filter((f) => comparar(f[coluna]))
}

function responderRest(url: URL): { status: number; body: unknown } {
  const tabela = /\/rest\/v1\/([a-zA-Z_]+)/.exec(url.pathname)?.[1] ?? ''
  let filas: Array<Record<string, unknown>> = [...(TABELAS[tabela] ?? [])]

  for (const [chave, valor] of url.searchParams.entries()) {
    if (NO_FILTRO.has(chave)) continue
    filas = aplicarFiltro(filas, chave, valor)
  }

  const order = url.searchParams.get('order')
  if (order) {
    const [col, dir] = order.split('.')
    if (col) {
      filas.sort((a, b) => {
        const va = String(a[col] ?? '')
        const vb = String(b[col] ?? '')
        return dir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
      })
    }
  }

  const limit = Number(url.searchParams.get('limit') ?? '0')
  if (limit > 0) filas = filas.slice(0, limit)

  return { status: 200, body: filas }
}

/* ══════════════════════════════════════════════════════════════════════════
   La interceptación
   ══════════════════════════════════════════════════════════════════════════ */

export interface OpcoesSupabaseRede {
  /** Demora (ms) SOLO en GET /rest/v1/vendors — la variante «vendedor lento». */
  demoraVendorsMs?: number
  /** Contesta [] en /rest/v1/vendors — la variante «sesión sin vendedor». */
  vendorsVazio?: boolean
  /**
   * Tablas que contestan 500 en los GET de /rest/v1. Reproduce el pull
   * PARCIAL: la 4G que se cae a mitad de la sincronización de arranque, que es
   * lo que dejaba la pantalla Hoje en esqueletos para siempre.
   */
  tabelasComFalha?: readonly string[]
}

/** Una escritura que la app intentó, ya juzgada contra el esquema real. */
export interface EscritaRegistrada {
  metodo: 'POST' | 'PATCH'
  tabela: string
  /** El cuerpo tal cual salió del outbox. */
  corpo: Record<string, unknown>
  status: number
  /** null si entró; el error de PostgREST si el doble la rechazó. */
  erro: ErroPostgrest | null
}

export interface RegistroDeRede {
  /** Todo lo que la app le pidió al «servidor». */
  pedidos: Array<{ metodo: string; url: string }>
  /** Solo los POST/PATCH de /rest/v1, con su cuerpo y su veredicto. */
  escritas: EscritaRegistrada[]
}

/** Las escrituras de una tabla, en orden. Azúcar para las aserciones. */
export function escritasEm(
  registro: RegistroDeRede,
  tabela: string,
  metodo?: 'POST' | 'PATCH',
): EscritaRegistrada[] {
  return registro.escritas.filter(
    (e) => e.tabela === tabela && (metodo === undefined || e.metodo === metodo),
  )
}

/** Las que el doble rechazó. En una corrida sana tiene que quedar vacía. */
export function escritasRejeitadas(registro: RegistroDeRede): EscritaRegistrada[] {
  return registro.escritas.filter((e) => e.erro !== null)
}

/**
 * Instala el doble sobre el host REAL de Supabase. Todo pedido a
 * https://wtrbvgqxgcfjacqcndmb.supabase.co/** se contesta acá; ninguno sale.
 */
export async function instalarSupabaseDeRede(
  page: Page,
  opcoes: OpcoesSupabaseRede = {},
): Promise<RegistroDeRede> {
  const registro: RegistroDeRede = { pedidos: [], escritas: [] }
  // Quién «está logueado» en ESTE doble — se actualiza en el login y la usa
  // /auth/v1/user después, para que la sesión sea consistente con QUIEN sea
  // que entró (Tomás, Renata, o cualquier otro vendor seedeado), y no siempre
  // Tomás. Vive por instalación: dos tests en paralelo no se pisan.
  let sessaoAtual = { authId: AUTH_ID_TOMAS, email: EMAIL_TOMAS }

  const responder = async (rota: Route): Promise<void> => {
    const pedido = rota.request()
    const url = new URL(pedido.url())
    registro.pedidos.push({ metodo: pedido.method(), url: pedido.url() })

    const json = (body: unknown, status = 200): Promise<void> =>
      rota.fulfill({
        status,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-expose-headers': '*',
        },
        body: JSON.stringify(body),
      })

    // Preflight de CORS: el preview corre en 127.0.0.1 y Supabase es otra
    // origen, así que el navegador pregunta antes de cada pedido con Bearer.
    if (pedido.method() === 'OPTIONS') {
      await rota.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      })
      return
    }

    // ── Auth ─────────────────────────────────────────────────────────────
    if (url.pathname.includes('/auth/v1/token')) {
      // El formulario manda { email, password } en el body: se busca ese
      // e-mail entre los vendors seedeados para saber CON QUIÉN se está
      // entrando. Sin body reconocible (o e-mail que no está en `VENDORS`),
      // se cae a Tomás — el default de siempre, para no romper los specs que
      // ya llaman a `entrarComoTomas` sin pensar en esto.
      const body = pedido.postDataJSON() as { email?: string } | null
      const vendor = body?.email ? vendorPorEmail(body.email) : null
      sessaoAtual = vendor
        ? { authId: vendor.auth_id, email: vendor.email }
        : { authId: AUTH_ID_TOMAS, email: EMAIL_TOMAS }
      await json(sessaoPara(sessaoAtual.authId, sessaoAtual.email))
      return
    }
    if (url.pathname.includes('/auth/v1/user')) {
      await json((sessaoPara(sessaoAtual.authId, sessaoAtual.email) as { user: unknown }).user)
      return
    }
    if (url.pathname.includes('/auth/v1/logout')) {
      await json({}, 204)
      return
    }

    // ── PostgREST ────────────────────────────────────────────────────────
    if (url.pathname.includes('/rest/v1/rpc/')) {
      await json({})
      return
    }
    // ── Escrituras: se validan contra el esquema real ────────────────────
    const metodo = pedido.method()
    if (metodo === 'POST' || metodo === 'PATCH') {
      const tabela = /\/rest\/v1\/([a-zA-Z_]+)/.exec(url.pathname)?.[1] ?? ''
      const corpoCru = pedido.postDataJSON() as unknown
      // PostgREST acepta una fila o un array; el cliente manda una sola.
      const linhas = (Array.isArray(corpoCru) ? corpoCru : [corpoCru]).filter(
        (l): l is Record<string, unknown> => typeof l === 'object' && l !== null,
      )

      let erro: ErroPostgrest | null = null
      for (const linha of linhas) {
        erro = validarEscrita(tabela, linha, metodo === 'POST')
        if (erro) break
      }
      const status = erro ? 400 : metodo === 'POST' ? 201 : 200
      for (const linha of linhas) {
        registro.escritas.push({ metodo, tabela, corpo: linha, status, erro })
      }
      if (erro) {
        await json(erro, 400)
        return
      }
      if (metodo === 'POST') {
        await json([], 201)
        return
      }
      // Un PATCH con 2xx y cero filas es «la fila no existe» para el outbox
      // (ver transport.enviarUpdate). Se devuelve el id que el propio filtro
      // `id=eq.…` nombra: el doble no lleva estado, pero la respuesta tiene que
      // ser coherente con lo que se le pidió actualizar.
      const filtroId = url.searchParams.get('id') ?? ''
      const id = filtroId.startsWith('eq.') ? filtroId.slice(3) : null
      await json([{ id: id ?? 1 }])
      return
    }

    if (url.pathname.includes('/rest/v1/vendors')) {
      if (opcoes.demoraVendorsMs) {
        await new Promise((r) => setTimeout(r, opcoes.demoraVendorsMs))
      }
      if (opcoes.vendorsVazio) {
        await json([])
        return
      }
    }

    const tabelaPedida = /\/rest\/v1\/([a-zA-Z_]+)/.exec(url.pathname)?.[1] ?? ''
    if (opcoes.tabelasComFalha?.includes(tabelaPedida)) {
      await json({ message: 'simulação de queda no meio do pull' }, 500)
      return
    }

    const { status, body } = responderRest(url)
    await json(body, status)
  }

  // context.route y NO page.route: con el service worker registrado (que es como
  // corre producción), los pedidos que salen DESDE el worker no pasan por
  // page.route y se irían a la red de verdad. A nivel de contexto se
  // interceptan los dos caminos, que es la única forma de que este doble sea
  // el ÚNICO servidor que la app ve.
  await page.context().route(`**://${HOST_SUPABASE}/**`, responder)
  return registro
}

/**
 * Login REAL por el formulario: e-mail, senha, «Entrar». Es el camino que el
 * dueño del producto recorrió — nada de sesión inyectada en localStorage.
 * Sirve para CUALQUIER e-mail seedeado en `VENDORS` (la senha es de mentira,
 * el doble la acepta igual): así los tests de rol pueden entrar como Tomás
 * (admin) o como Renata (vendedora) contra el MISMO doble de red.
 */
export async function entrarComo(page: Page, email: string, senha = SENHA_TOMAS): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL('**/', { timeout: 15_000 })
}

export async function entrarComoTomas(page: Page): Promise<void> {
  await entrarComo(page, EMAIL_TOMAS)
}
