-- ============================================================================
-- 0006_telegram.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Reemplaza la vinculación del bot de Telegram por un emparejamiento verificado:
--     `pairing_codes`   — código de 6 dígitos con vencimiento, generado desde la app
--     `vendor_channels` — el canal ya verificado (chat_id real), con capacidades
--
-- POR QUÉ
--   Auditoría: sólo 3 de 6 vendors tienen telegram_id (Victor Hugo, Andre y Paulo
--   NO pueden usar el bot: 3 de los 4 vendedores). Y el autolink actual se hace por
--   @username, que es SUPLANTABLE: cualquiera que tome el username libre de otra
--   persona hereda su identidad en el CRM. Un código de 6 dígitos de un solo uso,
--   emitido desde una sesión ya autenticada y con vencimiento corto, cierra ese
--   agujero. Además vendor_channels admite VARIOS chats por vendedor (DM + grupo),
--   que la columna única vendors.telegram_id no permite.
--
-- COMPATIBILIDAD CON EL v2 — 100% ADITIVO
--   vendors.telegram_id y vendors.telegram_username NO se tocan: el bot actual
--   sigue funcionando exactamente igual mientras se migra. El corte del autolink
--   por @username es un cambio de código del bot, no de esquema.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ── vendor_channels ──────────────────────────────────────────────────────────
create table if not exists public.vendor_channels (
  id                uuid        primary key default gen_random_uuid(),
  vendor_id         integer     not null references public.vendors(id) on delete cascade,
  vendor            text,       -- desnormalizado para las policies que comparan por nombre
  kind              text        not null default 'telegram',
  chat_id           bigint      not null,
  telegram_user_id  bigint,
  telegram_username text,       -- SÓLO informativo. Nunca se usa para identificar.
  verificado_em     timestamptz,
  -- capacidades: qué puede hacer este canal. Un grupo no debería poder cerrar
  -- una oportunidad; un DM sí.
  capacidades       text[]      not null default '{ler,registrar,confirmar}'::text[],
  is_primary        boolean     not null default true,
  is_active         boolean     not null default true,
  ultimo_uso_em     timestamptz,
  created_at        timestamptz not null default now(),

  constraint vendor_channels_kind_chat_key unique (kind, chat_id),
  constraint vendor_channels_kind_chk check (kind in ('telegram','telegram_group')),
  constraint vendor_channels_cap_chk  check (capacidades <@ array['ler','registrar','confirmar','avancar_etapa','fechar']::text[])
);

comment on table  public.vendor_channels is
  'Ventus v3: canal de Telegram VERIFICADO por código de pareamento. Substitui o autolink por @username, que é suplantável.';
comment on column public.vendor_channels.capacidades is
  'O que este chat pode fazer. Um grupo lê e registra; só o DM confirma escritas sensíveis.';
comment on column public.vendor_channels.telegram_username is
  'Informativo apenas. NUNCA usar para identificar: usernames trocam de dono.';

create index if not exists idx_vendor_channels_vendor
  on public.vendor_channels (vendor_id) where is_active;
create index if not exists idx_vendor_channels_tg_user
  on public.vendor_channels (telegram_user_id) where telegram_user_id is not null;
-- un solo canal primario por vendedor y por tipo
create unique index if not exists uq_vendor_channels_primary
  on public.vendor_channels (vendor_id, kind) where is_primary and is_active;

-- ── pairing_codes ────────────────────────────────────────────────────────────
create table if not exists public.pairing_codes (
  codigo                     char(6)     primary key,
  vendor_id                  integer     not null references public.vendors(id) on delete cascade,
  criado_por                 text,
  expira_em                  timestamptz not null default now() + interval '10 minutes',
  usado_em                   timestamptz,
  usado_por_telegram_user_id bigint,
  usado_por_chat_id          bigint,
  tentativas                 smallint    not null default 0,
  created_at                 timestamptz not null default now(),

  constraint pairing_codes_formato_chk check (codigo ~ '^[0-9]{6}$'),
  constraint pairing_codes_janela_chk  check (expira_em > created_at),
  constraint pairing_codes_uso_chk     check (usado_em is null or usado_por_telegram_user_id is not null),
  -- freno de fuerza bruta: 5 intentos y el código queda quemado
  constraint pairing_codes_tentativas_chk check (tentativas between 0 and 5)
);

comment on table public.pairing_codes is
  'Ventus v3: código de 6 dígitos, um uso, 10 minutos. Emitido desde a app já autenticada.';

create index if not exists idx_pairing_codes_vendor
  on public.pairing_codes (vendor_id) where usado_em is null;
create index if not exists idx_pairing_codes_expira
  on public.pairing_codes (expira_em) where usado_em is null;

-- ── Seguridad ────────────────────────────────────────────────────────────────
-- Estas dos tablas son material de identidad: el cliente NO las lee ni las
-- escribe. Todo pasa por Edge Functions con service_role (que salta RLS).
-- Es el mismo criterio con el que hoy están bot_log y bot_sessions.
alter table public.vendor_channels enable row level security;
alter table public.pairing_codes   enable row level security;

revoke all on public.vendor_channels, public.pairing_codes from anon, authenticated;
grant all on public.vendor_channels, public.pairing_codes to service_role;

-- Única excepción: el vendedor puede comprobar si YA tiene el canal vinculado,
-- para que la app le muestre "Telegram conectado" sin exponer chat_id de nadie más.
grant select (id, vendor_id, kind, verificado_em, is_active, ultimo_uso_em)
  on public.vendor_channels to authenticated;

drop policy if exists vendor_channels_select_own on public.vendor_channels;
create policy vendor_channels_select_own on public.vendor_channels
  for select to authenticated
  using (vendor_id = (select public.ventus_current_vendor_id()));

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   insert into pairing_codes (codigo, vendor_id) values ('12345', 4);   -- FALLA: 5 dígitos
--   insert into pairing_codes (codigo, vendor_id) values ('ABC123', 4);  -- FALLA: no numérico
--   insert into pairing_codes (codigo, vendor_id) values ('482913', 4);  -- OK, expira em 10 min
--   insert into vendor_channels (vendor_id, chat_id, verificado_em) values (4, 8452693743, now());
--   -- dos canales primarios del mismo tipo para el mismo vendedor: debe FALLAR
--   insert into vendor_channels (vendor_id, chat_id, verificado_em) values (4, 999, now());
