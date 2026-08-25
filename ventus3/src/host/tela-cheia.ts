// src/host/tela-cheia.ts
// `requestFullscreen()` del Mini App — para la Golden Hour y nada más.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ SOLO LA GOLDEN HOUR
// ══════════════════════════════════════════════════════════════════════════
// La Golden Hour es modo foco: sin header, sin nav, sin FAB. En la PWA eso se
// consigue no dibujando el chrome propio, pero dentro de Telegram queda igual
// el header del cliente con el nombre del bot y el botón de cerrar — o sea, una
// salida lateral a un tap de distancia, que es la forma más barata de que la
// Golden Hour no ocurra.
//
// `requestFullscreen()` (Bot API 8.0) saca ese header. En cualquier OTRA
// pantalla sería una decisión hostil: esconder el botón de cerrar de una app
// que el vendedor abrió para mirar dos datos es secuestrarle el teléfono.
//
// SIEMPRE HAY QUE SALIR. Quien entra en pantalla completa tiene que llamar a
// `sairDaTelaCheia()` al desmontar. Por eso `useTelaCheia()` existe: un efecto
// con limpieza es más difícil de olvidar que dos llamadas simétricas.

import { chamar, ouvir, versaoPeloMenos, webApp } from './ponte-telegram'

/** ¿Este cliente de Telegram sabe hacer pantalla completa? */
export function temTelaCheia(): boolean {
  return versaoPeloMenos('8.0') && typeof webApp()?.requestFullscreen === 'function'
}

/** ¿Está en pantalla completa ahora mismo? */
export function estaEmTelaCheia(): boolean {
  return webApp()?.isFullscreen === true
}

/**
 * Entra en pantalla completa. Además desactiva el swipe vertical de cierre:
 * durante la Golden Hour, un gesto hacia abajo en medio del carrusel cerraría
 * el Mini App entero. Devuelve `false` si el cliente no puede.
 */
export function entrarEmTelaCheia(): boolean {
  if (!temTelaCheia()) return false
  chamar('disableVerticalSwipes')
  return chamar('requestFullscreen')
}

/** Sale de pantalla completa y devuelve el swipe vertical. Idempotente. */
export function sairDaTelaCheia(): void {
  chamar('exitFullscreen')
  chamar('enableVerticalSwipes')
}

/**
 * Escucha `fullscreenFailed`, que es lo que dispara Telegram cuando el
 * dispositivo no lo permite (pantalla partida, orientación bloqueada). Sin
 * esto, la Golden Hour se quedaría esperando un modo foco que no va a llegar.
 */
export function aoFalharTelaCheia(cb: () => void): () => void {
  return ouvir('fullscreenFailed', cb)
}

/**
 * Suscripción para `useSyncExternalStore`: el estado de pantalla completa lo
 * manda Telegram, no React.
 *
 * Se lee así y no con un `useState` puesto desde un efecto porque el usuario
 * puede salir de pantalla completa con un gesto del sistema, sin pasar por
 * nuestro código. Un `useState` quedaría diciendo que seguimos en modo foco
 * mientras el header del cliente ya volvió — y la Golden Hour dibujaría su
 * layout sin chrome debajo de una barra que sí está.
 */
export function assinarTelaCheia(aoMudar: () => void): () => void {
  const desligar = [ouvir('fullscreenChanged', aoMudar), ouvir('fullscreenFailed', aoMudar)]
  return () => {
    for (const d of desligar) d()
  }
}
