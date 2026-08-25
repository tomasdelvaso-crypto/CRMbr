// src/screens/Hoje/CabecalhoDoDia.tsx
// Los 3 anéis del día + la racha de Golden Hour.
//
// Dos reglas del PLANO viven acá y no se negocian:
//
//  1. LARGADA DOTADA: el anel de Contato arranca en 2/12, regalados por
//     confirmar la agenda y revisar las prioridades. La meta se presenta como
//     12 y no como 10 para que el regalo sea real, y se dice en voz alta
//     («2 de largada») porque un regalo que no se ve no regala nada.
//
//  2. LA RACHA NUNCA MUESTRA 0. Si se rompió, muestra el resgate. El día que
//     alguien ve un 0 después de 14 días es el día que deja de usar el
//     sistema; estadoDaSequencia() ya devuelve el texto correcto, acá solo se
//     pinta.

import { Flame, Shield, Snowflake } from 'lucide-react'
import type { EstadoSequencia, RingKey, RingProgress } from '@/core'
import { RingTrio, Skeleton, cx } from '@/ui'

export interface CabecalhoDoDiaProps {
  aneis: Record<RingKey, RingProgress> | undefined
  largada: number
  sequencia: EstadoSequencia | undefined
  carregando: boolean
}

export function CabecalhoDoDia({
  aneis,
  largada,
  sequencia,
  carregando,
}: CabecalhoDoDiaProps) {
  if (carregando || !aneis) {
    return (
      <div className="pt-4">
        <Skeleton variant="aneis" />
      </div>
    )
  }

  return (
    <section aria-label="Progresso de hoje" className="pt-4">
      <RingTrio
        size={82}
        contato={{ value: aneis.contato.current, max: aneis.contato.goal }}
        conversa={{ value: aneis.conversa.current, max: aneis.conversa.goal }}
        avanco={{ value: aneis.avanco.current, max: aneis.avanco.goal }}
      />

      {largada > 0 && (
        <p className="mt-2 text-center text-2xs text-fg-subtle">
          {largada} contatos de largada por conferir a agenda e revisar as prioridades.
        </p>
      )}

      {sequencia && <FaixaDaSequencia sequencia={sequencia} />}
    </section>
  )
}

/** La llama, los días y los escudos. Nunca un 0 pelado. */
function FaixaDaSequencia({ sequencia }: { sequencia: EstadoSequencia }) {
  const emResgate = sequencia.resgate !== null
  const nuncaComecou = sequencia.dias === 0 && !emResgate

  return (
    <div
      className={cx(
        'mt-3 flex items-center gap-3 rounded-card border px-3.5 py-3',
        emResgate ? 'border-warn-soft bg-warn-soft' : 'border-border bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-pill',
          nuncaComecou ? 'bg-surface-2 text-fg-subtle' : 'bg-streak/15 text-streak',
        )}
      >
        <Flame size={20} />
      </span>

      <div className="min-w-0 flex-1">
        {emResgate ? (
          <>
            <p className="text-sm font-semibold text-warn-soft-fg">
              Resgate disponível até {sequencia.resgate?.ate}
            </p>
            <p className="text-xs text-warn-soft-fg">
              Uma Hora Cheia e um avanço real trazem a sequência de volta para{' '}
              {sequencia.resgate?.restauraPara}.
            </p>
          </>
        ) : nuncaComecou ? (
          <>
            <p className="text-sm font-semibold text-fg">Sua sequência começa hoje</p>
            <p className="text-xs text-fg-muted">
              Uma Hora Cheia completa sela o primeiro dia útil.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-fg">
              <span className="tnum">{sequencia.exibicao}</span>{' '}
              {sequencia.exibicao === 1 ? 'dia útil' : 'dias úteis'} de Hora Cheia
            </p>
            <p className="text-xs text-fg-muted">
              {sequencia.proximoMarco
                ? `Faltam ${sequencia.proximoMarco.faltam} para o marco de ${sequencia.proximoMarco.marco}.`
                : 'Sequência recorde. Siga assim.'}
            </p>
          </>
        )}

        {sequencia.avisoDeEscudo && (
          <p className="mt-1 flex items-center gap-1 text-2xs text-info">
            <Snowflake size={12} aria-hidden />
            {sequencia.avisoDeEscudo}
          </p>
        )}
      </div>

      <Escudos quantidade={sequencia.escudosRestantes} />
    </div>
  )
}

/** Los escudos son GANADOS, nunca comprados. Se muestran incluso en cero. */
function Escudos({ quantidade }: { quantidade: number }) {
  const total = 2
  return (
    <span
      className="flex shrink-0 items-center gap-0.5"
      aria-label={`${quantidade} de ${total} escudos disponíveis`}
    >
      {Array.from({ length: total }, (_, i) => (
        <Shield
          key={i}
          size={16}
          aria-hidden
          className={i < quantidade ? 'text-info' : 'text-fg-subtle/35'}
          fill={i < quantidade ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}
