-- ============================================================================
-- 0007_indices.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Agrega los índices que faltan sobre las tablas EXISTENTES del v2, para las
--   consultas típicas del v3: la cartera del vendedor, la próxima acción vencida,
--   el toque de cadencia atrasado y las actividades recientes.
--
-- POR QUÉ
--   Auditoría: `opportunities` tiene sólo 3 índices (vendor, health_score,
--   last_activity_date) y la consulta central del "qué hago ahora"
--   —next_action_date sobre oportunidades abiertas— hace seq scan.
--   `touchpoints` tiene UN solo índice (lead_id) para las métricas de cadencia.
--   Faltan además 4 índices de FK marcados INFO por el advisor:
--   notifications(opportunity_id), leads(opportunity_id), commitments(lead_id),
--   bot_sessions(vendor_id).
--
-- RIESGO — ADITIVO PERO NO GRATIS
--   Crear un índice toma un ACCESS EXCLUSIVE LOCK sobre la tabla mientras se
--   construye. Con el tamaño real de esta base (3,3 MB en total, 65 oportunidades,
--   168 touchpoints) eso son MILISEGUNDOS y es perfectamente seguro en horario
--   laboral. Por eso las sentencias de abajo van en su forma normal, dentro de
--   una transacción, y son idempotentes.
--
--   Si algún día alguna de estas tablas crece a cientos de miles de filas, la
--   forma correcta es CREATE INDEX CONCURRENTLY, que NO bloquea escrituras — pero
--   que NO PUEDE correr dentro de una transacción. Las variantes CONCURRENTLY
--   están al pie de este archivo, comentadas, con las instrucciones de uso.
--
-- NO SE BORRA NINGÚN ÍNDICE EXISTENTE. Los 5 índices que nunca se usaron quedan
-- listados al final, comentados, como decisión pendiente.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ── opportunities: la cartera y el "qué hago ahora" ──────────────────────────
-- La consulta central: acciones vencidas / de hoy sobre oportunidades abiertas.
create index if not exists idx_opp_next_action_aberta
  on public.opportunities (next_action_date)
  where outcome is null;

-- El board por etapa de un vendedor.
create index if not exists idx_opp_board
  on public.opportunities (vendor, stage)
  where outcome is null;

-- Cierres previstos: hoy 21 oportunidades abiertas tienen expected_close vencido.
create index if not exists idx_opp_expected_close
  on public.opportunities (expected_close)
  where outcome is null;

-- Frescura: "hace cuánto que nadie toca esto" sobre el conjunto vivo.
create index if not exists idx_opp_frescura
  on public.opportunities (last_activity_date desc)
  where outcome is null;

-- ── activities: timeline y conteo de gamificación ────────────────────────────
-- El timeline de una oportunidad (hoy hace un sort sobre idx_activities_opportunity).
create index if not exists idx_act_timeline
  on public.activities (opportunity_id, created_at desc);

-- El conteo diario/semanal por vendedor que alimenta anillos y racha.
create index if not exists idx_act_gamificacao
  on public.activities (vendor, activity_date);

-- "Días sin contacto REAL": sólo interacciones humanas, no ruido del sistema.
-- (75 de las 85 notas son source='system'; el índice parcial las deja afuera.)
create index if not exists idx_act_humanas
  on public.activities (opportunity_id, activity_date desc)
  where source in ('manual','ai_parsed');

-- ── touchpoints: cadencia y métricas por canal ───────────────────────────────
create index if not exists idx_tp_executado
  on public.touchpoints (executed_at desc);

-- Tasa de meeting_scheduled por canal (linkedin 7,7% vs email 1,4%).
create index if not exists idx_tp_metricas
  on public.touchpoints (channel, result);

-- El siguiente número de la secuencia de un lead.
create index if not exists idx_tp_sequencia
  on public.touchpoints (lead_id, sequence_number);

-- ── leads: la cola de cadencia ───────────────────────────────────────────────
-- Hoy existe idx_leads_next_tp(next_touchpoint_date) WHERE status='active', pero
-- sin el vendedor adelante: la cola personal de cada uno sigue filtrando en memoria.
create index if not exists idx_leads_fila_cadencia
  on public.leads (vendor, status, next_touchpoint_date);

-- ── market_sweep: las 83 empresas asignadas que nunca entraron como lead ─────
create index if not exists idx_ms_por_promover
  on public.market_sweep (vendor, status)
  where crm_lead_id is null;

-- ── Los 4 índices de FK que el advisor marca como faltantes ──────────────────
create index if not exists idx_notifications_opportunity
  on public.notifications (opportunity_id);

create index if not exists idx_leads_opportunity
  on public.leads (opportunity_id);

create index if not exists idx_commitments_lead
  on public.commitments (lead_id);

create index if not exists idx_bot_sessions_vendor
  on public.bot_sessions (vendor_id);

-- ── bot_log: retención y privacidad ──────────────────────────────────────────
-- bot_log guarda transcripciones íntegras de conversaciones con clientes y no
-- tiene índice por fecha: sin él, cualquier purga por antigüedad hace seq scan.
create index if not exists idx_bot_log_created
  on public.bot_log (created_at);

commit;

-- Las estadísticas del planner nunca se actualizaron (list_tables reporta 0 filas
-- en vendors, que tiene 6): sin esto el planner elige mal aunque los índices existan.
analyze public.opportunities;
analyze public.activities;
analyze public.touchpoints;
analyze public.leads;
analyze public.vendors;
analyze public.market_sweep;
analyze public.commitments;
analyze public.notifications;

-- ============================================================================
-- VARIANTE CONCURRENTLY — para cuando las tablas sean grandes
-- ----------------------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY no bloquea INSERT/UPDATE/DELETE, pero:
--   1. NO puede correr dentro de una transacción (ni BEGIN/COMMIT, ni el bloque
--      transaccional implícito de `supabase db push` o de mcp apply_migration).
--   2. Si falla a mitad de camino deja un índice INVÁLIDO que hay que DROPear
--      a mano antes de reintentar.
--
-- CÓMO APLICARLO (una sentencia por conexión, sin transacción):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
--     "create index concurrently if not exists idx_opp_next_action_aberta \
--        on public.opportunities (next_action_date) where outcome is null;"
--
-- CÓMO DETECTAR UN ÍNDICE INVÁLIDO Y LIMPIARLO:
--
--   select c.relname
--   from pg_index i join pg_class c on c.oid = i.indexrelid
--   where not i.indisvalid;
--   -- drop index concurrently <nombre>;
--
-- EQUIVALENTES CONCURRENTES DE TODO LO DE ARRIBA (descomentar y correr sueltos):
--
-- create index concurrently if not exists idx_opp_next_action_aberta on public.opportunities (next_action_date) where outcome is null;
-- create index concurrently if not exists idx_opp_board             on public.opportunities (vendor, stage) where outcome is null;
-- create index concurrently if not exists idx_opp_expected_close    on public.opportunities (expected_close) where outcome is null;
-- create index concurrently if not exists idx_opp_frescura          on public.opportunities (last_activity_date desc) where outcome is null;
-- create index concurrently if not exists idx_act_timeline          on public.activities (opportunity_id, created_at desc);
-- create index concurrently if not exists idx_act_gamificacao       on public.activities (vendor, activity_date);
-- create index concurrently if not exists idx_act_humanas           on public.activities (opportunity_id, activity_date desc) where source in ('manual','ai_parsed');
-- create index concurrently if not exists idx_tp_executado          on public.touchpoints (executed_at desc);
-- create index concurrently if not exists idx_tp_metricas           on public.touchpoints (channel, result);
-- create index concurrently if not exists idx_tp_sequencia          on public.touchpoints (lead_id, sequence_number);
-- create index concurrently if not exists idx_leads_fila_cadencia   on public.leads (vendor, status, next_touchpoint_date);
-- create index concurrently if not exists idx_ms_por_promover       on public.market_sweep (vendor, status) where crm_lead_id is null;
-- create index concurrently if not exists idx_notifications_opportunity on public.notifications (opportunity_id);
-- create index concurrently if not exists idx_leads_opportunity     on public.leads (opportunity_id);
-- create index concurrently if not exists idx_commitments_lead      on public.commitments (lead_id);
-- create index concurrently if not exists idx_bot_sessions_vendor   on public.bot_sessions (vendor_id);
-- create index concurrently if not exists idx_bot_log_created       on public.bot_log (created_at);
--
-- ============================================================================
-- ÍNDICES QUE NUNCA SE USARON — decisión PENDIENTE, no se ejecuta acá
-- ----------------------------------------------------------------------------
-- El advisor los reporta con idx_scan = 0. Borrarlos es seguro para el v2 (un
-- índice no cambia resultados, sólo planes) pero es una operación DESTRUCTIVA y
-- por eso queda fuera de este archivo aditivo. Verificar primero:
--
--   select relname, indexrelname, idx_scan
--   from pg_stat_user_indexes
--   where schemaname = 'public'
--     and indexrelname in ('idx_opportunities_health_score','idx_notifications_vendor',
--                          'market_sweep_name_idx','idx_apollo_cache_endpoint',
--                          'idx_lusha_cache_expires')
--   order by idx_scan;
--
-- Y sólo si siguen en 0 después de un ciclo completo del v3:
--   drop index concurrently if exists public.idx_opportunities_health_score;
--   drop index concurrently if exists public.idx_notifications_vendor;
--   drop index concurrently if exists public.market_sweep_name_idx;
--   drop index concurrently if exists public.idx_apollo_cache_endpoint;
--   drop index concurrently if exists public.idx_lusha_cache_expires;
-- ============================================================================

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   explain (analyze, buffers)
--   select id, name, next_action, next_action_date from opportunities
--   where outcome is null and next_action_date <= current_date
--   order by next_action_date;
--   -- debe usar Index Scan / Bitmap Index Scan sobre idx_opp_next_action_aberta
--
--   select indexrelname, idx_scan from pg_stat_user_indexes
--   where schemaname='public' and indexrelname like 'idx_%' order by idx_scan desc;
