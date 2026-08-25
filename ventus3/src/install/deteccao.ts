// src/install/deteccao.ts
// Dónde está parada la app: plataforma, navegador y modo de visualización.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ HAY TANTOS CASOS
// ══════════════════════════════════════════════════════════════════════════
// «¿Se puede instalar?» no tiene una respuesta sola:
//
//  · Android/Chrome  → hay evento (`beforeinstallprompt`) y diálogo nativo.
//  · iOS/Safari      → no hay evento ni diálogo: Compartilhar → Adicionar à
//                      Tela de Início, a mano. Y sin eso NO HAY PUSH en iOS.
//  · iOS/Chrome-Firefox-Instagram → el gesto de arriba NI SIQUIERA EXISTE en
//                      ese navegador. Ofrecerlo manda a la persona a buscar
//                      un botón que no está. Hay que decirle que abra Safari.
//  · Ya instalada    → cualquier invitación es ruido y quema credibilidad.
//  · TWA / Telegram  → ya es una app; no se ofrece nada.
//
// Todo lo de acá es lectura pura del entorno, sin estado y sin efectos: se
// puede llamar desde un render sin miedo.

export type Plataforma = 'ios' | 'android' | 'desktop'

/** Navegadores que importan para el flujo de instalación. */
export type Navegador = 'safari' | 'chromium' | 'firefox' | 'outro'

/** Cómo se está viendo la app ahora mismo. */
export type ModoDeExibicao = 'browser' | 'standalone' | 'twa' | 'telegram'

/** Sin `window` (tests en Node, SSR) todo se responde con el caso neutro. */
function temJanela(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
}

export function detectarPlataforma(): Plataforma {
  if (!temJanela()) return 'desktop'
  const ua = navigator.userAgent
  // El iPad moderno se anuncia como Macintosh: el desempate es el táctil.
  const ehIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document)
  if (ehIOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function detectarNavegador(): Navegador {
  if (!temJanela()) return 'outro'
  const ua = navigator.userAgent
  // En iOS TODOS los navegadores son WebKit, así que el UA es lo único que
  // los distingue: CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge.
  if (/CriOS|Chrome|Chromium|Edg|EdgiOS|SamsungBrowser|OPR/.test(ua)) return 'chromium'
  if (/FxiOS|Firefox/.test(ua)) return 'firefox'
  if (/Safari/.test(ua)) return 'safari'
  return 'outro'
}

/**
 * ¿Es el Safari de verdad? Es la única puerta a «Adicionar à Tela de Início»
 * en iOS: en Chrome/Firefox/Instagram de iPhone esa opción no existe.
 */
export function ehSafariDeIOS(): boolean {
  return detectarPlataforma() === 'ios' && detectarNavegador() === 'safari'
}

/** ¿La app está corriendo instalada? */
export function estaInstalado(): boolean {
  return modoDeExibicao() !== 'browser'
}

export function modoDeExibicao(): ModoDeExibicao {
  if (!temJanela()) return 'browser'
  // El Mini App de Telegram inyecta su objeto antes que corra nuestro código.
  const comTelegram = window as unknown as { Telegram?: { WebApp?: unknown } }
  if (comTelegram.Telegram?.WebApp) return 'telegram'
  // La TWA de Android llega por el referrer del intent.
  if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) {
    return 'twa'
  }
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone'
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'standalone'
    if (window.matchMedia('(display-mode: fullscreen)').matches) return 'standalone'
  }
  // iOS: la propiedad legacy es la única señal en Safari viejo.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return 'standalone'
  return 'browser'
}

/**
 * Avisa cuando el modo de visualización cambia sin recargar. Pasa de verdad:
 * el vendedor instala la app y la abre desde el ícono con la pestaña viva.
 */
export function observarModo(aoMudar: (modo: ModoDeExibicao) => void): () => void {
  if (!temJanela() || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia('(display-mode: standalone)')
  const escuta = () => aoMudar(modoDeExibicao())
  mq.addEventListener('change', escuta)
  window.addEventListener('appinstalled', escuta)
  return () => {
    mq.removeEventListener('change', escuta)
    window.removeEventListener('appinstalled', escuta)
  }
}
