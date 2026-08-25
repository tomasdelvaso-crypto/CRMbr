// src/screens/Ventus/BarraDeComando.tsx
// La barra persistente encima da bottom nav. Es la puerta del Ventus desde
// cualquier pantalla.
//
// Por qué una barra y no solo el ícono de una tab: preguntar tiene que costar
// menos que navegar. Si el vendedor tiene que acordarse de que existe una
// pantalla de chat, no la usa; si la barra está ahí abajo con el cursor
// esperando, la usa.
//
// Toca el sheet expandible con drag-to-dismiss de @/ui (dos snaps: media
// pantalla y casi entera). El teclado de Android empuja la barra por sí solo
// vía visualViewport; el sheet ya recalcula su alto con ResizeObserver.

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Sparkles } from 'lucide-react'
import { Sheet, cx, haptic } from '@/ui'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'
import { barraDeComandoVisivel } from './rotas'
import { useConversaVentus } from './useConversa'
import { Conversa } from './Conversa'

export interface BarraDeComandoProps {
  /** Oportunidad en contexto, si la pantalla tiene una abierta. */
  opportunityId?: number | null
  /** Nombre del cliente, para el placeholder. */
  contexto?: string | null
}

export function BarraDeComando({
  opportunityId = null,
  contexto = null,
}: BarraDeComandoProps) {
  const location = useLocation()
  const { vendorName } = useVendorDaSessao()
  const [aberto, setAberto] = useState(false)
  const [rotaDoSheet, setRotaDoSheet] = useState(location.pathname)
  const conversa = useConversaVentus(vendorName, opportunityId)

  // Cambiar de ruta cierra el sheet: si no, el vendedor toca un atajo, navega
  // y queda con el chat tapando la pantalla a la que quería ir.
  //
  // Se ajusta EN RENDER y no en un efecto a propósito: un efecto pintaría un
  // frame con el sheet todavía abierto sobre la pantalla nueva.
  if (rotaDoSheet !== location.pathname) {
    setRotaDoSheet(location.pathname)
    if (aberto) setAberto(false)
  }

  if (!barraDeComandoVisivel(location.pathname, vendorName)) return null

  const abrir = () => {
    haptic('impact')
    setAberto(true)
  }

  return (
    <>
      <div
        className="fixed inset-x-0 z-30 px-safe"
        style={{ bottom: 'calc(var(--spacing-nav) + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto max-w-lg px-4 pb-2">
          <div
            className={cx(
              'flex items-center gap-2 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur',
            )}
          >
            <button
              type="button"
              onClick={abrir}
              className="flex min-h-touch flex-1 items-center gap-2 rounded-xl px-3 text-left text-base text-fg-subtle active:bg-surface-2"
            >
              <Sparkles size={18} aria-hidden className="shrink-0 text-brand" />
              <span className="truncate">
                {contexto != null ? `Perguntar sobre ${contexto}` : 'Perguntar ao Ventus'}
              </span>
            </button>
            <button
              type="button"
              onClick={abrir}
              aria-label="Falar com o Ventus"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg active:bg-brand-strong"
            >
              <Mic size={20} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <Sheet
        open={aberto}
        onClose={() => {
          setAberto(false)
        }}
        title="Ventus"
        {...(contexto != null ? { description: `Sobre ${contexto}` } : {})}
        snapPoints={[0.6, 0.94]}
        initialSnap={0}
      >
        <Conversa
          conversa={conversa}
          contexto={contexto}
          autoFocus
          onNavegar={() => {
            setAberto(false)
          }}
        />
      </Sheet>
    </>
  )
}
