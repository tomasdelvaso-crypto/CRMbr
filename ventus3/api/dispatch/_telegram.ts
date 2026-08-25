// api/dispatch/_telegram.ts
// Transporte Telegram del dispatcher. SOLO salida: el webhook de entrada es
// /api/telegram y no se toca desde acá.
//
// Los tres bugs del bot actual que este archivo no repite:
//   · sin troceo a 4096 chars → un digest largo se pierde en silencio
//   · sin retry → un 429 de Telegram tira el aviso a la basura
//   · botones sin `callback_data` versionado → un botón viejo scrolleado
//     arriba duplica el registro en vez de decir "esta ação já foi feita"
//
// El versionado del callback lo pone quien encola (convención `opp:1842:done:v3`);
// acá sólo se valida el límite duro de 64 bytes que impone la API de Telegram,
// porque pasarse hace que el mensaje entero sea rechazado con 400.

import { optionalEnv, requireEnv } from '../_lib/env.js'
import type { AcaoDeAviso } from './_tipos.js'

/** Límite de la API de Telegram para el texto de un mensaje. */
export const MAX_CHARS = 4096
/** Límite de `callback_data`, en BYTES UTF-8, no en caracteres. */
export const MAX_CALLBACK_BYTES = 64

export interface ResultadoTelegram {
  ok: boolean
  status: number
  /** true cuando el chat ya no existe o bloqueó al bot: hay que desactivarlo. */
  morto: boolean
  detalhe: string | null
}

export function telegramConfigurado(): boolean {
  return optionalEnv('TELEGRAM_BOT_TOKEN') !== undefined
}

/** Base absoluta para los botones URL. Telegram no acepta rutas relativas. */
function baseDaApp(): string {
  const bruto = optionalEnv('APP_URL') ?? optionalEnv('ALLOWED_ORIGIN') ?? 'https://ventus.ventapel.com.br'
  const primeira = bruto.split(',')[0] ?? bruto
  return primeira.trim().replace(/\/+$/, '')
}

const escapar = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Trocea respetando saltos de línea. Cortar por la mitad de una palabra en un
 * mensaje que lleva bullets de preparo de reunión lo vuelve ilegible.
 */
export function trocear(texto: string, limite: number = MAX_CHARS): string[] {
  if (texto.length <= limite) return [texto]
  const partes: string[] = []
  let resto = texto
  while (resto.length > limite) {
    const janela = resto.slice(0, limite)
    const corte = janela.lastIndexOf('\n')
    const fim = corte > limite * 0.5 ? corte : limite
    partes.push(resto.slice(0, fim))
    resto = resto.slice(fim).replace(/^\n/, '')
  }
  if (resto.length > 0) partes.push(resto)
  return partes
}

interface BotaoTelegram {
  text: string
  callback_data?: string
  url?: string
}

/**
 * Teclado inline a partir de las acciones. Dos botones por fila: en un teléfono
 * de gama media tres no entran y el rótulo se corta.
 */
export function tecladoDe(acoes: readonly AcaoDeAviso[] | null): { inline_keyboard: BotaoTelegram[][] } | null {
  if (acoes === null || acoes.length === 0) return null
  const base = baseDaApp()
  const botoes: BotaoTelegram[] = []

  for (const acao of acoes) {
    const rotulo = acao.rotulo.trim()
    if (rotulo === '') continue
    const cb = acao.callback?.trim()
    if (cb !== undefined && cb !== '' && Buffer.byteLength(cb, 'utf8') <= MAX_CALLBACK_BYTES) {
      botoes.push({ text: rotulo, callback_data: cb })
      continue
    }
    const link = acao.deep_link?.trim()
    if (link !== undefined && link !== '') {
      botoes.push({ text: rotulo, url: link.startsWith('http') ? link : `${base}${link}` })
      continue
    }
    if (cb !== undefined && cb !== '') {
      console.error(`[dispatch/telegram] callback_data longo demais, botão descartado: ${cb}`)
    }
  }
  if (botoes.length === 0) return null

  const filas: BotaoTelegram[][] = []
  for (let i = 0; i < botoes.length; i += 2) filas.push(botoes.slice(i, i + 2))
  return { inline_keyboard: filas }
}

async function chamar(metodo: string, corpo: unknown): Promise<Response> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  return fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
}

interface RespostaTelegram {
  ok?: boolean
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

/**
 * Manda un aviso a un chat. Trocea, pone los botones sólo en el ÚLTIMO trozo
 * (si van en el primero quedan colgando arriba de tres pantallas de texto) y
 * reintenta una vez ante 429 respetando `retry_after`.
 */
export async function enviarTelegram(
  chatId: number,
  titulo: string,
  corpo: string,
  acoes: readonly AcaoDeAviso[] | null,
): Promise<ResultadoTelegram> {
  const texto = `<b>${escapar(titulo)}</b>\n${escapar(corpo)}`
  const partes = trocear(texto)
  const teclado = tecladoDe(acoes)

  for (let i = 0; i < partes.length; i += 1) {
    const ultima = i === partes.length - 1
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: partes[i] ?? '',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      // Los trozos intermedios no vibran: una sola notificación por aviso.
      disable_notification: !ultima,
    }
    if (ultima && teclado !== null) payload['reply_markup'] = teclado

    let resp: Response
    try {
      resp = await chamar('sendMessage', payload)
    } catch (erro) {
      console.error('[dispatch/telegram] rede falhou:', erro)
      return { ok: false, status: 0, morto: false, detalhe: 'falha de rede' }
    }

    if (resp.status === 429) {
      const dados = (await resp.json().catch(() => ({}))) as RespostaTelegram
      const espera = Math.min(30, dados.parameters?.retry_after ?? 3)
      await new Promise((r) => setTimeout(r, espera * 1000))
      try {
        resp = await chamar('sendMessage', payload)
      } catch (erro) {
        console.error('[dispatch/telegram] retry falhou:', erro)
        return { ok: false, status: 429, morto: false, detalhe: 'limite do Telegram' }
      }
    }

    if (!resp.ok) {
      const dados = (await resp.json().catch(() => ({}))) as RespostaTelegram
      // 403 = el vendedor bloqueó al bot. 400 "chat not found" = chat borrado.
      const morto =
        resp.status === 403 ||
        (resp.status === 400 && (dados.description ?? '').includes('chat not found'))
      console.error(`[dispatch/telegram] ${resp.status}: ${dados.description ?? 'sem descrição'}`)
      return { ok: false, status: resp.status, morto, detalhe: `Telegram respondeu ${resp.status}` }
    }
  }

  return { ok: true, status: 200, morto: false, detalhe: null }
}
