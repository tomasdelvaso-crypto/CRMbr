// src/screens/Rituais/RitualSexta.tsx
// SEXTA 16h · el veredicto de la semana en tres botones.
//
// ══════════════════════════════════════════════════════════════════════════
// VENTUS PROPONE, LA PERSONA DECIDE
// ══════════════════════════════════════════════════════════════════════════
// El veredicto llega ya cruzado contra lo registrado: actividades sobre esa
// cuenta, toques sobre ese lead, resultados. Proponer mal y que la persona
// corrija cuesta un tap; obligarla a recordar el lunes cuesta el ritual
// entero — y a los tres viernes deja de abrirse.
//
// «Não rolou» no es una falta. Es un dato, se registra sin adjetivos y no
// aparece en ningún canal. El único lugar donde un compromiso incumplido
// tiene consecuencia es el troféu Zelador, que premia a quien no los tiene —
// nunca castiga a quien sí.

import { useState } from 'react'
import { CalendarCheck, Check, CircleSlash, MinusCircle } from 'lucide-react'
import type { IsoDate } from '@/core'
import {
  ROTULO_DO_VEREDICTO,
  useRegistrarVeredicto,
  useRitualDaSexta,
  type ItemDoVeredicto,
  type Veredicto,
} from '@/data'
import { Button, EmptyState, Skeleton, cx, haptic } from '@/ui'
import { Passos } from './Passos'

export interface RitualSextaProps {
  open: boolean
  onClose: () => void
  vendorName: string
  dia: IsoDate
  onPronto: () => void
}

export function RitualSexta({ open, onClose, vendorName, dia, onPronto }: RitualSextaProps) {
  const dados = useRitualDaSexta(open ? vendorName : null, dia)
  const registrar = useRegistrarVeredicto()

  const [passo, setPasso] = useState(1)
  const [escolhas, setEscolhas] = useState<Record<string, Veredicto>>({})

  const itens = dados.data?.itens ?? []

  const veredictoDe = (item: ItemDoVeredicto): Veredicto =>
    escolhas[item.id] ?? item.registrado ?? item.proposto

  const marcar = (item: ItemDoVeredicto, v: Veredicto) => {
    haptic(v === 'cumprido' ? 'success' : 'selection')
    setEscolhas((atual) => ({ ...atual, [item.id]: v }))
  }

  const fechar = () => {
    setPasso(1)
    onClose()
  }

  const confirmar = async () => {
    for (const item of itens) {
      await registrar.mutateAsync({
        vendor: vendorName,
        hoje: dia,
        item,
        veredicto: veredictoDe(item),
      })
    }
    haptic('success')
    setPasso(2)
  }

  const cumpridos = itens.filter((i) => veredictoDe(i) === 'cumprido').length

  return (
    <Passos
      open={open}
      onClose={fechar}
      titulo="Fechamento da semana"
      descricao={passo === 1 ? 'O Ventus já propôs. Confirme ou corrija.' : 'Semana fechada.'}
      passo={passo}
      total={2}
      footer={
        passo === 1 ? (
          <Button
            block
            size="lg"
            loading={registrar.isPending}
            disabled={itens.length === 0}
            onClick={confirmar}
          >
            {itens.length === 0 ? 'Nada a fechar' : 'Confirmar a semana'}
          </Button>
        ) : (
          <Button
            block
            size="lg"
            icon={<Check size={18} />}
            onClick={() => {
              onPronto()
              fechar()
            }}
          >
            Boa sexta
          </Button>
        )
      }
    >
      {passo === 1 && (
        <>
          {dados.isPending ? (
            <Skeleton variant="card-acao" count={2} />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<CalendarCheck size={26} />}
              title="Nenhum compromisso declarado nesta semana"
              description="Na segunda o ritual monta os três a partir da fila, em um toque cada. Não ter declarado não é uma falta — é só uma semana sem placar de compromisso."
            />
          ) : (
            <ul className="space-y-2.5">
              {itens.map((item) => (
                <li key={item.id}>
                  <LinhaDoVeredicto
                    item={item}
                    veredicto={veredictoDe(item)}
                    onMarcar={(v) => marcar(item, v)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {passo === 2 && (
        <div className="py-2">
          <p className="text-base leading-relaxed text-fg">
            {itens.length === 0
              ? 'Semana fechada.'
              : cumpridos === itens.length
                ? `Os ${itens.length} saíram. Semana cumprida.`
                : cumpridos === 0
                  ? 'Semana difícil registrada, sem adjetivos. Segunda começa limpa.'
                  : `${cumpridos} de ${itens.length} cumpridos.`}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Os cinco troféus saem hoje às 17h. E na segunda o Ventus traz a fila nova — a objeção
            que mais apareceu esta semana entra na pauta.
          </p>
        </div>
      )}
    </Passos>
  )
}

const OPCOES: ReadonlyArray<{ valor: Veredicto; icone: typeof Check; tone: 'ok' | 'atencao' | 'neutro' }> = [
  { valor: 'cumprido', icone: Check, tone: 'ok' },
  { valor: 'parcial', icone: MinusCircle, tone: 'atencao' },
  { valor: 'nao_rolou', icone: CircleSlash, tone: 'neutro' },
]

const ATIVO: Readonly<Record<'ok' | 'atencao' | 'neutro', string>> = {
  ok: 'border-ok bg-ok-soft text-ok-soft-fg',
  atencao: 'border-warn bg-warn-soft text-warn-soft-fg',
  neutro: 'border-border-strong bg-surface-2 text-fg-muted',
}

function LinhaDoVeredicto({
  item,
  veredicto,
  onMarcar,
}: {
  item: ItemDoVeredicto
  veredicto: Veredicto
  onMarcar: (v: Veredicto) => void
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <span className="block text-xs font-medium text-fg-muted">{item.cliente}</span>
      <span className="mt-0.5 block text-sm leading-snug font-medium text-fg">{item.titulo}</span>

      <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-2xs leading-relaxed text-fg-muted">
        <span className="font-medium text-fg">Ventus propõe {ROTULO_DO_VEREDICTO[item.proposto].toLowerCase()}:</span>{' '}
        {item.evidencia}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPCOES.map(({ valor, icone: Icone, tone }) => {
          const ativo = veredicto === valor
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => onMarcar(valor)}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-2xs font-medium transition-colors active:scale-[0.97]',
                ativo ? ATIVO[tone] : 'border-border bg-surface text-fg-subtle',
              )}
            >
              <Icone size={15} aria-hidden />
              {ROTULO_DO_VEREDICTO[valor]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
