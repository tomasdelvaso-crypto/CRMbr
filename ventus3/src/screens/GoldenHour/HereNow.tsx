// src/screens/GoldenHour/HereNow.tsx
// «Here Now»: quién más está prospectando en este momento.
//
// SOLO estado, nunca ranking. Con cuatro personas que se conocen, un contador
// comparativo en vivo no motiva: humilla al que va último y no le enseña nada
// al que va primero. Lo que sí funciona es saber que no estás solo — es el
// sustituto remoto de la sala llena.
//
// El high-five es broadcast puro por realtime: no se guarda, no da puntos, no
// entra en ninguna métrica. Vibra en el teléfono del otro y se acabó.

import { useCallback, useEffect, useState } from 'react'
import { Hand } from 'lucide-react'
import { sendHighFive, subscribeGoldenPresence, subscribeHighFives } from '@/data'
import { Avatar, cx, haptic, toast } from '@/ui'

export interface HereNowProps {
  vendor: string
}

export function HereNow({ vendor }: HereNowProps) {
  const [online, setOnline] = useState<string[]>([])
  const [enviados, setEnviados] = useState<string[]>([])

  useEffect(() => {
    // Si el realtime está apagado (hoy la publicación de Supabase tiene cero
    // tablas), estas dos devuelven un no-op y la barra queda vacía sin romper.
    const baixaPresenca = subscribeGoldenPresence(vendor, setOnline)
    const baixaHighFives = subscribeHighFives(vendor, (de) => {
      haptic('celebration')
      toast({ message: `${de} mandou um high-five 🖐`, tone: 'destaque', durationMs: 2600 })
    })
    return () => {
      baixaPresenca()
      baixaHighFives()
    }
  }, [vendor])

  const outros = online.filter((v) => v !== vendor)

  const mandar = useCallback(
    (para: string) => {
      haptic('impact')
      setEnviados((atual) => (atual.includes(para) ? atual : [...atual, para]))
      setTimeout(() => setEnviados((atual) => atual.filter((v) => v !== para)), 2000)
      void sendHighFive(vendor, para).catch(() => undefined)
    },
    [vendor],
  )

  if (outros.length === 0) {
    return (
      <p className="shrink-0 px-4 py-1.5 text-xs text-fg-subtle">
        Você é o único na Golden Hour agora. O bloco é seu.
      </p>
    )
  }

  return (
    <section
      aria-label="Quem está na Golden Hour agora"
      className="scroll-momentum no-overscroll shrink-0 overflow-x-auto px-4 py-1.5"
    >
      <ul className="flex items-center gap-2">
        <li className="shrink-0 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Agora
        </li>
        {outros.map((nome) => {
          const mandado = enviados.includes(nome)
          return (
            <li key={nome} className="shrink-0">
              <button
                type="button"
                onClick={() => mandar(nome)}
                aria-label={`Mandar high-five para ${nome}`}
                className={cx(
                  'flex min-h-touch items-center gap-2 rounded-pill border py-1 pl-1 pr-3 tap-highlight-none',
                  'transition-transform active:scale-95 motion-reduce:transition-none',
                  mandado
                    ? 'border-accent bg-accent-soft text-accent-soft-fg'
                    : 'border-border bg-surface-2 text-fg-muted',
                )}
              >
                <Avatar name={nome} size="sm" status="ativo" />
                <span className="max-w-24 truncate text-sm font-medium">{nome}</span>
                <Hand size={16} aria-hidden className={mandado ? 'text-accent' : 'text-fg-subtle'} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
