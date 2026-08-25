// src/ui/haptic.ts
// Wrapper de feedback háptico con patrones nombrados.
//
// Tres realidades distintas:
//  1. Telegram Mini App → HapticFeedback nativo (el mejor, delega en el SO).
//  2. Android / Chrome   → navigator.vibrate con patrones de milisegundos.
//  3. iOS PWA            → NO existe. navigator.vibrate no está implementado en
//     Safari y el truco del <input switch> murió en iOS 26.5. Ahí el feedback
//     lo da la micro-animación del propio componente, no este módulo.
//
// Contrato: esta función NUNCA lanza. Si no hay soporte, no pasa nada.

/** Patrones disponibles. Los componentes solo hablan en estos términos. */
export type HapticPattern =
  | 'tap'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'celebration'
  | 'impact'

/* ── Tipado mínimo del puente de Telegram ──────────────────────────────────
   No hay @types oficial estable para WebApp; declaramos solo lo que usamos.
   Esta es la frontera con una librería sin tipos permitida por las reglas. */
interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

interface TelegramWebApp {
  HapticFeedback?: TelegramHapticFeedback
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** Patrones en milisegundos para la Vibration API. */
const VIBRATION: Readonly<Record<HapticPattern, number | number[]>> = {
  tap: 10,
  selection: 8,
  impact: 18,
  success: [14, 46, 22],
  warning: [24, 60, 24],
  error: [34, 44, 34, 44, 34],
  celebration: [12, 34, 12, 34, 24, 34, 44],
}

let soporteVibracion: boolean | null = null

function temVibracao(): boolean {
  if (soporteVibracion !== null) return soporteVibracion
  soporteVibracion =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  return soporteVibracion
}

function telegramHaptics(): TelegramHapticFeedback | null {
  if (typeof window === 'undefined') return null
  const hf = window.Telegram?.WebApp?.HapticFeedback
  // El Mini App expone el objeto aunque la versión del cliente sea vieja: hay
  // que comprobar el método, no solo la presencia del namespace.
  if (hf && typeof hf.impactOccurred === 'function') return hf
  return null
}

function viaTelegram(hf: TelegramHapticFeedback, pattern: HapticPattern): void {
  switch (pattern) {
    case 'tap':
      hf.impactOccurred('light')
      return
    case 'selection':
      if (typeof hf.selectionChanged === 'function') hf.selectionChanged()
      else hf.impactOccurred('soft')
      return
    case 'impact':
      hf.impactOccurred('medium')
      return
    case 'success':
      hf.notificationOccurred('success')
      return
    case 'warning':
      hf.notificationOccurred('warning')
      return
    case 'error':
      hf.notificationOccurred('error')
      return
    case 'celebration':
      // No hay «celebración» nativa: se compone con dos impactos y un éxito.
      hf.impactOccurred('rigid')
      window.setTimeout(() => {
        try {
          hf.notificationOccurred('success')
        } catch {
          /* el puente puede desaparecer si el usuario cierra el Mini App */
        }
      }, 90)
      return
  }
}

/**
 * Dispara un patrón háptico. Silencioso y seguro en cualquier plataforma.
 * No usar para feedback informativo: el háptico confirma una ACCIÓN.
 */
export function haptic(pattern: HapticPattern = 'tap'): void {
  try {
    // Si el usuario pidió menos movimiento, también quiere menos ruido físico.
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const hf = telegramHaptics()
    if (hf) {
      viaTelegram(hf, pattern)
      return
    }

    if (temVibracao()) {
      navigator.vibrate(VIBRATION[pattern])
    }
  } catch {
    // Un háptico jamás puede romper un flujo de venta.
  }
}

/** `true` si hay algún canal háptico real disponible (útil en Ajustes). */
export function hapticDisponivel(): boolean {
  try {
    return telegramHaptics() !== null || temVibracao()
  } catch {
    return false
  }
}

/** Corta cualquier vibración en curso (al salir de la Golden Hour, p. ej.). */
export function hapticCancelar(): void {
  try {
    if (temVibracao()) navigator.vibrate(0)
  } catch {
    /* no-op */
  }
}
