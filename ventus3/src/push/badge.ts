// src/push/badge.ts
// El contador del ícono (`navigator.setAppBadge`).
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ CUENTA EL BADGE — Y QUÉ NO
// ══════════════════════════════════════════════════════════════════════════
// El badge cuenta **lo que espera una decisión**: tarjetas del día sin
// resolver y propuestas del Ventus sin revisar. NO cuenta avisos recibidos.
// La diferencia importa: un badge que cuenta avisos convierte el ícono en el
// mismo ruido que ya destruyó las notificaciones del v2 —4.521 mensajes, 0,0%
// de lectura—, y encima uno que no se puede silenciar. Un badge que cuenta
// trabajo pendiente se apaga solo cuando el trabajo se hizo, que es el único
// contador que un vendedor va a respetar.
//
// SOPORTE REAL
//   Android/Chrome instalado  → sí
//   iOS instalado (16.4+)     → sí
//   Cualquiera en pestaña     → la API existe pero el badge no se ve
//   Firefox                   → no existe
// Por eso `badgeDisponivel()` y por eso nada de acá lanza: si no hay badge, no
// pasa nada y la app no se entera.

/** Techo del número. Arriba de esto los sistemas muestran «99+» o un punto. */
const TETO = 99

/**
 * La Badging API. No se declara como `extends Navigator` porque las libs de
 * TypeScript ya la traen NO opcional: extenderla con `?` es un error de
 * compilación, y quitarle el `?` sería mentir sobre los navegadores que no la
 * tienen. Es una intersección, que es lo que describe la realidad.
 */
type NavigatorComBadge = Navigator & {
  setAppBadge?: (contagem?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function nav(): NavigatorComBadge | null {
  if (typeof navigator === 'undefined') return null
  return navigator as NavigatorComBadge
}

/** ¿Este aparato tiene la API? No dice si el badge se VE (pestaña vs instalado). */
export function badgeDisponivel(): boolean {
  const n = nav()
  return n !== null && typeof n.setAppBadge === 'function'
}

/**
 * Pone el contador. `0` o menos limpia el badge en vez de mostrar un cero
 * —un «0» en el ícono es ruido con forma de acusación.
 */
export async function definirBadge(contagem: number): Promise<void> {
  const n = nav()
  if (n === null || typeof n.setAppBadge !== 'function') return
  const valor = Math.max(0, Math.floor(Number.isFinite(contagem) ? contagem : 0))
  try {
    if (valor === 0) {
      await n.clearAppBadge?.()
      return
    }
    await n.setAppBadge(Math.min(valor, TETO))
  } catch {
    // Permiso revocado, modo privado, pestaña sin instalar: no es un error de
    // negocio. El badge es decoración útil, nunca una garantía.
  }
}

/** Apaga el badge. Se llama al cerrar el día y al abrir la Revisão vacía. */
export async function limparBadge(): Promise<void> {
  const n = nav()
  if (n === null) return
  try {
    await n.clearAppBadge?.()
  } catch {
    /* no-op */
  }
}
