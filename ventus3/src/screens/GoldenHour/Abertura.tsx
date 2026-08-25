// src/screens/GoldenHour/Abertura.tsx
// Lo único que se decide ANTES de entrar en foco: cuánto dura el bloque y
// cuántos toques son la meta. Después de tocar «Começar» no se configura nada.
//
// El plano lo dice con todas las letras: armar listas y cargar el CRM se hace
// antes, nunca durante. Esta pantalla es la última puerta antes del silencio.

import { useState } from 'react'
import { Flame, Play, Zap } from 'lucide-react'
import { Button, EmptyState, SegmentedControl, Stepper, haptic } from '@/ui'
import { DURACOES, DURACAO_PADRAO, META_MAX, META_MIN, metaSugerida } from './sessao'
import type { ItemDaFila } from './fila'

export interface AberturaProps {
  itens: readonly ItemDaFila[]
  /** true cuando la fila se derivó en el momento por no haber una aprobada. */
  derivada: boolean
  carregando: boolean
  onComecar: (duracaoMin: number, metaToques: number) => void
  onSair: () => void
  onVerCadencia: () => void
}

export function Abertura({
  itens,
  derivada,
  carregando,
  onComecar,
  onSair,
  onVerCadencia,
}: AberturaProps) {
  const [duracao, setDuracao] = useState<string>(String(DURACAO_PADRAO))
  const [meta, setMeta] = useState<number | null>(null)

  const metaEfetiva = meta ?? metaSugerida(itens.length)
  const prontos = itens.length

  if (!carregando && prontos === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4">
        <EmptyState
          icon={<Zap size={40} aria-hidden />}
          title="A fila de hoje está vazia"
          description="A fila se monta na véspera, às 18h. Dá para montar uma agora com os leads que estão com o toque vencido — são os que mais rendem."
          actionLabel="Montar a fila na Cadência"
          onAction={onVerCadencia}
          secondaryLabel="Voltar para Hoje"
          onSecondary={onSair}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 pb-6 pt-6 scroll-momentum">
      <header>
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand">
          <Flame size={16} aria-hidden />
          Golden Hour
        </p>
        <h2 className="mt-2 text-3xl font-bold leading-tight tracking-tight">
          {carregando ? 'Preparando a fila…' : `${prontos} contatos prontos`}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {derivada
            ? 'Montada agora com quem está mais atrasado na cadência. Nada de CRM durante o bloco: só ligar, falar e registrar.'
            : 'A fila que você aprovou ontem. Nada de CRM durante o bloco: só ligar, falar e registrar.'}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-fg-subtle">
          Duração do bloco
        </h3>
        <SegmentedControl
          label="Duração do bloco"
          value={duracao}
          onChange={setDuracao}
          options={DURACOES.map((d) => ({ value: String(d), label: `${d} min` }))}
        />
        <p className="text-xs text-fg-subtle">
          A Hora Cheia precisa de 40 minutos. Abaixo disso o bloco conta como atividade, não
          como hábito.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Stepper
          label="Meta de toques"
          value={metaEfetiva}
          onChange={setMeta}
          min={META_MIN}
          max={META_MAX}
          tone="marca"
          levelText={
            metaEfetiva > prontos
              ? `A fila tem ${prontos}. Vai faltar contato.`
              : `${prontos} na fila — dá folga.`
          }
        />
      </section>

      {/* Los tres primeros de la fila, para que el arranque no sea a ciegas. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-fg-subtle">Começa por</h3>
        <ol className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {itens.slice(0, 3).map((item, i) => (
            <li key={item.lead.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="tnum w-5 shrink-0 text-sm font-bold text-fg-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {item.lead.company_name}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  {item.lead.contact_name ?? 'Sem contato nomeado'} · toque {item.passo.tp}
                </span>
              </span>
            </li>
          ))}
          {prontos > 3 && (
            <li className="px-3 py-2 text-xs text-fg-subtle">e mais {prontos - 3} na fila</li>
          )}
        </ol>
      </section>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button
          block
          size="lg"
          icon={<Play size={20} aria-hidden />}
          hapticPattern="impact"
          onClick={() => {
            haptic('impact')
            onComecar(Number(duracao), metaEfetiva)
          }}
        >
          Começar a hora
        </Button>
        <Button block variant="ghost" onClick={onSair}>
          Agora não
        </Button>
      </div>
    </div>
  )
}
