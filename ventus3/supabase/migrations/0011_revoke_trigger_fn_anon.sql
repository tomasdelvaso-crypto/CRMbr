-- ═══════════════════════════════════════════════════════════════════════════
-- 0011_revoke_trigger_fn_anon.sql — corrección de 0001
-- ═══════════════════════════════════════════════════════════════════════════
--
-- APLICADA EM PRODUÇÃO em 2026-08-25 12:19:03 UTC (09:19:03 BRT), como
-- `ventus3_0011_revoke_trigger_fn_anon`, version `20260825121903`.
--
-- Este archivo se reconstruyó el 2026-08-27 a partir de
-- `supabase_migrations.schema_migrations.statements` de la propia base: la
-- migración se había corrido directo contra el proyecto y no tenía archivo, así
-- que el repositorio no podía recrear la base desde cero. El SQL de abajo es
-- **literal**, tal como quedó registrado en el banco.
--
-- Verificado el 2026-08-27 con `aclexplode(pg_proc.proacl)`:
--   ventus_tasks_after_change() → {postgres=EXECUTE, service_role=EXECUTE}
-- (ni `anon` ni `public` ni `authenticated`; el resto lo cerró la 0012).

-- Corrección de 0001: ventus_tasks_after_change() es SECURITY DEFINER y quedó
-- con EXECUTE para public/anon, expuesta en /rest/v1/rpc/. No es explotable
-- (una función de trigger llamada directo levanta 0A000), pero el advisor la
-- marca y no hay razón para dejarla ofrecida. Revocar NO afecta al trigger:
-- Postgres verifica EXECUTE al crear el trigger, no al dispararlo.
revoke all on function public.ventus_tasks_after_change() from public, anon;
grant execute on function public.ventus_tasks_after_change() to service_role;
