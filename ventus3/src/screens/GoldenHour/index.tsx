// src/screens/GoldenHour/index.tsx
// GOLDEN HOUR — el bloque diario de prospección concentrada.
//
// Una pantalla. Sin navegación, sin dashboards, sin edición de campos. Es la
// decisión de producto que hace funcionar la mecánica: si la app deja navegar
// durante la hora, la hora se convierte en higiene de datos y no entra ninguna
// llamada.
//
// Todo funciona en modo avión. La fila viene de IndexedDB, el rascunho lo
// escribe el dominio en el teléfono, cada toque entra en el outbox con su
// client_uuid y la sesión sube entera al salir. En ningún punto del flujo se
// espera una respuesta de la red.
//
// El Shell ya reconoce /golden como modo foco y no monta header ni bottom nav
// (src/app/Shell.tsx). Acá se completa el resto: wake lock, back del sistema
// con confirmación y overscroll contenido.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Flame, PartyPopper } from 'lucide-react'
import { todayBr, type TouchpointResult } from '@/core'
import { useGoldenQueue, useLeadsPorIds, useUltimosToques } from '@/data'
import { Button, Confetti, EmptyState, Skeleton, confirmar, haptic, toast } from '@/ui'

import { Abertura } from './Abertura'
import { AcoesDoToque } from './AcoesDoToque'
import { Carrossel } from './Carrossel'
import { Fechamento } from './Fechamento'
import { HereNow } from './HereNow'
import { Hud } from './Hud'
import { montarFila, ordemDaFila } from './fila'
import { resumir, textoDeSaida } from './sessao'
import { useNotaDeVoz } from './useNotaDeVoz'
import { useRelogio, useSessaoGolden } from './useSessaoGolden'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'
import { useTelaCheia } from '@/host'
import { useWakeLock } from './useWakeLock'

export default function GoldenHourScreen() {
  const navigate = useNavigate()
  const { vendorName, carregando: carregandoSessao } = useVendorDaSessao()
  const day = todayBr()

  const filaQuery = useGoldenQueue(vendorName, day)
  const { sessao, carregando, acoes } = useSessaoGolden(vendorName, day)

  const fase = sessao?.fase ?? 'abertura'
  const emFoco = fase === 'foco'

  // La fila congelada manda en cuanto la hora arrancó; antes de eso, la que
  // propone @/data (aprobada la víspera o derivada en el momento).
  const filaCongelada = useMemo(() => sessao?.fila ?? [], [sessao])
  const usandoCongelada = filaCongelada.length > 0
  const leadsCongelados = useLeadsPorIds(filaCongelada)

  const leadsDaFila = leadsCongelados.data
  const leadsPropostos = filaQuery.data?.leads
  const leads = useMemo(
    () => (usandoCongelada ? (leadsDaFila ?? []) : (leadsPropostos ?? [])),
    [usandoCongelada, leadsDaFila, leadsPropostos],
  )
  const ordem = useMemo(
    () => (usandoCongelada ? filaCongelada : ordemDaFila(leads)),
    [usandoCongelada, filaCongelada, leads],
  )
  const entradas = useMemo(() => filaQuery.data?.entradas ?? [], [filaQuery.data])

  const itens = useMemo(() => montarFila(leads, ordem, entradas), [leads, ordem, entradas])
  const ultimos = useUltimosToques(vendorName, ordem, day)

  const agoraMs = useRelogio(emFoco || fase === 'fechamento')
  const resumo = useMemo(
    () => (sessao ? resumir(sessao, agoraMs) : null),
    [sessao, agoraMs],
  )

  // Pantalla encendida durante el bloque y solo durante el bloque.
  const wake = useWakeLock(emFoco)

  // Dentro do Telegram, tela cheia durante o bloco: sem isso sobra o header do
  // cliente com o botão de fechar — uma saída lateral a um toque de distância,
  // que é a forma mais barata de a Golden Hour não acontecer. Fora do Mini App
  // não faz nada. A limpeza devolve o header ao sair.
  useTelaCheia(emFoco)

  const [festa, setFesta] = useState(false)
  const indice = sessao?.indice ?? 0
  const atual = itens[indice] ?? null

  /* ── Nota de voz entre contactos ──────────────────────────────────────── */
  const aoGravarNota = useCallback(
    (clientUuid: string) => {
      acoes.anotarVoz(clientUuid)
      haptic('success')
      toast({
        message: 'Nota guardada. Transcreve depois da hora.',
        tone: 'ok',
        durationMs: 1800,
      })
    },
    [acoes],
  )
  const nota = useNotaDeVoz({
    vendor: vendorName ?? '',
    leadId: atual?.lead.id ?? null,
    onGravada: aoGravarNota,
  })

  /* ── El back del sistema pide confirmación ────────────────────────────── */
  const restanteRef = useRef(0)
  // ¿Ya estamos preguntando si sale? Ver las guardas de `aoVoltar`.
  const perguntandoRef = useRef(false)
  const restanteMs = resumo?.restanteMs ?? 0
  useEffect(() => {
    restanteRef.current = restanteMs
  }, [restanteMs])

  useEffect(() => {
    if (fase !== 'foco' && fase !== 'fechamento') return

    // Entrada de historial con la MISMA URL: el back del sistema la consume y
    // nos deja interceptarlo sin sacar al vendedor de la pantalla.
    //
    // `marcar()` es idempotente porque el efecto se monta dos veces en
    // desarrollo (StrictMode): dos marcas dejarían al primer back consumiendo
    // una entrada fantasma y el vendedor apretando dos veces para salir.
    const marcar = (): void => {
      const atual = window.history.state as { golden?: boolean } | null
      if (atual?.golden === true) return
      window.history.pushState({ golden: true }, '')
    }
    marcar()

    let idRemarcar: number | null = null

    const aoVoltar = (): void => {
      // ── Las dos guardas, que no son defensivas: sin ellas el diálogo se
      // abre solo. Los overlays del design system (Sheet, Confirm) empujan su
      // PROPIA entrada de historial al abrirse y la sacan con history.back()
      // al cerrarse con un botón. Ese back genera un popstate que no tiene
      // nada que ver con salir de la hora.
      //
      //  1. Si el diálogo de salida está abierto, cualquier popstate es suyo
      //     (o del que se está cerrando): no se pregunta dos veces.
      if (perguntandoRef.current) return
      //  2. Si seguimos parados sobre nuestra marca, lo que se consumió fue la
      //     entrada de otro overlay —una nota de voz, un sheet cualquiera—, no
      //     la de la Golden Hour.
      const atual = window.history.state as { golden?: boolean } | null
      if (atual?.golden === true) return

      perguntandoRef.current = true
      void (async () => {
        const sair = await confirmar({
          title: 'Sair da Golden Hour?',
          description: textoDeSaida(restanteRef.current),
          confirmLabel: 'Sair',
          cancelLabel: 'Continuar',
          tone: 'perigo',
          footnote: 'Os toques já registrados ficam salvos e sobem sozinhos.',
        })
        // Las dos salidas esperan a que el diálogo TERMINE de sacar su propia
        // entrada del historial, cosa que hace con un `history.back()` recién
        // después de que esta promesa resuelve. Navegando antes, ese back se
        // llevaba puesta la navegación y el vendedor volvía a la Golden Hour
        // después de haber tocado «Sair»; marcando antes, la marca quedaba
        // justo donde el back se la lleva.
        //
        // No alcanza con un setTimeout(0): el orden entre la limpieza del
        // efecto de React y el timer no está garantizado, y la carrera se
        // pierde una de cada tantas. Se espera a que la entrada del overlay ya
        // no esté arriba, con un techo de intentos para no colgarse nunca.
        const seguir = (tentativa = 0): void => {
          const estado = window.history.state as { ventusOverlay?: number } | null
          if (estado?.ventusOverlay !== undefined && tentativa < 12) {
            idRemarcar = window.setTimeout(() => seguir(tentativa + 1), 16)
            return
          }
          idRemarcar = null
          perguntandoRef.current = false
          if (sair) {
            void navigate('/', { replace: true })
            return
          }
          marcar()
        }
        seguir()
      })()
    }

    window.addEventListener('popstate', aoVoltar)
    return () => {
      window.removeEventListener('popstate', aoVoltar)
      if (idRemarcar !== null) window.clearTimeout(idRemarcar)
    }
  }, [fase, navigate])

  /* ── Aviso único cuando el bloque llega a cero ────────────────────────── */
  const avisadoRef = useRef(false)
  useEffect(() => {
    if (!emFoco || !resumo?.esgotado || avisadoRef.current) return
    avisadoRef.current = true
    haptic('warning')
    toast({
      message: 'O bloco terminou. Feche quando desligar essa ligação.',
      tone: 'atencao',
      durationMs: 4000,
    })
  }, [emFoco, resumo?.esgotado])

  /* ── Acciones de los cuatro botones ───────────────────────────────────── */
  const registrar = useCallback(
    (resultado: TouchpointResult) => {
      if (!atual) return
      const canal = atual.canal ?? atual.passo.channel
      acoes.registrar(atual.lead, canal, resultado, atual.entradaUid)
    },
    [atual, acoes],
  )

  const agendou = useCallback(() => {
    if (!atual) return
    // Celebración instantánea: háptico + confetti + toast, todo local, sin
    // esperar a que el toque llegue al servidor. El plano pide < 1s.
    haptic('celebration')
    setFesta(true)
    toast({
      message: `Reunião marcada com ${atual.lead.company_name}. É disso que se trata.`,
      tone: 'ok',
      durationMs: 3200,
    })
    registrar('meeting_scheduled')
  }, [atual, registrar])

  /* ── Fases ────────────────────────────────────────────────────────────── */

  if (vendorName === null) {
    return (
      <Moldura>
        {carregandoSessao ? (
          <div className="h-full px-4 py-6">
            <Skeleton variant="golden" className="h-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center px-4">
            <EmptyState
              icon={<Flame size={40} aria-hidden />}
              title="Entre para abrir a Golden Hour"
              description="O bloco de prospecção precisa saber de quem é a fila. Entre com sua conta e ela carrega em menos de um segundo, mesmo sem sinal."
              actionLabel="Entrar"
              onAction={() => void navigate('/login')}
            />
          </div>
        )}
      </Moldura>
    )
  }

  if (carregando || (filaQuery.isPending && !usandoCongelada)) {
    return (
      <Moldura>
        <div className="h-full px-4 py-6">
          <Skeleton variant="golden" className="h-full" />
        </div>
      </Moldura>
    )
  }

  if (fase === 'abertura' || !sessao || !resumo) {
    return (
      <Moldura>
        <Abertura
          itens={itens}
          derivada={filaQuery.data?.derivada ?? true}
          carregando={filaQuery.isPending}
          onComecar={(duracaoMin, meta) => acoes.comecar(duracaoMin, meta, ordemDaFila(leads))}
          onSair={() => void navigate('/', { replace: true })}
          onVerCadencia={() => void navigate('/cadencia')}
        />
      </Moldura>
    )
  }

  if (fase === 'fechamento') {
    return (
      <Moldura>
        <Fechamento
          sessao={sessao}
          resumo={resumo}
          vendor={vendorName}
          onResponder={acoes.responder}
          onNotaDeVoz={acoes.anotarVoz}
          onSelar={(cheia) => {
            if (cheia) {
              haptic('celebration')
              setFesta(true)
            }
            void acoes.selar(cheia)
          }}
        />
        <Confetti active={festa} onDone={() => setFesta(false)} />
      </Moldura>
    )
  }

  if (fase === 'selada') {
    return (
      <Moldura>
        <Selada
          cheia={resumo.avaliacao.cheia}
          texto={resumo.avaliacao.texto}
          toques={resumo.toques}
          conversas={resumo.conversas}
          reunioes={resumo.reunioes}
          notas={resumo.notasDeVoz}
          onSair={() => void navigate('/', { replace: true })}
        />
        <Confetti active={festa} onDone={() => setFesta(false)} />
      </Moldura>
    )
  }

  /* ── Modo foco ────────────────────────────────────────────────────────── */
  return (
    <Moldura>
      <Hud
        restanteMs={resumo.restanteMs}
        duracaoMin={sessao.duracaoMin}
        toques={resumo.toques}
        metaToques={sessao.metaToques}
        conversas={resumo.conversas}
        telaAcesa={wake.ativo}
        onEncerrar={acoes.encerrar}
      />

      <HereNow vendor={vendorName} />

      {atual ? (
        <>
          <Carrossel
            itens={itens}
            indice={indice}
            onIndice={acoes.irPara}
            ultimos={ultimos.data ?? {}}
            hoje={day}
          />
          <AcoesDoToque
            // Remonta por contacto: la fila de resultados de «Falou» no puede
            // sobrevivir al cambio de card.
            key={atual.lead.id}
            ativo
            nota={nota}
            onLigou={() => registrar('no_response')}
            onResultado={registrar}
            onAgendou={agendou}
            onPassar={() => acoes.pular(atual.lead, atual.entradaUid)}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-center px-4 pb-safe">
          <EmptyState
            icon={<Flame size={40} aria-hidden />}
            title="Fila terminada"
            description={`Você passou por ${itens.length} contatos e registrou ${resumo.toques} toques. Feche a hora e leve os 60 segundos de debrief.`}
            actionLabel="Fechar a hora"
            onAction={acoes.encerrar}
            variant="sucesso"
          />
        </div>
      )}

      <Confetti active={festa} onDone={() => setFesta(false)} />
    </Moldura>
  )
}

/**
 * Full-bleed, 100svh (nunca dvh: con dvh la barra de Safari al aparecer y
 * desaparecer hace saltar el layout entero durante la hora), safe areas en
 * los cuatro bordes y overscroll contenido para que el rubber-band no dispare
 * el gesto de volver atrás del sistema.
 */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="no-overscroll flex h-screen-svh flex-col overflow-hidden bg-bg pt-safe pl-safe pr-safe text-fg"
      style={{ overscrollBehavior: 'contain' }}
    >
      {children}
    </div>
  )
}

function Selada({
  cheia,
  texto,
  toques,
  conversas,
  reunioes,
  notas,
  onSair,
}: {
  cheia: boolean
  texto: string
  toques: number
  conversas: number
  reunioes: number
  notas: number
  onSair: () => void
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-6 px-6 pb-safe">
      <div className="text-center">
        <span
          className={
            cheia
              ? 'mx-auto flex size-20 items-center justify-center rounded-pill bg-ok text-ok-fg'
              : 'mx-auto flex size-20 items-center justify-center rounded-pill bg-surface-2 text-fg-muted'
          }
          aria-hidden
        >
          {cheia ? <PartyPopper size={36} /> : <CheckCircle2 size={36} />}
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          {cheia ? 'Hora Cheia selada' : 'Hora encerrada'}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{texto}</p>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Marcador valor={toques} rotulo="toques" />
        <Marcador valor={conversas} rotulo="conversas" />
        <Marcador valor={reunioes} rotulo="reuniões" />
      </dl>

      {notas > 0 && (
        <p className="text-center text-xs text-fg-subtle">
          {notas} nota{notas === 1 ? '' : 's'} de voz entram na fila de transcrição agora.
        </p>
      )}

      <Button block size="lg" onClick={onSair}>
        Voltar para Hoje
      </Button>
    </div>
  )
}

function Marcador({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-3">
      <dt className="sr-only">{rotulo}</dt>
      <dd>
        <span className="tnum block text-2xl font-bold leading-none">{valor}</span>
        <span className="mt-1 block text-2xs text-fg-subtle">{rotulo}</span>
      </dd>
    </div>
  )
}
