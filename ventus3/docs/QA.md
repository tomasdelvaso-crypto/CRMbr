# QA de punta a punta — Ventus v3

> Fecha de corte: **2026-08-26** · rama `claude/crm-web-app-redesign-f7tu7g`
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

### `revisao.spec.ts` — la puerta del agente (2 pruebas)

La bandeja Revisão es el único lugar por donde lo que el agente propone entra a
la base. La decisión es **por campo**, y esa es la prueba:

- Con una propuesta `criar_task` de tres campos (título, prazo, canal), rechazar
  «Canal» cambia el botón a «Aceitar 2 de 3», y al confirmar salen **dos**
  pedidos en este orden: un `PATCH` que reescribe el `payload` **sin** el campo
  rechazado y recién después la RPC `ventus_commit_action` con su único
  argumento. El orden importa: commitear antes de recortar ejecutaría el campo
  que el vendedor dijo que no. Antes de confirmar no sale nada del teléfono.
- Aceptando los tres no hay `PATCH`: escribir el mismo payload de vuelta sería
  una escritura al pedo y una carrera contra el propio commit.

La propuesta se siembra en el **doble de PostgREST**, no en Dexie:
`sincronizarRevisao()` corre al montar y pisa el `meta` local con lo que
conteste el servidor, así que una propuesta sembrada sólo en Dexie desaparece
en el primer render. Para eso `Semente` acepta ahora `servidor`.

### `cadencia.spec.ts` — los dos caminos que mueven un lead (2 pruebas)

- **Registrar un toque**: «Respondeu interessado» escribe el touchpoint en el
  espejo con el vendedor y el resultado, sube el contador a 3, **mueve la etapa
  sola** (1B → 1C, sin arrastrar nada), agenda la próxima fecha, y manda la RPC
  `registrar_touchpoint` con su firma exacta —cinco argumentos, y el número de
  secuencia **no** viaja: lo calcula el servidor con `for update`—.
- **Convertir en oportunidad**: el nombre viene propuesto con el de la empresa,
  el lead queda `converted` en el espejo, sale de la fila de la cadencia, y la
  RPC `converter_lead` viaja con sus cinco argumentos **sin** el vendedor, que
  sale de `leads.vendor` del lado del servidor.

### `layout.spec.ts` — geometría, no clases de CSS (4 pruebas × 3 perfiles)

Los tres defectos de superficie de §5 se cerraron acá, y la prueba mide el
rectángulo real del navegador:

- La **primera tarjeta de Hoje entra entera** en la ventana de scroll con
  `scrollTop === 0`, y ninguna capa fija (barra del Ventus, bottom nav,
  micrófono) la intersecta.
- El **fondo de la lista es alcanzable**: scrolleando al final, el último
  elemento queda por encima del borde del scroll, y la barra empieza donde el
  scroll termina.
- El **editor de escala no desborda**: `scrollWidth <= clientWidth`, y enfocar
  «Cargo» deja `scrollLeft` en 0.
- En el Dossiê **ningún control visible repite su nombre accesible**.

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

## 3 · Qué encontró: 13 defectos, arreglados

Todos se encontraron con el navegador, no leyendo el código, y todos están
corregidos en esta rama. Del 3.1 al 3.7 son de la primera pasada; del 3.8 al
3.13, de la segunda —los tres de superficie que habían quedado anotados en §5 y
tres que aparecieron al escribir la cobertura que faltaba—.

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

### 3.8 · Chrome fijo sobre la primera tarjeta de Hoje — 122 px en dos capas

**El peor de los tres de superficie**, porque Hoje es la pantalla que define el
producto y la tarjeta cortada es su primera impresión. En un iPhone 14 (664 px)
la ventana de scroll de Hoje terminaba en la bottom nav, y **adentro** de esa
ventana flotaban dos capas más: la barra de comando del Ventus (66 px) y el FAB
del micrófono (56 px), justo encima del texto de la acción.

Medido antes: viewport 664 · header 57 · nav 65 · scroll de Hoje 57→601 · barra
534→600 · FAB 464→520 · **primera tarjeta 430→741**. O sea: la tarjeta no
entraba ni en el viewport entero, mucho menos arriba del chrome. Esa es la
parte que la nota original no decía y que cambia el diagnóstico: **esconder el
chrome no alcanzaba**, porque el contenido de la pantalla ya pedía 684 px de
alto (373 de bloque superior + 311 de tarjeta) contra 607 de viewport libre.

El arreglo tiene tres piezas, y ninguna sola alcanzaba:

1. **Un micrófono, no dos.** La barra de comando ya tenía un botón de micrófono
   que abría el MISMO sheet que su campo de texto —redundante— y encima el FAB
   de Registrar flotaba 4rem por arriba. Ahora el de Registrar **vive dentro de
   la barra**, con su badge de outbox. Donde no hay barra (`/ventus`,
   `/instalar`) sigue flotando como antes. Menos chrome, un solo micrófono, y
   cero superposición sobre el contenido.
2. **`--spacing-chrome`: la barra deja de apoyarse sobre el scroll.** Es un
   token nuevo que el Shell escribe en `<html>` en cada navegación (el alto de
   la barra, o `0px` donde no se pinta). Lo restan las tres pantallas de altura
   fija —Hoje, Carteira, Cadência— y la utilidad `pb-nav-safe`. Va en `<html>` y
   no en el `<div>` del Shell porque los portales (Sheet, Toast, Confirm)
   cuelgan de `<body>`.
3. **Modo compacto en pantallas cortas** (`useTelaCurta`, `max-height: 880px` —
   el número sale de la cuenta: el layout completo necesita `100svh >= 872`).
   No es «achicar todo un poco»: es **mover abajo lo que explica y motiva**. Los
   anéis se quedan arriba, más chicos (82 → 56 px); la explicación de la largada
   y la faixa da sequência bajan **debajo de las tres tarjetas**, al lado de la
   corrente do time. Y en la tarjeta, «Por que isto?» —que siempre fue un chip—
   pasa a la misma fila de los otros chips. En un teléfono largo o en el
   escritorio nada de esto se activa.

| | Antes | Después |
|---|---|---|
| Bloque sobre la tarjeta | 373 px | 187 px |
| Alto de la tarjeta | 311 px | 251 px |
| Ventana de scroll | 544 px (con 122 px de chrome adentro) | 478 px, limpia |
| Primera tarjeta | 430 → **741** (cortada a los 534) | 244 → **495**, con 40 px de sobra |

En el Pixel 7 (839 px de viewport real con la barra de Chrome puesta) el
problema era el mismo pero más chico: la tarjeta terminaba 15 px por debajo del
borde. Por eso el umbral es 880 y no 700.

`layout.spec.ts` lo mide en los tres perfiles: la tarjeta entera adentro de la
ventana con `scrollTop === 0` y sin intersección con ninguna capa fija.

### 3.9 · `src/ui/SegmentedControl.tsx` — 31 px de desborde horizontal

El editor de escala medía `scrollWidth` 419 contra `clientWidth` 388 en un
iPhone 14, así que al enfocar «Cargo» el sheet se corría de costado.

**La sospechosa de la nota original era la grilla de dos columnas del bloque de
evidencia, y era inocente**: mide 356 px y entra. El culpable es el control
segmentado de la categoría SPIN. Sus botones son `flex-1` con el rótulo en un
`<span class="truncate">` —una sola línea, sin cortes—, y sin `min-w-0` un ítem
flex conserva `min-width: auto`, que resuelve al ancho intrínseco de ese texto.
Con «Necessidade de solução» (138 px) el radiogroup se negaba a encoger. El
`truncate` estaba puesto desde el principio; lo que faltaba era dejarlo actuar.

Dos cambios: `min-w-0` en el botón (arregla el desborde en **todos** los usos
del control) y, para que nada quede recortado en este de cuatro segmentos, el
rótulo corto («Necessidade») en el segmento con el nombre completo mudado a la
línea de ayuda que ya estaba justo arriba. El `sm` además pasa de `px-3` a
`px-2`, que son los 8 px que separan a un rótulo de once letras de entrar
entero.

### 3.10 · Dos botones con el mismo nombre accesible en el Dossiê

El «Voz» de la ficha y el micrófono del Shell se llamaban los dos «Registrar
por voz». Ahora el de la ficha dice **a quién** registra —«Registrar conversa
por voz em Tetra Pak»— y el del Shell queda como la captura genérica, sin
cliente. El rótulo visible («Voz») sigue contenido en el nombre, como pide el
criterio 2.5.3.

Y ya que estábamos, el barrido de nombres repetidos encontró otro que la nota
no mencionaba: la lista de perguntas SPIN pintaba **cinco** botones llamados
«Marcar como já perguntada», uno por pregunta. Ahora cada uno lleva su pregunta
adentro del nombre. Pasa en `BlocoGate` y en `EditorEscala`.

### 3.11 · `src/screens/Revisao/index.tsx` — bucle de render infinito

Apareció al escribir `revisao.spec.ts`: con **una sola propuesta en la
bandeja**, la consola escupía `Maximum update depth exceeded` en cada visita.

`onDecisao` se le pasa a la tarjeta como una flecha inline, así que cambia de
identidad en cada render; el efecto de `CartaoProposta` que la llama depende de
ella y por lo tanto corre en cada render. `registrarDecisao` guardaba
**siempre** un objeto de estado nuevo, aunque la decisión fuera idéntica, así
que ese efecto pedía otro render, que pedía otro efecto, hasta que React
llegaba al tope de profundidad y abandonaba.

**Arreglo:** el updater devuelve el MISMO objeto cuando la decisión no cambió.
React descarta el render y el ciclo se corta en la primera vuelta.

### 3.12 · `src/screens/Cadencia/LeadSheet.tsx` — el toque nacía con el número equivocado

Apareció al escribir `cadencia.spec.ts`. Abriendo Embalagens Vale —2 toques
hechos— la fila decía «Toque 3 de 7» y el sheet, un centímetro más abajo,
«toque 1 de 7».

`nextSequenceNumber(touchpoints)` devuelve **1** cuando el espejo local no tiene
ninguna fila de toques, que no significa «es el primer toque» sino «todavía no
bajé los toques de este lead»; el `??` con el contador del lead nunca llegaba a
dispararse. Y no era sólo el rótulo: ese 1 es el `sequence_number` que se
escribía en la copia local del toque nuevo (la RPC no lo manda —lo calcula el
servidor con `for update`—, pero el espejo quedaba mal hasta el siguiente pull).

**Arreglo:** se toma el máximo de las dos fuentes, con tope en 7.

### 3.13 · `src/data/outbox.ts` — lo encolado durante un flush se quedaba en la cola

El más serio de la segunda pasada, y el que menos se ve: **una escritura podía
quedarse en la cola indefinidamente**.

`executarFlush()` lee la cola UNA vez, al principio. Y `flush()`, si ya hay uno
corriendo, devuelve el promise del que corre —correcto para no duplicar
intentos y no desordenar la cola, pero **pierde el pedido**: la mutación que se
encoló después de esa lectura no entra en la pasada, y quien la encoló recibe
un promise que resuelve «bien» sin haberla mandado. Se queda esperando el
siguiente disparador (otra escritura, la vuelta de la red), que puede no llegar
en toda la sesión.

No es hipotético: es el patrón normal de la app. `aceitarProposta` encola el
recorte del payload y **enseguida** el commit; `registrarTouchpoint` y las
demás hacen lo mismo cuando se disparan una atrás de la otra. Apareció como un
parpadeo de `revisao.spec.ts` —el outbox no se vaciaba en 30 segundos— y
resultó ser esto.

**Arreglo:** un pedido pendiente. Si alguien llama a `flush()` con otro
corriendo, se anota (con las opciones más permisivas de todo lo que se pidió) y
el `finally` del que está corriendo arranca una vuelta más. Sigue habiendo un
solo flush a la vez.

Regresión cubierta en dos niveles: `outbox.test.ts` traba el transporte en la
primera mutación, encola una segunda y comprueba que sale igual; y
`revisao.spec.ts` lo ejerce por el camino real de la pantalla.

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
│ Amostras: 88 ms · 91 ms · 92 ms · 95 ms · 97 ms · 97 ms · 111 ms · 112 ms · 115 ms
│ Até os 3 cartões pintados — melhor 88 ms · mediana 97 ms · pior 115 ms
│ Recursos baixados no arranque: 14
╰──────────────────────────────────────────────────────────────
```

**Mediana 97 ms: el objetivo se cumple.** Es de punta a punta —bajar el
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
| `assets/index-*.js` (entrada) | 285,6 kB | 89,9 kB |
| `assets/ui-*.js` (design system) | 268,3 kB | 86,5 kB |
| `assets/session-context-*.js` (router + query + contexto) | 227,0 kB | 71,7 kB |
| `assets/supabase-*.js` | 204,4 kB | 52,4 kB |
| `assets/chunk-*.js` | 88,6 kB | 29,0 kB |
| `assets/index-*.css` | 63,2 kB | 12,7 kB |
| `index.html` | 4,3 kB | 1,7 kB |
| `assets/deteccao-*.js` | 1,3 kB | 0,6 kB |
| **TOTAL** | **1.142,7 kB** | **344,5 kB** |

El `dist` entero son **42 archivos JS, 1.453,9 kB** entre todos los chunks por
ruta; el service worker precachea **64 entradas, 1.568 KiB**, que es lo que
hace que la app siga navegable entera en modo avión.

#### Por qué `supabase-*.js` sigue en el arranque

Es el chunk evitable más grande (52 kB gzip) y la primera pantalla no le pide
nada a la red, así que se miró en serio. **No se sacó, y el motivo importa
más que el número**: no es un `manualChunks` mal puesto, es la forma del
import.

`src/data/supabase.ts` crea el cliente en el cuerpo del módulo con un
`import` estático de `@supabase/supabase-js`, y **diez módulos lo importan de
forma síncrona** (`transport`, `sync`, `queries`, `revisao`, `realtime`,
`auth`, `ajustes`, `gestor`, `SessionProvider`, `host/auth`), con 26 puntos de
uso encadenados (`supabase.from(...).select().eq()`, `supabase.auth.…`). La
tela Hoje importa `@/data` para leer Dexie, así que el chunk entra por el
barril aunque no se haga una sola llamada.

Sacarlo pide convertir el singleton en un acceso asíncrono y tocar los diez
módulos — o sea, la cola del outbox, el pull, el realtime y la guardia de
sesión: exactamente el código del que depende el arranque sin señal. Un Proxy
que difiera la carga no sirve: los llamadores encadenan el builder de
PostgREST de forma síncrona.

La condición de la tarea era «sólo si no rompe el arranque offline», y esto no
se puede afirmar sin rehacer y volver a probar esas cuatro capas. Queda
anotado con el plan: cliente perezoso (`getSupabase(): Promise<SupabaseClient>`)
+ `await` en los diez consumidores + una prueba nueva de arranque en frío sin
red antes de tocar nada.

---

## 5 · Lo que se vio y NO se tocó

Los tres defectos de superficie que estaban acá se arreglaron: son 3.8, 3.9 y
3.10. Lo que queda anotado es esto, y nada de esto rompe un flujo.

1. **El chunk de Supabase sigue en el camino crítico.** 52 kB gzip que la
   primera pantalla no usa. Por qué no se sacó y qué haría falta, en 4.3.
2. **El service worker está apagado en desarrollo** (`devOptions.enabled:
   false`), así que ninguna prueba del dev server puede ejercitar el arranque
   en frío sin red. El precache se verifica en el build.
3. **Sembrar en Dexie por atrás no mueve el cache de TanStack Query**, que la
   app persiste y trata como fresco 60 s. No es un defecto —en producción solo
   escriben el sync y las mutaciones, y las dos invalidan lo que tocan— pero es
   una trampa para cualquiera que escriba una prueba nueva. El fixture lo
   documenta y lo evita arrancando en `/instalar`.
4. **La bandeja Revisão se siembra por el servidor y no por Dexie.** No es un
   defecto: `sincronizarRevisao()` pisa el `meta` local con lo que conteste el
   servidor, que es lo correcto en producción. Pero cualquiera que escriba una
   prueba nueva de esa pantalla tiene que usar `Semente.servidor` o va a ver la
   bandeja vaciarse sola en el primer render.
5. **La prueba del cierre de 60 s de la Golden Hour es la más frágil de la
   suite.** Espera un minuto de reloj de verdad, a propósito, y con dos workers
   peleando por el mismo dev server a veces no llega. Falla igual antes y
   después de este trabajo; se arregla corriendo `golden.spec.ts` sola.

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
| `01-hoje` | Los anillos, el botón de la Golden Hour y la primera tarjeta ENTERA (ver 3.8). En teléfono corto la racha bajó debajo de la lista |
| `02-hoje-por-que` | El chip «Por que isto?» abierto, con la cuenta señal por señal |
| `03-carteira` · `04-dossie` | La lista y la ficha con el hexágono PPVVCC |
| `05-editor-de-escala` | El editor con la regra da prova (botón Salvar visible, ver 3.6; sin desborde horizontal, ver 3.9) |
| `06-golden-abertura` · `07-golden-foco` · `08-golden-fechamento` | El bloque entero |
| `09-registrar-confirmacao` | La tarjeta de confirmación con el gate de fecha |
| `10-cadencia` … `15-ajustes` | Cadência, Placar, Rituais, Ventus, Mais, Ajustes |

---

## 7 · Salida real de la última corrida

```
$ npx playwright test
Running 117 tests using 2 workers
...
  6 skipped
  111 passed (7.9m)
EXIT=0
```

Los 6 salteados son las capturas, que solo corren con `CAPTURAS=1`. Los 111 son
37 pruebas × 3 perfiles.

```
$ npx tsc --noEmit -p tsconfig.e2e.json
EXIT=0

$ npm run type-check
EXIT=0   (los 3 proyectos)

$ npx vitest run
 Test Files  45 passed (45)
      Tests  869 passed (869)

$ npx eslint . --max-warnings 0
EXIT=0
```

### Antes de este trabajo, con la misma máquina y el mismo comando

```
$ npx playwright test
  3 failed
    [mobile] › e2e/dossie.spec.ts:42:3 › acima de 5 não passa sem evidência
    [mobile-pixel7] › e2e/golden.spec.ts:111:3 › o fechamento se destrava sozinho aos 60 segundos
    [desktop] › e2e/golden.spec.ts:111:3 › o fechamento se destrava sozinho aos 60 segundos
  6 skipped
  84 passed (7.1m)
```

Las tres eran parpadeos, no regresiones: las tres pasan corriendo su archivo
solo. Se dejan escritas igual, porque la comparación honesta es contra lo que
la máquina devolvió de verdad y no contra lo que el documento decía.
