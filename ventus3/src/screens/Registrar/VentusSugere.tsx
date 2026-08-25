// src/screens/Registrar/VentusSugere.tsx
// «Ventus sugere»: los deltas PPVVCC propuestos, cada uno con LA CITA que lo
// justifica, y accept/edit/dismiss POR ESCALA.
//
// Por qué por escala y no por bloque entero: una nota de voz típica mueve dos
// o tres escalas y casi siempre acierta una y exagera otra. Con un solo botón
// «aceitar tudo», el vendedor que ve un número inflado rechaza el bloque
// completo y se pierden también los aciertos; con el botón invertido, acepta
// todo sin mirar y el health vuelve a ser opinión. Es la misma lógica de la
// bandeja Revisão, adelantada al momento en que el contexto todavía está
// fresco en la cabeza del vendedor.
//
// La cita NO es adorno: es la evidencia que va a `scale_evidence`. Sin cita,
// `atualizarEscala()` lanza ErroRegraDaProva por encima del nivel 5 y el CHECK
// de Postgres rechaza el INSERT. Por eso el editor no deja vaciarla.

import { useState } from 'react'
import { Check, Pencil, Quote, Sparkles, X } from 'lucide-react'
import {
  EVIDENCE_REQUIRED_ABOVE,
  SCALE_LABELS,
  getScaleDefinition,
  type ScaleKey,
} from '@/core'
import { Badge, Button, Card, Sheet, Stepper, TextArea, TextField, cx, haptic } from '@/ui'
import type { EstadoProposta, PropostaEscala } from './rascunho'

export interface VentusSugereProps {
  propostas: readonly PropostaEscala[]
  onEstado: (escala: ScaleKey, estado: EstadoProposta) => void
  onEditar: (escala: ScaleKey, para: number, citacao: string, fonte: string | null) => void
}

export function VentusSugere({ propostas, onEstado, onEditar }: VentusSugereProps) {
  const [emEdicao, setEmEdicao] = useState<PropostaEscala | null>(null)

  if (propostas.length === 0) return null

  const aceitas = propostas.filter((p) => p.estado === 'aceita').length

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-fg-subtle">
          <Sparkles size={14} aria-hidden />
          Ventus sugere
        </h3>
        {aceitas > 0 && (
          <Badge tone="marca" variant="soft">
            {aceitas} de {propostas.length}
          </Badge>
        )}
      </header>

      <p className="text-xs text-fg-muted">
        Cada escala é uma decisão sua. O que você aceitar vira evidência com a citação.
      </p>

      {propostas.map((p) => (
        <LinhaProposta
          key={p.escala}
          proposta={p}
          onEstado={onEstado}
          onEditar={() => {
            setEmEdicao(p)
          }}
        />
      ))}

      {/* `key` por escala: el editor se REMONTA con cada propuesta y arranca
          con sus valores en el useState inicial. Sincronizar los tres campos
          con un efecto encadena un render extra por apertura y deja un frame
          con los datos de la escala anterior. */}
      {emEdicao && (
        <EditorDeProposta
          key={emEdicao.escala}
          proposta={emEdicao}
          onFechar={() => {
            setEmEdicao(null)
          }}
          onSalvar={(para, citacao, fonte) => {
            onEditar(emEdicao.escala, para, citacao, fonte)
            setEmEdicao(null)
          }}
        />
      )}
    </section>
  )
}

/* ── Una escala ────────────────────────────────────────────────────────── */

function LinhaProposta({
  proposta,
  onEstado,
  onEditar,
}: {
  proposta: PropostaEscala
  onEstado: (escala: ScaleKey, estado: EstadoProposta) => void
  onEditar: () => void
}) {
  const p = proposta
  const dispensada = p.estado === 'dispensada'
  const aceita = p.estado === 'aceita'
  const definicao = getScaleDefinition(p.escala, p.para)

  return (
    <Card
      padding="sm"
      accent={aceita ? 'ok' : undefined}
      className={cx('transition-opacity', dispensada && 'opacity-50')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{SCALE_LABELS[p.escala]}</p>
          <p className="tnum mt-0.5 flex items-center gap-1.5 text-lg font-bold">
            <span className="text-fg-subtle">{p.de ?? 0}</span>
            <span aria-hidden className="text-fg-subtle">
              →
            </span>
            <span className={aceita ? 'text-ok' : 'text-brand'}>{p.para}</span>
            {p.editada && (
              <Badge tone="info" variant="soft">
                editado
              </Badge>
            )}
          </p>
        </div>
        <span className="tnum shrink-0 pt-1 text-xs text-fg-subtle">
          {Math.round(p.confianca * 100)}%
        </span>
      </div>

      {/* La cita textual. Es lo que convierte un número en una prueba. */}
      <blockquote className="mt-2 flex gap-2 rounded-md bg-surface-2 px-2.5 py-2">
        <Quote size={14} aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
        <span className="min-w-0 text-sm italic leading-snug text-fg-muted">
          {p.citacao}
          {p.fonte && <span className="mt-1 block not-italic text-xs">— {p.fonte}</span>}
        </span>
      </blockquote>

      {definicao && (
        <p className="mt-1.5 text-xs text-fg-subtle">Nível {p.para}: {definicao.text}</p>
      )}

      <div className="mt-2.5 flex gap-2">
        <Button
          size="sm"
          variant={aceita ? 'success' : 'secondary'}
          icon={<Check size={16} aria-hidden />}
          hapticPattern="success"
          onClick={() => {
            onEstado(p.escala, aceita ? 'pendente' : 'aceita')
          }}
        >
          {aceita ? 'Aceito' : 'Aceitar'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Pencil size={16} aria-hidden />}
          onClick={() => {
            haptic('tap')
            onEditar()
          }}
        >
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<X size={16} aria-hidden />}
          onClick={() => {
            haptic('tap')
            onEstado(p.escala, dispensada ? 'pendente' : 'dispensada')
          }}
        >
          {dispensada ? 'Voltar' : 'Descartar'}
        </Button>
      </div>
    </Card>
  )
}

/* ── Editor de una propuesta ───────────────────────────────────────────── */

function EditorDeProposta({
  proposta,
  onFechar,
  onSalvar,
}: {
  proposta: PropostaEscala
  onFechar: () => void
  onSalvar: (para: number, citacao: string, fonte: string | null) => void
}) {
  const [nivel, setNivel] = useState(proposta.para)
  const [citacao, setCitacao] = useState(proposta.citacao)
  const [fonte, setFonte] = useState(proposta.fonte ?? '')

  const definicao = getScaleDefinition(proposta.escala, nivel)
  const exigeProva = nivel > EVIDENCE_REQUIRED_ABOVE
  const semProva = citacao.trim() === ''
  const bloqueado = exigeProva && semProva

  return (
    <Sheet
      open
      onClose={onFechar}
      title={SCALE_LABELS[proposta.escala]}
      description="A citação é o que sustenta o número. Sem ela, acima de 5 não passa."
      snapPoints={[0.75, 0.95]}
      footer={
        <Button
          block
          size="lg"
          disabled={bloqueado}
          hapticPattern="success"
          onClick={() => {
            onSalvar(nivel, citacao.trim(), fonte.trim() === '' ? null : fonte.trim())
          }}
        >
          {bloqueado ? 'Falta a citação' : 'Salvar e aceitar'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <Stepper
          label="Nível"
          value={nivel}
          onChange={setNivel}
          min={0}
          max={10}
          levelText={definicao?.text}
          tone={exigeProva && semProva ? 'perigo' : 'marca'}
        />

        <TextArea
          label="Citação do cliente"
          required
          value={citacao}
          onChange={setCitacao}
          rows={4}
          placeholder="O que ele disse, com as palavras dele"
          error={bloqueado ? 'Acima do nível 5 a citação é obrigatória.' : null}
          hint="Palavras do cliente, não o seu resumo."
        />

        <TextField
          label="Quem disse"
          value={fonte}
          onChange={setFonte}
          placeholder="Marcelo, comprador"
          enterKeyHint="done"
          hint="Sem fonte não é prova, é opinião."
        />
      </div>
    </Sheet>
  )
}
