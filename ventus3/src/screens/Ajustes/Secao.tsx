// src/screens/Ajustes/Secao.tsx
// El envoltorio de cada bloque de Ajustes.
//
// Ajustes es una pantalla larga por naturaleza, y una pantalla larga sin
// jerarquía se recorre con el pulgar sin leer. Cada sección tiene título,
// una línea que dice PARA QUÉ sirve (no qué hace: para qué sirve) y una
// tarjeta. La línea de propósito es lo que evita el «no toco esto porque no
// sé qué rompe».

import type { ReactNode } from 'react'
import { Card } from '@/ui'

export interface SecaoProps {
  titulo: string
  /** Una línea en PT-BR sobre para qué sirve la sección. */
  proposito?: string
  icone?: ReactNode
  /** Acción a la derecha del título (ej. «Ver regras»). */
  acao?: ReactNode
  children: ReactNode
  /** Sin tarjeta: la sección trae sus propias tarjetas adentro. */
  nu?: boolean
}

export function Secao({ titulo, proposito, icone, acao, children, nu = false }: SecaoProps) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="flex items-start justify-between gap-3 px-1 pb-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {icone}
            {titulo}
          </h2>
          {proposito && (
            <p className="mt-1 text-xs leading-snug text-fg-muted">{proposito}</p>
          )}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {nu ? children : <Card padding="md">{children}</Card>}
    </section>
  )
}

/** Separador entre controles dentro de una misma tarjeta. */
export function Divisor() {
  return <hr className="my-4 border-t border-border" />
}
