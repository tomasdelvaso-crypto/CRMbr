// src/screens/Ventus/Conversa.tsx
// La lista de burbujas + el compositor. Se usa igual en la pantalla /ventus y
// dentro del bottom sheet de la barra de comando, así que no sabe nada de
// rutas ni de layout: recibe el estado y lo pinta.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Chip, EmptyState } from '@/ui'
import { Compositor } from './Compositor'
import { Mensagem } from './Mensagem'
import { SUGESTOES } from './sugestoes'
import type { EstadoConversa } from './useConversa'

export interface ConversaProps {
  conversa: EstadoConversa
  /** Nombre del cliente cuando el chat abre desde una ficha. */
  contexto?: string | null
  /** Cierra el contenedor (el sheet) al navegar a otro lado. */
  onNavegar?: () => void
  autoFocus?: boolean
  className?: string
}

export function Conversa({
  conversa,
  contexto,
  onNavegar,
  autoFocus = false,
  className,
}: ConversaProps) {
  const navigate = useNavigate()
  const [rascunho, setRascunho] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  // Scroll al final con cada token. `block:'end'` y no scrollTop: el sheet y
  // la página tienen contenedores de scroll distintos y esto funciona en los dos.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [conversa.mensagens])

  const enviar = () => {
    const texto = rascunho
    setRascunho('')
    void conversa.enviar(texto)
  }

  const vazio = conversa.mensagens.length === 0

  return (
    <div className={className}>
      {conversa.emMock && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn-soft-fg">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            O Ventus ainda não está ligado neste ambiente. As respostas abaixo são
            simuladas — o que vem do motor determinístico continua sendo real.
          </span>
        </p>
      )}

      {vazio ? (
        <div className="py-6">
          <EmptyState
            icon={<Sparkles size={28} aria-hidden />}
            title={contexto != null ? `Pergunte sobre ${contexto}` : 'Pergunte qualquer coisa'}
            description="Pendências, status de cliente, pipeline e compromissos saem na hora, sem internet. O resto eu penso."
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGESTOES.map((s) => (
              <Chip
                key={s}
                tone="marca"
                onClick={() => {
                  void conversa.enviar(s)
                }}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-4" aria-live="polite" aria-atomic="false">
          {conversa.mensagens.map((m) => (
            <Mensagem
              key={m.id}
              mensagem={m}
              decisoes={conversa.decisoes}
              previewOcupado={conversa.previewOcupado}
              onConfirmarPreview={(p) => void conversa.confirmarPreview(p)}
              onRecusarPreview={(p) => void conversa.recusarPreview(p)}
              onVotar={(voto, motivo) => {
                conversa.votar(m.id, voto, motivo)
              }}
              onAtalho={(a) => {
                onNavegar?.()
                if (a.opportunityId !== undefined) {
                  void navigate(`/carteira/${String(a.opportunityId)}`)
                } else if (a.rota !== undefined) {
                  void navigate(a.rota)
                }
              }}
            />
          ))}
        </ul>
      )}

      <div ref={fim} />

      <div className="sticky bottom-0 -mx-1 mt-4 bg-bg/95 px-1 pb-1 pt-2 backdrop-blur">
        <Compositor
          valor={rascunho}
          onChange={setRascunho}
          onEnviar={enviar}
          enviando={conversa.enviando}
          onParar={conversa.parar}
          autoFocus={autoFocus}
          {...(contexto != null ? { placeholder: `Pergunte sobre ${contexto}` } : {})}
        />
      </div>
    </div>
  )
}
