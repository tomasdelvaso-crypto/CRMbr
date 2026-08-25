// src/ui/Logotipo.tsx
// La marca. SVG inline y no <img>: el Login y /instalar son las dos pantallas
// que se ven con la red peor (primer arranque, teléfono nuevo, 4G de galpón) y
// un logo que llega por HTTP aparece medio segundo después del formulario.
// Inline pinta con el primer frame y hereda el color del tema.

import { cx } from './utils'

export interface LogotipoProps {
  /** Alto del símbolo en px. El texto escala con él. */
  size?: number
  /** Muestra «Ventus» al lado del símbolo. */
  comNome?: boolean
  /** Bajada bajo el nombre, ej. «CRM de campo · Ventapel Brasil». */
  legenda?: string
  className?: string
}

/** Sólo el símbolo: el chevron del favicon, en la caja de marca. */
export function Marca({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Ventus"
      className={cx('shrink-0', className)}
    >
      <rect width="64" height="64" rx="14" className="fill-brand" />
      <path
        d="M16 20 L32 46 L48 20"
        fill="none"
        className="stroke-brand-fg"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logotipo({ size = 40, comNome = true, legenda, className }: LogotipoProps) {
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <Marca size={size} />
      {comNome && (
        <div className="min-w-0">
          <p
            className="font-semibold leading-tight tracking-tight text-fg"
            style={{ fontSize: Math.round(size * 0.62) }}
          >
            Ventus
          </p>
          {legenda && <p className="text-xs leading-snug text-fg-muted">{legenda}</p>}
        </div>
      )}
    </div>
  )
}
