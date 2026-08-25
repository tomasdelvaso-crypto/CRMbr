// src/ui/NumberField.tsx
// Número con dos botones grandes. La alternativa al Stepper cuando el rango
// no es una escala de 0 a 10.
//
// Por qué no alcanza con `Stepper`: el Stepper dibuja UNA MARCA POR PASO, que
// es exactamente lo que se quiere para una escala PPVVCC (11 niveles con
// nombre propio) y exactamente lo que NO se quiere para «56 toques por
// semana» — serían 27 marcas de 4px en un teléfono.
//
// Y por qué no un `<input type="number">`: abre el teclado numérico encima de
// la mitad de la pantalla para cambiar un valor en ±1, y en iOS deja las
// flechitas de 12px que nadie acierta. Dos botones de 52px se usan con el
// pulgar, caminando.

import { useId } from 'react'
import { clamp, cx } from './utils'
import { haptic } from './haptic'

export interface NumberFieldProps {
  value: number
  onChange: (value: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  /** Sufijo del número: «/semana», «h». */
  sufixo?: string
  /** Ayuda bajo el control. */
  hint?: string
  /** Marca visible de referencia, ej. «sistema propõe 32». */
  referencia?: string
  disabled?: boolean
  className?: string
}

export function NumberField({
  value,
  onChange,
  label,
  min = 0,
  max = 999,
  step = 1,
  sufixo,
  hint,
  referencia,
  disabled = false,
  className,
}: NumberFieldProps) {
  const idRotulo = useId()
  const atual = clamp(value, min, max)

  const mover = (delta: number): void => {
    const proximo = clamp(atual + delta, min, max)
    if (proximo === atual) {
      haptic('warning')
      return
    }
    haptic('selection')
    onChange(proximo)
  }

  return (
    <div className={cx('select-none', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={idRotulo} className="text-sm font-medium text-fg-muted">
          {label}
        </span>
        {referencia && <span className="text-xs text-fg-subtle">{referencia}</span>}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <BotaoDeAjuste
          rotulo={`Diminuir ${label}`}
          disabled={disabled || atual <= min}
          onClick={() => mover(-step)}
        >
          −
        </BotaoDeAjuste>

        <output
          aria-labelledby={idRotulo}
          className="flex flex-1 items-baseline justify-center gap-1"
        >
          <span className="tnum text-3xl font-bold tracking-tight">{atual}</span>
          {sufixo && <span className="text-sm text-fg-muted">{sufixo}</span>}
        </output>

        <BotaoDeAjuste
          rotulo={`Aumentar ${label}`}
          disabled={disabled || atual >= max}
          onClick={() => mover(step)}
        >
          +
        </BotaoDeAjuste>
      </div>

      {hint && <p className="mt-2 text-xs leading-snug text-fg-muted">{hint}</p>}
    </div>
  )
}

function BotaoDeAjuste({
  children,
  rotulo,
  disabled,
  onClick,
}: {
  children: string
  rotulo: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-touch-lg min-w-touch-lg items-center justify-center rounded-xl border border-border bg-surface-2 text-2xl font-semibold text-fg transition-transform active:scale-95 disabled:opacity-40"
    >
      <span aria-hidden>{children}</span>
    </button>
  )
}
