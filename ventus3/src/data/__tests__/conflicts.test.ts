// src/data/__tests__/conflicts.test.ts
// El modelo de conflictos. El test que más importa es el último de la primera
// suite: un evento remoto NUNCA puede pisar un campo con mutación local
// pendiente. Ese bug — "el cambio del vendedor se revierte solo" — es el que
// hace que el equipo deje de confiar en la app.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, getDb } from '../db'
import {
  aplicarRemoto,
  contarConflitosNaoVistos,
  ehAppendOnly,
  listarConflitos,
  mergeByField,
  relogioRemotoDe,
} from '../conflicts'
import { definirTransporte, enqueue } from '../outbox'
import type { Opportunity } from '@/core'

let db: VentusDatabase
let contador = 0

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-conflicts-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte({ enviar: () => Promise.resolve() })
})

afterEach(async () => {
  definirTransporte(null)
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

/** Oportunidad mínima con lo que tocan los tests. */
function oportunidade(parcial: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 42,
    created_at: '2026-01-05T10:00:00.000Z',
    name: 'Tetra Pak — Venom',
    client: 'Tetra Pak',
    vendor: 'Renata',
    value: 180_000,
    stage: 3,
    priority: 'alta',
    expected_close: '2026-09-30',
    next_action: null,
    next_action_date: null,
    product: null,
    product_lines: null,
    power_sponsor: null,
    sponsor: null,
    influencer: null,
    support_contact: null,
    probability: 40,
    last_update: '2026-08-20T12:00:00.000Z',
    last_activity_date: '2026-08-20',
    scales: { dor: { score: 6 }, valor: { score: 4 } },
    health_score: null,
    is_stalled: null,
    industry: null,
    loss_reason: null,
    outcome: null,
    outcome_notes: null,
    updated_at: '2026-08-20T12:00:00.000Z',
    ...parcial,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   mergeByField
   ══════════════════════════════════════════════════════════════════════════ */

describe('mergeByField', () => {
  it('sin reloj local, la copia local es un espejo viejo: gana el servidor', () => {
    const local = { id: 42, stage: 2, probability: 40 }
    const { merged, conflitos, mudou } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { stage: 3 },
      relogioRemoto: { '*': '2026-08-21T09:00:00.000Z' },
    })

    expect(merged.stage).toBe(3)
    expect(mudou).toBe(true)
    // No es un conflicto: nadie perdió nada, era un dato sin editar.
    expect(conflitos).toHaveLength(0)
  })

  it('no escribe ni registra nada cuando el remoto no aporta cambios', () => {
    const local = { id: 42, stage: 3 }
    const { merged, conflitos, mudou } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { stage: 3 },
      relogioRemoto: { '*': '2026-08-30T09:00:00.000Z' },
    })

    expect(mudou).toBe(false)
    expect(conflitos).toHaveLength(0)
    expect(merged.stage).toBe(3)
  })

  it('LWW por campo: el más nuevo gana, campo por campo', () => {
    const local = { id: 42, stage: 4, expected_close: '2026-10-15' }
    const { merged, conflitos } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { stage: 3, expected_close: '2026-09-30' },
      relogioLocal: { stage: '2026-08-22T10:00:00.000Z', expected_close: '2026-08-19T10:00:00.000Z' },
      relogioRemoto: { '*': '2026-08-21T09:00:00.000Z' },
    })

    // stage local es más nuevo → se conserva.
    expect(merged.stage).toBe(4)
    // expected_close local es más viejo → entra el del servidor.
    expect(merged.expected_close).toBe('2026-09-30')

    expect(conflitos.map((c) => [c.campo, c.resolucao])).toEqual([
      ['stage', 'local_mais_novo'],
      ['expected_close', 'remoto_mais_novo'],
    ])
  })

  it('LWW dentro de scales: dos dispositivos mueven escalas distintas y convergen', () => {
    // Renata subió `dor` en el celular; Jordi corrigió `valor` en la web.
    const local = { id: 42, scales: { dor: { score: 8 }, valor: { score: 4 } } }
    const { merged, conflitos } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { scales: { dor: { score: 6 }, valor: { score: 7 } } },
      relogioLocal: { 'scales.dor': '2026-08-22T18:00:00.000Z' },
      relogioRemoto: {
        '*': '2026-08-22T19:00:00.000Z',
        'scales.dor': '2026-08-20T09:00:00.000Z',
        'scales.valor': '2026-08-22T19:00:00.000Z',
      },
    })

    const scales = merged.scales as Record<string, { score: number }>
    expect(scales['dor']?.score).toBe(8) // el local es más nuevo
    expect(scales['valor']?.score).toBe(7) // el remoto es más nuevo
    expect(conflitos.map((c) => c.campo).sort()).toEqual(['scales.dor'])
  })

  it('REGLA DURA: un campo con mutación pendiente no se pisa ni con timestamp más nuevo', () => {
    const local = { id: 42, stage: 4 }
    const { merged, conflitos } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { stage: 2 },
      // El servidor declara un timestamp MÁS NUEVO a propósito.
      relogioLocal: { stage: '2026-08-22T10:00:00.000Z' },
      relogioRemoto: { '*': '2026-09-01T10:00:00.000Z' },
      camposPendentes: ['stage'],
    })

    expect(merged.stage).toBe(4)
    expect(conflitos).toHaveLength(1)
    expect(conflitos[0]?.resolucao).toBe('local_pendente')
    expect(conflitos[0]?.valor_vencedor).toBe(4)
    expect(conflitos[0]?.valor_remoto).toBe(2)
  })

  it('la mutación pendiente sobre scales protege también sus sub-campos', () => {
    const local = { id: 42, scales: { dor: { score: 9 } } }
    const { merged } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { scales: { dor: { score: 3 } } },
      relogioRemoto: { '*': '2030-01-01T00:00:00.000Z' },
      camposPendentes: ['scales.dor'],
    })

    const scales = merged.scales as Record<string, { score: number }>
    expect(scales['dor']?.score).toBe(9)
  })

  it('nunca toca id ni created_at', () => {
    const local = { id: 42, created_at: '2026-01-05T10:00:00.000Z', stage: 1 }
    const { merged } = mergeByField({
      tabla: 'opportunities',
      rowId: 42,
      local,
      remoto: { id: 99, created_at: '2020-01-01T00:00:00.000Z', stage: 2 },
      relogioRemoto: { '*': '2026-08-25T00:00:00.000Z' },
    })

    expect(merged.id).toBe(42)
    expect(merged.created_at).toBe('2026-01-05T10:00:00.000Z')
    expect(merged.stage).toBe(2)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   relogioRemotoDe
   ══════════════════════════════════════════════════════════════════════════ */

describe('relogioRemotoDe', () => {
  it('lee updated_at para la fila y scales_updated_at por escala', () => {
    const relogio = relogioRemotoDe({
      updated_at: '2026-08-22T19:00:00.000Z',
      scales_updated_at: { dor: '2026-08-20T09:00:00.000Z' },
    })

    expect(relogio['*']).toBe('2026-08-22T19:00:00.000Z')
    expect(relogio['scales.dor']).toBe('2026-08-20T09:00:00.000Z')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   aplicarRemoto — el reconciliador contra Dexie
   ══════════════════════════════════════════════════════════════════════════ */

describe('aplicarRemoto', () => {
  it('inserta una fila que no estaba', async () => {
    expect(await aplicarRemoto('opportunities', { ...oportunidade() })).toBe('inserido')
    expect((await getDb().opportunities.get(42))?.client).toBe('Tetra Pak')
  })

  it('respeta la mutación pendiente del outbox y deja el conflicto registrado', async () => {
    // El vendedor avanzó la etapa offline: Dexie ya lo muestra, el outbox lo espera.
    await getDb().opportunities.put(oportunidade({ stage: 4 }))
    await enqueue({
      tabla: 'opportunities',
      op: 'rpc',
      rpc: 'avancar_etapa',
      row_id: 42,
      campos_tocados: ['stage'],
      payload: { p_opportunity_id: 42, p_stage: 4 },
    })

    // Llega el estado ANTERIOR del servidor, con updated_at más nuevo.
    const aplicado = await aplicarRemoto('opportunities', {
      ...oportunidade({ stage: 2, updated_at: '2030-01-01T00:00:00.000Z' }),
    })

    expect(await contarConflitosNaoVistos()).toBe(1)
    const guardada = await getDb().opportunities.get(42)
    expect(guardada?.stage).toBe(4) // el cambio del vendedor sobrevivió
    expect(aplicado).not.toBe('inserido')

    const [conflito] = await listarConflitos()
    expect(conflito?.campo).toBe('stage')
    expect(conflito?.resolucao).toBe('local_pendente')
  })

  it('aplica los campos que NO tienen mutación pendiente', async () => {
    await getDb().opportunities.put(oportunidade({ stage: 4, probability: 40 }))
    await enqueue({
      tabla: 'opportunities',
      op: 'rpc',
      rpc: 'avancar_etapa',
      row_id: 42,
      campos_tocados: ['stage'],
      payload: {},
    })

    await aplicarRemoto('opportunities', {
      ...oportunidade({ stage: 2, probability: 85, updated_at: '2030-01-01T00:00:00.000Z' }),
    })

    const guardada = await getDb().opportunities.get(42)
    expect(guardada?.stage).toBe(4)
    expect(guardada?.probability).toBe(85)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Append-only
   ══════════════════════════════════════════════════════════════════════════ */

describe('append-only', () => {
  it('activities y touchpoints son append-only; opportunities no', () => {
    expect(ehAppendOnly('activities')).toBe(true)
    expect(ehAppendOnly('touchpoints')).toBe(true)
    expect(ehAppendOnly('opportunities')).toBe(false)
  })

  it('la fila creada offline y la confirmada por el servidor son UNA sola', async () => {
    const uuid = '11111111-2222-4333-8444-555555555555'

    // Lo que escribió el vendedor sin señal.
    await getDb().activities.put({
      uid: uuid,
      client_uuid: uuid,
      pendente: 1,
      id: -1,
      opportunity_id: 42,
      vendor: 'Renata',
      created_at: '2026-08-22T18:00:00.000Z',
      activity_date: '2026-08-22',
      activity_type: 'meeting',
      description: 'Visita na planta de Monte Mor',
      result: null,
      stage_at_time: null,
      methodology_code: null,
      ai_suggested_action: null,
      ai_suggested_scales: null,
      ai_confidence: null,
      next_action: null,
      next_action_date: null,
      next_action_done: false,
      source: 'manual',
    })

    // Lo mismo, ya confirmado por Postgres con su bigserial.
    await aplicarRemoto('activities', {
      id: 5150,
      client_uuid: uuid,
      opportunity_id: 42,
      vendor: 'Renata',
      created_at: '2026-08-22T18:00:03.000Z',
      activity_date: '2026-08-22',
      activity_type: 'meeting',
      description: 'Visita na planta de Monte Mor',
    })

    const todas = await getDb().activities.toArray()
    expect(todas).toHaveLength(1)
    expect(todas[0]?.id).toBe(5150)
    expect(todas[0]?.pendente).toBe(0)
    expect(await contarConflitosNaoVistos()).toBe(0)
  })

  it('una fila del bot, sin client_uuid, entra bajo su id de servidor', async () => {
    await aplicarRemoto('touchpoints', {
      id: 900,
      lead_id: 7,
      sequence_number: 2,
      channel: 'whatsapp',
      result: 'no_response',
      notes: null,
      executed_at: '2026-08-22T14:00:00.000Z',
    })

    const linha = await getDb().touchpoints.get('srv:900')
    expect(linha?.lead_id).toBe(7)
    expect(linha?.client_uuid).toBeNull()
  })

  it('reaplicar el mismo evento dos veces no duplica ni marca cambios', async () => {
    const evento = {
      id: 5151,
      client_uuid: '99999999-2222-4333-8444-555555555555',
      opportunity_id: 42,
      vendor: 'Renata',
      created_at: '2026-08-22T18:00:00.000Z',
      activity_date: '2026-08-22',
      activity_type: 'call',
      description: 'Ligação de follow-up',
    }

    expect(await aplicarRemoto('activities', { ...evento })).toBe('inserido')
    expect(await aplicarRemoto('activities', { ...evento })).toBe('sem_mudanca')
    expect(await getDb().activities.count()).toBe(1)
  })
})
