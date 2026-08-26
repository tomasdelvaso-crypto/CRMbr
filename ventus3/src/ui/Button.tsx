// src/ui/Button.tsx
// Botón único de la app. Alto mínimo 44px SIEMPRE (HIG y Material coinciden).
//
// El estado `loading` no es decorativo: BLOQUEA el segundo tap. En 4G brasileña
// el vendedor toca dos veces «Confirmar» y hoy eso crea dos actividades.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { cx } from './utils'
import { haptic, type HapticPattern } from './haptic'
import type { Size } from './tokens'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  children: ReactNode
  variant?: ButtonVariant
  size?: Size
  /** Ocupa todo el ancho. Default de las acciones primarias en móvil. */
  block?: boolean
  /** Fuerza el estado ocupado desde afuera (mutación de react-query, p. ej.). */
  loading?: boolean
  /** Ícono a la izquierda del rótulo. */
  icon?: ReactNode
  /** Ícono a la derecha (chevrones, contadores). */
  iconRight?: ReactNode
  /** Patrón háptico al tocar. `null` lo apaga. */
  hapticPattern?: HapticPattern | null
  /**
   * Si devuelve una promesa, el botón queda bloqueado hasta que resuelva.
   * Es la protección real contra el doble tap.
   */
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => unknown
  ref?: Ref<HTMLButtonElement>
}

// `lg:hover:` al lado de cada `active:`: en mouse/trackpad (escritorio, ≥1024px)
// el estado de pressed no existe, y sin hover el botón se ve inerte hasta el
// click. En touch (`active:`) el hover no se activa porque no hay `:hover`
// real, así que las dos reglas conviven sin pisarse.
const VARIANTES: Readonly<Record<ButtonVariant, string>> = {
  primary: 'bg-brand text-brand-fg shadow-xs active:bg-brand-strong lg:hover:bg-brand-strong',
  secondary: 'bg-surface-2 text-fg border border-border active:bg-surface-3 lg:hover:bg-surface-3',
  ghost: 'bg-transparent text-brand active:bg-brand-soft lg:hover:bg-brand-soft',
  danger: 'bg-danger text-danger-fg shadow-xs lg:hover:brightness-110',
  success: 'bg-ok text-ok-fg shadow-xs lg:hover:brightness-110',
}

const TAMANHOS: Readonly<Record<Size, string>> = {
  // Nunca por debajo de min-h-touch: 44px.
  sm: 'min-h-touch px-3 text-sm gap-1.5 rounded-md',
  md: 'min-h-touch px-4 text-base gap-2 rounded-lg',
  lg: 'min-h-touch-lg px-5 text-lg gap-2.5 rounded-xl font-semibold',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon,
  iconRight,
  hapticPattern = 'tap',
  onClick,
  disabled,
  className,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const [pendente, setPendente] = useState(false)
  const vivo = useRef(true)
  // Guarda síncrona: el estado de React llega un frame tarde y el segundo tap
  // de un doble toque ocurre ANTES de ese frame.
  const travado = useRef(false)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const ocupado = loading || pendente
  const inativo = disabled === true || ocupado

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (travado.current || inativo) {
        event.preventDefault()
        return
      }
      if (hapticPattern) haptic(hapticPattern)
      const resultado = onClick?.(event)
      if (resultado && typeof (resultado as Promise<unknown>).then === 'function') {
        travado.current = true
        setPendente(true)
        void Promise.resolve(resultado).finally(() => {
          travado.current = false
          if (vivo.current) setPendente(false)
        })
      }
    },
    [hapticPattern, inativo, onClick],
  )

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={inativo}
      aria-busy={ocupado || undefined}
      onClick={handleClick}
      className={cx(
        'relative inline-flex select-none items-center justify-center',
        'font-medium tracking-tight tap-highlight-none',
        'transition-[transform,background-color,opacity] duration-150 ease-ios',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variant],
        TAMANHOS[size],
        block ? 'w-full' : '',
        className,
      )}
    >
      {/* El contenido se atenúa en vez de desaparecer: el botón no cambia de
          ancho al pasar a «carregando» y la fila no salta. */}
      <span
        className={cx(
          'inline-flex items-center gap-[inherit] transition-opacity',
          ocupado ? 'opacity-0' : 'opacity-100',
        )}
      >
        {icon}
        <span>{children}</span>
        {iconRight}
      </span>

      {ocupado && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <Spinner />
        </span>
      )}
      {ocupado && <span className="sr-only">Carregando…</span>}
    </button>
  )
}

/** Único spinner permitido en la app: dentro de un botón ocupado. */
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Botón circular de ícono. Mismo alto mínimo, sin rótulo visible. */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'block' | 'icon'> {
  children: ReactNode
  'aria-label': string
}

export function IconButton({ children, className, size = 'md', ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      size={size}
      className={cx(
        'aspect-square !px-0 rounded-pill',
        size === 'lg' ? 'min-w-touch-lg' : 'min-w-touch',
        className,
      )}
    >
      {children}
    </Button>
  )
}
