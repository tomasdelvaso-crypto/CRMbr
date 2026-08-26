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

import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Sheet, cx, haptic } from '@/ui'
import { TOPO_DA_BARRA, larguraDe } from '@/app/largura'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'
import { barraDeComandoVisivel } from './rotas'
import { useConversaVentus } from './useConversa'
import { Conversa } from './Conversa'

export interface BarraDeComandoProps {
  /** Oportunidad en contexto, si la pantalla tiene una abierta. */
  opportunityId?: number | null
  /** Nombre del cliente, para el placeholder. */
  contexto?: string | null
  /**
   * Botón que ocupa la ranura de la derecha.
   *
   * Acá vivía un micrófono que abría el MISMO sheet que el campo de texto: dos
   * controles para una sola acción. El Shell pone en su lugar el micrófono de
   * Registrar, que antes flotaba 4rem por encima de esta barra y tapaba la
   * primera tarjeta de Hoje. La barra no sabe qué botón es ni tiene por qué:
   * sólo le presta la ranura.
   */
  acao?: ReactNode
}

export function BarraDeComando({
  opportunityId = null,
  contexto = null,
  acao = null,
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
      {/* El alto de esta franja NO es libre: `--spacing-ventus` lo declara al
          píxel y todo lo que scrollea lo resta de su altura para no quedar
          debajo. Cambiar el relleno o el alvo de acá sin cambiar el token
          vuelve a poner la barra encima del contenido. */}
      <div
        // `lg:left-60`: el DesktopRail reserva 15rem fijos a la izquierda
        // (ver Shell.tsx); sin este corrimiento la barra se centra contra el
        // viewport entero y queda descentrada respecto de la columna de
        // contenido, que vive a la derecha del rail.
        className="fixed inset-x-0 z-30 px-safe lg:inset-x-auto lg:left-60 lg:right-0"
        // `--spacing-nav-visivel`: en escritorio la BottomNav desaparece y la
        // barra tiene que bajar a ocupar su lugar. NO es `--spacing-nav` a
        // secas —esa la sigue usando `--toast-bottom`, que no comparte esta
        // reserva—: ver el comentario junto a la variable en index.css.
        style={{ bottom: 'calc(var(--spacing-nav-visivel) + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* LA CAJA EXTERNA ES LA COLUMNA DE LA RUTA ACTIVA, al píxel: mismo
            `mx-auto`, mismo `max-w-*`, mismo `px-4`. Antes tenía un ancho
            propio (`lg:max-w-2xl`) y en escritorio quedaban dos cajas
            centradas de anchos distintos — la barra flotaba 112 px a la
            derecha de la columna que dice comandar. Ver src/app/largura.ts.

            El CAMPO de adentro lleva un tope propio (`TOPO_DA_BARRA`) y se
            alinea al borde izquierdo: en /cadencia y /carteira la columna
            mide 1.700 px y un campo de una línea con ese ancho sería la
            caricatura opuesta al defecto que se está arreglando. En las
            rutas más angostas que el tope no cambia nada. */}
        <div className={cx('mx-auto px-4 pb-2', larguraDe(location.pathname))}>
          <div
            className={cx(
              'flex w-full items-center gap-2 rounded-2xl border border-border bg-surface/95 p-1.5 shadow-lg backdrop-blur',
              TOPO_DA_BARRA,
            )}
          >
            <button
              type="button"
              onClick={abrir}
              className="flex min-h-touch flex-1 items-center gap-2 rounded-xl px-3 text-left text-base text-fg-subtle active:bg-surface-2 lg:hover:bg-surface-2"
            >
              <Sparkles size={18} aria-hidden className="shrink-0 text-brand" />
              <span className="truncate">
                {contexto != null ? `Perguntar sobre ${contexto}` : 'Perguntar ao Ventus'}
              </span>
            </button>
            {acao}
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
