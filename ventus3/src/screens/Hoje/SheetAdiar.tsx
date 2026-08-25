// src/screens/Hoje/SheetAdiar.tsx
// «Adiar» con fecha obligatoria.
//
// No hay opción de posponer sin fecha, y no es un descuido: el v2 tiene 51 de
// 54 oportunidades vivas sin next_action_date justamente porque siempre hubo
// una salida sin compromiso. Acá adiar CREA una tarefa con fecha (M3), que es
// lo que después alimenta la lista de mañana.

import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { resolveShortcut, todayBr, type DateShortcut, type IsoDate, type PlannedAction } from '@/core'
import { Button, DatePills, Sheet, formatarCurtoBr } from '@/ui'

export interface SheetAdiarProps {
  /** La acción a adiar. null cierra el sheet. */
  acao: PlannedAction | null
  onClose: () => void
  onConfirmar: (acao: PlannedAction, ate: IsoDate) => void
}

const ATALHOS: readonly DateShortcut[] = ['hoje', 'amanha', 'segunda', 'mais7', 'escolher']

export function SheetAdiar({ acao, onClose, onConfirmar }: SheetAdiarProps) {
  // Amanhã por defecto: es la respuesta correcta el 80% de las veces y deja el
  // sheet a un solo tap de distancia.
  const [data, setData] = useState<IsoDate | null>(null)

  const hoje = todayBr()
  const escolhida = data ?? resolveShortcut('amanha', hoje) ?? hoje

  return (
    <Sheet
      open={acao !== null}
      onClose={() => {
        setData(null)
        onClose()
      }}
      title="Adiar para quando?"
      description={acao ? `${acao.entidade.cliente} · ${acao.acao}` : undefined}
      footer={
        <Button
          block
          size="lg"
          icon={<CalendarClock size={18} aria-hidden />}
          onClick={() => {
            if (!acao) return
            onConfirmar(acao, escolhida)
            setData(null)
          }}
        >
          Adiar para {formatarCurtoBr(escolhida)}
        </Button>
      }
    >
      <div className="pb-2">
        <DatePills
          label="Nova data"
          value={escolhida}
          options={ATALHOS}
          min={hoje}
          required
          onChange={(iso) => setData(iso)}
          resolver={(atalho, from) => resolveShortcut(atalho, from)}
        />
        <p className="mt-4 text-xs text-fg-muted">
          Vira uma tarefa com data. Sem data ela não existe — foi assim que 51 de 54
          oportunidades ficaram sem próximo passo.
        </p>
      </div>
    </Sheet>
  )
}
