// src/ui/Switch.tsx
// Interruptor de dos estados. Es la primitiva del opt-out.
//
// Existe por una razón de producto, no de catálogo: el PLANO exige que
// cualquiera pueda apagar anillos, rachas y placar sin perder acceso a nada.
// Un opt-out real necesita un control que se lea de un vistazo, que diga en
// qué estado está sin depender del color (por eso el rótulo y el `role`
// nativo), y que se pueda tocar con el pulgar sin apuntar.
//
// Accesible de verdad: es un <button role="switch"> con aria-checked, no un
// checkbox disfrazado. El lector de pantalla anuncia «ativado / desativado».

import type { ReactNode } from 'react'
import { cx } from './utils'
import { haptic } from './haptic'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Rótulo visible a la izquierda. */
  label: string
  /** Bajada corta bajo el rótulo. */
  description?: ReactNode
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, label, description, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        haptic('selection')
        onChange(!checked)
      }}
      // min-h-touch: el área tocable cubre la fila entera, no solo la pastilla.
      className={cx(
        'flex min-h-touch w-full items-center gap-3 text-left transition-opacity',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description !== undefined && (
          <span className="mt-0.5 block text-2xs leading-relaxed text-fg-subtle">{description}</span>
        )}
      </span>

      <span
        aria-hidden
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-200',
          'motion-reduce:transition-none',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-6 rounded-pill bg-surface shadow-xs transition-transform duration-200',
            'motion-reduce:transition-none',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}
