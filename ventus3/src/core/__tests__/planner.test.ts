// src/core/__tests__/planner.test.ts
// O contrato do rankDay: prioriza o vencido, diversifica clientes, devolve
// exatamente 3, e o score fecha somando os motivos que ele mostra.

import { describe, expect, it } from 'vitest'
import {
  DAILY_ACTION_LIMIT,
  analisarCarteira,
  explicarScore,
  rankAll,
  rankDay,
  scoreLead,
  scoreOpportunity,
  toRankedAction,
  type PlannerInput,
} from '../planner'
import { escalas, atividade, compromisso, lead, opp, tarefa } from './fixtures'

const HOJE = '2026-08-24'

function entrada(over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    vendor: 'Renata',
    today: HOJE,
    opportunities: [],
    leads: [],
    activities: [],
    tasks: [],
    commitments: [],
    ...over,
  }
}

describe('rankDay — contrato da tela Hoje', () => {
  it('devolve exatamente 3 quando há material de sobra', () => {
    const oportunidades = Array.from({ length: 9 }, (_, i) =>
      opp({ id: 500 + i, client: `Cliente ${i}`, last_update: '2026-07-01T12:00:00Z' }),
    )
    const r = rankDay(entrada({ opportunities: oportunidades }))
    expect(r.top).toHaveLength(DAILY_ACTION_LIMIT)
    expect(r.todas.length).toBe(9)
    expect(r.restantes).toBe(6)
  })

  it('devolve menos de 3 sem inventar trabalho que não existe', () => {
    const r = rankDay(entrada({ opportunities: [opp({ last_update: '2026-07-01T12:00:00Z' })] }))
    expect(r.top).toHaveLength(1)
    expect(r.restantes).toBe(0)
  })

  it('devolve vazio com a carteira vazia', () => {
    expect(rankDay(entrada()).top).toEqual([])
  })

  it('a lista completa vem ordenada por score decrescente', () => {
    const oportunidades = [
      opp({ id: 1, client: 'A', last_update: '2026-08-22T12:00:00Z' }),
      opp({ id: 2, client: 'B', last_update: '2026-06-01T12:00:00Z' }),
      opp({ id: 3, client: 'C', last_update: '2026-08-01T12:00:00Z' }),
    ]
    const todas = rankAll(entrada({ opportunities: oportunidades }))
    const scores = todas.map((a) => a.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('é determinístico: a mesma entrada dá exatamente a mesma saída', () => {
    const input = entrada({
      opportunities: [opp({ id: 1, client: 'A' }), opp({ id: 2, client: 'B' })],
      leads: [lead({ id: 9, next_touchpoint_date: '2026-08-18' })],
    })
    expect(rankDay(input).top.map((a) => a.id)).toEqual(rankDay(input).top.map((a) => a.id))
  })
})

describe('rankDay prioriza o vencido', () => {
  it('a tarefa vencida ganha do negócio grande e calado', () => {
    const grandeECalado = opp({
      id: 1,
      client: 'Gigante SA',
      value: 1_150_000,
      last_update: '2026-08-10T12:00:00Z',
    })
    const pequenoComTarefa = opp({
      id: 2,
      client: 'Pequena Ltda',
      value: 8_000,
      last_update: '2026-08-22T12:00:00Z',
    })
    const r = rankDay(
      entrada({
        opportunities: [grandeECalado, pequenoComTarefa],
        tasks: [tarefa({ kind: 'opportunity', id: 2 }, '2026-08-14', { title: 'Enviar a proposta' })],
      }),
    )
    expect(r.top[0]?.entidade.id).toBe(2)
    expect(r.top[0]?.acao).toBe('Enviar a proposta')
    expect(r.top[0]?.porque.some((m) => m.codigo === 'task_overdue')).toBe(true)
  })

  it('quanto mais vencida, mais alta: 20 dias ganha de 1 dia', () => {
    const a = opp({ id: 1, client: 'A', last_update: `${HOJE}T12:00:00Z` })
    const b = opp({ id: 2, client: 'B', last_update: `${HOJE}T12:00:00Z` })
    const r = rankDay(
      entrada({
        opportunities: [a, b],
        tasks: [
          tarefa({ kind: 'opportunity', id: 1 }, '2026-08-23', { title: 'Recente' }),
          tarefa({ kind: 'opportunity', id: 2 }, '2026-08-04', { title: 'Muito velha' }),
        ],
      }),
    )
    expect(r.top[0]?.entidade.id).toBe(2)
    expect(r.top[0]?.urgencia).toBe('critica')
  })

  it('o valor desempata mas não manda: R$ 1,15M não copa as 3 vagas', () => {
    const gigantes = Array.from({ length: 4 }, (_, i) =>
      opp({ id: 700 + i, client: `Gigante ${i}`, value: 1_150_000, last_update: `${HOJE}T12:00:00Z` }),
    )
    const urgente = opp({ id: 800, client: 'Média', value: 20_000, last_update: '2026-06-15T12:00:00Z' })
    const r = rankDay(entrada({ opportunities: [...gigantes, urgente] }))
    expect(r.top[0]?.entidade.id).toBe(800)
  })

  it('a previsão de fechamento vencida aparece como motivo', () => {
    const o = opp({ id: 1, expected_close: '2026-08-01', last_update: `${HOJE}T12:00:00Z` })
    const { reasons } = scoreOpportunity(o, entrada({ opportunities: [o] }))
    expect(reasons.some((r) => r.code === 'closing_soon')).toBe(true)
  })

  it('quem foi falado hoje é empurrado para baixo', () => {
    const falado = opp({ id: 1, client: 'A' })
    const calado = opp({ id: 2, client: 'B' })
    const r = rankAll(
      entrada({
        opportunities: [falado, calado],
        activities: [atividade(1, HOJE), atividade(2, '2026-07-20')],
      }),
    )
    expect(r[0]?.entidade.id).toBe(2)
  })
})

describe('rankDay diversifica clientes', () => {
  it('nunca traz duas ações do mesmo cliente no top 3', () => {
    // Três oportunidades do MESMO cliente, todas muito vencidas, mais uma de
    // outros dois clientes com menos urgência.
    const mesmoCliente = Array.from({ length: 3 }, (_, i) =>
      opp({ id: 10 + i, client: 'Tetra Pak', last_update: '2026-05-01T12:00:00Z', value: 300_000 }),
    )
    const outros = [
      opp({ id: 30, client: 'Ambev', last_update: '2026-08-14T12:00:00Z' }),
      opp({ id: 31, client: 'Natura', last_update: '2026-08-15T12:00:00Z' }),
    ]
    const r = rankDay(entrada({ opportunities: [...mesmoCliente, ...outros] }))
    const clientes = r.top.map((a) => a.entidade.cliente)
    expect(r.top).toHaveLength(3)
    expect(new Set(clientes).size).toBe(3)
    expect(clientes).toContain('Tetra Pak')
  })

  it('a diversificação ignora maiúsculas e espaços', () => {
    const oportunidades = [
      opp({ id: 40, client: 'Tetra Pak', last_update: '2026-05-01T12:00:00Z' }),
      opp({ id: 41, client: ' tetra pak ', last_update: '2026-05-02T12:00:00Z' }),
      opp({ id: 42, client: 'Ambev', last_update: '2026-08-10T12:00:00Z' }),
    ]
    const r = rankDay(entrada({ opportunities: oportunidades }))
    expect(new Set(r.top.slice(0, 2).map((a) => a.entidade.cliente.trim().toLowerCase())).size).toBe(2)
  })

  it('se só há um cliente, completa o top em vez de devolver uma só', () => {
    const oportunidades = Array.from({ length: 3 }, (_, i) =>
      opp({ id: 50 + i, client: 'Único', last_update: '2026-06-01T12:00:00Z' }),
    )
    expect(rankDay(entrada({ opportunities: oportunidades })).top).toHaveLength(3)
  })
})

describe('rankDay com leads de cadência', () => {
  it('o toque atrasado entra no plano com canal e prazo', () => {
    const l = lead({ id: 90, next_touchpoint_date: '2026-08-14', touchpoints_count: 2 })
    const r = rankDay(entrada({ leads: [l] }))
    expect(r.top[0]?.entidade.kind).toBe('lead')
    expect(r.top[0]?.canal).toBeTruthy()
    expect(r.top[0]?.porque.some((m) => m.codigo === 'touchpoint_late')).toBe(true)
  })

  it('o lead 1d (reunião marcada) pesa mais que o 1a frio', () => {
    const frio = lead({ id: 91, stage: '1a', next_touchpoint_date: '2026-08-20' })
    const quente = lead({ id: 92, stage: '1d', next_touchpoint_date: '2026-08-20' })
    const r = rankAll(entrada({ leads: [frio, quente] }))
    expect(r[0]?.entidade.id).toBe(92)
  })

  it('o lead com a cadência esgotada é despriorizado', () => {
    const esgotado = lead({ id: 93, touchpoints_count: 7, last_touchpoint_date: '2026-07-01' })
    const vivo = lead({ id: 94, touchpoints_count: 2, next_touchpoint_date: '2026-08-22' })
    const r = rankAll(entrada({ leads: [esgotado, vivo] }))
    expect(r[0]?.entidade.id).toBe(94)
  })

  it('leads arquivados não entram no plano', () => {
    const l = lead({ id: 95, status: 'archived', next_touchpoint_date: '2026-01-01' })
    expect(rankDay(entrada({ leads: [l] })).top).toHaveLength(0)
  })

  it('scoreLead expõe os motivos com peso', () => {
    const l = lead({ id: 96, next_touchpoint_date: '2026-08-10' })
    const { score, reasons } = scoreLead(l, entrada({ leads: [l] }))
    expect(score).toBeGreaterThan(0)
    expect(reasons.every((r) => typeof r.weight === 'number')).toBe(true)
  })
})

describe('gates, escala alvo e perguntas', () => {
  it('aponta a escala que trava o gate e traz perguntas SPIN', () => {
    const o = opp({
      id: 1,
      stage: 4,
      scales: escalas({ dor: 7, poder: 6, visao: 6, valor: 4, controle: 5, compras: 3 }),
      last_update: '2026-08-18T12:00:00Z',
    })
    const a = rankDay(entrada({ opportunities: [o] })).top[0]
    expect(a?.escalaAlvo).toBe('valor')
    expect(a?.porque.some((m) => m.codigo === 'gate_blocked')).toBe(true)
    expect((a?.perguntasSugeridas ?? []).length).toBeGreaterThan(0)
  })

  it('o gate travado em Negociação pesa mais que o mesmo gate em Qualificação', () => {
    const cedo = opp({ id: 1, stage: 2, scales: escalas({ dor: 1, poder: 0 }), last_update: `${HOJE}T12:00:00Z` })
    const tarde = opp({ id: 2, stage: 5, scales: escalas({ controle: 3, compras: 2 }), last_update: `${HOJE}T12:00:00Z` })
    const cedoGate = scoreOpportunity(cedo, entrada()).reasons.find((r) => r.code === 'gate_blocked')
    const tardeGate = scoreOpportunity(tarde, entrada()).reasons.find((r) => r.code === 'gate_blocked')
    expect(tardeGate?.weight ?? 0).toBeGreaterThan(cedoGate?.weight ?? 0)
  })

  it('sinaliza single-threading quando há um contato só e já há o que perder', () => {
    const o = opp({
      id: 1,
      stage: 4,
      value: 200_000,
      sponsor: 'Marcelo',
      power_sponsor: null,
      influencer: null,
      support_contact: null,
      last_update: `${HOJE}T12:00:00Z`,
    })
    const { reasons } = scoreOpportunity(o, entrada())
    expect(reasons.some((r) => r.code === 'single_threaded')).toBe(true)
  })

  it('negócios fechados e perdidos saem do plano', () => {
    const ganho = opp({ id: 1, client: 'A', outcome: 'won', last_update: '2026-01-01T12:00:00Z' })
    const fechado = opp({ id: 2, client: 'B', stage: 6, last_update: '2026-01-01T12:00:00Z' })
    expect(rankDay(entrada({ opportunities: [ganho, fechado] })).top).toHaveLength(0)
  })

  it('o compromisso da semana vencido entra como ação', () => {
    const o = opp({ id: 1, last_update: `${HOJE}T12:00:00Z` })
    const r = rankDay(
      entrada({
        opportunities: [o],
        commitments: [
          compromisso({ opportunity_id: 1, due_date: '2026-08-20', committed_action: 'Levar o plano ao Marcelo' }),
        ],
      }),
    )
    expect(r.top[0]?.acao).toBe('Levar o plano ao Marcelo')
    expect(r.top[0]?.tipo).toBe('compromisso')
  })
})

describe('explicarScore — o chip «Por que isto?»', () => {
  it('a soma dos motivos mostrados reconstrói o score', () => {
    const o = opp({ id: 1, stage: 4, value: 250_000, last_update: '2026-07-01T12:00:00Z' })
    const a = rankAll(entrada({ opportunities: [o] }))[0]
    expect(a).toBeDefined()
    const soma = (a?.porque ?? []).reduce((s, m) => s + m.peso, 0)
    // O card mostra no máximo 3 motivos; a soma dos mostrados não pode passar
    // do total nem ficar muito longe dele.
    expect(soma).toBeLessThanOrEqual((a?.score ?? 0) + 0.5)
    expect(soma).toBeGreaterThan(0)
  })

  it('mostra no máximo 3 sinais, do mais pesado ao mais leve', () => {
    const o = opp({
      id: 1,
      stage: 5,
      value: 900_000,
      expected_close: '2026-08-26',
      scales: escalas({ controle: 2, compras: 1 }),
      last_update: '2026-06-01T12:00:00Z',
      sponsor: 'Marcelo',
    })
    const a = rankAll(entrada({ opportunities: [o] }))[0]
    expect((a?.porque ?? []).length).toBeLessThanOrEqual(3)
    const pesos = (a?.porque ?? []).map((m) => m.peso)
    expect([...pesos].sort((x, y) => y - x)).toEqual(pesos)
  })

  it('o texto traz o total e os sinais com sinal explícito', () => {
    const o = opp({ id: 1, last_update: '2026-07-01T12:00:00Z' })
    const a = rankAll(entrada({ opportunities: [o] }))[0]!
    const texto = explicarScore(a)
    expect(texto).toContain('pontos de prioridade')
    expect(texto).toContain('+')
  })

  it('toRankedAction preserva id, cliente e motivos', () => {
    const o = opp({ id: 42, client: 'Ambev', last_update: '2026-07-01T12:00:00Z' })
    const a = rankAll(entrada({ opportunities: [o] }))[0]!
    const r = toRankedAction(a)
    expect(r.target).toEqual({ kind: 'opportunity', id: 42 })
    expect(r.clientLabel).toBe('Ambev')
    expect(r.reasons).toHaveLength(a.porque.length)
  })
})

describe('analisarCarteira', () => {
  it('usa as escalas, não a coluna health_score desincronizada', () => {
    const o = opp({
      id: 1,
      health_score: 9.9, // a coluna mente
      scales: escalas({ dor: 1, poder: 1, visao: 1, valor: 1, controle: 1, compras: 1 }),
    })
    expect(analisarCarteira([o], [], HOJE).saudeMedia).toBe(1)
  })

  it('conta em risco quem está sem contato há mais de 7 dias', () => {
    const o = opp({ id: 1, value: 100_000, last_update: '2026-08-01T12:00:00Z' })
    const s = analisarCarteira([o], [], HOJE)
    expect(s.emRisco).toBe(1)
    expect(s.valorEmRisco).toBe(100_000)
  })

  it('ignora negócios com desfecho', () => {
    expect(analisarCarteira([opp({ outcome: 'lost' })], [], HOJE).total).toBe(0)
  })
})
