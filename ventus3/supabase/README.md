# Migraciones SQL — Ventus v3

Este directorio contiene el esquema del **Ventus v3**. Todas las migraciones se
aplican sobre la **misma base de producción** que usa el CRM v2
(`wtrbvgqxgcfjacqcndmb`, PostgreSQL 17.4), que el equipo de Ventapel Brasil usa
todos los días.

> **Regla que gobierna todo este directorio:** los archivos `0001`–`0009` son
> **estrictamente aditivos**. No borran tablas, no borran columnas, no renombran
> nada, no cambian tipos y no tocan una sola policy, función o trigger del v2.
> Todo lo que sí es peligroso vive en `0100_seguranca_rls_grants_views.sql`,
> que se aplicó el 2026-08-25 con aprobación humana explícita.

---

## ESTADO DE APLICACIÓN — actualizado 2026-08-27

**Las 14 migraciones del v3 y la `0100` están APLICADAS en producción**
(`wtrbvgqxgcfjacqcndmb`). El directorio mapea **1 a 1** contra
`supabase_migrations.schema_migrations`: no queda ni un archivo sin aplicar ni
una migración aplicada sin archivo.

| Archivo | Nombre en `supabase_migrations.schema_migrations` | Estado |
|---|---|---|
| `0001_tasks.sql` | `20260825120838_ventus3_0001_tasks` | ✅ aplicada |
| `0002_evidencia.sql` | `20260825120916_ventus3_0002_evidencia` | ✅ aplicada |
| `0003_ventus_actions.sql` | `20260825120950_ventus3_0003_ventus_actions` | ✅ aplicada |
| `0004_gamificacao.sql` | `20260825121057_ventus3_0004_gamificacao` | ✅ aplicada |
| `0005_notificacoes.sql` | `20260825121132_ventus3_0005_notificacoes` | ✅ aplicada |
| `0006_telegram.sql` | `20260825121151_ventus3_0006_telegram` | ✅ aplicada |
| `0007_indices.sql` | `20260825121217_ventus3_0007_indices` | ✅ aplicada |
| `0008_vistas.sql` | `20260825121314_ventus3_0008_vistas` | ✅ aplicada |
| `0009_rpcs.sql` | `20260825121510_ventus3_0009_rpcs` | ✅ aplicada |
| `0010_contrato_app.sql` | `20260825121553_ventus3_0010_contrato_app` | ✅ aplicada |
| `0011_revoke_trigger_fn_anon.sql` | `20260825121903_ventus3_0011_revoke_trigger_fn_anon` | ✅ aplicada |
| `0012_revoke_trigger_fn_authenticated.sql` | `20260825225714_ventus3_0012_revoke_trigger_fn_authenticated` | ✅ aplicada |
| `0013_backfill_tasks.sql` | `20260826115832_ventus3_0013_backfill_tasks` | ✅ aplicada |
| `0014_cron.sql` | `20260827112510_ventus3_0014_cron` | ✅ aplicada 2026-08-27 |
| `0100_seguranca_rls_grants_views.sql` | `20260825190039_0100_seguranca_rls_grants_views` | ✅ aplicada 2026-08-25 |

### Tres nombres de archivo cambiaron el 2026-08-27

Nada de esto tocó la base: son renombres en el repo para que el disco diga lo
mismo que el banco.

* **`0012_cron.sql` → `0014_cron.sql`.** El `0012` y el `0013` ya estaban
  tomados por migraciones corridas directo contra la base
  (`revoke_trigger_fn_authenticated` y `backfill_tasks`). Aplicar el cron como
  `0012` colisionaba. Todas las referencias del repo apuntan ya a `0014`
  (`DEPLOY.md` §5, `ESTADO.md`, `api/dispatch/{run,jobs,_tipos}.ts`).
* **`0100_seguranca_PENDENTE_APROVACAO.sql` →
  `0100_seguranca_rls_grants_views.sql`.** Está aplicada desde el 2026-08-25 y
  el nombre viejo hacía creer lo contrario a quien miraba el `ls`.
* **`0011` y `0012` dejaron de faltar.** Se corrieron directo contra la base y
  no tenían archivo, así que **el repo no podía recrear la base desde cero**.
  Se reconstruyeron el 2026-08-27 leyendo
  `supabase_migrations.schema_migrations.statements`: el SQL de los dos archivos
  es literal, no una reescritura. Cada uno lleva la cabecera «APLICADA EM
  PRODUÇÃO» con su fecha.

### Detalles de la aplicación

* **`begin;` / `commit;` se quitaron del texto enviado.** `apply_migration` ya
  envuelve cada llamada en su propia transacción; un `commit` anidado la cerraría
  antes de tiempo. Los archivos del repo conservan sus `begin/commit` para que
  `psql -f` siga siendo atómico. Es la única diferencia entre el archivo y lo
  ejecutado.
* **`0007` NO necesitó `CONCURRENTLY`.** El archivo usa `CREATE INDEX` normal y
  entró entero en una transacción, como dice su propio encabezado: con 65
  oportunidades y 169 touchpoints el `ACCESS EXCLUSIVE` dura milisegundos. Los
  ocho `ANALYZE` del pie se corrieron aparte, con `execute_sql`.
* **Corrección `0011`**: el advisor detectó que `ventus_tasks_after_change()`
  —`SECURITY DEFINER`, creada por `0001`— había quedado con `EXECUTE` para
  `anon`, expuesta en `/rest/v1/rpc/`. No era explotable (una función de trigger
  llamada directo levanta `0A000`), pero se revocó igual. **`0001_tasks.sql` ya
  trae el `revoke`**: correr el archivo de cero hoy no reproduce el problema.

### Verificado después de aplicar

* Las **23 policies del v2** son idénticas a la foto previa: ni una agregada,
  quitada ni modificada.
* `opportunities` = 65 y `commitments` = 3, sin cambios. `vendors` = 6.
* Las 20 tablas nuevas existen y están **vacías**, salvo las tres semilla:
  `cadence_schedule` (7), `stage_gates` (6), `scoring_rules` (10).
* Las 4 vistas nuevas tienen `security_invoker=on` y devuelven filas coherentes.
* Las 6 RPC existen, todas `SECURITY DEFINER` con `search_path` fijo y
  **ninguna ejecutable por `anon`**.
* `opportunities.scales_updated_at` = `{}` en las 65 filas; `activities.client_uuid`
  nulo en todas, con el índice UNIQUE **parcial** creado.
* El v2 sigue leyendo: `select id,name,client,stage,scales from opportunities` OK.
* Smoke test del trigger de `0001` sobre la opp 84 (que tenía `next_action` nulo):
  al insertar la task se proyectó el título y la fecha; al borrarla, ambos campos
  volvieron a `NULL`. Round-trip limpio, `tasks` otra vez en 0 filas.

> **Nota sobre `leads` y `activities`.** Durante la ventana de aplicación, otra
> persona (`tripoll@ventapel.com`) aplicó su propia migración
> `20260825121500_add_origin_snapshot_to_leads` y rebajó 15 oportunidades del
> pipeline a leads. Por eso `leads` pasó de 63 a 78 y `activities` de 151 a 166
> **entre la foto previa y la posterior**. No lo causó ninguna migración de este
> directorio: las filas nuevas traen `source='pipeline'` (y `promote_sweep_to_lead()`
> escribe `source='market_sweep'`, `stage='1a'`), comparten un único timestamp de
> INSERT masivo, y `ventus_audit` quedó en **0 filas**, lo que prueba que ninguna
> RPC del v3 llegó a ejecutarse. Su migración es aditiva (`add column if not
> exists origin_snapshot jsonb`) y no colisiona con nada de acá.

### Qué falta

Lo de la sección «Lo que este directorio **no** hace» sigue vigente, y además:

0. ~~**`CRON_SECRET` en las env vars de la Vercel**~~ — **hecho el 2026-08-27**,
   ver la nota del final de esta sección. El camino entero responde 200.

1. **Backfill inicial**: `notification_prefs` y `streaks` por vendedor, el
   `cookbook` de la primera semana, y promover con `promote_sweep_to_lead()` las
   empresas del mapa que siguen con `crm_lead_id` nulo. Hoy esas tablas están
   vacías, así que la gamificación no tiene de dónde arrancar.
2. **24 FK sin índice** en las tablas nuevas (`points_ledger` 7,
   `notification_queue` 4, el resto `vendor_id` sueltos). Son INFO del advisor y
   las tablas tienen 0 filas: conviene indexarlas cuando se sepa qué consultas
   corren de verdad, no antes.
3. **`supabase_realtime` sigue con cero tablas**: el realtime del v3 se suscribe
   y no le llega nada (sin romper).

> **El camino entero responde 200 desde las 12:26 UTC del 2026-08-27.** Lo que
> sigue es la historia de ese mismo día, medida sobre `net._http_response`, que
> es lo que el banco vio contestar al servidor:
>
> | ventana (UTC) | respuesta | n |
> |---|---|---|
> | 11:26 → 11:52 | 500 `FUNCTION_INVOCATION_FAILED` | 40 |
> | 11:53 → 12:25 | 500 `nao_configurado` | 51 |
> | 12:26 → 12:35 | **200 `{"ok":true,…}`** | 14 |
>
> **El primer 500 no tenía nada que ver con el cron.** El log de la Vercel decía:
>
> ```
> Error [ERR_MODULE_NOT_FOUND]: Cannot find module
>   '/var/task/ventus3/src/core/types'
>   imported from /var/task/ventus3/src/core/index.js
> ```
>
> `src/core/index.ts` reexportaba con especificadores **sin extensión**
> (`export * from './types'`). Vite los resuelve; el runtime Node ESM de la
> Vercel no. Rompía **toda** función de `api/` que importara `src/core/index.js`
> —`dispatch/run`, `dispatch/jobs`, `telegram`, `act`, `plan`, `ingest`,
> `ventus`—, o sea casi todo el backend; `/api/health`, que no importa nada de
> `src/`, respondía bien y por eso el deploy parecía verde. Lo arregló el commit
> `2e1bf82`, poniéndole `.js` a los 29 imports relativos de los nueve archivos
> de `src/core/`.
>
> **El segundo 500 sí era el secreto**, y se apagó cuando el dueño cargó
> `CRON_SECRET` en la Vercel. Que a partir de ahí conteste **200 y no 401**
> prueba —sin leer ningún valor, sólo mirando el status— que el secreto de la
> Vercel y el `ventus_cron_secret` del Vault **son el mismo**.
>
> **Queda un solo 400.** `ventus-reprocesso` llama a
> `/api/dispatch/jobs?job=reprocesso` y producción responde `job_invalido`,
> porque ese nombre todavía sólo existe en el `api/dispatch/jobs.ts` del árbol
> local, sin commitear. Los otros diez jobs ya responden 200. Se arregla
> pusheando: el deploy sale solo.

### Cómo revertir cada una

Todas las tablas nuevas están **vacías**, así que revertir `0002`–`0006` y
`0008`–`0010` es dropear objetos, sin pérdida de datos del negocio. El orden
importa: es el inverso al de aplicación, por las dependencias.

```sql
-- 0011 + 0001 · tasks. OJO: el trigger escribió en opportunities.next_action.
-- Antes de dropear, limpiar lo proyectado (sólo lo que escribimos nosotros):
--   update opportunities o set next_action = null, next_action_date = null
--   from tasks t where t.opportunity_id = o.id and o.next_action = t.titulo;
drop trigger if exists trg_tasks_sync_next_action on public.tasks;
drop trigger if exists trg_tasks_before_write    on public.tasks;
drop table if exists public.tasks cascade;        -- cascade: FK desde notification_queue
drop function if exists public.ventus_tasks_after_change();
drop function if exists public.ventus_sync_next_action(bigint, text, date);
drop function if exists public.ventus_tasks_before_write();
drop function if exists public.ventus_current_vendor_id();

-- 0010 · contrato de la app. Las DOS columnas son del v2: dropearlas es
-- destructivo si algo ya escribió en ellas. Verificar primero:
--   select count(*) from activities where client_uuid is not null;
--   select count(*) from opportunities where scales_updated_at <> '{}'::jsonb;
drop function if exists public.converter_lead(bigint, text, numeric, text, uuid);
drop function if exists public.atualizar_escala(bigint, text, smallint, text, text, text, text, uuid);
drop index  if exists public.uq_activities_client_uuid;
alter table public.activities    drop column if exists client_uuid;
alter table public.opportunities drop column if exists scales_updated_at;

-- 0009 · RPCs
drop function if exists public.ventus_commit_action(uuid);
drop function if exists public.ventus_precondition_hash(text, text);
drop function if exists public.promote_sweep_to_lead(bigint);
drop function if exists public.registrar_touchpoint(bigint, text, text, text, uuid);
drop function if exists public.avancar_etapa(bigint, integer, text);
drop function if exists public.ventus_autorizado(text);
drop function if exists public.ventus_actor();
drop table    if exists public.stage_gates;

-- 0008 · vistas (orden inverso de dependencia)
drop view  if exists public.v_golden_queue;
drop view  if exists public.v_fila_cadencia;
drop view  if exists public.v_carteira_do_vendedor;
drop table if exists public.cadence_schedule;

-- 0007 · índices. Revertir es OPCIONAL: un índice no cambia resultados, sólo
-- planes. Si hace falta, en producción usar `drop index concurrently`.
drop index if exists public.idx_opp_next_action_aberta;
drop index if exists public.idx_opp_board;
drop index if exists public.idx_opp_expected_close;
drop index if exists public.idx_opp_frescura;
drop index if exists public.idx_act_timeline;
drop index if exists public.idx_act_gamificacao;
drop index if exists public.idx_act_humanas;
drop index if exists public.idx_tp_executado;
drop index if exists public.idx_tp_metricas;
drop index if exists public.idx_tp_sequencia;
drop index if exists public.idx_leads_fila_cadencia;
drop index if exists public.idx_ms_por_promover;
drop index if exists public.idx_notifications_opportunity;
drop index if exists public.idx_leads_opportunity;
drop index if exists public.idx_commitments_lead;
drop index if exists public.idx_bot_sessions_vendor;
drop index if exists public.idx_bot_log_created;

-- 0006 · telegram
drop table if exists public.pairing_codes;
drop table if exists public.vendor_channels;

-- 0005 · notificaciones
drop table if exists public.push_subscriptions;
drop table if exists public.notification_prefs;
drop table if exists public.notification_queue;

-- 0004 · gamificación
drop table if exists public.cookbook;
drop table if exists public.trophies;
drop table if exists public.kudos;
drop function if exists public.ventus_kudos_orcamento();
drop table if exists public.golden_sessions;
drop table if exists public.streaks;
drop table if exists public.daily_rings;
drop table if exists public.points_ledger cascade;   -- FK autorreferente reverte_id
drop function if exists public.ventus_points_ledger_append_only();
drop table if exists public.scoring_rules;
drop function if exists public.ventus_scoring_rules_no_retro();

-- 0003 · propose-then-commit
drop table if exists public.ventus_idempotency;
drop table if exists public.ventus_audit cascade;
drop function if exists public.ventus_audit_append_only();
drop table if exists public.ventus_actions cascade;
drop function if exists public.ventus_actions_before_write();

-- 0002 · evidencia
drop view  if exists public.opportunity_health cascade;
drop table if exists public.scale_evidence cascade;
drop function if exists public.ventus_scale_evidence_before_write();
drop function if exists public.ventus_scale_score(jsonb, text);
```

Para que Supabase deje de considerarlas aplicadas, además:

```sql
delete from supabase_migrations.schema_migrations
where name like 'ventus3_%';
```

---

## Orden de aplicación

| # | Archivo | Qué crea | Depende de |
|---|---|---|---|
| 1 | `0001_tasks.sql` | `tasks` + proyección a `opportunities.next_action` | — |
| 2 | `0002_evidencia.sql` | `scale_evidence` + vista `opportunity_health` | — |
| 3 | `0003_ventus_actions.sql` | `ventus_actions`, `ventus_audit`, `ventus_idempotency` | — |
| 4 | `0004_gamificacao.sql` | `scoring_rules`, `points_ledger`, `daily_rings`, `streaks`, `golden_sessions`, `kudos`, `trophies`, `cookbook` | 0002 |
| 5 | `0005_notificacoes.sql` | `notification_queue`, `notification_prefs`, `push_subscriptions` | 0001, 0003 |
| 6 | `0006_telegram.sql` | `vendor_channels`, `pairing_codes` | 0001 (helper de identidad) |
| 7 | `0007_indices.sql` | 17 índices sobre tablas **existentes** + `ANALYZE` | — |
| 8 | `0008_vistas.sql` | `cadence_schedule` + `v_carteira_do_vendedor`, `v_fila_cadencia`, `v_golden_queue` | 0001, 0002 |
| 9 | `0009_rpcs.sql` | `stage_gates` + `avancar_etapa`, `registrar_touchpoint`, `promote_sweep_to_lead`, `ventus_commit_action` | 0001, 0002, 0003, 0008 |
| 10 | `0010_contrato_app.sql` | el contrato que la app consume | 0001–0009 |
| 11 | `0011_revoke_trigger_fn_anon.sql` | revoca `EXECUTE` de `anon` sobre la función de trigger de `0001` | 0001 |
| 12 | `0012_revoke_trigger_fn_authenticated.sql` | lo mismo para `authenticated` | 0011 |
| 13 | `0013_backfill_tasks.sql` | llena `tasks` desde `opportunities.next_action` | 0001 |
| 14 | `0014_cron.sql` | schema `ventus_cron`, función `chamar()` y los **once** jobs de `pg_cron` | 0005; **y el deploy de pie** |
| — | `0100_seguranca_rls_grants_views.sql` | Saneamiento de RLS y grants. **No es aditivo** — aplicado el 2026-08-25 con aprobación explícita | todo lo anterior |

El orden numérico **es** el orden de dependencias. Correrlas salteadas falla con
`relation does not exist`.

Todas son **idempotentes**: se pueden correr N veces sin efecto acumulativo
(`create table if not exists`, `create index if not exists`,
`create or replace function`, `drop trigger if exists` + `create trigger`,
`insert ... on conflict do nothing`).

### Cómo aplicarlas

```bash
# Opción A — Supabase CLI (recomendada; una transacción por archivo)
supabase db push --db-url "$DATABASE_URL"

# Opción B — psql, archivo por archivo, parando al primer error
for f in 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/${f}_"*.sql || break
done
```

`0100_...` **no aparece en ninguno de los dos comandos a propósito.** Está fuera
de la serie `00xx` justamente para que ningún glob ni ningún `db push` lo levante
por accidente: no es aditivo y ya está aplicado. Recrear la base desde cero es
correr la serie `0001`–`0014` y **después** el `0100` a mano.

`0014_cron.sql` es la única de la serie que **no** se puede correr contra una
base sola: agenda POSTs contra el deploy y necesita los dos secretos del Vault
(`ventus_app_url`, `ventus_cron_secret`). Sin ellos la función `chamar()` levanta
excepción a propósito —fail-closed— y los jobs aparecen fallados en
`cron.job_run_details`.

---

## Qué es aditivo y qué es riesgoso

### Aditivo puro — se puede aplicar en horario laboral
`0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0008`, `0009`.

Crean **tablas, vistas y funciones nuevas**. El CRM v2 no las conoce y no las
consulta: para él la base no cambió. Verificado con un guard sobre el AST de los
9 archivos — cero `DROP TABLE`, cero `DROP COLUMN`, cero `RENAME`, cero
`ALTER COLUMN TYPE`, cero `CREATE POLICY` sobre tablas del v2, cero
redefiniciones de funciones o vistas del v2.

### Aditivo con un matiz — `0007_indices.sql`
Crea índices sobre tablas del v2. Un `CREATE INDEX` toma `ACCESS EXCLUSIVE` sobre
la tabla mientras se construye. Con el tamaño real de esta base (3,3 MB, 65
oportunidades, 168 touchpoints) eso son milisegundos. Si alguna vez estas tablas
crecen, el propio archivo trae al pie los equivalentes `CREATE INDEX
CONCURRENTLY` comentados y las instrucciones para correrlos fuera de transacción.

Un índice **no cambia resultados**, sólo planes: es la migración de menor riesgo
funcional de todas, aunque sea la única que toca objetos del v2.

### Aditivo con un efecto lateral deliberado — `0001_tasks.sql`
Es el único archivo cuyo trigger **escribe en una tabla del v2**: proyecta la
task abierta más próxima sobre `opportunities.next_action` y `next_action_date`,
para que el CRM v2 siga viendo la próxima acción exactamente como hoy.

Está diseñado para no pisar a nadie:
* si hay una task abierta → escribe título y fecha;
* si se cierra la última task → limpia **sólo si el valor visible es el que
  nosotros escribimos** (comparación explícita contra el valor anterior). Un
  texto cargado a mano desde el v2 nunca se borra.

El `UPDATE` que hace el trigger no cambia `stage`, así que el trigger
`enforce_stage_gates` del v2 sale por su `RETURN NEW` temprano y
`trigger_log_stage_change` no inserta nada. No hay recursión ni ruido en el
timeline.

### Riesgoso — `0100_seguranca_rls_grants_views.sql`
**No es aditivo. Aplicado el 2026-08-25** con aprobación explícita del dueño del
producto (antes de eso el archivo se llamaba `0100_seguranca_PENDENTE_APROVACAO.sql`;
el nombre cambió el 2026-08-27 para no seguir mintiendo en el `ls`).
Contiene el saneamiento de seguridad: quitar la
policy `Enable all for development`, revocar escritura a `anon`, pasar las 5
vistas del v2 a `SECURITY INVOKER`, una policy permissiva por acción sobre
`authenticated` con `auth` envuelto en `(select ...)`, y `search_path` fijo en las
funciones de identidad.

Todo el DDL está **comentado**. El archivo trae, en este orden:

* **Sección A** — verificación previa: 8 consultas de sólo lectura que hay que
  correr y leer ANTES. Las críticas son A3 (¿los 6 vendors tienen `auth_id`?),
  A4 (¿hay filas con `vendor` huérfano?) y A5 (¿el v2 lee con la `anon` key sin
  sesión?). Si A5 da que sí, **el archivo no se puede aplicar** hasta arreglar el
  cliente.
* **Sección B** — el saneamiento, que abre `begin;` y **no commitea**.
* **Sección C** — verificación posterior con la transacción todavía abierta,
  incluyendo el test de aceptación por vendedor.
* **Sección D** — el rollback exacto: `rollback;` si la transacción sigue abierta,
  y si ya se commiteó, el DDL literal que recrea las 23 policies que existen hoy
  en producción (snapshot leído de `pg_policies`), más los grants y las vistas.

La recomendación operativa está escrita en C6: aplicarlo primero en un **branch
de Supabase** con un deploy de preview del v2 apuntando ahí, y recién después
replicarlo en producción, en ventana y con un humano mirando.

---

## Correcciones al PLANO (tipos reales verificados contra producción)

El `docs/PLANO.md` sketcheaba el modelo suponiendo `uuid` en todas las claves.
**No es así**, y las migraciones usan los tipos reales:

| Objeto | PLANO decía | Producción tiene |
|---|---|---|
| `vendors.id` | `uuid` | **`integer`** (identity `NO`, `vendors_id_seq`) |
| `opportunities.id` | `int` | `bigint` (identity `BY DEFAULT`) |
| `leads.id` | `uuid` | **`bigint`** (identity `BY DEFAULT`) |
| `activities.id` | `int` | `bigint` (`nextval('activities_id_seq')`) |
| `touchpoints.id` | — | `bigint` (identity `BY DEFAULT`) |
| `market_sweep.id` | `uuid` | **`bigint`** (identity `ALWAYS`) |

Por eso todas las FK nuevas usan `vendor_id integer`, `opportunity_id bigint`,
`lead_id bigint`, `activity_id bigint`. Además, cada tabla nueva lleva **también**
la columna `vendor text` (el nombre): es lo que comparan las policies actuales
(`vendor = current_vendor_name()`), y sin ella el aislamiento por vendedor no
funcionaría hasta que se aplique `0100`. La migración de `vendor` texto →
`vendor_id` uuid/int que propone el PLANO (DM2) **no está acá**: implica un
`DROP COLUMN` sobre 6 tablas del v2 y es exactamente lo que este directorio no
hace.

Otras dos verificaciones contra producción que cambiaron el diseño:

* `touchpoints_channel_check` acepta hoy sólo `linkedin|whatsapp|email|phone`.
  `registrar_touchpoint()` valida contra ese conjunto y falla con un mensaje
  explícito si se le pide `meeting`/`visit`. Ampliar el CHECK es una migración
  aparte (modifica una restricción del v2), no algo que la función haga por la
  ventana.
* `touchpoints_sequence_number_check` limita la secuencia a 1..7, así que
  `registrar_touchpoint()` rechaza el toque 8 con un error de negocio en vez de
  dejar que reviente la constraint.
* El trigger `trigger_log_stage_change` del v2 **ya** inserta la activity de
  `stage_change`. `avancar_etapa()` no la duplica: sólo agrega el gate numérico,
  que hoy no existe en la base, y una nota extra si hubo override.

---

## Cómo verificar cada migración

Cada archivo termina con un bloque `-- VERIFICACIÓN` con las consultas concretas.
Resumen:

| Archivo | Prueba de que funciona |
|---|---|
| `0001` | Insertar una task en una opp y ver `opportunities.next_action` actualizada; cerrarla y verla volver a `NULL`. |
| `0002` | Un `insert` con `score_novo = 8` y `quote = ''` debe **fallar** (`scale_evidence_prova_chk`). Con cita, pasa. |
| `0003` | `update` y `delete` sobre `ventus_audit` deben fallar con `42501`. |
| `0004` | `update scoring_rules set pa = 999` sobre una regla vigente debe fallar; `daily_rings.fechado` se calcula solo; `delete from points_ledger` debe fallar. |
| `0005` | Encolar dos veces el mismo `dedupe_key` el mismo día debe fallar por `uq_notification_queue_janela`. |
| `0006` | Un código de 5 dígitos o no numérico debe fallar; dos canales primarios del mismo tipo para un vendedor, también. |
| `0007` | `explain (analyze)` de la consulta de acciones vencidas debe usar `idx_opp_next_action_aberta`. |
| `0008` | Las 4 vistas deben tener `security_invoker=true` en `pg_class.reloptions`. |
| `0009` | `avancar_etapa()` debe rechazar sin gate y aceptar con override; ninguna de las funciones debe ser ejecutable por `anon`. |

### Validación sintáctica ya hecha

Los 10 archivos se parsearon con **libpg_query 17.7** (el parser real de
PostgreSQL 17, vía `pglast==7.18`), incluyendo el cuerpo PL/pgSQL de las 16
funciones. También se parseó el DDL **comentado** de las secciones B y D del
`0100` (57 y 50 sentencias), para que el saneamiento y el rollback sean SQL
válido el día que alguien los descomente.

Los cuerpos de las 4 vistas se corrieron **en sólo lectura contra producción**,
sustituyendo por CTEs vacías las tablas que todavía no existen. Resultados
reales, que coinciden con la auditoría:

* `v_fila_cadencia` → 13 filas (los 13 leads activos).
* `v_golden_queue` → 11 de cadencia atrasada + 140 empresas del mapa por promover.
* `opportunity_health` → 65 opps, **health declarado medio 3,77** (contra el
  `health_score` almacenado de 1,72), 31 con al menos una escala ≥ 6 sin prueba.
* `v_carteira_do_vendedor` → 55 oportunidades vivas, 54 en riesgo `critico`,
  **51 sin próxima acción** — exactamente el número de la auditoría.

```bash
pip install 'pglast>=7,<8'
python3 - <<'PY'
import glob
from pglast import parse_sql
for f in sorted(glob.glob('supabase/migrations/*.sql')):
    print(f, len(parse_sql(open(f).read())), 'sentencias')
PY
```

---

## Lo que este directorio **no** hace (y por qué)

Estas piezas están en el PLANO pero quedan fuera, porque **no son aditivas** o
porque son decisiones operativas que necesitan una ventana y un humano:

1. **`vendor` texto → `vendor_id`** (PLANO DM2). Requiere `DROP COLUMN` en 6
   tablas del v2 y romper las policies actuales. Las tablas nuevas ya traen
   `vendor_id` poblado en paralelo para que la migración futura sea un backfill,
   no una cirugía.
2. **`DROP` de columnas muertas** (`vendors.auth_user_id`, `vendors.monthly_target`,
   `activities.ai_confidence`, `opportunities.activities`, `opportunities.alerts`).
   Destructivo. Van en una migración propia cuando el v2 se apague.
3. **`opportunities.health_score` como columna generada** (PLANO DM5). Implica
   `DROP COLUMN` + `ADD COLUMN GENERATED`, y el v2 **escribe** esa columna. Por eso
   el health verificado vive en la vista `opportunity_health` y la columna vieja
   se deja en paz.
4. **Archivar y recrear `notifications`** (PLANO DM12). El v2 la lee. El v3
   escribe en `notification_queue`, que es tabla nueva. Las 4.521 filas de ruido
   se pueden purgar el día que el v2 deje de mirarlas.
5. **Apagar el cron `check-inactivity-daily`.** Es el que genera esas 4.521
   notificaciones sin deduplicar. Está documentado como paso B6 del `0100` y
   comentado incluso ahí: primero tiene que estar corriendo el dispatcher del v3.
6. **Los jobs de `pg_cron` del v3** (dispatch, golden-queue, close-day,
   settle-points, weekly-awards, risk-scan, audit-flags, purgas de `bot_log` y
   `bot_sessions`). Necesitan la URL del proyecto y el `service_role` key en el
   cuerpo del `net.http_post`: son secretos, no van versionados en un `.sql`.
   Van por `supabase/functions` + un script de bootstrap con variables de entorno.
7. **`ALTER PUBLICATION supabase_realtime ADD TABLE ...`** y las `REPLICA
   IDENTITY FULL`. Habilitar realtime sobre `opportunities`, `activities`,
   `leads` y `touchpoints` cambia el comportamiento de escritura del v2 (WAL más
   pesado) y debería decidirse con el equipo. Sobre las tablas nuevas se puede
   hacer sin riesgo en cuanto el cliente del v3 las consuma.
8. **Ampliar `touchpoints_channel_check`** a `meeting|visit|event|referral`.
   Modifica una restricción del v2: migración propia, con revisión de la UI.
9. **`migration_gate_audit`** (PLANO DM17). Es una foto para auditar los gates
   evadidos del histórico, no esquema. Se resuelve con la consulta de A7/A4 del
   `0100` o con un `create table as` puntual cuando haga falta.

---

## Convenciones

* **Textos visibles al usuario: PT-BR.** Los mensajes de las excepciones de
  `0009` y los `comment on` van en portugués porque terminan en pantalla.
* **Comentarios de código: español.** Cada archivo abre con un encabezado que
  explica *qué hace*, *por qué* (con el número de la auditoría que lo justifica) y
  *qué garantiza sobre el v2*.
* **Cada tabla nueva nace con RLS habilitado**, con `revoke all ... from anon`
  explícito (Supabase otorga las tablas nuevas a `anon` por *default privileges*)
  y con **una policy por acción**, no una `FOR ALL`. Es el patrón que el `0100`
  quiere llevar a las tablas viejas.
* **Cada función lleva `set search_path = public, pg_temp`.** Verificado sobre el
  AST: 18 de 18 (16 en PL/pgSQL y 2 en SQL).
* **Append-only de verdad**: `ventus_audit` y `points_ledger` bloquean `UPDATE` y
  `DELETE` con un trigger, no sólo con policies — así ni el owner ni
  `service_role` (que saltan RLS) los pueden reescribir.
