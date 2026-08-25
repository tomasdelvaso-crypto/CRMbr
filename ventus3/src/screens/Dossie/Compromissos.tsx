// src/screens/Dossie/Compromissos.tsx
// «O que prometi»: los compromisos de la semana ligados a este cliente, con su
// veredicto. Es la parte incómoda de la ficha y por eso está en la ficha: lo
// prometido en la reunión de segunda se cobra el viernes, con nombre y fecha.

import { Handshake } from 'lucide-react'
import { formatarDataCurta, type Commitment, type CommitmentStatus, type IsoDate } from '@/core'
import { Badge, EmptyState, cx, type Tone } from '@/ui'

const ROTULO: Readonly<Record<CommitmentStatus, string>> = {
  pending: 'Em aberto',
  done: 'Cumprido',
  partial: 'Parcial',
  missed: 'Não cumprido',
  cancelled: 'Cancelado',
}

const TOM: Readonly<Record<CommitmentStatus, Tone>> = {
  pending: 'info',
  done: 'ok',
  partial: 'atencao',
  missed: 'perigo',
  cancelled: 'neutro',
}

export interface CompromissosProps {
  commitments: readonly Commitment[]
  hoje: IsoDate
}

export function Compromissos({ commitments, hoje }: CompromissosProps) {
  if (commitments.length === 0) {
    return (
      <EmptyState
        icon={<Handshake size={26} aria-hidden />}
        title="Nada prometido aqui"
        description="Os compromissos da reunião de segunda que envolverem este cliente aparecem nesta lista com o veredicto de sexta."
      />
    )
  }

  const ordenados = [...commitments].sort((a, b) =>
    (b.due_date ?? b.week_of).localeCompare(a.due_date ?? a.week_of),
  )

  return (
    <ul className="divide-y divide-border">
      {ordenados.map((c) => (
        <li key={c.id} className="flex items-start gap-3 py-3">
          <span className="min-w-0 flex-1">
            <span
              className={cx(
                'block text-sm leading-snug',
                c.status === 'missed' ? 'text-fg' : 'text-fg',
                c.status === 'cancelled' && 'line-through text-fg-subtle',
              )}
            >
              {c.committed_action}
            </span>
            <span className="mt-1 block text-xs text-fg-muted">
              {c.due_date
                ? `Prometido para ${formatarDataCurta(c.due_date, hoje)}`
                : `Semana de ${formatarDataCurta(c.week_of, hoje)}`}
              {c.verdict_notes ? ` · ${c.verdict_notes}` : ''}
            </span>
          </span>
          <Badge tone={TOM[c.status]}>{ROTULO[c.status]}</Badge>
        </li>
      ))}
    </ul>
  )
}
