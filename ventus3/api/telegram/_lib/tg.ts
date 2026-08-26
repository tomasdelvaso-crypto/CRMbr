// api/telegram/_lib/tg.ts
// Cliente de la Bot API de Telegram.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES COSAS QUE EL BOT ACTUAL NO HACE Y POR ESO PIERDE MENSAJES
// ══════════════════════════════════════════════════════════════════════════
// 1. NO TROCEA A 4096. `sendMessage` con un texto más largo devuelve
//    `400 message is too long` y el bot del v2 solo lo escribe en el log del
//    servidor: el digest largo desaparece y nadie se entera. Acá todo pasa por
//    `trocear()`, que corta por líneas y —cuando una sola línea no entra—
//    cierra y reabre las etiquetas HTML para no romper el parseo.
// 2. NO REINTENTA. Un 429 con `retry_after` o un 502 de la API son normales;
//    sin reintento se pierde el mensaje. `chamarTelegram` reintenta 3 veces
//    con backoff y respetando `retry_after`.
// 3. NO ESCAPA SIEMPRE. Todo lo que viene de la base o del usuario pasa por
//    `esc()`: un nombre de cliente con `&` o `<` rompe el `parse_mode: HTML`
//    y Telegram rechaza el mensaje entero.

import { requireEnv } from '../../_lib/env.js'

/* ══════════════════════════════════════════════════════════════════════════
   Tipos del subconjunto de la Bot API que el bot usa
   ══════════════════════════════════════════════════════════════════════════ */

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name?: string
  last_name?: string
  username?: string
}

export interface TelegramArquivo {
  file_id: string
  file_unique_id?: string
  file_size?: number
  mime_type?: string
  duration?: number
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date?: number
  text?: string
  caption?: string
  voice?: TelegramArquivo
  audio?: TelegramArquivo
  document?: TelegramArquivo
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface BotaoInline {
  text: string
  callback_data?: string
  url?: string
}

export interface TecladoInline {
  inline_keyboard: BotaoInline[][]
}

export interface ExtraDeMensagem {
  reply_markup?: TecladoInline
  disable_notification?: boolean
  link_preview_options?: { is_disabled: boolean }
}

/* ══════════════════════════════════════════════════════════════════════════
   Escape HTML
   ══════════════════════════════════════════════════════════════════════════ */

/** Todo dato de usuario o de la base pasa por acá antes de entrar al HTML. */
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* ══════════════════════════════════════════════════════════════════════════
   Troceo a 4096
   ══════════════════════════════════════════════════════════════════════════ */

/** Límite duro de la Bot API, contado en unidades UTF-16 (igual que `.length`). */
export const LIMITE_MENSAGEM = 4096

/** Etiquetas simples que Telegram acepta en `parse_mode: HTML`. */
const TAGS_SIMPLES = ['b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'a', 'blockquote']

/**
 * Etiquetas abiertas y todavía sin cerrar en `fragmento`, de la más externa a
 * la más interna. Se usa para poder cortar en medio de una línea sin dejar el
 * HTML desbalanceado (Telegram rechaza el mensaje entero si lo queda).
 */
function tagsAbertas(fragmento: string): string[] {
  const pilha: string[] = []
  const re = /<(\/?)([a-zA-Z]+)(\s[^>]*)?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fragmento)) !== null) {
    const fechamento = m[1] === '/'
    const nome = (m[2] ?? '').toLowerCase()
    if (!TAGS_SIMPLES.includes(nome)) continue
    if (fechamento) {
      const i = pilha.lastIndexOf(nome)
      if (i >= 0) pilha.splice(i, 1)
    } else {
      pilha.push(nome)
    }
  }
  return pilha
}

/** Las etiquetas de cierre para una pila de abiertas, de adentro hacia afuera. */
function cierreDe(abertas: readonly string[]): string {
  return [...abertas].reverse().map((t) => `</${t}>`).join('')
}

/**
 * Mayor corte ≤ `limite` que no cae dentro de una etiqueta `<…>` ni de una
 * entidad `&…;`, y que preferentemente cae en un espacio.
 */
function corteSeguro(texto: string, limite: number): number {
  let corte = Math.min(limite, texto.length)
  const janela = texto.slice(0, corte)

  const ultimoLt = janela.lastIndexOf('<')
  const ultimoGt = janela.lastIndexOf('>')
  if (ultimoLt > ultimoGt) corte = ultimoLt

  const ultimoAmp = texto.slice(0, corte).lastIndexOf('&')
  const ultimoPv = texto.slice(0, corte).lastIndexOf(';')
  if (ultimoAmp > ultimoPv && corte - ultimoAmp <= 10) corte = ultimoAmp

  const espaco = texto.slice(0, corte).lastIndexOf(' ')
  if (espaco > corte * 0.6) corte = espaco + 1

  return Math.max(1, corte)
}

/**
 * Parte un texto HTML en trozos que Telegram acepta.
 *
 * Corta por líneas siempre que puede: cada línea del bot abre y cierra sus
 * propias etiquetas, así que el corte por `\n` deja HTML válido sin hacer
 * nada. Solo cuando UNA línea no entra se hace corte duro, y ahí sí se cierran
 * las etiquetas abiertas y se reabren en el trozo siguiente.
 */
export function trocear(texto: string, limite: number = LIMITE_MENSAGEM): string[] {
  if (limite < 16) throw new Error('limite de troceo irracionalmente pequeno')
  if (texto.length <= limite) return texto === '' ? [] : [texto]

  const pedacos: string[] = []
  let atual = ''

  const empurrar = (): void => {
    if (atual.trim() !== '') pedacos.push(atual)
    atual = ''
  }

  for (const linha of texto.split('\n')) {
    const candidato = atual === '' ? linha : `${atual}\n${linha}`
    if (candidato.length <= limite) {
      atual = candidato
      continue
    }
    empurrar()

    if (linha.length <= limite) {
      atual = linha
      continue
    }

    // Línea sola más larga que el límite: corte duro con reapertura de tags.
    //
    // EL CIERRE TAMBIÉN CUENTA CONTRA LOS 4096. Antes el trozo se armaba
    // llenando hasta `limite` y RECIÉN AHÍ se le pegaba el `</b>`: el
    // resultado medía 4100 y Telegram lo rechazaba con «message is too long»,
    // que es el bug nº 1 del encabezado de este archivo, reintroducido por el
    // mismo código que lo arregla. Ahora el cierre se descuenta del
    // presupuesto ANTES de cortar.
    let resto = linha
    let prefixo = ''
    while (prefixo.length + resto.length > limite) {
      // Cortar más temprano puede dejar una etiqueta abierta que antes se
      // cerraba sola dentro del trozo, y entonces el cierre CRECE. Por eso se
      // reajusta en vez de calcularlo una sola vez; dos vueltas alcanzan y el
      // tope existe para que ningún HTML raro cuelgue el bucle.
      let corte = 0
      let cabeca = ''
      let fecho = ''
      for (let tentativa = 0; tentativa < 4; tentativa += 1) {
        const espaco = Math.max(1, limite - prefixo.length - fecho.length)
        corte = corteSeguro(resto, espaco)
        cabeca = prefixo + resto.slice(0, corte)
        const proximo = cierreDe(tagsAbertas(cabeca))
        if (proximo === fecho) break
        fecho = proximo
      }

      // Red de seguridad: si el reajuste no convergió por debajo del límite,
      // se corta duro. Un trozo con una etiqueta desbalanceada es un mensaje
      // feo; un trozo de 4100 caracteres es un mensaje que no llega.
      if (cabeca.length + fecho.length > limite) {
        corte = Math.max(1, limite - prefixo.length - fecho.length)
        cabeca = prefixo + resto.slice(0, corte)
      }

      pedacos.push(cabeca + fecho)
      resto = resto.slice(corte)
      // Lo que quedó abierto en la cabeza se REABRE en el trozo siguiente, y
      // su largo ya está descontado del presupuesto de la próxima vuelta.
      prefixo = tagsAbertas(cabeca).map((t) => `<${t}>`).join('')
    }
    atual = prefixo + resto
  }

  empurrar()
  return pedacos
}

/* ══════════════════════════════════════════════════════════════════════════
   Transporte
   ══════════════════════════════════════════════════════════════════════════ */

interface RespostaBotApi<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
  parameters?: { retry_after?: number; migrate_to_chat_id?: number }
}

export class ErroDeTelegram extends Error {
  readonly metodo: string
  readonly codigo: number

  constructor(metodo: string, codigo: number, descricao: string) {
    super(`Telegram ${metodo} ${codigo}: ${descricao}`)
    this.name = 'ErroDeTelegram'
    this.metodo = metodo
    this.codigo = codigo
  }
}

const TENTATIVAS = 3

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Llamada a la Bot API con reintento.
 *
 * Reintenta 429 (respetando `retry_after`), 5xx y fallos de red. NO reintenta
 * 400/403: un texto mal formado o un usuario que bloqueó el bot no mejoran
 * repitiendo, y el reintento solo retrasa la respuesta al vendedor.
 */
export async function chamarTelegram<T>(
  metodo: string,
  payload: Record<string, unknown>,
): Promise<T | null> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  const url = `https://api.telegram.org/bot${token}/${metodo}`

  let ultimoErro = ''
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    let resposta: Response
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (erro) {
      ultimoErro = erro instanceof Error ? erro.message : String(erro)
      if (tentativa === TENTATIVAS) break
      await esperar(300 * tentativa)
      continue
    }

    const corpo = (await resposta.json().catch(() => ({ ok: false }))) as RespostaBotApi<T>
    if (corpo.ok) return corpo.result ?? null

    const codigo = corpo.error_code ?? resposta.status
    ultimoErro = corpo.description ?? `HTTP ${resposta.status}`

    if (codigo === 429) {
      const espera = Math.min((corpo.parameters?.retry_after ?? 1) * 1000, 10_000)
      if (tentativa === TENTATIVAS) break
      await esperar(espera)
      continue
    }
    if (codigo >= 500) {
      if (tentativa === TENTATIVAS) break
      await esperar(400 * tentativa)
      continue
    }
    // 4xx que no es 429: no mejora reintentando.
    throw new ErroDeTelegram(metodo, codigo, ultimoErro)
  }

  throw new ErroDeTelegram(metodo, 0, ultimoErro || 'sem resposta')
}

/* ══════════════════════════════════════════════════════════════════════════
   Métodos usados
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Envía un mensaje, troceando si hace falta. El teclado inline va SIEMPRE en
 * el último trozo: si fuera en el primero, los botones quedarían arriba de un
 * texto que sigue abajo.
 */
export async function enviarMensagem(
  chatId: number | string,
  texto: string,
  extra: ExtraDeMensagem = {},
): Promise<TelegramMessage | null> {
  const pedacos = trocear(texto)
  let ultima: TelegramMessage | null = null
  for (let i = 0; i < pedacos.length; i += 1) {
    const ehUltimo = i === pedacos.length - 1
    ultima = await chamarTelegram<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text: pedacos[i],
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(ehUltimo ? extra : { disable_notification: true }),
    })
  }
  return ultima
}

/**
 * Edita un mensaje ya enviado. Es la pieza que hace que la confirmación, la
 * agenda y la sesión de Golden Hour vivan en UN mensaje en vez de llenar el
 * chat con seis personas registrando al mismo tiempo.
 *
 * Si el texto nuevo no entra en un mensaje, se edita con el primer trozo y el
 * resto sale como mensajes nuevos: es preferible a no editar nada.
 */
export async function editarMensagem(
  chatId: number | string,
  messageId: number,
  texto: string,
  extra: ExtraDeMensagem = {},
): Promise<void> {
  const pedacos = trocear(texto)
  const primeiro = pedacos[0] ?? ''
  const ehUnico = pedacos.length <= 1

  try {
    await chamarTelegram('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: primeiro,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(ehUnico ? extra : {}),
    })
  } catch (erro) {
    // 400 «message is not modified» es normal (dos taps en el mismo botón).
    if (erro instanceof ErroDeTelegram && /not modified/i.test(erro.message)) return
    throw erro
  }

  for (let i = 1; i < pedacos.length; i += 1) {
    await enviarMensagem(chatId, pedacos[i] ?? '', i === pedacos.length - 1 ? extra : {})
  }
}

/**
 * SIEMPRE se responde el callback, aunque sea vacío. Sin esto el cliente de
 * Telegram deja el spinner girando 30 segundos sobre el botón.
 */
export async function responderCallback(
  callbackQueryId: string,
  texto?: string,
  alerta = false,
): Promise<void> {
  try {
    await chamarTelegram('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(texto ? { text: texto.slice(0, 200) } : {}),
      ...(alerta ? { show_alert: true } : {}),
    })
  } catch (erro) {
    // Un callback vencido (>15 min) devuelve 400. No es un fallo del flujo.
    console.warn('[telegram] answerCallbackQuery falhou:', erro)
  }
}

/** Descarga un archivo (nota de voz) de los servidores de Telegram. */
export async function baixarArquivo(
  fileId: string,
): Promise<{ conteudo: Buffer; caminho: string }> {
  const token = requireEnv('TELEGRAM_BOT_TOKEN')
  const arquivo = await chamarTelegram<{ file_path?: string }>('getFile', { file_id: fileId })
  const caminho = arquivo?.file_path
  if (!caminho) throw new ErroDeTelegram('getFile', 0, 'resposta sem file_path')

  const resposta = await fetch(`https://api.telegram.org/file/bot${token}/${caminho}`)
  if (!resposta.ok) {
    throw new ErroDeTelegram('download', resposta.status, 'não deu para baixar o áudio')
  }
  return { conteudo: Buffer.from(await resposta.arrayBuffer()), caminho }
}
