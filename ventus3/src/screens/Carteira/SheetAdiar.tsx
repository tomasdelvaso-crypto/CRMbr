// src/screens/Carteira/SheetAdiar.tsx
// «Adiar» desde la lista: darle FECHA a la próxima acción.
//
// En la base real 51 de 54 oportunidades vivas no tienen next_action_date, y
// por eso son invisibles para el motor que arma el Hoje. Este sheet es el
// camino más barato que hay para arreglar una: swipe a la izquierda, una
// pastilla de fecha, confirmar. El texto de la acción viene prellenado y es
// opcional — pedirlo obligatorio convertiría 3 toques en un formulario.

import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { resolveShortcut, todayBr, type DateShortcut, type IsoDate } from '@/core'
import type { CarteiraRow } from '@/data'
import { Button, DatePills, Sheet, TextField, formatarCurtoBr } from '@/ui'

export interface SheetAdiarProps {
  /** La fila a la que se le pone fecha. null cierra el sheet. */
  linha: CarteiraRow | null
  onClose: () => void
  onConfirmar: (linha: CarteiraRow, ate: IsoDate, acao: string) => void
}

const ATALHOS: readonly DateShortcut[] = ['hoje', 'amanha', 'segunda', 'mais7', 'escolher']

export function SheetAdiar({ linha, onClose, onConfirmar }: SheetAdiarProps) {
  const [data, setData] = useState<IsoDate | null>(null)
  const [acao, setAcao] = useState<string | null>(null)

  const hoje = todayBr()
  const escolhida = data ?? resolveShortcut('amanha', hoje) ?? hoje
  const textoAtual = acao ?? linha?.nextAction ?? ''

  const fechar = () => {
    setData(null)
    setAcao(null)
    onClose()
  }

  const opp = linha?.opportunity

  return (
    <Sheet
      open={linha !== null}
      onClose={fechar}
      title="Próxima ação para quando?"
      description={opp ? `${opp.client ?? opp.name ?? ''}` : undefined}
      footer={
        <Button
          block
          size="lg"
          icon={<CalendarClock size={18} aria-hidden />}
          onClick={() => {
            if (!linha) return
            onConfirmar(linha, escolhida, textoAtual.trim())
            setData(null)
            setAcao(null)
          }}
        >
          Marcar para {formatarCurtoBr(escolhida)}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <DatePills
          label="Data da próxima ação"
          value={escolhida}
          options={ATALHOS}
          min={hoje}
          required
          onChange={(iso) => setData(iso)}
          resolver={(atalho, from) => resolveShortcut(atalho, from)}
        />

        <TextField
          label="O que você vai fazer?"
          value={textoAtual}
          onChange={setAcao}
          placeholder="Ligar para o comprador"
          maxLength={120}
          hint="Opcional. Em branco, fica «Retomar contato»."
        />

        <p className="text-xs text-fg-muted">
          A data é o que faz a oportunidade aparecer no Hoje. Sem ela, ela não existe para o
          motor — foi assim que 51 de 54 ficaram paradas.
        </p>
      </div>
    </Sheet>
  )
}
