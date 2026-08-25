// src/screens/Revisao/index.tsx
// Revisão do Ventus — la bandeja donde el agente propone y el humano decide.
//
// Tres decisiones que gobiernan esta pantalla:
//
//  1. El objetivo de diseño es LLEGAR A CERO todos los días. Por eso el estado
//     vacío es verde y celebrado, el contador vive en el segmento, y el camino
//     barato (un tap, un swipe) es el de resolver, no el de postergar.
//
//  2. La decisión es POR CAMPO, no por ítem. Un áudio de 40 segundos puede
//     proponer tres cambios y el vendedor querer dos. Aceptar dos de tres
//     recorta el payload ANTES de llamar a ventus_commit_action (ver el
//     comentario de partial accept en src/data/revisao.ts).
//
//  3. Tres secciones que responden preguntas distintas y por eso no se
//     mezclan: «isto está certo?» (propostas), «de quem é isto?» (sem
//     cliente), «vale abrir?» (mapa de mercado).
//
// Todo se lee de Dexie: la bandeja se revisa dentro del galpón, sin señal, y
// las decisiones salen por el outbox cuando el teléfono vuelve al mundo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, CloudOff, Inbox } from 'lucide-react'
import type { DismissReason, RevisaoItem } from '@/core'
import {
  atualizarAppBadge,
  ignorarEmpresaDoMapa,
  promoverDoSweep,
  sincronizarRevisao,
  suportaAppBadge,
  useAceitarProposta,
  useBandejaRevisao,
  useDescartarProposta,
  useVincularRegistro,
  type AlvoRegistro,
  type EmpresaSemLead,
  type RegistroSolto,
} from '@/data'
import {
  Button,
  EmptyState,
  PullToRefresh,
  SegmentedControl,
  Skeleton,
  avisar,
  haptic,
  toast,
} from '@/ui'
import { useVendorDaSessao } from '@/app/useVendorDaSessao'
import { CartaoProposta, type DecisaoProposta } from './CartaoProposta'
import { Colapsavel } from './Colapsavel'
import { SecaoMercado } from './SecaoMercado'
import { SecaoSemCliente } from './SecaoSemCliente'
import { SheetDescartar } from './SheetDescartar'
import { SheetVincular } from './SheetVincular'

type Aba = 'propostas' | 'sem_cliente' | 'mercado'

/** Qué se está descartando: una propuesta o un registro suelto. */
interface AlvoDescarte {
  id: string
  nome: string
}

export default function RevisaoScreen() {
  const navigate = useNavigate()
  const { vendorName, carregando: sessaoCarregando } = useVendorDaSessao()
  const consulta = useBandejaRevisao(vendorName)

  const aceitar = useAceitarProposta()
  const descartar = useDescartarProposta()
  const vincular = useVincularRegistro()

  const [aba, setAba] = useState<Aba>('propostas')
  const [saindo, setSaindo] = useState<ReadonlySet<string>>(new Set())
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [ocupadoSweep, setOcupadoSweep] = useState<number | null>(null)
  const [alvoDescarte, setAlvoDescarte] = useState<AlvoDescarte | null>(null)
  const [aVincular, setAVincular] = useState<RegistroSolto | null>(null)

  const bandeja = consulta.data

  // Badge del sistema operativo. Con detección de soporte: en Safari iOS la
  // Badging API no existe y el fallo tiene que ser silencioso, no una excepción
  // en cada repintado.
  useEffect(() => {
    if (!suportaAppBadge()) return
    void atualizarAppBadge(bandeja?.total ?? 0)
  }, [bandeja?.total])

  const marcarSaindo = useCallback((id: string) => {
    setSaindo((atual) => new Set(atual).add(id))
  }, [])

  /* ── Propostas ─────────────────────────────────────────────────────────── */

  const confirmarProposta = async (item: RevisaoItem, decisao: DecisaoProposta) => {
    setOcupado(item.id)
    try {
      await aceitar.mutateAsync({
        vendor: item.vendor,
        acaoId: item.id,
        camposAceitos: decisao.camposAceitos,
        edicoes: decisao.edicoes,
      })
      haptic('success')
      marcarSaindo(item.id)
      const n = decisao.camposAceitos.length
      toast({
        message:
          n === item.campos.length
            ? `Aplicado em ${item.entidade.nome}.`
            : `${String(n)} de ${String(item.campos.length)} campos aplicados em ${item.entidade.nome}.`,
        tone: 'ok',
      })
    } catch (erro) {
      haptic('error')
      await avisar({
        title: 'Não deu para aplicar',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
      })
    } finally {
      setOcupado(null)
    }
  }

  const confirmarDescarte = async (motivo: DismissReason) => {
    const alvo = alvoDescarte
    if (alvo === null || vendorName === null) return
    setAlvoDescarte(null)
    setOcupado(alvo.id)
    try {
      await descartar.mutateAsync({ vendor: vendorName, acaoId: alvo.id, motivo })
      haptic('warning')
      marcarSaindo(alvo.id)
      toast({ message: `Descartado. O Ventus registrou o porquê.`, tone: 'atencao' })
    } catch (erro) {
      await avisar({
        title: 'Não deu para descartar',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
      })
    } finally {
      setOcupado(null)
    }
  }

  /* ── Sem cliente ───────────────────────────────────────────────────────── */

  const escolherAlvo = async (alvo: AlvoRegistro) => {
    const registro = aVincular
    if (registro === null || vendorName === null) return
    setAVincular(null)
    setOcupado(registro.id)
    try {
      await vincular.mutateAsync({
        vendor: vendorName,
        acaoId: registro.id,
        alvo: { kind: alvo.kind, id: alvo.id },
      })
      haptic('success')
      toast({
        message: `Vinculado a ${alvo.nome}. Agora aparece em Propostas.`,
        tone: 'ok',
      })
      setAba('propostas')
    } catch (erro) {
      await avisar({
        title: 'Não deu para vincular',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
      })
    } finally {
      setOcupado(null)
    }
  }

  /* ── Mercado ───────────────────────────────────────────────────────────── */

  const promover = async (empresa: EmpresaSemLead) => {
    if (vendorName === null) return
    setOcupadoSweep(empresa.sweepId)
    try {
      await promoverDoSweep({ sweepId: empresa.sweepId, vendor: vendorName })
      await ignorarEmpresaDoMapa(vendorName, empresa.sweepId)
      haptic('success')
      await consulta.refetch()
      toast({
        message: `${empresa.empresa} virou lead. A cadência já começou.`,
        tone: 'ok',
      })
    } catch (erro) {
      await avisar({
        title: 'Não deu para criar o lead',
        description: erro instanceof Error ? erro.message : 'Tente de novo em instantes.',
      })
    } finally {
      setOcupadoSweep(null)
    }
  }

  const ignorar = async (empresa: EmpresaSemLead) => {
    if (vendorName === null) return
    await ignorarEmpresaDoMapa(vendorName, empresa.sweepId)
    await consulta.refetch()
    toast({ message: `${empresa.empresa} sai da bandeja. Segue no mapa.`, tone: 'neutro' })
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  const opcoes = useMemo(
    () => [
      { value: 'propostas' as const, label: 'Propostas', count: bandeja?.propostas.length ?? 0 },
      {
        value: 'sem_cliente' as const,
        label: 'Sem cliente',
        count: bandeja?.semCliente.length ?? 0,
      },
      { value: 'mercado' as const, label: 'Mapa', count: bandeja?.mercado.length ?? 0 },
    ],
    [bandeja],
  )

  if (sessaoCarregando || consulta.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton variant="revisao" count={3} />
      </div>
    )
  }

  if (vendorName === null) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Inbox size={28} aria-hidden />}
          title="Entre para ver sua bandeja"
          description="As propostas do Ventus são pessoais: cada vendedor revisa as suas."
          actionLabel="Entrar"
          onAction={() => void navigate('/login')}
        />
      </div>
    )
  }

  const dados = bandeja ?? {
    propostas: [],
    semCliente: [],
    mercado: [],
    total: 0,
    urgentes: 0,
    mercadoBloqueado: false,
    offline: false,
  }

  const zerada = dados.total === 0

  return (
    <PullToRefresh
      onRefresh={async () => {
        await sincronizarRevisao(vendorName)
        await consulta.refetch()
      }}
    >
      <div className="space-y-4 p-4">
        {dados.offline && (
          <p className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm text-fg-muted">
            <CloudOff size={16} aria-hidden className="shrink-0" />
            Sem conexão. Você decide agora; o Ventus aplica quando voltar o sinal.
          </p>
        )}

        {zerada ? (
          <EmptyState
            icon={<CheckCheck size={32} aria-hidden />}
            title="Bandeja zerada"
            description="Nada esperando por você. Nada capturado se perdeu — o que o Ventus achar novo aparece aqui."
            variant="sucesso"
            actionLabel="Ver o plano de hoje"
            onAction={() => void navigate('/')}
          />
        ) : (
          <>
            <SegmentedControl
              options={opcoes}
              value={aba}
              onChange={setAba}
              label="Seções da revisão"
            />

            {dados.urgentes > 0 && aba === 'propostas' && (
              <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn-soft-fg">
                {dados.urgentes === 1
                  ? '1 proposta vence nas próximas 6 horas.'
                  : `${String(dados.urgentes)} propostas vencem nas próximas 6 horas.`}{' '}
                Depois de 48 h elas expiram e o Ventus precisa propor de novo.
              </p>
            )}

            {aba === 'propostas' &&
              (dados.propostas.length === 0 ? (
                <EmptyState
                  icon={<CheckCheck size={28} aria-hidden />}
                  title="Nenhuma proposta aberta"
                  description="Tudo que o Ventus sugeriu já foi decidido por você."
                  variant="sucesso"
                />
              ) : (
                <ul className="space-y-3">
                  {dados.propostas.map((item) => (
                    <li key={item.id}>
                      <Colapsavel saindo={saindo.has(item.id)}>
                        <CartaoProposta
                          item={item}
                          ocupado={ocupado === item.id}
                          onAceitar={(decisao) => {
                            void confirmarProposta(item, decisao)
                          }}
                          onDescartar={() => {
                            setAlvoDescarte({ id: item.id, nome: item.entidade.nome })
                          }}
                          {...(item.entidade.kind === 'opportunity' && item.entidade.id > 0
                            ? {
                                onAbrirCliente: () =>
                                  void navigate(`/carteira/${String(item.entidade.id)}`),
                              }
                            : {})}
                        />
                      </Colapsavel>
                    </li>
                  ))}
                </ul>
              ))}

            {aba === 'sem_cliente' && (
              <SecaoSemCliente
                registros={dados.semCliente}
                ocupadoId={ocupado}
                onVincular={setAVincular}
                onDescartar={(r) => {
                  setAlvoDescarte({ id: r.id, nome: 'este registro' })
                }}
              />
            )}

            {aba === 'mercado' && (
              <SecaoMercado
                empresas={dados.mercado}
                bloqueado={dados.mercadoBloqueado}
                ocupadoId={ocupadoSweep}
                onPromover={(e) => void promover(e)}
                onIgnorar={(e) => void ignorar(e)}
              />
            )}
          </>
        )}

        {/* Salida honesta cuando la bandeja no está vacía pero el vendedor sí
            terminó: no hay «marcar todo como leído» — eso destruiría la señal. */}
        {!zerada && (
          <Button variant="ghost" block onClick={() => void navigate('/')}>
            Voltar para o plano de hoje
          </Button>
        )}
      </div>

      <SheetDescartar
        open={alvoDescarte !== null}
        alvo={alvoDescarte?.nome ?? ''}
        onClose={() => {
          setAlvoDescarte(null)
        }}
        onConfirmar={(motivo) => void confirmarDescarte(motivo)}
      />

      <SheetVincular
        open={aVincular !== null}
        vendor={vendorName}
        trecho={aVincular?.texto ?? ''}
        onClose={() => {
          setAVincular(null)
        }}
        onEscolher={(alvo) => void escolherAlvo(alvo)}
      />
    </PullToRefresh>
  )
}
