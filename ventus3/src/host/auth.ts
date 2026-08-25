// src/host/auth.ts
// Entrada al CRM desde el Mini App: sin login, sin contraseña, sin teclado.
//
// ══════════════════════════════════════════════════════════════════════════
// EL CAMINO COMPLETO
// ══════════════════════════════════════════════════════════════════════════
//   1. Se toma el `initData` CRUDO. Nunca `initDataUnsafe`: ese objeto lo
//      puede escribir cualquiera desde la consola del WebView.
//   2. Se manda a `POST /api/tma-auth`, que lo verifica con el token del bot
//      y resuelve `telegram_id → vendors`.
//   3. El servidor devuelve un `token_hash` de magic link. Se canjea con
//      `verifyOtp()` y queda una sesión REAL de Supabase, con refresh token:
//      sobrevive al cierre del Mini App, al avión y a la hora siguiente.
//   4. Si el GoTrue no pudo emitirlo, se cae al JWT HS256 que el servidor
//      firma como respaldo. **Ese camino dura una hora y no se refresca**: es
//      un puente, no una sesión. Está documentado en el propio código porque
//      un respaldo silencioso que caduca a la hora es peor que ninguno.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO NO VIVE EN src/data/auth.ts
// ══════════════════════════════════════════════════════════════════════════
// `src/data/auth.ts` es la puerta de la PWA: e-mail, contraseña, link mágico,
// «não lembrar». Esto es la puerta del Mini App y solo existe cuando hay un
// puente de Telegram. Mezclarlas obligaría a `src/data` —que es isomórfico y
// no sabe nada de hosts— a importar la ponte de Telegram.

import { supabase } from '@/data/supabase'
import { dentroDoTelegram, initDataCru } from './ponte-telegram'
import type { ResultadoDeEntrada } from './tipos'

/** Contrato de respuesta de `POST /api/tma-auth`. Espeja `RespostaTmaAuth`. */
interface RespostaDoServidor {
  vendor?: { id: number; nome: string; isAdmin: boolean }
  otp?: { tokenHash: string; email: string; tipo: 'magiclink' } | null
  token?: { accessToken: string; expiraEm: number } | null
  startParam?: string | null
}

interface ErroDoServidor {
  error?: { message?: string; code?: string }
}

export const TMA_AUTH_PATH = '/api/tma-auth'

function base(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  return url !== undefined && url !== '' ? url.replace(/\/$/, '') : ''
}

function falha(
  motivo: Exclude<ResultadoDeEntrada, { ok: true }>['motivo'],
  mensagem: string,
): ResultadoDeEntrada {
  return { ok: false, motivo, mensagem }
}

/**
 * Abre sesión con el initData de Telegram.
 *
 * Nunca lanza: devuelve el motivo, porque quien la llama es una pantalla de
 * arranque que tiene que pintar algo útil en PT-BR en cualquier caso.
 */
export async function entrarComTelegram(): Promise<ResultadoDeEntrada> {
  if (!dentroDoTelegram()) {
    return falha('nao_aplica', 'Esta tela só existe dentro do Telegram.')
  }

  const initData = initDataCru()
  if (initData === '') {
    // Pasa cuando el Mini App se abre por un link viejo o desde un cliente que
    // no entrega initData. No hay nada que verificar: no se entra.
    return falha(
      'sem_initdata',
      'O Telegram não mandou seus dados de acesso. Feche o app e abra de novo pelo botão do bot.',
    )
  }

  let resposta: Response
  try {
    resposta = await fetch(`${base()}${TMA_AUTH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
  } catch {
    return falha('rede', 'Sem conexão para entrar. Tente de novo quando o sinal voltar.')
  }

  if (!resposta.ok) {
    let mensagem = 'Não deu para entrar agora. Tente de novo em alguns minutos.'
    try {
      const corpo = (await resposta.json()) as ErroDoServidor
      if (typeof corpo.error?.message === 'string' && corpo.error.message !== '') {
        mensagem = corpo.error.message
      }
    } catch {
      /* el cuerpo puede no ser JSON: el mensaje genérico ya sirve */
    }
    // 403 es el único que el vendedor puede resolver solo (falta emparejar).
    if (resposta.status === 403) return falha('sem_vinculo', mensagem)
    if (resposta.status === 401) return falha('recusado', mensagem)
    return falha('servidor', mensagem)
  }

  let corpo: RespostaDoServidor
  try {
    corpo = (await resposta.json()) as RespostaDoServidor
  } catch {
    return falha('servidor', 'A resposta do servidor veio quebrada. Tente de novo.')
  }

  const nome = corpo.vendor?.nome ?? ''

  // ── Camino bueno: sesión de verdad, con refresh token ──────────────────
  if (corpo.otp !== null && corpo.otp !== undefined) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: corpo.otp.tokenHash,
      type: corpo.otp.tipo,
    })
    if (error === null) return { ok: true, vendorNome: nome }
    console.error('[host/auth] verifyOtp falhou:', error.message)
  }

  // ── Respaldo: JWT firmado por el backend. UNA HORA, sin refresh ────────
  if (corpo.token !== null && corpo.token !== undefined) {
    try {
      // `setSession` exige los dos campos; el refresh_token es un marcador que
      // nunca se canjea. Cuando el access token venza, la sesión se cae y el
      // Mini App vuelve a entrar con un initData nuevo — que Telegram reemite
      // en cada apertura.
      const { error } = await supabase.auth.setSession({
        access_token: corpo.token.accessToken,
        refresh_token: 'telegram-mini-app',
      })
      if (error === null) return { ok: true, vendorNome: nome }
      console.error('[host/auth] setSession falhou:', error.message)
    } catch (erro) {
      console.error('[host/auth] setSession explodiu:', erro)
    }
  }

  return falha('servidor', 'Entrou no Telegram, mas a sessão do Ventus não abriu. Tente de novo.')
}

/** ¿Ya hay sesión abierta? Evita re-entrar en cada montaje del Mini App. */
export async function jaTemSessao(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  return data.session !== null
}
