// src/ui/Avatar.tsx
// Avatar del vendedor. Los 4 del equipo se reconocen por color e iniciales:
// no hay fotos cargadas y no vale la pena pedirlas.

import { useState } from 'react'
import { cx, initials } from './utils'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  /** Nombre completo. De acá salen las iniciales y el color estable. */
  name: string
  src?: string | null
  size?: AvatarSize
  /** Punto de estado en la esquina (ej. «está na Golden Hour agora»). */
  status?: 'ativo' | 'ausente' | null
  /** Anillo alrededor: el avanço del compañero en la Corrente do time. */
  ringRatio?: number
  className?: string
}

const TAMANHOS: Readonly<Record<AvatarSize, string>> = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-xl',
}

/** Paleta estable por nombre: el mismo vendedor siempre del mismo color. */
const CORES = [
  'bg-brand-soft text-brand-soft-fg',
  'bg-ok-soft text-ok-soft-fg',
  'bg-warn-soft text-warn-soft-fg',
  'bg-accent-soft text-accent-soft-fg',
  'bg-info-soft text-info-soft-fg',
  'bg-danger-soft text-danger-soft-fg',
] as const

function corDe(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return CORES[h % CORES.length] ?? CORES[0]
}

export function Avatar({ name, src, size = 'md', status = null, ringRatio, className }: AvatarProps) {
  const [falhou, setFalhou] = useState(false)
  const mostraImagem = Boolean(src) && !falhou

  const corpo = (
    <span
      className={cx(
        'relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill font-bold tracking-tight',
        TAMANHOS[size],
        mostraImagem ? 'bg-surface-2' : corDe(name),
        className,
      )}
    >
      {mostraImagem ? (
        <img
          src={src ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFalhou(true)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {status && (
        <span
          aria-hidden
          className={cx(
            'absolute bottom-0 right-0 size-2.5 rounded-pill border-2 border-surface',
            status === 'ativo' ? 'bg-ok' : 'bg-fg-subtle',
          )}
        />
      )}
    </span>
  )

  if (ringRatio == null) {
    return (
      <span role="img" aria-label={name} className="inline-flex">
        {corpo}
      </span>
    )
  }

  // Anillo de avanço alrededor del avatar, con conic-gradient: un solo pintado,
  // sin SVG extra por cada compañero de la Corrente do time.
  const pct = Math.max(0, Math.min(1, ringRatio)) * 360
  return (
    <span
      role="img"
      aria-label={`${name}, ${Math.round(Math.max(0, Math.min(1, ringRatio)) * 100)}% da meta`}
      className="inline-flex rounded-pill p-[2px]"
      style={{
        background: `conic-gradient(var(--color-ring-avanco) ${pct}deg, var(--color-ring-track) ${pct}deg)`,
      }}
    >
      <span className="rounded-pill bg-surface p-[2px]">{corpo}</span>
    </span>
  )
}

/** Pila de avatares con corte en `max`. Para «quem está na Golden Hour». */
export function AvatarStack({
  names,
  max = 4,
  size = 'sm',
}: {
  names: readonly string[]
  max?: number
  size?: AvatarSize
}) {
  const visiveis = names.slice(0, max)
  const resto = names.length - visiveis.length
  return (
    <span className="flex items-center -space-x-2">
      {visiveis.map((n) => (
        <span key={n} className="rounded-pill ring-2 ring-surface">
          <Avatar name={n} size={size} />
        </span>
      ))}
      {resto > 0 && (
        <span
          className={cx(
            'flex items-center justify-center rounded-pill bg-surface-3 font-semibold text-fg-muted ring-2 ring-surface',
            TAMANHOS[size],
          )}
          aria-label={`mais ${resto}`}
        >
          +{resto}
        </span>
      )}
    </span>
  )
}
