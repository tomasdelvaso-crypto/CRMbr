-- ============================================================================
-- 0003_ventus_actions.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Implementa el contrato propose-then-commit del asistente Ventus:
--     * `ventus_actions`   — cada escritura que la IA quiere hacer se PROPONE
--       primero (con evidencia, confianza, hash de precondición y clave de
--       idempotencia) y sólo se ejecuta cuando el vendedor la confirma.
--     * `ventus_audit`     — bitácora APPEND-ONLY con el antes/después de cada
--       escritura. Ni UPDATE ni DELETE, ni por policy ni por trigger.
--     * `ventus_idempotency` — memoria de resultados por clave, para que un
--       reintento del outbox offline devuelva lo mismo en vez de duplicar.
--
-- POR QUÉ
--   Un asistente que escribe directo en el CRM es un asistente que corrompe el
--   CRM en silencio. El chat NO es audit trail: si Ventus mueve una escala o
--   avanza una etapa, tiene que quedar quién lo propuso, con qué prueba, quién
--   lo aceptó y contra qué estado de la fila (staleness check). Sin eso no se
--   puede medir si Ventus sirve, ni revertir cuando se equivoca.
--
-- COMPATIBILIDAD CON EL v2 — 100% ADITIVO: tablas nuevas, nada existente se toca.
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ── ventus_actions: la propuesta ─────────────────────────────────────────────
create table if not exists public.ventus_actions (
  id                uuid        primary key default gen_random_uuid(),
  vendor            text        not null,
  vendor_id         integer     references public.vendors(id) on delete set null,
  tipo              text        not null,   -- criar_task | atualizar_escala | avancar_etapa | registrar_touchpoint | ...
  payload           jsonb       not null default '{}'::jsonb,
  evidencia         jsonb,                  -- las señales que justifican la propuesta ("Por que isto?")
  confianca         text        not null default 'media',
  -- precondition_hash: huella del estado de la entidad en el momento de proponer.
  -- Si al confirmar la huella cambió, la propuesta está STALE y no se ejecuta.
  precondition_hash text,
  -- idempotency_key: el cliente la genera. Reintentos = un solo commit.
  idempotency_key   text        not null,
  status            text        not null default 'proposed',
  entity_kind       text,                   -- opportunity | lead | task | touchpoint | activity
  entity_id         text,                   -- texto porque conviven ids bigint y uuid
  superficie        text,                   -- app | telegram | tma | cron
  motivo            text,                   -- explicación mostrable al vendedor
  resultado         jsonb,                  -- lo que devolvió la ejecución
  expires_at        timestamptz not null default now() + interval '48 hours',
  created_at        timestamptz not null default now(),
  committed_at      timestamptz,
  dismissed_at      timestamptz,
  dismissed_reason  text,

  constraint ventus_actions_idempotency_key_key unique (idempotency_key),
  constraint ventus_actions_status_chk    check (status in ('proposed','committed','dismissed','expired')),
  constraint ventus_actions_conf_chk      check (confianca in ('alta','media','baixa')),
  constraint ventus_actions_kind_chk      check (entity_kind is null or entity_kind in
                                            ('opportunity','lead','task','touchpoint','activity','market_sweep')),
  constraint ventus_actions_surf_chk      check (superficie is null or superficie in ('app','telegram','tma','cron')),
  constraint ventus_actions_dismiss_chk   check (dismissed_reason is null or dismissed_reason in
                                            ('dado_errado','ja_fiz','nao_e_prioridade','outro')),
  -- coherencia de estados: los timestamps los estampa el trigger
  constraint ventus_actions_committed_chk check (status <> 'committed' or committed_at is not null),
  constraint ventus_actions_dismissed_chk check (status <> 'dismissed' or dismissed_at is not null)
);

comment on table  public.ventus_actions is
  'Ventus v3: propose-then-commit. A IA propõe, o vendedor confirma. Nada se escreve sem passar por aqui.';
comment on column public.ventus_actions.precondition_hash is
  'Impressão do estado da entidade no momento da proposta. Se mudou, ventus_commit_action recusa por staleness.';
comment on column public.ventus_actions.idempotency_key is
  'Chave gerada no cliente. UNIQUE: reenvio do outbox offline não duplica ação.';

create index if not exists idx_ventus_actions_pendentes
  on public.ventus_actions (vendor, created_at desc) where status = 'proposed';
create index if not exists idx_ventus_actions_expira
  on public.ventus_actions (expires_at) where status = 'proposed';
-- taxa de aceitação por tipo: sem isto não dá para saber se o Ventus serve
create index if not exists idx_ventus_actions_aprendizado
  on public.ventus_actions (tipo, status);
create index if not exists idx_ventus_actions_entidade
  on public.ventus_actions (entity_kind, entity_id);

create or replace function public.ventus_actions_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.status = 'committed' and new.committed_at is null then
    new.committed_at := now();
  end if;
  if new.status = 'dismissed' and new.dismissed_at is null then
    new.dismissed_at := now();
  end if;
  if new.vendor_id is null and new.vendor is not null then
    select v.id into new.vendor_id from public.vendors v where v.name = new.vendor limit 1;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ventus_actions_before_write on public.ventus_actions;
create trigger trg_ventus_actions_before_write
  before insert or update on public.ventus_actions
  for each row execute function public.ventus_actions_before_write();

-- ── ventus_audit: append-only de verdad ──────────────────────────────────────
create table if not exists public.ventus_audit (
  id          bigint      generated always as identity primary key,
  action_id   uuid        references public.ventus_actions(id) on delete set null,
  actor       text        not null,   -- 'ventus' | nome do vendedor | 'cron' | 'bot'
  evento      text        not null,   -- proposed | committed | dismissed | expired | manual_write
  entity_kind text,
  entity_id   text,
  antes       jsonb,
  depois      jsonb,
  contexto    jsonb,
  at          timestamptz not null default now()
);

comment on table public.ventus_audit is
  'Ventus v3: trilha append-only do antes/depois de cada escrita. O chat NÃO é audit trail.';

create index if not exists idx_ventus_audit_action on public.ventus_audit (action_id);
create index if not exists idx_ventus_audit_at     on public.ventus_audit (at desc);
create index if not exists idx_ventus_audit_entity on public.ventus_audit (entity_kind, entity_id, at desc);

-- Doble candado. (1) Trigger: bloquea UPDATE y DELETE incluso para el owner y
-- para service_role, que saltan RLS. (2) Policies: ni siquiera se ofrece la
-- acción al rol authenticated.
create or replace function public.ventus_audit_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'ventus_audit é append-only: % não é permitido', tg_op
    using errcode = '42501',
          hint    = 'Para corrigir um registro, insira uma nova linha de auditoria.';
  return null;
end;
$fn$;

drop trigger if exists trg_ventus_audit_no_update on public.ventus_audit;
create trigger trg_ventus_audit_no_update
  before update on public.ventus_audit
  for each row execute function public.ventus_audit_append_only();

drop trigger if exists trg_ventus_audit_no_delete on public.ventus_audit;
create trigger trg_ventus_audit_no_delete
  before delete on public.ventus_audit
  for each row execute function public.ventus_audit_append_only();

-- ── ventus_idempotency: memoria de resultados ────────────────────────────────
-- La usan las RPC de 0009 para que un reintento devuelva el MISMO resultado en
-- vez de crear un segundo touchpoint / lead / task.
create table if not exists public.ventus_idempotency (
  chave      text        primary key,
  escopo     text        not null,   -- nome da RPC
  vendor     text,
  resultado  jsonb       not null,
  created_at timestamptz not null default now()
);

comment on table public.ventus_idempotency is
  'Ventus v3: resultado memorizado por chave de idempotência. Reenvio offline devolve o mesmo, não duplica.';

create index if not exists idx_ventus_idem_created on public.ventus_idempotency (created_at);

-- ── Seguridad ────────────────────────────────────────────────────────────────
alter table public.ventus_actions      enable row level security;
alter table public.ventus_audit        enable row level security;
alter table public.ventus_idempotency  enable row level security;

revoke all on public.ventus_actions     from anon;
revoke all on public.ventus_audit       from anon;
revoke all on public.ventus_idempotency from anon;

grant select, insert, update on public.ventus_actions to authenticated;
grant all    on public.ventus_actions to service_role;

-- authenticated NO recibe update/delete sobre la auditoría, ni siquiera revocable
-- por policy: directamente no tiene el privilegio.
grant select, insert on public.ventus_audit to authenticated;
grant select, insert on public.ventus_audit to service_role;
revoke update, delete, truncate on public.ventus_audit from authenticated, anon, service_role;

grant select on public.ventus_idempotency to authenticated;
grant all    on public.ventus_idempotency to service_role;

drop policy if exists ventus_actions_select on public.ventus_actions;
create policy ventus_actions_select on public.ventus_actions
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists ventus_actions_insert on public.ventus_actions;
create policy ventus_actions_insert on public.ventus_actions
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

-- El vendedor puede aceptar o descartar su propia propuesta, no reescribirla:
-- el WITH CHECK le impide cambiarse el dueño.
drop policy if exists ventus_actions_update on public.ventus_actions;
create policy ventus_actions_update on public.ventus_actions
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists ventus_audit_select on public.ventus_audit;
create policy ventus_audit_select on public.ventus_audit
  for select to authenticated
  using (true);   -- la trilha é legível pelo time inteiro: transparência é o ponto

drop policy if exists ventus_audit_insert on public.ventus_audit;
create policy ventus_audit_insert on public.ventus_audit
  for insert to authenticated
  with check (true);

-- ventus_idempotency: sólo lo escriben las RPC (SECURITY DEFINER) y el backend.
drop policy if exists ventus_idem_select on public.ventus_idempotency;
create policy ventus_idem_select on public.ventus_idempotency
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   insert into ventus_audit (actor, evento) values ('teste','manual_write');
--   update ventus_audit set actor = 'x' where actor = 'teste';   -- debe FALLAR (42501)
--   delete from ventus_audit where actor = 'teste';              -- debe FALLAR (42501)
--   -- limpiar: alter table ventus_audit disable trigger trg_ventus_audit_no_delete;
--   --          delete from ventus_audit where actor='teste';
--   --          alter table ventus_audit enable trigger trg_ventus_audit_no_delete;
