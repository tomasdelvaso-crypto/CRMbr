// src/screens/Rituais/index.tsx
// RITUAIS — cuatro momentos de ≤20 segundos que nunca bloquean la app.
//
// ══════════════════════════════════════════════════════════════════════════
// LO QUE ESTA PANTALLA NO HACE
// ══════════════════════════════════════════════════════════════════════════
// No obliga, no interrumpe, no reprocha y no cierra ninguna puerta. Un ritual
// fuera de su ventana se puede abrir igual: cerrarle la puerta a alguien que
// quiere planear el día a las 11h sería castigar exactamente la conducta que
// queremos instalar.
//
// Lo que sí hace: tener siempre precargado lo que hace falta, para que el
// costo de empezar sea un tap. La manhã trae las tres del planner marcadas; la
// segunda trae los candidatos de la cola; la sexta trae el veredicto ya
// cruzado contra lo registrado. La persona confirma o corrige — nunca escribe
// de cero.
//
// El tono: Ventus es narrador, no capataz. Tres días sin abrir un ritual no
// produce un reproche, produce una oferta concreta.

import { useContext, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { CalendarCheck, Check, Flag, Moon, Sunrise } from 'lucide-react'
import type { ComponentType } from 'react'
import {
  ritualDoMomento,
  useDiaVigente,
  useMarcarRitual,
  useRituais,
  type DisponibilidadeDoRitual,
  type TipoRitual,
} from '@/data'
import { formatarDataCurta, nomeDoDia } from '@/core'
import { EmptyState, Skeleton, cx, haptic, toast } from '@/ui'
import { SessionContext } from '@/app/session-context'
import { RitualManha } from './RitualManha'
import { RitualNoite } from './RitualNoite'
import { RitualSegunda } from './RitualSegunda'
import { RitualSexta } from './RitualSexta'

export default function RituaisScreen() {
  const queryClient = useContext(QueryClientContext)
  const sessao = useContext(SessionContext)

  if (!queryClient || !sessao) return <EsqueletoDosRituais />
  return <Rituais vendorName={sessao.vendorName} vendorId={sessao.vendor?.id ?? null} />
}

const ICONE: Readonly<Record<TipoRitual, ComponentType<{ size?: number; className?: string }>>> = {
  manha: Sunrise,
  noite: Moon,
  segunda: Flag,
  sexta: CalendarCheck,
}

function Rituais({
  vendorName,
  vendorId,
}: {
  vendorName: string | null
  vendorId: number | null
}) {
  const hoje = useDiaVigente()
  const rituais = useRituais(vendorName, hoje)
  const marcar = useMarcarRitual()

  const [aberto, setAberto] = useState<TipoRitual | null>(null)

  const agora = ritualDoMomento(hoje)
  const lista = rituais.data ?? []

  const abrir = (tipo: TipoRitual) => {
    haptic('selection')
    setAberto(tipo)
  }

  const concluir = (tipo: TipoRitual) => {
    if (vendorName === null) return
    marcar.mutate({ vendor: vendorName, tipo, hoje })
    toast({ message: MENSAGEM_DE_FIM[tipo], tone: 'ok' })
  }

  if (rituais.isPending) return <EsqueletoDosRituais />

  const doMomento = lista.find((r) => r.tipo === agora && !r.feito)
  const restantes = lista.filter((r) => r.tipo !== doMomento?.tipo)

  return (
    <div className="px-4 pb-10">
      <header className="pt-4">
        <p className="text-2xs text-fg-subtle">
          {nomeDoDia(hoje)}, {formatarDataCurta(hoje)}
        </p>
        <h2 className="mt-0.5 text-base font-semibold text-fg">Quatro momentos, vinte segundos</h2>
      </header>

      {doMomento ? (
        <CartaoDoMomento ritual={doMomento} onAbrir={() => abrir(doMomento.tipo)} />
      ) : (
        <NadaAgora rituais={lista} onAbrir={abrir} />
      )}

      <ul className="mt-6 space-y-2.5">
        {restantes.map((r) => (
          <li key={r.tipo}>
            <LinhaDeRitual ritual={r} onAbrir={() => abrir(r.tipo)} />
          </li>
        ))}
      </ul>

      <p className="mt-6 text-2xs leading-relaxed text-fg-subtle">
        Nenhum ritual bloqueia nada. Dá para sair em qualquer passo — não quebra sequência, não
        marca nada e ninguém comenta depois.
      </p>

      {vendorName !== null && (
        <>
          <RitualManha
            open={aberto === 'manha'}
            onClose={() => setAberto(null)}
            vendorName={vendorName}
            dia={hoje}
            onPronto={() => concluir('manha')}
          />
          <RitualNoite
            open={aberto === 'noite'}
            onClose={() => setAberto(null)}
            vendorName={vendorName}
            dia={hoje}
            onPronto={() => concluir('noite')}
          />
          <RitualSegunda
            open={aberto === 'segunda'}
            onClose={() => setAberto(null)}
            vendorName={vendorName}
            vendorId={vendorId}
            dia={hoje}
            onPronto={() => concluir('segunda')}
          />
          <RitualSexta
            open={aberto === 'sexta'}
            onClose={() => setAberto(null)}
            vendorName={vendorName}
            dia={hoje}
            onPronto={() => concluir('sexta')}
          />
        </>
      )}
    </div>
  )
}

const MENSAGEM_DE_FIM: Readonly<Record<TipoRitual, string>> = {
  manha: 'Dia desenhado. Boa Golden Hour.',
  noite: 'Dia guardado.',
  segunda: 'Semana declarada.',
  sexta: 'Semana fechada.',
}

/** El ritual del momento, grande y con una sola salida: empezar. */
function CartaoDoMomento({
  ritual,
  onAbrir,
}: {
  ritual: DisponibilidadeDoRitual
  onAbrir: () => void
}) {
  const Icone = ICONE[ritual.tipo]
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="mt-4 w-full rounded-card border border-brand bg-brand-soft p-5 text-left transition-transform active:scale-[0.99]"
    >
      <span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-pill bg-brand text-brand-fg"
      >
        <Icone size={22} />
      </span>
      <span className="mt-3 block text-xl font-semibold tracking-tight text-brand-soft-fg">
        {ritual.chamada}
      </span>
      <span className="mt-1 block text-xs text-brand-soft-fg/80">
        {ritual.rotulo} · {ritual.duracao}
      </span>
      <span className="mt-4 block text-sm font-semibold text-brand">Começar →</span>
    </button>
  )
}

/**
 * Fuera de toda ventana. No es un vacío: es la línea del tiempo del día con
 * una oferta concreta. «Sem dados» no existe en este producto.
 */
function NadaAgora({
  rituais,
  onAbrir,
}: {
  rituais: DisponibilidadeDoRitual[]
  onAbrir: (t: TipoRitual) => void
}) {
  const pendente = rituais.find((r) => !r.feito)
  const todosFeitos = rituais.every((r) => r.feito || !r.noMomento)

  if (rituais.every((r) => r.feito)) {
    return (
      <div className="mt-4">
        <EmptyState
          icon={<Check size={26} />}
          variant="sucesso"
          title="Os rituais de hoje estão fechados"
          description="Nada a fazer aqui até amanhã de manhã. O resto do dia é telefone."
        />
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-card border border-border bg-surface p-4">
      <p className="text-sm leading-relaxed text-fg">
        {todosFeitos
          ? 'Nenhum ritual está no horário agora — mas todos abrem quando você quiser.'
          : 'Nenhum ritual está no horário agora.'}
      </p>
      {pendente && (
        <>
          <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
            Se quiser adiantar, {pendente.chamada.toLowerCase()} leva {pendente.duracao}.
          </p>
          <button
            type="button"
            onClick={() => onAbrir(pendente.tipo)}
            className="mt-3 min-h-11 text-sm font-semibold text-brand"
          >
            {pendente.chamada} →
          </button>
        </>
      )}
    </div>
  )
}

function LinhaDeRitual({
  ritual,
  onAbrir,
}: {
  ritual: DisponibilidadeDoRitual
  onAbrir: () => void
}) {
  const Icone = ICONE[ritual.tipo]
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex min-h-touch w-full items-center gap-3 rounded-card border border-border bg-surface p-3.5 text-left transition-transform active:scale-[0.99]"
      aria-label={`${ritual.rotulo}: ${ritual.chamada}. ${ritual.feito ? 'Já feito hoje.' : ritual.janela}`}
    >
      <span
        aria-hidden
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-pill',
          ritual.feito ? 'bg-ok-soft text-ok-soft-fg' : 'bg-surface-2 text-fg-muted',
        )}
      >
        {ritual.feito ? <Check size={18} /> : <Icone size={18} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{ritual.rotulo}</span>
        <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
          {ritual.feito ? 'feito' : `${ritual.chamada} · ${ritual.janela}`}
        </span>
      </span>

      <span
        className={cx(
          'shrink-0 rounded-pill px-2 py-0.5 text-2xs font-medium',
          ritual.feito
            ? 'bg-ok-soft text-ok-soft-fg'
            : ritual.noMomento
              ? 'bg-brand-soft text-brand-soft-fg'
              : 'bg-surface-2 text-fg-subtle',
        )}
      >
        {ritual.feito ? 'ok' : ritual.noMomento ? 'agora' : ritual.duracao}
      </span>
    </button>
  )
}

function EsqueletoDosRituais() {
  return (
    <div className="px-4 pt-6">
      <div className="mb-4 h-3 w-32 animate-pulse rounded bg-skeleton" />
      <div className="mb-6 h-40 w-full animate-pulse rounded-card bg-skeleton" />
      <Skeleton variant="rituais" />
    </div>
  )
}
