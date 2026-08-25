// src/ui/internals.ts
// Hooks internos del design system: bloqueo de scroll, focus trap y captura
// del botón «atrás» del sistema. No se exportan desde src/ui/index.ts.

import { useCallback, useEffect, useRef, type RefObject } from 'react'

/* ── Ref «siempre al día» ──────────────────────────────────────────────────
   Guarda el último valor de un callback para poder usarlo dentro de un
   listener sin volver a suscribirlo en cada render. La asignación va en un
   efecto (nunca en render): escribir un ref durante el render rompe el
   modelo concurrente de React 19. */

export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/* ── Bloqueo de scroll del body ────────────────────────────────────────────
   Con contador, porque un sheet puede abrir otro sheet (editar escala desde
   el dossiê) y el primero en cerrarse no puede desbloquear al de arriba. */

let travas = 0

export function useScrollLock(activo: boolean): void {
  useEffect(() => {
    if (!activo || typeof document === 'undefined') return
    travas += 1
    document.body.dataset['ventusScrollLock'] = '1'
    return () => {
      travas = Math.max(0, travas - 1)
      if (travas === 0) delete document.body.dataset['ventusScrollLock']
    }
  }, [activo])
}

/* ── Focus trap ────────────────────────────────────────────────────────── */

const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

/**
 * Encierra el foco dentro de `ref` mientras `activo`. Al desactivarse devuelve
 * el foco al elemento que lo tenía antes: sin esto, cerrar un sheet con el
 * teclado deja al lector de pantalla en el <body>.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, activo: boolean): void {
  const anterior = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!activo) return
    const raiz = ref.current
    if (!raiz) return

    anterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // El primer foco va al contenedor, no al primer botón: si no, el lector de
    // pantalla anuncia «Confirmar» antes que el título del sheet.
    const id = window.setTimeout(() => {
      if (raiz.contains(document.activeElement)) return
      raiz.focus({ preventScroll: true })
    }, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const lista = focaveis(raiz)
      if (lista.length === 0) {
        e.preventDefault()
        raiz.focus({ preventScroll: true })
        return
      }
      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]
      if (!primeiro || !ultimo) return
      const ativo = document.activeElement
      if (e.shiftKey && (ativo === primeiro || ativo === raiz)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKeyDown, true)
      const volta = anterior.current
      if (volta && document.contains(volta)) volta.focus({ preventScroll: true })
    }
  }, [ref, activo])
}

/* ── Botón «atrás» del sistema ─────────────────────────────────────────────
   En Android (y en el gesto de borde de iOS dentro del TWA) el back tiene que
   cerrar el overlay, no salir de la pantalla. Se empuja una entrada de
   historial con la MISMA url: volver atrás no cambia de ruta. */

export function useBackDismiss(activo: boolean, onDismiss: () => void): void {
  const empurrado = useRef(false)
  const cb = useLatest(onDismiss)

  useEffect(() => {
    if (!activo || typeof window === 'undefined') return

    // El push va en un timeout de 0 ms, y eso NO es un rodeo: en desarrollo,
    // StrictMode monta el efecto, lo desmonta y lo vuelve a montar. Empujando
    // en el cuerpo del efecto, la limpieza del montaje descartado disparaba un
    // `history.back()` real, y el `popstate` que ese back genera llegaba
    // después — encima de la pantalla que acababa de abrir el overlay. El
    // síntoma era un diálogo de confirmación que se abría y se cerraba solo.
    // Con el push diferido, el montaje descartado no llega a empujar nada y la
    // limpieza no tiene qué deshacer. Para la persona no cambia nada: no hay
    // forma de apretar «atrás» en el mismo frame en que el overlay aparece.
    let id: number | null = window.setTimeout(() => {
      id = null
      window.history.pushState({ ventusOverlay: Date.now() }, '', window.location.href)
      empurrado.current = true
    }, 0)

    const onPop = () => {
      if (!empurrado.current) return
      empurrado.current = false
      cb.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      if (id !== null) window.clearTimeout(id)
      // Si el overlay se cerró por un botón (no por el back), hay que sacar
      // nuestra entrada del historial o el próximo back no hará nada.
      if (empurrado.current) {
        empurrado.current = false
        window.history.back()
      }
    }
  }, [activo, cb])
}

/* ── Escape ────────────────────────────────────────────────────────────── */

export function useEscape(activo: boolean, onEscape: () => void): void {
  const cb = useLatest(onEscape)

  useEffect(() => {
    if (!activo) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cb.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activo, cb])
}

/* ── Timeout con limpieza garantizada ──────────────────────────────────── */

export function useTimeoutFn(): (fn: () => void, ms: number) => () => void {
  const ids = useRef<number[]>([])

  useEffect(
    () => () => {
      for (const id of ids.current) window.clearTimeout(id)
      ids.current = []
    },
    [],
  )

  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    ids.current.push(id)
    return () => window.clearTimeout(id)
  }, [])
}
