// src/ui/SwipeRow.tsx
// Fila con acción por gesto. La convención de toda la app:
//   → derecha = confirmar / feito  (verde)
//   ← izquierda = adiar            (ámbar)
//
// Detalles que la hacen sentir nativa:
//  · lock de eje: hasta que el gesto no es claramente horizontal, la lista
//    sigue haciendo scroll vertical normal
//  · resistencia después del umbral, para que no «se despegue»
//  · haptic UNA vez al cruzar el umbral, no en cada frame
//  · colapso animado + undo de 5s por toast
//
// Y sigue siendo usable con teclado: las dos acciones existen como botones
// reales dentro de la fila.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Check, Clock } from 'lucide-react'
import { cx, prefersReducedMotion, rubberband } from './utils'
import { haptic } from './haptic'
import { toast } from './toast-store'

export interface SwipeRowProps {
  children: ReactNode
  /** Acción de swipe a la derecha. Sin handler, ese lado no se arrastra. */
  onSwipeRight?: () => void
  /** Acción de swipe a la izquierda. */
  onSwipeLeft?: () => void
  rightLabel?: string
  leftLabel?: string
  rightIcon?: ReactNode
  leftIcon?: ReactNode
  /** Mensaje del toast de deshacer. Sin él, no se ofrece deshacer. */
  undoMessage?: string
  /** Ventana de deshacer. 0 lo desactiva. */
  undoMs?: number
  /** Distancia en px para disparar la acción. */
  threshold?: number
  /** Colapsa la fila al ejecutar. `false` la deja en su lugar. */
  collapseOnAction?: boolean
  className?: string
  /** Rótulo accesible de la fila entera (nombre del cliente, p. ej.). */
  'aria-label'?: string
}

const LOCK_EIXO = 10

export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Feito',
  leftLabel = 'Adiar',
  rightIcon,
  leftIcon,
  undoMessage,
  undoMs = 5000,
  threshold = 96,
  collapseOnAction = true,
  className,
  'aria-label': ariaLabel,
}: SwipeRowProps) {
  const [dx, setDx] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const [colapsada, setColapsada] = useState(false)
  const [altura, setAltura] = useState<number | undefined>(undefined)

  const raiz = useRef<HTMLDivElement>(null)
  const desfeito = useRef(false)

  const gesto = useRef({
    ativo: false,
    pointerId: -1,
    x0: 0,
    y0: 0,
    eixo: '' as '' | 'x' | 'y',
    cruzou: false,
  })

  useEffect(() => {
    desfeito.current = false
  }, [])

  const restaurar = useCallback(() => {
    desfeito.current = true
    setColapsada(false)
    setAltura(undefined)
    setDx(0)
  }, [])

  const executar = useCallback(
    (lado: 'left' | 'right') => {
      const acao = lado === 'right' ? onSwipeRight : onSwipeLeft
      if (!acao) {
        setDx(0)
        return
      }
      haptic(lado === 'right' ? 'success' : 'warning')

      if (collapseOnAction) {
        // Se congela la altura ANTES de colapsar: sin esto la transición no
        // arranca porque el navegador no puede animar desde `auto`.
        const h = raiz.current?.offsetHeight
        if (h) setAltura(h)
        // Un frame para que el estilo con altura fija se aplique.
        requestAnimationFrame(() => {
          setColapsada(true)
          setAltura(0)
        })
      }
      setDx(lado === 'right' ? 1 : -1)

      acao()

      if (undoMessage && undoMs > 0) {
        desfeito.current = false
        toast({
          message: undoMessage,
          tone: lado === 'right' ? 'ok' : 'atencao',
          durationMs: undoMs,
          undo: () => restaurar(),
        })
      }
    },
    [collapseOnAction, onSwipeLeft, onSwipeRight, restaurar, undoMessage, undoMs],
  )

  /* ── Gesto ─────────────────────────────────────────────────────────────── */

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!onSwipeLeft && !onSwipeRight) return
    const g = gesto.current
    g.ativo = true
    g.pointerId = e.pointerId
    g.x0 = e.clientX
    g.y0 = e.clientY
    g.eixo = ''
    g.cruzou = false
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current
    if (!g.ativo || g.pointerId !== e.pointerId) return

    const deltaX = e.clientX - g.x0
    const deltaY = e.clientY - g.y0

    // Lock de eje: mientras no se decida, la lista sigue scrolleando.
    if (g.eixo === '') {
      if (Math.abs(deltaY) > LOCK_EIXO && Math.abs(deltaY) > Math.abs(deltaX)) {
        g.ativo = false
        return
      }
      if (Math.abs(deltaX) > LOCK_EIXO) {
        g.eixo = 'x'
        setArrastando(true)
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* algunos navegadores rechazan la captura en gestos del sistema */
        }
      } else {
        return
      }
    }

    // Un lado sin handler no se abre.
    let valor = deltaX
    if (valor > 0 && !onSwipeRight) valor = 0
    if (valor < 0 && !onSwipeLeft) valor = 0

    // Resistencia pasado el umbral: se sigue moviendo, pero cuesta.
    const abs = Math.abs(valor)
    if (abs > threshold) {
      const extra = rubberband(abs - threshold, 180, 0.6)
      valor = Math.sign(valor) * (threshold + extra)
    }

    const cruzando = Math.abs(valor) >= threshold
    if (cruzando !== g.cruzou) {
      g.cruzou = cruzando
      if (cruzando) haptic('impact')
    }

    setDx(valor)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current
    if (!g.ativo || g.pointerId !== e.pointerId) return
    g.ativo = false
    setArrastando(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ya liberado */
    }
    if (g.eixo !== 'x') return

    if (dx >= threshold && onSwipeRight) executar('right')
    else if (dx <= -threshold && onSwipeLeft) executar('left')
    else setDx(0)
  }

  const progresso = Math.min(1, Math.abs(dx) / threshold)
  const lado = dx > 0 ? 'right' : dx < 0 ? 'left' : null
  const armado = progresso >= 1

  const transicao = prefersReducedMotion()
    ? 'none'
    : arrastando
      ? 'none'
      : 'transform 260ms var(--ease-ios)'

  return (
    <div
      ref={raiz}
      aria-label={ariaLabel}
      className={cx('relative overflow-hidden', className)}
      style={{
        height: altura,
        opacity: colapsada ? 0 : 1,
        transition: prefersReducedMotion()
          ? 'none'
          : 'height 240ms var(--ease-ios), opacity 200ms linear',
      }}
    >
      {/* Fondo de acción. Sigue al dedo y se satura al cruzar el umbral. */}
      <div
        aria-hidden
        className={cx(
          'absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold',
          lado === 'right' ? 'bg-ok text-ok-fg' : lado === 'left' ? 'bg-warn text-warn-fg' : '',
        )}
        style={{ opacity: lado ? 0.35 + progresso * 0.65 : 0 }}
      >
        <span
          className={cx('flex items-center gap-2', lado === 'right' ? 'opacity-100' : 'opacity-0')}
          style={{ transform: `scale(${armado && lado === 'right' ? 1.08 : 1})` }}
        >
          {rightIcon ?? <Check size={20} />}
          {rightLabel}
        </span>
        <span
          className={cx(
            'ml-auto flex items-center gap-2',
            lado === 'left' ? 'opacity-100' : 'opacity-0',
          )}
          style={{ transform: `scale(${armado && lado === 'left' ? 1.08 : 1})` }}
        >
          {leftLabel}
          {leftIcon ?? <Clock size={20} />}
        </span>
      </div>

      {/* Contenido arrastrable. */}
      <div
        className="relative touch-pan-y-only bg-surface will-change-transform"
        style={{ transform: `translate3d(${dx}px,0,0)`, transition: transicao }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}

        {/* Las mismas dos acciones, alcanzables con teclado y lector de
            pantalla. Visibles solo al recibir foco. */}
        <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-1">
          {onSwipeRight && (
            <button
              type="button"
              onClick={() => executar('right')}
              className="sr-only min-h-touch rounded-lg bg-ok px-3 text-sm font-semibold text-ok-fg focus-visible:not-sr-only focus-visible:relative"
            >
              {rightLabel}
            </button>
          )}
          {onSwipeLeft && (
            <button
              type="button"
              onClick={() => executar('left')}
              className="sr-only min-h-touch rounded-lg bg-warn px-3 text-sm font-semibold text-warn-fg focus-visible:not-sr-only focus-visible:relative"
            >
              {leftLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
