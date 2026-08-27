// src/data/__tests__/transport.test.ts
// EL CUELLO del outbox hacia Postgres: qué se manda por tabla.
//
// Dos defectos reales que este archivo prueba:
//
//  1. `enviarInsert` agregaba `client_uuid` a TODO insert. `public.touchpoints`
//     no tiene esa columna (entra por RPC, nunca por insert directo) y
//     `public.golden_sessions` tampoco la tuvo nunca — la vuelta anterior creyó
//     que sí, confundida con el nombre `golden_hour_sessions` que no existe en
//     Postgres. Agregarla a una tabla sin la columna es el mismo 400 PGRST204
//     de columna inventada que ya rompió `criarTask` una vez.
//
//  2. `golden_sessions` tiene `unique (vendor, dia)`, y `api/dispatch/jobs.ts`
//     YA escribió la fila del día la víspera con la fila aprobada y cero
//     resultados. Un `insert` liso ahí choca contra ese UNIQUE (23505), que el
//     outbox lee como 'duplicado' —éxito disfrazado— y el resultado real de la
//     Golden Hour nunca llega al servidor. Por eso viaja como upsert por la
//     clave natural (vendor, dia).

import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock() se hoistea al tope del archivo: la fábrica no puede cerrar sobre
// un `const` declarado más abajo sin vi.hoisted().
const { insert, upsert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  const upsert = vi.fn()
  const from = vi.fn((..._args: unknown[]) => ({ insert, upsert }))
  return { insert, upsert, from }
})

vi.mock('../supabase', () => ({
  supabase: { from },
}))

import type { OutboxMutation } from '../local-types'
import { transporteSupabase } from '../transport'

function mutacao(parcial: Partial<OutboxMutation>): OutboxMutation {
  return {
    id: 'uuid-1',
    tabla: 'activities',
    op: 'insert',
    rpc: null,
    row_id: null,
    payload: {},
    campos_tocados: [],
    ts_por_campo: {},
    idempotency_key: 'uuid-1',
    intentos: 0,
    ultimo_error: null,
    estado: 'pendente',
    criado_em: '2026-08-27T00:00:00.000Z',
    proxima_tentativa_em: '2026-08-27T00:00:00.000Z',
    ...parcial,
  }
}

beforeEach(() => {
  from.mockClear()
  insert.mockReset().mockResolvedValue({ data: null, error: null, status: 201 })
  upsert.mockReset().mockResolvedValue({ data: null, error: null, status: 201 })
})

describe('enviarInsert · client_uuid por tabela', () => {
  it('agrega client_uuid a activities, que sim tem a coluna', async () => {
    await transporteSupabase.enviar(
      mutacao({ tabla: 'activities', payload: { vendor: 'Renata' } }),
    )
    expect(from).toHaveBeenCalledWith('activities')
    expect(insert).toHaveBeenCalledWith({ vendor: 'Renata', client_uuid: 'uuid-1' })
  })

  it('agrega client_uuid a tasks, que sim tem a coluna', async () => {
    await transporteSupabase.enviar(
      mutacao({ id: 'uuid-2', tabla: 'tasks', payload: { titulo: 'Ligar' } }),
    )
    expect(insert).toHaveBeenCalledWith({ titulo: 'Ligar', client_uuid: 'uuid-2' })
  })

  it('NÃO agrega client_uuid a touchpoints, que não tem essa coluna', async () => {
    await transporteSupabase.enviar(
      mutacao({ tabla: 'touchpoints', payload: { lead_id: 5, channel: 'phone' } }),
    )
    expect(insert).toHaveBeenCalledWith({ lead_id: 5, channel: 'phone' })
  })

  it('NÃO agrega client_uuid a golden_sessions, que também não tem essa coluna', async () => {
    await transporteSupabase.enviar(
      mutacao({ tabla: 'golden_sessions', payload: { vendor: 'Renata', dia: '2026-08-27' } }),
    )
    expect(upsert).toHaveBeenCalledWith(
      { vendor: 'Renata', dia: '2026-08-27' },
      { onConflict: 'vendor,dia' },
    )
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('enviarInsert · golden_sessions vai por upsert(vendor,dia)', () => {
  it('nunca chama insert() liso para golden_sessions', async () => {
    await transporteSupabase.enviar(
      mutacao({
        tabla: 'golden_sessions',
        payload: { vendor: 'Andre', dia: '2026-08-27', toques: 8 },
      }),
    )
    expect(insert).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledTimes(1)
    const [linha, opcoes] = upsert.mock.calls[0] as [Record<string, unknown>, { onConflict: string }]
    expect(linha).toEqual({ vendor: 'Andre', dia: '2026-08-27', toques: 8 })
    expect(opcoes.onConflict).toBe('vendor,dia')
  })

  it('activities e tasks seguem indo por insert(), não upsert', async () => {
    await transporteSupabase.enviar(mutacao({ tabla: 'activities', payload: {} }))
    expect(upsert).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
