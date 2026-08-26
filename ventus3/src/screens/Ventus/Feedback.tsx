// src/screens/Ventus/Feedback.tsx
// 👍/👎 en cada respuesta, con tres razones fijas en el 👎.
//
// Las razones no son un formulario: son la única forma de saber si el Ventus
// sirve. «Está errado» acusa al modelo, «genérico demais» acusa al prompt y
// «não é sobre este cliente» acusa al contexto que le mandamos. Son tres
// arreglos distintos, y sin separarlos no se arregla ninguno.

import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Sheet, cx, haptic } from '@/ui'
import { FEEDBACK_MOTIVOS, type FeedbackMotivo, type FeedbackVoto } from './contrato'

export interface FeedbackProps {
  voto: FeedbackVoto | null
  onVotar: (voto: FeedbackVoto, motivo: FeedbackMotivo | null) => void
}

export function Feedback({ voto, onVotar }: FeedbackProps) {
  const [pedindoMotivo, setPedindoMotivo] = useState(false)

  return (
    <>
      <div className="mt-1.5 flex items-center gap-1">
        <button
          type="button"
          aria-label="Resposta útil"
          aria-pressed={voto === 'bom'}
          onClick={() => {
            haptic('success')
            onVotar('bom', null)
          }}
          className={cx(
            'flex size-11 items-center justify-center rounded-lg transition-colors',
            voto === 'bom' ? 'text-ok' : 'text-fg-subtle active:bg-surface-2 lg:hover:bg-surface-2',
          )}
        >
          <ThumbsUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Resposta ruim"
          aria-pressed={voto === 'ruim'}
          onClick={() => {
            haptic('warning')
            setPedindoMotivo(true)
          }}
          className={cx(
            'flex size-11 items-center justify-center rounded-lg transition-colors',
            voto === 'ruim' ? 'text-danger' : 'text-fg-subtle active:bg-surface-2 lg:hover:bg-surface-2',
          )}
        >
          <ThumbsDown size={16} aria-hidden />
        </button>
        {voto !== null && (
          <span className="text-xs text-fg-subtle">
            {voto === 'bom' ? 'Obrigado.' : 'Anotado.'}
          </span>
        )}
      </div>

      <Sheet
        open={pedindoMotivo}
        onClose={() => {
          setPedindoMotivo(false)
        }}
        title="O que deu errado?"
        description="Cada motivo aponta para um conserto diferente."
      >
        <ul className="space-y-2 pb-2">
          {FEEDBACK_MOTIVOS.map((m) => (
            <li key={m.valor}>
              <button
                type="button"
                onClick={() => {
                  setPedindoMotivo(false)
                  onVotar('ruim', m.valor)
                }}
                className="min-h-touch w-full rounded-lg border border-border bg-surface-2 p-3 text-left text-base font-medium active:bg-surface-3"
              >
                {m.rotulo}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
