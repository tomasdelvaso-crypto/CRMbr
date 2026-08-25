-- ============================================================================
-- 0002_evidencia.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   1. Crea `scale_evidence`: cada movimiento de una escala PPVVCC queda atado a
--      una CITA TEXTUAL del comprador (quién la dijo, con qué cargo, por qué canal).
--   2. Crea la vista `opportunity_health`, que separa el health DECLARADO (lo que
--      el vendedor escribió en opportunities.scales) del health VERIFICADO (sólo
--      las escalas con prueba de los últimos 90 días) y lista las escalas sin prueba.
--
-- POR QUÉ
--   Auditoría: la columna opportunities.health_score promedia 1,72 mientras el
--   promedio real de las 6 escalas da 3,77 — 38 de 65 oportunidades desincronizadas,
--   sin ningún trigger que las recalcule. Además la distribución de escalas es
--   bimodal (o todo en 0 o todo en 9-10) y el stage 3 promedia MENOS dor que el
--   stage 2: los scores se inflaron sin evidencia. La "regra da prova" tiene que
--   vivir en la base, no en la UI.
--
-- REGLA DURA (CHECK):
--   No se puede registrar score_novo > 5 sin una cita no vacía. De 0 a 5 el
--   vendedor puede autoevaluar; de 6 en adelante hace falta que el COMPRADOR
--   haya dicho algo, textual.
--
-- COMPATIBILIDAD CON EL v2 — ADITIVO
--   No se toca opportunities.health_score (el v2 la sigue leyendo y escribiendo).
--   El health verificado vive en una vista nueva; ninguna columna existente cambia.
--
-- IDEMPOTENTE.
-- ============================================================================

begin;

-- ── Lector tolerante de opportunities.scales ─────────────────────────────────
-- El v2 convivió con tres formatos históricos de `scales`. Hoy en producción las
-- 65 filas usan {"dor":{"score":n,"description":"..."}}, pero el lector acepta
-- también número suelto y string numérico, y nunca lanza excepción por basura.
create or replace function public.ventus_scale_score(p_scales jsonb, p_scale text)
returns numeric
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $fn$
  select case jsonb_typeof(p_scales -> p_scale)
    when 'object' then
      case when (p_scales -> p_scale ->> 'score') ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (p_scales -> p_scale ->> 'score')::numeric else 0 end
    when 'number' then
      case when (p_scales ->> p_scale) ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (p_scales ->> p_scale)::numeric else 0 end
    when 'string' then
      case when (p_scales ->> p_scale) ~ '^-?[0-9]+(\.[0-9]+)?$'
           then (p_scales ->> p_scale)::numeric else 0 end
    else 0
  end;
$fn$;

comment on function public.ventus_scale_score(jsonb, text) is
  'Ventus v3: lê o score 0..10 de uma escala PPVVCC tolerando os 3 formatos históricos de opportunities.scales.';

-- ── Tabla de evidencia ───────────────────────────────────────────────────────
create table if not exists public.scale_evidence (
  id             uuid        primary key default gen_random_uuid(),
  opportunity_id bigint      not null references public.opportunities(id) on delete cascade,
  scale_key      text        not null,
  score_anterior smallint,
  score_novo     smallint    not null,
  -- la cita textual del comprador. NOT NULL a propósito: sin texto no hay prueba.
  quote          text        not null,
  autor_quote    text,       -- quién lo dijo
  cargo_quote    text,       -- con qué cargo lo dijo (poder real, no simpatía)
  fonte          text,
  activity_id    bigint      references public.activities(id) on delete set null,
  vendor         text        not null,
  vendor_id      integer     references public.vendors(id) on delete set null,
  confianca      text,
  registrado_por text        not null default 'vendedor',
  client_uuid    uuid        not null default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  constraint scale_evidence_client_uuid_key unique (client_uuid),
  constraint scale_evidence_scale_chk  check (scale_key in ('dor','poder','visao','valor','controle','compras')),
  constraint scale_evidence_novo_chk   check (score_novo between 0 and 10),
  constraint scale_evidence_ant_chk    check (score_anterior is null or score_anterior between 0 and 10),
  constraint scale_evidence_fonte_chk  check (fonte is null or fonte in ('audio','email','reuniao','whatsapp','manual')),
  constraint scale_evidence_conf_chk   check (confianca is null or confianca in ('alta','media','baixa')),
  constraint scale_evidence_por_chk    check (registrado_por in ('vendedor','ventus','bot')),
  -- ═══ LA REGRA DA PROVA ═══
  -- de 6 para arriba hace falta cita no vacía. Debajo de 6 se admite autoevaluación.
  constraint scale_evidence_prova_chk  check (score_novo <= 5 or btrim(quote) <> '')
);

comment on table  public.scale_evidence           is 'Ventus v3: prova textual por trás de cada movimento de escala PPVVCC. Sem prova não se passa de 5.';
comment on column public.scale_evidence.quote     is 'O que o COMPRADOR disse, textual. Não é o resumo do vendedor.';
comment on column public.scale_evidence.cargo_quote is 'Cargo de quem falou: distingue Pessoa de Contato de Tomador de Decisão.';
comment on constraint scale_evidence_prova_chk on public.scale_evidence is
  'Regra da prova: score_novo > 5 exige quote não vazio.';

create index if not exists idx_scale_evidence_opp
  on public.scale_evidence (opportunity_id, scale_key, created_at desc);
create index if not exists idx_scale_evidence_vendor
  on public.scale_evidence (vendor, created_at desc);
create index if not exists idx_scale_evidence_activity
  on public.scale_evidence (activity_id) where activity_id is not null;

-- ── Trigger: completar vendor/vendor_id ──────────────────────────────────────
create or replace function public.ventus_scale_evidence_before_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.vendor_id is null and new.vendor is not null then
    select v.id into new.vendor_id from public.vendors v where v.name = new.vendor limit 1;
  elsif new.vendor is null and new.vendor_id is not null then
    select v.name into new.vendor from public.vendors v where v.id = new.vendor_id limit 1;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_scale_evidence_before_write on public.scale_evidence;
create trigger trg_scale_evidence_before_write
  before insert or update on public.scale_evidence
  for each row execute function public.ventus_scale_evidence_before_write();

-- ── Vista opportunity_health ─────────────────────────────────────────────────
-- SECURITY INVOKER: la vista respeta las policies de quien consulta. Las 5 vistas
-- del v2 son SECURITY DEFINER y por eso filtran datos de todos los vendedores
-- (4 ERROR del advisor). Esta no repite ese error.
-- CREATE OR REPLACE (y no DROP+CREATE): v_carteira_do_vendedor de 0008 depende
-- de esta vista, y un DROP sin CASCADE rompería la idempotencia al re-correr.
create or replace view public.opportunity_health
with (security_invoker = on) as
select
  o.id                                                            as opportunity_id,
  o.name,
  o.client,
  o.vendor,
  o.stage,
  o.outcome,
  -- health DECLARADO: promedio de las 6 escalas tal como están cargadas hoy
  round(avg(public.ventus_scale_score(o.scales, e.scale_key)), 2)  as health_declarado,
  -- health VERIFICADO: promedio SÓLO sobre las escalas con prova de <= 90 días
  round(avg(public.ventus_scale_score(o.scales, e.scale_key))
        filter (where ev.id is not null), 2)                       as health_verificado,
  -- distancia entre lo que se dice y lo que se puede probar
  round(avg(public.ventus_scale_score(o.scales, e.scale_key))
        - coalesce(avg(public.ventus_scale_score(o.scales, e.scale_key))
                   filter (where ev.id is not null), 0), 2)         as gap_prova,
  count(*) filter (where ev.id is not null)::int                    as escalas_com_prova,
  -- todas las escalas sin prova reciente
  coalesce(array_agg(e.scale_key order by e.ord) filter (where ev.id is null),
           '{}'::text[])                                            as escalas_sem_prova,
  -- las que además están DECLARADAS alto (>= 6) sin prova: el riesgo real
  coalesce(array_agg(e.scale_key order by e.ord)
           filter (where ev.id is null
                     and public.ventus_scale_score(o.scales, e.scale_key) >= 6),
           '{}'::text[])                                            as escalas_infladas,
  max(ev.created_at)                                                as ultima_prova_em
from public.opportunities o
cross join lateral (
  values ('dor',1),('poder',2),('visao',3),('valor',4),('controle',5),('compras',6)
) as e(scale_key, ord)
left join lateral (
  select se.id, se.created_at
  from public.scale_evidence se
  where se.opportunity_id = o.id
    and se.scale_key      = e.scale_key
    and se.created_at    >= now() - interval '90 days'
  order by se.created_at desc
  limit 1
) ev on true
group by o.id, o.name, o.client, o.vendor, o.stage, o.outcome;

comment on view public.opportunity_health is
  'Ventus v3: health declarado vs. health verificado (só escalas com prova <= 90 dias) + escalas sem prova. SECURITY INVOKER.';

-- ── Seguridad de las entidades nuevas ────────────────────────────────────────
alter table public.scale_evidence enable row level security;
revoke all on public.scale_evidence from anon;
grant select, insert on public.scale_evidence to authenticated;
grant all on public.scale_evidence to service_role;

-- La evidencia NO se edita ni se borra desde el cliente: se corrige agregando
-- una fila nueva. Por eso no hay policy de UPDATE ni de DELETE.
drop policy if exists scale_evidence_select on public.scale_evidence;
create policy scale_evidence_select on public.scale_evidence
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

drop policy if exists scale_evidence_insert on public.scale_evidence;
create policy scale_evidence_insert on public.scale_evidence
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

revoke all on public.opportunity_health from anon;
grant select on public.opportunity_health to authenticated, service_role;

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   -- 1. el CHECK bloquea inflar sin prova (debe FALLAR):
--   insert into scale_evidence (opportunity_id, scale_key, score_novo, quote, vendor)
--   values (46, 'dor', 8, '', 'Tomás');
--   -- 2. con prova pasa:
--   insert into scale_evidence (opportunity_id, scale_key, score_anterior, score_novo, quote, autor_quote, cargo_quote, fonte, vendor)
--   values (46, 'dor', 4, 8, 'Perdemos 3 caminhões por mês por caixa aberta', 'Marcos', 'Gerente de Logística', 'reuniao', 'Tomás');
--   -- 3. la vista:
--   select opportunity_id, health_declarado, health_verificado, escalas_sem_prova, escalas_infladas
--   from opportunity_health where opportunity_id = 46;
