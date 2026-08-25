-- ═══════════════════════════════════════════════════════════════════════════
-- 0012_cron.sql — os agendamentos do v3 (pg_cron + pg_net)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ESTADO: **NÃO APLICADA**. Aplicar SÓ DEPOIS de:
--   1. o deploy estar de pé e responder em {APP_URL}/api/health;
--   2. CRON_SECRET configurado nas env vars da Vercel;
--   3. os dois segredos gravados no Vault (bloco 1 abaixo).
-- Aplicar antes disso agenda chamadas que devolvem 404 a cada minuto.
--
-- ── POR QUE pg_cron E NÃO VERCEL CRON ──────────────────────────────────────
-- O plano Hobby da Vercel dá UMA execução por dia com precisão de hora.
-- «Reunião em 15 minutos» é literalmente impossível ali. pg_cron roda dentro
-- do Supabase, tem precisão de minuto e não custa nada.
--
-- ── POR QUE OS JOBS NÃO SÃO SQL ────────────────────────────────────────────
-- pg_cron só AGENDA; quem decide o que sai é TypeScript. `rankDay()`,
-- `avaliarRiscos()` e as quiet hours de `dates.ts` já existem, estão testadas
-- e rodam iguais no navegador, na api/ e no bot. Reescrevê-las em plpgsql
-- recriaria o pecado original do v2 —dois motores divergentes sobre as mesmas
-- colunas— só que dentro do banco.
--
-- ── FUSO ───────────────────────────────────────────────────────────────────
-- O servidor está em **UTC** (verificado: `current_setting('TimeZone')`), e o
-- Brasil não tem mais horário de verão desde 2019. Então BRT = UTC-3, sempre:
-- toda hora abaixo aparece nos dois formatos e a conversão é fixa.
--
-- ── SEGREDOS ───────────────────────────────────────────────────────────────
-- A URL e o CRON_SECRET vivem no Vault, não no comando do job: `cron.job` é
-- legível por qualquer um com acesso ao banco, e um segredo colado ali é um
-- segredo publicado. A função que lê o Vault mora num schema PRÓPRIO
-- (`ventus_cron`), que o PostgREST não expõe — em `public` ela nasceria
-- chamável por `/rest/v1/rpc/` (ver risco C9 de 0100).

begin;

-- ═══ 0 · Extensões ═════════════════════════════════════════════════════════
-- Já estão instaladas neste projeto (pg_cron 1.6 em pg_catalog, pg_net 0.14.0
-- com as funções em `net`). Ficam aqui para que rodar do zero funcione.
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ═══ 1 · Segredos no Vault ═════════════════════════════════════════════════
-- RODAR ISTO À MÃO ANTES, uma vez, trocando os valores. Não vai versionado
-- com valor nenhum de propósito.
--
--   select vault.create_secret('https://ventus.ventapel.com.br', 'ventus_app_url',
--          'Base absoluta do app v3 — a mesma APP_URL das env vars da Vercel');
--   select vault.create_secret('<o CRON_SECRET da Vercel>', 'ventus_cron_secret',
--          'Bearer dos endpoints de cron do v3');
--
-- Para TROCAR um valor depois (rotação):
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'ventus_cron_secret'),
--     '<novo valor>');


-- ═══ 2 · O disparador ══════════════════════════════════════════════════════
create schema if not exists ventus_cron;
revoke all on schema ventus_cron from public;
revoke all on schema ventus_cron from anon, authenticated;

-- Fail-closed: sem os dois segredos no Vault, levanta exceção e o job aparece
-- como falhado em `cron.job_run_details`. O contrário —seguir em frente sem
-- Authorization— faria o endpoint responder 401 e o erro seria confundido com
-- «o cron não está rodando».
create or replace function ventus_cron.chamar(caminho text)
returns bigint
language plpgsql
security definer
-- `net`, `vault` e `pg_catalog` são tudo o que esta função precisa enxergar.
-- `public` fica FORA para que nada de lá possa sequestrar um nome.
set search_path = net, vault, pg_catalog
as $$
declare
  base    text;
  segredo text;
  req_id  bigint;
begin
  select decrypted_secret into base
    from vault.decrypted_secrets where name = 'ventus_app_url';
  select decrypted_secret into segredo
    from vault.decrypted_secrets where name = 'ventus_cron_secret';

  if base is null or base = '' then
    raise exception 'ventus_cron: falta o segredo ventus_app_url no Vault';
  end if;
  if segredo is null or segredo = '' then
    raise exception 'ventus_cron: falta o segredo ventus_cron_secret no Vault';
  end if;

  select net.http_post(
    url     := rtrim(base, '/') || caminho,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || segredo
               ),
    body    := '{}'::jsonb,
    -- Menos que o maxDuration da função (60 s no vercel.json): o timeout do
    -- lado do banco tem que perder a corrida, não cortar um job a meio.
    timeout_milliseconds := 55000
  ) into req_id;

  return req_id;
end;
$$;

revoke all on function ventus_cron.chamar(text) from public;
revoke all on function ventus_cron.chamar(text) from anon, authenticated;


-- ═══ 3 · Os agendamentos ═══════════════════════════════════════════════════
-- Idempotente: `unschedule` antes de cada `schedule`, para que reaplicar não
-- duplique nem exploda. pg_cron aceita re-agendar pelo mesmo nome, mas o
-- unschedule explícito deixa o arquivo legível como «esta é a lista inteira».

do $$
declare
  j record;
begin
  for j in select jobname from cron.job where jobname like 'ventus-%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end;
$$;

-- ── A cola: drena a notification_queue e decide o que sai ───────────────────
-- Todo minuto. É o ÚNICO que envia: os nove jobs abaixo só ENFILEIRAM. Quem
-- conhece o orçamento diário, o dedupe e as quiet hours é _politica.ts.
select cron.schedule('ventus-run', '* * * * *',
  $cmd$select ventus_cron.chamar('/api/dispatch/run')$cmd$);

-- ── T-15 da Golden Hour ─────────────────────────────────────────────────────
-- A cada 5 min; o job olha uma janela de 10 min, então sempre cai um e nunca
-- dois (o índice único de dedupe cobre a borda).
select cron.schedule('ventus-golden-t15', '*/5 * * * *',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=golden-t15')$cmd$);

-- ── Preparo de reunião, T-90 ───────────────────────────────────────────────
-- Mesma lógica: janela de 83–93 min com cron de 5 em 5.
select cron.schedule('ventus-preparo-reuniao', '*/5 * * * *',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=preparo-reuniao')$cmd$);

-- ── Agenda da manhã · 07:00 BRT = 10:00 UTC, seg-sex ───────────────────────
select cron.schedule('ventus-agenda-manha', '0 10 * * 1-5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=agenda-manha')$cmd$);

-- ── Risco · 09:00 BRT = 12:00 UTC, seg-sex ─────────────────────────────────
-- No máximo um por vendedor por dia: a dedupe_key é (vendor, risco, dia), sem
-- a oportunidade dentro. Foi assim que o v2 chegou a 17 avisos num dia.
select cron.schedule('ventus-risco', '0 12 * * 1-5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=risco')$cmd$);

-- ── Veredicto de compromissos · sexta 16:00 BRT = 19:00 UTC ────────────────
select cron.schedule('ventus-veredicto', '0 19 * * 5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=veredicto')$cmd$);

-- ── Troféus da semana · sexta 17:00 BRT = 20:00 UTC ────────────────────────
select cron.schedule('ventus-trofeus', '0 20 * * 5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=trofeus')$cmd$);

-- ── Ritual de encerramento · 18:00 BRT = 21:00 UTC, seg-sex ────────────────
select cron.schedule('ventus-encerramento', '0 21 * * 1-5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=encerramento')$cmd$);

-- ── Fila da Golden Hour da véspera · 18:05 BRT = 21:05 UTC, seg-sex ────────
-- Cinco minutos depois do encerramento a propósito: são dois avisos do mesmo
-- momento e chegar juntos vira ruído. Sexta monta a fila de segunda.
select cron.schedule('ventus-fila-golden', '5 21 * * 1-5',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=fila-golden')$cmd$);

-- ── Auditoria de padrões · 23:00 BRT = 02:00 UTC do dia seguinte ───────────
-- NUNCA penaliza sozinha: escreve `flag_calibracao` em ventus_audit e quem
-- decide é uma pessoa, no Painel do Gestor, com o caso na frente.
select cron.schedule('ventus-auditoria', '0 2 * * *',
  $cmd$select ventus_cron.chamar('/api/dispatch/jobs?job=auditoria')$cmd$);

commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) Os dez jobs existem e estão ativos:
--    select jobname, schedule, active from cron.job
--     where jobname like 'ventus-%' order by jobname;
--
-- 2) Disparar um à mão sem esperar o horário (escolha um inofensivo):
--    select ventus_cron.chamar('/api/health');
--
-- 3) O que o servidor respondeu (pg_net guarda a resposta alguns minutos):
--    select id, status_code, left(content, 300)
--      from net._http_response order by id desc limit 5;
--    · 200 → está tudo certo.
--    · 401 → o CRON_SECRET do Vault não é o da Vercel.
--    · 404 → a URL do Vault aponta para outro lugar (ou o deploy não subiu).
--
-- 4) Execuções e falhas das últimas horas:
--    select jobname, status, return_message, start_time
--      from cron.job_run_details
--     where start_time > now() - interval '3 hours'
--     order by start_time desc limit 30;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (parar tudo sem apagar nada)
-- ═══════════════════════════════════════════════════════════════════════════
--    update cron.job set active = false where jobname like 'ventus-%';
--
-- Para remover de vez:
--    do $$ declare j record; begin
--      for j in select jobname from cron.job where jobname like 'ventus-%'
--      loop perform cron.unschedule(j.jobname); end loop;
--    end $$;
--    drop function if exists ventus_cron.chamar(text);
--    drop schema if exists ventus_cron;
--
-- FORA DE ESCOPO, de propósito: o job `check-inactivity-daily` (jobid 1, do
-- v2) segue ativo e segue inserindo uma notificação por oportunidade por dia
-- sem deduplicar — 4.579 linhas, 0% de leitura. Desligá-lo é decisão
-- operativa e merece a sua própria janela, depois que o dispatcher do v3
-- estiver rodando e provando que substitui aquilo.
