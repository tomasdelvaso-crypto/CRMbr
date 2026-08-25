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
import { useNavigate, useParams } from 'react-router-dom'
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
  const bruto = Number(params['opportunityId'])
  const opportunityId = Number.isInteger(bruto) && bruto > 0 ? bruto : null

  const { vendorName, carregando: sessaoCarregando } = useVendorDaSessao()
  const consulta = useDossieCompleto(opportunityId)
  const alternarSpin = useAlternarPerguntaSpin()
  const avancarEtapa = useAvancarEtapa()

  const [escalaAberta, setEscalaAberta] = useState<ScaleKey | null>(null)

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

  return (
    <div className="pb-6">
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

      <div className="mt-4 border-t border-border">
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
