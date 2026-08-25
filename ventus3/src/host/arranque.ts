// src/host/arranque.ts
// Lo que tiene que pasar ANTES de que React monte. Módulo con efecto: se
// importa por su costado, no por lo que exporta.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL DEEP LINK SE RESUELVE ACÁ Y NO EN UN COMPONENTE
// ══════════════════════════════════════════════════════════════════════════
// `createBrowserRouter(routes)` corre en el ámbito de módulo de `App.tsx` y
// lee `window.location` en ese instante. Un `useEffect` que navegue después
// llega tarde: el vendedor ve primero la pantalla Hoje y un frame más tarde
// salta a la ficha — con el chunk de Hoje bajado al pedo y una entrada de más
// en el historial, así que el back lo devuelve a una pantalla en la que nunca
// estuvo.
//
// Reescribiendo `window.location` con `replaceState` antes de que el router
// exista, el router nace apuntando al destino correcto. Por eso `main.tsx`
// importa este módulo en la PRIMERA línea: los módulos ES se evalúan en el
// orden en que aparecen los imports, y este tiene que evaluarse antes que
// `./app/App`.
//
// ══════════════════════════════════════════════════════════════════════════
// Y EL TEMA TAMBIÉN
// ══════════════════════════════════════════════════════════════════════════
// El tema de Telegram se aplica acá una vez, sin listeners (los pone el host
// al montar). Si esperara a React, el Mini App abriría con la paleta propia y
// cambiaría de color en el primer frame — el mismo flash que el script inline
// de `index.html` existe para evitar en la PWA.

import { dentroDoTelegram, webApp } from './ponte-telegram'
import { rotaDoStartParam, startParamDaUrl } from './deep-link'
import { aplicarSafeAreas, aplicarTema } from './tema'

let startParam: string | null = null
let destino: string | null = null

/** El `start_param` con el que se abrió esta sesión. null si no vino ninguno. */
export function startParamDaSessao(): string | null {
  return startParam
}

/** La ruta a la que apuntaba ese start_param, ya aplicada a la URL. */
export function destinoInicial(): string | null {
  return destino
}

function lerStartParam(): string | null {
  const app = webApp()
  const doTelegram = app?.initDataUnsafe?.start_param
  if (typeof doTelegram === 'string' && doTelegram !== '') return doTelegram
  if (typeof window === 'undefined') return null
  // Un link `?startapp=` abierto fuera de Telegram también tiene que llevar al
  // mismo lugar: los avisos del bot mandan el mismo destino por los dos lados.
  return startParamDaUrl(window.location.href)
}

function arrancar(): void {
  if (typeof window === 'undefined') return

  if (dentroDoTelegram()) {
    aplicarTema(webApp()?.themeParams)
    aplicarSafeAreas()
  }

  startParam = lerStartParam()
  if (startParam === null) return

  const rota = rotaDoStartParam(startParam)
  if (rota === null) {
    // Un start_param que no se entiende NO redirige a ninguna parte: se abre
    // Hoje. Adivinar el destino de un parámetro desconocido es cómo alguien
    // termina registrando en la ficha equivocada.
    console.warn(`[host/arranque] start_param ignorado: ${startParam}`)
    return
  }

  destino = rota.para
  const atual = `${window.location.pathname}${window.location.search}`
  if (atual === rota.para) return
  // `replaceState` y no `pushState`: el back del Mini App tiene que cerrarlo,
  // no volver a la pantalla de inicio por la que nunca pasó.
  window.history.replaceState(null, '', rota.para)
}

arrancar()
