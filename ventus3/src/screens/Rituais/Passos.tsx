// src/screens/Rituais/Passos.tsx
// La cáscara común de los cuatro rituales.
//
// ══════════════════════════════════════════════════════════════════════════
// SALIR NUNCA CUESTA NADA
// ══════════════════════════════════════════════════════════════════════════
// El sheet es dismissible: gesto hacia abajo, backdrop, back del sistema y un
// «Agora não» explícito. Ninguna de esas salidas deja marca, ni rompe la
// racha, ni se menciona después. Un ritual que castiga la salida deja de ser
// un hábito y pasa a ser un peaje — y los peajes se pagan con basura para
// poder seguir.
//
// Máximo 3 pasos, con el progreso siempre visible: la persona tiene que poder
// ver cuánto falta ANTES de decidir si empieza. Veinte segundos que no se ven
// se sienten como cinco minutos.

import type { ReactNode } from 'react'
import { ProgressDots, Sheet } from '@/ui'

export interface PassosProps {
  open: boolean
  onClose: () => void
  titulo: string
  /** Bajada del paso actual. Cambia con el paso. */
  descricao: string
  /** 1-based. */
  passo: number
  total: number
  children: ReactNode
  /** Barra fija al pie: la acción del paso. */
  footer: ReactNode
}

export function Passos({ open, onClose, titulo, descricao, passo, total, children, footer }: PassosProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={titulo}
      description={descricao}
      snapPoints={[0.92]}
      footer={
        <div>
          {footer}
          <button
            type="button"
            onClick={onClose}
            className="mt-1 min-h-11 w-full text-center text-xs font-medium text-fg-subtle"
          >
            Agora não
          </button>
        </div>
      }
    >
      <div className="pb-2">
        <ProgressDots
          total={total}
          feitos={passo - 1}
          tone="marca"
          size="md"
          className="mb-4"
          aria-label={`Passo ${passo} de ${total}`}
        />
        {children}
      </div>
    </Sheet>
  )
}
