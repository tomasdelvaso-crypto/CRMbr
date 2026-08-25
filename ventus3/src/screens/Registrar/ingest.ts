// src/screens/Registrar/ingest.ts
// El cliente de POST /api/ingest. Traduce fallas de red y de servidor a
// ErroIngest, que es lo único que la pantalla sabe manejar.
//
// Nunca importa `supabase` directo: el token sale de sessaoAtual(), que la
// capa de datos ya expone. La regla de la app («ningún componente llama a
// supabase») vale también para este módulo.

import { sessaoAtual, talvezOnline } from '@/data'
import {
  ativarMockPorFallback,
  CAMPO_ARQUIVO,
  CAMPO_META,
  ErroIngest,
  INGEST_PATH,
  mockIngest,
  modoMock,
  type IngestErroBody,
  type IngestMeta,
  type IngestResponse,
} from './contrato'

/** Techo del cuerpo. 8 MB son ~40 minutos de opus: nadie dicta tanto. */
export const LIMITE_BYTES = 8 * 1024 * 1024

/** Corte de espera. Más allá de esto el vendedor ya cerró la app. */
export const TIMEOUT_MS = 45_000

export interface EntradaIngest {
  meta: IngestMeta
  /** Audio o foto. Ausente en las fuentes de texto. */
  arquivo?: Blob | null
  /** Texto pegado (e-mail, WhatsApp, teclado). */
  texto?: string | null
  signal?: AbortSignal
}

function base(): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  const url = env['VITE_API_BASE_URL']
  return url && url !== '' ? url.replace(/\/$/, '') : ''
}

/** Une el AbortSignal de quien llama con el del timeout propio. */
function comTimeout(externo: AbortSignal | undefined, ms: number): {
  signal: AbortSignal
  limpar: () => void
} {
  const ctrl = new AbortController()
  const t = setTimeout(() => {
    ctrl.abort(new DOMException('timeout', 'TimeoutError'))
  }, ms)
  const propagar = () => {
    ctrl.abort(externo?.reason)
  }
  if (externo) {
    if (externo.aborted) propagar()
    else externo.addEventListener('abort', propagar, { once: true })
  }
  return {
    signal: ctrl.signal,
    limpar: () => {
      clearTimeout(t)
      externo?.removeEventListener('abort', propagar)
    },
  }
}

async function lerErro(resposta: Response): Promise<ErroIngest> {
  let codigo = 'interno'
  let mensagem = `O servidor respondeu ${String(resposta.status)}.`
  try {
    const corpo = (await resposta.json()) as Partial<IngestErroBody>
    if (corpo.error) {
      codigo = corpo.error.code || codigo
      mensagem = corpo.error.message || mensagem
    }
  } catch {
    // Un 502 de la CDN devuelve HTML: no es JSON y no importa.
  }
  // 5xx, 408 y 429 se reintentan; 4xx no se arregla insistiendo.
  const recuperavel = resposta.status >= 500 || resposta.status === 408 || resposta.status === 429
  return new ErroIngest(mensagem, codigo, recuperavel, resposta.status)
}

/**
 * Manda a interpretar un audio, una foto o un texto.
 *
 * Camino del mock: si la flag está encendida devuelve `mockIngest()` sin tocar
 * la red. Si el endpoint real contesta 501 `not_implemented` —el estado en el
 * que está hoy `api/ingest.ts`— enciende el mock para el resto de la sesión y
 * responde con él, en vez de dejar la pantalla muerta.
 */
export async function chamarIngest(entrada: EntradaIngest): Promise<IngestResponse> {
  const { meta, arquivo, texto, signal } = entrada

  if (modoMock()) return mockIngest(meta)

  if (!talvezOnline()) {
    throw new ErroIngest('Sem conexão agora.', 'limite', true, 0)
  }
  if (arquivo && arquivo.size > LIMITE_BYTES) {
    throw new ErroIngest('Áudio grande demais para enviar.', 'muito_grande', false, 0)
  }
  if (arquivo && arquivo.size === 0) {
    throw new ErroIngest('O áudio saiu vazio.', 'audio_vazio', false, 0)
  }

  const sessao = await sessaoAtual()
  if (!sessao) {
    throw new ErroIngest('Sessão expirada. Entre de novo.', 'sem_sessao', false, 401)
  }

  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${sessao.access_token}`,
    // Idempotencia de la ingesta: dos envíos del mismo audio no pagan dos
    // transcripciones. Mismo valor que el client_uuid de la activity.
    'X-Idempotency-Key': meta.clientUuid,
  }

  let corpo: BodyInit
  if (arquivo) {
    const form = new FormData()
    form.append(CAMPO_META, JSON.stringify(meta))
    // El nombre del archivo lleva la extensión negociada: algunos backends
    // de ASR miran la extensión antes que el Content-Type.
    form.append(CAMPO_ARQUIVO, arquivo, nomeDeArquivo(meta.mime ?? arquivo.type))
    corpo = form
    // Sin Content-Type a mano: el boundary lo pone el navegador.
  } else {
    cabecalhos['Content-Type'] = 'application/json'
    corpo = JSON.stringify({ ...meta, texto: texto ?? '' })
  }

  const { signal: sinal, limpar } = comTimeout(signal, TIMEOUT_MS)
  let resposta: Response
  try {
    resposta = await fetch(`${base()}${INGEST_PATH}`, {
      method: 'POST',
      headers: cabecalhos,
      body: corpo,
      signal: sinal,
    })
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : ''
    if (nome === 'AbortError' && signal?.aborted) {
      throw new ErroIngest('Cancelado.', 'limite', false, 0)
    }
    throw new ErroIngest(
      nome === 'TimeoutError' ? 'A transcrição demorou demais.' : 'Sem conexão agora.',
      'limite',
      true,
      0,
    )
  } finally {
    limpar()
  }

  if (resposta.status === 501) {
    // El endpoint todavía es el stub de notImplemented(). Caemos al mock y lo
    // decimos en voz alta en la UI: nadie tiene que creer que esto ya anda.
    ativarMockPorFallback()
    return mockIngest(meta)
  }

  if (!resposta.ok) throw await lerErro(resposta)

  const dados = (await resposta.json()) as IngestResponse
  if (dados.clientUuid !== meta.clientUuid) {
    throw new ErroIngest('Resposta de outro registro. Descartada.', 'interno', false, 200)
  }
  return dados
}

/** Extensión coherente con el mimeType realmente negociado. */
export function nomeDeArquivo(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'nota.m4a'
  if (mime.includes('ogg')) return 'nota.ogg'
  if (mime.includes('wav')) return 'nota.wav'
  if (mime.startsWith('image/')) return mime.includes('png') ? 'foto.png' : 'foto.jpg'
  return 'nota.webm'
}
