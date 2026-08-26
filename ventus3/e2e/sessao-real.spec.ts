// e2e/sessao-real.spec.ts
// LA SESIÓN REAL: el camino exacto que recorrió el dueño del producto.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ CUBRE ESTE ARCHIVO Y POR QUÉ EXISTE
// ══════════════════════════════════════════════════════════════════════════
// El 26/08 el dueño del producto entró por primera vez con su usuario real
// (tripoll@ventapel.com, vendedor «Tomás», is_admin) y reportó: «no puedo
// accionar ningún botón». No era una metáfora. La tela Hoje mostraba tres
// esqueletos grises y «Baixando a sua carteira. Isso acontece uma vez só.»
// para siempre — sin las tres tarjetas del día no hay «Fazer agora», ni
// «Adiar», ni el chip «Por que isto?»: no hay NADA que tocar.
//
// La causa: la tabla `tasks` de Postgres manda `titulo`/`opportunity_id` y el
// motor espera `title`/`target: EntityRef`. El pull escribía la fila cruda en
// Dexie, `indexarTasks()` hacía `t.target.kind` sobre `undefined`, y ese
// TypeError se llevaba puesto `rankDay()` → la query del plan → toda la
// pantalla. Mientras `tasks` estuvo vacía en el servidor nadie lo vio; el
// backfill del mismo 26/08 le metió 36 filas `pending` y rompió el Hoje del
// equipo entero.
//
// El resto de la suite NO podía verlo: `e2e/fixtures/app.ts` siembra Dexie con
// tareas ya construidas con la forma local, así que salta justo el paso que
// fallaba. Este archivo, en cambio, arranca con el aparato VACÍO y hace que
// todo —sesión, vendedor, cartera— llegue por la red, contra el bundle de
// producción (`vite preview` sobre `dist/`) y con el service worker
// registrado. Es la única prueba que recorre login → sesión → vendedor →
// datos → pantalla.
//
// Los dos proyectos que lo corren están en playwright.config.ts:
// `sessao-real-escritorio` (1440×900, el monitor del reporte) y
// `sessao-real-telefone` (390×844, donde vive el equipo).

import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  EMAIL_RENATA,
  HOST_SUPABASE,
  entrarComo,
  entrarComoTomas,
  escritasEm,
  escritasRejeitadas,
  instalarSupabaseDeRede,
  type RegistroDeRede,
} from './fixtures/supabase-red'

/* ══════════════════════════════════════════════════════════════════════════
   Ayudas
   ══════════════════════════════════════════════════════════════════════════ */

/** Errores no capturados de la página. Ninguno es aceptable en el arranque. */
function vigiarErros(page: Page): string[] {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  return erros
}

/**
 * Errores que NO son de la app: el WebSocket de realtime nunca conecta contra
 * el doble (no se puede interceptar un upgrade con page.route) y el navegador
 * lo reporta. Todo lo demás cuenta.
 */
function errosDaApp(erros: readonly string[]): string[] {
  return erros.filter((e) => !/websocket|realtime/i.test(e))
}

/**
 * ¿Este control recibe el click, o hay algo encima?
 *
 * `elementFromPoint` sobre el centro del control es la pregunta literal que se
 * hace el navegador al tocar. Un botón que existe, se ve, y devuelve OTRO
 * elemento es exactamente «toco y no pasa nada».
 */
async function estaAlcancable(alvo: Locator): Promise<boolean> {
  return alvo.evaluate((el: HTMLElement) => {
    const b = el.getBoundingClientRect()
    if (b.width < 2 || b.height < 2) return false
    const x = Math.min(Math.max(b.x + b.width / 2, 1), window.innerWidth - 1)
    const y = Math.min(Math.max(b.y + b.height / 2, 1), window.innerHeight - 1)
    const top = document.elementFromPoint(x, y)
    return el === top || el.contains(top)
  })
}

/** El estado de las view transitions: `data-vt` colgado = página muerta. */
async function transicaoPendurada(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.dataset['vt'] !== undefined)
}

/** Nada salió del proceso: todo lo que la app pidió lo contestó el doble. */
function tudoFoiInterceptado(registro: RegistroDeRede): boolean {
  return registro.pedidos.every((p) => p.url.includes(HOST_SUPABASE))
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · El camino completo, y todos los clicks de la lista
   ══════════════════════════════════════════════════════════════════════════ */

test('login real → vendedor Tomás → Hoje con as 3 tarjetas, y todo responde', async ({
  page,
}) => {
  const erros = vigiarErros(page)
  const registro = await instalarSupabaseDeRede(page)

  await entrarComoTomas(page)

  // ── La sesión resolvió al vendedor ─────────────────────────────────────
  // Si `resolverVendorDaSessao` fallara, la barra del Ventus no se pinta y
  // media app queda deshabilitada. Es el primer sí/no del arranque.
  await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible()

  // ── LA REGRESIÓN ───────────────────────────────────────────────────────
  // Las tres tarjetas del día, con sus dos salidas y el chip de la cuenta.
  // Antes del arreglo, acá había tres esqueletos y «Baixando a sua carteira».
  await expect(page.getByText('Baixando a sua carteira', { exact: false })).toHaveCount(0)
  const cards = page.getByRole('listitem').filter({ hasText: 'Fazer agora' })
  await expect(cards.first()).toBeVisible({ timeout: 20_000 })

  const fazerAgora = page.getByRole('button', { name: 'Fazer agora' })
  const adiar = page.getByRole('button', { name: 'Adiar', exact: true })
  const porque = page.getByRole('button', { name: 'Por que isto?' })
  await expect(fazerAgora.first()).toBeVisible()
  await expect(adiar.first()).toBeVisible()
  await expect(porque.first()).toBeVisible()

  // Y son alcanzables de verdad: nada tapa su centro.
  for (const alvo of [fazerAgora.first(), adiar.first(), porque.first()]) {
    expect(await estaAlcancable(alvo)).toBe(true)
  }

  // ── Chip «Por que isto?»: abre y cierra ────────────────────────────────
  await porque.first().click()
  await expect(page.getByText('pontos de prioridade', { exact: false }).first()).toBeVisible()
  await porque.first().click()
  await expect(page.getByText('pontos de prioridade', { exact: false })).toHaveCount(0)

  // ── «Adiar»: abre el sheet con las fechas ──────────────────────────────
  await adiar.first().click()
  const sheetAdiar = page.getByRole('dialog')
  await expect(sheetAdiar).toBeVisible()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(sheetAdiar).toHaveCount(0)

  // ── «Fazer agora»: la puerta única de entrada de datos ─────────────────
  await fazerAgora.first().click()
  await expect(page).toHaveURL(/\/registrar$/)
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible()

  // ── «Iniciar Golden Hour» ──────────────────────────────────────────────
  await page.getByRole('button', { name: /Golden Hour/ }).first().click()
  await expect(page).toHaveURL(/\/golden$/)
  // Modo foco: sin header, sin bottom nav y sin barra. Se sale por el back del
  // sistema, que es la salida que la pantalla deja abierta a propósito.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)

  // ── La bottom nav completa, con las view transitions REALES ────────────
  // Sin reducedMotion a propósito: durante una view transition el
  // pseudo-elemento ::view-transition se come todos los clicks, así que una
  // transición que no termina deja la página muerta. Se comprueba que después
  // de cada salto `data-vt` quedó limpio y que el siguiente click funciona.
  for (const destino of ['Carteira', 'Revisão do Ventus', 'Mais', 'Hoje']) {
    await page.getByRole('link', { name: destino, exact: false }).first().click()
    await page.waitForTimeout(700)
    expect(await transicaoPendurada(page)).toBe(false)
  }
  await expect(page).toHaveURL(/\/$/)

  // ── El FAB del micrófono ───────────────────────────────────────────────
  await page.getByRole('button', { name: /Registrar por voz/ }).click()
  await expect(page).toHaveURL(/\/registrar$/)
  await page.goBack()

  // ── La barra de comando del Ventus ─────────────────────────────────────
  await page.getByRole('button', { name: 'Perguntar ao Ventus' }).click()
  await expect(page.getByRole('dialog', { name: 'Ventus' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog', { name: 'Ventus' })).toHaveCount(0)
  // Y la pantalla de atrás quedó viva: el sheet no dejó su fondo puesto.
  expect(await estaAlcancable(page.getByRole('button', { name: 'Fazer agora' }).first())).toBe(true)

  // ── Dentro de Carteira ─────────────────────────────────────────────────
  await page.getByRole('link', { name: 'Carteira', exact: false }).first().click()
  await expect(page).toHaveURL(/\/carteira$/)
  const filtros = page.getByRole('button', { name: 'Filtros da carteira' })
  await expect(filtros).toBeVisible()
  // Se deja terminar la transición de pila antes de medir: durante los 220 ms
  // que dura, el pseudo-elemento ::view-transition es el que recibe los
  // punteros, y eso es correcto —lo que no puede pasar es que no termine.
  await page.waitForTimeout(700)
  expect(await transicaoPendurada(page)).toBe(false)
  expect(await estaAlcancable(filtros)).toBe(true)
  await filtros.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Fechar' }).click()
  // Abrir una ficha: es la navegación con morph de elemento compartido, la
  // única de la app que arranca una view transition a mano.
  await page.getByRole('button', { name: /Prueba Tripolla/ }).first().click()
  await expect(page).toHaveURL(/\/carteira\/89$/)
  await page.waitForTimeout(700)
  expect(await transicaoPendurada(page)).toBe(false)

  // ── Dentro de Ajustes ──────────────────────────────────────────────────
  await page.goto('/ajustes', { waitUntil: 'domcontentloaded' })
  const mais = page.getByRole('button', { name: 'Aumentar Toques' })
  await expect(mais).toBeVisible({ timeout: 20_000 })
  expect(await estaAlcancable(mais)).toBe(true)
  await mais.click()
  // El botón pasa de «Meta salva» (inerte) a «Salvar minha meta»: el click
  // llegó al handler y el estado del formulario cambió.
  await expect(page.getByRole('button', { name: 'Salvar minha meta' })).toBeVisible()

  // ── Nada se escapó y nada explotó ──────────────────────────────────────
  expect(tudoFoiInterceptado(registro)).toBe(true)
  expect(errosDaApp(erros)).toEqual([])
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · Ningún control queda tapado, en las dos formas de pantalla
   ══════════════════════════════════════════════════════════════════════════ */

test('ningún control visible queda debajo de otra cosa', async ({ page }) => {
  await instalarSupabaseDeRede(page)
  await entrarComoTomas(page)
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })

  for (const rota of ['/', '/carteira', '/mais', '/cadencia', '/ajustes']) {
    await page.goto(rota, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    // Todo scroller al fondo: lo que siga tapado ahí, está tapado siempre.
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const e = el as HTMLElement
        if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight
      }
    })
    await page.waitForTimeout(400)

    const tapados = await page.evaluate(() => {
      // ── La franja limpia ────────────────────────────────────────────────
      // El header es `sticky` y la nav y la barra del Ventus son `fixed`: el
      // contenido pasa POR DEBAJO de ellos y eso es el diseño, no un defecto —
      // se llega scrolleando. Lo que esta prueba busca es lo otro: una capa
      // que no debería estar ahí. Así que se mide solo lo que cae entero
      // dentro de la franja que el chrome deja libre.
      //
      // Hay DOS navs con el mismo `aria-label="Navegação principal"` —la
      // BottomNav (móvil) y el DesktopRail (lg+)— porque para un lector de
      // pantalla son el MISMO landmark: nunca hay más de uno visible a la vez,
      // así que darles nombres distintos sería inventar una diferencia que no
      // existe. `chromeVisivel` toma el que de verdad tiene tamaño en este
      // viewport (el otro es `display:none` y su rect da todo cero).
      const chromeVisivel = (sel: string): DOMRect | null => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) return r
        }
        return null
      }
      const cabecalho = chromeVisivel('header')
      const nav = chromeVisivel('nav[aria-label="Navegação principal"]')
      const barra = chromeVisivel('.fixed.inset-x-0.z-30')
      const topo = cabecalho ? cabecalho.bottom : 0

      // La nav es horizontal (BottomNav, abajo) o vertical (DesktopRail, a la
      // izquierda) según su propia forma — más ancha que alta, o al revés—, y
      // cada forma recorta un borde distinto de la franja limpia.
      let fundo = window.innerHeight
      let esquerda = 0
      if (nav) {
        if (nav.width >= nav.height) fundo = Math.min(fundo, nav.top)
        else esquerda = Math.max(esquerda, nav.right)
      }
      if (barra) fundo = Math.min(fundo, barra.top)

      const mortos: string[] = []
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('button, a[href], [role="switch"]'),
      )) {
        // La propia nav y la propia barra viven fuera de la franja: se juzgan
        // contra la ventana entera, porque nada tiene derecho a taparlas.
        const dentroDoChrome =
          el.closest('nav[aria-label="Navegação principal"]') !== null ||
          el.closest('header') !== null ||
          el.closest('.fixed.inset-x-0.z-30') !== null
        const b = el.getBoundingClientRect()
        if (b.width < 2 || b.height < 2) continue
        if (b.left < 0 || b.right > window.innerWidth) continue
        if (dentroDoChrome) {
          if (b.top < 0 || b.bottom > window.innerHeight) continue
        } else if (b.top < topo || b.bottom > fundo || b.left < esquerda) {
          continue
        }
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none') continue
        const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
        if (el === top || el.contains(top)) continue
        mortos.push(
          `<${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}"> tapado por <${top?.tagName ?? 'null'} class="${String((top as HTMLElement | null)?.className ?? '').slice(0, 60)}">`,
        )
      }
      return mortos
    })

    expect(tapados, `controles tapados em ${rota}`).toEqual([])
  }
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · Un pull PARCIAL no puede dejar la pantalla en esqueletos
   ══════════════════════════════════════════════════════════════════════════ */

test('con una tabla caída, lo que sí bajó igual llega a la pantalla', async ({ page }) => {
  // `touchpoints` es la última del pull y la más frágil (sin columna vendor,
  // acotada por un `in.(…)` que crece con la cartera). Antes, su caída
  // abortaba el bucle ANTES de `notificarMudancas()` y el cache de queries no
  // se enteraba nunca de que Dexie ya tenía la cartera entera.
  await instalarSupabaseDeRede(page, { tabelasComFalha: ['touchpoints'] })
  await entrarComoTomas(page)

  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText('Baixando a sua carteira', { exact: false })).toHaveCount(0)
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · Sesión sin vendedor: se dice, y hay algo que tocar
   ══════════════════════════════════════════════════════════════════════════ */

test('sin vendedor ligado, Hoje ofrece una salida en vez de un esqueleto eterno', async ({
  page,
}) => {
  await instalarSupabaseDeRede(page, { vendorsVazio: true })
  await entrarComoTomas(page)

  const salida = page.getByRole('button', { name: 'Tentar de novo' })
  await expect(salida).toBeVisible({ timeout: 20_000 })
  expect(await estaAlcancable(salida)).toBe(true)
  await expect(page.getByText('nome de vendedor', { exact: false }).first()).toBeVisible()

  // Y la bottom nav sigue llevando a otro lado: la app no queda encerrada.
  await page.getByRole('link', { name: /Mais/ }).first().click()
  await expect(page).toHaveURL(/\/mais$/)
})

/* ══════════════════════════════════════════════════════════════════════════
   5 · Vendedor lento: mientras se resuelve, no se miente
   ══════════════════════════════════════════════════════════════════════════ */

test('con el vendedor tardando 2 s, la app espera y después funciona', async ({ page }) => {
  await instalarSupabaseDeRede(page, { demoraVendorsMs: 2000 })
  await entrarComoTomas(page)

  // Durante la espera la app muestra su silueta de arranque —honesta— y no una
  // pantalla que parece cargada y no responde a nada.
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible()
})

/* ══════════════════════════════════════════════════════════════════════════
   6 · El rol se ve, y el Painel do Gestor aparece o desaparece con él
   ══════════════════════════════════════════════════════════════════════════
   El reclamo original: «não sei se tenho perfil administrador». Estos dos
   tests entran con las DOS filas reales de `vendors` que importan —Tomás
   (is_admin=true) y Renata (is_admin=false)— contra el MISMO doble de red, y
   comprueban que el chip de perfil y la entrada «Painel do Gestor» siguen al
   rol, no a la ruta. */

test('Tomás (admin): o chip diz «Administrador» e o Painel do Gestor está lá', async ({
  page,
}) => {
  await instalarSupabaseDeRede(page)
  await entrarComoTomas(page)
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })

  await page.getByRole('link', { name: /Mais/ }).first().click()
  await expect(page).toHaveURL(/\/mais$/)
  // Dentro de `<main>` y no de la página entera: en escritorio el DesktopRail
  // trae SU PROPIO PerfilChip fijo al pie, y en teléfono ese mismo rail sigue
  // en el DOM —sólo que oculto por CSS (`hidden lg:flex`)—, así que buscar en
  // toda la página encuentra dos copias del texto y `.first()` puede caer
  // justo en la escondida. El perfil de Mais vive en `<main>`; el rail no.
  const conteudo = page.locator('main')
  await expect(conteudo.getByText('Administrador', { exact: false }).first()).toBeVisible()
  await expect(conteudo.getByText('Tomás', { exact: false }).first()).toBeVisible()
  const gestor = page.getByRole('button', { name: 'Painel do Gestor' })
  await expect(gestor).toBeVisible()

  // Y la ruta responde de verdad, no sólo el ítem del menú.
  await gestor.click()
  await expect(page).toHaveURL(/\/gestor$/)
  await expect(page.getByText('Este painel é do gestor')).toHaveCount(0)
})

test('Renata (vendedora): o chip diz «Vendedor», sem «Painel do Gestor», e /gestor a rechaça', async ({
  page,
}) => {
  await instalarSupabaseDeRede(page)
  await entrarComo(page, EMAIL_RENATA)
  await expect(page.getByRole('button', { name: 'Perguntar ao Ventus' })).toBeVisible({
    timeout: 20_000,
  })

  await page.getByRole('link', { name: /Mais/ }).first().click()
  await expect(page).toHaveURL(/\/mais$/)
  // Ver el comentario del test de Tomás: se busca dentro de `<main>` para no
  // pisarse con la copia (oculta en teléfono) del PerfilChip del DesktopRail.
  const conteudo = page.locator('main')
  await expect(conteudo.getByText('Vendedor', { exact: false }).first()).toBeVisible()
  await expect(conteudo.getByText('Renata', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Administrador')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Painel do Gestor' })).toHaveCount(0)

  // Y quien escribe /gestor a mano ve la guardia, no un panel vacío ni un crash.
  await page.goto('/gestor', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Este painel é do gestor')).toBeVisible({ timeout: 20_000 })
  const voltar = page.getByRole('button', { name: 'Voltar' })
  await expect(voltar).toBeVisible()
  await voltar.click()
  await expect(page).toHaveURL(/\/$/)
})

/* ══════════════════════════════════════════════════════════════════════════
   7 · Lo que sale hacia Postgres tiene la forma de la tabla
   ══════════════════════════════════════════════════════════════════════════
   La otra mitad del mismo bug. `normalizarRemoto()` arregló la ENTRADA: la
   fila de `tasks` que llega del servidor (`titulo`, `opportunity_id`,
   `snoozed_to`) se traduce a la forma que el motor lee. La SALIDA hacía lo
   inverso MAL — `criarTask` encolaba `kind`, `title` y `snoozed_until`, que no
   son columnas — y el resultado no se ve en pantalla: PostgREST contesta 400,
   el outbox clasifica el 4xx como permanente, y la nota del vendedor se queda
   en el teléfono con un badge de pendientes que ya no baja nunca.

   Estas pruebas no miran la pantalla: miran QUÉ CUERPO viajó por la red. El
   doble de `supabase-red.ts` ahora valida cada POST/PATCH contra las columnas
   y los CHECK reales de la base, así que una clave inventada vuelve como el
   400 de verdad y deja el ítem en la cola — que es exactamente lo que estas
   dos pruebas miden al final. */

/** Todo lo que quedó en el outbox del aparato, leído del IndexedDB real. */
async function outboxDoAparelho(
  page: Page,
): Promise<Array<{ tabla: string; op: string; estado: string; erro: string | null }>> {
  return page.evaluate(
    () =>
      new Promise<Array<{ tabla: string; op: string; estado: string; erro: string | null }>>(
        (resolve, reject) => {
          const pedido = indexedDB.open('ventus3')
          pedido.onerror = () => {
            reject(new Error('não deu para abrir o IndexedDB do aparelho'))
          }
          pedido.onsuccess = () => {
            const db = pedido.result
            if (!db.objectStoreNames.contains('outbox')) {
              db.close()
              resolve([])
              return
            }
            const tudo = db.transaction('outbox', 'readonly').objectStore('outbox').getAll()
            tudo.onsuccess = () => {
              const linhas = tudo.result as Array<Record<string, unknown>>
              resolve(
                linhas.map((m) => ({
                  tabla: String(m['tabla']),
                  op: String(m['op']),
                  estado: String(m['estado']),
                  erro: m['ultimo_error'] === null ? null : String(m['ultimo_error']),
                })),
              )
              db.close()
            }
            tudo.onerror = () => {
              reject(new Error('não deu para ler o outbox'))
            }
          }
        },
      ),
  )
}

/**
 * La cola tiene que quedar VACÍA. Si algo salió con una clave que Postgres no
 * conoce, el ítem sobrevive acá con su `ultimo_error` — y ese texto es el que
 * hace que el rojo se pueda leer sin abrir el trace.
 */
async function esperarOutboxVazio(page: Page): Promise<void> {
  await expect
    .poll(async () => JSON.stringify(await outboxDoAparelho(page)), { timeout: 20_000 })
    .toBe('[]')
}

/** El mock de /api/ingest, encendido en el aparato: en el preview no hay backend. */
async function ligarMockDeIngest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ventus.ingest.mock', 'on')
    } catch {
      /* Safari en modo privado lanza al escribir; no es el caso acá. */
    }
  })
}

test('«Adiar» uma tarjeta para amanhã escreve uma tarefa que a tabela aceita', async ({
  page,
}) => {
  const erros = vigiarErros(page)
  const registro = await instalarSupabaseDeRede(page)
  await entrarComoTomas(page)

  const adiar = page.getByRole('button', { name: 'Adiar', exact: true })
  await expect(adiar.first()).toBeVisible({ timeout: 20_000 })
  await adiar.first().click()

  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Adiar para quando?')).toBeVisible()
  // «Amanhã» es el default del sheet: se confirma tal cual, que es el gesto de
  // un toque que la pantalla existe para dar.
  await expect(sheet.getByRole('radio', { name: 'Amanhã', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await sheet.getByRole('button', { name: /^Adiar para / }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // ── Lo que viajó ───────────────────────────────────────────────────────
  await expect
    .poll(() => escritasEm(registro, 'tasks', 'POST').length, { timeout: 20_000 })
    .toBeGreaterThan(0)

  const insert = escritasEm(registro, 'tasks', 'POST')[0]
  expect(insert, 'nenhum INSERT de tarefa chegou ao servidor').toBeDefined()
  // El doble valida contra las columnas reales: si sobreviviera una clave
  // inventada («kind», «title», «snoozed_until») esto sería un 400.
  expect(insert?.erro, `o servidor recusou o INSERT: ${JSON.stringify(insert?.erro)}`).toBe(null)
  expect(insert?.status).toBe(201)

  const corpo = insert?.corpo ?? {}
  expect(corpo['titulo']).toEqual(expect.any(String))
  expect(corpo['title']).toBeUndefined()
  expect(corpo['kind']).toBeUndefined()
  expect(corpo['snoozed_until']).toBeUndefined()
  // `id` = `client_uuid` = el uuid local: la fila que vuelva del pull es la
  // MISMA tarea que ya está en pantalla, no una segunda.
  expect(corpo['client_uuid']).toEqual(expect.any(String))
  expect(corpo['id']).toBe(corpo['client_uuid'])
  // Y apunta a un negocio de verdad, que es lo que exige `tasks_owner_chk`.
  expect(corpo['opportunity_id'] ?? corpo['lead_id']).not.toBe(null)

  await esperarOutboxVazio(page)
  expect(escritasRejeitadas(registro)).toEqual([])
  expect(errosDaApp(erros)).toEqual([])
})

test('o gate de Registrar cria a tarefa com canal, e «Reagendar» manda snoozed_to', async ({
  page,
}) => {
  const erros = vigiarErros(page)
  const registro = await instalarSupabaseDeRede(page)
  await ligarMockDeIngest(page)
  await entrarComoTomas(page)
  await expect(page.getByRole('button', { name: 'Fazer agora' }).first()).toBeVisible({
    timeout: 20_000,
  })

  /* ── El gate: registrar en la Prueba Tripolla deja una próxima acción ──── */
  // Se entra por teclado y no por micrófono: el mismo motor, sin depender de
  // cuánto dura un hold del mouse.
  await page.goto('/registrar?opportunityId=89', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Teclado' }).click()
  await page
    .getByRole('dialog')
    .getByRole('textbox')
    .fill('Liguei para o Fernando da Prueba Tripolla. Quer a prova de 1000 caixas.')
  await page.getByRole('button', { name: 'Analisar' }).click()

  const confirmar = page.getByRole('button', { name: 'Confirmar' })
  await expect(confirmar).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('O que você vai fazer').fill('Levar a prova de 1000 caixas')
  await page.getByRole('radio', { name: 'Amanhã', exact: true }).first().click()
  await expect(confirmar).toBeEnabled()
  await confirmar.click()

  // Termina en el Dossiê del cliente, que es donde el registro se ve.
  await expect(page).toHaveURL(/\/carteira\/89$/, { timeout: 30_000 })

  await expect
    .poll(() => escritasEm(registro, 'tasks', 'POST').length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const insert = escritasEm(registro, 'tasks', 'POST')[0]
  expect(insert?.erro, `o servidor recusou o INSERT: ${JSON.stringify(insert?.erro)}`).toBe(null)
  const corpo = insert?.corpo ?? {}
  expect(corpo['titulo']).toBe('Levar a prova de 1000 caixas')
  expect(corpo['opportunity_id']).toBe(89)
  // El gate pasa el canal, y en el vocabulario de la tabla (CHECK
  // `tasks_canal_chk`) — no en el de los toques de cadencia, donde existe
  // 'phone' y no existe 'meeting'.
  expect(['call', 'whatsapp', 'email', 'linkedin', 'meeting', 'visit', 'demo', 'proposal', 'other'])
    .toContain(corpo['canal'])
  expect(Object.keys(corpo)).not.toContain('kind')
  expect(Object.keys(corpo)).not.toContain('target')

  /* ── «Reagendar» la tarea que quedó: el PATCH ─────────────────────────── */
  const reagendar = page.getByRole('button', { name: 'Reagendar' })
  await expect(reagendar).toBeVisible({ timeout: 20_000 })
  await reagendar.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Quando você vai realmente fazer isto?')).toBeVisible()
  await sheet.getByRole('radio', { name: '+7d', exact: true }).click()

  await expect
    .poll(() => escritasEm(registro, 'tasks', 'PATCH').length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const patch = escritasEm(registro, 'tasks', 'PATCH')[0]
  expect(patch?.erro, `o servidor recusou o PATCH: ${JSON.stringify(patch?.erro)}`).toBe(null)
  // LA REGRESIÓN, en una línea: la columna se llama `snoozed_to`. Y el CHECK
  // `tasks_snooze_chk` exige que no sea null cuando el status es 'snoozed'.
  expect(patch?.corpo['snoozed_to']).toEqual(expect.any(String))
  expect(patch?.corpo['snoozed_until']).toBeUndefined()
  expect(patch?.corpo['status']).toBe('snoozed')

  await esperarOutboxVazio(page)
  expect(escritasRejeitadas(registro)).toEqual([])
  expect(errosDaApp(erros)).toEqual([])
})
