// api/__tests__/cors.test.ts
// El CORS de los endpoints, con foco en la trampa que estaba armada.
//
// ALLOWED_ORIGIN lista los dominios de la app. Lo que nunca va a estar en esa
// lista es la URL larga de cada deploy de Vercel
// (`ventus3-abc123-equipe.vercel.app`), que es justamente por donde entra el
// teléfono del dueño cuando prueba un preview. Hoy no rompe porque un pedido
// same-origin no exige CORS; el día que algo mande `Origin` —un header nuevo
// que dispare preflight, un fetch con mode:'cors'— el mismo dominio que sirve
// la app se queda sin header y el teléfono vuelve a quedarse mudo.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aplicarCors, ehMesmaOrigem, resolverOrigem, type ApiRequest, type ApiResponse } from '../_lib/http.js'

function pedido(headers: Record<string, string>): ApiRequest {
  return { method: 'POST', headers, query: {} }
}

/** Respuesta de mentira que sólo recuerda los headers. */
function resposta(): ApiResponse & { cabecalhos: Record<string, string | string[]> } {
  const cabecalhos: Record<string, string | string[]> = {}
  return {
    cabecalhos,
    status() {
      return this as unknown as ApiResponse
    },
    json() {},
    send() {},
    end() {},
    setHeader(nome: string, valor: string | string[]) {
      cabecalhos[nome] = valor
    },
  }
}

const ORIGINAL = process.env['ALLOWED_ORIGIN']

beforeEach(() => {
  process.env['ALLOWED_ORIGIN'] = 'https://ventus.ventapel.com.br'
})

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['ALLOWED_ORIGIN']
  else process.env['ALLOWED_ORIGIN'] = ORIGINAL
})

describe('resolverOrigem', () => {
  it('devolve o origem listado', () => {
    const req = pedido({ origin: 'https://ventus.ventapel.com.br', host: 'ventus.ventapel.com.br' })
    expect(resolverOrigem(req)).toBe('https://ventus.ventapel.com.br')
  })

  it('sem Origin, devolve o primeiro permitido', () => {
    expect(resolverOrigem(pedido({ host: 'ventus.ventapel.com.br' }))).toBe(
      'https://ventus.ventapel.com.br',
    )
  })

  it('a URL longa do deploy é aceita quando é o PRÓPRIO host que atende', () => {
    const req = pedido({
      origin: 'https://ventus3-abc123-equipe.vercel.app',
      host: 'ventus3-abc123-equipe.vercel.app',
    })
    expect(resolverOrigem(req)).toBe('https://ventus3-abc123-equipe.vercel.app')
  })

  it('x-forwarded-host manda sobre host — é o que o proxy escreve', () => {
    const req = pedido({
      origin: 'https://ventus3.vercel.app',
      'x-forwarded-host': 'ventus3.vercel.app',
      host: 'interno.vercel-runtime.local',
    })
    expect(resolverOrigem(req)).toBe('https://ventus3.vercel.app')
  })

  it('um site alheio segue bloqueado: fail-closed de verdade', () => {
    const req = pedido({ origin: 'https://evil.example.com', host: 'ventus3.vercel.app' })
    expect(resolverOrigem(req)).toBeNull()
  })

  it('um origem http contra um host servido por https NÃO é a mesma origem', () => {
    const req = pedido({
      origin: 'http://ventus3.vercel.app',
      host: 'ventus3.vercel.app',
      'x-forwarded-proto': 'https',
    })
    expect(resolverOrigem(req)).toBeNull()
  })

  it('em localhost, http contra http é a mesma origem — o dev server funciona', () => {
    const req = pedido({
      origin: 'http://localhost:5173',
      host: 'localhost:5173',
      'x-forwarded-proto': 'http',
    })
    expect(resolverOrigem(req)).toBe('http://localhost:5173')
  })

  it('um Origin que não é URL não passa por acidente', () => {
    const req = pedido({ origin: 'null', host: 'ventus3.vercel.app' })
    expect(resolverOrigem(req)).toBeNull()
  })

  it('sem host no pedido, só vale a lista', () => {
    expect(ehMesmaOrigem(pedido({ origin: 'https://x.test' }), 'https://x.test')).toBe(false)
  })

  it('x-forwarded-host com vários saltos usa o primeiro', () => {
    const req = pedido({
      origin: 'https://ventus3.vercel.app',
      'x-forwarded-host': 'ventus3.vercel.app, interno.local',
    })
    expect(resolverOrigem(req)).toBe('https://ventus3.vercel.app')
  })
})

describe('aplicarCors', () => {
  it('escreve o header para o próprio deploy e marca Vary: Origin', () => {
    const req = pedido({
      origin: 'https://ventus3-abc123-equipe.vercel.app',
      host: 'ventus3-abc123-equipe.vercel.app',
    })
    const res = resposta()
    aplicarCors(req, res)
    expect(res.cabecalhos['Access-Control-Allow-Origin']).toBe(
      'https://ventus3-abc123-equipe.vercel.app',
    )
    expect(res.cabecalhos['Vary']).toBe('Origin')
  })

  it('NÃO escreve o header para um origem alheio', () => {
    const req = pedido({ origin: 'https://evil.example.com', host: 'ventus3.vercel.app' })
    const res = resposta()
    aplicarCors(req, res)
    expect(res.cabecalhos['Access-Control-Allow-Origin']).toBeUndefined()
  })
})
