// src/screens/Dossie/index.tsx
// Dossiê do Cliente — lo que el vendedor lee en el estacionamiento antes de
// entrar a la planta.
//
// Tres decisiones que gobiernan esta pantalla:
//
//  1. UNA sola query. `useDossieCompleto()` arma todo el payload en una pasada
//     por Dexie —oportunidad, lead, actividades, toques, compromisos, tareas,
//     evidencias, health verificado, gates, historial de escalas y perguntas
//     usadas— y cada bloque recibe lo suyo por props. Ningún panel consulta.
//     El v2 dispara ~195 queries al abrir la cartera; acá son cero por fila.
//
//  2. Sin tabs. Es un scroll con secciones plegables y el pliegue se recuerda.
//     Un tab esconde información; una sección plegada la anuncia y la guarda.
//
//  3. El orden es el de la cabeza del vendedor a las 8:40 de la mañana:
//     quién es → qué hago hoy → qué me traba → con quién hablo → qué pasó.

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FileQuestion, TriangleAlert } from 'lucide-react'
import {
  SCALE_LABELS,
  escalaMaisFraca,
  getScaleScores,
  getStageName,
  type ScaleKey,
  type StageId,
} from '@/core'
import {
  syncNow,
  useAlternarPerguntaSpin,
  useAvancarEtapa,
  useDossieCompleto,
} from '@/data'
import { Badge, Button, Card, EmptyState, Skeleton, confirmar, cx, toast } from '@/ui'
import { useBackNativo, useBotaoPrimario, type OpcoesDeBotao } from '@/host'
import { Cabecalho } from './Cabecalho'
import { ProximoPasso } from './ProximoPasso'
import { Secao } from './Secao'
import { Hexagono } from './Hexagono'
import { BlocoGate } from './BlocoGate'
import { Stakeholders } from './Stakeholders'
import { LinhaDoTempo } from './LinhaDoTempo'
import { Compromissos } from './Compromissos'
import { Ficha } from './Ficha'
import { EditorEscala } from './EditorEscala'
import { montarLinhaDoTempo } from './timeline'
// El coaching es del Ventus, no de la ficha: la ficha sólo le da el lugar.
import { PainelCoaching } from '@/screens/Ventus/PainelCoaching'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'

export default function DossieScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const bruto = Number(params['opportunityId'])
  const opportunityId = Number.isInteger(bruto) && bruto > 0 ? bruto : null

  const { vendorName, carregando: sessaoCarregando } = useVendorDaSessao()
  const consulta = useDossieCompleto(opportunityId)
  const alternarSpin = useAlternarPerguntaSpin()
  const avancarEtapa = useAvancarEtapa()

  const [escalaAberta, setEscalaAberta] = useState<ScaleKey | null>(null)
  // ¿El host dibuja «Avançar»? Lo informa `AcaoDaFicha` (ver el comentario de
  // ese componente al final del archivo) y sirve para que el BlocoGate no
  // pinte un segundo botón para la misma etapa.
  const [avancarNativo, setAvancarNativo] = useState(false)

  // La ficha se abre empilhada sobre la carteira y el back nativo del Mini App
  // tiene que volver ahí. Menos cuando la abrió un deep link del bot
  // (`?startapp=opp_1842`): entonces es la PRIMERA entrada del historial
  // —`location.key === 'default'`— y `navigate(-1)` no tendría a dónde ir.
  useBackNativo(() => {
    if (location.key === 'default') void navigate('/carteira')
    else void navigate(-1)
  })

  // Revalidación en background: la ficha ya pintó desde Dexie, esto solo la
  // pone al día si hay señal. Sin red no pasa nada.
  useEffect(() => {
    if (!vendorName) return
    void syncNow(vendorName).catch(() => undefined)
  }, [vendorName])

  const dados = consulta.data

  if (consulta.isPending || sessaoCarregando) {
    return (
      <div className="p-4">
        <Skeleton variant="dossie" />
      </div>
    )
  }

  const oportunidade = dados?.opportunity ?? null

  if (!oportunidade) {
    return (
      <EmptyState
        icon={<FileQuestion size={26} aria-hidden />}
        title="Ficha não encontrada"
        description={
          opportunityId === null
            ? 'Este endereço não aponta para nenhuma oportunidade.'
            : 'Esta oportunidade não está na sua carteira offline. Se ela é sua, puxe a carteira de novo.'
        }
        actionLabel="Voltar para a carteira"
        onAction={() => void navigate('/carteira')}
        secondaryLabel="Tentar de novo"
        onSecondary={() => void consulta.refetch()}
      />
    )
  }

  const dossie = dados
  if (!dossie) return null

  const scores = getScaleScores(oportunidade.scales)
  const etapa = (oportunidade.stage ?? 1) as StageId
  const escalaFoco: ScaleKey = dossie.gate?.escala ?? escalaMaisFraca(oportunidade).escala
  const itens = montarLinhaDoTempo({
    activities: dossie.activities,
    touchpoints: dossie.touchpoints,
    movimentos: dossie.historicoEscalas,
  })
  const riscos = dossie.risks.filter((r) => r.severity !== 'info')

  const alternarPergunta = (escala: ScaleKey, texto: string): void => {
    if (opportunityId === null) return
    alternarSpin.mutate({ opportunityId, escala, texto })
  }

  const avancar = async (): Promise<void> => {
    if (vendorName === null) {
      toast({ message: 'Sessão ainda não resolvida: não dá para gravar agora.', tone: 'atencao' })
      return
    }
    const proxima = getStageName((etapa + 1) as StageId)
    const ok = await confirmar({
      title: `Avançar para ${proxima}?`,
      description: 'O gate é revalidado no servidor. Se lá as escalas não baterem, ele volta.',
      confirmLabel: 'Avançar',
      tone: 'ok',
    })
    if (!ok) return
    await avancarEtapa.mutateAsync({
      opportunityId: oportunidade.id,
      para: (etapa + 1) as StageId,
      vendor: vendorName,
    })
    toast({ message: `Agora em ${proxima}.`, tone: 'ok' })
  }

  const proximaEtapa = getStageName((etapa + 1) as StageId)

  return (
    <div className="pb-6">
      {/* Va PRIMERO en el árbol a propósito: ver `AcaoDaFicha`. */}
      <AcaoDaFicha
        opcoes={
          // El editor de escala es un Sheet y declara su propio «Salvar»:
          // mientras está abierto, la ficha suelta el botón del host.
          escalaAberta !== null || etapa >= 6
            ? null
            : dossie.gate
              ? // Gate incumplido: el botón queda gris y DICE qué falta. Un
                // botón deshabilitado sin motivo es la forma más rápida de que
                // alguien lo toque tres veces y culpe a la app.
                { rotulo: dossie.gate.texto, ativo: false, aoTocar: () => undefined }
              : {
                  rotulo: `Avançar para ${proximaEtapa}`,
                  aoTocar: () => {
                    void avancar()
                  },
                }
        }
        aoMudar={setAvancarNativo}
      />

      <Cabecalho
        opportunity={oportunidade}
        lead={dossie.lead}
        health={dossie.health}
        diasSemContato={dossie.daysSinceContact}
      />

      <div className="space-y-4 px-4 pt-4">
        <ProximoPasso
          opportunity={oportunidade}
          tasks={dossie.tasks}
          vendorName={vendorName}
          hoje={dossie.hoje}
        />

        {riscos.length > 0 && (
          <Card padding="sm" accent={riscos.some((r) => r.severity === 'critical') ? 'perigo' : 'atencao'}>
            <ul className="space-y-1.5">
              {riscos.map((r) => (
                <li key={r.code} className="flex items-start gap-2">
                  <TriangleAlert
                    size={16}
                    aria-hidden
                    className={cx(
                      'mt-0.5 shrink-0',
                      r.severity === 'critical' ? 'text-danger' : 'text-warn',
                    )}
                  />
                  <span className="text-sm leading-snug">{r.message}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LAS DOS COLUMNAS DEL ESCRITORIO
          ══════════════════════════════════════════════════════════════════
          En el teléfono la ficha es UN scroll de secciones plegables, y así
          se queda: es el orden de la cabeza del vendedor a las 8:40 (quién es
          → qué hago hoy → qué me traba → con quién hablo → qué pasó).

          En un monitor ese mismo scroll único era una tira de teléfono
          estirada: para ver el histórico había que pasar de largo el
          hexágono, el gate y el mapa de poder, aunque los dos bloques
          entraran cómodos uno al lado del otro. En lg+ se parten en dos:

            IZQUIERDA — el estado del negocio: escalas PPVVCC, qué traba el
            avance, la jugada que sugiere el Ventus y el mapa de poder.
            DERECHA — lo que pasó y lo que se prometió: histórico,
            compromisos y ficha.

          El corte no es arbitrario: la izquierda se lee para DECIDIR y la
          derecha para VERIFICAR, y tenerlas a la vista al mismo tiempo es
          justamente lo que un teléfono no puede dar.

          Nada de esto existe por debajo de 1024 px: las dos envolturas son
          divs transparentes y el árbol es idéntico al de siempre. */}
      <div className="mt-4 border-t border-border lg:mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:border-t-0 lg:px-4">
        <div className="border-b border-border lg:overflow-hidden lg:rounded-card lg:border lg:bg-surface">
        <Secao
          id="ppvvcc"
          titulo="Escalas PPVVCC"
          resumo={
            <span className="tnum">
              {dossie.health.verificado.toFixed(1).replace('.', ',')} de 10 com prova
            </span>
          }
          alerta={
            dossie.health.escalasSemProva.length === 6 ? (
              <Badge tone="perigo">Nenhuma escala tem prova</Badge>
            ) : undefined
          }
        >
          <Hexagono
            scores={scores}
            comProva={dossie.health.escalasComProva.map((e) => e.escala)}
            evidencias={dossie.evidencias}
            gates={dossie.gates}
            hoje={dossie.hoje}
            onEscolher={setEscalaAberta}
          />
        </Secao>

        <Secao
          id="gate"
          titulo="O que trava o avanço"
          resumo={
            dossie.gate ? (
              <Badge tone="atencao">
                {SCALE_LABELS[dossie.gate.escala].toUpperCase()} ≥ {dossie.gate.minimo}
              </Badge>
            ) : (
              <Badge tone="ok">livre</Badge>
            )
          }
        >
          <BlocoGate
            etapa={etapa}
            scores={scores}
            gate={dossie.gate}
            usadas={dossie.spinUsadas[escalaFoco] ?? []}
            escalaFoco={escalaFoco}
            bloqueado={dossie.gate !== null}
            acaoNativa={avancarNativo}
            onAlternarPergunta={alternarPergunta}
            onAvancarEtapa={avancar}
            onAbrirEscala={setEscalaAberta}
          />
        </Secao>

        {/* Diagnóstico + la jugada, justo debajo de lo que traba el avance:
            es el orden en que se lee la ficha (qué falta → qué hacer). El
            diagnóstico es determinístico y sale de @/core, así que no puede
            contradecir al hexágono de dos bloques más arriba. */}
        <Secao id="coaching" titulo="Ventus sugere" padraoAberta={false}>
          <PainelCoaching
            opportunity={oportunidade}
            diasSemContato={dossie.daysSinceContact}
          />
        </Secao>

        <Secao
          id="stakeholders"
          titulo="Mapa de poder"
          resumo={`${String(
            [
              oportunidade.power_sponsor,
              oportunidade.sponsor,
              oportunidade.influencer,
              oportunidade.support_contact,
            ].filter((n) => (n ?? '').trim() !== '').length,
          )} de 4`}
        >
          <Stakeholders opportunity={oportunidade} lead={dossie.lead} />
        </Secao>
        </div>

        <div className="lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-surface">
        <Secao id="timeline" titulo="Histórico" resumo={`${String(itens.length)} registros`}>
          <LinhaDoTempo
            itens={itens}
            hoje={dossie.hoje}
            onRegistrar={() =>
              void navigate(`/registrar?oportunidade=${String(oportunidade.id)}`)
            }
          />
        </Secao>

        <Secao
          id="compromissos"
          titulo="O que prometi"
          resumo={`${String(dossie.commitments.length)}`}
          padraoAberta={dossie.commitments.length > 0}
        >
          <Compromissos commitments={dossie.commitments} hoje={dossie.hoje} />
        </Secao>

        <Secao id="ficha" titulo="Ficha do negócio" padraoAberta={false}>
          <Ficha
            opportunity={oportunidade}
            healthDeclarado={dossie.healthDeclarado}
            diasSemContato={dossie.daysSinceContact}
            hoje={dossie.hoje}
          />
        </Secao>
        </div>
      </div>

      {escalaAberta && (
        <EditorEscala
          aberto={escalaAberta !== null}
          onFechar={() => setEscalaAberta(null)}
          escala={escalaAberta}
          opportunity={oportunidade}
          evidencias={dossie.evidencias}
          historico={dossie.historicoEscalas}
          usadas={dossie.spinUsadas[escalaAberta] ?? []}
          itensHistorico={itens}
          vendorName={vendorName}
          hoje={dossie.hoje}
          onAlternarPergunta={alternarPergunta}
        />
      )}

      {consulta.isError && (
        <div className="px-4 pt-4">
          <Button block variant="secondary" onClick={() => void consulta.refetch()}>
            Não deu para ler a ficha. Tentar de novo
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Declara la acción crítica de la ficha al host y avisa si el host la dibuja.
 *
 * ¿Por qué un componente y no `useBotaoPrimario()` dentro de `DossieScreen`?
 * Porque React corre los efectos de abajo hacia arriba: los de un hijo antes
 * que los del padre. El `EditorEscala` es hijo de esta pantalla y declara su
 * propio «Salvar»; si la ficha llamara al hook desde el componente padre, su
 * efecto correría DESPUÉS y el `esconder()` de la ficha —que es lo que hace al
 * pasar a `null` cuando el editor se abre— borraría el botón del editor en el
 * mismo commit. Declarándolo desde un hermano que va ANTES en el árbol, el
 * orden queda: ficha suelta el botón → editor lo toma.
 *
 * No pinta nada: existe sólo por el efecto y por el orden.
 */
function AcaoDaFicha({
  opcoes,
  aoMudar,
}: {
  opcoes: OpcoesDeBotao | null
  aoMudar: (nativo: boolean) => void
}): null {
  const nativo = useBotaoPrimario(opcoes)
  useEffect(() => {
    aoMudar(nativo)
  }, [nativo, aoMudar])
  return null
}
