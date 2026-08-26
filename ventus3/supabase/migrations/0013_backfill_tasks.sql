-- 0013_backfill_tasks.sql
-- APLICADA EM PRODUÇÃO: 2026-08-26 (migração ventus3_0013_backfill_tasks).
--
-- Backfill de `tasks` a partir do que já estava escrito em
-- opportunities.next_action. Sem isto a tela Hoje nasce vazia: o motor
-- rankDay() ordena tarefas, e não havia nenhuma.
--
-- origem='manual' porque o TEXTO da ação foi escrito por uma pessoa no CRM v2;
-- quem criou a linha fica registrado em created_by, que é o que distingue
-- estas das tarefas nascidas no v3.
--
-- due_date: a data própria quando existe (4 casos) e a de hoje quando não
-- existe (32 casos). Não é invenção — uma ação pendente sem data combinada É
-- uma ação para hoje, e o vendedor a reprograma com os botões de data. Era
-- exatamente esse buraco que a regra 2 do produto vem fechar.
--
-- Idempotente: o NOT EXISTS impede duplicar se rodar duas vezes.
--
-- EFEITO COLATERAL ESPERADO E VERIFICADO: o gatilho trg_tasks_sync_next_action
-- projeta a tarefa pendente mais próxima de volta para
-- opportunities.next_action / next_action_date. As oportunidades vivas com
-- próxima ação COM DATA passaram de 4 para 36 — visível também no CRM v2. É o
-- comportamento desenhado: tasks é a fonte de verdade e a coluna antiga passa
-- a ser um espelho.
--
-- RESULTADO REAL: 36 tarefas (Renata 11, Andre 8, Jordi 8, Victor Hugo 7,
-- Tomás 2), todas com vendor_id resolvido. Counts de opportunities (65),
-- activities (167) e leads (78) inalterados.
--
-- ROLLBACK: delete from public.tasks where created_by = 'backfill-v2';
--   (o gatilho devolve next_action_date a null nas que não tinham data)

begin;

insert into public.tasks (
  vendor, vendor_id, opportunity_id, titulo, due_date,
  prioridade, status, origem, created_by
)
select
  o.vendor,
  v.id,
  o.id,
  btrim(o.next_action),
  coalesce(o.next_action_date, current_date),
  case when o.next_action_date < current_date then 1 else 2 end,
  'pending',
  'manual',
  'backfill-v2'
from public.opportunities o
left join public.vendors v on v.name = o.vendor
where o.outcome is null
  and coalesce(btrim(o.next_action), '') <> ''
  and coalesce(btrim(o.vendor), '') <> ''
  and not exists (
    select 1 from public.tasks t
    where t.opportunity_id = o.id and t.status = 'pending'
  );

commit;
