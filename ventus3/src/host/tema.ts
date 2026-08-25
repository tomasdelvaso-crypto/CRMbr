// src/host/tema.ts
// Los 14 theme params de Telegram, mapeados a los tokens de src/index.css.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ SE MAPEA Y NO SE IGNORA
// ══════════════════════════════════════════════════════════════════════════
// Dentro de Telegram, una app que no respeta el tema del cliente se ve como
// una página web incrustada. Con los tokens mapeados —fondo, superficie,
// texto, bordes— el Mini App se ve como una pantalla más de Telegram, y eso
// es la mitad de la sensación de «app instalada» que la PWA en iOS no puede
// dar. El vendedor cambia el tema en Telegram y el CRM lo sigue en el acto,
// porque `themeChanged` se escucha de verdad.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ NO SE PISAN TODOS LOS TOKENS A CIEGAS
// ══════════════════════════════════════════════════════════════════════════
// Los 14 params se escriben SIEMPRE como variables `--tg-*`, así están
// disponibles para cualquier pantalla que quiera ser literal. Pero sobre los
// tokens del design system solo se vuelcan los que forman PAR legible:
//
//   · fondo/superficie/texto/borde   → se vuelcan (son el chrome)
//   · button_color/button_text_color → se vuelcan JUNTOS, y si Telegram
//     manda uno sin el otro, el foreground se deriva de la luminancia. Un
//     `--color-brand` claro con `--color-brand-fg` blanco heredado es un
//     botón ilegible al sol, que es donde se usa esta app.
//   · link/accent/destructive        → se vuelcan solo el color sólido; las
//     variantes `-soft` y `-soft-fg` del design system NO se tocan, porque
//     están calculadas en oklch para dar contraste AA sobre el fondo suave y
//     Telegram no manda con qué reemplazarlas.
//
// Los colores semánticos de negocio —ok / warn / danger de las escalas y los
// anillos— NO se tocan nunca: el verde del anillo de Avanço significa algo y
// no puede depender del tema que el vendedor eligió en Telegram.

import { ouvir, webApp, type ThemeParamsTelegram } from './ponte-telegram'

/** Los 14 params documentados, en el orden de la documentación de Telegram. */
export const PARAMS_DE_TEMA = [
  'bg_color',
  'secondary_bg_color',
  'text_color',
  'hint_color',
  'link_color',
  'button_color',
  'button_text_color',
  'header_bg_color',
  'bottom_bar_bg_color',
  'accent_text_color',
  'section_bg_color',
  'section_header_text_color',
  'section_separator_color',
  'subtitle_text_color',
  'destructive_text_color',
] as const satisfies ReadonlyArray<keyof ThemeParamsTelegram>

/**
 * Qué token del design system recibe cada param.
 * Lo que no está acá se expone solo como `--tg-<param>`.
 */
const TOKENS: Readonly<Partial<Record<keyof ThemeParamsTelegram, string>>> = {
  bg_color: '--color-bg',
  section_bg_color: '--color-surface',
  secondary_bg_color: '--color-surface-2',
  text_color: '--color-fg',
  hint_color: '--color-fg-muted',
  subtitle_text_color: '--color-fg-subtle',
  section_separator_color: '--color-border',
  link_color: '--color-info',
  accent_text_color: '--color-accent',
  destructive_text_color: '--color-danger',
  section_header_text_color: '--color-fg-subtle',
}

/* ══════════════════════════════════════════════════════════════════════════
   Color
   ══════════════════════════════════════════════════════════════════════════ */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Normaliza a `#rrggbb`. null si no es un hex — Telegram a veces manda vacío. */
export function normalizarCor(bruto: string | undefined | null): string | null {
  if (typeof bruto !== 'string') return null
  const texto = bruto.trim()
  if (!HEX.test(texto)) return null
  const corpo = texto.replace('#', '')
  const cheio =
    corpo.length === 3
      ? corpo
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : corpo
  return `#${cheio.toLowerCase()}`
}

/** Luminancia relativa (WCAG). Se usa para elegir texto claro u oscuro. */
export function luminancia(hex: string): number {
  const cor = normalizarCor(hex)
  if (cor === null) return 0
  const canal = (i: number): number => {
    const v = parseInt(cor.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
}

/**
 * Texto legible sobre un fondo. El umbral 0,45 —y no 0,5— porque el error
 * caro es el texto claro sobre un fondo medio, que al sol desaparece.
 */
export function corDeTextoSobre(fundo: string): string {
  return luminancia(fundo) > 0.45 ? '#0b1220' : '#ffffff'
}

/* ══════════════════════════════════════════════════════════════════════════
   Aplicación
   ══════════════════════════════════════════════════════════════════════════ */

/** Todo lo que este módulo escribe, para poder deshacerlo entero. */
const escritas = new Set<string>()

function escrever(raiz: HTMLElement, prop: string, valor: string): void {
  raiz.style.setProperty(prop, valor)
  escritas.add(prop)
}

/**
 * Vuelca los theme params sobre el `:root`. Idempotente: se puede llamar en
 * cada `themeChanged` sin acumular nada.
 *
 * Devuelve cuántos tokens del design system quedaron sobrescritos — 0 significa
 * que Telegram no mandó ningún color usable y que la app se queda con su
 * paleta, que es el comportamiento correcto y no un fallo.
 */
export function aplicarTema(params: ThemeParamsTelegram | undefined): number {
  if (typeof document === 'undefined') return 0
  const raiz = document.documentElement
  if (params === undefined || params === null) return 0

  let aplicados = 0
  for (const nome of PARAMS_DE_TEMA) {
    const cor = normalizarCor(params[nome])
    if (cor === null) continue
    // 1. Siempre disponible en crudo.
    escrever(raiz, `--tg-${nome.replace(/_/g, '-')}`, cor)
    // 2. Y sobre el token del design system, si le corresponde uno.
    const token = TOKENS[nome]
    if (token !== undefined) {
      escrever(raiz, token, cor)
      aplicados += 1
    }
  }

  // El par del botón primario va junto o no va.
  const botao = normalizarCor(params.button_color)
  if (botao !== null) {
    escrever(raiz, '--color-brand', botao)
    escrever(raiz, '--color-brand-strong', botao)
    escrever(raiz, '--color-brand-fg', normalizarCor(params.button_text_color) ?? corDeTextoSobre(botao))
    aplicados += 1
  }

  // Bordes: Telegram no siempre manda `section_separator_color`. Sin borde
  // visible las tarjetas se funden con el fondo; se deriva del texto con alpha.
  if (normalizarCor(params.section_separator_color) === null) {
    const texto = normalizarCor(params.text_color)
    if (texto !== null) escrever(raiz, '--color-border', `color-mix(in oklab, ${texto} 14%, transparent)`)
  }

  return aplicados
}

/** Devuelve el `:root` a la paleta propia. Se usa al salir del Mini App. */
export function limparTema(): void {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  for (const prop of escritas) raiz.style.removeProperty(prop)
  escritas.clear()
}

/**
 * Aplica el tema actual y se queda escuchando `themeChanged`.
 * Devuelve el desinstalador. Fuera de Telegram no hace nada.
 */
export function conectarTema(): () => void {
  const app = webApp()
  if (app === null) return () => undefined

  const sincronizar = (): void => {
    aplicarTema(app.themeParams)
    // El header y la barra inferior del cliente se pintan con nuestro fondo:
    // sin esto queda una franja de otro color arriba de la app.
    const fundo = normalizarCor(app.themeParams?.bg_color)
    if (fundo !== null) {
      app.setHeaderColor?.(fundo)
      app.setBackgroundColor?.(fundo)
      app.setBottomBarColor?.(fundo)
    }
  }

  sincronizar()
  return ouvir('themeChanged', sincronizar)
}

/* ══════════════════════════════════════════════════════════════════════════
   Safe areas
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Telegram no le pasa al WebView los `env(safe-area-inset-*)` del sistema: los
 * reporta por su cuenta, y además agrega los suyos —el header del cliente, la
 * barra de arrastre— en `contentSafeAreaInset`. Si no se suman los dos, el
 * título de la pantalla queda debajo del botón de cerrar del Mini App.
 *
 * Se escriben las MISMAS variables que define `src/index.css` (`--safe-top` y
 * compañía) porque toda la app ya las consume. Inline en el elemento raíz gana
 * sobre la regla de `:root`, así que no hay que tocar el CSS.
 */
export function aplicarSafeAreas(): void {
  const app = webApp()
  if (app === null || typeof document === 'undefined') return
  const raiz = document.documentElement

  const soma = (lado: 'top' | 'bottom' | 'left' | 'right'): number =>
    Math.max(0, Math.round((app.safeAreaInset?.[lado] ?? 0) + (app.contentSafeAreaInset?.[lado] ?? 0)))

  escrever(raiz, '--safe-top', `${String(soma('top'))}px`)
  escrever(raiz, '--safe-bottom', `${String(soma('bottom'))}px`)
  escrever(raiz, '--safe-left', `${String(soma('left'))}px`)
  escrever(raiz, '--safe-right', `${String(soma('right'))}px`)
}

/** Aplica las safe areas y escucha los dos eventos que las cambian. */
export function conectarSafeAreas(): () => void {
  if (webApp() === null) return () => undefined
  aplicarSafeAreas()
  const desligar = [
    ouvir('safeAreaChanged', aplicarSafeAreas),
    ouvir('contentSafeAreaChanged', aplicarSafeAreas),
    ouvir('viewportChanged', aplicarSafeAreas),
    ouvir('fullscreenChanged', aplicarSafeAreas),
  ]
  return () => {
    for (const d of desligar) d()
  }
}
