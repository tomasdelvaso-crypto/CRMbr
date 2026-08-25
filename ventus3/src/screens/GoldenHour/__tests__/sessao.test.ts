// src/screens/GoldenHour/__tests__/sessao.test.ts
//
// POR QUÉ EXISTE: la Hora Cheia sella la racha, y la racha es el hábito. Si
// el resumen de la sesión miente —cuenta como conversa un «ninguém atendeu»,
// o regala 60 minutos a una app que quedó abierta toda la tarde— la mecánica
// entera premia actividad vacía, que es justo lo que el diseño evita.

import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import {
  DEBRIEF_VAZIO,
  debriefCompleto,
  formatarRelogio,
  metaSugerida,
  resumir,
  sessaoNova,
  textoDeSaida,
  type SessaoLocal,
} from '../sessao'
import { montarFila } from '../fila'
import type { Lead } from '@/core'

const INICIO = '2026-08-25T19:00:00.000Z'
const INICIO_MS = new Date(INICIO).getTime()

function sessao(parcial: Partial<SessaoLocal> = {}): SessaoLocal {
  return {
    ...sessaoNova('Victor Hugo', '2026-08-25', 8, [1, 2, 3]),
    fase: 'foco',
    iniciadaEm: INICIO,
    fimPrevisto: new Date(INICIO_MS + 60 * 60_000).toISOString(),
    ...parcial,
  }
}

function toque(resultado: SessaoLocal['registros'][number]['resultado'], leadId = 1) {
  return {
    leadId,
    empresa: `Empresa ${leadId}`,
    contato: null,
    canal: 'whatsapp' as const,
    resultado,
    em: INICIO,
  }
}

describe('resumir', () => {
  it('cuenta conversa real solo cuando el otro contestó', () => {
    const r = resumir(
      sessao({
        registros: [
          toque('no_response', 1),
          toque('no_response', 2),
          toque('interested', 3),
          toque('not_interested', 4),
        ],
      }),
      INICIO_MS + 45 * 60_000,
    )
    expect(r.toques).toBe(4)
    // interested y not_interested contestaron; los dos no_response, no.
    expect(r.conversas).toBe(2)
    expect(r.reunioes).toBe(0)
  })

  it('no regala minutos a una app que quedó abierta', () => {
    // Cuatro horas después de arrancar un bloque de 60 minutos.
    const r = resumir(sessao(), INICIO_MS + 4 * 60 * 60_000)
    expect(r.duracaoMin).toBe(60)
    expect(r.restanteMs).toBe(0)
    expect(r.esgotado).toBe(true)
  })

  it('la Hora Cheia exige las cuatro cosas', () => {
    const base = sessao({
      metaToques: 3,
      registros: [toque('no_response', 1), toque('interested', 2), toque('meeting_scheduled', 3)],
      debrief: { melhor_conversa: 'Vale', objecao_frequente: 'Preço', o_que_muda: 'Ligar cedo' },
    })
    const cheia = resumir(base, INICIO_MS + 41 * 60_000)
    expect(cheia.avaliacao.cheia).toBe(true)
    expect(cheia.reunioes).toBe(1)

    // Los mismos toques a los 39 minutos ya no sellan.
    expect(resumir(base, INICIO_MS + 39 * 60_000).avaliacao.cheia).toBe(false)
    // Ni sin debrief.
    expect(
      resumir({ ...base, debrief: { ...DEBRIEF_VAZIO } }, INICIO_MS + 41 * 60_000).avaliacao.cheia,
    ).toBe(false)
    // Ni discando números muertos toda la hora.
    expect(
      resumir(
        { ...base, registros: [toque('no_response', 1), toque('no_response', 2), toque('no_response', 3)] },
        INICIO_MS + 50 * 60_000,
      ).avaliacao.cheia,
    ).toBe(false)
  })

  it('las empresas del debrief salen de las conversas reales, no de todos los toques', () => {
    const r = resumir(
      sessao({ registros: [toque('no_response', 1), toque('interested', 2)] }),
      INICIO_MS + 10 * 60_000,
    )
    expect(r.empresasComConversa).toEqual(['Empresa 2'])
  })
})

describe('debrief y textos', () => {
  it('el debrief está hecho solo con las tres respuestas', () => {
    expect(debriefCompleto(DEBRIEF_VAZIO)).toBe(false)
    expect(
      debriefCompleto({ melhor_conversa: 'Vale', objecao_frequente: '  ', o_que_muda: 'x' }),
    ).toBe(false)
    expect(
      debriefCompleto({ melhor_conversa: 'Vale', objecao_frequente: 'Preço', o_que_muda: 'x' }),
    ).toBe(true)
  })

  it('el reloj nunca muestra un negativo', () => {
    expect(formatarRelogio(0)).toBe('00:00')
    expect(formatarRelogio(-5000)).toBe('00:00')
    expect(formatarRelogio(22 * 60_000)).toBe('22:00')
  })

  it('el aviso de salida dice cuánto falta, como pide el plano', () => {
    expect(textoDeSaida(22 * 60_000)).toBe('Faltam 22 min.')
    expect(textoDeSaida(60_000)).toBe('Falta 1 minuto.')
    expect(textoDeSaida(0)).toContain('fechamento')
  })

  it('la meta sugerida respeta el piso de la rampa y el techo de 12', () => {
    expect(metaSugerida(0)).toBe(4)
    expect(metaSugerida(2)).toBe(4)
    expect(metaSugerida(9)).toBe(9)
    expect(metaSugerida(40)).toBe(12)
  })
})

/* ── La fila congelada ───────────────────────────────────────────────────── */

function lead(id: number, parcial: Partial<Lead> = {}): Lead {
  return {
    id,
    vendor: 'Victor Hugo',
    source: null,
    company_name: `Empresa ${id}`,
    company_domain: null,
    contact_name: 'Ana',
    contact_title: null,
    contact_email: null,
    contact_phone: null,
    contact_whatsapp: '11987654321',
    contact_linkedin: null,
    active_channels: null,
    stage: '1a',
    status: 'active',
    touchpoints_count: 0,
    next_touchpoint_date: null,
    last_touchpoint_date: null,
    opportunity_id: null,
    notes: null,
    archived_at: null,
    recycle_after: null,
    created_at: INICIO,
    updated_at: INICIO,
    ...parcial,
  }
}

describe('montarFila', () => {
  it('respeta el orden congelado aunque los leads lleguen en otro', () => {
    const itens = montarFila([lead(3), lead(1), lead(2)], [1, 2, 3], [])
    expect(itens.map((i) => i.lead.id)).toEqual([1, 2, 3])
  })

  it('el paso y el rascunho salen del contador de toques del lead', () => {
    const [tp1, tp3] = montarFila([lead(1), lead(2, { touchpoints_count: 2 })], [1, 2], [])
    expect(tp1?.passo.tp).toBe(1)
    expect(tp1?.passo.channel).toBe('linkedin')
    expect(tp3?.passo.tp).toBe(3)
    expect(tp3?.passo.channel).toBe('email')
    expect(tp3?.rascunho).toContain('Empresa 2')
  })

  it('cae a un canal ejecutable cuando el previsto no tiene por dónde', () => {
    // TP1 pide LinkedIn y el lead solo tiene WhatsApp: el botón no puede
    // quedar muerto en el medio de la hora.
    const [item] = montarFila([lead(1)], [1], [])
    expect(item?.passo.channel).toBe('linkedin')
    expect(item?.canal).toBe('whatsapp')
  })

  it('un lead que ya no está en Dexie no rompe la fila', () => {
    expect(montarFila([lead(1)], [1, 99], []).map((i) => i.lead.id)).toEqual([1])
  })

  it('ata cada item a su entrada aprobada la víspera', () => {
    const itens = montarFila(
      [lead(1)],
      [1],
      [
        {
          uid: 'Victor Hugo:2026-08-25:1',
          vendor: 'Victor Hugo',
          day: '2026-08-25',
          lead_id: 1,
          ordem: 0,
          empresa: 'Empresa 1',
          canal_sugerido: 'linkedin',
          estado: 'pendente',
        },
      ],
    )
    expect(itens[0]?.entradaUid).toBe('Victor Hugo:2026-08-25:1')
  })
})
