// src/screens/Ventus/__tests__/motor.test.ts
// El motor determinístico es la promesa central del chat: lo que se puede
// responder sin tokens se responde sin tokens, con los MISMOS números que
// pinta la Carteira. Lo que estos tests fijan:
//
//  1. redacción y diagnóstico NUNCA son locales — aunque nombren un cliente
//  2. «sem toque há N dias» lee el N de la pregunta
//  3. los números salen del dominio, no de una cuenta paralela
//  4. el fallback offline responde igual y lo DICE

import { describe, expect, it } from 'vitest'
import {
  acharOportunidade,
  detectarIntencao,
  diasDaPergunta,
  responderLocalmente,
  respostaOffline,
} from '../motor'
import { atividade, escalas, lead, opp } from '@/core/__tests__/fixtures'
import type { CarteiraLocal } from '@/data'

const VENDOR = 'Renata'
const HOJE = '2026-08-25'

function carteira(over: Partial<CarteiraLocal> = {}): CarteiraLocal {
  return {
    opportunities: [],
    leads: [],
    tasks: [],
    activities: [],
    touchpoints: [],
    commitments: [],
    vendor: null,
    ...over,
  }
}

describe('detectarIntencao', () => {
  it('reconhece as cinco consultas instantâneas', () => {
    expect(detectarIntencao('o que eu faço hoje?')).toBe('pendencias')
    expect(detectarIntencao('quem está sem contato há 15 dias?')).toBe('sem_toque')
    expect(detectarIntencao('como está meu pipeline?')).toBe('pipeline')
    expect(detectarIntencao('que compromissos eu assumi?')).toBe('compromissos')
    expect(detectarIntencao('como está a Tetra Pak?')).toBe('status_cliente')
  })

  it('NÃO responde localmente o que precisa de redação', () => {
    expect(detectarIntencao('escreve um whatsapp para o Marcelo da Tetra Pak')).toBeNull()
    expect(detectarIntencao('redige um e-mail de retomada')).toBeNull()
  })

  it('NÃO responde localmente o que precisa de diagnóstico', () => {
    expect(detectarIntencao('por que a Tetra Pak não avança?')).toBeNull()
    expect(detectarIntencao('qual a melhor estratégia aqui?')).toBeNull()
  })

  it('devolve null quando não entende, em vez de arriscar', () => {
    expect(detectarIntencao('bom dia')).toBeNull()
    expect(detectarIntencao('')).toBeNull()
  })
})

describe('diasDaPergunta', () => {
  it('lê o número da pergunta', () => {
    expect(diasDaPergunta('sem contato há 21 dias')).toBe(21)
    expect(diasDaPergunta('parados há 7 d')).toBe(7)
  })

  it('cai no padrão quando não há número', () => {
    expect(diasDaPergunta('quem está parado?', 10)).toBe(10)
  })

  it('não aceita um número absurdo', () => {
    expect(diasDaPergunta('sem contato há 999 dias')).toBe(365)
  })
})

describe('acharOportunidade', () => {
  it('acha o cliente mesmo com acento e caixa diferentes', () => {
    const c = carteira({
      opportunities: [opp({ id: 10, client: 'Tetra Pak', name: 'Tetra Pak — linha 3' })],
    })
    expect(acharOportunidade(c, 'como está a TETRA PAK?')?.id).toBe(10)
  })

  it('prefere o nome mais longo quando dois casam', () => {
    const c = carteira({
      opportunities: [
        opp({ id: 1, client: 'Tetra', name: 'Tetra' }),
        opp({ id: 2, client: 'Tetra Pak Brasil', name: 'Tetra Pak Brasil' }),
      ],
    })
    expect(acharOportunidade(c, 'como anda a tetra pak brasil')?.id).toBe(2)
  })

  it('ignora oportunidades fechadas', () => {
    const c = carteira({
      opportunities: [opp({ id: 3, client: 'Ambev', outcome: 'won' })],
    })
    expect(acharOportunidade(c, 'como está a Ambev?')).toBeNull()
  })
})

describe('responderLocalmente · sem_toque', () => {
  it('conta as contas paradas acima do limite pedido', () => {
    const c = carteira({
      opportunities: [
        opp({ id: 1, name: 'Ambev', client: 'Ambev', value: 100_000, last_update: '2026-08-24T12:00:00Z' }),
        opp({ id: 2, name: 'BRF', client: 'BRF', value: 200_000, last_update: '2026-06-01T12:00:00Z' }),
      ],
      activities: [atividade(1, '2026-08-24')],
    })
    const r = responderLocalmente('quem está sem contato há 15 dias?', c, VENDOR, HOJE)
    expect(r?.intencao).toBe('sem_toque')
    expect(r?.fatos['paradas']).toBe(1)
    expect(r?.texto).toContain('BRF')
    expect(r?.texto).not.toContain('Ambev')
  })

  it('celebra quando a cadência está em dia, sem dizer «sem dados»', () => {
    const c = carteira({
      opportunities: [opp({ id: 1, client: 'Ambev', last_update: '2026-08-25T12:00:00Z' })],
      activities: [atividade(1, '2026-08-25')],
    })
    const r = responderLocalmente('quem está parado?', c, VENDOR, HOJE)
    expect(r?.texto).toContain('em dia')
  })

  it('conta os leads com o toque vencido — o buraco real da base', () => {
    const c = carteira({
      leads: [
        lead({ id: 1, next_touchpoint_date: '2026-08-01' }),
        lead({ id: 2, next_touchpoint_date: '2026-09-30' }),
      ],
    })
    const r = responderLocalmente('quem está sem toque?', c, VENDOR, HOJE)
    expect(r?.fatos['leadsVencidos']).toBe(1)
  })
})

describe('responderLocalmente · status_cliente', () => {
  it('traz saúde, escala mais fraca e o buraco da próxima ação', () => {
    const c = carteira({
      opportunities: [
        opp({
          id: 7,
          client: 'Tetra Pak',
          stage: 3,
          value: 500_000,
          scales: escalas({ dor: 8, poder: 2, visao: 6, valor: 5, controle: 4, compras: 3 }),
          next_action: null,
          next_action_date: null,
        }),
      ],
    })
    const r = responderLocalmente('como está a Tetra Pak?', c, VENDOR, HOJE)
    expect(r?.intencao).toBe('status_cliente')
    expect(r?.fatos['opportunityId']).toBe(7)
    expect(r?.fatos['escalaMaisFraca']).toBe('poder')
    expect(r?.texto).toContain('Sem próxima ação definida')
    expect(r?.atalhos[0]?.opportunityId).toBe(7)
  })

  it('devolve null quando o cliente citado não é da carteira', () => {
    const c = carteira({ opportunities: [opp({ id: 1, client: 'Ambev' })] })
    expect(responderLocalmente('como está a Nestlé?', c, VENDOR, HOJE)).toBeNull()
  })
})

describe('responderLocalmente · pipeline', () => {
  it('soma só as vivas e denuncia as sem próxima ação com data', () => {
    const c = carteira({
      opportunities: [
        opp({ id: 1, value: 100_000, stage: 2, next_action_date: null }),
        opp({ id: 2, value: 300_000, stage: 3, next_action_date: '2026-08-30' }),
        opp({ id: 3, value: 900_000, stage: 4, outcome: 'lost' }),
      ],
    })
    const r = responderLocalmente('como está meu pipeline?', c, VENDOR, HOJE)
    expect(r?.fatos['vivas']).toBe(2)
    expect(r?.fatos['total']).toBe(400_000)
    expect(r?.fatos['semProximaAcao']).toBe(1)
  })
})

describe('respostaOffline', () => {
  it('responde igual e avisa que está sem conexão', () => {
    const c = carteira({ opportunities: [opp({ id: 1, client: 'Ambev' })] })
    const r = respostaOffline(c, VENDOR, HOJE)
    expect(r.texto).toContain('sem conexão')
    expect(r.texto).not.toContain('sem dados')
  })
})
