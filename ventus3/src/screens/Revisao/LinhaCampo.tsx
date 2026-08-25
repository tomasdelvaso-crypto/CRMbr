// src/screens/Revisao/LinhaCampo.tsx
// UNA fila de la tarjeta: un campo, su valor antigo → valor novo, la cita que
// lo justifica, la fuente y la confianza.
//
// Es la unidad de decisión de esta pantalla. El vendedor acepta, edita o
// descarta ESTE campo, no la propuesta entera: un áudio de 40 segundos puede
// proponer tres cambios y él querer dos.

import { Check, Pencil, X } from 'lucide-react'
import type { FieldProposal } from '@/core'
import {
  CONFIANCA_LABELS,
  FONTE_LABELS,
  rotuloDoCampo,
  valorLegivel,
} from '@/data'
import { Chip, cx, haptic, type Tone } from '@/ui'

/** Tono por nivel de confianza. La baja NO es roja: es «revise antes». */
const TOM_CONFIANCA: Readonly<Record<FieldProposal['confidence'], Tone>> = {
  alta: 'ok',
  media: 'info',
  baixa: 'atencao',
}

export interface LinhaCampoProps {
  campo: FieldProposal
  /** Valor que se va a enviar: el propuesto, o el que el vendedor editó. */
  valorFinal: unknown
  aceito: boolean
  /** La propuesta ya venció: se muestra, pero no se decide. */
  travado: boolean
  onAlternar: () => void
  onEditar: () => void
}

export function LinhaCampo({
  campo,
  valorFinal,
  aceito,
  travado,
  onAlternar,
  onEditar,
}: LinhaCampoProps) {
  const editado = valorFinal !== campo.newValue
  const rotulo = rotuloDoCampo(campo.field)

  return (
    <li
      className={cx(
        'rounded-lg border p-3 transition-colors',
        aceito ? 'border-ok/40 bg-ok-soft/40' : 'border-border bg-surface-2',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {rotulo}
          </div>

          {/* valor antigo → valor novo. El «→» es el corazón de la tarjeta:
              sin el valor viejo el vendedor no puede juzgar el cambio. */}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="text-fg-muted line-through decoration-fg-subtle/60">
              {valorLegivel(campo.field, campo.oldValue)}
            </span>
            <span aria-hidden className="text-fg-subtle">
              →
            </span>
            <span className={cx('font-semibold', aceito ? 'text-ok-soft-fg' : 'text-fg')}>
              {valorLegivel(campo.field, valorFinal)}
            </span>
            {editado && (
              <Chip size="sm" tone="marca">
                editado
              </Chip>
            )}
          </div>
          <span className="sr-only">
            {`De ${valorLegivel(campo.field, campo.oldValue)} para ${valorLegivel(campo.field, valorFinal)}.`}
          </span>
        </div>

        {!travado && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                haptic('selection')
                onEditar()
              }}
              aria-label={`Editar ${rotulo}`}
              className="flex size-11 items-center justify-center rounded-lg text-fg-muted active:bg-surface-3"
            >
              <Pencil size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                haptic(aceito ? 'warning' : 'success')
                onAlternar()
              }}
              aria-pressed={aceito}
              aria-label={aceito ? `Recusar ${rotulo}` : `Aceitar ${rotulo}`}
              className={cx(
                'flex size-11 items-center justify-center rounded-lg transition-colors',
                aceito ? 'bg-ok text-ok-fg' : 'bg-surface-3 text-fg-muted',
              )}
            >
              {aceito ? <Check size={18} aria-hidden /> : <X size={18} aria-hidden />}
            </button>
          </div>
        )}
      </div>

      {/* La cita textual. Es lo que separa una propuesta auditable de um
          palpite: sin ela a confiança nunca é alta (regra aplicada em
          src/data/revisao.ts). */}
      {campo.quote !== null && (
        <blockquote className="mt-2 border-l-2 border-brand/40 pl-2.5 text-sm italic leading-snug text-fg-muted">
          {`“${campo.quote}”`}
        </blockquote>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip size="sm" tone="neutro">
          {FONTE_LABELS[campo.sourceKind]}
        </Chip>
        <Chip size="sm" tone={TOM_CONFIANCA[campo.confidence]}>
          {CONFIANCA_LABELS[campo.confidence]}
        </Chip>
        {campo.quote === null && (
          <Chip size="sm" tone="atencao">
            Sem citação
          </Chip>
        )}
      </div>
    </li>
  )
}
