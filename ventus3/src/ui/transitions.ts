// src/ui/transitions.ts
// Helpers de la View Transitions API con fallback total.
//
// Dos gramáticas, las únicas que usa la app:
//  · stack  → push / pop, como la pila de navegación de iOS y Android.
//  · morph  → un elemento compartido (el header de la ficha) interpola entre
//             dos pantallas. El CSS vive en src/index.css.
//
// Si el navegador no soporta la API (Firefox, Safari viejo) o el usuario pidió
// menos movimiento, la actualización se aplica igual, sin animación.

import { prefersReducedMotion } from './utils'

export type StackDirection = 'push' | 'pop'
export type TransitionKind = StackDirection | 'morph' | 'fade'

/** Función que aplica el cambio de estado/navegación a animar. */
export type UpdateCallback = () => void | Promise<void>

interface StartViewTransitionCapable {
  startViewTransition?: (cb: UpdateCallback) => { finished: Promise<void> }
}

/** `true` si el navegador puede animar transiciones de vista. */
export function suportaViewTransition(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & StartViewTransitionCapable
  return typeof doc.startViewTransition === 'function'
}

/**
 * Ejecuta `update` dentro de una view transition marcada con `kind`.
 * El `kind` se publica como `data-vt` en <html> para que el CSS elija la
 * animación; se limpia cuando la transición termina.
 */
export function runViewTransition(kind: TransitionKind, update: UpdateCallback): Promise<void> {
  const aplicar = async (): Promise<void> => {
    await update()
  }

  if (!suportaViewTransition() || prefersReducedMotion()) {
    return Promise.resolve(aplicar())
  }

  const raiz = document.documentElement
  raiz.dataset['vt'] = kind

  const doc = document as Document & StartViewTransitionCapable
  const start = doc.startViewTransition
  if (!start) {
    delete raiz.dataset['vt']
    return Promise.resolve(aplicar())
  }

  const transicao = start.call(doc, aplicar)
  return transicao.finished
    .catch(() => {
      // Una transición abortada (navegación encadenada) no es un error.
    })
    .finally(() => {
      delete raiz.dataset['vt']
    })
}

/** Navegación tipo stack: la pantalla nueva entra desde la derecha. */
export function pushTransition(update: UpdateCallback): Promise<void> {
  return runViewTransition('push', update)
}

/** Vuelta atrás: la pantalla actual sale hacia la derecha. */
export function popTransition(update: UpdateCallback): Promise<void> {
  return runViewTransition('pop', update)
}

/**
 * Morph de elemento compartido. Pone `view-transition-name` en el elemento
 * de origen, ejecuta la navegación y lo limpia al terminar.
 *
 * El elemento de destino tiene que declarar el MISMO nombre (por CSS o por
 * `style`), si no el navegador hace un cross-fade normal y no pasa nada malo.
 */
export function morphTransition(
  origem: HTMLElement | null,
  nome: string,
  update: UpdateCallback,
): Promise<void> {
  if (!origem || !suportaViewTransition() || prefersReducedMotion()) {
    return runViewTransition('morph', update)
  }

  origem.style.viewTransitionName = nome
  return runViewTransition('morph', update).finally(() => {
    origem.style.viewTransitionName = ''
  })
}

/**
 * Nombre de view-transition para un elemento, saneado.
 * `view-transition-name` no admite ni espacios ni empezar con dígito.
 */
export function viewTransitionName(prefixo: string, id: string | number): string {
  const limpo = String(id).replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${prefixo}-${limpo}`
}

/**
 * Decide la dirección de una navegación comparando profundidad de rutas.
 * Sirve para que el router elija push o pop sin que cada pantalla lo declare.
 */
export function direcaoEntreRotas(de: string, para: string): StackDirection {
  const a = de.split('/').filter(Boolean).length
  const b = para.split('/').filter(Boolean).length
  return b >= a ? 'push' : 'pop'
}
