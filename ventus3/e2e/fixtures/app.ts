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

/**
 * Páginas a las que se les cortó la red con `desconectar()`.
 *
 * Hace falta porque `context.setOffline(true)` corta la red DE VERDAD pero no
 * toca los pedidos interceptados por `page.route`: el doble de Supabase seguía
 * contestando en modo avión y el outbox se vaciaba solo. Un teléfono sin señal
 * no tiene un servidor adentro.
 */
const semRede = new WeakMap<Page, boolean>()

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
  offline: () => boolean,
): Promise<void> {
  const pedido = rota.request()
  const url = pedido.url()

  if (offline()) {
    // Ni se registra: en modo avión este pedido nunca sale del teléfono.
    await rota.abort('internetdisconnected')
    return
  }

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
    // Lo que «el servidor» sabe. Sólo el vendedor de la semilla: el resto de
    // las tablas contestan vacío a propósito. Ver responderComoPostgrest().
    let servidor: Record<string, unknown[]> = { vendors: sementePadrao().vendors }

    // Defensa 1: el doble contesta por el host stub.
    await context.route(`**://${HOST_STUB}/**`, (rota) =>
      responderComoPostgrest(rota, pedidos, () => servidor, () => semRede.get(page) === true),
    )
    // Defensa 2: cualquier cosa que apunte a Supabase de verdad se corta.
    await context.route('**://*.supabase.co/**', (rota) => rota.abort('blockedbyclient'))
    await context.route('**://*.supabase.in/**', (rota) => rota.abort('blockedbyclient'))

    await context.addInitScript(
      ([sessao, tema]) => {
        try {
          localStorage.setItem('ventus.auth', JSON.stringify(sessao))
          // El tema se siembra sólo si no hay uno elegido: este script corre
          // en CADA navegación y, si pisara el valor, una prueba que cambie el
          // tema (las capturas) lo perdería en el primer reload.
          if (localStorage.getItem('ventus.theme') === null) {
            localStorage.setItem('ventus.theme', tema as string)
          }
          // Sin esto, el primer arranque pide permiso de notificaciones y el
          // sheet de instalación tapa media pantalla en las capturas.
          localStorage.setItem('ventus.instalar.dispensado', '1')
        } catch {
          /* modo privado: la prueba corre igual, sin sesión persistida */
        }
      },
      [sessaoFalsa(), 'light'] as const,
    )

    // Dexie, desde adentro de la página y por el MISMO módulo que usa la app.
    //
    // El especificador va en una constante y no como literal: con un literal,
    // TypeScript intenta resolver '/src/data/db.ts' contra el disco y no lo
    // encuentra (esa ruta la sirve Vite, no el sistema de archivos).
    const MODULO_DB = '/src/data/db.ts'

    interface TabelaDexie {
      bulkPut: (linhas: readonly unknown[]) => Promise<unknown>
      toArray: () => Promise<unknown[]>
      delete: (chave: string) => Promise<unknown>
    }
    interface BancoDexie {
      open: () => Promise<unknown>
      table: (nome: string) => TabelaDexie
    }

    const ler = async <T,>(tabla: string): Promise<T[]> => {
      const linhas = await page.evaluate(
        async ([modulo, nome]) => {
          const mod = (await import(/* @vite-ignore */ modulo)) as {
            getDb: () => { open: () => Promise<unknown>; table: (n: string) => { toArray: () => Promise<unknown[]> } }
          }
          const db = mod.getDb()
          await db.open()
          return db.table(nome).toArray()
        },
        [MODULO_DB, tabla] as const,
      )
      return linhas as T[]
    }

    const ventus: Ventus = {
      pedidos,
      ler,
      async pendentesNoOutbox() {
        const filas = await ler<{ estado: string }>('outbox')
        return filas.filter((f) => f.estado !== 'enviado').length
      },
      async semear(semente = sementePadrao()) {
        servidor = { vendors: [...semente.vendors] }

        // El primer arranque va a /instalar, y no es un capricho.
        //
        // La app tiene que montarse una vez para que Vite sirva
        // `/src/data/db.ts` —recién ahí el import dinámico devuelve el MISMO
        // módulo que usa React, con la misma instancia de Dexie—. Pero si ese
        // primer arranque fuera la tela Hoje, sus queries correrían contra una
        // base todavía vacía, el resultado vacío quedaría guardado en el cache
        // que la app persiste en Dexie, y el arranque siguiente lo hidrataría
        // y lo trataría como fresco 60 segundos (staleTime): la pantalla diría
        // «a fila de hoje está vazia» con los cuatro leads ya en el aparato.
        // /instalar no monta ninguna query de cartera, así que abre el módulo
        // sin dejar nada guardado.
        if (!page.url().startsWith('http')) await abrir(page, '/instalar')

        // Antes de sembrar hay que esperar a que la app sepa QUIÉN es el
        // vendedor. `CamadaDeDados` —que es quien conecta el cache al canal de
        // cambios— solo se monta con un vendedor resuelto, así que un aviso
        // emitido antes no lo escucha nadie y la pantalla se queda con el
        // resultado del arranque vacío.
        await expect
          .poll(async () => (await ler<unknown>('vendors')).length, {
            timeout: 15_000,
            message: 'A app nunca resolveu o vendedor da sessão',
          })
          .toBeGreaterThan(0)
        await page.waitForTimeout(200)

        const esperado = semente.opportunities.length + semente.leads.length

        const escrever = async (): Promise<void> => {
          await page.evaluate(
            async ([modulo, dados]) => {
              const mod = (await import(/* @vite-ignore */ modulo as string)) as {
                getDb: () => BancoDexie
              }
              const db = mod.getDb()
              await db.open()
              for (const [tabela, linhas] of Object.entries(
                dados as Record<string, readonly unknown[]>,
              )) {
                await db.table(tabela).bulkPut(linhas)
              }

              // Se avisa por el MISMO canal que usa el sync cuando el pull
              // trae filas nuevas. No es un adorno: la app monta TanStack
              // Query sobre Dexie y trata lo leído como fresco 60 s
              // (staleTime), así que sin el aviso la pantalla sigue mostrando
              // el resultado del arranque anterior —con la base vacía— aunque
              // los datos ya estén. Avisando, la app invalida las claves
              // afectadas y relee, que es exactamente lo que hace en campo.
              const sync = (await import(
                /* @vite-ignore */ (modulo as string).replace('db.ts', 'sync.ts')
              )) as { notificarMudancas: (tabelas: readonly string[]) => void }
              sync.notificarMudancas(Object.keys(dados as Record<string, unknown>))
            },
            [MODULO_DB, semente as unknown as Record<string, readonly unknown[]>] as const,
          )
        }

        const cuenta = async (): Promise<number> => {
          const [opps, leads] = await Promise.all([
            ler<unknown>('opportunities'),
            ler<unknown>('leads'),
          ])
          return opps.length + leads.length
        }

        // Se siembra hasta que la semilla SOBREVIVA dos comprobaciones
        // seguidas, y no por las dudas: el primer arranque encuentra la base
        // vacía con sesión viva —la firma exacta de una purga de iOS— y
        // `recuperarDePurga()` limpia el espejo entero para rehacer la carga
        // desde el servidor. Ese borrado puede caer justo encima de lo que
        // acabamos de escribir. Del segundo arranque en adelante la base ya no
        // está vacía y no vuelve a dispararse. Es comportamiento correcto de
        // la app; lo anómalo es sembrar por atrás, que es cosa de la prueba.
        for (let tentativa = 0; tentativa < 4; tentativa++) {
          await escrever()
          await page.waitForTimeout(250)
          if ((await cuenta()) < esperado) continue
          await page.waitForTimeout(400)
          if ((await cuenta()) < esperado) continue
          // Arranque limpio con la cartera ya en el aparato, que es como
          // abre el teléfono todas las mañanas.
          await abrir(page, '/')
          return
        }
        throw new Error('A semente não sobreviveu ao arranque da app')
      },
      async ir(rota: string) {
        await abrir(page, rota)
      },
    }

    await usar(ventus)
  },

  app: async ({ page, ventus }, usar) => {
    // Ojo: acá NO se navega a '/' antes de sembrar. `semear()` hace el primer
    // arranque en /instalar justamente para no dejar en el cache persistido el
    // resultado de una tela Hoje leída con la base todavía vacía.
    await ventus.semear()
    await esperarPelaTelaHoje(page)
    await usar(page)
  },
})

/* ══════════════════════════════════════════════════════════════════════════
   Helpers de interacción
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Abre una ruta.
 *
 * `domcontentloaded` y no `load` a propósito: la app abre un WebSocket de
 * realtime que, contra el doble, nunca conecta. Esperar `load` sería esperar a
 * que ese socket se rinda, en cada navegación de cada prueba.
 */
export async function abrir(page: Page, rota: string): Promise<void> {
  await page.goto(rota, { waitUntil: 'domcontentloaded' })
}

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
  semRede.set(page, offline)
  await page.context().setOffline(offline)
  // `navigator.onLine` no dispara el evento solo en todos los casos; la app
  // escucha 'online'/'offline' para pintar el cartel y para reintentar.
  await page.evaluate((valor) => {
    window.dispatchEvent(new Event(valor ? 'offline' : 'online'))
  }, offline)
}
