// src/ui/Chip.tsx
// Chip: filtro activo, etiqueta editable de la tarjeta de confirmación de voz,
// «Por que isto?». Puede ser estático, tocable o removible.

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cx } from './utils'
import { haptic } from './haptic'
import { TONE_SOFT, TONE_SOLID, type Tone } from './tokens'

export interface ChipProps {
  children: ReactNode
  tone?: Tone
  /** Estado seleccionado: pasa a sólido. Usar con `onClick`. */
  selected?: boolean
  icon?: ReactNode
  onClick?: () => void
  /** Muestra la «x». Requiere `onRemove`. */
  onRemove?: () => void
  /** Rótulo del botón de quitar, para el lector de pantalla. */
  removeLabel?: string
  size?: 'sm' | 'md'
  className?: string
}

export function Chip({
  children,
  tone = 'neutro',
  selected = false,
  icon,
  onClick,
  onRemove,
  removeLabel,
  size = 'md',
  className,
}: ChipProps) {
  const base = cx(
    'inline-flex max-w-full items-center gap-1.5 rounded-pill font-medium tracking-tight',
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
    selected ? TONE_SOLID[tone] : TONE_SOFT[tone],
    className,
  )

  const corpo = (
    <>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </>
  )

  if (onClick) {
    return (
      <span className="inline-flex items-center">
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => {
            haptic('selection')
            onClick()
          }}
          className={cx(
            base,
            // El chip es más bajo que 44px a propósito (es una etiqueta densa),
            // así que se le agranda el área táctil sin agrandar el dibujo.
            'relative tap-highlight-none transition-transform duration-150 ease-ios active:scale-95',
            "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
            onRemove ? 'pr-1.5' : '',
          )}
        >
          {corpo}
          {onRemove && <RemoveDot onRemove={onRemove} label={removeLabel} />}
        </button>
      </span>
    )
  }

  return (
    <span className={cx(base, onRemove ? 'pr-1.5' : '')}>
      {corpo}
      {onRemove && <RemoveDot onRemove={onRemove} label={removeLabel} standalone />}
    </span>
  )
}

function RemoveDot({
  onRemove,
  label,
  standalone = false,
}: {
  onRemove: () => void
  label?: string
  standalone?: boolean
}) {
  // Dentro de un <button> no puede haber otro <button>: se usa un span con
  // role=button y manejo de teclado propio.
  const acionar = () => {
    haptic('tap')
    onRemove()
  }

  if (standalone) {
    return (
      <button
        type="button"
        aria-label={label ?? 'Remover'}
        onClick={acionar}
        className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill opacity-70 transition-opacity active:opacity-100"
      >
        <X size={13} aria-hidden />
      </button>
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label ?? 'Remover'}
      onClick={(e) => {
        e.stopPropagation()
        acionar()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          acionar()
        }
      }}
      className="relative z-10 ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill opacity-70 transition-opacity active:opacity-100"
    >
      <X size={13} aria-hidden />
    </span>
  )
}
