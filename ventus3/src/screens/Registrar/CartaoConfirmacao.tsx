// src/screens/Registrar/CartaoConfirmacao.tsx
// La tarjeta de confirmación: todo lo que el Ventus entendió, en chips que se
// editan tocándolos, y el gate de próxima acción con BOTONES de fecha.
//
// El orden de arriba hacia abajo no es estético, es el orden en que se decide:
//   1. cliente        — si esto está mal, todo lo demás está mal
//   2. tipo           — un toque, ya viene elegido
//   3. o que aconteceu — se lee, casi nunca se edita
//   4. resultado      — un toque
//   5. PRÓXIMA AÇÃO   — el gate. Es lo único que no se puede saltear.
//   6. Ventus sugere  — opcional, por escala
//   7. contatos       — opcional
//
// El gate va ANTES de las sugerencias a propósito: es lo que más impacto tiene
// por línea de código de todo el plan (43% de las respuestas del bot quedaron
// 'next_action_incomplete' porque la fecha se pedía en texto libre), y tiene
// que estar por encima del pliegue, no enterrado bajo un bloque opcional.

import { AlertTriangle, Building2, CloudOff, Pencil, Sparkles } from 'lucide-react'
import { ACTIVITY_RESULT_LABELS, ACTIVITY_TYPE_CONFIG, type ActivityResult } from '@/core'
import type { AlvoRegistro } from '@/data'
import {
  Badge,
  Card,
  Chip,
  DatePills,
  TextArea,
  TextField,
  cx,
  formatBrlCompacto,
  haptic,
} from '@/ui'
import { BotoesDesambiguacao } from './SeletorDeAlvo'
import { ContatosDetectados } from './ContatosDetectados'
import { VentusSugere } from './VentusSugere'
import {
  RESULTADOS_OFERECIDOS,
  TIPOS_OFERECIDOS,
  faltantes,
  type AcaoRascunho,
  type PropostaContato,
  type Rascunho,
} from './rascunho'

export interface CartaoConfirmacaoProps {
  rascunho: Rascunho
  alvos: readonly AlvoRegistro[]
  despachar: (acao: AcaoRascunho) => void
  onAbrirBusca: () => void
  onEscolherAlvo: (alvo: AlvoRegistro) => void
  /** Contacto que la oportunidad elegida ya tiene en ese papel. */
  valorAtualDoContato: (papel: PropostaContato['papel']) => string | null
  /** Muestra la transcripción completa bajo el resumo. */
  transcricaoAberta: boolean
  onAlternarTranscricao: () => void
}

export function CartaoConfirmacao({
  rascunho: r,
  alvos,
  despachar,
  onAbrirBusca,
  onEscolherAlvo,
  valorAtualDoContato,
  transcricaoAberta,
  onAlternarTranscricao,
}: CartaoConfirmacaoProps) {
  const falta = faltantes(r)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Avisos de contexto ─────────────────────────────────────────── */}
      {r.pendenteDeTranscricao && (
        <Card padding="sm" accent="atencao">
          <p className="flex items-start gap-2 text-sm">
            <CloudOff size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
            <span>
              <strong className="block">Registro pendente de transcrição.</strong>
              O áudio está salvo no aparelho e sobe sozinho quando voltar a rede. Confirme o
              essencial agora — nada se perde.
            </span>
          </p>
        </Card>
      )}

      {r.simulado && (
        <Card padding="sm" accent="info">
          <p className="flex items-start gap-2 text-sm">
            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong className="block">Modo simulado.</strong>
              O /api/ingest ainda não está no ar: isto é um exemplo, não a sua gravação.
            </span>
          </p>
        </Card>
      )}

      {r.aviso && !r.simulado && !r.pendenteDeTranscricao && (
        <p className="text-sm text-warn-soft-fg">{r.aviso}</p>
      )}

      {/* ── 1 · Cliente ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        {r.alvo ? (
          <button
            type="button"
            onClick={() => {
              haptic('tap')
              onAbrirBusca()
            }}
            className={cx(
              'flex min-h-touch-lg w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left',
              'tap-highlight-none transition-transform duration-150 ease-ios active:scale-[0.98]',
              'border-border bg-surface',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
              <Building2 size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold">{r.alvo.nome}</span>
              <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                {r.alvo.detalhe}
                {r.alvo.valor !== null && (
                  <span className="tnum">· {formatBrlCompacto(r.alvo.valor)}</span>
                )}
              </span>
            </span>
            <Pencil size={16} aria-hidden className="shrink-0 text-fg-subtle" />
          </button>
        ) : (
          <BotoesDesambiguacao
            candidatos={r.candidatos}
            alvos={alvos}
            onEscolher={onEscolherAlvo}
            onBuscar={onAbrirBusca}
          />
        )}
      </section>

      {/* ── 2 · Tipo ────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg-muted">Tipo</h3>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar no-overscroll">
          {TIPOS_OFERECIDOS.map((t) => (
            <Chip
              key={t}
              size="md"
              selected={r.tipo === t}
              tone={r.tipo === t ? 'marca' : 'neutro'}
              onClick={() => {
                haptic('selection')
                despachar({ tipo: 'tipoAtividade', valor: t })
              }}
            >
              {ACTIVITY_TYPE_CONFIG[t].label}
            </Chip>
          ))}
        </div>
      </section>

      {/* ── 3 · O que aconteceu ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <TextArea
          label="O que aconteceu"
          required
          value={r.resumo}
          onChange={(v) => {
            despachar({ tipo: 'resumo', valor: v })
          }}
          rows={4}
          maxLength={2000}
          placeholder={
            r.pendenteDeTranscricao
              ? 'Opcional: a transcrição chega depois'
              : 'Resumo do que foi conversado'
          }
          error={falta.resumo ? 'Escreva uma linha sobre o que aconteceu.' : null}
        />
        {r.transcricao && (
          <div>
            <button
              type="button"
              onClick={onAlternarTranscricao}
              className="min-h-touch text-sm font-medium text-brand tap-highlight-none"
            >
              {transcricaoAberta ? 'Ocultar transcrição' : 'Ver transcrição completa'}
            </button>
            {transcricaoAberta && (
              <p className="mt-1 rounded-md bg-surface-2 p-3 text-sm italic leading-snug text-fg-muted">
                {r.transcricao}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 4 · Resultado ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg-muted">Resultado</h3>
        <div className="flex flex-wrap gap-2">
          {RESULTADOS_OFERECIDOS.map((res) => (
            <Chip
              key={res}
              size="md"
              selected={r.resultado === res}
              tone={toneDoResultado(res, r.resultado === res)}
              onClick={() => {
                haptic('selection')
                despachar({ tipo: 'resultado', valor: r.resultado === res ? null : res })
              }}
            >
              {ACTIVITY_RESULT_LABELS[res]}
            </Chip>
          ))}
        </div>
      </section>

      {/* ── 5 · O GATE ──────────────────────────────────────────────────── */}
      <section
        className={cx(
          'flex flex-col gap-3 rounded-card border p-3',
          falta.proximaAcao || falta.data
            ? 'border-danger/40 bg-danger-soft/40'
            : 'border-ok/40 bg-ok-soft/30',
        )}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Próxima ação</h3>
          {r.dataSugerida && (
            <Badge tone="marca" variant="soft">
              <Sparkles size={12} aria-hidden /> sugerido
            </Badge>
          )}
        </div>

        <TextField
          label="O que você vai fazer"
          hideLabel
          required
          value={r.proximaAcao}
          onChange={(v) => {
            despachar({ tipo: 'proximaAcao', valor: v })
          }}
          placeholder="Ligar para o Marcelo e confirmar o teste"
          enterKeyHint="done"
          maxLength={200}
          error={falta.proximaAcao ? 'Sem próxima ação isto não fecha.' : null}
        />

        {/* Botones, NUNCA texto libre: es el arreglo de mayor impacto del plan. */}
        <DatePills
          label="Quando"
          required
          value={r.proximaAcaoData}
          onChange={(iso) => {
            despachar({ tipo: 'proximaAcaoData', valor: iso })
          }}
        />
      </section>

      {/* ── 6 · Ventus sugere ───────────────────────────────────────────── */}
      <VentusSugere
        propostas={r.escalas}
        onEstado={(escala, estado) => {
          despachar({ tipo: 'escalaEstado', escala, estado })
        }}
        onEditar={(escala, para, citacao, fonte) => {
          despachar({ tipo: 'escalaEditar', escala, para, citacao, fonte })
        }}
      />

      {/* ── 7 · Contatos ────────────────────────────────────────────────── */}
      <ContatosDetectados
        contatos={r.contatos}
        valorAtual={valorAtualDoContato}
        aplicavel={r.alvo?.kind === 'opportunity'}
        onEstado={(papel, estado) => {
          despachar({ tipo: 'contatoEstado', papel, estado })
        }}
      />

      {r.sinais.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg-subtle">
            Sinais de compra
          </h3>
          <ul className="flex flex-col gap-1">
            {r.sinais.map((s) => (
              <li key={s} className="text-sm text-fg-muted">
                · {s}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function toneDoResultado(res: ActivityResult, selecionado: boolean) {
  if (!selecionado) return 'neutro' as const
  if (res === 'positivo') return 'ok' as const
  if (res === 'negativo') return 'perigo' as const
  if (res === 'pendente') return 'atencao' as const
  return 'info' as const
}
