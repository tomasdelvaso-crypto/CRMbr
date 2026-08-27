-- ############################################################################
-- ############################################################################
-- ##                                                                        ##
-- ##   0100 · SANEAMENTO DE SEGURANÇA DO BANCO wtrbvgqxgcfjacqcndmb         ##
-- ##                                                                        ##
-- ##   ESTADO: **APLICADA em 2026-08-25** (aprovação do dono do produto,    ##
-- ##   condicionada a verificação prévia — a verificação está na SEÇÃO A e  ##
-- ##   as saídas reais estão registradas neste arquivo).                    ##
-- ##                                                                        ##
-- ##   Aplicada como `0100_seguranca_rls_grants_views`, version             ##
-- ##   20260825190039 (19:00 UTC = 16:00 BRT). O arquivo chamava-se         ##
-- ##   `0100_seguranca_PENDENTE_APROVACAO.sql` e foi renomeado em           ##
-- ##   2026-08-27 para o nome com que está aplicada: o aviso                ##
-- ##   "PENDENTE_APROVACAO" já não valia e enganava quem lia o diretório.   ##
-- ##   Reaplicar é idempotente (todo drop tem `if exists`, todo create é    ##
-- ##   precedido do drop).                                                  ##
-- ##                                                                        ##
-- ##   ESTA MIGRAÇÃO NÃO É ADITIVA: ela altera policies de RLS e grants do  ##
-- ##   banco de produção que o CRM v2 usa todos os dias. O ROLLBACK EXATO   ##
-- ##   está na SEÇÃO D. LEIA-O ANTES DE MEXER EM QUALQUER COISA AQUI.       ##
-- ##                                                                        ##
-- ############################################################################
-- ############################################################################
--
-- ----------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO CONSERTA
-- ----------------------------------------------------------------------------
--   1. A policy 'Enable all for development' (cmd=ALL, role=public, USING true,
--      WITH CHECK true) existia em opportunities, leads e touchpoints. Como as
--      policies permissivas se combinam com OR, ela ANULAVA por completo
--      vendor_own_opportunities / vendor_own_leads / vendor_own_touchpoints.
--
--   2. anon e authenticated tinham SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--      REFERENCES e TRIGGER sobre as tabelas de public. A anon key viaja no
--      bundle do front do v2. Medido em 2026-08-25 com `set local role anon`:
--      65 oportunidades / R$ 2.023.609,38 de pipeline, 78 leads, 169
--      touchpoints, 4.579 notificações e os 6 vendedores — SEM LOGIN.
--
--   3. vendors tinha leitura totalmente aberta ('all_read_vendors' USING true
--      + 'Anyone can view active vendors'): nome, e-mail corporativo, cargo e
--      telegram_id dos 6, para qualquer anônimo.
--
--   4. Cinco views eram SECURITY DEFINER (pending_actions, vendor_notifications,
--      vendor_activity_summary, opportunity_timeline, stale_opportunities) e
--      devolviam linhas de TODOS os vendedores. Eram os 5 ERROR do advisor.
--
--   5. current_vendor_name(), is_admin() e check_company_collision() tinham
--      search_path mutável e EXECUTE para PUBLIC — ou seja, chamáveis por anon
--      via /rest/v1/rpc/. Idem apollo_cache_* e lusha_cache_*.
--
--   6. multiple_permissive_policies e seq_scan sobre vendors, porque cada
--      policy re-avaliava current_vendor_name() linha a linha em vez de
--      embrulhar em (select ...).
--
-- ----------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO **NÃO** MUDA (compatibilidade com o CRM v2)
-- ----------------------------------------------------------------------------
-- Inventário de dependências do v2 levantado antes de escrever este arquivo
-- (/home/user/CRMbr/src e /home/user/CRMbr/api):
--
--   * O v2 fala com o banco por UM caminho só: o browser, com a anon key
--     + sessão do Supabase Auth (src/CRMVentapel.tsx:20 e src/supabaseClient.ts).
--     Ou seja, todo request do v2 chega ao Postgres como role `authenticated`.
--   * api/assistant.js, api/admin-assistant.js e api/google-search.js NÃO tocam
--     o banco: só chamam api.anthropic.com e google.serper.dev. Não existe
--     service_role no v2.
--   * O App só monta o CRM depois de `supabase.auth.getSession()` devolver
--     sessão (CRMVentapel.tsx:2840). A LoginScreen não faz UMA query.
--     => NENHUM caminho do v2 lê dado de negócio como anon. Cortar anon é seguro.
--   * Tabelas que o v2 usa: opportunities (select/insert/update/delete +
--     realtime), leads (select/insert/update), touchpoints (select/insert/
--     update/DELETE), activities (select/insert/update), vendors (select).
--     NÃO usa notifications, commitments nem market_sweep.
--   * Views que o v2 consulta do browser (src/ActivityComponents.jsx:178,183,187):
--     pending_actions, vendor_activity_summary, stale_opportunities — na aba
--     "Atividades", que TODO usuário vê. Passá-las a INVOKER é seguro porque a
--     tela já filtra por vendedor no cliente (vendorFilter = currentUser para
--     não-admin) e porque o admin continua vendo tudo via is_admin().
--     opportunity_timeline e vendor_notifications não são usadas pelo v2.
--   * src/AIAssistant.jsx:58 carrega `opportunities` inteira para dar contexto
--     ao coach. Com o corte, um vendedor passa a mandar só a própria carteira
--     ao modelo — que é o comportamento correto, e o admin segue vendo tudo.
--   * O v2 chama UMA rpc: check_company_collision (src/CadenciaComponents.jsx:166),
--     como authenticated. Por isso o EXECUTE é revogado de PUBLIC/anon mas
--     RECONCEDIDO a authenticated.
--   * O botão "Excluir" de oportunidade (CRMVentapel.tsx:1380) e o "Excluir"
--     de touchpoint (CadenciaComponents.jsx:656) NÃO são gated por admin no
--     front. Por isso opp_delete e tp_delete permitem o DONO, não só o admin —
--     um DELETE admin-only deixaria os dois botões falhando em silêncio.
--   * Gatilhos que rodam como o usuário (SECURITY INVOKER) e portanto passam
--     pelas policies novas: log_stage_change (opportunities -> INSERT em
--     activities) e auto_archive_lead (touchpoints -> UPDATE em leads).
--     Ambos verificados no ensaio da SEÇÃO C.
--   * Realtime: o v2 assina postgres_changes em `opportunities`
--     (CRMVentapel.tsx:934). A publicação `supabase_realtime` está VAZIA neste
--     projeto (select * from pg_publication_tables where pubname='supabase_realtime'
--     -> 0 linhas), ou seja, essa assinatura já não recebia nada ANTES desta
--     migração. Não há risco de regressão aí — e se um dia a tabela entrar na
--     publicação, o RLS do Realtime roda como authenticated com os claims do
--     assinante, que é exatamente o cenário validado em C5.
--   * postgres e service_role têm rolbypassrls = true. Logo o cron
--     (check-inactivity-daily) e todo o backend do v3 (api/_lib/supabase.ts,
--     service role) NÃO são afetados por nenhuma policy deste arquivo.
--
-- ----------------------------------------------------------------------------
-- ORDEM DE LEITURA
--   A. VERIFICAÇÃO PRÉVIA   — o que rodar ANTES + as saídas reais de 2026-08-25
--   B. O SANEAMENTO         — o DDL (executável)
--   C. VERIFICAÇÃO POSTERIOR— como provar que o v2 continua funcionando
--   D. ROLLBACK EXATO       — como voltar ao estado anterior, linha por linha
-- ----------------------------------------------------------------------------


-- ############################################################################
-- SEÇÃO A · VERIFICAÇÃO PRÉVIA  (SOMENTE LEITURA — pode rodar quando quiser)
-- ############################################################################
--
-- A1. Snapshot das policies. GUARDE ESTA SAÍDA: é a base do rollback D2.
--     select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check
--     from pg_policies where schemaname = 'public' order by tablename, policyname;
--     -- 2026-08-25: 23 policies nas 6 tabelas do v2, idênticas às recriadas em D2.
--
-- A2. Snapshot dos grants.
--     select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--     where table_schema = 'public' and grantee in ('anon','authenticated')
--     group by grantee, table_name order by table_name, grantee;
--     -- 2026-08-25: anon com DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     -- em 15 tabelas/views, incluindo as 5 views SECURITY DEFINER.
--
-- A3. ❗ O TESTE QUE DECIDE TUDO: os 6 vendors têm auth_id?
--     select id, name, is_active, is_admin, (auth_id is not null) as tem_auth_id,
--            (select count(*) from auth.users u where u.id = v.auth_id) as usuario_existe
--     from public.vendors v order by id;
--     -- 2026-08-25 · PASSOU: 6 linhas, tem_auth_id=true e usuario_existe=1 em todas.
--     --   1 Victor Hugo (não-admin) · 3 Renata · 4 Tomás (admin) ·
--     --   5 Jordi (admin) · 6 Andre · 7 Paulo
--     -- Este teste também está embutido como GUARDA FAIL-CLOSED em B0: se algum
--     -- vendedor ativo estiver sem auth_id, a migração aborta sozinha.
--
-- A4. ❗ Linhas cujo `vendor` não bate com nenhum vendors.name ficariam invisíveis.
--     -- (query completa: ver o bloco B0, que a executa como guarda)
--     -- 2026-08-25 · PASSOU: 0 órfãos em opportunities, leads, activities,
--     -- notifications, commitments, market_sweep; 0 touchpoints sem lead;
--     -- 0 leads e 0 activities com vendor vazio.
--
-- A5. ❗ O v2 depende da policy aberta? -> NÃO. Ver o inventário no cabeçalho.
--     grep -rn "createClient" /home/user/CRMbr/src /home/user/CRMbr/api
--     -- 2026-08-25: só 2 clientes, ambos com a anon key + persistSession, e o
--     -- App não monta nada sem sessão. api/*.js não abre conexão com o banco.
--
-- A6. As funções de identidade respondem para um usuário real?
--     begin;
--       set local role authenticated;
--       set local request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
--       select public.current_vendor_name(), public.is_admin(), auth.uid();
--     rollback;
--     -- 2026-08-25: 'Victor Hugo'/false e 'Jordi'/true, como esperado.
--
-- A7. Quantas linhas cada vendedor DEVERIA ver depois do corte (dry-run):
--     select v.name,
--            (select count(*) from public.opportunities o where o.vendor = v.name) opps,
--            (select count(*) from public.leads l where l.vendor = v.name) leads,
--            (select count(*) from public.activities a where a.vendor = v.name) acts,
--            (select count(*) from public.touchpoints tp join public.leads l on l.id = tp.lead_id
--              where l.vendor = v.name) tps
--     from public.vendors v where v.is_active order by v.name;
--     -- 2026-08-25 (baseline contra o qual a SEÇÃO C é comparada):
--     --   Andre        9 opps ·  44 leads ·  16 acts · 153 tps
--     --   Jordi(admin) 9      ·   1       ·  15      ·   2
--     --   Paulo        0      ·   0       ·   0      ·   0
--     --   Renata      19      ·   9       ·  41      ·   0
--     --   Tomás(admin) 3      ·   9       ·  15      ·  14
--     --   Victor Hugo 25      ·  15       ·  80      ·   0
--     -- Totais: 65 opps · 78 leads · 167 activities · 169 touchpoints ·
--     --         4.579 notifications · 239 market_sweep · 6 vendors.
--     -- 0 oportunidades no "pool" (sem vendedor) hoje.
--
-- A8. PITR / backup recente confirmado no painel do Supabase.
--
-- ############################################################################


-- ############################################################################
-- SEÇÃO B · O SANEAMENTO  (executável)
-- ############################################################################
--
--   `supabase db push` e o apply_migration do MCP já envolvem este arquivo em
--   UMA transação. Se você rodar à mão no psql, envolva você mesmo:
--       begin;  \i 0100_seguranca_rls_grants_views.sql   -- valide a SEÇÃO C
--       commit; -- ou rollback; se algo não bater
--

-- ═══ B0 · GUARDAS FAIL-CLOSED ════════════════════════════════════════════════
-- Se qualquer vendedor ativo estiver sem auth_id válido, ele perderia acesso a
-- tudo ao remover a policy aberta. Abortar é melhor do que descobrir depois.
do $guarda$
declare v_faltantes int;
begin
  select count(*) into v_faltantes
  from public.vendors v
  where v.is_active
    and (v.auth_id is null
         or not exists (select 1 from auth.users u where u.id = v.auth_id));
  if v_faltantes > 0 then
    raise exception 'ABORTADO: % vendedor(es) ativo(s) sem auth_id valido. Vincule antes de aplicar.', v_faltantes;
  end if;
end
$guarda$;

-- Linhas órfãs ficariam invisíveis para todo mundo menos admin.
do $guarda$
declare v_orfaos int;
begin
  select
      (select count(*) from public.opportunities o
        where coalesce(btrim(o.vendor),'') <> ''
          and not exists (select 1 from public.vendors v where v.name = o.vendor))
    + (select count(*) from public.leads l
        where coalesce(btrim(l.vendor),'') <> ''
          and not exists (select 1 from public.vendors v where v.name = l.vendor))
    + (select count(*) from public.activities a
        where coalesce(btrim(a.vendor),'') <> ''
          and not exists (select 1 from public.vendors v where v.name = a.vendor))
    + (select count(*) from public.touchpoints tp
        where not exists (select 1 from public.leads l where l.id = tp.lead_id))
  into v_orfaos;
  if v_orfaos > 0 then
    raise exception 'ABORTADO: % linha(s) orfa(s) (vendor inexistente ou touchpoint sem lead).', v_orfaos;
  end if;
end
$guarda$;

-- ═══ B1 · Remover as policies que anulam o isolamento ════════════════════════
drop policy if exists "Enable all for development" on public.opportunities;
drop policy if exists "Enable all for development" on public.leads;
drop policy if exists "Enable all for development" on public.touchpoints;
drop policy if exists "all_read_vendors" on public.vendors;
drop policy if exists "Anyone can view active vendors" on public.vendors;

-- ═══ B2 · anon perde tudo sobre o schema public ══════════════════════════════
-- A anon key viaja no bundle do front: ela nunca deve ler nem escrever dado de
-- negócio. Nenhum caminho do v2 nem do v3 lê como anon (ver inventário acima).
revoke all privileges on all tables    in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
-- Que as tabelas futuras nasçam fechadas para anon:
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ═══ B3 · As 5 views SECURITY DEFINER passam a INVOKER ═══════════════════════
-- Hoje devolvem linhas de TODOS os vendedores, saltando as policies.
alter view public.pending_actions          set (security_invoker = on);
alter view public.vendor_notifications     set (security_invoker = on);
alter view public.vendor_activity_summary  set (security_invoker = on);
alter view public.opportunity_timeline     set (security_invoker = on);
alter view public.stale_opportunities      set (security_invoker = on);

-- ═══ B4 · search_path fixo + anon não chama mais /rest/v1/rpc/ ═══════════════
-- Sem search_path fixo, um schema no caminho do chamador pode sequestrar a
-- resolução de `vendors` dentro de uma função SECURITY DEFINER.
alter function public.current_vendor_name()                set search_path = public, pg_temp;
alter function public.is_admin()                           set search_path = public, pg_temp;
alter function public.check_company_collision(text, text)  set search_path = public, pg_temp;
alter function public.update_updated_at_column()           set search_path = public, pg_temp;
alter function public.log_stage_change()                   set search_path = public, pg_temp;
alter function public.auto_archive_lead()                  set search_path = public, pg_temp;
alter function public.validate_stage_advancement()         set search_path = public, pg_temp;
alter function public.check_inactivity_and_notify()        set search_path = public, pg_temp;

-- ⚠️ EXECUTE em função nasce concedido a PUBLIC. `revoke ... from anon` NÃO
--    tira nada — só um revoke de PUBLIC tira. Por isso o par revoke+grant.
--    authenticated PRECISA de EXECUTE: as policies de B5 chamam is_admin() e
--    current_vendor_name(), e o v2 chama check_company_collision().
revoke execute on function public.is_admin()                          from public, anon;
revoke execute on function public.current_vendor_name()               from public, anon;
revoke execute on function public.check_company_collision(text, text) from public, anon;
grant  execute on function public.is_admin()                          to authenticated, service_role;
grant  execute on function public.current_vendor_name()               to authenticated, service_role;
grant  execute on function public.check_company_collision(text, text) to authenticated, service_role;

-- Caches de enriquecimento: escritas só por service_role (é o que a policy
-- 'Service role full access' já dizia). anon não tem por que chamá-las.
revoke execute on function public.apollo_cache_get(text)              from public, anon;
revoke execute on function public.apollo_cache_cleanup()              from public, anon;
revoke execute on function public.apollo_cache_set(text, text, jsonb, jsonb, integer, text) from public, anon;
revoke execute on function public.lusha_cache_get(text)               from public, anon;
revoke execute on function public.lusha_cache_cleanup()               from public, anon;
revoke execute on function public.lusha_cache_set(text, jsonb, jsonb, integer, integer, text) from public, anon;
grant  execute on function public.apollo_cache_get(text)              to authenticated, service_role;
grant  execute on function public.apollo_cache_cleanup()              to authenticated, service_role;
grant  execute on function public.apollo_cache_set(text, text, jsonb, jsonb, integer, text) to authenticated, service_role;
grant  execute on function public.lusha_cache_get(text)               to authenticated, service_role;
grant  execute on function public.lusha_cache_cleanup()               to authenticated, service_role;
grant  execute on function public.lusha_cache_set(text, jsonb, jsonb, integer, integer, text) to authenticated, service_role;

-- ═══ B5 · UMA policy permissiva por AÇÃO, sobre 'authenticated' ══════════════
-- Duas coisas de fundo:
--   * `to authenticated` (não `to public`): anon deixa de existir para o RLS.
--     postgres e service_role têm BYPASSRLS, então cron e backend v3 seguem.
--   * auth embrulhado em (select ...): o Postgres avalia a função UMA vez por
--     query, não uma vez por linha. É o que mata os seq_scan sobre vendors.
--
-- O modelo de POOL do v2 (ver o que não tem dono + tomar) se conserva: está no
-- USING de opp_select/opp_update. O WITH CHECK do update exige virar dono —
-- é exatamente o que a antiga vendor_assume_pool fazia.

-- ---- opportunities ---------------------------------------------------------
drop policy if exists admin_full_access_opportunities on public.opportunities;
drop policy if exists vendor_own_opportunities        on public.opportunities;
drop policy if exists vendor_pool_opportunities       on public.opportunities;
drop policy if exists vendor_assume_pool              on public.opportunities;
drop policy if exists opp_select on public.opportunities;
drop policy if exists opp_insert on public.opportunities;
drop policy if exists opp_update on public.opportunities;
drop policy if exists opp_delete on public.opportunities;

create policy opp_select on public.opportunities
  for select to authenticated
  using ((select public.is_admin())
         or vendor = (select public.current_vendor_name())
         or coalesce(nullif(btrim(vendor), ''), null) is null);   -- pool sem dono

create policy opp_insert on public.opportunities
  for insert to authenticated
  with check ((select public.is_admin())
              or vendor = (select public.current_vendor_name()));

create policy opp_update on public.opportunities
  for update to authenticated
  using ((select public.is_admin())
         or vendor = (select public.current_vendor_name())
         or coalesce(nullif(btrim(vendor), ''), null) is null)    -- tomar do pool
  with check ((select public.is_admin())
              or vendor = (select public.current_vendor_name())); -- só para si

-- O botão Excluir do v2 (CRMVentapel.tsx:1380) aparece para todo mundo:
-- admin-only aqui faria o botão falhar em silêncio para os vendedores.
create policy opp_delete on public.opportunities
  for delete to authenticated
  using ((select public.is_admin())
         or vendor = (select public.current_vendor_name()));

-- ---- leads -----------------------------------------------------------------
drop policy if exists admin_full_access_leads on public.leads;
drop policy if exists vendor_own_leads        on public.leads;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

create policy leads_select on public.leads
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy leads_insert on public.leads
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy leads_update on public.leads
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy leads_delete on public.leads
  for delete to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

-- ---- touchpoints -----------------------------------------------------------
-- Não tem coluna vendor: o dono se resolve pelo lead. O EXISTS correlacionado é
-- o mesmo da policy antiga, agora apoiado por idx_tp_sequencia (migração 0007).
drop policy if exists admin_full_access_touchpoints on public.touchpoints;
drop policy if exists vendor_own_touchpoints        on public.touchpoints;
drop policy if exists tp_select on public.touchpoints;
drop policy if exists tp_insert on public.touchpoints;
drop policy if exists tp_update on public.touchpoints;
drop policy if exists tp_delete on public.touchpoints;

create policy tp_select on public.touchpoints
  for select to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.leads l
                    where l.id = touchpoints.lead_id
                      and l.vendor = (select public.current_vendor_name())));
create policy tp_insert on public.touchpoints
  for insert to authenticated
  with check ((select public.is_admin())
              or exists (select 1 from public.leads l
                         where l.id = touchpoints.lead_id
                           and l.vendor = (select public.current_vendor_name())));
create policy tp_update on public.touchpoints
  for update to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.leads l
                    where l.id = touchpoints.lead_id
                      and l.vendor = (select public.current_vendor_name())))
  with check ((select public.is_admin())
              or exists (select 1 from public.leads l
                         where l.id = touchpoints.lead_id
                           and l.vendor = (select public.current_vendor_name())));
-- ❗ Sem tp_delete o "Excluir touchpoint" (CadenciaComponents.jsx:656) quebra.
create policy tp_delete on public.touchpoints
  for delete to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.leads l
                    where l.id = touchpoints.lead_id
                      and l.vendor = (select public.current_vendor_name())));

-- ---- activities ------------------------------------------------------------
drop policy if exists admin_full_access_activities on public.activities;
drop policy if exists vendor_own_activities        on public.activities;
drop policy if exists act_select on public.activities;
drop policy if exists act_insert on public.activities;
drop policy if exists act_update on public.activities;
drop policy if exists act_delete on public.activities;

create policy act_select on public.activities
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
-- Este INSERT também é o caminho do gatilho log_stage_change (SECURITY INVOKER).
create policy act_insert on public.activities
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy act_update on public.activities
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy act_delete on public.activities
  for delete to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));

-- ---- notifications ---------------------------------------------------------
-- O v2 não lê esta tabela direto (só a view vendor_notifications, que não usa).
-- Quem escreve é o cron, como postgres, que tem BYPASSRLS.
drop policy if exists admin_full_access_notifications on public.notifications;
drop policy if exists vendor_own_notifications        on public.notifications;
drop policy if exists notif_select on public.notifications;
drop policy if exists notif_insert on public.notifications;
drop policy if exists notif_update on public.notifications;
drop policy if exists notif_delete on public.notifications;

create policy notif_select on public.notifications
  for select to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy notif_insert on public.notifications
  for insert to authenticated
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy notif_update on public.notifications
  for update to authenticated
  using ((select public.is_admin()) or vendor = (select public.current_vendor_name()))
  with check ((select public.is_admin()) or vendor = (select public.current_vendor_name()));
create policy notif_delete on public.notifications
  for delete to authenticated
  using ((select public.is_admin()));

-- ---- vendors ---------------------------------------------------------------
-- O time inteiro precisa ver os nomes dos colegas (atribuir, filtrar, placar) e
-- o v2 QUEBRA se fetchVendors() voltar vazio ("Nenhum vendedor ativo").
-- O que muda é que deixa de ser visível para o ANÔNIMO.
drop policy if exists admin_modify_vendors  on public.vendors;
drop policy if exists vendors_select_team   on public.vendors;
drop policy if exists vendors_insert_admin  on public.vendors;
drop policy if exists vendors_update_admin  on public.vendors;
drop policy if exists vendors_delete_admin  on public.vendors;

create policy vendors_select_team on public.vendors
  for select to authenticated using (true);
create policy vendors_insert_admin on public.vendors
  for insert to authenticated with check ((select public.is_admin()));
create policy vendors_update_admin on public.vendors
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vendors_delete_admin on public.vendors
  for delete to authenticated using ((select public.is_admin()));

-- ---- market_sweep ----------------------------------------------------------
-- Estava com RLS ON e ZERO policies: invisível para authenticated também.
-- São as 239 empresas do mapa. O v2 não usa; o v3 usa (promote_sweep_to_lead).
drop policy if exists ms_select on public.market_sweep;
drop policy if exists ms_claim  on public.market_sweep;

create policy ms_select on public.market_sweep
  for select to authenticated
  using ((select public.is_admin())
         or vendor = (select public.current_vendor_name())
         or coalesce(nullif(btrim(vendor), ''), null) is null);
create policy ms_claim on public.market_sweep
  for update to authenticated
  using ((select public.is_admin())
         or vendor = (select public.current_vendor_name())
         or coalesce(nullif(btrim(vendor), ''), null) is null)
  with check ((select public.is_admin())
              or vendor = (select public.current_vendor_name()));

-- ═══ B6 · PostgREST recarrega o cache de schema ══════════════════════════════
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- FORA DE ESCOPO, DE PROPÓSITO
--   'check-inactivity-daily' insere uma notificação por oportunidade por dia
--   sem deduplicar (4.579 linhas, a opp 46 com mais de 100 avisos). Isso NÃO é
--   segurança: é decisão operativa. Fica para outra janela, e só depois que o
--   dispatcher do v3 (migração 0005) estiver rodando.
--     -- select cron.unschedule('check-inactivity-daily');
-- ----------------------------------------------------------------------------


-- ############################################################################
-- SEÇÃO C · VERIFICAÇÃO POSTERIOR   (saídas reais de 2026-08-25 anotadas)
-- ############################################################################
--
-- C1. Não sobrou policy com USING true sobre dado de negócio:
--     select tablename, policyname, roles::text, cmd, qual from pg_policies
--     where schemaname='public' and coalesce(qual,'')='true'
--       and tablename in ('opportunities','leads','touchpoints','activities','notifications');
--     -- ESPERADO 0 linhas. OBTIDO: 0.
--
-- C2. Nenhuma policy sobre o role `public` nas tabelas do v2:
--     select tablename, policyname, roles::text from pg_policies
--     where schemaname='public' and roles::text like '%public%'
--       and tablename in ('opportunities','leads','touchpoints','activities','notifications','vendors','market_sweep');
--     -- ESPERADO 0 linhas. OBTIDO: 0.
--
-- C3. anon não lê nem escreve mais nada:
--     select count(*) from information_schema.role_table_grants
--     where table_schema='public' and grantee='anon';
--     -- ESPERADO 0. OBTIDO: 0.
--     select has_function_privilege('anon','public.is_admin()','execute');
--     -- ESPERADO false. OBTIDO: false.
--
-- C4. As views são INVOKER:
--     select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public' and c.relkind='v'
--       and c.relname in ('pending_actions','vendor_notifications','vendor_activity_summary',
--                         'opportunity_timeline','stale_opportunities');
--     -- ESPERADO security_invoker=on nas cinco. OBTIDO: nas cinco.
--
-- C5. ❗ TESTE DE ACEITAÇÃO — o mesmo que o v2 faz, com o role e o JWT reais:
--     begin;
--       set local role authenticated;
--       set local request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
--       select (select count(*) from public.opportunities),
--              (select count(*) from public.leads),
--              (select count(*) from public.touchpoints),
--              (select count(*) from public.activities),
--              (select count(*) from public.vendors),
--              (select count(*) from public.pending_actions),
--              (select count(*) from public.vendor_activity_summary),
--              (select count(*) from public.stale_opportunities);
--     rollback;
--     -- OBTIDO 2026-08-25 (bate 1:1 com o baseline A7):
--     --   Victor Hugo  25 opps · 15 leads ·   0 tps ·  80 acts · 6 vendors · 21 pending · 1 vsum ·  8 stale
--     --   Renata       19      ·  9       ·   0     ·  41      · 6         · 12         · 1      · 18
--     --   Andre         9      · 44       · 153     ·  16      · 6         · 10         · 1      ·  9
--     --   Paulo         0      ·  0       ·   0     ·   0      · 6         ·  0         · 0      ·  0
--     --   Tomás  (adm) 65      · 78       · 169     · 167      · 6         · 62         · 5      · 47
--     --   Jordi  (adm) 65      · 78       · 169     · 167      · 6         · 62         · 5      · 47
--     -- Nenhum vendedor perdeu linha; ninguém mais vê a carteira alheia.
--
-- C6. ❗ TESTE DE ESCRITA — os 12 caminhos que o v2 executa, como Victor Hugo
--     (não-admin), dentro de begin/rollback para não sujar o banco:
--       1  insert opportunity própria .................. OK
--       2  insert opportunity de outro vendedor ........ bloqueado (correto)
--       3  update opportunity própria (moveStage, que
--          dispara log_stage_change -> insert activities) OK, 1 linha
--       4  leads: vê a própria, não vê a do Andre ...... OK
--       5  insert lead própria ........................ OK
--       6  insert touchpoint em lead própria ........... OK
--       7  update touchpoint ........................... OK, 1 linha
--       8  DELETE touchpoint (CadenciaComponents:656) .. OK, 1 linha
--       9  insert activity ............................. OK
--      10  update activity ............................. OK, 1 linha
--      11  DELETE opportunity própria (botão Excluir) .. OK, 1 linha
--      12  rpc check_company_collision ................. OK
--
-- C7. Advisor de segurança: os 5 ERROR de security_definer_view devem sumir.
--     -- ANTES: 5 ERROR. DEPOIS: 0 ERROR.
--
-- C7-bis. Resultado real do advisor de segurança em 2026-08-25:
--     ANTES : 5 ERROR  (security_definer_view: pending_actions, vendor_notifications,
--                       vendor_activity_summary, opportunity_timeline, stale_opportunities)
--             + 7 WARN function_search_path_mutable
--             + 8 WARN anon_security_definer_function_executable
--             + INFO rls_enabled_no_policy em market_sweep
--     DEPOIS: 0 ERROR · 0 WARN de search_path · 0 WARN de anon-executável ·
--             market_sweep sai do rls_enabled_no_policy.
--     Sobram (fora do escopo desta migração, todos pré-existentes):
--       * WARN authenticated_security_definer_function_executable — é intencional:
--         as policies e o v2 PRECISAM chamar is_admin()/current_vendor_name() e
--         check_company_collision() como authenticated.
--       * INFO rls_enabled_no_policy em bot_log, bot_sessions e pairing_codes —
--         RLS ligado sem policy = ninguém lê pelo PostgREST. É o estado desejado.
--       * WARN de configuração do Auth (leaked password protection, MFA) e de
--         versão do Postgres. São do painel, não deste arquivo.
--
-- C9. ⚠️ RISCO RESIDUAL CONHECIDO — default privileges do `supabase_admin`.
--     B2 fecha os ALTER DEFAULT PRIVILEGES de `postgres` (que é quem roda as
--     migrações e o SQL editor: verificado, current_user = postgres). Mas a
--     plataforma mantém os defaults de `supabase_admin`, que ainda nomeiam anon:
--       select pg_get_userbyid(defaclrole), defaclobjtype, defaclacl::text
--       from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
--       where n.nspname='public';
--       -- supabase_admin / r / {... anon=arwdDxtm/supabase_admin ...}
--     Só o próprio supabase_admin pode revogar isso, e mexer nos defaults da
--     plataforma é arriscado. Consequência prática: uma tabela criada POR
--     supabase_admin nasceria aberta ao anon de novo. Nenhuma das nossas
--     migrações cria tabelas como supabase_admin, mas VALE conferir o grant do
--     anon depois de qualquer criação de tabela feita pelo painel.
--     Idem para funções: o default de `postgres` para FUNCTIONS ainda concede
--     EXECUTE a anon (defaclobjtype='f'). Funções NOVAS nascem chamáveis por
--     anon. Fechar isso (alter default privileges ... revoke execute on
--     functions from anon) ficou de fora desta janela de propósito: exigiria
--     re-verificar tudo, e nada hoje depende disso.
--
-- C8. Contagens intactas (nada foi apagado por engano):
--     select 'opportunities', count(*) from public.opportunities
--     union all select 'leads', count(*) from public.leads
--     union all select 'touchpoints', count(*) from public.touchpoints
--     union all select 'activities', count(*) from public.activities
--     union all select 'notifications', count(*) from public.notifications
--     union all select 'vendors', count(*) from public.vendors;
--     -- ANTES = DEPOIS: 65 / 78 / 169 / 167 / 4579 / 6.
--
-- C10. O CRM v2 de verdade (2026-08-25):
--      `npm install && npx vite build` -> ✓ built in 3.31s, 15 entradas no
--      precache do SW. `npx vite --port 5199` -> GET / = 200, e os 7 módulos
--      (main.tsx, CRMVentapel.tsx, ActivityComponents.jsx, CadenciaComponents.jsx,
--      AIAssistant.jsx, AdminDashboard.jsx, supabaseClient.ts) compilam e são
--      servidos com HTTP 200, sem erro no log do Vite.
--      ⚠️ O login não pôde ser exercitado: o egress deste ambiente bloqueia
--      wtrbvgqxgcfjacqcndmb.supabase.co ("CONNECT tunnel failed, 403"), então
--      nem o browser nem curl chegam ao PostgREST daqui. Por isso a prova de
--      comportamento é a de C5/C6/C3: as MESMAS queries e mutações do v2,
--      executadas no banco com `set local role` + `set local request.jwt.claims`
--      dos 6 auth_id reais, comparadas contra o baseline A7.
--      O que falta para fechar 100%: um login humano no v2 em produção,
--      abrindo as abas Pipeline, Atividades, Cadência e Equipe.
--
-- C11. Migração registrada em supabase_migrations.schema_migrations:
--      version 20260825190039 (0100_seguranca_rls_grants_views). A cabeça antes
--      de aplicar era 20260825121903, e continuava sendo 20260825121903 no
--      momento do apply — nenhuma migração concorrente entrou no meio.
--
-- ############################################################################


-- ############################################################################
-- SEÇÃO D · ROLLBACK EXATO
-- ############################################################################
--
-- D1. SE A TRANSAÇÃO AINDA ESTÁ ABERTA (o caso feliz):  rollback;
--
-- D2. SE JÁ FOI COMMITADO e o v2 quebrou — restaurar o estado EXATO de antes.
--     Recria, uma a uma, as 23 policies que existiam em produção (snapshot de
--     pg_policies em 2026-08-25, antes de B1). Rode INTEIRO:
--
--     begin;
--
--     -- opportunities (5 policies)
--     drop policy if exists opp_select on public.opportunities;
--     drop policy if exists opp_insert on public.opportunities;
--     drop policy if exists opp_update on public.opportunities;
--     drop policy if exists opp_delete on public.opportunities;
--     create policy "Enable all for development" on public.opportunities
--       as permissive for all to public using (true) with check (true);
--     create policy admin_full_access_opportunities on public.opportunities
--       as permissive for all to public using (is_admin());
--     create policy vendor_own_opportunities on public.opportunities
--       as permissive for all to public using (vendor = current_vendor_name());
--     create policy vendor_pool_opportunities on public.opportunities
--       as permissive for select to public
--       using (coalesce(nullif(btrim(vendor), ''), null) is null);
--     create policy vendor_assume_pool on public.opportunities
--       as permissive for update to public
--       using (coalesce(nullif(btrim(vendor), ''), null) is null)
--       with check (vendor = current_vendor_name());
--
--     -- leads (3 policies)
--     drop policy if exists leads_select on public.leads;
--     drop policy if exists leads_insert on public.leads;
--     drop policy if exists leads_update on public.leads;
--     drop policy if exists leads_delete on public.leads;
--     create policy "Enable all for development" on public.leads
--       as permissive for all to public using (true) with check (true);
--     create policy admin_full_access_leads on public.leads
--       as permissive for all to public using (is_admin()) with check (is_admin());
--     create policy vendor_own_leads on public.leads
--       as permissive for all to public
--       using (vendor = current_vendor_name()) with check (vendor = current_vendor_name());
--
--     -- touchpoints (3 policies)
--     drop policy if exists tp_select on public.touchpoints;
--     drop policy if exists tp_insert on public.touchpoints;
--     drop policy if exists tp_update on public.touchpoints;
--     drop policy if exists tp_delete on public.touchpoints;
--     create policy "Enable all for development" on public.touchpoints
--       as permissive for all to public using (true) with check (true);
--     create policy admin_full_access_touchpoints on public.touchpoints
--       as permissive for all to public using (is_admin()) with check (is_admin());
--     create policy vendor_own_touchpoints on public.touchpoints
--       as permissive for all to public
--       using (exists (select 1 from public.leads
--                      where leads.id = touchpoints.lead_id
--                        and leads.vendor = current_vendor_name()))
--       with check (exists (select 1 from public.leads
--                           where leads.id = touchpoints.lead_id
--                             and leads.vendor = current_vendor_name()));
--
--     -- activities (2 policies)
--     drop policy if exists act_select on public.activities;
--     drop policy if exists act_insert on public.activities;
--     drop policy if exists act_update on public.activities;
--     drop policy if exists act_delete on public.activities;
--     create policy admin_full_access_activities on public.activities
--       as permissive for all to public using (is_admin());
--     create policy vendor_own_activities on public.activities
--       as permissive for all to public using (vendor = current_vendor_name());
--
--     -- notifications (2 policies)
--     drop policy if exists notif_select on public.notifications;
--     drop policy if exists notif_insert on public.notifications;
--     drop policy if exists notif_update on public.notifications;
--     drop policy if exists notif_delete on public.notifications;
--     create policy admin_full_access_notifications on public.notifications
--       as permissive for all to public using (is_admin());
--     create policy vendor_own_notifications on public.notifications
--       as permissive for all to public using (vendor = current_vendor_name());
--
--     -- vendors (3 policies)
--     drop policy if exists vendors_select_team  on public.vendors;
--     drop policy if exists vendors_insert_admin on public.vendors;
--     drop policy if exists vendors_update_admin on public.vendors;
--     drop policy if exists vendors_delete_admin on public.vendors;
--     create policy all_read_vendors on public.vendors
--       as permissive for select to public using (true);
--     create policy "Anyone can view active vendors" on public.vendors
--       as permissive for select to public using (is_active = true);
--     create policy admin_modify_vendors on public.vendors
--       as permissive for all to public using (is_admin());
--
--     -- market_sweep volta a ter ZERO policies (era o estado original)
--     drop policy if exists ms_select on public.market_sweep;
--     drop policy if exists ms_claim  on public.market_sweep;
--
--     -- grants do anon (restaura o estado de antes)
--     grant select, insert, update, delete, truncate, references, trigger
--       on all tables in schema public to anon;
--     grant usage, select on all sequences in schema public to anon;
--     alter default privileges in schema public grant all on tables    to anon;
--     alter default privileges in schema public grant all on sequences to anon;
--
--     -- views voltam a SECURITY DEFINER
--     alter view public.pending_actions          set (security_invoker = off);
--     alter view public.vendor_notifications     set (security_invoker = off);
--     alter view public.vendor_activity_summary  set (security_invoker = off);
--     alter view public.opportunity_timeline     set (security_invoker = off);
--     alter view public.stale_opportunities      set (security_invoker = off);
--
--     -- EXECUTE volta a PUBLIC (era assim que estava)
--     grant execute on function public.is_admin()                          to public;
--     grant execute on function public.current_vendor_name()               to public;
--     grant execute on function public.check_company_collision(text, text) to public;
--     grant execute on function public.apollo_cache_get(text)              to public;
--     grant execute on function public.apollo_cache_cleanup()              to public;
--     grant execute on function public.apollo_cache_set(text, text, jsonb, jsonb, integer, text) to public;
--     grant execute on function public.lusha_cache_get(text)               to public;
--     grant execute on function public.lusha_cache_cleanup()               to public;
--     grant execute on function public.lusha_cache_set(text, jsonb, jsonb, integer, integer, text) to public;
--
--     -- search_path: reverter é OPCIONAL (não muda comportamento observável).
--     -- Se quiser o estado byte a byte:
--     --   alter function public.current_vendor_name()               reset search_path;
--     --   alter function public.is_admin()                          reset search_path;
--     --   alter function public.check_company_collision(text, text) reset search_path;
--     --   alter function public.update_updated_at_column()          reset search_path;
--     --   alter function public.log_stage_change()                  reset search_path;
--     --   alter function public.auto_archive_lead()                 reset search_path;
--     --   alter function public.validate_stage_advancement()        reset search_path;
--     --   alter function public.check_inactivity_and_notify()       reset search_path;
--
--     notify pgrst, 'reload schema';
--     commit;
--
--     ⚠️ Depois de D2 o banco volta a estar ABERTO ao anônimo. Só como medida de
--     emergência para não deixar o time parado, e obriga a agendar nova janela.
--
-- D3. SE NEM D2 RESOLVE: Point-in-Time Recovery pelo painel do Supabase, para o
--     minuto anterior ao início da janela.
--
-- ############################################################################
