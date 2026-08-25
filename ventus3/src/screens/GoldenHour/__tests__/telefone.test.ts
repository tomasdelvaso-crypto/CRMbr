// src/screens/GoldenHour/__tests__/telefone.test.ts
//
// POR QUÉ EXISTE: un link de WhatsApp mal armado no falla ruidosamente. Abre
// wa.me, muestra «número de telefone inválido» y el vendedor pierde el toque
// sin entender por qué. En la base de Ventapel conviven celulares con y sin el
// noveno dígito, con y sin DDD, con y sin +55 — y la Golden Hour no es el
// momento de depurar un teléfono.

import { describe, expect, it } from 'vitest'
import type { Lead } from '@/core'
import { linkDoCanal, linkLinkedIn, linksDoContato, normalizarTelefoneBr } from '../telefone'

function lead(parcial: Partial<Lead> = {}): Lead {
  return {
    id: 1,
    vendor: 'Victor Hugo',
    source: null,
    company_name: 'Vale Embalagens',
    company_domain: null,
    contact_name: 'Ana Souza',
    contact_title: 'Gerente de Operações',
    contact_email: null,
    contact_phone: null,
    contact_whatsapp: null,
    contact_linkedin: null,
    active_channels: null,
    stage: '1b',
    status: 'active',
    touchpoints_count: 1,
    next_touchpoint_date: null,
    last_touchpoint_date: null,
    opportunity_id: null,
    notes: null,
    archived_at: null,
    recycle_after: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...parcial,
  }
}

describe('normalizarTelefoneBr', () => {
  it('acepta las formas que la gente escribe de verdad', () => {
    const esperado = '+5511987654321'
    for (const bruto of [
      '(11) 98765-4321',
      '11987654321',
      '+55 11 98765 4321',
      '55 11 98765-4321',
      '0055 11 987654321',
      '011 98765 4321',
      ' 11 9 8765 4321 ',
    ]) {
      expect(normalizarTelefoneBr(bruto)?.e164, bruto).toBe(esperado)
    }
  })

  it('devuelve el noveno dígito a los celulares viejos', () => {
    const tel = normalizarTelefoneBr('(11) 8765-4321')
    expect(tel?.e164).toBe('+5511987654321')
    expect(tel?.corrigido).toBe(true)
    expect(tel?.celular).toBe(true)
  })

  it('NO le agrega el 9 a un fijo', () => {
    const tel = normalizarTelefoneBr('(11) 3456-7890')
    expect(tel?.e164).toBe('+551134567890')
    expect(tel?.corrigido).toBe(false)
    expect(tel?.celular).toBe(false)
  })

  it('no confunde el DDD 55 con el código de país', () => {
    // 11 dígitos que empiezan con 55 son un celular de Rio Grande do Sul.
    expect(normalizarTelefoneBr('55987654321')?.e164).toBe('+5555987654321')
  })

  it('completa el DDD solo cuando se lo damos explícitamente', () => {
    expect(normalizarTelefoneBr('98765-4321')).toBeNull()
    expect(normalizarTelefoneBr('98765-4321', 11)?.e164).toBe('+5511987654321')
  })

  it('rechaza lo que no puede garantizar', () => {
    for (const basura of ['', null, undefined, 'sem telefone', '123', '10987654321', '2098765432']) {
      expect(normalizarTelefoneBr(basura), String(basura)).toBeNull()
    }
  })

  it('el cero de operadora no se confunde con un DDD', () => {
    // 019 = Campinas marcado con código de operadora, y el celular sin el 9.
    expect(normalizarTelefoneBr('01987654321')?.e164).toBe('+5519987654321')
  })

  it('formatea para mostrar sin perder el dato', () => {
    expect(normalizarTelefoneBr('11987654321')?.bonito).toBe('(11) 98765-4321')
    expect(normalizarTelefoneBr('1134567890')?.bonito).toBe('(11) 3456-7890')
  })
})

describe('linkDoCanal', () => {
  it('arma wa.me con el número normalizado y el rascunho precargado', () => {
    const href = linkDoCanal('whatsapp', lead({ contact_whatsapp: '(11) 8765-4321' }), 'Olá Ana')
    expect(href).toBe('https://wa.me/5511987654321?text=Ol%C3%A1%20Ana')
  })

  it('no ofrece WhatsApp para un fijo: el chat no existiría', () => {
    expect(linkDoCanal('whatsapp', lead({ contact_phone: '(11) 3456-7890' }))).toBeNull()
  })

  it('cae al teléfono cuando no hay whatsapp, y viceversa', () => {
    expect(linkDoCanal('phone', lead({ contact_whatsapp: '11987654321' }))).toBe(
      'tel:+5511987654321',
    )
  })

  it('mailto lleva asunto y cuerpo', () => {
    const href = linkDoCanal('email', lead({ contact_email: 'ana@vale.com.br' }), 'Oi')
    expect(href).toContain('mailto:ana@vale.com.br')
    expect(href).toContain('subject=Ventapel%20%C2%B7%20Vale%20Embalagens')
    expect(href).toContain('body=Oi')
  })

  it('acepta el LinkedIn en las tres formas en que está cargado', () => {
    expect(linkLinkedIn('https://www.linkedin.com/in/ana-souza')).toBe(
      'https://www.linkedin.com/in/ana-souza',
    )
    expect(linkLinkedIn('in/ana-souza')).toBe('https://www.linkedin.com/in/ana-souza')
    expect(linkLinkedIn('ana-souza')).toBe('https://www.linkedin.com/in/ana-souza')
    expect(linkLinkedIn('  ')).toBeNull()
  })

  it('un lead sin ningún dato no produce botones muertos', () => {
    expect(linksDoContato(lead())).toEqual([])
  })

  it('marca como externos solo los que se llevarían la PWA', () => {
    const links = linksDoContato(
      lead({
        contact_whatsapp: '11987654321',
        contact_email: 'ana@vale.com.br',
        contact_linkedin: 'ana-souza',
      }),
    )
    expect(links.map((l) => l.canal)).toEqual(['whatsapp', 'phone', 'email', 'linkedin'])
    expect(links.filter((l) => l.externo).map((l) => l.canal)).toEqual(['whatsapp', 'linkedin'])
  })
})
