// e2e/offline.spec.ts
// La promesa que sostiene todo el producto: dentro de un galpón sin señal, la
// app abre, muestra el día y REGISTRA. Nada se pierde y nada miente.
//
// Acá se prueba con la red cortada de verdad (`context.setOffline`), no con un
// mock de `navigator.onLine`: los fetch fallan como fallan en la calle.
//
//  · Sin red, la pantalla lo dice —«Sem conexão»— y no esconde nada.
//  · Un registro hecho sin señal entra igual, queda en el outbox y el badge
//    del micrófono lo muestra: es la respuesta a «lo que dicté, ¿se guardó?».
//  · Al volver la señal, la cola se vacía sola y el badge desaparece.
//
// ── UNA ACLARACIÓN NECESARIA ─────────────────────────────────────────────
// Estas pruebas corren contra el DEV SERVER, donde el service worker está
// apagado a propósito (`devOptions.enabled: false` en vite.config.ts). Sin
// service worker, un arranque en frío sin red no puede funcionar: no hay quién
// sirva el index.html ni los chunks. Por eso acá no se recarga la página con
// la red cortada —eso probaría el SW, no la app— y se navega SIEMPRE por
// dentro del router, que es donde vive la lógica offline: Dexie, el outbox y
// el sync. Las rutas se visitan una vez con red para que su chunk quede en el
// registro de módulos, igual que el precache del SW haría en producción.

import { desconectar, expect, secaoDoDia, test } from './fixtures/app'
import type { Page } from '@playwright/test'

/**
 * El badge del FAB va en su rótulo accesible: es el contador del outbox.
 *
 * `.last()` porque el Dossiê tiene su propio botón «Registrar por voz» en el
 * encabezado y el FAB del Shell se pinta después del <main>. (Que dos botones
 * de la misma pantalla tengan rótulo idéntico está anotado en docs/QA.md.)
 */
function fab(page: Page) {
  return page.locator('button[aria-label^="Registrar por voz"]').last()
}

async function pendentesNoBadge(page: Page): Promise<number> {
  const rotulo = (await fab(page).getAttribute('aria-label')) ?? ''
  const m = /\.\s*(\d+)\s*registros?\s*pendentes?/.exec(rotulo)
  return m?.[1] ? Number(m[1]) : 0
}

/**
 * Deja los chunks de Registrar y del Dossiê cargados. Ver el encabezado.
 *
 * La visita tiene que ser POR DENTRO del router: cada `page.goto` es un
 * documento nuevo y tira el registro de módulos anterior, así que calentar con
 * navegaciones reales no calienta nada. Además, Vite le pone a cada import
 * dinámico un `?t=<timestamp>` propio de ese documento — dos documentos, dos
 * URLs, dos módulos distintos.
 */
async function aquecerRotas(page: Page): Promise<void> {
  await expect(secaoDoDia(page)).toBeVisible()

  await fab(page).click()
  await expect(page.getByRole('button', { name: 'Segure para gravar uma nota de voz' })).toBeVisible()
  await page.goBack()

  await page.getByRole('link', { name: 'Carteira' }).click()
  await page.getByRole('button', { name: /Linha 3 — fita e selagem/ }).first().click()
  await expect(page.getByRole('button', { name: /^5\s*Dor/ })).toBeVisible()

  await page.getByRole('link', { name: 'Hoje' }).click()
  await expect(secaoDoDia(page)).toBeVisible()
}

async function gravar(page: Page): Promise<void> {
  const microfone = page.getByRole('button', { name: 'Segure para gravar uma nota de voz' })
  const caixa = await microfone.boundingBox()
  if (!caixa) throw new Error('O microfone não está visível')
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1600)
  await page.mouse.up()
}

test.describe('Sem sinal', () => {
  test('a carteira segue navegável e a falta de sinal se anuncia', async ({ app }) => {
    await aquecerRotas(app)
    await desconectar(app, true)

    // El cartel aparece sin recargar nada.
    await expect(app.getByRole('status').filter({ hasText: 'Sem conexão' })).toBeVisible()

    // Las 3 tarjetas del día siguen ahí: salen de Dexie, no de la red.
    await expect(secaoDoDia(app).locator('> ul > li')).toHaveCount(3)

    // Y se puede seguir navegando por la cartera.
    await app.getByRole('link', { name: 'Carteira' }).click()
    await expect(app.getByText('Tetra Pak').first()).toBeVisible()
  })

  test('registrar sem rede deixa a nota no outbox, com badge, e sobe ao voltar', async ({
    app,
    ventus,
  }) => {
    await aquecerRotas(app)
    await desconectar(app, true)

    // Nada pendiente al empezar: el badge no está.
    expect(await pendentesNoBadge(app)).toBe(0)
    const escritasAntes = ventus.pedidos.filter(
      (p) => p.metodo === 'POST' || p.metodo === 'PATCH',
    ).length

    // Se entra por donde se entra de verdad: la tarjeta del día.
    await secaoDoDia(app).getByRole('button', { name: 'Fazer agora' }).first().click()
    await expect(app).toHaveURL(/\/registrar$/)

    await gravar(app)
    await expect(app.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 20_000 })

    await app.getByRole('radio', { name: 'Amanhã' }).click()
    await app.getByRole('button', { name: 'Confirmar' }).click()

    // El registro se guardó igual: la pantalla avanza al Dossiê del cliente.
    await expect(app).toHaveURL(/\/carteira\/\d+$/)

    // Está en el espejo local…
    const atividades = await ventus.ler<{ opportunity_id: number }>('activities')
    expect(atividades.length).toBeGreaterThan(0)

    // …y en la cola, esperando red, con el badge visible en el micrófono.
    const naFila = await ventus.pendentesNoOutbox()
    expect(naFila).toBeGreaterThan(0)
    await expect(fab(app)).toHaveAttribute('aria-label', /\d+ registros? pendentes? de envio/)
    expect(await pendentesNoBadge(app)).toBe(naFila)

    // Nada salió del teléfono mientras no había señal.
    expect(
      ventus.pedidos.filter((p) => p.metodo === 'POST' || p.metodo === 'PATCH').length,
    ).toBe(escritasAntes)

    // ── Vuelve la señal ──────────────────────────────────────────────────
    await desconectar(app, false)

    // La cola se vacía sola, sin que nadie toque nada.
    await expect.poll(async () => ventus.pendentesNoOutbox(), { timeout: 30_000 }).toBe(0)

    // El badge se apaga…
    await expect(fab(app)).toHaveAttribute('aria-label', 'Registrar por voz')
    // …y el servidor recibió las escrituras que estaban esperando.
    expect(
      ventus.pedidos.filter((p) => p.metodo === 'POST' || p.metodo === 'PATCH').length,
    ).toBeGreaterThan(escritasAntes)
  })

  test('Registrar conta quantos registros esperam rede', async ({ app }) => {
    await aquecerRotas(app)
    await desconectar(app, true)

    await secaoDoDia(app).getByRole('button', { name: 'Fazer agora' }).first().click()
    await gravar(app)
    await expect(app.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 20_000 })
    await app.getByRole('radio', { name: 'Amanhã' }).click()
    await app.getByRole('button', { name: 'Confirmar' }).click()
    await expect(app).toHaveURL(/\/carteira\/\d+$/)

    await fab(app).click()
    await expect(
      app.getByText(/registro\(s\) esperando rede para subir\. Já estão salvos\./),
    ).toBeVisible()
  })
})
