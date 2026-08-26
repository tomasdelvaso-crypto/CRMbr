// src/screens/Cadencia/index.tsx
// CADÊNCIA — el funil 1A–1D como FILA, no como kanban.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. UNA LISTA, ORDENADA POR LA FECHA REAL DEL PRÓXIMO TOQUE. El v2 agrupa por
//    umbrales fijos (3 días, 5 días) en cuatro cajas, así que un toque vencido
//    hace 12 días se lee igual que uno que vence mañana. Acá lo más vencido
//    está arriba, siempre, y el atraso se dice en días y en rojo.
//
// 2. EL CONTROL 1A/1B/1C/1D FILTRA, NO APILA. Cuatro columnas con scroll
//    interno dentro del scroll de la página es la peor experiencia táctil que
//    existe. El kanban queda solo en md+, donde las columnas caben una al lado
//    de la otra y la página no scrollea.
//
// 3. LA ETAPA SE MUEVE SOLA. `advanceLeadStage` la deriva del resultado del
//    toque, y la misma función corre en el servidor dentro de
//    `registrar_touchpoint`. No hay drag&drop porque no hay nada que arrastrar.
//
// 4. «CONVERTER EM OPORTUNIDADE» SIEMPRE ESTÁ. Ver el comentario de
//    LeadSheet.tsx: atarlo a `meeting_scheduled` rompe el embudo.

import { useCallback, useContext, useMemo, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { MapPinned, Radio, Users } from 'lucide-react'
import {
  MAX_TOUCHPOINTS,
  advanceLeadStage,
  todayBr,
  type TouchpointResult,
} from '@/core'
import {
  useConverterLead,
  useFilaCadencia,
  useMapaDeMercado,
  usePromoverDoSweep,
  useRegistrarTouchpoint,
  type EmpresaDoMapa,
  type LinhaCadencia as DadosLinha,
} from '@/data'
import {
  Badge,
  Button,
  EmptyState,
  SegmentedControl,
  Skeleton,
  SkeletonBlock,
  VirtualList,
  haptic,
  toast,
  useTelaLarga,
} from '@/ui'
import { SessionContext } from '@/app/session-context'
import { ALTURA_LINHA, LinhaCadencia } from './LinhaCadencia'
import { Kanban } from './Kanban'
import { LeadSheet, type ConversaoDeLead, type RegistroDeToque } from './LeadSheet'
import { MapaSheet } from './MapaSheet'
import { ETAPAS_FILTRO, ETAPA_CURTA, contarEtapas, prepararFila, type FiltroEtapa } from './fila'

/** Mismo cálculo que la Carteira: header (h-14), nav y las dos safe areas. */
const ALTURA_TELA =
  'calc(100svh - 3.5rem - var(--safe-top) - var(--spacing-nav-visivel) - var(--safe-bottom) - var(--spacing-chrome))'

/** Resultados que cierran el lead sin más toques: se avisa distinto. */
const RESULTADOS_QUE_ENCERRAM: readonly TouchpointResult[] = ['not_interested']

export default function CadenciaScreen() {
  const queryClient = useContext(QueryClientContext)
  const sessao = useContext(SessionContext)

  if (!queryClient || !sessao) return <EsqueletoCadencia />
  return <Cadencia vendorName={sessao.vendorName} />
}

function Cadencia({ vendorName }: { vendorName: string | null }) {
  const hoje = todayBr()
  const telaLarga = useTelaLarga()

  const fila = useFilaCadencia(vendorName)
  const mapa = useMapaDeMercado(vendorName)

  const registrar = useRegistrarTouchpoint()
  const converter = useConverterLead()
  const promover = usePromoverDoSweep()

  const [etapa, setEtapa] = useState<FiltroEtapa>('todos')
  const [aberto, setAberto] = useState<DadosLinha | null>(null)
  const [mapaAberto, setMapaAberto] = useState(false)
  const [puxados, setPuxados] = useState<ReadonlySet<number>>(() => new Set())

  const linhas = useMemo(() => fila.data ?? [], [fila.data])
  const contagem = useMemo(() => contarEtapas(linhas), [linhas])
  const visiveis = useMemo(() => prepararFila(linhas, etapa, hoje), [linhas, etapa, hoje])
  const atrasados = useMemo(() => linhas.filter((l) => l.atraso > 0).length, [linhas])

  const empresasNoMapa = mapa.data?.empresas.length ?? 0

  /* ── Escrituras ────────────────────────────────────────────────────────── */

  const aoRegistrar = useCallback(
    (registro: RegistroDeToque) => {
      if (!vendorName) return
      const linha = linhas.find((l) => l.lead.id === registro.leadId)
      const etapaAntes = linha?.lead.stage ?? null
      const etapaDepois = linha ? advanceLeadStage(linha.lead, registro.resultado) : null

      registrar.mutate(
        {
          leadId: registro.leadId,
          sequencia: registro.sequencia,
          canal: registro.canal,
          resultado: registro.resultado,
          mensagemEnviada: registro.mensagemEnviada,
          vendor: vendorName,
        },
        {
          onError: () => {
            toast({ message: 'Não deu para registrar o toque. Tente de novo.', tone: 'perigo' })
          },
        },
      )

      haptic('success')

      if (RESULTADOS_QUE_ENCERRAM.includes(registro.resultado)) {
        toast({ message: 'Registrado. Esse contato para por aqui.', tone: 'atencao' })
      } else if (etapaDepois && etapaDepois !== etapaAntes) {
        // La etapa se movió sola: decirlo es lo que enseña la regla.
        toast({
          message: `Toque ${String(registro.sequencia)} registrado · subiu para ${etapaDepois.toUpperCase()}`,
          tone: 'ok',
        })
      } else {
        toast({ message: `Toque ${String(registro.sequencia)} de ${String(MAX_TOUCHPOINTS)} registrado.`, tone: 'ok' })
      }
    },
    [linhas, registrar, vendorName],
  )

  const aoConverter = useCallback(
    (conversao: ConversaoDeLead) => {
      if (!vendorName) return
      converter.mutate(
        {
          leadId: conversao.leadId,
          nome: conversao.nome,
          valor: conversao.valor,
          linhaProduto: conversao.linhaProduto,
          vendor: vendorName,
        },
        {
          onError: () => {
            toast({ message: 'Não deu para converter. Tente de novo.', tone: 'perigo' })
          },
        },
      )
      haptic('celebration')
      toast({
        message: `${conversao.nome} virou oportunidade. Ela aparece na Carteira no próximo sync.`,
        tone: 'ok',
      })
    },
    [converter, vendorName],
  )

  const aoPuxar = useCallback(
    (empresa: EmpresaDoMapa) => {
      if (!vendorName) return
      setPuxados((atual) => new Set(atual).add(empresa.id))
      promover.mutate(
        { sweepId: empresa.id, vendor: vendorName },
        {
          onError: () => {
            setPuxados((atual) => {
              const copia = new Set(atual)
              copia.delete(empresa.id)
              return copia
            })
            toast({ message: 'Não deu para puxar essa empresa.', tone: 'perigo' })
          },
        },
      )
      haptic('success')
      toast({ message: `${empresa.company_name} entrou na cadência.`, tone: 'ok' })
    },
    [promover, vendorName],
  )

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (fila.isLoading) return <EsqueletoCadencia />

  const filaVazia = linhas.length === 0

  return (
    <div className="flex flex-col" style={{ height: ALTURA_TELA }}>
      {/* `px-4` y no otro valor: es la MISMA canaleta que usan el header del
          Shell y el Kanban de abajo. En escritorio esta pantalla usa todo el
          ancho del área de contenido (ver src/app/largura.ts), así que el
          título «Cadência», el chip de atrasados, el botón «Mapa» y las
          cuatro columnas comparten el eje al píxel. */}
      <div className="shrink-0 space-y-2 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <Badge tone={atrasados > 0 ? 'perigo' : 'ok'} aria-label={`${String(atrasados)} toques atrasados`}>
            {atrasados > 0 ? `${String(atrasados)} atrasados` : 'Em dia'}
          </Badge>
          <span className="text-xs text-fg-muted">
            {linhas.length === 1 ? '1 lead na fila' : `${String(linhas.length)} leads na fila`}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            icon={<MapPinned size={16} aria-hidden />}
            onClick={() => setMapaAberto(true)}
          >
            {empresasNoMapa > 0 ? `Mapa (${String(empresasNoMapa)})` : 'Mapa'}
          </Button>
        </div>

        {/* Filtra, não empilha. En escritorio va con tope y pegado a la
            izquierda: estirar cinco segmentos a 1.700 px daría botones de
            340 px para etiquetas de dos caracteres. */}
        <SegmentedControl<FiltroEtapa>
          className="lg:max-w-2xl"
          label="Filtrar por etapa do funil"
          size="sm"
          value={etapa}
          onChange={setEtapa}
          // «Tudo» va sin contador a propósito: son 5 segmentos en 320px de
          // ancho y el total ya se lee arriba («N leads na fila»). Sacarlo es
          // lo que hace que los cuatro contadores que sí importan no se corten.
          options={ETAPAS_FILTRO.map((e) => ({
            value: e,
            label: ETAPA_CURTA[e],
            ...(e === 'todos' ? {} : { count: contagem[e] }),
          }))}
        />
      </div>

      {filaVazia ? (
        <div className="flex-1 overflow-y-auto scroll-momentum">
          <EmptyState
            icon={<Users size={28} aria-hidden />}
            title="Nenhum lead na cadência"
            description="Você tem empresas mapeadas esperando. Puxe uma e a cadência de 7 toques começa hoje mesmo."
            actionLabel="Puxar do mapa de mercado"
            onAction={() => setMapaAberto(true)}
          />
        </div>
      ) : telaLarga ? (
        <div className="min-h-0 flex-1">
          <Kanban linhas={visiveis} hoje={hoje} onAbrir={setAberto} />
        </div>
      ) : (
        <VirtualList
          items={visiveis}
          itemHeight={ALTURA_LINHA}
          getKey={(linha) => linha.lead.id}
          aria-label="Fila de cadência"
          className="min-h-0 flex-1 pb-24"
          renderItem={(linha) => (
            <LinhaCadencia linha={linha} hoje={hoje} onAbrir={setAberto} />
          )}
          empty={
            <EmptyState
              icon={<Radio size={28} aria-hidden />}
              title={`Nada em ${ETAPA_CURTA[etapa]}`}
              description="Nenhum lead nessa etapa do funil agora."
              actionLabel="Ver a fila inteira"
              onAction={() => setEtapa('todos')}
            />
          }
        />
      )}

      <LeadSheet
        linha={aberto}
        vendorName={vendorName}
        onClose={() => setAberto(null)}
        onRegistrar={aoRegistrar}
        onConverter={aoConverter}
      />

      <MapaSheet
        open={mapaAberto}
        onClose={() => setMapaAberto(false)}
        mapa={mapa.data}
        carregando={mapa.isLoading}
        puxados={puxados}
        onPuxar={aoPuxar}
      />
    </div>
  )
}

/** Silueta de la Cadência: el resumo, el control segmentado y las filas de 80px. */
function EsqueletoCadencia() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3">
      <div className="flex items-center gap-2" aria-hidden>
        <SkeletonBlock className="h-5 w-24 rounded-pill" />
        <SkeletonBlock className="ml-auto h-touch w-24 rounded-md" />
      </div>
      <SkeletonBlock className="h-9 w-full rounded-pill" />
      <Skeleton variant="linha-cadencia" count={7} />
    </div>
  )
}
