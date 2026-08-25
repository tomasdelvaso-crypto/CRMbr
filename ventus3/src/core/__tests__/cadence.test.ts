// src/core/__tests__/cadence.test.ts — a cadência é 7 toques em 21 dias, sempre.

import { describe, expect, it } from 'vitest'
import {
  CADENCE_SCHEDULE,
  MAX_TOUCHPOINTS,
  advanceLeadStage,
  atrasoEmDias,
  buildGoldenQueue,
  calcNextTouchpointDate,
  canalDoToque,
  canalExecutavel,
  channelDeepLink,
  draftForStep,
  ehConversaReal,
  isCadenceExhausted,
  nextCadenceStep,
  nextSequenceNumber,
  normalizeBrPhone,
  proximoTouchpoint,
  stageFromResult,
} from '../cadence'
import { lead, toque } from './fixtures'

describe('CADENCE_SCHEDULE', () => {
  it('tem 7 toques nos dias 1/3/6/10/13/17/21', () => {
    expect(CADENCE_SCHEDULE).toHaveLength(MAX_TOUCHPOINTS)
    expect(CADENCE_SCHEDULE.map((s) => s.day)).toEqual([1, 3, 6, 10, 13, 17, 21])
  })

  it('numera os toques de 1 a 7 sem buracos', () => {
    expect(CADENCE_SCHEDULE.map((s) => s.tp)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('alterna os canais como no v2', () => {
    expect(CADENCE_SCHEDULE.map((s) => s.channel)).toEqual([
      'linkedin', 'whatsapp', 'email', 'whatsapp', 'phone', 'email', 'whatsapp',
    ])
    expect(canalDoToque(5)).toBe('phone')
    expect(canalDoToque(8)).toBeNull()
  })
})

describe('próximo toque', () => {
  it('com 0 toques o próximo é o TP1', () => {
    expect(nextCadenceStep(0)?.tp).toBe(1)
    expect(proximoTouchpoint(lead({ touchpoints_count: 0 }))?.tp).toBe(1)
  })

  it('com 7 toques não há próximo', () => {
    expect(nextCadenceStep(7)).toBeNull()
    expect(isCadenceExhausted(lead({ touchpoints_count: 7 }))).toBe(true)
  })

  it('calcNextTouchpointDate usa o INTERVALO, não o dia absoluto', () => {
    // count=0 → TP1 no dia 1 → +1 dia.
    expect(calcNextTouchpointDate(0, '2026-08-24')).toBe('2026-08-25')
    // count=1 → TP2 no dia 3, o anterior era o dia 1 → +2 dias.
    expect(calcNextTouchpointDate(1, '2026-08-25')).toBe('2026-08-27')
    // count=4 → TP5 no dia 13, o anterior era o dia 10 → +3 dias.
    expect(calcNextTouchpointDate(4, '2026-09-03')).toBe('2026-09-06')
    expect(calcNextTouchpointDate(7, '2026-08-24')).toBeNull()
  })

  it('a soma dos intervalos fecha os 21 dias do ciclo', () => {
    let data = '2026-01-01'
    for (let i = 0; i < 7; i += 1) {
      const proxima = calcNextTouchpointDate(i, data)
      expect(proxima).not.toBeNull()
      data = proxima as string
    }
    expect(data).toBe('2026-01-22') // 01/01 + 21 dias
  })

  it('nextSequenceNumber ignora buracos e devolve o máximo + 1', () => {
    expect(nextSequenceNumber([])).toBe(1)
    expect(nextSequenceNumber([toque(1, 1), toque(1, 3)])).toBe(4)
    expect(nextSequenceNumber([toque(1, 7)])).toBeNull()
  })
})

describe('atraso da cadência', () => {
  const hoje = '2026-08-24'

  it('conta os dias vencidos do next_touchpoint_date', () => {
    expect(atrasoEmDias(lead({ next_touchpoint_date: '2026-08-19' }), hoje)).toBe(5)
  })

  it('devolve 0 quando o toque é hoje ou no futuro', () => {
    expect(atrasoEmDias(lead({ next_touchpoint_date: '2026-08-24' }), hoje)).toBe(0)
    expect(atrasoEmDias(lead({ next_touchpoint_date: '2026-09-01' }), hoje)).toBe(0)
  })

  it('sem next_touchpoint_date, deriva do último toque — o lead não fica invisível', () => {
    // 2 toques feitos, o último em 10/08. O TP3 é 3 dias depois: 13/08.
    const l = lead({ touchpoints_count: 2, last_touchpoint_date: '2026-08-10' })
    expect(atrasoEmDias(l, hoje)).toBe(11)
  })

  it('sem toque nenhum, deriva da criação do lead', () => {
    const l = lead({ touchpoints_count: 0, last_touchpoint_date: null, created_at: '2026-08-01T12:00:00Z' })
    expect(atrasoEmDias(l, hoje)).toBe(22) // TP1 era 02/08 (criação + 1 dia)
  })

  it('lead com a cadência esgotada não acumula atraso', () => {
    const l = lead({ touchpoints_count: 7, next_touchpoint_date: '2026-01-01' })
    expect(atrasoEmDias(l, hoje)).toBe(0)
  })
})

describe('etapa derivada do resultado (nunca de drag&drop)', () => {
  it('mapeia cada resultado à etapa que ele implica', () => {
    expect(stageFromResult('meeting_scheduled')).toBe('1d')
    expect(stageFromResult('interested')).toBe('1c')
    expect(stageFromResult('not_now')).toBe('1c')
    expect(stageFromResult('no_response')).toBe('1b')
    expect(stageFromResult('not_interested')).toBe('1b')
  })

  it('avança a etapa quando o resultado é melhor', () => {
    expect(advanceLeadStage(lead({ stage: '1a' }), 'interested')).toBe('1c')
    expect(advanceLeadStage(lead({ stage: '1b' }), 'meeting_scheduled')).toBe('1d')
  })

  it('NUNCA retrocede: um "não tenho interesse" não baixa a etapa', () => {
    expect(advanceLeadStage(lead({ stage: '1d' }), 'not_interested')).toBe('1d')
    expect(advanceLeadStage(lead({ stage: '1c' }), 'no_response')).toBe('1c')
  })

  it('só conta como conversa real quando o cliente respondeu', () => {
    expect(ehConversaReal('interested')).toBe(true)
    expect(ehConversaReal('not_interested')).toBe(true)
    expect(ehConversaReal('no_response')).toBe(false)
    expect(ehConversaReal('other')).toBe(false)
  })
})

describe('fila da Golden Hour', () => {
  const hoje = '2026-08-24'

  it('ordena por atraso e desempata pela etapa mais avançada', () => {
    const pouco = lead({ id: 101, next_touchpoint_date: '2026-08-23', stage: '1a' })
    const muito = lead({ id: 102, next_touchpoint_date: '2026-08-10', stage: '1a' })
    const igualMasQuente = lead({ id: 103, next_touchpoint_date: '2026-08-23', stage: '1c' })
    const fila = buildGoldenQueue([pouco, muito, igualMasQuente], hoje)
    expect(fila.map((l) => l.id)).toEqual([102, 103, 101])
  })

  it('exclui arquivados e cadências esgotadas', () => {
    const ativo = lead({ id: 201, next_touchpoint_date: '2026-08-10' })
    const arquivado = lead({ id: 202, status: 'archived', next_touchpoint_date: '2026-08-01' })
    const esgotado = lead({ id: 203, touchpoints_count: 7, next_touchpoint_date: '2026-08-01' })
    expect(buildGoldenQueue([ativo, arquivado, esgotado], hoje).map((l) => l.id)).toEqual([201])
  })
})

describe('telefones e deep links', () => {
  it('normaliza os formatos que a gente escreve de verdade', () => {
    expect(normalizeBrPhone('(11) 98765-4321')).toBe('+5511987654321')
    expect(normalizeBrPhone('11987654321')).toBe('+5511987654321')
    expect(normalizeBrPhone('+55 11 98765 4321')).toBe('+5511987654321')
    expect(normalizeBrPhone('005511987654321')).toBe('+5511987654321')
    expect(normalizeBrPhone('011 3456-7890')).toBe('+551134567890')
  })

  it('devolve null quando não pode garantir o número', () => {
    expect(normalizeBrPhone(null)).toBeNull()
    expect(normalizeBrPhone('123')).toBeNull()
    expect(normalizeBrPhone('(09) 8765-4321')).toBeNull() // DDD 09 não existe
  })

  it('monta wa.me, tel: e mailto:', () => {
    const l = lead({ contact_phone: '(11) 98765-4321', contact_email: 'ana@vale.com.br' })
    expect(channelDeepLink('whatsapp', l)).toBe('https://wa.me/5511987654321')
    expect(channelDeepLink('phone', l)).toBe('tel:+5511987654321')
    expect(channelDeepLink('email', l)).toContain('mailto:ana@vale.com.br')
    expect(channelDeepLink('linkedin', l)).toBeNull()
  })

  it('canalExecutavel cai para outro canal quando o do passo não existe', () => {
    // TP1 é LinkedIn; sem perfil, cai para WhatsApp — no Brasil o celular do
    // contato É o WhatsApp, então um contact_phone móvel já habilita o canal.
    const semLinkedin = lead({ contact_linkedin: null })
    const passoTp1 = CADENCE_SCHEDULE[0]
    expect(passoTp1?.channel).toBe('linkedin')
    expect(canalExecutavel(semLinkedin, passoTp1!)).toBe('whatsapp')
  })

  it('canalExecutavel devolve null quando o lead não tem nenhum canal', () => {
    const mudo = lead({ contact_phone: null, contact_whatsapp: null, contact_email: null, contact_linkedin: null })
    expect(canalExecutavel(mudo, CADENCE_SCHEDULE[0]!)).toBeNull()
  })

  it('o rascunho traz o primeiro nome e a empresa, sem número inventado', () => {
    const texto = draftForStep(lead({ contact_name: 'Ana Souza', company_name: 'Vale Embalagens' }), CADENCE_SCHEDULE[1]!)
    expect(texto).toContain('Ana')
    expect(texto).toContain('Vale Embalagens')
    expect(texto).not.toMatch(/\d+%/)
  })
})
