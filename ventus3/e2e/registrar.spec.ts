// e2e/registrar.spec.ts
// Registrar es la puerta de entrada de datos del CRM, y el número que existe
// para mover son las 18 interacciones registradas en 5 meses del v2. Todo lo
// que se prueba acá sale de esa premisa:
//
//  · EL GATE (M5): nada se confirma sin próxima acción CON fecha. Es el
//    arreglo de mayor impacto del plan — el 60% de las oportunidades del v2
//    no tiene próxima acción porque ponerla cuesta un teclado.
//  · Las DatePills resuelven la fecha con un toque, y la resuelven bien
//    (Hoje ≠ Amanhã, y lo que se elige queda marcado).
//  · EL CAMINO FELIZ SON 3 TOQUES: hablar, tocar una pastilla, confirmar.
//    Cada toque de más hay que pagarlo con un motivo mejor que «queda lindo».
//
// El micrófono es real: Chromium corre con `--use-fake-device-for-media-stream`,
// así que getUserMedia y MediaRecorder funcionan de verdad y lo que se prueba
// es el camino de producción, no un atajo. La ingesta corre en modo mock
// declarado (VITE_INGEST_MOCK=on) porque /api/ingest todavía no está desplegado.

import { abrir, expect, test, type Ventus } from './fixtures/app'
import type { Page } from '@playwright/test'

/** El id de la oportunidad Tetra Pak de la semilla. */
const TETRA = 101

/**
 * Mantiene apretado el micrófono y suelta. UN gesto = un toque.
 *
 * Más de 1 s (MIN_SEGUNDOS) para que la grabación no salga 'curto', y más de
 * 600 ms (MS_PARA_TRAVAR) para que se lea como hold y no como «tap para
 * trabar» — las dos constantes viven en la pantalla y esto las respeta.
 */
async function falar(page: Page, segundos = 1.6): Promise<void> {
  const microfone = page.getByRole('button', { name: 'Segure para gravar uma nota de voz' })
  await expect(microfone).toBeVisible()
  const caixa = await microfone.boundingBox()
  if (!caixa) throw new Error('O microfone não está visível')
  const x = caixa.x + caixa.width / 2
  const y = caixa.y + caixa.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(segundos * 1000)
  await page.mouse.up()
}

/** Espera a que la tarjeta de confirmación esté en pantalla. */
async function esperarConfirmacao(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 20_000 })
}

test.describe('Registrar', () => {
  test('o gate não deixa confirmar sem data de próxima ação', async ({ app }) => {
    await abrir(app, `/registrar?opportunityId=${String(TETRA)}`)
    await expect(app.getByText('Registrando em')).toBeVisible()

    await falar(app)
    await esperarConfirmacao(app)

    const confirmar = app.getByRole('button', { name: 'Confirmar' })

    // El borrador llega con cliente, tipo, resumen y próxima acción — pero sin
    // fecha, que es justamente lo que el modelo no puede inventar.
    await expect(app.getByLabel('O que você vai fazer')).not.toHaveValue('')
    await expect(confirmar).toBeDisabled()

    // Y dice QUÉ falta, en una línea y sin culpa.
    await expect(app.getByText('Escolha a data da próxima ação')).toBeVisible()

    // Borrar la próxima acción cambia el motivo del bloqueo: el gate es uno
    // solo y la pantalla nada más lo refleja.
    await app.getByLabel('O que você vai fazer').fill('')
    await expect(app.getByText('Diga qual é a próxima ação')).toBeVisible()
    await expect(confirmar).toBeDisabled()

    await app.getByLabel('O que você vai fazer').fill('Cobrar o volume mensal do Marcelo')
    await expect(app.getByText('Escolha a data da próxima ação')).toBeVisible()

    // Con la fecha, se destraba. Un solo toque.
    await app.getByRole('radio', { name: 'Amanhã' }).click()
    await expect(confirmar).toBeEnabled()
    await expect(app.getByText('Escolha a data da próxima ação')).toHaveCount(0)
  })

  test('as DatePills setam a data e marcam a escolhida', async ({ app }) => {
    await abrir(app, `/registrar?opportunityId=${String(TETRA)}`)
    await falar(app)
    await esperarConfirmacao(app)

    const quando = app.getByRole('radiogroup', { name: 'Quando' })
    const hoje = quando.getByRole('radio', { name: 'Hoje' })
    const amanha = quando.getByRole('radio', { name: 'Amanhã' })
    const calendario = app.getByLabel('Quando — escolher no calendário')

    // Nada elegido al abrir: el gate es explícito, no adivina.
    await expect(quando.getByRole('radio', { checked: true })).toHaveCount(0)
    await expect(app.getByText('Obrigatório')).toBeVisible()

    await hoje.click()
    await expect(hoje).toHaveAttribute('aria-checked', 'true')
    const dataDeHoje = await calendario.inputValue()
    expect(dataDeHoje).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Otra pastilla cambia la fecha y mueve la marca: son excluyentes.
    await amanha.click()
    await expect(amanha).toHaveAttribute('aria-checked', 'true')
    await expect(hoje).toHaveAttribute('aria-checked', 'false')
    const dataDeAmanha = await calendario.inputValue()
    expect(dataDeAmanha > dataDeHoje).toBe(true)
  })

  test('o caminho feliz são 3 toques e escreve tudo', async ({ app, ventus }) => {
    await abrir(app, `/registrar?opportunityId=${String(TETRA)}`)

    // ── Toque 1 · hablar ────────────────────────────────────────────────
    await falar(app)
    await esperarConfirmacao(app)
    // Vino de una tarjeta con cliente: llega elegido y no hay que tocarlo.
    await expect(
      app.getByRole('button', { name: /Linha 3 — fita e selagem/ }),
    ).toBeVisible()

    // ── Toque 2 · la fecha ─────────────────────────────────────────────
    await app.getByRole('radio', { name: 'Amanhã' }).click()

    // ── Toque 3 · confirmar ────────────────────────────────────────────
    await app.getByRole('button', { name: 'Confirmar' }).click()

    // Termina en el Dossiê del cliente, que es donde el registro se ve.
    await expect(app).toHaveURL(new RegExp(`/carteira/${String(TETRA)}$`))

    await verificarEscritas(ventus)
  })

  test('sem cliente, o gate pede o cliente antes que qualquer outra coisa', async ({ app }) => {
    // Sin `?opportunityId` el mock devuelve candidatos ambiguos (0,52 y 0,44):
    // con dos parejos, preseleccionar es peor que preguntar.
    await abrir(app, '/registrar')
    await falar(app)
    await esperarConfirmacao(app)

    await expect(app.getByText('Escolha o cliente')).toBeVisible()
    await expect(app.getByRole('button', { name: 'Confirmar' })).toBeDisabled()
  })
})

/** La actividad quedó escrita, con su tarea de próxima acción. */
async function verificarEscritas(ventus: Ventus): Promise<void> {
  const atividades = await ventus.ler<{ opportunity_id: number; description: string }>('activities')
  expect(atividades.some((a) => a.opportunity_id === TETRA)).toBe(true)

  // El gate no es cosmético: produce una `task` con fecha, que es lo único
  // que hace que este negocio vuelva a aparecer en la tela Hoje.
  const tarefas = await ventus.ler<{ due_date: string | null; status: string }>('tasks')
  expect(tarefas).not.toHaveLength(0)
  expect(tarefas.every((t) => t.due_date !== null)).toBe(true)
}
