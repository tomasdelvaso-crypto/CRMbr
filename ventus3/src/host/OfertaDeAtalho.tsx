// src/host/OfertaDeAtalho.tsx
// La oferta de poner el Ventus en la pantalla de inicio, dentro del Mini App.
//
// ══════════════════════════════════════════════════════════════════════════
// CUÁNDO APARECE — Y POR QUÉ UNA SOLA VEZ
// ══════════════════════════════════════════════════════════════════════════
// En la TERCERA apertura, nunca antes, y nunca dos veces (ver `atalho.ts`).
// Fuera de Telegram no se renderiza jamás: `deveOferecerAtalho()` exige un
// cliente 8.0, así que esto no compite con el flujo de instalación de la PWA.
//
// Aparece abajo, apoyado sobre la safe area, y NO bloquea la pantalla: no es
// un modal. Un modal para pedir un favor, en una app de trabajo, se cierra sin
// leer — y como solo se pregunta una vez, cerrarlo sin leer es perder la única
// oportunidad de que el ícono quede en el home.
//
// Lo monta `HostProvider`, no una pantalla: es chrome del host y tiene que
// funcionar esté donde esté el vendedor cuando le toque la tercera sesión.

import { Home, X } from 'lucide-react'
import { haptic } from '@/ui'
import { useOfertaDeAtalho } from './useHost'

export function OfertaDeAtalho() {
  const { deveOferecer, oferecer, dispensar } = useOfertaDeAtalho()

  if (!deveOferecer) return null

  return (
    <div
      // `lg:pl-60`: el Shell reserva los 240px del DesktopRail con la misma
      // clase (ver Shell.tsx). Sin ella, este banner —fijo al ancho de TODA
      // la ventana— se centra sobre el rail incluido y queda corrido a la
      // izquierda del área de contenido, igual que le pasaba al Sheet.
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(var(--safe-bottom)+0.75rem)] lg:pl-60"
      role="region"
      aria-label="Adicionar o Ventus à tela de início"
    >
      <div className="mx-auto flex max-w-col items-start gap-3 rounded-card border border-border bg-surface p-3 shadow-raised">
        <span className="mt-0.5 shrink-0 rounded-md bg-brand-soft p-2 text-brand-soft-fg">
          <Home size={18} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Deixa o Ventus na tela de início</p>
          <p className="mt-1 text-xs leading-snug text-fg-muted">
            Um toque e o ícone fica junto dos outros apps. É o caminho mais curto para a Golden
            Hour — sem procurar o bot no meio das conversas.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-touch rounded-pill bg-brand px-4 text-sm font-medium text-brand-fg"
              onClick={() => {
                haptic('tap')
                void oferecer()
              }}
            >
              Adicionar
            </button>
            <button
              type="button"
              className="min-h-touch rounded-pill px-4 text-sm font-medium text-fg-muted"
              onClick={dispensar}
            >
              Agora não
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Fechar"
          className="-m-1 shrink-0 p-1 text-fg-subtle"
          onClick={dispensar}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}
