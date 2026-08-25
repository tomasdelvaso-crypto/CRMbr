// src/ui/Confetti.tsx
// Celebración corta: agendar una reunión en la Golden Hour, cerrar un anillo,
// ganar un troféu. Nunca más de 1,4s y NUNCA bloquea la interacción.
//
// Con prefers-reduced-motion no dibuja nada: llama a onDone enseguida y deja
// que el texto y el háptico hagan el trabajo.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLatest } from './internals'
import { prefersReducedMotion } from './utils'
import { haptic } from './haptic'

export interface ConfettiProps {
  /** Dispara la celebración en el flanco de subida. */
  active: boolean
  /** Cantidad de partículas. */
  count?: number
  /** Duración total en ms. */
  duration?: number
  /** Origen del estallido, en fracción de pantalla. Por defecto, el centro-alto. */
  origin?: { x: number; y: number }
  onDone?: () => void
}

const CORES_VAR = [
  '--color-brand',
  '--color-ok',
  '--color-warn',
  '--color-accent',
  '--color-info',
] as const

interface Particula {
  x: number
  y: number
  vx: number
  vy: number
  giro: number
  vGiro: number
  lado: number
  cor: string
}

export function Confetti({
  active,
  count = 90,
  duration = 1300,
  origin = { x: 0.5, y: 0.38 },
  onDone,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rodando = useRef(false)
  const cbDone = useLatest(onDone)

  useEffect(() => {
    if (!active || rodando.current) return
    rodando.current = true

    if (prefersReducedMotion()) {
      rodando.current = false
      cbDone.current?.()
      return
    }

    haptic('celebration')

    const canvas = canvasRef.current
    if (!canvas) {
      rodando.current = false
      cbDone.current?.()
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      rodando.current = false
      cbDone.current?.()
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const estilo = getComputedStyle(document.documentElement)
    const cores = CORES_VAR.map((v) => estilo.getPropertyValue(v).trim() || '#2563eb')

    const ox = w * origin.x
    const oy = h * origin.y

    const particulas: Particula[] = Array.from({ length: count }, (_, i) => {
      const angulo = (-Math.PI / 2) + (Math.random() - 0.5) * 2.1
      const forca = 7 + Math.random() * 9
      return {
        x: ox + (Math.random() - 0.5) * 40,
        y: oy,
        vx: Math.cos(angulo) * forca,
        vy: Math.sin(angulo) * forca,
        giro: Math.random() * Math.PI,
        vGiro: (Math.random() - 0.5) * 0.4,
        lado: 5 + Math.random() * 5,
        cor: cores[i % cores.length] ?? '#2563eb',
      }
    })

    const inicio = performance.now()
    let raf = 0

    const frame = (agora: number) => {
      const t = agora - inicio
      const progresso = t / duration
      ctx.clearRect(0, 0, w, h)

      for (const p of particulas) {
        p.vy += 0.34 // gravedad
        p.vx *= 0.992 // arrastre
        p.x += p.vx
        p.y += p.vy
        p.giro += p.vGiro

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.giro)
        ctx.globalAlpha = Math.max(0, 1 - progresso * 1.15)
        ctx.fillStyle = p.cor
        // Rectángulos, no círculos: giran y eso se lee como papelito.
        ctx.fillRect(-p.lado / 2, -p.lado / 4, p.lado, p.lado / 2)
        ctx.restore()
      }

      if (t < duration) {
        raf = requestAnimationFrame(frame)
      } else {
        ctx.clearRect(0, 0, w, h)
        rodando.current = false
        cbDone.current?.()
      }
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      rodando.current = false
    }
  }, [active, count, duration, origin.x, origin.y, cbDone])

  if (!active || typeof document === 'undefined') return null

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden
      // pointer-events-none: la celebración jamás se come un tap.
      className="pointer-events-none fixed inset-0 z-[70]"
    />,
    document.body,
  )
}
