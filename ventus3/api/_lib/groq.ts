// api/_lib/groq.ts
// Transcripción con Groq (whisper-large-v3-turbo). Port tipado de
// ventus-bot/lib/transcribe.js, que ya lleva meses transcribiendo audios
// reales del equipo.
//
// DOS COSAS QUE PARECEN DETALLE Y NO LO SON:
//
// 1. NO SE FIJA `language`. El equipo habla portuñol: el CEO y el director son
//    hispanohablantes y cambian de idioma en la misma frase. Fijar 'pt'
//    degrada la transcripción de las partes en español y viceversa. La
//    autodetección de Whisper maneja la mezcla mejor que cualquier elección.
//
// 2. GROQ VALIDA POR EXTENSIÓN DEL NOMBRE, no por el contenido. El navegador
//    manda `audio/webm;codecs=opus` en Android y `audio/mp4` en iOS ≤18.3, y
//    Telegram manda `.oga`. Si la extensión no está en la lista, la API
//    rechaza un archivo perfectamente válido. Por eso el nombre se deriva del
//    mimeType y se cae a `.ogg` cuando no se reconoce.

import { requireEnv } from './env'
import { HttpError } from './http'

const URL_GROQ = 'https://api.groq.com/openai/v1/audio/transcriptions'
export const MODELO_ASR = 'whisper-large-v3-turbo'

const EXTENSOES_ACEITAS = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm']

/** mimeType negociado por el navegador → extensión que Groq acepta. */
export function extensaoDoMime(mime: string | null | undefined): string {
  const limpo = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  switch (limpo) {
    case 'audio/webm':
    case 'video/webm':
      return 'webm'
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a'
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3'
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav'
    case 'audio/flac':
      return 'flac'
    case 'audio/opus':
      return 'opus'
    case 'audio/ogg':
    case 'application/ogg':
      return 'ogg'
    default:
      return 'ogg'
  }
}

export function nomeSeguro(mime: string | null | undefined, nomeOriginal?: string): string {
  const daExtensao = (nomeOriginal?.split('.').pop() ?? '').toLowerCase()
  const ext = EXTENSOES_ACEITAS.includes(daExtensao) ? daExtensao : extensaoDoMime(mime)
  return `audio.${ext}`
}

export interface ResultadoDeTranscricao {
  texto: string
  duracaoMs: number
}

/** Audio más corto que esto no tiene nada adentro: ~0,2 s de opus. */
export const MIN_BYTES_DE_AUDIO = 2_000

export async function transcrever(
  audio: Buffer,
  mime: string | null | undefined,
  nomeOriginal?: string,
): Promise<ResultadoDeTranscricao> {
  if (audio.length < MIN_BYTES_DE_AUDIO) {
    throw new HttpError(400, 'audio_vazio', 'O áudio ficou vazio. Segura o botão e fala de novo.')
  }

  const chave = requireEnv('GROQ_API_KEY')
  const comecou = Date.now()

  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(audio)]), nomeSeguro(mime, nomeOriginal))
  fd.append('model', MODELO_ASR)
  fd.append('response_format', 'json')
  // `language` va ausente a propósito. Ver la cabecera del archivo.

  const resposta = await fetch(URL_GROQ, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}` },
    body: fd,
  })

  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => '')).slice(0, 300)
    if (resposta.status === 429) {
      throw new HttpError(429, 'limite', 'A transcrição está congestionada. Tenta de novo em um minuto.', detalhe)
    }
    throw new HttpError(
      502,
      'transcricao_falhou',
      'Não consegui entender o áudio. O arquivo continua salvo no telefone.',
      `Groq ${resposta.status}: ${detalhe}`,
    )
  }

  const corpo = (await resposta.json()) as { text?: string }
  const texto = (corpo.text ?? '').trim()
  return { texto, duracaoMs: Date.now() - comecou }
}
