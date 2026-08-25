// src/screens/Dossie/ProximoPasso.tsx
// El bloque de arriba de todo. No es el histórico ni la saúde: es «o que eu
// faço quando descer do carro».
//
// Por qué está primero y por qué grita cuando falta: en producción, 51 de 54
// oportunidades vivas no tienen next_action_date. Un negócio sem data de volta
// não está avançando, está esperando. Por eso el vacío de este bloque no dice
// «sem dados»: ofrece la única acción que lo arregla, con las fechas por
// botones (DatePills), nunca por teclado.

import { useState } from 'react'
import { CalendarClock, Check, CircleAlert } from 'lucide-react'
import {
  daysBetween,
  formatarDataCurta,
  todayBr,
  type IsoDate,
  type Opportunity,
  type Task,
} from '@/core'
import { useAdiarTask, useConcluirTask, useCriarTask } from '@/data'
import { Badge, Button, Card, DatePills, EmptyState, Sheet, TextField, toast } from '@/ui'

export interface ProximoPassoProps {
  opportunity: Opportunity
  tasks: readonly Task[]
  vendorName: string | null
  hoje: IsoDate
}

/** La tarea que manda: la pendiente más vieja. Las demás son ruido acá arriba. */
function tarefaAtiva(tasks: readonly Task[]): Task | null {
  const vivas = tasks
    .filter((t) => t.status === 'pending' || t.status === 'snoozed')
    .sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'))
  return vivas[0] ?? null
}

export function ProximoPasso({ opportunity, tasks, vendorName, hoje }: ProximoPassoProps) {
  const [reagendando, setReagendando] = useState(false)
  const [definindo, setDefinindo] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [quando, setQuando] = useState<IsoDate | null>(null)

  const concluir = useConcluirTask()
  const adiar = useAdiarTask()
  const criar = useCriarTask()

  const tarefa = tarefaAtiva(tasks)
  const acaoLivre = (opportunity.next_action ?? '').trim()
  const dataLivre = opportunity.next_action_date

  const semSessao = vendorName === null

  const avisarSemSessao = () => {
    toast({ message: 'Sessão ainda não resolvida: não dá para gravar agora.', tone: 'atencao' })
  }

  const marcarFeito = async (): Promise<void> => {
    if (!tarefa) return
    if (semSessao) return avisarSemSessao()
    await concluir.mutateAsync({
      taskId: tarefa.id,
      atividade: {
        vendor: vendorName,
        opportunityId: opportunity.id,
        tipo: 'note',
        descricao: tarefa.title,
        data: hoje,
        origem: 'manual',
      },
    })
    toast({ message: 'Feito. Já está no histórico.', tone: 'ok' })
  }

  const reagendar = async (iso: IsoDate): Promise<void> => {
    if (!tarefa) return
    setReagendando(false)
    await adiar.mutateAsync({ taskId: tarefa.id, ate: iso })
    toast({ message: `Reagendado para ${formatarDataCurta(iso, hoje)}.`, tone: 'atencao' })
  }

  const definir = async (): Promise<void> => {
    if (semSessao) return avisarSemSessao()
    const texto = titulo.trim()
    if (texto === '' || quando === null) return
    setDefinindo(false)
    await criar.mutateAsync({
      vendor: vendorName,
      kind: 'next_action',
      target: { kind: 'opportunity', id: opportunity.id },
      title: texto,
      dueDate: quando,
    })
    setTitulo('')
    setQuando(null)
    toast({ message: `Próximo passo marcado para ${formatarDataCurta(quando, hoje)}.`, tone: 'ok' })
  }

  const abrirDefinicao = (sugestao: string) => {
    setTitulo(sugestao)
    setQuando(null)
    setDefinindo(true)
  }

  /* ── Caso 1 · hay tarea de verdad ──────────────────────────────────────── */
  if (tarefa) {
    const prazo = tarefa.due_date
    const atraso = prazo ? daysBetween(prazo, hoje) : 0
    const atrasada = atraso > 0

    return (
      <>
        <Card accent={atrasada ? 'perigo' : 'marca'}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-balance">
              {tarefa.title}
            </p>
            {prazo && (
              <Badge tone={atrasada ? 'perigo' : atraso === 0 ? 'atencao' : 'neutro'}>
                {atrasada ? `${String(atraso)} d atrasada` : formatarDataCurta(prazo, hoje)}
              </Badge>
            )}
          </div>
          {tarefa.status === 'snoozed' && (
            <p className="mt-1 text-xs text-fg-muted">Já foi adiada uma vez.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              block
              variant="success"
              icon={<Check size={18} aria-hidden />}
              loading={concluir.isPending}
              onClick={marcarFeito}
            >
              Feito
            </Button>
            <Button
              block
              variant="secondary"
              icon={<CalendarClock size={18} aria-hidden />}
              onClick={() => setReagendando(true)}
            >
              Reagendar
            </Button>
          </div>
        </Card>

        <Sheet
          open={reagendando}
          onClose={() => setReagendando(false)}
          title="Reagendar"
          description="Quando você vai realmente fazer isto?"
        >
          <div className="pb-2 pt-1">
            <DatePills value={tarefa.due_date} hideLabel onChange={(iso) => void reagendar(iso)} />
          </div>
        </Sheet>
      </>
    )
  }

  /* ── Caso 2 · hay texto de próxima acción, pero no es una tarea ─────────── */
  if (acaoLivre !== '') {
    return (
      <>
        <Card accent={dataLivre ? 'marca' : 'atencao'}>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-balance">
              {acaoLivre}
            </p>
            {dataLivre ? (
              <Badge tone="neutro">{formatarDataCurta(dataLivre, hoje)}</Badge>
            ) : (
              <Badge tone="atencao">sem data</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            {dataLivre
              ? 'Veio do registro anterior. Vire tarefa para aparecer no seu dia.'
              : 'Sem data, isto não entra no seu Hoje. Escolha um dia com um toque.'}
          </p>
          <Button
            className="mt-3"
            block
            icon={<CalendarClock size={18} aria-hidden />}
            onClick={() => abrirDefinicao(acaoLivre)}
          >
            Agendar este passo
          </Button>
        </Card>
        <SheetDefinir
          aberto={definindo}
          titulo={titulo}
          quando={quando}
          salvando={criar.isPending}
          onTitulo={setTitulo}
          onQuando={setQuando}
          onFechar={() => setDefinindo(false)}
          onSalvar={definir}
        />
      </>
    )
  }

  /* ── Caso 3 · no hay nada ──────────────────────────────────────────────── */
  return (
    <>
      <Card padding="none">
        <EmptyState
          icon={<CircleAlert size={26} aria-hidden />}
          title="Sem próximo passo"
          description="Um negócio sem data de volta não está avançando: está esperando. Marque o próximo passo agora, leva um toque."
          actionLabel="Definir próximo passo"
          onAction={() => abrirDefinicao('')}
        />
      </Card>
      <SheetDefinir
        aberto={definindo}
        titulo={titulo}
        quando={quando}
        salvando={criar.isPending}
        onTitulo={setTitulo}
        onQuando={setQuando}
        onFechar={() => setDefinindo(false)}
        onSalvar={definir}
      />
    </>
  )
}

/** Sheet de «definir próximo passo»: texto imperativo + fecha por botones. */
function SheetDefinir({
  aberto,
  titulo,
  quando,
  salvando,
  onTitulo,
  onQuando,
  onFechar,
  onSalvar,
}: {
  aberto: boolean
  titulo: string
  quando: IsoDate | null
  salvando: boolean
  onTitulo: (v: string) => void
  onQuando: (v: IsoDate) => void
  onFechar: () => void
  onSalvar: () => Promise<void>
}) {
  const pronto = titulo.trim() !== '' && quando !== null

  return (
    <Sheet
      open={aberto}
      onClose={onFechar}
      title="Próximo passo"
      description="O que você faz, e em que dia."
      footer={
        <Button block size="lg" disabled={!pronto} loading={salvando} onClick={onSalvar}>
          {quando ? `Marcar para ${formatarDataCurta(quando, todayBr())}` : 'Escolha um dia'}
        </Button>
      }
    >
      <div className="space-y-4 py-1">
        <TextField
          label="O que você vai fazer"
          value={titulo}
          onChange={onTitulo}
          placeholder="Ligar para o Marcelo e fechar a data do teste"
          hint="Imperativo e concreto: você lê isto correndo, no estacionamento."
        />
        <DatePills value={quando} onChange={(iso) => onQuando(iso)} required />
      </div>
    </Sheet>
  )
}
