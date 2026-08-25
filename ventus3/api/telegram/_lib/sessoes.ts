// api/telegram/_lib/sessoes.ts
// `bot_sessions`: el borrador en curso de cada (chat, usuario), tipado.
//
// Una sola sesión por par (chat_id, telegram_user_id) — la PK de la tabla. Eso
// significa que un vendedor no puede tener dos registros a medias en el mismo
// chat, y está bien: el que empieza uno nuevo abandona el anterior, igual que
// en la app.
//
// TTL de aplicación de 2 horas, igual que el v2. Además la sesión guarda el
// `message_id` del mensaje que hay que EDITAR: es lo que permite que la
// confirmación, la agenda y la Golden Hour vivan en un mensaje que se reescribe
// en vez de llenar el chat.

import { serviceClient } from '../../_lib/supabase'
import type { ActivityResult, ActivityType, Channel, IsoDate, ScaleKey, TouchpointResult } from '../../../src/core'

export const TTL_SESSAO_MS = 2 * 60 * 60 * 1000

export type EstadoDeSessao =
  | 'aguardando_cliente'
  | 'aguardando_proxima_acao'
  | 'aguardando_confirmacao'
  | 'aguardando_correcao'
  | 'golden'
  | 'ultimo_registro'

export interface AlvoDoRascunho {
  kind: 'opportunity' | 'lead'
  id: number
  rotulo: string
}

export interface EscalaSugerida {
  escala: ScaleKey
  para: number
  citacao: string
}

export interface ContatoSugerido {
  papel: 'power_sponsor' | 'sponsor' | 'influencer' | 'support_contact'
  nome: string
}

/** El borrador de un registro, tal como viaja entre turnos del bot. */
export interface RascunhoDeRegistro {
  alvo: AlvoDoRascunho | null
  candidatos: AlvoDoRascunho[]
  tipo: ActivityType
  resumo: string
  /** El ENUM que el CRM espera. La prosa va en `resultadoNota`. */
  resultado: ActivityResult
  resultadoNota: string | null
  canal: Channel
  resultadoLead: TouchpointResult | null
  proximaAcao: string | null
  proximaAcaoData: IsoDate | null
  escalas: EscalaSugerida[]
  contatos: ContatoSugerido[]
  transcricao: string
  /** Idempotencia del registro entero: dos taps en ✅ escriben una vez. */
  idempotencyKey: string
}

/** Lo que se guarda para poder `/desfazer`. */
export interface UltimoRegistro {
  kind: 'opportunity' | 'lead'
  rotulo: string
  /** id de `ventus_actions`, cuando el registro pasó por propose→commit. */
  actionId: string | null
  activityId: number | null
  touchpointId: number | null
  leadId: number | null
  /** Estado del lead ANTES del toque, para poder restaurarlo. */
  leadAntes: Record<string, unknown> | null
  em: string
}

/** Estado de una sesión de Golden Hour servida por Telegram. */
export interface SessaoGolden {
  fila: number[]
  indice: number
  comecouEm: string
  feitos: number
}

export type DadosDeSessao =
  | { tipo: 'registro'; rascunho: RascunhoDeRegistro; messageId: number | null }
  | { tipo: 'golden'; golden: SessaoGolden; messageId: number | null }
  | { tipo: 'ultimo'; ultimo: UltimoRegistro }

export interface Sessao {
  chatId: number
  telegramUserId: number
  vendorId: number | null
  estado: EstadoDeSessao
  dados: DadosDeSessao
  atualizadoEm: string
}

interface FilaDeSessao {
  chat_id: number
  telegram_user_id: number
  vendor_id: number | null
  state: string
  draft: unknown
  updated_at: string
}

function ehEstado(valor: string): valor is EstadoDeSessao {
  return (
    valor === 'aguardando_cliente' ||
    valor === 'aguardando_proxima_acao' ||
    valor === 'aguardando_confirmacao' ||
    valor === 'aguardando_correcao' ||
    valor === 'golden' ||
    valor === 'ultimo_registro'
  )
}

export async function lerSessao(chatId: number, telegramUserId: number): Promise<Sessao | null> {
  const { data, error } = await serviceClient()
    .from('bot_sessions')
    .select('chat_id, telegram_user_id, vendor_id, state, draft, updated_at')
    .eq('chat_id', chatId)
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()

  if (error) {
    console.error(`[sessoes] leitura falhou: ${error.code} ${error.message}`)
    return null
  }
  const fila = data as FilaDeSessao | null
  if (!fila || !ehEstado(fila.state)) return null

  // El «último registro» sobrevive al TTL de 2 h a propósito: /desfazer tiene
  // que funcionar al día siguiente si el vendedor se dio cuenta tarde.
  if (fila.state !== 'ultimo_registro') {
    const idade = Date.now() - new Date(fila.updated_at).getTime()
    if (idade > TTL_SESSAO_MS) {
      await limparSessao(chatId, telegramUserId)
      return null
    }
  }

  return {
    chatId: fila.chat_id,
    telegramUserId: fila.telegram_user_id,
    vendorId: fila.vendor_id,
    estado: fila.state,
    dados: fila.draft as DadosDeSessao,
    atualizadoEm: fila.updated_at,
  }
}

export async function gravarSessao(
  chatId: number,
  telegramUserId: number,
  vendorId: number | null,
  estado: EstadoDeSessao,
  dados: DadosDeSessao,
): Promise<void> {
  const { error } = await serviceClient()
    .from('bot_sessions')
    .upsert(
      {
        chat_id: chatId,
        telegram_user_id: telegramUserId,
        vendor_id: vendorId,
        state: estado,
        draft: dados,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id,telegram_user_id' },
    )
  if (error) console.error(`[sessoes] gravação falhou: ${error.code} ${error.message}`)
}

export async function limparSessao(chatId: number, telegramUserId: number): Promise<void> {
  const { error } = await serviceClient()
    .from('bot_sessions')
    .delete()
    .eq('chat_id', chatId)
    .eq('telegram_user_id', telegramUserId)
  if (error) console.error(`[sessoes] limpeza falhou: ${error.code} ${error.message}`)
}

/**
 * Clave corta y estable de una sesión, para meter en `callback_data`.
 *
 * El chat_id de un grupo puede tener 14 dígitos y el `callback_data` tiene 64
 * BYTES contando todo: se usa base36 del par, que entra en 13 caracteres.
 */
export function chaveDeSessao(chatId: number, telegramUserId: number): string {
  const a = Math.abs(chatId).toString(36)
  const b = Math.abs(telegramUserId).toString(36)
  return `${a}-${b}`.slice(0, 26)
}
