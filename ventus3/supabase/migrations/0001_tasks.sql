-- ============================================================================
-- 0001_tasks.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Crea la tabla `tasks`: la "próxima acción" deja de ser un par de columnas
--   desnormalizadas en `opportunities` y pasa a ser una entidad de primera clase
--   (dueño, fecha obligatoria, canal, estado, origen, borrador de mensaje).
--
-- POR QUÉ
--   Auditoría: 51 de las 54 oportunidades vivas NO tienen next_action_date, y el
--   bot de Telegram y la web se pisan mutuamente el campo `next_action`. Sin una
--   entidad con dueño y estado no hay "qué hago ahora" posible, ni cola offline
--   idempotente, ni cierre de ciclo medible.
--
-- COMPATIBILIDAD CON EL CRM v2 (PRODUCCIÓN) — ADITIVO, NO ROMPE NADA
--   * No se borra ni renombra ninguna columna de `opportunities`.
--   * Un trigger PROYECTA la task abierta más próxima sobre
--     opportunities.next_action / next_action_date, así el v2 la sigue viendo
--     exactamente igual que hoy.
--   * Al cerrarse la última task, el trigger sólo limpia esos campos si el valor
--     visible es el que ESCRIBIMOS NOSOTROS (comparación explícita). Nunca pisa
--     un texto cargado a mano desde el v2.
--
-- TIPOS REALES (verificados contra wtrbvgqxgcfjacqcndmb, postgres 17.4):
--   vendors.id = integer · opportunities.id = bigint · leads.id = bigint
--   activities.id = bigint. (El PLANO los suponía uuid: NO lo son.)
--
-- IDEMPOTENTE: se puede correr N veces.
-- ============================================================================

begin;

-- ── Helper de identidad ───────────────────────────────────────────────────────
-- Devuelve el vendors.id del usuario autenticado. Complementa (no reemplaza) a
-- current_vendor_name() del v2, que devuelve el nombre en texto.
create or replace function public.ventus_current_vendor_id()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select v.id
  from public.vendors v
  where v.auth_id = (select auth.uid())
    and coalesce(v.is_active, true)
  limit 1;
$fn$;

comment on function public.ventus_current_vendor_id() is
  'Ventus v3: vendors.id del usuario autenticado (integer). search_path fijo.';

revoke all on function public.ventus_current_vendor_id() from public, anon;
grant execute on function public.ventus_current_vendor_id() to authenticated, service_role;

-- ── Tabla tasks ───────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                   uuid        primary key default gen_random_uuid(),
  -- client_uuid: lo genera el cliente offline ANTES de tener red. El UNIQUE es
  -- lo que hace idempotente al outbox (reintentos = 1 sola fila).
  client_uuid          uuid        not null default gen_random_uuid(),
  -- vendor (texto) es el que leen las policies del v2; vendor_id es el destino.
  vendor               text        not null,
  vendor_id            integer     references public.vendors(id) on delete set null,
  opportunity_id       bigint      references public.opportunities(id) on delete cascade,
  lead_id              bigint      references public.leads(id) on delete cascade,
  titulo               text        not null,
  canal                text,
  due_date             date        not null,
  due_time             time,
  prioridade           smallint    not null default 2,
  target_scale         text,
  draft_content        text,        -- el mensaje ya redactado, listo para copiar
  expected_outcome     text,        -- qué prueba concreta esperamos obtener
  status               text        not null default 'pending',
  origem               text        not null default 'manual',
  done_at              timestamptz,
  snoozed_to           date,
  resolved_activity_id bigint      references public.activities(id) on delete set null,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint tasks_client_uuid_key      unique (client_uuid),
  constraint tasks_status_chk           check (status in ('pending','done','snoozed','cancelled')),
  constraint tasks_origem_chk           check (origem in ('manual','ia','bot','cron','planner')),
  constraint tasks_canal_chk            check (canal is null or canal in
                                          ('call','whatsapp','email','linkedin','meeting','visit','demo','proposal','other')),
  constraint tasks_target_scale_chk     check (target_scale is null or target_scale in
                                          ('dor','poder','visao','valor','controle','compras')),
  constraint tasks_prioridade_chk       check (prioridade between 1 and 3),
  constraint tasks_titulo_chk           check (btrim(titulo) <> ''),
  -- toda task cuelga de algo: o de una oportunidad o de un lead
  constraint tasks_owner_chk            check (opportunity_id is not null or lead_id is not null),
  -- 'snoozed' sin fecha de vuelta es una task perdida
  constraint tasks_snooze_chk           check (status <> 'snoozed' or snoozed_to is not null),
  -- coherencia de cierre (done_at lo estampa el trigger, el CHECK lo garantiza)
  constraint tasks_done_chk             check (status <> 'done' or done_at is not null)
);

comment on table  public.tasks                is 'Ventus v3: próxima ação como entidade de primeira classe. Projeta-se em opportunities.next_action via trigger.';
comment on column public.tasks.client_uuid    is 'UUID gerado no cliente (outbox offline). O UNIQUE garante idempotência do reenvio.';
comment on column public.tasks.due_date       is 'Data OBRIGATÓRIA. Regra 2 do v3: nenhuma ação sem data.';
comment on column public.tasks.draft_content  is 'Rascunho da mensagem (hoje o v2 descarta este texto ao persistir o action plan).';
comment on column public.tasks.origem         is 'manual | ia | bot | cron | planner';

-- ── Índices ───────────────────────────────────────────────────────────────────
-- Agenda del vendedor: "mis tasks abiertas ordenadas por fecha".
create index if not exists idx_tasks_agenda      on public.tasks (vendor, status, due_date);
create index if not exists idx_tasks_agenda_id   on public.tasks (vendor_id, status, due_date);
-- Ficha de oportunidad + proyección del trigger.
create index if not exists idx_tasks_opportunity on public.tasks (opportunity_id);
create index if not exists idx_tasks_opp_open    on public.tasks (opportunity_id, due_date) where status = 'pending';
create index if not exists idx_tasks_lead        on public.tasks (lead_id) where lead_id is not null;
-- Cola global "vencidas de todo el equipo" (admin).
create index if not exists idx_tasks_due_open    on public.tasks (due_date) where status in ('pending','snoozed');

-- ── Trigger 1: normalización antes de escribir ────────────────────────────────
create or replace function public.ventus_tasks_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();

  -- done_at se estampa solo; reabrir una task lo limpia
  if new.status = 'done' then
    if new.done_at is null then
      new.done_at := now();
    end if;
  else
    new.done_at := null;
  end if;

  -- snoozed_to sólo tiene sentido mientras la task está dormida
  if new.status <> 'snoozed' then
    new.snoozed_to := null;
  end if;

  -- si vino el nombre pero no el id (o al revés), completamos el que falte
  if new.vendor_id is null and new.vendor is not null then
    select v.id into new.vendor_id from public.vendors v where v.name = new.vendor limit 1;
  elsif new.vendor is null and new.vendor_id is not null then
    select v.name into new.vendor from public.vendors v where v.id = new.vendor_id limit 1;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_tasks_before_write on public.tasks;
create trigger trg_tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.ventus_tasks_before_write();

-- ── Trigger 2: proyección sobre opportunities (compatibilidad con el v2) ──────
-- SECURITY DEFINER porque el vendedor puede no tener UPDATE sobre la fila de
-- opportunities bajo las policies futuras (0100), pero la proyección tiene que
-- ocurrir igual. search_path fijo.
create or replace function public.ventus_sync_next_action(
  p_opportunity_id  bigint,
  p_titulo_anterior text default null,
  p_data_anterior   date default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_titulo text;
  v_data   date;
begin
  if p_opportunity_id is null then
    return;
  end if;

  -- la task abierta más próxima (una task dormida vuelve por snoozed_to)
  select t.titulo, coalesce(t.snoozed_to, t.due_date)
    into v_titulo, v_data
  from public.tasks t
  where t.opportunity_id = p_opportunity_id
    and t.status in ('pending','snoozed')
  order by coalesce(t.snoozed_to, t.due_date) asc, t.prioridade asc, t.created_at asc
  limit 1;

  if v_titulo is not null then
    update public.opportunities o
       set next_action      = v_titulo,
           next_action_date = v_data
     where o.id = p_opportunity_id
       and (o.next_action is distinct from v_titulo
         or o.next_action_date is distinct from v_data);
  else
    -- No quedan tasks abiertas. Limpiamos SOLAMENTE si lo visible es lo que
    -- nosotros habíamos escrito. Un texto cargado a mano en el v2 no se toca.
    update public.opportunities o
       set next_action      = null,
           next_action_date = null
     where o.id = p_opportunity_id
       and p_titulo_anterior is not null
       and o.next_action = p_titulo_anterior
       and o.next_action_date is not distinct from p_data_anterior;
  end if;
end;
$fn$;

comment on function public.ventus_sync_next_action(bigint, text, date) is
  'Ventus v3: projeta a task aberta mais próxima em opportunities.next_action/_date. Não sobrescreve texto digitado no v2.';

revoke all on function public.ventus_sync_next_action(bigint, text, date) from public, anon;
grant execute on function public.ventus_sync_next_action(bigint, text, date) to authenticated, service_role;

create or replace function public.ventus_tasks_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- OLD sólo existe en UPDATE/DELETE: las ramas están separadas a propósito,
  -- referenciar OLD en un INSERT levanta "record old is not assigned yet".
  if tg_op = 'INSERT' then
    perform public.ventus_sync_next_action(new.opportunity_id, null, null);

  elsif tg_op = 'DELETE' then
    perform public.ventus_sync_next_action(
      old.opportunity_id, old.titulo, coalesce(old.snoozed_to, old.due_date));

  else -- UPDATE
    perform public.ventus_sync_next_action(
      old.opportunity_id, old.titulo, coalesce(old.snoozed_to, old.due_date));
    if new.opportunity_id is distinct from old.opportunity_id then
      perform public.ventus_sync_next_action(new.opportunity_id, null, null);
    end if;
  end if;

  return null; -- AFTER ... FOR EACH ROW: el valor de retorno se ignora
end;
$fn$;

drop trigger if exists trg_tasks_sync_next_action on public.tasks;
create trigger trg_tasks_sync_next_action
  after insert or update or delete on public.tasks
  for each row execute function public.ventus_tasks_after_change();

-- ── Seguridad de la tabla nueva ──────────────────────────────────────────────
-- Supabase aplica DEFAULT PRIVILEGES que otorgan la tabla a anon: se revoca.
alter table public.tasks enable row level security;
revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

commit;

-- ── VERIFICACIÓN (correr a mano después de aplicar) ──────────────────────────
--   insert into tasks (vendor, opportunity_id, titulo, due_date, canal)
--   values ((select vendor from opportunities where id = 46), 46, 'Teste projeção', current_date + 1, 'whatsapp');
--   select next_action, next_action_date from opportunities where id = 46;  -- debe mostrar 'Teste projeção'
--   update tasks set status = 'done' where titulo = 'Teste projeção';
--   select next_action, next_action_date from opportunities where id = 46;  -- debe volver a NULL
--   delete from tasks where titulo = 'Teste projeção';
