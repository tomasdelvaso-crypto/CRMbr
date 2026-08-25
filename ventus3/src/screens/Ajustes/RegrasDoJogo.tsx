// src/screens/Ajustes/RegrasDoJogo.tsx
// REGRAS DO JOGO — todas las reglas de puntaje, en una página.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTA PANTALLA NO ES OPCIONAL
// ══════════════════════════════════════════════════════════════════════════
// Un sistema de puntos cuyas reglas no se pueden leer es un sistema de puntos
// en el que no se confía, y un sistema en el que no se confía se juega para
// ganarle, no para vender. Esta página existe para que la pregunta «¿por qué
// me dio 3 y no 40?» se conteste sin preguntarle a nadie.
//
// Tres cosas se dicen explícitas porque son las que generan sospecha:
//   · el TECHO DIARIO por tipo, con su motivo (lo fácil de fabricar tiene
//     techo bajo; la conversa real y el avance con prueba no tienen),
//   · la REGLA DE LA PRUEBA: qué eventos no acreditan sin artefacto,
//   · que cambiar un peso EXIGE UNA VERSIÓN NUEVA y nunca es retroactivo —
//     lo impone un trigger en Postgres, no la buena voluntad de nadie.

import { AlertCircle, History, Lock, ScrollText } from 'lucide-react'
import {
  NIVEL_QUE_EXIGE_PROVA,
  PA_LIMIAR_DE_PROVA,
  formatarDataCurta,
  type RegraPA,
} from '@/core'
import { useRegrasDoJogo } from '@/data'
import { Badge, Card, Chip, Sheet, Skeleton } from '@/ui'

export function RegrasDoJogoSheet({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const consulta = useRegrasDoJogo()

  return (
    <Sheet
      open={aberto}
      onClose={aoFechar}
      title="Regras do jogo"
      description="Quanto vale cada coisa, por que tem teto e o que exige prova."
      snapPoints={[0.92]}
    >
      {consulta.isPending && !consulta.data ? (
        <Skeleton variant="lista" count={6} />
      ) : (
        <Conteudo regras={consulta.data?.vigentes ?? []} historico={consulta.data?.historico ?? []} />
      )}
    </Sheet>
  )
}

interface MudancaVisivel {
  evento: string
  versao: number
  pa: number
  validoDe: string
  validoAte: string | null
  descricao: string | null
  autor: string | null
}

function Conteudo({
  regras,
  historico,
}: {
  regras: readonly RegraPA[]
  historico: readonly MudancaVisivel[]
}) {
  return (
    <div className="flex flex-col gap-5 pb-4">
      <Card padding="md" accent="info">
        <div className="flex items-start gap-3">
          <Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-info" />
          <div>
            <p className="text-sm font-semibold">Mudar um peso nunca é retroativo.</p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">
              Cada regra tem versão e data de vigência. O que você já ganhou foi calculado com a
              regra que valia naquele dia, e nada recalcula para trás — isso é garantido por um
              gatilho no banco, não por combinação.
            </p>
          </div>
        </div>
      </Card>

      <section>
        <h3 className="flex items-center gap-2 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <ScrollText size={14} aria-hidden />
          Quanto vale cada coisa
        </h3>
        <Card padding="none">
          <ul>
            {regras.map((r, i) => (
              <li
                key={r.kind}
                className={i > 0 ? 'border-t border-border px-4 py-3' : 'px-4 py-3'}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 font-medium leading-snug">{r.rotulo}</p>
                  <p className="tnum shrink-0 text-lg font-bold text-brand">
                    {r.paMax ? `${r.pa}–${r.paMax}` : r.pa}
                    <span className="ml-1 text-xs font-medium text-fg-muted">PA</span>
                  </p>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {r.exigeProva && (
                    <Badge tone="atencao" variant="soft">
                      Exige prova
                    </Badge>
                  )}
                  {r.tetoDiario !== null ? (
                    <Badge tone="neutro" variant="soft">
                      Teto {r.tetoDiario} PA/dia
                    </Badge>
                  ) : (
                    <Badge tone="ok" variant="soft">
                      Sem teto
                    </Badge>
                  )}
                </div>
                {r.msgTeto && (
                  <p className="mt-1.5 text-xs leading-snug text-fg-subtle">
                    Ao bater o teto: «{r.msgTeto}».
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 px-1 text-xs leading-snug text-fg-muted">
          A ordem não é casual: em cima está o que só o cliente pode produzir; embaixo, o que dá
          para fabricar sozinho numa tarde. Por isso os tetos estão embaixo.
        </p>
      </section>

      <section>
        <h3 className="flex items-center gap-2 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <AlertCircle size={14} aria-hidden />
          A regra da prova
        </h3>
        <Card padding="md">
          <p className="text-sm leading-snug text-fg-muted">
            Um evento que vale <strong className="text-fg">{PA_LIMIAR_DE_PROVA} PA ou mais</strong>{' '}
            só acredita com artefato: a frase literal do cliente, o áudio da ligação, o e-mail.
            Uma escala acima do nível{' '}
            <strong className="text-fg">{NIVEL_QUE_EXIGE_PROVA}</strong> também.
          </p>
          <p className="mt-2 text-sm leading-snug text-fg-muted">
            Sem prova o evento não some — fica marcado como{' '}
            <Chip tone="atencao" size="sm">
              aguardando prova
            </Chip>{' '}
            e acredita no dia em que a prova aparecer. Não é desconfiança: é o que impede que o
            placar vire ficção e, com ele, o pipeline.
          </p>
        </Card>
      </section>

      <section>
        <h3 className="flex items-center gap-2 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <History size={14} aria-hidden />
          Histórico de mudanças
        </h3>
        <Card padding="md">
          {historico.length === 0 ? (
            <p className="text-sm leading-snug text-fg-muted">
              Nenhuma regra foi alterada desde o começo. Quando alguma mudar, ela aparece aqui
              com a data, o autor e o valor anterior.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {historico.map((m) => (
                <li key={`${m.evento}-${m.versao}`} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 font-medium leading-snug">{m.evento}</p>
                    <p className="tnum shrink-0 text-xs text-fg-muted">
                      v{m.versao} · {m.pa} PA
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-fg-subtle">
                    Vigente desde {formatarDataCurta(m.validoDe)}
                    {m.validoAte && ` até ${formatarDataCurta(m.validoAte)}`}
                    {m.autor && ` · alterado por ${m.autor}`}
                  </p>
                  {m.descricao && (
                    <p className="mt-1 text-xs leading-snug text-fg-muted">{m.descricao}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}
