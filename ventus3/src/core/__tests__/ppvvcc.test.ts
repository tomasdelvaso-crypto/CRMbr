// src/core/__tests__/ppvvcc.test.ts
// Os catálogos não podem se desviar do v2 (api/_lib/ppvvcc.js), e o health
// verificado tem que ser mais duro que o declarado — é a razão de existir do M6.

import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_FRESH_DAYS,
  SCALE_DEFINITIONS,
  SCALE_KEYS,
  STAGES,
  STAGE_GATES,
  calculateHealthScore,
  checkStageRequirements,
  estadoDaEvidencia,
  evaluateGate,
  exigeEvidencia,
  gateFaltante,
  getDaysSinceLastContact,
  getScale,
  getScaleScores,
  getScaleValue,
  healthVerificado,
  lowestBlockingScale,
  maxStageAllowed,
  probabilidadeCalculada,
  proximoNivel,
} from '../ppvvcc'
import { escalas, evidencia } from './fixtures'

describe('catálogos PPVVCC', () => {
  it('tem exatamente 6 escalas na ordem canônica', () => {
    expect(SCALE_KEYS).toEqual(['dor', 'poder', 'visao', 'valor', 'controle', 'compras'])
  })

  it('tem 11 níveis (0..10) em cada escala — 66 definições no total', () => {
    let total = 0
    for (const key of SCALE_KEYS) {
      const levels = SCALE_DEFINITIONS[key]
      expect(levels).toHaveLength(11)
      expect(levels.map((d) => d.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      total += levels.length
    }
    expect(total).toBe(66)
  })

  it('tem 6 etapas de funil com os nomes corretos', () => {
    expect(STAGES.map((s) => s.name)).toEqual([
      'Prospecção',
      'Qualificação',
      'Apresentação',
      'Validação/Teste',
      'Negociação',
      'Fechado',
    ])
  })

  it('só define gates para as etapas 2 a 5', () => {
    expect(Object.keys(STAGE_GATES).sort()).toEqual(['2', '3', '4', '5'])
  })
})

describe('leitura defensiva do jsonb', () => {
  it('normaliza number, objeto, null e lixo para número', () => {
    expect(getScaleValue(7)).toBe(7)
    expect(getScaleValue({ score: 6 })).toBe(6)
    expect(getScaleValue(null)).toBe(0)
    expect(getScaleValue(undefined)).toBe(0)
    expect(getScaleValue(Number.NaN)).toBe(0)
  })

  it('aceita os aliases legados em inglês dos registros antigos', () => {
    const legado = { pain: { score: 8 }, power: 6 } as never
    expect(getScaleValue(getScale(legado, 'dor'))).toBe(8)
    expect(getScaleValue(getScale(legado, 'poder'))).toBe(6)
    expect(getScaleScores(legado).dor).toBe(8)
  })

  it('getScaleScores sempre devolve as 6 chaves, mesmo com scales null', () => {
    const s = getScaleScores(null)
    expect(Object.keys(s).sort()).toEqual([...SCALE_KEYS].sort())
    expect(Object.values(s).every((v) => v === 0)).toBe(true)
  })
})

describe('calculateHealthScore', () => {
  it('é a média das 6 escalas com uma casa decimal', () => {
    expect(calculateHealthScore(escalas({ dor: 5, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }))).toBe(3.8)
  })

  it('conta as escalas ausentes como 0 — não as ignora', () => {
    // Só dor=6: 6/6 = 1.0, não 6.0. É o caso das 10 oportunidades com tudo em 0.
    expect(calculateHealthScore(escalas({ dor: 6 }))).toBe(1)
  })

  it('devolve 0 para scales null', () => {
    expect(calculateHealthScore(null)).toBe(0)
  })
})

describe('gates de etapa', () => {
  const fracas = escalas({ dor: 5, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 })

  it('etapa 2 passa com dor≥5 e poder≥4', () => {
    expect(checkStageRequirements(fracas, 2)).toBe(true)
  })

  it('etapa 4 trava porque VALOR 4 < 6', () => {
    expect(checkStageRequirements(fracas, 4)).toBe(false)
    const g = evaluateGate(fracas, 4)
    expect(g.passed).toBe(false)
    expect(g.blocking).toEqual([{ scale: 'valor', min: 6, current: 4 }])
  })

  it('etapa 6 não tem gate: sempre passa', () => {
    expect(checkStageRequirements(null, 6)).toBe(true)
  })

  it('gateFaltante redige o texto exato que o vendedor vê', () => {
    expect(gateFaltante(fracas, 4)?.texto).toBe(
      'Para sair de Validação/Teste falta VALOR ≥ 6 (hoje 4)',
    )
  })

  it('gateFaltante devolve null quando o gate está cumprido', () => {
    expect(gateFaltante(fracas, 2)).toBeNull()
  })

  it('com dois gates travados escolhe o que está MAIS LONGE do mínimo', () => {
    // Etapa 5 exige controle≥7 e compras≥6. Falta 4 de controle e 1 de compras.
    const s = escalas({ controle: 3, compras: 5 })
    expect(lowestBlockingScale(s, 5)).toBe('controle')
    expect(gateFaltante(s, 5)?.escala).toBe('controle')
  })

  it('maxStageAllowed detecta a etapa que as escalas realmente sustentam', () => {
    expect(maxStageAllowed(fracas)).toBe(4) // passa o gate 2 e o 3, trava no 4
    // Etapa 1 não tem gate de escala: Qualificação é sempre alcançável.
    // O gate da 2 é para SAIR dela, então com tudo em 0 o teto é 2.
    expect(maxStageAllowed(escalas({}))).toBe(2)
    expect(maxStageAllowed(escalas({ dor: 9, poder: 9, visao: 9, valor: 9, controle: 9, compras: 9 }))).toBe(6)
  })
})

describe('proximoNivel', () => {
  it('devolve o texto canônico do nível seguinte', () => {
    expect(proximoNivel('dor', 4)).toBe('Vendedor documenta dor e Pessoa de Contato concorda')
    expect(proximoNivel('poder', 3)).toBe('Tomador de Decisão acessado')
  })

  it('devolve null quando a escala já está em 10', () => {
    expect(proximoNivel('valor', 10)).toBeNull()
  })

  it('trata score fracionário e fora de faixa sem quebrar', () => {
    expect(proximoNivel('dor', 4.7)).toBe(proximoNivel('dor', 4))
    expect(proximoNivel('dor', -3)).toBe('Vendedor assume necessidades do cliente')
    expect(proximoNivel('dor', 99)).toBeNull()
  })
})

describe('healthVerificado — os dois números do M6', () => {
  const s = escalas({ dor: 8, poder: 6, visao: 6, valor: 6, controle: 6, compras: 6 })
  const hoje = '2026-08-24'

  it('sem nenhuma prova, o verificado é 0 e o declarado se mantém', () => {
    const h = healthVerificado(s, [], hoje)
    expect(h.declarado).toBe(6.3)
    expect(h.verificado).toBe(0)
    expect(h.escalasSemProva).toHaveLength(6)
  })

  it('divide sempre por 6: uma escala provada não faz o negócio valer 10', () => {
    const h = healthVerificado(s, [evidencia(1, 'dor', '2026-08-20')], hoje)
    expect(h.verificado).toBe(1.3) // 8/6
    expect(h.escalasComProva).toEqual([{ escala: 'dor', nivel: 8, idadeDias: 4 }])
    expect(h.escalasSemProva).toEqual(['poder', 'visao', 'valor', 'controle', 'compras'])
  })

  it('com as 6 escalas provadas, verificado = declarado', () => {
    const evs = (['dor', 'poder', 'visao', 'valor', 'controle', 'compras'] as const).map((k) =>
      evidencia(1, k, '2026-08-01'),
    )
    const h = healthVerificado(s, evs, hoje)
    expect(h.verificado).toBe(h.declarado)
    expect(h.escalasSemProva).toHaveLength(0)
  })

  it('prova de mais de 90 dias não conta', () => {
    const velha = evidencia(1, 'dor', '2026-05-01') // 115 dias
    const h = healthVerificado(s, [velha], hoje)
    expect(h.verificado).toBe(0)
    expect(h.escalasSemProva).toContain('dor')
  })

  it('prova exatamente no limite de 90 dias ainda vale', () => {
    const limite = evidencia(1, 'dor', '2026-05-26') // 90 dias exatos
    const h = healthVerificado(s, [limite], hoje)
    expect(h.escalasComProva[0]?.idadeDias).toBe(EVIDENCE_FRESH_DAYS)
    expect(h.verificado).toBeGreaterThan(0)
  })

  it('prova rejeitada na Revisão não conta', () => {
    const rejeitada = evidencia(1, 'dor', '2026-08-20', { verified: false })
    expect(healthVerificado(s, [rejeitada], hoje).verificado).toBe(0)
  })

  it('usa a prova mais recente de cada escala', () => {
    const antiga = evidencia(1, 'dor', '2026-01-01')
    const nova = evidencia(1, 'dor', '2026-08-22')
    const h = healthVerificado(s, [antiga, nova], hoje)
    expect(h.escalasComProva[0]?.idadeDias).toBe(2)
  })

  it('estadoDaEvidencia dá os três estados da UI', () => {
    expect(estadoDaEvidencia('dor', [], hoje).estado).toBe('sem_prova')
    expect(estadoDaEvidencia('dor', [evidencia(1, 'dor', '2026-08-20')], hoje).estado).toBe('com_prova')
    const velha = estadoDaEvidencia('dor', [evidencia(1, 'dor', '2026-01-01')], hoje)
    expect(velha.estado).toBe('prova_velha')
    expect(velha.texto).toContain('Sem evidência há')
  })

  it('a regra da prova só morde acima do nível 5', () => {
    expect(exigeEvidencia(5)).toBe(false)
    expect(exigeEvidencia(6)).toBe(true)
  })
})

describe('getDaysSinceLastContact', () => {
  const agora = new Date('2026-08-24T12:00:00Z')

  it('prefere a atividade mais recente ao last_update', () => {
    const dias = getDaysSinceLastContact(
      '2026-08-23T12:00:00Z',
      [{ activity_date: '2026-08-10' }, { activity_date: '2026-08-14' }],
      agora,
    )
    expect(dias).toBe(10)
  })

  it('cai para last_update só quando não há histórico', () => {
    expect(getDaysSinceLastContact('2026-08-17T12:00:00Z', [], agora)).toBe(7)
  })

  it('devolve 999 quando nunca houve nada', () => {
    expect(getDaysSinceLastContact(null, [], agora)).toBe(999)
  })

  it('nunca devolve negativo com data no futuro (dado sujo)', () => {
    expect(getDaysSinceLastContact('2026-12-01T12:00:00Z', [], agora)).toBe(0)
  })

  it('ignora datas inválidas em vez de virar NaN', () => {
    expect(getDaysSinceLastContact(null, [{ activity_date: 'não é data' }], agora)).toBe(999)
  })
})

describe('probabilidadeCalculada', () => {
  it('castiga o silêncio sobre a saúde', () => {
    expect(probabilidadeCalculada(8, 0)).toBe(85)
    expect(probabilidadeCalculada(8, 15)).toBe(65)
    expect(probabilidadeCalculada(8, 45)).toBe(35)
    expect(probabilidadeCalculada(1, 60)).toBe(5)
  })
})
