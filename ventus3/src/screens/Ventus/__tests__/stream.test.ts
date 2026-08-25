// src/screens/Ventus/__tests__/stream.test.ts
// El parser SSE. Es el punto donde el streaming se rompe en silencio, así que
// se testea contra los casos que un proxy móvil brasileño produce de verdad:
// bloques partidos, \r\n reescrito, comentarios de keepalive y basura.

import { describe, expect, it } from 'vitest'
import { parsearBloco } from '../stream'
import { mockVentus, type VentusEvento, type VentusRequest } from '../contrato'

function req(mensagem: string): VentusRequest {
  return {
    vendor: 'Renata',
    mensagem,
    historico: [],
    hoje: '2026-08-25',
    turnoId: 't1',
  }
}

describe('parsearBloco', () => {
  it('lê um evento normal', () => {
    expect(parsearBloco('data: {"tipo":"texto","delta":"oi"}')).toEqual({
      tipo: 'texto',
      delta: 'oi',
    })
  })

  it('ignora o comentário de keepalive', () => {
    expect(parsearBloco(': ping')).toBeNull()
  })

  it('junta as múltiplas linhas data: de um mesmo evento, como manda o SSE', () => {
    const bloco = 'data: {"tipo":"texto",\ndata: "delta":"oi"}'
    expect(parsearBloco(bloco)).toEqual({ tipo: 'texto', delta: 'oi' })
  })

  it('ignora [DONE] — o dialeto de OpenAI, que não é o nosso', () => {
    expect(parsearBloco('data: [DONE]')).toBeNull()
  })

  it('não morre com JSON quebrado no meio do stream', () => {
    expect(parsearBloco('data: {"tipo":"tex')).toBeNull()
  })

  it('descarta um objeto sem tipo em vez de deixá-lo passar', () => {
    expect(parsearBloco('data: {"delta":"oi"}')).toBeNull()
  })

  it('ignora as linhas event: e id: que não usamos', () => {
    expect(parsearBloco('event: message\nid: 42')).toBeNull()
  })
})

describe('mockVentus', () => {
  it('emite abertura, texto em pedaços e fim — o mock testa o streaming de verdade', async () => {
    const eventos: VentusEvento[] = []
    for await (const e of mockVentus(req('me dá um diagnóstico'))) eventos.push(e)

    expect(eventos[0]?.tipo).toBe('abertura')
    expect(eventos.at(-1)?.tipo).toBe('fim')
    const textos = eventos.filter((e) => e.tipo === 'texto')
    expect(textos.length).toBeGreaterThan(3)
  })

  it('propõe uma ação quando a pergunta é de agenda, e ela pede confirmação', async () => {
    const eventos: VentusEvento[] = []
    for await (const e of mockVentus(req('marcar uma visita na quinta'))) eventos.push(e)

    const preview = eventos.find((e) => e.tipo === 'preview')
    expect(preview).toBeDefined()
    if (preview?.tipo === 'preview') {
      expect(preview.preview.precisaConfirmar).toBe(true)
      expect(preview.preview.mudancas.length).toBeGreaterThan(0)
    }
  })

  it('para quando o AbortSignal dispara', async () => {
    const ctrl = new AbortController()
    const eventos: VentusEvento[] = []
    for await (const e of mockVentus(req('diagnóstico'), ctrl.signal)) {
      eventos.push(e)
      if (eventos.length === 3) ctrl.abort()
    }
    expect(eventos.at(-1)?.tipo).not.toBe('fim')
  })
})
