// src/screens/Placar/CarrisDoTime.tsx
// Los cuatro carriles paralelos. SIN posiciones. SIN ranking.
//
// ══════════════════════════════════════════════════════════════════════════
// ESTO NO ES UN LEADERBOARD Y NO PUEDE VOLVERSE UNO
// ══════════════════════════════════════════════════════════════════════════
// Con n=4, un leaderboard produce un ganador y un último público permanente
// que es el 25 % del equipo comercial, sentado en la misma sala. Por eso acá:
//
//  · el orden es ALFABÉTICO y no depende de ningún resultado;
//  · no hay número de posición, ni medalla, ni «1º/4º»;
//  · cada carril se mide contra SU meta, no contra la del vecino, así que dos
//    personas con metas distintas pueden estar las dos al 100 %;
//  · quien no tiene snapshot aparece con el carril vacío y «sem dados» —
//    jamás con un 0, que sería una acusación por un teléfono sin señal.
//
// Si algún día alguien ordena esta lista por `pct`, el diseño se perdió.

import type { CarrilDoTime, MetricaDeCarril } from '@/data'
import { ROTULO_DA_METRICA } from '@/data'
import { Avatar, SegmentedControl, cx } from '@/ui'

export interface CarrisDoTimeProps {
  carris: Record<MetricaDeCarril, CarrilDoTime[]>
  metrica: MetricaDeCarril
  onMetrica: (m: MetricaDeCarril) => void
  onExplicar: () => void
}

const OPCOES = [
  { value: 'contato' as const, label: 'Contatos' },
  { value: 'conversa' as const, label: 'Conversas' },
  { value: 'avanco' as const, label: 'Avanços' },
]

export function CarrisDoTime({ carris, metrica, onMetrica, onExplicar }: CarrisDoTimeProps) {
  const linhas = carris[metrica]
  if (linhas.length === 0) return null

  return (
    <section aria-label="O time em faixas paralelas" className="mt-7 px-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-fg">O time</h2>
        <span className="text-2xs text-fg-subtle">cada um contra a própria meta</span>
      </div>

      <SegmentedControl
        className="lg:max-w-md"
        options={OPCOES}
        value={metrica}
        onChange={onMetrica}
        label="Métrica dos carris do time"
        size="sm"
      />

      {/* Dos columnas en lg+: el equipo entero entra sin scrollear. El orden
          sigue siendo alfabético y sigue leyéndose en columnas —arriba a
          abajo, izquierda a derecha—, así que no aparece ninguna jerarquía
          que este componente existe para no tener. */}
      <ul className="mt-3 space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-2.5 lg:space-y-0">
        {linhas.map((carril) => (
          <li key={carril.vendorName}>
            <Carril carril={carril} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onExplicar}
        className="mt-3 min-h-11 text-2xs font-medium text-brand"
      >
        Por que não tem posição? →
      </button>

      <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">
        {ROTULO_DA_METRICA[metrica]} da semana. Ninguém aqui é primeiro nem último.
      </p>
    </section>
  )
}

function Carril({ carril }: { carril: CarrilDoTime }) {
  const pct = Math.round(carril.pct * 100)
  const fechou = carril.temDados && carril.pct >= 1

  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-card border px-3 py-2.5',
        carril.euMesmo ? 'border-brand-soft bg-brand-soft/40' : 'border-border bg-surface',
      )}
    >
      <Avatar name={carril.vendorName} size="sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-medium text-fg">
            {carril.euMesmo ? 'Você' : primeiroNome(carril.vendorName)}
          </span>
          {carril.temDados ? (
            <span className="tnum shrink-0 text-2xs text-fg-subtle">
              {carril.atual}/{carril.meta}
            </span>
          ) : (
            <span className="shrink-0 text-2xs text-fg-subtle">sem dados</span>
          )}
        </div>

        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-pill bg-surface-3"
          role="progressbar"
          aria-valuenow={carril.temDados ? pct : 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={
            carril.temDados
              ? `${carril.euMesmo ? 'Você' : primeiroNome(carril.vendorName)}: ${pct}% da própria meta`
              : `${primeiroNome(carril.vendorName)}: sem dados nesta semana`
          }
        >
          {carril.temDados && (
            <div
              className={cx(
                'h-full rounded-pill transition-[width] duration-500',
                fechou ? 'bg-ok' : carril.euMesmo ? 'bg-brand' : 'bg-fg-subtle',
              )}
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          )}
        </div>
      </div>

      <span
        className={cx(
          'tnum w-11 shrink-0 text-right text-xs font-semibold',
          fechou ? 'text-ok' : 'text-fg-muted',
        )}
      >
        {carril.temDados ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
