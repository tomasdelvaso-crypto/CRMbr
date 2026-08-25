// src/screens/Revisao/SheetDescartar.tsx
// Los tres motivos fijos de rechazo.
//
// No hay campo libre a propósito. Lo que se mide acá es la tasa de aceptación
// POR REGLA: un texto libre no se agrega y no mata ninguna regla. Y solo
// «dado errado» acusa al modelo — los otros dos son decisiones legítimas del
// vendedor, así que la tarjeta lo dice para que nadie los use como castigo.

import { useState } from 'react'
import { MOTIVOS_DESCARTE } from '@/data'
import type { DismissReason } from '@/core'
import { Button, Sheet, cx } from '@/ui'

export interface SheetDescartarProps {
  open: boolean
  /** Nombre del cliente o del registro, para que el título sea concreto. */
  alvo: string
  onClose: () => void
  onConfirmar: (motivo: DismissReason) => void
}

export function SheetDescartar({ open, alvo, onClose, onConfirmar }: SheetDescartarProps) {
  const [motivo, setMotivo] = useState<DismissReason | null>(null)

  const fechar = () => {
    setMotivo(null)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={fechar}
      title="Por que descartar?"
      description={`Sua resposta ensina o Ventus a não propor isso de novo em ${alvo}.`}
      footer={
        <Button
          block
          variant="danger"
          disabled={motivo === null}
          onClick={() => {
            if (motivo === null) return
            onConfirmar(motivo)
            setMotivo(null)
          }}
        >
          Descartar proposta
        </Button>
      }
    >
      <ul className="space-y-2 pb-2">
        {MOTIVOS_DESCARTE.map((m) => {
          const ativo = motivo === m.valor
          return (
            <li key={m.valor}>
              <button
                type="button"
                onClick={() => {
                  setMotivo(m.valor)
                }}
                aria-pressed={ativo}
                className={cx(
                  'w-full rounded-lg border p-3 text-left transition-colors min-h-touch',
                  ativo
                    ? 'border-danger bg-danger-soft text-danger-soft-fg'
                    : 'border-border bg-surface-2 text-fg active:bg-surface-3',
                )}
              >
                <div className="text-base font-medium">{m.rotulo}</div>
                <div
                  className={cx(
                    'mt-0.5 text-sm',
                    ativo ? 'text-danger-soft-fg/80' : 'text-fg-muted',
                  )}
                >
                  {m.consequencia}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
