// src/ui/Waveform.tsx
// Visualización en vivo del micrófono con AnalyserNode.
//
// No es decoración: es la única prueba de que el hold-to-talk está grabando.
// Sin esto el vendedor suelta el botón a los 2 segundos porque «no pasa nada».
//
// Se dibuja en canvas: 40 barras a 60fps en DOM haría layout thrashing.

import { useEffect, useRef, useState } from 'react'
import { useLatest } from './internals'
import { cx, prefersReducedMotion } from './utils'

export interface WaveformProps {
  /** Stream del micrófono. `null` deja las barras en reposo. */
  stream?: MediaStream | null
  /** Analizador ya creado (si la pantalla comparte el AudioContext). */
  analyser?: AnalyserNode | null
  /** Dibuja o congela. */
  active?: boolean
  /** Cantidad de barras. */
  bars?: number
  height?: number
  /** Variable CSS del color de las barras. */
  colorVar?: string
  /** Nivel medio 0..1 por frame: sirve para el contador de silencio. */
  onLevel?: (level: number) => void
  className?: string
}

export function Waveform({
  stream = null,
  analyser: analyserExterno = null,
  active = true,
  bars = 32,
  height = 56,
  colorVar = '--color-brand',
  onLevel,
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [erro, setErro] = useState(false)
  const nivelRef = useRef(0)
  const cbNivel = useLatest(onLevel)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let ctxAudio: AudioContext | null = null
    let fonte: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = analyserExterno
    let raf = 0
    let vivo = true
    // Alturas suavizadas: sin esto las barras titilan y marean.
    const suavizado = new Float32Array(bars)

    try {
      if (!analyser && stream) {
        // webkitAudioContext: frontera con Safari <14.1, sin tipos propios.
        const Ctor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
          AudioContext
        ctxAudio = new Ctor()
        fonte = ctxAudio.createMediaStreamSource(stream)
        analyser = ctxAudio.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.75
        fonte.connect(analyser)
      }
    } catch {
      // setState fuera del cuerpo síncrono del efecto: el aviso no es urgente
      // y así no se encadena un render extra en el mismo commit.
      requestAnimationFrame(() => setErro(true))
    }

    const dados = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

    const pintar = () => {
      if (!vivo) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cor = getComputedStyle(canvas).getPropertyValue(colorVar).trim() || '#2563eb'
      ctx.fillStyle = cor

      let soma = 0
      if (analyser && dados && active) {
        // El cast es la frontera de tipos entre ArrayBuffer y ArrayBufferLike
        // que introdujo TS 5.7 en los TypedArray genéricos.
        analyser.getByteFrequencyData(dados as Uint8Array<ArrayBuffer>)
      }

      const larguraBarra = w / bars
      const grosor = Math.max(2, larguraBarra * 0.55)

      for (let i = 0; i < bars; i += 1) {
        let alvo = 0.06
        if (analyser && dados && active) {
          // Solo el tramo útil de voz: el resto del espectro es ruido de sala.
          const idx = Math.floor((i / bars) * (dados.length * 0.55))
          const bruto = (dados[idx] ?? 0) / 255
          soma += bruto
          alvo = Math.max(0.06, Math.pow(bruto, 0.7))
        }
        const anterior = suavizado[i] ?? 0.06
        const suave = anterior + (alvo - anterior) * 0.35
        suavizado[i] = suave

        const alturaBarra = Math.max(3, suave * h)
        const x = i * larguraBarra + (larguraBarra - grosor) / 2
        const y = (h - alturaBarra) / 2
        const r = grosor / 2
        ctx.beginPath()
        ctx.roundRect(x, y, grosor, alturaBarra, r)
        ctx.fill()
      }

      if (analyser && dados && active) {
        nivelRef.current = soma / bars
        cbNivel.current?.(nivelRef.current)
      }

      raf = requestAnimationFrame(pintar)
    }

    // Con prefers-reduced-motion se dibuja un solo frame en reposo.
    if (prefersReducedMotion() && !active) {
      pintar()
      vivo = false
    } else {
      raf = requestAnimationFrame(pintar)
    }

    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      try {
        fonte?.disconnect()
        if (!analyserExterno) analyser?.disconnect()
        void ctxAudio?.close()
      } catch {
        // Cerrar un AudioContext ya cerrado lanza; no importa.
      }
    }
  }, [stream, analyserExterno, active, bars, colorVar, cbNivel])

  return (
    <div className={cx('w-full', className)}>
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="block w-full"
        // Decorativo para el lector de pantalla: el estado real lo dice el
        // texto de al lado («Gravando… 0:07»).
        aria-hidden
      />
      {erro && (
        <p className="mt-1 text-center text-xs text-fg-subtle">
          Sem visualização de áudio neste aparelho.
        </p>
      )}
    </div>
  )
}
