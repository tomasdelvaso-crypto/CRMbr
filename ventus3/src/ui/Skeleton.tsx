// src/ui/Skeleton.tsx
// Esqueletos con la FORMA EXACTA del contenido que reemplazan.
// Nada de spinners: un spinner no dice qué está por aparecer y hace que la
// pantalla salte cuando llegan los datos.

import { cx } from './utils'

/** Bloque base. Sirve para armar formas nuevas sin repetir el shimmer. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'block rounded-md bg-skeleton',
        'bg-[linear-gradient(90deg,var(--color-skeleton)_25%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_75%)]',
        'bg-[length:200%_100%] animate-shimmer',
        className,
      )}
    />
  )
}

export type SkeletonVariant =
  | 'card-acao'
  | 'linha-carteira'
  | 'dossie'
  | 'lista'
  | 'aneis'
  | 'chat'

export interface SkeletonProps {
  /** Forma exacta del contenido que reemplaza. */
  variant: SkeletonVariant
  count?: number
  className?: string
}

export function Skeleton({ variant, count = 1, className }: SkeletonProps) {
  const itens = Array.from({ length: Math.max(1, count) }, (_, i) => i)
  return (
    // aria-busy + role=status: el lector anuncia «carregando» una sola vez y
    // no lee cada rectángulo.
    <div role="status" aria-busy="true" aria-live="polite" className={cx('space-y-3', className)}>
      <span className="sr-only">Carregando…</span>
      {itens.map((i) => (
        <Forma key={i} variant={variant} />
      ))}
    </div>
  )
}

function Forma({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    // Card de ação de Hoje: título, cliente, chip «Por que isto?» y 2 botones.
    case 'card-acao':
      return (
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <SkeletonBlock className="h-4 w-2/5" />
            <SkeletonBlock className="h-5 w-14 rounded-pill" />
          </div>
          <SkeletonBlock className="mt-3 h-5 w-4/5" />
          <SkeletonBlock className="mt-2 h-4 w-3/5" />
          <SkeletonBlock className="mt-3 h-6 w-32 rounded-pill" />
          <div className="mt-4 flex gap-2">
            <SkeletonBlock className="h-touch flex-1 rounded-lg" />
            <SkeletonBlock className="h-touch w-24 rounded-lg" />
          </div>
        </div>
      )

    // Fila de Carteira: 72px exactos, como la real.
    case 'linha-carteira':
      return (
        <div className="flex h-[72px] items-center gap-3 border-b border-border px-1">
          <SkeletonBlock className="size-10 rounded-pill" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="mt-2 h-3 w-1/3" />
          </div>
          <SkeletonBlock className="h-6 w-12 rounded-pill" />
        </div>
      )

    // Dossiê: header pegajoso + acciones + hexágono PPVVCC.
    case 'dossie':
      return (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <SkeletonBlock className="h-6 w-3/5" />
            <SkeletonBlock className="mt-2 h-4 w-2/5" />
            <div className="mt-4 flex gap-2">
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
            </div>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <SkeletonBlock className="mx-auto size-44 rounded-lg" />
          </div>
        </div>
      )

    case 'aneis':
      return (
        <div className="flex items-center justify-around py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <SkeletonBlock className="size-20 rounded-pill" />
              <SkeletonBlock className="h-3 w-14" />
            </div>
          ))}
        </div>
      )

    case 'chat':
      return (
        <div className="space-y-2">
          <SkeletonBlock className="h-10 w-3/4 rounded-xl" />
          <SkeletonBlock className="ml-auto h-10 w-1/2 rounded-xl" />
        </div>
      )

    case 'lista':
    default:
      return (
        <div className="flex items-center gap-3 py-2">
          <SkeletonBlock className="size-8 rounded-pill" />
          <SkeletonBlock className="h-4 flex-1" />
        </div>
      )
  }
}
