// src/app/BottomNav.tsx
// Los cinco destinos fijos. Nada más entra acá.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ CINCO Y POR QUÉ ESTOS CINCO
// ══════════════════════════════════════════════════════════════════════════
// Hoje (lo que hay que hacer), Carteira (buscar algo puntual), Golden (la hora
// de prospectar), Revisão (lo que el Ventus propuso y espera) y Mais (todo lo
// demás). Cadência, Placar, Rituais, Gestor e Ajustes viven detrás de «Mais»
// a propósito: son pantallas de una vez por día o de una vez por semana, y
// ponerlas en la barra les daría el mismo peso visual que a Hoje.
//
// Detalles que no son decorativos:
//  · `pb-safe` — sin esto, en iPhone el rótulo queda debajo del home indicator.
//  · `min-h-touch` por ítem, no por ícono: el área tocable es la celda entera.
//  · `viewTransition` en el NavLink: react-router envuelve la navegación en
//    startViewTransition y el Shell le dice la dirección por `data-vt`.
//  · el badge NO se anima al aparecer: un número que rebota en la barra es
//    exactamente el tipo de urgencia fabricada que este rediseño saca.

import { NavLink } from 'react-router-dom'
import { Inbox, LayoutGrid, MoreHorizontal, Sun, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { haptic } from '@/ui'

/** Los contadores que la barra sabe pintar. */
export type ChaveDeBadge = 'revisao'

interface NavDestino {
  to: string
  label: string
  Icon: LucideIcon
  /** Nombre largo para el lector de pantalla, cuando el rótulo se abrevia. */
  labelLongo?: string
  badgeKey?: ChaveDeBadge
}

const DESTINOS: readonly NavDestino[] = [
  { to: '/', label: 'Hoje', Icon: Sun },
  { to: '/carteira', label: 'Carteira', Icon: LayoutGrid },
  { to: '/golden', label: 'Golden', Icon: Timer, labelLongo: 'Golden Hour' },
  { to: '/revisao', label: 'Revisão', Icon: Inbox, labelLongo: 'Revisão do Ventus', badgeKey: 'revisao' },
  { to: '/mais', label: 'Mais', Icon: MoreHorizontal },
]

export interface BottomNavProps {
  /** Contadores por destino. Hoy sólo la Revisão tiene bandeja que contar. */
  badges?: Partial<Record<ChaveDeBadge, number>>
}

export function BottomNav({ badges }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur"
    >
      <ul className="mx-auto flex h-nav max-w-lg items-stretch justify-around">
        {DESTINOS.map(({ to, label, Icon, labelLongo, badgeKey }) => {
          const count = badgeKey ? (badges?.[badgeKey] ?? 0) : 0
          const acessivel =
            count > 0
              ? `${labelLongo ?? label}, ${count} ${count === 1 ? 'pendência' : 'pendências'}`
              : (labelLongo ?? label)

          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                viewTransition
                aria-label={acessivel}
                onClick={() => haptic('selection')}
                className={({ isActive }) =>
                  [
                    'relative flex h-full min-h-touch w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-opacity',
                    isActive ? 'text-brand' : 'text-fg-muted',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Barra del destino activo. Va arriba y no debajo del
                        rótulo: debajo la tapa el home indicator del iPhone. */}
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-6 top-0 h-0.5 rounded-b-pill bg-brand"
                      />
                    )}
                    <span className="relative">
                      <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                      {count > 0 && (
                        <span
                          aria-hidden
                          className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white"
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </span>
                    <span aria-hidden>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
