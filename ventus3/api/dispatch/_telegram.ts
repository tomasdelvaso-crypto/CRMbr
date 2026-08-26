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
// El conversor de rutas a start_param vive en src/host/deep-link.ts y es
// isomórfico a propósito: es la MISMA tabla que la app usa para resolver el
// destino al abrirse. Tener dos tablas —una acá y otra allá— es la forma
// garantizada de que un aviso lleve a otra pantalla que el link.
import { linkDoMiniApp, startParamDoCaminho } from '../../src/host/deep-link.js'
// El troceo a 4096 y el escape de HTML viven en la biblioteca del bot y se
// importan: este archivo tenía su propia copia de los dos, y la de acá cortaba
// duro a mitad de un `<b>` cuando una sola línea no entraba —Telegram rechaza
// el mensaje entero con 400 y el aviso se pierde en silencio, que es
// exactamente el bug que el encabezado de este archivo dice no repetir—. Un
// solo troceo, el que cierra y reabre las etiquetas.
import { esc as escapar, trocear } from '../telegram/_lib/tg.js'
import type { AcaoDeAviso } from './_tipos.js'

/**
 * Límite de la API de Telegram para el texto de un mensaje. Se reexporta desde
 * la biblioteca del bot para que el número exista UNA sola vez: dos constantes
 * con el mismo 4096 se separan el día que Telegram lo cambie.
 */
export { LIMITE_MENSAGEM as MAX_CHARS } from '../telegram/_lib/tg.js'
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

/**
 * Usuario del bot, sin arroba. Si está, los botones de un aviso abren el MINI
 * APP en el destino exacto en vez del navegador: el vendedor se queda dentro
 * de Telegram, ya autenticado, sin pasar por el login.
 *
 * Es opcional a propósito: sin la variable —o sin Mini App registrado en
 * @BotFather— los botones siguen siendo la URL web de siempre, que funciona.
 */
function usuarioDoBot(): string | null {
  const bruto = optionalEnv('TELEGRAM_BOT_USERNAME')?.trim().replace(/^@/, '')
  return bruto !== undefined && bruto !== '' ? bruto : null
}

/**
 * La URL de un botón a partir de la ruta que escribió quien encoló el aviso.
 *
 * Orden: link absoluto tal cual → Mini App (si hay bot y la ruta tiene
 * codificación) → URL web absoluta. `startParamDoCaminho` devuelve null para
 * los destinos que no están en la tabla, y ahí se cae al web en vez de
 * inventar un start_param que llevaría a otra pantalla.
 */
export function urlDoBotao(link: string): string {
  if (link.startsWith('http')) return link
  const bot = usuarioDoBot()
  if (bot !== null) {
    const startParam = startParamDoCaminho(link)
    if (startParam !== null) return linkDoMiniApp(bot, startParam)
  }
  return `${baseDaApp()}${link}`
}

/** Base absoluta para los botones URL. Telegram no acepta rutas relativas. */
function baseDaApp(): string {
  const bruto = optionalEnv('APP_URL') ?? optionalEnv('ALLOWED_ORIGIN') ?? 'https://ventus.ventapel.com.br'
  const primeira = bruto.split(',')[0] ?? bruto
  return primeira.trim().replace(/\/+$/, '')
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
      botoes.push({ text: rotulo, url: urlDoBotao(link) })
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
