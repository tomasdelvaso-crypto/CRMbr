// src/ui/Confirm.tsx
// Host del diálogo de confirmación. Se monta una sola vez en el Shell.
// Uso desde cualquier módulo:
//
//   if (await confirmar({ title: 'Excluir a nota?', tone: 'perigo' })) { … }

import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { Button } from './Button'
import { haptic } from './haptic'
import { resolverConfirm, subscribeConfirm, type ConfirmRequest } from './confirm-store'
import type { ButtonVariant } from './Button'
import type { Tone } from './tokens'

const VARIANTE_POR_TOM: Readonly<Record<Tone, ButtonVariant>> = {
  neutro: 'secondary',
  marca: 'primary',
  info: 'primary',
  ok: 'success',
  destaque: 'primary',
  atencao: 'primary',
  perigo: 'danger',
}

export function ConfirmHost() {
  const [pedido, setPedido] = useState<ConfirmRequest | null>(null)
  // `open` separado del pedido: hay que dejar correr la animación de salida
  // antes de desmontar el contenido, si no el sheet se va en negro.
  const [aberto, setAberto] = useState(false)
  const [ultimo, setUltimo] = useState<ConfirmRequest | null>(null)

  useEffect(
    () =>
      subscribeConfirm((p) => {
        setPedido(p)
        if (p) {
          setUltimo(p)
          setAberto(true)
        } else {
          setAberto(false)
        }
      }),
    [],
  )

  const visivel = pedido ?? ultimo
  if (!visivel) return null

  const responder = (ok: boolean) => {
    haptic(ok ? 'tap' : 'selection')
    resolverConfirm(visivel.id, ok)
  }

  const tone = visivel.tone ?? 'marca'
  const temCancelar = visivel.cancelLabel !== ''

  return (
    <Sheet
      open={aberto}
      onClose={() => responder(false)}
      title={visivel.title}
      description={visivel.description}
      showHandle
    >
      <div className="flex flex-col gap-2 pb-2 pt-1">
        <Button variant={VARIANTE_POR_TOM[tone]} size="lg" block onClick={() => responder(true)}>
          {visivel.confirmLabel ?? 'Confirmar'}
        </Button>
        {temCancelar && (
          <Button variant="secondary" size="lg" block onClick={() => responder(false)}>
            {visivel.cancelLabel ?? 'Cancelar'}
          </Button>
        )}
        {visivel.footnote && (
          <p className="pt-1 text-center text-xs text-fg-subtle">{visivel.footnote}</p>
        )}
      </div>
    </Sheet>
  )
}
