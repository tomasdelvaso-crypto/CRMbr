// src/screens/GoldenHour/Hud.tsx
// El único chrome del modo foco: reloj, toques contra la meta y conversas.
//
// Tres números y nada más. Un dashboard acá convierte el bloque en una
// pantalla de análisis, que es exactamente lo que la Golden Hour existe para
// no ser.

import { MessageSquareQuote, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '@/ui'
import { formatarRelogio } from './sessao'

export interface HudProps {
  restanteMs: number
  duracaoMin: number
  toques: number
  metaToques: number
  conversas: number
  /** Wake lock vivo: un punto discreto, no una alerta. */
  telaAcesa: boolean
  onEncerrar: () => void
}

export function Hud({
  restanteMs,
  duracaoMin,
  toques,
  metaToques,
  conversas,
  telaAcesa,
  onEncerrar,
}: HudProps) {
  const totalMs = duracaoMin * 60_000
  const decorrido = totalMs > 0 ? Math.min(1, 1 - restanteMs / totalMs) : 1
  const minutosRestantes = Math.ceil(restanteMs / 60_000)
  const acabando = restanteMs > 0 && minutosRestantes <= 5
  const esgotado = restanteMs <= 0

  return (
    <header className="shrink-0 px-4 pt-2">
      <div className="flex items-center justify-between gap-3">
        {/* Reloj regresivo: el elemento más grande de la pantalla después del
            nombre de la empresa. aria-live off — un lector que cante cada
            segundo sería insoportable; el tiempo se anuncia por minuto. */}
        <div className="min-w-0">
          <p
            className={cx(
              'tnum text-5xl font-bold leading-none tracking-tight tabular-nums',
              esgotado ? 'text-warn' : acabando ? 'text-warn' : 'text-fg',
            )}
            aria-label={`Faltam ${minutosRestantes} minutos`}
          >
            {formatarRelogio(restanteMs)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
            {telaAcesa && (
              <span
                className="size-1.5 rounded-pill bg-ok"
                aria-label="Tela travada acesa"
                role="img"
              />
            )}
            {esgotado ? 'Bloco cumprido' : `Bloco de ${duracaoMin} min`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Contador icone={<Target size={14} aria-hidden />} valor={`${toques}/${metaToques}`} rotulo="toques" destaque={toques >= metaToques} />
          <Contador
            icone={<MessageSquareQuote size={14} aria-hidden />}
            valor={String(conversas)}
            rotulo={conversas === 1 ? 'conversa' : 'conversas'}
            destaque={conversas >= 1}
          />
          <button
            type="button"
            onClick={onEncerrar}
            className={cx(
              'min-h-touch rounded-lg px-3 text-sm font-semibold tap-highlight-none',
              esgotado
                ? 'bg-brand text-brand-fg'
                : 'border border-border bg-surface-2 text-fg-muted active:bg-surface-3',
            )}
          >
            {esgotado ? 'Fechar' : 'Encerrar'}
          </button>
        </div>
      </div>

      {/* Barra de avance del bloque. Solo transform: no reflota el layout. */}
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={duracaoMin}
        aria-valuenow={Math.round(duracaoMin * decorrido)}
        aria-label="Andamento do bloco"
      >
        <div
          className="h-full origin-left bg-brand transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${decorrido})` }}
        />
      </div>
    </header>
  )
}

function Contador({
  icone,
  valor,
  rotulo,
  destaque,
}: {
  icone: ReactNode
  valor: string
  rotulo: string
  destaque: boolean
}) {
  return (
    <p className="text-right">
      <span
        className={cx(
          'tnum block text-xl font-bold leading-none',
          destaque ? 'text-ok' : 'text-fg',
        )}
      >
        {valor}
      </span>
      <span className="mt-0.5 flex items-center justify-end gap-1 text-2xs text-fg-subtle">
        {icone}
        {rotulo}
      </span>
    </p>
  )
}
