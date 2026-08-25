// src/screens/Rituais/RitualNoite.tsx
// NOITE · encerramento a partir das 18h — planeado contra hecho, en 1 tap.
//
// ══════════════════════════════════════════════════════════════════════════
// «NÃO ROLOU» NO ESCRIBE NADA, Y ESO ES EL DISEÑO
// ══════════════════════════════════════════════════════════════════════════
// Tres botones por ítem: feito / não rolou / reagendar.
//
//  · feito     → deja un registro real (actividad o toque). Es lo que mueve
//                el anel de Contato en el mismo gesto.
//  · reagendar → crea una tarea CON FECHA. Adiar sin fecha es exactamente
//                cómo el v2 llegó a 51 de 54 oportunidades sin próxima acción.
//  · não rolou → no escribe nada. No es un fracaso registrado: es un dato
//                que alimenta el paso 2, donde se ofrece llevarlas a mañana.
//                Inventar un «missed» sería fabricar una deuda que nadie pidió.
//
// Y el cierre no es un balance: es la puerta al registro por voz, que es el
// único momento del día en que lo que pasó todavía está fresco.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Check, Mic, Moon, X } from 'lucide-react'
import { proximoDiaUtil, type IsoDate } from '@/core'
import {
  useAdiarAcao,
  useConcluirAcao,
  usePlanoFixado,
  type AcaoDoDia,
} from '@/data'
import { Button, EmptyState, Skeleton, cx, haptic, toast } from '@/ui'
import { Passos } from './Passos'

export interface RitualNoiteProps {
  open: boolean
  onClose: () => void
  vendorName: string
  dia: IsoDate
  onPronto: () => void
}

type Marca = 'feito' | 'nao_rolou' | 'reagendado'

export function RitualNoite({ open, onClose, vendorName, dia, onPronto }: RitualNoiteProps) {
  const navigate = useNavigate()
  const plano = usePlanoFixado(open ? vendorName : null, dia)
  const concluir = useConcluirAcao()
  const adiar = useAdiarAcao()

  const [passo, setPasso] = useState(1)
  const [marcas, setMarcas] = useState<Record<string, Marca>>({})

  const amanha = proximoDiaUtil(dia)
  const fixadas = plano.data?.fixadas ?? []

  const marcaDe = (item: AcaoDoDia): Marca | null => {
    const local = marcas[item.acao.id]
    if (local) return local
    if (item.resolucao?.motivo === 'feito') return 'feito'
    if (item.resolucao?.motivo === 'adiado') return 'reagendado'
    return null
  }

  const marcar = (item: AcaoDoDia, marca: Marca) => {
    haptic(marca === 'feito' ? 'success' : 'selection')
    setMarcas((atual) => ({ ...atual, [item.acao.id]: marca }))

    if (marca === 'feito' && item.resolucao === null) {
      concluir.mutate({ vendor: vendorName, dia, acao: item.acao })
    }
    if (marca === 'reagendado' && item.resolucao === null) {
      adiar.mutate({ vendor: vendorName, dia, acao: item.acao, ate: amanha })
    }
    // 'nao_rolou' no escribe: se resuelve en el paso 2, o no se resuelve.
  }

  const naoRolaram = fixadas.filter((f) => marcaDe(f) === 'nao_rolou')
  const feitas = fixadas.filter((f) => marcaDe(f) === 'feito').length
  const todasMarcadas = fixadas.length > 0 && fixadas.every((f) => marcaDe(f) !== null)

  const levarParaAmanha = () => {
    for (const item of naoRolaram) {
      adiar.mutate({ vendor: vendorName, dia, acao: item.acao, ate: amanha })
    }
    haptic('success')
    toast({
      message: `${naoRolaram.length} ${naoRolaram.length === 1 ? 'item' : 'itens'} na lista de amanhã`,
      tone: 'ok',
    })
    setPasso(3)
  }

  const fechar = () => {
    setPasso(1)
    onClose()
  }

  return (
    <Passos
      open={open}
      onClose={fechar}
      titulo="Como foi o dia"
      descricao={DESCRICOES[passo - 1] ?? ''}
      passo={passo}
      total={3}
      footer={
        passo === 1 ? (
          <Button
            block
            size="lg"
            disabled={!todasMarcadas && fixadas.length > 0}
            onClick={() => setPasso(naoRolaram.length > 0 ? 2 : 3)}
          >
            {fixadas.length === 0
              ? 'Seguir'
              : todasMarcadas
                ? 'Seguir'
                : 'Marque cada uma com um toque'}
          </Button>
        ) : passo === 2 ? (
          <Button block size="lg" icon={<CalendarPlus size={18} />} onClick={levarParaAmanha}>
            Levar {naoRolaram.length} para amanhã
          </Button>
        ) : (
          <Button
            block
            size="lg"
            icon={<Mic size={18} />}
            onClick={() => {
              onPronto()
              fechar()
              void navigate('/registrar')
            }}
          >
            Gravar o resumo do dia
          </Button>
        )
      }
    >
      {passo === 1 && (
        <>
          {plano.isPending ? (
            <Skeleton variant="card-acao" count={2} />
          ) : fixadas.length === 0 ? (
            <EmptyState
              icon={<Moon size={26} />}
              title="Hoje não teve lista"
              description="Sem plano congelado não há o que conferir. Amanhã de manhã o ritual monta as três em um toque."
            />
          ) : (
            <ul className="space-y-2.5">
              {fixadas.map((item) => (
                <li key={item.acao.id}>
                  <LinhaDaNoite item={item} marca={marcaDe(item)} onMarcar={(m) => marcar(item, m)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {passo === 2 && (
        <div className="py-1">
          <p className="text-sm leading-relaxed text-fg-muted">
            {naoRolaram.length === 1
              ? 'Uma ficou pelo caminho. Dias assim acontecem — ela vai para amanhã com data, não some.'
              : `${naoRolaram.length} ficaram pelo caminho. Vão para amanhã com data, não somem.`}
          </p>
          <ul className="mt-3 space-y-1.5">
            {naoRolaram.map((item) => (
              <li key={item.acao.id} className="flex items-start gap-2 text-xs text-fg-muted">
                <CalendarPlus size={14} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
                <span className="leading-relaxed">
                  <span className="font-medium text-fg">{item.acao.entidade.cliente}</span> —{' '}
                  {item.acao.acao}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPasso(3)}
            className="mt-4 min-h-11 text-xs font-medium text-fg-subtle"
          >
            Deixar como está
          </button>
        </div>
      )}

      {passo === 3 && (
        <div className="py-2">
          <p className="text-base leading-relaxed text-fg">
            {feitas === 0
              ? 'Dia registrado. Amanhã a lista já está pronta.'
              : feitas === fixadas.length
                ? `As ${feitas} saíram. Dia fechado.`
                : `${feitas} de ${fixadas.length} saíram — e o resto tem data.`}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Vinte segundos de voz agora valem mais que dez minutos de digitação amanhã: o que
            aconteceu ainda está fresco, e é dali que sai o contexto que o Ventus usa para
            aconselhar.
          </p>
        </div>
      )}
    </Passos>
  )
}

const DESCRICOES = [
  'Um toque por item. Sem digitar nada.',
  'O que não rolou vai para amanhã com data.',
  'O dia está guardado.',
]

function LinhaDaNoite({
  item,
  marca,
  onMarcar,
}: {
  item: AcaoDoDia
  marca: Marca | null
  onMarcar: (m: Marca) => void
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <span className="block text-xs font-medium text-fg-muted">{item.acao.entidade.cliente}</span>
      <span className="mt-0.5 block text-sm leading-snug font-medium text-fg">{item.acao.acao}</span>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <BotaoDeMarca
          ativo={marca === 'feito'}
          tone="ok"
          icone={<Check size={15} />}
          rotulo="Feito"
          onClick={() => onMarcar('feito')}
        />
        <BotaoDeMarca
          ativo={marca === 'nao_rolou'}
          tone="neutro"
          icone={<X size={15} />}
          rotulo="Não rolou"
          onClick={() => onMarcar('nao_rolou')}
        />
        <BotaoDeMarca
          ativo={marca === 'reagendado'}
          tone="info"
          icone={<CalendarPlus size={15} />}
          rotulo="Amanhã"
          onClick={() => onMarcar('reagendado')}
        />
      </div>
    </div>
  )
}

const ATIVO: Readonly<Record<'ok' | 'neutro' | 'info', string>> = {
  ok: 'border-ok bg-ok-soft text-ok-soft-fg',
  neutro: 'border-border-strong bg-surface-2 text-fg-muted',
  info: 'border-info bg-info-soft text-info-soft-fg',
}

function BotaoDeMarca({
  ativo,
  tone,
  icone,
  rotulo,
  onClick,
}: {
  ativo: boolean
  tone: 'ok' | 'neutro' | 'info'
  icone: React.ReactNode
  rotulo: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cx(
        'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border text-2xs font-medium transition-colors active:scale-[0.97]',
        ativo ? ATIVO[tone] : 'border-border bg-surface text-fg-subtle',
      )}
    >
      <span aria-hidden>{icone}</span>
      {rotulo}
    </button>
  )
}
