// src/screens/Kitchen/KitchenSink.tsx
// Vitrine del design system. Ruteada en /kitchen.
//
// No es una pantalla de producto: es cómo revisamos el sistema. Cada primitiva
// aparece con todas sus variantes y en un estado que se pueda TOCAR, porque
// los defectos de esta app (umbral de swipe, alto de target, snap del sheet)
// solo se ven con el dedo, nunca en una captura.

import { useState, type ReactNode } from 'react'
import {
  Ban,
  CalendarCheck,
  Check,
  Clock,
  Flame,
  Mic,
  PartyPopper,
  Phone,
  Trophy,
} from 'lucide-react'
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  CardHeader,
  Chip,
  Confetti,
  CountBadge,
  DatePills,
  EmptyState,
  IconButton,
  PullToRefresh,
  Ring,
  RingTrio,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stepper,
  SwipeRow,
  VirtualList,
  Waveform,
  confirmar,
  formatBrl,
  haptic,
  hapticDisponivel,
  toast,
  type IsoDate,
  type Tone,
} from '@/ui'
import { useTheme } from '@/app/useTheme'

const TONS: readonly Tone[] = ['neutro', 'marca', 'ok', 'atencao', 'perigo', 'info', 'destaque']

interface LinhaDemo {
  id: number
  cliente: string
  acao: string
  dias: number
}

const LINHAS: readonly LinhaDemo[] = Array.from({ length: 400 }, (_, i) => ({
  id: i + 1,
  cliente: `Cliente ${String(i + 1).padStart(3, '0')} Embalagens`,
  acao: i % 3 === 0 ? 'Ligar para o comprador' : i % 3 === 1 ? 'Enviar proposta' : 'Confirmar teste',
  dias: (i * 7) % 41,
}))

export default function KitchenSink() {
  return (
    <div className="flex flex-col gap-8 px-4 pb-10 pt-4">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Kitchen Sink</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Todas as primitivas do design system. Toque em tudo: os defeitos aparecem no dedo, não na
          captura de tela.
        </p>
      </header>

      <SecaoTema />
      <SecaoBotoes />
      <SecaoChipsBadges />
      <SecaoAvatares />
      <SecaoAneis />
      <SecaoCards />
      <SecaoSegmented />
      <SecaoStepper />
      <SecaoDatePills />
      <SecaoSwipe />
      <SecaoSheet />
      <SecaoFeedback />
      <SecaoSkeletons />
      <SecaoVazios />
      <SecaoVirtual />
      <SecaoVoz />
      <SecaoPull />
      <SecaoUtilidades />
    </div>
  )
}

/* ── Estructura de sección ─────────────────────────────────────────────── */

function Secao({
  titulo,
  nota,
  children,
}: {
  titulo: string
  nota?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-fg-subtle">{titulo}</h3>
        {nota && <p className="mt-0.5 text-xs text-fg-muted">{nota}</p>}
      </div>
      {children}
    </section>
  )
}

/* ── Tema ──────────────────────────────────────────────────────────────── */

function SecaoTema() {
  const { preference, resolved, setPreference } = useTheme()
  return (
    <Secao titulo="Tema" nota={`Resolvido agora: ${resolved}. Háptico: ${hapticDisponivel() ? 'disponível' : 'indisponível'}.`}>
      <SegmentedControl
        label="Tema"
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro' },
          { value: 'system', label: 'Sistema' },
        ]}
      />
      <div className="grid grid-cols-4 gap-2">
        {['bg-bg', 'bg-surface', 'bg-surface-2', 'bg-surface-3'].map((c) => (
          <div key={c} className={`h-10 rounded-md border border-border ${c}`} title={c} />
        ))}
        {['bg-brand', 'bg-ok', 'bg-warn', 'bg-danger'].map((c) => (
          <div key={c} className={`h-10 rounded-md ${c}`} title={c} />
        ))}
        {['bg-info', 'bg-accent', 'bg-streak', 'bg-ring-contato'].map((c) => (
          <div key={c} className={`h-10 rounded-md ${c}`} title={c} />
        ))}
      </div>
    </Secao>
  )
}

/* ── Botones ───────────────────────────────────────────────────────────── */

function SecaoBotoes() {
  const [carregando, setCarregando] = useState(false)

  return (
    <Secao titulo="Button" nota="Altura mínima 44px. O estado ocupado bloqueia o segundo toque.">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="success">Success</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">Pequeno</Button>
        <Button size="md">Médio</Button>
        <Button size="lg">Grande</Button>
        <Button disabled>Desativado</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Phone size={18} />}>Ligar</Button>
        <IconButton aria-label="Gravar por voz" variant="primary">
          <Mic size={20} />
        </IconButton>
        <IconButton aria-label="Adiar" variant="secondary">
          <Clock size={20} />
        </IconButton>
      </div>
      <Button
        block
        size="lg"
        loading={carregando}
        onClick={() => {
          // Devolver a promesa es lo que bloquea el doble tap de verdad.
          setCarregando(true)
          return new Promise<void>((r) =>
            window.setTimeout(() => {
              setCarregando(false)
              toast({ message: 'Salvo. O segundo toque foi ignorado.', tone: 'ok' })
              r()
            }, 1400),
          )
        }}
      >
        Toque duas vezes rápido
      </Button>
    </Secao>
  )
}

/* ── Chips y badges ────────────────────────────────────────────────────── */

function SecaoChipsBadges() {
  const [filtros, setFiltros] = useState<string[]>(['Gate travado', 'Sem toque 15d'])
  const [selecionado, setSelecionado] = useState<Tone>('marca')

  return (
    <Secao titulo="Chip · Badge" nota="Chip é tocável; Badge nunca é.">
      <div className="flex flex-wrap gap-2">
        {TONS.map((t) => (
          <Chip key={t} tone={t}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TONS.map((t) => (
          <Chip key={t} tone={t} selected={selecionado === t} onClick={() => setSelecionado(t)}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Chip
            key={f}
            tone="marca"
            selected
            removeLabel={`Remover filtro ${f}`}
            onRemove={() => setFiltros((atual) => atual.filter((x) => x !== f))}
          >
            {f}
          </Chip>
        ))}
        {filtros.length === 0 && (
          <Button size="sm" variant="ghost" onClick={() => setFiltros(['Gate travado', 'Sem toque 15d'])}>
            Restaurar filtros
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="perigo" variant="solid">
          3
        </Badge>
        <Badge tone="ok" variant="soft">
          Evidência
        </Badge>
        <Badge tone="atencao" variant="outline">
          45 dias
        </Badge>
        <Badge tone="ok" dot aria-label="Ativo agora" />
        <CountBadge count={128} />
      </div>
    </Secao>
  )
}

/* ── Avatares ──────────────────────────────────────────────────────────── */

function SecaoAvatares() {
  const time = ['Victor Hugo', 'Renata Lima', 'Andre Costa', 'Paulo Menezes']
  return (
    <Secao titulo="Avatar" nota="Cor estável por nome. O anel mostra o avanço do colega.">
      <div className="flex items-end gap-3">
        <Avatar name="Victor Hugo" size="xs" />
        <Avatar name="Renata Lima" size="sm" />
        <Avatar name="Andre Costa" size="md" status="ativo" />
        <Avatar name="Paulo Menezes" size="lg" status="ausente" />
        <Avatar name="Jordi Admin" size="xl" />
      </div>
      <div className="flex items-center gap-4">
        {time.map((n, i) => (
          <Avatar key={n} name={n} size="lg" ringRatio={[0.25, 0.6, 0.95, 1][i] ?? 0} />
        ))}
      </div>
      <AvatarStack names={[...time, 'Jordi', 'Tomás']} max={4} />
    </Secao>
  )
}

/* ── Anillos ───────────────────────────────────────────────────────────── */

function SecaoAneis() {
  const [contato, setContato] = useState(7)
  const [festa, setFesta] = useState(false)

  return (
    <Secao titulo="Ring" nota="Os 3 anéis diários. Fechar um dispara háptico e celebração.">
      <RingTrio
        contato={{ value: contato, max: 12 }}
        conversa={{ value: 3, max: 5 }}
        avanco={{ value: 2, max: 2 }}
        onComplete={(kind) => toast({ message: `Anel de ${kind} fechado!`, tone: 'ok' })}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setContato((v) => Math.max(0, v - 1))}>
          −1
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setContato((v) => v + 1)}>
          +1 contato
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setContato(0)}>
          Zerar
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <Ring kind="marca" label="Semana" value={38} max={60} size={110} />
        <Ring kind="destaque" label="Mês" value={12} max={12} size={64} />
        <Ring kind="conversa" label="Sem meta" value={4} max={0} size={64} />
      </div>
      <Button
        variant="secondary"
        icon={<PartyPopper size={18} />}
        onClick={() => {
          setFesta(true)
        }}
      >
        Disparar Confetti
      </Button>
      <Confetti active={festa} onDone={() => setFesta(false)} />
    </Secao>
  )
}

/* ── Cards ─────────────────────────────────────────────────────────────── */

function SecaoCards() {
  return (
    <Secao titulo="Card" nota="Com onClick vira <button> de verdade, não uma div clicável.">
      <Card>
        <CardHeader
          title="Papelão Sul Ltda."
          subtitle="Validação · Venom + Better Pack 555"
          right={<Badge tone="atencao">Gate</Badge>}
        />
        <p className="mt-3 text-sm text-fg-muted">
          Sem toque há 18 dias. Valor em jogo: {formatBrl(184000)}.
        </p>
      </Card>
      <Card accent="perigo" onClick={() => toast({ message: 'Abriria o dossiê.' })}>
        <CardHeader title="Nordeste Embalagens" subtitle="Negociação · risco alto" />
      </Card>
      <Card accent="ok" padding="sm">
        <CardHeader title="Metalúrgica Bandeirantes" subtitle="Fechado · R$ 92.000" />
      </Card>
      <Card flat padding="none">
        <p className="text-sm text-fg-muted">Card flat, sem borda nem sombra, para agrupar.</p>
      </Card>
    </Secao>
  )
}

/* ── Segmented ─────────────────────────────────────────────────────────── */

function SecaoSegmented() {
  const [funil, setFunil] = useState('1a')
  return (
    <Secao titulo="SegmentedControl" nota="Setas do teclado navegam. Uma só parada de tabulação.">
      <SegmentedControl
        label="Etapa do funil de prospecção"
        value={funil}
        onChange={setFunil}
        options={[
          { value: '1a', label: '1A', count: 23 },
          { value: '1b', label: '1B', count: 11 },
          { value: '1c', label: '1C', count: 6 },
          { value: '1d', label: '1D', count: 2 },
        ]}
      />
      <SegmentedControl
        label="Período"
        size="sm"
        value={funil === '1a' ? 'semana' : 'mes'}
        onChange={(v) => setFunil(v === 'semana' ? '1a' : '1b')}
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mês' },
          { value: 'trimestre', label: 'Trimestre', disabled: true },
        ]}
      />
    </Secao>
  )
}

/* ── Stepper ───────────────────────────────────────────────────────────── */

const NIVEIS_VALOR: readonly string[] = [
  'Nunca documentado',
  'Menciona preço, sem número',
  'Sabe que perde dinheiro, sem quantificar',
  'Estimativa vaga do prejuízo',
  'Número informal de uma pessoa',
  'Número aceito por uma área',
  'Cálculo feito com dados do cliente',
  'Cálculo validado por quem paga',
  'ROI aceito por escrito',
  'ROI defendido internamente pelo campeão',
  'ROI aprovado no comitê',
]

function SecaoStepper() {
  const [valor, setValor] = useState(4)
  return (
    <Secao titulo="Stepper" nota="0..10 na zona do polegar. NUNCA input type=range.">
      <Card>
        <Stepper
          label="Valor"
          value={valor}
          onChange={setValor}
          levelText={NIVEIS_VALOR[valor]}
        />
        <p className="mt-3 rounded-md bg-surface-2 p-2 text-xs text-fg-muted">
          {valor >= 6
            ? 'Isto destrava a Negociação.'
            : `Para sair de Validação/Teste falta VALOR ≥ 6 (hoje ${valor}).`}
        </p>
      </Card>
      <Card>
        <Stepper label="Poder" value={9} onChange={() => undefined} disabled />
      </Card>
    </Secao>
  )
}

/* ── DatePills ─────────────────────────────────────────────────────────── */

function SecaoDatePills() {
  const [data, setData] = useState<IsoDate | null>(null)
  return (
    <Secao titulo="DatePills" nota="O gate de próxima ação. Botões, nunca texto livre.">
      <Card>
        <DatePills
          value={data}
          required
          onChange={(iso, atalho) => {
            setData(iso)
            toast({ message: `Próxima ação: ${iso} (${atalho})`, tone: 'marca' })
          }}
        />
      </Card>
      <Card>
        <DatePills
          label="Reagendar visita"
          value={data}
          options={['amanha', 'segunda', 'mais7', 'escolher']}
          onChange={(iso) => setData(iso)}
        />
      </Card>
    </Secao>
  )
}

/* ── Swipe ─────────────────────────────────────────────────────────────── */

function SecaoSwipe() {
  const [feitos, setFeitos] = useState<number[]>([])
  const itens = [
    { id: 1, cliente: 'Papelão Sul', acao: 'Ligar para o Rogério (compras)' },
    { id: 2, cliente: 'Nordeste Embalagens', acao: 'Enviar cálculo de ROI' },
    { id: 3, cliente: 'Metalúrgica Bandeirantes', acao: 'Confirmar teste da Venom' },
  ]

  return (
    <Secao
      titulo="SwipeRow"
      nota="→ direita confirma (verde), ← esquerda adia (âmbar). Háptico ao cruzar o limiar, desfazer por 5s."
    >
      <Card padding="none">
        <div className="divide-y divide-border">
          {itens.map((item) => (
            <SwipeRow
              key={item.id}
              aria-label={item.cliente}
              rightLabel="Feito"
              leftLabel="Adiar"
              undoMessage={`${item.cliente}: ação registrada.`}
              onSwipeRight={() => setFeitos((f) => [...f, item.id])}
              onSwipeLeft={() => toast({ message: `${item.cliente} adiado para amanhã.`, tone: 'atencao', undo: () => undefined })}
            >
              <div className="flex min-h-[72px] items-center gap-3 px-4 py-3">
                <Avatar name={item.cliente} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold tracking-tight">{item.cliente}</p>
                  <p className="truncate text-sm text-fg-muted">{item.acao}</p>
                </div>
                {feitos.includes(item.id) && <Check size={18} className="text-ok" aria-hidden />}
              </div>
            </SwipeRow>
          ))}
        </div>
      </Card>
    </Secao>
  )
}

/* ── Sheet ─────────────────────────────────────────────────────────────── */

function SecaoSheet() {
  const [simples, setSimples] = useState(false)
  const [comSnap, setComSnap] = useState(false)
  const [naoDispensavel, setNaoDispensavel] = useState(false)
  const [escala, setEscala] = useState(5)

  return (
    <Secao
      titulo="Sheet"
      nota="Arraste para fechar, snap points, Escape e botão «voltar» do sistema."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setSimples(true)}>
          Sheet simples
        </Button>
        <Button variant="secondary" onClick={() => setComSnap(true)}>
          Com snap points
        </Button>
        <Button variant="secondary" onClick={() => setNaoDispensavel(true)}>
          Não dispensável
        </Button>
      </div>

      <Sheet
        open={simples}
        onClose={() => setSimples(false)}
        title="Adiar ação"
        description="Escolha quando você vai realmente fazer isto."
      >
        <div className="pb-2 pt-1">
          <DatePills
            value={null}
            hideLabel
            onChange={(iso) => {
              toast({ message: `Adiado para ${iso}.`, tone: 'atencao' })
              setSimples(false)
            }}
          />
        </div>
      </Sheet>

      <Sheet
        open={comSnap}
        onClose={() => setComSnap(false)}
        title="Editor de escala — Valor"
        description="Arraste a barrinha para expandir até 92% da tela."
        snapPoints={[0.45, 0.92]}
        footer={
          <Button
            block
            size="lg"
            onClick={() => {
              toast({ message: `Valor salvo em ${escala}.`, tone: 'ok' })
              setComSnap(false)
            }}
          >
            Salvar
          </Button>
        }
      >
        <div className="space-y-4 py-2">
          <Stepper label="Valor" value={escala} onChange={setEscala} levelText={NIVEIS_VALOR[escala]} />
          <div className="space-y-2">
            {NIVEIS_VALOR.map((texto, i) => (
              <button
                key={texto}
                type="button"
                onClick={() => setEscala(i)}
                className={`flex min-h-touch w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                  i === escala ? 'border-brand bg-brand-soft text-brand-soft-fg' : 'border-border bg-surface-2'
                }`}
              >
                <span className="tnum w-5 shrink-0 font-bold">{i}</span>
                <span className="min-w-0 flex-1">{texto}</span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet
        open={naoDispensavel}
        onClose={() => setNaoDispensavel(false)}
        title="Fechamento da Golden Hour"
        description="60 segundos. Não dá para pular arrastando."
        dismissible={false}
        footer={
          <Button block size="lg" onClick={() => setNaoDispensavel(false)}>
            Concluir debrief
          </Button>
        }
      >
        <p className="py-2 text-sm text-fg-muted">
          Tente arrastar para baixo ou apertar Escape: o sheet devolve um repique e um háptico de
          aviso, em vez de sumir.
        </p>
      </Sheet>
    </Secao>
  )
}

/* ── Feedback ──────────────────────────────────────────────────────────── */

function SecaoFeedback() {
  return (
    <Secao titulo="Toast · Confirm · haptic" nota="Substituem os 27 alert()/confirm() do v2.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => toast({ message: 'Registro salvo.', tone: 'ok' })}>
          Toast ok
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => toast({ message: 'Sem rede: vai para a fila.', tone: 'atencao' })}
        >
          Toast atenção
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => toast({ message: 'Falha ao sincronizar.', tone: 'perigo' })}
        >
          Toast perigo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast({
              message: 'Nota excluída.',
              tone: 'neutro',
              undo: () => toast({ message: 'Nota restaurada.', tone: 'ok' }),
            })
          }
        >
          Toast com desfazer
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="danger"
          icon={<Ban size={16} />}
          onClick={async () => {
            const ok = await confirmar({
              title: 'Sair da Golden Hour?',
              description: 'Faltam 22 minutos e 8 contatos na fila.',
              confirmLabel: 'Sair mesmo assim',
              cancelLabel: 'Continuar',
              tone: 'perigo',
              footnote: 'A racha de hoje não será contada.',
            })
            toast({ message: ok ? 'Saiu da Golden Hour.' : 'Continuou na fila.', tone: ok ? 'perigo' : 'ok' })
          }}
        >
          Confirmar destrutivo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await confirmar({
              title: 'App atualizada',
              description: 'A nova versão será usada no próximo início.',
              confirmLabel: 'Entendi',
              cancelLabel: '',
            })
          }}
        >
          Aviso (sem cancelar)
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['tap', 'selection', 'impact', 'success', 'warning', 'error', 'celebration'] as const).map(
          (p) => (
            <Button key={p} size="sm" variant="ghost" hapticPattern={p} onClick={() => haptic(p)}>
              {p}
            </Button>
          ),
        )}
      </div>
    </Secao>
  )
}

/* ── Skeletons ─────────────────────────────────────────────────────────── */

function SecaoSkeletons() {
  return (
    <Secao titulo="Skeleton" nota="Forma exata do conteúdo. Zero spinners genéricos.">
      <Skeleton variant="aneis" />
      <Skeleton variant="card-acao" count={2} />
      <Skeleton variant="linha-carteira" count={3} />
      <Skeleton variant="chat" />
    </Secao>
  )
}

/* ── Vacíos ────────────────────────────────────────────────────────────── */

function SecaoVazios() {
  return (
    <Secao titulo="EmptyState" nota="O vazio bom desta app é «Pronto por hoje»: verde, não cinza.">
      <Card padding="none">
        <EmptyState
          variant="sucesso"
          icon={<Trophy size={30} />}
          title="Pronto por hoje"
          description="As 3 ações do dia foram feitas. Nada recarrega: aproveite."
          secondaryLabel="Ver tudo (17)"
          onSecondary={() => toast({ message: 'Abriria a lista completa.' })}
        />
      </Card>
      <Card padding="none">
        <EmptyState
          icon={<CalendarCheck size={30} />}
          title="Sem cadência atrasada"
          description="Nenhum toque vencido no funil 1A–1D."
          actionLabel="Puxar do mapa de mercado"
          onAction={() => toast({ message: '83 empresas disponíveis.', tone: 'marca' })}
        />
      </Card>
    </Secao>
  )
}

/* ── Virtual list ──────────────────────────────────────────────────────── */

function SecaoVirtual() {
  return (
    <Secao titulo="VirtualList" nota="400 linhas, ~18 nós no DOM. Linhas de 72px como na Carteira.">
      <Card padding="none">
        <VirtualList
          items={LINHAS}
          itemHeight={72}
          height={288}
          aria-label="Carteira de demonstração"
          getKey={(l) => l.id}
          renderItem={(l) => (
            <div className="flex h-full items-center gap-3 border-b border-border px-4">
              <Avatar name={l.cliente} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight">{l.cliente}</p>
                <p className="truncate text-xs text-fg-muted">{l.acao}</p>
              </div>
              <Badge tone={l.dias > 20 ? 'perigo' : l.dias > 10 ? 'atencao' : 'ok'}>{l.dias}d</Badge>
            </div>
          )}
        />
      </Card>
    </Secao>
  )
}

/* ── Voz ───────────────────────────────────────────────────────────────── */

function SecaoVoz() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [nivel, setNivel] = useState(0)

  const ligar = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      setStream(s)
      haptic('success')
    } catch {
      toast({ message: 'Sem permissão de microfone.', tone: 'perigo' })
    }
  }

  const desligar = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setNivel(0)
    haptic('tap')
  }

  return (
    <Secao titulo="Waveform" nota="AnalyserNode ao vivo. É a única prova de que está gravando.">
      <Card>
        <Waveform stream={stream} active={Boolean(stream)} onLevel={setNivel} height={64} />
        <div className="mt-3 flex items-center gap-2">
          {stream ? (
            <Button variant="danger" onClick={desligar}>
              Parar
            </Button>
          ) : (
            <Button icon={<Mic size={18} />} onClick={ligar}>
              Ligar microfone
            </Button>
          )}
          <span className="tnum text-sm text-fg-muted">Nível: {(nivel * 100).toFixed(0)}%</span>
        </div>
      </Card>
      <Card>
        <p className="mb-2 text-xs text-fg-muted">Em repouso, sem stream:</p>
        <Waveform active={false} bars={40} height={40} colorVar="--color-fg-subtle" />
      </Card>
    </Secao>
  )
}

/* ── Pull to refresh ───────────────────────────────────────────────────── */

function SecaoPull() {
  const [contador, setContador] = useState(0)
  return (
    <Secao titulo="PullToRefresh" nota="Puxe para baixo dentro da caixa. Háptico ao cruzar o limiar.">
      <Card padding="none">
        <div className="h-56">
          <PullToRefresh
            onRefresh={async () => {
              await new Promise((r) => window.setTimeout(r, 900))
              setContador((c) => c + 1)
            }}
          >
            <div className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Flame size={18} className="text-streak" aria-hidden />
                <p className="text-sm font-semibold">Revalidado {contador}×</p>
              </div>
              {Array.from({ length: 10 }, (_, i) => (
                <p key={i} className="text-sm text-fg-muted">
                  Linha de conteúdo {i + 1}
                </p>
              ))}
            </div>
          </PullToRefresh>
        </div>
      </Card>
    </Secao>
  )
}

/* ── Utilidades de CSS ─────────────────────────────────────────────────── */

function SecaoUtilidades() {
  return (
    <Secao
      titulo="Utilidades"
      nota="h-screen-safe · no-overscroll · scroll-momentum · tap-highlight-none · pb-nav-safe"
    >
      {/* Carrossel horizontal: sem no-overscroll, o rubber-band do Safari
          rouba o gesto e a página inteira desliza. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto no-overscroll scroll-momentum px-4">
        {['Motor', 'Escalador', 'Conversador', 'Zelador', 'Reanimador'].map((t) => (
          <Card key={t} className="w-40 shrink-0" padding="sm">
            <Trophy size={20} className="text-accent" aria-hidden />
            <p className="mt-2 text-sm font-semibold">{t}</p>
            <p className="text-xs text-fg-muted">Troféu da semana</p>
          </Card>
        ))}
      </div>

      {/* h-screen-safe = 100svh menos as duas safe areas. */}
      <div className="rounded-card border border-dashed border-border p-3">
        <p className="text-xs text-fg-muted">
          Altura útil de tela (h-screen-safe), em escala 1/6:
        </p>
        <div className="mt-2 h-screen-safe origin-top scale-[0.1667] rounded-md bg-brand-soft" />
      </div>
    </Secao>
  )
}
