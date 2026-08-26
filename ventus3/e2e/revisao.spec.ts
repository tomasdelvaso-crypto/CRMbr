// e2e/revisao.spec.ts
// La bandeja Revisão es la ÚNICA puerta por la que lo que el agente propone
// entra a la base. Todo lo de acá es camino de escritura, y por eso se prueba
// mirando lo que sale al servidor y no lo que dice la pantalla.
//
// La decisión de producto que sostiene la pantalla es que se decide POR CAMPO
// y no por ítem: un audio de 40 segundos puede proponer tres cambios y el
// vendedor querer dos. Si el recorte no llegara al payload, la RPC ejecutaría
// igual el campo rechazado —ejecuta lo que está GUARDADO, no lo que la
// pantalla mostró— y el vendedor tendría en la base algo que dijo que no.
// Esa es la prueba central de este archivo.

import { abrir, expect, PROPOSTA_ID, sementeComProposta, test } from './fixtures/app'

/**
 * Las ESCRITURAS que salieron a `ventus_actions`, en orden.
 *
 * Sólo PATCH y POST: el doble de PostgREST también registra los GET del pull y
 * los OPTIONS del preflight que supabase-js manda antes de cada uno, y ninguno
 * de los dos es una decisión del vendedor.
 */
function escritasDaProposta(
  pedidos: readonly { metodo: string; url: string; corpo: string | null }[],
) {
  return pedidos.filter(
    (p) =>
      (p.metodo === 'PATCH' || p.metodo === 'POST') &&
      (p.url.includes('ventus_actions') || p.url.includes('/rpc/ventus_commit_action')),
  )
}

test.describe('Revisão · aceitar por campo', () => {
  test('recusar um campo o tira do payload ANTES do commit', async ({ app, ventus }) => {
    await ventus.semear(sementeComProposta())
    await abrir(app, '/revisao')

    const cartao = app.getByRole('listitem').filter({ hasText: 'CD Guarulhos' }).first()
    await expect(cartao).toBeVisible({ timeout: 15_000 })

    // Tres campos revisables, cada uno con su «de → para».
    for (const rotulo of ['Título da tarefa', 'Prazo', 'Canal']) {
      await expect(cartao.getByText(rotulo, { exact: true })).toBeVisible()
    }

    // Con los tres aceptados el botón no cuenta nada: dice «Aceitar».
    // El botón de confirmar, y no el toggle de un campo («Aceitar Canal») ni
    // el sr-only que SwipeRow deja para el teclado: el patrón exacto descarta
    // el primero y `.first()` toma el visible, que va antes en el DOM.
    const confirmar = cartao.getByRole('button', { name: /^Aceitar(?: \d+ de \d+)?$/ }).first()
    await expect(confirmar).toHaveText('Aceitar')

    // Se rechaza «Canal». El botón pasa a decir exactamente qué va a escribir.
    await cartao.getByRole('button', { name: 'Recusar Canal' }).click()
    await expect(confirmar).toHaveText('Aceitar 2 de 3')
    // Y el rechazo es reversible: es un toggle, no una puerta de una vía.
    await expect(cartao.getByRole('button', { name: 'Aceitar Canal' })).toBeVisible()

    // Antes de confirmar, NADA salió del teléfono para esta propuesta.
    expect(escritasDaProposta(ventus.pedidos)).toHaveLength(0)

    await confirmar.click()

    // El objetivo de diseño de la pantalla es llegar a cero: la tarjeta se va.
    await expect(cartao).toHaveCount(0, { timeout: 15_000 })

    // Se espera a que la COLA se vacíe, y no a que aparezca tal pedido: es la
    // condición honesta —«no queda nada por mandar»— y no depende de cuánto
    // tarde el dev server con los tres perfiles corriendo a la vez.
    await expect
      .poll(() => ventus.pendentesNoOutbox(), {
        timeout: 30_000,
        message: 'a fila do outbox nunca esvaziou',
      })
      .toBe(0)

    const escritas = escritasDaProposta(ventus.pedidos)
    expect(escritas.length).toBeGreaterThanOrEqual(2)

    // 1) El recorte: un PATCH que reescribe el payload SIN el campo rechazado.
    const recorte = escritas.find((p) => p.metodo === 'PATCH')
    expect(recorte, 'faltou o PATCH que recorta o payload').toBeDefined()
    const corpo = JSON.parse(recorte?.corpo ?? '{}') as { payload?: Record<string, unknown> }
    expect(Object.keys(corpo.payload ?? {}).sort()).toEqual(['due_date', 'titulo'])
    expect(corpo.payload).not.toHaveProperty('canal')

    // 2) Y recién después el commit, con la firma real de la RPC: un solo
    //    argumento. PostgREST resuelve por conjunto exacto de nombres.
    const commit = escritas.find((p) => p.url.includes('/rpc/ventus_commit_action'))
    expect(commit, 'faltou o commit da ação').toBeDefined()
    expect(JSON.parse(commit?.corpo ?? '{}')).toEqual({ p_action_id: PROPOSTA_ID })

    // El orden importa: commitear antes de recortar ejecutaría el campo
    // rechazado.
    expect(escritas.indexOf(recorte!)).toBeLessThan(escritas.indexOf(commit!))
  })

  test('aceitar os três campos vai direto ao commit, sem recortar nada', async ({
    app,
    ventus,
  }) => {
    await ventus.semear(sementeComProposta())
    await abrir(app, '/revisao')

    const cartao = app.getByRole('listitem').filter({ hasText: 'CD Guarulhos' }).first()
    await expect(cartao).toBeVisible({ timeout: 15_000 })
    await cartao.getByRole('button', { name: 'Aceitar', exact: true }).first().click()
    await expect(cartao).toHaveCount(0, { timeout: 15_000 })

    await expect
      .poll(() => ventus.pendentesNoOutbox(), {
        timeout: 30_000,
        message: 'a fila do outbox nunca esvaziou',
      })
      .toBe(0)

    expect(
      escritasDaProposta(ventus.pedidos).filter((p) =>
        p.url.includes('/rpc/ventus_commit_action'),
      ),
    ).toHaveLength(1)

    // Sin recorte no hay PATCH: escribir el mismo payload de vuelta sería una
    // escritura sin sentido y una carrera contra el propio commit.
    const patches = escritasDaProposta(ventus.pedidos).filter((p) => p.metodo === 'PATCH')
    expect(patches).toHaveLength(0)
  })
})
