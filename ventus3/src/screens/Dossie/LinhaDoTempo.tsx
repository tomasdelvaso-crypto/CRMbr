// src/screens/Dossie/LinhaDoTempo.tsx
// Timeline unificado y append-only. Actividades, toques de cadencia, cambios
// de etapa y movimientos de escala en una sola columna, del más nuevo al más
// viejo, agrupados por día.
//
// Cada línea lleva su badge de origen (🎙 🤖 ✋ 💬). No es decoración: una nota
// dictada y transcrita por una IA y una nota tecleada por el vendedor tienen
// credibilidad distinta, y el vendedor tiene derecho a saber cuál está leyendo
// antes de entrar a la reunión.
//
// Se renderizan 12 y se expande a pedido: una ficha vieja tiene 40+ registros
// y el vendedor abre la ficha para leer los últimos, no todos.

import { useState } from 'react'
import { History } from 'lucide-react'
import { formatarDataCurta, formatRelativeBr, type IsoDate } from '@/core'
import { Badge, Button, Chip, EmptyState, cx } from '@/ui'
import { ORIGEM_ICONE, ORIGEM_ROTULO, type ItemLinhaDoTempo } from './timeline'

export interface LinhaDoTempoProps {
  itens: readonly ItemLinhaDoTempo[]
  hoje: IsoDate
  /** Se llama cuando no hay nada que mostrar y el vendedor quiere registrar. */
  onRegistrar: () => void
}

const PAGINA = 12

export function LinhaDoTempo({ itens, hoje, onRegistrar }: LinhaDoTempoProps) {
  const [limite, setLimite] = useState(PAGINA)

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={<History size={26} aria-hidden />}
        title="Nenhum registro ainda"
        description="Tudo o que você conversar com este cliente vive aqui. Comece ditando a última conversa: leva 20 segundos."
        actionLabel="Registrar a primeira conversa por voz"
        onAction={onRegistrar}
      />
    )
  }

  const visiveis = itens.slice(0, limite)

  return (
    <div>
      <ol className="space-y-0">
        {visiveis.map((item, i) => {
          // El día se compara contra el ítem anterior de la MISMA lista: nada
          // de acumular en una variable mutable durante el render.
          const novoDia = item.dia !== visiveis[i - 1]?.dia
          return (
            <li key={item.id}>
              {novoDia && (
                <div className="flex items-baseline gap-2 pb-1 pt-3 first:pt-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    {formatarDataCurta(item.dia, hoje)}
                  </span>
                  <span className="text-2xs text-fg-subtle">{formatRelativeBr(item.dia)}</span>
                </div>
              )}
              <ItemDaLinha item={item} />
            </li>
          )
        })}
      </ol>

      {limite < itens.length && (
        <Button
          className="mt-3"
          block
          variant="secondary"
          size="sm"
          onClick={() => setLimite((l) => l + PAGINA * 2)}
        >
          Ver mais {itens.length - limite} registros
        </Button>
      )}
    </div>
  )
}

function ItemDaLinha({ item }: { item: ItemLinhaDoTempo }) {
  const [expandido, setExpandido] = useState(false)
  const corpo = item.corpo ?? ''
  const longo = corpo.length > 220

  return (
    <div className="flex gap-3 py-2">
      {/* Riel: ícono del tipo y la línea que cose el timeline. */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cx(
            'flex size-8 items-center justify-center rounded-pill text-sm',
            item.tipo === 'etapa'
              ? 'bg-brand-soft'
              : item.tipo === 'escala'
                ? 'bg-accent-soft'
                : 'bg-surface-2',
          )}
        >
          {item.icone}
        </span>
        <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{item.titulo}</span>
          <span
            className="text-2xs text-fg-subtle"
            title={ORIGEM_ROTULO[item.origem]}
            aria-label={ORIGEM_ROTULO[item.origem]}
          >
            {ORIGEM_ICONE[item.origem]}
          </span>
          {item.codigo && (
            <Chip size="sm" tone="marca">
              {item.codigo}
            </Chip>
          )}
        </div>

        {corpo !== '' && (
          <p
            className={cx(
              'mt-1 whitespace-pre-line text-sm leading-snug text-fg-muted',
              longo && !expandido && 'line-clamp-4',
            )}
          >
            {corpo}
          </p>
        )}

        {longo && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="mt-1 min-h-touch text-xs font-medium text-brand tap-highlight-none"
          >
            {expandido ? 'Mostrar menos' : 'Ler a transcrição inteira'}
          </button>
        )}

        {item.citacao && (
          <p className="mt-1 border-l-2 border-accent pl-2 text-sm italic leading-snug text-fg">
            “{item.citacao}”
          </p>
        )}

        {item.resultado && (
          <div className="mt-1.5">
            <Badge tone="neutro">{item.resultado}</Badge>
          </div>
        )}
      </div>
    </div>
  )
}
