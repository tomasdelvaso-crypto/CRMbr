-- ============================================================================
-- 0010_contrato_app.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- ESCRITO POR EL INTEGRADOR — PENDIENTE DE REVISIÓN DEL DUEÑO DEL ESQUEMA.
-- NO APLICADO. Parse-verificado con pglast 7.18 (libpg_query, PostgreSQL 17),
-- pero SIN ejecutar contra la base. Revisar antes de `supabase db push`.
--
-- QUÉ HACE
--   Cierra el contrato entre src/data y la base. La capa de datos offline llama
--   a dos funciones de dominio que 0009 no escribió, y lee dos columnas que no
--   existen. Sin esto, dos de las cinco escrituras de dominio quedan muertas:
--   se encolan, fallan con PGRST202 y esperan un retry humano que nunca sirve.
--
--     A · opportunities.scales_updated_at  (jsonb)  — reloj POR ESCALA
--     B · activities.client_uuid           (uuid)   — idempotencia del outbox
--     C · atualizar_escala()                        — la usa mutations.ts
--     D · converter_lead()                          — la usa mutations.ts
--
-- POR QUÉ LAS DOS COLUMNAS SON ADITIVAS Y SEGURAS PARA EL v2
--   Las dos son ADD COLUMN nullable (o con default) sobre tablas del v2. No
--   renombran, no cambian tipos, no agregan CHECK sobre datos existentes y no
--   tocan ninguna policy. El v2 nunca las nombra, y una columna de más no
--   rompe un `select *`. Es la excepción MÍNIMA a la regla de 0001-0009 de no
--   tocar columnas del v2, y existe porque la alternativa —una tabla paralela
--   de timestamps por escala— duplicaría la verdad del jsonb `scales`.
--
--   scales_updated_at es el reloj del LWW POR CAMPO de src/data/conflicts.ts:
--   sin él, dos vendedores editando escalas DISTINTAS de la misma oportunidad
--   se pisan entre sí, que es exactamente el conflicto que el diseño offline
--   existe para evitar. Hoy conflicts.ts lo lee y siempre encuentra null.
--
--   activities.client_uuid es lo que hace idempotente el reenvío del outbox.
--   El índice es UNIQUE pero PARCIAL (where client_uuid is not null): las
--   4.500 filas históricas del v2 quedan fuera y no hay que rellenar nada.
--
-- Depende de 0002 (scale_evidence, ventus_scale_score), 0003 (ventus_audit,
-- ventus_idempotency) y 0009 (ventus_actor, ventus_autorizado). IDEMPOTENTE.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- A · opportunities.scales_updated_at — un timestamp por escala PPVVCC
-- ════════════════════════════════════════════════════════════════════════════

alter table public.opportunities
  add column if not exists scales_updated_at jsonb not null default '{}'::jsonb;

comment on column public.opportunities.scales_updated_at is
  'Ventus v3: {"dor":"2026-08-24T12:00:00Z",...}. Relógio do LWW por campo do outbox offline. Escrito só por atualizar_escala().';

-- ════════════════════════════════════════════════════════════════════════════
-- B · activities.client_uuid — idempotência do reenvio offline
-- ════════════════════════════════════════════════════════════════════════════

alter table public.activities
  add column if not exists client_uuid uuid;

comment on column public.activities.client_uuid is
  'Ventus v3: UUID gerado no dispositivo antes de ter rede. UNIQUE parcial: reenvio do outbox não duplica a nota.';

-- Parcial a propósito: as linhas históricas do v2 têm client_uuid nulo e
-- várias nulas não colidem entre si num índice UNIQUE.
create unique index if not exists uq_activities_client_uuid
  on public.activities (client_uuid)
  where client_uuid is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- C · atualizar_escala(opp, escala, nivel, prova…)
-- ----------------------------------------------------------------------------
-- Mueve UNA escala PPVVCC y deja la prova en scale_evidence.
--
-- Es RPC y no un UPDATE directo por una razón concreta: un update del jsonb
-- `scales` entero pisa las otras cinco escalas. Acá se hace jsonb_set de esa
-- escala y de su timestamp, y nada más.
--
-- La REGRA DA PROVA (score > 5 exige cita textual) no se reimplementa: la
-- impone scale_evidence_prova_chk. Si falta la cita, el INSERT levanta 23514 y
-- la transacción entera se va atrás — la escala no se mueve. Es el orden
-- correcto: primero la prova, después el número.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.atualizar_escala(
  p_opportunity_id bigint,
  p_escala         text,
  p_nivel          smallint,
  p_citacao        text default null,
  p_fonte          text default null,
  p_autor          text default null,
  p_cargo          text default null,
  p_client_uuid    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_opp       public.opportunities%rowtype;
  v_actor     text;
  v_chave     text;
  v_memo      jsonb;
  v_anterior  smallint;
  v_agora     timestamptz := now();
  v_resultado jsonb;
begin
  v_actor := public.ventus_actor();

  -- ── Idempotencia del outbox offline ──
  if p_client_uuid is not null then
    v_chave := 'atualizar_escala:' || p_client_uuid::text;
    select i.resultado into v_memo from public.ventus_idempotency i where i.chave = v_chave;
    if v_memo is not null then
      return v_memo || jsonb_build_object('idempotente', true);
    end if;
  end if;

  if p_escala not in ('dor','poder','visao','valor','controle','compras') then
    raise exception 'Escala % não existe no PPVVCC', p_escala using errcode = '22023';
  end if;

  if p_nivel is null or p_nivel < 0 or p_nivel > 10 then
    raise exception 'Nível % fora de 0..10', p_nivel using errcode = '22023';
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'Oportunidade % não encontrada', p_opportunity_id using errcode = 'P0002';
  end if;

  if not public.ventus_autorizado(v_opp.vendor) then
    raise exception 'Sem permissão sobre a oportunidade % (dono: %)', p_opportunity_id, v_opp.vendor
      using errcode = '42501';
  end if;

  v_anterior := public.ventus_scale_score(coalesce(v_opp.scales, '{}'::jsonb), p_escala)::smallint;

  -- ── A prova primeiro: se falta cita para > 5, isto levanta e nada se move ──
  insert into public.scale_evidence
    (opportunity_id, scale_key, score_anterior, score_novo, quote,
     autor_quote, cargo_quote, fonte, vendor, confianca, registrado_por, client_uuid)
  values
    (p_opportunity_id, p_escala, v_anterior, p_nivel, coalesce(p_citacao, ''),
     p_autor, p_cargo, p_fonte, v_opp.vendor, null, 'vendedor',
     coalesce(p_client_uuid, gen_random_uuid()));

  -- ── Só então o número, e SÓ essa escala ──
  update public.opportunities
     set scales = jsonb_set(
           coalesce(scales, '{}'::jsonb),
           array[p_escala],
           jsonb_build_object(
             'score', p_nivel,
             'description', coalesce(p_citacao, ''),
             'evidence_source', p_fonte,
             'evidence_at', to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'updated_by', v_actor),
           true),
         scales_updated_at = jsonb_set(
           coalesce(scales_updated_at, '{}'::jsonb),
           array[p_escala],
           to_jsonb(to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           true),
         last_update = v_agora
   where id = p_opportunity_id;

  v_resultado := jsonb_build_object(
    'ok', true,
    'opportunity_id', p_opportunity_id,
    'escala', p_escala,
    'anterior', v_anterior,
    'novo', p_nivel);

  if p_client_uuid is not null then
    insert into public.ventus_idempotency (chave, escopo, vendor, resultado)
    values (v_chave, 'atualizar_escala', v_opp.vendor, v_resultado)
    on conflict (chave) do nothing;
  end if;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois)
  values (
    v_actor, 'atualizar_escala', 'opportunity', p_opportunity_id::text,
    jsonb_build_object('escala', p_escala, 'score', v_anterior),
    jsonb_build_object('escala', p_escala, 'score', p_nivel, 'quote', p_citacao));

  return v_resultado;
end;
$fn$;

comment on function public.atualizar_escala(bigint, text, smallint, text, text, text, text, uuid) is
  'Ventus v3: move UMA escala PPVVCC com prova. jsonb_set na escala e no seu timestamp — nunca sobrescreve as outras cinco.';

-- ════════════════════════════════════════════════════════════════════════════
-- D · converter_lead(lead) — o lead vira oportunidade
-- ----------------------------------------------------------------------------
-- Anti-duplicado explícito: se o lead já foi convertido, devolve a MESMA
-- oportunidade em vez de criar uma segunda. É o mesmo critério de
-- promote_sweep_to_lead(): reenviar do outbox nunca duplica cadastro.
--
-- A oportunidade nasce na etapa 2. A etapa 1 é o funil de prospecção, e um
-- lead que virou oportunidade já SAIU dele: nascer em 1 seria contá-lo duas
-- vezes. Escalas vazias a propósito — o que o comprador disse ainda não foi
-- provado, e atualizar_escala() é o único caminho para isso.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.converter_lead(
  p_lead_id      bigint,
  p_name         text default null,
  p_value        numeric default null,
  p_product_line text default null,
  p_client_uuid  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lead      public.leads%rowtype;
  v_actor     text;
  v_chave     text;
  v_memo      jsonb;
  v_opp_id    bigint;
  v_resultado jsonb;
begin
  v_actor := public.ventus_actor();

  if p_client_uuid is not null then
    v_chave := 'converter_lead:' || p_client_uuid::text;
    select i.resultado into v_memo from public.ventus_idempotency i where i.chave = v_chave;
    if v_memo is not null then
      return v_memo || jsonb_build_object('idempotente', true);
    end if;
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead % não encontrado', p_lead_id using errcode = 'P0002';
  end if;

  if not public.ventus_autorizado(v_lead.vendor) then
    raise exception 'Sem permissão sobre o lead % (dono: %)', p_lead_id, v_lead.vendor
      using errcode = '42501';
  end if;

  -- ── Já convertido: devolve o que existe, não cria um segundo cadastro ──
  if v_lead.opportunity_id is not null then
    return jsonb_build_object(
      'ok', true,
      'lead_id', p_lead_id,
      'opportunity_id', v_lead.opportunity_id,
      'ja_convertido', true);
  end if;

  insert into public.opportunities (name, client, vendor, value, stage, product, scales, last_update)
  values (
    coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_lead.company_name),
    v_lead.company_name,
    v_lead.vendor,
    p_value,
    2,
    p_product_line,
    '{}'::jsonb,
    now())
  returning id into v_opp_id;

  update public.leads
     set status               = 'converted',
         opportunity_id       = v_opp_id,
         next_touchpoint_date = null
   where id = p_lead_id;

  v_resultado := jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'opportunity_id', v_opp_id,
    'ja_convertido', false);

  if p_client_uuid is not null then
    insert into public.ventus_idempotency (chave, escopo, vendor, resultado)
    values (v_chave, 'converter_lead', v_lead.vendor, v_resultado)
    on conflict (chave) do nothing;
  end if;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois)
  values (
    v_actor, 'converter_lead', 'lead', p_lead_id::text,
    jsonb_build_object('status', v_lead.status, 'opportunity_id', v_lead.opportunity_id),
    jsonb_build_object('status', 'converted', 'opportunity_id', v_opp_id));

  return v_resultado;
end;
$fn$;

comment on function public.converter_lead(bigint, text, numeric, text, uuid) is
  'Ventus v3: converte lead em oportunidade na etapa 2, com anti-duplicado por leads.opportunity_id.';

-- ════════════════════════════════════════════════════════════════════════════
-- Permissões — mesmo padrão de 0009: nunca a anon.
-- ════════════════════════════════════════════════════════════════════════════

revoke all on function public.atualizar_escala(bigint, text, smallint, text, text, text, text, uuid) from public, anon;
revoke all on function public.converter_lead(bigint, text, numeric, text, uuid)                       from public, anon;

grant execute on function public.atualizar_escala(bigint, text, smallint, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.converter_lead(bigint, text, numeric, text, uuid)                       to authenticated, service_role;

commit;
