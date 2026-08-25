// src/data/__tests__/dossie.test.ts
// Las tres promesas del Dossiê que no se pueden romper en silencio:
//
//  1. la regra da prova — por encima de 5 no se guarda nada sin cita, y el
//     historial NO queda ensuciado por el intento fallido;
//  2. el health verificado dice la verdad — una escala sin prueba cuenta 0 y
//     la media se sigue dividiendo por 6;
//  3. las perguntas SPIN usadas SOBREVIVEN al cierre del sheet. Ese es el bug
//     concreto del v2 que M7 viene a matar.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste } from '../db'
import { definirTransporte } from '../outbox'
import { ErroRegraDaProva } from '../mutations'
import {
  alternarPerguntaSpin,
  evidenciasDoDossie,
  fetchDossieCompleto,
  lerHistoricoEscalas,
  lerPerguntasSpinUsadas,
  moverEscala,
  partirFonte,
} from '../dossie'
import { escalas, opp, lead } from '@/core/__tests__/fixtures'
import type { OutboxMutation } from '../local-types'
import type { Opportunity, ScalesRecord } from '@/core'

const VENDOR = 'Renata'
const HOJE = '2026-08-25'

let db: VentusDatabase
let contador = 0
/** Lo que el outbox mandó al servidor. La fila se borra al confirmarse, así
 *  que espiar el transporte es la única forma honesta de ver el payload. */
let enviados: OutboxMutation[] = []

/** Escalas con prueba embebida en el jsonb, como las escribe atualizar_escala. */
function escalasComProva(quando: string): ScalesRecord {
  return {
    ...escalas({ dor: 6, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
    dor: {
      score: 6,
      evidence: 'Perdi um contrato por caixa violada.',
      evidence_source: 'Marcelo Silva · Gerente de Logística',
      evidence_at: quando,
      updated_by: VENDOR,
      updated_at: quando,
    },
  }
}

function negocio(over: Partial<Opportunity> = {}): Opportunity {
  return opp({ id: 46, vendor: VENDOR, stage: 4, value: 120_000, ...over })
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-dossie-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  enviados = []
  definirTransporte({
    enviar: async (mutacao) => {
      enviados.push(mutacao)
    },
  })
})

afterEach(async () => {
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

describe('evidência', () => {
  it('lê a prova do jsonb com nome e cargo separados', () => {
    const evidencias = evidenciasDoDossie(negocio({ scales: escalasComProva('2026-08-20') }))
    expect(evidencias).toHaveLength(1)
    expect(evidencias[0]?.scale).toBe('dor')
    expect(evidencias[0]?.source_name).toBe('Marcelo Silva')
    expect(evidencias[0]?.source_title).toBe('Gerente de Logística')
    expect(evidencias[0]?.occurred_at).toBe('2026-08-20')
  })

  it('não perde a citação antiga quando alguém baixa a escala sem prova', () => {
    // El jsonb ya no tiene evidencia: solo el historial la conserva.
    const evidencias = evidenciasDoDossie(negocio({ scales: escalas({ dor: 3 }) }), [
      {
        id: 'm1',
        opportunity_id: 46,
        escala: 'dor',
        de: 3,
        para: 6,
        citacao: 'Perdi um contrato por caixa violada.',
        fonte_nome: 'Marcelo Silva',
        fonte_cargo: 'Gerente de Logística',
        autor: VENDOR,
        ocorrido_em: '2026-08-20',
        criado_em: '2026-08-20T12:00:00.000Z',
      },
    ])
    expect(evidencias).toHaveLength(1)
    expect(evidencias[0]?.quote).toContain('caixa violada')
  })

  it('parte a fonte só quando há separador', () => {
    expect(partirFonte('Marcelo')).toEqual({ nome: 'Marcelo', cargo: null })
    expect(partirFonte(null)).toEqual({ nome: null, cargo: null })
  })
})

describe('a regra da prova', () => {
  it('acima de 5 sem citação não grava nada — nem escala, nem histórico, nem outbox', async () => {
    await db.opportunities.put(negocio())

    await expect(
      moverEscala({
        opportunityId: 46,
        escala: 'valor',
        nivel: 8,
        de: 4,
        vendor: VENDOR,
      }),
    ).rejects.toBeInstanceOf(ErroRegraDaProva)

    const salvo = await db.opportunities.get(46)
    expect(salvo?.scales?.valor).toEqual({ score: 4, description: '' })
    expect(await lerHistoricoEscalas(46)).toHaveLength(0)
    expect(await db.outbox.count()).toBe(0)
    expect(enviados).toHaveLength(0)
  })

  it('com citação grava a escala, o histórico e a mutação no outbox', async () => {
    await db.opportunities.put(negocio())

    await moverEscala({
      opportunityId: 46,
      escala: 'valor',
      nivel: 8,
      de: 4,
      citacao: 'A conta fecha em quatro meses.',
      fonteNome: 'Ana Prado',
      fonteCargo: 'Diretora Financeira',
      ocorridoEm: '2026-08-24',
      vendor: VENDOR,
      perguntasUsadas: ['Qual é o custo hoje de fechar uma caixa?'],
    })

    const salvo = await db.opportunities.get(46)
    const escala = salvo?.scales?.valor
    expect(typeof escala === 'object' && escala !== null ? escala.score : null).toBe(8)

    const historico = await lerHistoricoEscalas(46)
    expect(historico).toHaveLength(1)
    expect(historico[0]?.de).toBe(4)
    expect(historico[0]?.para).toBe(8)
    expect(historico[0]?.fonte_cargo).toBe('Diretora Financeira')

    // La mutación va por RPC: un UPDATE del jsonb entero pisaría las otras 5.
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.rpc).toBe('atualizar_escala')
    expect(enviados[0]?.campos_tocados).toEqual(['scales.valor'])
    expect(enviados[0]?.payload['p_fonte']).toBe('Ana Prado · Diretora Financeira')

    // Y la pergunta usada quedó marcada.
    expect((await lerPerguntasSpinUsadas(46)).valor).toEqual([
      'Qual é o custo hoje de fechar uma caixa?',
    ])
  })
})

describe('as perguntas SPIN usadas sobrevivem ao fechamento do sheet', () => {
  it('alterna e persiste em meta', async () => {
    expect(await alternarPerguntaSpin(46, 'dor', 'Quantas caixas vocês fecham por mês?')).toEqual([
      'Quantas caixas vocês fecham por mês?',
    ])
    // Segunda lectura: otro montaje del sheet, otro día, el mismo estado.
    expect((await lerPerguntasSpinUsadas(46)).dor).toHaveLength(1)
    expect(await alternarPerguntaSpin(46, 'dor', 'Quantas caixas vocês fecham por mês?')).toEqual([])
  })
})

describe('o bundle do dossiê', () => {
  it('traz tudo em uma leitura e o health verificado é menor que o declarado', async () => {
    await db.opportunities.put(negocio({ scales: escalasComProva('2026-08-20') }))
    await db.leads.put(lead({ id: 7, vendor: VENDOR, opportunity_id: 46 }))
    await db.touchpoints.put({
      uid: 'tp-1',
      client_uuid: 'tp-1',
      pendente: 0,
      vendor: VENDOR,
      id: 900,
      lead_id: 7,
      sequence_number: 1,
      channel: 'whatsapp',
      result: 'interested',
      notes: 'Pediu proposta.',
      executed_at: '2026-08-18T13:00:00.000Z',
    })

    const dossie = await fetchDossieCompleto(46, HOJE)

    expect(dossie.opportunity?.id).toBe(46)
    expect(dossie.lead?.id).toBe(7)
    expect(dossie.touchpoints).toHaveLength(1)

    // Declarado: (6+4+5+4+3+2)/6 = 4,0. Verificado: solo DOR tiene prueba → 6/6 = 1,0.
    expect(dossie.healthDeclarado).toBe(4)
    expect(dossie.health.verificado).toBe(1)
    expect(dossie.health.escalasSemProva).toContain('valor')

    // Etapa 4 (Validação/Teste) exige VALOR >= 6 y está en 4.
    expect(dossie.gate?.escala).toBe('valor')
    expect(dossie.gate?.texto).toContain('VALOR ≥ 6')
  })

  it('não explode com uma oportunidade que não está na carteira local', async () => {
    const dossie = await fetchDossieCompleto(999, HOJE)
    expect(dossie.opportunity).toBeNull()
    expect(dossie.health.escalasSemProva).toHaveLength(6)
  })
})
