// src/core/__tests__/dates.test.ts
// Todo em America/Sao_Paulo. Os casos de borda que importam: virada de ano,
// Páscoa móvel, DST histórico (o Brasil teve horário de verão até 2019) e os
// atalhos que o vendedor escreve ou dita.

import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  diasUteisEntre,
  ehDiaUtil,
  feriadoDe,
  feriadosBR,
  formatarBRL,
  formatarDataCurta,
  formatRelativeBr,
  hojeBRT,
  isBrHoliday,
  isWeekend,
  minutosDoDiaBRT,
  nextBusinessDay,
  parseAtalhoDeData,
  pascoa,
  proximoDiaUtil,
  todayBr,
  toBrDate,
  weekStart,
} from '../dates'

describe('conversão para data civil BRT', () => {
  it('usa o fuso de São Paulo, não o UTC', () => {
    // 01/01/2026 às 02:00 UTC ainda é 31/12/2025 em Brasília (UTC-3).
    expect(toBrDate(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31')
  })

  it('não desloca uma data civil que já vem como YYYY-MM-DD', () => {
    // O bug clássico: new Date('2026-03-01') parseia como UTC e vira 28/02.
    expect(toBrDate('2026-03-01')).toBe('2026-03-01')
  })

  it('hojeBRT é o mesmo que todayBr', () => {
    const agora = new Date('2026-08-24T18:00:00Z')
    expect(hojeBRT(agora)).toBe(todayBr(agora))
    expect(hojeBRT(agora)).toBe('2026-08-24')
  })

  it('minutosDoDiaBRT desconta as 3 horas de Brasília', () => {
    // 18:00 UTC = 15:00 em Brasília = 900 minutos.
    expect(minutosDoDiaBRT(new Date('2026-08-24T18:00:00Z'))).toBe(15 * 60)
  })
})

describe('aritmética de datas civis', () => {
  it('soma dias atravessando a virada de ano', () => {
    expect(addDays('2025-12-30', 3)).toBe('2026-01-02')
  })

  it('soma dias atravessando fevereiro de ano bissexto', () => {
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01')
  })

  it('não perde um dia na antiga virada do horário de verão brasileiro', () => {
    // Em 2018 o DST começou em 04/11. Ancorando ao meio-dia UTC, somar 1 dia
    // continua dando 1 dia civil — que é o bug que este módulo existe para evitar.
    expect(addDays('2018-11-03', 1)).toBe('2018-11-04')
    expect(daysBetween('2018-11-03', '2018-11-05')).toBe(2)
    // E na volta do DST, em 17/02/2019.
    expect(addDays('2019-02-16', 2)).toBe('2019-02-18')
    expect(daysBetween('2019-02-16', '2019-02-18')).toBe(2)
  })

  it('daysBetween é negativo quando b vem antes de a', () => {
    expect(daysBetween('2026-08-24', '2026-08-20')).toBe(-4)
  })

  it('weekStart devolve a segunda, e no domingo volta para a semana que fechou', () => {
    expect(weekStart('2026-08-26')).toBe('2026-08-24') // quarta → segunda
    expect(weekStart('2026-08-24')).toBe('2026-08-24') // a própria segunda
    expect(weekStart('2026-08-30')).toBe('2026-08-24') // domingo → segunda anterior
  })
})

describe('feriados brasileiros e de São Paulo', () => {
  it('calcula a Páscoa corretamente em anos conhecidos', () => {
    expect(pascoa(2026)).toBe('2026-04-05')
    expect(pascoa(2027)).toBe('2027-03-28')
    expect(pascoa(2024)).toBe('2024-03-31')
  })

  it('deriva o bloco móvel da Páscoa', () => {
    const f2026 = feriadosBR(2026)
    const nomes = new Map(f2026.map((x) => [x.name, x.date]))
    expect(nomes.get('Carnaval')).toBe('2026-02-17')
    expect(nomes.get('Sexta-feira Santa')).toBe('2026-04-03')
    expect(nomes.get('Corpus Christi')).toBe('2026-06-04')
  })

  it('inclui os feriados de SP: 09/07 estadual e 25/01 municipal', () => {
    expect(feriadoDe('2026-07-09')?.scope).toBe('estadual-sp')
    expect(feriadoDe('2026-01-25')?.scope).toBe('municipal-sp')
  })

  it('Consciência Negra virou nacional só a partir de 2024', () => {
    expect(feriadoDe('2023-11-20')?.scope).toBe('municipal-sp')
    expect(feriadoDe('2026-11-20')?.scope).toBe('nacional')
  })

  it('reconhece 07/09 como feriado e um dia comum como útil', () => {
    expect(isBrHoliday('2026-09-07')).toBe(true)
    expect(ehDiaUtil('2026-09-07')).toBe(false)
    expect(ehDiaUtil('2026-09-08')).toBe(true)
  })

  it('fim de semana nunca é dia útil', () => {
    expect(isWeekend('2026-08-29')).toBe(true) // sábado
    expect(isWeekend('2026-08-30')).toBe(true) // domingo
    expect(ehDiaUtil('2026-08-29')).toBe(false)
  })

  it('nextBusinessDay pula o fim de semana e o feriado emendado', () => {
    // Sexta 04/09/2026 → segunda 07/09 é feriado → terça 08/09.
    expect(nextBusinessDay('2026-09-04')).toBe('2026-09-08')
  })

  it('proximoDiaUtil devolve o mesmo dia quando ele já é útil', () => {
    expect(proximoDiaUtil('2026-08-25')).toBe('2026-08-25')
    expect(proximoDiaUtil('2026-08-29')).toBe('2026-08-31')
  })

  it('diasUteisEntre é meio-aberto e ignora fim de semana e feriado', () => {
    // Seg 24/08 até seg 31/08: 5 dias úteis (24..28), sem sáb/dom.
    expect(diasUteisEntre('2026-08-24', '2026-08-31')).toBe(5)
    // Semana com o feriado de 07/09 (segunda): 04 útil + 08,09,10 = 4.
    expect(diasUteisEntre('2026-09-04', '2026-09-11')).toBe(4)
    expect(diasUteisEntre('2026-08-24', '2026-08-24')).toBe(0)
    expect(diasUteisEntre('2026-08-31', '2026-08-24')).toBe(-5)
  })
})

describe('atalhos de data', () => {
  const base = '2026-08-24' // segunda-feira

  it('resolve os atalhos básicos', () => {
    expect(parseAtalhoDeData('hoje', base)).toBe('2026-08-24')
    expect(parseAtalhoDeData('amanhã', base)).toBe('2026-08-25')
    expect(parseAtalhoDeData('amanha', base)).toBe('2026-08-25')
    expect(parseAtalhoDeData('ontem', base)).toBe('2026-08-23')
    expect(parseAtalhoDeData('depois de amanhã', base)).toBe('2026-08-26')
  })

  it('+7d soma sete dias corridos', () => {
    expect(parseAtalhoDeData('+7d', base)).toBe('2026-08-31')
    expect(parseAtalhoDeData('+ 7 dias', base)).toBe('2026-08-31')
    expect(parseAtalhoDeData('-3d', base)).toBe('2026-08-21')
  })

  it('+2s soma semanas e +3u soma dias ÚTEIS', () => {
    expect(parseAtalhoDeData('+2s', base)).toBe('2026-09-07')
    // Seg 24 + 3 dias úteis = quinta 27.
    expect(parseAtalhoDeData('+3u', base)).toBe('2026-08-27')
    // Sexta 04/09 + 1 dia útil pula o feriado de segunda 07/09.
    expect(parseAtalhoDeData('+1u', '2026-09-04')).toBe('2026-09-08')
  })

  it('"segunda" é sempre a PRÓXIMA segunda, nunca hoje', () => {
    expect(parseAtalhoDeData('segunda', base)).toBe('2026-08-31')
    expect(parseAtalhoDeData('sexta', base)).toBe('2026-08-28')
    expect(parseAtalhoDeData('próxima quarta', base)).toBe('2026-08-26')
  })

  it('aceita dd/mm e joga para o ano seguinte quando a data já passou', () => {
    expect(parseAtalhoDeData('15/09', base)).toBe('2026-09-15')
    expect(parseAtalhoDeData('10/03', base)).toBe('2027-03-10')
    expect(parseAtalhoDeData('10/03/2026', base)).toBe('2026-03-10')
  })

  it('devolve null quando não entende, em vez de adivinhar', () => {
    expect(parseAtalhoDeData('qualquer coisa', base)).toBeNull()
    expect(parseAtalhoDeData('', base)).toBeNull()
    expect(parseAtalhoDeData('40/13', base)).toBeNull()
  })
})

describe('formatação PT-BR', () => {
  const hoje = '2026-08-24'

  it('formatarDataCurta usa palavras para hoje/amanhã/ontem', () => {
    expect(formatarDataCurta('2026-08-24', hoje)).toBe('hoje')
    expect(formatarDataCurta('2026-08-25', hoje)).toBe('amanhã')
    expect(formatarDataCurta('2026-08-23', hoje)).toBe('ontem')
  })

  it('formatarDataCurta usa "seg 15/09" para o resto', () => {
    expect(formatarDataCurta('2026-09-15', hoje)).toBe('ter 15/09')
    expect(formatarDataCurta('2026-09-14', hoje)).toBe('seg 14/09')
  })

  it('formatRelativeBr diz há quantos dias', () => {
    const agora = new Date('2026-08-24T15:00:00Z')
    expect(formatRelativeBr('2026-08-21', agora)).toBe('há 3 dias')
    expect(formatRelativeBr('2026-08-27', agora)).toBe('em 3 dias')
  })

  it('formatarBRL não inventa centavos nem quebra com null', () => {
    expect(formatarBRL(1_150_000)).toBe('R$ 1.150.000')
    expect(formatarBRL(null)).toBe('R$ —')
  })
})
