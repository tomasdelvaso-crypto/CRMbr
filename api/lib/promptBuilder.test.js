import { describe, it, expect } from 'vitest'
import PromptBuilder from './promptBuilder.js'

describe('PromptBuilder — construcción y encadenamiento', () => {
  it('build() vacío devuelve string vacío y 0 secciones', () => {
    const b = new PromptBuilder()
    expect(b.build()).toBe('')
    expect(b.getSectionCount()).toBe(0)
  })

  it('addSystemRole agrega la persona "Ventus" y es encadenable', () => {
    const b = new PromptBuilder()
    const ret = b.addSystemRole()
    expect(ret).toBe(b) // encadenable
    expect(b.getSectionCount()).toBe(1)
    expect(b.build()).toContain('Ventus')
    expect(b.build()).toContain('PPVVCC')
  })

  it('estimateTokens crece con el contenido', () => {
    const empty = new PromptBuilder()
    const full = new PromptBuilder().addSystemRole()
    expect(empty.estimateTokens()).toBe(0)
    expect(full.estimateTokens()).toBeGreaterThan(0)
  })
})

describe('PromptBuilder — guards de secciones vacías', () => {
  it('addOpportunityContext no agrega nada si opp es null', () => {
    const b = new PromptBuilder().addOpportunityContext(null)
    expect(b.getSectionCount()).toBe(0)
  })

  it('addContacts no agrega sección si no hay contactos', () => {
    const b = new PromptBuilder().addContacts({})
    expect(b.getSectionCount()).toBe(0)
  })

  it('addContacts agrega solo los contactos presentes', () => {
    const b = new PromptBuilder().addContacts({
      power_sponsor: 'Ana',
      influencer: 'Beto',
    })
    const out = b.build()
    expect(out).toContain('Ana')
    expect(out).toContain('Beto')
    expect(out).not.toContain('Sponsor (Patrocinador)')
  })

  it('addScalesAnalysis ignora análisis sin opportunity', () => {
    expect(new PromptBuilder().addScalesAnalysis(null).getSectionCount()).toBe(0)
    expect(new PromptBuilder().addScalesAnalysis({}).getSectionCount()).toBe(0)
  })

  it('addAlerts limita a los 3 primeros', () => {
    const alerts = [
      { message: 'a1' },
      { message: 'a2' },
      { message: 'a3' },
      { message: 'a4' },
    ]
    const out = new PromptBuilder().addAlerts({ alerts }).build()
    expect(out).toContain('a1')
    expect(out).toContain('a3')
    expect(out).not.toContain('a4')
  })
})

describe('PromptBuilder — historial de actividades', () => {
  it('no agrega nada si todas las actividades son "expirado"', () => {
    const activities = [
      { result: 'expirado', description: 'x' },
      { result: 'expirado', description: 'y' },
    ]
    const b = new PromptBuilder().addActivityHistory(activities)
    expect(b.getSectionCount()).toBe(0)
  })

  it('incluye las reglas absolutas cuando hay actividades reales', () => {
    const activities = [
      { result: 'positivo', next_action_done: true, description: 'Ligou pro Paulo', created_at: '2026-06-01' },
    ]
    const out = new PromptBuilder().addActivityHistory(activities).build()
    expect(out).toContain('REGRAS ABSOLUTAS SOBRE O HISTÓRICO')
    expect(out).toContain('Ligou pro Paulo')
  })
})

describe('PromptBuilder — plano de ações', () => {
  it('addActionPlanRequest emite el esquema JSON esperado', () => {
    const out = new PromptBuilder().addActionPlanRequest(1).build()
    expect(out).toContain('"actions"')
    expect(out).toContain('target_scale')
    expect(out).toContain('draft_content')
    expect(out).toContain('"diagnosis"')
  })

  it('el texto se adapta a 1 o 2 acciones', () => {
    expect(new PromptBuilder().addActionPlanRequest(1).build()).toContain('1 ação concreta')
    expect(new PromptBuilder().addActionPlanRequest(2).build()).toContain('até 2 ações concretas')
  })
})

describe('PromptBuilder — pregunta del vendedor', () => {
  it('addFinalInstructions incluye la pregunta si se registró', () => {
    const out = new PromptBuilder()
      .addUserQuestion('Como avanço esse deal?')
      .addFinalInstructions()
      .build()
    expect(out).toContain('PERGUNTA DO VENDEDOR')
    expect(out).toContain('Como avanço esse deal?')
  })

  it('addFinalInstructions sin pregunta no incluye el bloque de pergunta', () => {
    const out = new PromptBuilder().addFinalInstructions().build()
    expect(out).not.toContain('PERGUNTA DO VENDEDOR')
  })
})
