// src/ui/ProgressDots.tsx
// Progreso discreto en puntitos. Nació para los 7 toques de la cadencia, que
// es donde importa ver DE UN VISTAZO cuánto queda de secuencia: una barra de
// progreso continua no dice «faltan dos toques», dice «va por el 71 %».
//
// Reglas:
//  · es puramente informativo, nunca tocable (si hay que tocarlo, es un Chip)
//  · un solo nodo accesible con el texto entero: el lector no lee 7 puntos
//  · el punto «actual» se distingue por anillo, no solo por color

import { cx } from './utils'
import { TONE_SOLID, type Tone } from './tokens'

export interface ProgressDotsProps {
  /** Cuántos pasos hay en total. La cadencia son 7. */
  total: number
  /** Cuántos ya se completaron. Se recorta a `total`. */
  feitos: number
  /** Tono de los puntos completados. */
  tone?: Tone
  /** Marca el próximo paso con un anillo. `false` cuando la secuencia terminó. */
  destacarProximo?: boolean
  /** Texto para el lector de pantalla. Sin él se arma uno en PT-BR. */
  'aria-label'?: string
  size?: 'sm' | 'md'
  className?: string
}

const TAMANHOS = { sm: 'size-1.5', md: 'size-2' } as const

export function ProgressDots({
  total,
  feitos,
  tone = 'marca',
  destacarProximo = true,
  'aria-label': ariaLabel,
  size = 'md',
  className,
}: ProgressDotsProps) {
  const passos = Math.max(0, Math.floor(total))
  const completos = Math.min(Math.max(0, Math.floor(feitos)), passos)
  const proximo = destacarProximo && completos < passos ? completos : -1

  const rotulo =
    ariaLabel ??
    (completos >= passos
      ? `Cadência completa: ${String(passos)} de ${String(passos)} toques`
      : `Toque ${String(completos + 1)} de ${String(passos)}`)

  return (
    <span role="img" aria-label={rotulo} className={cx('inline-flex items-center gap-1', className)}>
      {Array.from({ length: passos }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cx(
            'block rounded-pill',
            TAMANHOS[size],
            i < completos
              ? TONE_SOLID[tone].split(' ')[0]
              : i === proximo
                ? 'border border-fg-subtle bg-transparent'
                : 'bg-surface-3',
          )}
        />
      ))}
    </span>
  )
}
