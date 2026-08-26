// src/app/DesktopRail.tsx
// Navegação lateral fixa para telas grandes (lg, ≥1024px). É o que substitui
// a BottomNav quando há espaço de sobra: uma coluna de telefone flutuando no
// meio de um monitor lia como app quebrado, não como decisão de design.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. MISMOS 5 DESTINOS DE LA BOTTOMNAV + GESTOR (SI ADMIN) + AJUSTES. En un
//    monitor sobra lugar para no esconder Gestor y Ajustes detrás de «Mais»:
//    enterrar dos pantallas de uso diario en un submenú es un costo que sólo
//    tiene sentido cuando el pulgar y los 512px del teléfono lo justifican.
//
// 2. EL FAB DEL MICRÓFONO SE INTEGRA ACÁ COMO ACCIÓN DESTACADA. En escritorio
//    no hay pulgar que alcance un botón flotante en la esquina, y una barra
//    de comando pegada al piso de un monitor de 27" es la misma rareza que un
//    bottom sheet ahí abajo. Vive arriba de la lista de destinos, con el
//    mismo badge del outbox que tenía en el Shell.
//
// 3. EL INDICADOR DE PERFIL VA AL PIE, SIEMPRE VISIBLE. Es la respuesta a
//    «¿tengo perfil administrador?» sin tener que entrar a Mais a buscarla.
//    El contenido vive en PerfilChip.tsx: este archivo sólo le presta el
//    lugar, igual que el Shell le presta la ranura del micrófono a la barra
//    de comando.

import { NavLink } from 'react-router-dom'
import { Inbox, LayoutGrid, Mic, MoreHorizontal, Settings, Sun, Timer, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { haptic } from '@/ui'
import { PerfilChip } from './PerfilChip'
import type { ChaveDeBadge } from './BottomNav'

interface RailDestino {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
  badgeKey?: ChaveDeBadge
  /** Nombre largo para el lector de pantalla. Igual que en la BottomNav —
   *  «Revisão» ahí es «Revisão do Ventus» acá también—, porque los dos son la
   *  MISMA lista de destinos, sólo que uno la muestra en un rótulo corto. */
  labelLongo?: string
}

/** Los mismos 5 de la BottomNav. Ver la decisión 1. */
const DESTINOS: readonly RailDestino[] = [
  { to: '/', label: 'Hoje', Icon: Sun, end: true },
  { to: '/carteira', label: 'Carteira', Icon: LayoutGrid },
  { to: '/golden', label: 'Golden Hour', Icon: Timer },
  { to: '/revisao', label: 'Revisão', Icon: Inbox, badgeKey: 'revisao', labelLongo: 'Revisão do Ventus' },
  { to: '/mais', label: 'Mais', Icon: MoreHorizontal },
]

export interface DesktopRailProps {
  badges?: Partial<Record<ChaveDeBadge, number>>
  isAdmin: boolean
  mostrarMicrofone: boolean
  rotuloDoMicrofone: string
  pendentesOutbox: number
  onRegistrar: () => void
}

export function DesktopRail({
  badges,
  isAdmin,
  mostrarMicrofone,
  rotuloDoMicrofone,
  pendentesOutbox,
  onRegistrar,
}: DesktopRailProps) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col overflow-y-auto border-r border-border bg-surface px-3 py-4 pt-safe lg:flex"
    >
      <div className="flex items-center gap-2 px-2 pb-4">
        <span className="text-lg font-bold tracking-tight text-brand">Ventus</span>
      </div>

      {/* Acción destacada: ver la decisión 2. Mismo `aria-label` que en el
          Shell, con el conteo del outbox escrito en palabras. */}
      {mostrarMicrofone && (
        <button
          type="button"
          aria-label={rotuloDoMicrofone}
          onClick={onRegistrar}
          className="mb-4 flex min-h-touch items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-brand-fg transition-colors active:bg-brand-strong lg:hover:bg-brand-strong"
        >
          <Mic size={18} aria-hidden />
          Registrar
          {pendentesOutbox > 0 && (
            <span
              aria-hidden
              className="ml-auto flex min-w-5 items-center justify-center rounded-full border-2 border-brand bg-warn px-1 text-[10px] font-bold leading-4 text-warn-fg"
            >
              {pendentesOutbox > 99 ? '99+' : pendentesOutbox}
            </span>
          )}
        </button>
      )}

      <ul className="flex flex-1 flex-col gap-1">
        {DESTINOS.map((destino) => (
          <ItemDoRail key={destino.to} destino={destino} count={destino.badgeKey ? (badges?.[destino.badgeKey] ?? 0) : 0} />
        ))}

        {isAdmin && (
          <>
            <li aria-hidden className="my-2 border-t border-border" />
            <ItemDoRail destino={{ to: '/gestor', label: 'Painel do Gestor', Icon: Users }} count={0} />
          </>
        )}

        <ItemDoRail destino={{ to: '/ajustes', label: 'Ajustes', Icon: Settings }} count={0} />
      </ul>

      {/* Indicador de perfil: ver la decisión 3. */}
      <div className="mt-2 border-t border-border pt-2">
        <PerfilChip />
      </div>
    </nav>
  )
}

function ItemDoRail({ destino, count }: { destino: RailDestino; count: number }) {
  const { to, label, Icon, end, labelLongo } = destino
  const acessivel =
    count > 0
      ? `${labelLongo ?? label}, ${count} ${count === 1 ? 'pendência' : 'pendências'}`
      : (labelLongo ?? label)

  return (
    <li>
      <NavLink
        to={to}
        end={end}
        viewTransition
        aria-label={acessivel}
        onClick={() => haptic('selection')}
        className={({ isActive }) =>
          [
            'flex min-h-touch items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
            isActive ? 'bg-brand-soft text-brand-soft-fg' : 'text-fg-muted lg:hover:bg-surface-2 lg:hover:text-fg',
          ].join(' ')
        }
      >
        <span className="relative flex shrink-0 items-center justify-center" aria-hidden>
          <Icon size={20} />
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        <span aria-hidden className="truncate">
          {label}
        </span>
      </NavLink>
    </li>
  )
}
