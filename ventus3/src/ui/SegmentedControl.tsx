// src/ui/SegmentedControl.tsx
// Control segmentado tipo iOS. En Cadência filtra 1A/1B/1C/1D sin apilar
// columnas; en Ajustes elige claro/escuro/sistema.
//
// Accesibilidad: role="radiogroup" con roving tabindex — una sola parada de
// tabulación y flechas para moverse, que es lo que espera un lector de pantalla.

import { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react'
import { cx, prefersReducedMotion } from './utils'
import { haptic } from './haptic'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Contador a la derecha del rótulo. */
  count?: number
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Rótulo del grupo para el lector de pantalla. */
  label: string
  size?: 'sm' | 'md'
  /** Ocupa todo el ancho repartiendo en partes iguales. */
  block?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  block = true,
  className,
}: SegmentedControlProps<T>) {
  const grupo = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const [foco, setFoco] = useState<number>(() => Math.max(0, options.findIndex((o) => o.value === value)))

  const selecionar = useCallback(
    (indice: number) => {
      const opcao = options[indice]
      if (!opcao || opcao.disabled) return
      setFoco(indice)
      if (opcao.value !== value) {
        haptic('selection')
        onChange(opcao.value)
      }
    },
    [onChange, options, value],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const total = options.length
    if (total === 0) return
    let alvo = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') alvo = (foco + 1) % total
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') alvo = (foco - 1 + total) % total
    else if (e.key === 'Home') alvo = 0
    else if (e.key === 'End') alvo = total - 1
    if (alvo < 0) return
    e.preventDefault()
    selecionar(alvo)
    refs.current[alvo]?.focus()
  }

  const indiceAtivo = options.findIndex((o) => o.value === value)
  // El padding va con el tamaño: en `sm` cada segmento tiene 8 px menos de
  // relleno, que es justo lo que separa a un rótulo de once letras de
  // aparecer entero o con puntos suspensivos en la columna de un teléfono.
  const alturas = size === 'sm' ? 'h-9 px-2 text-xs' : 'h-11 px-3 text-sm'

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        'relative flex rounded-pill bg-surface-2 p-1',
        block ? 'w-full' : 'inline-flex',
        className,
      )}
    >
      {/* Píldora deslizante: un solo elemento que se traslada, en vez de
          pintar y despintar el fondo de cada segmento. */}
      {indiceAtivo >= 0 && options.length > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 rounded-pill bg-surface shadow-xs"
          style={{
            width: `calc((100% - 0.5rem) / ${options.length})`,
            transform: `translate3d(calc(${indiceAtivo} * 100%),0,0)`,
            transition: prefersReducedMotion() ? 'none' : 'transform 240ms var(--ease-ios)',
          }}
        />
      )}

      {options.map((opcao, i) => {
        const ativo = opcao.value === value
        return (
          <button
            key={opcao.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            id={`${grupo}-${opcao.value}`}
            aria-checked={ativo}
            tabIndex={i === foco ? 0 : -1}
            disabled={opcao.disabled}
            onClick={() => selecionar(i)}
            className={cx(
              // `min-w-0` no es decorativo: sin él, el ítem flex conserva
              // `min-width: auto` —el ancho intrínseco del rótulo, que va con
              // `truncate` y por lo tanto en una sola línea— y el control se
              // niega a encoger. Con cuatro rótulos largos («Necessidade de
              // solução») el radiogroup medía 419 px dentro de un sheet de
              // 388 y el editor de escala desbordaba en horizontal. El
              // `truncate` del <span> sólo puede recortar si el botón puede
              // encoger.
              'relative z-10 flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-pill',
              'font-medium tracking-tight tap-highlight-none transition-colors',
              'disabled:opacity-40',
              alturas,
              ativo ? 'text-fg' : 'text-fg-muted',
            )}
          >
            <span className="truncate">{opcao.label}</span>
            {opcao.count != null && (
              <span className={cx('tnum text-2xs', ativo ? 'text-brand' : 'text-fg-subtle')}>
                {opcao.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
