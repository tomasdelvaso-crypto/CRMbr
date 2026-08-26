// src/screens/Carteira/FiltrosSheet.tsx
// Los filtros viven en un Sheet, no en dropdowns.
//
// Un <select> nativo en iOS abre una rueda que tapa media pantalla y no deja
// ver sobre qué se está filtrando; y un menú flotante en Android se cierra al
// primer scroll. El sheet muestra TODO el estado del filtro a la vez, con
// targets de 44px, y confirma con el número de resultados en el botón — que es
// la única forma de que el vendedor sepa si vale la pena aplicarlo.

import { useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { STAGES, type StageId } from '@/core'
import { Button, Chip, SegmentedControl, Sheet } from '@/ui'
import {
  FILTROS_PADRAO,
  ORDEM_LABELS,
  RISCO_LABELS,
  temFiltroAtivo,
  type FiltroRisco,
  type FiltrosCarteira,
  type OrdemCarteira,
} from './visoes'

export interface FiltrosSheetProps {
  open: boolean
  onClose: () => void
  filtros: FiltrosCarteira
  /** Se llama al confirmar, no en cada toque: el sheet edita un borrador. */
  onAplicar: (filtros: FiltrosCarteira) => void
  /** Cuántas filas daría el borrador actual. Se calcula afuera, ya filtrado. */
  contar: (filtros: FiltrosCarteira) => number
}

const ORDENS: readonly OrdemCarteira[] = ['valor', 'silencio', 'saude', 'fechamento']

export function FiltrosSheet({ open, onClose, filtros, onAplicar, contar }: FiltrosSheetProps) {
  // Borrador local: se descarta si el vendedor cierra sin aplicar.
  const [rascunho, setRascunho] = useState<FiltrosCarteira>(filtros)

  // Al abrir, el borrador arranca del estado real.
  const [aberturaAnterior, setAberturaAnterior] = useState(open)
  if (open !== aberturaAnterior) {
    setAberturaAnterior(open)
    if (open) setRascunho(filtros)
  }

  const total = contar(rascunho)

  const alternarEtapa = (etapa: StageId) => {
    setRascunho((atual) => ({
      ...atual,
      etapas: atual.etapas.includes(etapa)
        ? atual.etapas.filter((e) => e !== etapa)
        : [...atual.etapas, etapa].sort((a, b) => a - b),
    }))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrar a carteira"
      description="Vale para a lista inteira. Fica salvo até você limpar."
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<RotateCcw size={18} aria-hidden />}
            disabled={!temFiltroAtivo(rascunho)}
            onClick={() => setRascunho({ ...FILTROS_PADRAO, visao: rascunho.visao })}
          >
            Limpar
          </Button>
          <Button
            block
            size="lg"
            icon={<SlidersHorizontal size={18} aria-hidden />}
            onClick={() => {
              onAplicar(rascunho)
              onClose()
            }}
          >
            {total === 1 ? 'Ver 1 oportunidade' : `Ver ${String(total)} oportunidades`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Etapa</h3>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((etapa) => (
              <Chip
                key={etapa.id}
                tone="marca"
                selected={rascunho.etapas.includes(etapa.id)}
                onClick={() => alternarEtapa(etapa.id)}
              >
                {String(etapa.id)}. {etapa.name}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Sem nenhuma marcada, entram todas as etapas.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Risco</h3>
          <SegmentedControl<FiltroRisco>
            label="Filtrar por risco"
            value={rascunho.risco}
            onChange={(risco) => setRascunho((atual) => ({ ...atual, risco }))}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'atencao', label: 'Atenção+' },
              { value: 'critico', label: 'Crítico' },
            ]}
          />
          <p className="mt-2 text-xs text-fg-muted">{RISCO_LABELS[rascunho.risco]}</p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Ordenar por</h3>
          <div className="flex flex-col gap-1">
            {ORDENS.map((ordem) => (
              <button
                key={ordem}
                type="button"
                aria-pressed={rascunho.ordem === ordem}
                onClick={() => setRascunho((atual) => ({ ...atual, ordem }))}
                className={
                  rascunho.ordem === ordem
                    ? 'flex min-h-touch items-center rounded-lg bg-brand-soft px-3 text-left text-sm font-semibold text-brand-soft-fg'
                    : 'flex min-h-touch items-center rounded-lg px-3 text-left text-sm text-fg active:bg-surface-2 lg:hover:bg-surface-2'
                }
              >
                {ORDEM_LABELS[ordem]}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  )
}
