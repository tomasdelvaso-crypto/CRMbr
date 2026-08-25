// src/ui/PullToRefresh.tsx
// Pull-to-refresh propio. El del navegador está desactivado a nivel body
// (overscroll-behavior-y: contain) porque disparaba una recarga completa en
// medio de una lista; este lo reemplaza y solo revalida datos.

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { RefreshCw } from 'lucide-react'
import { clamp, cx, prefersReducedMotion, rubberband } from './utils'
import { haptic } from './haptic'

export interface PullToRefreshProps {
  children: ReactNode
  /** Revalidación. La animación dura lo que dure esta promesa. */
  onRefresh: () => Promise<unknown> | unknown
  /** Distancia en px para disparar. */
  threshold?: number
  /** Apaga el gesto (dentro de la Golden Hour, p. ej.). */
  disabled?: boolean
  className?: string
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 72,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const [puxada, setPuxada] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const gesto = useRef({ ativo: false, pointerId: -1, y0: 0, x0: 0, eixo: '' as '' | 'x' | 'y', cruzou: false })

  const disparar = useCallback(async () => {
    setAtualizando(true)
    setPuxada(threshold)
    haptic('success')
    try {
      await onRefresh()
    } catch {
      // El error lo reporta quien pasó onRefresh (toast). Acá solo se cierra.
    } finally {
      setAtualizando(false)
      setPuxada(0)
    }
  }, [onRefresh, threshold])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || atualizando) return
    const sc = scroller.current
    if (!sc || sc.scrollTop > 0) return
    const g = gesto.current
    g.ativo = true
    g.pointerId = e.pointerId
    g.y0 = e.clientY
    g.x0 = e.clientX
    g.eixo = ''
    g.cruzou = false
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current
    if (!g.ativo || g.pointerId !== e.pointerId) return
    const dy = e.clientY - g.y0
    const dx = e.clientX - g.x0

    if (g.eixo === '') {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        g.ativo = false
        return
      }
      if (dy > 8) {
        g.eixo = 'y'
        setArrastando(true)
      } else if (dy < -4) {
        g.ativo = false
        return
      } else {
        return
      }
    }

    if (dy <= 0) {
      setPuxada(0)
      return
    }
    // Resistencia: 72px de gesto real se sienten como ~140px de dedo.
    const valor = clamp(rubberband(dy, 260, 0.85), 0, threshold * 1.6)
    const cruzando = valor >= threshold
    if (cruzando !== g.cruzou) {
      g.cruzou = cruzando
      if (cruzando) haptic('impact')
    }
    setPuxada(valor)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesto.current
    if (!g.ativo || g.pointerId !== e.pointerId) return
    g.ativo = false
    setArrastando(false)
    if (g.eixo !== 'y') return
    if (puxada >= threshold) void disparar()
    else setPuxada(0)
  }

  const progresso = clamp(puxada / threshold, 0, 1)
  const transicao = arrastando || prefersReducedMotion() ? 'none' : 'transform 260ms var(--ease-ios)'

  return (
    <div className={cx('relative overflow-hidden', className)}>
      {/* Indicador. No es un spinner genérico: el anillo se dibuja con el
          gesto y solo gira cuando ya está revalidando. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translate3d(0, ${puxada - 40}px, 0)`,
          opacity: progresso,
          transition: transicao,
        }}
      >
        <span
          className="flex size-9 items-center justify-center rounded-pill border border-border bg-surface text-brand shadow-card"
          style={{ transform: `rotate(${progresso * 270}deg)` }}
        >
          <RefreshCw size={17} className={atualizando ? 'animate-spin' : undefined} />
        </span>
      </div>

      <div
        ref={scroller}
        className="h-full overflow-y-auto scroll-momentum"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translate3d(0, ${puxada}px, 0)`, transition: transicao }}
      >
        {children}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {atualizando ? 'Atualizando…' : ''}
      </span>
    </div>
  )
}
