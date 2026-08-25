// src/screens/Placar/ResumoDaSemana.tsx
// El Placar con el juego apagado.
//
// Esta pantalla es la prueba de que el opt-out es real. Quien apagó el juego
// NO pierde acceso a nada: sigue viendo lo que hizo esta semana, contra su
// propia semana anterior, con la misma cuenta tocable. Lo que desaparece es la
// capa lúdica —pontos, troféus, carris, celebración—, que es exactamente lo
// que la persona pidió que desapareciera.
//
// Si esto fuera un vacío con un botón «reativar o jogo», el opt-out sería un
// castigo disfrazado y nadie lo usaría dos veces.

import { Settings2 } from 'lucide-react'
import type { LinhaEuVsEu } from '@/data'
import { Button } from '@/ui'

export interface ResumoDaSemanaProps {
  rotuloSemana: string
  linhas: LinhaEuVsEu[]
  onExplicar: (linha: LinhaEuVsEu) => void
  onAjustes: () => void
}

export function ResumoDaSemana({ rotuloSemana, linhas, onExplicar, onAjustes }: ResumoDaSemanaProps) {
  // Os Pontos de Avanço são a moeda do jogo: com o jogo desligado eles somem,
  // mas os fatos (contatos, conversas, avanços) ficam. São dado, não placar.
  const fatos = linhas.filter((l) => l.metrica !== 'pa')

  return (
    <div className="px-4 pb-8">
      <header className="pt-4">
        <h2 className="text-base font-semibold text-fg">Sua semana</h2>
        <p className="mt-0.5 text-2xs text-fg-subtle">{rotuloSemana}</p>
      </header>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {fatos.map((linha) => (
          <li key={linha.metrica}>
            <button
              type="button"
              onClick={() => onExplicar(linha)}
              className="flex min-h-touch w-full items-center gap-3 px-3.5 py-3 text-left"
              aria-label={`${linha.rotulo}: ${linha.atual}. Ver como foi calculado.`}
            >
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{linha.rotulo}</span>
                <span className="block text-2xs leading-relaxed text-fg-subtle">
                  {linha.semanasComparadas === 0
                    ? 'primeira semana medida'
                    : `média das últimas ${linha.semanasComparadas}: ${formatar(linha.media4)}`}
                </span>
              </div>
              <span className="tnum shrink-0 text-2xl font-semibold text-fg">{linha.atual}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-fg-muted">
        Os números são os mesmos de sempre — só não há jogo em cima deles. Agenda, lembretes,
        carteira e cadência seguem exatamente iguais.
      </p>

      <Button
        variant="secondary"
        block
        className="mt-4"
        icon={<Settings2 size={16} />}
        onClick={onAjustes}
      >
        Ajustes do jogo
      </Button>
    </div>
  )
}

function formatar(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}
