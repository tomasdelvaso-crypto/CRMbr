// api/telegram.ts — el ruteo del webhook de Telegram.
//
// Toda la biblioteca del bot vive en `api/telegram/_lib/`. Acá NO hay lógica de
// negocio: hay un portero (secret_token), un candado de idempotencia (`bot_log`)
// y un switch que manda cada update a la pieza que ya está construida y testeada.
//
// ══════════════════════════════════════════════════════════════════════════
// EL ACK Y EL CLAIM EN DOS FASES
// ══════════════════════════════════════════════════════════════════════════
// Telegram reintenta un update mientras no reciba 200. La tentación es
// responder 200 y seguir trabajando; en el runtime de Node de Vercel eso
// congela el proceso a mitad de la transcripción y el audio se pierde — que es
// exactamente el bug de los 4 audios que `_lib/log.ts` documenta.
//
// Por eso el orden es el que diseñó `log.ts` y no otro:
//
//   1. `reivindicarUpdate()` ANTES de trabajar. La fila queda en `recebido` con
//      el update CRUDO guardado en `parsed.update`. Es lo primero que pasa y
//      tarda una consulta.
//   2. Un reintento de Telegram que llega mientras trabajamos ve la fila
//      fresca, decide `duplicado` y sale con 200 en milisegundos: ESE es el ack
//      <1s que importa, el de la reentrega.
//   3. El trabajo se hace ANTES de responder, dentro de la misma invocación.
//      Si Groq o Anthropic explotan a mitad, `fecharComErro()` deja la fila
//      `erro:` y el update queda REPROCESABLE — por el reintento de Telegram y
//      por `pendentesDeReprocesso()`. Nada se pierde.
//   4. Al vendedor el ack se lo da un mensaje inmediato («🎙 Ouvindo o áudio…»)
//      que después se EDITA con el resultado. La percepción de <1s es esa, no
//      el código HTTP que él nunca ve.
//
// Y siempre se responde 200 (salvo secret inválido): un 500 hace que Telegram
// reentregue el mismo update en bucle.

import { timingSafeEqual } from 'node:crypto'
import type { Channel, IsoDate } from '../src/core/index.js'
import { addDays, proximoTouchpoint, resolveShortcut, todayBr } from '../src/core/index.js'
import { optionalEnv } from './_lib/env.js'
import type { ApiHandler, ApiRequest, ApiResponse } from './_lib/http.js'
import { handlePreflight, header, lerJson } from './_lib/http.js'
import { transcrever } from './_lib/groq.js'
import { commitAcao, proporAcao } from './_lib/propose.js'
import type { AcaoDeCallback } from './telegram/_lib/callback.js'
import {
  AVISO_BOTAO_VELHO,
  callbackVigente,
  fingerprint,
  fpLead,
  fpOportunidade,
  lerCallback,
} from './telegram/_lib/callback.js'
import type { RespostaDeComando } from './telegram/_lib/comandos.js'
import {
  comandoAjuda,
  comandoAnel,
  comandoCompromissos,
  comandoGolden,
  comandoHoje,
  comandoParados,
  comandoPendentes,
  comandoPipeline,
  comandoPlacar,
  comandoStatus,
  partirComando,
} from './telegram/_lib/comandos.js'
import {
  carteiraDoBot,
  carteiraParaPrompt,
  compromissosDaSemana,
  leadDe,
  limparMemoDeCarteira,
  oportunidadeDe,
  rotuloDe,
} from './telegram/_lib/dados.js'
import type { ConsultaBruta } from './telegram/_lib/extracao.js'
import { interpretar } from './telegram/_lib/extracao.js'
import {
  adiarPara,
  desfazerUltimo,
  gravarRegistro,
  marcarAcaoFeita,
  MENSAGEM_DE_DESFAZER,
  montarRascunho,
  rascunhoCompleto,
  toqueDeGolden,
} from './telegram/_lib/fluxo.js'
import type { CanalDoVendedor } from './telegram/_lib/identidade.js'
import {
  canalDoTelegram,
  MENSAGEM_DE_VINCULO,
  podeNoCanal,
  vincularPorCodigo,
} from './telegram/_lib/identidade.js'
import {
  anotarLog,
  fecharComErro,
  fecharComExito,
  reivindicarUpdate,
} from './telegram/_lib/log.js'
import type { AtalhoDoGate } from './telegram/_lib/render.js'
import {
  botaoUrl,
  ehAtalhoDoGate,
  teclado,
  tecladoDaConfirmacao,
  tecladoDeCandidatos,
  tecladoDoGate,
  tecladoDoGolden,
  textoDaConfirmacao,
  textoDoFechamentoGolden,
  textoDoGate,
  textoDoGolden,
  textoNaoVinculado,
  urlDoApp,
} from './telegram/_lib/render.js'
import type { RascunhoDeRegistro, Sessao } from './telegram/_lib/sessoes.js'
import {
  chaveDeSessao,
  gravarSessao,
  lerSessao,
  limparSessao,
} from './telegram/_lib/sessoes.js'
import type {
  ExtraDeMensagem,
  TelegramCallbackQuery,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
} from './telegram/_lib/tg.js'
import {
  baixarArquivo,
  editarMensagem,
  enviarMensagem,
  esc,
  responderCallback,
} from './telegram/_lib/tg.js'

/* ══════════════════════════════════════════════════════════════════════════
   Textos fijos — PT-BR, siempre accionables
   ══════════════════════════════════════════════════════════════════════════ */

const TEXTO_FALHA =
  '⚠️ Deu erro processando isso. Já registrei o problema e vou tentar de novo sozinho; se quiser, manda outra vez.'

const TEXTO_SEM_MATCH = [
  '🤔 Não encontrei esse cliente na sua carteira do Ventus.',
  '',
  'Eu não crio clientes do nada. Confere o nome, ou cria a oportunidade/lead no app e me manda de novo.',
].join('\n')

const TEXTO_NAO_ENTENDI = [
  '🤔 Não entendi.',
  '',
  '🎙 Me manda um áudio contando o contato (qual cliente, o que aconteceu, próxima ação e quando), ou uma pergunta sobre a sua carteira.',
  '/ajuda mostra tudo o que eu sei fazer.',
].join('\n')

const TEXTO_AUDIO_VAZIO = '🎙 Não consegui entender o áudio. Pode repetir, ou mandar em texto?'

const TEXTO_SESSAO_VENCIDA = '⌛ Essa sessão expirou. Manda o registro de novo.'

/* ══════════════════════════════════════════════════════════════════════════
   Clasificación del update — pura, para poder testearla de verdad
   ══════════════════════════════════════════════════════════════════════════ */

export type TipoDeUpdate = 'callback' | 'voice' | 'text' | 'ignorado'

/** El mensaje del update, sea nuevo o editado. */
export function mensagemDoUpdate(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? null
}

/** Texto útil de un mensaje: el cuerpo o el pie de una foto. */
export function textoDaMensagem(msg: TelegramMessage | null | undefined): string {
  return (msg?.text ?? msg?.caption ?? '').trim()
}

/**
 * Qué clase de update es. `ignorado` cubre stickers, fotos sin pie, entradas y
 * salidas de grupo: cosas que no se claman ni se procesan, para no llenar
 * `bot_log` de ruido.
 */
export function tipoDeUpdate(update: TelegramUpdate): TipoDeUpdate {
  if (update.callback_query) return 'callback'
  const msg = mensagemDoUpdate(update)
  if (!msg) return 'ignorado'
  if (msg.from?.is_bot === true) return 'ignorado'
  if (msg.voice ?? msg.audio) return 'voice'
  return textoDaMensagem(msg) !== '' ? 'text' : 'ignorado'
}

/**
 * Comparación del `secret_token` en tiempo constante.
 *
 * Con `===` la diferencia de tiempo entre «falla en el primer byte» y «falla en
 * el último» es medible por red y deja barrer el secreto byte a byte. Es barato
 * cerrarlo y no hay ninguna razón para no hacerlo.
 */
export function segredoValido(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function ehGrupo(chat: TelegramChat | undefined): boolean {
  return chat !== undefined && chat.type !== 'private'
}

/**
 * Capacidades recortadas cuando se habla desde un grupo.
 *
 * `canalDoTelegram()` resuelve por `telegram_user_id` y devuelve las
 * capacidades del canal PRIMARIO del vendedor, que es su DM. Si no se recortara
 * acá, escribir en un grupo heredaría el permiso de `confirmar` del privado y
 * seis personas en el mismo chat podrían cerrar el registro de otra con un tap.
 * En grupo se lee y se registra; confirmar es del DM.
 */
export function restringirAGrupo(canal: CanalDoVendedor): CanalDoVendedor {
  return {
    ...canal,
    capacidades: canal.capacidades.filter((c) => c === 'ler' || c === 'registrar'),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Salida: un mensaje que se edita, no un chat que se llena
   ══════════════════════════════════════════════════════════════════════════ */

interface Saida {
  chatId: number
  /** Mensaje a reescribir. null = mandar uno nuevo y quedarse con su id. */
  messageId: number | null
}

async function responder(
  saida: Saida,
  texto: string,
  extra: ExtraDeMensagem = {},
): Promise<number | null> {
  if (saida.messageId !== null) {
    await editarMensagem(saida.chatId, saida.messageId, texto, extra)
    return saida.messageId
  }
  const msg = await enviarMensagem(saida.chatId, texto, extra)
  saida.messageId = msg?.message_id ?? null
  return saida.messageId
}

/* ══════════════════════════════════════════════════════════════════════════
   Handler
   ══════════════════════════════════════════════════════════════════════════ */

const handler: ApiHandler = async (req: ApiRequest, res: ApiResponse) => {
  if (handlePreflight(req, res)) return

  // GET es la sonda que uno abre en el navegador para ver si la ruta existe.
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    res.status(200).send('Ventus Bot v3')
    return
  }

  // Fail-CLOSED: sin secreto configurado no se procesa nada. El `/api/digest`
  // del v2 hacía lo contrario (fail-open) y por eso está en la lista de bugs.
  const esperado = optionalEnv('TELEGRAM_WEBHOOK_SECRET')
  if (!esperado) {
    console.error('[telegram] TELEGRAM_WEBHOOK_SECRET não configurada: recusando o webhook')
    res.status(500).json({ ok: false })
    return
  }
  if (!segredoValido(header(req, 'x-telegram-bot-api-secret-token'), esperado)) {
    console.warn('[telegram] secret_token inválido')
    res.status(401).json({ ok: false })
    return
  }

  let update: TelegramUpdate | null = null
  try {
    update = await lerJson<TelegramUpdate>(req)
  } catch {
    console.warn('[telegram] corpo do webhook não é JSON')
  }

  if (update && typeof update.update_id === 'number') {
    await processarUpdate(update)
  }

  // SIEMPRE 200. Un 500 hace que Telegram reentregue el mismo update en bucle.
  res.status(200).json({ ok: true })
}

export default handler

/* ══════════════════════════════════════════════════════════════════════════
   Fila idempotente + despacho
   ══════════════════════════════════════════════════════════════════════════ */

function chatDoUpdate(update: TelegramUpdate): number | null {
  return update.callback_query?.message?.chat.id ?? mensagemDoUpdate(update)?.chat.id ?? null
}

/**
 * Toma el update, lo procesa y cierra la fila. Exportada para el re-drive:
 * `pendentesDeReprocesso()` devuelve updates crudos y esta es la puerta por la
 * que vuelven a entrar.
 */
export async function processarUpdate(update: TelegramUpdate): Promise<void> {
  const tipo = tipoDeUpdate(update)
  if (tipo === 'ignorado') return

  const de = update.callback_query?.from ?? mensagemDoUpdate(update)?.from ?? null
  const { decisao, updateId } = await reivindicarUpdate(update, tipo, de?.id ?? null)
  if (decisao === 'duplicado') return

  // El memo de cartera vive 30 s y el proceso de Vercel se reusa entre
  // invocaciones: sin esto, el segundo update de la misma persona trabajaría
  // sobre la cartera de antes de la escritura del primero.
  limparMemoDeCarteira()

  try {
    const cb = update.callback_query
    const outcome = cb
      ? await rotearCallback(update, cb)
      : await rotearMensagem(update, mensagemDoUpdate(update) as TelegramMessage)
    await fecharComExito(updateId, outcome)
  } catch (erro) {
    const detalhe = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro)
    console.error(`[telegram] update ${updateId} falhou: ${detalhe}`, erro)
    await fecharComErro(updateId, detalhe)
    const chatId = chatDoUpdate(update)
    if (chatId !== null) {
      await enviarMensagem(chatId, TEXTO_FALHA).catch(() => undefined)
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Mensajes
   ══════════════════════════════════════════════════════════════════════════ */

function textoDoId(telegramUserId: number, chatId: number): string {
  return [
    `Seu Telegram ID: <code>${telegramUserId}</code>`,
    `ID deste chat: <code>${chatId}</code>`,
    '',
    'Para ligar este Telegram ao Ventus: <b>Ajustes → Telegram → Gerar código</b> no app e depois <code>/vincular 123456</code> aqui.',
  ].join('\n')
}

function textoDeBoasVindas(vendorName: string): string {
  return [
    `👋 Pronto, <b>${esc(vendorName)}</b>. Este Telegram ficou ligado ao Ventus.`,
    '',
    '🎙 Manda um áudio depois da próxima visita e eu registro. /ajuda mostra o resto.',
  ].join('\n')
}

async function rotearMensagem(update: TelegramUpdate, msg: TelegramMessage): Promise<string> {
  const chat = msg.chat
  const from = msg.from
  if (!from) return 'sem_remetente'

  const ehVoz = Boolean(msg.voice ?? msg.audio)
  const textoCru = textoDaMensagem(msg)
  const { comando, argumento } = partirComando(textoCru)

  // `/id` funciona para cualquiera: es justo lo que hace falta para darse de
  // alta cuando todavía no hay canal.
  if (comando === '/id') {
    await enviarMensagem(chat.id, textoDoId(from.id, chat.id))
    return 'cmd_id'
  }

  // `/vincular` es el ÚNICO camino de entrada de alguien sin canal, así que va
  // antes de resolver la identidad.
  if (comando === '/vincular') {
    const resultado = await vincularPorCodigo(argumento, from.id, chat.id, ehGrupo(chat))
    if (resultado.ok) {
      await enviarMensagem(chat.id, textoDeBoasVindas(resultado.vendorName))
      return 'vinculo_ok'
    }
    await enviarMensagem(chat.id, MENSAGEM_DE_VINCULO[resultado.motivo])
    return `vinculo_${resultado.motivo}`
  }

  const canalBruto = await canalDoTelegram(from.id, chat.id)
  if (!canalBruto) {
    // En un grupo no se contesta a cada mensaje suelto: sería spam para los
    // otros cinco. Sí se contesta si alguien invocó un comando.
    if (!ehGrupo(chat) || comando !== '') {
      await enviarMensagem(chat.id, textoNaoVinculado(from.id))
    }
    return 'nao_vinculado'
  }

  const canal = ehGrupo(chat) ? restringirAGrupo(canalBruto) : canalBruto
  await anotarLog(update.update_id, { vendor: canal.vendorName })

  if (comando !== '') {
    const resposta = await despacharComando(canal, comando, argumento, chat.id, from.id)
    if (!resposta) {
      await enviarMensagem(
        chat.id,
        `Não conheço <code>${esc(comando)}</code>. /ajuda mostra o que eu sei fazer.`,
      )
      return 'cmd_desconhecido'
    }
    await enviarMensagem(chat.id, resposta.texto, resposta.extra)
    return resposta.outcome
  }

  if (!podeNoCanal(canal, 'registrar')) {
    await enviarMensagem(chat.id, 'Este chat só pode ler. Manda o registro no meu chat privado.')
    return 'sem_capacidade_registrar'
  }

  const saida: Saida = { chatId: chat.id, messageId: null }
  let entrada = textoCru

  if (ehVoz) {
    // El ack que el vendedor ve. Después este mismo mensaje se reescribe con
    // la confirmación: un audio = un mensaje, no cuatro.
    const aviso = await enviarMensagem(chat.id, '🎙 Ouvindo o áudio…')
    saida.messageId = aviso?.message_id ?? null

    const arquivo = msg.voice ?? msg.audio
    if (!arquivo) return 'audio_sem_arquivo'
    const { conteudo, caminho } = await baixarArquivo(arquivo.file_id)
    const transcricao = await transcrever(conteudo, arquivo.mime_type ?? null, caminho)
    entrada = transcricao.texto.trim()
    if (entrada === '') {
      await responder(saida, TEXTO_AUDIO_VAZIO)
      return 'transcricao_vazia'
    }
  }

  await anotarLog(update.update_id, {
    vendor: canal.vendorName,
    input_text: entrada.slice(0, 4000),
  })

  const sessao = await lerSessao(chat.id, from.id)
  if (sessao && sessao.dados.tipo === 'registro') {
    if (
      sessao.estado === 'aguardando_correcao' ||
      sessao.estado === 'aguardando_cliente' ||
      sessao.estado === 'aguardando_proxima_acao'
    ) {
      return corrigirRascunho(update, canal, sessao, entrada, saida, from.id)
    }
    // Confirmación pendiente + mensaje nuevo = el vendedor abandonó el
    // anterior y arrancó otro. Igual que en la app.
    await limparSessao(chat.id, from.id)
  }

  return interpretarEntrada(update, canal, entrada, ehVoz ? 'voz' : 'texto', saida, from.id)
}

async function despacharComando(
  canal: CanalDoVendedor,
  comando: string,
  argumento: string,
  chatId: number,
  telegramUserId: number,
): Promise<RespostaDeComando | null> {
  switch (comando) {
    case '/hoje':
      return comandoHoje(canal)
    case '/golden':
      return comandoGolden(canal)
    case '/anel':
      return comandoAnel(canal)
    case '/placar':
      return comandoPlacar(canal)
    case '/compromissos':
      return comandoCompromissos(canal)
    case '/status':
      return comandoStatus(canal, argumento)
    case '/pendentes':
      return comandoPendentes(canal)
    case '/parados':
      return comandoParados(canal, argumento)
    case '/pipeline':
      return comandoPipeline(canal)
    case '/desfazer':
      return comandoDesfazer(canal, chatId, telegramUserId)
    case '/ajuda':
    case '/help':
    case '/start':
      return comandoAjuda(canal)
    default:
      return null
  }
}

async function comandoDesfazer(
  canal: CanalDoVendedor,
  chatId: number,
  telegramUserId: number,
): Promise<RespostaDeComando> {
  const sessao = await lerSessao(chatId, telegramUserId)
  const ultimo = sessao?.dados.tipo === 'ultimo' ? sessao.dados.ultimo : null
  const resultado = await desfazerUltimo(canal.ctx, ultimo)
  if (!resultado.ok) {
    return { texto: MENSAGEM_DE_DESFAZER[resultado.motivo], outcome: `desfazer_${resultado.motivo}` }
  }
  await limparSessao(chatId, telegramUserId)
  return {
    texto: `↩️ Desfeito: <b>${esc(resultado.rotulo)}</b>. O registro saiu do histórico.`,
    outcome: 'desfazer_ok',
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Interpretación: consulta o registro
   ══════════════════════════════════════════════════════════════════════════ */

async function interpretarEntrada(
  update: TelegramUpdate,
  canal: CanalDoVendedor,
  entrada: string,
  origem: 'voz' | 'texto',
  saida: Saida,
  telegramUserId: number,
): Promise<string> {
  const carteira = await carteiraDoBot(canal.ctx)
  const interpretacao = await interpretar(entrada, {
    vendorName: canal.vendorName,
    isAdmin: canal.isAdmin,
    carteiraTexto: carteiraParaPrompt(carteira),
    origem,
    hoje: carteira.hoje,
  })
  await anotarLog(update.update_id, { parsed: { interpretacao } })

  if (interpretacao.intencao === 'consulta') {
    const resposta = await responderConsulta(canal, interpretacao.consulta)
    await responder(saida, resposta.texto, resposta.extra)
    return resposta.outcome
  }

  if (interpretacao.intencao !== 'registro' || !interpretacao.registro) {
    await responder(saida, TEXTO_NAO_ENTENDI)
    return 'intencao_outro'
  }

  const rascunho = montarRascunho(interpretacao.registro, entrada, carteira)
  return avancarRascunho(canal, rascunho, saida, telegramUserId)
}

/**
 * Una consulta hablada responde EXACTAMENTE lo mismo que el comando
 * equivalente. Que «o que tenho pendente?» y `/pendentes` den textos distintos
 * es la forma más barata de perder la confianza en los dos.
 */
async function responderConsulta(
  canal: CanalDoVendedor,
  consulta: ConsultaBruta | null,
): Promise<RespostaDeComando> {
  switch (consulta?.tipo) {
    case 'hoje':
      return comandoHoje(canal)
    case 'pendentes':
      return comandoPendentes(canal)
    case 'sem_toque':
      return comandoParados(canal, String(consulta.dias ?? 15))
    case 'pipeline':
      return comandoPipeline(canal)
    case 'compromissos':
      return comandoCompromissos(canal)
    case 'status_cliente':
      return comandoStatus(canal, consulta.alvo?.rotulo ?? '')
    default:
      return comandoAjuda(canal)
  }
}

/** Lo que se le muestra al modelo del borrador anterior cuando hay corrección. */
function resumoDoRascunho(r: RascunhoDeRegistro): Record<string, unknown> {
  return {
    alvo: r.alvo,
    tipo: r.tipo,
    canal: r.canal,
    resumo: r.resumo,
    resultado: r.resultado,
    resultado_nota: r.resultadoNota,
    proxima_acao: r.proximaAcao,
    proxima_acao_data: r.proximaAcaoData,
    escalas: r.escalas,
    contatos: r.contatos,
  }
}

async function corrigirRascunho(
  update: TelegramUpdate,
  canal: CanalDoVendedor,
  sessao: Sessao,
  entrada: string,
  saida: Saida,
  telegramUserId: number,
): Promise<string> {
  if (sessao.dados.tipo !== 'registro') return 'sessao_incoerente'
  const anterior = sessao.dados.rascunho
  const carteira = await carteiraDoBot(canal.ctx)

  const interpretacao = await interpretar(entrada, {
    vendorName: canal.vendorName,
    isAdmin: canal.isAdmin,
    carteiraTexto: carteiraParaPrompt(carteira),
    origem: 'texto',
    hoje: carteira.hoje,
    rascunhoAtual: JSON.stringify(resumoDoRascunho(anterior)),
  })
  await anotarLog(update.update_id, { parsed: { correcao: interpretacao } })

  if (!interpretacao.registro) {
    await responder(saida, '🤔 Não entendi a correção. Diz o que muda: o cliente, o resumo ou a próxima ação.')
    return 'correcao_nao_entendida'
  }

  // La transcripción se ACUMULA: la regra da prova compara la cita contra el
  // relato, y el dato corregido puede haber llegado en el segundo mensaje.
  const transcricao = `${anterior.transcricao}\n${entrada}`.trim()
  const novo: RascunhoDeRegistro = {
    ...montarRascunho(interpretacao.registro, transcricao, carteira),
    // La idempotencia es del REGISTRO, no del turno: corregir dos veces y
    // confirmar sigue escribiendo una sola vez.
    idempotencyKey: anterior.idempotencyKey,
  }
  return avancarRascunho(canal, novo, saida, telegramUserId)
}

/* ══════════════════════════════════════════════════════════════════════════
   El borrador: cliente → fecha → confirmación
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Huella del borrador. Va en cada `callback_data` de la sesión: si el vendedor
 * empezó otro registro, los botones del anterior dejan de valer en vez de
 * aplicarse al borrador nuevo.
 */
function fpDoRascunho(rascunho: RascunhoDeRegistro): string {
  return fingerprint(rascunho.idempotencyKey)
}

async function avancarRascunho(
  canal: CanalDoVendedor,
  rascunho: RascunhoDeRegistro,
  saida: Saida,
  telegramUserId: number,
): Promise<string> {
  const chave = chaveDeSessao(saida.chatId, telegramUserId)
  const fp = fpDoRascunho(rascunho)

  if (!rascunho.alvo) {
    if (rascunho.candidatos.length === 0) {
      await limparSessao(saida.chatId, telegramUserId)
      await responder(saida, TEXTO_SEM_MATCH)
      return 'sem_match'
    }
    const messageId = await responder(saida, '🤔 De qual cliente estamos falando?', {
      reply_markup: tecladoDeCandidatos(chave, fp, rascunho.candidatos),
    })
    await gravarSessao(saida.chatId, telegramUserId, canal.vendorId, 'aguardando_cliente', {
      tipo: 'registro',
      rascunho,
      messageId,
    })
    return 'aguardando_cliente'
  }

  if (!rascunho.proximaAcaoData) {
    const messageId = await responder(saida, textoDoGate(rascunho.alvo.rotulo, rascunho.proximaAcao), {
      reply_markup: tecladoDoGate(chave, fp),
    })
    await gravarSessao(saida.chatId, telegramUserId, canal.vendorId, 'aguardando_proxima_acao', {
      tipo: 'registro',
      rascunho,
      messageId,
    })
    return 'aguardando_proxima_acao'
  }

  const messageId = await responder(saida, textoDaConfirmacao(rascunho), {
    reply_markup: tecladoDaConfirmacao(chave, fp),
  })
  await gravarSessao(saida.chatId, telegramUserId, canal.vendorId, 'aguardando_confirmacao', {
    tipo: 'registro',
    rascunho,
    messageId,
  })
  return 'aguardando_confirmacao'
}

/* ══════════════════════════════════════════════════════════════════════════
   Callbacks
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se le contesta al tap. Se manda UNA vez, en el `finally`. */
interface AvisoDeCallback {
  texto: string | undefined
  alerta: boolean
}

async function rotearCallback(
  update: TelegramUpdate,
  cb: TelegramCallbackQuery,
): Promise<string> {
  const aviso: AvisoDeCallback = { texto: undefined, alerta: false }
  try {
    const chat = cb.message?.chat
    if (!chat) return 'callback_sem_chat'

    const acao = lerCallback(cb.data)
    if (!acao) {
      aviso.texto = 'Botão que eu não conheço.'
      return 'callback_invalido'
    }

    const canalBruto = await canalDoTelegram(cb.from.id, chat.id)
    if (!canalBruto) {
      aviso.texto = 'Este Telegram não está ligado ao Ventus.'
      aviso.alerta = true
      return 'callback_nao_vinculado'
    }
    const canal = ehGrupo(chat) ? restringirAGrupo(canalBruto) : canalBruto
    await anotarLog(update.update_id, { vendor: canal.vendorName })

    const doCard: Saida = { chatId: chat.id, messageId: null }
    const noMesmo: Saida = { chatId: chat.id, messageId: cb.message?.message_id ?? null }

    switch (acao.ns) {
      case 'opp':
      case 'lead':
        return await callbackDeCard(canal, acao, doCard, aviso, cb.from.id)
      case 'na':
        return await callbackDoGate(canal, acao, noMesmo, aviso, cb.from.id)
      case 'reg':
        return await callbackDeRegistro(canal, acao, noMesmo, aviso, cb.from.id)
      case 'gh':
        return await callbackDoGolden(canal, acao, noMesmo, aviso)
      case 'cmp':
        return await callbackDeCompromisso(canal, acao, aviso)
      default:
        aviso.texto = 'Botão que eu não conheço.'
        return 'callback_ns_ignorado'
    }
  } finally {
    // SIEMPRE, aunque sea vacío: sin esto el cliente de Telegram deja el
    // spinner girando 30 segundos sobre el botón.
    await responderCallback(cb.id, aviso.texto, aviso.alerta)
  }
}

/* ── Botones de las tarjetas de /hoje ───────────────────────────────────── */

async function callbackDeCard(
  canal: CanalDoVendedor,
  acao: AcaoDeCallback,
  saida: Saida,
  aviso: AvisoDeCallback,
  telegramUserId: number,
): Promise<string> {
  const id = Number(acao.id)
  if (!Number.isFinite(id)) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'card_id_invalido'
  }
  const carteira = await carteiraDoBot(canal.ctx)

  if (acao.ns === 'opp') {
    const opp = oportunidadeDe(carteira, id)
    if (!callbackVigente(acao, opp ? fpOportunidade(opp) : null) || !opp) {
      aviso.texto = AVISO_BOTAO_VELHO
      return 'card_velho'
    }
    const rotulo = rotuloDe(carteira, 'opportunity', id)

    if (acao.acao === 'done') {
      if (!podeNoCanal(canal, 'confirmar')) {
        aviso.texto = 'Aqui no grupo eu só leio. Marca no meu chat privado.'
        return 'card_sem_capacidade'
      }
      const ok = await marcarAcaoFeita(canal.ctx, opp)
      aviso.texto = ok ? '✅ Feito' : 'Não consegui marcar agora.'
      await responder(saida, `✅ <b>${esc(rotulo)}</b> — ação marcada como feita.`)
      return ok ? 'card_feito' : 'card_feito_falhou'
    }

    if (acao.acao === 'amanha') {
      const data = addDays(carteira.hoje as IsoDate, 1)
      const ok = await adiarPara(
        canal.ctx,
        { kind: 'opportunity', id, dono: opp.vendor ?? canal.vendorName, rotulo },
        data,
      )
      aviso.texto = ok ? '⏰ Adiado' : 'Não consegui adiar agora.'
      await responder(saida, `⏰ <b>${esc(rotulo)}</b> — retomar em <b>${esc(data)}</b>.`)
      return ok ? 'card_adiado' : 'card_adiado_falhou'
    }

    if (acao.acao === 'reg') {
      aviso.texto = '🎙 Manda o áudio'
      await responder(
        saida,
        [
          `🎙 Conta o contato com <b>${esc(rotulo)}</b>.`,
          '',
          'Áudio de ~40s: o que aconteceu, qual a próxima ação e quando. Texto também vale.',
        ].join('\n'),
        { reply_markup: teclado([botaoUrl('📋 Abrir no app', urlDoApp(`/carteira/${id}`))]) },
      )
      return 'card_registrar'
    }

    aviso.texto = 'Botão que eu não conheço.'
    return 'card_acao_ignorada'
  }

  // ── Lead ──
  const lead = leadDe(carteira, id)
  if (!callbackVigente(acao, lead ? fpLead(lead) : null) || !lead) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'card_velho'
  }
  const rotulo = rotuloDe(carteira, 'lead', id)

  if (acao.acao === 'amanha') {
    const data = addDays(carteira.hoje as IsoDate, 1)
    const ok = await adiarPara(canal.ctx, { kind: 'lead', id, dono: lead.vendor ?? canal.vendorName, rotulo }, data)
    aviso.texto = ok ? '⏰ Adiado' : 'Não consegui adiar agora.'
    await responder(saida, `⏰ <b>${esc(rotulo)}</b> — retomar em <b>${esc(data)}</b>.`)
    return ok ? 'card_adiado' : 'card_adiado_falhou'
  }

  if (acao.acao === 'reg') {
    aviso.texto = '🎙 Manda o áudio'
    await responder(
      saida,
      `🎙 Conta o toque com <b>${esc(rotulo)}</b>: canal, o que respondeu e qual o próximo passo.`,
      { reply_markup: teclado([botaoUrl('📋 Abrir no app', urlDoApp(`/cadencia?lead=${id}`))]) },
    )
    return 'card_registrar'
  }

  if (acao.acao === 'done') {
    // Un lead no se marca «feito» a secas: el desfecho del toque es lo que
    // mueve la cadencia y la etapa. Se pregunta con los mismos cuatro botones
    // de la Golden Hour, sobre una fila de un solo lead.
    if (!podeNoCanal(canal, 'registrar')) {
      aviso.texto = 'Aqui no grupo eu só leio.'
      return 'card_sem_capacidade'
    }
    const usuario = usuarioDaSessaoGolden(canal)
    const chave = chaveDeSessao(saida.chatId, usuario)
    await gravarSessao(saida.chatId, usuario, canal.vendorId, 'golden', {
      tipo: 'golden',
      golden: { fila: [lead.id], indice: 0, comecouEm: new Date().toISOString(), feitos: 0 },
      messageId: null,
    })
    aviso.texto = 'Como foi o toque?'
    await responder(saida, textoDoGolden(lead, 0, 1, 0), {
      reply_markup: tecladoDoGolden(chave, lead.id, fpLead(lead)),
    })
    return 'card_lead_desfecho'
  }

  aviso.texto = 'Botão que eu não conheço.'
  return 'card_acao_ignorada'
}

/* ── El gate de próxima acción ──────────────────────────────────────────── */

async function callbackDoGate(
  canal: CanalDoVendedor,
  acao: AcaoDeCallback,
  saida: Saida,
  aviso: AvisoDeCallback,
  telegramUserId: number,
): Promise<string> {
  const sessao = await lerSessao(saida.chatId, telegramUserId)
  if (!sessao || sessao.dados.tipo !== 'registro') {
    aviso.texto = 'Essa sessão expirou.'
    await responder(saida, TEXTO_SESSAO_VENCIDA)
    return 'gate_sem_sessao'
  }
  const rascunho = sessao.dados.rascunho
  if (!callbackVigente(acao, fpDoRascunho(rascunho))) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'gate_velho'
  }
  if (!ehAtalhoDoGate(acao.acao)) {
    aviso.texto = 'Botão que eu não conheço.'
    return 'gate_acao_ignorada'
  }

  const data = resolveShortcut(acao.acao as AtalhoDoGate, todayBr())
  if (!data) {
    aviso.texto = 'Não consegui resolver essa data.'
    return 'gate_data_invalida'
  }

  const completo: RascunhoDeRegistro = {
    ...rascunho,
    proximaAcaoData: data,
    proximaAcao: rascunho.proximaAcao ?? `Retomar ${rascunho.alvo?.rotulo ?? 'o contato'}`,
  }
  aviso.texto = `⏭ ${data}`
  return avancarRascunho(canal, completo, saida, telegramUserId)
}

/* ── Confirmar / corrigir / cancelar / elegir cliente ────────────────────── */

function textoDoRegistrado(
  rascunho: RascunhoDeRegistro,
  resultado: { rotulo: string; escalasPropostas: number; aviso: string | null },
  kind: 'opportunity' | 'lead',
): string {
  const linhas = [
    `✅ <b>Registrado no Ventus</b>: ${esc(resultado.rotulo)}`,
    `⏭ ${esc(rascunho.proximaAcao ?? 'retomar contato')} — <b>${esc(rascunho.proximaAcaoData ?? '')}</b>`,
  ]
  if (resultado.escalasPropostas > 0) {
    linhas.push(
      '',
      `📊 ${resultado.escalasPropostas} escala(s) do Pepito ficaram na bandeja de Revisão do app — o score só muda quando você confirmar com a prova na frente.`,
    )
  }
  if (kind === 'lead' && rascunho.resultadoLead === 'meeting_scheduled') {
    linhas.push(
      '',
      '📈 <b>Reunião marcada!</b> Lembra da regra: se na reunião aparecer dor real, converte esse lead em oportunidade (Cadência → Converter).',
    )
  }
  if (resultado.aviso) linhas.push('', `⚠️ ${esc(resultado.aviso)}`)
  linhas.push('', 'Errei em algo? <code>/desfazer</code> nas próximas 24 h.')
  return linhas.join('\n')
}

async function callbackDeRegistro(
  canal: CanalDoVendedor,
  acao: AcaoDeCallback,
  saida: Saida,
  aviso: AvisoDeCallback,
  telegramUserId: number,
): Promise<string> {
  const sessao = await lerSessao(saida.chatId, telegramUserId)
  if (!sessao || sessao.dados.tipo !== 'registro') {
    aviso.texto = 'Essa sessão expirou.'
    await responder(saida, TEXTO_SESSAO_VENCIDA)
    return 'reg_sem_sessao'
  }
  const rascunho = sessao.dados.rascunho
  if (!callbackVigente(acao, fpDoRascunho(rascunho))) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'reg_velho'
  }

  if (acao.acao === 'x') {
    await limparSessao(saida.chatId, telegramUserId)
    aviso.texto = '❌ Cancelado'
    await responder(saida, '❌ Registro cancelado. Nada foi gravado.')
    return 'cancelado'
  }

  if (acao.acao === 'edit') {
    await gravarSessao(saida.chatId, telegramUserId, canal.vendorId, 'aguardando_correcao', {
      tipo: 'registro',
      rascunho,
      messageId: saida.messageId,
    })
    aviso.texto = '✏️ Me diz o que muda'
    await enviarMensagem(
      saida.chatId,
      '✏️ O que devo corrigir? Responde por texto ou áudio: cliente, tipo, resumo ou próxima ação.',
    )
    return 'editando'
  }

  if (acao.acao === 'pn') {
    await limparSessao(saida.chatId, telegramUserId)
    aviso.texto = 'Ok'
    await responder(saida, TEXTO_SEM_MATCH)
    return 'sem_match'
  }

  const escolha = /^p([0-4])$/.exec(acao.acao)
  if (escolha) {
    const indice = Number(escolha[1])
    const candidato = rascunho.candidatos[indice]
    if (!candidato) {
      aviso.texto = AVISO_BOTAO_VELHO
      return 'reg_candidato_ausente'
    }
    aviso.texto = `👍 ${candidato.rotulo.slice(0, 40)}`
    const comAlvo: RascunhoDeRegistro = { ...rascunho, alvo: candidato, candidatos: [] }
    return avancarRascunho(canal, comAlvo, saida, telegramUserId)
  }

  if (acao.acao !== 'ok') {
    aviso.texto = 'Botão que eu não conheço.'
    return 'reg_acao_ignorada'
  }

  // ── Confirmar ──
  if (!podeNoCanal(canal, 'confirmar')) {
    aviso.texto = 'Confirma no meu chat privado.'
    return 'reg_sem_capacidade'
  }
  if (!rascunhoCompleto(rascunho)) {
    aviso.texto = 'Falta o cliente ou a data.'
    return 'reg_incompleto'
  }

  const carteira = await carteiraDoBot(canal.ctx)
  const resultado = await gravarRegistro(canal.ctx, rascunho, carteira)

  // La sesión pasa a `ultimo_registro`: es lo que hace posible `/desfazer`, y
  // sobrevive al TTL de 2 h a propósito.
  await gravarSessao(saida.chatId, telegramUserId, canal.vendorId, 'ultimo_registro', {
    tipo: 'ultimo',
    ultimo: resultado.ultimo,
  })

  aviso.texto = '✅ Registrado'
  await responder(saida, textoDoRegistrado(rascunho, resultado, resultado.ultimo.kind))
  return resultado.ultimo.kind === 'opportunity' ? 'confirmado_atividade' : 'confirmado_toque'
}

/* ── Golden Hour ────────────────────────────────────────────────────────── */

/**
 * `comandoGolden()` graba la sesión bajo (chat, **vendorId**), no bajo el
 * telegram_user_id. Se respeta acá para leer la misma fila: los ids de vendedor
 * son enteros de una cifra y los de Telegram tienen nueve, así que no chocan.
 */
function usuarioDaSessaoGolden(canal: CanalDoVendedor): number {
  return canal.ctx.vendorId ?? 0
}

const DESFECHO_GOLDEN = {
  resp: 'interested',
  meet: 'meeting_scheduled',
  nores: 'no_response',
} as const

async function callbackDoGolden(
  canal: CanalDoVendedor,
  acao: AcaoDeCallback,
  saida: Saida,
  aviso: AvisoDeCallback,
): Promise<string> {
  const usuario = usuarioDaSessaoGolden(canal)
  const sessao = await lerSessao(saida.chatId, usuario)
  if (!sessao || sessao.dados.tipo !== 'golden') {
    aviso.texto = 'Essa sessão expirou.'
    await responder(saida, TEXTO_SESSAO_VENCIDA)
    return 'golden_sem_sessao'
  }
  const golden = sessao.dados.golden
  const total = golden.fila.length

  if (acao.acao === 'stop') {
    await limparSessao(saida.chatId, usuario)
    aviso.texto = '🏁 Encerrada'
    await responder(saida, textoDoFechamentoGolden(golden.feitos, total))
    return 'golden_encerrada'
  }

  const carteira = await carteiraDoBot(canal.ctx)
  const atualId = golden.fila[golden.indice]
  const atual = atualId === undefined ? null : leadDe(carteira, atualId)
  if (!atual) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'golden_lead_ausente'
  }
  if (!callbackVigente(acao, fpLead(atual))) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'golden_velho'
  }

  let feitos = golden.feitos
  if (acao.acao === 'resp' || acao.acao === 'meet' || acao.acao === 'nores') {
    if (!podeNoCanal(canal, 'registrar')) {
      aviso.texto = 'Aqui no grupo eu só leio.'
      return 'golden_sem_capacidade'
    }
    const canalDoToque: Channel = proximoTouchpoint(atual)?.channel ?? 'whatsapp'
    const gravou = await toqueDeGolden(canal.ctx, atual, DESFECHO_GOLDEN[acao.acao], canalDoToque)
    if (gravou) feitos += 1
    aviso.texto = gravou ? '✅ Toque registrado' : 'Não consegui registrar esse toque.'
  } else if (acao.acao === 'skip') {
    aviso.texto = '⏭ Pulado'
  } else {
    aviso.texto = 'Botão que eu não conheço.'
    return 'golden_acao_ignorada'
  }

  const proximo = golden.indice + 1
  const proximoId = golden.fila[proximo]
  const seguinte = proximoId === undefined ? null : leadDe(carteira, proximoId)
  if (!seguinte) {
    await limparSessao(saida.chatId, usuario)
    await responder(saida, textoDoFechamentoGolden(feitos, total))
    return 'golden_encerrada'
  }

  await gravarSessao(saida.chatId, usuario, canal.vendorId, 'golden', {
    tipo: 'golden',
    golden: { ...golden, indice: proximo, feitos },
    messageId: saida.messageId,
  })
  const chave = chaveDeSessao(saida.chatId, usuario)
  await responder(saida, textoDoGolden(seguinte, proximo, total, feitos), {
    reply_markup: tecladoDoGolden(chave, seguinte.id, fpLead(seguinte)),
  })
  return 'golden_proximo'
}

/* ── Veredicto de compromissos ──────────────────────────────────────────── */

const STATUS_COMPROMISSO: Readonly<Record<string, string>> = {
  done: 'done',
  partial: 'partial',
  missed: 'missed',
}

async function callbackDeCompromisso(
  canal: CanalDoVendedor,
  acao: AcaoDeCallback,
  aviso: AvisoDeCallback,
): Promise<string> {
  const status = STATUS_COMPROMISSO[acao.acao]
  if (!status) {
    aviso.texto = 'Botão que eu não conheço.'
    return 'cmp_acao_ignorada'
  }
  if (!podeNoCanal(canal, 'confirmar')) {
    aviso.texto = 'Dá o veredicto no meu chat privado.'
    return 'cmp_sem_capacidade'
  }

  const carteira = await carteiraDoBot(canal.ctx)
  const comps = compromissosDaSemana(carteira)
  const pendentes = comps.filter((c) => c.status === 'pending')
  const fpAtual = fingerprint(pendentes.map((c) => `${c.id}:${c.status}`).join('|'))
  if (!callbackVigente(acao, fpAtual)) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'cmp_velho'
  }

  const comp = comps.find((c) => String(c.id) === acao.id)
  if (!comp) {
    aviso.texto = AVISO_BOTAO_VELHO
    return 'cmp_ausente'
  }

  // El tap ES la confirmación humana: se propone y se commitea en el mismo
  // turno, para que quede la línea de auditoría del propose-then-commit sin
  // mandar al vendedor a confirmar en el app lo que ya confirmó acá.
  const proposta = await proporAcao({
    ctx: canal.ctx,
    tool: 'ventus_marcar_commitment',
    dono: comp.vendor,
    // `ventus_actions.entity_kind` no admite 'commitment': el id viaja en el
    // payload, igual que en `/api/ventus`.
    entidade: null,
    payload: { commitment_id: comp.id, status },
    confianca: 'alta',
    resumo: `Veredicto «${status}» em «${comp.committed_action}»`,
    mudancas: [{ campo: 'status', rotulo: 'Veredicto', de: comp.status, para: status }],
    citacao: `Veredicto dado por ${canal.vendorName} no Telegram em ${todayBr()}`,
    superficie: 'telegram',
    // Determinista a propósito: dos taps en el mismo botón chocan contra el
    // UNIQUE de `idempotency_key` y recuperan la propuesta que ya existe en vez
    // de abrir una segunda.
    idempotencyKey: `cmp:${comp.id}:${status}`,
  })

  if (proposta.resultado === null && proposta.actionId !== null) {
    await commitAcao(proposta.actionId, canal.ctx, null)
  }

  aviso.texto = status === 'done' ? '✅ Anotado' : status === 'partial' ? '🟡 Anotado' : '❌ Anotado'
  return `cmp_${status}`
}
