# Estado do Ventus v3

> Fecha de corte: **2026-08-25** · Rama `claude/crm-web-app-redesign-f7tu7g`
> Documento del integrador. Consolida dos olas de trabajo paralelo —la primera
> de fundación (dominio, design system, SQL, capa offline), la segunda de nueve
> agentes que construyeron las 15 pantallas, el backend serverless y aplicaron
> las migraciones— y deja explícito qué funciona, qué es andamio y qué falta.
>
> El plan completo está en `PLANO.md`; la auditoría que lo originó, en
> `AUDITORIA.md`. Este archivo no los reemplaza: dice en qué punto estamos.

---

## 1 · Verificación (salidas reales, no promesas)

```
$ npm run type-check
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json
EXIT=0   (los 3 proyectos: app, node/api, service worker)

$ npx vitest run
 Test Files  34 passed (34)
      Tests  636 passed (636)
   Duration  12.64s
EXIT=0

$ npx eslint . --max-warnings 0
(sin salida: 0 errores, 0 warnings)
EXIT=0

$ npm run build
✓ 2510 modules transformed
dist/assets/index-*.css      63.85 kB │ gzip:  12.94 kB
dist/assets/index-*.js      347.26 kB │ gzip: 111.72 kB   ← entrada
dist/assets/ui-*.js         274.33 kB │ gzip:  89.44 kB   ┐
dist/assets/session-*.js    231.75 kB │ gzip:  73.96 kB   ├ compartidos, precargados
dist/assets/supabase-*.js   209.54 kB │ gzip:  54.44 kB   ┘
… + 17 chunks por ruta (Registrar 48 kB … Mais 6 kB) + 20 de íconos
dist/sw.mjs                  16.78 kB │ precache 53 entries (1.450,98 KiB)
EXIT=0
```

**Las 15 rutas responden y montan.** El `curl` al dev server devuelve 200 para
las 16 URLs (`/ /carteira /carteira/46 /golden /registrar /revisao /cadencia
/placar /rituais /ventus /gestor /ajustes /mais /instalar /login /kitchen`),
pero eso no prueba nada: es una SPA y siempre sirve el mismo `index.html`. Lo
que sí prueba es `src/app/__tests__/routes.test.tsx`, que monta **cada ruta de
verdad con React**, espera a que baje su chunk y falla si la pantalla explota o
si se activa el `errorElement`. Además se pidió al dev server el módulo
transformado de cada pantalla (`/src/screens/*/index.tsx`): 18 de 18 en 200, o
sea que las 15 compilan por el pipeline real de Vite y no sólo por `tsc`.

El CRM v2 en producción (`/home/user/CRMbr/src` y `/home/user/CRMbr/api`) **no
fue tocado**: `git status --porcelain -- src api` no reporta nada.

---

## 2 · Qué está construido y funciona

### 2.1 · Base de datos — **las migraciones YA ESTÁN APLICADAS**

Corrección importante respecto de la versión anterior de este documento, que
decía «ninguna migración fue aplicada»: el 2026-08-25 se aplicaron
`0001`–`0010` más una `0011` correctiva. Verificado con `list_migrations`:

| version | nombre |
|---|---|
| 20260825120838 | `ventus3_0001_tasks` |
| 20260825120916 | `ventus3_0002_evidencia` |
| 20260825120950 | `ventus3_0003_ventus_actions` |
| 20260825121057 | `ventus3_0004_gamificacao` |
| 20260825121132 | `ventus3_0005_notificacoes` |
| 20260825121151 | `ventus3_0006_telegram` |
| 20260825121217 | `ventus3_0007_indices` |
| 20260825121314 | `ventus3_0008_vistas` |
| 20260825121510 | `ventus3_0009_rpcs` |
| 20260825121553 | `ventus3_0010_contrato_app` |
| 20260825121903 | `ventus3_0011_revoke_trigger_fn_anon` |

`0011` cierra un hueco que abría `0001`: `ventus_tasks_after_change()` es
SECURITY DEFINER y quedaba con EXECUTE para `anon`, expuesta en
`/rest/v1/rpc/`. No era explotable (una función de trigger llamada directo
levanta 0A000) pero se revocó igual y se parcheó `0001_tasks.sql` para que
correrlo de cero no lo reproduzca.

`0100_seguranca_PENDENTE_APROVACAO.sql` **NO se aplicó**: sigue esperando
aprobación humana. Las 23 policies del v2 quedaron byte por byte iguales
(verificado antes y después), y los 5 ERROR del advisor de seguridad son
preexistentes del v2 (vistas SECURITY DEFINER) — justamente lo que `0100` viene
a arreglar.

**Ojo, hay más de una mano escribiendo en esta base.** Durante la ventana de
aplicación, `tripoll@ventapel.com` corrió dos migraciones propias
(`add_origin_snapshot_to_leads` y `arquivar_oportunidades_victor_para_cadencia`)
que bajaron 15 oportunidades del pipeline a leads. Son aditivas y no colisionan,
pero conviene coordinar la ventana antes de aplicar `0100`, que sí es
destructivo.

**Los números reales de hoy** (consultados al cerrar esta integración): 65
oportunidades (**40 vivas**), 78 leads, 167 actividades, 169 touchpoints, 239
empresas en `market_sweep`, 6 vendedores. **36 de las 40 oportunidades vivas
siguen sin `next_action_date`** — el número que el producto entero existe para
mover. `tasks`, `scale_evidence` y `ventus_actions` están **en 0 filas**: las
tablas existen y las pantallas escriben contra ellas, pero todavía nadie las
llenó.

### 2.2 · `src/core` — dominio puro

Isomórfico y sin dependencias: no importa red, DOM ni Supabase. Corre igual en
el navegador offline, en `api/` y en el bot de Telegram. 280 tests.

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

### 2.3 · `src/ui` — design system

Tokens sobre Tailwind v4 `@theme`, paleta completa en oklch redefinida entera
en `.dark`, safe areas en los cuatro bordes, targets ≥44px, todo con teclado y
lector de pantalla.

Primitivas: `Sheet`, `SwipeRow`, `PullToRefresh`, `VirtualList`, `Ring`/
`RingTrio`, `Button`, `IconButton`, `Card`, `Chip`, `Badge`, `Avatar`,
`Skeleton` (12 variantes), `EmptyState`, `SegmentedControl`, `Stepper`,
`NumberField`, `DatePills`, `TextField`/`TextArea`, `Switch`, `ProgressDots`,
`Waveform`, `Confetti`, `QRCode` (codificador propio, sin dependencias),
`Logotipo`, `Toast`, `Confirm`, `haptic()`, `transitions`, y los hooks
`useMediaQuery`/`useTelaLarga`/`useDebouncedValue`/`useDitado`/
`useAlturaDoTeclado`.

- Gestos hechos a mano con Pointer Events: el snap con proyección de velocidad
  y la resistencia rubberband necesitan control frame a frame.
- `toast()` y `confirmar()` son stores fuera de React con hosts montados una
  vez en el Shell. Reemplazan los 27 `alert()`/`confirm()` del v2.
- El back del sistema cierra overlays empujando una entrada de historial con la
  misma URL.
- `Stepper` sin `input type=range`: 11 marcas tocables más dos botones de 52px.
  Cuando el rango **no** es una escala 0-10 se usa `NumberField` (56 toques por
  semana serían 27 marcas de 4px).

### 2.4 · `src/data` — capa offline-first

Dexie como fuente de verdad local, TanStack Query montado **sobre Dexie** (no
sobre la red), outbox con `client_uuid`, backoff y clasificación de errores.
Módulos: `queries`, `mutations`, `db`, `sync`, `outbox`, `transport`,
`conflicts`, `realtime`, `plano-do-dia`, `dossie`, `revisao`, `placar`,
`rituais`, `gamificacao`, `ajustes`, `gestor`, `auth`.

- **Primero sube y después baja.** Bajando primero, el pull traería el estado
  anterior del servidor en cada ciclo.
- **La regla dura vive en un solo lugar** (`conflicts.aplicarRemoto`): el pull
  incremental y el realtime pasan los dos por ahí.
- **`activities` y `touchpoints` se indexan por `uid`**, no por el id del
  servidor: la fila creada offline y la confirmada por Postgres son UNA sola.
- **23505 (UNIQUE del client_uuid) se clasifica como ÉXITO**: es el reintento
  haciendo su trabajo.
- El persister del cache es Dexie, no localStorage.
- **Ningún componente importa `supabase` directamente** — tampoco para entrar:
  el login pasa por `src/data/auth.ts`.

### 2.5 · `src/screens` — las 15 pantallas, ya no son placeholders

| Ruta | Pantalla | Estado |
|---|---|---|
| `/` | **Hoje** | 3 tarjetas del día CONGELADAS al primer render, swipe Feito/Adiar con undo de 5s, anillos, racha, corrente do time |
| `/carteira` | **Carteira** | 6 tiles de visión, lista virtualizada sin queries por fila, swipe Registrar/Adiar, pool sem dono |
| `/carteira/:id` | **Dossiê** | UNA lectura de Dexie: hexágono PPVVCC, gate, stakeholders, timeline, compromissos, editor de escala con regra da prova, coaching |
| `/golden` | **Golden Hour** | Modo foco sin chrome, fila congelada, 4 acciones por contacto, wake lock, notas de voz, cierre con debrief y sello |
| `/registrar` | **Registrar** | Hold-to-talk, MediaRecorder con negociación de mime, gate de próxima acción, Ventus sugere por escala |
| `/revisao` | **Revisão** | Bandeja del Ventus con aceptación **por campo**, descarte con motivo, registros sueltos, mapa |
| `/cadencia` | **Cadência** | Fila de los 7 toques, sheet de lead en 3 modos, kanban en md+ |
| `/placar` | **Placar** | Eu vs eu, carriles sin ranking, troféus con revelación de viernes, opt-out real |
| `/rituais` | **Rituais** | Manhã / noite / segunda / sexta, ventanas que orientan y nunca bloquean |
| `/ventus` | **Ventus** | Chat con motor determinístico primero, SSE con timeout de inactividad, preview antes de ejecutar |
| `/gestor` | **Painel do Gestor** | Las 6 carteras, coaching por persona, cola de calibración |
| `/ajustes` | **Ajustes** | Cookbook, Golden Hour, Telegram, avisos, juego, sync, aparelho |
| `/mais` | **Mais** | El menú de todo lo que no entra en la bottom nav |
| `/instalar` | **Instalar** | PWA/APK con QR propio, pasos en SVG inline |
| `/login` | **Login** | Errores traducidos que dicen qué campo marcar |
| `/kitchen` | Kitchen Sink | Vitrine del design system (no linkeada desde la app) |

### 2.6 · `api/` — backend serverless

`/api/plan`, `/api/ingest`, `/api/ventus` (SSE), `/api/ventus/feedback`,
`/api/act`, `/api/health`. 147 tests con un doble del cliente de Supabase.

- Auth **fail-closed** con verificación local de firma: JWKS asimétrico
  (ES256/RS256/EdDSA) y el HS256 legado. El algoritmo se decide por el **tipo de
  clave**, nunca por el header: `alg: none` y el HS256-firmado-con-la-pública
  quedan cortados.
- La autorización por cartera se revalida **en TypeScript**: el backend habla
  como `service_role`, para el que `ventus_autorizado()` devuelve siempre true.
  Si no se comprueba ahí, no se comprueba en ningún lado.
- Una sola constante de modelos y precios; cache breakpoint sólo en el bloque 0
  del system prompt, con tests que fijan que ese prefijo no contiene fechas,
  horas ni uuids (el fallo que no da error y deja `cache_read` en cero para
  siempre).
- `/api/plan` **no usa el modelo para priorizar**: corre `rankDay()` (cero
  tokens) y sólo redacta la narrativa si se pide.
- `/api/ingest` matchea contra la cartera **leída del servidor**, no contra la
  que manda el cliente, y capa la confianza en 0,40 si la cita no aparece
  textualmente en la transcripción.

---

## 3 · Qué arregló esta integración

Los nueve agentes entregaron en verde por separado. Lo que sigue son defectos y
huecos que **solo aparecen al juntarlos**.

### 3.1 · Duplicación eliminada

- **`useVendorDaSessao` existía TRES veces**, byte por byte idéntica
  (`Dossie/`, `GoldenHour/`, `Ventus/sessao.ts`), y una cuarta pantalla la
  importaba cruzando carpetas (`Revisao` → `../Ventus/sessao`). Ahora vive en
  `src/app/useVendorDaSessao.ts` y la usan las cinco. Es la lectura tolerante
  del vendedor: `useSession()` lanza fuera del `SessionProvider` —y está bien
  que lo haga— pero varias pantallas se montan sin él (el smoke test del router,
  el Mini App de Telegram antes de que resuelva la sesión) y ahí lo correcto es
  pintar el esqueleto, no reventar contra el `errorElement`.
- **`useDitado`** (dictado con Web Speech, 140 líneas) vivía en `Dossie/` y el
  compositor del Ventus lo importaba por ruta cruzada. Subió a `src/ui`.
- **`useAlturaDoTeclado`** (`visualViewport`) vivía en `Registrar/`. Subió a
  `src/ui`: lo va a necesitar el `Sheet` con inputs, que es el TODO 20.
- **La bandera de mock estaba escrita dos veces** con otro nombre de variable
  (`Registrar/contrato.ts` y `Ventus/contrato.ts`): misma mecánica env →
  fallback → localStorage. Ahora es `criarBandeiraDeMock()` en
  `src/lib/mock-flag.ts`. **El estado no se comparte**: que `/api/ingest` esté
  caído no vuelve mock al chat, son dos backends distintos. De paso se
  declararon `VITE_INGEST_MOCK` y `VITE_VENTUS_MOCK` en `vite-env.d.ts`, con lo
  que desaparecen los dos `import.meta.env as unknown as Record<…>`.
- **Lo que NO se unificó, a propósito**: los dos `SheetAdiar` (Hoje y Carteira)
  se parecen pero escriben cosas distintas —uno crea una `task` con fecha, el
  otro pone `next_action_date` sobre la oportunidad— y operan sobre entidades
  distintas. Fundirlos daría una unión de props peor que las dos versiones.
  Los dos `Secao` tampoco: uno es el acordeón del Dossiê con pliegue recordado,
  el otro es un encabezado de lista en Ajustes.

### 3.2 · Contratos entre pantallas, cableados

Tres agentes dejaron pedidos explícitos al integrador. Los cuatro están hechos:

- **Tres pantallas navegaban a `/registrar` de tres maneras distintas** y
  Registrar sólo entendía una: Carteira mandaba `?opportunityId=46`, Dossiê
  `?oportunidade=46` y Hoje `state: { acao, origem: 'hoje' }`. Registrar ahora
  acepta las tres en un solo lugar (alias en PT-BR incluidos) y, cuando viene de
  una tarjeta del día, repite en pantalla **qué** iba a hacer, para que no tenga
  que recordarlo mientras habla.
- **`PainelCoaching` estaba escrito pero no montado.** Ahora es la sección
  «Ventus sugere» del Dossiê, justo debajo de «O que trava o avanço»: el orden
  en que se lee la ficha es qué falta → qué hacer. El diagnóstico es
  determinístico y sale de `@/core`, así que no puede contradecir al hexágono
  dos bloques más arriba.
- **El morph Carteira → Dossiê no existía.** El Dossiê ya declaraba
  `viewTransitionName('opp', id)` en su header y nadie lo emparejaba. La fila de
  la Carteira ahora entrega su propio nodo y navega con `morphTransition()`.
  Donde no haya View Transitions —o con `prefers-reduced-motion`— degrada a
  cross-fade.
- **El FAB de micrófono tapaba el botón «Confirmar» de Registrar.** Se esconde
  en `/registrar` (un botón que navega a donde ya estás no es un botón) y su
  altura ahora depende de si la barra de comando del Ventus está visible, en vez
  de flotar 4rem por encima de una franja vacía. La lista de rutas sin barra
  dejó de estar duplicada: vive en `src/screens/Ventus/rotas.ts`.
- **La racha nunca se iba a mover.** `selarDiaDeHoraCheia()` estaba expuesta
  para que el cierre de la Golden Hour la llamara, y nadie la llamaba: la Golden
  Hour ocurría y la tela Hoje seguía diciendo «Sua sequência começa hoje». Ahora
  el sello se escribe al cerrar una Hora Cheia, en el mismo `meta` que lee
  `fetchSequencia()`.

### 3.3 · Code splitting por ruta

El bundle estaba en **1.387 kB sin comprimir (412 kB gzip) en un solo chunk**.
Ahora:

- 14 pantallas son `lazy()`; **Hoje y Login quedan eager** a propósito (la ruta
  índice partida sería un waterfall en el arranque, y pedir un chunk para poder
  decir «entre de novo» es la peor red en el peor momento).
- Entrada: **347 kB (112 kB gzip)**. Camino crítico completo (entrada + los tres
  chunks precargados: design system, contexto/router/query, supabase-js) ≈
  1.062 kB / 330 kB gzip. Cada pantalla pesa entre 6 y 48 kB.
- **Los chunks entran en el precache del service worker** (53 entradas,
  1.450 KiB): después de la primera visita la app sigue navegable entera en modo
  avión, que es innegociable para la Golden Hour.
- El fallback de cada ruta **no es un spinner**: es la silueta de esa pantalla
  (`Skeleton` con su variante), la misma que usa después mientras cargan los
  datos, así que el paso de «bajando código» a «bajando datos» no se ve.
- Los componentes diferidos viven en `src/app/telas.tsx` y no en `routes.tsx`:
  un archivo que exporta componentes **y** una constante pierde el fast refresh,
  y perderlo en el archivo de rutas es perderlo en toda la app.
- **El smoke test se adaptó, no se debilitó**: `montar()` pasó a ser asíncrono y
  espera a que el chunk baje antes de mirar el HTML. Se agregó una aserción
  nueva —`expect(html).not.toContain('data-rota-carregando')`— justamente para
  que el test no pueda pasar mirando el esqueleto. Si el chunk no resuelve, el
  test falla.

### 3.4 · De la ola anterior (sigue vigente)

- El contrato RPC estaba roto entero: PostgREST resuelve por **conjunto exacto
  de nombres de argumento**, y `transport.ts` inyectaba `p_idempotency_key` en
  toda llamada. Arreglado y blindado con `contrato-rpc.test.ts`, que lee las
  migraciones reales y compara argumento por argumento.
- `src/data` era código muerto: `App.tsx` creaba su propio `QueryClient` sin
  persister, sin outbox, sin sync. Hoy la composición es
  `ThemeProvider → PersistQueryClientProvider → SessionProvider → CamadaDeDados
  → RouterProvider`, con los mutation defaults registrados **antes** de hidratar
  el cache.
- Tipos duplicados unificados (`RevisaoItem`, `IsoDate`, los dos formateadores
  de R$ que producían bytes distintos). Los tres barriles (`@/core`, `@/data`,
  `@/ui`) **no comparten ni un nombre**; se volvió a verificar en esta ola,
  también dentro de `src/data` (17 módulos, cero colisiones de export).

---

## 4 · Qué es andamio (dicho, no escondido)

Nada de esto está roto: está declarado. La regla que se respetó en toda la app
es que **un andamio siempre se anuncia en pantalla**, en PT-BR y sin fingir.

- **`/api/ventus` y `/api/ingest` existen pero no están desplegados.** El chat y
  el registro caen a un mock ante 404/501, lo dicen con un cartel («Modo
  simulado», «as respostas abaixo são simuladas») y el mock emite streaming real
  con pausas reales — uno que devolviera todo junto no probaría lo único que hay
  que probar.
- **`rings` no la escribe nadie.** El avanço de los compañeros —Corrente do time
  en Hoje, carriles del Placar— sale del snapshot de esa tabla. Sin snapshot se
  dibuja el anillo vacío con «sem dados», **nunca un 0**: un 0 inventado es una
  acusación.
- **Los troféus oficiales esperan al cron `weekly-awards`.** Mientras tanto se
  muestra una prévia marcada como tal, calculada con los proxies de
  `weeklyTrophies()` (Zelador mide conversas, Reanimador mide contatos) porque
  `DailyScore` no trae compromisos vencidos ni cuentas reactivadas.
- **Kudos, high-five y «Here Now» no persisten.** Las tablas existen (`0004`)
  pero falta la mutación y el realtime; hoy la celebración es local (haptic +
  toast + confetti) y está marcada con `TODO(F4)`.
- **El historial de escalas y las perguntas SPIN usadas viven en `meta`**, no en
  `scale_evidence`. Cuando esa tabla entre al sync se cambia la fuente en
  `src/data/dossie.ts` y la pantalla no se entera. (`scale_evidence` ya existe:
  tiene 0 filas.)
- **`temProva()` del Gestor es un proxy**: cuenta como artefacto un registro
  `ai_parsed` o una descripción ≥120 caracteres. La UI dice «declarado» y no
  «provado» a propósito.
- **`ventus_actions` no participa del pull ni del realtime**: la bandeja se
  actualiza al abrir la pantalla o al volver la app al frente.
- **El health verificado va a dar 0,0 en todas las oportunidades.** No es un bug:
  el v2 nunca escribió `evidence_at` en el jsonb. Es el número honesto, y es la
  razón de ser de M6.
- **La transcripción posterior no existe todavía**: los blobs quedan en
  `audioBlobs` con estado `gravado` y la cola los ve, pero falta el pipeline
  `MediaRecorder → Whisper → registrarAtividade` (TODO 12).
- `/kitchen` no está linkeada desde ninguna pantalla: se entra a mano.

---

## 5 · TODOs consolidados (los 9 agentes + el integrador)

Orden aproximado de dependencia. Lo que bloquea a otra cosa va primero.

### 5.1 · Base de datos y despliegue

1. **Aplicar `0100_seguranca_PENDENTE_APROVACAO.sql`** (requiere aprobación
   humana). Antes: correr su sección A completa, sobre todo **A5** — comprobar
   si algún camino del v2 lee `opportunities`/`leads`/`touchpoints` con la anon
   key **sin sesión**. Recomendado: primero en un branch de Supabase.
   *Esto destraba el botón «Puxar do mapa de mercado»*: `market_sweep` tiene RLS
   ON y **cero policies**, así que hoy devuelve 0 filas con el JWT de un
   vendedor aunque haya 174 empresas asignadas sin lead. La pantalla ya
   distingue ese caso y lo explica; no hace falta tocar código al liberarlo.
2. **Desplegar `/api/ventus` e `/api/ingest`.** Los contratos son
   `src/screens/Ventus/contrato.ts` y `src/screens/Registrar/contrato.ts`. El
   servidor **tiene que** emitir `abertura` inmediato y `ping` cada 15s o el
   timeout de inactividad de 25s lo corta (los proxies móviles brasileños cortan
   conexiones ociosas a los 30-60s).
3. **Edge Function `pairing-code`**: no existe. `pairing_codes` tiene
   `revoke all … from anon, authenticated` a propósito, así que el código de 6
   dígitos **tiene** que emitirlo el servidor con `service_role`. Hasta
   entonces, Ajustes → Telegram muestra un error claro en PT-BR.
4. **Ampliar `ventus_commit_action`**: hoy despacha 5 tipos y los otros 4
   (`registrar_atividade`, `converter_lead`, `arquivar_lead`,
   `marcar_commitment`) caen en el `else` con «Tipo de ação desconhecido»
   (22023). El backend los ejecuta en TS con staleness manual, que **no** es
   transaccional con la escritura.
5. **Discrepancia de contrato a resolver**: `0009_rpcs.sql` usa el literal
   `promover_lead` y `VentusActionKind` en `src/core/types.ts` lo llama
   `promover_do_sweep`. El cliente acepta los dos y normaliza (`ALIAS_TIPO`, con
   test), pero hay que elegir uno en la base. Recomendación: alinear el SQL con
   core.
6. `ventus_actions.entity_kind` no admite `'commitment'` en el CHECK y
   `ventus_precondition_hash` no sabe hashear un compromiso: esas propuestas van
   **sin staleness check**.
7. Habilitar `supabase_realtime` tabla por tabla con `REPLICA IDENTITY`. Hoy la
   publicación tiene **cero** tablas: `realtime.ts` se suscribe y no le llega
   nada (sin romper), y de eso dependen «Here Now» y el high-five.
8. Jobs de `pg_cron` del v3 (dispatch, golden-queue, close-day, settle-points,
   weekly-awards, risk-scan, audit-flags, purgas). Necesitan URL del proyecto y
   `service_role` key en el `net.http_post`: son secretos y no van versionados.
9. Backfill inicial: `notification_prefs`, `streaks` y cookbook por vendedor, y
   promover las ~174 empresas del mapa sin lead vía `promote_sweep_to_lead()`.
10. Ampliar `touchpoints_channel_check` a `meeting|visit|event|referral`. Hoy
    registrar un toque como `meeting`/`visit` desde Cadência o Registrar no es
    posible (entra como `phone`).
11. Indexar las 24 FK sin índice de las tablas nuevas **cuando se sepa qué
    consultas corren de verdad**, no ahora: están todas vacías y son INFO del
    advisor.
12. Definir el destino de `VITE_APK_URL`: hoy cae a `/ventus.apk`, que no
    existe (`android/` está vacío).

### 5.2 · Producto

13. **Pipeline de voz completo**: `MediaRecorder` → Whisper →
    `registrarAtividade`. La captura y el almacenamiento ya están; falta el
    tramo de transcripción posterior, que la pantalla ya promete.
14. **Anuncio en Telegram** al agendar una reunión y al revelar un troféu (M11 /
    §7 del plano): la celebración local existe (<1s), el mensaje al canal
    depende del dispatcher de `notification_queue` y del bot.
15. `/api/telegram` sigue en 501, y `requestFullscreen()` del Mini App tampoco
    está: la pantalla ya es full-bleed en la PWA, falta el puente.
16. `fonte: 'foto'` en `/api/ingest` devuelve 501 explícito: falta el camino de
    visión.
17. **Shadow mode**: el plano pide 2 semanas con `status='shadow'` antes de
    mostrar Pontos de Avanço. Hoy se muestran desde el primer día.
18. Precache nocturno del «modo viagem», disparado en foreground a las 21h
    porque iOS no tiene Periodic Sync.
19. `POST /api/ventus/feedback` no existe: el voto 👍/👎 se guarda en el
    historial local (no se pierde) pero no llega a ninguna tabla. Falta decidir
    dónde vive.

### 5.3 · Rendimiento y plataforma

20. **Barra de acción levantada con `visualViewport` dentro del `Sheet`** (M22).
    `useAlturaDoTeclado` ya está en `src/ui` esperando: el teclado de Android
    tapa los inputs del editor de escala del Dossiê y del «Converter» de
    Cadência.
21. **Diferir `supabase-js` del arranque** (209 kB del camino crítico). Hoy no
    se puede sin más: `SessionProvider` llama a `auth.getSession()` al montar
    para decidir login vs shell. Requiere una ruta de arranque que lea la sesión
    de Dexie primero y cargue el cliente después.
22. Un `SearchField` en `src/ui`: la Carteira usa un `<input type="search">` a
    mano porque `TextField` no tiene botón de limpiar ni ícono a la izquierda.
    Si aparece un tercer buscador, la primitiva se vuelve obligatoria.
23. El Painel do Gestor agrega en el cliente (5 consultas en paralelo). Con 65
    oportunidades el payload es de kilobytes; cuando la base crezca conviene una
    vista `v_painel_do_gestor`. `montarPainel()` es pura, así que mover la
    agregación al servidor no toca la pantalla.

### 5.4 · Dominio y gamificación

24. Reemplazar los proxies de `weeklyTrophies()` y `derivarEventos()` por
    `scoring_events` y compromisos agregados por semana (F7). Cuando exista
    `points_ledger`, `fetchPlacarSemana` debería leer de ahí en vez de derivar.
25. `METHODOLOGY_ACTIVITIES` son 32 hitos redactados a partir del PPVVCC y del
    negocio. Conviene que Jordi/Tomás los revisen **antes** de que empiecen a
    escribirse.
26. `detectScaleRegression()` devuelve `opportunityId: 0` (firma del stub
    inglés). La versión útil es `regraRegressaoDeEscala(opp, anterior)`.
27. `risk.ts` no lee `scale_evidence` todavía: detecta la etapa arrastrada, no
    el caso «la etapa está bien pero las escalas que la habilitan no tienen
    prueba».
28. La media de entregas por día mide **registros**, no tarjetas resueltas: el
    estado del día se poda y no hay histórico de resoluciones.

### 5.5 · Calidad

29. **Sin tests de interacción (Playwright).** El plano pide 3 flujos: Golden
    Hour completa, registro por voz offline→sync, avance de etapa con gate. Los
    gestos —swipe, drag del Sheet, hold-to-talk, kanban en md+— sólo se validan
    de verdad en dispositivo real. Es el hueco más grande que queda.
30. **Calibrar los umbrales de gesto con los 4 vendedores en teléfono real**
    antes de congelarlos: swipe 96px, pull 72px, velocidad de cierre
    0,55 px/ms. Hoy están puestos a ojo.
31. Test de dos dispositivos editando escalas distintas offline contra la base
    real (ya se puede: `0010` está aplicada).
32. Verificar contraste AA de la paleta oscura sobre los tonos `-soft` (sobre
    todo `warn-soft-fg` y `accent-soft-fg`) con herramienta, no a ojo.
33. Falta la variante `'gestor'` de `Skeleton` (las de `revisao`, `placar` y
    `rituais` ya están).
34. Calibrar los techos de gasto de `LIMITES` en `api/_lib/usage.ts` (5 USD/día
    por vendedor en el chat, 4 en ingest) con los datos reales de `ventus_audit`
    después de una semana. Hoy están puestos a ojo sobre el uso del bot.
35. Medir el p95 de 45s del camino feliz de Registrar con audios reales. El
    cliente ya instrumenta `IngestResponse.duracaoMs`, pero no hay tabla ni
    evento de telemetría donde dejarlo.
36. `useDiaVigente()` hace rollover de medianoche cada 60s y no está cubierto
    por test (necesitaría fake timers sobre el huso de SP).
37. Corriendo la suite completa aparece un unhandled rejection
    (`window is not defined`) originado en `src/app/__tests__/boot.test.tsx`: es
    una carrera de teardown de `PersistQueryClientProvider` entre archivos. No
    hace fallar nada y ese test corrido solo pasa limpio, pero conviene cerrarlo.

---

## 6 · Cosas que es fácil romper sin darse cuenta

- **No mandes un argumento de más a una RPC.** PostgREST resuelve por conjunto
  exacto de nombres. `contrato-rpc.test.ts` te avisa.
- **No registres los mutation defaults después de hidratar el cache.** Las
  mutaciones pausadas se restauran sin `mutationFn` y no se reanudan nunca.
- **No hagas `UPDATE` del jsonb `scales` entero.** Pisa las otras cinco escalas.
  Para eso está `atualizar_escala()`.
- **No uses `opportunities.last_update` para medir silencio.** Se pisa con
  cualquier edición y por eso miente sistemáticamente en el v2.
- **No cuelgues una query key de una raíz nueva.** `conectarCacheAoSync`
  invalida por raíz (`plano`, `carteira`, `dossie`, `cadencia`, `golden`,
  `rings`, `placar`): una raíz propia queda fuera del sync y muestra datos
  viejos para siempre.
- **No inventes un 0 por un dato que no tenés.** Del compañero sin snapshot se
  dice «sem dados». Un 0 fabricado acusa a alguien de no trabajar cuando lo
  único que pasó es que su teléfono no sincronizó.
- **No dejes una salida sin fecha.** Adiar crea una tarefa **con** fecha; no hay
  «dismiss» en ninguna pantalla. Así es exactamente como el v2 llegó a tener 36
  de 40 oportunidades vivas sin próxima acción.
- **No cuentes trabajo interno como contacto.** Evidência/tarefa/compromisso
  entran como `note`, y `note` está excluida del anillo de Conversa: inflar el
  anillo es la primera forma de corromper el dato.
- **No definas un color solo dentro de un media query.** La paleta entera vive
  en `:root` y se redefine entera en `.dark`.
- **No agregues aritmética de fechas fuera de `core/dates.ts`.** Ya pasó una vez
  y quedaron dos husos de São Paulo conviviendo.
- **No exportes un componente y una constante del mismo archivo.** Se pierde el
  fast refresh. Por eso existen `aparencia.ts`, `visoes.ts`, `rotas.ts` y
  `telas.tsx`.
- **No escondas que algo es un mock.** La bandera de `@/lib/mock-flag` existe
  para que la UI pueda decir «Modo simulado»; usarla para lo contrario rompe el
  trato con el vendedor.
