// src/ui/Card.tsx
// Contenedor de contenido. Si es tocable se renderiza como <button> real:
// nada de divs con onClick, que el lector de pantalla no anuncia.

import type { ReactNode, Ref } from 'react'
import { cx } from './utils'
import { haptic } from './haptic'
import { TONE_BORDER, type Tone } from './tokens'

export interface CardProps {
  children: ReactNode
  /** Convierte la card en un control tocable. */
  onClick?: () => void
  /** Franja de color a la izquierda: semáforo de riesgo de la Carteira. */
  accent?: Tone
  /** Sin sombra ni fondo: para agrupar sin peso visual. */
  flat?: boolean
  /** Padding interno. `none` cuando la card contiene una lista a sangre. */
  padding?: 'none' | 'sm' | 'md'
  /** Nombre de view-transition para el morph lista → ficha. */
  viewTransitionName?: string
  className?: string
  'aria-label'?: string
  ref?: Ref<HTMLDivElement>
}

const PADDINGS = { none: '', sm: 'p-3', md: 'p-4' } as const

export function Card({
  children,
  onClick,
  accent,
  flat = false,
  padding = 'md',
  viewTransitionName,
  className,
  'aria-label': ariaLabel,
  ref,
}: CardProps) {
  const base = cx(
    'relative w-full overflow-hidden rounded-card text-left',
    flat ? 'bg-transparent' : 'border border-border bg-surface shadow-card',
    PADDINGS[padding],
    accent ? 'pl-4' : '',
    className,
  )

  const conteudo = (
    <>
      {accent && (
        <span
          aria-hidden
          className={cx(
            'absolute inset-y-0 left-0 w-1 border-l-4 rounded-l-card',
            TONE_BORDER[accent],
          )}
        />
      )}
      {children}
    </>
  )

  const estilo = viewTransitionName ? { viewTransitionName } : undefined

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        style={estilo}
        onClick={() => {
          haptic('tap')
          onClick()
        }}
        className={cx(
          base,
          'min-h-touch tap-highlight-none transition-transform duration-150 ease-ios',
          'active:scale-[0.985] active:bg-surface-2 lg:hover:bg-surface-2',
        )}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <div ref={ref} aria-label={ariaLabel} style={estilo} className={base}>
      {conteudo}
    </div>
  )
}

/** Cabecera de card: título a la izquierda, acción o badge a la derecha. */
export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="truncate text-base font-semibold tracking-tight">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
