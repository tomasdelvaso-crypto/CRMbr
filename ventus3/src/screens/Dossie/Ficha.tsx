// src/screens/Dossie/Ficha.tsx
// El pie de la ficha: líneas de producto, valor, fecha de cierre, probabilidad
// y —cuando el negocio ya terminó— el outcome con la lección aprendida.
//
// La lección de un negocio perdido es el único activo que queda de él. Va en
// la ficha, no en un informe del gestor que nadie abre.

import type { ReactNode } from 'react'
import {
  PRODUCT_LINE_LABELS,
  formatarDataCurta,
  getStageName,
  probabilidadeCalculada,
  type IsoDate,
  type Opportunity,
  type Outcome,
  type ProductLine,
} from '@/core'
import { Badge, Card, Chip, formatBrl, type Tone } from '@/ui'

const OUTCOME_ROTULO: Readonly<Record<Outcome, string>> = {
  won: 'Ganho',
  lost: 'Perdido',
  abandoned: 'Abandonado',
}

const OUTCOME_TOM: Readonly<Record<Outcome, Tone>> = {
  won: 'ok',
  lost: 'perigo',
  abandoned: 'neutro',
}

export interface FichaProps {
  opportunity: Opportunity
  healthDeclarado: number
  diasSemContato: number
  hoje: IsoDate
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-fg-muted">{rotulo}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export function Ficha({ opportunity, healthDeclarado, diasSemContato, hoje }: FichaProps) {
  const linhas = (opportunity.product_lines ?? []).filter(
    (l): l is ProductLine => l in PRODUCT_LINE_LABELS,
  )
  const probabilidade =
    opportunity.probability ?? probabilidadeCalculada(healthDeclarado, diasSemContato)

  return (
    <div className="space-y-3">
      {opportunity.outcome && (
        <Card accent={OUTCOME_TOM[opportunity.outcome]} padding="sm">
          <div className="flex items-center gap-2">
            <Badge tone={OUTCOME_TOM[opportunity.outcome]} variant="solid">
              {OUTCOME_ROTULO[opportunity.outcome]}
            </Badge>
            {opportunity.loss_reason && (
              <span className="text-sm text-fg-muted">{opportunity.loss_reason}</span>
            )}
          </div>
          {opportunity.outcome_notes && (
            <p className="mt-2 text-sm leading-snug">
              <span className="font-semibold">Lição: </span>
              {opportunity.outcome_notes}
            </p>
          )}
        </Card>
      )}

      {linhas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {linhas.map((l) => (
            <Chip key={l} size="sm" tone="marca">
              {PRODUCT_LINE_LABELS[l]}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">
          Sem linha de produto definida — sem isso ninguém sabe o que estamos vendendo aqui.
        </p>
      )}

      <dl className="divide-y divide-border border-t border-border">
        <Linha rotulo="Valor">
          <span className="tnum">{formatBrl(opportunity.value)}</span>
        </Linha>
        <Linha rotulo="Etapa">{getStageName(opportunity.stage) || '—'}</Linha>
        <Linha rotulo="Fechamento previsto">
          {opportunity.expected_close ? (
            <span className="tnum">{formatarDataCurta(opportunity.expected_close, hoje)}</span>
          ) : (
            <span className="text-warn">sem data</span>
          )}
        </Linha>
        <Linha rotulo="Probabilidade">
          <span className="tnum">{Math.round(probabilidade)}%</span>
        </Linha>
        {opportunity.industry && <Linha rotulo="Setor">{opportunity.industry}</Linha>}
        {opportunity.product && <Linha rotulo="Produto">{opportunity.product}</Linha>}
        <Linha rotulo="Vendedor">{opportunity.vendor ?? '—'}</Linha>
      </dl>
    </div>
  )
}
