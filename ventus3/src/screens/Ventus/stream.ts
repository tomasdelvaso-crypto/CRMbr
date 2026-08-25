// src/screens/Ventus/stream.ts
// El cliente SSE de POST /api/ventus.
//
// Por qué fetch + ReadableStream y no EventSource: EventSource solo hace GET,
// no manda Authorization y no acepta cuerpo. El turno del chat necesita las
// tres cosas.
//
// Detalles que hacen que esto no se cuelgue en un celular brasileño:
//  · el parser acumula por bloques `\n\n`, nunca asume que un chunk de red
//    coincide con un evento
//  · `\r\n` se normaliza: algunos proxies lo reescriben
//  · timeout de INACTIVIDAD, no de duración total. Una respuesta larga es
//    legítima; 25 s sin un solo byte no lo es. Por eso el servidor manda ping.
//  · el AbortSignal de quien llama corta el stream de verdad (el vendedor
//    cerró el sheet), y el `reader.cancel()` libera la conexión.

import { sessaoAtual, talvezOnline } from '@/data'
import {
  ativarMockPorFallback,
  ErroVentus,
  mockVentus,
  modoMock,
  VENTUS_FEEDBACK_PATH,
  VENTUS_PATH,
  type VentusEvento,
  type VentusFeedback,
  type VentusRequest,
} from './contrato'

/** Sin un byte durante este tiempo, se corta. El servidor manda ping cada 15 s. */
export const INATIVIDADE_MS = 25_000

function base(): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  const url = env['VITE_API_BASE_URL']
  return url && url !== '' ? url.replace(/\/$/, '') : ''
}

/** Traduce un status HTTP al código de error que la pantalla sabe mostrar. */
function codigoDeStatus(status: number): ErroVentus['codigo'] {
  if (status === 401 || status === 403) return 'sem_sessao'
  if (status === 404 || status === 501) return 'nao_implementado'
  if (status === 429) return 'limite_de_uso'
  if (status === 408 || status === 504) return 'timeout'
  return 'interno'
}

/** Un bloque SSE → nuestro evento. Devuelve null para comentarios y basura. */
export function parsearBloco(bloco: string): VentusEvento | null {
  const linhas = bloco.split('\n')
  const dados: string[] = []
  for (const linha of linhas) {
    // ':' inicial es un comentario SSE — así se manda el keepalive crudo.
    if (linha.startsWith(':')) continue
    if (!linha.startsWith('data:')) continue
    dados.push(linha.slice(5).trimStart())
  }
  if (dados.length === 0) return null
  const bruto = dados.join('\n')
  if (bruto === '' || bruto === '[DONE]') return null
  try {
    const objeto: unknown = JSON.parse(bruto)
    if (objeto === null || typeof objeto !== 'object') return null
    if (!('tipo' in objeto)) return null
    return objeto as VentusEvento
  } catch {
    // Un bloque partido por el proxy no es motivo para matar el turno.
    return null
  }
}

export interface OpcoesStream {
  signal?: AbortSignal
  /** Inyectable para los tests: por defecto, el fetch del navegador. */
  fetchImpl?: typeof fetch
}

/**
 * Abre el turno y devuelve los eventos a medida que llegan.
 *
 * Nunca lanza por falta de red: emite `{tipo:'erro'}` y termina, porque quien
 * llama tiene que poder caer al motor determinístico sin un try/catch alrededor
 * de un for-await.
 */
export async function* abrirStreamVentus(
  req: VentusRequest,
  opcoes: OpcoesStream = {},
): AsyncGenerator<VentusEvento> {
  if (modoMock()) {
    yield* mockVentus(req, opcoes.signal)
    return
  }

  if (!talvezOnline()) {
    yield { tipo: 'erro', codigo: 'timeout', mensagem: 'Sem conexão.' }
    return
  }

  const doFetch = opcoes.fetchImpl ?? fetch
  const sessao = await sessaoAtual()
  const controle = new AbortController()

  const propagar = () => {
    controle.abort(opcoes.signal?.reason)
  }
  if (opcoes.signal) {
    if (opcoes.signal.aborted) propagar()
    else opcoes.signal.addEventListener('abort', propagar, { once: true })
  }

  // Timeout de inactividad: se rearma con CADA byte, incluido el ping.
  let relogio: ReturnType<typeof setTimeout> | null = null
  const rearmar = () => {
    if (relogio !== null) clearTimeout(relogio)
    relogio = setTimeout(() => {
      controle.abort(new DOMException('inatividade', 'TimeoutError'))
    }, INATIVIDADE_MS)
  }

  let resposta: Response
  try {
    rearmar()
    resposta = await doFetch(`${base()}${VENTUS_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(sessao?.access_token ? { authorization: `Bearer ${sessao.access_token}` } : {}),
      },
      body: JSON.stringify(req),
      signal: controle.signal,
    })
  } catch {
    if (relogio !== null) clearTimeout(relogio)
    yield { tipo: 'erro', codigo: 'timeout', mensagem: 'O Ventus não respondeu.' }
    return
  }

  if (!resposta.ok) {
    if (relogio !== null) clearTimeout(relogio)
    const codigo = codigoDeStatus(resposta.status)
    // 404/501 = el backend todavía no existe: se cae al mock por lo que queda
    // de la sesión, y la pantalla lo dice en la burbuja.
    if (codigo === 'nao_implementado') {
      ativarMockPorFallback()
      yield* mockVentus(req, opcoes.signal)
      return
    }
    yield { tipo: 'erro', codigo, mensagem: `HTTP ${String(resposta.status)}` }
    return
  }

  const corpo = resposta.body
  if (corpo === null) {
    if (relogio !== null) clearTimeout(relogio)
    yield { tipo: 'erro', codigo: 'interno', mensagem: 'Resposta sem corpo.' }
    return
  }

  const leitor = corpo.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      rearmar()
      // Algunos proxies reescriben los saltos de línea: normalizar primero.
      buffer += value.replace(/\r\n/g, '\n')

      let corte = buffer.indexOf('\n\n')
      while (corte !== -1) {
        const bloco = buffer.slice(0, corte)
        buffer = buffer.slice(corte + 2)
        const evento = parsearBloco(bloco)
        if (evento !== null) yield evento
        corte = buffer.indexOf('\n\n')
      }
    }
    // Último bloque sin el `\n\n` final: pasa cuando el servidor cierra justo.
    const resto = parsearBloco(buffer)
    if (resto !== null) yield resto
  } catch {
    yield { tipo: 'erro', codigo: 'timeout', mensagem: 'A conexão caiu no meio.' }
  } finally {
    if (relogio !== null) clearTimeout(relogio)
    void leitor.cancel().catch(() => undefined)
    opcoes.signal?.removeEventListener('abort', propagar)
  }
}

/**
 * Manda el 👍/👎. Es fire-and-forget a propósito: el vendedor ya siguió con su
 * día y un fallo acá no puede interrumpirlo. Igual se guarda localmente
 * (ver historico.ts) para que el voto no se pierda si no había señal.
 */
export async function enviarFeedback(feedback: VentusFeedback): Promise<boolean> {
  if (modoMock() || !talvezOnline()) return false
  try {
    const sessao = await sessaoAtual()
    const r = await fetch(`${base()}${VENTUS_FEEDBACK_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(sessao?.access_token ? { authorization: `Bearer ${sessao.access_token}` } : {}),
      },
      body: JSON.stringify(feedback),
    })
    return r.ok
  } catch {
    return false
  }
}
