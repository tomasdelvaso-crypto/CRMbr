// src/screens/ScreenPlaceholder.tsx
// Placeholder de pantalla: existe para que el router funcione de punta a punta
// mientras cada pantalla se implementa. Se borra cuando la pantalla es real.

import type { ReactNode } from 'react'

export interface ScreenPlaceholderProps {
  /** Nombre visible de la pantalla, en PT-BR. */
  nome: string
  /** Una línea sobre qué responde esta pantalla. */
  descricao?: string
  children?: ReactNode
}

export function ScreenPlaceholder({ nome, descricao, children }: ScreenPlaceholderProps) {
  return (
    <section className="flex flex-col gap-3 px-4 py-6">
      <h2 className="text-2xl font-bold tracking-tight">{nome}</h2>
      {descricao && <p className="text-sm text-fg-muted">{descricao}</p>}
      <p className="rounded-card border border-dashed border-border bg-surface p-4 text-sm text-fg-subtle">
        Tela em construção.
      </p>
      {children}
    </section>
  )
}
