// src/screens/Hoje/CorrenteDoTime.tsx
// Los 4 avatares con el anillo de Avanço de cada uno + high-five.
//
// Presión social SIN fabricar perdedores: no hay posición, no hay orden por
// resultado, no hay lenguaje de fracaso. Con n=4 un ranking produce un último
// público permanente que es el 25% del equipo comercial, sentado en la misma
// sala. Se ve el carril del otro; no se ve quién va ganando.
//
// Y el que todavía no tiene dato NO aparece en cero: aparece con el anillo
// vacío y «sem dados». Un 0 inventado es una acusación.

import { useState } from 'react'
import { Hand } from 'lucide-react'
import type { EloDoTime } from '@/data'
import { Avatar, Skeleton, cx, haptic, toast } from '@/ui'

export interface CorrenteDoTimeProps {
  elos: EloDoTime[] | undefined
  carregando: boolean
}

export function CorrenteDoTime({ elos, carregando }: CorrenteDoTimeProps) {
  const [enviados, setEnviados] = useState<readonly string[]>([])

  if (carregando) {
    return (
      <section className="mt-6" aria-label="Corrente do time">
        <Skeleton variant="lista" count={1} />
      </section>
    )
  }
  if (!elos || elos.length <= 1) return null

  const todosFecharam = elos.every((e) => e.temDados && e.avanco.ratio >= 1)

  const mandarHighFive = (nome: string) => {
    haptic('celebration')
    setEnviados((atual) => [...atual, nome])
    // TODO(F4): kudos reales sobre a tabela `kudos` de 0004_gamificacao.sql.
    // Hoje o high-five é local: vibra, avisa e não inventa um registro que
    // ninguém pode auditar depois.
    toast({ message: `High-five enviado para ${primeiroNome(nome)}`, tone: 'destaque' })
  }

  return (
    <section className="mt-6" aria-label="Corrente do time">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-fg">Corrente do time</h2>
        <span className="text-2xs text-fg-subtle">Anel de Avanço de hoje</span>
      </div>

      <div className="rounded-card border border-border bg-surface p-3">
        <ul className="flex items-start justify-around gap-1">
          {elos.map((elo) => (
            <li key={elo.vendorName} className="flex min-w-0 flex-col items-center gap-1.5">
              <div className="relative">
                <Avatar
                  name={elo.vendorName}
                  size="lg"
                  ringRatio={elo.temDados ? elo.avanco.ratio : 0}
                />
                {elo.euMesmo && (
                  <span className="sr-only">Você</span>
                )}
              </div>

              <span className="max-w-16 truncate text-2xs font-medium text-fg-muted">
                {elo.euMesmo ? 'Você' : primeiroNome(elo.vendorName)}
              </span>

              {elo.temDados ? (
                <span className="tnum text-2xs text-fg-subtle">
                  {elo.avanco.current}/{elo.avanco.goal}
                </span>
              ) : (
                <span className="text-2xs text-fg-subtle">sem dados</span>
              )}

              {!elo.euMesmo && (
                <button
                  type="button"
                  onClick={() => mandarHighFive(elo.vendorName)}
                  disabled={enviados.includes(elo.vendorName)}
                  aria-label={`Mandar high-five para ${primeiroNome(elo.vendorName)}`}
                  className={cx(
                    'flex size-11 items-center justify-center rounded-pill transition-colors',
                    'active:scale-95 disabled:opacity-40',
                    enviados.includes(elo.vendorName)
                      ? 'bg-accent text-accent-fg'
                      : 'bg-accent-soft text-accent-soft-fg',
                  )}
                >
                  <Hand size={17} aria-hidden />
                </button>
              )}
              {elo.euMesmo && <span className="size-11" aria-hidden />}
            </li>
          ))}
        </ul>

        {todosFecharam && (
          <p className="mt-2 rounded-lg bg-ok-soft px-3 py-2 text-center text-xs font-semibold text-ok-soft-fg">
            Dia Cheio do Time: +25% de PA para todos.
          </p>
        )}
      </div>
    </section>
  )
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
