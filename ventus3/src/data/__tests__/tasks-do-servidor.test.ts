// src/data/__tests__/tasks-do-servidor.test.ts
// La regresión de «no puedo accionar ningún botón».
//
// La tabla `tasks` de Postgres NO tiene la forma de `core/types.Task`: manda
// `titulo`, `opportunity_id`, `lead_id` y `snoozed_to`, y el motor espera
// `title`, `target: EntityRef` y `snoozed_until`. Mientras la tabla estuvo
// vacía nadie lo notó. El backfill del 26/08 le puso 36 filas `pending` y, en
// el primer login del dueño del producto, `indexarTasks()` hizo
// `t.target.kind` sobre un `target` inexistente: TypeError → `rankDay()`
// entero → la query del plan de Hoje → TanStack Query se quedó con el último
// dato bueno (la cartera vacía del arranque) → tres esqueletos y ni un botón.
//
// Estas filas son copia literal de dos tareas reales de producción.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, carregarCarteira, getDb } from '../db'
import { aplicarRemoto, normalizarRemoto } from '../conflicts'
import { definirTransporte } from '../outbox'
import { rankDay, type Task } from '@/core'

let db: VentusDatabase
let contador = 0

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-tasks-servidor-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte({ enviar: () => Promise.resolve() })
})

afterEach(async () => {
  await db.delete()
})

/** Fila REAL de `tasks`, tal cual la devuelve PostgREST. */
function tarefaDoServidor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fae25c58-355c-436e-8828-10a417af9d75',
    canal: null,
    origem: 'manual',
    status: 'pending',
    titulo: 'Reunião com Tomas Ripoll — lead convertido da cadência',
    vendor: 'Tomás',
    done_at: null,
    lead_id: null,
    due_date: '2026-08-26',
    due_time: null,
    vendor_id: 4,
    created_at: '2026-08-26T11:58:32.21753+00:00',
    created_by: 'backfill-v2',
    prioridade: 2,
    snoozed_to: null,
    updated_at: '2026-08-26T11:58:32.21753+00:00',
    client_uuid: '4ba5b6be-8e8a-4343-9b41-24d2b4ce4e54',
    target_scale: null,
    draft_content: null,
    opportunity_id: 91,
    expected_outcome: null,
    resolved_activity_id: null,
    ...overrides,
  }
}

describe('normalizarRemoto — tasks', () => {
  it('traduce la fila del servidor a la forma que el motor lee', () => {
    const normalizada = normalizarRemoto('tasks', tarefaDoServidor())

    expect(normalizada['target']).toEqual({ kind: 'opportunity', id: 91 })
    expect(normalizada['title']).toBe('Reunião com Tomas Ripoll — lead convertido da cadência')
    expect(normalizada['snoozed_until']).toBeNull()
    // Las columnas crudas siguen ahí: el PATCH del outbox manda nombres de
    // Postgres y perderlas rompería el round-trip.
    expect(normalizada['titulo']).toBe('Reunião com Tomas Ripoll — lead convertido da cadência')
    expect(normalizada['opportunity_id']).toBe(91)
  })

  it('apunta a un lead cuando la tarea es de cadencia', () => {
    const normalizada = normalizarRemoto(
      'tasks',
      tarefaDoServidor({ opportunity_id: null, lead_id: 56 }),
    )
    expect(normalizada['target']).toEqual({ kind: 'lead', id: 56 })
  })

  it('sin oportunidad ni lead no inventa un alvo', () => {
    const normalizada = normalizarRemoto(
      'tasks',
      tarefaDoServidor({ opportunity_id: null, lead_id: null }),
    )
    expect(normalizada['target']).toBeUndefined()
  })

  it('no toca las tablas cuya forma ya coincide', () => {
    const linha = { id: 91, vendor: 'Tomás' }
    expect(normalizarRemoto('opportunities', linha)).toBe(linha)
  })
})

describe('el pull deja las tareas utilizables', () => {
  it('aplicarRemoto escribe `target` y `title` en Dexie', async () => {
    await aplicarRemoto('tasks', tarefaDoServidor(), { vendor: 'Tomás' })

    const guardada = await getDb().tasks.get('fae25c58-355c-436e-8828-10a417af9d75')
    expect(guardada?.target).toEqual({ kind: 'opportunity', id: 91 })
    expect(guardada?.title).toBe('Reunião com Tomas Ripoll — lead convertido da cadência')

    // Y la carga de la cartera —que es de donde bebe rankDay— la devuelve así.
    const carteira = await carregarCarteira('Tomás')
    expect(carteira.tasks).toHaveLength(1)
    expect(carteira.tasks[0]?.target).toEqual({ kind: 'opportunity', id: 91 })
  })
})

describe('rankDay sobrevive a una tarea rota', () => {
  it('no lanza cuando una tarea pendiente no tiene alvo', () => {
    // La fila cruda del servidor, SIN normalizar: es la forma exacta que hacía
    // reventar la pantalla Hoje. Una tarea inútil puede costar una tarjeta;
    // nunca el plan del día entero.
    const crua = tarefaDoServidor() as unknown as Task

    expect(() =>
      rankDay({
        vendor: 'Tomás',
        today: '2026-08-26',
        opportunities: [],
        leads: [],
        activities: [],
        tasks: [crua],
        commitments: [],
      }),
    ).not.toThrow()
  })
})
