// src/screens/Registrar/EsqueletoAnalise.tsx
// El esqueleto mientras Whisper transcribe y Claude extrae (2-5 s reales).
//
// Tiene la FORMA de la tarjeta de confirmación, no la de un spinner: el
// vendedor ve dónde va a aparecer el cliente, dónde el resumen y dónde el gate
// de fecha, y cuando llegan los datos nada salta de lugar. Un spinner no dice
// qué está por venir y hace que la pantalla se reacomode entera al terminar.
//
// El texto de estado sí cambia con el tiempo (transcrevendo → entendendo):
// una espera de 4 segundos con un cartel fijo se siente colgada.

import { useEffect, useState } from 'react'
import { SkeletonBlock } from '@/ui'

const PASSOS: readonly string[] = [
  'Transcrevendo o áudio…',
  'Entendendo o que aconteceu…',
  'Procurando o cliente na sua carteira…',
  'Quase lá…',
]

export function EsqueletoAnalise({ segundosDeAudio }: { segundosDeAudio: number }) {
  const [passo, setPasso] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
    }, 1300)
    return () => {
      window.clearInterval(t)
    }
  }, [])

  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <p className="text-center text-sm font-medium text-fg-muted" aria-live="polite">
        {PASSOS[passo] ?? PASSOS[0]}
        {segundosDeAudio > 0 && (
          <span className="tnum block text-xs text-fg-subtle">
            {Math.round(segundosDeAudio)}s de áudio
          </span>
        )}
      </p>

      {/* 1 · cliente */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
        <SkeletonBlock className="size-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/3" />
        </div>
      </div>

      {/* 2 · chips de tipo */}
      <div className="flex gap-2">
        <SkeletonBlock className="h-9 w-24 rounded-pill" />
        <SkeletonBlock className="h-9 w-24 rounded-pill" />
        <SkeletonBlock className="h-9 w-20 rounded-pill" />
      </div>

      {/* 3 · resumo */}
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-24 w-full rounded-lg" />
      </div>

      {/* 4 · resultado */}
      <div className="flex gap-2">
        <SkeletonBlock className="h-9 w-20 rounded-pill" />
        <SkeletonBlock className="h-9 w-20 rounded-pill" />
      </div>

      {/* 5 · el gate */}
      <div className="space-y-2 rounded-card border border-border p-3">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-11 w-full rounded-lg" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-11 w-20 rounded-pill" />
          <SkeletonBlock className="h-11 w-24 rounded-pill" />
          <SkeletonBlock className="h-11 w-24 rounded-pill" />
        </div>
      </div>

      {/* 6 · Ventus sugere */}
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-28 w-full rounded-card" />
      </div>
    </div>
  )
}
