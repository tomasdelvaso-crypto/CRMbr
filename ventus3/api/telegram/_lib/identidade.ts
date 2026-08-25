// api/telegram/_lib/identidade.ts
// Quién está hablando: `vendor_channels` verificado + `/vincular <código>`.
//
// ══════════════════════════════════════════════════════════════════════════
// EL AUTOLINK POR @USERNAME SE ELIMINA
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 vincula un vendedor al primer Telegram cuyo `@username`
// coincida con `vendors.telegram_username`. Los usernames de Telegram cambian
// de dueño: cualquiera que tome el username libre de otra persona hereda su
// identidad en el CRM y registra visitas a su nombre. No hay ninguna
// comprobación más. Acá el único camino nuevo es el código de 6 dígitos que la
// app emite desde una sesión ya autenticada (`pairing_codes`, migración 0006):
// un uso, 10 minutos, 5 intentos y se quema.
//
// COMPATIBILIDAD: `vendors.telegram_id` se sigue LEYENDO como respaldo, porque
// esos tres ids los cargó un admin a mano y cortarlos dejaría al equipo sin bot
// el día del deploy. Pero NUNCA se escribe: la vinculación nueva solo ocurre
// por código.
//
// ══════════════════════════════════════════════════════════════════════════
// AUTORIZACIÓN
// ══════════════════════════════════════════════════════════════════════════
// El bot habla con `service_role`, para el que `ventus_autorizado()` devuelve
// siempre true. La propiedad se revalida en TypeScript con `exigirPropriedade`
// del mismo `_lib/auth` que usa la app — un solo Ventus, no dos.

import type { AuthContext } from '../../_lib/auth'
import { serviceClient } from '../../_lib/supabase'

/* ══════════════════════════════════════════════════════════════════════════
   Canal
   ══════════════════════════════════════════════════════════════════════════ */

/** Capacidad de un chat. Un grupo lee y registra; solo el DM confirma. */
export type Capacidade = 'ler' | 'registrar' | 'confirmar' | 'avancar_etapa' | 'fechar'

export interface CanalDoVendedor {
  ctx: AuthContext
  vendorId: number
  vendorName: string
  isAdmin: boolean
  chatId: number
  capacidades: readonly Capacidade[]
  /** true cuando la identidad vino de `vendors.telegram_id` (camino legado). */
  legado: boolean
}

interface FilaVendor {
  id: number
  name: string
  is_admin: boolean | null
  is_active: boolean | null
  auth_id: string | null
}

const COLUNAS_VENDOR = 'id, name, is_admin, is_active, auth_id'

const CAPACIDADES_PADRAO: readonly Capacidade[] = ['ler', 'registrar', 'confirmar']

/**
 * `AuthContext` a partir de un vendedor YA verificado.
 *
 * `userId` lleva el prefijo `telegram:` a propósito: si algún día una tabla
 * guarda el actor, tiene que quedar claro que la identidad no vino de un JWT
 * de Supabase sino de un canal emparejado.
 */
function contextoDe(vendor: FilaVendor, telegramUserId: number): AuthContext {
  return {
    userId: vendor.auth_id ?? `telegram:${telegramUserId}`,
    vendorName: vendor.name,
    vendorId: vendor.id,
    isAdmin: vendor.is_admin === true,
    email: null,
    // El canal no vence como vence un JWT: la sesión es el emparejamiento.
    expiraEm: 0,
  }
}

function capacidadesValidas(brutas: unknown): readonly Capacidade[] {
  if (!Array.isArray(brutas)) return CAPACIDADES_PADRAO
  const validas = brutas.filter(
    (c): c is Capacidade =>
      c === 'ler' || c === 'registrar' || c === 'confirmar' || c === 'avancar_etapa' || c === 'fechar',
  )
  return validas.length > 0 ? validas : CAPACIDADES_PADRAO
}

/**
 * Resuelve el vendedor de un mensaje. Devuelve null si el Telegram no está
 * emparejado: en ese caso el bot explica cómo emparejar, no adivina.
 */
export async function canalDoTelegram(
  telegramUserId: number,
  chatId: number,
): Promise<CanalDoVendedor | null> {
  const db = serviceClient()

  const canal = await db
    .from('vendor_channels')
    .select('vendor_id, chat_id, capacidades, is_active, verificado_em')
    .eq('telegram_user_id', telegramUserId)
    .eq('is_active', true)
    .not('verificado_em', 'is', null)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!canal.error && canal.data) {
    const fila = canal.data as {
      vendor_id: number
      chat_id: number
      capacidades: unknown
    }
    const vendor = await db.from('vendors').select(COLUNAS_VENDOR).eq('id', fila.vendor_id).maybeSingle()
    const v = vendor.data as FilaVendor | null
    if (v && v.is_active !== false) {
      // Huella de uso: sirve para el informe de cobertura y para detectar
      // canales muertos sin tener que preguntarle a nadie.
      void db
        .from('vendor_channels')
        .update({ ultimo_uso_em: new Date().toISOString() })
        .eq('telegram_user_id', telegramUserId)
        .then(() => undefined)
      return {
        ctx: contextoDe(v, telegramUserId),
        vendorId: v.id,
        vendorName: v.name,
        isAdmin: v.is_admin === true,
        chatId,
        capacidades: capacidadesValidas(fila.capacidades),
        legado: false,
      }
    }
  } else if (canal.error && !ehTabelaAusente(canal.error.code)) {
    console.error(`[identidade] vendor_channels falhou: ${canal.error.code} ${canal.error.message}`)
  }

  // ── Respaldo legado: vendors.telegram_id, cargado a mano por un admin ──
  const legado = await db
    .from('vendors')
    .select(COLUNAS_VENDOR)
    .eq('telegram_id', telegramUserId)
    .eq('is_active', true)
    .maybeSingle()

  const v = legado.data as FilaVendor | null
  if (!v) return null
  return {
    ctx: contextoDe(v, telegramUserId),
    vendorId: v.id,
    vendorName: v.name,
    isAdmin: v.is_admin === true,
    chatId,
    capacidades: CAPACIDADES_PADRAO,
    legado: true,
  }
}

function ehTabelaAusente(codigo: string | undefined): boolean {
  return codigo === '42P01' || codigo === 'PGRST205' || codigo === '42703'
}

export function podeNoCanal(canal: CanalDoVendedor, capacidade: Capacidade): boolean {
  return canal.capacidades.includes(capacidade)
}

/* ══════════════════════════════════════════════════════════════════════════
   /vincular <código>
   ══════════════════════════════════════════════════════════════════════════ */

export type ResultadoDeVinculo =
  | { ok: true; vendorName: string }
  | { ok: false; motivo: 'formato' | 'inexistente' | 'expirado' | 'usado' | 'queimado' | 'indisponivel' }

const FORMATO_CODIGO = /^[0-9]{6}$/

/** Texto en PT-BR de cada fallo. Nunca dice si el código existe o no. */
export const MENSAGEM_DE_VINCULO: Readonly<Record<Exclude<ResultadoDeVinculo, { ok: true }>['motivo'], string>> = {
  formato: 'O código tem 6 dígitos. Ex.: <code>/vincular 482913</code>',
  inexistente: 'Código inválido ou vencido. Gera outro em Ajustes → Telegram.',
  expirado: 'Esse código venceu (valem 10 minutos). Gera outro em Ajustes → Telegram.',
  usado: 'Esse código já foi usado. Gera outro em Ajustes → Telegram.',
  queimado: 'Muitas tentativas erradas nesse código. Gera um novo em Ajustes → Telegram.',
  indisponivel: 'O pareamento não está disponível agora. Tenta de novo em alguns minutos.',
}

/**
 * Consume un código de 6 dígitos y crea el canal verificado.
 *
 * No distingue «no existe» de «venció» hacia afuera más de lo necesario: los
 * seis dígitos son un espacio chico y el mensaje no debe ayudar a barrerlo.
 * El freno real es `pairing_codes.tentativas`, que quema el código a los 5.
 */
export async function vincularPorCodigo(
  codigo: string,
  telegramUserId: number,
  chatId: number,
  ehGrupo: boolean,
): Promise<ResultadoDeVinculo> {
  const limpo = codigo.trim()
  if (!FORMATO_CODIGO.test(limpo)) return { ok: false, motivo: 'formato' }

  const db = serviceClient()
  const { data, error } = await db
    .from('pairing_codes')
    .select('codigo, vendor_id, expira_em, usado_em, tentativas')
    .eq('codigo', limpo)
    .maybeSingle()

  if (error) {
    console.error(`[identidade] pairing_codes falhou: ${error.code} ${error.message}`)
    return { ok: false, motivo: 'indisponivel' }
  }

  const fila = data as {
    codigo: string
    vendor_id: number
    expira_em: string
    usado_em: string | null
    tentativas: number
  } | null

  if (!fila) return { ok: false, motivo: 'inexistente' }
  if (fila.tentativas >= 5) return { ok: false, motivo: 'queimado' }
  if (fila.usado_em) return { ok: false, motivo: 'usado' }
  if (new Date(fila.expira_em).getTime() <= Date.now()) {
    await db.from('pairing_codes').update({ tentativas: fila.tentativas + 1 }).eq('codigo', limpo)
    return { ok: false, motivo: 'expirado' }
  }

  const vendor = await db.from('vendors').select(COLUNAS_VENDOR).eq('id', fila.vendor_id).maybeSingle()
  const v = vendor.data as FilaVendor | null
  if (!v || v.is_active === false) return { ok: false, motivo: 'inexistente' }

  // Marcar usado ANTES de crear el canal, y solo si seguía sin usar: dos
  // `/vincular` con el mismo código a la vez no pueden crear dos canales.
  const { data: marcado, error: erroMarca } = await db
    .from('pairing_codes')
    .update({
      usado_em: new Date().toISOString(),
      usado_por_telegram_user_id: telegramUserId,
      usado_por_chat_id: chatId,
    })
    .eq('codigo', limpo)
    .is('usado_em', null)
    .select('codigo')

  if (erroMarca) {
    console.error(`[identidade] marcar código falhou: ${erroMarca.code} ${erroMarca.message}`)
    return { ok: false, motivo: 'indisponivel' }
  }
  if ((marcado ?? []).length === 0) return { ok: false, motivo: 'usado' }

  const kind = ehGrupo ? 'telegram_group' : 'telegram'
  const { error: erroCanal } = await db.from('vendor_channels').upsert(
    {
      vendor_id: v.id,
      vendor: v.name,
      kind,
      chat_id: chatId,
      telegram_user_id: telegramUserId,
      verificado_em: new Date().toISOString(),
      // Un grupo no confirma escrituras sensibles: seis personas en el mismo
      // chat no pueden cerrar una oportunidad con un tap.
      capacidades: ehGrupo ? ['ler', 'registrar'] : ['ler', 'registrar', 'confirmar'],
      is_primary: !ehGrupo,
      is_active: true,
      ultimo_uso_em: new Date().toISOString(),
    },
    { onConflict: 'kind,chat_id' },
  )

  if (erroCanal) {
    console.error(`[identidade] criar canal falhou: ${erroCanal.code} ${erroCanal.message}`)
    return { ok: false, motivo: 'indisponivel' }
  }

  return { ok: true, vendorName: v.name }
}
