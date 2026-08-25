// src/screens/Revisao/Colapsavel.tsx
// El colapso animado de una tarjeta resuelta.
//
// No usa SwipeRow.collapseOnAction a propósito: ahí el colapso arranca en el
// mismo frame que la acción, y en Revisão descartar abre PRIMERO el sheet de
// motivo. Si la tarjeta ya se hubiera plegado, cancelar el sheet dejaría un
// hueco. Acá el padre decide cuándo plegar, y solo cuando la decisión es firme.
//
// La animación es grid-template-rows 1fr → 0fr, que es la única forma de
// animar hasta `auto` sin medir alturas a mano. Con prefers-reduced-motion la
// tarjeta simplemente desaparece.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from '@/ui'

export interface ColapsavelProps {
  /** true dispara el pliegue. */
  saindo: boolean
  /** Se llama cuando la animación terminó y la fila puede desmontarse. */
  aoTerminar?: () => void
  children: ReactNode
}

/** Duración del pliegue. Corta a propósito: la bandeja tiene que sentirse rápida. */
const DURACAO_MS = 260

export function Colapsavel({ saindo, aoTerminar, children }: ColapsavelProps) {
  const [oculto, setOculto] = useState(false)
  const chamado = useRef(false)

  useEffect(() => {
    if (!saindo) return
    const reduzido = prefersReducedMotion()
    const t = setTimeout(
      () => {
        setOculto(true)
        if (!chamado.current) {
          chamado.current = true
          aoTerminar?.()
        }
      },
      reduzido ? 0 : DURACAO_MS,
    )
    return () => {
      clearTimeout(t)
    }
  }, [saindo, aoTerminar])

  if (oculto) return null

  return (
    <div
      aria-hidden={saindo}
      className="grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none"
      style={{
        gridTemplateRows: saindo ? '0fr' : '1fr',
        opacity: saindo ? 0 : 1,
        transitionDuration: `${String(DURACAO_MS)}ms`,
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}
