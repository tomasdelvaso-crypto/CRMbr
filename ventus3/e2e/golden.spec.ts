// e2e/golden.spec.ts
// La Golden Hour es el único bloque del producto que genera pipeline, y su
// diseño entero es una defensa contra la distracción. Lo que se prueba acá es
// justamente esa defensa:
//
//  · Al entrar en foco DESAPARECE el chrome: header, bottom nav, FAB y barra
//    de comando. Una salida lateral durante la hora es la forma más barata de
//    que la hora no ocurra.
//  · Los cuatro botones (Ligou · Falou · Agendou · Passar) mueven el carrusel
//    solos. El dedo no tiene que arrastrar nada entre contacto y contacto.
//  · El cierre de 60 segundos no se puede saltear: el sello espera a las tres
//    respuestas o a que el minuto pase.
//  · El back del sistema pide confirmación en vez de sacar al vendedor.

import { abrir, expect, test } from './fixtures/app'

/** Entra a la hora y arranca el bloque. Deja la pantalla en modo foco. */
async function entrarEmFoco(page: import('@playwright/test').Page): Promise<void> {
  await abrir(page, '/golden')
  await expect(page.getByRole('button', { name: 'Começar a hora' })).toBeVisible()
  await page.getByRole('button', { name: 'Começar a hora' }).click()
  await expect(page.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()
}

test.describe('Golden Hour', () => {
  test('a abertura mostra a fila derivada e o bloco de 4 contatos', async ({ app }) => {
    await abrir(app, '/golden')
    await expect(app.getByRole('heading', { name: '4 contatos prontos' })).toBeVisible()
    await expect(app.getByText(/Montada agora com quem está mais atrasado/)).toBeVisible()
    // Los tres primeros, para que arrancar no sea a ciegas.
    await expect(app.getByText('Frigorífico Sul')).toBeVisible()
  })

  test('o modo foco esconde toda a navegação', async ({ app }) => {
    // Antes: el chrome está.
    await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()

    await entrarEmFoco(app)

    await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0)
    // El header de la app se va. El único <header> que queda es el HUD del
    // bloque —reloj, toques y «Encerrar»—, que es contenido, no navegación.
    await expect(app.getByRole('heading', { level: 1 })).toHaveCount(0)
    await expect(app.getByRole('button', { name: /Registrar por voz/ })).toHaveCount(0)
    await expect(app.getByRole('button', { name: 'Perguntar ao Ventus' })).toHaveCount(0)

    // Y sí está lo único que importa durante el bloque: el reloj y los cuatro
    // botones.
    await expect(app.getByRole('button', { name: /Ligou/ })).toBeVisible()
    await expect(app.getByRole('button', { name: /Encerrar|Fechar/ })).toBeVisible()
  })

  test('os quatro botões avançam o carrossel', async ({ app, ventus }) => {
    await entrarEmFoco(app)
    const carrossel = app.getByRole('group', { name: /Contato \d+ de \d+/ })
    await expect(carrossel).toHaveAttribute('aria-label', 'Contato 1 de 4')

    // 1 · «Ligou» = tocó y no atendió. Registra touchpoint y avanza.
    await app.getByRole('button', { name: /Ligou/ }).click()
    await expect(carrossel).toHaveAttribute('aria-label', 'Contato 2 de 4')

    // 2 · «Falou» abre los tres resultados en el mismo lugar, sin sheet.
    await app.getByRole('button', { name: /Falou/ }).click()
    await expect(app.getByRole('button', { name: 'Interessado' })).toBeVisible()
    await app.getByRole('button', { name: 'Interessado' }).click()
    await expect(carrossel).toHaveAttribute('aria-label', 'Contato 3 de 4')

    // 3 · «Agendou» celebra y avanza.
    await app.getByRole('button', { name: /Agendou/ }).click()
    await expect(app.getByText(/Reunião marcada com/)).toBeVisible()
    await expect(carrossel).toHaveAttribute('aria-label', 'Contato 4 de 4')

    // 4 · «Passar» avanza SIN gastar un toque de la cadencia. Es la fila que
    // se termina, así que el carrusel se queda en el último y la pantalla
    // pasa al estado terminal.
    await app.getByRole('button', { name: /Passar/ }).click()
    await expect(app.getByRole('heading', { name: 'Fila terminada' })).toBeVisible()

    // Tres toques registrados, no cuatro: «Passar» no es un toque.
    const toques = await ventus.ler<{ lead_id: number }>('touchpoints')
    expect(toques).toHaveLength(3)
  })

  test('o fechamento de 60s não se pode saltear', async ({ app }) => {
    await entrarEmFoco(app)
    await app.getByRole('button', { name: /Ligou/ }).click()
    await app.getByRole('button', { name: /Encerrar|Fechar/ }).click()

    await expect(app.getByRole('heading', { name: 'Fechamento' })).toBeVisible()

    // El sello arranca bloqueado y lo DICE, sin culpabilizar.
    const selo = app.getByRole('button', { name: /Selar a Hora Cheia|Encerrar a hora/ })
    await expect(selo).toBeDisabled()
    await expect(
      app.getByText('Responda as três perguntas — ou espere os 60 segundos.'),
    ).toBeVisible()

    // Contestar UNA no alcanza.
    await app.getByRole('button', { name: 'Preço' }).click()
    await expect(selo).toBeDisabled()

    // Las tres, sí. Es la única puerta rápida: 60 s o tres toques.
    await app.getByRole('button', { name: 'Nenhuma hoje' }).click()
    await app.getByRole('button', { name: 'Ligar mais cedo' }).click()
    await expect(selo).toBeEnabled()

    await selo.click()
    await expect(app.getByRole('heading', { name: /Hora Cheia selada|Hora encerrada/ })).toBeVisible()
  })

  test('o fechamento se destrava sozinho aos 60 segundos', async ({ app }) => {
    await entrarEmFoco(app)
    await app.getByRole('button', { name: /Encerrar|Fechar/ }).click()
    const selo = app.getByRole('button', { name: /Selar a Hora Cheia|Encerrar a hora/ })
    await expect(selo).toBeDisabled()

    // `Fechamento` mide el minuto con `Date.now()` dentro de un `setInterval`
    // real de 250ms (ver Fechamento.tsx), así que instalar el reloj falso DE
    // ENTRADA freezaría las transições de foco/sheet que llevan hasta acá
    // (page.clock también reemplaza requestAnimationFrame). Se instala recién
    // ACÁ, con el temporizador de Fechamento ya corriendo: ese intervalo
    // sigue latiendo de verdad cada 250ms —page.clock no toca un timer que ya
    // estaba armado antes de instalarse— pero lo que lee en cada latido es
    // `Date.now()`, y ESE sí queda bajo control. Adelantar 60s de reloj falso
    // hace que el próximo latido real (a lo sumo 250ms después) vea que ya
    // pasó la ventana y destrabe el botón — la misma prueba, sin esperar el
    // minuto de pared.
    await app.clock.install()
    await app.clock.fastForward(60_000)

    // «No salteable» no puede significar «encerrado en la propia app».
    await expect(selo).toBeEnabled()
  })

  test('o back do sistema pede confirmação', async ({ app }) => {
    await entrarEmFoco(app)

    await app.goBack()

    const dialogo = app.getByRole('dialog')
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByText('Sair da Golden Hour?')).toBeVisible()
    await expect(
      dialogo.getByText('Os toques já registrados ficam salvos e sobem sozinhos.'),
    ).toBeVisible()

    // «Continuar» deja al vendedor exactamente donde estaba.
    await dialogo.getByRole('button', { name: 'Continuar' }).click()
    await expect(app.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()
    await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toHaveCount(0)

    // Y si insiste, sale de verdad.
    await app.goBack()
    await app.getByRole('dialog').getByRole('button', { name: 'Sair' }).click()
    await expect(app.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  })
})

test.describe('Golden Hour sem fila', () => {
  test('sem leads, a abertura manda para a Cadência em vez de abrir vazia', async ({
    page,
    ventus,
  }) => {
    const semLeads = { ...(await import('./fixtures/dados')).sementePadrao(), leads: [] }
    await ventus.semear(semLeads)
    await abrir(page, '/golden')
    await expect(page.getByRole('heading', { name: 'A fila de hoje está vazia' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Montar a fila na Cadência' })).toBeVisible()
  })
})
