// src/screens/Placar/EuVsEu.tsx
// «Eu vs eu»: esta semana contra mi promedio de las 4 anteriores, por métrica.
//
// Es la ÚNICA comparación que el producto hace sin pedir permiso. Compararse
// con otra persona exige que la otra persona acepte; compararse con uno mismo
// no le hace daño a nadie y es lo que de verdad mueve la conducta.
//
// Cards horizontales con overscroll contenido: el gesto lateral no puede
// arrastrar la página ni disparar el back del navegador.

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { LinhaEuVsEu } from '@/data'
import { cx, haptic } from '@/ui'

export interface EuVsEuProps {
  linhas: LinhaEuVsEu[]
  onExplicar: (linha: LinhaEuVsEu) => void
}

export function EuVsEu({ linhas, onExplicar }: EuVsEuProps) {
  return (
    <section aria-label="Eu contra eu mesmo" className="mt-5">
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h2 className="text-sm font-semibold text-fg">Eu vs eu</h2>
        <span className="text-2xs text-fg-subtle">contra a sua média de 4 semanas</span>
      </div>

      <ul
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {linhas.map((linha) => (
          <li key={linha.metrica} className="w-[15.5rem] shrink-0 snap-start">
            <CartaoDeMetrica linha={linha} onExplicar={onExplicar} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CartaoDeMetrica({
  linha,
  onExplicar,
}: {
  linha: LinhaEuVsEu
  onExplicar: (linha: LinhaEuVsEu) => void
}) {
  const subiu = linha.delta > 0
  const igual = linha.delta === 0
  const Icone = subiu ? TrendingUp : igual ? Minus : TrendingDown

  return (
    <button
      type="button"
      onClick={() => {
        haptic('selection')
        onExplicar(linha)
      }}
      // Toda métrica es tocable: el tap abre la cuenta entera.
      aria-label={`${linha.rotulo}: ${linha.atual}. Ver como foi calculado.`}
      className="flex h-full w-full flex-col rounded-card border border-border bg-surface p-4 text-left transition-transform active:scale-[0.98]"
    >
      <span className="text-xs font-medium text-fg-muted">{linha.rotulo}</span>

      <span className="tnum mt-1 text-4xl font-semibold tracking-tight text-fg">{linha.atual}</span>

      <span
        className={cx(
          'mt-1.5 inline-flex w-fit items-center gap-1 rounded-pill px-2 py-0.5 text-2xs font-semibold',
          linha.semanasComparadas === 0
            ? 'bg-surface-2 text-fg-muted'
            : subiu
              ? 'bg-ok-soft text-ok-soft-fg'
              : igual
                ? 'bg-surface-2 text-fg-muted'
                : 'bg-surface-2 text-fg-muted',
        )}
      >
        {linha.semanasComparadas === 0 ? (
          'primeira medição'
        ) : (
          <>
            <Icone size={12} aria-hidden />
            {`média ${formatar(linha.media4)}`}
          </>
        )}
      </span>

      <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-fg-muted">{linha.narrativa}</p>

      <div className="mt-auto pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-500"
            style={{ width: `${Math.round(linha.pct * 100)}%` }}
          />
        </div>
        <span className="tnum mt-1.5 block text-2xs text-fg-subtle">
          {linha.atual} de {linha.meta} da sua meta
        </span>
      </div>

      <span className="mt-2 text-2xs font-medium text-brand">Como calculei →</span>
    </button>
  )
}

function formatar(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}
