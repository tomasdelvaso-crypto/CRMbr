// src/push/assinatura.ts
// Suscripción a Web Push: pedir permiso, suscribir el service worker, guardar
// la fila en `push_subscriptions` y saber deshacerlo.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTE MÓDULO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. TODO ARRANCA DE UN TAP. `assinarPush()` pide el permiso y suscribe en la
//    misma pila de llamada del gesto. Llamada desde un `useEffect`, iOS la
//    rechaza en silencio, la promesa resuelve 'denied' y el permiso queda
//    QUEMADO: Safari no vuelve a preguntar nunca. Por eso este módulo no
//    exporta ningún hook — un hook invita a llamarlo en un efecto.
//
// 2. LA CLAVE VAPID SE PIDE AL SERVIDOR, NO SE HORNEA EN EL BUNDLE. Está en
//    `GET /api/dispatch/track?acao=chave`. Es pública (es el
//    `applicationServerKey`), pero pedirla permite ROTARLA sin redeployar el
//    front. Y si el ambiente no tiene VAPID configurado, la respuesta lo dice
//    y Ajustes muestra eso en vez de un botón que falla.
//
// 3. LA SUSCRIPCIÓN VIEJA SE DESCARTA SI CAMBIÓ LA CLAVE. `subscribe()` con
//    otro `applicationServerKey` sobre una suscripción existente tira
//    InvalidStateError. Se compara la clave actual y, si no coincide, se
//    desuscribe primero. Sin esto, rotar VAPID deja a todo el equipo con push
//    muerto y sin forma de arreglarlo desde la app.
//
// 4. EL SERVIDOR ES EL QUE ESCRIBE LA FILA. El cliente manda endpoint/p256dh/
//    auth a `/api/dispatch/track` y el backend hace el upsert con
//    `vendor = ctx.vendorName` sacado del JWT. Si el cliente escribiera
//    directo en la tabla, el `vendor` vendría del cliente.

import { sessaoAtual, talvezOnline, pedirPermissaoDeAviso, type PermissaoDeAviso } from '@/data'
import { plataformaDoAparelho, soporteDeNotificacoes } from './soporte'

/** Ruta del endpoint de suscripción y de la clave. Ya existe en el backend. */
export const TRACK_PATH = '/api/dispatch/track'

function base(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  return url !== undefined && url !== '' ? url.replace(/\/$/, '') : ''
}

/* ══════════════════════════════════════════════════════════════════════════
   Resultado
   ══════════════════════════════════════════════════════════════════════════ */

export type MotivoDeFalhaDeAssinatura =
  | 'sem_suporte'
  | 'precisa_instalar'
  | 'permissao_negada'
  | 'permissao_pendente'
  | 'sem_chave'
  | 'sem_sessao'
  | 'sem_rede'
  | 'sem_service_worker'
  | 'falha_do_navegador'
  | 'falha_do_servidor'

export type ResultadoDaAssinatura =
  | { ok: true; endpoint: string; jaExistia: boolean }
  | { ok: false; motivo: MotivoDeFalhaDeAssinatura; mensagem: string }

/** Cada fallo con su texto en PT-BR. Nada de códigos en pantalla. */
const MENSAGENS: Readonly<Record<MotivoDeFalhaDeAssinatura, string>> = {
  sem_suporte: 'Este navegador não entrega notificações. O Telegram continua entregando tudo.',
  precisa_instalar:
    'No iPhone, aviso só chega para app instalado na tela de início. Em Ajustes → Aparelho tem o passo a passo.',
  permissao_negada:
    'As notificações estão bloqueadas neste aparelho. Para reverter: ajustes do celular → o Ventus → Notificações.',
  permissao_pendente: 'Você fechou a pergunta sem responder. Toque de novo quando quiser autorizar.',
  sem_chave: 'O envio de avisos ainda não está configurado no servidor. Fale com o Jordi.',
  sem_sessao: 'Sua sessão expirou. Entre de novo e tente outra vez.',
  sem_rede: 'Sem conexão agora. Tente de novo quando o sinal voltar.',
  sem_service_worker:
    'O app ainda está terminando de instalar neste aparelho. Espere alguns segundos e tente de novo.',
  falha_do_navegador: 'O navegador não deixou registrar este aparelho para avisos.',
  falha_do_servidor: 'Não deu para registrar este aparelho agora. Tente de novo em alguns minutos.',
}

function falha(motivo: MotivoDeFalhaDeAssinatura): ResultadoDaAssinatura {
  return { ok: false, motivo, mensagem: MENSAGENS[motivo] }
}

/* ══════════════════════════════════════════════════════════════════════════
   Utilidades
   ══════════════════════════════════════════════════════════════════════════ */

/** base64url → Uint8Array. Lo que pide `applicationServerKey`. */
export function base64urlParaBytes(base64url: string): Uint8Array {
  const preenchimento = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + preenchimento).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(base64)
  const bytes = new Uint8Array(bruto.length)
  for (let i = 0; i < bruto.length; i += 1) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

/** ArrayBuffer → base64url. Es como viajan `p256dh` y `auth`. */
export function bytesParaBase64url(buffer: ArrayBuffer | null): string {
  if (buffer === null) return ''
  const bytes = new Uint8Array(buffer)
  let bruto = ''
  for (const b of bytes) bruto += String.fromCharCode(b)
  return btoa(bruto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** ¿Dos claves de servidor son la misma? Compara byte a byte. */
function mesmaChave(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (a === null) return false
  const bytes = new Uint8Array(a)
  if (bytes.length !== b.length) return false
  for (let i = 0; i < bytes.length; i += 1) if (bytes[i] !== b[i]) return false
  return true
}

async function cabecalhos(): Promise<Record<string, string> | null> {
  const sessao = await sessaoAtual()
  if (sessao === null) return null
  return { Authorization: `Bearer ${sessao.access_token}`, 'Content-Type': 'application/json' }
}

/* ══════════════════════════════════════════════════════════════════════════
   Clave pública
   ══════════════════════════════════════════════════════════════════════════ */

let chaveEmCache: string | null = null

/** La clave pública de VAPID. null si el ambiente no la tiene configurada. */
export async function chaveVapidPublica(): Promise<string | null> {
  if (chaveEmCache !== null) return chaveEmCache
  const cabs = await cabecalhos()
  if (cabs === null) return null
  try {
    const resposta = await fetch(`${base()}${TRACK_PATH}?acao=chave`, {
      method: 'GET',
      headers: { Authorization: cabs['Authorization'] as string },
    })
    if (!resposta.ok) return null
    const corpo = (await resposta.json()) as { chave?: string | null }
    if (typeof corpo.chave !== 'string' || corpo.chave === '') return null
    chaveEmCache = corpo.chave
    return chaveEmCache
  } catch {
    return null
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Estado
   ══════════════════════════════════════════════════════════════════════════ */

/** El endpoint suscrito en este aparato, o null. No pide permiso ni red. */
export async function assinaturaAtual(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const registro = await navigator.serviceWorker.getRegistration()
    if (registro === undefined) return null
    return await registro.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** ¿Este aparato ya está suscrito? Para que Ajustes no prometa dos veces. */
export async function estaAssinado(): Promise<boolean> {
  return (await assinaturaAtual()) !== null
}

/* ══════════════════════════════════════════════════════════════════════════
   Suscribir
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pide permiso y suscribe. **Llamar SOLO desde un handler de tap.**
 *
 * El orden importa: primero se comprueba lo que no depende del usuario
 * (soporte, instalación, clave), después se pide el permiso. Pedir el permiso
 * y descubrir recién ahí que no hay clave VAPID gastaría la única pregunta que
 * el navegador permite.
 */
export async function assinarPush(): Promise<ResultadoDaAssinatura> {
  const suporte = soporteDeNotificacoes()
  if (!suporte.notificacoes || !suporte.serviceWorker || !suporte.push) return falha('sem_suporte')
  if (suporte.precisaInstalar) return falha('precisa_instalar')
  if (suporte.permissao === 'negada') return falha('permissao_negada')
  if (!talvezOnline()) return falha('sem_rede')

  const cabs = await cabecalhos()
  if (cabs === null) return falha('sem_sessao')

  const chave = await chaveVapidPublica()
  if (chave === null) return falha('sem_chave')
  const chaveBytes = base64urlParaBytes(chave)

  // El permiso, en la misma pila del tap.
  const permissao: PermissaoDeAviso =
    suporte.permissao === 'concedida' ? 'concedida' : await pedirPermissaoDeAviso()
  if (permissao === 'negada') return falha('permissao_negada')
  if (permissao !== 'concedida') return falha('permissao_pendente')

  let registro: ServiceWorkerRegistration
  try {
    // `ready` y no `getRegistration`: en la primera visita el SW puede estar
    // instalándose todavía y `getRegistration` devolvería undefined.
    registro = await navigator.serviceWorker.ready
  } catch {
    return falha('sem_service_worker')
  }

  let assinatura: PushSubscription | null = null
  let jaExistia = false
  try {
    const existente = await registro.pushManager.getSubscription()
    if (existente !== null) {
      if (mesmaChave(existente.options.applicationServerKey ?? null, chaveBytes)) {
        assinatura = existente
        jaExistia = true
      } else {
        // La clave rotó: sin esto, `subscribe()` tira InvalidStateError y el
        // aparato queda sin push para siempre.
        await existente.unsubscribe()
      }
    }
    if (assinatura === null) {
      assinatura = await registro.pushManager.subscribe({
        // Obligatorio: sin esto Chrome rechaza la suscripción. Y además es el
        // trato honesto — cada push que mandamos se ve.
        userVisibleOnly: true,
        applicationServerKey: chaveBytes as BufferSource,
      })
    }
  } catch (erro) {
    console.error('[push] subscribe falhou:', erro)
    return falha('falha_do_navegador')
  }

  const p256dh = bytesParaBase64url(assinatura.getKey('p256dh'))
  const auth = bytesParaBase64url(assinatura.getKey('auth'))
  if (p256dh === '' || auth === '') return falha('falha_do_navegador')

  try {
    const resposta = await fetch(`${base()}${TRACK_PATH}`, {
      method: 'POST',
      headers: cabs,
      body: JSON.stringify({
        acao: 'assinar',
        endpoint: assinatura.endpoint,
        p256dh,
        auth,
        plataforma: plataformaDoAparelho(),
      }),
    })
    if (!resposta.ok) {
      if (resposta.status === 401) return falha('sem_sessao')
      return falha('falha_do_servidor')
    }
  } catch {
    return falha('sem_rede')
  }

  return { ok: true, endpoint: assinatura.endpoint, jaExistia }
}

/**
 * Cancela la suscripción de ESTE aparato y borra la fila.
 *
 * El orden es al revés que en `assinar`: primero se le avisa al servidor y
 * después se desuscribe el navegador. Al revés, si el `fetch` falla la fila
 * queda viva apuntando a un endpoint muerto y el dispatcher gasta envíos en
 * él hasta que el push service devuelva 410.
 */
export async function cancelarPush(): Promise<void> {
  const assinatura = await assinaturaAtual()
  if (assinatura === null) return

  const cabs = await cabecalhos()
  if (cabs !== null) {
    try {
      await fetch(`${base()}${TRACK_PATH}`, {
        method: 'POST',
        headers: cabs,
        body: JSON.stringify({ acao: 'desassinar', endpoint: assinatura.endpoint }),
      })
    } catch {
      // Sin red la fila queda: el 410 del push service la va a limpiar.
    }
  }

  try {
    await assinatura.unsubscribe()
  } catch (erro) {
    console.error('[push] unsubscribe falhou:', erro)
  }
}
