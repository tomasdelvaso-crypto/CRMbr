# Estado do Ventus v3

> Fecha de corte: 2026-08-24 · Rama `claude/crm-web-app-redesign-f7tu7g`
> Documento del integrador. Consolida el trabajo de los 4 agentes paralelos
> (dominio, design system, migraciones SQL, capa de datos offline) y deja
> explícito qué funciona, qué es andamio y qué falta.
>
> El plan completo está en `PLANO.md`; la auditoría que lo originó, en
> `AUDITORIA.md`. Este archivo no los reemplaza: dice en qué punto estamos.

---

## 1 · Verificación (salidas reales, no promesas)

```
$ npm run type-check
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json
EXIT=0   (los 3 proyectos: app, node/api, service worker)

$ npm run build
✓ 2390 modules transformed
dist/assets/index-*.css     46.79 kB │ gzip:  10.27 kB
dist/assets/index-*.js     872.60 kB │ gzip: 266.07 kB
dist/sw.mjs                 16.78 kB │ precache 15 entries (911 KiB)
EXIT=0

$ npx vitest run
Test Files  13 passed (13)
     Tests  280 passed (280)
EXIT=0

$ npx eslint . --max-warnings 0
(sin salida: 0 errores, 0 warnings)
```

El CRM v2 en producción (`/home/user/CRMbr/src` y `/home/user/CRMbr/api`) **no
fue tocado**: `git status --porcelain` no reporta nada fuera de `ventus3/`.
Ninguna migración fue aplicada a la base.

---

## 2 · Qué está construido y funciona

### `src/core` — dominio puro (19 archivos, ~7.400 líneas)

Isomórfico y sin dependencias: no importa red, DOM ni Supabase. Corre igual en
el navegador offline, en `api/` y en el bot de Telegram.

| Módulo | Qué resuelve |
|---|---|
| `types.ts` | Esquema real de Supabase + tipos derivados del motor |
| `ppvvcc.ts` | Escalas, gates por etapa, health declarado vs **verificado** |
| `cadence.ts` | 7 toques en 21 días, derivación de etapa 1a→1d |
| `methodology.ts` | 32 hitos 1A-6C del cookbook |
| `dates.ts` | Todo en America/São_Paulo: días hábiles, feriados BR/SP, atajos |
| `planner.ts` | `rankDay()`: las 3 acciones del día con su porqué auditable |
| `risk.ts` | Las 6 reglas de riesgo de negocio |
| `scoring.ts` | Pontos de Avanço, anillos, racha, trofeos semanales |
| `spin.ts` | 192 preguntas SPIN con vocabulario de planta |

Decisiones que vale la pena no revertir sin discutirlo:

- **`healthVerificado` divide siempre por 6**, no por la cantidad de escalas
  probadas. Promediar solo las probadas le daría 10 a un negocio con una sola
  escala documentada — el autoengaño exacto que M6 viene a matar.
- **El valor entra logarítmico en el planner.** Lineal, la oportunidad de
  R$ 1,15M copaba las 3 tarjetas todos los días. Hay un test que lo fija.
- **El silencio se aplana a los 45 días** y hay una resta de −12 si se habló hoy
  o ayer: la lista de mañana no puede ser la de hoy.
- **`dates.ts` ancla toda la aritmética civil a las 12:00 UTC.** Brasil vivió
  siempre entre UTC−2 y UTC−5, así que el mediodía UTC nunca cae en otro día
  civil, ni cruzando el DST que Brasil tuvo hasta 2019.

### `src/ui` — design system (28 archivos, ~4.000 líneas)

Tokens sobre Tailwind v4 `@theme`, paleta completa en oklch redefinida entera
en `.dark`, safe areas en los cuatro bordes, targets ≥44px, todo con teclado y
lector de pantalla.

- Gestos hechos a mano con Pointer Events (`Sheet`, `SwipeRow`,
  `PullToRefresh`): el snap con proyección de velocidad y la resistencia
  rubberband necesitan control frame a frame.
- `toast()` y `confirmar()` son stores fuera de React con hosts montados una
  vez en el Shell. Reemplazan los 27 `alert()`/`confirm()` del v2 y se pueden
  llamar desde el outbox sin pasar contexto.
- El back del sistema cierra overlays empujando una entrada de historial con la
  misma URL.
- `Stepper` sin `input type=range`: 11 marcas tocables más dos botones de 52px.

### `src/data` — capa offline-first (15 archivos, ~4.700 líneas)

Dexie como fuente de verdad local, TanStack Query montado **sobre Dexie** (no
sobre la red), outbox con `client_uuid`, backoff y clasificación de errores.

- **Primero sube y después baja.** Bajando primero, el pull traería el estado
  anterior del servidor en cada ciclo.
- **La regla dura vive en un solo lugar** (`conflicts.aplicarRemoto`): el pull
  incremental y el realtime pasan los dos por ahí. No hay dos puertas de
  entrada para los datos del servidor.
- **`activities` y `touchpoints` se indexan por `uid`**, no por el id del
  servidor: la fila creada offline y la confirmada por Postgres son UNA sola.
- **23505 (UNIQUE del client_uuid) se clasifica como ÉXITO**, no como error: es
  el reintento haciendo su trabajo.
- El persister del cache es Dexie, no localStorage: la cartera pasa holgado los
  5 MB de cuota de Safari y el fallo sería silencioso.

### `src/app` — composición (15 archivos)

`ThemeProvider → PersistQueryClientProvider → SessionProvider → CamadaDeDados →
RouterProvider`. El orden **no es decorativo** (ver §3.2).

### `supabase/migrations` — 11 archivos, ~3.750 líneas

Escritas contra el esquema **real** de producción (verificado con `SELECT` de
lectura vía MCP), parse-verificadas con el parser de PostgreSQL 17
(pglast 7.18 / libpg_query) incluidos los cuerpos PL/pgSQL. **Ninguna aplicada.**

| Archivo | Contenido |
|---|---|
| `0001_tasks.sql` | `tasks` + proyección a `opportunities.next_action` |
| `0002_evidencia.sql` | `scale_evidence` (la regra da prova), `opportunity_health` |
| `0003_ventus_actions.sql` | propose-then-commit, `ventus_audit`, `ventus_idempotency` |
| `0004_gamificacao.sql` | `points_ledger`, reglas versionadas, kudos |
| `0005_notificacoes.sql` | `notification_queue` con dedupe real por día de SP |
| `0006_telegram.sql` | `vendor_channels`, `pairing_codes` |
| `0007_indices.sql` | índices; ninguno existente se borra |
| `0008_vistas.sql` | `v_fila_cadencia`, `v_golden_queue`, `v_carteira_do_vendedor` |
| `0009_rpcs.sql` | `avancar_etapa`, `registrar_touchpoint`, `promote_sweep_to_lead`, `ventus_commit_action` |
| **`0010_contrato_app.sql`** | **nuevo, del integrador** — ver §3.3 |
| `0100_seguranca_PENDENTE_APROVACAO.sql` | RLS. Todo el DDL comentado, requiere aprobación humana |

Datos que confirman que las vistas dicen la verdad (corridas contra producción,
solo lectura): `opportunity_health` da media declarada 3,77 contra el 1,72
almacenado, y 65 de 65 oportunidades **sin prueba ninguna**;
`v_carteira_do_vendedor` da 51 de 54 oportunidades vivas sin `next_action_date`.
Coinciden exactamente con la auditoría.

---

## 3 · Qué arregló la integración

Los cuatro agentes entregaron en verde por separado. Lo que sigue son defectos
que **solo aparecen al juntarlos**, y que ningún type-check podía detectar.

### 3.1 · El contrato RPC estaba roto entero (crítico)

PostgREST resuelve una función por el **conjunto exacto de nombres de
argumento**. Un argumento de más no se ignora: devuelve `PGRST202 function does
not exist`. Las cinco escrituras de dominio de la app llamaban con nombres que
ninguna función aceptaba.

| RPC | Mandaba la app | Acepta el SQL |
|---|---|---|
| `avancar_etapa` | `p_opportunity_id, p_stage, p_override_reason, p_vendor, p_ts` | `p_opp_id, p_nova_etapa, p_override_motivo` |
| `registrar_touchpoint` | `p_channel, p_result, p_notes, p_sequence_number, p_sent_message, p_executed_at` | `p_canal, p_resultado, p_notas, p_client_uuid` |
| `promote_sweep_to_lead` | `p_sweep_id, p_vendor` | `p_sweep_id` |
| `atualizar_escala` | 6 argumentos | **la función no existía** |
| `converter_lead` | 5 argumentos | **la función no existía** |

Además, `transport.ts` **inyectaba `p_idempotency_key` en toda llamada RPC**, y
ninguna función lo declara: por sí solo eso rompía las cinco.

Arreglado: `transport.ts` manda exactamente el payload de la mutación;
`mutations.ts` usa los nombres reales; el número de secuencia del touchpoint ya
no se manda porque el servidor lo calcula con `for update` sobre el lead (la
única forma de que dos teléfonos no escriban el mismo TP).

**Y quedó blindado**: `src/data/__tests__/contrato-rpc.test.ts` lee las
migraciones reales, extrae las firmas, ejecuta las mutaciones de verdad contra
`fake-indexeddb` y compara argumento por argumento. Verificado que falla si se
renombra un parámetro de cualquiera de los dos lados.

### 3.2 · La capa de datos era código muerto

`src/data` (4.700 líneas) no la importaba nadie: `App.tsx` creaba su propio
`QueryClient` con `makeQueryClient()` local, sin persister, sin outbox, sin
sync y sin realtime. La app compilaba y arrancaba sin capa de datos.

Arreglado:

- `App.tsx` usa `criarQueryClient()` + `PersistQueryClientProvider` con
  `criarPersisterDexie()`, y **registra los mutation defaults en el
  inicializador del `useState`** — antes de hidratar el cache. Si se hidratan
  mutaciones pausadas sin `mutationFn` por `mutationKey`, no se reanudan nunca
  y el vendedor pierde lo que escribió offline.
- `src/app/CamadaDeDados.tsx` (nuevo) enciende sync + outbox + realtime cuando
  hay vendedor, y los apaga al desmontar o al cambiar de vendedor.
- `SessionProvider` resuelve el vendedor de verdad, con
  `resolverVendorDaSessao()` (nuevo en `queries.ts`): **Dexie primero**, red
  solo en el primer login, y cachea. Es lo que permite que la app abra dentro
  del galpón sin señal. Consulta `auth_id` (la columna viva) y cae a
  `auth_user_id` (la del v2, marcada para DROP) tragándose el 42703, para que
  siga funcionando el día que se borre.

### 3.3 · `0010_contrato_app.sql` — lo que la app daba por existente

Escrito por el integrador, **pendiente de revisión del dueño del esquema y no
aplicado**. Parse-verificado con pglast 7.18 y pasado por el guard de AST que
comprueba que no rompe el v2 (0 errores, 0 funciones sin `search_path` fijo).

- `opportunities.scales_updated_at jsonb` — el reloj del LWW **por escala** de
  `conflicts.ts`, que hoy lo lee y siempre encuentra null. Sin él, dos
  vendedores editando escalas distintas de la misma oportunidad se pisan: el
  conflicto exacto que el diseño offline existe para evitar.
- `activities.client_uuid uuid` + índice UNIQUE **parcial**
  (`where client_uuid is not null`), para que las ~4.500 filas históricas del v2
  queden fuera y no haya que rellenar nada.
- `atualizar_escala()` — `jsonb_set` de esa escala y su timestamp, nunca del
  jsonb entero. La regra da prova no se reimplementa: la impone
  `scale_evidence_prova_chk`, así que si falta la cita el INSERT levanta 23514 y
  la transacción se va atrás — primero la prueba, después el número.
- `converter_lead()` — nace en etapa 2 (la 1 es el funil de prospección y el
  lead ya salió de él), con anti-duplicado por `leads.opportunity_id`.

Las dos `ALTER TABLE` son `ADD COLUMN` nullable/con default sobre tablas del v2:
no renombran, no cambian tipos, no agregan CHECK sobre datos existentes ni
tocan policies. Es la excepción mínima a la regla de 0001-0009 de no tocar
columnas del v2, y está documentada en la cabecera del archivo.

### 3.4 · Tipos duplicados unificados

- **`RevisaoItem` existía dos veces y ninguna coincidía con la tabla.**
  `src/core/types.ts` tenía `ActionProposal` + `FieldProposal` (en inglés, sin
  usar por nadie) y `src/data/local-types.ts` tenía `RevisaoItem` (en PT-BR, con
  `tool_name` donde la tabla dice `tipo` y un `entity_id` numérico donde la
  tabla lo tiene en **texto** porque conviven bigint y uuid).
  Ahora core tiene `VentusAction` — el mirror exacto de `public.ventus_actions`,
  con sus enums derivados de los CHECK reales — y `RevisaoItem` como la
  proyección que pinta la pantalla, reusando `FieldProposal` y `EntidadeRef`.
- **`IsoDate` estaba definido dos veces** (`core/dates.ts` y `ui/datas.ts`) y
  `ui/datas.ts` reimplementaba el huso de São Paulo con su propio `Intl` y su
  propia aritmética en UTC, porque cuando se escribió `core/dates.ts` era un
  stub que lanzaba. Ahora `ui/datas.ts` es un adaptador delgado sobre el
  dominio; `DatePills` usa `resolveShortcut()` de core.
- **Dos formateadores de R$ que producían bytes distintos.** `formatBrl` (ui)
  usaba `Intl` con espacio duro U+00A0; `formatarBRL` (core) usa espacio normal.
  A la vista son idénticos, pero los textos del planner y de `risk.ts` ya vienen
  formateados desde core: una tarjeta y su línea de motivo mostraban el mismo
  valor con dos espaciados. `formatBrl` ahora delega en el dominio y conserva
  solo su decisión de UI (guión suelto para el vacío, contra el `R$ —` que
  necesita Telegram).

Verificado: los tres barriles (`@/core` 280 símbolos, `@/data` 120, `@/ui` 104)
**no comparten ni un nombre**.

### 3.5 · Tests que antes no existían

- `src/app/__tests__/routes.test.tsx` — 19 tests. Monta **cada ruta de verdad**
  con React y falla si la pantalla explota o si se activa el `errorElement`. Un
  `curl` al dev server devuelve 200 para cualquier ruta (es una SPA, siempre
  sirve el mismo `index.html`), así que no prueba nada. Este test ya encontró
  que `/kitchen` depende de `ThemeProvider`.
- `src/app/__tests__/boot.test.tsx` — monta `App` entera (tema + cache
  persistido en Dexie + sesión + capa de datos + router) contra
  `fake-indexeddb`.
- `src/data/__tests__/contrato-rpc.test.ts` — 9 tests, el contrato de §3.1.
- `vite.config.ts`: el `include` de vitest pasó de `src/core/**` + `src/data/**`
  a `src/**/*.test.{ts,tsx}`. Los tests que necesitan DOM piden jsdom con el
  docblock `@vitest-environment jsdom`, para no pagar el arranque de un DOM en
  los 251 tests que no lo usan.
- `tsconfig.json`: `noUnusedParameters` vuelve a `true`. Estaba en `false`
  porque los stubs de core declaraban firmas y lanzaban; ya no hay stubs.

---

## 4 · Qué es andamio (stub declarado)

**Las 15 pantallas de `src/screens` son placeholders.** Cada una son 6 líneas
que renderizan `ScreenPlaceholder` con «Tela em construção». El router, el
Shell, la bottom nav, el FAB de micrófono y el modo foco de la Golden Hour sí
son reales; el contenido no. Ninguna pantalla consume todavía `@/data`.

`src/screens/Kitchen/KitchenSink.tsx` es la excepción: es la vitrine real del
design system y ejercita las primitivas de verdad.

Otros andamios explícitos:

- `derivarEventos()` (`core/scoring.ts`) es la ruta por defecto mientras no
  exista la tabla de eventos de scoring. Es conservador a propósito: todo lo que
  exige artefacto queda `pending_evidence` y no acredita.
- `weeklyTrophies` usa proxies sobre los anillos (Zelador mide conversas,
  Reanimador mide contatos) porque `DailyScore` no trae ni compromisos vencidos
  ni cuentas dormidas reactivadas.
- `fetchRevisao()` lee de `meta` (`revisao:<vendor>`), no de
  `public.ventus_actions`.
- `transitions.ts` expone los helpers de view transition pero nadie los llama.
- `BottomNav` acepta `badges` pero nadie se los pasa.

---

## 5 · TODOs consolidados

Orden aproximado de dependencia. Lo que bloquea a otra cosa va primero.

### 5.1 · Base de datos (bloquea casi todo lo demás)

1. **Aplicar `0001`-`0010` en orden numérico.** Nadie las corrió. El orden
   numérico ES el orden de dependencias.
2. **Revisar `0010_contrato_app.sql` antes de aplicarlo.** Lo escribió el
   integrador, está parse-verificado pero **no ejecutado**. Es el único archivo
   que hace `ALTER TABLE` sobre tablas del v2 (dos `ADD COLUMN`).
3. **`0100`: correr la sección A completa, sobre todo A5** — comprobar si algún
   camino del v2 lee `opportunities`/`leads`/`touchpoints` con la anon key **sin
   sesión**. Si da que sí, el saneamiento de RLS no se puede aplicar hasta
   arreglar el cliente. Recomendado: primero en un branch de Supabase con un
   preview del v2 apuntando ahí.
4. Habilitar `supabase_realtime` tabla por tabla con `REPLICA IDENTITY`. Hoy la
   publicación tiene **cero** tablas: el realtime del v2 es ficción, y
   `realtime.ts` se suscribe y no le llega nada (sin romper).
5. Jobs de `pg_cron` del v3 (dispatch, golden-queue, close-day, settle-points,
   weekly-awards, risk-scan, audit-flags, purgas). Necesitan URL del proyecto y
   `service_role` key en el `net.http_post`: son secretos y no van versionados.
6. Backfill inicial: `notification_prefs` y `streaks` por vendedor, cookbook de
   la primera semana, y promover las ~140 empresas del mapa con `crm_lead_id`
   NULL vía `promote_sweep_to_lead()`.
7. Ampliar `touchpoints_channel_check` a `meeting|visit|event|referral`. Hoy
   `registrar_touchpoint()` falla con mensaje explícito si se le pide
   `meeting`/`visit`, en vez de ampliar el CHECK del v2 por la ventana.
8. `touchpoints.sent_message`: no existe. La mensaje enviada se guarda hoy
   dentro de `notes` con una etiqueta (hay test). Si el equipo la quiere
   consultable, hace falta la columna.
9. Migración `vendor` texto → `vendor_id` (PLANO DM2): requiere `DROP COLUMN` en
   6 tablas del v2. Para cuando el v2 se apague; las tablas nuevas ya traen
   `vendor_id` en paralelo para que sea un backfill y no una cirugía.
10. DROP de columnas muertas (`vendors.auth_user_id`, `vendors.monthly_target`,
    `activities.ai_confidence`, `opportunities.activities`,
    `opportunities.alerts`) — migración destructiva propia.
11. `opportunities.health_score` como columna generada (PLANO DM5). El v2 la
    **escribe**, así que hoy el health verificado vive solo en la vista.
12. Archivar/recrear `notifications` y apagar el cron `check-inactivity-daily`
    (4.521 filas, 0,0 % de lectura) — recién cuando el dispatcher de
    `notification_queue` esté corriendo.
13. Espejar `conflict_log` en Postgres: hoy los conflictos se registran solo en
    Dexie.

### 5.2 · Pantallas (el grueso del trabajo que queda)

14. **Implementar las 15 pantallas.** Hoy son placeholders de 6 líneas. Es lo
    que falta para que esto sea un producto y no una plataforma.
15. Enganchar cada pantalla a los hooks de `@/data` (`useHoje`, `useCarteira`,
    `useDossie`, `useFilaCadencia`, `useGoldenQueue`, `useRings`, `useRevisao`).
16. Pipeline de voz: `MediaRecorder` → Whisper → `registrarAtividade(clientUuid)`.
    `audioBlobs` ya tiene store y helpers; `Waveform` acepta un stream pero no
    gestiona `MediaRecorder` ni la negociación de mimeType
    (`audio/webm;codecs=opus` → `audio/mp4` en iOS ≤18.3).
17. Badge de pendientes del outbox en el FAB y en la bottom nav.
18. Precache nocturno del «modo viagem» (fichas + últimas 10 actividades +
    evidencias + brief de las reuniones de mañana), disparado en foreground a
    las 21h porque iOS no tiene Periodic Sync. La retención de 90 días y
    `podarAtividades()` ya están.

### 5.3 · Rendimiento y plataforma

19. **Code splitting por ruta.** El bundle está en 872 kB (266 kB gzip) sin
    dividir. El plano
    pide TTI < 1,5 s en Android de gama media con 4G brasileña. `React.lazy` en
    `routes.tsx`, y `/kitchen` debería quedar fuera del bundle de producción o
    detrás de un flag.
20. Barra de acción levantada con `visualViewport` (M22): los sheets con input
    de texto quedan tapados por el teclado en Android. `Sheet` ya recalcula
    altura con `ResizeObserver`, pero no reposiciona contra el teclado.
21. Conectar `transitions.ts` al router (push/pop ya está resuelto en
    `direcaoEntreRotas`) y poner `view-transition-name` en el header de
    Carteira → Dossiê.

### 5.4 · Dominio y gamificación

22. **El bloque de gamificación que no está**: kudos, ~20 badges, temporadas de
    4 semanas con bilhetes, meta coletiva mensual, Corrente do time / Dia Cheio
    do Time (+25 % PA), y la auditoría automática diaria (>6 registros en
    <10 min, escalas +3 sin transcripción, oscilación de etapa). Necesita las
    tablas de `0004` aplicadas.
23. `METHODOLOGY_ACTIVITIES` son 32 hitos 1A-6C redactados a partir del PPVVCC
    y del negocio. El v2 no tiene el catálogo (`methodology_code` es texto
    libre): conviene que Jordi/Tomás los revisen **antes** de que empiecen a
    escribirse.
24. `detectScaleRegression()` devuelve `opportunityId: 0` porque la firma
    inglesa del stub no recibe la oportunidad. La versión útil es
    `regraRegressaoDeEscala(opp, anterior)`. Unificar cuando se sepa quién
    consume cuál.
25. `risk.ts` no lee `scale_evidence` todavía: `hasFalseGate` detecta la etapa
    arrastrada por encima de lo que las escalas permiten, pero no el caso «la
    etapa está bien pero las escalas que la habilitan no tienen prueba».
26. `weeklyTrophies` y `derivarEventos()`: reemplazar los proxies por
    `scoring_events` y compromisos agregados por semana (F7).

### 5.5 · Calidad

27. **Sin tests de UI de interacción.** El plano pide Playwright sobre 3 flujos
    (Golden Hour completa, registro por voz offline→sync, avance de etapa con
    gate). Los gestos de `Sheet` y `SwipeRow` solo se validan de verdad en
    dispositivo real.
28. Test de dos dispositivos editando escalas distintas offline contra la base
    real (necesita `0010` aplicado).
29. **Calibrar los umbrales de gesto con los 4 vendedores en teléfono real**
    antes de congelarlos: swipe 96px, pull 72px, velocidad de cierre
    0,55 px/ms. Hoy están puestos a ojo.
30. Verificar contraste AA de la paleta oscura sobre los tonos `-soft` (sobre
    todo `warn-soft-fg` y `accent-soft-fg`) con herramienta, no a ojo.
31. Faltan variantes de `Skeleton` (revisão, placar, gestor). La forma tiene que
    copiar el card real, así que se agregan junto con cada pantalla.

---

## 6 · Cosas que es fácil romper sin darse cuenta

- **No mandes un argumento de más a una RPC.** PostgREST resuelve por conjunto
  exacto de nombres. `contrato-rpc.test.ts` te avisa.
- **No registres los mutation defaults después de hidratar el cache.** Las
  mutaciones pausadas se restauran sin `mutationFn` y no se reanudan nunca.
- **No hagas `UPDATE` del jsonb `scales` entero.** Pisa las otras cinco escalas.
  Para eso está `atualizar_escala()`.
- **No uses `opportunities.last_update` para medir silencio.** Se pisa con
  cualquier edición y por eso miente sistemáticamente en el v2. `risk.ts` usa
  las actividades reales; hay un test que fija la diferencia.
- **No definas un color solo dentro de un media query.** La paleta entera vive
  en `:root` y se redefine entera en `.dark`.
- **No agregues aritmética de fechas fuera de `core/dates.ts`.** Ya pasó una vez
  y quedaron dos husos de São Paulo conviviendo.
