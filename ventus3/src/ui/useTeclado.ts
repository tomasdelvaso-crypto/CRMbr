// src/ui/useTeclado.ts
// Cuánto del viewport se está comiendo el teclado, en px.
//
// El problema real (M22): en Android el teclado NO redimensiona el layout
// viewport, así que `position: fixed; bottom: 0` queda DEBAJO del teclado y la
// barra con «Confirmar» desaparece justo cuando el vendedor terminó de
// escribir. En iOS el layout viewport tampoco se mueve: la página entera se
// desplaza y el fixed queda flotando en el medio.
//
// La única medida honesta es visualViewport:
//
//   sobra = innerHeight − (visualViewport.height + visualViewport.offsetTop)
//
// `offsetTop` importa: en iOS, cuando el usuario hace pinch-zoom o el teclado
// empuja la página, el visual viewport se corre hacia abajo y sin ese término
// la barra queda 40-80px arriba de donde debería.
//
// Se redondea y se ignora todo lo que esté por debajo de 80px: las barras de
// URL que se retraen mueven el viewport 40-60px y eso NO es un teclado.

import { useEffect, useState } from 'react'

/** Por debajo de esto no es teclado, es la barra del navegador. */
const LIMIAR_PX = 80

export function useAlturaDoTeclado(): number {
  const [altura, setAltura] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const medir = () => {
      cancelAnimationFrame(raf)
      // rAF: en iOS los eventos de resize llegan durante la animación del
      // teclado y leer sin coalescer produce un salto por frame.
      raf = requestAnimationFrame(() => {
        const sobra = window.innerHeight - (vv.height + vv.offsetTop)
        setAltura(sobra > LIMIAR_PX ? Math.round(sobra) : 0)
      })
    }

    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])

  return altura
}
