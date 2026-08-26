// e2e/cadencia.spec.ts
// La Cadência es el otro camino de escritura del producto, y el que más
// fácilmente corrompe datos: registrar un toque mueve la etapa del lead y
// recalcula la fecha del siguiente; convertir un lead abre una oportunidad y
// lo cierra. Las dos son RPC con firma exacta —PostgREST resuelve por conjunto
// de nombres de argumento— y las dos escriben ANTES de que haya red, con la
// copia optimista en Dexie sosteniendo la pantalla.
//
// Por eso acá no se prueba «el sheet abre»: se prueba qué quedó en el aparato
// y qué salió al servidor.

import { abrir, diasAtras, expect, test, VENDEDOR } from './fixtures/app'
import type { Page } from '@playwright/test'

/** Embalagens Vale (201): 2 toques hechos, el 3º vencido hace 4 días. */
const EMBALAGENS_VALE = 201

interface LeadLocal {
  id: number
  status: string
  stage: string
  touchpoints_count: number
  last_touchpoint_date: string | null
  next_touchpoint_date: string | null
}

interface TouchpointLocal {
  lead_id: number
  channel: string
  result: string
  pendente: number
  sequence_number: number
  vendor: string
}

/** Abre la ficha del lead desde la fila de la Cadência. */
async function abrirLead(page: Page, empresa: string) {
  await abrir(page, '/cadencia')
  const linha = page.getByRole('button', { name: new RegExp(empresa) })
  await expect(linha.first()).toBeVisible({ timeout: 15_000 })
  await linha.first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  return page.getByRole('dialog')
}

test.describe('Cadência · registrar um toque', () => {
  test('o resultado move a etapa, agenda o próximo toque e sai pela RPC', async ({
    app,
    ventus,
  }) => {
    const antes = (await ventus.ler<LeadLocal>('leads')).find((l) => l.id === EMBALAGENS_VALE)
    expect(antes?.touchpoints_count).toBe(2)

    const ficha = await abrirLead(app, 'Embalagens Vale')
    await expect(ficha.getByText('2 de 7 toques')).toBeVisible()

    await ficha.getByRole('button', { name: /^Registrar toque/ }).click()
    // El sheet dice de qué toque se trata: el 3 de 7.
    await expect(app.getByRole('dialog').getByText(/toque 3 de 7/)).toBeVisible()

    // «Respondeu interessado» es el resultado que sube de etapa, y la pantalla
    // lo promete ANTES de tocarlo: la etapa se mueve sola, nadie arrastra nada.
    const opcao = app.getByRole('dialog').getByRole('button', { name: /Respondeu interessado/ })
    await expect(opcao).toBeVisible()
    await opcao.click()

    // ── Lo que quedó en el aparato ────────────────────────────────────────
    await expect
      .poll(async () => (await ventus.ler<TouchpointLocal>('touchpoints')).length, {
        timeout: 15_000,
        message: 'o toque não foi escrito no espelho local',
      })
      .toBe(1)

    const toque = (await ventus.ler<TouchpointLocal>('touchpoints'))[0]
    expect(toque?.lead_id).toBe(EMBALAGENS_VALE)
    expect(toque?.result).toBe('interested')
    expect(toque?.vendor).toBe(VENDEDOR)

    const depois = (await ventus.ler<LeadLocal>('leads')).find((l) => l.id === EMBALAGENS_VALE)
    expect(depois?.touchpoints_count).toBe(3)
    // La etapa subió sola, que es la promesa de la pantalla.
    expect(depois?.stage).not.toBe(antes?.stage)
    // Y el lead deja de estar vencido: hay fecha nueva, posterior a la vieja.
    expect(depois?.next_touchpoint_date).not.toBeNull()
    expect(String(depois?.next_touchpoint_date) > diasAtras(4)).toBe(true)

    // ── Lo que salió al servidor ──────────────────────────────────────────
    await expect
      .poll(
        () => ventus.pedidos.filter((p) => p.url.includes('/rpc/registrar_touchpoint')).length,
        { timeout: 15_000, message: 'a RPC do toque nunca saiu' },
      )
      .toBe(1)

    const rpc = ventus.pedidos.find((p) => p.url.includes('/rpc/registrar_touchpoint'))
    const corpo = JSON.parse(rpc?.corpo ?? '{}') as Record<string, unknown>
    // La firma real. `sequence_number` NO va: lo calcula el servidor con
    // `for update` sobre el lead, que es lo único que evita que dos teléfonos
    // registrando a la vez escriban el mismo toque.
    expect(Object.keys(corpo).sort()).toEqual([
      'p_canal',
      'p_client_uuid',
      'p_lead_id',
      'p_notas',
      'p_resultado',
    ])
    expect(corpo['p_lead_id']).toBe(EMBALAGENS_VALE)
    expect(corpo['p_resultado']).toBe('interested')

    await expect.poll(() => ventus.pendentesNoOutbox(), { timeout: 15_000 }).toBe(0)
  })
})

test.describe('Cadência · converter em oportunidade', () => {
  test('converter fecha o lead, propõe o nome e chama converter_lead', async ({ app, ventus }) => {
    const ficha = await abrirLead(app, 'Embalagens Vale')

    // «Converter» SIEMPRE está disponible: en el v2 el botón aparecía recién
    // al séptimo toque y por eso los leads que respondían al segundo se
    // quedaban en la cadencia hasta morir.
    await ficha.getByRole('button', { name: 'Converter' }).click()

    const conversao = app.getByRole('dialog')
    await expect(conversao.getByText('Converter em oportunidade')).toBeVisible()
    // Nace en la etapa 2 y la pantalla lo dice: la 1 es el funil de
    // prospección y este lead ya salió de él.
    await expect(conversao.getByText(/etapa 2 \(Qualificação\)/)).toBeVisible()

    // El nombre viene propuesto con el de la empresa: convertir no puede
    // costar un formulario en blanco.
    const nome = conversao.getByLabel('Nome do negócio')
    await expect(nome).toHaveValue(/Embalagens Vale/)
    await nome.fill('Embalagens Vale · expedição')

    await conversao.getByLabel(/Valor estimado/).fill('80.000')
    await conversao.getByRole('button', { name: 'Converter' }).click()

    // ── El espejo local ───────────────────────────────────────────────────
    await expect
      .poll(
        async () =>
          (await ventus.ler<LeadLocal>('leads')).find((l) => l.id === EMBALAGENS_VALE)?.status,
        { timeout: 15_000, message: 'o lead nunca ficou convertido no espelho' },
      )
      .toBe('converted')

    // Y sale de la fila de la cadencia: ya no es un lead que perseguir.
    await expect(app.getByRole('button', { name: /Embalagens Vale/ })).toHaveCount(0, {
      timeout: 15_000,
    })

    // ── El servidor ───────────────────────────────────────────────────────
    await expect
      .poll(() => ventus.pedidos.filter((p) => p.url.includes('/rpc/converter_lead')).length, {
        timeout: 15_000,
        message: 'a RPC de conversão nunca saiu',
      })
      .toBe(1)

    const rpc = ventus.pedidos.find((p) => p.url.includes('/rpc/converter_lead'))
    const corpo = JSON.parse(rpc?.corpo ?? '{}') as Record<string, unknown>
    // Firma real: el vendedor NO viaja — sale de `leads.vendor` del lado del
    // servidor. Mandarlo rompía la resolución de la función.
    expect(Object.keys(corpo).sort()).toEqual([
      'p_client_uuid',
      'p_lead_id',
      'p_name',
      'p_product_line',
      'p_value',
    ])
    expect(corpo['p_lead_id']).toBe(EMBALAGENS_VALE)
    expect(corpo['p_name']).toBe('Embalagens Vale · expedição')
    expect(corpo['p_value']).toBe(80000)

    await expect.poll(() => ventus.pendentesNoOutbox(), { timeout: 15_000 }).toBe(0)
  })
})
