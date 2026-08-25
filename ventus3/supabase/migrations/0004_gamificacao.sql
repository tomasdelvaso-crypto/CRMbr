-- ============================================================================
-- 0004_gamificacao.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Toda la capa de juego, diseñada para NO poder inflarse:
--     scoring_rules   — pesos VERSIONADOS y editables por admin; nunca retroactivos
--     points_ledger   — libro APPEND-ONLY: cada punto es rastreable y explicable
--     daily_rings     — los tres anillos del día (contato / conversa / avanço)
--     streaks         — racha de Golden Hour (no de login), con escudos y rescate
--     golden_sessions — la sesión de prospección: cola aprobada la víspera + debrief
--     kudos           — reconocimiento entre pares, con presupuesto semanal
--     trophies        — troféus semanales; UNIQUE impide ganar dos en la misma semana
--     cookbook        — metas semanales NEGOCIADAS por cada vendedor
--
-- POR QUÉ
--   Auditoría: vendors.monthly_target es NULL en los 6 — no hay una sola meta
--   cuantitativa en la base, así que hoy no hay nada que gamificar. Y el baseline
--   real es ~12 touchpoints por SEMANA para todo el equipo: las metas tienen que
--   negociarse desde ese piso, no desde una cifra aspiracional.
--   El ledger es append-only y los pesos son versionados porque un sistema de
--   puntos que se puede reescribir hacia atrás deja de ser una medición y pasa a
--   ser una narrativa.
--
-- LAS CUATRO DEFENSAS, EN LA BASE:
--   1. requer_evidencia  → puntos atados a scale_evidence (0002)
--   2. teto_diario_pa    → techo diario por evento, para que la ráfaga no pague
--   3. append-only       → sin UPDATE ni DELETE; el clawback es una fila negativa
--   4. no retroactivo    → cambiar un peso obliga a crear una versión nueva
--
-- COMPATIBILIDAD CON EL v2 — 100% ADITIVO: tablas nuevas, nada existente se toca.
-- Depende de 0002 (scale_evidence). IDEMPOTENTE.
-- ============================================================================

begin;

-- ── scoring_rules: los pesos, versionados ────────────────────────────────────
create table if not exists public.scoring_rules (
  id              uuid        primary key default gen_random_uuid(),
  evento          text        not null,
  versao          integer     not null,
  pa              integer     not null,          -- Pontos de Avanço
  por_unidade     boolean     not null default false,
  requer_evidencia boolean    not null default false,
  teto_diario_pa  integer,                        -- techo diario por evento
  provisorio      boolean     not null default false,
  liquida_em      text,                           -- p.ej. 'reuniao_realizada' → clawback diferido
  valido_de       date        not null default current_date,
  valido_ate      date,
  descricao       text,
  alterado_por    integer     references public.vendors(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint scoring_rules_evento_versao_key unique (evento, versao),
  constraint scoring_rules_versao_chk  check (versao >= 1),
  constraint scoring_rules_vigencia_chk check (valido_ate is null or valido_ate >= valido_de),
  constraint scoring_rules_teto_chk    check (teto_diario_pa is null or teto_diario_pa > 0)
);

comment on table public.scoring_rules is
  'Ventus v3: pesos de PA versionados. Mudar um peso exige nova versão — nunca é retroativo.';

create index if not exists idx_scoring_rules_vigentes
  on public.scoring_rules (evento, valido_de desc);

-- Guarda de no-retroactividad: una regla ya vigente no se reescribe. Sólo se
-- puede cerrar (poner valido_ate) o cambiarle la descripción.
create or replace function public.ventus_scoring_rules_no_retro()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if old.valido_de <= current_date
     and ( new.pa            is distinct from old.pa
        or new.evento        is distinct from old.evento
        or new.versao        is distinct from old.versao
        or new.valido_de     is distinct from old.valido_de
        or new.por_unidade   is distinct from old.por_unidade
        or new.requer_evidencia is distinct from old.requer_evidencia
        or new.teto_diario_pa   is distinct from old.teto_diario_pa )
  then
    raise exception 'scoring_rules: a regra %/v% já está vigente desde % e não pode ser reescrita',
      old.evento, old.versao, old.valido_de
      using errcode = '42501',
            hint    = 'Feche a regra atual com valido_ate e insira uma versão nova.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_scoring_rules_no_retro on public.scoring_rules;
create trigger trg_scoring_rules_no_retro
  before update on public.scoring_rules
  for each row execute function public.ventus_scoring_rules_no_retro();

-- Semilla v1. Los pesos siguen el principio rector: lo que hace el COMPRADOR
-- vale mucho más que lo que hace el vendedor.
insert into public.scoring_rules (evento, versao, pa, requer_evidencia, teto_diario_pa, descricao)
values
  ('toque_registrado',        1,  1, false, 12, 'Toque de cadência registrado'),
  ('conversa_real',           1,  5, false, 25, 'Resposta do comprador, não só envio'),
  ('reuniao_agendada',        1, 15, false, null, 'Comprador aceitou reunião'),
  ('reuniao_realizada',       1, 25, true,  null, 'Reunião aconteceu, com artefato'),
  ('escala_com_prova',        1, 10, true,  30,   'Escala movida com citação do comprador'),
  ('etapa_avancada',          1, 20, true,  null, 'Etapa avançada com gate cumprido'),
  ('lead_promovido',          1,  3, false, 15,   'Empresa do mapa virou lead na cadência'),
  ('golden_hour_completa',    1, 20, false, 20,   'Hora cheia: meta de toques + 1 conversa + debrief'),
  ('proposta_enviada',        1, 10, false, null, 'Proposta formal enviada'),
  ('oportunidade_ganha',      1, 50, false, null, 'Fechamento')
on conflict (evento, versao) do nothing;

-- ── points_ledger: append-only ───────────────────────────────────────────────
create table if not exists public.points_ledger (
  id             bigint      generated always as identity primary key,
  client_uuid    uuid        not null default gen_random_uuid(),
  vendor         text        not null,
  vendor_id      integer     references public.vendors(id) on delete set null,
  evento         text        not null,
  pa             integer     not null,   -- lo que la regla dice que vale
  pa_creditado   integer     not null,   -- lo que efectivamente acreditó tras el techo
  regra_versao   integer     not null,
  entity_kind    text,
  entity_id      text,
  opportunity_id bigint      references public.opportunities(id) on delete set null,
  lead_id        bigint      references public.leads(id) on delete set null,
  activity_id    bigint      references public.activities(id) on delete set null,
  touchpoint_id  bigint      references public.touchpoints(id) on delete set null,
  evidencia_id   uuid        references public.scale_evidence(id) on delete set null,
  status         text        not null default 'shadow',
  temporada      text,
  motivo         text,
  reverte_id     bigint      references public.points_ledger(id) on delete set null,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint points_ledger_client_uuid_key unique (client_uuid),
  constraint points_ledger_status_chk check (status in ('shadow','confirmed','clawback','capped')),
  -- un clawback SIEMPRE resta y siempre apunta a la fila que revierte
  constraint points_ledger_clawback_chk check (
    status <> 'clawback' or (pa_creditado <= 0 and reverte_id is not null))
);

comment on table public.points_ledger is
  'Ventus v3: livro append-only de Pontos de Avanço. Correção = linha nova de clawback, nunca UPDATE.';
comment on column public.points_ledger.status is
  'shadow: calculado mas invisível (modo sombra) · confirmed: creditado · capped: cortado pelo teto diário · clawback: estorno';

create index if not exists idx_points_ledger_vendor    on public.points_ledger (vendor, occurred_at desc);
create index if not exists idx_points_ledger_temporada on public.points_ledger (temporada, vendor) where status = 'confirmed';
create index if not exists idx_points_ledger_evento    on public.points_ledger (evento, occurred_at desc);

create or replace function public.ventus_points_ledger_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  raise exception 'points_ledger é append-only: % não é permitido', tg_op
    using errcode = '42501',
          hint    = 'Para estornar pontos, insira uma linha com status=''clawback'' e reverte_id apontando à original.';
  return null;
end;
$fn$;

drop trigger if exists trg_points_ledger_no_update on public.points_ledger;
create trigger trg_points_ledger_no_update
  before update on public.points_ledger
  for each row execute function public.ventus_points_ledger_append_only();

drop trigger if exists trg_points_ledger_no_delete on public.points_ledger;
create trigger trg_points_ledger_no_delete
  before delete on public.points_ledger
  for each row execute function public.ventus_points_ledger_append_only();

-- ── daily_rings: los tres anillos ────────────────────────────────────────────
create table if not exists public.daily_rings (
  vendor         text        not null,
  vendor_id      integer     references public.vendors(id) on delete set null,
  dia            date        not null,
  -- largada dotada 2/12: el anillo arranca con dos toques regalados (endowed progress)
  contato        integer     not null default 2,
  conversa       integer     not null default 0,
  avanco         integer     not null default 0,
  meta_contato   integer     not null default 12,
  meta_conversa  integer     not null default 3,
  meta_avanco    integer     not null default 1,
  dia_util       boolean     not null default true,
  -- fechado: columna GENERADA. No se puede marcar el día como cerrado a mano.
  fechado        boolean generated always as (
                   contato  >= meta_contato and
                   conversa >= meta_conversa and
                   avanco   >= meta_avanco
                 ) stored,
  updated_at     timestamptz not null default now(),

  constraint daily_rings_pkey primary key (vendor, dia),
  constraint daily_rings_nao_negativo_chk check (contato >= 0 and conversa >= 0 and avanco >= 0),
  constraint daily_rings_metas_chk        check (meta_contato > 0 and meta_conversa >= 0 and meta_avanco >= 0)
);

comment on table  public.daily_rings         is 'Ventus v3: os três anéis do dia. `fechado` é coluna gerada: não se marca à mão.';
comment on column public.daily_rings.contato is 'Começa em 2 de propósito (endowed progress): o anel nunca aparece vazio.';

create index if not exists idx_daily_rings_dia on public.daily_rings (dia desc);

-- ── streaks: la racha ────────────────────────────────────────────────────────
create table if not exists public.streaks (
  vendor            text        primary key,
  vendor_id         integer     references public.vendors(id) on delete set null,
  atual             integer     not null default 0,
  melhor            integer     not null default 0,
  escudos           integer     not null default 0,
  escudos_usados    date[]      not null default '{}'::date[],
  ultimo_dia_cheio  date,
  resgate_ate       timestamptz,    -- ventana para recuperar un día caído
  resgates_no_mes   integer     not null default 0,
  updated_at        timestamptz not null default now(),

  constraint streaks_atual_chk    check (atual >= 0),
  constraint streaks_melhor_chk   check (melhor >= atual),
  constraint streaks_escudos_chk  check (escudos between 0 and 2),
  constraint streaks_resgates_chk check (resgates_no_mes between 0 and 2)
);

comment on table public.streaks is
  'Ventus v3: racha de Golden Hour (não de login). Escudos e resgate limitados para que a racha não vire ansiedade.';

-- ── golden_sessions: la Golden Hour ──────────────────────────────────────────
create table if not exists public.golden_sessions (
  id             uuid        primary key default gen_random_uuid(),
  vendor         text        not null,
  vendor_id      integer     references public.vendors(id) on delete set null,
  dia            date        not null default current_date,
  planejado_para timestamptz,
  inicio         timestamptz,
  fim            timestamptz,
  duracao_segundos integer,
  -- fila: la cola aprobada la víspera a las 18h. jsonb porque mezcla leads,
  -- empresas del mapa y oportunidades en una sola lista ordenada.
  fila           jsonb       not null default '[]'::jsonb,
  toques         integer     not null default 0,
  conversas      integer     not null default 0,
  agendamentos   integer     not null default 0,
  pulados        integer     not null default 0,
  meta_toques    integer     not null default 10,
  hora_cheia     boolean     not null default false,
  debrief        jsonb,      -- {melhor_conversa, objecao_frequente, o_que_muda}
  superficie     text,
  created_at     timestamptz not null default now(),

  constraint golden_sessions_vendor_dia_key unique (vendor, dia),
  constraint golden_sessions_janela_chk  check (fim is null or inicio is null or fim >= inicio),
  constraint golden_sessions_contas_chk  check (toques >= 0 and conversas >= 0 and agendamentos >= 0 and pulados >= 0),
  constraint golden_sessions_fila_chk    check (jsonb_typeof(fila) = 'array'),
  constraint golden_sessions_surf_chk    check (superficie is null or superficie in ('app','telegram','tma')),
  -- hora cheia = meta de toques + pelo menos 1 conversa + debrief entregue
  constraint golden_sessions_cheia_chk   check (
    hora_cheia = false
    or (toques >= meta_toques and conversas >= 1 and debrief is not null))
);

comment on table  public.golden_sessions      is 'Ventus v3: sessão de prospecção com fila aprovada na véspera e debrief obrigatório.';
comment on column public.golden_sessions.fila is 'Lista ordenada aprovada às 18h do dia anterior. O vendedor não escolhe a quem ligar na hora.';

create index if not exists idx_golden_sessions_vendor on public.golden_sessions (vendor, dia desc);

-- ── kudos: reconocimiento entre pares ────────────────────────────────────────
create table if not exists public.kudos (
  id              uuid        primary key default gen_random_uuid(),
  de_vendor       text        not null,
  de_vendor_id    integer     references public.vendors(id) on delete set null,
  para_vendor     text        not null,
  para_vendor_id  integer     references public.vendors(id) on delete set null,
  semana          date        not null,   -- segunda-feira da semana
  ref_kind        text,
  ref_id          text,
  nota            text        not null,
  created_at      timestamptz not null default now(),

  constraint kudos_nao_a_si_chk check (de_vendor <> para_vendor),
  -- obliga a escribir algo: un kudo de un click no vale
  constraint kudos_nota_chk     check (length(btrim(nota)) >= 5)
);

comment on table public.kudos is 'Ventus v3: kudos entre pares, com orçamento de 5 por semana forçado por trigger.';

create index if not exists idx_kudos_para on public.kudos (para_vendor, semana);
create index if not exists idx_kudos_de   on public.kudos (de_vendor, semana);

-- Presupuesto de 5 kudos por semana por emisor.
create or replace function public.ventus_kudos_orcamento()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_usados integer;
begin
  select count(*) into v_usados
  from public.kudos k
  where k.de_vendor = new.de_vendor
    and k.semana    = new.semana;

  if v_usados >= 5 then
    raise exception 'Orçamento de kudos esgotado: % já enviou 5 kudos na semana de %', new.de_vendor, new.semana
      using errcode = '23505',
            hint    = 'O limite semanal é o que mantém o kudo com valor.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_kudos_orcamento on public.kudos;
create trigger trg_kudos_orcamento
  before insert on public.kudos
  for each row execute function public.ventus_kudos_orcamento();

-- ── trophies: troféus semanales ──────────────────────────────────────────────
create table if not exists public.trophies (
  id            uuid        primary key default gen_random_uuid(),
  semana        date        not null,
  categoria     text        not null,
  vendor        text        not null,
  vendor_id     integer     references public.vendors(id) on delete set null,
  valor_metrica numeric,
  detalhe       jsonb,
  computed_at   timestamptz not null default now(),

  constraint trophies_categoria_chk check (categoria in
    ('motor','escalador','conversador','zelador','reanimador','companheiro')),
  -- una categoría por semana...
  constraint trophies_semana_categoria_key unique (semana, categoria),
  -- ...y nadie gana DOS en la misma semana: el reparto es del equipo, no de una estrella
  constraint trophies_semana_vendor_key    unique (semana, vendor)
);

comment on constraint trophies_semana_vendor_key on public.trophies is
  'Impede que a mesma pessoa leve dois troféus na mesma semana.';

create index if not exists idx_trophies_vendor on public.trophies (vendor, semana desc);

-- ── cookbook: metas semanales negociadas ─────────────────────────────────────
create table if not exists public.cookbook (
  id            uuid        primary key default gen_random_uuid(),
  vendor        text        not null,
  vendor_id     integer     references public.vendors(id) on delete set null,
  semana        date        not null,   -- segunda-feira
  metrica       text        not null,
  meta          numeric     not null,
  sugerido      numeric,                -- o que o sistema propôs a partir das últimas 4 semanas
  definido_por  text        not null default 'vendedor',
  negociado_em  timestamptz not null default now(),

  constraint cookbook_vendor_semana_metrica_key unique (vendor, semana, metrica),
  constraint cookbook_metrica_chk check (metrica in ('contatos','conversas','avancos','reunioes','valor')),
  constraint cookbook_meta_chk    check (meta >= 0),
  constraint cookbook_por_chk     check (definido_por in ('vendedor','sistema','admin'))
);

comment on table public.cookbook is
  'Ventus v3: metas semanais NEGOCIADAS pelo próprio vendedor (baseline real: ~12 toques/semana para o time inteiro).';

create index if not exists idx_cookbook_semana on public.cookbook (semana desc, vendor);

-- ── Seguridad ────────────────────────────────────────────────────────────────
alter table public.scoring_rules   enable row level security;
alter table public.points_ledger   enable row level security;
alter table public.daily_rings     enable row level security;
alter table public.streaks         enable row level security;
alter table public.golden_sessions enable row level security;
alter table public.kudos           enable row level security;
alter table public.trophies        enable row level security;
alter table public.cookbook        enable row level security;

revoke all on public.scoring_rules, public.points_ledger, public.daily_rings,
              public.streaks, public.golden_sessions, public.kudos,
              public.trophies, public.cookbook
  from anon;

grant all on public.scoring_rules, public.points_ledger, public.daily_rings,
             public.streaks, public.golden_sessions, public.kudos,
             public.trophies, public.cookbook
  to service_role;

-- El placar es del equipo: todos leen todo. Escribir, sólo lo propio.
grant select on public.scoring_rules, public.points_ledger, public.daily_rings,
                public.streaks, public.trophies to authenticated;
-- os pesos são editáveis pelo admin (a policy é quem realmente restringe)
grant insert, update on public.scoring_rules to authenticated;
grant select, insert, update on public.golden_sessions, public.cookbook to authenticated;
grant select, insert on public.kudos to authenticated;

drop policy if exists scoring_rules_select on public.scoring_rules;
create policy scoring_rules_select on public.scoring_rules
  for select to authenticated using (true);

-- Los pesos los edita el ADMIN (Jordi/Tomás) desde la app, sin deploy. El
-- trigger de no-retroactividad se aplica igual: sólo puede crear versiones nuevas
-- o cerrar las vigentes con valido_ate.
drop policy if exists scoring_rules_insert_admin on public.scoring_rules;
create policy scoring_rules_insert_admin on public.scoring_rules
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists scoring_rules_update_admin on public.scoring_rules;
create policy scoring_rules_update_admin on public.scoring_rules
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists points_ledger_select on public.points_ledger;
create policy points_ledger_select on public.points_ledger
  for select to authenticated using (true);

drop policy if exists daily_rings_select on public.daily_rings;
create policy daily_rings_select on public.daily_rings
  for select to authenticated using (true);

drop policy if exists streaks_select on public.streaks;
create policy streaks_select on public.streaks
  for select to authenticated using (true);

drop policy if exists trophies_select on public.trophies;
create policy trophies_select on public.trophies
  for select to authenticated using (true);

drop policy if exists golden_sessions_select on public.golden_sessions;
create policy golden_sessions_select on public.golden_sessions
  for select to authenticated using (true);

drop policy if exists golden_sessions_insert on public.golden_sessions;
create policy golden_sessions_insert on public.golden_sessions
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists golden_sessions_update on public.golden_sessions;
create policy golden_sessions_update on public.golden_sessions
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists kudos_select on public.kudos;
create policy kudos_select on public.kudos
  for select to authenticated using (true);

drop policy if exists kudos_insert on public.kudos;
create policy kudos_insert on public.kudos
  for insert to authenticated
  with check (de_vendor = (select public.current_vendor_name()));

drop policy if exists cookbook_select on public.cookbook;
create policy cookbook_select on public.cookbook
  for select to authenticated using (true);

drop policy if exists cookbook_insert on public.cookbook;
create policy cookbook_insert on public.cookbook
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists cookbook_update on public.cookbook;
create policy cookbook_update on public.cookbook
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   select evento, versao, pa, teto_diario_pa from scoring_rules order by pa desc;
--   update scoring_rules set pa = 999 where evento = 'toque_registrado';   -- debe FALLAR
--   insert into daily_rings (vendor, dia, contato, conversa, avanco) values ('Tomás', current_date, 12, 3, 1);
--   select fechado from daily_rings where vendor = 'Tomás' and dia = current_date;  -- true
--   insert into points_ledger (vendor, evento, pa, pa_creditado, regra_versao) values ('Tomás','toque_registrado',1,1,1);
--   delete from points_ledger where vendor = 'Tomás';   -- debe FALLAR (42501)
