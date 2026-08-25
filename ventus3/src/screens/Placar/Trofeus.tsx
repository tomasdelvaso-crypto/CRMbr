// src/screens/Placar/Trofeus.tsx
// Los cinco troféus de la semana, revelados viernes 17h.
//
// Cinco títulos y cuatro personas: todos ganan algo casi siempre. Nadie gana
// dos — se asigna el mejor disponible — y por eso el reparto no depende de
// «ser el mejor», sino de en qué se es distinto.
//
// Zelador es el truco de todo el diseño: convierte la higiene del dato —el
// problema crónico y la razón por la que 51 de 54 oportunidades no tienen
// fecha— en estatus público.
//
// Antes de las 17h del viernes NO se adelanta nada. Ver el resultado antes
// mata la revelación, que es la mitad de lo que hace que la gente mire.

import { Gauge, HeartHandshake, MessageSquare, Sparkles, TrendingUp } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TrofeuDaSemana } from '@/data'
import type { TrophyKey } from '@/core'
import { cx } from '@/ui'

export interface TrofeusProps {
  trofeus: TrofeuDaSemana[]
  revelado: boolean
  textoDaRevelacao: string
  /** Nombre del vendedor logueado: el suyo se destaca. */
  vendorName: string | null
  onExplicar: (trofeu: TrofeuDaSemana) => void
}

const ICONE: Readonly<Record<TrophyKey, ComponentType<{ size?: number; className?: string }>>> = {
  motor: Gauge,
  escalador: TrendingUp,
  conversador: MessageSquare,
  zelador: Sparkles,
  reanimador: HeartHandshake,
}

export function Trofeus({ trofeus, revelado, textoDaRevelacao, vendorName, onExplicar }: TrofeusProps) {
  return (
    <section aria-label="Troféus da semana" className="mt-7">
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h2 className="text-sm font-semibold text-fg">Os cinco da semana</h2>
        <span className="text-2xs text-fg-subtle">{textoDaRevelacao}</span>
      </div>

      <ul
        className="flex snap-x gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {trofeus.map((trofeu) => (
          <li key={trofeu.chave} className="w-40 shrink-0 snap-start">
            <CartaoDeTrofeu
              trofeu={trofeu}
              revelado={revelado}
              meu={trofeu.vencedor !== null && trofeu.vencedor === vendorName}
              onExplicar={onExplicar}
            />
          </li>
        ))}
      </ul>

      {!revelado && (
        <p className="mt-1 px-4 text-2xs leading-relaxed text-fg-subtle">
          Ninguém ganha dois: quando um nome sai, ele sai da fila dos outros quatro.
        </p>
      )}
    </section>
  )
}

function CartaoDeTrofeu({
  trofeu,
  revelado,
  meu,
  onExplicar,
}: {
  trofeu: TrofeuDaSemana
  revelado: boolean
  meu: boolean
  onExplicar: (t: TrofeuDaSemana) => void
}) {
  const Icone = ICONE[trofeu.chave]
  const temDono = revelado && trofeu.vencedor !== null

  return (
    <button
      type="button"
      onClick={() => onExplicar(trofeu)}
      aria-label={`Troféu ${trofeu.rotulo}. ${trofeu.criterio}. Ver como é decidido.`}
      className={cx(
        'flex h-full w-full flex-col items-start rounded-card border p-3.5 text-left transition-transform active:scale-[0.98]',
        meu ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'flex size-9 items-center justify-center rounded-pill',
          temDono ? (meu ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-muted') : 'bg-surface-2 text-fg-subtle',
        )}
      >
        <Icone size={18} />
      </span>

      <span className="mt-2 text-sm font-semibold text-fg">{trofeu.rotulo}</span>
      <span className="mt-0.5 text-2xs leading-snug text-fg-subtle">{trofeu.criterio}</span>

      <div className="mt-auto pt-3">
        {temDono ? (
          <>
            <span className={cx('block text-xs font-semibold', meu ? 'text-accent-soft-fg' : 'text-fg')}>
              {meu ? 'Você' : primeiroNome(trofeu.vencedor ?? '')}
            </span>
            {trofeu.detalhe && (
              <span className="mt-0.5 block text-2xs leading-snug text-fg-muted">{trofeu.detalhe}</span>
            )}
            {trofeu.origem === 'previa' && (
              <span className="mt-1 block text-2xs text-fg-subtle">
                prévia com os dados que já chegaram
              </span>
            )}
          </>
        ) : (
          <span className="block text-2xs text-fg-subtle">
            {revelado ? 'Sem candidato nesta semana' : 'Sexta, 17h'}
          </span>
        )}
      </div>
    </button>
  )
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
