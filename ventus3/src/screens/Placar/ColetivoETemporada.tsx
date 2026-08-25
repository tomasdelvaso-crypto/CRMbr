// src/screens/Placar/ColetivoETemporada.tsx
// La barra colectiva del mes, la temporada con sus bilhetes y los récords.
//
// La barra colectiva existe por una razón concreta: en un equipo de 4 que
// comparte cuentas, la competencia pura pone a cada uno a esperar que el otro
// falle. La barra hace que pasarle un contacto a Paulo tenga sentido para
// Andre. Por eso solo suman eventos de CALIDAD — los toques no.
//
// La temporada de 4 semanas es lo único que mantiene el juego vivo: con 4
// personas el líder se vuelve inalcanzable en tres días. Y el sorteo por
// bilhetes hace que quien va último siga teniendo motivo en la semana 4.
//
// Los récords son la ÚNICA lista ordenada del producto — y es de marcas, no
// de personas.

import { Gift, Ticket, Trophy } from 'lucide-react'
import type { MetaColetiva, RecordeHistorico, TemporadaAtual } from '@/data'
import { formatarDataCurta } from '@/core'

export interface ColetivoETemporadaProps {
  meta: MetaColetiva
  temporada: TemporadaAtual
  recordes: RecordeHistorico[]
  onExplicarMeta: () => void
  onExplicarTemporada: () => void
}

export function ColetivoETemporada({
  meta,
  temporada,
  recordes,
  onExplicarMeta,
  onExplicarTemporada,
}: ColetivoETemporadaProps) {
  const pct = Math.round(meta.pct * 100)

  return (
    <>
      <section aria-label="Meta coletiva do mês" className="mt-7 px-4">
        <h2 className="mb-2 text-sm font-semibold text-fg">Meta coletiva do mês</h2>

        <button
          type="button"
          onClick={onExplicarMeta}
          className="w-full rounded-card border border-border bg-surface p-4 text-left transition-transform active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok-soft-fg">
              <Gift size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="tnum block text-lg font-semibold text-fg">
                {meta.atual} <span className="text-sm font-normal text-fg-subtle">de {meta.meta}</span>
              </span>
              <span className="block text-2xs text-fg-subtle">eventos de qualidade do time</span>
            </div>
            <span className="tnum text-sm font-semibold text-ok">{pct}%</span>
          </div>

          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-pill bg-surface-3"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${pct}% da meta coletiva do mês`}
          >
            <div
              className="h-full rounded-pill bg-ok transition-[width] duration-700"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-fg-muted">
            {meta.recompensa
              ? `Aos 100%: ${meta.recompensa}.`
              : 'A recompensa dos 100% ainda não foi votada — o time escolhe do catálogo.'}
          </p>
          <span className="mt-2 block text-2xs font-medium text-brand">Como calculei →</span>
        </button>
      </section>

      <section aria-label="Temporada" className="mt-7 px-4">
        <h2 className="mb-2 text-sm font-semibold text-fg">Temporada {temporada.numero}</h2>

        <button
          type="button"
          onClick={onExplicarTemporada}
          className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left transition-transform active:scale-[0.99]"
        >
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-accent-soft text-accent-soft-fg">
            <Ticket size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="tnum block text-lg font-semibold text-fg">
              {temporada.bilhetes} {temporada.bilhetes === 1 ? 'bilhete' : 'bilhetes'}
            </span>
            <span className="block text-2xs text-fg-subtle">
              semana {temporada.semanaNaTemporada} de 4 · sorteio em{' '}
              {formatarDataCurta(temporada.termina)}
            </span>
          </div>
          <span className="text-2xs font-medium text-brand">Como →</span>
        </button>

        <p className="mt-2 text-2xs leading-relaxed text-fg-subtle">
          No fim da temporada os pontos dela zeram. Os recordes não zeram nunca.
        </p>
      </section>

      {recordes.length > 0 && (
        <section aria-label="Recordes históricos" className="mt-7 px-4">
          <h2 className="mb-2 text-sm font-semibold text-fg">Recordes</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {recordes.map((r) => (
              <li key={r.chave} className="flex items-center gap-3 px-3.5 py-3">
                <span aria-hidden className="text-fg-subtle">
                  <Trophy size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fg">{r.rotulo}</span>
                  <span className="block text-2xs text-fg-subtle">
                    {primeiroNome(r.dono)} · semana de {formatarDataCurta(r.semana)}
                  </span>
                </div>
                <span className="tnum shrink-0 text-lg font-semibold text-fg">{r.valor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs leading-relaxed text-fg-subtle">
            É a única lista ordenada do produto — e é de marcas, não de pessoas.
          </p>
        </section>
      )}
    </>
  )
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
