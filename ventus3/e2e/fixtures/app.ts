// e2e/fixtures/app.ts
// El arnés de las pruebas de punta a punta.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES REGLAS DE ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NUNCA SE TOCA LA BASE DE PRODUCCIÓN. El dev server que levanta
//    `playwright.config.ts` arranca con VITE_SUPABASE_URL apuntando a
//    `https://stub.supabase.test`, un host que no existe. Además, acá se
//    interceptan TODOS los pedidos a `*.supabase.*` y se contestan con un
//    doble. Si alguna de las dos defensas fallara, la otra alcanza: el
//    proyecto real (wtrbvgqxgcfjacqcndmb) queda cortado de raíz — se aborta
//    el pedido, no se contesta.
//
// 2. LOS DATOS SE SIEMBRAN EN DEXIE, QUE ES DE DONDE LA APP LEE. La app es
//    offline-first: todas las pantallas leen IndexedDB, nunca la red. Sembrar
//    ahí es sembrar el estado real del producto, no un mock de la capa de
//    datos. La siembra usa el MISMO módulo que la app (`/src/data/db.ts`,
//    servido por Vite): el registro de módulos es uno solo, así que
//    `getDb()` devuelve la misma instancia que usa React.
//
// 3. LA SESIÓN SE INYECTA EN localStorage, NO SE HACE LOGIN. El guardián de
//    sesión del Shell mira `supabase.auth.getSession()`, que lee la clave
//    `ventus.auth`. Un JWT armado a mano con `exp` en el futuro es suficiente
//    para que la app se comporte como con alguien adentro, y no hay ni un
//    round-trip a un servidor de auth.

import { test as base, expect, type Locator, type Page, type Route } from '@playwright/test'
import { AUTH_USER_ID, VENDEDOR, sementePadrao, type Semente } from './dados'

export { expect, VENDEDOR }
export * from './dados'

/** Host del doble de Supabase. No existe: sólo lo contesta `page.route`. */
const HOST_STUB = 'stub.supabase.test'

/* ══════════════════════════════════════════════════════════════════════════
   Sesión falsa
   ══════════════════════════════════════════════════════════════════════════ */

function base64url(valor: string): string {
  return Buffer.from(valor, 'utf8').toString('base64url')
}

/**
 * Un JWT con firma de mentira. No se verifica del lado del cliente —
 * supabase-js sólo mira `exp` para decidir si refresca— y del lado del
 * servidor no llega nunca a ninguno, porque el servidor es un doble.
 */
function sessaoFalsa(): Record<string, unknown> {
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = base64url(
    JSON.stringify({
      sub: AUTH_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'renata@ventapel.com.br',
      iat: agora,
      exp: agora + 60 * 60 * 8,
    }),
  )
  return {
    access_token: `${cabecalho}.${corpo}.assinatura-de-teste`,
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 60 * 60 * 8,
    expires_at: agora + 60 * 60 * 8,
    user: {
      id: AUTH_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'renata@ventapel.com.br',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   El doble de Supabase
   ══════════════════════════════════════════════════════════════════════════ */

export interface PedidoAoServidor {
  metodo: string
  url: string
  corpo: string | null
}

/** Contesta como PostgREST lo haría, sin base detrás. */
async function responderComoPostgrest(
  rota: Route,
  registro: PedidoAoServidor[],
  servidor: () => Record<string, unknown[]>,
): Promise<void> {
  const pedido = rota.request()
  const url = pedido.url()
  registro.push({ metodo: pedido.method(), url, corpo: pedido.postData() })

  const json = (body: unknown, status = 200): Promise<void> =>
    rota.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    })

  if (pedido.method() === 'OPTIONS') {
    await rota.fulfill({
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      },
    })
    return
  }

  // Auth: cualquier refresco devuelve la misma sesión, indefinidamente.
  if (url.includes('/auth/v1/')) {
    await json(sessaoFalsa())
    return
  }

  // Escrituras: PostgREST devuelve [] (o la fila) con 2xx. El outbox sólo
  // mira que no venga error, así que esto lo vacía como lo haría el servidor.
  if (pedido.method() === 'POST' && url.includes('/rest/v1/rpc/')) {
    await json({})
    return
  }
  if (pedido.method() === 'POST') {
    await json([], 201)
    return
  }
  if (pedido.method() === 'PATCH') {
    // El transporte trata «0 filas afectadas» como conflicto: hay que
    // devolver la fila para que un update se cuente como enviado.
    await json([{ id: 1 }])
    return
  }

  // Lecturas. Por defecto, vacío: los datos de la prueba ya están en Dexie y
  // el pull incremental no tiene por qué pisarlos.
  //
  // La excepción es `vendors`, y no es un capricho: cuando la cartera local
  // está vacía con sesión viva, `recuperarDePurga()` interpreta —bien— que
  // iOS purgó el store, borra el espejo (incluido el vendedor) y rehace la
  // carga desde el servidor. Un doble que devolviera [] también para vendors
  // dejaría a la app sin identidad para siempre, que no es lo que pasaría en
  // producción.
  const tabela = /\/rest\/v1\/([a-z_]+)/.exec(url)?.[1] ?? ''
  await json(servidor()[tabela] ?? [])
}

/* ══════════════════════════════════════════════════════════════════════════
   El fixture
   ══════════════════════════════════════════════════════════════════════════ */

export interface Ventus {
  /** Escribe la semilla en el IndexedDB de la página y recarga la app. */
  semear: (semente?: Semente) => Promise<void>
  /** Navega dentro de la app (sin recargar el bundle cuando ya está montado). */
  ir: (rota: string) => Promise<void>
  /** Lo que la app le mandó al servidor. Vacío = nada salió del teléfono. */
  pedidos: PedidoAoServidor[]
  /** Lee una tabla de Dexie desde el navegador. Para verificar escrituras. */
  ler: <T>(tabla: string) => Promise<T[]>
  /** Cuántas mutaciones hay esperando red. */
  pendentesNoOutbox: () => Promise<number>
}

interface Fixtures {
  ventus: Ventus
  /** Página ya autenticada, con la cartera sembrada y en `/`. */
  app: Page
}

export const test = base.extend<Fixtures>({
  ventus: async ({ context, page }, usar) => {
    const pedidos: PedidoAoServidor[] = []
    // Lo que «el servidor» sabe. Sólo el vendedor: ver el comentario en
    // responderComoPostgrest().
    let servidor: Record<string, unknown[]> = { vendors: sementePadrao().vendors }

    // Defensa 1: el doble contesta por el host stub.
    await context.route(`**://${HOST_STUB}/**`, (rota) =>
      responderComoPostgrest(rota, pedidos, () => servidor),
    )
    // Defensa 2: cualquier cosa que apunte a Supabase de verdad se corta.
    await context.route('**://*.supabase.co/**', (rota) => rota.abort('blockedbyclient'))
    await context.route('**://*.supabase.in/**', (rota) => rota.abort('blockedbyclient'))

    await context.addInitScript(
      ([sessao, tema]) => {
        try {
          localStorage.setItem('ventus.auth', JSON.stringify(sessao))
          localStorage.setItem('ventus.theme', tema as string)
          // Sin esto, el primer arranque pide permiso de notificaciones y el
          // sheet de instalación tapa media pantalla en las capturas.
          localStorage.setItem('ventus.instalar.dispensado', '1')
        } catch {
          /* modo privado: la prueba corre igual, sin sesión persistida */
        }
      },
      [sessaoFalsa(), 'light'] as const,
    )

    const ler = async <T,>(tabla: string): Promise<T[]> =>
      page.evaluate(async (nome) => {
        const mod = (await import('/src/data/db.ts')) as {
          getDb: () => { open: () => Promise<unknown>; table: (n: string) => { toArray: () => Promise<unknown[]> } }
        }
        const db = mod.getDb()
        await db.open()
        return (await db.table(nome).toArray()) as unknown[]
      }, tabla) as Promise<T[]>

    const ventus: Ventus = {
      pedidos,
      ler,
      async pendentesNoOutbox() {
        const filas = await ler<{ estado: string }>('outbox')
        return filas.filter((f) => f.estado !== 'enviado').length
      },
      async semear(semente = sementePadrao()) {
        servidor = { vendors: semente.vendors as unknown[] }
        // La app tiene que estar montada una vez para que Vite haya servido
        // `/src/data/db.ts`; recién ahí el import dinámico devuelve el MISMO
        // módulo que usa React. Después se recarga, y el arranque en frío ya
        // encuentra la cartera en Dexie — que es el caso real.
        if (!page.url().startsWith('http')) await page.goto('/')
        await page.evaluate(async (dados) => {
          const mod = (await import('/src/data/db.ts')) as {
            getDb: () => {
              open: () => Promise<unknown>
              vendors: { bulkPut: (v: unknown[]) => Promise<unknown> }
              opportunities: { bulkPut: (v: unknown[]) => Promise<unknown> }
              leads: { bulkPut: (v: unknown[]) => Promise<unknown> }
              tasks: { bulkPut: (v: unknown[]) => Promise<unknown> }
              commitments: { bulkPut: (v: unknown[]) => Promise<unknown> }
            }
          }
          const db = mod.getDb()
          await db.open()
          await db.vendors.bulkPut(dados.vendors)
          await db.opportunities.bulkPut(dados.opportunities)
          await db.leads.bulkPut(dados.leads)
          await db.tasks.bulkPut(dados.tasks)
          await db.commitments.bulkPut(dados.commitments)
        }, semente as unknown as Record<string, unknown[]>)
        await page.reload()
      },
      async ir(rota: string) {
        await page.goto(rota)
      },
    }

    await usar(ventus)
  },

  app: async ({ page, ventus }, usar) => {
    await page.goto('/')
    await ventus.semear()
    await esperarPelaTelaHoje(page)
    await usar(page)
  },
})

/* ══════════════════════════════════════════════════════════════════════════
   Helpers de interacción
   ══════════════════════════════════════════════════════════════════════════ */

/** La sección de las 3 tarjetas. Su rótulo es fijo en la pantalla Hoje. */
export function secaoDoDia(page: Page): Locator {
  return page.getByRole('region', { name: /ações de hoje/i })
}

export function cartoesDoDia(page: Page): Locator {
  return secaoDoDia(page).locator('> ul > li')
}

/** Espera a que Hoje termine de resolver el plan (o declare que no hay). */
export async function esperarPelaTelaHoje(page: Page): Promise<void> {
  await expect(secaoDoDia(page)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Carregando o seu dia')).toHaveCount(0)
}

/**
 * Un swipe de verdad: pointerdown, movimientos intermedios y pointerup.
 *
 * `SwipeRow` tiene lock de eje (hasta 10 px el gesto todavía puede ser un
 * scroll) y un umbral de 96 px, así que un `dragTo` de dos puntos no lo
 * dispara: hacen falta pasos. Se usa el mouse y no `touchscreen` porque el
 * touchscreen de Playwright sólo sabe hacer tap, y los handlers son de
 * Pointer Events — que el mouse también emite.
 */
export async function arrastar(alvo: Locator, dx: number): Promise<void> {
  const page = alvo.page()
  await alvo.scrollIntoViewIfNeeded()
  const caixa = await alvo.boundingBox()
  if (!caixa) throw new Error('O elemento a arrastar não está visível')

  const x0 = caixa.x + Math.min(60, caixa.width / 4)

  // En teléfono, el centro de una tarjeta alta cae DEBAJO de la barra de
  // comando del Ventus, que es fija. Agarrar ahí no arrastra la tarjeta:
  // arrastra la barra. Se prueban varias alturas y se agarra la primera en la
  // que el punto pertenece de verdad a la tarjeta.
  const alturas = [0.12, 0.25, 0.4, 0.5, 0.06]
  let y: number | null = null
  for (const fracao of alturas) {
    const candidato = caixa.y + caixa.height * fracao
    const dentro = await alvo.evaluate(
      (el, [px, py]) => {
        const alvoDoPonto = document.elementFromPoint(px as number, py as number)
        return alvoDoPonto !== null && el.contains(alvoDoPonto)
      },
      [x0, candidato] as const,
    )
    if (dentro) {
      y = candidato
      break
    }
  }
  if (y === null) throw new Error('Nenhum ponto da linha está livre para o gesto')

  await page.mouse.move(x0, y)
  await page.mouse.down()
  const passos = 12
  for (let i = 1; i <= passos; i++) {
    await page.mouse.move(x0 + (dx * i) / passos, y, { steps: 1 })
  }
  await page.mouse.up()
}

/** Deja la app sin red de verdad: el navegador falla todo fetch. */
export async function desconectar(page: Page, offline: boolean): Promise<void> {
  await page.context().setOffline(offline)
  // `navigator.onLine` no dispara el evento solo en todos los casos; la app
  // escucha 'online'/'offline' para pintar el cartel y para reintentar.
  await page.evaluate((valor) => {
    window.dispatchEvent(new Event(valor ? 'offline' : 'online'))
  }, offline)
}
