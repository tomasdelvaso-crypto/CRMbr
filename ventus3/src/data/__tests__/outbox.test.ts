// src/data/__tests__/outbox.test.ts
// La cola de escrituras es la pieza cuyo fallo mata el producto: si una nota
// se pierde una vez, el equipo vuelve a la libreta. Estos tests cubren las
// tres garantías: nada se pierde, nada se duplica, nada se desordena.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, getDb } from '../db'
import {
  BACKOFF_TETO_MS,
  MAX_TENTATIVAS,
  calcularBackoff,
  definirTransporte,
  descartar,
  enqueue,
  flush,
  novoClientUuid,
  observarPendentes,
  pending,
  pendingCount,
  pendingFields,
  reaplicarOtimistas,
  recuperarEnviando,
  relogioPendente,
  retry,
} from '../outbox'
import { ErroOutbox, type OutboxMutation, type TransporteOutbox } from '../local-types'

/* ── Andamiaje ────────────────────────────────────────────────────────────── */

let db: VentusDatabase
let contador = 0

/** Transporte de mentira: registra lo enviado y puede fallar a pedido. */
function transporteFalso(): TransporteOutbox & {
  enviados: OutboxMutation[]
  falha: ErroOutbox | null
  falhasRestantes: number
} {
  const espia = {
    enviados: [] as OutboxMutation[],
    falha: null as ErroOutbox | null,
    falhasRestantes: 0,
    enviar(m: OutboxMutation): Promise<void> {
      if (espia.falha && espia.falhasRestantes !== 0) {
        if (espia.falhasRestantes > 0) espia.falhasRestantes -= 1
        return Promise.reject(espia.falha)
      }
      espia.enviados.push(m)
      return Promise.resolve()
    },
  }
  return espia
}

let transporte: ReturnType<typeof transporteFalso>

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-outbox-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
  transporte = transporteFalso()
  definirTransporte(transporte)
})

afterEach(async () => {
  definirTransporte(null)
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

const atividade = (descricao: string) => ({
  tabla: 'activities',
  op: 'insert' as const,
  row_id: null,
  campos_tocados: [],
  payload: { opportunity_id: 7, vendor: 'Renata', description: descricao },
})

/* ── Encolar ──────────────────────────────────────────────────────────────── */

describe('enqueue', () => {
  it('nace con client_uuid, idempotency_key igual al id y estado pendente', async () => {
    const id = await enqueue(atividade('Visita na Tetra'))

    const [m] = await pending()
    expect(m).toBeDefined()
    expect(m?.id).toBe(id)
    expect(m?.idempotency_key).toBe(id)
    expect(m?.estado).toBe('pendente')
    expect(m?.intentos).toBe(0)
    expect(await pendingCount()).toBe(1)
  })

  it('sella un timestamp por cada campo tocado — el reloj del LWW', async () => {
    await enqueue({
      tabla: 'opportunities',
      op: 'update',
      row_id: 12,
      campos_tocados: ['stage', 'expected_close'],
      payload: { stage: 3, expected_close: '2026-09-30' },
    })

    const relogio = await relogioPendente('opportunities', 12)
    expect(Object.keys(relogio).sort()).toEqual(['expected_close', 'stage'])
    expect(relogio['stage']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('expone los campos bloqueados para el realtime', async () => {
    await enqueue({
      tabla: 'opportunities',
      op: 'rpc',
      rpc: 'atualizar_escala',
      row_id: 12,
      campos_tocados: ['scales.dor'],
      payload: { p_opportunity_id: 12 },
    })

    expect(await pendingFields('opportunities', 12)).toEqual(['scales.dor'])
    expect(await pendingFields('opportunities', 99)).toEqual([])
  })
})

/* ── Flush ────────────────────────────────────────────────────────────────── */

describe('flush', () => {
  it('envía en orden de creación y vacía la cola', async () => {
    await enqueue(atividade('primeira'))
    await new Promise((r) => setTimeout(r, 2))
    await enqueue(atividade('segunda'))

    const resultado = await flush()

    expect(resultado.enviados).toBe(2)
    expect(await pendingCount()).toBe(0)
    expect(transporte.enviados.map((m) => m.payload['description'])).toEqual([
      'primeira',
      'segunda',
    ])
  })

  it('dos flush simultáneos no duplican envíos', async () => {
    await enqueue(atividade('uma só vez'))

    const [a, b] = await Promise.all([flush(), flush()])

    expect(transporte.enviados).toHaveLength(1)
    expect(a.enviados + b.enviados).toBe(2) // el mismo promise devuelto dos veces
    expect(await pendingCount()).toBe(0)
  })

  it('un client_uuid ya existente en el servidor cuenta como éxito', async () => {
    await enqueue(atividade('reintento de una nota ya enviada'))
    transporte.falha = new ErroOutbox('duplicate key', 'duplicado')
    transporte.falhasRestantes = -1

    const resultado = await flush()

    expect(resultado.enviados).toBe(1)
    expect(resultado.falhados).toBe(0)
    expect(await pendingCount()).toBe(0)
  })

  it('un error de red deja la mutación pendiente y la reagenda con backoff', async () => {
    await enqueue(atividade('sem sinal no galpão'))
    transporte.falha = new ErroOutbox('Failed to fetch', 'rede')
    transporte.falhasRestantes = 1

    const primeiro = await flush()
    expect(primeiro.adiados).toBe(1)

    const [m] = await pending()
    expect(m?.estado).toBe('pendente')
    expect(m?.intentos).toBe(1)
    const agoraIso = new Date().toISOString()
    expect((m?.proxima_tentativa_em ?? '') > agoraIso).toBe(true)

    // Sin forzar, el backoff la salta.
    const segundo = await flush()
    expect(segundo.enviados).toBe(0)
    expect(segundo.adiados).toBe(1)

    // Forzando, sale.
    const terceiro = await flush({ forcar: true })
    expect(terceiro.enviados).toBe(1)
    expect(await pendingCount()).toBe(0)
  })

  it('un error permanente para la mutación y retry() la revive', async () => {
    await enqueue(atividade('violação de check'))
    transporte.falha = new ErroOutbox('violates check constraint', 'permanente')
    transporte.falhasRestantes = 1

    const resultado = await flush()
    expect(resultado.falhados).toBe(1)

    let [m] = await pending()
    expect(m?.estado).toBe('erro')
    expect(m?.ultimo_error).toContain('check constraint')

    // Un flush normal no la toca: espera decisión humana.
    expect((await flush()).enviados).toBe(0)

    const depois = await retry()
    expect(depois.enviados).toBe(1)
    ;[m] = await pending()
    expect(m).toBeUndefined()
  })

  it('un conflicto queda a la espera del humano y no se reintenta solo', async () => {
    await enqueue({
      tabla: 'opportunities',
      op: 'update',
      row_id: 5,
      campos_tocados: ['stage'],
      payload: { stage: 4 },
    })
    transporte.falha = new ErroOutbox('stale precondition', 'conflito')
    transporte.falhasRestantes = 1

    expect((await flush()).conflitos).toBe(1)
    const [m] = await pending()
    expect(m?.estado).toBe('conflito')

    transporte.falha = null
    expect((await flush()).enviados).toBe(0)
    expect(await pendingCount()).toBe(1)
  })

  it('no adelanta mutaciones sobre una fila cuya anterior falló', async () => {
    await enqueue({
      tabla: 'opportunities',
      op: 'update',
      row_id: 9,
      campos_tocados: ['stage'],
      payload: { stage: 3 },
    })
    await new Promise((r) => setTimeout(r, 2))
    await enqueue({
      tabla: 'opportunities',
      op: 'update',
      row_id: 9,
      campos_tocados: ['probability'],
      payload: { probability: 70 },
    })
    transporte.falha = new ErroOutbox('sem rede', 'rede')
    transporte.falhasRestantes = 1

    await flush()

    // La primera falló; la segunda ni se intentó.
    expect(transporte.enviados).toHaveLength(0)
    const restantes = await pending()
    expect(restantes).toHaveLength(2)
    expect(restantes[1]?.intentos).toBe(0)
  })

  it('descartar saca la mutación de la cola', async () => {
    const id = await enqueue(atividade('nota errada'))
    await descartar(id)
    expect(await pendingCount()).toBe(0)
  })
})

/* ── Recuperación ─────────────────────────────────────────────────────────── */

describe('recuperación', () => {
  it('rescata lo que quedó en enviando cuando la app murió a mitad de camino', async () => {
    const id = await enqueue(atividade('a app morreu aqui'))
    await getDb().outbox.update(id, { estado: 'enviando' })

    expect(await recuperarEnviando()).toBe(1)
    const [m] = await pending()
    expect(m?.estado).toBe('pendente')
  })

  it('reaplicarOtimistas devuelve al timeline las notas que iOS purgó', async () => {
    const id = await enqueue(atividade('nota escrita no galpão'))
    // Simula la purga: el store de actividades se vació, el outbox sobrevivió.
    await getDb().activities.clear()

    expect(await reaplicarOtimistas()).toBe(1)
    const linha = await getDb().activities.get(id)
    expect(linha?.pendente).toBe(1)
    expect(linha?.description).toBe('nota escrita no galpão')
  })
})

/* ── Contador observable ──────────────────────────────────────────────────── */

describe('contador de pendientes', () => {
  it('avisa al badge cuando entra y cuando sale una mutación', async () => {
    const vistos: number[] = []
    const baixa = observarPendentes((n) => vistos.push(n))

    await enqueue(atividade('uma'))
    await enqueue(atividade('duas'))
    await flush()
    baixa()

    expect(vistos.at(-1)).toBe(0)
    expect(Math.max(...vistos)).toBe(2)
  })
})

/* ── Backoff ──────────────────────────────────────────────────────────────── */

describe('calcularBackoff', () => {
  it('crece exponencialmente y respeta el tope', () => {
    const sinJitter = (n: number) => calcularBackoff(n, 0.5)
    expect(sinJitter(1)).toBe(2_000)
    expect(sinJitter(2)).toBe(4_000)
    expect(sinJitter(3)).toBe(8_000)
    expect(sinJitter(MAX_TENTATIVAS)).toBeLessThanOrEqual(BACKOFF_TETO_MS)
    expect(sinJitter(50)).toBe(BACKOFF_TETO_MS)
  })

  it('el jitter se mantiene dentro de ±20 %', () => {
    expect(calcularBackoff(1, 0)).toBe(1_600)
    expect(calcularBackoff(1, 1)).toBe(2_400)
  })
})

/* ── Idempotencia ─────────────────────────────────────────────────────────── */

describe('idempotencia append-only', () => {
  it('reintentar N veces la misma actividad usa siempre el mismo client_uuid', async () => {
    const uuid = novoClientUuid()
    await enqueue({ ...atividade('visita registrada offline'), id: uuid })

    transporte.falha = new ErroOutbox('sem rede', 'rede')
    transporte.falhasRestantes = 3
    await flush()
    await flush({ forcar: true })
    await flush({ forcar: true })

    transporte.falha = null
    await flush({ forcar: true })

    expect(transporte.enviados).toHaveLength(1)
    expect(transporte.enviados[0]?.id).toBe(uuid)
    expect(transporte.enviados[0]?.idempotency_key).toBe(uuid)
    expect(await pendingCount()).toBe(0)
  })
})
