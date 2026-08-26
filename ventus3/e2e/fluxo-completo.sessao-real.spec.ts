// e2e/fluxo-completo.sessao-real.spec.ts
// LA PRUEBA DE FUEGO: el recorrido entero, tal como lo haría el dueño del
// producto, con un click de verdad en cada paso.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE, SI YA ESTÁ sessao-real.spec.ts
// ══════════════════════════════════════════════════════════════════════════
// `sessao-real.spec.ts` prueba los tres arreglos por separado: que el plan del
// día no muera, que ningún control quede tapado, y que el rol se vea. Este
// archivo prueba lo que el dueño del producto de verdad hace: UNA sesión, de
// punta a punta, sin recargar, sin `page.goto` salvo donde no hay link, y con
// la exigencia de que CADA click cambie algo visible en la pantalla.
//
// Es la diferencia entre «el botón existe y está encima de todo» y «el botón
// hace lo que dice». La regresión que se reportó —«no puedo accionar ningún
// botón»— era de la segunda clase: los controles ni siquiera llegaban a
// pintarse, pero el síntoma que se ve es el mismo, así que la prueba tiene que
// medir el EFECTO de cada toque, no su presencia.
//
// EL CONTRATO DE CADA PASO, sin excepción:
//   1. el control se ve,
//   2. `elementFromPoint` sobre su centro lo devuelve a él (nada lo tapa),
//   3. se lo clickea de verdad,
//   4. y algo observable cambia: la URL, un diálogo, un `aria-checked`, un
//      texto nuevo. Un click que no deja rastro no cuenta como respondido.
//
// Corre en los DOS proyectos de sesión real —`sessao-real-escritorio`
// (1440×900, el monitor del reporte) y `sessao-real-telefone` (390×844)—
// contra el build de producción servido por `vite preview`, con el service
// worker registrado y el doble de red del fixture. Las capturas salen a
// `docs/capturas/fluxo-{desktop,mobile}-*.png` y son la evidencia visual del
// recorrido, no una vitrina: se toman DESPUÉS de cada aserción, o sea que
// muestran un estado que la prueba ya verificó.

import { mkdirSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { HOST_SUPABASE, entrarComoTomas, instalarSupabaseDeRede } from './fixtures/supabase-red'

const DESTINO = 'docs/capturas'

/* ══════════════════════════════════════════════════════════════════════════
   Ayudas
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El prefijo de las capturas sale del proyecto y no del viewport: el mismo
 * archivo corre en los dos tamaños y cada uno tiene que escribir su propia
 * serie sin pisar la del otro.
 */
function prefixoDe(projeto: string): string {
  return projeto.includes('telefone') ? 'fluxo-mobile' : 'fluxo-desktop'
}

/** Errores no capturados de la página. Ninguno es aceptable en este camino. */
function vigiarErros(page: Page): string[] {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  return erros
}

/**
 * El WebSocket de realtime nunca conecta contra el doble (no se puede
 * interceptar un upgrade de protocolo con `route`) y el navegador lo reporta.
 * Todo lo demás cuenta como error de la app.
 */
function errosDaApp(erros: readonly string[]): string[] {
  return erros.filter((e) => !/websocket|realtime/i.test(e))
}

/** Lo que devuelve `quemRecebeOClique` cuando el control sí recibe el toque. */
const ELE_MESMO = 'ele mesmo'

/**
 * ¿Quién recibe el click en el centro de este control?
 *
 * `elementFromPoint` sobre el centro es la pregunta literal que se hace el
 * navegador al tocar. Un control que existe, se ve, y devuelve OTRO elemento
 * es exactamente «toco y no pasa nada» — y devolver QUIÉN lo tapa, en vez de
 * un booleano, es lo que hace que un rojo se pueda leer sin abrir el trace.
 */
async function quemRecebeOClique(alvo: Locator): Promise<string> {
  return alvo.evaluate((el: HTMLElement) => {
    const b = el.getBoundingClientRect()
    if (b.width < 2 || b.height < 2) {
      return `nada: o próprio alvo mede ${String(Math.round(b.width))}×${String(Math.round(b.height))}`
    }
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) {
      return `nada: o centro do alvo cai fora da janela (${String(Math.round(cx))}, ${String(Math.round(cy))})`
    }
    const top = document.elementFromPoint(cx, cy)
    if (el === top || el.contains(top)) return 'ele mesmo'
    const t = top as HTMLElement | null
    const texto = (t?.textContent ?? '').trim().slice(0, 40)
    return `<${t?.tagName ?? 'null'} class="${String(t?.className ?? '').slice(0, 70)}"> «${texto}»`
  })
}

/**
 * Un paso del recorrido: se ve, nada lo tapa, y se clickea. El `nombre` viaja
 * al mensaje de la aserción para que un rojo diga QUÉ toque no llegó.
 *
 * ── POR QUÉ LA ALCANZABILIDAD SE MIDE CON `expect.poll` Y NO UNA VEZ ───────
 * Los sheets entran animando `y` desde abajo de la ventana. Medir en el frame
 * en que `toBeVisible()` pasa —que es el primero en que el panel existe—
 * agarra al control todavía en viaje: su centro cae fuera de la ventana o
 * sobre el backdrop, y la prueba grita «tapado» por una animación de 220 ms.
 * Es exactamente el falso rojo que dio la primera corrida de este archivo, en
 * los dos viewports y en dos sheets distintos (la píldora «+7d» de Adiar y el
 * nivel del editor de escala): con `page.click()` —que espera estabilidad por
 * su cuenta— los mismos dos toques funcionaban perfecto.
 *
 * Se reintenta hasta 3 s. Lo que la prueba busca es una capa que NO se va
 * nunca —el `sr-only` de 44×44 que tapaba las filas de la Carteira, un
 * backdrop que quedó puesto—, no el medio segundo en que la app está pintando
 * lo que la persona acaba de pedir. Una persona también espera a que el sheet
 * termine de subir.
 *
 * Los pasos se van anotando en `feitos` y la prueba los imprime al final: esa
 * lista ES la lista de clicks probados que pide el encargo.
 */
async function tocar(alvo: Locator, nome: string, feitos: string[]): Promise<void> {
  await expect(alvo, `«${nome}» tem que estar visível`).toBeVisible({ timeout: 20_000 })
  // ── Traerlo AL CENTRO antes de preguntar quién recibe el click ──────────
  // Y al centro, no «a la vista mínima»: el chrome fijo de la app —header
  // sticky arriba, BottomNav y barra del Ventus abajo, el pie del sheet en el
  // editor de escala— se apoya sobre el contenido por diseño, y a todos se
  // llega scrolleando. `scrollIntoViewIfNeeded()` deja el control pegado al
  // borde, que es justo debajo de esas capas: la fila «Dor» del Dossiê caía
  // bajo el ítem «Golden» de la nav, y el nivel del editor bajo la marca «5»
  // del stepper del pie. Los dos se clickean sin problema en la app real —una
  // persona sigue scrolleando— así que reportarlos como tapados sería mentir.
  // `block: 'center'` los pone donde una persona los pondría.
  await alvo.evaluate((el: HTMLElement) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await alvo.page().waitForTimeout(150)
  await expect
    .poll(() => quemRecebeOClique(alvo), {
      message: `«${nome}» nunca chegou a receber o clique — quem o recebe é`,
      timeout: 3_000,
    })
    .toBe(ELE_MESMO)
  await alvo.click()
  feitos.push(nome)
}

/**
 * ¿El sheet abierto sigue entero y utilizable?
 *
 * Se mide por sus DOS controles de borde —el botón del pie, que es lo que
 * confirma, y el «Fechar» del encabezado— y no por la caja del panel. Medir la
 * caja no alcanza: cuando el panel se escapa hacia abajo, en un monitor alto
 * su BORDE SUPERIOR sigue estando dentro de la ventana (lo comprobé: top 635
 * en una ventana de 900) y una prueba que mire eso da verde con el sheet roto.
 * Lo que la persona pierde primero, y en los dos tamaños, es el botón del pie.
 *
 * Devuelve la lista de problemas: vacía es «responde por entero».
 */
async function sheetRespondePorInteiro(page: Page, rotuloDoPe: RegExp): Promise<string[]> {
  const problemas: string[] = []
  const noPe = await quemRecebeOClique(page.getByRole('button', { name: rotuloDoPe }))
  if (noPe !== ELE_MESMO) problemas.push(`o botão do rodapé não recebe o clique: ${noPe}`)
  const noFechar = await quemRecebeOClique(page.getByRole('button', { name: 'Fechar' }))
  if (noFechar !== ELE_MESMO) problemas.push(`«Fechar» não recebe o clique: ${noFechar}`)
  return problemas
}

/** El estado de las view transitions: `data-vt` colgado = página muerta. */
async function transicaoLimpa(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset['vt'] === undefined)
}

/**
 * La captura se toma con la transición ya terminada: durante los 220 ms del
 * morph el pseudo-elemento `::view-transition` es lo que se dibuja, y una
 * captura de ese frame no muestra la pantalla sino la animación.
 */
async function capturar(page: Page, nome: string): Promise<void> {
  // 700 ms y no 450: la limpieza de `data-vt` vive en un timeout de 400 ms
  // (ver Shell.tsx) que arranca DESPUÉS de que la transición pinta. Medir
  // antes de eso da falsos rojos por carrera, no por una página muerta.
  await page.waitForTimeout(700)
  expect(await transicaoLimpa(page), `transição pendurada antes de ${nome}`).toBe(true)
  await page.screenshot({ path: `${DESTINO}/${nome}.png` })
}

/* ══════════════════════════════════════════════════════════════════════════
   El recorrido
   ══════════════════════════════════════════════════════════════════════════ */

test('o percurso completo de Tomás: login → Hoje → Carteira → Dossiê → Mais → Gestor → Ajustes → Sair', async ({
  page,
}, info) => {
  // Es un test largo a propósito: la gracia es que sea UNA sesión sin
  // recargar. El default de 60 s no alcanza para dieciocho pasos con sus
  // transiciones reales.
  test.setTimeout(180_000)
  mkdirSync(DESTINO, { recursive: true })

  const prefixo = prefixoDe(info.project.name)
  const feitos: string[] = []
  const erros = vigiarErros(page)
  const registro = await instalarSupabaseDeRede(page)

  /* ── 1 · Login real, por el formulario ──────────────────────────────── */
  await entrarComoTomas(page)
  feitos.push('Login: preencher e-mail + senha e clicar «Entrar»')

  // El vendedor resolvió: sin esto la barra del Ventus no se pinta.
  await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible({
    timeout: 20_000,
  })

  /* ── 2 · Hoje, con las tres tarjetas ────────────────────────────────── */
  // LA REGRESIÓN. Antes del arreglo acá había tres esqueletos grises y
  // «Baixando a sua carteira», para siempre y sin error visible.
  await expect(page.getByText('Baixando a sua carteira', { exact: false })).toHaveCount(0)
  const cards = page.getByRole('listitem').filter({ hasText: 'Fazer agora' })
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })
  await capturar(page, `${prefixo}-1-hoje`)

  /* ── 3 · «Por que isto?»: abre la cuenta del score, y la cierra ──────── */
  const porque = page.getByRole('button', { name: 'Por que isto?' }).first()
  await tocar(porque, 'Hoje · chip «Por que isto?» (abrir)', feitos)
  await expect(page.getByText('pontos de prioridade', { exact: false }).first()).toBeVisible()
  await capturar(page, `${prefixo}-2-por-que-isto`)

  await tocar(porque, 'Hoje · chip «Por que isto?» (fechar)', feitos)
  await expect(page.getByText('pontos de prioridade', { exact: false })).toHaveCount(0)

  /* ── 4 · «Adiar» → el sheet de fecha, y una fecha distinta ──────────── */
  const adiar = page.getByRole('button', { name: 'Adiar', exact: true }).first()
  await tocar(adiar, 'Hoje · «Adiar» (abre o sheet de data)', feitos)

  const sheetAdiar = page.getByRole('dialog')
  await expect(sheetAdiar).toBeVisible()
  await expect(sheetAdiar.getByText('Adiar para quando?')).toBeVisible()

  // El default es «Amanhã». Se elige OTRA fecha: que `aria-checked` se mueva
  // de una píldora a la otra es la prueba de que el toque llegó al estado, no
  // sólo al DOM.
  const amanha = sheetAdiar.getByRole('radio', { name: 'Amanhã', exact: true })
  const mais7 = sheetAdiar.getByRole('radio', { name: '+7d', exact: true })
  await expect(amanha).toHaveAttribute('aria-checked', 'true')
  await tocar(mais7, 'Sheet Adiar · píldora «+7d»', feitos)
  await expect(mais7).toHaveAttribute('aria-checked', 'true')
  await expect(amanha).toHaveAttribute('aria-checked', 'false')
  // Y el botón del pie ya habla de la fecha nueva.
  await expect(sheetAdiar.getByRole('button', { name: /^Adiar para / })).toBeVisible()
  // Y el sheet SIGUE ENTERO. Ver la prueba dedicada al final de este archivo:
  // elegir la fecha teletransportaba el panel fuera de la ventana.
  expect(await sheetRespondePorInteiro(page, /^Adiar para /)).toEqual([])
  await capturar(page, `${prefixo}-3-adiar`)

  // Se cierra SIN adiar: el recorrido no puede mutar el día, porque los pasos
  // siguientes cuentan con las mismas tres tarjetas.
  await tocar(page.getByRole('button', { name: 'Fechar' }), 'Sheet Adiar · «Fechar»', feitos)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // La pantalla de atrás quedó viva: el sheet no dejó su fondo puesto.
  await expect
    .poll(() => quemRecebeOClique(page.getByRole('button', { name: 'Fazer agora' }).first()), {
      message: 'depois de fechar o sheet, «Fazer agora» voltou a receber o clique?',
      timeout: 3_000,
    })
    .toBe(ELE_MESMO)

  /* ── 5 · A la Carteira, por la navegación ───────────────────────────── */
  await tocar(
    page.getByRole('link', { name: 'Carteira', exact: false }).first(),
    'Navegação · «Carteira»',
    feitos,
  )
  await expect(page).toHaveURL(/\/carteira$/)
  await expect(page.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible()
  await capturar(page, `${prefixo}-4-carteira`)

  /* ── 6 · Abrir un Dossiê (morph de elemento compartido) ──────────────── */
  await tocar(
    page.getByRole('button', { name: /Prueba Tripolla/ }).first(),
    'Carteira · abrir a ficha «Prueba Tripolla»',
    feitos,
  )
  await expect(page).toHaveURL(/\/carteira\/89$/)
  await capturar(page, `${prefixo}-5-dossie`)

  /* ── 7 · El editor de escala ────────────────────────────────────────── */
  // La escala «Dor» de la oportunidad 89 vale 2 en la base real. Se toca la
  // fila, se elige un nivel canónico por su TEXTO —el gesto principal del
  // editor: el número es consecuencia— y se comprueba que el título del
  // diálogo pasa de «2 → 2» a «2 → 4».
  await tocar(
    page.getByRole('button', { name: /^2\s*Dor/ }),
    'Dossiê · fila da escala «Dor» (abre o editor)',
    feitos,
  )
  const editor = page.getByRole('dialog')
  await expect(editor).toBeVisible()
  await expect(editor.getByText('Dor · 2 → 2')).toBeVisible()
  await capturar(page, `${prefixo}-6-editor-de-escala`)

  await tocar(
    editor.getByRole('button', { name: 'Pessoa de Contato admite dor' }),
    'Editor de escala · nível «Pessoa de Contato admite dor»',
    feitos,
  )
  await expect(editor.getByText('Dor · 2 → 4')).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Salvar Dor em 4' })).toBeEnabled()

  // Se cierra sin guardar: lo que se prueba es que el editor responde, no la
  // escritura (que ya cubre `e2e/dossie.spec.ts` con su propio fixture).
  await tocar(page.getByRole('button', { name: 'Fechar' }), 'Editor de escala · «Fechar»', feitos)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  /* ── 8 · Volver a la Carteira, con el botón de la ficha ──────────────── */
  await tocar(
    page.getByRole('button', { name: 'Voltar para a carteira' }),
    'Dossiê · «Voltar para a carteira»',
    feitos,
  )
  await expect(page).toHaveURL(/\/carteira$/)
  await expect(page.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible()

  /* ── 9 · Mais: el chip «Administrador» ───────────────────────────────── */
  await tocar(page.getByRole('link', { name: /Mais/ }).first(), 'Navegação · «Mais»', feitos)
  await expect(page).toHaveURL(/\/mais$/)

  // Dentro de `<main>`: en escritorio el DesktopRail trae SU PROPIO PerfilChip
  // fijo al pie, y en teléfono ese rail sigue en el DOM aunque el CSS lo
  // esconda, así que buscar en la página entera encuentra dos copias.
  const conteudo = page.locator('main')
  await expect(conteudo.getByText('Tomás', { exact: false }).first()).toBeVisible()
  await expect(conteudo.getByText('Administrador', { exact: false }).first()).toBeVisible()
  await capturar(page, `${prefixo}-7-mais-perfil-administrador`)

  /* ── 10 · El Painel do Gestor, que sólo un admin ve ──────────────────── */
  const gestor = page.getByRole('button', { name: 'Painel do Gestor' })
  await tocar(gestor, 'Mais · «Painel do Gestor»', feitos)
  await expect(page).toHaveURL(/\/gestor$/)
  // No es la guardia: Tomás es admin y entra de verdad.
  await expect(page.getByText('Este painel é do gestor')).toHaveCount(0)
  // El panel ya resolvió: o trae sus pestañas, o dice que no hay conexión —
  // las dos son pantallas terminales con algo que tocar, y ninguna es el
  // esqueleto eterno que era el bug.
  const abas = page.getByRole('radiogroup', { name: 'Seção do painel' })
  const semConexao = page.getByText('Este painel precisa de conexão')
  await expect(abas.or(semConexao).first()).toBeVisible({ timeout: 20_000 })
  await capturar(page, `${prefixo}-8-gestor`)

  if (await abas.isVisible()) {
    // Las pestañas responden: «Riscos» cambia el `aria-checked` del grupo.
    const riscos = abas.getByRole('radio', { name: /Riscos/ })
    await tocar(riscos, 'Gestor · aba «Riscos»', feitos)
    await expect(riscos).toHaveAttribute('aria-checked', 'true')
  } else {
    const tentar = page.getByRole('button', { name: /Tentar de novo|Tentar/ }).first()
    await tocar(tentar, 'Gestor (sem conexão) · «Tentar de novo»', feitos)
  }

  /* ── 11 · Ajustes ───────────────────────────────────────────────────── */
  // No hay link a Ajustes desde /gestor: se vuelve a Mais por la navegación y
  // se entra por el ítem de la lista, que es el camino real.
  await tocar(page.getByRole('link', { name: /Mais/ }).first(), 'Navegação · «Mais» (volta)', feitos)
  await expect(page).toHaveURL(/\/mais$/)
  await tocar(page.getByRole('button', { name: /^Ajustes/ }), 'Mais · «Ajustes»', feitos)
  await expect(page).toHaveURL(/\/ajustes$/)

  // El perfil se repite acá, con el mismo rótulo de rol.
  await expect(page.locator('main').getByText('Administrador', { exact: false }).first()).toBeVisible()
  // Y un control de verdad: el stepper de la meta pasa el botón de «Meta
  // salva» (inerte) a «Salvar minha meta».
  await tocar(page.getByRole('button', { name: 'Aumentar Toques' }), 'Ajustes · «Aumentar Toques»', feitos)
  await expect(page.getByRole('button', { name: 'Salvar minha meta' })).toBeVisible()
  await capturar(page, `${prefixo}-9-ajustes`)

  /* ── 12 · Sair, con su confirmación ─────────────────────────────────── */
  await tocar(page.getByRole('link', { name: /Mais/ }).first(), 'Navegação · «Mais» (sair)', feitos)
  await expect(page).toHaveURL(/\/mais$/)
  await tocar(page.getByRole('button', { name: 'Sair da conta' }), 'Mais · «Sair da conta»', feitos)

  const confirmacao = page.getByRole('dialog')
  await expect(confirmacao).toBeVisible()
  await expect(confirmacao.getByText('Sair da conta?')).toBeVisible()
  await capturar(page, `${prefixo}-10-sair`)

  await tocar(
    confirmacao.getByRole('button', { name: 'Sair', exact: true }),
    'Confirmação · «Sair»',
    feitos,
  )
  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await capturar(page, `${prefixo}-11-login`)

  /* ── El veredicto ───────────────────────────────────────────────────── */
  // Nada salió del proceso: todo lo que la app pidió lo contestó el doble.
  expect(registro.pedidos.every((p) => p.url.includes(HOST_SUPABASE))).toBe(true)
  expect(errosDaApp(erros)).toEqual([])

  // La lista de clicks probados, para pegar en el informe de QA.
  console.log(
    `\n  ✔ ${String(feitos.length)} cliques em ${info.project.name}:\n${feitos
      .map((f, i) => `     ${String(i + 1).padStart(2, ' ')}. ${f}`)
      .join('\n')}\n`,
  )
})

/* ══════════════════════════════════════════════════════════════════════════
   El sheet no se puede ir de la pantalla al primer toque
   ══════════════════════════════════════════════════════════════════════════
   REGRESIÓN, encontrada recorriendo el camino de arriba. El `useLayoutEffect`
   que coloca el punto de partida de la animación de entrada del Sheet dependía
   de `footer` —un ReactNode que la pantalla de arriba vuelve a crear en cada
   render— y volvía a aplicarse en cada corrida. En un sheet sin `snapPoints`
   el reposo abierto es exactamente `y === 0`, así que el PRIMER re-render del
   padre con el sheet abierto empujaba el panel un alto entero hacia abajo, y
   el efecto que anima —que no depende de `footer`— no volvía a correr para
   traerlo. El panel se quedaba fuera de la ventana, con la app todavía en modo
   modal: scroll bloqueado, foco atrapado, nada que tocar.

   En «Adiar» eso es: tocás una fecha y el sheet desaparece. Le pasaba a los
   sheets sin snaps y con pie propio — «Adiar» de Hoje y de Carteira, Filtros,
   los cuatro Rituais, Próximo Passo, Kudos, Descartar y Editar Campo.

   La prueba toca DOS controles del pie de una vez: la píldora de fecha (que
   cambia el estado y por lo tanto el `footer`) y el botón «Fechar» del
   encabezado, que después de eso tiene que seguir recibiendo el click.
   ══════════════════════════════════════════════════════════════════════════ */

test('escolher uma data não pode fazer o sheet sumir da tela', async ({ page }) => {
  test.setTimeout(120_000)
  await instalarSupabaseDeRede(page)
  await entrarComoTomas(page)
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })

  await page.getByRole('button', { name: 'Adiar', exact: true }).first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Adiar para quando?')).toBeVisible()
  await page.waitForTimeout(600)
  expect(
    await sheetRespondePorInteiro(page, /^Adiar para /),
    'o sheet tem que abrir inteiro',
  ).toEqual([])

  // El toque que lo rompía.
  await sheet.getByRole('radio', { name: '+7d', exact: true }).click()
  await page.waitForTimeout(900)
  expect(
    await sheetRespondePorInteiro(page, /^Adiar para /),
    'depois de escolher a data o sheet saiu da tela',
  ).toEqual([])

  // Y el pie ya habla de la fecha nueva, y cerrar cierra de verdad.
  await expect(sheet.getByRole('button', { name: /^Adiar para / })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Y la pantalla de atrás quedó viva.
  await expect
    .poll(() => quemRecebeOClique(page.getByRole('button', { name: 'Fazer agora' }).first()), {
      timeout: 3_000,
    })
    .toBe(ELE_MESMO)
})
