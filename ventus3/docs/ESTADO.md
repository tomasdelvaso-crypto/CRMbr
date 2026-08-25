# Estado do Ventus v3

> Fecha de corte: **2026-08-25** · Rama `claude/crm-web-app-redesign-f7tu7g`
> Documento del integrador. Consolida **tres olas** de trabajo paralelo: la de
> fundación (dominio, design system, SQL, capa offline), la de nueve agentes
> que construyeron las 15 pantallas y el backend serverless, y la última —cinco
> agentes— que agregó el Telegram Mini App, el Web Push, la identidad
> instalable, el APK de Android y la suite de Playwright, y aplicó la migración
> de seguridad.
>
> El plan completo está en `PLANO.md`; la auditoría que lo originó, en
> `AUDITORIA.md`; los pasos exactos para producción, en `DEPLOY.md`. Este
> archivo no los reemplaza: dice en qué punto estamos.

---

## 0 · Lo que bloquea el despliegue (leer esto primero)

Tres cosas, en orden. Nada más de esta lista impide subir el resto.

1. **`/api/telegram` es un stub que devuelve 501.** La biblioteca completa del
   bot v3 existe y está testeada —`api/telegram/_lib/`, 3.653 líneas: comandos,
   callbacks con fingerprint, sesiones con TTL, identidad, extracción, fila
   idempotente (`reivindicarUpdate`)— pero **falta el handler que rutea los
   updates**. Lo que el plano pide de él está escrito (§532-545 de `PLANO.md`):
   ack <1s, claim antes de procesar, reintento por la cola. Mientras no exista:
   registrar el webhook **apaga el bot v1 y no enciende el v3** (un token de
   Telegram tiene un solo webhook), y el emparejamiento por `/vincular` no
   funciona, así que al Mini App sólo entran los 3 vendedores que ya tienen
   `vendors.telegram_id` cargado a mano.
2. **La Edge Function `pairing-code` no existe.** `pairing_codes` tiene
   `revoke all … from anon, authenticated` a propósito: el código de 6 dígitos
   **tiene** que emitirlo el servidor con `service_role`. Sin ella no hay forma
   de emparejar un Telegram nuevo, ni por el bot ni por Ajustes.
3. **`supabase/migrations/0012_cron.sql` está escrita pero NO aplicada.** Es a
   propósito: agendar los jobs antes de que el deploy responda son diez
   llamadas por minuto a un 404. Se aplica después del paso 2 de `DEPLOY.md`, y
   antes hay que grabar los dos secretos en el Vault.

Lo que **sí** está listo para subir hoy: la app entera con sus 15 pantallas, la
PWA instalable, el Web Push, el dispatcher de avisos, los seis endpoints de
`api/` que no son el bot, y el APK (que se compila en GitHub Actions, no acá).

---

## 1 · Verificación (salidas reales, no promesas)

```
$ npm install
up to date, audited 543 packages in 879ms · found 0 vulnerabilities

$ npm run type-check
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json
EXIT=0   (los 3 proyectos: app, node/api, service worker)

$ npx vitest run
 Test Files  40 passed (40)
      Tests  781 passed (781)
   Duration  8.83s
EXIT=0        ← 636 en la ola 2 · 777 al cerrar la ola 3 · +4 del integrador

$ npx eslint . --max-warnings 0
(sin salida: 0 errores, 0 warnings)
EXIT=0

$ npm run build
✓ 2546 modules transformed
dist/assets/index-*.css       64,59 kB │ gzip: 13,05 kB
dist/assets/index-*.js       290,35 kB │ gzip: 92,56 kB   ← entrada
dist/assets/ui-*.js          274,65 kB │ gzip: 89,47 kB   ┐
dist/assets/session-*.js     232,16 kB │ gzip: 74,12 kB   ├ compartidos, precargados
dist/assets/supabase-*.js    209,54 kB │ gzip: 54,44 kB   ┘
dist/assets/chunk-*.js        90,70 kB │ gzip: 30,01 kB   ← react-router, compartido
… + 17 chunks por ruta (Registrar 48 kB … Mais 6 kB) + 20 de íconos
dist/sw.mjs                   23,81 kB │ gzip:  8,62 kB
precache 64 entries (1.563,82 KiB)
EXIT=0

$ node scripts/verificar-pwa.mjs
53 ok · 0 avisos · 0 errores
Instalable. ✓
EXIT=0

$ npx playwright test        (de la ola 3, no se volvió a correr en esta pasada)
 93 tests · 87 passed · 6 skipped (capturas.spec.ts, sólo con CAPTURAS=1)

$ git status --porcelain -- src api     # el CRM v2 en producción, desde la raíz
(sin salida: NO se tocó)
```

**Las 15 rutas responden y montan**, verificado por
`src/app/__tests__/routes.test.tsx`, que monta **cada ruta de verdad con
React**, espera a que baje su chunk y falla si la pantalla explota o si el
Suspense se queda colgado. A eso se le sumó, en la ola 3, una suite de
Playwright de 87 pruebas sobre tres dispositivos (iPhone 14, Pixel 7, desktop)
que ejercita los gestos como gestos —el swipe es `pointerdown` + doce
movimientos + `pointerup`, no un `dragTo`— y el micrófono con
`--use-fake-device-for-media-stream`, o sea recorriendo `getUserMedia` y
`MediaRecorder` de producción.

El arranque en frío con la cartera ya en el aparato, medido contra el **build**
(`node scripts/medir-arranque.mjs`, no contra el dev server): **mediana 93 ms**
hasta las tres tarjetas pintadas, peor caso 109 ms. El objetivo de <100 ms se
cumple.

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

`0100_seguranca_...sql` **ya se aplicó** (2026-08-25 19:01 UTC = 16:01 BRT,
version `20260825190039`). Lo que cambió, medido antes y después:

- **`anon` perdió todo**: `revoke all privileges on all tables/sequences in
  schema public`. Antes tenía SELECT/INSERT/UPDATE/**DELETE** en 15 tablas y
  vistas, y sin login veía las 65 oportunidades y los R$ 2.023.609 de pipeline.
  Hoy: `ERROR 42501 permission denied` en cada una, y `grants de anon = 0`.
- **Las 5 vistas pasaron a `security_invoker`**, así que cada vendedor ve la
  suya. Los 5 ERROR del advisor desaparecieron: **0 ERROR** ahora.
- **Nadie perdió una fila**: las lecturas por persona coinciden 1:1 con el
  baseline (Victor Hugo 25 opps, Renata 19, Andre 9, los admins 65).
- Los 12 caminos de escritura reales del v2 se re-ejercitaron con los `auth_id`
  reales dentro de una transacción abortada: los dos botones «Excluir» —el de
  oportunidad y el de touchpoint— siguen funcionando **para el dueño**, que es
  lo que el v2 espera y lo que el borrador original de la migración habría
  roto en silencio.

El bloque **D2** del propio archivo recrea las 23 policies anteriores si hace
falta volver atrás. Lo que **no** se pudo hacer desde este entorno: un login
humano de verdad en el v2 (el egress bloquea `wtrbvgqxgcfjacqcndmb.supabase.co`
con `CONNECT 403`), así que la prueba es a nivel de rol y JWT, no de navegador.

`supabase/migrations/0012_cron.sql` está **escrita y sin aplicar**: son los diez
jobs de `pg_cron` + `pg_net` del v3 (el archivo que `api/dispatch/jobs.ts` y
`run.ts` venían citando y que no existía). Se aplica después del deploy — ver
`DEPLOY.md` §5.

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

### 2.7 · Las capas de la ola 3 — host, push, instalación, Android, QA

Cuatro directorios nuevos y una suite. Ninguno toca el dominio: son la piel que
convierte la app en algo que se instala, avisa y vive dentro de Telegram.

**`src/host/` — el adaptador de anfitrión.** La app corre en dos superficies
—navegador/PWA y Telegram Mini App— y **ninguna pantalla pregunta en cuál
está**. El contrato es un booleano:
`const nativo = useBotaoPrimario({rotulo, aoTocar})` y después
`{!nativo && <Button…>}`. El adaptador abstrae exactamente cinco cosas (auth,
botón primario, back, haptics, notificaciones); tema, safe areas, fullscreen,
CloudStorage, atajo a la pantalla de inicio y deep links quedaron **fuera** de
la interfaz, como módulos aparte que en web no hacen nada.

- `HostProvider` va **por fuera del router** y no monta a sus hijos hasta
  resolver la entrada: si el router montara antes, la guardia del Shell mandaría
  a `/login` —la única pantalla que el Mini App existe para no mostrar—.
- El deep link se resuelve en `src/host/arranque.ts`, importado en la **primera
  línea** de `main.tsx`, porque `createBrowserRouter` lee `window.location` al
  evaluarse. Con `replaceState`, no `pushState`: el back del Mini App tiene que
  cerrarlo.
- Los 14 theme params de Telegram se vuelcan sobre los tokens del design
  system, pero **los colores semánticos de negocio no se tocan nunca**: el verde
  del anillo de Avanço significa algo y no puede depender del tema de nadie.

**`api/_lib/tma.ts` + `api/tma-auth.ts` — la puerta del Mini App.** Valida el
`initData` con HMAC contra el token del bot, con TTL de **una hora** (el hash no
vence solo: quien mira el reloj es `auth_date`), fail-closed con un mensaje
único en PT-BR —el motivo sólo va al log—, y emite sesión por dos caminos:
`admin.generateLink` → `hashed_token` que el cliente canjea con `verifyOtp()` y
produce una sesión real de GoTrue **con refresh token**; y, de respaldo, un JWT
HS256 de una hora sin refresh. La identidad sale de `canalDoTelegram()`, la
**misma** función del bot: si el emparejamiento se revoca, se revoca en las dos
superficies. 21 tests sobre la validación pura, que es donde está la seguridad.

**`src/push/` + `src/sw-push.ts` — Web Push.** `soporteDeNotificacoes()` no
devuelve un booleano sino el mapa del aparato (push, badge, backgroundSync,
periodicSync, precisaInstalar, permiso) más un `resumo` en PT-BR: Android e
iPhone no son «casi iguales» y una pantalla que los trata igual miente en la
mitad de los casos. `assinarPush()` comprueba soporte, instalación y clave VAPID
**antes** de pedir el permiso —el navegador da una sola pregunta— y se
desuscribe primero si la clave rotó, porque con otra `applicationServerKey`
`subscribe()` tira `InvalidStateError` y el aparato queda sin push para siempre.
La medición del aviso **no la hace el service worker**: marcar `agido_em`
necesita el JWT y el SW no tiene sesión (ni debe: sobrevive al logout).

**`src/install/` — «esto es una app».** El manifest completo (íconos `any` y
`maskable` en **archivos distintos**, 3 atajos, share_target POST), la
invitación de instalación por plataforma y la actualización sin recargas
sorpresa. La decisión de producto no es el diálogo sino **el momento**:
`beforeinstallprompt` se consume una vez y Chrome castiga el rechazo dejando de
emitirlo por meses, así que la invitación espera 3ª sesión + 90 s adentro, calla
7 días tras cada «agora não», deja de preguntar a la tercera negativa y no
aparece nunca en `/golden`, `/registrar`, `/login` ni `/instalar`. Todo eso es
lógica pura con 26 tests. El evento se captura en un **singleton de módulo**, no
en un `useEffect`: Chrome lo dispara antes de que React monte y el síntoma del
error es «en mi teléfono el botón está gris».

**El service worker es uno solo, con un listener por evento.** `src/sw.ts`
maneja `message` (SKIP_WAITING) y `sync` (outbox); `src/sw-push.ts` maneja
`push`, `notificationclick`, `notificationclose` y `pushsubscriptionchange`.
`sw.ts` lo toma con un único `import './sw-push'`. No se solapan, y el
passthrough de `/api` y `*.supabase.co` está declarado **explícitamente** aunque
Workbox ya deje pasar lo que no matchea: es lo que impide que un `registerRoute`
futuro con matcher generoso se coma la API y que nadie lo note hasta que alguien
vea un valor de ayer.

**`android/` — la TWA.** Keystore PKCS12 RSA 4096 válido hasta 2056,
`twa-manifest.json` como template parametrizable por URL,
`scripts/build-apk.sh`, `scripts/gerar-assetlinks.mjs` (que lee el packageId del
manifest en vez de hardcodearlo) y el workflow `.github/workflows/apk.yml`, que
corre `--check` del assetlinks **antes** de compilar: si el keystore del secret
no coincide con el fingerprint publicado, el build falla ahí y no distribuye un
APK que nacería con la barra de Chrome adentro. El APK **no se pudo compilar en
este contenedor**: `dl.google.com` está bloqueado por política de egress
(`Host not in allowlist`), así que el SDK de Android no baja. El pipeline sí se
probó hasta el último paso posible — `bubblewrap update` generó el proyecto
Android completo con EXIT=0.

**`e2e/` — Playwright.** 87 pruebas verdes sobre tres dispositivos, con dos
candados independientes para que **nunca** toquen producción: el dev server
arranca con `VITE_SUPABASE_URL=https://stub.supabase.test` (un host que no
existe, así que la URL real ni entra al bundle) y el fixture aborta cualquier
pedido a `*.supabase.co`. Los datos se siembran en Dexie con **el mismo módulo
que usa la app**, no con un mock de la capa de datos.

---

## 3 · Qué arreglaron las integraciones

Cada agente entrega en verde por separado. Lo que sigue son defectos y huecos
que **solo aparecen al juntarlos**. Las secciones 3.1 a 3.4 son de la ola 2 y
siguen vigentes; la 3.5 es de esta pasada.

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

### 3.5 · Ola 3 — lo que el integrador cerró al juntar las cinco entregas

Los cinco agentes entregaron en verde. Estos son los huecos del empalme:

- **Tres `estaInstalado()` distintos** en el árbol, y ninguno de los dos de la
  app miraba la TWA ni el Mini App —justo lo que su propio comentario
  prometía—. Queda **uno solo**, el de `@/install/deteccao`, del que ahora
  cuelgan `@/push` y la pantalla `/instalar`. Se importa el módulo suelto y no
  el barril `@/install`, que arrastra `<CamadaPWA/>` al camino crítico.
- **Colisión latente de nombres entre barriles.** `@/host` y `@/install`
  exportaban los dos un `registrarSessao` con firmas distintas (uno cuenta
  sesiones para ofrecer el atajo de Telegram, el otro para el convite de
  instalación). Nadie los importaba juntos todavía, y el día que pasara habría
  sido un error de compilación en el peor momento. `@/host` lo saca ahora como
  `registrarSessaoDoAtalho`.
- **`/instalar` capturaba `beforeinstallprompt` en un `useEffect`**, o sea
  llegaba tarde: en la mayoría de los teléfonos el evento ya pasó cuando la
  pantalla monta y el botón quedaba gris. Ahora lee el singleton de
  `@/install/prompt-android` con `useSyncExternalStore` —un `useState` se
  quedaría con la foto del primer render.
- **El share_target no lo consumía nadie.** El manifest declara un POST contra
  `/registrar`, el service worker lo guarda en Cache Storage y redirige con
  `?compartilhado=<id>`… y la pantalla ignoraba el parámetro. Ahora
  `RegistrarScreen` lo consume una sola vez y **recién cuando hay vendedor
  resuelto** (persistir el blob con `vendor: ''` dejaría la nota huérfana en la
  cola), con orden de preferencia foto → audio → texto: la foto del galpón es lo
  que más cuesta reponer.
- **Los avisos de Telegram abrían el navegador, no el Mini App.** El conversor
  estaba escrito y testeado en `src/host/deep-link.ts` y sin usar.
  `api/dispatch/_telegram.ts` tiene ahora `urlDoBotao()`, que manda al Mini App
  cuando hay `TELEGRAM_BOT_USERNAME` y la ruta tiene codificación, y cae a la
  URL web cuando no —inventar un `start_param` para un destino que la tabla no
  conoce llevaría a **otra pantalla**—. El test nuevo no compara contra un
  string escrito a mano: hace el ida y vuelta contra la misma tabla que la app
  usa al arrancar, que es el invariante que importa.
- **`VITE_APK_URL` caía a `/ventus.apk`**, una ruta que en este sitio devuelve
  el `index.html` por el rewrite de SPA: el vendedor tocaba «Baixar o APK» y se
  quedaba mirando una descarga que no llegaba nunca. Sin la variable, el botón
  **no se muestra**.
- **`0011_cron.sql` no existía.** `api/dispatch/jobs.ts`, `run.ts` y `_tipos.ts`
  lo citaban como la fuente única de los horarios, y `0011` era en realidad la
  migración de revocación de la ola anterior. Se escribió como
  `0012_cron.sql` —diez jobs, secretos en el Vault, schema privado fuera del
  alcance del PostgREST— y las tres referencias apuntan ahí.
- **`vercel.json` declaraba las funciones con un glob** y un `maxDuration` de
  60 s para todas. Ahora las declara **una por una** (11 de las 12 que permite
  el plan Hobby), con el techo que corresponde a cada una: 10 s para el health,
  60 s para el que espera a Claude.
- **`.env.example` documentaba 12 variables de las 20 que el código lee.** Se
  reescribió entero con la lista completa, cada una anotada con el archivo que
  la lee, más una sección explícita de **nombres que no son variables de este
  proyecto** (`VITE_VAPID_PUBLIC_KEY`, `DIGEST_CHAT_ID`, `ALLOWED_GROUP_IDS`),
  para que nadie los copie del bot v1 y después busque por qué no hacen nada.

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
- **`/api/telegram` devuelve 501.** No es un stub olvidado: la biblioteca del
  bot está entera detrás y lo que falta es el ruteo. Está en la lista de
  bloqueos (§0) porque tiene consecuencias fuera de sí mismo.
- **La sesión de respaldo del Mini App dura una hora y no se refresca.** Cuando
  vence, el Mini App vuelve a entrar con un `initData` nuevo —Telegram lo
  reemite en cada apertura—, así que no se nota; pero está dicho en el código y
  acá. El camino bueno es el del OTP, que sí trae refresh token.
- **No hay anti-replay de `query_id`.** Un `initData` robado sirve hasta que
  venza el TTL de una hora. Cerrarlo del todo pide una tabla de `query_id` ya
  usados.
- **Las 3 capturas del manifest son mock-ups generados por script**, con
  «Empresa exemplo» adentro. Se ven en la ficha de instalación de Android.
  Cambiarlas es reemplazar los PNG; el manifest no se toca.
- **`definirBadge()` existe y ninguna pantalla lo llama** con el conteo real de
  tarjetas sin resolver. El service worker sí mantiene el badge con las
  notificaciones abiertas.
- **El respaldo de borradores en CloudStorage está listo y sin usar**
  (`salvarRascunho`/`lerRascunho`). Los candidatos son el editor de escala del
  Dossiê y el compositor del Ventus.
- **Las pantallas todavía no declaran su acción crítica al host.** La única
  cableada es la Golden Hour, con `useTelaCheia(emFoco)`. Faltan al menos
  «Iniciar Golden Hour» en Hoje, «Confirmar» en Registrar y «Avançar etapa» en
  el Dossiê, con `useBotaoPrimario` / `useBotaoSecundario` / `useBackNativo`.
  Dentro de Telegram eso es la diferencia entre un botón nativo abajo y uno
  dibujado en medio de la pantalla.
- `/kitchen` no está linkeada desde ninguna pantalla: se entra a mano.

---

## 5 · TODOs consolidados (las tres olas + el integrador)

Orden aproximado de dependencia. Lo que bloquea a otra cosa va primero. Los tres
bloqueos de despliegue están arriba del todo, en §0.

### 5.1 · Base de datos y despliegue

1. ~~Aplicar `0100_seguranca`~~ — **hecho** el 2026-08-25 (§2.1). Queda un
   riesgo residual documentado como C9 en el propio archivo: los
   `ALTER DEFAULT PRIVILEGES` de `supabase_admin` siguen nombrando a `anon` para
   tablas y secuencias **nuevas**, y sólo `supabase_admin` puede revocarlos.
   Conviene revisar los grants de `anon` después de crear cualquier tabla desde
   el panel. Y el default de `postgres` para **funciones** sigue concediendo
   EXECUTE a `anon`: las funciones nuevas nacen llamables por
   `/rest/v1/rpc/`. Cerrarlo quedó fuera de aquella ventana a propósito.
2. **Desplegar `/api/ventus` e `/api/ingest`.** Los contratos son
   `src/screens/Ventus/contrato.ts` y `src/screens/Registrar/contrato.ts`. El
   servidor **tiene que** emitir `abertura` inmediato y `ping` cada 15s o el
   timeout de inactividad de 25s lo corta (los proxies móviles brasileños cortan
   conexiones ociosas a los 30-60s).
3. **Edge Function `pairing-code`**: no existe. Es el bloqueo 2 de §0.
4. **El handler de `/api/telegram`**: es el bloqueo 1 de §0. Lo que hay que
   escribir está especificado en `PLANO.md` §532-545 y las piezas están todas en
   `api/telegram/_lib/`: `reivindicarUpdate()` para el claim idempotente,
   `canalDoTelegram()` para la identidad, `partirComando()` + los nueve
   `comando*`, `lerCallback()`/`callbackVigente()` para los botones, `sessoes`
   para el estado conversacional y `fluxo` para las escrituras. Falta sólo el
   ruteo, con ack <1s y procesamiento por la cola.
5. **Aplicar `0012_cron.sql`** después del deploy, con los dos secretos en el
   Vault. Ver `DEPLOY.md` §5. Y decidir aparte qué se hace con el job del v2
   `check-inactivity-daily` (jobid 1), que sigue insertando una notificación por
   oportunidad por día sin deduplicar: 4.579 filas, 0,0 % de lectura.
6. **Ampliar `ventus_commit_action`**: hoy despacha 5 tipos y los otros 4
   (`registrar_atividade`, `converter_lead`, `arquivar_lead`,
   `marcar_commitment`) caen en el `else` con «Tipo de ação desconhecido»
   (22023). El backend los ejecuta en TS con staleness manual, que **no** es
   transaccional con la escritura.
7. **Discrepancia de contrato a resolver**: `0009_rpcs.sql` usa el literal
   `promover_lead` y `VentusActionKind` en `src/core/types.ts` lo llama
   `promover_do_sweep`. El cliente acepta los dos y normaliza (`ALIAS_TIPO`, con
   test), pero hay que elegir uno en la base. Recomendación: alinear el SQL con
   core.
8. `ventus_actions.entity_kind` no admite `'commitment'` en el CHECK y
   `ventus_precondition_hash` no sabe hashear un compromiso: esas propuestas van
   **sin staleness check**.
9. Habilitar `supabase_realtime` tabla por tabla con `REPLICA IDENTITY`. Hoy la
   publicación tiene **cero** tablas: `realtime.ts` se suscribe y no le llega
   nada (sin romper), y de eso dependen «Here Now» y el high-five.
10. Backfill inicial: `notification_prefs`, `streaks` y cookbook por vendedor, y
    promover las ~174 empresas del mapa sin lead vía `promote_sweep_to_lead()`.
11. Ampliar `touchpoints_channel_check` a `meeting|visit|event|referral`. Hoy
    registrar un toque como `meeting`/`visit` desde Cadência o Registrar no es
    posible (entra como `phone`).
12. Indexar las 24 FK sin índice de las tablas nuevas **cuando se sepa qué
    consultas corren de verdad**, no ahora: están todas vacías y son INFO del
    advisor.
13. `bot_log`, `bot_sessions` y `pairing_codes` quedaron con RLS on y **cero
    policies**. Hoy eso significa «nadie lee por PostgREST», que es lo correcto;
    si el bot pasara a leerlas con la anon key habría que darles policy
    explícita.

### 5.1-bis · Plataforma: lo que falta para el primer teléfono

14. **Trámite Google, antes del 30/09/2026**: crear la Limited Distribution
    Account con la cuenta corporativa (no la personal de nadie), registrar
    `br.com.ventapel.ventus` + el SHA-256 del keystore, y dar de alta los 6
    aparatos con los teléfonos en mano. Paso a paso en `docs/ANDROID.md` §1.
15. **Guardar el keystore hoy**: `ventus3/android/ventapel-ventus.keystore` al
    cofre de archivos y `/home/user/ventus-keystore-pass.txt` al gestor de
    contraseñas. Perderlo = no poder actualizar nunca más la app instalada, sin
    recuperación posible.
16. **Definir la URL definitiva de producción antes del primer APK.** El host va
    firmado dentro del APK: cambiarlo después obliga a recompilar y reinstalar
    en los 6 teléfonos.
17. **Registrar el Mini App en @BotFather** (`/newapp`) apuntando al deploy. Sin
    eso `t.me/<bot>/app` no existe y ningún deep link abre nada.
18. **Probar en hardware real**: un iPhone y un Android del equipo, dentro del
    Mini App y como PWA instalada. Los umbrales de los eventos de safe area,
    `checkHomeScreenStatus` en iOS y que el `apple-touch-icon` no salga con
    fondo negro sólo se validan ahí.

### 5.2 · Producto

19. **Pipeline de voz completo**: `MediaRecorder` → Whisper →
    `registrarAtividade`. La captura y el almacenamiento ya están; falta el
    tramo de transcripción posterior, que la pantalla ya promete.
20. **Anuncio en Telegram** al agendar una reunión y al revelar un troféu (M11 /
    §7 del plano): la celebración local existe (<1s), el mensaje al canal
    depende del dispatcher de `notification_queue` y del bot.
21. ~~`requestFullscreen()` del Mini App~~ — **hecho**: `useTelaCheia()` lee el
    estado con `useSyncExternalStore` sobre `fullscreenChanged` (el vendedor
    puede salir con un gesto del sistema y un `useState` seguiría diciendo que
    estamos en modo foco). La Golden Hour ya lo usa. Lo que sigue abierto de
    este punto es `/api/telegram`, que está en §0.
22. `fonte: 'foto'` en `/api/ingest` devuelve 501 explícito: falta el camino de
    visión.
23. **Shadow mode**: el plano pide 2 semanas con `status='shadow'` antes de
    mostrar Pontos de Avanço. Hoy se muestran desde el primer día.
24. Precache nocturno del «modo viagem», disparado en foreground a las 21h
    porque iOS no tiene Periodic Sync.
25. ~~`POST /api/ventus/feedback` no existe~~ — **el endpoint ya existe**
    (`api/ventus/feedback.ts`). Lo que falta es decidir en qué tabla aterriza el
    voto 👍/👎; hoy el historial local no lo pierde.

### 5.3 · Rendimiento y plataforma

26. **Barra de acción levantada con `visualViewport` dentro del `Sheet`** (M22).
    `useAlturaDoTeclado` ya está en `src/ui` esperando: el teclado de Android
    tapa los inputs del editor de escala del Dossiê y del «Converter» de
    Cadência.
27. **Diferir `supabase-js` del arranque** (209 kB del camino crítico). Hoy no
    se puede sin más: `SessionProvider` llama a `auth.getSession()` al montar
    para decidir login vs shell. Requiere una ruta de arranque que lea la sesión
    de Dexie primero y cargue el cliente después.
28. Un `SearchField` en `src/ui`: la Carteira usa un `<input type="search">` a
    mano porque `TextField` no tiene botón de limpiar ni ícono a la izquierda.
    Si aparece un tercer buscador, la primitiva se vuelve obligatoria.
29. El Painel do Gestor agrega en el cliente (5 consultas en paralelo). Con 65
    oportunidades el payload es de kilobytes; cuando la base crezca conviene una
    vista `v_painel_do_gestor`. `montarPainel()` es pura, así que mover la
    agregación al servidor no toca la pantalla.

### 5.4 · Dominio y gamificación

30. Reemplazar los proxies de `weeklyTrophies()` y `derivarEventos()` por
    `scoring_events` y compromisos agregados por semana (F7). Cuando exista
    `points_ledger`, `fetchPlacarSemana` debería leer de ahí en vez de derivar.
31. `METHODOLOGY_ACTIVITIES` son 32 hitos redactados a partir del PPVVCC y del
    negocio. Conviene que Jordi/Tomás los revisen **antes** de que empiecen a
    escribirse.
32. `detectScaleRegression()` devuelve `opportunityId: 0` (firma del stub
    inglés). La versión útil es `regraRegressaoDeEscala(opp, anterior)`.
33. `risk.ts` no lee `scale_evidence` todavía: detecta la etapa arrastrada, no
    el caso «la etapa está bien pero las escalas que la habilitan no tienen
    prueba».
34. La media de entregas por día mide **registros**, no tarjetas resueltas: el
    estado del día se poda y no hay histórico de resoluciones.

### 5.5 · Calidad

35. ~~Sin tests de interacción (Playwright)~~ — **hecho**: 87 pruebas verdes
    sobre iPhone 14, Pixel 7 y desktop, con los tres flujos que el plano pide.
    Encontraron **siete defectos reales**, todos arreglados y todos de
    producción, no de la prueba. Los dos peores: el pie del `Sheet` quedaba
    156 px **por debajo** del borde inferior en todos los teléfonos —el editor
    de escala PPVVCC abría sin ningún botón para guardar, y alcanzaba al menos a
    5 sheets—, y el día congelado de Hoje perdía tarjetas porque el id de una
    `PlannedAction` depende del estado de la entidad: registrar algo cambiaba el
    id, «Suas 3 de hoje» pasaba a «As 2 de hoje estão resolvidas» y el día podía
    darse por cerrado con trabajo pendiente adentro.
    Lo que la suite **no** cubre y sigue abierto: el arranque en frío **sin
    red** (el dev server tiene el service worker apagado, así que nadie sirve el
    `index.html`), y las 8 pantallas sin spec propia —Carteira, Revisão,
    Cadência, Placar, Rituais, Ventus, Gestor y Ajustes—, que hoy sólo pasan por
    el barrido de a11y y por las capturas.
35-bis. Dos cosas que la suite encontró y **no** se arreglaron, anotadas en
    `docs/QA.md` §5: en el Dossiê hay dos botones con el mismo nombre accesible
    («Registrar por voz», el de la ficha y el FAB del Shell), y el contenido del
    editor de escala desborda ~31 px en horizontal en un iPhone 14, así que al
    enfocar «Cargo» el sheet se corre de costado. Además, en teléfonos cortos la
    barra de comando del Ventus + el FAB tapan ~150 px y cortan la primera
    tarjeta de Hoje: se ve en `docs/capturas/01-hoje-claro.png`.
36. **Calibrar los umbrales de gesto con los 4 vendedores en teléfono real**
    antes de congelarlos: swipe 96px, pull 72px, velocidad de cierre
    0,55 px/ms. Hoy están puestos a ojo.
37. Test de dos dispositivos editando escalas distintas offline contra la base
    real (ya se puede: `0010` está aplicada).
38. Verificar contraste AA de la paleta oscura sobre los tonos `-soft` (sobre
    todo `warn-soft-fg` y `accent-soft-fg`) con herramienta, no a ojo.
39. Falta la variante `'gestor'` de `Skeleton` (las de `revisao`, `placar` y
    `rituais` ya están).
40. Calibrar los techos de gasto de `LIMITES` en `api/_lib/usage.ts` (5 USD/día
    por vendedor en el chat, 4 en ingest) con los datos reales de `ventus_audit`
    después de una semana. Hoy están puestos a ojo sobre el uso del bot.
41. Medir el p95 de 45s del camino feliz de Registrar con audios reales. El
    cliente ya instrumenta `IngestResponse.duracaoMs`, pero no hay tabla ni
    evento de telemetría donde dejarlo.
42. `useDiaVigente()` hace rollover de medianoche cada 60s y no está cubierto
    por test (necesitaría fake timers sobre el huso de SP).
43. Corriendo la suite completa aparece un unhandled rejection
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
- **No agregues un `addEventListener` de `push`, `message` o `sync` en el
  service worker sin mirar el otro archivo.** Son dos —`sw.ts` y `sw-push.ts`,
  unidos por un solo `import`— y hay exactamente **un listener por evento**. Dos
  listeners de `push` muestran dos notificaciones por aviso.
- **No exportes un nombre que ya exporta otro barril.** `@/core`, `@/data`,
  `@/ui`, `@/host`, `@/push` y `@/install` no comparten ni uno. El día que dos
  se pisen, el error aparece en el archivo de quien importe los dos, que no es
  quien lo rompió.
- **No escuches `beforeinstallprompt` en un `useEffect`.** Chrome lo dispara una
  vez, casi siempre antes de que React monte. El singleton de
  `@/install/prompt-android` ya lo tiene; leelo de ahí.
- **No agregues un destino de deep link sin su inverso.** La tabla de
  `src/host/deep-link.ts` declara las dos direcciones juntas —parser y
  constructor— a propósito, y `montarStartParam` se auto-verifica releyendo lo
  que emite. Un destino sin inverso hace que el botón de un aviso abra otra
  pantalla que la que promete el rótulo.
- **No agregues una ruta en `api/` sin declararla en `vercel.json`.** Las 11
  funciones están listadas una por una con su `maxDuration`; una ruta nueva nace
  con el default de 10 s y se corta a la mitad. Y el plan Hobby permite 12:
  queda **una** libre.
- **No pongas cabeceras de CORS en `vercel.json`.** Las emite `rota()` en
  `api/_lib/http.ts`, con la origen ecoada y `Vary: Origin`. Declararlas también
  en la plataforma las manda duplicadas y el navegador rechaza la respuesta
  entera.
- **No rotes las claves VAPID sin avisar.** Invalida todas las suscripciones:
  cada aparato tiene que volver a suscribirse, y hasta que alguien abra la app
  no le llega nada.
