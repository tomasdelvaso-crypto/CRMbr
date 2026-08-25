// src/data/__tests__/revisao.test.ts
// Las cuatro promesas de la bandeja que no se pueden romper en silencio:
//
//  1. ACEPTAR POR CAMPO ES REAL. Aceptar 2 de 3 recorta el payload ANTES de
//     llamar a ventus_commit_action — si esto se rompe, el vendedor acepta dos
//     campos y el servidor ejecuta los tres. Es el fallo más caro posible acá.
//  2. La RPC se llama con EXACTAMENTE p_action_id. PostgREST resuelve por
//     conjunto de nombres: un argumento de más devuelve PGRST202.
//  3. Los ítems expiran a las 48 h y expirados no se pueden aceptar.
//  4. El motivo del descarte VIAJA. Es la señal para matar reglas que nadie
//     acepta; si se queda en el cliente, no sirve para nada.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, gravarMeta } from '../db'
import { definirTransporte, flush } from '../outbox'
import type { OutboxMutation } from '../local-types'
import {
  aceitarProposta,
  camposDaAcao,
  chaveAcoesVentus,
  descartarProposta,
  fetchBandejaRevisao,
  horasParaExpirar,
  mapearAcao,
  montarIndiceEntidades,
  reduzirPayload,
  textoDeExpiracao,
  vincularRegistroSolto,
} from '../revisao'
import { escalas, opp } from '@/core/__tests__/fixtures'
import type { VentusAction } from '@/core'

const VENDOR = 'Renata'

let db: VentusDatabase
let contador = 0
/**
 * Lo que el outbox mandó al servidor, en el orden real de envío. La fila se
 * borra al confirmarse, así que espiar el transporte es la única forma honesta
 * de ver el payload — y el ORDEN es justamente lo que hay que probar acá.
 */
let enviados: OutboxMutation[] = []

function daquiA(horas: number): string {
  return new Date(Date.now() + horas * 3_600_000).toISOString()
}

function acao(over: Partial<VentusAction> = {}): VentusAction {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    vendor: VENDOR,
    vendor_id: null,
    tipo: 'criar_task',
    payload: {},
    evidencia: null,
    confianca: 'media',
    precondition_hash: null,
    idempotency_key: 'k1',
    status: 'proposed',
    entity_kind: 'opportunity',
    entity_id: '1',
    superficie: 'app',
    motivo: null,
    resultado: null,
    expires_at: daquiA(40),
    created_at: new Date().toISOString(),
    committed_at: null,
    dismissed_at: null,
    dismissed_reason: null,
    ...over,
  }
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-revisao-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  enviados = []
  definirTransporte({
    enviar: async (m) => {
      enviados.push(m)
    },
  })
})

afterEach(async () => {
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

describe('proyección ventus_actions → RevisaoItem', () => {
  it('resuelve el cliente y el valor ACTUAL de cada campo', async () => {
    await db.opportunities.put(
      opp({
        id: 1,
        vendor: VENDOR,
        client: 'Tetra Pak',
        name: 'Tetra Pak — linha 3',
        scales: escalas({ dor: 3, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
      }),
    )
    const indice = await montarIndiceEntidades(VENDOR)
    const item = mapearAcao(
      acao({
        tipo: 'atualizar_escala',
        payload: { scale_key: 'dor', score_novo: 6 },
        evidencia: { quote: 'perdemos 4 horas por turno', fonte: 'audio' },
        confianca: 'alta',
      }),
      indice,
    )

    expect(item?.entidade.cliente).toBe('Tetra Pak')
    expect(item?.campos).toHaveLength(1)
    // El valor viejo NO viene del payload: se lee de la copia local. Sin esto
    // la tarjeta no puede mostrar «valor antigo → valor novo».
    expect(item?.campos[0]?.oldValue).toBe(3)
    expect(item?.campos[0]?.newValue).toBe(6)
    expect(item?.campos[0]?.quote).toBe('perdemos 4 horas por turno')
    expect(item?.campos[0]?.sourceKind).toBe('audio')
  })

  it('degrada la confianza alta a media cuando NO hay cita', async () => {
    await db.opportunities.put(opp({ id: 1, vendor: VENDOR, client: 'Ambev' }))
    const indice = await montarIndiceEntidades(VENDOR)
    const item = mapearAcao(
      acao({ tipo: 'avancar_etapa', payload: { nova_etapa: 4 }, confianca: 'alta' }),
      indice,
    )
    expect(item?.campos[0]?.confidence).toBe('media')
  })

  it('descarta el tipo que no sabe pintar en vez de mostrar una tarjeta muda', async () => {
    const indice = await montarIndiceEntidades(VENDOR)
    const item = mapearAcao(
      acao({ tipo: 'tool_inventada_amanha' as VentusAction['tipo'] }),
      indice,
    )
    expect(item).toBeNull()
  })

  it('acepta el alias promover_lead del SQL y lo normaliza al de core', async () => {
    const indice = await montarIndiceEntidades(VENDOR)
    const item = mapearAcao(
      acao({
        tipo: 'promover_lead' as VentusAction['tipo'],
        entity_kind: 'market_sweep',
        motivo: 'Empresa do anel 1 sem lead',
      }),
      indice,
    )
    expect(item?.tipo).toBe('promover_do_sweep')
  })
})

describe('reduzirPayload — la aceptación por campo', () => {
  it('borra del payload los campos que el vendedor NO aceptó', () => {
    const a = acao({
      tipo: 'criar_task',
      payload: {
        titulo: 'Ligar para o Marcelo',
        due_date: '2026-08-27',
        canal: 'phone',
        draft_content: 'Oi Marcelo',
      },
    })
    const campos = camposDaAcao(a, null).map((c) => c.field)
    expect(campos).toContain('draft_content')

    const reduzido = reduzirPayload(a, ['titulo', 'due_date'])
    expect(reduzido).toEqual({ titulo: 'Ligar para o Marcelo', due_date: '2026-08-27' })
    expect(reduzido['canal']).toBeUndefined()
    expect(reduzido['draft_content']).toBeUndefined()
  })

  it('conserva las claves que no son campos revisables', () => {
    const a = acao({
      tipo: 'atualizar_escala',
      payload: { scale_key: 'dor', score_novo: 6, quote: 'prova', activity_id: 99 },
    })
    const reduzido = reduzirPayload(a, ['scales.dor'])
    // scale_key, quote y activity_id sostienen la escritura: no son opciones.
    expect(reduzido['scale_key']).toBe('dor')
    expect(reduzido['quote']).toBe('prova')
    expect(reduzido['score_novo']).toBe(6)
  })
})

describe('aceitarProposta', () => {
  it('encola SOLO la RPC cuando se acepta todo, con p_action_id y nada más', async () => {
    const a = acao({ payload: { titulo: 'Ligar', due_date: '2026-08-27' } })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])

    await aceitarProposta({
      vendor: VENDOR,
      acaoId: a.id,
      camposAceitos: ['titulo', 'due_date'],
    })

    await flush()
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.op).toBe('rpc')
    expect(enviados[0]?.rpc).toBe('ventus_commit_action')
    // El conjunto EXACTO de argumentos. Uno de más y PostgREST no encuentra
    // la función (PGRST202).
    expect(Object.keys(enviados[0]?.payload ?? {})).toEqual(['p_action_id'])
    expect(enviados[0]?.payload['p_action_id']).toBe(a.id)
  })

  it('recorta el payload ANTES de confirmar cuando se aceptan 2 de 3', async () => {
    const a = acao({
      payload: { titulo: 'Ligar', due_date: '2026-08-27', canal: 'phone' },
    })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])

    await aceitarProposta({
      vendor: VENDOR,
      acaoId: a.id,
      camposAceitos: ['titulo', 'due_date'],
    })

    await flush()
    expect(enviados).toHaveLength(2)
    // El ORDEN es la garantía: primero se recorta, después se confirma.
    expect(enviados[0]?.op).toBe('update')
    expect(enviados[0]?.payload['payload']).toEqual({
      titulo: 'Ligar',
      due_date: '2026-08-27',
    })
    expect(enviados[1]?.op).toBe('rpc')
    // Las dos van sobre la MISMA fila: el flush es serial por row_id, así que
    // si el update falla, el commit no se ejecuta con el payload viejo.
    expect(enviados[0]?.row_id).toBe(a.id)
    expect(enviados[1]?.row_id).toBe(a.id)
  })

  it('manda la edición del vendedor en lugar del valor propuesto', async () => {
    const a = acao({ payload: { titulo: 'Ligar', due_date: '2026-08-27' } })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])

    await aceitarProposta({
      vendor: VENDOR,
      acaoId: a.id,
      camposAceitos: ['titulo', 'due_date'],
      edicoes: { due_date: '2026-09-02' },
    })

    await flush()
    expect(enviados[0]?.payload['payload']).toEqual({
      titulo: 'Ligar',
      due_date: '2026-09-02',
    })
  })

  it('se niega a confirmar una propuesta vencida', async () => {
    const a = acao({ expires_at: daquiA(-1) })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])
    await expect(
      aceitarProposta({ vendor: VENDOR, acaoId: a.id, camposAceitos: ['titulo'] }),
    ).rejects.toThrow(/expirou/i)
    await flush()
    expect(enviados).toHaveLength(0)
  })
})

describe('descartarProposta', () => {
  it('manda el motivo al servidor: es la señal, no una nota local', async () => {
    await descartarProposta({
      vendor: VENDOR,
      acaoId: 'aaaa-1',
      motivo: 'dado_errado',
    })
    await flush()
    expect(enviados[0]?.op).toBe('update')
    expect(enviados[0]?.payload['status']).toBe('dismissed')
    expect(enviados[0]?.payload['dismissed_reason']).toBe('dado_errado')
    expect(enviados[0]?.payload['dismissed_at']).toBeTypeOf('string')
  })
})

describe('la bandeja completa', () => {
  it('separa los registros sin cliente de las propuestas', async () => {
    await db.opportunities.put(opp({ id: 1, vendor: VENDOR, client: 'Tetra Pak' }))
    await gravarMeta(chaveAcoesVentus(VENDOR), [
      acao({ id: 'a-1', payload: { titulo: 'Ligar' } }),
      acao({
        id: 'a-2',
        entity_kind: null,
        entity_id: null,
        tipo: 'registrar_atividade',
        payload: { descricao: 'Falei com alguém sobre violação em trânsito' },
        superficie: 'telegram',
      }),
    ])

    const bandeja = await fetchBandejaRevisao(VENDOR)
    expect(bandeja.propostas).toHaveLength(1)
    expect(bandeja.semCliente).toHaveLength(1)
    expect(bandeja.semCliente[0]?.texto).toContain('violação')
    expect(bandeja.total).toBe(2)
  })

  it('esconde las vencidas: el badge no puede contar lo que no se puede hacer', async () => {
    await db.opportunities.put(opp({ id: 1, vendor: VENDOR }))
    await gravarMeta(chaveAcoesVentus(VENDOR), [
      acao({ id: 'a-1', payload: { titulo: 'Viva' } }),
      acao({ id: 'a-2', payload: { titulo: 'Morta' }, expires_at: daquiA(-2) }),
    ])
    const bandeja = await fetchBandejaRevisao(VENDOR)
    expect(bandeja.propostas.map((p) => p.id)).toEqual(['a-1'])
  })

  it('saca de la bandeja lo que ya se resolvió, aunque el outbox no haya salido', async () => {
    await db.opportunities.put(opp({ id: 1, vendor: VENDOR }))
    const a = acao({ payload: { titulo: 'Ligar' } })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])

    expect((await fetchBandejaRevisao(VENDOR)).total).toBe(1)
    await descartarProposta({ vendor: VENDOR, acaoId: a.id, motivo: 'ja_fiz' })
    expect((await fetchBandejaRevisao(VENDOR)).total).toBe(0)
  })

  it('ordena por urgencia real, no por fecha de creación', async () => {
    await db.opportunities.put(opp({ id: 1, vendor: VENDOR }))
    await gravarMeta(chaveAcoesVentus(VENDOR), [
      acao({ id: 'tarde', payload: { titulo: 'A' }, expires_at: daquiA(40) }),
      acao({ id: 'urgente', payload: { titulo: 'B' }, expires_at: daquiA(2) }),
    ])
    const bandeja = await fetchBandejaRevisao(VENDOR)
    expect(bandeja.propostas.map((p) => p.id)).toEqual(['urgente', 'tarde'])
    expect(bandeja.urgentes).toBe(1)
  })
})

describe('vincularRegistroSolto', () => {
  it('ata el registro al cliente y lo pasa a Propostas sin esperar al servidor', async () => {
    await db.opportunities.put(opp({ id: 42, vendor: VENDOR, client: 'Ambev' }))
    const a = acao({
      entity_kind: null,
      entity_id: null,
      tipo: 'registrar_atividade',
      payload: { descricao: 'Reunião na planta' },
    })
    await gravarMeta(chaveAcoesVentus(VENDOR), [a])

    await vincularRegistroSolto({
      vendor: VENDOR,
      acaoId: a.id,
      alvo: { kind: 'opportunity', id: 42 },
    })

    await flush()
    expect(enviados[0]?.payload['entity_kind']).toBe('opportunity')
    expect(enviados[0]?.payload['entity_id']).toBe('42')

    const bandeja = await fetchBandejaRevisao(VENDOR)
    expect(bandeja.semCliente).toHaveLength(0)
    expect(bandeja.propostas[0]?.entidade.cliente).toBe('Ambev')
  })
})

describe('expiração a 48 h', () => {
  it('lo dice en PT-BR y con la unidad correcta', () => {
    expect(textoDeExpiracao(daquiA(-1))).toBe('Expirou')
    expect(textoDeExpiracao(daquiA(0.5))).toMatch(/min$/)
    expect(textoDeExpiracao(daquiA(6))).toBe('Expira em 6 h')
    expect(textoDeExpiracao(daquiA(30))).toBe('Expira em 1 d')
  })

  it('trata una fecha ilegible como validez completa, no como vencida', () => {
    expect(horasParaExpirar('não é uma data')).toBe(48)
  })
})
