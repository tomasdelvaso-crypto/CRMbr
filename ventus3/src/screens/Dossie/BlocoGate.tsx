// src/screens/Dossie/BlocoGate.tsx
// «Para sair de Validação/Teste falta VALOR ≥ 6 (hoje 4)» — el bloque que le
// dice al vendedor, antes de entrar, qué tiene que salir a buscar hoy.
//
// Debajo van 2-3 perguntas SPIN de la escala que traba, elegidas por el nivel
// en que está (categoriaParaNivel: 0-1 situação, 2-4 problema, 5-7 implicação,
// 8-10 necessidade) y excluyendo las ya usadas con ESTE cliente. Un tap copia;
// el check las marca como usadas y eso SE PERSISTE — en el v2 ese estado se
// perdía al cerrar el modal y el vendedor repetía la misma pergunta.
//
// Cuando el gate está cumplido, el bloque cambia de cara: deja de pedir y
// ofrece avanzar. La validación real es del servidor, siempre.

import { Check, Copy } from 'lucide-react'
import {
  SCALE_LABELS,
  SPIN_CATEGORY_HINTS,
  SPIN_CATEGORY_LABELS,
  getStageName,
  questionsToAdvance,
  type GateFaltante,
  type ScaleKey,
  type ScaleScores,
  type StageId,
} from '@/core'
import { Button, Card, Chip, cx, haptic } from '@/ui'
import { copiarTexto } from './copiar'

export interface BlocoGateProps {
  etapa: StageId
  scores: ScaleScores
  gate: GateFaltante | null
  /** Perguntas ya usadas con este cliente, por escala. */
  usadas: readonly string[]
  /** Escala que traba, o la más débil cuando el gate ya pasó. */
  escalaFoco: ScaleKey
  bloqueado: boolean
  /**
   * El host ya dibuja «Avançar» abajo de todo. Este bloque no pinta el suyo:
   * dos botones para el mismo cambio de etapa es cómo alguien avanza dos
   * veces sin querer.
   */
  acaoNativa?: boolean
  onAlternarPergunta: (escala: ScaleKey, texto: string) => void
  onAvancarEtapa: () => void
  onAbrirEscala: (escala: ScaleKey) => void
}

export function BlocoGate({
  etapa,
  scores,
  gate,
  usadas,
  escalaFoco,
  bloqueado,
  acaoNativa = false,
  onAlternarPergunta,
  onAvancarEtapa,
  onAbrirEscala,
}: BlocoGateProps) {
  const nivel = scores[escalaFoco]
  const perguntas = questionsToAdvance(escalaFoco, nivel, usadas, 3)
  const proximaEtapa = getStageName((etapa + 1) as StageId)
  const usadasSet = new Set(usadas.map((t) => t.trim()))

  return (
    <div className="space-y-3">
      {gate ? (
        <Card accent="atencao">
          <p className="text-base font-semibold leading-snug text-balance">{gate.texto}</p>
          <p className="mt-1 text-sm text-fg-muted">
            Faltam {gate.falta} {gate.falta === 1 ? 'ponto' : 'pontos'} em{' '}
            {SCALE_LABELS[gate.escala]} — e o nível novo só vale com uma citação do cliente.
          </p>
          <Button
            className="mt-3"
            block
            variant="secondary"
            onClick={() => onAbrirEscala(gate.escala)}
          >
            Mover {SCALE_LABELS[gate.escala]} com evidência
          </Button>
        </Card>
      ) : (
        <Card accent="ok">
          <p className="text-base font-semibold leading-snug text-balance">
            {etapa >= 6
              ? 'Negócio fechado. Nada trava.'
              : `Nada trava a saída de ${getStageName(etapa) || 'esta etapa'}.`}
          </p>
          {etapa < 6 && (
            <>
              <p className="mt-1 text-sm text-fg-muted">
                As escalas já sustentam {proximaEtapa}. O servidor revalida na hora de salvar.
              </p>
              {!acaoNativa && (
                <Button className="mt-3" block variant="success" onClick={onAvancarEtapa}>
                  Avançar para {proximaEtapa}
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {etapa < 6 && perguntas.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Perguntas para subir {SCALE_LABELS[escalaFoco]}
            </h3>
            <Chip size="sm" tone={bloqueado ? 'atencao' : 'info'}>
              {SPIN_CATEGORY_LABELS[perguntas[0]?.category ?? 'situacao']}
            </Chip>
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            {SPIN_CATEGORY_HINTS[perguntas[0]?.category ?? 'situacao']}
          </p>

          <ul className="mt-2 space-y-2">
            {perguntas.map((q) => {
              const jaUsada = usadasSet.has(q.text.trim())
              return (
                <li key={q.text} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => copiarTexto(q.text, 'Pergunta')}
                    className={cx(
                      'flex min-h-touch flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm leading-snug',
                      'tap-highlight-none active:bg-surface-3',
                      jaUsada && 'opacity-60',
                    )}
                  >
                    <Copy size={15} aria-hidden className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">{q.text}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={jaUsada}
                    // La pregunta va DENTRO del nombre: hay una fila por
                    // pregunta y sin ella un lector de pantalla anuncia cinco
                    // botones idénticos, sin forma de saber cuál marca cuál.
                    aria-label={`${jaUsada ? 'Desmarcar' : 'Marcar'} como já perguntada: ${q.text}`}
                    onClick={() => {
                      haptic('selection')
                      onAlternarPergunta(escalaFoco, q.text)
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
        </div>
      )}
    </div>
  )
}
