// src/screens/Gestor/CartaoDoVendedor.tsx
// Una persona, una tarjeta, UNA jugada de coaching.
//
// El orden interno es el orden de una conversación de 1:1 que funciona:
//   1. qué se movió  (empieza por lo que salió bien, y con la prueba al lado)
//   2. qué se estancó (el problema, con nombre y valor)
//   3. compromisos    (el dato que la persona misma se puso)
//   4. UNA sugerencia (con la pregunta literal para usar)
//
// Empezar por los números y terminar por lo que se movió produce la reunión
// que el equipo ya conoce y evita.

import { ArrowUpRight, MessageCircleQuestion, PauseCircle, Quote } from 'lucide-react'
import type { VendedorNoPainel } from '@/data'
import { Avatar, Badge, Card, Chip, cx } from '@/ui'

export function CartaoDoVendedor({ vendedor }: { vendedor: VendedorNoPainel }) {
  const { compromissos, coaching } = vendedor
  const adocao = vendedor.diasUteis === 0 ? 0 : vendedor.diasAtivos / vendedor.diasUteis

  return (
    <Card padding="md" className="flex flex-col gap-4">
      {/* ── Cabecera ─────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-3">
        <Avatar name={vendedor.nome} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight">{vendedor.nome}</p>
          <p className="text-sm text-fg-muted">
            {vendedor.carteira} {vendedor.carteira === 1 ? 'oportunidade' : 'oportunidades'} ·{' '}
            {vendedor.pipelineFormatado}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-lg font-bold tracking-tight">
            {vendedor.diasAtivos}/{vendedor.diasUteis}
          </p>
          <p className="text-2xs text-fg-subtle">dias com registro</p>
        </div>
      </header>

      {/* ── Barra de adopción ────────────────────────────────────────────── */}
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
          <div
            className={cx(
              'h-full rounded-pill',
              adocao >= 0.8 ? 'bg-ok' : adocao >= 0.4 ? 'bg-warn' : 'bg-danger',
            )}
            style={{ width: `${Math.max(2, adocao * 100)}%` }}
          />
        </div>
      </div>

      {/* ── Qué se movió ─────────────────────────────────────────────────── */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <ArrowUpRight size={13} aria-hidden />
          O que andou
        </h4>
        {vendedor.moveu.length === 0 ? (
          <p className="mt-1.5 text-sm leading-snug text-fg-muted">
            Nenhuma escala nem etapa se moveu esta semana. Vale perguntar o que travou antes de
            olhar volume.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-2">
            {vendedor.moveu.map((m, i) => (
              <li key={`${m.opportunityId}-${i}`} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 leading-snug">
                    <strong className="font-medium">{m.cliente}</strong> — {m.oQue}
                  </span>
                  <Badge tone={m.comProva ? 'ok' : 'atencao'} variant="soft">
                    {m.comProva ? 'com registro' : 'declarado'}
                  </Badge>
                </div>
                {m.citacao && (
                  <p className="mt-1 flex gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs leading-snug text-fg-muted">
                    <Quote size={12} aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
                    {m.citacao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Qué se estancó ───────────────────────────────────────────────── */}
      <section>
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <PauseCircle size={13} aria-hidden />
          O que parou
        </h4>
        {vendedor.estagnou.length === 0 ? (
          <p className="mt-1.5 text-sm leading-snug text-fg-muted">
            Nada parado há mais de duas semanas. Isso é raro e merece ser dito em voz alta.
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {vendedor.estagnou.map((e) => (
              <li key={e.opportunityId} className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 leading-snug">
                  <strong className="font-medium">{e.cliente}</strong>
                  <span className="text-fg-muted"> · {e.etapa}</span>
                </span>
                <span className="tnum shrink-0 text-xs text-fg-muted">{e.valorFormatado}</span>
                <span className="tnum shrink-0 text-xs font-medium text-warn-soft-fg">
                  {e.diasSemToque > 900 ? 'sem toque' : `${e.diasSemToque}d`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Compromisos ──────────────────────────────────────────────────── */}
      <section className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Compromissos da semana
          </p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {compromissos.percentual === null
              ? 'Nenhum compromisso registrado nesta semana.'
              : `${compromissos.cumpridos} de ${compromissos.total} cumpridos.`}
          </p>
        </div>
        {compromissos.percentual !== null && (
          <Chip
            tone={
              compromissos.percentual >= 80
                ? 'ok'
                : compromissos.percentual >= 50
                  ? 'atencao'
                  : 'perigo'
            }
          >
            {compromissos.percentual}%
          </Chip>
        )}
      </section>

      {/* ── LA sugerencia ────────────────────────────────────────────────── */}
      {coaching && (
        <section className="rounded-lg border border-brand/30 bg-brand-soft p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-soft-fg">
            <MessageCircleQuestion size={13} aria-hidden />
            Uma conversa para esta semana
          </h4>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-brand-soft-fg">
            {coaching.titulo}
          </p>
          <p className="mt-1 text-sm leading-snug text-brand-soft-fg/90">{coaching.porque}</p>
          <p className="mt-2 rounded-md bg-surface px-2.5 py-2 text-sm italic leading-snug text-fg">
            «{coaching.jogada}»
          </p>
        </section>
      )}
    </Card>
  )
}
