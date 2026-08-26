// src/screens/Gestor/index.tsx
// PAINEL DO GESTOR — coaching semanal, no un tablero de números.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. LA UNIDAD ES LA PERSONA, NO LA MÉTRICA. La pestaña que abre primero es
//    «Time», y cada tarjeta es una conversación de 1:1 lista para tener. Un
//    panel organizado por métrica («toques por vendedor», «reuniones por
//    vendedor») produce la reunión que el equipo ya conoce y evita.
//
// 2. LA COLA DE CALIBRACIÓN NO PENALIZA. Cada patrón viene con la pregunta que
//    abre la conversación, no con un veredicto. Una ráfaga de seis registros
//    en diez minutos puede ser el viernes a las 18h descargando la semana: eso
//    no es trampa, es una fricción de captura que hay que arreglar. Si el
//    panel lo tratara como falta, en dos semanas nadie registraría nada.
//
// 3. LOS NOMBRES DE ETAPA SON LOS DEL PROCESO. Prospecção / Qualificação /
//    Apresentação / Validação-Teste / Negociação / Fechado, siempre desde
//    `getStageName()`. El v2 muestra «Negociación» donde el proceso dice
//    «Validação/Teste» y eso ya costó dos pronósticos.
//
// 4. SIN RED, LO DICE. Es la única pantalla de la app que no puede funcionar
//    offline: el gestor necesita las seis carteras y en su teléfono está sólo
//    la suya. Un panel que muestra ceros sin explicar por qué es peor que un
//    panel que dice «sem conexão».

import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CloudOff,
  Scale,
  Users,
} from 'lucide-react'
import { RISK_LEVEL_LABELS, formatarDataCurta } from '@/core'
import { usePainelDoGestor, type PadraoDeCalibracao, type PainelDoGestor } from '@/data'
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  SegmentedControl,
  Skeleton,
  cx,
} from '@/ui'
import { SessionContext } from '@/app/session-context'
import { CartaoDoVendedor } from './CartaoDoVendedor'

type Aba = 'time' | 'riscos' | 'calibracao' | 'saude'

export default function GestorScreen() {
  const sessao = useContext(SessionContext)

  // Sin contexto (render aislado, smoke test) se pinta la silueta: no se
  // asume ni que es admin ni que no lo es.
  if (!sessao) return <EsqueletoGestor />
  if (!sessao.isAdmin) return <SemAcesso />
  return <Gestor />
}

function Gestor() {
  const consulta = usePainelDoGestor(true)
  const [aba, setAba] = useState<Aba>('time')

  if (consulta.isPending && !consulta.data) return <EsqueletoGestor />

  const painel = consulta.data
  if (!painel || painel.origem === 'offline') return <PainelOffline aoTentar={() => void consulta.refetch()} />

  return (
    <div className="px-4 py-4">
      <Cabecalho painel={painel} />

      <div className="mt-4">
        <SegmentedControl<Aba>
          label="Seção do painel"
          value={aba}
          onChange={setAba}
          block
          options={[
            { value: 'time', label: 'Time', count: painel.vendedores.length },
            {
              value: 'riscos',
              label: 'Riscos',
              count: painel.vendedores.reduce((s, v) => s + v.riscos.length, 0),
            },
            { value: 'calibracao', label: 'Calibração', count: painel.calibracao.length },
            { value: 'saude', label: 'Saúde' },
          ]}
        />
      </div>

      <div className="mt-4">
        {aba === 'time' && <AbaTime painel={painel} />}
        {aba === 'riscos' && <AbaRiscos painel={painel} />}
        {aba === 'calibracao' && <AbaCalibracao painel={painel} />}
        {aba === 'saude' && <AbaSaude painel={painel} />}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Cabecera
   ══════════════════════════════════════════════════════════════════════════ */

function Cabecalho({ painel }: { painel: PainelDoGestor }) {
  const totalRiscos = painel.vendedores.reduce((s, v) => s + v.riscos.length, 0)
  const semMovimento = painel.vendedores.filter((v) => v.moveu.length === 0).length

  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-fg-muted">
          Semana de {formatarDataCurta(painel.semana)} a {formatarDataCurta(painel.fimDaSemana)}
        </p>
        <p className="tnum text-sm font-medium">{painel.pipelineTotalFormatado} em jogo</p>
      </div>

      {/* La frase de arriba de todo es la lectura de la semana, no un KPI. */}
      <p className="mt-2 text-base leading-snug">
        {semMovimento === 0
          ? 'Todo mundo moveu alguma coisa esta semana.'
          : `${semMovimento} ${semMovimento === 1 ? 'pessoa não moveu' : 'pessoas não moveram'} nenhuma escala nem etapa esta semana.`}{' '}
        {totalRiscos > 0 && (
          <span className="text-fg-muted">
            {totalRiscos} {totalRiscos === 1 ? 'alerta' : 'alertas'} de risco esperando decisão.
          </span>
        )}
      </p>
    </header>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Pestañas
   ══════════════════════════════════════════════════════════════════════════ */

function AbaTime({ painel }: { painel: PainelDoGestor }) {
  if (painel.vendedores.length === 0) {
    return (
      <EmptyState
        icon={<Users size={28} aria-hidden />}
        title="Nenhum vendedor ativo"
        description="Ninguém aparece como ativo na tabela de vendedores. Isso costuma ser um cadastro pendente, não um time vazio."
      />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {painel.vendedores.map((v) => (
        <CartaoDoVendedor key={v.vendor} vendedor={v} />
      ))}
    </div>
  )
}

function AbaRiscos({ painel }: { painel: PainelDoGestor }) {
  const linhas = painel.vendedores.flatMap((v) => v.riscos.map((r) => ({ vendedor: v.nome, r })))

  if (linhas.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} aria-hidden />}
        variant="sucesso"
        title="Nenhum risco aberto"
        description="Nenhuma das seis regras disparou hoje: sem silêncio longo em etapa avançada, sem proposta sem resposta, sem negócio com uma pessoa só."
      />
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {linhas.map(({ vendedor, r }, i) => (
        <Card key={`${r.opportunityId}-${r.codigo}-${i}`} padding="md">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-sm font-semibold leading-snug">{r.mensagem}</p>
            <Badge
              tone={r.severidade === 'critical' ? 'perigo' : r.severidade === 'warning' ? 'atencao' : 'info'}
              variant="soft"
            >
              {RISK_LEVEL_LABELS[r.severidade === 'critical' ? 'critico' : r.severidade === 'warning' ? 'atencao' : 'ok']}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-snug text-fg-muted">{r.sugestao}</p>
          <p className="mt-2 text-xs text-fg-subtle">{vendedor}</p>
        </Card>
      ))}
    </div>
  )
}

const ROTULO_DO_PADRAO: Readonly<Record<PadraoDeCalibracao['codigo'], string>> = {
  rajada: 'Registros em rajada',
  salto_sem_prova: 'Escala alta sem citação',
  oscilacao_de_etapa: 'Etapa que voltou',
}

function AbaCalibracao({ painel }: { painel: PainelDoGestor }) {
  if (painel.calibracao.length === 0) {
    return (
      <EmptyState
        icon={<Scale size={28} aria-hidden />}
        variant="sucesso"
        title="Nada para calibrar"
        description="A auditoria automática não encontrou nenhum padrão para revisar juntos nesta janela."
      />
    )
  }

  return (
    <>
      <Card padding="md" accent="info">
        <p className="text-sm leading-snug text-fg-muted">
          <strong className="text-fg">Isto não é uma lista de faltas.</strong> São padrões para
          olhar <em>junto com a pessoa</em>. Quase todos têm explicação boa — e quando têm, o que
          eles apontam é uma fricção de captura que dá para arrumar, não alguém para corrigir.
        </p>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {painel.calibracao.map((p, i) => (
          <Card key={`${p.codigo}-${p.opportunityId ?? 'x'}-${i}`} padding="md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Chip tone="neutro" size="sm">
                  {ROTULO_DO_PADRAO[p.codigo]}
                </Chip>
                <p className="mt-1.5 text-sm font-semibold leading-snug">{p.titulo}</p>
              </div>
              <p className="shrink-0 text-xs text-fg-subtle">{formatarDataCurta(p.quando)}</p>
            </div>

            <p className="mt-2 text-sm leading-snug text-fg-muted">{p.detalhe}</p>

            <p className="mt-3 rounded-md bg-surface-2 px-2.5 py-2 text-sm italic leading-snug text-fg">
              «{p.perguntaParaAConversa}»
            </p>

            <p className="mt-2 text-xs text-fg-subtle">
              {p.vendor}
              {p.cliente && ` · ${p.cliente}`}
            </p>
          </Card>
        ))}
      </div>
    </>
  )
}

function AbaSaude({ painel }: { painel: PainelDoGestor }) {
  const { saude } = painel
  const prova = saude.eventosComProva

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card padding="md">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <Activity size={14} aria-hidden />
          Registros com artefato
        </h3>
        <p className="tnum mt-2 text-3xl font-bold tracking-tight">
          {Math.round(prova.taxa * 100)}%
        </p>
        <p className="mt-1 text-sm leading-snug text-fg-muted">
          {prova.comProva} de {prova.total} registros trazem transcrição ou nota longa o
          suficiente para sustentar o que afirmam. É o número que decide se o pipeline é real ou
          declarado.
        </p>
      </Card>

      <Card padding="md">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <BarChart3 size={14} aria-hidden />
          Leitura dos avisos
        </h3>
        {saude.leituraDeAvisos ? (
          <>
            <p className="tnum mt-2 text-3xl font-bold tracking-tight">
              {(saude.leituraDeAvisos.taxa * 100).toFixed(1).replace('.', ',')}%
            </p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">
              {saude.leituraDeAvisos.lidos} de {saude.leituraDeAvisos.enviados} avisos abertos.
              Abaixo de 20 % o problema não é o conteúdo: é o volume.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-snug text-fg-muted">
            Sem dados de notificações nesta janela.
          </p>
        )}
      </Card>

      <Card padding="md">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          Aceitação do que o Ventus propõe
        </h3>
        {saude.aceitacao === null ? (
          <p className="mt-2 text-sm leading-snug text-fg-muted">
            O propose-then-commit ainda não está gravando propostas. Quando estiver, aqui aparece
            a taxa de aceitação por tipo — que é como se descobre qual recomendação vale a pena
            manter.
          </p>
        ) : saude.aceitacao.length === 0 ? (
          <p className="mt-2 text-sm leading-snug text-fg-muted">
            Nenhuma proposta nesta janela.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {saude.aceitacao.map((a) => (
              <li key={a.tipo} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-fg-muted">{a.tipo}</span>
                <span className="tnum shrink-0 font-medium">
                  {Math.round(a.taxa * 100)}%{' '}
                  <span className="text-xs font-normal text-fg-subtle">
                    ({a.aceitas}/{a.propostas})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <Users size={14} aria-hidden />
          Adoção por vendedor
        </h3>
        <ul className="mt-2 flex flex-col gap-2.5">
          {saude.adocao.map((a) => (
            <li key={a.vendor}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{a.nome}</span>
                <span className="tnum shrink-0 text-xs text-fg-muted">
                  {a.diasAtivos}/{a.diasUteis} dias
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
                <div
                  className={cx(
                    'h-full rounded-pill',
                    a.fracao >= 0.8 ? 'bg-ok' : a.fracao >= 0.4 ? 'bg-warn' : 'bg-danger',
                  )}
                  style={{ width: `${Math.max(2, a.fracao * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-snug text-fg-subtle">
          Dias úteis da semana com pelo menos um registro. Mede hábito, não esforço: quem
          registra três dias por semana está usando o Ventus; quem registra um está usando a
          memória.
        </p>
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Estados
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A guardia de ruta: quem não é admin e digita `/gestor` a mão cai aqui, não
 * num painel vazio com zeros nem numa tela em branco. Com botão de volta —
 * a BottomNav/DesktopRail já levam pra qualquer lugar, mas uma saída
 * explícita na própria tela é o que faz o estado se sentir terminal e não um
 * beco sem saída.
 */
function SemAcesso() {
  const navigate = useNavigate()
  return (
    <div className="px-4 py-10">
      <EmptyState
        icon={<Users size={28} aria-hidden />}
        title="Este painel é do gestor"
        description="Ele mostra a carteira de todo o time, então fica com quem faz o acompanhamento semanal. O seu Placar e a sua Cadência estão em «Mais»."
        actionLabel="Voltar"
        onAction={() => void navigate('/')}
      />
    </div>
  )
}

function PainelOffline({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="px-4 py-10">
      <EmptyState
        icon={<CloudOff size={28} aria-hidden />}
        title="Este painel precisa de conexão"
        description="É a única tela do Ventus que não funciona offline: ela lê as seis carteiras, e no seu aparelho está guardada só a sua. Tudo o mais continua funcionando sem sinal."
        actionLabel="Tentar de novo"
        onAction={aoTentar}
      />
    </div>
  )
}

/** La silueta del panel: cabecera, pestañas y dos tarjetas de vendedor. */
function EsqueletoGestor() {
  return (
    <div className="px-4 py-4">
      <Skeleton variant="lista" count={1} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Skeleton variant="card-acao" count={2} />
        <Skeleton variant="card-acao" count={2} className="hidden lg:block" />
      </div>
    </div>
  )
}
