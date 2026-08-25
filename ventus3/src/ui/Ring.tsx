// src/ui/Ring.tsx
// Anillo de progreso SVG. Son los 3 anéis diarios: Contato / Conversa / Avanço.
//
// Accesible de verdad: role="progressbar" con aria-valuenow y un valuetext en
// PT-BR («7 de 12 contatos»). El anillo no es decorativo, es el estado del día.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clamp, cx, prefersReducedMotion } from './utils'
import { haptic } from './haptic'

/** Qué anillo es. Determina el color desde los tokens. */
export type RingKind = 'contato' | 'conversa' | 'avanco' | 'marca' | 'destaque'

export interface RingProps {
  /** Valor actual. */
  value: number
  /** Meta. Si es 0 el anillo se dibuja vacío y no divide por cero. */
  max: number
  /** Rótulo corto bajo el anillo: «Contato». */
  label: string
  kind?: RingKind
  /** Diámetro exterior en px. */
  size?: number
  /** Grosor del trazo. Por defecto, proporcional al tamaño. */
  thickness?: number
  /** Contenido del centro. Por defecto, `value/max`. */
  children?: ReactNode
  /** Se dispara una sola vez cuando el anillo se cierra. */
  onComplete?: () => void
  /** Oculta el rótulo visual (queda solo para el lector de pantalla). */
  hideLabel?: boolean
  className?: string
}

const COR: Readonly<Record<RingKind, string>> = {
  contato: 'var(--color-ring-contato)',
  conversa: 'var(--color-ring-conversa)',
  avanco: 'var(--color-ring-avanco)',
  marca: 'var(--color-brand)',
  destaque: 'var(--color-accent)',
}

export function Ring({
  value,
  max,
  label,
  kind = 'contato',
  size = 84,
  thickness,
  children,
  onComplete,
  hideLabel = false,
  className,
}: RingProps) {
  const meta = max > 0 ? max : 0
  const ratio = meta > 0 ? clamp(value / meta, 0, 1) : 0
  const fechado = meta > 0 && value >= meta

  const trazo = thickness ?? Math.max(6, Math.round(size * 0.11))
  const raio = (size - trazo) / 2
  const circunferencia = 2 * Math.PI * raio
  // El anillo se dibuja completo y se «tapa» con el dash offset: así solo se
  // anima una propiedad y el navegador no rehace el path en cada frame.
  const offset = circunferencia * (1 - ratio)

  const [celebrando, setCelebrando] = useState(false)
  const jaFechou = useRef(fechado)

  useEffect(() => {
    if (fechado && !jaFechou.current) {
      jaFechou.current = true
      haptic('celebration')
      onComplete?.()
      if (!prefersReducedMotion()) {
        // En el frame siguiente: el anillo termina de pintar el cierre ANTES
        // de que arranque el rebote, y no se encadenan dos renders seguidos.
        const raf = requestAnimationFrame(() => setCelebrando(true))
        const id = window.setTimeout(() => setCelebrando(false), 520)
        return () => {
          cancelAnimationFrame(raf)
          window.clearTimeout(id)
        }
      }
    }
    if (!fechado) jaFechou.current = false
    return undefined
  }, [fechado, onComplete])

  const valuetext = meta > 0 ? `${value} de ${meta} ${label}` : `${label} sem meta definida`

  return (
    <div className={cx('flex flex-col items-center gap-1.5', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={meta > 0 ? meta : 1}
        aria-valuenow={value}
        aria-valuetext={valuetext}
        aria-label={label}
        className={cx('relative', celebrando ? 'animate-ring-pop' : '')}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
          {/* Canal */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={raio}
            fill="none"
            stroke="var(--color-ring-track)"
            strokeWidth={trazo}
          />
          {/* Progreso: arranca a las 12 en punto y avanza en sentido horario. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={raio}
            fill="none"
            stroke={COR[kind]}
            strokeWidth={trazo}
            strokeLinecap="round"
            strokeDasharray={circunferencia}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: prefersReducedMotion()
                ? 'none'
                : 'stroke-dashoffset 620ms var(--ease-out-soft)',
              filter: fechado ? `drop-shadow(0 0 6px ${COR[kind]})` : undefined,
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          {children ?? (
            <span
              className="tnum font-bold tracking-tight"
              style={{ fontSize: Math.max(12, size * 0.24) }}
              aria-hidden
            >
              {value}
              <span className="text-fg-subtle">/{meta}</span>
            </span>
          )}
        </div>
      </div>

      {!hideLabel && (
        <span className="text-xs font-medium text-fg-muted" aria-hidden>
          {label}
        </span>
      )}
    </div>
  )
}

/** Los tres anéis del día, como los muestra Hoje. */
export interface RingTrioProps {
  contato: { value: number; max: number }
  conversa: { value: number; max: number }
  avanco: { value: number; max: number }
  size?: number
  onComplete?: (kind: RingKind) => void
  className?: string
}

export function RingTrio({ contato, conversa, avanco, size = 84, onComplete, className }: RingTrioProps) {
  return (
    <div className={cx('flex items-start justify-around gap-2', className)}>
      <Ring
        kind="contato"
        label="Contato"
        value={contato.value}
        max={contato.max}
        size={size}
        onComplete={onComplete ? () => onComplete('contato') : undefined}
      />
      <Ring
        kind="conversa"
        label="Conversa"
        value={conversa.value}
        max={conversa.max}
        size={size}
        onComplete={onComplete ? () => onComplete('conversa') : undefined}
      />
      <Ring
        kind="avanco"
        label="Avanço"
        value={avanco.value}
        max={avanco.max}
        size={size}
        onComplete={onComplete ? () => onComplete('avanco') : undefined}
      />
    </div>
  )
}
