// src/screens/Ventus/index.tsx
// Ventus — el acceso conversacional al agente.
//
// Cuatro decisiones que gobiernan esta pantalla:
//
//  1. STREAMING SIEMPRE. El v2 responde de una sola pieza y produce 504
//     silenciosos que el vendedor lee como «a app travou». Acá el primer token
//     llega en menos de un segundo y el cursor prueba que hay alguien del
//     otro lado.
//
//  2. LO QUE SE PUEDE RESPONDER SIN TOKENS, SE RESPONDE SIN TOKENS.
//     Pendências, status de cliente, «sem toque há N dias», pipeline y
//     compromissos salen de @/core sobre Dexie: instantáneo, offline y sin
//     posibilidad de alucinar un número. Solo la redacción y el diagnóstico
//     van al modelo (ver motor.ts).
//
//  3. NUNCA ESCRIBE SOLO. Cada acción se muestra ANTES de ejecutarse y el
//     humano confirma. Confirmar es ventus_commit_action — la misma puerta
//     que usa la Revisão, no un camino paralelo.
//
//  4. SIN RED RESPONDE IGUAL, y lo dice. Un chat que se queda mudo dentro del
//     galpão es un chat que el vendedor deja de abrir.

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eraser, MessageSquare } from 'lucide-react'
import { useCarteira } from '@/data'
import { Button, EmptyState, IconButton, confirmar, toast } from '@/ui'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'
import { useConversaVentus } from './useConversa'
import { Conversa } from './Conversa'

export default function VentusScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { vendorName, carregando } = useVendorDaSessao()

  // ?opp=123 abre la conversación DE ese cliente. Es lo que usa el botón de
  // coaching del Dossiê, y lo que hace que el historial sea por oportunidad.
  const bruto = Number(params.get('opp'))
  const opportunityId = Number.isInteger(bruto) && bruto > 0 ? bruto : null

  const carteira = useCarteira(vendorName)
  const conversa = useConversaVentus(vendorName, opportunityId)
  const [limpando, setLimpando] = useState(false)

  const contexto = useMemo(() => {
    if (opportunityId === null) return null
    const linha = carteira.data?.find((l) => l.opportunity.id === opportunityId)
    if (!linha) return null
    return linha.opportunity.client ?? linha.opportunity.name ?? null
  }, [carteira.data, opportunityId])

  if (carregando) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<MessageSquare size={28} aria-hidden />}
          title="Abrindo o Ventus"
          description="Um instante."
        />
      </div>
    )
  }

  if (vendorName === null) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<MessageSquare size={28} aria-hidden />}
          title="Entre para conversar"
          description="O Ventus responde sobre a SUA carteira — por isso precisa saber quem é você."
          actionLabel="Entrar"
          onAction={() => void navigate('/login')}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {contexto != null && (
            <button
              type="button"
              onClick={() => void navigate(`/carteira/${String(opportunityId)}`)}
              className="truncate text-sm font-medium text-brand"
            >
              {`Sobre ${contexto} · abrir a ficha`}
            </button>
          )}
        </div>
        {conversa.mensagens.length > 0 && (
          <IconButton
            variant="ghost"
            aria-label="Limpar esta conversa"
            loading={limpando}
            onClick={async () => {
              const ok = await confirmar({
                title: 'Limpar a conversa?',
                description:
                  'O histórico desta ficha some do aparelho. O que já foi aplicado no CRM continua lá.',
                confirmLabel: 'Limpar',
                tone: 'perigo',
              })
              if (!ok) return
              setLimpando(true)
              try {
                await conversa.limpar()
                toast({ message: 'Conversa limpa.', tone: 'neutro' })
              } finally {
                setLimpando(false)
              }
            }}
          >
            <Eraser size={18} aria-hidden />
          </IconButton>
        )}
      </div>

      <Conversa conversa={conversa} contexto={contexto} className="flex-1" />

      {opportunityId !== null && (
        <Button
          variant="ghost"
          block
          className="mt-2"
          onClick={() => void navigate('/ventus')}
        >
          Conversar sem cliente
        </Button>
      )}
    </div>
  )
}
