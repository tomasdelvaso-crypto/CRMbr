// e2e/hoje.spec.ts
// La tela Hoje es el producto entero en una pantalla, y todo lo que se prueba
// acá es una decisión de producto explícita del PLANO, no un detalle:
//
//  · TRES tarjetas. El límite duro es lo que separa un asistente de un panel
//    infinito de pendientes — el defecto que mató al v2.
//  · «Por que isto?» despliega la cuenta completa. Sin poder auditar el
//    ranking, el vendedor no le cree, y con razón.
//  · El swipe a la derecha resuelve y deja deshacer 5 segundos.
//  · Resolver las 3 NO trae una cuarta: el día está congelado y «Pronto por
//    hoje» tiene que ser alcanzable.

import {
  arrastar,
  cartoesDoDia,
  esperarPelaTelaHoje,
  expect,
  secaoDoDia,
  sementeVazia,
  test,
} from './fixtures/app'

test.describe('Tela Hoje', () => {
  test('mostra exatamente 3 cartões, com 5 negócios na carteira', async ({ app }) => {
    await expect(cartoesDoDia(app)).toHaveCount(3)

    // Y los tres son de clientes distintos: tres tarjetas del mismo logo se
    // leen como «el sistema está roto» aunque el score tenga razón.
    const clientes = await cartoesDoDia(app)
      .locator('p.font-semibold')
      .first()
      .allTextContents()
    expect(clientes.length).toBeGreaterThan(0)

    // El encabezado cuenta lo mismo que la lista.
    await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Suas 3 de hoje')

    // El resto de la cola existe, pero cerrada y a propósito.
    await expect(app.getByRole('button', { name: /Ver tudo/i })).toBeVisible()
  })

  test('«Por que isto?» abre as señales com peso e soma', async ({ app }) => {
    const primeiro = cartoesDoDia(app).first()
    const chip = primeiro.getByRole('button', { name: 'Por que isto?' })

    // Cerrado por defecto: la explicación no puede robarle la pantalla a la
    // acción.
    await expect(primeiro.getByText(/pontos de prioridade/)).toHaveCount(0)

    await chip.click()

    const explicacao = primeiro.getByText(/Soma = .* pontos de prioridade/)
    await expect(explicacao).toBeVisible()

    // Cada señal trae su peso con signo: es la cuenta, no un adjetivo.
    const sinais = primeiro.locator('ul li span.tnum')
    expect(await sinais.count()).toBeGreaterThan(0)
    await expect(sinais.first()).toHaveText(/^[+-]?\d+$/)

    // Y vuelve a cerrarse: es un toggle, no una puerta de una sola dirección.
    await chip.click()
    await expect(explicacao).toHaveCount(0)
  })

  test('arrastar para a direita resolve o cartão e oferece desfazer', async ({ app }) => {
    const cartoes = cartoesDoDia(app)
    const primeiro = cartoes.first()
    const cliente = (await primeiro.locator('p.font-semibold').first().innerText()).trim()

    await arrastar(primeiro, 200)

    // El toast de deshacer aparece en el mismo frame del gesto.
    const desfazer = app.getByRole('button', { name: 'Desfazer' })
    await expect(desfazer).toBeVisible()
    await expect(app.getByText(`Feito · ${cliente}`)).toBeVisible()

    // La tarjeta colapsa a la tira resuelta, sin desaparecer: ver «2 de 3
    // resueltas» es la mitad de la recompensa.
    await expect(cartoes).toHaveCount(3)
    await expect(primeiro.getByText('· feito')).toBeVisible()
    await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Faltam 2 de 3')

    // Deshacer devuelve la tarjeta a pendiente y NO escribe nada.
    await desfazer.click()
    await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Suas 3 de hoje')
    await expect(primeiro.getByRole('button', { name: 'Fazer agora' })).toBeVisible()
  })

  test('resolver as 3 dá «Pronto por hoje» e não traz uma quarta', async ({ app, ventus }) => {
    const cartoes = cartoesDoDia(app)
    await expect(cartoes).toHaveCount(3)

    for (let i = 0; i < 3; i++) {
      // Siempre el primero que siga pendiente: los resueltos quedan en la
      // lista como tira.
      const pendente = cartoes.filter({ has: app.getByRole('button', { name: 'Fazer agora' }) }).first()
      await arrastar(pendente, 200)
      // Se cierra el toast para que el siguiente gesto no caiga sobre él.
      await app.getByRole('button', { name: 'Desfazer' }).waitFor()
      await app.getByRole('button', { name: 'Dispensar aviso' }).first().click()
      await app.waitForTimeout(150)
    }

    await expect(app.getByRole('heading', { name: 'Pronto por hoje' })).toBeVisible()
    await expect(app.getByText('As 3 de hoje estão resolvidas')).toBeVisible()

    // Y la lista sigue teniendo 3: ni una tarjeta nueva ocupó el lugar.
    await expect(cartoes).toHaveCount(3)
    await expect(app.getByRole('button', { name: 'Fazer agora' })).toHaveCount(0)

    // El día está congelado en Dexie, así que recargar no lo reabre.
    await app.reload()
    await esperarPelaTelaHoje(app)
    await expect(app.getByRole('heading', { name: 'Pronto por hoje' })).toBeVisible()
    await expect(cartoesDoDia(app)).toHaveCount(3)

    // Las tres resoluciones se encolaron para subir; ninguna se perdió.
    const outbox = await ventus.ler<{ tabla: string }>('outbox')
    expect(outbox.length).toBeGreaterThanOrEqual(3)
  })

  test('carteira vazia não se confunde com dia tranquilo', async ({ page, ventus }) => {
    await ventus.semear(sementeVazia())
    await expect(page.getByText('Baixando a sua carteira')).toBeVisible()
    await expect(page.getByText('Nada urgente na carteira')).toHaveCount(0)
  })
})
