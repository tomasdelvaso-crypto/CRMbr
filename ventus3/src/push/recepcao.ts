// src/push/recepcao.ts
// El otro extremo del cable de `src/sw-push.ts`: la app recibe el toque en la
// notificación, navega y —lo importante— MIDE.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ LA MEDICIÓN VIVE ACÁ Y NO EN EL SERVICE WORKER
// ══════════════════════════════════════════════════════════════════════════
// `POST /api/dispatch/track {acao:'agido'}` exige el JWT del vendedor. El
// service worker no tiene sesión y no debe tenerla: guardar un token en el SW
// es guardarlo en un contexto que sobrevive al logout. Así que el SW despierta
// a la app y la app mide.
//
// `agido_em` es la métrica que decide si un tipo de aviso sigue existiendo. El
// v2 tiene 4.521 notificaciones y NADIE puede decir cuáles sirvieron, porque
// `read_at` nunca se escribió. Sin esta función, el v3 repetiría el error con
// otra tabla.

import { sessaoAtual } from '@/data'
import { MENSAGEM_ASSINATURA_MUDOU, MENSAGEM_AVISO_CLICADO } from './mensagens'
import { TRACK_PATH } from './assinatura'

function base(): string {
  const url = import.meta.env.VITE_API_BASE_URL
  return url !== undefined && url !== '' ? url.replace(/\/$/, '') : ''
}

/** Marca `lido`/`agido`. Silencioso: una métrica no puede romper una navegación. */
export async function medirAviso(id: string, acao: 'lido' | 'agido'): Promise<void> {
  if (id === '') return
  try {
    const sessao = await sessaoAtual()
    if (sessao === null) return
    await fetch(`${base()}${TRACK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessao.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ acao, id }),
    })
  } catch {
    // Sin red la medición se pierde. Es aceptable: la alternativa sería una
    // cola offline de telemetría compitiendo con la del outbox, que sí lleva
    // trabajo del vendedor.
  }
}

/**
 * Navega dentro de la SPA sin recargar.
 *
 * `pushState` + `popstate` es lo que react-router escucha. Se evita
 * `window.location.assign`, que recargaría el bundle entero y perdería el
 * cache de TanStack Query — justo cuando la persona acaba de tocar un aviso y
 * quiere ver la ficha ya.
 */
function navegar(para: string): void {
  if (typeof window === 'undefined' || para === '') return
  const atual = `${window.location.pathname}${window.location.search}`
  if (atual === para) return
  window.history.pushState(null, '', para)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

interface MensagemDeAviso {
  type?: unknown
  id?: unknown
  acao?: unknown
  para?: unknown
  endpoint?: unknown
}

/**
 * Escucha al service worker. Devuelve el desinstalador.
 *
 * También limpia el caso de arranque en frío: cuando no había ninguna ventana
 * abierta, el SW abre la app con `?aviso=<id>` y esos parámetros se consumen
 * acá y se borran de la URL, para que un refresh no vuelva a contar la misma
 * acción.
 */
export function conectarRecepcaoDeAvisos(): () => void {
  if (typeof window === 'undefined') return () => undefined

  consumirAvisoDaUrl()

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => undefined
  }

  const aoReceber = (evento: MessageEvent): void => {
    const dados = (evento.data ?? {}) as MensagemDeAviso
    if (dados.type === MENSAGEM_AVISO_CLICADO) {
      const id = typeof dados.id === 'string' ? dados.id : ''
      if (id !== '') void medirAviso(id, 'agido')
      if (typeof dados.para === 'string') navegar(dados.para)
      return
    }
    if (dados.type === MENSAGEM_ASSINATURA_MUDOU) {
      // El navegador rotó la suscripción por su cuenta. Re-registrarla exige
      // sesión, así que se avisa a la app y Ajustes lo resuelve en el próximo
      // tap; el evento queda en el log para no perder el rastro.
      console.warn('[push] a assinatura deste aparelho mudou; refaça em Ajustes → Avisos.')
      window.dispatchEvent(new CustomEvent('ventus:assinatura-de-push-mudou'))
    }
  }

  navigator.serviceWorker.addEventListener('message', aoReceber)
  return () => navigator.serviceWorker.removeEventListener('message', aoReceber)
}

/** Lee `?aviso=&aviso_acao=` del arranque en frío, mide y limpia la URL. */
export function consumirAvisoDaUrl(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const id = params.get('aviso')
  if (id === null || id === '') return

  void medirAviso(id, 'agido')

  params.delete('aviso')
  params.delete('aviso_acao')
  const query = params.toString()
  const limpa = `${window.location.pathname}${query === '' ? '' : `?${query}`}`
  window.history.replaceState(null, '', limpa)
}
