// src/screens/Carteira/index.tsx
// CARTEIRA — buscar y triar cuando el vendedor quiere guiarse solo.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. ES DELIBERADAMENTE SECUNDARIA A «HOJE». Acá no hay motor que decida por
//    vos: hay 6 Smart Views, un buscador y una lista. Si esta pantalla se
//    volviera el centro del producto, el CRM habría vuelto a ser un
//    repositorio que hay que revisar a mano.
//
// 2. CERO QUERIES POR FILA. Abrir la cartera dispara UNA lectura de Dexie
//    (`useCarteira`), y la fila de cadencia que alimenta el tile de toques
//    atrasados es la MISMA query que usa la pantalla Cadência: viene del cache
//    compartido, no de una consulta nueva. El v2 dispara ~195 al abrir este
//    tab, y con 300 oportunidades sería inusable en 4G.
//
// 3. UNA SOLA REGIÓN DE SCROLL. El encabezado (tiles, buscador, chips) queda
//    fijo y solo la lista virtualizada scrollea. La alternativa —página que
//    scrollea con una lista que también scrollea— es scroll anidado, que es
//    exactamente el defecto táctil que este rediseño existe para matar.

import { useCallback, useContext, useMemo, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Search, SlidersHorizontal, Wallet, X } from 'lucide-react'
import { todayBr, type IsoDate, type Opportunity } from '@/core'
import {
  normalizarBusca,
  useAssumirOportunidade,
  useAgendarProximaAcao,
  useCarteira,
  useFilaCadencia,
  usePoolSemDono,
  type CarteiraRow,
} from '@/data'
import {
  Badge,
  Chip,
  EmptyState,
  IconButton,
  Skeleton,
  SkeletonBlock,
  VirtualList,
  cx,
  haptic,
  morphTransition,
  toast,
  useDebouncedValue,
  viewTransitionName,
} from '@/ui'
import { SessionContext } from '@/app/session-context'
import { ALTURA_LINHA, LinhaCarteira } from './LinhaCarteira'
import { FiltrosSheet } from './FiltrosSheet'
import { SheetAdiar } from './SheetAdiar'
import { PoolSemDono } from './PoolSemDono'
import {
  VISOES,
  aplicarFiltros,
  chipsAtivos,
  contarVisoes,
  lerFiltrosSalvos,
  salvarFiltros,
  temFiltroAtivo,
  type ChaveVisao,
  type FiltrosCarteira,
} from './visoes'

/**
 * Alto útil de la pantalla dentro del Shell: la altura visual menos el header
 * (h-14), la bottom nav y las dos safe areas. Se calcula en CSS y no en JS a
 * propósito: con `100svh` el valor no salta cuando la barra de Chrome en
 * Android se esconde al scrollear.
 *
 * `--spacing-nav-visivel` y no `--spacing-nav`: en escritorio (lg+) la
 * bottom nav desaparece a favor del DesktopRail, y la lista tiene que
 * recuperar esos 4rem en vez de dejarlos como una franja vacía al pie.
 */
const ALTURA_TELA =
  'calc(100svh - 3.5rem - var(--safe-top) - var(--spacing-nav-visivel) - var(--safe-bottom) - var(--spacing-chrome))'

export default function CarteiraScreen() {
  const queryClient = useContext(QueryClientContext)
  const sessao = useContext(SessionContext)

  // Sin capa de datos montada (arranque en frío, smoke test del router) se
  // pinta la MISMA silueta que el estado de carga real.
  if (!queryClient || !sessao) return <EsqueletoCarteira />
  return <Carteira vendorName={sessao.vendorName} />
}

function Carteira({ vendorName }: { vendorName: string | null }) {
  const navigate = useNavigate()
  const hoje = todayBr()

  const carteira = useCarteira(vendorName)
  // MISMA query que usa a tela Cadência: el tile de toques atrasados sale del
  // cache compartido, no de una consulta extra.
  const cadencia = useFilaCadencia(vendorName)
  const pool = usePoolSemDono()

  const agendar = useAgendarProximaAcao()
  const assumir = useAssumirOportunidade()

  const [filtros, setFiltros] = useState<FiltrosCarteira>(() => lerFiltrosSalvos())
  const [busca, setBusca] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [aAdiar, setAAdiar] = useState<CarteiraRow | null>(null)

  const buscaAtrasada = useDebouncedValue(busca, 200)
  const termo = useMemo(() => normalizarBusca(buscaAtrasada), [buscaAtrasada])

  const linhas = useMemo(() => carteira.data ?? [], [carteira.data])

  const leadsAtrasados = useMemo(
    () => (cadencia.data ?? []).filter((l) => l.atraso > 0).length,
    [cadencia.data],
  )

  const contagem = useMemo(
    () => contarVisoes(linhas, leadsAtrasados, hoje),
    [linhas, leadsAtrasados, hoje],
  )

  const visiveis = useMemo(
    () => aplicarFiltros(linhas, filtros, termo, hoje),
    [linhas, filtros, termo, hoje],
  )

  const chips = useMemo(() => chipsAtivos(filtros), [filtros])

  const aplicar = useCallback((proximos: FiltrosCarteira) => {
    setFiltros(proximos)
    salvarFiltros(proximos)
  }, [])

  const contarComFiltros = useCallback(
    (candidatos: FiltrosCarteira) => aplicarFiltros(linhas, candidatos, termo, hoje).length,
    [linhas, termo, hoje],
  )

  /* ── Acciones de fila ──────────────────────────────────────────────────── */

  const abrirDossie = useCallback(
    (id: number, elemento: HTMLElement | null) => {
      // Morph de elemento compartido: la fila se convierte en el header del
      // Dossiê, que declara el MISMO `viewTransitionName('opp', id)`. Donde no
      // haya View Transitions —o con prefers-reduced-motion— degrada a un
      // cross-fade sin que nadie tenga que preguntar.
      void morphTransition(elemento, viewTransitionName('opp', id), () => {
        void navigate(`/carteira/${String(id)}`)
      })
    },
    [navigate],
  )

  const irRegistrar = useCallback(
    (linha: CarteiraRow) => {
      // Registrar es la puerta única de entrada de datos. El contrato con esa
      // pantalla es la query string, no el state del router.
      void navigate(`/registrar?opportunityId=${String(linha.opportunity.id)}`)
    },
    [navigate],
  )

  const confirmarAdiamento = useCallback(
    (linha: CarteiraRow, ate: IsoDate, acao: string) => {
      setAAdiar(null)
      agendar.mutate(
        { opportunityId: linha.opportunity.id, ate, acao: acao === '' ? null : acao },
        {
          onError: () => {
            toast({ message: 'Não deu para salvar a data. Tente de novo.', tone: 'perigo' })
          },
        },
      )
      haptic('success')
      toast({ message: `Próxima ação marcada · ${linha.opportunity.client ?? ''}`, tone: 'ok' })
    },
    [agendar],
  )

  const assumirDoPool = useCallback(
    (oportunidade: Opportunity) => {
      if (!vendorName) return
      assumir.mutate(
        { oportunidade, vendor: vendorName },
        {
          onError: () => {
            toast({ message: 'Não deu para assumir agora. Tente de novo.', tone: 'perigo' })
          },
        },
      )
      haptic('success')
      toast({
        message: `${oportunidade.client ?? oportunidade.name ?? 'Oportunidade'} é sua agora.`,
        tone: 'ok',
      })
    },
    [assumir, vendorName],
  )

  const tocarTile = useCallback(
    (chave: ChaveVisao, rota: string | undefined) => {
      if (rota) {
        void navigate(rota)
        return
      }
      aplicar({ ...filtros, visao: filtros.visao === chave ? null : chave })
    },
    [aplicar, filtros, navigate],
  )

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (carteira.isLoading) return <EsqueletoCarteira />

  const totalVivas = linhas.length
  const semVendedor = vendorName === null

  return (
    <div className="flex flex-col" style={{ height: ALTURA_TELA }}>
      {/* ── Cabeçalho fixo ────────────────────────────────────────────── */}
      <div className="shrink-0">
        <PoolSemDono
          oportunidades={pool.data ?? []}
          podeAssumir={!semVendedor}
          onAssumir={assumirDoPool}
        />

        {/* Tres columnas, no dos: ver el comentario de `rotuloCurto`. En lg+
            las SEIS entran en UNA fila: son seis preguntas distintas sobre la
            misma carteira y verlas juntas es el resumen de la pantalla — en
            dos filas de tres, el ojo las lee como dos grupos que no existen. */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3 pt-3 lg:grid-cols-6">
          {VISOES.map((visao) => {
            const total = contagem[visao.chave]
            const ativo = filtros.visao === visao.chave
            const Icone = visao.icone
            return (
              <button
                key={visao.chave}
                type="button"
                aria-pressed={visao.destino === 'lista' ? ativo : undefined}
                onClick={() => {
                  haptic('selection')
                  tocarTile(visao.chave, visao.rota)
                }}
                aria-label={`${visao.rotulo}: ${String(total)}`}
                className={cx(
                  'flex min-h-[62px] flex-col justify-between rounded-card border p-2 text-left',
                  'tap-highlight-none active:scale-[0.98] transition-transform',
                  ativo
                    ? 'border-brand bg-brand-soft text-brand-soft-fg'
                    : 'border-border bg-surface',
                  total === 0 && !ativo && 'opacity-60',
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-lg font-bold tnum leading-6">{String(total)}</span>
                  <Icone size={13} aria-hidden className="text-fg-subtle" />
                </span>
                <span aria-hidden className="flex items-start gap-0.5 text-2xs font-medium leading-3.5">
                  <span className="line-clamp-2">{visao.rotuloCurto}</span>
                  {visao.destino === 'rota' && (
                    <ChevronRight size={11} aria-hidden className="mt-px shrink-0 text-fg-subtle" />
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {/* Buscador + filtros. O input tem 16px reais: abaixo disso o Safari
            dá zoom ao focar e o layout nunca mais volta. */}
        <div className="flex items-center gap-2 px-4 pb-2">
          {/* El buscador con tope en escritorio: un campo de una línea de
              1.700 px no ayuda a buscar, sólo estira el placeholder. */}
          <label className="relative flex flex-1 items-center lg:max-w-xl">
            <span className="sr-only">Buscar na carteira</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 text-fg-subtle"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, negócio, contato"
              inputMode="search"
              enterKeyHint="search"
              className="min-h-touch w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-base text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand"
            />
            {busca !== '' && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-1 flex size-touch items-center justify-center text-fg-subtle"
              >
                <X size={16} aria-hidden />
              </button>
            )}
          </label>

          <IconButton
            aria-label="Filtros da carteira"
            variant={temFiltroAtivo(filtros) ? 'primary' : 'secondary'}
            onClick={() => setFiltrosAbertos(true)}
          >
            <SlidersHorizontal size={18} aria-hidden />
          </IconButton>
        </div>

        {/* Chips de filtros ativos + contador de resultados. */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2 no-overscroll">
          <Badge tone="neutro" aria-label={`${String(visiveis.length)} resultados`}>
            {visiveis.length === totalVivas
              ? `${String(totalVivas)} na carteira`
              : `${String(visiveis.length)} de ${String(totalVivas)}`}
          </Badge>
          {chips.map((chip) => (
            <Chip
              key={chip.id}
              tone="marca"
              size="sm"
              onRemove={() => aplicar(chip.aoRemover)}
              removeLabel={`Tirar filtro ${chip.rotulo}`}
            >
              {chip.rotulo}
            </Chip>
          ))}
        </div>
      </div>

      {/* ── O cabeçalho da tabela (só em xl+) ────────────────────────────
          Los mismos anchos y los MISMOS breakpoints que LinhaCarteira, en el
          mismo orden — si los dos no se mueven juntos, los rótulos dejan de
          caer sobre su columna. Pasó: con el encabezado en `lg:` y la fila
          revelando columnas más tarde, a 1024 px «NEGÓCIO» y «ETAPA» se
          imprimían uno encima del otro.

          Arranca en `xl` y no en `lg` porque es ahí donde la fila se vuelve
          tabla de verdad (ver el bloque grande de LinhaCarteira): entre 1024 y
          1280 la fila sigue siendo una tarjeta con dos líneas y un encabezado
          de columnas sería un rótulo sin columna debajo.

          `aria-hidden` porque cada fila ya lleva su etiqueta accesible
          completa. */}
      <div
        aria-hidden
        className="hidden shrink-0 items-center gap-4 border-b border-border bg-surface-2/60 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle xl:flex"
      >
        <span className="size-2 shrink-0" />
        <span className="min-w-0 flex-1">Negócio</span>
        <span className="hidden w-40 shrink-0 2xl:block">Cliente</span>
        <span className="w-28 shrink-0">Etapa</span>
        <span className="w-28 shrink-0">Saúde</span>
        <span className="w-28 shrink-0">Contato</span>
        <span className="w-44 shrink-0 2xl:w-56">Próxima ação</span>
        <span className="w-24 shrink-0 text-right">Valor</span>
        <span className="w-[18px] shrink-0" />
      </div>

      {/* ── A ÚNICA região com scroll ─────────────────────────────────── */}
      <VirtualList
        items={visiveis}
        itemHeight={ALTURA_LINHA}
        getKey={(linha) => linha.opportunity.id}
        aria-label="Oportunidades da carteira"
        // pb-24 dá espaço para a última linha não ficar sob o FAB do microfone.
        className="flex-1 min-h-0 pb-24"
        renderItem={(linha) => (
          <LinhaCarteira
            linha={linha}
            onAbrir={abrirDossie}
            onRegistrar={irRegistrar}
            onAdiar={setAAdiar}
          />
        )}
        empty={
          totalVivas === 0 ? (
            <EmptyState
              icon={<Wallet size={28} aria-hidden />}
              title="Sua carteira está vazia"
              description="Nada sincronizado ainda. A prospecção começa no funil: puxe empresas do mapa de mercado e comece a cadência."
              actionLabel="Abrir a Cadência"
              onAction={() => void navigate('/cadencia')}
            />
          ) : (
            <EmptyState
              icon={<Search size={28} aria-hidden />}
              title="Nada com esses filtros"
              description="Nenhuma oportunidade da sua carteira bate com o que está filtrado agora."
              actionLabel="Limpar filtros e busca"
              onAction={() => {
                setBusca('')
                aplicar({ ...filtros, visao: null, etapas: [], risco: 'todos' })
              }}
            />
          )
        }
      />

      <FiltrosSheet
        open={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        filtros={filtros}
        onAplicar={aplicar}
        contar={contarComFiltros}
      />

      <SheetAdiar linha={aAdiar} onClose={() => setAAdiar(null)} onConfirmar={confirmarAdiamento} />
    </div>
  )
}

/**
 * Silueta de la Carteira. Copia la FORMA real: los 6 tiles, la barra de
 * búsqueda con su botón de filtros y las filas de 72px. Un spinner no dice qué
 * está por aparecer y hace que la pantalla salte cuando llegan los datos.
 */
function EsqueletoCarteira() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3">
      <Skeleton variant="tiles-carteira" />
      <div className="flex items-center gap-2" aria-hidden>
        <SkeletonBlock className="h-touch flex-1 rounded-lg" />
        <SkeletonBlock className="size-touch rounded-pill" />
      </div>
      <Skeleton variant="linha-carteira" count={7} />
    </div>
  )
}
