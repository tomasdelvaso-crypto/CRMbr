// src/screens/Cadencia/LeadSheet.tsx
// La ficha del lead: contactos accionables, rascunho del próximo toque,
// registro del toque, timeline y conversión.
//
// ══════════════════════════════════════════════════════════════════════════
// DOS BUGS DEL v2 QUE ESTE ARCHIVO EXISTE PARA NO REPETIR
// ══════════════════════════════════════════════════════════════════════════
//
// 1. «Converter em oportunidade» SIEMPRE está disponible. En el v2 el botón
//    solo aparece cuando se registra un toque con resultado
//    `meeting_scheduled`: si la reunión se agendó por teléfono, por un
//    conocido o en una feria, el lead se queda atrapado en el funil para
//    siempre. Eso rompe el embudo entero.
//
// 2. NO hay drag&drop de etapa. La etapa 1a→1d la mueve `advanceLeadStage`
//    según el resultado del toque, del lado del dominio, y el mismo cálculo
//    corre en el servidor. Arrastrar una tarjeta es inventar un avance que
//    ningún hecho respalda.
//
// Los tres modos viven en UN SOLO Sheet. Anidar sheets significa dos portales,
// dos focus traps y dos bloqueos de scroll peleando: en iOS eso termina con la
// pantalla trabada.

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  Link2,
  Mail,
  MessageCircle,
  Phone,
  Send,
  TriangleAlert,
} from 'lucide-react'
import {
  CHANNEL_LABELS,
  LEAD_STAGE_LABELS,
  MAX_TOUCHPOINTS,
  PRODUCT_LINE_LABELS,
  TOUCHPOINT_RESULT_LABELS,
  advanceLeadStage,
  canalExecutavel,
  channelDeepLink,
  draftForStep,
  formatarDataCurta,
  nextSequenceNumber,
  todayBr,
  type Channel,
  type ProductLine,
  type TouchpointResult,
  type TouchpointSeq,
} from '@/core'
import { useColisaoEmpresa, type LinhaCadencia } from '@/data'
import {
  Badge,
  Button,
  Chip,
  ProgressDots,
  Sheet,
  TextArea,
  TextField,
  cx,
  useDebouncedValue,
} from '@/ui'
import { passoAtual } from './fila'

type Modo = 'ficha' | 'registrar' | 'converter'

export interface RegistroDeToque {
  leadId: number
  sequencia: TouchpointSeq
  canal: Channel
  resultado: TouchpointResult
  mensagemEnviada: string | null
}

export interface ConversaoDeLead {
  leadId: number
  nome: string
  valor: number | null
  linhaProduto: ProductLine | null
}

export interface LeadSheetProps {
  linha: LinhaCadencia | null
  vendorName: string | null
  onClose: () => void
  onRegistrar: (registro: RegistroDeToque) => void
  onConverter: (conversao: ConversaoDeLead) => void
}

const RESULTADOS: readonly TouchpointResult[] = [
  'no_response',
  'interested',
  'not_now',
  'meeting_scheduled',
  'not_interested',
  'other',
]

const ICONE_DO_CANAL: Readonly<Record<Channel, typeof Phone>> = {
  linkedin: Link2,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
}

const CANAIS: readonly Channel[] = ['whatsapp', 'phone', 'email', 'linkedin']

export function LeadSheet({
  linha,
  vendorName,
  onClose,
  onRegistrar,
  onConverter,
}: LeadSheetProps) {
  const [modo, setModo] = useState<Modo>('ficha')
  const [rascunho, setRascunho] = useState<string | null>(null)
  const [nomeNegocio, setNomeNegocio] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [linhaProduto, setLinhaProduto] = useState<ProductLine | null>(null)

  // La última fila abierta se conserva durante la animación de cierre: si el
  // contenido desapareciera en el mismo frame en que `linha` pasa a null, el
  // sheet se iría hacia abajo vacío.
  const [ultima, setUltima] = useState<LinhaCadencia | null>(linha)
  if (linha !== null && linha !== ultima) setUltima(linha)

  const hoje = todayBr()
  const dados = linha ?? ultima
  const lead = dados?.lead ?? null
  const passo = lead ? passoAtual(lead) : null

  // El texto del rascunho se recalcula cuando cambia el lead o el paso, salvo
  // que el vendedor ya lo haya editado.
  const rascunhoBase = useMemo(
    () => (lead && passo ? draftForStep(lead, passo) : ''),
    [lead, passo],
  )
  const texto = rascunho ?? rascunhoBase

  const nomeProposto = nomeNegocio ?? lead?.company_name ?? ''
  const nomeAtrasado = useDebouncedValue(nomeProposto, 400)
  const colisao = useColisaoEmpresa(modo === 'converter' ? nomeAtrasado : '', vendorName)

  const fechar = () => {
    setModo('ficha')
    setRascunho(null)
    setNomeNegocio(null)
    setValor('')
    setLinhaProduto(null)
    onClose()
  }

  if (!lead || !dados) return null

  const aberto = linha !== null

  const canalDoPasso = passo ? (canalExecutavel(lead, passo) ?? passo.channel) : null
  const sequencia =
    nextSequenceNumber(dados.touchpoints) ??
    (Math.min(lead.touchpoints_count + 1, MAX_TOUCHPOINTS) as TouchpointSeq)
  const cadenciaViva = lead.touchpoints_count < MAX_TOUCHPOINTS

  /* ── Modo: registrar o toque ───────────────────────────────────────────── */
  if (modo === 'registrar') {
    return (
      <Sheet
        open={aberto}
        onClose={fechar}
        title="O que aconteceu?"
        description={`${lead.company_name} · toque ${String(sequencia)} de ${String(MAX_TOUCHPOINTS)}`}
        snapPoints={[0.7, 0.95]}
      >
        <div className="space-y-2 pb-4">
          <p className="text-xs text-fg-muted">
            A etapa 1A–1D se move sozinha com o resultado. Você não arrasta nada.
          </p>
          {RESULTADOS.map((resultado) => {
            const proxima = advanceLeadStage(lead, resultado)
            const sobe = proxima !== lead.stage
            return (
              <button
                key={resultado}
                type="button"
                onClick={() => {
                  if (!canalDoPasso) return
                  onRegistrar({
                    leadId: lead.id,
                    sequencia,
                    canal: canalDoPasso,
                    resultado,
                    mensagemEnviada: texto.trim() === '' ? null : texto.trim(),
                  })
                  fechar()
                }}
                className="flex min-h-touch-lg w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 text-left active:bg-surface-2"
              >
                <span className="flex-1 text-sm font-medium">
                  {TOUCHPOINT_RESULT_LABELS[resultado]}
                </span>
                {sobe && (
                  <Badge tone="ok" aria-label={`Sobe para a etapa ${proxima.toUpperCase()}`}>
                    → {proxima.toUpperCase()}
                  </Badge>
                )}
              </button>
            )
          })}
          <Button block variant="ghost" onClick={() => setModo('ficha')}>
            Voltar
          </Button>
        </div>
      </Sheet>
    )
  }

  /* ── Modo: converter em oportunidade ───────────────────────────────────── */
  if (modo === 'converter') {
    const valorNumerico = valor.trim() === '' ? null : Number(valor.replace(/\./g, '').replace(',', '.'))
    const valorValido = valorNumerico === null || Number.isFinite(valorNumerico)
    const dadosColisao = colisao.data

    return (
      <Sheet
        open={aberto}
        onClose={fechar}
        title="Converter em oportunidade"
        description="Nasce na etapa 2 (Qualificação): a etapa 1 é o funil de prospecção e este lead já saiu dele."
        snapPoints={[0.75, 0.95]}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setModo('ficha')}>
              Voltar
            </Button>
            <Button
              block
              size="lg"
              icon={<ArrowUpRight size={18} aria-hidden />}
              disabled={nomeProposto.trim() === '' || !valorValido}
              onClick={() => {
                onConverter({
                  leadId: lead.id,
                  nome: nomeProposto.trim(),
                  valor: valorNumerico,
                  linhaProduto,
                })
                fechar()
              }}
            >
              Converter
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <TextField
            label="Nome do negócio"
            value={nomeProposto}
            onChange={setNomeNegocio}
            placeholder="Ex.: Tetra Pak · linha de expedição"
            maxLength={120}
            required
          />

          {/* Aviso de colisión: ADVIERTE, no bloquea. Dos vendedores en la
              misma planta es un problema de coordinación humana; el CRM avisa
              y deja que las personas decidan. */}
          {dadosColisao?.colide === true && (
            <div className="flex gap-2 rounded-lg bg-warn-soft p-3 text-warn-soft-fg">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              <p className="text-xs leading-5">
                <strong className="font-semibold">Atenção:</strong> esta empresa já aparece na
                carteira de {dadosColisao.dono ?? 'outro vendedor'}. Dá para seguir mesmo assim —
                combine antes para não bater na mesma porta duas vezes.
              </p>
            </div>
          )}

          <TextField
            label="Valor estimado (R$)"
            value={valor}
            onChange={setValor}
            placeholder="80.000"
            inputMode="decimal"
            error={valorValido ? null : 'Valor inválido'}
            hint="Opcional. Dá para ajustar depois no Dossiê."
          />

          <div>
            <p className="mb-2 text-sm font-semibold">Linha de produto</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRODUCT_LINE_LABELS) as ProductLine[]).map((linhaP) => (
                <Chip
                  key={linhaP}
                  tone="marca"
                  selected={linhaProduto === linhaP}
                  onClick={() => setLinhaProduto(linhaProduto === linhaP ? null : linhaP)}
                >
                  {PRODUCT_LINE_LABELS[linhaP]}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </Sheet>
    )
  }

  /* ── Modo: ficha ───────────────────────────────────────────────────────── */
  return (
    <Sheet
      open={aberto}
      onClose={fechar}
      title={lead.company_name}
      description={LEAD_STAGE_LABELS[lead.stage]}
      snapPoints={[0.6, 0.95]}
      footer={
        <div className="flex gap-2">
          <Button
            block
            size="lg"
            icon={<Check size={18} aria-hidden />}
            disabled={!cadenciaViva}
            onClick={() => setModo('registrar')}
          >
            {cadenciaViva ? 'Registrar toque' : 'Cadência esgotada'}
          </Button>
          {/* SEMPRE disponível. Ver o comentário do topo do arquivo. */}
          <Button
            variant="secondary"
            size="lg"
            icon={<ArrowUpRight size={18} aria-hidden />}
            onClick={() => setModo('converter')}
          >
            Converter
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {/* Progresso da cadência */}
        <section className="flex items-center gap-3">
          <ProgressDots
            total={MAX_TOUCHPOINTS}
            feitos={lead.touchpoints_count}
            destacarProximo={cadenciaViva}
          />
          <span className="text-xs text-fg-muted">
            {lead.touchpoints_count} de {MAX_TOUCHPOINTS} toques
            {dados.atraso > 0 && (
              <span className="text-danger">
                {' '}
                · {dados.atraso === 1 ? '1 dia' : `${String(dados.atraso)} dias`} de atraso
              </span>
            )}
          </span>
        </section>

        {/* Contatos com links acionáveis */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Contato</h3>
          <p className="mb-2 text-sm">
            {lead.contact_name ?? 'Sem contato identificado'}
            {lead.contact_title && (
              <span className="text-fg-muted"> · {lead.contact_title}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {CANAIS.map((canal) => {
              const href = channelDeepLink(canal, lead)
              const Icone = ICONE_DO_CANAL[canal]
              if (!href) {
                return (
                  <span
                    key={canal}
                    className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm text-fg-subtle"
                  >
                    <Icone size={16} aria-hidden />
                    {CHANNEL_LABELS[canal]}
                  </span>
                )
              }
              return (
                <a
                  key={canal}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium active:bg-surface-3"
                >
                  <Icone size={16} aria-hidden />
                  {CHANNEL_LABELS[canal]}
                  <ExternalLink size={12} aria-hidden className="text-fg-subtle" />
                </a>
              )
            })}
          </div>
        </section>

        {/* Rascunho do próximo toque, por canal */}
        {passo && canalDoPasso && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Toque {passo.tp} · {CHANNEL_LABELS[canalDoPasso]}
              </h3>
              {canalDoPasso !== passo.channel && (
                <Badge tone="info">Sem {CHANNEL_LABELS[passo.channel]}</Badge>
              )}
            </div>
            <p className="mb-2 text-xs text-fg-muted">{passo.label}</p>
            <TextArea
              label="Rascunho da mensagem"
              hideLabel
              value={texto}
              onChange={setRascunho}
              rows={5}
              maxLength={1200}
            />
            <div className="mt-2 flex gap-2">
              {(() => {
                const href = channelDeepLink(canalDoPasso, lead, texto)
                if (!href) {
                  return (
                    <p className="text-xs text-fg-subtle">
                      Sem {CHANNEL_LABELS[canalDoPasso]} cadastrado para abrir direto.
                    </p>
                  )
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-base font-medium text-brand-fg active:opacity-90"
                  >
                    <Send size={18} aria-hidden />
                    Abrir no {CHANNEL_LABELS[canalDoPasso]}
                  </a>
                )
              })()}
            </div>
          </section>
        )}

        {/* Timeline */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
          {dados.touchpoints.length === 0 ? (
            <p className="text-xs text-fg-muted">
              Nenhum toque registrado ainda. O primeiro é o que tira a empresa da lista fria.
            </p>
          ) : (
            <ol className="list-none space-y-2">
              {[...dados.touchpoints].reverse().map((tp) => (
                <li key={`${String(tp.lead_id)}-${String(tp.sequence_number)}-${tp.executed_at}`}>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={cx(
                        'rounded-pill bg-surface-2 px-1.5 text-2xs font-bold tnum text-fg-muted',
                      )}
                    >
                      {tp.sequence_number}
                    </span>
                    <span className="text-sm font-medium">
                      {TOUCHPOINT_RESULT_LABELS[tp.result]}
                    </span>
                    <span className="ml-auto text-2xs text-fg-subtle">
                      {CHANNEL_LABELS[tp.channel]} · {formatarDataCurta(tp.executed_at, hoje)}
                    </span>
                  </div>
                  {tp.notes && (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-fg-muted">{tp.notes}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Sheet>
  )
}
