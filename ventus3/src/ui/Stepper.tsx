// src/ui/Stepper.tsx
// Stepper 0..10 para las 6 escalas PPVVCC.
//
// NADA de <input type="range">: en un teléfono, con el pulgar y guantes de
// planta, un slider de 11 pasos es imposible de acertar. Acá hay dos botones
// grandes en la zona del pulgar y 11 marcas tocables encima.

import { useCallback, useId, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { clamp, cx, prefersReducedMotion } from './utils'
import { haptic } from './haptic'
import { TONE_SOLID, type Tone } from './tokens'

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Rótulo de la escala: «Dor», «Valor». */
  label: string
  /** Texto del nivel canónico actual, bajo el número. */
  levelText?: string
  /** Tono del relleno. Por defecto se deduce del valor. */
  tone?: Tone
  disabled?: boolean
  className?: string
}

/** Color por tramo: 0-3 riesgo, 4-6 atención, 7-10 sano. */
function tomPorValor(v: number, max: number): Tone {
  const r = max > 0 ? v / max : 0
  if (r >= 0.7) return 'ok'
  if (r >= 0.4) return 'atencao'
  return 'perigo'
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  levelText,
  tone,
  disabled = false,
  className,
}: StepperProps) {
  const idRotulo = useId()
  const atual = clamp(value, min, max)
  const tom = tone ?? tomPorValor(atual, max)

  const mover = useCallback(
    (proximo: number) => {
      const v = clamp(Math.round(proximo / step) * step, min, max)
      if (v === atual) {
        haptic('warning')
        return
      }
      haptic('selection')
      onChange(v)
    },
    [atual, max, min, onChange, step],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    let alvo: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') alvo = atual + step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') alvo = atual - step
    else if (e.key === 'PageUp') alvo = atual + step * 2
    else if (e.key === 'PageDown') alvo = atual - step * 2
    else if (e.key === 'Home') alvo = min
    else if (e.key === 'End') alvo = max
    if (alvo === null) return
    e.preventDefault()
    mover(alvo)
  }

  const marcas = Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step)

  return (
    <div className={cx('select-none', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={idRotulo} className="text-sm font-medium text-fg-muted">
          {label}
        </span>
        <span className="tnum text-3xl font-bold tracking-tight" aria-hidden>
          {atual}
        </span>
      </div>

      {levelText && <p className="mt-1 text-sm leading-snug text-fg">{levelText}</p>}

      {/* Marcas: tocar una setea el valor de una. */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={idRotulo}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={atual}
        aria-valuetext={levelText ? `${atual} — ${levelText}` : `${atual} de ${max}`}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="mt-3 flex items-end gap-1 rounded-lg outline-none"
      >
        {marcas.map((m) => {
          const preenchida = m <= atual
          return (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Definir ${label} em ${m}`}
              onClick={() => mover(m)}
              className={cx(
                'group relative flex-1 rounded-sm tap-highlight-none',
                // El dibujo es fino, pero el área táctil llega a 44px vía ::before.
                "before:absolute before:inset-x-0 before:-inset-y-4 before:content-['']",
              )}
            >
              <span
                className={cx(
                  'block rounded-sm',
                  preenchida ? TONE_SOLID[tom].split(' ')[0] : 'bg-surface-3',
                  m === atual ? 'h-8' : 'h-5',
                )}
                style={{
                  transition: prefersReducedMotion()
                    ? 'none'
                    : 'height 180ms var(--ease-ios), background-color 180ms linear',
                }}
              />
              <span className="mt-1 block text-2xs text-fg-subtle tnum" aria-hidden>
                {m}
              </span>
            </button>
          )
        })}
      </div>

      {/* Zona del pulgar: dos objetivos enormes, imposibles de errar. */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || atual <= min}
          aria-label={`Diminuir ${label}`}
          onClick={() => mover(atual - step)}
          className="flex h-touch-lg flex-1 items-center justify-center rounded-xl border border-border bg-surface-2 text-fg tap-highlight-none transition-transform active:scale-95 disabled:opacity-40"
        >
          <Minus size={22} aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || atual >= max}
          aria-label={`Aumentar ${label}`}
          onClick={() => mover(atual + step)}
          className="flex h-touch-lg flex-1 items-center justify-center rounded-xl border border-border bg-surface-2 text-fg tap-highlight-none transition-transform active:scale-95 disabled:opacity-40"
        >
          <Plus size={22} aria-hidden />
        </button>
      </div>
    </div>
  )
}
