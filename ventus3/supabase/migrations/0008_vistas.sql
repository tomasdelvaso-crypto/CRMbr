-- ============================================================================
-- 0008_vistas.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Crea la tabla de apoyo `cadence_schedule` (los 7 toques en 21 días) y tres
--   vistas agregadas que resuelven en UNA consulta lo que hoy el v2 resuelve con
--   una avalancha de consultas por fila:
--     v_carteira_do_vendedor — una fila por oportunidad viva, con próxima acción,
--                              días sin contacto REAL, health declarado vs.
--                              verificado, y riesgo con sus motivos
--     v_fila_cadencia        — una fila por lead activo, con el toque que toca,
--                              el canal sugerido y los días de atraso
--     v_golden_queue         — la cola única de la Golden Hour: cadencia atrasada
--                              + empresas del mapa sin promover + tasks vencidas
--
-- POR QUÉ
--   Abrir la cartera en el v2 dispara ~195 consultas: una por oportunidad para el
--   timeline, otra para la última actividad, otra para el health. Con 65 filas
--   duele; con 300 es inusable en 4G. Estas vistas hacen el trabajo del lado del
--   servidor, en un round-trip.
--
-- SECURITY INVOKER en las TRES.
--   Las 5 vistas del v2 (pending_actions, vendor_notifications,
--   vendor_activity_summary, opportunity_timeline, stale_opportunities) son
--   SECURITY DEFINER y por eso devuelven filas de TODOS los vendedores a
--   cualquiera que las consulte — 4 ERROR del advisor de seguridad. Estas vistas
--   respetan las policies de quien pregunta.
--
--   Consecuencia honesta: la rama de `market_sweep` dentro de v_golden_queue
--   devuelve CERO filas con un JWT de vendedor, porque market_sweep tiene RLS
--   habilitado y CERO policies. Se arregla en 0100 (pendiente de aprobación) o
--   se consume vía Edge Function con service_role.
--
-- COMPATIBILIDAD CON EL v2 — ADITIVO: vistas y tabla nuevas. Ninguna vista
-- existente se modifica ni se reemplaza.
--
-- Depende de 0001 (tasks) y 0002 (opportunity_health). IDEMPOTENTE.
-- ============================================================================

begin;

-- ── cadence_schedule: los 7 toques en 21 días ────────────────────────────────
-- Hoy esta tabla vive hardcodeada en src/CadenciaComponents.jsx (CADENCE_SCHEDULE).
-- Moverla a la base permite que la vista, la RPC registrar_touchpoint (0009) y el
-- bot usen exactamente la misma definición, y que se pueda ajustar sin deploy.
create table if not exists public.cadence_schedule (
  tp         smallint primary key,
  dia_offset integer  not null,   -- días desde el inicio de la cadencia
  canal      text     not null,
  rotulo     text     not null,

  constraint cadence_schedule_tp_chk    check (tp between 1 and 7),
  constraint cadence_schedule_dia_chk   check (dia_offset >= 0),
  -- el canal tiene que ser uno de los que hoy acepta touchpoints_channel_check
  constraint cadence_schedule_canal_chk check (canal in ('linkedin','whatsapp','email','phone'))
);

comment on table public.cadence_schedule is
  'Ventus v3: cadência de 7 toques em 21 dias. Espelha CADENCE_SCHEDULE do v2 para que base, app e bot digam a mesma coisa.';

insert into public.cadence_schedule (tp, dia_offset, canal, rotulo) values
  (1,  1, 'linkedin', 'Conexão + mensagem personalizada'),
  (2,  3, 'whatsapp', 'Apresentação curta, pedir reunião'),
  (3,  6, 'email',    'Email de valor com caso de referência'),
  (4, 10, 'whatsapp', 'Follow-up, perguntar se viu o email'),
  (5, 13, 'phone',    'Chamada direta'),
  (6, 17, 'email',    'Último email formal'),
  (7, 21, 'whatsapp', 'Mensagem de despedida')
on conflict (tp) do nothing;

alter table public.cadence_schedule enable row level security;
revoke all on public.cadence_schedule from anon;
grant select on public.cadence_schedule to authenticated;
grant all    on public.cadence_schedule to service_role;

drop policy if exists cadence_schedule_select on public.cadence_schedule;
create policy cadence_schedule_select on public.cadence_schedule
  for select to authenticated using (true);

-- ── Reconstrucción idempotente de las tres vistas ────────────────────────────
-- Se dropean en orden INVERSO de dependencia (v_golden_queue lee v_fila_cadencia)
-- y se recrean en orden directo. Así el archivo se puede correr N veces.
drop view if exists public.v_golden_queue;
drop view if exists public.v_fila_cadencia;
drop view if exists public.v_carteira_do_vendedor;

-- ── v_carteira_do_vendedor ───────────────────────────────────────────────────
create view public.v_carteira_do_vendedor
with (security_invoker = on) as
with base as (
  select
    o.id                                as opportunity_id,
    o.name,
    o.client,
    o.vendor,
    o.stage,
    o.value,
    o.priority,
    o.product_lines,
    o.expected_close,
    o.probability,
    o.power_sponsor,
    o.sponsor,
    o.influencer,
    o.created_at,

    -- próxima acción: primero la task real (0001); si no hay, el campo del v2
    t.id                                as proxima_task_id,
    coalesce(t.titulo, o.next_action)   as proxima_acao,
    coalesce(t.data_alvo, o.next_action_date) as proxima_acao_data,
    t.canal                             as proxima_acao_canal,
    case
      when coalesce(t.data_alvo, o.next_action_date) is null then null
      else current_date - coalesce(t.data_alvo, o.next_action_date)
    end                                 as dias_atraso_acao,

    -- días sin contacto REAL: sólo interacciones comerciales humanas.
    -- Quedan afuera 'note' de origen system, 'ai_suggestion' y 'stage_change',
    -- que son el 88% de las activities y hoy disfrazan de actividad al ruido.
    a.ultima_data                       as ultimo_contato_real_em,
    case
      when a.ultima_data is null then null
      else current_date - a.ultima_data
    end                                 as dias_sem_contato_real,
    a.ultimo_tipo                       as ultimo_contato_tipo,

    h.health_declarado,
    h.health_verificado,
    h.escalas_sem_prova,
    h.escalas_infladas,
    h.ultima_prova_em,

    (select count(*) from public.tasks tk
      where tk.opportunity_id = o.id and tk.status = 'pending')::int as tasks_abertas
  from public.opportunities o
  left join lateral (
    select tk.id, tk.titulo, tk.canal, coalesce(tk.snoozed_to, tk.due_date) as data_alvo
    from public.tasks tk
    where tk.opportunity_id = o.id
      and tk.status in ('pending','snoozed')
    order by coalesce(tk.snoozed_to, tk.due_date) asc, tk.prioridade asc, tk.created_at asc
    limit 1
  ) t on true
  left join lateral (
    select coalesce(ac.activity_date, ac.created_at::date) as ultima_data,
           ac.activity_type                                as ultimo_tipo
    from public.activities ac
    where ac.opportunity_id = o.id
      and ac.activity_type in ('call','email','meeting','whatsapp','linkedin',
                               'demo','test','proposal','negotiation')
    order by coalesce(ac.activity_date, ac.created_at::date) desc, ac.id desc
    limit 1
  ) a on true
  left join public.opportunity_health h on h.opportunity_id = o.id
  where o.outcome is null
)
select
  b.*,
  -- riesgo determinístico: seis reglas, sin magia y sin IA
  case
    when b.proxima_acao_data is null
      or coalesce(b.dias_atraso_acao, 0) > 7
      or coalesce(b.dias_sem_contato_real, 9999) > 45
      or (b.stage >= 4 and coalesce(array_length(b.escalas_infladas, 1), 0) > 0)
      then 'critico'
    when coalesce(b.dias_atraso_acao, 0) > 0
      or coalesce(b.dias_sem_contato_real, 0) > 21
      or (b.expected_close is not null and b.expected_close < current_date)
      or (b.stage >= 3 and b.health_verificado is null)
      then 'atencao'
    else 'ok'
  end as risco,
  array_remove(array[
    case when b.proxima_acao_data is null                          then 'sem_proxima_acao' end,
    case when coalesce(b.dias_atraso_acao, 0) > 0                  then 'acao_vencida' end,
    case when coalesce(b.dias_sem_contato_real, 9999) > 45         then 'silencio_longo' end,
    case when coalesce(b.dias_sem_contato_real, 0) between 22 and 45 then 'silencio' end,
    case when b.expected_close is not null
          and b.expected_close < current_date                       then 'fechamento_vencido' end,
    case when coalesce(array_length(b.escalas_infladas, 1), 0) > 0  then 'escala_sem_prova' end,
    case when b.stage >= 3 and b.health_verificado is null          then 'sem_nenhuma_prova' end,
    case when b.tasks_abertas = 0                                   then 'sem_task' end
  ], null) as motivos_risco
from base b;

comment on view public.v_carteira_do_vendedor is
  'Ventus v3: uma linha por oportunidade viva com próxima ação, dias sem contato real, health declarado vs verificado e risco. Mata o N+1 do v2.';

-- ── v_fila_cadencia ──────────────────────────────────────────────────────────
create view public.v_fila_cadencia
with (security_invoker = on) as
select
  l.id                       as lead_id,
  l.vendor,
  l.company_name,
  l.company_domain,
  l.contact_name,
  l.contact_title,
  l.contact_whatsapp,
  l.contact_email,
  l.contact_phone,
  l.contact_linkedin,
  l.stage,
  l.touchpoints_count,
  (l.touchpoints_count + 1)::smallint as proximo_tp,
  cs.canal                   as canal_sugerido,
  cs.rotulo                  as rotulo_sugerido,
  l.next_touchpoint_date     as data_alvo,
  l.last_touchpoint_date,
  case
    when l.next_touchpoint_date is null then null
    else current_date - l.next_touchpoint_date
  end                        as dias_atraso,
  ut.channel                 as ultimo_canal,
  ut.result                  as ultimo_resultado,
  ut.executed_at             as ultimo_toque_em,
  ut.notes                   as ultima_nota,
  case
    when l.touchpoints_count >= 7                       then 'cadencia_esgotada'
    when l.next_touchpoint_date is null                 then 'sem_data'
    when l.next_touchpoint_date <  current_date         then 'atrasado'
    when l.next_touchpoint_date =  current_date         then 'hoje'
    else 'agendado'
  end                        as situacao,
  -- canales realmente disponibles para este lead (el WhatsApp convierte 3,5x
  -- más que el email pero sólo 2 de 54 leads lo tienen cargado)
  array_remove(array[
    case when nullif(btrim(coalesce(l.contact_whatsapp, '')), '') is not null then 'whatsapp' end,
    case when nullif(btrim(coalesce(l.contact_email,    '')), '') is not null then 'email' end,
    case when nullif(btrim(coalesce(l.contact_phone,    '')), '') is not null then 'phone' end,
    case when nullif(btrim(coalesce(l.contact_linkedin, '')), '') is not null then 'linkedin' end
  ], null)                   as canais_disponiveis
from public.leads l
left join public.cadence_schedule cs
       on cs.tp = (l.touchpoints_count + 1)
left join lateral (
  select t.channel, t.result, t.executed_at, t.notes
  from public.touchpoints t
  where t.lead_id = l.id
  order by t.executed_at desc, t.id desc
  limit 1
) ut on true
where l.status = 'active';

comment on view public.v_fila_cadencia is
  'Ventus v3: fila de cadência por lead ativo, com o toque que toca, canal sugerido e atraso. Hoje 48 de 54 leads estão vencidos.';

-- ── v_golden_queue ───────────────────────────────────────────────────────────
-- La cola única de la Golden Hour, ordenada por urgencia real. Tres fuentes con
-- la misma forma para que el cliente no tenga que unirlas a mano.
create view public.v_golden_queue
with (security_invoker = on) as

-- 1. Cadencia atrasada o de hoy: lo más barato de convertir
select
  f.vendor,
  'cadencia'::text                   as origem,
  'lead'::text                       as entity_kind,
  f.lead_id::text                    as entity_id,
  f.company_name                     as titulo,
  coalesce(f.contact_name, 'Sem contato identificado') as subtitulo,
  f.canal_sugerido,
  f.data_alvo,
  coalesce(f.dias_atraso, 0)         as dias_atraso,
  case when coalesce(f.dias_atraso, 0) > 14 then 1
       when coalesce(f.dias_atraso, 0) > 0  then 2
       else 3 end::smallint          as prioridade,
  f.rotulo_sugerido                  as sugestao
from public.v_fila_cadencia f
where f.situacao in ('atrasado','hoje','sem_data')
  and f.touchpoints_count < 7

union all

-- 2. Empresas ya asignadas del mapa de mercado que nunca entraron como lead.
--    Son 83 en producción: 83 arranques de prospección listos.
--    OJO: market_sweep tiene RLS ON y CERO policies, así que con un JWT de
--    vendedor esta rama devuelve 0 filas hasta que 0100 le dé una policy.
select
  ms.vendor,
  'mapa'::text                       as origem,
  'market_sweep'::text               as entity_kind,
  ms.id::text                        as entity_id,
  ms.company_name                    as titulo,
  coalesce(ms.sector, ms.target_line, 'Empresa mapeada') as subtitulo,
  'linkedin'::text                   as canal_sugerido,
  current_date                       as data_alvo,
  0                                  as dias_atraso,
  3::smallint                        as prioridade,
  'Promover para lead e iniciar cadência'::text as sugestao
from public.market_sweep ms
where ms.crm_lead_id is null
  and ms.vendor is not null
  and ms.status in ('asignada','pool','en_barrido')

union all

-- 3. Tasks de contacto vencidas o de hoy sobre oportunidades vivas
select
  tk.vendor,
  'task'::text                       as origem,
  'task'::text                       as entity_kind,
  tk.id::text                        as entity_id,
  tk.titulo,
  coalesce(o.client, o.name, '')     as subtitulo,
  tk.canal                           as canal_sugerido,
  coalesce(tk.snoozed_to, tk.due_date) as data_alvo,
  current_date - coalesce(tk.snoozed_to, tk.due_date) as dias_atraso,
  case when current_date - coalesce(tk.snoozed_to, tk.due_date) > 7 then 1
       when current_date - coalesce(tk.snoozed_to, tk.due_date) > 0 then 2
       else 3 end::smallint          as prioridade,
  coalesce(tk.expected_outcome, 'Executar a próxima ação combinada') as sugestao
from public.tasks tk
join public.opportunities o on o.id = tk.opportunity_id
where tk.status in ('pending','snoozed')
  and coalesce(tk.snoozed_to, tk.due_date) <= current_date
  and o.outcome is null
  and tk.canal in ('call','whatsapp','email','linkedin');

comment on view public.v_golden_queue is
  'Ventus v3: fila única da Golden Hour (cadência atrasada + mapa por promover + tasks vencidas), já ordenável por prioridade e atraso.';

-- ── Permisos de las vistas ───────────────────────────────────────────────────
revoke all on public.v_carteira_do_vendedor, public.v_fila_cadencia, public.v_golden_queue from anon;
grant select on public.v_carteira_do_vendedor, public.v_fila_cadencia, public.v_golden_queue
  to authenticated, service_role;

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   -- 1. las tres son SECURITY INVOKER (debe devolver 3 filas con 'security_invoker=true'):
--   select c.relname, c.reloptions
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in ('v_carteira_do_vendedor','v_fila_cadencia','v_golden_queue','opportunity_health');
--
--   -- 2. una sola consulta reemplaza las ~195 del v2:
--   explain (analyze, buffers) select * from v_carteira_do_vendedor where vendor = 'Victor Hugo';
--
--   -- 3. el estado real de la cadencia:
--   select situacao, count(*) from v_fila_cadencia group by situacao order by 2 desc;
--
--   -- 4. la cola de mañana:
--   select origem, count(*) from v_golden_queue group by origem;
