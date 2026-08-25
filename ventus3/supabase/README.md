# Migraciones SQL — Ventus v3

Este directorio contiene el esquema del **Ventus v3**. Todas las migraciones se
aplican sobre la **misma base de producción** que usa el CRM v2
(`wtrbvgqxgcfjacqcndmb`, PostgreSQL 17.4), que el equipo de Ventapel Brasil usa
todos los días.

> **Regla que gobierna todo este directorio:** los archivos `0001`–`0009` son
> **estrictamente aditivos**. No borran tablas, no borran columnas, no renombran
> nada, no cambian tipos y no tocan una sola policy, función o trigger del v2.
> Todo lo que sí es peligroso vive en `0100_seguranca_PENDENTE_APROVACAO.sql`,
> que **no se aplica sin aprobación humana explícita**.

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
| — | `0100_seguranca_PENDENTE_APROVACAO.sql` | **NO SE APLICA.** Saneamiento de RLS y grants | todo lo anterior |

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
for f in 0001 0002 0003 0004 0005 0006 0007 0008 0009; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/${f}_"*.sql || break
done
```

`0100_...` **no aparece en ninguno de los dos comandos a propósito.** Está fuera
de la serie `000x` justamente para que ningún glob ni ningún `db push` lo levante
por accidente.

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

### Riesgoso — `0100_seguranca_PENDENTE_APROVACAO.sql`
**No es aditivo y no se aplica.** Contiene el saneamiento de seguridad: quitar la
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
