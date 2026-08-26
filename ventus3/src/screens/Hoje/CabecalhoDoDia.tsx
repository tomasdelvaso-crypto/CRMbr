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
//
// EN TELÉFONOS CORTOS EL BLOQUE SE PARTE EN DOS. Los anéis —«dónde estoy»— se
// quedan arriba, más chicos; la explicación de la largada y la faixa de la
// racha bajan DEBAJO de las tres tarjetas, junto a la corrente del time. La
// regla es «arriba, estado y acción; abajo, explicación y motivación»: en un
// iPhone de 664 px esos dos bloques valían 132 px que se comían la primera
// tarjeta, que es la única cosa de esta pantalla que hay que hacer AHORA. En
// un teléfono largo nada de esto se activa y el orden es el de siempre.

import { Flame, Shield, Snowflake } from 'lucide-react'
import type { EstadoSequencia, RingKey, RingProgress } from '@/core'
import { RingTrio, Skeleton, cx } from '@/ui'

export interface CabecalhoDoDiaProps {
  aneis: Record<RingKey, RingProgress> | undefined
  largada: number
  sequencia: EstadoSequencia | undefined
  carregando: boolean
  /** Teléfono corto: sólo los anéis, y más chicos. Ver el encabezado. */
  compacto?: boolean
  /**
   * ¿La explicación de la largada y la faixa de la racha van ACÁ DENTRO?
   *
   * En escritorio no: viven en la columna secundaria de la derecha, junto a
   * la corrente do time (ver Hoje/index.tsx). Es el mismo reparto que hace
   * `compacto` en un teléfono corto —arriba estado y acción, aparte
   * explicación y motivación— pero sin achicar los anéis, porque en un
   * monitor el problema nunca fue el alto.
   */
  comContexto?: boolean
}

export function CabecalhoDoDia({
  aneis,
  largada,
  sequencia,
  carregando,
  compacto = false,
  comContexto = true,
}: CabecalhoDoDiaProps) {
  if (carregando || !aneis) {
    return (
      <div className={compacto ? 'pt-2' : 'pt-4'}>
        <Skeleton variant="aneis" />
      </div>
    )
  }

  return (
    <section aria-label="Progresso de hoje" className={compacto ? 'pt-2' : 'pt-4'}>
      <RingTrio
        size={compacto ? 56 : 82}
        contato={{ value: aneis.contato.current, max: aneis.contato.goal }}
        conversa={{ value: aneis.conversa.current, max: aneis.conversa.goal }}
        avanco={{ value: aneis.avanco.current, max: aneis.avanco.goal }}
      />

      {!compacto && comContexto && <ContextoDoDia largada={largada} sequencia={sequencia} />}
    </section>
  )
}

export interface ContextoDoDiaProps {
  largada: number
  sequencia: EstadoSequencia | undefined
  className?: string
}

/**
 * La explicación de la largada y la faixa de la racha.
 *
 * Sale del cabezal para poder pintarse en otro lugar sin duplicarse: dentro
 * del bloque de arriba en un teléfono largo, debajo de las tres tarjetas en uno
 * corto. Lo que dice es idéntico en los dos casos.
 */
export function ContextoDoDia({ largada, sequencia, className }: ContextoDoDiaProps) {
  if (largada <= 0 && !sequencia) return null
  return (
    <div className={className}>
      {largada > 0 && (
        <p className="mt-2 text-center text-2xs text-fg-subtle">
          {largada} contatos de largada por conferir a agenda e revisar as prioridades.
        </p>
      )}
      {sequencia && <FaixaDaSequencia sequencia={sequencia} />}
    </div>
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
