// src/core/__tests__/spin.test.ts
// O banco tem que servir de verdade na porta da planta: cobertura completa,
// perguntas do negócio real e nenhum número inventado por nós.

import { describe, expect, it } from 'vitest'
import { SCALE_KEYS } from '../ppvvcc'
import {
  SPIN_QUESTIONS,
  categoriaParaNivel,
  questionsForScale,
  questionsToAdvance,
  textosParaAvancar,
} from '../spin'
import type { SpinCategory } from '../types'

const CATEGORIAS: SpinCategory[] = ['situacao', 'problema', 'implicacao', 'necessidade']

describe('cobertura do banco SPIN', () => {
  it('tem no mínimo 6 perguntas por categoria em cada uma das 6 escalas', () => {
    for (const escala of SCALE_KEYS) {
      for (const cat of CATEGORIAS) {
        expect(questionsForScale(escala, cat).length).toBeGreaterThanOrEqual(6)
      }
    }
  })

  it('não repete pergunta em nenhum lugar do banco', () => {
    const textos = SPIN_QUESTIONS.map((q) => q.text)
    expect(new Set(textos).size).toBe(textos.length)
  })

  it('toda pergunta termina em interrogação ou é um roteiro de ligação', () => {
    for (const q of SPIN_QUESTIONS) {
      expect(q.text.length).toBeGreaterThan(20)
      expect(q.text.trim().endsWith('?')).toBe(true)
    }
  })

  it('fala do negócio real: caixa, violação, retrabalho, custo por caixa', () => {
    const tudo = SPIN_QUESTIONS.map((q) => q.text.toLowerCase()).join(' ')
    for (const termo of ['caixa', 'violad', 'retrabalho', 'transportadora', 'devoluç', 'expediç', 'fita']) {
      expect(tudo).toContain(termo)
    }
  })

  it('não inventa números nossos — o número é sempre do cliente', () => {
    for (const q of SPIN_QUESTIONS) {
      expect(q.text).not.toMatch(/\d+\s?%/)
      expect(q.text).not.toMatch(/R\$\s?\d/)
    }
  })
})

describe('escolha da categoria pelo nível da escala', () => {
  it('segue a sequência SPIN clássica', () => {
    expect(categoriaParaNivel(0)).toBe('situacao')
    expect(categoriaParaNivel(1)).toBe('situacao')
    expect(categoriaParaNivel(2)).toBe('problema')
    expect(categoriaParaNivel(4)).toBe('problema')
    expect(categoriaParaNivel(5)).toBe('implicacao')
    expect(categoriaParaNivel(7)).toBe('implicacao')
    expect(categoriaParaNivel(8)).toBe('necessidade')
    expect(categoriaParaNivel(10)).toBe('necessidade')
  })

  it('clampeia níveis fora de faixa', () => {
    expect(categoriaParaNivel(-4)).toBe('situacao')
    expect(categoriaParaNivel(99)).toBe('necessidade')
  })
})

describe('questionsToAdvance', () => {
  it('traz da categoria que corresponde ao nível atual', () => {
    const qs = questionsToAdvance('dor', 3, [], 3)
    expect(qs).toHaveLength(3)
    expect(qs.every((q) => q.scale === 'dor')).toBe(true)
    expect(qs[0]?.category).toBe('problema')
  })

  it('exclui as perguntas já usadas na oportunidade', () => {
    const primeiras = questionsToAdvance('dor', 3, [], 3)
    const usadas = primeiras.map((q) => q.text)
    const seguintes = questionsToAdvance('dor', 3, usadas, 3)
    expect(seguintes.some((q) => usadas.includes(q.text))).toBe(false)
  })

  it('nunca deixa o vendedor sem nada: cai para a categoria vizinha', () => {
    const todasDoProblema = questionsForScale('dor', 'problema').map((q) => q.text)
    const qs = questionsToAdvance('dor', 3, todasDoProblema, 3)
    expect(qs).toHaveLength(3)
    expect(qs.every((q) => q.category !== 'problema')).toBe(true)
  })

  it('respeita o limite pedido', () => {
    expect(questionsToAdvance('valor', 5, [], 1)).toHaveLength(1)
    expect(textosParaAvancar('valor', 5, [], 5)).toHaveLength(5)
  })

  it('textosParaAvancar devolve só strings, pronto para o card', () => {
    const t = textosParaAvancar('poder', 2)
    expect(t.every((x) => typeof x === 'string' && x.length > 0)).toBe(true)
  })
})
