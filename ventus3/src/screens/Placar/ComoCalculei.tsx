// src/screens/Placar/ComoCalculei.tsx
// El sheet que explica CUALQUIER número del Placar.
//
// No es un extra: es la defensa transversal del PLANO. «Si el equipo sospecha
// que los puntos son arbitrarios, el sistema muere en un mes y se lleva puesta
// la credibilidad del CRM entero.» Por eso cada métrica de esta pantalla es
// tocable y cada línea de acá dice de dónde salió el número, con qué regla y
// contra qué se compara — nunca «pelo seu histórico».

import { Sheet } from '@/ui'

export interface ExplicacaoDeMetrica {
  titulo: string
  /** El número grande, ya formateado. */
  valor: string
  linhas: string[]
  /** Nota al pie: la regla de fondo, si la hay. */
  rodape?: string
}

export interface ComoCalculeiProps {
  explicacao: ExplicacaoDeMetrica | null
  onClose: () => void
}

export function ComoCalculei({ explicacao, onClose }: ComoCalculeiProps) {
  return (
    <Sheet
      open={explicacao !== null}
      onClose={onClose}
      title={explicacao?.titulo ?? 'Como calculei'}
      description="A conta inteira, para você poder discutir o número."
    >
      {explicacao && (
        <div className="pb-2">
          <p className="tnum mb-4 text-4xl font-semibold tracking-tight text-fg">
            {explicacao.valor}
          </p>

          <ol className="space-y-3">
            {explicacao.linhas.map((linha, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="tnum mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-2xs font-semibold text-fg-muted"
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-fg-muted">{linha}</p>
              </li>
            ))}
          </ol>

          <p className="mt-5 rounded-card bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-fg-muted">
            {explicacao.rodape ??
              'As regras vivem em dados versionados, nunca em código, e não mudam no meio de uma temporada. Se algum número aqui não fizer sentido, ele é discutível — o placar existe para ser auditado.'}
          </p>
        </div>
      )}
    </Sheet>
  )
}
