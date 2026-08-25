// src/data/__tests__/ajustes-gestor.test.ts
//
// Lo que se prueba acá son las tres decisiones que nadie puede verificar
// mirando la pantalla:
//   · de dónde sale la meta propuesta y por qué la rampa es un PISO,
//   · qué cuenta como movimiento CON prueba y qué no,
//   · que los tres patrones de calibración marcan lo que dicen marcar
//     — y, sobre todo, que no marcan lo que no.

import { describe, expect, it } from 'vitest'
import { atividade, compromisso, opp } from '@/core/__tests__/fixtures'
import type { Activity, IsoDate, Vendor } from '@/core'
import {
  BANDA_DE_NEGOCIACAO,
  agregarSemana,
  fraseSeEntao,
  montarProposta,
  type SemanaDoHistorico,
} from '../ajustes'
import {
  DIAS_PARA_ESTAGNAR,
  montarPainel,
  padroesDeCalibracao,
  sugerirCoaching,
  temProva,
} from '../gestor'

/* ══════════════════════════════════════════════════════════════════════════
   Cookbook
   ══════════════════════════════════════════════════════════════════════════ */

function semana(over: Partial<SemanaDoHistorico> = {}): SemanaDoHistorico {
  return {
    semana: '2026-07-27' as IsoDate,
    contato: 0,
    conversa: 0,
    avanco: 0,
    reuniao: 0,
    diasUteis: 5,
    ...over,
  }
}

describe('montarProposta', () => {
  it('sem histórico manda a rampa, e diz que é a rampa', () => {
    const p = montarProposta([semana(), semana(), semana(), semana()], 1, 5, undefined)
    expect(p.origem).toBe('rampa')
    // Semana 1-2 da rampa: 4 toques por dia × 5 dias úteis.
    expect(p.proposta.contato).toBe(20)
    expect(p.negociado).toBe(false)
  })

  it('a rampa é PISO: quem já faz mais não tem a meta puxada para baixo', () => {
    // Média 40 toques/semana contra uma rampa de 20.
    const historico = [40, 40, 40, 40].map((n) => semana({ contato: n, conversa: 5 }))
    const p = montarProposta(historico, 1, 5, undefined)
    expect(p.origem).toBe('historico')
    expect(p.proposta.contato).toBe(40)
  })

  it('quem faz menos que a rampa recebe a rampa, não a própria média', () => {
    const historico = [3, 4, 2, 3].map((n) => semana({ contato: n }))
    const p = montarProposta(historico, 1, 5, undefined)
    // A média é 3; a rampa da semana 1 são 20. Manda a rampa.
    expect(p.proposta.contato).toBe(20)
  })

  it('as semanas vazias não entram na média — férias não viram meta baixa', () => {
    const historico = [semana({ contato: 40 }), semana(), semana(), semana({ contato: 40 })]
    const p = montarProposta(historico, 1, 5, undefined)
    // Média sobre as DUAS semanas com dados (40), não sobre as quatro (20).
    // Se as vazias entrassem, a média cairia para 20 e ninguém notaria.
    expect(p.proposta.contato).toBe(40)
  })

  it('a banda de negociação é exatamente ±30 % da proposta', () => {
    const historico = [40, 40, 40, 40].map((n) => semana({ contato: n }))
    const p = montarProposta(historico, 1, 5, undefined)
    expect(p.proposta.contato).toBe(40)
    expect(p.bandas.contato.min).toBe(Math.floor(40 * (1 - BANDA_DE_NEGOCIACAO)))
    expect(p.bandas.contato.max).toBe(Math.ceil(40 * (1 + BANDA_DE_NEGOCIACAO)))
  })

  it('o cookbook já negociado manda sobre a proposta', () => {
    const p = montarProposta([semana({ contato: 40 })], 1, 5, {
      vendor: 'Fernando',
      touches_per_week: 33,
      conversations_per_week: 6,
      meetings_per_week: 2,
      advances_per_week: 3,
      golden_hour_cue: null,
      golden_hour_days: [2, 3, 4, 5, 6],
      golden_hour_start: '16:00',
    })
    expect(p.negociado).toBe(true)
    expect(p.atual.contato).toBe(33)
    expect(p.proposta.contato).toBe(40)
  })
})

describe('agregarSemana', () => {
  it('conta só o que caiu dentro da semana e desconta os contatos de largada', () => {
    const atividades: Activity[] = [
      // Segunda da semana: entra.
      atividade(1, '2026-08-17' as IsoDate),
      // Domingo seguinte: entra (a semana vai de segunda a domingo).
      atividade(1, '2026-08-23' as IsoDate),
      // Segunda seguinte: fora.
      atividade(1, '2026-08-24' as IsoDate),
    ]
    const s = agregarSemana('2026-08-17' as IsoDate, atividades, [])
    expect(s.semana).toBe('2026-08-17')
    // Dos actividades reales, sin los 2 contatos de largada que regala el anillo.
    expect(s.contato).toBe(2)
  })

  it('reuniões e demos contam como reunião', () => {
    const atividades: Activity[] = [
      atividade(1, '2026-08-18' as IsoDate, { activity_type: 'meeting' }),
      atividade(1, '2026-08-19' as IsoDate, { activity_type: 'demo' }),
      atividade(1, '2026-08-20' as IsoDate, { activity_type: 'email' }),
    ]
    expect(agregarSemana('2026-08-17' as IsoDate, atividades, []).reuniao).toBe(2)
  })
})

describe('fraseSeEntao', () => {
  it('de segunda a sexta vira «de um dia útil», não a lista dos cinco', () => {
    const frase = fraseSeEntao({ hora: 16, dias: [1, 2, 3, 4, 5], frase: null })
    expect(frase).toBe('Se são 16h de um dia útil, eu abro a Golden Hour com a lista da véspera.')
  })

  it('a frase escrita pela pessoa manda sobre a gerada', () => {
    const frase = fraseSeEntao({ hora: 16, dias: [1], frase: '  Depois do café, eu ligo.  ' })
    expect(frase).toBe('Depois do café, eu ligo.')
  })

  it('dois dias soltos se leem como dois dias soltos', () => {
    expect(fraseSeEntao({ hora: 9, dias: [2, 4], frase: null })).toContain('de terça ou quinta')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Gestor
   ══════════════════════════════════════════════════════════════════════════ */

const HOJE = '2026-08-28' as IsoDate

function vendedor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    name: 'Renata',
    email: null,
    role: null,
    phone: null,
    is_admin: false,
    is_active: true,
    monthly_target: null,
    auth_user_id: null,
    auth_id: null,
    telegram_id: null,
    telegram_username: null,
    created_at: null,
    ...over,
  }
}

describe('temProva', () => {
  it('um registro ditado por voz sempre traz artefato', () => {
    const a = atividade(1, HOJE, { source: 'ai_parsed', description: 'curto' })
    expect(temProva(a)).toBe(true)
  })

  it('uma nota de doze caracteres não sustenta nada', () => {
    expect(temProva(atividade(1, HOJE, { description: 'falei com ele' }))).toBe(false)
  })
})

describe('sugerirCoaching', () => {
  it('escolhe o negócio caro e travado, e devolve uma pergunta de verdade', () => {
    const caro = opp({ value: 900_000, stage: 4, vendor: 'Renata' })
    const barato = opp({ value: 3_000, stage: 4, vendor: 'Renata' })
    const s = sugerirCoaching([barato, caro], [])
    expect(s).not.toBeNull()
    expect(s?.opportunityId).toBe(caro.id)
    expect(s?.jogada.length).toBeGreaterThan(10)
    // El porqué está anclado en el gate de la etapa, no en prosa suelta.
    expect(s?.porque).toMatch(/VALOR|escala|nível/i)
  })

  it('não inventa coaching quando não há nada travado', () => {
    const saudavel = opp({
      stage: 6,
      outcome: 'won',
      scales: undefined,
    })
    expect(sugerirCoaching([saudavel], [])).toBeNull()
  })
})

describe('padroesDeCalibracao', () => {
  const mapa = new Map([[1, opp({ id: 1, client: 'Tetra Pak' })]])

  it('marca seis registros em menos de dez minutos', () => {
    const base = Date.parse('2026-08-28T18:00:00Z')
    const rajada = Array.from({ length: 6 }, (_, i) =>
      atividade(1, HOJE, { created_at: new Date(base + i * 60_000).toISOString() }),
    )
    const padroes = padroesDeCalibracao(rajada, mapa)
    expect(padroes.filter((p) => p.codigo === 'rajada')).toHaveLength(1)
    // Y viene con la pregunta, no con un veredicto.
    expect(padroes[0]?.perguntaParaAConversa).toMatch(/\?/)
  })

  it('NÃO marca seis registros espalhados pelo dia', () => {
    const base = Date.parse('2026-08-28T09:00:00Z')
    const espalhados = Array.from({ length: 6 }, (_, i) =>
      atividade(1, HOJE, { created_at: new Date(base + i * 45 * 60_000).toISOString() }),
    )
    expect(padroesDeCalibracao(espalhados, mapa).filter((p) => p.codigo === 'rajada')).toEqual([])
  })

  it('marca escala alta declarada sem citação, e não a que tem transcrição', () => {
    const semProva = atividade(1, HOJE, {
      description: 'subiu',
      ai_suggested_scales: { valor: { score: 8, description: '' } },
    })
    const comProva = atividade(1, HOJE, {
      source: 'ai_parsed',
      description: 'transcrição inteira da ligação',
      ai_suggested_scales: { valor: { score: 8, description: '' } },
    })
    const padroes = padroesDeCalibracao([semProva, comProva], mapa)
    expect(padroes.filter((p) => p.codigo === 'salto_sem_prova')).toHaveLength(1)
  })

  it('marca a etapa que voltou — e o texto trata isso como honestidade', () => {
    const subiu = atividade(1, '2026-08-20' as IsoDate, {
      activity_type: 'stage_change',
      stage_at_time: 4,
    })
    const voltou = atividade(1, '2026-08-26' as IsoDate, {
      activity_type: 'stage_change',
      stage_at_time: 3,
    })
    const padroes = padroesDeCalibracao([subiu, voltou], mapa)
    const oscilacao = padroes.find((p) => p.codigo === 'oscilacao_de_etapa')
    expect(oscilacao).toBeDefined()
    expect(oscilacao?.detalhe).toContain('honestidade')
  })
})

describe('montarPainel', () => {
  it('separa o que andou do que parou, e mede compromissos só quando existem', () => {
    const viva = opp({ id: 10, vendor: 'Renata', stage: 3, value: 200_000 })
    const parada = opp({ id: 11, vendor: 'Renata', stage: 3, value: 500_000 })

    const painel = montarPainel(
      {
        vendors: [vendedor()],
        opportunities: [viva, parada],
        activities: [
          // Movimiento de esta semana, con transcripción.
          atividade(10, '2026-08-26' as IsoDate, {
            activity_type: 'stage_change',
            stage_at_time: 2,
            source: 'ai_parsed',
          }),
          // La otra oportunidad no se toca hace mucho.
          atividade(11, '2026-06-01' as IsoDate),
        ],
        commitments: [],
        avisos: { enviados: 100, lidos: 3 },
        acoesDoVentus: null,
      },
      'servidor',
      HOJE,
    )

    const r = painel.vendedores[0]
    expect(r?.moveu).toHaveLength(1)
    expect(r?.moveu[0]?.comProva).toBe(true)
    expect(r?.estagnou.some((e) => e.opportunityId === 11)).toBe(true)
    expect(r?.estagnou[0]?.diasSemToque).toBeGreaterThanOrEqual(DIAS_PARA_ESTAGNAR)
    // Sin compromisos, el porcentaje es null y no 0 %: no es lo mismo.
    expect(r?.compromissos.percentual).toBeNull()
    // La salud del sistema reporta la tasa real de lectura.
    expect(painel.saude.leituraDeAvisos?.taxa).toBeCloseTo(0.03)
    // ventus_actions sin aplicar: se dice null, no 0 %.
    expect(painel.saude.aceitacao).toBeNull()
  })

  it('conta os compromissos da semana e ignora os de outras', () => {
    const painel = montarPainel(
      {
        vendors: [vendedor()],
        opportunities: [],
        activities: [],
        commitments: [
          compromisso({ week_of: '2026-08-24', status: 'done' }),
          compromisso({ week_of: '2026-08-24', status: 'missed' }),
          compromisso({ week_of: '2026-08-17', status: 'done' }),
        ],
        avisos: null,
        acoesDoVentus: [
          { tipo: 'proximo_passo', estado: 'committed' },
          { tipo: 'proximo_passo', estado: 'descartado' },
        ],
      },
      'servidor',
      HOJE,
    )
    expect(painel.vendedores[0]?.compromissos.total).toBe(2)
    expect(painel.vendedores[0]?.compromissos.percentual).toBe(50)
    expect(painel.saude.aceitacao?.[0]?.taxa).toBe(0.5)
  })

  it('vendedor inativo não aparece no painel', () => {
    const painel = montarPainel(
      {
        vendors: [vendedor(), vendedor({ id: 2, name: 'Paulo', is_active: false })],
        opportunities: [],
        activities: [],
        commitments: [],
        avisos: null,
        acoesDoVentus: null,
      },
      'servidor',
      HOJE,
    )
    expect(painel.vendedores.map((v) => v.nome)).toEqual(['Renata'])
  })
})
