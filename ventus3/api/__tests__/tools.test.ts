// api/__tests__/tools.test.ts
// Las 14 tools son el contrato entre el modelo y el CRM. Un schema mal armado
// no da error: da un `tool_use.input` con un campo de más que nadie valida y
// que termina escrito en la base.
//
// Se testean tres cosas:
//   · La FORMA del schema (strict, additionalProperties, required completo).
//     `strict: true` exige que TODA propiedad esté en `required`; lo opcional
//     se declara nullable. Es fácil de romper y no avisa.
//   · Los ENUMS salen del dominio, no de un literal copiado a mano.
//   · Los ERRORES GUÍAN: cada uno tiene que decir cómo corregir, no solo que
//     algo salió mal. Un error opaco quema un turno entero.

import { describe, expect, it } from 'vitest'
import { ACTIVITY_RESULTS, ACTIVITY_TYPES, SCALE_KEYS } from '../../src/core'
import {
  TOOLS_AUTOCOMMIT,
  TOOLS_LEITURA,
  TOOL_LABELS,
  VENTUS_TOOLS,
  ehVentusTool,
  erroAlvoAmbiguo,
  erroAlvoNaoEncontrado,
  erroCampoInvalido,
  erroDataInvalida,
  erroGateTravado,
  erroSemProva,
  toolDefs,
} from '../_lib/tools'
import { normalizar, resolverAlvo } from '../_lib/carteira'
import type { AlvoDaCarteira } from '../_lib/carteira'

/** Las 14 exactas del PLANO (M9) y del contrato de la tela Ventus. */
const ESPERADAS = [
  'ventus_registrar_atividade',
  'ventus_definir_proxima_acao',
  'ventus_atualizar_escala',
  'ventus_avancar_etapa',
  'ventus_criar_touchpoint',
  'ventus_converter_lead',
  'ventus_marcar_commitment',
  'ventus_redigir_mensagem',
  'ventus_adiar_acao',
  'ventus_registrar_sinal_comprador',
  'ventus_arquivar_lead',
  'ventus_buscar_carteira',
  'ventus_ler_oportunidade',
  'ventus_agendar_lembrete',
]

interface SchemaObjeto {
  type: string
  properties: Record<string, { type?: unknown; enum?: unknown[] }>
  required: string[]
  additionalProperties: boolean
}

describe('catálogo', () => {
  it('são exatamente as 14 do plano, com os mesmos nomes', () => {
    expect([...VENTUS_TOOLS]).toEqual(ESPERADAS)
  })

  it('cada tool tem rótulo em PT-BR para o preview', () => {
    for (const nome of VENTUS_TOOLS) {
      expect(TOOL_LABELS[nome]).toBeTruthy()
    }
  })

  it('ehVentusTool rejeita qualquer coisa que o modelo invente', () => {
    expect(ehVentusTool('ventus_registrar_atividade')).toBe(true)
    expect(ehVentusTool('ventus_apagar_tudo')).toBe(false)
    expect(ehVentusTool('bash')).toBe(false)
  })

  it('as tools de leitura não escrevem e não pedem confirmação', () => {
    expect([...TOOLS_LEITURA].sort()).toEqual(['ventus_buscar_carteira', 'ventus_ler_oportunidade'])
  })

  it('mover escala e avançar etapa NUNCA auto-commitam', () => {
    // Son las dos cosas que corrompen el forecast de todo el equipo.
    expect(TOOLS_AUTOCOMMIT.has('ventus_atualizar_escala')).toBe(false)
    expect(TOOLS_AUTOCOMMIT.has('ventus_avancar_etapa')).toBe(false)
    expect(TOOLS_AUTOCOMMIT.has('ventus_converter_lead')).toBe(false)
  })
})

describe('schemas', () => {
  const defs = toolDefs()

  it('gera as 14 em ordem estável — a ordem entra no cache do prefixo', () => {
    expect(defs.map((d) => d.name)).toEqual(ESPERADAS)
    expect(toolDefs().map((d) => d.name)).toEqual(defs.map((d) => d.name))
  })

  it.each(defs.map((d) => [d.name, d] as const))('%s é strict e fechado', (_nome, def) => {
    const schema = def.input_schema as unknown as SchemaObjeto
    expect(def.strict).toBe(true)
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(Array.isArray(schema.required)).toBe(true)
  })

  it.each(defs.map((d) => [d.name, d] as const))(
    '%s lista TODA propriedade em required (exigência do strict)',
    (_nome, def) => {
      const schema = def.input_schema as unknown as SchemaObjeto
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort())
    },
  )

  it.each(defs.map((d) => [d.name, d] as const))('%s tem descrição que orienta o modelo', (_nome, def) => {
    expect((def.description ?? '').length).toBeGreaterThan(60)
  })

  it('usa identificadores naturais, nunca uuid nem id numérico', () => {
    for (const def of defs) {
      const props = Object.keys((def.input_schema as unknown as SchemaObjeto).properties)
      expect(props).not.toContain('opportunity_id')
      expect(props).not.toContain('lead_id')
      expect(props).not.toContain('id')
      expect(props).not.toContain('uuid')
    }
  })

  it('os enums saem do domínio e não de um literal copiado', () => {
    const registrar = defs.find((d) => d.name === 'ventus_registrar_atividade')
    const props = (registrar?.input_schema as unknown as SchemaObjeto).properties
    expect(props['tipo']?.enum).toEqual([...ACTIVITY_TYPES])
    expect(props['resultado']?.enum).toEqual([...ACTIVITY_RESULTS])

    const escala = defs.find((d) => d.name === 'ventus_atualizar_escala')
    const propsEscala = (escala?.input_schema as unknown as SchemaObjeto).properties
    expect(propsEscala['escala']?.enum).toEqual([...SCALE_KEYS])
  })

  it('atualizar_escala exige a citação: sem prova não se move a escala', () => {
    const escala = defs.find((d) => d.name === 'ventus_atualizar_escala')
    const schema = escala?.input_schema as unknown as SchemaObjeto
    expect(schema.required).toContain('citacao')
    // Y no es nullable: `citacao` tiene que ser string.
    expect(schema.properties['citacao']?.type).toBe('string')
  })

  it('definir_proxima_acao exige data: uma próxima ação sem data não existe', () => {
    const acao = defs.find((d) => d.name === 'ventus_definir_proxima_acao')
    const schema = acao?.input_schema as unknown as SchemaObjeto
    expect(schema.required).toContain('data')
    expect(schema.properties['data']?.type).toBe('string')
  })
})

describe('erros que guiam', () => {
  it('o alvo inexistente devolve candidatos e manda buscar, não adivinhar', () => {
    const erro = erroAlvoNaoEncontrado('Tetra', ['Tetra Pak Brasil', 'Tetrafix'])
    const texto = erro.paraModelo()
    expect(texto).toContain('COMO CORRIGIR')
    expect(texto).toContain('Tetra Pak Brasil')
    expect(erro.dados['candidatos']).toHaveLength(2)
  })

  it('o alvo ambíguo manda PERGUNTAR, nunca escolher sozinho', () => {
    const erro = erroAlvoAmbiguo('Tetra', ['Tetra Pak', 'Tetrafix'])
    expect(erro.paraModelo()).toMatch(/pergunte/i)
    expect(erro.paraModelo()).toMatch(/NÃO escolha/i)
  })

  it('o campo inválido lista os valores aceitos', () => {
    const erro = erroCampoInvalido('canal', 'pombo', ['email', 'whatsapp', 'linkedin'])
    expect(erro.paraModelo()).toContain('email, whatsapp, linkedin')
  })

  it('a falta de prova explica que quem recusa é o banco', () => {
    const texto = erroSemProva('dor').paraModelo()
    expect(texto).toMatch(/regra da prova/i)
    expect(texto).toMatch(/citação/i)
  })

  it('o gate travado diz qual escala falta e quanto', () => {
    const texto = erroGateTravado(2, [{ escala: 'dor', minimo: 5, atual: 3 }]).paraModelo()
    expect(texto).toContain('DOR 3 < 5')
    expect(texto).toMatch(/Não force a etapa/i)
  })

  it('a data inválida diz o formato e qual é hoje', () => {
    const texto = erroDataInvalida('quinta que vem', '2026-08-25').paraModelo()
    expect(texto).toContain('YYYY-MM-DD')
    expect(texto).toContain('2026-08-25')
  })
})

describe('resolverAlvo · identificadores naturais', () => {
  const alvos: AlvoDaCarteira[] = [
    { kind: 'opportunity', id: 1, nome: 'Linha 3 — fechamento', cliente: 'Tetra Pak Brasil Ltda' },
    { kind: 'opportunity', id: 2, nome: 'Venom fulfillment', cliente: 'Nike do Brasil' },
    { kind: 'lead', id: 10, nome: 'Tetrafix Embalagens', cliente: 'Tetrafix Embalagens' },
    { kind: 'lead', id: 11, nome: 'Honda Automóveis', cliente: 'Honda Automóveis' },
  ]

  it('normaliza acentos, pontuação e sufixos societários', () => {
    expect(normalizar('Tetra Pak Brasil Ltda.')).toBe('tetra pak')
    expect(normalizar('L’ORÉAL S.A.')).toBe('l oreal')
  })

  it('acha por nome exato do cliente', () => {
    expect(resolverAlvo('Nike do Brasil', alvos).id).toBe(2)
  })

  it('acha por prefixo', () => {
    expect(resolverAlvo('Honda', alvos).id).toBe(11)
  })

  it('respeita o tipo pedido: um lead não vira oportunidade', () => {
    expect(resolverAlvo('Tetrafix', alvos, 'lead').kind).toBe('lead')
    expect(() => resolverAlvo('Tetrafix', alvos, 'opportunity')).toThrow()
  })

  it('PERGUNTA quando é ambíguo em vez de escolher o primeiro', () => {
    expect(() => resolverAlvo('Tetra', alvos)).toThrowError(/casa com/)
  })

  it('não inventa um cliente que não existe', () => {
    expect(() => resolverAlvo('Ambev', alvos)).toThrowError(/Não existe/)
  })

  it('com a carteira vazia falha em vez de devolver qualquer coisa', () => {
    expect(() => resolverAlvo('Nike', [])).toThrow()
  })
})
