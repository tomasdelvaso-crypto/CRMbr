// src/screens/Carteira/PoolSemDono.tsx
// El pool: oportunidades vivas sin vendedor asignado.
//
// Hoy en producción son CERO, y esa es exactamente la razón por la que esta
// sección es plegable y no un bloque fijo: una pantalla que dedica espacio
// permanente a una lista vacía enseña a ignorar esa parte de la pantalla. Con
// datos pobres desaparece; con datos ricos, aparece con su contador.

import { useState } from 'react'
import { ChevronDown, HandHeart } from 'lucide-react'
import { getStageName, type Opportunity } from '@/core'
import { Button, cx, formatBrlCompacto } from '@/ui'

export interface PoolSemDonoProps {
  oportunidades: readonly Opportunity[]
  /** null mientras no hay vendedor resuelto: el botón queda deshabilitado. */
  podeAssumir: boolean
  onAssumir: (oportunidade: Opportunity) => void
}

/**
 * Cuántas se listan al expandir. El pool vive DENTRO del encabezado fijo de la
 * Carteira: si creciera sin techo, empujaría la lista fuera de la pantalla, y
 * ponerle scroll propio sería scroll anidado. Con techo, el encabezado nunca
 * pasa de un alto conocido.
 */
const MAXIMO_VISIVEL = 6

export function PoolSemDono({ oportunidades, podeAssumir, onAssumir }: PoolSemDonoProps) {
  const [aberto, setAberto] = useState(false)

  if (oportunidades.length === 0) return null

  const visiveis = oportunidades.slice(0, MAXIMO_VISIVEL)
  const restantes = oportunidades.length - visiveis.length

  return (
    <section className="border-b border-border bg-surface-2">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-touch w-full items-center gap-2 px-4 py-2 text-left"
      >
        <HandHeart size={16} aria-hidden className="text-brand" />
        <span className="flex-1 text-sm font-semibold">
          {oportunidades.length === 1
            ? '1 oportunidade sem dono'
            : `${String(oportunidades.length)} oportunidades sem dono`}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={cx('text-fg-subtle transition-transform', aberto && 'rotate-180')}
        />
      </button>

      {aberto && (
        <ul className="list-none space-y-2 px-4 pb-3">
          {visiveis.map((opp) => (
            <li
              key={opp.id}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {opp.name ?? opp.client ?? `Oportunidade ${String(opp.id)}`}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {opp.client ?? '—'} · {getStageName(opp.stage) || 'Sem etapa'} ·{' '}
                  <span className="tnum">{formatBrlCompacto(opp.value)}</span>
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!podeAssumir}
                onClick={() => onAssumir(opp)}
              >
                Assumir
              </Button>
            </li>
          ))}
          {restantes > 0 && (
            <li className="px-1 text-xs text-fg-muted">
              e mais {String(restantes)} sem dono. Assuma estas primeiro.
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
