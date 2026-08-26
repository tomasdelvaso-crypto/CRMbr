// src/screens/Dossie/EditorEscala.tsx
// Editor de una escala PPVVCC. El criterio de diseño es uno solo: mover una
// escala tiene que ser un gesto de 10 segundos.
//
// Por eso el gesto principal NO es el stepper, es la lista de los 11 niveles
// canónicos: tocar «Tomador de Decisão admite dor» pone el 9 y el texto de
// golpe, sin pensar en números. El stepper vive abajo, en la zona del pulgar,
// para el ajuste fino — y es el Stepper de @/ui, nunca un input type=range
// (con guantes de planta, un slider de 11 pasos es imposible de acertar).
//
// Lo que este sheet impone y el v2 no imponía:
//  · por encima de 5, la cita del cliente es OBLIGATORIA. Sin quem disse,
//    cargo, quando e a citação, el botón no guarda. La misma regla vive en
//    Postgres (scale_evidence_prova_chk): esto es la cortesía, no el control.
//  · el estado de las perguntas SPIN usadas SE PERSISTE. En el v2 se perdía al
//    cerrar el modal y el vendedor repetía la misma pregunta en la visita
//    siguiente.
//  · el guardado es optimista y entra al outbox. El gate se revalida SIEMPRE
//    en el servidor: este teléfono puede estar con datos de ayer.

import { useMemo, useState } from 'react'
import { Check, History, Mic, Quote } from 'lucide-react'
import {
  EVIDENCE_REQUIRED_ABOVE,
  SCALE_DEFINITIONS,
  SCALE_LABELS,
  SPIN_CATEGORY_HINTS,
  SPIN_CATEGORY_LABELS,
  categoriaParaNivel,
  evaluateGate,
  formatarDataCurta,
  gatesFaltantes,
  getScaleScores,
  getStageName,
  healthVerificado,
  questionsForScale,
  type Evidence,
  type IsoDate,
  type Opportunity,
  type ScaleKey,
  type ScalesRecord,
  type SpinCategory,
  type StageId,
} from '@/core'
import { ErroRegraDaProva, useMoverEscala, type MovimentoEscala } from '@/data'
import {
  Badge,
  Button,
  Card,
  Chip,
  SegmentedControl,
  Sheet,
  Stepper,
  TextArea,
  TextField,
  cx,
  haptic,
  toast,
} from '@/ui'
import { copiarTexto } from './copiar'
import { useDitado } from '@/ui'
import type { ItemLinhaDoTempo } from './timeline'

export interface EditorEscalaProps {
  aberto: boolean
  onFechar: () => void
  escala: ScaleKey
  opportunity: Opportunity
  evidencias: readonly Evidence[]
  historico: readonly MovimentoEscala[]
  /** Textos de SPIN ya usados con este cliente en ESTA escala. */
  usadas: readonly string[]
  /** Últimos registros del timeline, para sacar la cita sin teclear. */
  itensHistorico: readonly ItemLinhaDoTempo[]
  vendorName: string | null
  hoje: IsoDate
  onAlternarPergunta: (escala: ScaleKey, texto: string) => void
}

const CATEGORIAS: readonly SpinCategory[] = ['situacao', 'problema', 'implicacao', 'necessidade']

/**
 * Rótulos cortos para el control segmentado, que reparte el ancho del sheet
 * entre cuatro segmentos: en un iPhone de 390 px cada uno tiene ~87 px.
 * `SPIN_CATEGORY_LABELS.necessidade` es «Necessidade de solução» —138 px en una
 * sola línea— y ahí nace el desborde horizontal que corría el sheet de costado
 * al enfocar «Cargo». El nombre completo sigue estando: es el que encabeza la
 * ayuda de la categoría elegida, justo arriba del control.
 */
const ROTULO_CURTO: Readonly<Record<SpinCategory, string>> = {
  situacao: 'Situação',
  problema: 'Problema',
  implicacao: 'Implicação',
  necessidade: 'Necessidade',
}

export function EditorEscala({
  aberto,
  onFechar,
  escala,
  opportunity,
  evidencias,
  historico,
  usadas,
  itensHistorico,
  vendorName,
  hoje,
  onAlternarPergunta,
}: EditorEscalaProps) {
  const scores = getScaleScores(opportunity.scales)
  const nivelAtual = scores[escala]

  const [nivel, setNivel] = useState(nivelAtual)
  const [citacao, setCitacao] = useState('')
  const [fonteNome, setFonteNome] = useState('')
  const [fonteCargo, setFonteCargo] = useState('')
  const [ocorridoEm, setOcorridoEm] = useState<IsoDate>(hoje)
  const [categoria, setCategoria] = useState<SpinCategory>(() => categoriaParaNivel(nivelAtual))
  const [puxando, setPuxando] = useState(false)

  const mover = useMoverEscala()
  const ditado = useDitado((texto) => {
    setCitacao((atual) => (atual.trim() === '' ? texto : `${atual} ${texto}`))
  })

  // Al abrir —y al cambiar de escala— el editor arranca SIEMPRE del estado real
  // de la oportunidad: reabrirlo después de guardar no puede mostrar el
  // borrador anterior. Es el patrón «adjusting state when a prop changes» de
  // la documentación de React (el mismo que usa Sheet), no un efecto: un
  // efecto costaría un commit extra con los campos viejos pintados.
  const assinatura = `${escala}:${String(nivelAtual)}:${aberto ? '1' : '0'}`
  const [assinaturaAnterior, setAssinaturaAnterior] = useState(assinatura)
  if (assinatura !== assinaturaAnterior) {
    setAssinaturaAnterior(assinatura)
    setNivel(nivelAtual)
    setCitacao('')
    setFonteNome('')
    setFonteCargo('')
    setOcorridoEm(hoje)
    setCategoria(categoriaParaNivel(nivelAtual))
    setPuxando(false)
  }

  const exigeProva = nivel > EVIDENCE_REQUIRED_ABOVE && nivel > nivelAtual
  const temProva =
    citacao.trim() !== '' && fonteNome.trim() !== '' && fonteCargo.trim() !== ''
  const podeSalvar =
    vendorName !== null && nivel !== nivelAtual && (!exigeProva || temProva)

  /* ── Preview del efecto ──────────────────────────────────────────────── */
  const efeito = useMemo(() => {
    const etapa = (opportunity.stage ?? 1) as StageId
    const hipotetico: ScalesRecord = { ...(opportunity.scales ?? {}), [escala]: nivel }

    const antes = evaluateGate(opportunity.scales, etapa)
    const depois = evaluateGate(hipotetico, etapa)
    const proxima = getStageName((etapa + 1) as StageId)
    const restantes = gatesFaltantes(hipotetico, etapa)

    const provasHipoteticas: Evidence[] =
      citacao.trim() === ''
        ? [...evidencias]
        : [
            ...evidencias,
            {
              id: 'preview',
              opportunity_id: opportunity.id,
              scale: escala,
              level: nivel,
              kind: 'quote',
              quote: citacao.trim(),
              source_name: fonteNome.trim() || null,
              source_title: fonteCargo.trim() || null,
              occurred_at: ocorridoEm,
              created_at: `${ocorridoEm}T12:00:00.000Z`,
              created_by: vendorName ?? '',
              verified: null,
            },
          ]

    const saudeDepois = healthVerificado(hipotetico, provasHipoteticas, hoje)
    const saudeAntes = healthVerificado(opportunity.scales, evidencias, hoje)

    let texto: string
    let tom: 'ok' | 'atencao' | 'neutro'
    if (etapa >= 6) {
      texto = 'O negócio já está fechado: isto só corrige o histórico.'
      tom = 'neutro'
    } else if (!antes.passed && depois.passed) {
      texto = `Isto destrava a ${proxima}.`
      tom = 'ok'
    } else if (restantes.length > 0) {
      const falta = restantes
        .map((g) => `${SCALE_LABELS[g.escala].toUpperCase()} ≥ ${g.minimo}`)
        .join(' e ')
      texto = `Faltará ainda ${falta} para sair de ${getStageName(etapa)}.`
      tom = 'atencao'
    } else {
      texto = `O gate de ${getStageName(etapa)} já estava cumprido.`
      tom = 'neutro'
    }

    return { texto, tom, saudeAntes: saudeAntes.verificado, saudeDepois: saudeDepois.verificado }
  }, [
    citacao,
    escala,
    evidencias,
    fonteCargo,
    fonteNome,
    hoje,
    nivel,
    ocorridoEm,
    opportunity,
    vendorName,
  ])

  const salvar = async (): Promise<void> => {
    if (vendorName === null) {
      toast({ message: 'Sessão ainda não resolvida: não dá para gravar agora.', tone: 'atencao' })
      return
    }
    try {
      await mover.mutateAsync({
        opportunityId: opportunity.id,
        escala,
        nivel,
        de: nivelAtual,
        citacao: citacao.trim() === '' ? null : citacao.trim(),
        fonteNome: fonteNome.trim() || null,
        fonteCargo: fonteCargo.trim() || null,
        ocorridoEm,
        vendor: vendorName,
      })
      haptic('success')
      toast({
        message: `${SCALE_LABELS[escala]} em ${String(nivel)}. Salvo — o servidor revalida o gate.`,
        tone: 'ok',
      })
      onFechar()
    } catch (erro) {
      haptic('error')
      toast({
        message:
          erro instanceof ErroRegraDaProva
            ? erro.message
            : 'Não deu para salvar agora. Fica na fila e sobe sozinho.',
        tone: 'perigo',
      })
    }
  }

  const perguntas = questionsForScale(escala, categoria)
  const usadasSet = new Set(usadas.map((t) => t.trim()))
  const historicoDaEscala = historico.filter((m) => m.escala === escala)
  const candidatosDeCitacao = itensHistorico
    .filter((i) => (i.corpo ?? '').trim() !== '')
    .slice(0, 8)

  return (
    <Sheet
      open={aberto}
      onClose={onFechar}
      title={`${SCALE_LABELS[escala]} · ${String(nivelAtual)} → ${String(nivel)}`}
      description="Escolha o nível pelo texto. O número é consequência."
      snapPoints={[0.72, 0.96]}
      footer={
        <div className="space-y-3">
          <Stepper
            label={SCALE_LABELS[escala]}
            value={nivel}
            onChange={setNivel}
            className="pb-1"
          />
          <Button block size="lg" disabled={!podeSalvar} loading={mover.isPending} onClick={salvar}>
            {nivel === nivelAtual
              ? 'Escolha um nível'
              : exigeProva && !temProva
                ? 'Falta a evidência'
                : `Salvar ${SCALE_LABELS[escala]} em ${String(nivel)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-1">
        {/* ── Efecto: qué destraba y qué le hace a la saúde verificada ──── */}
        <Card
          padding="sm"
          accent={efeito.tom === 'ok' ? 'ok' : efeito.tom === 'atencao' ? 'atencao' : 'neutro'}
        >
          <p className="text-sm font-semibold leading-snug text-balance">{efeito.texto}</p>
          <p className="mt-1 text-xs text-fg-muted">
            Saúde verificada:{' '}
            <span className="tnum">{efeito.saudeAntes.toFixed(1).replace('.', ',')}</span>
            {' → '}
            <span
              className={cx(
                'tnum font-semibold',
                efeito.saudeDepois > efeito.saudeAntes ? 'text-ok' : 'text-fg',
              )}
            >
              {efeito.saudeDepois.toFixed(1).replace('.', ',')}
            </span>
          </p>
        </Card>

        {/* ── Los 11 niveles canónicos: el gesto principal ───────────────── */}
        <section>
          <h3 className="text-sm font-semibold">Níveis de {SCALE_LABELS[escala]}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">
            Toque o que descreve o que REALMENTE aconteceu. Ele define o número.
          </p>
          <ul className="mt-2 space-y-1.5">
            {SCALE_DEFINITIONS[escala].map((definicao) => {
              const selecionado = definicao.level === nivel
              const atual = definicao.level === nivelAtual
              return (
                <li key={definicao.level}>
                  <button
                    type="button"
                    aria-pressed={selecionado}
                    onClick={() => {
                      haptic('selection')
                      setNivel(definicao.level)
                      setCategoria(categoriaParaNivel(definicao.level))
                    }}
                    className={cx(
                      'flex min-h-touch w-full items-center gap-3 rounded-lg border px-3 py-2 text-left',
                      'tap-highlight-none transition-colors duration-150 motion-reduce:transition-none',
                      selecionado
                        ? 'border-brand bg-brand-soft text-brand-soft-fg'
                        : 'border-border bg-surface-2 active:bg-surface-3',
                    )}
                  >
                    <span className="tnum w-5 shrink-0 text-base font-bold">{definicao.level}</span>
                    <span className="min-w-0 flex-1 text-sm leading-snug">{definicao.text}</span>
                    {atual && !selecionado && (
                      <Badge tone="neutro" className="shrink-0">
                        hoje
                      </Badge>
                    )}
                    {definicao.level > EVIDENCE_REQUIRED_ABOVE && (
                      <Quote size={14} aria-hidden className="shrink-0 text-fg-subtle" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* ── Evidencia ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Evidência</h3>
            {exigeProva ? (
              <Badge tone="perigo">obrigatória acima de {EVIDENCE_REQUIRED_ABOVE}</Badge>
            ) : (
              <Badge tone="neutro">opcional aqui</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {exigeProva
              ? 'Acima de 5 o nível é um fato, não uma impressão: quem disse, que cargo tem, quando, e a frase dele.'
              : 'Mesmo abaixo de 5, uma citação faz esta escala contar na saúde verificada.'}
          </p>

          <div className="mt-3 space-y-3">
            <TextArea
              label="A frase do cliente"
              value={citacao}
              onChange={setCitacao}
              required={exigeProva}
              rows={3}
              placeholder="«Se a caixa chegar violada de novo, eu perco o contrato com a rede.»"
              action={
                ditado.suportado ? (
                  <button
                    type="button"
                    onClick={ditado.alternar}
                    aria-pressed={ditado.ouvindo}
                    className={cx(
                      'inline-flex min-h-touch items-center gap-1.5 rounded-pill px-3 text-sm font-medium tap-highlight-none',
                      ditado.ouvindo ? 'bg-danger-soft text-danger-soft-fg' : 'text-brand',
                    )}
                  >
                    <Mic size={16} aria-hidden />
                    {ditado.ouvindo ? 'Ouvindo…' : 'Ditar'}
                  </button>
                ) : undefined
              }
            />

            {candidatosDeCitacao.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setPuxando((v) => !v)}
                  aria-expanded={puxando}
                  className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-brand tap-highlight-none"
                >
                  <History size={16} aria-hidden />
                  {puxando ? 'Fechar histórico' : 'Puxar do histórico'}
                </button>
                {puxando && (
                  <ul className="mt-2 space-y-1.5">
                    {candidatosDeCitacao.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            haptic('selection')
                            setCitacao(item.corpo ?? '')
                            setOcorridoEm(item.dia as IsoDate)
                            setPuxando(false)
                          }}
                          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm leading-snug tap-highlight-none active:bg-surface-3"
                        >
                          <span className="block text-2xs text-fg-subtle">
                            {formatarDataCurta(item.dia, hoje)} · {item.titulo}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block">{item.corpo}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <TextField
                label="Quem disse"
                value={fonteNome}
                onChange={setFonteNome}
                required={exigeProva}
                placeholder="Marcelo Silva"
              />
              <TextField
                label="Cargo"
                value={fonteCargo}
                onChange={setFonteCargo}
                required={exigeProva}
                placeholder="Gerente de Logística"
              />
            </div>

            <label className="block">
              <span className="text-sm font-medium text-fg-muted">Quando foi dito</span>
              <input
                type="date"
                value={ocorridoEm}
                max={hoje}
                onChange={(e) => setOcorridoEm(e.target.value as IsoDate)}
                className="mt-1.5 min-h-touch w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-fg outline-none focus:border-brand"
              />
            </label>
          </div>
        </section>

        {/* ── Banco SPIN de esta escala, con las usadas marcadas ─────────── */}
        <section>
          <h3 className="text-sm font-semibold">Perguntas para esta escala</h3>
          {/* El nombre COMPLETO de la categoría vive acá, en la ayuda, y no en
              el segmento: en el segmento no entra sin recortarse. */}
          <p className="mt-0.5 text-xs text-fg-muted">
            <span className="font-medium text-fg">{SPIN_CATEGORY_LABELS[categoria]}</span>{' '}
            {SPIN_CATEGORY_HINTS[categoria]}
          </p>
          <div className="mt-2">
            <SegmentedControl
              label="Categoria SPIN"
              size="sm"
              value={categoria}
              onChange={setCategoria}
              options={CATEGORIAS.map((c) => ({ value: c, label: ROTULO_CURTO[c] }))}
            />
          </div>
          <ul className="mt-2 space-y-1.5">
            {perguntas.map((q) => {
              const jaUsada = usadasSet.has(q.text.trim())
              return (
                <li key={q.text} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => copiarTexto(q.text, 'Pergunta')}
                    className={cx(
                      'flex min-h-touch flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm leading-snug tap-highlight-none active:bg-surface-3',
                      jaUsada && 'opacity-60 line-through decoration-fg-subtle',
                    )}
                  >
                    {q.text}
                  </button>
                  <button
                    type="button"
                    aria-pressed={jaUsada}
                    // Con la pregunta adentro: una fila por pregunta, y sin
                    // esto todas se llaman igual para un lector de pantalla.
                    aria-label={`${jaUsada ? 'Desmarcar' : 'Marcar'} como pergunta usada: ${q.text}`}
                    onClick={() => {
                      haptic('selection')
                      onAlternarPergunta(escala, q.text)
                    }}
                    className={cx(
                      'flex min-h-touch w-touch shrink-0 items-center justify-center rounded-lg border tap-highlight-none',
                      jaUsada
                        ? 'border-ok bg-ok-soft text-ok-soft-fg'
                        : 'border-border bg-surface-2 text-fg-subtle',
                    )}
                  >
                    <Check size={18} aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* ── Historial de la escala ────────────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold">Histórico desta escala</h3>
          {historicoDaEscala.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">
              Ninguém moveu {SCALE_LABELS[escala]} ainda neste aparelho. O primeiro movimento com
              citação vira a prova deste negócio.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {historicoDaEscala.map((m) => (
                <li key={m.id} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    <Chip size="sm" tone={m.para >= m.de ? 'ok' : 'atencao'}>
                      {m.de} → {m.para}
                    </Chip>
                    <span>{m.autor}</span>
                    <span aria-hidden>·</span>
                    <span>{formatarDataCurta(m.criado_em.slice(0, 10) as IsoDate, hoje)}</span>
                  </div>
                  {m.citacao && (
                    <p className="mt-1.5 text-sm italic leading-snug">“{m.citacao}”</p>
                  )}
                  {(m.fonte_nome ?? m.fonte_cargo) && (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {[m.fonte_nome, m.fonte_cargo].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}
