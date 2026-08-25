-- ============================================================================
-- 0009_rpcs.sql  ·  Ventus v3
-- ----------------------------------------------------------------------------
-- QUÉ HACE
--   Las cuatro funciones de dominio del v3, todas SECURITY DEFINER con
--   search_path fijo y todas con su propio control de autorización:
--     avancar_etapa()         — REVALIDA el gate PPVVCC en el SERVIDOR y deja
--                               rastro de la etapa (y del override, si lo hubo)
--     registrar_touchpoint()  — mueve leads.stage según el resultado y recalcula
--                               next_touchpoint_date con la CADENCE_SCHEDULE
--     promote_sweep_to_lead() — convierte una empresa del mapa en lead, con
--                               anti-duplicado
--     ventus_commit_action()  — ejecuta una propuesta de Ventus con staleness
--                               check e idempotencia
--
-- POR QUÉ
--   Auditoría: los gates eran evadibles porque el checklist vivía en el cliente y
--   no se persistía — el stage 3 promedia MENOS dor (2,7) que el stage 2 (4,0).
--   Y moveStage no dejaba rastro. Y next_touchpoint_date se calculaba en el
--   navegador, se guardaba, y LeadCard lo ignoraba: 48 de 54 leads vencidos.
--   Todo eso se arregla poniendo la regla del lado del servidor, una sola vez.
--
-- SOBRE SECURITY DEFINER
--   Estas funciones corren con los privilegios del owner y por lo tanto SALTAN
--   RLS. Es deliberado: es la única forma de tocar market_sweep (RLS ON, cero
--   policies) desde el cliente. Por eso CADA UNA verifica la autorización a mano,
--   con ventus_autorizado(), antes de escribir. Ninguna se otorga a `anon`.
--
-- COMPATIBILIDAD CON EL v2 — ADITIVO
--   * No se modifica ninguna función ni trigger del v2.
--   * avancar_etapa() NO inserta la activity de stage_change: el trigger
--     trigger_log_stage_change del v2 ya lo hace, y duplicarla ensuciaría el
--     timeline. La RPC agrega el gate NUMÉRICO, que hoy no existe en la base.
--   * El trigger enforce_stage_gates del v2 sigue corriendo y puede rechazar el
--     UPDATE por sus propias reglas documentales (sponsor, descripciones,
--     next_action, expected_close). Esa excepción se propaga tal cual al cliente.
--   * registrar_touchpoint() respeta touchpoints_channel_check tal como está hoy
--     ('linkedin','whatsapp','email','phone'). Si se pide 'meeting' o 'visit',
--     falla con un mensaje explícito: ampliar ese CHECK es una migración aparte,
--     no algo que esta función deba hacer por la ventana.
--
-- Depende de 0001, 0002, 0003 y 0008. IDEMPOTENTE.
-- ============================================================================

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- HELPERS DE AUTORIZACIÓN
-- ════════════════════════════════════════════════════════════════════════════

-- Quién está llamando: el nombre del vendedor, o '__service__' si es el backend
-- con service_role. Levanta si no es ninguna de las dos cosas.
create or replace function public.ventus_actor()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_nome text;
  v_role text;
begin
  v_nome := public.current_vendor_name();
  if v_nome is not null then
    return v_nome;
  end if;

  begin
    v_role := auth.role();
  exception when others then
    v_role := null;
  end;

  if v_role = 'service_role' then
    return '__service__';
  end if;

  raise exception 'Usuário não vinculado a nenhum vendedor ativo'
    using errcode = '42501',
          hint    = 'Verifique vendors.auth_id para este usuário.';
end;
$fn$;

comment on function public.ventus_actor() is
  'Ventus v3: nome do vendedor chamador, ou ''__service__'' quando é o backend. Levanta se não houver identidade.';

-- ¿Puede el que llama tocar filas de p_vendor?
create or replace function public.ventus_autorizado(p_vendor text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor text;
begin
  v_actor := public.ventus_actor();
  if v_actor = '__service__' then
    return true;
  end if;
  if public.is_admin() then
    return true;
  end if;
  -- el pool: una oportunidad o un lead sin dueño lo puede tomar cualquiera.
  -- Es el modelo del v2 y está bien diseñado; se conserva.
  if p_vendor is null or btrim(p_vendor) = '' then
    return true;
  end if;
  return v_actor = p_vendor;
end;
$fn$;

comment on function public.ventus_autorizado(text) is
  'Ventus v3: admin, dono, ou pool sem dono. Preserva o modelo de pool do v2.';

-- ════════════════════════════════════════════════════════════════════════════
-- GATES PPVVCC — la tabla que hoy vive hardcodeada en api/_lib/ppvvcc.js
-- La clave es la etapa ACTUAL: son los mínimos para SALIR de ella.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.stage_gates (
  etapa     smallint not null,
  scale_key text     not null,
  minimo    smallint not null,

  constraint stage_gates_pkey  primary key (etapa, scale_key),
  constraint stage_gates_etapa_chk  check (etapa between 1 and 6),
  constraint stage_gates_scale_chk  check (scale_key in ('dor','poder','visao','valor','controle','compras')),
  constraint stage_gates_minimo_chk check (minimo between 0 and 10)
);

comment on table public.stage_gates is
  'Ventus v3: mínimos PPVVCC para SAIR de cada etapa. Espelha STAGE_GATES de api/_lib/ppvvcc.js.';

insert into public.stage_gates (etapa, scale_key, minimo) values
  (2, 'dor',      5),
  (2, 'poder',    4),
  (3, 'visao',    5),
  (4, 'valor',    6),
  (5, 'controle', 7),
  (5, 'compras',  6)
on conflict (etapa, scale_key) do nothing;

alter table public.stage_gates enable row level security;
revoke all on public.stage_gates from anon;
grant select on public.stage_gates to authenticated;
grant all    on public.stage_gates to service_role;

drop policy if exists stage_gates_select on public.stage_gates;
create policy stage_gates_select on public.stage_gates
  for select to authenticated using (true);

-- ════════════════════════════════════════════════════════════════════════════
-- avancar_etapa(opp_id, nova_etapa, override_motivo)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.avancar_etapa(
  p_opp_id          bigint,
  p_nova_etapa      integer,
  p_override_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_opp        public.opportunities%rowtype;
  v_actor      text;
  v_faltantes  text[] := array[]::text[];
  v_etapa      integer;
  v_gate       record;
  v_score      numeric;
  v_override   boolean := false;
begin
  v_actor := public.ventus_actor();

  select * into v_opp from public.opportunities where id = p_opp_id for update;
  if not found then
    raise exception 'Oportunidade % não encontrada', p_opp_id using errcode = 'P0002';
  end if;

  if not public.ventus_autorizado(v_opp.vendor) then
    raise exception 'Sem permissão sobre a oportunidade % (dono: %)', p_opp_id, v_opp.vendor
      using errcode = '42501';
  end if;

  if p_nova_etapa is null or p_nova_etapa < 1 or p_nova_etapa > 6 then
    raise exception 'Etapa inválida: % (deve estar entre 1 e 6)', p_nova_etapa using errcode = '22023';
  end if;

  if v_opp.outcome is not null then
    raise exception 'Oportunidade % já está fechada (%): não se muda de etapa', p_opp_id, v_opp.outcome
      using errcode = '55000';
  end if;

  if p_nova_etapa = v_opp.stage then
    return jsonb_build_object(
      'ok', true, 'mudou', false, 'etapa', v_opp.stage,
      'mensagem', 'A oportunidade já está nesta etapa');
  end if;

  -- ═══ REVALIDACIÓN DEL GATE EN EL SERVIDOR ═══
  -- Se revalidan TODAS las etapas que se cruzan, no sólo la última: saltar de la
  -- 2 a la 5 tiene que cumplir los gates de la 2, la 3 y la 4.
  if p_nova_etapa > v_opp.stage then
    for v_etapa in v_opp.stage .. (p_nova_etapa - 1) loop
      for v_gate in
        select g.scale_key, g.minimo from public.stage_gates g where g.etapa = v_etapa
        order by g.scale_key
      loop
        v_score := public.ventus_scale_score(coalesce(v_opp.scales, '{}'::jsonb), v_gate.scale_key);
        if v_score < v_gate.minimo then
          v_faltantes := array_append(
            v_faltantes,
            format('etapa %s · %s precisa >= %s (atual %s)',
                   v_etapa, upper(v_gate.scale_key), v_gate.minimo, trim(to_char(v_score, 'FM990.9'))));
        end if;
      end loop;
    end loop;

    if array_length(v_faltantes, 1) > 0 then
      if p_override_motivo is null or length(btrim(p_override_motivo)) < 10 then
        raise exception 'Gate PPVVCC não cumprido: %', array_to_string(v_faltantes, ' | ')
          using errcode = '23514',
                hint   = 'Para avançar mesmo assim, informe override_motivo com pelo menos 10 caracteres. O override fica registrado.';
      end if;
      v_override := true;
    end if;
  end if;

  -- El UPDATE dispara los triggers del v2:
  --   enforce_stage_gates      (BEFORE) — pode recusar por regras documentais
  --   trigger_log_stage_change (AFTER)  — já insere a activity de stage_change
  update public.opportunities
     set stage              = p_nova_etapa,
         last_activity_date = now()
   where id = p_opp_id;

  -- El override, si lo hubo, queda escrito y visible en el timeline.
  if v_override then
    insert into public.activities (
      opportunity_id, vendor, activity_type, description,
      stage_at_time, source, activity_date, result)
    values (
      p_opp_id,
      coalesce(v_opp.vendor, 'Sistema'),
      'note',
      format('⚠️ Override de gate ao avançar para etapa %s. Pendências: %s. Motivo: %s',
             p_nova_etapa, array_to_string(v_faltantes, ' | '), btrim(p_override_motivo)),
      p_nova_etapa,
      'system',
      current_date,
      'neutro');
  end if;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois, contexto)
  values (
    v_actor, 'avancar_etapa', 'opportunity', p_opp_id::text,
    jsonb_build_object('stage', v_opp.stage),
    jsonb_build_object('stage', p_nova_etapa),
    jsonb_build_object('override', v_override, 'pendencias', to_jsonb(v_faltantes),
                       'motivo', p_override_motivo));

  return jsonb_build_object(
    'ok', true,
    'mudou', true,
    'etapa_anterior', v_opp.stage,
    'etapa', p_nova_etapa,
    'override', v_override,
    'pendencias', to_jsonb(v_faltantes));
end;
$fn$;

comment on function public.avancar_etapa(bigint, integer, text) is
  'Ventus v3: revalida o gate PPVVCC no servidor antes de mover a etapa. Override exige motivo >= 10 caracteres e fica registrado.';

-- ════════════════════════════════════════════════════════════════════════════
-- registrar_touchpoint(lead_id, canal, resultado, notas)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.registrar_touchpoint(
  p_lead_id     bigint,
  p_canal       text,
  p_resultado   text,
  p_notas       text default null,
  p_client_uuid uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lead        public.leads%rowtype;
  v_actor       text;
  v_chave       text;
  v_memo        jsonb;
  v_seq         smallint;
  v_tp_id       bigint;
  v_novo_stage  text;
  v_proxima     date;
  v_offset_atual integer;
  v_offset_prox  integer;
  v_novo_status text;
  v_resultado   jsonb;
begin
  v_actor := public.ventus_actor();

  -- ── Idempotencia del outbox offline ──
  if p_client_uuid is not null then
    v_chave := 'registrar_touchpoint:' || p_client_uuid::text;
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

  -- ── Validación contra los CHECK que la tabla tiene HOY ──
  if p_canal not in ('linkedin','whatsapp','email','phone') then
    raise exception 'Canal % não é aceito por touchpoints_channel_check', p_canal
      using errcode = '23514',
            hint   = 'Hoje a tabela só aceita linkedin|whatsapp|email|phone. Ampliar para meeting/visit é uma migração à parte.';
  end if;

  if p_resultado not in ('no_response','interested','not_now','not_interested','meeting_scheduled','other') then
    raise exception 'Resultado % inválido', p_resultado using errcode = '23514';
  end if;

  if coalesce(v_lead.touchpoints_count, 0) >= 7 then
    raise exception 'Cadência esgotada no lead % (7 de 7 toques)', p_lead_id
      using errcode = '23514',
            hint   = 'Arquive e recicle o lead, ou converta-o em oportunidade.';
  end if;

  v_seq := (coalesce(v_lead.touchpoints_count, 0) + 1)::smallint;

  -- El INSERT dispara trigger_auto_archive: tp7 + no_response archiva el lead
  -- y le pone recycle_after = hoje + 90. Se conserva tal cual.
  insert into public.touchpoints (lead_id, sequence_number, channel, result, notes, executed_at)
  values (p_lead_id, v_seq, p_canal, p_resultado, p_notas, now())
  returning id into v_tp_id;

  -- ── Movimiento del funil de prospección (nunca retrocede de etapa) ──
  v_novo_stage  := v_lead.stage;
  v_novo_status := null;

  if p_resultado = 'meeting_scheduled' then
    v_novo_stage := '1d';
  elsif p_resultado = 'interested' then
    if v_lead.stage in ('1a','1b') then
      v_novo_stage := '1c';
    end if;
  elsif p_resultado = 'not_interested' then
    v_novo_status := 'archived';
  elsif v_lead.stage = '1a' and v_lead.contact_name is not null then
    -- hubo contacto con una persona identificada: ya no es sólo una empresa
    v_novo_stage := '1b';
  end if;

  -- ── Próximo toque según la CADENCE_SCHEDULE ──
  if p_resultado in ('meeting_scheduled','not_interested') then
    v_proxima := null;                       -- sale de la cadencia
  elsif p_resultado = 'not_now' then
    v_proxima := current_date + 30;          -- "no ahora" = volver en un mes
  elsif v_seq >= 7 then
    v_proxima := null;                       -- cadencia agotada
  else
    select cs.dia_offset into v_offset_atual from public.cadence_schedule cs where cs.tp = v_seq;
    select cs.dia_offset into v_offset_prox  from public.cadence_schedule cs where cs.tp = v_seq + 1;
    v_proxima := current_date + greatest(coalesce(v_offset_prox, 0) - coalesce(v_offset_atual, 0), 1);
  end if;

  -- El UPDATE no toca `status` salvo que haya que archivar: si el trigger de
  -- auto-archivo ya lo archivó (tp7 + no_response), no lo resucitamos.
  update public.leads
     set touchpoints_count   = v_seq,
         last_touchpoint_date = current_date,
         next_touchpoint_date = v_proxima,
         stage                = v_novo_stage,
         status               = coalesce(v_novo_status, status),
         archived_at          = case when v_novo_status = 'archived' then now() else archived_at end,
         recycle_after        = case when v_novo_status = 'archived' then current_date + 90 else recycle_after end
   where id = p_lead_id;

  v_resultado := jsonb_build_object(
    'ok', true,
    'touchpoint_id', v_tp_id,
    'sequence_number', v_seq,
    'lead_id', p_lead_id,
    'stage', v_novo_stage,
    'proximo_toque', v_proxima,
    'canal', p_canal,
    'resultado', p_resultado);

  if p_client_uuid is not null then
    insert into public.ventus_idempotency (chave, escopo, vendor, resultado)
    values (v_chave, 'registrar_touchpoint', v_lead.vendor, v_resultado)
    on conflict (chave) do nothing;
  end if;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois)
  values (
    v_actor, 'registrar_touchpoint', 'lead', p_lead_id::text,
    jsonb_build_object('stage', v_lead.stage, 'touchpoints_count', v_lead.touchpoints_count,
                       'next_touchpoint_date', v_lead.next_touchpoint_date),
    jsonb_build_object('stage', v_novo_stage, 'touchpoints_count', v_seq,
                       'next_touchpoint_date', v_proxima));

  return v_resultado;
end;
$fn$;

comment on function public.registrar_touchpoint(bigint, text, text, text, uuid) is
  'Ventus v3: registra o toque, move leads.stage pelo resultado e recalcula next_touchpoint_date pela CADENCE_SCHEDULE.';

-- ════════════════════════════════════════════════════════════════════════════
-- promote_sweep_to_lead(sweep_id)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.promote_sweep_to_lead(p_sweep_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ms        public.market_sweep%rowtype;
  v_actor     text;
  v_vendor    text;
  v_lead_id   bigint;
  v_enr       jsonb;
  v_dominio   text;
begin
  v_actor := public.ventus_actor();

  select * into v_ms from public.market_sweep where id = p_sweep_id for update;
  if not found then
    raise exception 'Empresa % não encontrada no mapa de mercado', p_sweep_id using errcode = 'P0002';
  end if;

  if not public.ventus_autorizado(v_ms.vendor) then
    raise exception 'Sem permissão sobre a empresa % (atribuída a: %)', p_sweep_id, v_ms.vendor
      using errcode = '42501';
  end if;

  -- ── Anti-duplicado 1: ya fue promovida ──
  if v_ms.crm_lead_id is not null then
    return jsonb_build_object(
      'ok', true, 'criado', false, 'lead_id', v_ms.crm_lead_id,
      'mensagem', 'Esta empresa já tinha lead no CRM');
  end if;

  v_vendor  := coalesce(nullif(btrim(coalesce(v_ms.vendor, '')), ''),
                        nullif(v_actor, '__service__'));
  if v_vendor is null then
    raise exception 'Empresa % não tem vendedor atribuído', p_sweep_id using errcode = '22023';
  end if;

  v_enr     := coalesce(v_ms.enrichment, '{}'::jsonb);
  v_dominio := nullif(btrim(coalesce(v_ms.domain_normalized, '')), '');

  -- ── Anti-duplicado 2: ya existe un lead por dominio o por nombre ──
  select l.id into v_lead_id
  from public.leads l
  where (v_dominio is not null and lower(coalesce(l.company_domain, '')) = lower(v_dominio))
     or lower(btrim(l.company_name)) = lower(btrim(v_ms.company_name))
  order by l.created_at asc
  limit 1;

  if v_lead_id is not null then
    update public.market_sweep
       set crm_lead_id = v_lead_id,
           updated_at  = now()
     where id = p_sweep_id;

    insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois, contexto)
    values (v_actor, 'promote_sweep_to_lead', 'market_sweep', p_sweep_id::text,
            jsonb_build_object('crm_lead_id', null),
            jsonb_build_object('crm_lead_id', v_lead_id),
            jsonb_build_object('motivo', 'lead_existente_vinculado'));

    return jsonb_build_object(
      'ok', true, 'criado', false, 'lead_id', v_lead_id,
      'mensagem', 'Já existia um lead para esta empresa: foi vinculado em vez de duplicado');
  end if;

  -- ── Alta del lead con la cadencia arrancando mañana ──
  insert into public.leads (
    vendor, source, company_name, company_domain,
    contact_name, contact_title, contact_email, contact_phone, contact_linkedin,
    stage, status, touchpoints_count, next_touchpoint_date, notes)
  values (
    v_vendor,
    'market_sweep',
    v_ms.company_name,
    v_dominio,
    nullif(btrim(coalesce(v_enr ->> 'contact_name',  v_enr ->> 'nome',   '')), ''),
    nullif(btrim(coalesce(v_enr ->> 'contact_title', v_enr ->> 'cargo',  '')), ''),
    nullif(btrim(coalesce(v_enr ->> 'contact_email', v_enr ->> 'email',  '')), ''),
    nullif(btrim(coalesce(v_enr ->> 'contact_phone', v_enr ->> 'telefone', '')), ''),
    nullif(btrim(coalesce(v_enr ->> 'contact_linkedin', v_enr ->> 'linkedin', '')), ''),
    '1a',
    'active',
    0,
    current_date + 1,
    nullif(btrim(concat_ws(E'\n',
      nullif(v_ms.notes, ''),
      case when v_ms.sector      is not null then 'Setor: '     || v_ms.sector end,
      case when v_ms.target_line is not null then 'Linha alvo: '|| v_ms.target_line end,
      case when v_ms.cnpj_raiz   is not null then 'CNPJ raiz: ' || v_ms.cnpj_raiz end)), ''))
  returning id into v_lead_id;

  update public.market_sweep
     set crm_lead_id = v_lead_id,
         status      = 'en_barrido',
         updated_at  = now()
   where id = p_sweep_id;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois, contexto)
  values (v_actor, 'promote_sweep_to_lead', 'market_sweep', p_sweep_id::text,
          jsonb_build_object('crm_lead_id', null, 'status', v_ms.status),
          jsonb_build_object('crm_lead_id', v_lead_id, 'status', 'en_barrido'),
          jsonb_build_object('vendor', v_vendor));

  return jsonb_build_object(
    'ok', true, 'criado', true, 'lead_id', v_lead_id, 'vendor', v_vendor,
    'proximo_toque', current_date + 1);
end;
$fn$;

comment on function public.promote_sweep_to_lead(bigint) is
  'Ventus v3: mapa → lead com cadência iniciada. Anti-duplicado por domínio e por nome. 83 empresas em produção esperam por isto.';

-- ════════════════════════════════════════════════════════════════════════════
-- ventus_commit_action(action_id)  ·  staleness check + idempotencia
-- ════════════════════════════════════════════════════════════════════════════

-- Huella del estado de una entidad. Si cambia entre la propuesta y el commit,
-- la propuesta se hizo sobre datos viejos y no se ejecuta.
create or replace function public.ventus_precondition_hash(
  p_entity_kind text,
  p_entity_id   text
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_hash text;
begin
  if p_entity_kind is null or p_entity_id is null then
    return null;
  end if;

  if p_entity_kind in ('opportunity','lead','activity','market_sweep')
     and p_entity_id !~ '^[0-9]+$' then
    return null;
  end if;

  if p_entity_kind = 'opportunity' then
    select md5(concat_ws('|', o.stage::text, o.scales::text, o.vendor,
                              o.outcome, o.updated_at::text))
      into v_hash
    from public.opportunities o where o.id = p_entity_id::bigint;

  elsif p_entity_kind = 'lead' then
    select md5(concat_ws('|', l.stage, l.status, l.touchpoints_count::text,
                              l.next_touchpoint_date::text, l.updated_at::text))
      into v_hash
    from public.leads l where l.id = p_entity_id::bigint;

  elsif p_entity_kind = 'task' then
    select md5(concat_ws('|', t.status, t.due_date::text, t.updated_at::text))
      into v_hash
    from public.tasks t where t.id = p_entity_id::uuid;

  elsif p_entity_kind = 'market_sweep' then
    select md5(concat_ws('|', ms.status, ms.crm_lead_id::text, ms.updated_at::text))
      into v_hash
    from public.market_sweep ms where ms.id = p_entity_id::bigint;
  end if;

  return v_hash;
end;
$fn$;

comment on function public.ventus_precondition_hash(text, text) is
  'Ventus v3: impressão do estado da entidade para o staleness check do propose-then-commit.';

create or replace function public.ventus_commit_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_acao      public.ventus_actions%rowtype;
  v_actor     text;
  v_hash      text;
  v_payload   jsonb;
  v_resultado jsonb;
  v_task_id   uuid;
  v_evid_id   uuid;
  v_antes     jsonb;
  v_scale     text;
  v_score     integer;
begin
  v_actor := public.ventus_actor();

  select * into v_acao from public.ventus_actions where id = p_action_id for update;
  if not found then
    raise exception 'Ação % não encontrada', p_action_id using errcode = 'P0002';
  end if;

  if not public.ventus_autorizado(v_acao.vendor) then
    raise exception 'Sem permissão sobre a ação % (dono: %)', p_action_id, v_acao.vendor
      using errcode = '42501';
  end if;

  -- ── Idempotencia: confirmar dos veces devuelve lo mismo ──
  if v_acao.status = 'committed' then
    return coalesce(v_acao.resultado, '{}'::jsonb) || jsonb_build_object('idempotente', true);
  end if;

  if v_acao.status <> 'proposed' then
    raise exception 'Ação % está em estado % e não pode ser confirmada', p_action_id, v_acao.status
      using errcode = '55000';
  end if;

  -- ── Vencimiento ──
  if v_acao.expires_at <= now() then
    update public.ventus_actions set status = 'expired' where id = p_action_id;
    raise exception 'Ação % expirou em %', p_action_id, v_acao.expires_at
      using errcode = '55000',
            hint   = 'Peça ao Ventus uma proposta nova sobre o estado atual.';
  end if;

  -- ── Staleness check ──
  if v_acao.precondition_hash is not null then
    v_hash := public.ventus_precondition_hash(v_acao.entity_kind, v_acao.entity_id);
    if v_hash is distinct from v_acao.precondition_hash then
      update public.ventus_actions
         set status = 'dismissed', dismissed_reason = 'dado_errado', dismissed_at = now()
       where id = p_action_id;

      insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois, action_id)
      values (v_actor, 'stale', v_acao.entity_kind, v_acao.entity_id,
              jsonb_build_object('hash_proposta', v_acao.precondition_hash),
              jsonb_build_object('hash_atual', v_hash), p_action_id);

      raise exception 'A proposta % ficou obsoleta: o registro mudou depois de ser proposta', p_action_id
        using errcode = '55000',
              hint   = 'Os dados mudaram desde a proposta. Reveja e proponha de novo.';
    end if;
  end if;

  v_payload := coalesce(v_acao.payload, '{}'::jsonb);

  -- ── Despacho por tipo ──
  if v_acao.tipo = 'criar_task' then
    insert into public.tasks (
      vendor, opportunity_id, lead_id, titulo, canal, due_date,
      draft_content, expected_outcome, origem, created_by, target_scale)
    values (
      v_acao.vendor,
      nullif(v_payload ->> 'opportunity_id', '')::bigint,
      nullif(v_payload ->> 'lead_id', '')::bigint,
      v_payload ->> 'titulo',
      nullif(v_payload ->> 'canal', ''),
      coalesce(nullif(v_payload ->> 'due_date', '')::date, current_date + 1),
      nullif(v_payload ->> 'draft_content', ''),
      nullif(v_payload ->> 'expected_outcome', ''),
      'ia',
      'ventus',
      nullif(v_payload ->> 'target_scale', ''))
    returning id into v_task_id;

    v_resultado := jsonb_build_object('ok', true, 'tipo', v_acao.tipo, 'task_id', v_task_id);

  elsif v_acao.tipo = 'atualizar_escala' then
    v_scale := v_payload ->> 'scale_key';
    v_score := (v_payload ->> 'score_novo')::integer;

    if v_scale is null or v_score is null then
      raise exception 'payload de atualizar_escala precisa de scale_key e score_novo' using errcode = '22023';
    end if;

    select to_jsonb(o.scales) into v_antes
    from public.opportunities o where o.id = v_acao.entity_id::bigint;

    -- La evidencia primero: si el CHECK de la regra da prova rechaza, no se
    -- mueve la escala. Es exactamente el orden que queremos.
    insert into public.scale_evidence (
      opportunity_id, scale_key, score_anterior, score_novo, quote,
      autor_quote, cargo_quote, fonte, activity_id, vendor, confianca, registrado_por)
    values (
      v_acao.entity_id::bigint,
      v_scale,
      nullif(v_payload ->> 'score_anterior', '')::smallint,
      v_score::smallint,
      coalesce(v_payload ->> 'quote', ''),
      nullif(v_payload ->> 'autor_quote', ''),
      nullif(v_payload ->> 'cargo_quote', ''),
      nullif(v_payload ->> 'fonte', ''),
      nullif(v_payload ->> 'activity_id', '')::bigint,
      v_acao.vendor,
      v_acao.confianca,
      'ventus')
    returning id into v_evid_id;

    -- Se garante primeiro que scales->v_scale seja um OBJETO (há formatos
    -- históricos onde a escala é um número solto) e só então se grava o score.
    update public.opportunities o
       set scales = jsonb_set(
             jsonb_set(coalesce(o.scales, '{}'::jsonb),
                       array[v_scale],
                       case when jsonb_typeof(o.scales -> v_scale) = 'object'
                            then o.scales -> v_scale
                            else '{"score": 0, "description": ""}'::jsonb
                       end,
                       true),
             array[v_scale, 'score'],
             to_jsonb(v_score),
             true),
           last_activity_date = now()
     where o.id = v_acao.entity_id::bigint;

    v_resultado := jsonb_build_object(
      'ok', true, 'tipo', v_acao.tipo, 'evidencia_id', v_evid_id,
      'scale_key', v_scale, 'score_novo', v_score);

  elsif v_acao.tipo = 'avancar_etapa' then
    v_resultado := public.avancar_etapa(
      v_acao.entity_id::bigint,
      (v_payload ->> 'nova_etapa')::integer,
      nullif(v_payload ->> 'override_motivo', ''));

  elsif v_acao.tipo = 'registrar_touchpoint' then
    v_resultado := public.registrar_touchpoint(
      v_acao.entity_id::bigint,
      v_payload ->> 'canal',
      v_payload ->> 'resultado',
      nullif(v_payload ->> 'notas', ''),
      nullif(v_payload ->> 'client_uuid', '')::uuid);

  elsif v_acao.tipo = 'promover_lead' then
    v_resultado := public.promote_sweep_to_lead(v_acao.entity_id::bigint);

  else
    raise exception 'Tipo de ação desconhecido: %', v_acao.tipo using errcode = '22023';
  end if;

  update public.ventus_actions
     set status       = 'committed',
         committed_at = now(),
         resultado    = v_resultado
   where id = p_action_id;

  insert into public.ventus_audit (actor, evento, entity_kind, entity_id, antes, depois, action_id, contexto)
  values (v_actor, 'committed', v_acao.entity_kind, v_acao.entity_id,
          coalesce(v_antes, jsonb_build_object('status', v_acao.status)),
          v_resultado, p_action_id,
          jsonb_build_object('tipo', v_acao.tipo, 'confianca', v_acao.confianca));

  return v_resultado;
end;
$fn$;

comment on function public.ventus_commit_action(uuid) is
  'Ventus v3: executa uma proposta do Ventus com staleness check, idempotência e trilha de auditoria.';

-- ── Permisos de ejecución ────────────────────────────────────────────────────
-- Nada de esto es ejecutable por `anon`. El v2 tiene 14 funciones SECURITY
-- DEFINER invocables desde /rest/v1/rpc/ sin login: acá no se repite.
revoke all on function public.ventus_actor()                             from public, anon;
revoke all on function public.ventus_autorizado(text)                    from public, anon;
revoke all on function public.avancar_etapa(bigint, integer, text)       from public, anon;
revoke all on function public.registrar_touchpoint(bigint, text, text, text, uuid) from public, anon;
revoke all on function public.promote_sweep_to_lead(bigint)              from public, anon;
revoke all on function public.ventus_precondition_hash(text, text)       from public, anon;
revoke all on function public.ventus_commit_action(uuid)                 from public, anon;

grant execute on function public.ventus_actor()                             to authenticated, service_role;
grant execute on function public.ventus_autorizado(text)                    to authenticated, service_role;
grant execute on function public.avancar_etapa(bigint, integer, text)       to authenticated, service_role;
grant execute on function public.registrar_touchpoint(bigint, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.promote_sweep_to_lead(bigint)              to authenticated, service_role;
grant execute on function public.ventus_precondition_hash(text, text)       to authenticated, service_role;
grant execute on function public.ventus_commit_action(uuid)                 to authenticated, service_role;

commit;

-- ── VERIFICACIÓN ─────────────────────────────────────────────────────────────
--   -- 1. todas con search_path fijo (debe devolver 'search_path=public, pg_temp'):
--   select p.proname, p.proconfig, p.prosecdef
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('avancar_etapa','registrar_touchpoint','promote_sweep_to_lead',
--                       'ventus_commit_action','ventus_actor','ventus_autorizado',
--                       'ventus_precondition_hash');
--
--   -- 2. ninguna ejecutable por anon (debe devolver 0 filas):
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.proname like any (array['avancar_etapa','registrar_%','promote_%','ventus_%'])
--     and has_function_privilege('anon', p.oid, 'execute');
--
--   -- 3. el gate se revalida de verdad (opp 46 tiene dor baja): debe FALLAR
--   select avancar_etapa(46, 3);
--   -- y con override debe pasar, dejando la nota en el timeline:
--   select avancar_etapa(46, 3, 'Cliente confirmou por telefone, prova entra amanhã');
--
--   -- 4. cadencia: debe devolver next_touchpoint_date = hoje + 2 desde el tp1
--   select registrar_touchpoint(<lead_id>, 'whatsapp', 'no_response', 'teste');
--
--   -- 5. anti-duplicado del mapa: dos llamadas seguidas → 'criado': false la 2ª
--   select promote_sweep_to_lead(<sweep_id>);
