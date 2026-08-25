// src/install/atualizacao.ts
// La actualización de la app, del lado del cliente.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ NO SE RECARGA SOLA
// ══════════════════════════════════════════════════════════════════════════
// `registerType: 'prompt'` (vite.config.ts) existe por una razón concreta: el
// vendedor puede estar dictando una nota de 40 segundos con la pantalla
// apagada contra la oreja. Un `location.reload()` automático en ese momento
// tira la grabación a la basura y nadie entiende por qué.
//
// Entonces: cuando hay versión nueva, `src/main.tsx` emite el evento
// `ventus:update-available`; la capa PWA lo escucha y muestra un toast
// «Nova versão disponível · Atualizar». La recarga la decide la persona.
//
// Este módulo NO importa nada de `main.tsx` a propósito: hablar con el
// service worker por la API estándar evita un ciclo de imports (main → App →
// capa PWA → main) que en producción se resuelve con un módulo a medio
// inicializar.

/** Evento que emite main.tsx cuando el SW nuevo quedó esperando. */
export const EVENTO_ATUALIZACAO = 'ventus:update-available'

/** Cada cuánto se le pregunta al servidor si hay versión nueva. */
export const INTERVALO_DE_CHECAGEM_MS = 60 * 60 * 1000

/** Mínimo entre dos chequeos disparados por volver a la app. */
const ESPERA_ENTRE_CHECAGENS_MS = 30 * 60 * 1000

let recarregando = false
let ultimaChecagem = 0

function temServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Aplica la versión que está esperando y recarga.
 *
 * El orden importa: primero se engancha `controllerchange` y recién después
 * se manda SKIP_WAITING. Al revés, el worker nuevo puede tomar el control
 * antes de que estemos escuchando y la página se queda con la versión vieja
 * pintada hasta el próximo arranque.
 */
export async function aplicarAtualizacao(): Promise<void> {
  if (recarregando) return
  if (!temServiceWorker()) {
    window.location.reload()
    return
  }

  const registro = await navigator.serviceWorker.getRegistration()
  const esperando = registro?.waiting
  if (!esperando) {
    recarregando = true
    window.location.reload()
    return
  }

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (recarregando) return
      recarregando = true
      window.location.reload()
    },
    { once: true },
  )

  esperando.postMessage({ type: 'SKIP_WAITING' })

  // Red de contención: si el worker no toma el control en 3 s (pasa cuando
  // hay otra pestaña abierta reteniendo al viejo), se recarga igual.
  window.setTimeout(() => {
    if (recarregando) return
    recarregando = true
    window.location.reload()
  }, 3000)
}

/** ¿Ya hay una versión nueva esperando en este momento? */
export async function temAtualizacaoEsperando(): Promise<boolean> {
  if (!temServiceWorker()) return false
  const registro = await navigator.serviceWorker.getRegistration()
  return registro?.waiting != null
}

/**
 * Escucha el aviso de versión nueva.
 *
 * Además del evento de `main.tsx`, chequea al montar: si la pestaña se abrió
 * con un worker YA esperando (arranque en frío después de un deploy), no hay
 * evento que escuchar y sin este chequeo el toast no aparecería nunca.
 */
export function observarAtualizacao(aoTerNovaVersao: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const escuta = () => aoTerNovaVersao()
  window.addEventListener(EVENTO_ATUALIZACAO, escuta)

  let vivo = true
  void temAtualizacaoEsperando().then((tem) => {
    if (tem && vivo) aoTerNovaVersao()
  })

  return () => {
    vivo = false
    window.removeEventListener(EVENTO_ATUALIZACAO, escuta)
  }
}

/**
 * Le pide al navegador que busque una versión nueva.
 *
 * Sin esto, un TWA que queda abierto días —que es exactamente lo que hace un
 * teléfono de campo— puede seguir corriendo el bundle de la semana pasada:
 * el navegador sólo chequea en la navegación, y en una app instalada casi no
 * hay navegaciones.
 */
export function agendarChecagens(): () => void {
  if (!temServiceWorker() || typeof window === 'undefined') return () => {}

  const checar = (forcado: boolean): void => {
    const agora = Date.now()
    if (!forcado && agora - ultimaChecagem < ESPERA_ENTRE_CHECAGENS_MS) return
    ultimaChecagem = agora
    void navigator.serviceWorker.getRegistration().then((registro) => {
      // `update()` puede rechazar sin red: no es un error que valga reportar.
      void registro?.update().catch(() => {})
    })
  }

  const id = window.setInterval(() => checar(true), INTERVALO_DE_CHECAGEM_MS)
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') checar(false)
  }
  document.addEventListener('visibilitychange', aoVoltar)

  return () => {
    window.clearInterval(id)
    document.removeEventListener('visibilitychange', aoVoltar)
  }
}
