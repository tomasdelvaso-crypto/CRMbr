// src/screens/GoldenHour/AcoesDoToque.tsx
// Los cuatro botones grandes y la nota de voz de 15 segundos.
//
// Ligou · Falou · Agendou · Passar. Nada más, y del tamaño del pulgar.
//
// Dos decisiones que hay que leer antes de «simplificar» esto:
//
// 1) «Falou» abre UNA fila de tres resultados (Interessado / Agora não / Sem
//    interesse) en el mismo lugar, sin sheet y sin navegación. Un tap más,
//    medio segundo. La alternativa —mandar todo como 'interested'— llenaría
//    la base de interesados falsos y mataría de raíz el único dato que la
//    Golden Hour produce y nadie más produce: qué contesta el mercado.
//
// 2) «Passar» NO registra touchpoint. Un contacto salteado que consumiera un
//    paso de la cadencia llegaría al TP7 —el de despedida— sin que nadie le
//    hubiera hablado nunca. El salto es información de la sesión, no del funil.

import { useState } from 'react'
import { CalendarCheck, Mic, PhoneCall, SkipForward, Voicemail } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TouchpointResult } from '@/core'
import { Waveform, cx, haptic } from '@/ui'
import { LIMITE_SEGUNDOS, type NotaDeVoz } from './useNotaDeVoz'

export interface AcoesDoToqueProps {
  /** Sin contacto en pantalla (fila terminada) todo queda apagado. */
  ativo: boolean
  onLigou: () => void
  onResultado: (resultado: TouchpointResult) => void
  onAgendou: () => void
  onPassar: () => void
  nota: NotaDeVoz
}

const RESULTADOS: ReadonlyArray<{ valor: TouchpointResult; rotulo: string; cor: string }> = [
  { valor: 'interested', rotulo: 'Interessado', cor: 'border-ok bg-ok-soft text-ok-soft-fg' },
  { valor: 'not_now', rotulo: 'Agora não', cor: 'border-warn bg-warn-soft text-warn-soft-fg' },
  {
    valor: 'not_interested',
    rotulo: 'Sem interesse',
    cor: 'border-border bg-surface-2 text-fg-muted',
  },
]

export function AcoesDoToque({
  ativo,
  onLigou,
  onResultado,
  onAgendou,
  onPassar,
  nota,
}: AcoesDoToqueProps) {
  // Al pasar al contacto siguiente la fila de resultados tiene que cerrarse:
  // si quedara abierta, el primer tap del contacto nuevo registraría el
  // resultado del anterior. Lo resuelve el `key` del padre —remonta este
  // componente por lead— en vez de un efecto que sincronice estado con estado.
  const [escolhendo, setEscolhendo] = useState(false)

  const gravando = nota.estado === 'gravando'

  return (
    <div className="shrink-0 px-4 pb-safe">
      {/* ── Nota de voz de 15s: entre un contacto y el siguiente ─────────── */}
      {nota.estado !== 'indisponivel' && (
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            aria-label={
              gravando ? 'Soltar para guardar a nota' : 'Segurar para gravar nota de 15 segundos'
            }
            aria-pressed={gravando}
            disabled={nota.estado === 'salvando'}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              haptic('impact')
              nota.comecar()
            }}
            onPointerUp={() => nota.parar()}
            onPointerCancel={() => nota.parar()}
            className={cx(
              'relative flex min-h-touch min-w-touch items-center justify-center overflow-hidden rounded-pill border tap-highlight-none',
              'transition-transform active:scale-95 motion-reduce:transition-none',
              gravando
                ? 'border-danger bg-danger text-danger-fg'
                : 'border-border bg-surface-2 text-fg-muted',
            )}
          >
            <Mic size={20} aria-hidden />
            {gravando && (
              <span
                className="absolute inset-x-0 bottom-0 h-1 origin-left bg-danger-fg/70"
                style={{ transform: `scaleX(${nota.progresso})` }}
              />
            )}
          </button>

          {gravando ? (
            <>
              <Waveform stream={nota.stream} active height={28} colorVar="--color-danger" className="flex-1" />
              <span className="tnum shrink-0 text-xs font-semibold text-danger">
                {Math.max(0, LIMITE_SEGUNDOS - Math.round(nota.progresso * LIMITE_SEGUNDOS))}s
              </span>
            </>
          ) : (
            <p className="flex-1 text-xs text-fg-subtle">
              {nota.estado === 'salvando'
                ? 'Guardando a nota…'
                : nota.estado === 'negado'
                  ? 'Microfone bloqueado. A hora segue sem notas de voz.'
                  : 'Segure para gravar 15s. Transcreve depois da hora.'}
            </p>
          )}
        </div>
      )}

      {/* ── Ligou · Falou · Agendou · Passar ──────────────────────────────── */}
      {escolhendo ? (
        <div className="grid grid-cols-3 gap-2">
          {RESULTADOS.map((r) => (
            <button
              key={r.valor}
              type="button"
              disabled={!ativo}
              onClick={() => {
                haptic('success')
                setEscolhendo(false)
                onResultado(r.valor)
              }}
              className={cx(
                'min-h-touch-lg rounded-xl border px-2 text-sm font-bold leading-tight tap-highlight-none',
                'transition-transform active:scale-95 motion-reduce:transition-none disabled:opacity-40',
                r.cor,
              )}
            >
              {r.rotulo}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setEscolhendo(false)}
            className="col-span-3 min-h-touch text-sm font-semibold text-fg-muted tap-highlight-none"
          >
            Voltar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <BotaoGrande
            rotulo="Ligou"
            nota="sem resposta"
            icone={<PhoneCall size={22} aria-hidden />}
            tom="border-border bg-surface-2 text-fg"
            ativo={ativo}
            onClick={() => {
              haptic('tap')
              onLigou()
            }}
          />
          <BotaoGrande
            rotulo="Falou"
            nota="conversa real"
            icone={<Voicemail size={22} aria-hidden />}
            tom="border-info bg-info-soft text-info-soft-fg"
            ativo={ativo}
            onClick={() => {
              haptic('selection')
              setEscolhendo(true)
            }}
          />
          <BotaoGrande
            rotulo="Agendou"
            nota="reunião marcada"
            icone={<CalendarCheck size={22} aria-hidden />}
            tom="border-ok bg-ok text-ok-fg"
            ativo={ativo}
            onClick={onAgendou}
          />
          <BotaoGrande
            rotulo="Passar"
            nota="não gasta toque"
            icone={<SkipForward size={22} aria-hidden />}
            tom="border-border bg-transparent text-fg-muted"
            ativo={ativo}
            onClick={() => {
              haptic('selection')
              onPassar()
            }}
          />
        </div>
      )}
    </div>
  )
}

function BotaoGrande({
  rotulo,
  nota,
  icone,
  tom,
  ativo,
  onClick,
}: {
  rotulo: string
  nota: string
  icone: ReactNode
  tom: string
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={!ativo}
      onClick={onClick}
      className={cx(
        'flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border font-bold tap-highlight-none',
        'transition-transform active:scale-[0.97] motion-reduce:transition-none disabled:opacity-40',
        tom,
      )}
    >
      <span className="flex items-center gap-2 text-base">
        {icone}
        {rotulo}
      </span>
      <span className="text-2xs font-medium opacity-70">{nota}</span>
    </button>
  )
}
