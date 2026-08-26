// src/screens/Hoje/index.tsx
// LA pantalla del producto: la única respuesta a «o que eu faço agora?».
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES QUE HACEN A ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. TRES TARJETAS. Ni cuatro ni «las que haya». El fallo de producto más
//    grande del v2 es un panel read-only de pendientes que nadie resuelve; el
//    límite duro es lo que convierte un repositorio en un asistente. Salen de
//    rankDay(), que además diversifica por cliente: tres tarjetas del mismo
//    logo se leen como «el sistema está roto» aunque el score tenga razón.
//
// 2. EL DÍA SE CONGELA. Resolver una tarjeta NO trae otra. Ver
//    src/data/plano-do-dia.ts: sin el freeze, «Pronto por hoje» es inalcanzable
//    y el límite de 3 se vuelve decorativo.
//
// 3. TODO SALE DE DEXIE. Ni una llamada a la red en el camino del primer
//    render: la pantalla tiene que abrir dentro de un galpón sin señal. La
//    revalidación va por detrás y entra por invalidación de cache.
//
// El orden vertical no es estético: anillos (dónde estoy) → Golden Hour (el
// bloque que genera pipeline) → las 3 (qué hago ahora) → el equipo → la cola
// completa, cerrada. Lo que más se usa, más arriba y más grande.

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, PartyPopper, Sunrise, Zap } from 'lucide-react'
import type { IsoDate, PlannedAction } from '@/core'
import {
  concluirAcaoDoDia,
  useAdiarAcao,
  useAneisDoDia,
  useConcluirAcao,
  useCorrenteDoTime,
  useDiaVigente,
  useGoldenQueue,
  usePlanoFixado,
  useSequencia,
  type AcaoDoDia,
  type EntradaResolucao,
  type ResolucaoDoDia,
} from '@/data'
import {
  Button,
  Confetti,
  EmptyState,
  PullToRefresh,
  Skeleton,
  haptic,
  toast,
  useTelaCurta,
} from '@/ui'
import { useBotaoPrimario } from '@/host'
import { SessionContext } from '@/app/session-context'
import { CabecalhoDoDia, ContextoDoDia } from './CabecalhoDoDia'
import { CardAcao } from './CardAcao'
import { CorrenteDoTime } from './CorrenteDoTime'
import { SheetAdiar } from './SheetAdiar'
import { VerTudo } from './VerTudo'

/** Ventana de arrepentimiento del swipe «Feito», en ms. */
const JANELA_DESFAZER = 5000

/**
 * El guardián de contexto existe para que la pantalla nunca explote cuando la
 * capa de datos todavía no está montada (arranque en frío, smoke test del
 * router). Muestra la MISMA silueta que el estado de carga real: el vendedor
 * no distingue una cosa de la otra y no tiene por qué.
 */
export default function HojeScreen() {
  const queryClient = useContext(QueryClientContext)
  const sessao = useContext(SessionContext)

  if (!queryClient || !sessao) return <EsqueletoDoDia />
  return <Hoje vendorName={sessao.vendorName} />
}

function Hoje({ vendorName }: { vendorName: string | null }) {
  const navigate = useNavigate()
  const hoje = useDiaVigente()

  // ── Teléfonos cortos ──────────────────────────────────────────────────
  // En un iPhone de 664 px quedan 478 px de ventana útil (header 57, bottom
  // nav 65, barra de comando 66) y esta pantalla pedía 684 para llegar al
  // final de la primera tarjeta: se veía cortada al abrir. Compactar no es
  // achicar todo un poco — es mover abajo lo que explica y motiva (la largada,
  // la faixa da sequência) y dejar arriba lo que dice dónde estoy y qué hago.
  // En un teléfono largo `compacto` es false y no cambia nada.
  const compacto = useTelaCurta()

  const plano = usePlanoFixado(vendorName, hoje)
  const aneis = useAneisDoDia(vendorName, hoje)
  const sequencia = useSequencia(vendorName, hoje)
  const corrente = useCorrenteDoTime(vendorName, hoje)
  const fila = useGoldenQueue(vendorName, hoje)

  const concluir = useConcluirAcao()
  const adiar = useAdiarAcao()

  // Resoluciones optimistas: la tarjeta se cierra en el frame del gesto y la
  // escritura sale recién cuando vence la ventana de deshacer.
  const [otimistas, setOtimistas] = useState<Record<string, ResolucaoDoDia>>({})
  const pendentes = useRef(new Map<string, { timer: number; entrada: EntradaResolucao }>())

  const [aAdiar, setAAdiar] = useState<PlannedAction | null>(null)
  const [celebrar, setCelebrar] = useState(false)

  // Al desmontar —y al irse la pantalla del frente— lo que estaba esperando la
  // ventana de deshacer se manda YA. Si se perdiera, el vendedor vería mañana
  // una tarjeta que ya resolvió.
  //
  // El desmontaje solo cubre la navegación DENTRO de la app. Cerrar la pestaña,
  // recargar, o que iOS mate la app en segundo plano no ejecuta ninguna
  // limpieza de React, y ahí se perdían hasta 5 segundos de resoluciones —el
  // caso más común es justamente ese: resolver la tarjeta y volver al trabajo.
  // Por eso también se escucha 'pagehide' y la ida a segundo plano.
  //
  // Lo que se paga: quien manda la app al fondo pierde el «Desfazer» de esa
  // resolución. Es el precio correcto — el botón es una cortesía de 5 segundos
  // para quien está mirando la pantalla; el registro es el producto.
  useEffect(() => {
    const mapa = pendentes.current

    const descarregar = (): void => {
      for (const { timer, entrada } of mapa.values()) {
        window.clearTimeout(timer)
        void concluirAcaoDoDia(entrada).catch(() => {
          // El outbox ya es la red de contención de la escritura.
        })
      }
      mapa.clear()
    }

    const aoEsconder = (): void => {
      if (document.visibilityState === 'hidden') descarregar()
    }

    window.addEventListener('pagehide', descarregar)
    document.addEventListener('visibilitychange', aoEsconder)

    return () => {
      window.removeEventListener('pagehide', descarregar)
      document.removeEventListener('visibilitychange', aoEsconder)
      descarregar()
    }
  }, [])

  const fixadas: AcaoDoDia[] = useMemo(() => {
    const base = plano.data?.fixadas ?? []
    return base.map((item) => {
      const otimista = otimistas[item.acao.id]
      return otimista ? { ...item, resolucao: otimista } : item
    })
  }, [plano.data, otimistas])

  const pendentesCount = fixadas.filter((f) => f.resolucao === null).length
  const pronto = fixadas.length > 0 && pendentesCount === 0

  // Confetti SOLO en el flanco de subida y dentro de la sesión: si se dispara
  // al recargar la app a las 18h, la celebración se vuelve ruido.
  const jaCelebrou = useRef<boolean | null>(null)
  useEffect(() => {
    if (jaCelebrou.current === null) {
      jaCelebrou.current = pronto
      return
    }
    if (pronto && jaCelebrou.current === false) {
      jaCelebrou.current = true
      haptic('celebration')
      setCelebrar(true)
    }
    if (!pronto) jaCelebrou.current = false
  }, [pronto])

  /* ── Acciones ──────────────────────────────────────────────────────────── */

  const irParaRegistro = (acao: PlannedAction) => {
    // Registrar es la puerta única de entrada de datos: se le pasa la acción
    // entera para que llegue con cliente, tipo y motivo ya resueltos.
    void navigate('/registrar', { state: { acao, origem: 'hoje' } })
  }

  /** Quita la resolución optimista y cancela la escritura si aún no salió. */
  const limparOtimista = (acaoId: string) => {
    const pendente = pendentes.current.get(acaoId)
    if (pendente) {
      window.clearTimeout(pendente.timer)
      pendentes.current.delete(acaoId)
    }
    setOtimistas((atual) => {
      const copia = { ...atual }
      delete copia[acaoId]
      return copia
    })
  }

  const marcarFeito = (acao: PlannedAction) => {
    if (!vendorName) return
    const entrada: EntradaResolucao = { vendor: vendorName, dia: hoje, acao }

    setOtimistas((atual) => ({
      ...atual,
      [acao.id]: { acaoId: acao.id, motivo: 'feito', em: new Date().toISOString() },
    }))

    const timer = window.setTimeout(() => {
      pendentes.current.delete(acao.id)
      concluir.mutate(entrada, {
        onError: () => {
          limparOtimista(acao.id)
          toast({ message: 'Não deu para registrar. Tente de novo.', tone: 'perigo' })
        },
      })
    }, JANELA_DESFAZER)

    pendentes.current.set(acao.id, { timer, entrada })

    toast({
      message: `Feito · ${acao.entidade.cliente}`,
      tone: 'ok',
      durationMs: JANELA_DESFAZER,
      undo: () => limparOtimista(acao.id),
    })
  }

  const confirmarAdiamento = (acao: PlannedAction, ate: IsoDate) => {
    if (!vendorName) return
    setAAdiar(null)
    setOtimistas((atual) => ({
      ...atual,
      [acao.id]: { acaoId: acao.id, motivo: 'adiado', em: new Date().toISOString(), ate },
    }))
    adiar.mutate(
      { vendor: vendorName, dia: hoje, acao, ate },
      {
        onError: () => {
          limparOtimista(acao.id)
          toast({ message: 'Não deu para adiar. Tente de novo.', tone: 'perigo' })
        },
      },
    )
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  const carregando = plano.isPending
  const contatosProntos = fila.data?.leads.length ?? 0
  const resto = plano.data?.resto ?? []

  /* ── La acción crítica de Hoje ─────────────────────────────────────────
     «Iniciar Golden Hour», y no «resolver la primera tarjeta»: las tres del
     día se resuelven con el gesto sobre la tarjeta que corresponde —hay tres,
     no una—, mientras que el bloque que genera pipeline es UNO y es el que se
     posterga. Es la reserva que pide el PLANO §60.

     Se apaga mientras el sheet de «Adiar» está abierto: un botón fijo abajo
     que dispara sobre lo que quedó detrás del modal es una trampa. */
  const goldenNativo = useBotaoPrimario(
    aAdiar !== null || fila.isPending
      ? null
      : {
          rotulo: contatosProntos === 0 ? 'Montar a fila da Golden Hour' : 'Iniciar Golden Hour',
          aoTocar: () => {
            void navigate('/golden')
          },
        },
  )

  return (
    <>
      {/* PullToRefresh necesita una altura DEFINIDA para ser dueño del scroll:
          con `h-full` dentro de un padre sin altura, su scrollTop es siempre 0
          y el gesto se dispararía aunque la lista esté scrolleada abajo.
          La cuenta cierra contra el Shell: header (3,5rem + safe-top) arriba,
          bottom nav (4rem + safe-bottom, que el <main> ya pone como padding)
          abajo. Total = 100svh exactos, y el body no scrollea. */}
      <PullToRefresh
        className="h-[calc(100svh-var(--spacing-header)-var(--safe-top)-var(--spacing-nav)-var(--safe-bottom)-var(--spacing-chrome))]"
        onRefresh={async () => {
          await Promise.all([
            plano.refetch(),
            aneis.refetch(),
            sequencia.refetch(),
            corrente.refetch(),
            fila.refetch(),
          ])
        }}
      >
        <div className="px-4 pb-6">
          <CabecalhoDoDia
            aneis={aneis.data?.aneis}
            largada={aneis.data?.largada ?? 0}
            sequencia={sequencia.data}
            carregando={aneis.isPending}
            compacto={compacto}
          />

          {/* El host ya lo dibuja abajo de todo cuando puede: dibujarlo acá
              también serían dos botones para la misma acción. */}
          {!goldenNativo && (
            <BotaoGoldenHour
              contatosProntos={contatosProntos}
              carregando={fila.isPending}
              compacto={compacto}
              onIniciar={() => void navigate('/golden')}
            />
          )}

          <section aria-label="Suas 3 ações de hoje" className={compacto ? 'mt-4' : 'mt-6'}>
            {carregando ? (
              <Skeleton variant="card-acao" count={3} />
            ) : fixadas.length === 0 ? (
              <SemAcoes
                carteiraVazia={plano.data?.carteiraVazia === true}
                onGolden={() => void navigate('/golden')}
              />
            ) : (
              <>
                {pronto && <ProntoPorHoje quantas={fixadas.length} />}
                {!pronto && (
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-fg">
                      {pendentesCount === fixadas.length
                        ? `${fixadas.length === 1 ? 'Sua ação' : `Suas ${fixadas.length}`} de hoje`
                        : `Faltam ${pendentesCount} de ${fixadas.length}`}
                    </h2>
                    <span className="text-2xs text-fg-subtle">Arraste → feito · ← adiar</span>
                  </div>
                )}

                <ul className="space-y-3">
                  {fixadas.map((item, i) => (
                    <li key={item.acao.id}>
                      <CardAcao
                        item={item}
                        posicao={i + 1}
                        total={fixadas.length}
                        compacto={compacto}
                        onFazerAgora={irParaRegistro}
                        onFeito={marcarFeito}
                        onAdiar={(acao) => setAAdiar(acao)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* En teléfono corto, lo que explica y motiva vive acá abajo. Ver
              CabecalhoDoDia. */}
          {compacto && (
            <ContextoDoDia
              largada={aneis.data?.largada ?? 0}
              sequencia={sequencia.data}
              className="mt-4"
            />
          )}

          <CorrenteDoTime elos={corrente.data} carregando={corrente.isPending} />

          <VerTudo itens={resto} onAbrir={(item) => irParaRegistro(item.acao)} />
        </div>
      </PullToRefresh>

      {/* Fuera del PullToRefresh a propósito: su scroller lleva un transform
          permanente y un transform crea containing block, así que un
          position:fixed adentro deja de estar anclado al viewport. El Sheet no
          sufre eso porque es un portal a document.body. */}
      <SheetAdiar
        acao={aAdiar}
        onClose={() => setAAdiar(null)}
        onConfirmar={confirmarAdiamento}
      />

      <Confetti active={celebrar} onDone={() => setCelebrar(false)} />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas de estado
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El botón grande del bloque que genera el pipeline. Lleva el contador de la
 * fila precargada la víspera porque «12 contatos prontos» es la diferencia
 * entre empezar y postergar: la lista ya está armada, no hay nada que decidir.
 */
function BotaoGoldenHour({
  contatosProntos,
  carregando,
  compacto = false,
  onIniciar,
}: {
  contatosProntos: number
  carregando: boolean
  compacto?: boolean
  onIniciar: () => void
}) {
  // `lg` (52 px) es el tamaño de la acción reservada del PLANO; en teléfono
  // corto baja a `md` (44 px), que sigue por encima del alvo mínimo.
  const tamanho = compacto ? 'md' : 'lg'
  const margem = compacto ? 'mt-3' : 'mt-4'

  if (carregando) {
    return (
      <div
        className={`${margem} ${compacto ? 'h-touch' : 'h-touch-lg'} animate-pulse-soft rounded-card bg-skeleton`}
      />
    )
  }

  if (contatosProntos === 0) {
    return (
      <Button
        block
        size={tamanho}
        variant="secondary"
        className={margem}
        icon={<Zap size={18} aria-hidden />}
        onClick={onIniciar}
      >
        Montar a fila da Golden Hour
      </Button>
    )
  }

  return (
    <Button
      block
      size={tamanho}
      className={margem}
      icon={<Zap size={18} aria-hidden />}
      hapticPattern="impact"
      onClick={onIniciar}
    >
      <span className="flex flex-col items-start leading-tight">
        <span>Iniciar Golden Hour</span>
        <span className="text-2xs font-medium opacity-80">
          {contatosProntos} contatos prontos
        </span>
      </span>
    </Button>
  )
}

/** Estado terminal. Es un logro, no un vacío: verde, corto y sin más trabajo. */
function ProntoPorHoje({ quantas }: { quantas: number }) {
  return (
    <div className="mb-4 rounded-card border border-ok bg-ok-soft p-4 text-center">
      <span
        aria-hidden
        className="mx-auto mb-2 flex size-12 items-center justify-center rounded-pill bg-ok text-ok-fg"
      >
        <PartyPopper size={24} />
      </span>
      <h2 className="text-base font-bold text-ok-soft-fg">Pronto por hoje</h2>
      <p className="mt-1 text-sm text-ok-soft-fg">
        {quantas === 1 ? 'A ação de hoje está resolvida' : `As ${quantas} de hoje estão resolvidas`}.
        Amanhã o Ventus traz as próximas.
      </p>
    </div>
  )
}

/**
 * Dos vacíos que se parecen y no son lo mismo: la carteira que todavía no
 * bajó y la carteira tranquila. Confundirlos le dice a alguien con 25
 * oportunidades que no tiene nada que hacer.
 */
function SemAcoes({
  carteiraVazia,
  onGolden,
}: {
  carteiraVazia: boolean
  onGolden: () => void
}) {
  if (carteiraVazia) {
    return (
      <div>
        <p className="mb-2 text-center text-sm text-fg-muted">
          Baixando a sua carteira. Isso acontece uma vez só.
        </p>
        <Skeleton variant="card-acao" count={2} />
      </div>
    )
  }
  return (
    <EmptyState
      icon={<Sunrise size={28} aria-hidden />}
      title="Nada urgente na carteira"
      description="Nenhum negócio está pedindo atenção agora. É o melhor momento para abrir frentes novas."
      actionLabel="Prospectar na Golden Hour"
      onAction={onGolden}
    />
  )
}

/** La silueta del día. Misma forma que el contenido real, cero spinners. */
function EsqueletoDoDia() {
  return (
    <div className="px-4 pb-6">
      <div className="pt-4">
        <Skeleton variant="aneis" />
      </div>
      <div className="mt-4 h-touch-lg animate-pulse-soft rounded-card bg-skeleton" />
      <div className="mt-6 flex items-center gap-2 text-fg-subtle">
        <CalendarCheck size={16} aria-hidden />
        <span className="text-sm">Carregando o seu dia…</span>
      </div>
      <div className="mt-2">
        <Skeleton variant="card-acao" count={3} />
      </div>
    </div>
  )
}
