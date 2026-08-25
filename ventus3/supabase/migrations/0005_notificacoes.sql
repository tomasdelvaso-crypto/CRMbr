-- ============================================================================
-- 0005_notificacoes.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Crea la cola de notificaciones del v3 (`notification_queue`), las preferencias
--   por vendedor (`notification_prefs`) y las suscripciones Web Push
--   (`push_subscriptions`), con deduplicación y medición obligatorias.
--
-- POR QUÉ
--   Auditoría: la tabla `notifications` del v2 tiene 4.521 filas de SÓLO DOS tipos,
--   generadas una por oportunidad por día sin deduplicar, con 0,0% de lectura.
--   La oportunidad 46 acumuló 106 avisos en 106 días; Victor Hugo recibía 17 por
--   día. Todo el sistema de alertas quedó entrenado como ruido.
--   El v3 arranca de cero con tres reglas en la base:
--     * dedupe_key obligatoria — nunca dos avisos de lo mismo en la misma ventana
--     * presupuesto diario por persona (notification_prefs.orcamento_diario)
--     * medición: enviado_em / lido_em / agido_em. Sin tasa de acción no hay
--       control de calidad del propio sistema de avisos.
--
-- COMPATIBILIDAD CON EL v2 — 100% ADITIVO
--   La tabla `notifications` del v2 NO se toca, NO se migra y NO se borra: el CRM
--   en producción la sigue leyendo igual. El v3 escribe en `notification_queue`.
--   El apagado del cron 'check-inactivity-daily' que la llena de ruido es una
--   decisión operativa: está documentada en 0100 y en el README, no acá.
--
-- IDEMPOTENTE. Depende de 0003 (ventus_actions) para el enlace opcional action_id.
-- ============================================================================

begin;

-- ── notification_queue ───────────────────────────────────────────────────────
create table if not exists public.notification_queue (
  id              uuid        primary key default gen_random_uuid(),
  vendor          text        not null,
  vendor_id       integer     references public.vendors(id) on delete set null,
  tipo            text        not null,
  prioridade      smallint    not null default 3,
  titulo          text        not null,
  corpo           text        not null,
  payload         jsonb       not null default '{}'::jsonb,
  canal           text        not null default 'push',
  topic           text,       -- topic del push: un aviso nuevo REEMPLAZA al anterior del mismo topic
  ttl_segundos    integer     not null default 3600,
  deep_link       text,
  acoes           jsonb,      -- botones de acción rápida
  action_id       uuid        references public.ventus_actions(id) on delete set null,
  opportunity_id  bigint      references public.opportunities(id) on delete cascade,
  lead_id         bigint      references public.leads(id) on delete cascade,
  task_id         uuid        references public.tasks(id) on delete cascade,
  -- dedupe_key: (vendor, entidade, tipo) resumido en un texto por quien encola
  dedupe_key      text        not null,
  agendado_para   timestamptz not null default now(),
  -- ventana de dedupe: el día calendario de São Paulo del envío programado.
  -- Columna GENERADA: el cliente no puede falsear la ventana.
  dedupe_dia      date generated always as
                    (((agendado_para at time zone 'America/Sao_Paulo'))::date) stored,
  enviado_em      timestamptz,
  lido_em         timestamptz,
  agido_em        timestamptz,
  adiado_para     timestamptz,
  suprimido_motivo text,      -- 'orcamento_diario' | 'horario_silencio' | 'tipo_mutado' | 'duplicada'
  created_at      timestamptz not null default now(),

  constraint notification_queue_prioridade_chk check (prioridade between 1 and 4),
  constraint notification_queue_canal_chk      check (canal in ('push','telegram','ambos')),
  constraint notification_queue_ttl_chk        check (ttl_segundos between 60 and 86400),
  constraint notification_queue_titulo_chk     check (btrim(titulo) <> '' and btrim(corpo) <> ''),
  constraint notification_queue_dedupe_chk     check (btrim(dedupe_key) <> ''),
  constraint notification_queue_acoes_chk      check (acoes is null or jsonb_typeof(acoes) = 'array'),
  -- no se puede leer algo que nunca se envió, ni actuar sobre algo no enviado
  constraint notification_queue_ordem_chk      check (
    (lido_em is null or enviado_em is not null) and
    (agido_em is null or enviado_em is not null)),
  constraint notification_queue_supr_chk       check (
    suprimido_motivo is null or suprimido_motivo in
      ('orcamento_diario','horario_silencio','tipo_mutado','duplicada','entidade_resolvida'))
);

comment on table  public.notification_queue is
  'Ventus v3: fila de avisos com dedupe, orçamento e medição. Substitui o ruído de `notifications` do v2 (0,0% de leitura).';
comment on column public.notification_queue.dedupe_key is
  'Resumo de (vendor, entidade, tipo). O índice único impede o segundo aviso igual na mesma janela.';
comment on column public.notification_queue.topic is
  'Topic de Web Push / Telegram: um aviso novo do mesmo topic SUBSTITUI o anterior na bandeja.';

-- ── Índices y dedupe ─────────────────────────────────────────────────────────
-- La cola del dispatcher: "qué tengo para mandar ya".
create index if not exists idx_notification_queue_fila
  on public.notification_queue (vendor, agendado_para)
  where enviado_em is null;

-- Dedupe 1: mientras algo sigue SIN ENVIAR, no se encola otra vez lo mismo.
create unique index if not exists uq_notification_queue_pendente
  on public.notification_queue (vendor, dedupe_key)
  where enviado_em is null and suprimido_motivo is null;

-- Dedupe 2: dentro de la misma VENTANA (día calendario de São Paulo) no se
-- vuelve a avisar lo mismo aunque el primero ya se haya enviado. Esto es
-- exactamente lo que faltaba en el v2: 106 avisos de la opp 46 en 106 días.
create unique index if not exists uq_notification_queue_janela
  on public.notification_queue (vendor, dedupe_key, dedupe_dia);

create index if not exists idx_notification_queue_medicao
  on public.notification_queue (tipo, enviado_em desc);
create index if not exists idx_notification_queue_entidade
  on public.notification_queue (opportunity_id) where opportunity_id is not null;

-- ── notification_prefs: el presupuesto ───────────────────────────────────────
create table if not exists public.notification_prefs (
  vendor           text        primary key,
  vendor_id        integer     references public.vendors(id) on delete set null,
  orcamento_diario integer     not null default 4,
  silencio_de      time        not null default '20:00',
  silencio_ate     time        not null default '07:00',
  canais           text[]      not null default '{telegram,push}'::text[],
  tipos_mutados    text[]      not null default '{}'::text[],
  avisos_de_jogo   boolean     not null default true,   -- opt-out real de anéis e rachas
  hora_aprendida   smallint,                            -- hora em que este vendedor realmente age
  updated_at       timestamptz not null default now(),

  constraint notification_prefs_orcamento_chk check (orcamento_diario between 0 and 12),
  constraint notification_prefs_hora_chk      check (hora_aprendida is null or hora_aprendida between 0 and 23)
);

comment on column public.notification_prefs.orcamento_diario is
  'Máximo de empurrões por dia. Default 4. O v2 chegou a 17 por dia e por isso ninguém lê mais nada.';

-- ── push_subscriptions ───────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  vendor       text        not null,
  vendor_id    integer     references public.vendors(id) on delete set null,
  endpoint     text        not null,
  p256dh       text        not null,
  auth         text        not null,
  user_agent   text,
  plataforma   text,       -- ios | android | desktop
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  failed_at    timestamptz,

  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_plat_chk check (plataforma is null or plataforma in ('ios','android','desktop'))
);

comment on table public.push_subscriptions is
  'Ventus v3: assinaturas Web Push (VAPID). failed_at marca endpoint morto para não gastar envio.';

create index if not exists idx_push_subscriptions_vendor
  on public.push_subscriptions (vendor) where failed_at is null;

-- ── Seguridad ────────────────────────────────────────────────────────────────
alter table public.notification_queue  enable row level security;
alter table public.notification_prefs  enable row level security;
alter table public.push_subscriptions  enable row level security;

revoke all on public.notification_queue, public.notification_prefs, public.push_subscriptions from anon;
grant all on public.notification_queue, public.notification_prefs, public.push_subscriptions to service_role;

-- El vendedor lee sus avisos y marca lido/agido; el encolado lo hace el backend.
grant select, update on public.notification_queue to authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists notification_queue_select on public.notification_queue;
create policy notification_queue_select on public.notification_queue
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists notification_queue_update on public.notification_queue;
create policy notification_queue_update on public.notification_queue
  for update to authenticated
  using (vendor = (select public.current_vendor_name()))
  with check (vendor = (select public.current_vendor_name()));

drop policy if exists notification_prefs_select on public.notification_prefs;
create policy notification_prefs_select on public.notification_prefs
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists notification_prefs_insert on public.notification_prefs;
create policy notification_prefs_insert on public.notification_prefs
  for insert to authenticated
  with check (vendor = (select public.current_vendor_name()));

drop policy if exists notification_prefs_update on public.notification_prefs;
create policy notification_prefs_update on public.notification_prefs
  for update to authenticated
  using (vendor = (select public.current_vendor_name()))
  with check (vendor = (select public.current_vendor_name()));

-- Las claves de push son secretos de sesión: cada uno ve y borra sólo las suyas.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (vendor = (select public.current_vendor_name()));

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (vendor = (select public.current_vendor_name()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (vendor = (select public.current_vendor_name()));

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   insert into notification_queue (vendor, tipo, titulo, corpo, dedupe_key)
--   values ('Tomás','acao_vencida','Ação vencida','Opp 46 há 3 dias','opp:46:acao_vencida');
--   -- el mismo aviso, el mismo día: debe FALLAR por uq_notification_queue_janela
--   insert into notification_queue (vendor, tipo, titulo, corpo, dedupe_key)
--   values ('Tomás','acao_vencida','Ação vencida','Opp 46 há 3 dias','opp:46:acao_vencida');
--   -- marcar leído sin haber enviado: debe FALLAR por notification_queue_ordem_chk
--   update notification_queue set lido_em = now() where dedupe_key = 'opp:46:acao_vencida';
--   -- tasa de lectura (el control de calidad del propio sistema):
--   select tipo, count(*) enviados, count(lido_em) lidos, count(agido_em) agidos
--   from notification_queue where enviado_em is not null group by tipo;
