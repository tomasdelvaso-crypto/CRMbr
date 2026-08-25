// src/app/__tests__/setup-jsdom.ts
// Polyfills mínimos que jsdom no trae y que el design system SÍ usa.
// Se importa como primer módulo del test: los imports se evalúan en orden, así
// que esto corre antes de que cualquier componente lea window.matchMedia.

interface ListaDeMedia {
  matches: boolean
  media: string
  addEventListener: () => void
  removeEventListener: () => void
  addListener: () => void
  removeListener: () => void
  onchange: null
  dispatchEvent: () => boolean
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  // Todo en false: equivale a «modo claro, sin reduced motion», que es el
  // camino con MÁS código (las animaciones no se saltan).
  const matchMedia = (media: string): ListaDeMedia => ({
    matches: false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })
  Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverStub,
  })
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return []
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverStub,
  })
}

// React 19 exige esta bandera para que act() no avise en cada render.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
