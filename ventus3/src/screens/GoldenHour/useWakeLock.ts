// src/screens/GoldenHour/useWakeLock.ts
// Screen Wake Lock durante el bloque de foco.
//
// Sin esto la pantalla se apaga a los 30 segundos entre una llamada y la
// siguiente, el vendedor tiene que desbloquear con la cara o el dedo cada vez,
// y el ritmo se muere. Con esto la fila queda a la vista la hora entera.
//
// Dos cosas que hay que hacer sí o sí:
//  1. Detección de soporte real: `navigator.wakeLock` está tipado como
//     obligatorio en lib.dom, pero en Safari < 16.4 y en Firefox no existe.
//     Se comprueba con `in`, nunca con `!== undefined` sobre la propiedad.
//  2. Re-adquirir en `visibilitychange`: el navegador SUELTA el lock cuando la
//     pestaña se va al fondo. Si el vendedor abre WhatsApp para mandar el
//     rascunho —que es literalmente el flujo de la pantalla— al volver ya no
//     hay lock. Sin este reintento el wake lock dura hasta el primer toque.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface EstadoWakeLock {
  /** La API existe en este navegador. */
  suportado: boolean
  /** Hay un lock vivo ahora mismo. */
  ativo: boolean
}

function temWakeLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/**
 * Mantiene la pantalla encendida mientras `ligado` sea true.
 * Falla en silencio: si el navegador no soporta o el usuario tiene ahorro de
 * batería, la hora sigue funcionando igual. Nunca lanza ni avisa.
 */
export function useWakeLock(ligado: boolean): EstadoWakeLock {
  const sentinelaRef = useRef<WakeLockSentinel | null>(null)
  const [ativo, setAtivo] = useState(false)
  const suportado = temWakeLock()

  const soltar = useCallback(() => {
    const s = sentinelaRef.current
    sentinelaRef.current = null
    setAtivo(false)
    if (s) void s.release().catch(() => undefined)
  }, [])

  const pedir = useCallback(async () => {
    if (!temWakeLock() || sentinelaRef.current !== null) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    try {
      const s = await navigator.wakeLock.request('screen')
      sentinelaRef.current = s
      setAtivo(true)
      // El propio navegador lo suelta al ir al fondo; el listener nos deja el
      // estado sincronizado para que el reintento sepa que hay que pedirlo.
      s.addEventListener('release', () => {
        if (sentinelaRef.current === s) sentinelaRef.current = null
        setAtivo(false)
      })
    } catch {
      // NotAllowedError (ahorro de batería, permiso denegado, pestaña oculta).
      // No es un error del producto: la hora funciona sin wake lock.
      sentinelaRef.current = null
      setAtivo(false)
    }
  }, [])

  useEffect(() => {
    // Soltar el lock es trabajo de la limpieza: cuando `ligado` pasa a false,
    // React corre la limpieza de la ejecución anterior y el lock se libera
    // igual, sin tocar estado dentro del cuerpo del efecto.
    if (!ligado) return

    // Fuera del cuerpo síncrono del efecto, como el resto del design system:
    // pedir el lock actualiza estado y no hace falta que ocurra en el mismo
    // commit. Un frame de diferencia no lo nota nadie.
    const frame = requestAnimationFrame(() => {
      void pedir()
    })

    const aoVoltar = (): void => {
      if (document.visibilityState === 'visible') void pedir()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', aoVoltar)
      soltar()
    }
  }, [ligado, pedir, soltar])

  return { suportado, ativo }
}
