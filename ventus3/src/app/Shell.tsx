// src/app/Shell.tsx
// Layout de la app: header, contenido scrolleable, bottom nav y el FAB de
// micrófono (la puerta principal de entrada de datos).

import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { ConfirmHost, ToastHost } from '@/ui'

/** Títulos del header por ruta. En PT-BR, como todo lo visible. */
const TITULOS: Readonly<Record<string, string>> = {
  '/': 'Hoje',
  '/carteira': 'Carteira',
  '/golden': 'Golden Hour',
  '/revisao': 'Revisão do Ventus',
  '/mais': 'Mais',
  '/cadencia': 'Cadência',
  '/placar': 'Placar da Semana',
  '/rituais': 'Rituais',
  '/ventus': 'Ventus',
  '/gestor': 'Painel do Gestor',
  '/ajustes': 'Ajustes',
  '/registrar': 'Registrar',
  '/kitchen': 'Kitchen Sink',
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const titulo = TITULOS[location.pathname] ?? 'Ventus'

  // La Golden Hour es modo foco: sin header, sin nav, sin salidas laterales.
  const modoFoco = location.pathname.startsWith('/golden')

  if (modoFoco) {
    return (
      <div className="min-h-screen-svh bg-bg text-fg">
        <Outlet />
        {/* Los hosts van fuera del scroll: son portales a document.body. */}
        <ToastHost />
        <ConfirmHost />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen-svh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-safe pt-safe backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <h1 className="text-lg font-semibold tracking-tight">{titulo}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-safe pb-nav-safe">
        <Outlet />
      </main>

      {/* FAB de micrófono: registrar por voz tiene que costar menos que abrir
          la libreta. TODO: badge de registros pendientes de envío (outbox). */}
      <button
        type="button"
        aria-label="Registrar por voz"
        onClick={() => void navigate('/registrar')}
        className="fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg transition-transform active:scale-95"
        style={{ bottom: 'calc(var(--spacing-nav) + env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <Mic size={24} aria-hidden />
      </button>

      <BottomNav />

      {/* Únicos canales de feedback efímero y de confirmación de la app.
          Montados una sola vez acá: reemplazan a los 27 alert()/confirm(). */}
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}
