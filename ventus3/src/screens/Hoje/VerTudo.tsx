// src/screens/Hoje/VerTudo.tsx
// La cola completa, colapsada.
//
// Está cerrada por defecto y hay que abrirla A PROPÓSITO. La fricción es la
// función: el vendedor que quiere ver las 17 puede, pero nadie se topa con
// ellas al abrir la app. Un panel de 17 pendientes es exactamente el
// repositorio pasivo del v2 que el límite de 3 viene a reemplazar.
//
// Acá no hay swipe ni botones de resolver: es una lista de consulta. Resolver
// se hace en las 3 de arriba, o en el Dossiê del cliente.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ROTULO_DA_ZONA, type AcaoDoDia } from '@/data'
import { Chip, cx, haptic } from '@/ui'
import { ICONE_DA_ACAO, TOM_DA_ZONA } from './aparencia'

export interface VerTudoProps {
  itens: AcaoDoDia[]
  onAbrir: (item: AcaoDoDia) => void
}

/** Cuántas se listan al abrir. Más que esto es una carteira, no una fila. */
const MAXIMO_LISTADO = 30

export function VerTudo({ itens, onAbrir }: VerTudoProps) {
  const [aberto, setAberto] = useState(false)
  if (itens.length === 0) return null

  const listadas = itens.slice(0, MAXIMO_LISTADO)

  return (
    <section className="mt-6" aria-label="Fila completa">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => {
          haptic('selection')
          setAberto((v) => !v)
        }}
        className="flex min-h-touch w-full items-center justify-between rounded-card border border-border bg-surface px-4 text-left"
      >
        <span className="text-sm font-medium text-fg">Ver tudo ({itens.length})</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cx('text-fg-subtle transition-transform', aberto && 'rotate-180')}
        />
      </button>

      {aberto && (
        <ul className="mt-2 space-y-1.5">
          {listadas.map((item) => {
            const Icone = ICONE_DA_ACAO[item.acao.tipo]
            return (
              <li key={item.acao.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(item)}
                  className="flex min-h-touch w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left active:bg-surface-2 lg:hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-fg-muted"
                  >
                    <Icone size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {item.acao.entidade.cliente}
                    </span>
                    <span className="block truncate text-xs text-fg-muted">{item.acao.acao}</span>
                  </span>
                  <Chip size="sm" tone={TOM_DA_ZONA[item.zona]}>
                    {ROTULO_DA_ZONA[item.zona]}
                  </Chip>
                </button>
              </li>
            )
          })}
          {itens.length > listadas.length && (
            <li className="px-1 pt-1 text-2xs text-fg-subtle">
              +{itens.length - listadas.length} na Carteira.
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
