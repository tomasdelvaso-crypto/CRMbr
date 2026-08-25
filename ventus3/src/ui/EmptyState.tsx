// src/ui/EmptyState.tsx
// Vacío con sentido: dice por qué está vacío y qué hacer. El vacío bueno de
// esta app es «Pronto por hoje», y ese se celebra, no se disculpa.

import type { ReactNode } from 'react'
import { cx } from './utils'
import { Button } from './Button'

export interface EmptyStateProps {
  /** Ícono o ilustración. Se renderiza aria-hidden. */
  icon?: ReactNode
  title: string
  description?: string
  /** Acción primaria. Sin acción, el vacío es terminal (y está bien). */
  actionLabel?: string
  onAction?: () => unknown
  /** Acción secundaria discreta. */
  secondaryLabel?: string
  onSecondary?: () => void
  /** `sucesso` para el estado terminal: verde, no gris. */
  variant?: 'neutro' | 'sucesso'
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  variant = 'neutro',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx('flex flex-col items-center px-6 py-10 text-center', className)}
      // El vacío es información: se anuncia cuando aparece.
      role="status"
    >
      {icon && (
        <div
          aria-hidden
          className={cx(
            'mb-4 flex size-16 items-center justify-center rounded-pill',
            variant === 'sucesso' ? 'bg-ok-soft text-ok-soft-fg' : 'bg-surface-2 text-fg-subtle',
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-balance text-sm text-fg-muted">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button
          className="mt-5"
          variant={variant === 'sucesso' ? 'secondary' : 'primary'}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
      {secondaryLabel && onSecondary && (
        <Button className="mt-2" variant="ghost" size="sm" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      )}
    </div>
  )
}
