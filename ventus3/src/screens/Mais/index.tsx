// src/screens/Mais/index.tsx
// MAIS — el cajón donde vive todo lo que no es diario.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NO ES UN MENÚ, ES UN ESTADO. Arriba de todo va la respuesta a la única
//    pregunta que alguien se hace al abrir este tab en el galpón: «lo que
//    registré hoy, ¿llegó?». Un hub que sólo lista links obliga a entrar a
//    Ajustes para averiguarlo, y por eso nadie lo averigua.
//
// 2. «GESTOR» APARECE SÓLO SI ES ADMIN, Y NO SE INSINÚA SI NO. Nada de un ítem
//    en gris con candado: con seis personas que se conocen, mostrar una puerta
//    cerrada es peor que no mostrarla.
//
// 3. «SAIR» ESTÁ ABAJO, SEPARADO Y CONFIRMADO. Salir borra la cola de envío
//    del aparato si todavía hay algo pendiente, así que la confirmación dice
//    exactamente eso en vez de un «tem certeza?» genérico.

import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  ChevronRight,
  CloudUpload,
  Download,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatRelativeBr } from '@/core'
import {
  useEstaOnline,
  useEstadoDeSincronizacao,
  useForcarEnvio,
  usePendentesDoOutbox,
} from '@/data'
import { Button, Card, Skeleton, TONE_TEXT, confirmar, cx, toast } from '@/ui'
import type { Tone } from '@/ui'
import { PerfilChip } from '@/app/PerfilChip'
import { SessionContext } from '@/app/session-context'

interface ItemDoHub {
  to: string
  rotulo: string
  descricao: string
  Icon: LucideIcon
}

const FERRAMENTAS: readonly ItemDoHub[] = [
  {
    to: '/cadencia',
    rotulo: 'Cadência',
    descricao: '7 toques em 21 dias, na ordem em que vencem',
    Icon: CalendarClock,
  },
  {
    to: '/placar',
    rotulo: 'Placar da Semana',
    descricao: 'Você contra você, sem posições',
    Icon: Trophy,
  },
  {
    to: '/rituais',
    rotulo: 'Rituais',
    descricao: 'Manhã, encerramento, segunda e sexta',
    Icon: Sparkles,
  },
  {
    to: '/ventus',
    rotulo: 'Ventus',
    descricao: 'Perguntar sobre um cliente sem sair da tela',
    Icon: MessageSquare,
  },
]

const CONFIGURACAO: readonly ItemDoHub[] = [
  {
    to: '/ajustes',
    rotulo: 'Ajustes',
    descricao: 'Metas, Golden Hour, Telegram, avisos e tema',
    Icon: Settings,
  },
  {
    to: '/instalar',
    rotulo: 'Instalar o app',
    descricao: 'Tela de início, APK e notificações',
    Icon: Download,
  },
]

export default function MaisScreen() {
  const sessao = useContext(SessionContext)
  return <Mais vendorName={sessao?.vendorName ?? null} isAdmin={sessao?.isAdmin === true} />
}

function Mais({ vendorName, isAdmin }: { vendorName: string | null; isAdmin: boolean }) {
  const navigate = useNavigate()
  const sessao = useContext(SessionContext)
  const pendentes = usePendentesDoOutbox()

  async function sair(): Promise<void> {
    const ok = await confirmar({
      title: 'Sair da conta?',
      description:
        pendentes > 0
          ? `Você tem ${pendentes} ${pendentes === 1 ? 'registro' : 'registros'} esperando envio. Se sair agora, ${pendentes === 1 ? 'ele fica' : 'eles ficam'} neste aparelho até você entrar de novo.`
          : 'Tudo o que você registrou já foi enviado. Para voltar, é só entrar com o seu e-mail.',
      confirmLabel: 'Sair',
      tone: 'perigo',
    })
    if (!ok) return
    await sessao?.signOut()
    void navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <CartaoDeIdentidade />

      <EstadoDeSync vendorName={vendorName} />

      <Grupo titulo="Ferramentas" itens={FERRAMENTAS} />

      {isAdmin && (
        <Grupo
          titulo="Time"
          itens={[
            {
              to: '/gestor',
              rotulo: 'Painel do Gestor',
              descricao: 'Coaching semanal, riscos e calibração',
              Icon: Users,
            },
          ]}
        />
      )}

      <Grupo titulo="Configuração" itens={CONFIGURACAO} />

      <div className="pt-2">
        <Button
          variant="secondary"
          block
          icon={<LogOut size={18} aria-hidden />}
          onClick={sair}
        >
          Sair da conta
        </Button>
      </div>

      <p className="pb-4 text-center text-2xs text-fg-subtle">Ventus v3 · Ventapel Brasil</p>
    </div>
  )
}

/**
 * O perfil, no topo de tudo: é a resposta a «quem sou eu, e que papel eu
 * tenho aqui» — o reclamo real do dono do produto no primeiro login. Vem do
 * `PerfilChip` compartilhado (ver src/app/PerfilChip.tsx) para que a mesma
 * lógica de nome, e-mail e chip de papel não se repita em Ajustes nem no rail
 * de escritório.
 */
function CartaoDeIdentidade() {
  return (
    <Card padding="md">
      <PerfilChip tamanho="lg" comEmail link={false} />
    </Card>
  )
}

/** El estado de sync, en una tarjeta que se lee de un vistazo. */
function EstadoDeSync({ vendorName }: { vendorName: string | null }) {
  const estado = useEstadoDeSincronizacao(vendorName)
  const online = useEstaOnline()
  const enviar = useForcarEnvio()

  if (estado.isPending && !estado.data) {
    return <Skeleton variant="lista" count={1} />
  }

  const pendentes = estado.data?.pendentes ?? 0
  const problemas = estado.data?.comProblema ?? 0
  const ultimo = estado.data?.ultimoSync ?? null

  const tone: Tone = problemas > 0 ? 'perigo' : pendentes > 0 ? 'atencao' : 'ok'

  return (
    <Card padding="md" accent={tone}>
      <div className="flex items-start gap-3">
        <CloudUpload
          size={22}
          aria-hidden
          className={cx(
            'mt-0.5 shrink-0',
            TONE_TEXT[tone],
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {problemas > 0
              ? `${problemas} ${problemas === 1 ? 'registro travado' : 'registros travados'}`
              : pendentes > 0
                ? `${pendentes} ${pendentes === 1 ? 'registro esperando' : 'registros esperando'}`
                : 'Tudo enviado'}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-fg-muted">
            {ultimo
              ? `Última sincronização ${formatRelativeBr(ultimo)}.`
              : 'Ainda não houve nenhuma sincronização neste aparelho.'}
            {!online && ' Você está sem conexão — nada se perde, tudo sai quando o sinal voltar.'}
          </p>

          {(pendentes > 0 || problemas > 0) && (
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                loading={enviar.isPending}
                disabled={!online}
                onClick={() => {
                  if (!vendorName) return
                  enviar.mutate(vendorName, {
                    onSuccess: (r) => {
                      toast({
                        message:
                          r.enviados > 0
                            ? `${r.enviados} ${r.enviados === 1 ? 'registro enviado' : 'registros enviados'}.`
                            : 'Nada saiu desta vez. Vamos tentar de novo sozinhos.',
                        tone: r.enviados > 0 ? 'ok' : 'atencao',
                      })
                    },
                  })
                }}
              >
                {online ? 'Enviar agora' : 'Sem conexão'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Grupo({ titulo, itens }: { titulo: string; itens: readonly ItemDoHub[] }) {
  const navigate = useNavigate()
  return (
    <section>
      <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {titulo}
      </h2>
      <Card padding="none">
        <ul>
          {itens.map((item, i) => (
            <li key={item.to}>
              <button
                type="button"
                onClick={() => void navigate(item.to)}
                className={cx(
                  'flex min-h-touch-lg w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 lg:hover:bg-surface-2',
                  i > 0 && 'border-t border-border',
                )}
              >
                <item.Icon size={20} aria-hidden className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.rotulo}</span>
                  <span className="block text-sm leading-snug text-fg-muted">
                    {item.descricao}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden className="shrink-0 text-fg-subtle" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
