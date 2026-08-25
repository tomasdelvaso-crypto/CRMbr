// src/host/ponte-telegram.ts
// La frontera con `window.Telegram.WebApp`: el ÚNICO archivo del bundle que
// sabe cómo se llaman los métodos de Telegram.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES REGLAS DE ESTA FRONTERA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NO SE AUMENTA `Window` GLOBALMENTE. `src/ui/haptic.ts` ya declara
//    `Window.Telegram` con la forma que necesita (solo HapticFeedback). Un
//    segundo `declare global` con otra forma es un error de compilación
//    («Subsequent property declarations must have the same type») y arreglarlo
//    obligaría a que los dos módulos compartan un tipo — es decir, a que el
//    design system dependa de la capa de host. Acá se lee `window` con un cast
//    local y se acabó.
//
// 2. EL CLIENTE DE TELEGRAM PUEDE SER VIEJO. El objeto `WebApp` existe siempre,
//    pero los métodos aparecen por versión: `setHeaderColor` en 6.1,
//    `SecondaryButton` en 7.10, `requestFullscreen`/`addToHomeScreen` en 8.0,
//    `safeAreaInset` en 8.0. Comprobar el namespace no alcanza: hay que
//    comprobar el MÉTODO. Por eso todo pasa por `tem()` y por `chamar()`.
//
// 3. NADA DE ACÁ PUEDE LANZAR. Un Mini App que revienta porque el cliente de
//    Telegram es de hace dos años es un vendedor sin CRM en la puerta de una
//    planta. Todas las llamadas van envueltas y devuelven un valor de fallo.

/* ══════════════════════════════════════════════════════════════════════════
   Tipos del subconjunto que usamos
   ══════════════════════════════════════════════════════════════════════════ */

/** Los 14 theme params documentados por Telegram. */
export interface ThemeParamsTelegram {
  bg_color?: string
  secondary_bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  header_bg_color?: string
  bottom_bar_bg_color?: string
  accent_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  section_separator_color?: string
  subtitle_text_color?: string
  destructive_text_color?: string
}

export interface UsuarioTelegramWebApp {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
}

export interface InsetTelegram {
  top: number
  bottom: number
  left: number
  right: number
}

export interface BotaoTelegram {
  text?: string
  isVisible?: boolean
  isActive?: boolean
  isProgressVisible?: boolean
  setText?(texto: string): void
  show?(): void
  hide?(): void
  enable?(): void
  disable?(): void
  showProgress?(deixarAtivo?: boolean): void
  hideProgress?(): void
  onClick?(cb: () => void): void
  offClick?(cb: () => void): void
  setParams?(params: Record<string, unknown>): void
}

export interface BackButtonTelegram {
  isVisible?: boolean
  show?(): void
  hide?(): void
  onClick?(cb: () => void): void
  offClick?(cb: () => void): void
}

export interface CloudStorageTelegram {
  setItem?(chave: string, valor: string, cb?: (erro: string | null, ok?: boolean) => void): void
  getItem?(chave: string, cb: (erro: string | null, valor?: string) => void): void
  removeItem?(chave: string, cb?: (erro: string | null, ok?: boolean) => void): void
  getKeys?(cb: (erro: string | null, chaves?: string[]) => void): void
}

/** Eventos que escuchamos. Telegram tiene más; estos son los que importan. */
export type EventoTelegram =
  | 'themeChanged'
  | 'viewportChanged'
  | 'safeAreaChanged'
  | 'contentSafeAreaChanged'
  | 'fullscreenChanged'
  | 'fullscreenFailed'
  | 'homeScreenAdded'
  | 'homeScreenChecked'
  | 'mainButtonClicked'
  | 'secondaryButtonClicked'
  | 'backButtonClicked'

export interface WebAppTelegram {
  initData?: string
  initDataUnsafe?: { user?: UsuarioTelegramWebApp; start_param?: string; query_id?: string }
  version?: string
  platform?: string
  colorScheme?: 'light' | 'dark'
  themeParams?: ThemeParamsTelegram
  isExpanded?: boolean
  isFullscreen?: boolean
  viewportHeight?: number
  viewportStableHeight?: number
  safeAreaInset?: InsetTelegram
  contentSafeAreaInset?: InsetTelegram

  MainButton?: BotaoTelegram
  SecondaryButton?: BotaoTelegram
  BackButton?: BackButtonTelegram
  CloudStorage?: CloudStorageTelegram

  ready?(): void
  expand?(): void
  close?(): void
  isVersionAtLeast?(versao: string): boolean
  setHeaderColor?(cor: string): void
  setBackgroundColor?(cor: string): void
  setBottomBarColor?(cor: string): void
  enableClosingConfirmation?(): void
  disableClosingConfirmation?(): void
  disableVerticalSwipes?(): void
  enableVerticalSwipes?(): void
  requestFullscreen?(): void
  exitFullscreen?(): void
  addToHomeScreen?(): void
  checkHomeScreenStatus?(cb: (status: string) => void): void
  openTelegramLink?(url: string): void
  onEvent?(evento: EventoTelegram, cb: (...args: unknown[]) => void): void
  offEvent?(evento: EventoTelegram, cb: (...args: unknown[]) => void): void
}

/* ══════════════════════════════════════════════════════════════════════════
   Acceso
   ══════════════════════════════════════════════════════════════════════════ */

interface JanelaComTelegram {
  Telegram?: { WebApp?: WebAppTelegram }
}

/** El objeto `WebApp`, o null si no estamos dentro de Telegram. */
export function webApp(): WebAppTelegram | null {
  if (typeof window === 'undefined') return null
  const janela = window as unknown as JanelaComTelegram
  return janela.Telegram?.WebApp ?? null
}

/**
 * ¿Estamos DENTRO de un Mini App de verdad?
 *
 * Que exista `window.Telegram.WebApp` no alcanza: el script `telegram-web-app.js`
 * se puede cargar en cualquier página y deja el objeto puesto con `initData`
 * vacío. La marca real de que Telegram nos abrió es que haya initData —o, en
 * los casos donde Telegram no lo entrega (algunos `startattach`), que la URL
 * traiga los parámetros `tgWebApp*` que el cliente inyecta al abrir.
 */
export function dentroDoTelegram(): boolean {
  const app = webApp()
  if (app === null) return false
  if (typeof app.initData === 'string' && app.initData !== '') return true
  if (typeof window === 'undefined') return false
  const bruto = `${window.location.search}${window.location.hash}`
  return bruto.includes('tgWebApp')
}

/** El initData CRUDO. Lo único que el servidor puede verificar. */
export function initDataCru(): string {
  const app = webApp()
  return typeof app?.initData === 'string' ? app.initData : ''
}

/* ══════════════════════════════════════════════════════════════════════════
   Llamadas seguras
   ══════════════════════════════════════════════════════════════════════════ */

/** ¿El cliente de Telegram implementa este método? */
export function tem<K extends keyof WebAppTelegram>(metodo: K): boolean {
  const app = webApp()
  return app !== null && typeof app[metodo] === 'function'
}

/**
 * Llama a un método del WebApp. Devuelve `true` si se llegó a llamar.
 * Nunca lanza: un cliente viejo devuelve false y la app sigue con el camino web.
 */
export function chamar(metodo: keyof WebAppTelegram, ...args: unknown[]): boolean {
  const app = webApp()
  if (app === null) return false
  const fn = app[metodo]
  if (typeof fn !== 'function') return false
  try {
    ;(fn as (...a: unknown[]) => unknown).apply(app, args)
    return true
  } catch (erro) {
    console.error(`[host/telegram] ${String(metodo)} falhou:`, erro)
    return false
  }
}

/** Igual que `chamar` pero sobre un sub-objeto (MainButton, CloudStorage…). */
export function chamarEm<T extends object>(
  alvo: T | undefined,
  metodo: keyof T,
  ...args: unknown[]
): boolean {
  if (alvo === undefined || alvo === null) return false
  const fn = alvo[metodo]
  if (typeof fn !== 'function') return false
  try {
    ;(fn as (...a: unknown[]) => unknown).apply(alvo, args)
    return true
  } catch (erro) {
    console.error(`[host/telegram] ${String(metodo)} falhou:`, erro)
    return false
  }
}

/** `isVersionAtLeast` con respuesta segura para clientes que no lo tienen. */
export function versaoPeloMenos(versao: string): boolean {
  const app = webApp()
  if (app === null) return false
  if (typeof app.isVersionAtLeast !== 'function') return false
  try {
    return app.isVersionAtLeast(versao) === true
  } catch {
    return false
  }
}

/** Suscribe un evento y devuelve el desinstalador. No-op fuera de Telegram. */
export function ouvir(evento: EventoTelegram, cb: (...args: unknown[]) => void): () => void {
  const app = webApp()
  if (app === null || typeof app.onEvent !== 'function') return () => undefined
  try {
    app.onEvent(evento, cb)
  } catch {
    return () => undefined
  }
  return () => {
    try {
      app.offEvent?.(evento, cb)
    } catch {
      /* el puente puede desaparecer al cerrar el Mini App */
    }
  }
}

/** Plataforma reportada por el cliente: 'ios', 'android', 'tdesktop', 'weba'… */
export function plataforma(): string {
  return webApp()?.platform ?? 'unknown'
}
