// src/core/__tests__/risk.test.ts — as 6 regras do PLANO, cada uma acionável.

import { describe, expect, it } from 'vitest'
import {
  avaliarRiscos,
  escalaMaisFraca,
  hasFalseGate,
  isSingleThreaded,
  portfolioRiskScore,
  regraAcaoVencida,
  regraGateFalso,
  regraPropostaSemResposta,
  regraRegressaoDeEscala,
  regraSilencioEtapaAvancada,
  regraSingleThreaded,
  riskLevel,
  stakeholders,
  DEFAULT_THRESHOLDS,
} from '../risk'
import { escalas, atividade, opp } from './fixtures'

const HOJE = '2026-08-24'

describe('R1 · single-threaded', () => {
  it('detecta o negócio que depende de uma pessoa só', () => {
    const o = opp({ stage: 4, sponsor: 'Marcelo', power_sponsor: null, influencer: null, support_contact: null })
    expect(isSingleThreaded(o)).toBe(true)
    const r = regraSingleThreaded(o)
    expect(r?.codigo).toBe('single_threaded')
    expect(r?.mensagem).toContain('Marcelo')
    expect(r?.sugestao).toContain('apresentar')
  })

  it('não avisa em lead novo e barato — não é notícia', () => {
    expect(regraSingleThreaded(opp({ stage: 1, value: 10_000 }))).toBeNull()
  })

  it('deduplica contatos repetidos com caixa diferente', () => {
    // A ordem é power_sponsor → sponsor → influencer → support: quem decide
    // manda na grafia que sobrevive.
    const o = opp({ sponsor: 'Marcelo', power_sponsor: 'marcelo', influencer: null, support_contact: null })
    expect(stakeholders(o)).toEqual(['marcelo'])
    expect(isSingleThreaded(o)).toBe(true)
  })

  it('com 3 stakeholders não dispara', () => {
    const o = opp({ sponsor: 'A', power_sponsor: 'B', influencer: 'C' })
    expect(isSingleThreaded(o)).toBe(false)
  })
})

describe('R2 · silêncio > 21 dias em etapa ≥ 4', () => {
  it('dispara na etapa 4 com 30 dias de silêncio', () => {
    const o = opp({ stage: 4, last_update: '2026-07-20T12:00:00Z' })
    const r = regraSilencioEtapaAvancada(o, [], HOJE, DEFAULT_THRESHOLDS)
    expect(r?.codigo).toBe('silence_late_stage')
    expect(r?.mensagem).toContain('Validação/Teste')
  })

  it('não dispara na etapa 2, por mais calado que esteja', () => {
    const o = opp({ stage: 2, last_update: '2026-01-01T12:00:00Z' })
    expect(regraSilencioEtapaAvancada(o, [], HOJE, DEFAULT_THRESHOLDS)).toBeNull()
  })

  it('20 dias ainda não dispara; 21 sim', () => {
    expect(regraSilencioEtapaAvancada(opp({ stage: 5, last_update: '2026-08-04T12:00:00Z' }), [], HOJE, DEFAULT_THRESHOLDS)).toBeNull()
    expect(regraSilencioEtapaAvancada(opp({ stage: 5, last_update: '2026-08-03T12:00:00Z' }), [], HOJE, DEFAULT_THRESHOLDS)).not.toBeNull()
  })

  it('a atividade real reseta o relógio, não o last_update', () => {
    const o = opp({ id: 7, stage: 5, last_update: '2026-01-01T12:00:00Z' })
    const r = regraSilencioEtapaAvancada(o, [atividade(7, '2026-08-22')], HOJE, DEFAULT_THRESHOLDS)
    expect(r).toBeNull()
  })

  it('42 dias de silêncio é crítico, não só aviso', () => {
    const o = opp({ stage: 5, last_update: '2026-07-01T12:00:00Z' })
    expect(regraSilencioEtapaAvancada(o, [], HOJE, DEFAULT_THRESHOLDS)?.severidade).toBe('critical')
  })
})

describe('R3 · regressão de escala', () => {
  it('detecta a queda e pede o motivo, sem tratar como erro', () => {
    const o = opp({ scales: escalas({ dor: 4 }) })
    const r = regraRegressaoDeEscala(o, escalas({ dor: 8 }))
    expect(r?.codigo).toBe('scale_regression')
    expect(r?.mensagem).toContain('DOR 8→4')
    expect(r?.sugestao).toContain('vale os mesmos pontos que subir')
  })

  it('subir não é regressão', () => {
    expect(regraRegressaoDeEscala(opp({ scales: escalas({ dor: 8 }) }), escalas({ dor: 4 }))).toBeNull()
  })

  it('sem snapshot anterior não há o que comparar', () => {
    expect(regraRegressaoDeEscala(opp(), null)).toBeNull()
  })
})

describe('R4 · gate falso', () => {
  it('pega a etapa arrastada acima do que as escalas sustentam', () => {
    const o = opp({ stage: 5, scales: escalas({ dor: 1, poder: 1, visao: 1, valor: 1, controle: 1, compras: 1 }) })
    expect(hasFalseGate(o)).toBe(true)
    const r = regraGateFalso(o)
    expect(r?.severidade).toBe('critical')
    expect(r?.mensagem).toContain('Negociação')
    expect(r?.sugestao).toContain('infla o forecast')
  })

  it('escalas coerentes com a etapa não disparam', () => {
    const o = opp({ stage: 3, scales: escalas({ dor: 7, poder: 6, visao: 6, valor: 5, controle: 4, compras: 3 }) })
    expect(hasFalseGate(o)).toBe(false)
  })

  it('etapa 6 (Fechado) nunca é gate falso', () => {
    expect(hasFalseGate(opp({ stage: 6, scales: escalas({}) }))).toBe(false)
  })
})

describe('R5 · ação vencida > 7 dias', () => {
  it('dispara com 10 dias de atraso', () => {
    const o = opp({ next_action: 'Ligar pro comprador', next_action_date: '2026-08-14' })
    const r = regraAcaoVencida(o, HOJE, DEFAULT_THRESHOLDS)
    expect(r?.codigo).toBe('action_overdue')
    expect(r?.mensagem).toContain('Ligar pro comprador')
    expect(r?.mensagem).toContain('10 dias')
  })

  it('6 dias ainda não é risco', () => {
    expect(regraAcaoVencida(opp({ next_action: 'X', next_action_date: '2026-08-18' }), HOJE, DEFAULT_THRESHOLDS)).toBeNull()
  })

  it('sem data não há vencimento', () => {
    expect(regraAcaoVencida(opp({ next_action: 'X', next_action_date: null }), HOJE, DEFAULT_THRESHOLDS)).toBeNull()
  })
})

describe('R6 · proposta sem resposta > 14 dias', () => {
  it('dispara quando ninguém respondeu depois do envio', () => {
    const o = opp({ id: 5, stage: 5 })
    const r = regraPropostaSemResposta(
      o,
      [atividade(5, '2026-08-01', { activity_type: 'proposal' })],
      HOJE,
      DEFAULT_THRESHOLDS,
    )
    expect(r?.codigo).toBe('proposal_no_answer')
    expect(r?.sugestao).toContain('chegou em quem assina')
  })

  it('não dispara se houve conversa depois da proposta', () => {
    const o = opp({ id: 5, stage: 5 })
    const r = regraPropostaSemResposta(
      o,
      [
        atividade(5, '2026-08-01', { activity_type: 'proposal' }),
        atividade(5, '2026-08-15', { activity_type: 'call', result: 'positivo' }),
      ],
      HOJE,
      DEFAULT_THRESHOLDS,
    )
    expect(r).toBeNull()
  })

  it('sem proposta enviada não há regra que aplicar', () => {
    expect(regraPropostaSemResposta(opp({ id: 5 }), [atividade(5, '2026-08-01')], HOJE, DEFAULT_THRESHOLDS)).toBeNull()
  })
})

describe('orquestração', () => {
  it('ordena por severidade: o crítico primeiro', () => {
    const o = opp({
      id: 9,
      stage: 5,
      value: 400_000,
      sponsor: 'Marcelo',
      power_sponsor: null,
      influencer: null,
      support_contact: null,
      scales: escalas({ dor: 1, poder: 1 }),
      next_action: 'Mandar contrato',
      next_action_date: '2026-08-01',
      last_update: '2026-06-01T12:00:00Z',
    })
    const sinais = avaliarRiscos(o, [], HOJE)
    expect(sinais.length).toBeGreaterThanOrEqual(3)
    expect(sinais[0]?.severidade).toBe('critical')
    expect(riskLevel(sinais)).toBe('critico')
  })

  it('negócio com desfecho não tem risco a gerir', () => {
    expect(avaliarRiscos(opp({ outcome: 'lost', stage: 5 }), [], HOJE)).toEqual([])
  })

  it('todo sinal traz uma sugestão acionável, nunca só o diagnóstico', () => {
    const o = opp({ id: 9, stage: 5, scales: escalas({ dor: 1 }), last_update: '2026-05-01T12:00:00Z' })
    for (const s of avaliarRiscos(o, [], HOJE)) {
      expect(s.sugestao.length).toBeGreaterThan(10)
      expect(s.mensagem.length).toBeGreaterThan(10)
    }
  })

  it('o risco da carteira é ponderado pelo valor', () => {
    const grandeERuim = opp({ id: 1, value: 1_000_000, stage: 5, scales: escalas({}), last_update: '2026-01-01T12:00:00Z' })
    const pequenoESaudavel = opp({ id: 2, value: 1_000, stage: 2, last_update: `${HOJE}T12:00:00Z` })
    const score = portfolioRiskScore([grandeERuim, pequenoESaudavel], [], HOJE)
    expect(score).toBeGreaterThan(50)
    expect(portfolioRiskScore([], [], HOJE)).toBe(0)
  })

  it('riskLevel devolve ok quando não há nada', () => {
    expect(riskLevel([])).toBe('ok')
  })

  it('escalaMaisFraca aponta o elo mais frágil', () => {
    const o = opp({ scales: escalas({ dor: 7, poder: 6, visao: 5, valor: 4, controle: 2, compras: 8 }) })
    expect(escalaMaisFraca(o)).toEqual({ escala: 'controle', valor: 2 })
  })
})
