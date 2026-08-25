// src/ui/toast-store.ts
// Store del toast, fuera de React para poder llamarlo desde cualquier lado
// (outbox, sync, service worker bridge) sin pasar un contexto por props.

import type { Tone } from './tokens'

export interface ToastOptions {
  message: string
  tone?: Tone
  /** Acción de deshacer. Obligatoria en toda acción destructiva o automática. */
  undo?: () => unknown
  /** Rótulo del botón de deshacer. */
  undoLabel?: string
  /** Duración visible. Con `undo`, el default sube a 5000ms. */
  durationMs?: number
  /** Id propio para reemplazar un toast en vuelo en vez de apilar otro. */
  id?: string
}

export interface ToastItem extends ToastOptions {
  id: string
  tone: Tone
  durationMs: number
  criadoEm: number
}

type Listener = (itens: readonly ToastItem[]) => void

let itens: ToastItem[] = []
const ouvintes = new Set<Listener>()
let seq = 0

function emitir(): void {
  const snapshot = itens
  for (const l of ouvintes) l(snapshot)
}

export function subscribeToasts(listener: Listener): () => void {
  ouvintes.add(listener)
  listener(itens)
  return () => {
    ouvintes.delete(listener)
  }
}

export function getToasts(): readonly ToastItem[] {
  return itens
}

/**
 * Muestra un toast. Único canal de feedback efímero de la app: nada de
 * alert(), que en una PWA standalone en iOS muestra el dominio.
 * Devuelve el id, por si hay que cerrarlo antes de tiempo.
 */
export function toast(options: ToastOptions): string {
  seq += 1
  const id = options.id ?? `t${seq}`
  const item: ToastItem = {
    ...options,
    id,
    tone: options.tone ?? 'neutro',
    durationMs: options.durationMs ?? (options.undo ? 5000 : 3200),
    criadoEm: Date.now(),
  }
  // Máximo 3 en pantalla: más que eso ya no se lee, se ignora.
  itens = [...itens.filter((t) => t.id !== id), item].slice(-3)
  emitir()
  return id
}

export function dismissToast(id: string): void {
  const antes = itens.length
  itens = itens.filter((t) => t.id !== id)
  if (itens.length !== antes) emitir()
}

export function clearToasts(): void {
  if (itens.length === 0) return
  itens = []
  emitir()
}
