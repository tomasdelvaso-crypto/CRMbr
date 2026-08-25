// api/__tests__/prompt.test.ts
// El cache breakpoint es la diferencia entre pagar 2.500 tokens de prefijo por
// request y pagar el 10%. Y falla EN SILENCIO: si algo volátil se cuela antes
// del breakpoint, todo sigue funcionando y `cache_read_input_tokens` es cero
// para siempre. Estos tests son la única forma de enterarse.

import { describe, expect, it } from 'vitest'
import {
  CACHE_ESCRITA_MULT,
  CACHE_LEITURA_MULT,
  MODELOS,
  custoUsd,
  prefixoEstavel,
  systemComCache,
  temBreakpoint,
} from '../_lib/anthropic.js'

describe('prefixoEstavel', () => {
  it('é idêntico byte a byte entre chamadas', () => {
    expect(prefixoEstavel()).toBe(prefixoEstavel())
  })

  it('não contém nada volátil: sem data, sem hora, sem uuid', () => {
    const texto = prefixoEstavel()
    // Una fecha ISO o un timestamp acá invalidan el caché en cada request.
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(texto).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)
  })

  it('traz as 6 escalas com as definições canônicas', () => {
    const texto = prefixoEstavel()
    for (const escala of ['DOR', 'PODER', 'VISÃO', 'VALOR', 'CONTROLE', 'COMPRAS']) {
      expect(texto).toContain(escala)
    }
  })

  it('traz os gates de etapa em vez de descrevê-los de memória', () => {
    const texto = prefixoEstavel()
    expect(texto).toContain('DOR ≥ 5')
    expect(texto).toContain('PODER ≥ 4')
    expect(texto).toContain('CONTROLE ≥ 7')
  })

  it('traz a cadência de 7 toques em 21 dias', () => {
    const texto = prefixoEstavel()
    expect(texto).toContain('TP1 · dia 1')
    expect(texto).toContain('TP7 · dia 21')
  })

  it('traz o catálogo das 14 ferramentas', () => {
    const texto = prefixoEstavel()
    expect(texto).toContain('ventus_registrar_atividade')
    expect(texto).toContain('ventus_agendar_lembrete')
  })

  it('é grande o bastante para caber no cache (mínimo ~1024 tokens)', () => {
    // Regla práctica: ~3,5 caracteres por token en PT-BR. Por debajo del
    // mínimo cacheable, la API no cachea y no avisa.
    expect(prefixoEstavel().length).toBeGreaterThan(1024 * 3.5)
  })
})

describe('systemComCache', () => {
  it('põe o breakpoint no primeiro bloco e só nele', () => {
    const blocos = systemComCache('Hoje é 2026-08-25.', 'CARTEIRA: ...')
    expect(blocos).toHaveLength(3)
    expect(temBreakpoint(blocos[0] as never)).toBe(true)
    expect(temBreakpoint(blocos[1] as never)).toBe(false)
    expect(temBreakpoint(blocos[2] as never)).toBe(false)
  })

  it('o bloco cacheado é o prefixo estável, não o contexto', () => {
    const blocos = systemComCache('Hoje é 2026-08-25.')
    expect(blocos[0]?.text).toBe(prefixoEstavel())
    expect(blocos[1]?.text).toContain('2026-08-25')
  })

  it('o prefixo não muda quando muda o contexto volátil', () => {
    const a = systemComCache('Hoje é 2026-08-25.', 'CARTEIRA: Tetra Pak')
    const b = systemComCache('Hoje é 2026-08-26.', 'CARTEIRA: Nike, Honda')
    expect(a[0]?.text).toBe(b[0]?.text)
  })

  it('descarta blocos vazios para não gerar prefixos diferentes por um null', () => {
    const comNulo = systemComCache('contexto', null, undefined, '  ')
    expect(comNulo).toHaveLength(2)
  })
})

describe('MODELOS e custo', () => {
  it('tem um único lugar com model ids e preços', () => {
    expect(MODELOS.coach.id).toBe('claude-opus-5')
    expect(MODELOS.redator.id).toBe('claude-sonnet-5')
  })

  it('cobra a escrita de cache mais cara e a leitura muito mais barata', () => {
    const semCache = custoUsd(MODELOS.redator, { input_tokens: 1_000_000, output_tokens: 0 })
    const escrevendo = custoUsd(MODELOS.redator, {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    })
    const lendo = custoUsd(MODELOS.redator, {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    })
    expect(semCache).toBeCloseTo(MODELOS.redator.entradaUsd, 6)
    expect(escrevendo).toBeCloseTo(MODELOS.redator.entradaUsd * CACHE_ESCRITA_MULT, 6)
    expect(lendo).toBeCloseTo(MODELOS.redator.entradaUsd * CACHE_LEITURA_MULT, 6)
  })

  it('soma entrada e saída com preços distintos', () => {
    const custo = custoUsd(MODELOS.coach, { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    expect(custo).toBeCloseTo(MODELOS.coach.entradaUsd + MODELOS.coach.saidaUsd, 6)
  })

  it('não explode com usage ausente', () => {
    expect(custoUsd(MODELOS.coach, null)).toBe(0)
    expect(custoUsd(MODELOS.coach, {})).toBe(0)
  })
})
