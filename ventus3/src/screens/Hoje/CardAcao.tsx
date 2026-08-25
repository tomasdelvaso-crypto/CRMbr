// src/screens/Hoje/CardAcao.tsx
// Una de las 3 tarjetas del día.
//
// Es el objeto central del producto: cliente, la acción concreta, por qué el
// motor la eligió, y las dos únicas salidas posibles —hacerla o ponerle
// fecha—. No hay una tercera salida a propósito: «ver más tarde» sin fecha es
// exactamente cómo el v2 llegó a 51 de 54 oportunidades sin próxima acción.
//
// El swipe y los botones hacen lo MISMO. El gesto es el atajo del pulgar, no
// una función escondida: todo lo que se puede hacer arrastrando se puede hacer
// tocando, y por eso la tarjeta sigue siendo usable con teclado y con lector.

import { useState } from 'react'
import { Check, ChevronDown, Clock, HelpCircle } from 'lucide-react'
import { explicarScore, formatarBRL, type PlannedAction } from '@/core'
import { ROTULO_DA_ZONA, type AcaoDoDia } from '@/data'
import { Button, Card, Chip, SwipeRow, cx, formatarCurtoBr } from '@/ui'
import {
  ICONE_DA_ACAO,
  ICONE_DA_ZONA,
  ROTULO_DA_ACAO,
  TOM_DA_URGENCIA,
  TOM_DA_ZONA,
} from './aparencia'

export interface CardAcaoProps {
  item: AcaoDoDia
  /** Posición 1-3, solo para el lector de pantalla. */
  posicao: number
  total: number
  onFazerAgora: (acao: PlannedAction) => void
  onFeito: (acao: PlannedAction) => void
  onAdiar: (acao: PlannedAction) => void
}

export function CardAcao({ item, posicao, total, onFazerAgora, onFeito, onAdiar }: CardAcaoProps) {
  const [porqueAberto, setPorqueAberto] = useState(false)
  const { acao, resolucao } = item

  const Icone = ICONE_DA_ACAO[acao.tipo]
  const IconeZona = ICONE_DA_ZONA[item.zona]
  const tomUrgencia = TOM_DA_URGENCIA[acao.urgencia]

  // Resuelta: la tarjeta colapsa a una tira de una línea. Sigue en pantalla
  // porque ver «2 de 3 resolvidas» es la mitad de la recompensa.
  if (resolucao) {
    return (
      <TiraResolvida item={item} posicao={posicao} total={total} />
    )
  }

  return (
    <SwipeRow
      aria-label={`${acao.entidade.cliente}: ${acao.acao}`}
      onSwipeRight={() => onFeito(acao)}
      onSwipeLeft={() => onAdiar(acao)}
      rightLabel="Feito"
      leftLabel="Adiar"
      collapseOnAction={false}
      className="rounded-card"
    >
      <Card
        padding="md"
        accent={acao.urgencia === 'critica' || acao.urgencia === 'alta' ? tomUrgencia : undefined}
        className="w-full"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{acao.entidade.cliente}</p>
            <p className="truncate text-xs text-fg-muted">
              {acao.entidade.nome !== acao.entidade.cliente
                ? acao.entidade.nome
                : item.etapa}
            </p>
          </div>
          <span className="shrink-0 text-2xs font-medium tnum text-fg-subtle">
            {posicao}/{total}
          </span>
        </div>

        {/* La acción. Es lo más grande de la tarjeta porque es lo único que
            hay que leer para saber qué hacer. */}
        <div className="mt-3 flex items-start gap-2.5">
          <span
            aria-hidden
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-brand-soft-fg"
          >
            <Icone size={17} />
          </span>
          <p className="text-base font-semibold leading-snug text-fg">{acao.acao}</p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Chip size="sm" tone={TOM_DA_ZONA[item.zona]} icon={<IconeZona size={13} aria-hidden />}>
            {ROTULO_DA_ZONA[item.zona]}
          </Chip>
          {acao.prazo && (
            <Chip size="sm" tone={tomUrgencia} icon={<Clock size={13} aria-hidden />}>
              {acao.prazo}
            </Chip>
          )}
          {item.valor !== null && item.valor > 0 && (
            <Chip size="sm" tone="neutro">
              {formatarBRL(item.valor)}
            </Chip>
          )}
        </div>

        {/* «Por que isto?»: la cuenta completa, señal por señal. Sin esto el
            vendedor no le cree al ranking — y con razón. */}
        <div className="mt-3">
          <Chip
            size="sm"
            tone="neutro"
            selected={porqueAberto}
            icon={<HelpCircle size={13} aria-hidden />}
            onClick={() => setPorqueAberto((v) => !v)}
          >
            Por que isto?
          </Chip>

          {porqueAberto && (
            <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
              <ul className="space-y-1.5">
                {acao.porque.map((motivo) => (
                  <li key={motivo.codigo + motivo.sinal} className="flex items-start gap-2 text-xs">
                    <span
                      aria-hidden
                      className="mt-1 size-1.5 shrink-0 rounded-full bg-fg-subtle"
                    />
                    <span className="min-w-0 flex-1 text-fg-muted">
                      <span className="font-semibold text-fg">{motivo.sinal}</span>{' '}
                      {motivo.detalhe}
                    </span>
                    <span className="tnum shrink-0 font-semibold text-fg-subtle">
                      {motivo.peso >= 0 ? '+' : ''}
                      {motivo.peso}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-border pt-2 text-2xs text-fg-subtle">
                Soma = {acao.score} pontos de prioridade.
              </p>
              {/* El mismo texto que manda o /hoje do Telegram: una sola fuente. */}
              <span className="sr-only">{explicarScore(acao)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button block onClick={() => onFazerAgora(acao)} hapticPattern="impact">
            Fazer agora
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAdiar(acao)}
            icon={<ChevronDown size={16} aria-hidden />}
          >
            Adiar
          </Button>
        </div>
      </Card>
    </SwipeRow>
  )
}

/** La tarjeta ya resuelta: una tira baja, verde y en pasado. */
function TiraResolvida({
  item,
  posicao,
  total,
}: {
  item: AcaoDoDia
  posicao: number
  total: number
}) {
  const { acao, resolucao } = item
  const adiada = resolucao?.motivo === 'adiado'
  return (
    <div
      className={cx(
        'flex items-center gap-3 rounded-card border px-4 py-3',
        adiada ? 'border-warn-soft bg-warn-soft' : 'border-ok-soft bg-ok-soft',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'flex size-7 shrink-0 items-center justify-center rounded-pill',
          adiada ? 'bg-warn text-warn-fg' : 'bg-ok text-ok-fg',
        )}
      >
        {adiada ? <Clock size={15} /> : <Check size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'truncate text-sm font-semibold',
            adiada ? 'text-warn-soft-fg' : 'text-ok-soft-fg',
          )}
        >
          {acao.entidade.cliente}
        </p>
        <p className={cx('truncate text-xs', adiada ? 'text-warn-soft-fg' : 'text-ok-soft-fg')}>
          {adiada
            ? `${ROTULO_DA_ACAO[acao.tipo]} adiada para ${resolucao?.ate ? formatarCurtoBr(resolucao.ate) : 'outro dia'}`
            : `${ROTULO_DA_ACAO[acao.tipo]} · feito`}
        </p>
      </div>
      <span className="shrink-0 text-2xs font-medium tnum text-fg-subtle">
        {posicao}/{total}
      </span>
    </div>
  )
}
