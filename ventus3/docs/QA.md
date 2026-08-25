# QA de punta a punta — Ventus v3

> Fecha de corte: **2026-08-25** · rama `claude/crm-web-app-redesign-f7tu7g`
>
> Este documento dice **qué se prueba**, **cómo se corre** y **qué encontró**.
> Los números son salidas reales pegadas de la corrida, no estimaciones.

---

## 1 · Cómo se corre

```bash
cd ventus3
npm install                       # @playwright/test ya está en devDependencies

npx playwright test               # los 3 proyectos: mobile, mobile-pixel7, desktop
npx playwright test --project=mobile
npx playwright test hoje.spec.ts -g "Pronto por hoje"

CAPTURAS=1 npx playwright test --project=mobile capturas.spec.ts   # docs/capturas/
node scripts/medir-arranque.mjs                                     # peso + arranque real
npx tsc --noEmit -p tsconfig.e2e.json                               # tipos de e2e/
```

**No hace falta levantar nada a mano.** `playwright.config.ts` arranca el dev
server en el puerto 5288 con su propio ambiente y lo apaga al terminar. Si ya
hay uno escuchando ahí, lo reusa.

### El navegador

La máquina tiene Chromium 141 (revisión 1194) en `PLAYWRIGHT_BROWSERS_PATH` y
este `@playwright/test` espera la revisión 1234, así que la resolución
automática no lo encuentra. La config le pasa el `executablePath` a mano
(`/opt/pw-browsers/chromium`, o `PLAYWRIGHT_CHROMIUM_PATH` si querés otro).
**Nunca correr `playwright install`**: esta máquina no tiene salida para
bajarlo.

Los tres proyectos corren sobre ese mismo Chromium:

| Proyecto | Perfil | Para qué |
|---|---|---|
| `mobile` | iPhone 14 (390×664, DPR 3, touch) | El teléfono más chico del equipo. Es donde aparecen los problemas de espacio. |
| `mobile-pixel7` | Pixel 7 (412×915, touch) | El Android del equipo, pantalla larga. |
| `desktop` | 1280×900, sin touch | Teclado, foco visible y el Painel do Gestor. |

Los descriptores de iPhone piden WebKit; acá se conserva la pantalla, el DPR,
el user agent y el touch, y se cambia el motor a Chromium. Es emulación de
**forma**, no de motor, y está dicho en el archivo.

### La base de producción no se toca. Dos candados

1. El dev server de las pruebas arranca con
   `VITE_SUPABASE_URL=https://stub.supabase.test`, un host que no existe. La
   URL real (`wtrbvgqxgcfjacqcndmb`) no entra en el bundle de prueba: aunque
   una prueba quisiera escribirle, no la tiene.
2. El fixture intercepta ese host con un doble de PostgREST y **aborta**
   cualquier pedido a `*.supabase.co` / `*.supabase.in`.

`scripts/medir-arranque.mjs` compila a `dist-qa/` con el mismo ambiente de
prueba: nunca pisa `dist/` ni puede hablarle a la base real.

### Cómo se siembran los datos

En **Dexie**, que es de donde la app lee. Todas las pantallas leen IndexedDB y
nunca la red, así que sembrar ahí es sembrar el estado real del producto y no
un mock de la capa de datos. La siembra usa el **mismo módulo** que la app
(`/src/data/db.ts`, servido por Vite), así que `getDb()` devuelve la misma
instancia que usa React.

La cartera de prueba (`e2e/fixtures/dados.ts`) es determinística y relativa a
hoy en São Paulo: 5 oportunidades escalonadas en valor y silencio (Tetra Pak,
Ambev, Natura, Suzano, Klabin) y 4 leads con el toque vencido. Con eso, la tela
Hoje tiene siempre 3 tarjetas —y 2 de sobra para «Ver tudo»— y la Golden Hour
tiene siempre 4 contactos.

Dos detalles del arnés que se pagaron caros y están comentados en el código,
por si alguien los toca:

- **El primer arranque va a `/instalar`.** Si fuera la tela Hoje, sus queries
  correrían contra una base todavía vacía y ese resultado vacío quedaría en el
  cache que la app persiste en Dexie; el arranque siguiente lo hidrataría y lo
  trataría como fresco 60 s (`staleTime`), así que la pantalla diría «a fila de
  hoje está vazia» con los cuatro leads ya en el aparato. `/instalar` no monta
  ninguna query de cartera.
- **La semilla se escribe hasta que sobrevive dos comprobaciones seguidas.** El
  primer arranque encuentra la base vacía con sesión viva —la firma exacta de
  una purga de iOS— y `recuperarDePurga()` limpia el espejo entero para rehacer
  la carga. Ese borrado puede caer justo encima de lo recién sembrado. Es
  comportamiento correcto de la app; lo anómalo es sembrar por atrás.

---

## 2 · Qué se prueba

No hay pruebas de humo. Cada archivo prueba la decisión de producto que la
pantalla existe para sostener.

### `hoje.spec.ts` — la tela Hoje (5 pruebas)

- Con 5 negocios en la cartera muestra **exactamente 3 tarjetas**, con el
  encabezado que dice lo mismo que la lista, y el resto cerrado en «Ver tudo».
- El chip **«Por que isto?»** arranca cerrado, despliega las señales con su
  peso con signo y la suma («Soma = N pontos de prioridade»), y vuelve a
  cerrarse.
- El **swipe a la derecha** (gesto real: pointerdown, doce movimientos y
  pointerup, con el lock de eje y el umbral de 96 px de `SwipeRow`) resuelve la
  tarjeta, muestra el toast con **Desfazer**, la tarjeta colapsa a la tira
  verde sin desaparecer y el encabezado pasa a «Faltam 2 de 3». Deshacer la
  devuelve a pendiente **sin escribir nada**.
- Resolver las 3 da **«Pronto por hoje»**, la lista sigue teniendo 3 (ninguna
  cuarta ocupó el lugar), y después de recargar sigue igual: el día está
  congelado en Dexie. Las tres escrituras salieron para el servidor y el outbox
  quedó vacío.
- **Cartera vacía ≠ día tranquilo**: sin datos dice «Baixando a sua carteira»,
  nunca «Nada urgente na carteira».

### `golden.spec.ts` — Golden Hour (7 pruebas)

- La abertura muestra la fila derivada («4 contatos prontos») y por dónde
  empieza.
- **El modo foco esconde la navegación entera**: sin bottom nav, sin el header
  de la app, sin FAB y sin la barra de comando del Ventus. Queda el HUD y los
  cuatro botones.
- **Los cuatro botones mueven el carrusel solos**: Ligou → contacto 2, Falou →
  fila de tres resultados en el mismo lugar → contacto 3, Agendou → celebra y
  pasa al 4, Passar → fila terminada. Y quedan **3 toques registrados, no 4**:
  «Passar» no gasta un paso de la cadencia.
- **El cierre de 60 s no se puede saltear**: el sello arranca deshabilitado y
  lo dice; una respuesta no alcanza; con las tres se habilita. Y se destraba
  solo a los 60 segundos (prueba de un minuto de reloj, a propósito).
- **El back del sistema pide confirmación**, «Continuar» deja al vendedor
  exactamente donde estaba, y «Sair» sale de verdad.
- Sin leads, la abertura manda a la Cadência en vez de abrir vacía.

### `registrar.spec.ts` — la puerta de entrada de datos (4 pruebas)

El micrófono es **real**: Chromium corre con
`--use-fake-device-for-media-stream`, así que `getUserMedia` y `MediaRecorder`
recorren el camino de producción.

- **El gate de M5**: con cliente, tipo, resumen y próxima acción ya
  pre-llenados, «Confirmar» sigue deshabilitado y dice «Escolha a data da
  próxima ação». Borrar la próxima acción cambia el motivo del bloqueo. Una
  pastilla de fecha lo destraba.
- **Las DatePills** no adivinan (nada marcado al abrir, «Obrigatório» a la
  vista), resuelven la fecha con un toque y son excluyentes: Hoje ≠ Amanhã y la
  marca se mueve.
- **El camino feliz son 3 toques**: hablar, tocar la pastilla, confirmar.
  Termina en el Dossiê y deja la actividad escrita **y** la `task` con fecha,
  que es lo único que hace que ese negocio vuelva a aparecer en Hoje.
- Sin cliente reconocido, el gate pide el cliente antes que cualquier otra
  cosa.

### `dossie.spec.ts` — la regra da prova (3 pruebas)

- Tocar un **nivel canónico** por su texto pone el número y el texto de golpe.
  Bajar no exige prueba: sincerar siempre tiene que ser barato.
- **Arriba de 5 no pasa sin evidencia**: el botón deja de decir «Salvar» y dice
  «Falta a evidência»; la cita sola no alcanza, el nombre tampoco; recién con
  quién, cargo y frase se habilita. Al guardar, la escala se mueve en el espejo
  local.
- El **preview de la saúde verificada** cuenta la prueba hipotética antes de
  guardar (0,0 → 1,5).

### `offline.spec.ts` — modo avión (3 pruebas)

Con la red cortada de verdad (`context.setOffline`), no con un mock de
`navigator.onLine`.

- La cartera sigue navegable y la falta de señal **se anuncia** («Sem conexão»).
- Un registro hecho sin señal entra igual, queda en el outbox, el **badge del
  micrófono** lo cuenta, y **nada** salió del teléfono. Al volver la señal la
  cola se vacía sola, el badge se apaga y el servidor recibe las escrituras.
- Registrar cuenta en pantalla cuántos registros esperan red.

> **Lo que estas pruebas NO cubren:** el arranque en frío sin red. El dev
> server tiene el service worker apagado a propósito (`devOptions.enabled:
> false`), y sin service worker nadie sirve el `index.html`. Por eso acá se
> navega siempre por dentro del router y las rutas se visitan una vez con red
> para que su chunk quede cargado, igual que el precache haría en producción.
> El precache real sí se verifica en `scripts/medir-arranque.mjs` (63 entradas,
> 1.562 KiB).

### `a11y.spec.ts` — teclado y foco (5 pruebas)

- La tela Hoje se recorre con Tab, el foco **se ve** (el anillo de 2 px del
  design system, comprobado en el estilo computado) y Enter hace lo mismo que
  el toque.
- **Las acciones del swipe existen como botones de teclado**: están en el DOM
  desde el principio, al recibir foco dejan de ser `sr-only` y Enter resuelve
  la tarjeta.
- **Escape** cierra el sheet y el foco vuelve al botón que lo abrió.
- Ningún control visible de `/`, `/carteira`, `/cadencia`, `/placar` y `/mais`
  se queda **sin nombre accesible**.
- Los **alvos táctiles llegan a 44 px**, y no se mide el rectángulo del
  elemento: se palpa el área con `elementFromPoint` en los cuatro extremos del
  cuadrado de 44 px. Es la única medición honesta, porque varios controles del
  design system son chicos a propósito y agrandan el área con un `::before` (el
  chip «Por que isto?» dibuja 28 px y toca 44).

### `desempenho.spec.ts` — las dos mediciones que se pueden gatillar

Ver la sección 4.

### `capturas.spec.ts` — vitrina, apagada por defecto

No afirma nada: escribe `docs/capturas/`. Corre solo con `CAPTURAS=1`.

---

## 3 · Qué encontró: 7 defectos, arreglados

Los siete se encontraron con el navegador, no leyendo el código, y los siete
están corregidos en esta rama. Los cambios en la app son estos y solo estos.

### 3.1 · `src/data/realtime.ts` — la app rompía al no poder conectar el socket

`RangeError: Maximum call stack size exceeded`, tres veces por arranque, cada
vez que el WebSocket de realtime no conecta.

`removeChannel()` cierra el canal, y ese cierre dispara **de forma síncrona**
el callback de `.subscribe()` con estado `'CLOSED'` — que es una de las tres
condiciones que llaman a `reagendar()`. O sea: cerrar el canal para reconectar
volvía a entrar en reconectar, que volvía a cerrar, hasta reventar la pila.

No es un caso de laboratorio: pasa **cada vez** que el socket no puede conectar
—sin señal, wifi de hotel, un proxy que corta el upgrade—, o sea exactamente en
el campo. Y de paso el backoff nunca funcionaba.

**Arreglo:** un guard `reagendando` que se levanta antes de cerrar y se baja
recién cuando el timer dispara la reconexión.

### 3.2 · `src/data/plano-do-dia.ts` — el día congelado perdía tarjetas

Resolver una tarjeta y volver a abrir la app dejaba **2 tarjetas donde había
3**, y la pantalla decía «As 2 de hoje estão resolvidas».

El id de una `PlannedAction` depende del estado de la entidad, así que en
cuanto se registra algo el planner emite **otra** acción para el mismo negocio,
con otro id. `fetchPlanoFixado` no encontraba el id congelado y descartaba la
tarjeta en silencio. Peor que la cuenta rara: si el id de una tarjeta **sin
resolver** cambiaba —porque un pull actualizó la oportunidad—, el día podía
darse por cerrado con trabajo pendiente adentro.

**Arreglo:** el estado del día guarda también las acciones congeladas
(`EstadoDoDia.acoes`, opcional para no romper los teléfonos con la versión
anterior). Si el planner ya no la propone, se usa el espejo — salvo que la
entidad esté cerrada o el lead archivado, que sí salen de la lista.

### 3.3 · `src/screens/Hoje/index.tsx` — hasta 5 s de resoluciones perdidas

La escritura sale cuando vence la ventana de deshacer. Si el vendedor resolvía
una tarjeta y cerraba la app (o iOS la mataba en segundo plano) dentro de esos
5 segundos, la resolución **se perdía**: el desmontaje de React solo cubre la
navegación dentro de la app; cerrar la pestaña, recargar o que el sistema mate
la app no ejecuta ninguna limpieza.

**Arreglo:** lo pendiente también se descarga en `pagehide` y al irse la app a
segundo plano. Lo que se paga: quien manda la app al fondo pierde el «Desfazer»
de esa resolución. Es el precio correcto — el botón es una cortesía de 5
segundos para quien está mirando la pantalla; el registro es el producto.

### 3.4 · `src/ui/internals.ts` — `useBackDismiss` no era seguro con StrictMode

En desarrollo, React monta el efecto, lo desmonta y lo vuelve a montar.
Empujando la entrada de historial en el cuerpo del efecto, la limpieza del
montaje descartado disparaba un `history.back()` **real**, y el `popstate` que
ese back genera llegaba encima de la pantalla que acababa de abrir el overlay.
El síntoma: **un diálogo de confirmación que se abría y se cerraba solo**, en
cada sesión de desarrollo del equipo.

**Arreglo:** el `pushState` va en un `setTimeout(0)`; el montaje descartado no
llega a empujar nada y la limpieza no tiene qué deshacer. Para la persona no
cambia nada: no hay forma de apretar «atrás» en el mismo frame en que el
overlay aparece.

### 3.5 · `src/screens/GoldenHour/index.tsx` — el back peleaba con los overlays

Dos defectos, los dos de producción:

1. **«Sair da Golden Hour?» se abría de la nada.** Los overlays del design
   system empujan su propia entrada de historial y la sacan con
   `history.back()` cuando se cierran con un botón. Ese back generaba un
   `popstate` que la Golden Hour leía como «el vendedor quiere salir». Cerrar
   cualquier sheet durante el bloque preguntaba si quería irse — y así el
   vendedor aprende a apretar «Sair» en piloto automático.
2. **Tocar «Sair» no sacaba de la Golden Hour.** La navegación salía antes de
   que el diálogo sacara su entrada del historial, y ese `history.back()` se la
   llevaba puesta: el vendedor volvía al bloque después de haber pedido salir.

**Arreglo:** dos guardas (no se pregunta dos veces; si seguimos parados sobre
la marca de la Golden Hour, el back se llevó un overlay y no la hora) y las dos
salidas esperan a que la entrada del overlay ya no esté arriba, con techo de
intentos para no colgarse.

### 3.6 · `src/ui/Sheet.tsx` — el botón de guardar quedaba fuera de la pantalla

**Este es el más visible.** Al abrir el editor de escala PPVVCC, el sheet se
veía sin ningún botón para guardar: el pie quedaba 156 px por debajo del borde
inferior de la pantalla.

Con varios `snapPoints`, el panel mide siempre el snap más alto y los snaps
bajos se logran empujándolo hacia abajo con un transform. Consecuencia: lo que
está al pie del panel —justo la barra de acción— queda fuera de la pantalla en
cualquier snap que no sea el último, en **todos** los teléfonos, porque la
proporción es fija (25 % del alto del panel).

Alcanza a por lo menos cinco sheets del producto: `EditorEscala` (Salvar),
`EntradaAlternativa` de Registrar (Enviar), `VentusSugere`, y los dos
`LeadSheet` de Cadência.

**Arreglo:** el pie se compensa con el transform inverso —queda pegado al borde
inferior visible— y se reserva esa misma altura al final del contenido para que
nunca tape la última línea. La compensación se limita al offset del snap más
bajo, para que durante la animación de cierre el pie se vaya **con** el panel
en vez de quedar flotando.

| Antes | Después |
|---|---|
| El pie (Stepper + «Salvar Dor em 9») empezaba en y=756 con la pantalla de 664 px | Empieza en y=600, visible entero |

### 3.7 · `src/data/outbox.ts` + `src/data/sync.ts` — la cola no aprovechaba la vuelta de la red

Cada intento fallido sube el exponente del backoff (2 s, 4 s, 8 s… hasta 5
min). Estando sin señal, esos intentos se acumulan igual, así que cuando la red
volvía, el evento `online` disparaba un flush que **saltaba** las mutaciones
por no haber vencido su ventana. La nota que el vendedor grabó en el galpón se
quedaba en la cola bastante después de que hubiera señal — y ese es justo el
momento en que el sistema puede matar la app.

**Arreglo:** `flush({ ignorarEspera: true })`, que se saltea la ventana pero
**no** el estado `'erro'` permanente. Lo usa solo el disparador `online`, que
es el único que sabe que la condición que hacía fallar la cola cambió.

---

## 4 · Los números

### 4.1 · Leer el día de Dexie — objetivo < 100 ms

`fetchPlanoFixado()` hace UNA lectura de la cartera y corre `rankDay()` encima.
Es lo único que separa «abrí la app» de «sé qué hago ahora».

```
⏱  Ler o dia de Dexie — mediana 3,1 ms · pior 95,2 ms     (12 muestras, mobile)
⏱  Ler o dia de Dexie — mediana 4,4 ms · pior 165,5 ms    (12 muestras, desktop)
```

Sobra margen: el objetivo es 100 ms y la mediana es **3–4 ms**. El «pior» es
siempre la PRIMERA llamada, que paga abrir la conexión de IndexedDB (entre 90 y
165 ms según cuánto esté peleando la máquina); de la segunda en adelante es
ruido. En el arranque real esa apertura ya está pagada dentro de los 93 ms de
4.2.

### 4.2 · Pintar la tela Hoje — objetivo < 100 ms

Medido contra el **build de producción** (`node scripts/medir-arranque.mjs`),
en un Pixel 7 emulado, con la cartera ya en el aparato y el service worker
instalado y quieto. Nueve recargas seguidas:

```
╭─ Arranque com a carteira já no aparelho (build de produção) ─
│ Amostras: 85 ms · 86 ms · 89 ms · 91 ms · 93 ms · 98 ms · 99 ms · 105 ms · 109 ms
│ Até os 3 cartões pintados — melhor 85 ms · mediana 93 ms · pior 109 ms
│ Recursos baixados no arranque: 13
╰──────────────────────────────────────────────────────────────
```

**Mediana 93 ms: el objetivo se cumple.** Es de punta a punta —bajar el
bundle del cache, evaluarlo, montar React, leer Dexie y pintar— no solo el
render.

La misma medición contra el dev server da entre 80 y 275 ms según cuántos
workers estén compitiendo (última corrida: mediana 130 ms en teléfono, 157 ms
en escritorio): ahí Vite sirve cientos de módulos sin empaquetar y
React corre en StrictMode renderizando todo dos veces. Por eso la prueba de
`desempenho.spec.ts` tiene un techo de 400 ms —sirve para cazar una regresión
de orden de magnitud, una query por fila o un render en cascada— y el número
del producto sale del script.

### 4.3 · Peso del camino crítico

Lo que el navegador baja **antes de poder pintar** (entrada + los tres chunks
precargados + CSS + html):

| Archivo | Sin comprimir | gzip |
|---|---:|---:|
| `assets/index-*.js` (entrada) | 284,8 kB | 89,4 kB |
| `assets/ui-*.js` (design system) | 268,2 kB | 86,5 kB |
| `assets/session-context-*.js` (router + query + contexto) | 226,7 kB | 71,6 kB |
| `assets/supabase-*.js` | 204,4 kB | 52,4 kB |
| `assets/chunk-*.js` | 88,6 kB | 29,0 kB |
| `assets/index-*.css` | 63,1 kB | 12,6 kB |
| `index.html` | 3,9 kB | 1,5 kB |
| **TOTAL** | **1.139,7 kB** | **343,1 kB** |

El `dist` entero son **41 archivos JS, 1.448,1 kB** entre todos los chunks por
ruta; el service worker precachea **63 entradas, 1.562 KiB**, que es lo que
hace que la app siga navegable entera en modo avión.

El camino crítico es el 79 % del JS del proyecto. El bulto son cuatro chunks
que no se pueden partir más sin romper el arranque, y el más grande evitable es
`supabase-*.js` (52 kB gzip) — que hoy entra en el arranque aunque la primera
pantalla no le pida nada a la red.

---

## 5 · Lo que se vio y NO se tocó

Está anotado, no arreglado. Nada de esto rompe un flujo.

1. **Dos botones con el mismo nombre accesible en el Dossiê.** El de la ficha
   («Voz», `aria-label="Registrar por voz"`) y el FAB del Shell. Un lector de
   pantalla anuncia dos veces lo mismo en la misma pantalla. Las pruebas lo
   sortean con `.last()`; el arreglo natural es que el de la ficha diga
   «Registrar por voz nesta oportunidade».
2. **El contenido del editor de escala desborda ~31 px en horizontal**
   (`scrollWidth` 419 contra `clientWidth` 388 en un iPhone 14), así que al
   enfocar «Cargo» el sheet se corre de costado y el texto queda pegado al
   borde. La grilla de dos columnas del bloque de evidencia es la sospechosa.
3. **En teléfonos cortos, la barra de comando del Ventus y el FAB tapan la
   parte de abajo de la primera tarjeta de Hoje** (unos 150 px sobre 664). Se
   resuelve scrolleando, pero la primera impresión de la pantalla más
   importante del producto es una tarjeta cortada. Se ve en
   `docs/capturas/01-hoje-claro.png`.
4. **El service worker está apagado en desarrollo** (`devOptions.enabled:
   false`), así que ninguna prueba del dev server puede ejercitar el arranque
   en frío sin red. El precache se verifica en el build.
5. **Sembrar en Dexie por atrás no mueve el cache de TanStack Query**, que la
   app persiste y trata como fresco 60 s. No es un defecto —en producción solo
   escriben el sync y las mutaciones, y las dos invalidan lo que tocan— pero es
   una trampa para cualquiera que escriba una prueba nueva. El fixture lo
   documenta y lo evita arrancando en `/instalar`.

---

## 6 · Capturas

`docs/capturas/` tiene las 15 pantallas principales en iPhone 14, claro y
oscuro (30 PNG). Se regeneran con:

```bash
CAPTURAS=1 npx playwright test --project=mobile capturas.spec.ts
```

Salen de la misma semilla determinística que el resto de la suite, así que dos
corridas del mismo commit dan la misma imagen y un cambio de diseño se puede
comparar contra lo que había.

| | |
|---|---|
| `01-hoje` | Las 3 tarjetas, los anillos, la racha y el botón de la Golden Hour |
| `02-hoje-por-que` | El chip «Por que isto?» abierto, con la cuenta señal por señal |
| `03-carteira` · `04-dossie` | La lista y la ficha con el hexágono PPVVCC |
| `05-editor-de-escala` | El editor con la regra da prova (y el botón Salvar visible, ver 3.6) |
| `06-golden-abertura` · `07-golden-foco` · `08-golden-fechamento` | El bloque entero |
| `09-registrar-confirmacao` | La tarjeta de confirmación con el gate de fecha |
| `10-cadencia` … `15-ajustes` | Cadência, Placar, Rituais, Ventus, Mais, Ajustes |

---

## 7 · Salida real de la última corrida

```
$ npx playwright test
Running 93 tests using 2 workers
...
  6 skipped
  87 passed (6.1m)
```

Los 6 salteados son las capturas, que solo corren con `CAPTURAS=1`.

```
$ npx tsc --noEmit -p tsconfig.e2e.json
EXIT=0

$ npm run type-check
EXIT=0   (los 3 proyectos)

$ npx vitest run
 Test Files  39 passed (39)
      Tests  777 passed (777)

$ npx eslint . --max-warnings 0
EXIT=0
```
