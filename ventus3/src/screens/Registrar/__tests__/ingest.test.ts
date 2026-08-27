// src/screens/Registrar/__tests__/ingest.test.ts
// O cliente de /api/ingest sob um servidor que falha e depois se cura.
//
// O bug de campo: «o áudio não transcreve». O endpoint devolveu 500 por uns
// minutos e o telefone ficou preso ao caminho offline — com sinal — até o app
// ser reinstalado. Aqui se prova que a próxima nota de voz volta a tentar.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data', () => ({
  sessaoAtual: () => Promise.resolve({ access_token: 'token-de-teste' }),
  talvezOnline: () => true,
}))

const {
  AVISO_SEM_REDE,
  AVISO_SERVIDOR,
  causaDaFalha,
  chamarIngest,
} = await import('../ingest')
const { ErroIngest, mockPorFallbackAtivo, podeTentarApi, reiniciarBandeira } = await import(
  '../contrato'
)
const { rascunhoOffline } = await import('../rascunho')

import { CONTRATO_VERSAO, type IngestMeta } from '../contrato'
import type { ContextoRascunho } from '../rascunho'

const META: IngestMeta = {
  versao: CONTRATO_VERSAO,
  vendor: 'Renata',
  clientUuid: 'uuid-1',
  fonte: 'audio',
  capturadoEm: '2026-08-27T12:00:00.000Z',
  duracaoSeg: 12,
  carteira: [{ kind: 'opportunity', id: 1, nome: 'Linha 4', cliente: 'Tetra Pak' }],
  hoje: '2026-08-27',
}

function respostaOk(): Response {
  return new Response(
    JSON.stringify({
      clientUuid: META.clientUuid,
      extracao: {
        candidatos: [],
        tipo: 'call',
        resumo: 'ok',
        resultado: null,
        proximaAcao: null,
        proximaAcaoData: null,
        escalas: [],
        contatos: [],
        metodologia: null,
        sinais: [],
      },
      transcricao: null,
      aviso: null,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

let fetchFalso: ReturnType<typeof vi.fn>

beforeEach(() => {
  reiniciarBandeira()
  fetchFalso = vi.fn()
  globalThis.fetch = fetchFalso as unknown as typeof fetch
})

afterEach(() => {
  reiniciarBandeira()
  vi.restoreAllMocks()
})

describe('chamarIngest — o servidor com problemas', () => {
  it('um 500 não liga o mock: a próxima nota volta a bater na API', async () => {
    fetchFalso.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(chamarIngest({ meta: META })).rejects.toBeInstanceOf(ErroIngest)
    expect(mockPorFallbackAtivo()).toBe(false)

    fetchFalso.mockResolvedValueOnce(respostaOk())
    const r = await chamarIngest({ meta: { ...META, clientUuid: META.clientUuid } })
    expect(r.clientUuid).toBe(META.clientUuid)
    expect(fetchFalso).toHaveBeenCalledTimes(2)
  })

  it('um 501 SIM liga o mock: o endpoint não existe neste deploy', async () => {
    fetchFalso.mockResolvedValueOnce(new Response('nope', { status: 501 }))
    await chamarIngest({ meta: META })
    expect(mockPorFallbackAtivo()).toBe(true)
    // E já não toca a rede: insistir num endpoint que não existe é inútil.
    await chamarIngest({ meta: META })
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it('um 404 conta igual que um 501 — a função nem foi publicada', async () => {
    fetchFalso.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await chamarIngest({ meta: META })
    expect(mockPorFallbackAtivo()).toBe(true)
  })

  it('duas falhas seguidas abrem o backoff, e ele não é permanente', async () => {
    fetchFalso.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(chamarIngest({ meta: META })).rejects.toThrow()
    await expect(chamarIngest({ meta: META })).rejects.toThrow()
    expect(fetchFalso).toHaveBeenCalledTimes(2)

    // Terceira tentativa dentro do minuto: responde na hora, sem gastar 45 s.
    await expect(chamarIngest({ meta: META })).rejects.toThrow(AVISO_SERVIDOR)
    expect(fetchFalso).toHaveBeenCalledTimes(2)

    const agora = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(agora + 61_000)
    expect(podeTentarApi()).toBe(true)
  })

  it('a mensagem do 500 fala do servidor e nunca da rede do vendedor', async () => {
    fetchFalso.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const erro = await chamarIngest({ meta: META }).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroIngest)
    if (!(erro instanceof ErroIngest)) return
    expect(causaDaFalha(erro)).toBe('servidor')
  })

  it('um fetch que nem sai, com o aparelho online, é problema do servidor', async () => {
    fetchFalso.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const erro = await chamarIngest({ meta: META }).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroIngest)
    if (!(erro instanceof ErroIngest)) return
    expect(erro.message).toBe(AVISO_SERVIDOR)
    expect(erro.recuperavel).toBe(true)
    expect(causaDaFalha(erro)).toBe('servidor')
  })
})

describe('causaDaFalha — de quem é a culpa', () => {
  it('um 503 é do servidor', () => {
    expect(causaDaFalha(new ErroIngest('x', 'interno', true, 503))).toBe('servidor')
  })

  it('um 400 não é do servidor nem da rede: fica em sem_rede, que é o texto neutro', () => {
    expect(causaDaFalha(new ErroIngest('x', 'audio_vazio', false, 400))).toBe('sem_rede')
  })

  it('sem erro nenhum, assume falta de rede', () => {
    expect(causaDaFalha(null)).toBe('sem_rede')
  })
})

describe('o rascunho carrega a causa até a tela', () => {
  const ctx: ContextoRascunho = {
    clientUuid: 'uuid-1',
    fonte: 'audio',
    duracaoSeg: 10,
    alvoInicial: null,
    alvos: [],
    papeisOcupados: new Set<string>(),
    simulado: false,
    textoOriginal: null,
  }

  it('marca «servidor» quando o problema foi um 500', () => {
    const r = rascunhoOffline(ctx, AVISO_SERVIDOR, 'servidor')
    expect(r.causa).toBe('servidor')
    expect(r.pendenteDeTranscricao).toBe(true)
  })

  it('marca «sem_rede» por padrão — o caminho do galpão sem sinal', () => {
    const r = rascunhoOffline(ctx, AVISO_SEM_REDE)
    expect(r.causa).toBe('sem_rede')
  })
})
