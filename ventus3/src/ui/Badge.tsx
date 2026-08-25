// src/ui/Badge.tsx
// Badge: contador de pendências, punto de estado, sello de etapa.
// Nunca es interactivo: si hay que tocarlo, es un Chip.

import type { ReactNode } from 'react'
import { cx } from './utils'
import { TONE_SOFT, TONE_SOLID, TONE_TEXT, type Tone } from './tokens'

export interface BadgeProps {
  children?: ReactNode
  tone?: Tone
  variant?: 'solid' | 'soft' | 'outline'
  /** Punto sin texto: estado «online», «tem novidade». */
  dot?: boolean
  /** Texto alternativo para el lector de pantalla si el visual es un número. */
  'aria-label'?: string
  className?: string
}

export function Badge({
  children,
  tone = 'neutro',
  variant = 'soft',
  dot = false,
  'aria-label': ariaLabel,
  className,
}: BadgeProps) {
  if (dot) {
    return (
      <span
        role={ariaLabel ? 'img' : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        className={cx('inline-block size-2 rounded-pill', TONE_SOLID[tone].split(' ')[0], className)}
      />
    )
  }

  const estilos =
    variant === 'solid'
      ? TONE_SOLID[tone]
      : variant === 'outline'
        ? cx('border border-current bg-transparent', TONE_TEXT[tone])
        : TONE_SOFT[tone]

  return (
    <span
      aria-label={ariaLabel}
      className={cx(
        'inline-flex min-w-5 items-center justify-center rounded-pill px-1.5 py-0.5',
        'text-2xs font-bold leading-4 tracking-tight tnum',
        estilos,
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Contador con corte en 99+, como el de la bottom nav. */
export function CountBadge({
  count,
  tone = 'perigo',
  label,
}: {
  count: number
  tone?: Tone
  label?: string
}) {
  if (count <= 0) return null
  return (
    <Badge tone={tone} variant="solid" aria-label={label ?? `${count} pendências`}>
      {count > 99 ? '99+' : count}
    </Badge>
  )
}
