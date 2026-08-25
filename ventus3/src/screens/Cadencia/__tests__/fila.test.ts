// La fila de cadencia: la fecha alvo real y el orden por urgencia.
// El caso que importa es el de los 48 leads en producción SIN
// next_touchpoint_date: si la fila los ignorara, serían invisibles.

import { describe, expect, it } from 'vitest'
import type { LinhaCadencia } from '@/data'
import { touchpointDelayDays, type Lead } from '@/core'
import { lead as fixtureLead, toque } from '@/core/__tests__/fixtures'
import {
  contarEtapas,
  dataAlvo,
  filtrarPorEtapa,
  ordenarPorDataAlvo,
  passoAtual,
  prepararFila,
  situacaoDoToque,
  toquesRestantes,
} from '../fila'

const HOJE = '2026-08-25'

function linha(l: Lead, over: Partial<LinhaCadencia> = {}): LinhaCadencia {
  return {
    lead: l,
    atraso: touchpointDelayDays(l, HOJE),
    touchpoints: [],
    ...over,
  }
}

describe('dataAlvo', () => {
  it('usa next_touchpoint_date quando existe', () => {
    const l = fixtureLead({ next_touchpoint_date: '2026-08-20' })
    expect(dataAlvo(l)).toBe('2026-08-20')
  })

  it('sem next_touchpoint_date, deriva do último toque + o intervalo do passo', () => {
    // 2 toques feitos → o próximo é o TP3 (dia 6), o anterior é o TP2 (dia 3):
    // intervalo de 3 dias sobre a data do último toque.
    const l = fixtureLead({
      next_touchpoint_date: null,
      last_touchpoint_date: '2026-08-10',
      touchpoints_count: 2,
    })
    expect(dataAlvo(l)).toBe('2026-08-13')
  })

  it('sem toque nenhum, deriva da criação: um lead sem data não pode sumir', () => {
    const l = fixtureLead({
      next_touchpoint_date: null,
      last_touchpoint_date: null,
      touchpoints_count: 0,
      created_at: '2026-08-01T12:00:00Z',
    })
    expect(dataAlvo(l)).toBe('2026-08-02')
    expect(situacaoDoToque(l, HOJE)).toBe('atrasado')
  })

  it('cadência esgotada não espera mais nenhum toque', () => {
    const l = fixtureLead({ touchpoints_count: 7 })
    expect(dataAlvo(l)).toBeNull()
    expect(situacaoDoToque(l, HOJE)).toBe('esgotado')
    expect(toquesRestantes(l)).toBe(0)
    expect(passoAtual(l)).toBeNull()
  })

  it('concorda com touchpointDelayDays do domínio', () => {
    const l = fixtureLead({ next_touchpoint_date: '2026-08-15' })
    expect(touchpointDelayDays(l, HOJE)).toBe(10)
    expect(situacaoDoToque(l, HOJE)).toBe('atrasado')
  })
})

describe('ordenarPorDataAlvo', () => {
  it('o mais vencido primeiro, não o de maior atraso relativo a um limiar fixo', () => {
    const doze = linha(fixtureLead({ next_touchpoint_date: '2026-08-13' }))
    const amanha = linha(fixtureLead({ next_touchpoint_date: '2026-08-26' }))
    const ontem = linha(fixtureLead({ next_touchpoint_date: '2026-08-24' }))

    const ordem = ordenarPorDataAlvo([amanha, ontem, doze], HOJE).map((l) =>
      dataAlvo(l.lead),
    )
    expect(ordem).toEqual(['2026-08-13', '2026-08-24', '2026-08-26'])
  })

  it('quem esgotou os 7 toques vai para o fim, mas continua visível', () => {
    const viva = linha(fixtureLead({ next_touchpoint_date: '2026-09-30' }))
    const esgotada = linha(fixtureLead({ touchpoints_count: 7 }))
    const ordem = ordenarPorDataAlvo([esgotada, viva], HOJE)
    expect(ordem[0]?.lead.touchpoints_count).toBeLessThan(7)
    expect(ordem).toHaveLength(2)
  })
})

describe('filtro por etapa', () => {
  const linhas = [
    linha(fixtureLead({ stage: '1a' })),
    linha(fixtureLead({ stage: '1c' })),
    linha(fixtureLead({ stage: '1c' })),
    linha(fixtureLead({ stage: '1d' })),
  ]

  it('conta cada etapa e o total', () => {
    const c = contarEtapas(linhas)
    expect(c.todos).toBe(4)
    expect(c['1c']).toBe(2)
    expect(c['1b']).toBe(0)
  })

  it('«todos» devolve tudo; uma etapa devolve só ela', () => {
    expect(filtrarPorEtapa(linhas, 'todos')).toHaveLength(4)
    expect(filtrarPorEtapa(linhas, '1c')).toHaveLength(2)
  })

  it('prepararFila filtra e ordena de uma vez, sem mexer no array de entrada', () => {
    const original = [...linhas]
    const saida = prepararFila(linhas, '1c', HOJE)
    expect(saida).toHaveLength(2)
    expect(linhas).toEqual(original)
  })
})

describe('passoAtual', () => {
  it('o passo é o índice do contador: 0 toques → TP1 no LinkedIn', () => {
    expect(passoAtual(fixtureLead({ touchpoints_count: 0 }))?.tp).toBe(1)
    expect(passoAtual(fixtureLead({ touchpoints_count: 0 }))?.channel).toBe('linkedin')
    expect(passoAtual(fixtureLead({ touchpoints_count: 4 }))?.tp).toBe(5)
  })

  it('os touchpoints da linha não afetam o passo: quem manda é o contador do lead', () => {
    const l = fixtureLead({ touchpoints_count: 3 })
    const comHistorico = linha(l, { touchpoints: [toque(l.id, 1), toque(l.id, 2), toque(l.id, 3)] })
    expect(passoAtual(comHistorico.lead)?.tp).toBe(4)
  })
})
