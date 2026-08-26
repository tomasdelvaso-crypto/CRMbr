// src/ui/hooks.ts
// Hooks de UI que no son componentes. Viven aparte para no romper el fast
// refresh (un archivo que exporta un componente Y una constante suelta deja de
// recargar en caliente) y para que cualquier pantalla los use sin importar de
// un módulo interno.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** Sin `window` ni `matchMedia` (jsdom del smoke test) nada combina. */
function temMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * Media query reactiva, montada con `useSyncExternalStore`: el valor se lee en
 * el mismo render, sin un frame intermedio en `false` y sin un setState dentro
 * de un efecto (que dispara un render en cascada).
 *
 * Se usa para el ÚNICO caso legítimo de layout distinto en esta app: el kanban
 * de Cadência existe solo en md+. En móvil, el kanban es scroll anidado dentro
 * del scroll de la página y eso está prohibido.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (aoMudar: () => void) => {
      if (!temMatchMedia()) return () => undefined
      const mql = window.matchMedia(query)
      // addEventListener('change') no existe en Safari < 14: el fallback a
      // addListener mantiene vivo el iPhone que todavía hay en la calle.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', aoMudar)
        return () => mql.removeEventListener('change', aoMudar)
      }
      mql.addListener(aoMudar)
      return () => mql.removeListener(aoMudar)
    },
    [query],
  )

  const ler = useCallback(() => (temMatchMedia() ? window.matchMedia(query).matches : false), [query])

  return useSyncExternalStore(subscribe, ler, () => false)
}

/** Breakpoint `md` de Tailwind. Arriba de esto hay espacio para dos columnas. */
export const CONSULTA_TELA_LARGA = '(min-width: 768px)'

/** `true` en tablet y desktop. En móvil, siempre `false`. */
export function useTelaLarga(): boolean {
  return useMediaQuery(CONSULTA_TELA_LARGA)
}

/**
 * Breakpoint `lg` de Tailwind: EXACTAMENTE el mismo en el que aparece el
 * DesktopRail y desaparece la BottomNav (ver src/index.css). Arriba de esto
 * hay una segunda columna de verdad, no dos mitades apretadas.
 */
export const CONSULTA_ESCRITORIO = '(min-width: 1024px)'

/**
 * `true` sólo en escritorio.
 *
 * Se usa donde el layout ancho no se puede expresar con clases `lg:` porque
 * cambia QUÉ SE RENDERIZA y no sólo cómo se ve — la tela Hoje manda la
 * corrente do time y la racha a una columna secundaria a la derecha, y eso es
 * un árbol distinto, no un `display` distinto. Que sea un hook y no CSS es
 * además la garantía de que el teléfono ve el MISMO árbol de siempre: por
 * debajo de 1024 px esta rama ni existe.
 */
export function useTelaEscritorio(): boolean {
  return useMediaQuery(CONSULTA_ESCRITORIO)
}

/**
 * Pantallas CORTAS, medidas por alto y no por ancho.
 *
 * El número no es un gusto: sale de la cuenta de la tela Hoje. Su ventana de
 * scroll es `100svh` menos el header (57), la bottom nav (65) y la barra de
 * comando del Ventus (66) — 188 px de chrome. El bloque de arriba en su forma
 * completa más la primera tarjeta miden 684 px, así que el layout completo
 * necesita `100svh >= 872`. Por debajo de eso la primera tarjeta se corta, que
 * es justo lo que la pantalla no puede permitirse.
 *
 * 880 px deja adentro a los dos teléfonos del equipo —el iPhone 14 da 664 px
 * de viewport y el Pixel 7, con la barra de Chrome puesta, 839— y afuera al
 * escritorio y a la tablet, donde sobra lugar y el orden es el del PLANO.
 */
export const CONSULTA_TELA_CURTA = '(max-height: 880px)'

/** `true` donde la tela Hoje no entra sin compactarse. */
export function useTelaCurta(): boolean {
  return useMediaQuery(CONSULTA_TELA_CURTA)
}

/**
 * Valor con retardo. El buscador de la Carteira filtra 65 filas en memoria,
 * pero el `setState` por tecla más el re-render de la lista virtualizada hacen
 * que el teclado de un Android de gama media se sienta pegajoso. 200ms es el
 * punto donde deja de notarse el retraso y deja de trabarse el tipeo.
 *
 * Con `ms <= 0` el hook es transparente: devuelve el valor tal cual, sin
 * programar nada ni pasar por un estado intermedio.
 */
export function useDebouncedValue<T>(valor: T, ms = 200): T {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    if (ms <= 0) return
    const id = window.setTimeout(() => setAtrasado(valor), ms)
    return () => window.clearTimeout(id)
  }, [valor, ms])

  return ms <= 0 ? valor : atrasado
}
