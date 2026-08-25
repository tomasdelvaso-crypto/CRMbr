// src/screens/Carteira/LinhaCarteira.tsx
// La fila compacta: 72px exactos, porque es lo que la VirtualList necesita para
// no medir nada y lo que hace que 65 (o 500) filas cuesten lo mismo que 12.
//
// Todo lo que se ve acá ya viene resuelto en CarteiraRow. La fila NO consulta
// nada: cero queries por fila es el requisito que separa esta pantalla de la
// del v2, que dispara ~195 al abrirse.

import { memo } from 'react'
import { ChevronRight, MessageSquarePlus, CalendarClock } from 'lucide-react'
import { getStageName } from '@/core'
import type { CarteiraRow } from '@/data'
import { Badge, SwipeRow, cx, formatBrlCompacto } from '@/ui'
import { TOM_DO_RISCO, nivelDeRisco } from './visoes'

/** Alto exacto de la fila. Lo comparte la VirtualList y el Skeleton. */
export const ALTURA_LINHA = 72

export interface LinhaCarteiraProps {
  linha: CarteiraRow
  /** El nodo va con el id: es el origen del morph hacia el Dossiê. */
  onAbrir: (id: number, elemento: HTMLElement | null) => void
  onRegistrar: (linha: CarteiraRow) => void
  onAdiar: (linha: CarteiraRow) => void
}

/** Tono de la saúde declarada: verde a partir de 7, rojo por debajo de 4. */
function tomDaSaude(health: number): 'ok' | 'atencao' | 'perigo' {
  if (health >= 7) return 'ok'
  if (health >= 4) return 'atencao'
  return 'perigo'
}

function silencioTexto(dias: number): string {
  if (dias <= 0) return 'Falado hoje'
  if (dias === 1) return 'Ontem'
  return `${String(dias)}d sem contato`
}

export const LinhaCarteira = memo(function LinhaCarteira({
  linha,
  onAbrir,
  onRegistrar,
  onAdiar,
}: LinhaCarteiraProps) {
  const opp = linha.opportunity
  const nome = opp.name ?? opp.client ?? `Oportunidade ${String(opp.id)}`
  const cliente = opp.client ?? '—'
  const etapa = getStageName(opp.stage) || 'Sem etapa'
  const nivel = nivelDeRisco(linha)
  const silencioso = linha.daysSinceContact >= 15

  return (
    <SwipeRow
      aria-label={`${nome}. ${cliente}. ${etapa}.`}
      onSwipeRight={() => onRegistrar(linha)}
      onSwipeLeft={() => onAdiar(linha)}
      rightLabel="Registrar"
      leftLabel="Adiar"
      rightIcon={<MessageSquarePlus size={20} aria-hidden />}
      leftIcon={<CalendarClock size={20} aria-hidden />}
      // La fila no se colapsa: registrar navega y adiar abre um sheet. Colapsar
      // dejaría un hueco en la lista para una fila que sigue existiendo.
      collapseOnAction={false}
    >
      <button
        type="button"
        onClick={(evento) => onAbrir(opp.id, evento.currentTarget)}
        style={{ height: ALTURA_LINHA }}
        className="flex w-full items-center gap-3 border-b border-border px-4 text-left tap-highlight-none active:bg-surface-2"
      >
        {/* Semáforo de riesgo: las 6 reglas de risk.ts en un punto. */}
        <Badge
          dot
          tone={TOM_DO_RISCO[nivel]}
          aria-label={
            nivel === 'critico' ? 'Risco crítico' : nivel === 'atencao' ? 'Atenção' : 'Sob controle'
          }
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5">{nome}</span>
          <span className="block truncate text-xs leading-4 text-fg-muted">
            {cliente} · {etapa}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-2xs leading-4">
            <span className={cx('tnum', silencioso ? 'text-warn-soft-fg' : 'text-fg-subtle')}>
              {silencioTexto(linha.daysSinceContact)}
            </span>
            {linha.nextActionDate === null && (
              <span className="text-brand">Sem data</span>
            )}
            {linha.compromissosSemVeredicto > 0 && (
              <span className="text-warn-soft-fg">Sem veredicto</span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tnum leading-5">
            {formatBrlCompacto(opp.value)}
          </span>
          <Badge tone={tomDaSaude(linha.healthScore)} aria-label={`Saúde ${String(linha.healthScore)} de 10`}>
            {linha.healthScore.toFixed(1).replace('.', ',')}
          </Badge>
        </span>

        <ChevronRight size={18} aria-hidden className="shrink-0 text-fg-subtle" />
      </button>
    </SwipeRow>
  )
})
