// src/data/auth.ts
// Autenticación contra Supabase Auth. Único lugar del bundle donde la pantalla
// de Login toca la sesión: ningún componente importa `supabase` directo.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTE MÓDULO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. LOS ERRORES SE TRADUCEN ACÁ, NO EN LA PANTALLA. Supabase devuelve
//    mensajes en inglés y con vocabulario de infraestructura («Invalid login
//    credentials», «AuthRetryableFetchError»). Un vendedor en la puerta de una
//    planta con 1 barra de señal necesita leer «Sem conexão. Tente de novo
//    quando o sinal voltar», no un stack. La traducción vive junto a la
//    llamada porque es parte del contrato del error, no decoración.
//
// 2. «NÃO LEMBRAR» ES REAL. Supabase persiste la sesión en localStorage
//    siempre. Para que «não lembrar» signifique algo, al cerrar la pestaña se
//    cierra la sesión LOCAL (scope 'local': no revoca el refresh token de los
//    otros aparatos de la persona). El handler se instala en el login y se
//    desinstala si después elige recordar.
//
// 3. EL MAGIC LINK ES ALTERNATIVA, NO CAMINO PRINCIPAL. Con el teléfono en la
//    mano, salir de la app al mail y volver rompe la sesión de trabajo. Existe
//    porque tres de los seis vendedores olvidan la contraseña, no porque sea
//    mejor.

import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import type { AuthError, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Traducción de errores
   ══════════════════════════════════════════════════════════════════════════ */

/** Motivo del fallo, ya clasificado. La pantalla decide qué campo marcar. */
export type MotivoDeFalhaDeLogin =
  | 'credenciais'
  | 'email_invalido'
  | 'email_nao_confirmado'
  | 'muitas_tentativas'
  | 'sem_rede'
  | 'sem_conta'
  | 'desconhecido'

export class ErroDeLogin extends Error {
  readonly motivo: MotivoDeFalhaDeLogin
  /** Qué campo debería quedar marcado en rojo, si alguno. */
  readonly campo: 'email' | 'senha' | null

  constructor(motivo: MotivoDeFalhaDeLogin, mensagem: string, campo: 'email' | 'senha' | null) {
    super(mensagem)
    this.name = 'ErroDeLogin'
    this.motivo = motivo
    this.campo = campo
  }
}

interface Traducao {
  motivo: MotivoDeFalhaDeLogin
  mensagem: string
  campo: 'email' | 'senha' | null
}

/**
 * Traduce el error de Supabase a PT-BR accionable.
 *
 * Se mira el `status` HTTP antes que el texto: los mensajes de Supabase
 * cambian entre versiones, los códigos no. El texto queda como desempate.
 */
export function traduzirErroDeLogin(erro: unknown): Traducao {
  const auth = erro as Partial<AuthError> & { message?: string; status?: number }
  const texto = (auth?.message ?? '').toLowerCase()
  const status = typeof auth?.status === 'number' ? auth.status : 0

  // El fetch que nunca salió del teléfono. Es el caso más común en campo.
  if (
    texto.includes('failed to fetch') ||
    texto.includes('network') ||
    texto.includes('retryable') ||
    status === 0
  ) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        motivo: 'sem_rede',
        mensagem: 'Você está sem conexão. Entre de novo quando o sinal voltar.',
        campo: null,
      }
    }
    return {
      motivo: 'sem_rede',
      mensagem: 'Não deu para falar com o servidor. Verifique o sinal e tente de novo.',
      campo: null,
    }
  }

  if (status === 429 || texto.includes('rate limit') || texto.includes('too many')) {
    return {
      motivo: 'muitas_tentativas',
      mensagem: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.',
      campo: null,
    }
  }

  if (texto.includes('email not confirmed') || texto.includes('not confirmed')) {
    return {
      motivo: 'email_nao_confirmado',
      mensagem: 'Este e-mail ainda não foi confirmado. Peça o link de acesso abaixo.',
      campo: 'email',
    }
  }

  if (texto.includes('invalid email') || texto.includes('unable to validate email')) {
    return {
      motivo: 'email_invalido',
      mensagem: 'Este e-mail não parece válido. Confira antes de continuar.',
      campo: 'email',
    }
  }

  if (texto.includes('user not found') || texto.includes('signups not allowed')) {
    return {
      motivo: 'sem_conta',
      mensagem: 'Não existe conta com este e-mail. Fale com o Jordi para liberar o acesso.',
      campo: 'email',
    }
  }

  if (status === 400 || status === 401 || texto.includes('invalid login credentials')) {
    return {
      motivo: 'credenciais',
      mensagem: 'E-mail ou senha incorretos. Confira e tente de novo.',
      campo: 'senha',
    }
  }

  return {
    motivo: 'desconhecido',
    mensagem: 'Não deu para entrar agora. Tente de novo em alguns segundos.',
    campo: null,
  }
}

function lancarErro(erro: unknown): never {
  const t = traduzirErroDeLogin(erro)
  throw new ErroDeLogin(t.motivo, t.mensagem, t.campo)
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · «Manter conectado neste aparelho»
   ══════════════════════════════════════════════════════════════════════════ */

export const CHAVE_LEMBRAR = 'ventus.lembrar'

/** ¿La persona pidió que el aparato la recuerde? Por defecto sí. */
export function lembrarSessao(): boolean {
  try {
    return localStorage.getItem(CHAVE_LEMBRAR) !== 'nao'
  } catch {
    // Modo privado: no hay dónde guardar la preferencia, así que se recuerda
    // mientras la pestaña viva y nada más. Es el comportamiento más seguro.
    return true
  }
}

let desinstalarEsquecimento: (() => void) | null = null

/**
 * Instala (o desinstala) el cierre de sesión al cerrar la pestaña.
 *
 * `pagehide` y no `beforeunload`: en iOS Safari `beforeunload` no dispara
 * cuando la app está en la pantalla de inicio, y `pagehide` sí. El scope
 * 'local' es deliberado: cerrar acá no puede desloguear a la persona del
 * Telegram Mini App ni de la tablet.
 */
export function definirLembrarSessao(lembrar: boolean): void {
  try {
    localStorage.setItem(CHAVE_LEMBRAR, lembrar ? 'sim' : 'nao')
  } catch {
    // Sin storage la preferencia vale solo para esta sesión.
  }

  desinstalarEsquecimento?.()
  desinstalarEsquecimento = null
  if (lembrar || typeof window === 'undefined') return

  const aoEsconder = () => {
    void supabase.auth.signOut({ scope: 'local' })
  }
  window.addEventListener('pagehide', aoEsconder)
  desinstalarEsquecimento = () => window.removeEventListener('pagehide', aoEsconder)
}

/** Reinstala la preferencia guardada. Se llama una vez al montar el Login. */
export function aplicarPreferenciaDeSessao(): void {
  definirLembrarSessao(lembrarSessao())
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Las tres operaciones
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaSenha {
  email: string
  senha: string
  /** false ⇒ la sesión se cierra al cerrar la pestaña. */
  lembrar: boolean
}

/** Normaliza el e-mail: los teclados de Android capitalizan la primera letra. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function entrarComSenha(entrada: EntradaSenha): Promise<Session> {
  const email = normalizarEmail(entrada.email)
  if (email === '') {
    throw new ErroDeLogin('email_invalido', 'Escreva o seu e-mail para continuar.', 'email')
  }
  if (entrada.senha === '') {
    throw new ErroDeLogin('credenciais', 'Escreva a sua senha para continuar.', 'senha')
  }

  definirLembrarSessao(entrada.lembrar)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: entrada.senha,
  })
  if (error) lancarErro(error)
  if (!data.session) {
    throw new ErroDeLogin('desconhecido', 'Entrou, mas a sessão não voltou. Tente de novo.', null)
  }
  return data.session
}

/**
 * Link mágico. `emailRedirectTo` apunta a la raíz de ESTE origen: si apuntara
 * a un dominio fijo, el link abriría la app equivocada en preview y en el APK.
 */
export async function enviarLinkMagico(email: string): Promise<void> {
  const limpo = normalizarEmail(email)
  if (limpo === '') {
    throw new ErroDeLogin('email_invalido', 'Escreva o seu e-mail para receber o link.', 'email')
  }

  const redirect = typeof window === 'undefined' ? undefined : `${window.location.origin}/`
  const { error } = await supabase.auth.signInWithOtp({
    email: limpo,
    options: {
      // Nadie se crea una cuenta sola: los seis vendedores ya existen.
      shouldCreateUser: false,
      ...(redirect ? { emailRedirectTo: redirect } : {}),
    },
  })
  if (error) lancarErro(error)
}

/** Cierra la sesión en ESTE aparato. Nunca revoca los otros. */
export async function sairDaConta(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Hooks
   ══════════════════════════════════════════════════════════════════════════ */

export function useEntrarComSenha(): UseMutationResult<Session, Error, EntradaSenha> {
  // networkMode 'always': sin esto TanStack pausa la mutación cuando cree que
  // no hay red, y el login se queda mudo en vez de decir «sem conexão».
  return useMutation({ mutationFn: entrarComSenha, networkMode: 'always', retry: false })
}

export function useEnviarLinkMagico(): UseMutationResult<void, Error, string> {
  return useMutation({ mutationFn: enviarLinkMagico, networkMode: 'always', retry: false })
}
