// e2e/densidade-revisao.spec.ts
// La captura de densidad de /revisao a 1920×1080.
//
// Va aparte de densidade-desktop.sessao-real.spec.ts porque el doble de RED
// (la sesión real de Tomás) no tiene ni una propuesta en la bandeja: la
// pantalla se ve vacía y una bandeja zerada no prueba nada sobre el ancho del
// diff «antigo → novo». Este archivo usa el fixture de app —que sí puede
// sembrar `ventus_actions`— con `sementeComProposta()`, la misma propuesta de
// tres campos que verifica e2e/revisao.spec.ts.
//
// Corre en el proyecto `desktop` y sube el viewport a 1920×1080 a mano.
// La fase la elige `FASE_DENSIDADE` (antes|depois), igual que la otra.

import { mkdirSync } from 'node:fs'
import { abrir, expect, sementeComProposta, test } from './fixtures/app'

const DESTINO = 'docs/capturas/desktop-density'
const FASE = process.env['FASE_DENSIDADE'] ?? 'antes'

// Sin `FASE_DENSIDADE` este archivo NO corre. No es pereza: es una vitrina que
// ESCRIBE en docs/capturas/, y correr en la suite normal significaba pisar la
// captura del «antes» con el código del «después» — que es exactamente lo que
// pasó una vez y deja la comparación mintiendo.
const CORRE = process.env['FASE_DENSIDADE'] !== undefined

test(`Revisão 1920×1080 — ${FASE}`, async ({ app, ventus }) => {
  test.skip(!CORRE, 'vitrine: só com FASE_DENSIDADE')
  test.setTimeout(90_000)
  mkdirSync(DESTINO, { recursive: true })
  await app.setViewportSize({ width: 1920, height: 1080 })
  await ventus.semear(sementeComProposta())
  await abrir(app, '/revisao')

  const cartao = app.getByRole('listitem').filter({ hasText: 'CD Guarulhos' }).first()
  await expect(cartao).toBeVisible({ timeout: 20_000 })
  // Los tres campos con su «de → para»: es lo que la captura tiene que mostrar.
  for (const rotulo of ['Título da tarefa', 'Prazo', 'Canal']) {
    await expect(cartao.getByText(rotulo, { exact: true })).toBeVisible()
  }

  await app.waitForTimeout(500)
  await app.screenshot({ path: `${DESTINO}/${FASE}-4-revisao-com-propostas.png` })
})
