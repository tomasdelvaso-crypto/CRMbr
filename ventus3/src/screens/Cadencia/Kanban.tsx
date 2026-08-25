// src/screens/Cadencia/Kanban.tsx
// El kanban 1A–1D. SOLO en md+ (tablet y desktop).
//
// En un teléfono, cuatro columnas con overflow interno dentro de una página
// que también scrollea es scroll anidado: el dedo nunca sabe qué se va a
// mover, y en iOS el rubber-band de la columna se come el gesto de la página.
// Es literalmente la peor experiencia táctil posible y es lo que el v2 hace
// hoy con `max-h-60vh` en cada columna.
//
// En una pantalla ancha el problema desaparece: las cuatro columnas caben una
// al lado de la otra, la página no scrollea y cada columna es una región de
// scroll independiente y previsible. Ahí el kanban sí aporta —ver el funil
// entero de un vistazo.
//
// Lo que NO vuelve en ningún tamaño: el drag&drop. La etapa la mueve el
// resultado del toque, no el dedo.

import {
  LEAD_STAGE_LABELS,
  LEAD_STAGE_ORDER,
  MAX_TOUCHPOINTS,
  type IsoDate,
  type LeadStage,
} from '@/core'
import type { LinhaCadencia } from '@/data'
import { ProgressDots } from '@/ui'
import { situacaoDoToque } from './fila'

export interface KanbanProps {
  linhas: readonly LinhaCadencia[]
  hoje: IsoDate
  onAbrir: (linha: LinhaCadencia) => void
}

/** Rótulo corto de la columna: el largo va en el title del encabezado. */
const CURTO: Readonly<Record<LeadStage, string>> = {
  '1a': '1A · Empresa',
  '1b': '1B · Contato',
  '1c': '1C · Interesse',
  '1d': '1D · Reunião',
}

export function Kanban({ linhas, hoje, onAbrir }: KanbanProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-4 gap-3 px-4 pb-4">
      {LEAD_STAGE_ORDER.map((etapa) => {
        const daEtapa = linhas.filter((l) => l.lead.stage === etapa)
        return (
          <section key={etapa} className="flex min-h-0 flex-col rounded-card bg-surface-2">
            <h3
              title={LEAD_STAGE_LABELS[etapa]}
              className="shrink-0 border-b border-border px-3 py-2 text-xs font-semibold"
            >
              {CURTO[etapa]}{' '}
              <span className="tnum text-fg-muted">({String(daEtapa.length)})</span>
            </h3>

            <ul className="min-h-0 flex-1 list-none space-y-2 overflow-y-auto scroll-momentum p-2">
              {daEtapa.length === 0 && (
                <li className="px-1 py-3 text-2xs text-fg-subtle">Nenhum lead aqui.</li>
              )}
              {daEtapa.map((linha) => {
                const situacao = situacaoDoToque(linha.lead, hoje)
                return (
                  <li key={linha.lead.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(linha)}
                      className="w-full rounded-lg border border-border bg-surface p-2.5 text-left active:bg-surface-2"
                    >
                      <span className="block truncate text-sm font-semibold">
                        {linha.lead.company_name}
                      </span>
                      <span className="block truncate text-2xs text-fg-muted">
                        {linha.lead.contact_name ?? 'Sem contato'}
                      </span>
                      <span className="mt-1.5 flex items-center justify-between gap-2">
                        <ProgressDots
                          total={MAX_TOUCHPOINTS}
                          feitos={linha.lead.touchpoints_count}
                          size="sm"
                          tone={situacao === 'atrasado' ? 'perigo' : 'marca'}
                          destacarProximo={situacao !== 'esgotado'}
                        />
                        {linha.atraso > 0 && (
                          <span className="text-2xs font-bold tnum text-danger">
                            {String(linha.atraso)}d
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
