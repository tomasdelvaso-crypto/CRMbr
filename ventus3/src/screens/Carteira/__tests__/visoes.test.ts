// Las Smart Views y el filtrado de la Carteira. Todo lo que hay acá es puro,
// así que se prueba sin DOM y sin Dexie.

import { describe, expect, it } from 'vitest'
import type { CarteiraRow } from '@/data'
import { detectRisks, calculateHealthScore } from '@/core'
import { compromisso, escalas, opp } from '@/core/__tests__/fixtures'
import {
  DIAS_SEM_TOQUE,
  FILTROS_PADRAO,
  aplicarFiltros,
  chipsAtivos,
  combinaVisao,
  contarVisoes,
  lerFiltrosSalvos,
  nivelDeRisco,
  temFiltroAtivo,
} from '../visoes'

const HOJE = '2026-08-25'

/** Fila de Carteira armada como la arma fetchCarteira, sin pasar por Dexie. */
function linha(over: Partial<CarteiraRow> = {}, oportunidade = opp()): CarteiraRow {
  return {
    opportunity: oportunidade,
    daysSinceContact: 0,
    nextAction: oportunidade.next_action,
    nextActionDate: oportunidade.next_action_date,
    healthScore: calculateHealthScore(oportunidade.scales),
    // Sin evidencias armadas a mano, el verificado es 0: es exactamente lo que
    // devuelve `healthVerificado()` para escalas sin cita.
    healthVerificado: 0,
    risks: detectRisks(oportunidade, [], HOJE),
    compromissosSemVeredicto: 0,
    busca: `${oportunidade.name ?? ''} ${oportunidade.client ?? ''}`.toLowerCase(),
    ...over,
  }
}

describe('combinaVisao', () => {
  it('marca silêncio a partir dos 15 dias, não antes', () => {
    expect(combinaVisao('sem_toque', linha({ daysSinceContact: DIAS_SEM_TOQUE - 1 }), HOJE)).toBe(
      false,
    )
    expect(combinaVisao('sem_toque', linha({ daysSinceContact: DIAS_SEM_TOQUE }), HOJE)).toBe(true)
  })

  it('«sem próxima ação com data» olha a data, não o texto', () => {
    const comTexto = linha({ nextAction: 'Ligar para o comprador', nextActionDate: null })
    expect(combinaVisao('sem_data', comTexto, HOJE)).toBe(true)
    expect(combinaVisao('sem_data', linha({ nextActionDate: '2026-09-01' }), HOJE)).toBe(false)
  })

  it('«fechamento este mês» compara ano e mês, não os 30 dias seguintes', () => {
    const dentro = linha({}, opp({ expected_close: '2026-08-31' }))
    const fora = linha({}, opp({ expected_close: '2026-09-01' }))
    expect(combinaVisao('fecha_no_mes', dentro, HOJE)).toBe(true)
    expect(combinaVisao('fecha_no_mes', fora, HOJE)).toBe(false)
  })

  it('detecta gate travado pela regra de risco do domínio, não por conta própria', () => {
    // Etapa 5 com todas as escalas em 1: o gate não permite nem a etapa 2.
    const travada = opp({ stage: 5, scales: escalas({ dor: 1, poder: 1, visao: 1 }) })
    expect(combinaVisao('gate_travado', linha({}, travada), HOJE)).toBe(true)
  })

  it('a visão de cadência nunca casa com uma oportunidade: ela mora na outra tela', () => {
    expect(combinaVisao('cadencia_atrasada', linha({ daysSinceContact: 90 }), HOJE)).toBe(false)
  })
})

describe('contarVisoes', () => {
  it('conta as seis numa passada e recebe a de cadência de fora', () => {
    const linhas = [
      linha({ daysSinceContact: 20, nextActionDate: null }),
      linha({ daysSinceContact: 2 }, opp({ next_action_date: '2026-08-26' })),
      linha({ compromissosSemVeredicto: 2 }),
    ]
    const contagem = contarVisoes(linhas, 48, HOJE)
    expect(contagem.sem_toque).toBe(1)
    expect(contagem.sem_veredicto).toBe(1)
    expect(contagem.cadencia_atrasada).toBe(48)
  })
})

describe('aplicarFiltros', () => {
  const caras = linha({}, opp({ name: 'Tetra Pak', client: 'Tetra Pak', value: 900_000, stage: 4 }))
  const baratas = linha({}, opp({ name: 'Vale', client: 'Embalagens Vale', value: 12_000, stage: 2 }))

  it('ordena por valor decrescente por padrão', () => {
    const saida = aplicarFiltros([baratas, caras], FILTROS_PADRAO, '', HOJE)
    expect(saida[0]?.opportunity.name).toBe('Tetra Pak')
  })

  it('filtra por etapa e por texto já normalizado', () => {
    const porEtapa = aplicarFiltros([caras, baratas], { ...FILTROS_PADRAO, etapas: [2] }, '', HOJE)
    expect(porEtapa).toHaveLength(1)
    expect(porEtapa[0]?.opportunity.stage).toBe(2)

    const porTexto = aplicarFiltros([caras, baratas], FILTROS_PADRAO, 'tetra', HOJE)
    expect(porTexto).toHaveLength(1)
  })

  it('ordenar por silêncio põe o mais calado primeiro', () => {
    const a = linha({ daysSinceContact: 3 }, opp({ value: 900_000 }))
    const b = linha({ daysSinceContact: 40 }, opp({ value: 1000 }))
    const saida = aplicarFiltros([a, b], { ...FILTROS_PADRAO, ordem: 'silencio' }, '', HOJE)
    expect(saida[0]?.daysSinceContact).toBe(40)
  })

  it('ordenar por fechamento manda quem não tem data para o fim', () => {
    const semData = linha({}, opp({ expected_close: null }))
    const comData = linha({}, opp({ expected_close: '2026-09-15' }))
    const saida = aplicarFiltros([semData, comData], { ...FILTROS_PADRAO, ordem: 'fechamento' }, '', HOJE)
    expect(saida[0]?.opportunity.expected_close).toBe('2026-09-15')
  })
})

describe('nivelDeRisco', () => {
  it('crítico manda sobre atenção', () => {
    const l = linha({
      risks: [
        { code: 'action_overdue', severity: 'warning', message: '', opportunityId: 1 },
        { code: 'false_gate', severity: 'critical', message: '', opportunityId: 1 },
      ],
    })
    expect(nivelDeRisco(l)).toBe('critico')
  })
})

describe('chips e persistência', () => {
  it('cada chip devolve os filtros que sobram ao tirá-lo', () => {
    const filtros = { visao: 'sem_data' as const, etapas: [2 as const], risco: 'critico' as const, ordem: 'saude' as const }
    const chips = chipsAtivos(filtros)
    expect(chips).toHaveLength(4)
    const semVisao = chips.find((c) => c.id.startsWith('visao:'))?.aoRemover
    expect(semVisao?.visao).toBeNull()
    expect(semVisao?.etapas).toEqual([2])
  })

  it('o padrão não conta como filtro ativo', () => {
    expect(temFiltroAtivo(FILTROS_PADRAO)).toBe(false)
    expect(temFiltroAtivo({ ...FILTROS_PADRAO, ordem: 'saude' })).toBe(true)
  })

  it('lixo no localStorage não derruba a tela', () => {
    // Sem localStorage (o caso do Node) devolve o padrão em vez de lançar.
    expect(lerFiltrosSalvos()).toEqual(FILTROS_PADRAO)
  })
})

describe('compromisso sem veredicto', () => {
  it('o fixture de compromisso pendente é o que a contagem espera', () => {
    const c = compromisso({ status: 'pending', due_date: '2026-08-01' })
    expect(c.status).toBe('pending')
    expect(c.due_date! < HOJE).toBe(true)
  })
})
