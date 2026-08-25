// src/core/__tests__/methodology.test.ts
// O catálogo tem que bater com o CHECK de public.activities, e o cookbook
// tem que apontar sempre para a escala que trava.

import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG,
  METHODOLOGY_ACTIVITIES,
  RESULT_CONFIG,
  activitiesForStage,
  cookbookCoverage,
  getMethodologyActivity,
  getSuggestedNextStep,
  isValidActivityType,
  sugestaoDeProximoPasso,
} from '../methodology'
import { escalas, opp } from './fixtures'

describe('tipos de atividade', () => {
  it('tem os 12 valores do CHECK de activities', () => {
    expect(ACTIVITY_TYPES).toHaveLength(12)
    expect(Object.keys(ACTIVITY_TYPE_CONFIG).sort()).toEqual([...ACTIVITY_TYPES].sort())
  })

  it('rejeita um tipo que o Postgres não aceitaria', () => {
    expect(isValidActivityType('call')).toBe(true)
    expect(isValidActivityType('ligacao')).toBe(false)
    expect(isValidActivityType(null)).toBe(false)
  })

  it('os tipos gerados pelo sistema não aparecem no formulário', () => {
    expect(ACTIVITY_TYPE_CONFIG.ai_suggestion.selectable).toBe(false)
    expect(ACTIVITY_TYPE_CONFIG.stage_change.selectable).toBe(false)
    expect(ACTIVITY_TYPE_CONFIG.call.selectable).toBe(true)
  })
})

describe('RESULT_CONFIG', () => {
  it('cobre os 6 resultados de touchpoint', () => {
    expect(Object.keys(RESULT_CONFIG)).toHaveLength(6)
  })

  it('marca quem respondeu e quem encerra a cadência', () => {
    expect(RESULT_CONFIG.no_response.respondeu).toBe(false)
    expect(RESULT_CONFIG.interested.respondeu).toBe(true)
    expect(RESULT_CONFIG.meeting_scheduled.encerraCadencia).toBe(true)
    expect(RESULT_CONFIG.not_interested.encerraCadencia).toBe(true)
    expect(RESULT_CONFIG.not_now.encerraCadencia).toBe(false)
  })
})

describe('cookbook de hitos', () => {
  it('cobre as 6 etapas sem código duplicado', () => {
    const codigos = METHODOLOGY_ACTIVITIES.map((a) => a.code)
    expect(new Set(codigos).size).toBe(codigos.length)
    for (const s of [1, 2, 3, 4, 5, 6] as const) {
      expect(activitiesForStage(s).length).toBeGreaterThan(0)
    }
  })

  it('todo hito diz que evidência deixa', () => {
    for (const a of METHODOLOGY_ACTIVITIES) expect(a.evidencia.length).toBeGreaterThan(5)
  })

  it('busca por código é case-insensitive', () => {
    expect(getMethodologyActivity('4a')?.code).toBe('4A')
    expect(getMethodologyActivity('  3B ')?.label).toContain('Visão diferenciada')
    expect(getMethodologyActivity('9Z')).toBeUndefined()
  })

  it('sugere primeiro o hito que destrava o gate', () => {
    // Etapa 4 com VALOR travado: tem que vir um hito da escala valor.
    const o = opp({ stage: 4, scales: escalas({ dor: 7, poder: 6, visao: 6, valor: 3, controle: 5, compras: 2 }) })
    expect(getSuggestedNextStep(o, [])?.scale).toBe('valor')
  })

  it('pula os hitos já registrados', () => {
    const o = opp({ stage: 2, scales: escalas({ dor: 0, poder: 0 }) })
    const primeiro = getSuggestedNextStep(o, [])
    const segundo = getSuggestedNextStep(o, [primeiro?.code ?? ''])
    expect(segundo?.code).not.toBe(primeiro?.code)
  })

  it('com a etapa toda coberta, olha para a etapa seguinte', () => {
    const feitos = activitiesForStage(2).map((a) => a.code)
    const o = opp({ stage: 2 })
    expect(getSuggestedNextStep(o, feitos)?.stage).toBe(3)
  })

  it('cookbookCoverage vai de 0 a 100', () => {
    expect(cookbookCoverage(3, [])).toBe(0)
    expect(cookbookCoverage(3, activitiesForStage(3).map((a) => a.code))).toBe(100)
  })
})

describe('sugestaoDeProximoPasso', () => {
  it('sem escala alvo, ataca a que trava o gate e explica por quê', () => {
    const o = opp({ stage: 4, scales: escalas({ dor: 7, poder: 6, visao: 6, valor: 4, controle: 5, compras: 2 }) })
    const s = sugestaoDeProximoPasso(o)
    expect(s.escala).toBe('valor')
    expect(s.nivelAtual).toBe(4)
    expect(s.motivo).toContain('Para sair de Validação/Teste')
    expect(s.proximoNivel).toBeTruthy()
  })

  it('respeita a escala escolhida à mão', () => {
    const o = opp({ stage: 4, scales: escalas({ valor: 4, poder: 2 }) })
    expect(sugestaoDeProximoPasso(o, 'poder').escala).toBe('poder')
  })

  it('com o gate limpo, ataca a escala mais baixa das seis', () => {
    const o = opp({ stage: 2, scales: escalas({ dor: 8, poder: 7, visao: 6, valor: 6, controle: 6, compras: 1 }) })
    const s = sugestaoDeProximoPasso(o)
    expect(s.escala).toBe('compras')
    expect(s.motivo).toContain('gate de Qualificação está cumprido')
  })

  it('com a escala no topo, propõe proteger em vez de inventar nível 11', () => {
    const o = opp({ stage: 2, scales: escalas({ dor: 10, poder: 10, visao: 10, valor: 10, controle: 10, compras: 10 }) })
    const s = sugestaoDeProximoPasso(o)
    expect(s.proximoNivel).toBeNull()
  })
})
