// src/screens/Ventus/__tests__/stream.test.ts
// El parser SSE. Es el punto donde el streaming se rompe en silencio, así que
// se testea contra los casos que un proxy móvil brasileño produce de verdad:
// bloques partidos, \r\n reescrito, comentarios de keepalive y basura.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirStreamVentus, parsearBloco } from '../stream'
import {
  ERRO_LABELS,
  mockVentus,
  origemDoErro,
  podeTentarApi,
  reiniciarBandeira,
  type VentusEvento,
  type VentusRequest,
} from '../contrato'

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


/* ══════════════════════════════════════════════════════════════════════════
   O 500 passageiro — o bug que deixou um telefone mudo por uma sessão inteira
   ══════════════════════════════════════════════════════════════════════════
   Primeiro teste em aparelho de verdade: /api/ventus devolveu 500 por alguns
   minutos e o telefone ficou no caminho local ATÉ FECHAR O APP, com sinal
   perfeito e o servidor já são. Cada teste daqui é uma das coisas que não
   pode voltar a acontecer.
   ══════════════════════════════════════════════════════════════════════════ */

/** Uma resposta SSE de verdade, com corpo streamado. */
function respostaSSE(texto: string): Response {
  const codificador = new TextEncoder()
  const corpo = new ReadableStream<Uint8Array>({
    start(controle) {
      controle.enqueue(codificador.encode(`data: ${JSON.stringify({ tipo: 'texto', delta: texto })}\n\n`))
      controle.enqueue(codificador.encode(`data: ${JSON.stringify({ tipo: 'fim', texto })}\n\n`))
      controle.close()
    },
  })
  return new Response(corpo, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function coletar(gerador: AsyncGenerator<VentusEvento>): Promise<VentusEvento[]> {
  const eventos: VentusEvento[] = []
  for await (const e of gerador) eventos.push(e)
  return eventos
}

describe('abrirStreamVentus — falha do servidor', () => {
  beforeEach(() => {
    reiniciarBandeira()
  })
  afterEach(() => {
    reiniciarBandeira()
    vi.restoreAllMocks()
  })

  it('um 500 NÃO liga o mock: a pergunta seguinte volta a bater na API', async () => {
    const chamadas: string[] = []
    const fetchImpl = vi.fn((url: string | URL | Request) => {
      chamadas.push(String(url))
      return Promise.resolve(
        chamadas.length === 1 ? new Response('boom', { status: 500 }) : respostaSSE('oi'),
      )
    }) as unknown as typeof fetch

    const primeira = await coletar(abrirStreamVentus(req('e aí'), { fetchImpl }))
    expect(primeira).toEqual([
      { tipo: 'erro', codigo: 'interno', mensagem: ERRO_LABELS.interno },
    ])

    const segunda = await coletar(abrirStreamVentus(req('e agora'), { fetchImpl }))
    // A prova: DUAS chamadas de rede. Se o latch fosse pegajoso, seria uma.
    expect(chamadas).toHaveLength(2)
    expect(segunda.some((e) => e.tipo === 'texto')).toBe(true)
  })

  it('o texto do 500 fala do SERVIDOR, nunca da conexão do vendedor', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('boom', { status: 500 })),
    ) as unknown as typeof fetch

    const eventos = await coletar(abrirStreamVentus(req('e aí'), { fetchImpl }))
    const erro = eventos[0]
    expect(erro?.tipo).toBe('erro')
    if (erro?.tipo !== 'erro') return
    expect(erro.mensagem).toContain('servidor do Ventus')
    expect(erro.mensagem).not.toContain('sem conexão')
    expect(erro.mensagem).not.toContain('Sem conexão')
    // E a bolha marca «servidor», não «sem rede».
    expect(origemDoErro(erro.codigo)).toBe('servidor')
  })

  it('duas falhas seguidas abrem o backoff — e o backoff expira sozinho', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('boom', { status: 500 })),
    ) as unknown as typeof fetch

    await coletar(abrirStreamVentus(req('um'), { fetchImpl }))
    await coletar(abrirStreamVentus(req('dois'), { fetchImpl }))
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    // Terceira pergunta dentro do minuto: nem sai do telefone, e responde já.
    const terceira = await coletar(abrirStreamVentus(req('três'), { fetchImpl }))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(terceira[0]?.tipo).toBe('erro')

    // Passado o minuto, volta a tentar SOZINHO. Nada de reinstalar o app.
    const agora = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(agora + 61_000)
    expect(podeTentarApi()).toBe(true)
  })

  it('um 404 (endpoint que não existe) SIM liga o mock — é a única porta', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('nope', { status: 404 })),
    ) as unknown as typeof fetch

    const eventos = await coletar(abrirStreamVentus(req('e aí'), { fetchImpl }))
    expect(eventos[0]?.tipo).toBe('abertura')
    expect(eventos.at(-1)?.tipo).toBe('fim')

    // E a partir daí nem toca a rede: o endpoint não existe, insistir é inútil.
    const segunda = await coletar(abrirStreamVentus(req('de novo'), { fetchImpl }))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(segunda.at(-1)?.tipo).toBe('fim')
  })

  it('um 401 não conta como servidor com problemas: não arma backoff', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('no', { status: 401 })),
    ) as unknown as typeof fetch

    await coletar(abrirStreamVentus(req('um'), { fetchImpl }))
    await coletar(abrirStreamVentus(req('dois'), { fetchImpl }))
    await coletar(abrirStreamVentus(req('três'), { fetchImpl }))
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(podeTentarApi()).toBe(true)
  })

  it('uma resposta boa apaga a racha: o backoff não sobrevive ao servidor curado', async () => {
    let n = 0
    const fetchImpl = vi.fn(() => {
      n += 1
      return Promise.resolve(n <= 2 ? new Response('boom', { status: 500 }) : respostaSSE('ok'))
    }) as unknown as typeof fetch

    await coletar(abrirStreamVentus(req('um'), { fetchImpl }))
    expect(podeTentarApi()).toBe(true)
    await coletar(abrirStreamVentus(req('dois'), { fetchImpl }))
    expect(podeTentarApi()).toBe(false)

    // Passa o minuto, tenta, e agora o servidor está são.
    const agora = Date.now()
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(agora + 61_000)
    await coletar(abrirStreamVentus(req('três'), { fetchImpl }))
    relogio.mockRestore()
    expect(podeTentarApi()).toBe(true)
  })
})
