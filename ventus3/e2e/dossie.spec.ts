// e2e/dossie.spec.ts
// El editor de escalas del Dossiê es donde vive la REGRA DA PROVA (M6):
// arriba de 5, un nivel es un hecho, no una impresión. Sin quién lo dijo, qué
// cargo tiene y la frase textual, no se guarda.
//
// Es la regla que separa este CRM del anterior. En el v2 la salud declarada de
// la cartera no tenía nada que ver con la realidad —38 de 65 oportunidades con
// el score desincronizado— porque cualquiera podía poner 9 en «Poder» sin que
// nadie hubiera hablado nunca con el tomador de decisión. La misma restricción
// vive en Postgres (`scale_evidence_prova_chk`); esto de acá es la cortesía de
// no dejarte llegar hasta el error.
//
// Y el gesto principal NO es el número: es tocar el texto del nivel canónico.
// «Tomador de Decisão admite dor» pone el 9 solo.

import { abrir, expect, test } from './fixtures/app'

const TETRA = 101

test.describe('Dossiê · editor de escala', () => {
  test('escolher um nível canônico seta o número e o texto', async ({ app }) => {
    await abrir(app, `/carteira/${String(TETRA)}`)
    // La escala Dor arranca en 5 en la semilla.
    await app.getByRole('button', { name: /^5\s*Dor/ }).click()

    const editor = app.getByRole('dialog')
    await expect(editor).toBeVisible()
    await expect(editor.getByText('Dor · 5 → 5')).toBeVisible()

    // Un toque en el texto del nivel 4: el número es consecuencia.
    await editor.getByRole('button', { name: 'Pessoa de Contato admite dor' }).click()
    await expect(editor.getByText('Dor · 5 → 4')).toBeVisible()
    await expect(
      editor.getByRole('button', { name: 'Pessoa de Contato admite dor' }),
    ).toHaveAttribute('aria-pressed', 'true')

    // Bajar no exige prueba: sincerar un número siempre tiene que ser barato.
    await expect(editor.getByText('opcional aqui')).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Salvar Dor em 4' })).toBeEnabled()
  })

  test('acima de 5 não passa sem evidência', async ({ app, ventus }) => {
    await abrir(app, `/carteira/${String(TETRA)}`)
    await app.getByRole('button', { name: /^5\s*Dor/ }).click()
    const editor = app.getByRole('dialog')

    // Nivel 9: la afirmación más fuerte de la escala.
    await editor.getByRole('button', { name: 'Tomador de Decisão admite dor' }).click()
    await expect(editor.getByText('Dor · 5 → 9')).toBeVisible()

    // El botón deja de ser «Salvar» y pasa a decir qué falta.
    const salvar = editor.getByRole('button', { name: 'Falta a evidência' })
    await expect(salvar).toBeVisible()
    await expect(salvar).toBeDisabled()
    await expect(editor.getByText('obrigatória acima de 5')).toBeVisible()
    await expect(
      editor.getByText(
        'Acima de 5 o nível é um fato, não uma impressão: quem disse, que cargo tem, quando, e a frase dele.',
      ),
    ).toBeVisible()

    // La cita sola no alcanza: sin quién y sin cargo, sigue sin ser prueba.
    await editor
      .getByLabel('A frase do cliente')
      .fill('Se a caixa chegar violada de novo, eu perco o contrato com a rede.')
    await expect(salvar).toBeDisabled()

    await editor.getByLabel('Quem disse').fill('Marcelo Ferreira')
    await expect(salvar).toBeDisabled()

    // Con los tres campos, recién ahí guarda.
    await editor.getByLabel('Cargo').fill('Diretor de Operações')
    const habilitado = editor.getByRole('button', { name: 'Salvar Dor em 9' })
    await expect(habilitado).toBeEnabled()

    await habilitado.click()
    await expect(app.getByText('Dor em 9. Salvo — o servidor revalida o gate.')).toBeVisible()

    // Y quedó escrito: la escala se movió en el espejo local.
    const opps = await ventus.ler<{ id: number; scales: Record<string, { score: number }> }>(
      'opportunities',
    )
    expect(opps.find((o) => o.id === TETRA)?.scales['dor']?.score).toBe(9)
  })

  test('a prova entra na saúde verificada, e o preview o mostra antes de salvar', async ({
    app,
  }) => {
    await abrir(app, `/carteira/${String(TETRA)}`)
    await app.getByRole('button', { name: /^5\s*Dor/ }).click()
    const editor = app.getByRole('dialog')

    // Sin ninguna evidencia documentada, la salud verificada es 0,0. No es un
    // bug: es el número honesto — el v2 nunca escribió `evidence_at`.
    await expect(editor.getByText(/Saúde verificada:\s*0,0/)).toBeVisible()

    await editor.getByRole('button', { name: 'Tomador de Decisão admite dor' }).click()
    await editor.getByLabel('A frase do cliente').fill('Perdemos três cargas esse mês.')
    await editor.getByLabel('Quem disse').fill('Marcelo')
    await editor.getByLabel('Cargo').fill('Produção')

    // El preview cuenta la prueba hipotética: 0,0 → 1,5 (9 de 60 puntos).
    await expect(editor.getByText(/Saúde verificada:\s*0,0\s*→\s*1,5/)).toBeVisible()
  })
})
