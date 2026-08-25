// src/screens/GoldenHour/Fechamento.tsx
// El cierre de 60 segundos. No se puede saltear, y por eso tiene que ser corto.
//
// Sin debrief la hora es solo actividad. Con debrief es la única fuente
// sistemática de inteligencia de mercado que Ventapel va a tener: qué objeción
// aparece siempre con Venom, con qué argumento entra el E-comfill, a qué
// precio se cae la máquina. Por eso el sello Hora Cheia lo exige.
//
// «No salteable» no significa «trampa»: el botón de sellar se habilita cuando
// las tres preguntas están contestadas O cuando pasaron los 60 segundos. Nunca
// deja a nadie encerrado en su propia app.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Mic, X } from 'lucide-react'
import { CHANNEL_LABELS, TOUCHPOINT_RESULT_LABELS } from '@/core'
import { Button, Chip, cx, haptic } from '@/ui'
import { formatarRelogio, type Debrief, type ResumoSessao, type SessaoLocal } from './sessao'
import { LIMITE_SEGUNDOS, useNotaDeVoz } from './useNotaDeVoz'

/** Los 60 segundos del cierre. Cuenta desde que la pantalla se monta. */
const JANELA_MS = 60_000

interface Pergunta {
  chave: keyof Debrief
  texto: string
  opcoes: readonly string[]
}

const OBJECOES: readonly string[] = [
  'Preço',
  'Já tenho fornecedor',
  'Sem tempo agora',
  'Não é prioridade',
  'Precisa aprovação acima',
  'Ninguém atendeu',
]

const AMANHA: readonly string[] = [
  'Ligar mais cedo',
  'Mudar a abertura',
  'Levar caso de referência',
  'Focar em quem respondeu',
  'Subir a meta',
]

export interface FechamentoProps {
  sessao: SessaoLocal
  resumo: ResumoSessao
  vendor: string
  onResponder: (pergunta: keyof Debrief, resposta: string) => void
  onNotaDeVoz: (clientUuid: string) => void
  onSelar: (horaCheia: boolean) => void
}

export function Fechamento({
  sessao,
  resumo,
  vendor,
  onResponder,
  onNotaDeVoz,
  onSelar,
}: FechamentoProps) {
  const [restanteMs, setRestanteMs] = useState(JANELA_MS)
  const [gravandoPara, setGravandoPara] = useState<keyof Debrief | null>(null)

  // El arranque se toma dentro del efecto: leer el reloj durante el render
  // haría que dos renders del mismo estado dieran resultados distintos.
  useEffect(() => {
    const inicio = Date.now()
    const id = setInterval(() => {
      setRestanteMs(Math.max(0, JANELA_MS - (Date.now() - inicio)))
    }, 250)
    return () => clearInterval(id)
  }, [])

  const aoGravar = useCallback(
    (clientUuid: string) => {
      onNotaDeVoz(clientUuid)
      const alvo = gravandoPara
      setGravandoPara(null)
      if (alvo) onResponder(alvo, 'Respondido por áudio — transcreve ao sair')
    },
    [gravandoPara, onNotaDeVoz, onResponder],
  )

  const nota = useNotaDeVoz({ vendor, leadId: null, onGravada: aoGravar })

  const perguntas: readonly Pergunta[] = useMemo(
    () => [
      {
        chave: 'melhor_conversa',
        texto: 'Qual foi a melhor conversa?',
        opcoes:
          resumo.empresasComConversa.length > 0
            ? [...new Set(resumo.empresasComConversa)].slice(0, 5)
            : ['Nenhuma hoje'],
      },
      { chave: 'objecao_frequente', texto: 'Qual objeção apareceu mais?', opcoes: OBJECOES },
      { chave: 'o_que_muda', texto: 'O que muda amanhã?', opcoes: AMANHA },
    ],
    [resumo.empresasComConversa],
  )

  const cheia = resumo.avaliacao.cheia
  const podeSelar = resumo.debriefFeito || restanteMs <= 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 pb-3 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Fechamento</h2>
          <span className="tnum text-sm font-semibold text-fg-muted">
            {formatarRelogio(restanteMs)}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Sessenta segundos. É o que transforma a hora em informação.
        </p>
      </header>

      <div className="scroll-momentum min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* ── Resumen automático ─────────────────────────────────────────── */}
        <section className="grid grid-cols-4 gap-2" aria-label="Resumo do bloco">
          <Numero valor={resumo.toques} rotulo="toques" />
          <Numero valor={resumo.conversas} rotulo="conversas" destaque={resumo.conversas > 0} />
          <Numero valor={resumo.reunioes} rotulo="reuniões" destaque={resumo.reunioes > 0} />
          <Numero valor={Math.round(resumo.duracaoMin)} rotulo="minutos" />
        </section>

        {sessao.registros.length > 0 && (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {sessao.registros.slice(-5).reverse().map((r, i) => (
              <li key={`${r.leadId}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{r.empresa}</span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {CHANNEL_LABELS[r.canal]} · {TOUCHPOINT_RESULT_LABELS[r.resultado]}
                </span>
              </li>
            ))}
          </ul>
        )}

        {resumo.notasDeVoz > 0 && (
          <p className="mt-2 text-xs text-fg-subtle">
            {resumo.notasDeVoz} nota{resumo.notasDeVoz === 1 ? '' : 's'} de voz guardada
            {resumo.notasDeVoz === 1 ? '' : 's'} — transcrevem depois da hora, nunca durante.
          </p>
        )}

        {/* ── Las tres preguntas ─────────────────────────────────────────── */}
        <div className="mt-5 flex flex-col gap-5">
          {perguntas.map((p) => (
            <PerguntaDebrief
              key={p.chave}
              pergunta={p}
              valor={sessao.debrief[p.chave]}
              gravando={gravandoPara === p.chave && nota.estado === 'gravando'}
              progresso={nota.progresso}
              podeGravar={nota.estado !== 'indisponivel' && nota.estado !== 'negado'}
              onResponder={(v) => onResponder(p.chave, v)}
              onGravarInicio={() => {
                setGravandoPara(p.chave)
                haptic('impact')
                nota.comecar()
              }}
              onGravarFim={() => nota.parar()}
            />
          ))}
        </div>

        {/* ── El sello, con lo que falta escrito sin culpa ─────────────────── */}
        <section className="mt-6 rounded-card border border-border bg-surface p-4">
          <h3 className="text-sm font-bold">Hora Cheia</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {resumo.avaliacao.criterios.map((c) => (
              <li key={c.chave} className="flex items-center gap-2 text-sm">
                <span
                  className={cx(
                    'flex size-5 shrink-0 items-center justify-center rounded-pill',
                    c.ok ? 'bg-ok text-ok-fg' : 'bg-surface-3 text-fg-subtle',
                  )}
                  aria-hidden
                >
                  {c.ok ? <Check size={13} /> : <X size={13} />}
                </span>
                <span className={c.ok ? 'text-fg' : 'text-fg-muted'}>{c.rotulo}</span>
                <span className="ml-auto shrink-0 text-xs text-fg-subtle">{c.detalhe}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="shrink-0 border-t border-border px-4 pb-safe pt-3">
        <Button
          block
          size="lg"
          variant={cheia ? 'success' : 'primary'}
          disabled={!podeSelar}
          hapticPattern={cheia ? 'celebration' : 'success'}
          onClick={() => onSelar(cheia)}
        >
          {cheia ? 'Selar a Hora Cheia' : 'Encerrar a hora'}
        </Button>
        <p className="mt-2 text-center text-xs text-fg-subtle">
          {podeSelar
            ? resumo.avaliacao.texto
            : 'Responda as três perguntas — ou espere os 60 segundos.'}
        </p>
      </div>
    </div>
  )
}

function Numero({
  valor,
  rotulo,
  destaque = false,
}: {
  valor: number
  rotulo: string
  destaque?: boolean
}) {
  return (
    <p className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-center">
      <span
        className={cx('tnum block text-2xl font-bold leading-none', destaque ? 'text-ok' : 'text-fg')}
      >
        {valor}
      </span>
      <span className="mt-1 block text-2xs text-fg-subtle">{rotulo}</span>
    </p>
  )
}

function PerguntaDebrief({
  pergunta,
  valor,
  gravando,
  progresso,
  podeGravar,
  onResponder,
  onGravarInicio,
  onGravarFim,
}: {
  pergunta: Pergunta
  valor: string
  gravando: boolean
  progresso: number
  podeGravar: boolean
  onResponder: (valor: string) => void
  onGravarInicio: () => void
  onGravarFim: () => void
}) {
  return (
    <section>
      <h3 className="text-sm font-bold">{pergunta.texto}</h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {pergunta.opcoes.map((o) => (
          <Chip
            key={o}
            tone="marca"
            selected={valor === o}
            onClick={() => {
              haptic('selection')
              onResponder(valor === o ? '' : o)
            }}
          >
            {o}
          </Chip>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={valor}
          onChange={(e) => onResponder(e.target.value)}
          placeholder="ou escreva em uma linha"
          // 16px exactos: por debajo de eso, iOS hace zoom al enfocar el campo
          // y descoloca toda la pantalla.
          className="min-h-touch min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none"
        />
        {podeGravar && (
          <button
            type="button"
            aria-label={`Responder por voz: ${pergunta.texto}`}
            aria-pressed={gravando}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              onGravarInicio()
            }}
            onPointerUp={onGravarFim}
            onPointerCancel={onGravarFim}
            className={cx(
              'relative flex size-touch shrink-0 items-center justify-center overflow-hidden rounded-lg border tap-highlight-none',
              gravando
                ? 'border-danger bg-danger text-danger-fg'
                : 'border-border bg-surface-2 text-fg-muted',
            )}
          >
            <Mic size={18} aria-hidden />
            {gravando && (
              <>
                <span
                  className="absolute inset-x-0 bottom-0 h-1 origin-left bg-danger-fg/70"
                  style={{ transform: `scaleX(${progresso})` }}
                />
                <span className="sr-only">
                  Gravando, máximo {LIMITE_SEGUNDOS} segundos
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </section>
  )
}
