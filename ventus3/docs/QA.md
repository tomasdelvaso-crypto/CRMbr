# QA de punta a punta — Ventus v3

> Fecha de corte: **2026-08-27** · rama `claude/crm-web-app-redesign-f7tu7g`
>
> Este documento dice **qué se prueba**, **cómo se corre** y **qué encontró**.
> Los números son salidas reales pegadas de la corrida, no estimaciones.
>
> **Última vuelta: la sesión real.** El 26/08 el dueño del producto entró por
> primera vez con su usuario y reportó tres cosas; la suite entera estaba en
> verde y no veía ninguna. Lo que faltaba era una prueba que arrancara con el
> aparato **vacío** y dejara llegar todo por la red —sesión, vendedor, cartera—
> contra el **build de producción**. Esa prueba existe ahora (§2,
> `sessao-real.spec.ts` y `fluxo-completo.sessao-real.spec.ts`) y encontró dos
> defectos que ninguna otra podía ver: §3.14 y §3.15.
>
> **Y una vuelta más: el camino de vuelta.** El §3.14 arregló cómo ENTRAN las
> filas de `tasks`; la SALIDA seguía rota y ninguna prueba podía verlo, porque
> el doble de red contestaba `201` a cualquier POST. Ahora **valida cada cuerpo
> contra el esquema real** y eso destapó **cinco** escrituras que Postgres
> rechazaba con un 400 que nadie veía: §3.16.
>
> **Y la vuelta del 27/08: el hardware real.** El dueño usó la app por primera
> vez en su Android (~355-360 px CSS) y reportó **cinco** bugs. La suite estaba
> verde y no veía ninguno: corría a 390x844 y a 1280x900, y movía el scroll con
> la **rueda**, no con un dedo. Dos proyectos nuevos a 360 px y el gesto táctil
> de verdad (CDP) cierran ese punto ciego, y el recorrido completo en una sola
> sesión encontró un defecto que ninguna prueba por pantalla podía ver — el
> botón «Enviar» del Ventus tapado por la bottom nav y por el FAB: §3-bis.

---

## 1 · Cómo se corre

```bash
cd ventus3
npm install                       # @playwright/test ya está en devDependencies

# El binario NO se baja: esta máquina no tiene salida. Ver «El navegador».
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

npx playwright test               # los 7 proyectos (192 pruebas, ~10 min)
npx playwright test --project=mobile --project=desktop   # sin rebuild de dist/
npx playwright test hoje.spec.ts -g "Pronto por hoje"

# La sesión real: contra el build de producción, con el doble de red.
npx playwright test --project=sessao-real-escritorio --project=sessao-real-telefone

# El Android del dueño (360x640). Ver §3-bis.
npx playwright test --project=golden-estreito     # la Golden Hour a 360 y a 355
npx playwright test --project=jornada-dono        # el relato completo, en una sesión

CAPTURAS=1 npx playwright test --project=mobile capturas.spec.ts   # docs/capturas/
node scripts/medir-arranque.mjs                                     # peso + arranque real
npx tsc --noEmit -p tsconfig.e2e.json                               # tipos de e2e/
```

**No hace falta levantar nada a mano.** `playwright.config.ts` arranca el dev
server en el puerto 5288 con su propio ambiente y lo apaga al terminar. Si ya
hay uno escuchando ahí, lo reusa. El segundo servidor —`npm run build && vite
preview` en el 5289, para los dos proyectos de sesión real— **nunca** se reusa,
a propósito: ver §7.

> ⚠️ **Si una corrida anterior dejó un `vite preview` vivo en el 5289, la suite
> no arranca**: falla de entrada con `http://127.0.0.1:5289 is already used`.
> Justamente porque ese servidor **no** se reusa. Matá el árbol de procesos de
> los puertos 5288 y 5289 antes de correr. Ver §7.

> ⚠️ **No toques ningún archivo del repo mientras la suite corre.** El watcher
> de Vite recarga la página en medio de las pruebas y mueren con «Execution
> context was destroyed». Ya se pagó dos veces; la última está documentada en §7.

### El navegador

La máquina tiene Chromium 141 (revisión 1194) en `PLAYWRIGHT_BROWSERS_PATH` y
este `@playwright/test` espera la revisión 1234, así que la resolución
automática no lo encuentra. La config le pasa el `executablePath` a mano
(`/opt/pw-browsers/chromium`, o `PLAYWRIGHT_CHROMIUM_PATH` si querés otro).
**Nunca correr `playwright install`**: esta máquina no tiene salida para
bajarlo.

Los tres proyectos corren sobre ese mismo Chromium:

| Proyecto | Perfil | Sirve | Para qué |
|---|---|---|---|
| `mobile` | iPhone 14 (390×664, DPR 3, touch) | dev server | El teléfono más chico del equipo. Es donde aparecen los problemas de espacio. |
| `mobile-pixel7` | Pixel 7 (412×915, touch) | dev server | El Android del equipo, pantalla larga. |
| `desktop` | 1280×900, sin touch | dev server | Teclado, foco visible y el Painel do Gestor. |
| `sessao-real-escritorio` | 1440×900 | **`dist/`** | El monitor del reporte. El camino login → sesión → vendedor → datos → pantalla, contra el bundle de producción. |
| `sessao-real-telefone` | 390×844 | **`dist/`** | Lo mismo, en el tamaño donde vive el equipo. |

Los dos últimos son **la sesión real** y no corren contra el dev server: sirven
`dist/` con `vite preview`, o sea el MISMO bundle que publica Vercel, con el
service worker registrado. El `dist/` se **reconstruye en cada corrida** a
propósito (`reuseExistingServer: false`): un preview olvidado sirve el build de
antes del arreglo y da un verde falso. Cuestan ~40 s de build; si molestan en
local, `--project=mobile --project=desktop`.

Sólo esos dos hablan con el host real de Supabase — y no lo hacen: ver el
candado 3, abajo.

Los descriptores de iPhone piden WebKit; acá se conserva la pantalla, el DPR,
el user agent y el touch, y se cambia el motor a Chromium. Es emulación de
**forma**, no de motor, y está dicho en el archivo.

### La base de producción no se toca. Tres candados

1. El dev server de las pruebas arranca con
   `VITE_SUPABASE_URL=https://stub.supabase.test`, un host que no existe. La
   URL real (`wtrbvgqxgcfjacqcndmb`) no entra en el bundle de prueba: aunque
   una prueba quisiera escribirle, no la tiene.
2. El fixture intercepta ese host con un doble de PostgREST y **aborta**
   cualquier pedido a `*.supabase.co` / `*.supabase.in`.

3. Los dos proyectos de **sesión real** sí llevan el host de producción en el
   bundle —no podrían probar el camino de login si no—, y por eso
   `instalarSupabaseDeRede()` intercepta a nivel de **contexto** (no de página:
   los pedidos que salen del service worker no pasan por `page.route`) todo lo
   que apunte a ese host, y contesta con un doble. Ese doble es de **sólo
   lectura hacia afuera**: los POST/PATCH se responden con un 2xx de mentira y
   jamás tocan la base. La prueba, además, verifica al final que **todo** lo que
   la app pidió lo contestó el doble; si algo se escapara, falla. Y el host vive
   **sólo en el fixture**, nunca en un arrancador de pruebas:
   `stub-de-teste.test.ts` lo comprueba.

`scripts/medir-arranque.mjs` compila a `dist-qa/` con el mismo ambiente de
prueba: nunca pisa `dist/` ni puede hablarle a la base real.

### Cómo se siembran los datos

Hay **dos** caminos, y la diferencia entre los dos es la que dejó pasar el bug
del 26/08.

**A · Por Dexie** (`e2e/fixtures/app.ts`) — lo que usan las pruebas de pantalla.
**B · Por la red** (`e2e/fixtures/supabase-red.ts`) — lo que usan los dos
proyectos de sesión real. Sirve las **filas reales** de producción del 26/08,
con la forma exacta que devuelve PostgREST, y hace pasar a la app por el camino
completo: `POST /auth/v1/token` → sesión con JWT → `GET /rest/v1/vendors` →
pull de la cartera → pantalla.

El camino A siembra Dexie con las entidades **ya construidas con la forma
local**, así que salta el paso de traducir la fila del servidor — que era
justamente el que fallaba (§3.14). Una suite entera en verde no lo veía. Si
cambia el esquema hay que refrescar el fixture B consultando la base por MCP,
**nunca inventando columnas**.

Lo que sigue describe el camino A.

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

### `sessao-real.spec.ts` — el primer login del dueño del producto (9 pruebas × 2 tamaños)

El único archivo que arranca con el aparato **vacío** y hace que todo —sesión,
vendedor, cartera— llegue por la red, contra el build de producción. El resto de
la suite no podía ver el bug del 26/08 justamente por eso: `fixtures/app.ts`
siembra Dexie con tareas ya construidas **con la forma local**, así que salta el
único paso que fallaba (traducir la fila del servidor).

- Login real por el formulario → la sesión resuelve al vendedor → Hoje muestra
  **las 3 tarjetas** y no «Baixando a sua carteira». Es la regresión.
- **Ningún control visible queda debajo de otra cosa**, en 5 rutas × 2 viewports:
  `elementFromPoint` sobre el centro de cada `button`, `a[href]` y `[role=switch]`
  con todos los scrollers al fondo. Sólo se juzga la franja que el chrome fijo
  deja libre —el contenido pasa por debajo del header y de la nav **por diseño**,
  y se llega scrolleando—; lo que busca es una capa que no debería estar ahí.
- Con una tabla caída a mitad del pull, **lo que sí bajó igual llega a la
  pantalla**.
- Sin vendedor ligado, hay una **salida** («Tentar de novo») en vez de un
  esqueleto eterno, y la navegación sigue viva.
- Con el vendedor tardando 2 s, la app **espera** en vez de mostrarse cargada sin
  responder.
- **El rol se ve**: Tomás (`is_admin`) ve el chip «Administrador» y entra a
  `/gestor`; Renata ve «Vendedor», no ve la entrada del Painel, y si escribe
  `/gestor` a mano ve la guardia con su botón «Voltar». Las dos son las filas
  **reales** de `vendors`.
- **Lo que sale hacia Postgres tiene la forma de la tabla** (las dos últimas, de
  §3.16). No miran la pantalla: miran **el cuerpo que viajó**. «Adiar» de Hoje y
  el gate de Registrar tienen que producir un INSERT que el doble acepte —con
  `titulo`, `client_uuid` = `id`, y sin `kind`/`title`/`snoozed_until`/`target`—,
  «Reagendar» del Dossiê un PATCH con `snoozed_to`, y el **outbox del aparato
  tiene que volver a cero**, leído del IndexedDB real. Un ítem que sobrevive ahí
  es exactamente el badge que no baja nunca.

### `fluxo-completo.sessao-real.spec.ts` — el recorrido entero (2 pruebas × 2 tamaños)

La prueba de fuego: **una** sesión, de punta a punta, sin recargar, con
**21 clicks reales** en cada viewport. Es la diferencia entre «el botón existe y
está encima de todo» y «el botón hace lo que dice»: cada paso exige las cuatro
cosas —se ve, `elementFromPoint` lo devuelve a él, se lo clickea, y algo
observable cambia (la URL, un diálogo, un `aria-checked`, un texto nuevo)—. Un
click que no deja rastro no cuenta como respondido.

El recorrido: login → Hoje → «Por que isto?» (abrir y cerrar) → «Adiar» → sheet
de fecha y elegir otra → Carteira → Dossiê con morph → editor de escala y un
nivel canónico → volver → Mais con el chip «Administrador» → Painel do Gestor y
una pestaña → Ajustes y el stepper de la meta → Sair con su confirmación →
`/login`. Escribe `docs/capturas/fluxo-{desktop,mobile}-*.png` **después** de
cada aserción, así que las capturas muestran un estado ya verificado.

La segunda prueba es la regresión de §3.15: elegir una fecha no puede hacer
desaparecer el sheet.

Dos detalles del arnés, que se pagaron con dos rojos falsos:

- **La alcanzabilidad se mide con `expect.poll`, no una vez.** Los sheets entran
  animando desde abajo; medir en el frame en que `toBeVisible()` pasa agarra al
  control todavía en viaje. Una persona también espera a que el sheet suba.
- **El control se centra antes de medir** (`scrollIntoView({block:'center'})`, no
  `scrollIntoViewIfNeeded()`). El chrome fijo se apoya sobre el contenido por
  diseño y a todo se llega scrolleando: dejar el control pegado al borde lo
  reporta «tapado» por la nav o por el pie del sheet cuando en la app real se
  clickea sin problema.

### `capturas-desktop.sessao-real.spec.ts` — el layout de escritorio (2 pruebas)

No es sólo vitrina: verifica que el rail esté presente (y que sea **vertical**,
midiendo su caja), que la BottomNav no ocupe lugar, y que los anchos por ruta se
apliquen. Es la regresión concreta de «está en formato para celular a pesar de
ser web». Escribe `docs/capturas/desktop-{1440x900,1920x1080}-*.png`.

### `capturas.spec.ts` — vitrina, apagada por defecto

No afirma nada: escribe `docs/capturas/`. Corre solo con `CAPTURAS=1`.

---

## 3 · Qué encontró: 16 defectos, arreglados

Todos se encontraron con el navegador, no leyendo el código, y todos están
corregidos en esta rama. Del 3.1 al 3.7 son de la primera pasada; del 3.8 al
3.13, de la segunda —los tres de superficie que habían quedado anotados en §5 y
tres que aparecieron al escribir la cobertura que faltaba—. El 3.14 y el 3.15
son de la vuelta de la **sesión real**: el primero es el que el dueño del
producto reportó como «no puedo accionar ningún botón», el segundo apareció
recorriendo el camino entero para comprobar que el primero estaba cerrado. El
3.16 es la otra mitad del 3.14 —el camino de **escritura**— y son cinco
escrituras rotas contadas como una: ninguna se veía en pantalla, porque el 400
de Postgres muere adentro del outbox.

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

### 3.14 · `src/data/conflicts.ts` — la fila del servidor no tenía la forma que el motor lee

**El defecto del reporte.** En Postgres la fila de `tasks` es
`{titulo, opportunity_id, lead_id, snoozed_to, origem, prioridade…}`;
`core/types.Task` es `{title, target: EntityRef, snoozed_until, kind}`.
`aplicarRemoto()` escribía la fila **cruda** en Dexie y
`core/planner.indexarTasks()` hacía `t.target.kind` sobre cada tarea `pending`:

```
TypeError: Cannot read properties of undefined (reading 'kind')
```

Ese throw sube por `rankDay()` → `fetchPlanoFixado()` → la query `plano` de
Hoje. TanStack Query conserva el último dato bueno cuando la query falla, y el
último dato bueno era el del arranque en frío con Dexie vacía: `carteiraVazia`.
Resultado en pantalla, **para siempre y sin ningún error visible**: tres
esqueletos grises y «Baixando a sua carteira. Isso acontece uma vez só.». Sin
las tres tarjetas no existen «Fazer agora», ni «Adiar», ni «Por que isto?»: no
hay nada que tocar. Ni esperar ni navegar y volver lo arreglaban.

Por qué la suite no lo veía: hasta el backfill del 26/08 la tabla `tasks` del
servidor estaba **vacía**, las tareas que crea la app se escriben con la forma
local, y `e2e/fixtures/app.ts` siembra Dexie con tareas ya construidas. La suite
entera salteaba justo el paso que fallaba. **No era sólo Tomás**: las 36 filas
del backfill están todas en `pending`, así que se rompía el Hoje de los 5
vendedores con tareas.

**Arreglo:** `normalizarRemoto()` al tope de `aplicarRemoto()` —el único camino
de entrada de datos remotos, lo usan el pull **y** realtime, y normalizar antes
del merge es lo que hace que `mergeByField` compare local contra remoto con la
misma forma—. Conserva las columnas crudas junto a las normalizadas: el PATCH
del outbox manda sólo los campos que tocó, con nombres de Postgres.

Y cuatro defensas más, que salieron de reproducirlo: el guard de
`indexarTasks()` (una tarea rota puede costar una tarjeta, nunca el plan del día
entero), el aislamiento por tabla de `pull()` (antes un fallo abortaba el bucle
**y** se comía `notificarMudancas()`, el único aviso que invalida el cache), la
resolución del vendedor con reintentos y estado terminal, y los `sr-only` de
`SwipeRow` que medían 44×44 de verdad y tapaban el borde derecho de cada fila de
la Carteira (4 controles muertos en `/carteira`, en los dos tamaños).

Regresión cubierta en `src/data/__tests__/tasks-do-servidor.test.ts` y, por el
camino real, en `sessao-real.spec.ts`. Sin el arreglo, esa prueba falla con
«element(s) not found» buscando las tarjetas.

### 3.15 · `src/ui/Sheet.tsx` — elegir una fecha hacía desaparecer el sheet

No lo reportó nadie porque no se ve como un error: se ve como que la app se
congeló. En «Adiar» (tela Hoje), **tocar una fecha hacía desaparecer el sheet**
—y con él la fecha recién elegida y el botón que la confirma— mientras la app
seguía en modo modal: scroll bloqueado, foco atrapado en un panel invisible,
nada que tocar.

El `useLayoutEffect` que coloca el **punto de partida** de la animación de
entrada (`y.set(alturaRef.current)`: el panel entero por debajo del borde)
depende de `footer`, que es un ReactNode que la pantalla de arriba vuelve a
crear en **cada** render. En un sheet **sin `snapPoints`** el reposo abierto es
exactamente `y === 0`, así que el primer re-render del padre con el sheet
abierto cumplía la condición y teletransportaba el panel un alto entero hacia
abajo. El efecto que anima no depende de `footer`, así que no volvía a correr.

Medido en el build de producción, en los dos tamaños:

```
adiar-aberto        painel.top = 435   transform: none
después de «+7d»    painel.top = 844   transform: translateY(409px)
1,7 s más tarde     painel.top = 844   (no vuelve)
```

Afectaba a los sheets sin snaps y con pie propio: «Adiar» de Hoje y de Carteira,
Filtros, los cuatro Rituais, Próximo Passo, Kudos, Descartar y Editar Campo da
Revisão. Los que tienen snaps se salvaban de casualidad —su reposo abierto no es
0, sino el offset del snap—. Es **preexistente**: el efecto está así desde que
existe el componente.

**Arreglo:** un candado de un ref. La colocación inicial ocurre **una vez por
apertura**; la medición del alto y la reserva del pie siguen corriendo cuando el
contenido cambia, que es para lo que están.

Regresión en `fluxo-completo.sessao-real.spec.ts`. Se comprueba por los **dos
controles de borde** del sheet —el botón del pie y el «Fechar»— y no por la caja
del panel: cuando el panel se escapa hacia abajo, en un monitor alto su borde
superior sigue dentro de la ventana (top 635 en 900 px) y una prueba que mire
eso da verde con el sheet roto. Sin el arreglo, la prueba falla en los dos
tamaños con «o botão do rodapé não recebe o clique: nada: o centro do alvo cai
fora da janela».

### 3.16 · El camino de ESCRITURA de `tasks` — cada tarea nueva moría en un 400

La otra mitad del §3.14, y la más cara de las dos. Aquel arregló la **entrada**:
la fila que llega del servidor (`titulo`, `opportunity_id`, `snoozed_to`) se
traduce a la forma que el motor lee. La **salida** hacía lo inverso mal.

`public.tasks` tiene 22 columnas y ninguna se llama `kind`, `title` ni
`snoozed_until`. `mutations.criarTask` encolaba las tres:

```
POST /rest/v1/tasks
{"kind":"next_action","title":"Levar a prova…","opportunity_id":89,…}
→ 400 {"code":"PGRST204",
       "message":"Could not find the 'kind' column of 'tasks' in the schema cache"}
```

**Y ese 400 no se ve en ninguna parte.** `outbox.ts` clasifica un 4xx como
`permanente`: el ítem no se descarta, se queda en la cola del teléfono con su
`ultimo_error` y el badge de pendientes que ya no baja **nunca**. El vendedor
registra la visita, la pantalla le dice que sí y la tarjeta aparece en Hoje
—todo eso es la copia optimista de Dexie— y el servidor no se entera jamás. Es
peor que un error visible: la app miente y el equipo le cree.

Eran **cinco** defectos del mismo camino, no uno:

| # | qué salía | qué dice la tabla | resultado |
|---|---|---|---|
| 1 | `kind`, `title` (`criarTask`) | no existen: la columna es `titulo`, y `kind` no tiene ninguna | `400 PGRST204` |
| 2 | `snoozed_until` (`adiarTask`) | la columna es `snoozed_to` | `400 PGRST204` |
| 3 | `status:'done'` solo (`concluirTask`) | CHECK `tasks_done_chk` exige `done_at` | `400 23514` |
| 4 | `status:'done'` solo (Ritual da Sexta) | el mismo CHECK | `400 23514` |
| 5 | `status:'dismissed'` (Ritual da Sexta) | `tasks_status_chk` sólo acepta `pending/done/snoozed/cancelled` | `400 23514` |

Los dos últimos los encontró el verificador final: `rituais.registrarVeredicto()`
es el **tercer** escritor de `tasks` y nadie lo había mirado. El 5 es el más
traicionero de los cinco, porque `status` **sí** es una columna: la lista de
columnas lo deja pasar y lo que no encaja es el **valor**. El veredicto
«parcial» o «não rolou» de la sexta se quedaba clavado en el teléfono.

**Arreglo: `desnormalizarLocal()` (`src/data/conflicts.ts`), el espejo exacto de
`normalizarRemoto()`, aplicada en `transport.ts` — en el FLUSH, no en el
enqueue.** Esa elección es el corazón del arreglo: hay ítems **ya encolados con
la forma vieja** en los teléfonos del equipo, y nadie los va a reescribir.
Traduciendo en el camino de salida, el próximo flush después de actualizar la
app los **sana solos**. Si la traducción viviera en `mutations.ts`, el arreglo
llegaría con la versión nueva y la cola quedaría envenenada igual.

Traduce cuatro cosas y descarta una quinta:

```
title            → titulo                    (rename de NOMBRE)
snoozed_until    → snoozed_to                (rename de NOMBRE)
target:{kind,id} → opportunity_id / lead_id  (un campo local, dos columnas)
status:'dismissed' → 'cancelled'             (rename de VALOR)
kind, uid, pendente → se caen: no tienen columna
```

Lo demás se filtra contra `COLUNAS_TASKS`, la lista de las 22 columnas reales
leída por MCP contra `information_schema` el 26/08. Nada que no esté ahí viaja.

**La segunda mitad del arreglo, que es la que no se ve:** `campos_tocados`
también se traduce, y `nomesEquivalentes()` expande los dos nombres de cada
campo renombrado dentro de `aplicarRemoto()`. Sin eso se rompía la **regla
dura**: el vendedor adia una tarea (mutación pendiente sobre `snoozed_until`),
llega por realtime la fila del servidor con `snoozed_to`, `mergeByField` no
encuentra `snoozed_to` entre los pendientes y el valor viejo **pisa el
adiamiento**. O sea: arreglar el 400 sin esto habría comprado el bug «mi cambio
se revirtió solo», que es el que no se perdona.

**Por qué la suite no lo veía, y qué se cambió para que no vuelva a pasar.** El
doble de red contestaba `201` a cualquier POST y `200` a cualquier PATCH: con
eso, las cinco escrituras rotas daban verde. Ahora
`e2e/fixtures/supabase-red.ts` **valida cada cuerpo contra el esquema real** —
una clave que no es columna vuelve como `400 PGRST204` y un CHECK violado como
`400 23514`, con la misma forma de error que PostgREST. Las listas de columnas y
los CHECK son copia literal de `information_schema` y `pg_constraint`,
verificadas por MCP el 26/08 contra `tasks`, `activities` y `touchpoints` — no
se inventa una columna para que un test pase.

**Lo que viaja hoy**, capturado del doble en el build de producción (Tomás,
1440×900): «Adiar» de Hoje, el gate de Registrar y «Reagendar» del Dossiê.

```
POST /rest/v1/tasks → 201
{ "opportunity_id": 89, "lead_id": null,
  "titulo": "Conversar com Mora para levar Poder de 0 para 1: …",
  "id": "07b1cde3-8661-405e-a509-8e4d04f0e7f1",
  "vendor": "Tomás", "due_date": "2026-08-27", "status": "pending",
  "prioridade": 2, "origem": "planner", "canal": "meeting",
  "target_scale": "poder",
  "client_uuid": "07b1cde3-8661-405e-a509-8e4d04f0e7f1" }

POST /rest/v1/tasks → 201
{ "opportunity_id": 89, "lead_id": null,
  "titulo": "Levar a prova de 1000 caixas",
  "id": "8de6c4ab-1ab4-4678-86ae-950c0fc12dcb",
  "vendor": "Tomás", "due_date": "2026-08-27", "status": "pending",
  "prioridade": 2, "origem": "ia", "canal": "call",
  "client_uuid": "8de6c4ab-1ab4-4678-86ae-950c0fc12dcb" }

PATCH /rest/v1/tasks?id=eq.… → 200
{ "snoozed_to": "2026-09-02", "status": "snoozed", "due_date": "2026-09-02" }

RECHAZADAS POR EL DOBLE: []
OUTBOX DEL APARATO:      []
```

Las tres cosas que había que ver están ahí: **ninguna clave inventada** (`kind`,
`title`, `snoozed_until` y `target` no aparecen), **`id` = `client_uuid`** —el
mismo uuid local, para que la fila que vuelva del pull sea la MISMA tarea y no
una segunda al lado de la optimista— y el **PATCH con `snoozed_to`**. El outbox
vuelve a **cero**: el badge de pendientes baja.

Regresión cubierta en tres capas:

- `src/data/__tests__/tasks-para-o-servidor.test.ts` (22 pruebas): la traducción
  campo por campo, la **ida y vuelta** local→pg→local, los ítems ya encolados
  con la forma vieja sanando en el flush, y los tres escritores.
- `e2e/sessao-real.spec.ts` (2 pruebas × 2 tamaños): los dos caminos reales del
  vendedor mirando **el cuerpo que viajó**, no la pantalla, y exigiendo que el
  outbox del aparato quede vacío.
- El doble, que ahora rompe solo si alguien vuelve a mandar una clave inventada.

Se comprobó que las pruebas **fallan sin el arreglo** antes de darlas por
buenas: desactivando las dos líneas del mapeo, `3 failed | 19 passed`.

---

## 3-bis · Hardware real: el primer test en el Android del dueño

> Fecha: **2026-08-27**. Aparato: Android, **~355-360 px CSS de ancho**, PWA
> instalada, tema oscuro. El dueño reportó **cinco** bugs con capturas. La
> suite entera estaba en verde y **no veía ninguno**.

Es el mismo patrón del §3.14/§3.15 y conviene decirlo sin adornos: cada vez que
alguien usa el producto en un aparato que la suite no emula, aparecen defectos
que la suite no puede ver. Acá el punto ciego era el **tamaño**: toda la suite
corría a 390x844 (iPhone 14) y 1280x900, y su teléfono es **más angosto y más
bajo**. A 390 px el HUD de la Golden Hour entra en una fila; a 360 no.

Y un punto ciego de **método**: el scroll de las pruebas era rueda (`mouse.wheel`)
o JS (`scrollIntoView`), que no ejercitan `touch-action`. Un dedo sí.

### Lo que se agregó a la suite

| Archivo | Proyecto | Qué cubre |
|---|---|---|
| `e2e/golden-estreito.spec.ts` | `golden-estreito` (360x640 y 355x700) | HUD sin superposiciones, scroll interno del card con **toque real**, cierre de 60 s, apertura |
| `e2e/toque-real.spec.ts` | mobile · mobile-pixel7 · desktop | pan vertical con **gesto táctil de verdad** (CDP `Input.dispatchTouchEvent`) en las 5 rutas diarias |
| `e2e/teclado-ventus.spec.ts` | mobile · mobile-pixel7 · desktop | el compositor por encima del teclado, con `visualViewport` falso |
| `e2e/resiliencia.spec.ts` | mobile · mobile-pixel7 · desktop | un 500 no deja el teléfono mudo; el texto del error dice de quién es el problema |
| `e2e/jornada-dono.spec.ts` | `jornada-dono` (360x640) | **el relato completo, en una sola sesión**, sin recargar el bundle entre pasos |

Los dos proyectos nuevos (`golden-estreito`, `jornada-dono`) corren **sólo** sus
archivos: el resto de la suite ya está cubierto por `mobile`/`mobile-pixel7` y
duplicarla a 360 px alargaría la corrida sin agregar nada.

### Por qué existe `jornada-dono.spec.ts` además de los otros cuatro

Porque los otros cuatro prueban **su** bug en aislamiento, arrancando de una app
recién montada. El dueño no hizo eso: hizo **una sesión sola**, entrando y
saliendo de las pantallas con el mismo bundle vivo. Un latch que sobrevive a un
cambio de ruta o un `--spacing-chrome` que quedó escrito de la pantalla anterior
no se ven probando cada pantalla de cero.

El recorrido, en orden y sin recargar:

```
Golden Hour (nada encimado · scroll interno con el dedo · 4 botones visibles)
  → cierre por el ritual completo de 60 s
  → /placar (swipe TÁCTIL vertical mueve el scroll)
  → /ventus (nada fijo tapa el compositor)
  → teclado simulado (se ve el texto Y el botón de enviar)
  → pregunta 1: el servidor devuelve 500  → texto honesto, NO «sem conexão»
  → pregunta 2: el servidor devuelve 200  → la respuesta viene de la API
```

### 3-bis.1 · El defecto que sólo el recorrido completo podía encontrar

**En `/ventus` el botón «Enviar» no se podía tocar.** El compositor es `sticky`
—sin `z-index`— y **dos** capas fijas `z-40` le caían encima:

- **La bottom nav** (`fixed inset-x-0 bottom-0 z-40`). Un `sticky bottom: 0` se
  pega al borde del **scrollport**, o sea del viewport, que es exactamente donde
  vive la nav. El `pb-nav-safe` del `<main>` empuja el contenido **en flujo**,
  pero a un `sticky` no lo mueve.
- **El FAB flotante «Registrar por voz»** (`fixed right-4 z-40`), que además
  **sobra** en esta pantalla: el compositor ya trae su propio botón «Ditar».

Medido, con el campo lleno (con el campo vacío «Enviar» está deshabilitado y el
click falla por otra razón):

```
[360x640] Enviar = {"x":293,"y":585,"width":44,"height":44}
          nav    = {"x":0,"y":575,"width":360,"height":65}     ← se pisan
[360x780] FAB    = {"x":288,"y":644,"width":56,"height":56}
          Enviar = {"x":293,"y":608,"width":44,"height":44}     ← se pisan
```

Y el error literal de Playwright, con los dos culpables alternándose:

```
- <nav aria-label="Navegação principal" class="fixed inset-x-0 bottom-0 z-40 …">
    subtree intercepts pointer events
- <button aria-label="Registrar por voz" class="fixed right-4 z-40 …">
    subtree intercepts pointer events
```

En un teléfono de verdad eso es: **el vendedor escribe la pregunta y no la puede
mandar**, y si apunta bien al botón, abre la grabadora. Se ve en
`docs/capturas/hardware-real/ventus-compositor-tapado-antes.png` — el texto
tecleado queda cortado a media palabra detrás de la nav y del botón de enviar no
hay rastro.

**Por qué ninguna prueba lo veía.** `resiliencia.spec.ts` lo había esquivado a
propósito mandando la pregunta con **Enter**, con el solapamiento documentado
como pendiente de otro frente. El dueño no tiene tecla Enter, tiene un dedo.

**Y por qué casi se nos escapa otra vez**: la primera versión de
`jornada-dono.spec.ts` tocaba con `page.touchscreen.tap(x, y)`, que dispara el
toque en una **coordenada a ciegas** y «acierta» aunque haya algo encima — pasó
en verde con el botón tapado. Se cambió a `enviar.tap()`, el **locator**, que sí
hace el hit-test de Playwright.

**El arreglo**, en tres archivos:

- `src/screens/Ventus/Conversa.tsx` — el `bottom` del sticky deja de ser `0` y
  pasa a `calc(var(--spacing-nav-visivel) + var(--safe-bottom))` cuando **no**
  hay teclado. Con teclado sigue siendo `alturaTeclado`: la nav queda ella misma
  detrás del teclado (en Android el layout viewport no se achica), así que
  reservar su alto otra vez sería un hueco muerto. Es la misma bifurcación que
  ya hacía `Registrar/index.tsx` para su barra fija.
- `src/screens/Ventus/rotas.ts` — `microfoneFlutuanteVisivel()` y
  `ROTAS_COM_COMPOSITOR_PROPRIO`, junto a `ROTAS_SEM_BARRA`, que es donde ya
  vivían las reglas de qué ocupa el pie de cada ruta.
- `src/app/Shell.tsx` — el FAB **flotante** pasa a tener una regla más estricta
  que el micrófono del `DesktopRail` o el de la barra. El del rail no entra en
  el pleito: vive en una columna propia y el FAB ya es `lg:hidden`.

**Se comprobó que la prueba falla sin el arreglo**, y cada mitad por separado.
Con los dos revertidos:

```
Error: o FAB flutuante não pode existir em /ventus: tapa o «Enviar» do compositor
  Expected: 0   Received: 1
```

Restaurando sólo el arreglo del Shell (el FAB ya no está) y dejando el
compositor viejo, salta la otra mitad con la geometría exacta:

```
Error: «botão Enviar» ({"x":293,"y":585,"width":44,"height":44})
       se sobrepõe a «bottom nav» ({"x":0,"y":575,"width":360,"height":65})
```

Después: `ventus-compositor-tapado-depois.png` — las tres líneas del texto
legibles, «Ditar» dentro del campo, el botón de enviar visible y todo por encima
de la nav.

### 3-bis.2 · Lo que NO hizo falta arreglar

El bug C («Placar da Semana no scrollea») **no era de `touch-action`**. La
auditoría no encontró ningún `touch-action: none` ni `pan-x` heredado sobre
contenido vertical: los carruseles usan `overflow-x-auto` nativo y no hay
librería de gestos en el proyecto (`@use-gesture` no está en `package.json`).
`toque-real.spec.ts` queda igual, como **red**: si algún cambio futuro le pone
`touch-action: none` a un contenedor por accidente, esas seis pruebas lo agarran.

El sospechoso que queda para el aparato del dueño es el **bundle viejo del
Service Worker** (bug A): con el JS roto de aquel día, cualquier handler puede
quedar sin adjuntarse, la pila de touch incluida.

---

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

0. ⚠️ **El camino de ESCRITURA de `tasks` está roto, y ninguna prueba lo cubre.**
   `mutations.criarTask` encola un payload con `kind`, `title` y `snoozed_until`;
   la tabla real no tiene ninguna de las tres (verificado contra
   `information_schema` el 26/08: son `titulo`, `snoozed_to`, `origem`, y
   `client_uuid`/`due_date` son `NOT NULL`). Cada «Registrar» crea una tarea que
   PostgREST rechaza: queda en Dexie y en el outbox reintentando para siempre.
   La suite no lo ve porque el doble de red contesta 201 a todo POST — y ahí
   está el límite honesto de un doble: prueba la FORMA de lo que la app lee, no
   valida lo que escribe. Es lo primero que hay que mirar, y es lo que decide si
   la próxima acción del vendedor llega al servidor. **Ojo al arreglarlo:**
   `campos_tocados` se compara contra nombres de campo LOCALES en
   `mergeByField`, así que la traducción va en el transporte, no en el payload.
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

### Nota de despliegue: la pantalla en blanco de `ventus3.vercel.app`

Va acá porque es un diagnóstico que costó y que ninguna prueba de este
documento podía dar: el harness compila con su propio ambiente y nunca ve la
configuración de Vercel.

La anon key estaba cargada en Vercel como **variable sensible**. Una variable
sensible se descifra sólo en tiempo de ejecución y **nunca llega al build**, así
que Vite inlineaba `VITE_SUPABASE_ANON_KEY` como `undefined`, el bundle abortaba
al importar el cliente y la app abría en blanco. Se arregla cargándola como
variable normal de build y redesplegando. Queda escrito para que nadie repita el
diagnóstico.

> Recuperado del mensaje del commit `5a93c17`: ese commit se llevó por delante
> la nota original al hacer `git commit` sobre un árbol que otra sesión estaba
> editando al mismo tiempo. Si el texto original decía algo más, vale el
> original.

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

### `docs/capturas/hardware-real/` — el antes y el después del 27/08

Las 18 fotos de los cinco bugs del Android del dueño, a **360 px** de ancho (no
a los 390 del resto). Cada par es el MISMO estado con el mismo dato sembrado;
lo único que cambia es el código.

```bash
# Golden Hour (HUD y card)
git stash push -- src/screens/GoldenHour/Hud.tsx src/screens/GoldenHour/CartaoContato.tsx
CAPTURAS=1 npx playwright test --project=golden-estreito -g antes
git stash pop
CAPTURAS=1 npx playwright test --project=golden-estreito -g depois

# El compositor del Ventus (§3-bis.1)
git stash push -- src/screens/Ventus/Conversa.tsx src/screens/Ventus/rotas.ts src/app/Shell.tsx
CAPTURAS=1 npx playwright test --project=jornada-dono -g antes
git stash pop
CAPTURAS=1 npx playwright test --project=jornada-dono -g depois
```

> ⚠️ Dos trampas al sacar el «antes», las dos pagadas:
>
> 1. **El `git stash` tiene que ser consistente.** Stashear `Conversa.tsx` solo
>    revierte también el `semCompositor` de otro frente y `BarraDeComando.tsx`
>    deja de compilar; como el segundo `webServer` corre `npm run build`, la
>    suite ni arranca (`Process from config.webServer was not able to start.
>    Exit code: 2`). O se stashea el conjunto que se sostiene, o se revierten a
>    mano **sólo** las líneas del arreglo.
> 2. **`-g "depois"` corriendo con el código viejo pisa la foto buena.** El
>    «depois» hay que volver a sacarlo después de restaurar el arreglo.

| | |
|---|---|
| `01-hoje` | Los anillos, el botón de la Golden Hour y la primera tarjeta ENTERA (ver 3.8). En teléfono corto la racha bajó debajo de la lista |
| `02-hoje-por-que` | El chip «Por que isto?» abierto, con la cuenta señal por señal |
| `03-carteira` · `04-dossie` | La lista y la ficha con el hexágono PPVVCC |
| `05-editor-de-escala` | El editor con la regra da prova (botón Salvar visible, ver 3.6; sin desborde horizontal, ver 3.9) |
| `06-golden-abertura` · `07-golden-foco` · `08-golden-fechamento` | El bloque entero |
| `09-registrar-confirmacao` | La tarjeta de confirmación con el gate de fecha |
| `10-cadencia` … `15-ajustes` | Cadência, Placar, Rituais, Ventus, Mais, Ajustes |

### Las de escritorio y las del recorrido (sesión real)

Estas **no** dependen de `CAPTURAS=1`: salen de los proyectos de sesión real, o
sea del build de producción con las filas reales de Tomás, y son la evidencia de
los tres problemas del reporte.

```bash
npx playwright test --project=sessao-real-escritorio --project=sessao-real-telefone
```

| | |
|---|---|
| `desktop-1440x900-{hoje,carteira,dossie}` | El layout de escritorio en el monitor del reporte: rail a la izquierda, sin BottomNav, anchos por ruta |
| `desktop-1920x1080-{…}` | Lo mismo en un 27" corriente |
| `fluxo-desktop-1…11` | El recorrido entero en 1440×900: Hoje → «Por que isto?» → Adiar → Carteira → Dossiê → editor de escala → Mais (chip «Administrador») → Gestor → Ajustes → Sair → login |
| `fluxo-mobile-1…11` | El mismo recorrido en 390×844 |

Las del recorrido se toman **después** de cada aserción: cada PNG muestra un
estado que la prueba ya verificó, no una pose.

---

## 7 · Salida real de la última corrida

### 27/08 — el verificador del hardware real

Sobre el árbol con las tres entregas de la ola del teléfono ya juntas
(resiliencia + Golden Hour angosta + toque/teclado), más el defecto del
compositor del Ventus que encontró el recorrido completo (§3-bis.1).

```
$ npm run type-check && npx tsc --noEmit -p tsconfig.e2e.json \
    && npx eslint . --max-warnings 0 && npx vitest run && npm run build
 Test Files  58 passed (58)
      Tests  990 passed (990)
   Duration  14.77s
✓ built in 1.35s
PWA v1.3.0 · precache 65 entries (1602.78 KiB)
EXIT=0
```

```
$ npx playwright test
  47 skipped
  192 passed (10.6m)
EXIT=0
```

Por proyecto: `mobile` 15 · `mobile-pixel7` 15 · `desktop` 9 ·
`golden-estreito` 4 · **`jornada-dono` 2** · `sessao-real-escritorio` y
`sessao-real-telefone` el resto. Los 47 salteados son las cuatro suites de
capturas, que sólo corren con `CAPTURAS=1`.

**192 contra las 190 de la corrida de la mañana**: las dos nuevas son el
recorrido del dueño. Los 10,6 min contra 9,9 son esas dos más el ritual de
cierre de 60 s de la Golden Hour, que el recorrido completo hace de verdad en
vez de saltearlo.

> Sobre el aviso del sandbox que dejó anotado el agente de la Golden Hour («no
> corrí la suite completa, el sandbox mata el dev server bajo la carga
> combinada»): **no se reprodujo**. La suite entera corrió **tres** veces de
> punta a punta en esta máquina (16 GB, 4 núcleos) con los dos `webServer`
> declarados y 2 workers. Si vuelve a aparecer, `--workers=1`.

#### Y el aviso de §1 se volvió a pagar, por tercera vez

Una de las tres corridas dio `1 failed`:

```
1) [mobile] › e2e/a11y.spec.ts:70:3 › as ações do swipe existem como botões de teclado
   Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
     at fixtures/app.ts:252   ← dentro de `semear()`, no en ninguna aserción
```

**No era una regresión**: se estaba editando `docs/ESTADO.md` mientras la suite
corría. El watcher de Vite recarga la página y el `page.evaluate` de la siembra
se queda sin contexto. La corrida siguiente, sin tocar **nada** —ni un `.md`—,
dio `192 passed · 0 failed · EXIT=0`.

Vale la pena que quede escrito con el error literal: las dos veces anteriores el
síntoma se atribuyó a «pruebas frágiles», y las tres veces fue lo mismo. **Un
`.md` cuenta como tocar el repo**: Vite observa la raíz del proyecto, no sólo lo
que está importado.

### 26/08 — el verificador del camino de escritura

Corrida del **verificador final** (26/08), sobre el árbol con las dos entregas
de la ola del camino de escritura ya juntas, más los dos defectos del Ritual da
Sexta que encontró él (§3.16).

```
$ npx playwright test
Running 143 tests using 2 workers
...
  6 skipped
  137 passed (8.1m)
EXIT=0
```

Los 6 salteados son `capturas.spec.ts`, que sólo corre con `CAPTURAS=1`. Los 137
son 39 pruebas × 3 perfiles de dev server, más **10 × 2** perfiles de sesión real
(contra `dist/`): 8 de antes más las dos de §3.16.

**8,1 min contra los 9,4 de la corrida anterior**, con cuatro pruebas más. La
diferencia es `golden.spec.ts:111` («o fechamento se destrava sozinho aos 60
segundos»), que era la prueba más frágil de la suite porque esperaba **60
segundos de reloj de pared** con 70 de presupuesto. Ahora usa `page.clock`: se
instala **después** de que el temporizador de `Fechamento` ya está corriendo
—instalarlo antes freezaría también las transiciones que llevan hasta ahí,
porque `page.clock` reemplaza `requestAnimationFrame`— y adelanta 60 s de reloj
falso. El intervalo real de 250 ms sigue latiendo y lee un `Date.now()` que ya
pasó la ventana. Misma prueba, un minuto menos, y deja de ser candidata a que
alguien la etiquete de *flaky*.

```
$ npm run type-check
> tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.worker.json
(sin salida)
EXIT=0   (los 3 proyectos: app, node/api, service worker)

$ npx vitest run
 Test Files  52 passed (52)
      Tests  929 passed (929)
   Duration  12.63s
EXIT=0        ← 907 al cerrar la vuelta anterior · 925 con la entrega de la
                escritura de `tasks` · 929 con los 4 que el verificador sumó
                por los dos defectos del Ritual da Sexta

$ npx eslint . --max-warnings 0
(sin salida)
EXIT=0

$ npx tsc --noEmit -p tsconfig.e2e.json
EXIT=0

$ npm run build
✓ built in 2.03s · PWA · precache 65 entries (1.589,34 KiB)
EXIT=0

$ git status --porcelain -- src api     # el CRM v2, desde la raíz del repo
(sin salida: NO se tocó)
```

**La base de producción tampoco se tocó**, verificado por MCP después de correr
todo (`SOLO LECTURA`):

```sql
select count(*), count(*) filter (where created_by='backfill-v2') as backfill,
       count(*) filter (where created_at > now() - interval '6 hours') as ultimas_6h
  from public.tasks;
→ total 36 · backfill 36 · ultimas_6h 0
```

Las 36 son las del backfill de la mañana. Las pruebas de §3.16 escriben tareas
de verdad —POST y PATCH con cuerpos reales— y **ninguna** salió del proceso: las
tres capas de candado (el host inexistente del dev server, el `route()` que
intercepta a nivel de contexto, y la máquina sin salida a `*.supabase.co`)
hicieron su trabajo.

### Dos cosas que impiden que la suite ARRANQUE, y no son el código

- **Un `vite preview` olvidado en el 5289.** El segundo servidor tiene
  `reuseExistingServer: false` **a propósito** (un `dist/` viejo probaría código
  que ya no existe), así que si quedó uno de una corrida anterior la suite entera
  se niega a empezar con `http://127.0.0.1:5289 is already used`. Pasó al abrir
  esta verificación. Se limpia matando el árbol de procesos de los puertos 5288
  y 5289 antes de correr; no se arregla poniendo `reuseExistingServer: true`.
- **Editar cualquier archivo del repo mientras la suite corre.** Sigue vigente,
  ver el aviso de §1.

### La corrida anterior a esta, y por qué no contaba

```
$ npx playwright test
  2 failed
    [mobile] › e2e/golden.spec.ts:111:3 › o fechamento se destrava sozinho aos 60 segundos
    [mobile] › e2e/hoje.spec.ts:24:3    › mostra exatamente 3 cartões, com 5 negócios
  6 skipped
  131 passed (9.5m)
```

Las dos fueron del integrador **escribiendo `docs/ESTADO.md` mientras la suite
corría**. El error de `hoje.spec.ts` lo dice con todas las letras —«Execution
context was destroyed, most likely because of a navigation»—: el watcher de Vite
ve el archivo nuevo y recarga la página en medio de la prueba. El de
`golden.spec.ts:111` es el mismo golpe sobre la prueba más frágil de la suite,
que espera **60 segundos de reloj real** con 70 de presupuesto.

Es el aviso que ya estaba escrito en `ESTADO.md` §1 y que igual se volvió a
pisar, así que queda acá también: **no se toca un archivo del repo mientras
`npx playwright test` corre.** La corrida limpia, sin tocar nada, dio 133/0.

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
