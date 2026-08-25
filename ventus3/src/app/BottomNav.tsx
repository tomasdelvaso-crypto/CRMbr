// src/app/BottomNav.tsx
// 5 destinos fijos. Targets de 44px como mínimo y padding de safe-area para
// que nada quede debajo del home indicator del iPhone.

import { NavLink } from 'react-router-dom'
import { Inbox, LayoutGrid, MoreHorizontal, Sun, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavDestino {
  to: string
  label: string
  Icon: LucideIcon
  /** Contador opcional (ej. pendências da Revisão). */
  badgeKey?: 'revisao'
}

const DESTINOS: readonly NavDestino[] = [
  { to: '/', label: 'Hoje', Icon: Sun },
  { to: '/carteira', label: 'Carteira', Icon: LayoutGrid },
  { to: '/golden', label: 'Golden', Icon: Timer },
  { to: '/revisao', label: 'Revisão', Icon: Inbox, badgeKey: 'revisao' },
  { to: '/mais', label: 'Mais', Icon: MoreHorizontal },
]

export interface BottomNavProps {
  /** Contadores por destino. TODO: alimentar desde queries.fetchNotifications. */
  badges?: Partial<Record<'revisao', number>>
}

export function BottomNav({ badges }: BottomNavProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-safe backdrop-blur"
    >
      <ul className="mx-auto flex h-nav max-w-lg items-stretch justify-around">
        {DESTINOS.map(({ to, label, Icon, badgeKey }) => {
          const count = badgeKey ? (badges?.[badgeKey] ?? 0) : 0
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                viewTransition
                className={({ isActive }) =>
                  [
                    'relative flex h-full min-h-touch w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-opacity',
                    isActive ? 'text-brand' : 'text-fg-muted',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                      {count > 0 && (
                        <span
                          className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white"
                          aria-label={`${count} pendências`}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </span>
                    <span>{label}</span>
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
