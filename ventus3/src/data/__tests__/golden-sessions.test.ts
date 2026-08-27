// src/data/__tests__/golden-sessions.test.ts
// `registrarSessaoGolden` mandaba a uma tabela que não existe
// (`golden_hour_sessions`) com nomes de coluna em inglês que também não
// existem (`started_at`, `duration_seconds`, `goal_touches`…). Todo insert
// real batia 404/400 e a Golden Hour nunca chegava a gravar o resultado da
// hora no servidor — só ficava a fila que `api/dispatch/jobs.ts` já tinha
// escrito na véspera.
//
// A tabela real é `golden_sessions`, com `unique (vendor, dia)`: como essa
// fila do dia já existe quando o vendedor sela a hora, o insert tem que ser
// upsert por essa chave natural (ver transport.test.ts) e os nomes de coluna
// são os verificados por MCP.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste } from '../db'
import { definirTransporte, flush } from '../outbox'
import { registrarSessaoGolden } from '../mutations'
import type { OutboxMutation } from '../local-types'

let db: VentusDatabase
let contador = 0

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-golden-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
})

afterEach(async () => {
  definirTransporte(null)
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

function transporteEspiao(): { enviadas: OutboxMutation[] } {
  const enviadas: OutboxMutation[] = []
  definirTransporte({
    enviar: (m) => {
      enviadas.push(m)
      return Promise.resolve()
    },
  })
  return { enviadas }
}

describe('registrarSessaoGolden', () => {
  it('manda para golden_sessions, com os nomes de coluna reais e o vendor_id', async () => {
    const espiao = transporteEspiao()
    await registrarSessaoGolden({
      vendor: 'Renata',
      vendorId: 3,
      day: '2026-08-27',
      iniciadaEm: '2026-08-27T12:00:00.000Z',
      terminadaEm: '2026-08-27T13:00:00.000Z',
      duracaoSegundos: 3600,
      toques: 10,
      conversas: 3,
      reunioes: 1,
      puladas: 2,
      metaToques: 10,
      horaCheia: true,
      debrief: { melhor_conversa: 'x', objecao_frequente: 'y', o_que_muda: 'z' },
      superficie: 'app',
    })
    await flush()

    const enviada = espiao.enviadas[0]
    expect(enviada?.tabla).toBe('golden_sessions')
    expect(enviada?.op).toBe('insert')
    expect(enviada?.payload).toEqual({
      vendor: 'Renata',
      vendor_id: 3,
      dia: '2026-08-27',
      inicio: '2026-08-27T12:00:00.000Z',
      fim: '2026-08-27T13:00:00.000Z',
      duracao_segundos: 3600,
      toques: 10,
      conversas: 3,
      agendamentos: 1,
      pulados: 2,
      meta_toques: 10,
      hora_cheia: true,
      debrief: { melhor_conversa: 'x', objecao_frequente: 'y', o_que_muda: 'z' },
      superficie: 'app',
    })
    // Nenhum resto do nome antigo, que não é coluna de nada.
    expect(Object.keys(enviada?.payload ?? {})).not.toContain('day')
    expect(Object.keys(enviada?.payload ?? {})).not.toContain('started_at')
    expect(Object.keys(enviada?.payload ?? {})).not.toContain('goal_touches')
  })

  it('sem vendorId manda vendor_id null, não undefined: a coluna existe e fica sem FK', async () => {
    const espiao = transporteEspiao()
    await registrarSessaoGolden({
      vendor: 'Andre',
      day: '2026-08-27',
      iniciadaEm: '2026-08-27T12:00:00.000Z',
      terminadaEm: '2026-08-27T12:30:00.000Z',
      duracaoSegundos: 1800,
      toques: 4,
      conversas: 1,
      reunioes: 0,
      puladas: 0,
      metaToques: 8,
      horaCheia: false,
    })
    await flush()
    expect(espiao.enviadas[0]?.payload['vendor_id']).toBeNull()
  })
})
