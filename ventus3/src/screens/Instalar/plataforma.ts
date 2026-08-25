// src/screens/Instalar/plataforma.ts
// Detección de plataforma y el prompt de instalación de Android.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO NO ES UN DETALLE
// ══════════════════════════════════════════════════════════════════════════
// La instalación es DISTINTA en cada plataforma y no hay un camino común:
//   · Android/Chrome dispara `beforeinstallprompt`, que hay que CAPTURAR y
//     guardar — si no se llama a `preventDefault()`, Chrome muestra su propio
//     mini-infobar y el evento se pierde. Y sólo se puede usar UNA vez.
//   · iOS/Safari no tiene ningún evento: la única vía es Compartilhar →
//     Adicionar à Tela de Início, a mano. Y sin ese paso NO HAY PUSH en iOS:
//     no es una mejora, es el requisito.
//   · Un teléfono que ya tiene la app instalada no puede volver a instalarla,
//     y ofrecérselo es la forma más rápida de que deje de creerle a la
//     pantalla.
//
// Por eso la pantalla pregunta primero dónde está parada y recién después
// decide qué mostrar.

import { useCallback, useEffect, useState } from 'react'

export type Plataforma = 'ios' | 'android' | 'desktop'

/** Evento de Chrome. No está en lib.dom todavía: es una frontera tipada. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function detectarPlataforma(): Plataforma {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // El iPad moderno se presenta como Macintosh: el desempate es el táctil.
  const ehIOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
  if (ehIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** ¿La app ya está corriendo instalada (standalone)? */
export function jaInstalado(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export interface EstadoDeInstalacao {
  plataforma: Plataforma
  instalado: boolean
  /** true cuando Chrome ya nos dio el evento y hay algo que ofrecer. */
  podeInstalar: boolean
  /** Dispara el diálogo nativo. Devuelve si la persona aceptó. */
  instalar: () => Promise<boolean>
}

/**
 * Captura `beforeinstallprompt` y expone el estado de instalación.
 *
 * El listener se registra en un efecto —eso es correcto acá, porque no abre
 * ningún diálogo—, pero `instalar()` SÓLO puede llamarse desde un tap: Chrome
 * exige gesto del usuario y, sin él, la promesa se rechaza en silencio.
 */
export function useInstalacao(): EstadoDeInstalacao {
  const [plataforma] = useState<Plataforma>(detectarPlataforma)
  const [instalado, setInstalado] = useState<boolean>(jaInstalado)
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const aoPrompt = (e: Event) => {
      // Sin preventDefault, Chrome se queda con el evento y no lo devuelve.
      e.preventDefault()
      setEvento(e as BeforeInstallPromptEvent)
    }
    const aoInstalar = () => {
      setInstalado(true)
      setEvento(null)
    }
    window.addEventListener('beforeinstallprompt', aoPrompt)
    window.addEventListener('appinstalled', aoInstalar)

    // El modo de visualización puede cambiar sin recargar (abrir desde el
    // icono de la pantalla de inicio con la pestaña ya viva).
    const mq = window.matchMedia('(display-mode: standalone)')
    const aoMudar = () => setInstalado(jaInstalado())
    mq.addEventListener('change', aoMudar)

    return () => {
      window.removeEventListener('beforeinstallprompt', aoPrompt)
      window.removeEventListener('appinstalled', aoInstalar)
      mq.removeEventListener('change', aoMudar)
    }
  }, [])

  const instalar = useCallback(async (): Promise<boolean> => {
    if (!evento) return false
    await evento.prompt()
    const { outcome } = await evento.userChoice
    // El evento se consume: Chrome no lo vuelve a entregar en esta sesión.
    setEvento(null)
    return outcome === 'accepted'
  }, [evento])

  return { plataforma, instalado, podeInstalar: evento !== null, instalar }
}

/**
 * De dónde se baja el APK.
 *
 * Es una variable de entorno porque el archivo va a vivir en el bucket que el
 * trámite de Play deje disponible, y ese destino todavía no está decidido. El
 * fallback apunta al propio origen para que la página nunca muestre un botón
 * que lleva a la nada.
 */
export const URL_DO_APK: string = import.meta.env.VITE_APK_URL ?? '/ventus.apk'

/** La URL que se codifica en el QR: esta misma página, en el origen actual. */
export function urlDaPagina(): string {
  if (typeof window === 'undefined') return 'https://ventus.ventapel.com.br/instalar'
  return `${window.location.origin}/instalar`
}
