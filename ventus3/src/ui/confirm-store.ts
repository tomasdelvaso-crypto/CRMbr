// src/ui/confirm-store.ts
// Store del diálogo de confirmación. Existe para poder escribir
// `if (await confirmar({...}))` en cualquier lado, igual que con confirm(),
// pero con un bottom sheet propio.
//
// Por qué importa: en una PWA standalone en iOS el confirm() nativo muestra el
// dominio arriba del diálogo y rompe por completo la ilusión de app. El v2
// tiene 27 de estos.

import type { Tone } from './tokens'

export interface ConfirmOptions {
  title: string
  description?: string
  /** Rótulo de la acción. PT-BR, en imperativo: «Excluir», «Sair». */
  confirmLabel?: string
  cancelLabel?: string
  /** Tono de la acción confirmatoria. `perigo` para lo destructivo. */
  tone?: Tone
  /** Texto extra en gris bajo los botones (consecuencias, plazos). */
  footnote?: string
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

type Listener = (pedido: ConfirmRequest | null) => void

let atual: ConfirmRequest | null = null
const ouvintes = new Set<Listener>()
let seq = 0

function emitir(): void {
  for (const l of ouvintes) l(atual)
}

export function subscribeConfirm(listener: Listener): () => void {
  ouvintes.add(listener)
  listener(atual)
  return () => {
    ouvintes.delete(listener)
  }
}

/**
 * Pide confirmación. Resuelve `true` si el usuario confirmó.
 * Si ya hay un diálogo abierto, el anterior se resuelve en `false`.
 */
export function confirmar(options: ConfirmOptions): Promise<boolean> {
  if (atual) atual.resolve(false)
  seq += 1
  return new Promise<boolean>((resolve) => {
    atual = { ...options, id: seq, resolve }
    emitir()
  })
}

/** Cierra el diálogo en curso con una respuesta. Lo usa el host. */
export function resolverConfirm(id: number, ok: boolean): void {
  if (!atual || atual.id !== id) return
  const pedido = atual
  atual = null
  emitir()
  pedido.resolve(ok)
}

/** Aviso de una sola salida: reemplaza a alert(). */
export function avisar(options: Omit<ConfirmOptions, 'cancelLabel'>): Promise<boolean> {
  return confirmar({ ...options, cancelLabel: '', confirmLabel: options.confirmLabel ?? 'Entendi' })
}
