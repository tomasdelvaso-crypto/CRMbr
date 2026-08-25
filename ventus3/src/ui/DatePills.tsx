// src/ui/DatePills.tsx
// Gate de próxima ação por BOTONES, nunca por texto libre.
// Hoje / Amanhã / Segunda / +7d / Escolher.
//
// Es el arreglo de mayor impacto del plan: el 60% de las oportunidades del v2
// no tiene próxima acción con fecha porque escribirla cuesta un teclado, un
// calendario y tres taps. Acá cuesta uno.
//
// El cálculo de fechas es el del dominio: resolveShortcut() de src/core/dates.ts.
// El prop `resolver` sigue existiendo para casos con reglas propias (por
// ejemplo saltar al próximo día hábil), no para suplir al dominio.

import { useId, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { resolveShortcut, type DateShortcut } from '@/core'
import { cx } from './utils'
import { haptic } from './haptic'
import { formatarCurtoBr, hojeBr, type IsoDate } from './datas'

export interface DatePillsProps {
  /** Fecha elegida, o `null` si todavía no hay. */
  value: IsoDate | null
  onChange: (iso: IsoDate, shortcut: DateShortcut) => void
  /** Rótulo del grupo. Visible salvo que `hideLabel`. */
  label?: string
  hideLabel?: boolean
  /** Qué atajos ofrecer y en qué orden. */
  options?: readonly DateShortcut[]
  /** Fecha mínima aceptada por el selector. Por defecto, hoy. */
  min?: IsoDate
  max?: IsoDate
  /** Marca el grupo como obligatorio (gate duro). */
  required?: boolean
  /** Reemplaza el cálculo local por el del dominio cuando exista. */
  resolver?: (shortcut: DateShortcut, from: IsoDate) => IsoDate | null
  className?: string
}

const PADRAO: readonly DateShortcut[] = ['hoje', 'amanha', 'segunda', 'mais7', 'escolher']

const ROTULOS: Readonly<Record<DateShortcut, string>> = {
  hoje: 'Hoje',
  amanha: 'Amanhã',
  segunda: 'Segunda',
  mais7: '+7d',
  escolher: 'Escolher',
}

interface ComShowPicker {
  showPicker?: () => void
}

export function DatePills({
  value,
  onChange,
  label = 'Próxima ação',
  hideLabel = false,
  options = PADRAO,
  min,
  max,
  required = false,
  resolver,
  className,
}: DatePillsProps) {
  const idRotulo = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [hoje] = useState(() => hojeBr())

  const calcular = resolver ?? resolveShortcut

  const escolher = (shortcut: DateShortcut) => {
    if (shortcut === 'escolher') {
      haptic('tap')
      const el = inputRef.current
      if (!el) return
      const comPicker = el as HTMLInputElement & ComShowPicker
      // showPicker abre el calendario nativo sin mostrar el input: es la única
      // forma de no ver un campo de texto vacío en Android.
      if (typeof comPicker.showPicker === 'function') {
        try {
          comPicker.showPicker()
          return
        } catch {
          /* algunos navegadores lo restringen fuera de un gesto directo */
        }
      }
      el.focus()
      el.click()
      return
    }

    const iso = calcular(shortcut, hoje)
    if (!iso) return
    haptic('selection')
    onChange(iso, shortcut)
  }

  // Qué pastilla está activa: se compara la fecha resuelta, no el atajo, para
  // que reabrir la pantalla marque «Amanhã» y no quede todo apagado.
  const ativo = (shortcut: DateShortcut): boolean => {
    if (!value) return false
    if (shortcut === 'escolher') {
      return !options.some((o) => o !== 'escolher' && calcular(o, hoje) === value)
    }
    return calcular(shortcut, hoje) === value
  }

  const escolhidaLivre = Boolean(value) && ativo('escolher')

  return (
    <div className={cx('w-full', className)}>
      <div className="flex items-baseline justify-between">
        <span
          id={idRotulo}
          className={cx('text-sm font-medium text-fg-muted', hideLabel && 'sr-only')}
        >
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </span>
        {required && !value && (
          <span className="text-xs font-medium text-danger">Obrigatório</span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-labelledby={idRotulo}
        aria-required={required || undefined}
        className="mt-2 flex flex-wrap gap-2"
      >
        {options.map((shortcut) => {
          const selecionado = ativo(shortcut)
          const rotulo =
            shortcut === 'escolher' && escolhidaLivre && value
              ? formatarCurtoBr(value)
              : ROTULOS[shortcut]
          return (
            <button
              key={shortcut}
              type="button"
              role="radio"
              aria-checked={selecionado}
              onClick={() => escolher(shortcut)}
              className={cx(
                'inline-flex min-h-touch items-center gap-1.5 rounded-pill px-4',
                'text-sm font-semibold tracking-tight tap-highlight-none',
                'transition-[transform,background-color] duration-150 ease-ios active:scale-95',
                selecionado
                  ? 'bg-brand text-brand-fg shadow-xs'
                  : 'bg-surface-2 text-fg border border-border',
              )}
            >
              {shortcut === 'escolher' && <CalendarDays size={16} aria-hidden />}
              {rotulo}
            </button>
          )
        })}
      </div>

      {/* Input real, fuera de pantalla pero enfocable: es lo que abre el
          calendario nativo y lo que ve un lector de pantalla. */}
      <input
        ref={inputRef}
        type="date"
        lang="pt-BR"
        aria-label={`${label} — escolher no calendário`}
        value={value ?? ''}
        min={min ?? hoje}
        max={max}
        onChange={(e) => {
          const iso = e.currentTarget.value
          if (!iso) return
          haptic('selection')
          onChange(iso, 'escolher')
        }}
        className="sr-only"
      />
    </div>
  )
}
