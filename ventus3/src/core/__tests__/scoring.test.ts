// src/core/__tests__/scoring.test.ts
// As quatro defesas do PLANO em forma de teste: teto diário, regra da prova,
// clawback e sinal do comprador. Mais a racha, que nunca pode mostrar 0.

import { describe, expect, it } from 'vitest'
import {
  CONTATOS_DE_LARGADA,
  MAX_SHIELDS,
  REGRAS_PADRAO,
  anelDoDia,
  applyClawback,
  avaliarHoraCheia,
  calcularPA,
  calcularPADoDia,
  clampMetaNegociada,
  contextoVazio,
  estadoDaSequencia,
  metasDaRampa,
  paDoSinal,
  regraDe,
  semanaDesdeInicio,
  weeklyTrophies,
  type ContextoDoDia,
} from '../scoring'
import type { DailyScore, ScoringEvent, ScoringEventKind } from '../types'
import { atividade, toque } from './fixtures'

const HOJE = '2026-08-24' // segunda-feira

function evento(kind: ScoringEventKind, over: Partial<ScoringEvent> = {}): ScoringEvent {
  return { id: `e-${kind}-${Math.random()}`, vendor: 'Renata', kind, date: HOJE, target: null, ...over }
}

describe('REGRAS_PADRAO — a tabela do PLANO', () => {
  it('tem os valores de PA da tabela, sem números duplicados no código', () => {
    expect(regraDe('etapa_avancada')?.pa).toBe(60)
    expect(regraDe('reuniao_realizada')?.pa).toBe(40)
    expect(regraDe('commitment_cumprido')?.pa).toBe(25)
    expect(regraDe('escala_delta')?.pa).toBe(10)
    expect(regraDe('lead_novo')?.pa).toBe(8)
    expect(regraDe('touchpoint')?.pa).toBe(3)
    expect(regraDe('nota_sem_resultado')?.pa).toBe(1)
  })

  it('só o volume fabricável tem teto diário', () => {
    const comTeto = REGRAS_PADRAO.filter((r) => r.tetoDiario !== null).map((r) => r.kind).sort()
    expect(comTeto).toEqual(['lead_novo', 'nota_sem_resultado', 'sweep_para_lead', 'touchpoint'])
    expect(regraDe('touchpoint')?.tetoDiario).toBe(45)
    expect(regraDe('nota_sem_resultado')?.tetoDiario).toBe(20)
    expect(regraDe('reuniao_realizada')?.tetoDiario).toBeNull()
  })

  it('o sinal do comprador vale de 15 a 50 conforme o que o cliente fez', () => {
    expect(paDoSinal('respondeu')).toBe(15)
    expect(paDoSinal('foi_a_compras')).toBe(50)
  })
})

describe('defesa (b) — teto diário com rendimentos decrescentes', () => {
  it('credita normalmente enquanto há espaço', () => {
    const r = calcularPA(evento('touchpoint'), contextoVazio(HOJE))
    expect(r.pa).toBe(3)
    expect(r.capped).toBe(false)
  })

  it('corta pela metade quando o evento cruza o teto', () => {
    const ctx: ContextoDoDia = { date: HOJE, paPorTipo: { touchpoint: 44 } }
    const r = calcularPA(evento('touchpoint'), ctx)
    expect(r.pa).toBe(1)
    expect(r.paBruto).toBe(3)
    expect(r.capped).toBe(true)
  })

  it('passado o teto registra igual mas vale 0, com a mensagem do PLANO', () => {
    const ctx: ContextoDoDia = { date: HOJE, paPorTipo: { touchpoint: 45 } }
    const r = calcularPA(evento('touchpoint'), ctx)
    expect(r.pa).toBe(0)
    expect(r.capped).toBe(true)
    expect(r.motivo).toContain('o que soma agora é conversa e avanço')
  })

  it('16 toques em um dia param nos 45 PA do teto', () => {
    const eventos = Array.from({ length: 16 }, () => evento('touchpoint', { provado: true }))
    expect(calcularPADoDia(eventos, HOJE).total).toBe(45)
  })

  it('o teto de um tipo não contamina o outro', () => {
    const eventos = [
      ...Array.from({ length: 30 }, () => evento('nota_sem_resultado')),
      evento('reuniao_realizada', { provado: true }),
    ]
    // 20 do teto de notas + 40 da reunião.
    expect(calcularPADoDia(eventos, HOJE).total).toBe(60)
  })
})

describe('defesa (a) — regra da prova', () => {
  it('evento acima de 20 PA sem artefato fica pendente e credita 0', () => {
    const r = calcularPA(evento('reuniao_realizada'), contextoVazio(HOJE))
    expect(r.pa).toBe(0)
    expect(r.pendenteDeProva).toBe(true)
    expect(r.motivo).toContain('aguardando evidência')
  })

  it('com evidência anexada credita o valor cheio', () => {
    const r = calcularPA(evento('reuniao_realizada', { evidenceId: 'ev-1' }), contextoVazio(HOJE))
    expect(r.pa).toBe(40)
    expect(r.pendenteDeProva).toBe(false)
  })

  it('o toque de cadência não exige prova — é barato e tem teto', () => {
    expect(calcularPA(evento('touchpoint'), contextoVazio(HOJE)).pendenteDeProva).toBe(false)
  })

  it('Δ de escala só exige prova acima do nível 5', () => {
    const baixo = calcularPA(evento('escala_delta', { magnitude: 4 }), contextoVazio(HOJE))
    expect(baixo.pendenteDeProva).toBe(false)
    const alto = calcularPA(evento('escala_delta', { magnitude: 8 }), contextoVazio(HOJE))
    expect(alto.pendenteDeProva).toBe(true)
  })

  it('corrigir é avançar: baixar uma escala vale o mesmo que subi-la', () => {
    const sobe = calcularPA(evento('escala_delta', { magnitude: 2 }), contextoVazio(HOJE))
    const desce = calcularPA(evento('escala_delta', { magnitude: -2 }), contextoVazio(HOJE))
    expect(sobe.pa).toBe(desce.pa)
    expect(sobe.pa).toBe(20)
  })

  it('o sinal do comprador é clampeado na faixa 15-50', () => {
    expect(calcularPA(evento('sinal_comprador', { magnitude: 999, provado: true }), contextoVazio(HOJE)).pa).toBe(50)
    expect(calcularPA(evento('sinal_comprador', { magnitude: 2, provado: true }), contextoVazio(HOJE)).pa).toBe(15)
  })

  it('um evento sem regra vigente vale 0 e diz por quê', () => {
    const r = calcularPA(evento('inexistente' as ScoringEventKind), contextoVazio(HOJE))
    expect(r.pa).toBe(0)
    expect(r.motivo).toContain('sem regra vigente')
  })
})

describe('defesa (c) — clawback diferido', () => {
  it('devolve os PA sem deixar saldo negativo', () => {
    expect(applyClawback(100, ['reuniao_realizada'])).toBe(60)
    expect(applyClawback(10, ['etapa_avancada'])).toBe(0)
  })
})

describe('os três anéis diários', () => {
  it('a largada dotada dá 2 contatos de graça, com meta de 12', () => {
    const a = anelDoDia([], { contato: 12, conversa: 3, avanco: 1 })
    expect(a.contato.current).toBe(CONTATOS_DE_LARGADA)
    expect(a.contato.goal).toBe(12)
    expect(a.fechado).toBe(false)
  })

  it('conta contato, conversa e avanço a partir do que foi registrado', () => {
    const a = anelDoDia(
      [
        atividade(1, HOJE, { activity_type: 'call', result: 'positivo' }),
        atividade(1, HOJE, { activity_type: 'meeting', result: 'positivo' }),
        atividade(1, HOJE, { activity_type: 'email', result: 'pendente' }),
      ],
      { contato: 4, conversa: 1, avanco: 1 },
    )
    expect(a.contato.current).toBe(CONTATOS_DE_LARGADA + 3)
    expect(a.conversa.current).toBe(2) // call e meeting são bidirecionais
    expect(a.avanco.current).toBe(1) // só a reunião
    expect(a.fechado).toBe(true)
  })

  it('muito anel 1 e zero anel 3 não fecha o dia — o padrão perigoso', () => {
    const toques = Array.from({ length: 20 }, () => toque(1, 1, 'no_response'))
    const a = anelDoDia([], { contato: 4, conversa: 1, avanco: 1 }, toques)
    expect(a.contato.ratio).toBe(1)
    expect(a.conversa.current).toBe(0)
    expect(a.fechado).toBe(false)
  })

  it('o toque com resposta conta conversa; o que marca reunião conta avanço', () => {
    const a = anelDoDia([], { contato: 4, conversa: 1, avanco: 1 }, [
      toque(1, 1, 'interested'),
      toque(1, 2, 'meeting_scheduled'),
    ])
    expect(a.conversa.current).toBe(2)
    expect(a.avanco.current).toBe(1)
  })

  it('o ratio satura em 1 mesmo estourando a meta', () => {
    const muitas = Array.from({ length: 50 }, () => atividade(1, HOJE, { activity_type: 'call' }))
    expect(anelDoDia(muitas, { contato: 4, conversa: 1, avanco: 1 }).contato.ratio).toBe(1)
  })
})

describe('a rampa 4 / 8 / 12', () => {
  it('semanas 1-2 pedem 4 contatos, 1 conversa e 1 avanço', () => {
    expect(metasDaRampa(1)).toEqual({ contato: 4, conversa: 1, avanco: 1 })
    expect(metasDaRampa(2)).toEqual({ contato: 4, conversa: 1, avanco: 1 })
  })

  it('do mês 2 sobe para 8 e do mês 3 em diante para 12', () => {
    expect(metasDaRampa(3).contato).toBe(8)
    expect(metasDaRampa(8).contato).toBe(8)
    expect(metasDaRampa(9)).toEqual({ contato: 12, conversa: 3, avanco: 1 })
    expect(metasDaRampa(52).contato).toBe(12)
  })

  it('o avanço é sempre 1 — é qualidade, não volume', () => {
    for (const s of [1, 5, 12, 40]) expect(metasDaRampa(s).avanco).toBe(1)
  })

  it('semana inválida cai no piso da rampa', () => {
    expect(metasDaRampa(0).contato).toBe(4)
    expect(metasDaRampa(-5).contato).toBe(4)
  })

  it('o cookbook negociado admite ±30% e não mais que isso', () => {
    expect(clampMetaNegociada(10, 13)).toBe(13)
    expect(clampMetaNegociada(10, 30)).toBe(13)
    expect(clampMetaNegociada(10, 1)).toBe(7)
  })

  it('semanaDesdeInicio é 1-based', () => {
    expect(semanaDesdeInicio('2026-08-24', '2026-08-24')).toBe(1)
    expect(semanaDesdeInicio('2026-08-24', '2026-08-30')).toBe(1)
    expect(semanaDesdeInicio('2026-08-24', '2026-08-31')).toBe(2)
  })
})

describe('a racha de Golden Hour', () => {
  it('conta só dias úteis: o fim de semana não quebra nada', () => {
    // Qui 20, sex 21 selados. Hoje é segunda 24 (ainda aberta).
    const s = estadoDaSequencia(['2026-08-20', '2026-08-21'], 0, HOJE)
    expect(s.dias).toBe(2)
  })

  it('hoje não quebra a racha — o dia ainda está aberto', () => {
    const s = estadoDaSequencia(['2026-08-21'], 0, HOJE)
    expect(s.dias).toBe(1)
  })

  it('o feriado no meio não quebra a racha', () => {
    // 07/09/2026 é segunda e feriado. Sex 04 e ter 08 selados.
    const s = estadoDaSequencia(['2026-09-04', '2026-09-08'], 0, '2026-09-09')
    expect(s.dias).toBe(2)
  })

  it('o escudo cobre o buraco em silêncio e avisa no dia seguinte', () => {
    // Sex 21 selada, seg 24 vazia, hoje ter 25.
    const s = estadoDaSequencia(['2026-08-20', '2026-08-21'], 1, '2026-08-25')
    expect(s.dias).toBe(2)
    expect(s.escudosRestantes).toBe(0)
    expect(s.diasCobertos).toContain('2026-08-24')
    expect(s.avisoDeEscudo).toContain('escudo')
  })

  it('no máximo 2 escudos, ganhados, nunca comprados', () => {
    const s = estadoDaSequencia(['2026-08-14'], 99, '2026-08-25')
    expect(s.escudosRestantes).toBeLessThanOrEqual(MAX_SHIELDS)
  })

  it('sem escudo, a racha quebra mas a app JAMAIS mostra 0', () => {
    // 5 dias úteis selados até sex 21, seg 24 vazia, hoje ter 25.
    const historico = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']
    const s = estadoDaSequencia(historico, 0, '2026-08-25')
    expect(s.dias).toBe(0)
    expect(s.exibicao).toBeGreaterThan(0)
    expect(s.resgate?.disponivel).toBe(true)
    expect(s.resgate?.restauraPara).toBe(4) // anterior (5) − 1
    expect(s.texto).toContain('Resgate disponível até amanhã 18h')
  })

  it('o resgate é no máximo 1 por mês', () => {
    const historico = ['2026-08-19', '2026-08-20', '2026-08-21']
    const s = estadoDaSequencia(historico, 0, '2026-08-25', 1)
    expect(s.resgate).toBeNull()
  })

  it('quem nunca teve racha não vê linguagem de fracasso', () => {
    const s = estadoDaSequencia([], 0, HOJE)
    expect(s.dias).toBe(0)
    expect(s.exibicao).toBe(0)
    expect(s.texto).toBe('Sua sequência começa na próxima Hora Cheia.')
  })

  it('mostra o próximo marco', () => {
    const s = estadoDaSequencia(['2026-08-20', '2026-08-21', HOJE], 0, HOJE)
    expect(s.dias).toBe(3)
    expect(s.proximoMarco).toEqual({ marco: 5, faltam: 2 })
  })
})

describe('avaliarHoraCheia', () => {
  const base = { date: HOJE, duracaoMin: 45, toques: 12, metaToques: 12, conversasReais: 2, debriefFeito: true }

  it('sela o dia quando os quatro critérios batem', () => {
    const a = avaliarHoraCheia(base)
    expect(a.cheia).toBe(true)
    expect(a.pa).toBe(12)
    expect(a.faltando).toHaveLength(0)
  })

  it('menos de 40 minutos não é Hora Cheia', () => {
    expect(avaliarHoraCheia({ ...base, duracaoMin: 39 }).cheia).toBe(false)
  })

  it('discar números mortos não ganha racha: sem conversa real não sela', () => {
    const a = avaliarHoraCheia({ ...base, conversasReais: 0 })
    expect(a.cheia).toBe(false)
    expect(a.faltando).toContain('Pelo menos 1 conversa real')
  })

  it('sem debrief a hora é só atividade', () => {
    expect(avaliarHoraCheia({ ...base, debriefFeito: false }).cheia).toBe(false)
  })

  it('não bater a meta de toques também não sela', () => {
    expect(avaliarHoraCheia({ ...base, toques: 5 }).cheia).toBe(false)
  })

  it('deriva as conversas reais dos resultados dos toques', () => {
    const a = avaliarHoraCheia({
      date: HOJE,
      duracaoMin: 50,
      toques: 3,
      metaToques: 3,
      resultados: ['no_response', 'interested', 'no_response'],
      debriefFeito: true,
    })
    expect(a.cheia).toBe(true)
  })

  it('lista tudo o que falta, sem culpa', () => {
    const a = avaliarHoraCheia({ ...base, duracaoMin: 10, toques: 0, conversasReais: 0, debriefFeito: false })
    expect(a.faltando).toHaveLength(4)
    expect(a.texto).not.toMatch(/falhou|perdeu|ruim/i)
  })
})

describe('troféus semanais', () => {
  function dia(vendor: string, points: number, contato: number, conversa: number, avanco: number): DailyScore {
    return {
      vendor,
      date: HOJE,
      points,
      streak: 0,
      shields: 0,
      rings: {
        contato: { key: 'contato', current: contato, goal: 12, ratio: 1 },
        conversa: { key: 'conversa', current: conversa, goal: 3, ratio: 1 },
        avanco: { key: 'avanco', current: avanco, goal: 1, ratio: 1 },
      },
    }
  }

  it('ninguém ganha dois troféus', () => {
    const t = weeklyTrophies({
      Renata: [dia('Renata', 500, 60, 20, 8)],
      Andre: [dia('Andre', 100, 40, 5, 1)],
      Paulo: [dia('Paulo', 90, 30, 9, 2)],
      Victor: [dia('Victor', 80, 20, 4, 3)],
    })
    const vendedores = t.map((x) => x.vendor)
    expect(new Set(vendedores).size).toBe(vendedores.length)
  })

  it('com 4 pessoas e 5 títulos, quase todos levam algo', () => {
    const t = weeklyTrophies({
      Renata: [dia('Renata', 500, 60, 20, 8)],
      Andre: [dia('Andre', 100, 40, 5, 1)],
      Paulo: [dia('Paulo', 90, 30, 9, 2)],
      Victor: [dia('Victor', 80, 20, 4, 3)],
    })
    expect(t.length).toBe(4)
  })

  it('sem dados não inventa ganhadores', () => {
    expect(weeklyTrophies({})).toEqual([])
    expect(weeklyTrophies({ Renata: [dia('Renata', 0, 0, 0, 0)] })).toEqual([])
  })
})
