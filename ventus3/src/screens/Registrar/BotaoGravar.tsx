// src/screens/Registrar/BotaoGravar.tsx
// El botón de hold-to-talk. Es la puerta principal de entrada de datos de todo
// el CRM: si esto no es trivial, el CRM sigue vacío (18 interacciones en 5
// meses es el número que hay que mover).
//
// Tres cosas que parecen detalle y no lo son:
//
//  1. Hold Y trava. Se mantiene apretado y se suelta al terminar —el gesto de
//     WhatsApp, que todo el equipo ya tiene en el dedo. Pero si el toque duró
//     menos de 600 ms se interpreta como «tap para trabar» y sigue grabando
//     sin el dedo: dictar 90 segundos con el pulgar clavado es incómodo y hace
//     que el vendedor corte antes de terminar la idea.
//  2. setPointerCapture. Sin esto, arrastrar el dedo 3 px fuera del círculo
//     dispara pointerleave y corta la grabación a mitad de frase.
//  3. El waveform NO es decoración: es la única prueba de que está grabando.
//     Sin él la gente suelta a los dos segundos porque «no pasa nada».

import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Mic, Square, X } from 'lucide-react'
import { Button, Waveform, cx, haptic, prefersReducedMotion } from '@/ui'
import { MAX_SEGUNDOS, formatarSegundos, type EstadoGravacao } from './gravacao'

/** Menos que esto no fue un «hold»: fue un tap para trabar. */
const MS_PARA_TRAVAR = 600

export interface BotaoGravarProps {
  estado: EstadoGravacao
  segundos: number
  stream: MediaStream | null
  disponivel: boolean
  onIniciar: () => void
  onParar: () => void
  onCancelar: () => void
}

export function BotaoGravar({
  estado,
  segundos,
  stream,
  disponivel,
  onIniciar,
  onParar,
  onCancelar,
}: BotaoGravarProps) {
  const [pediuTrava, setPediuTrava] = useState(false)
  const inicioPressRef = useRef(0)
  const gravando = estado === 'gravando' || estado === 'permissao'
  const reduzido = prefersReducedMotion()

  // La traba se DERIVA del estado del grabador en vez de sincronizarse con un
  // efecto. Si la grabación terminó por cualquier vía (corte a los 3 minutos,
  // error del recorder), `travado` se apaga solo: un botón que dice «Toque
  // para parar» sin nada grabando es una mentira, y con un efecto esa mentira
  // dura un frame.
  const travado = pediuTrava && gravando

  const aoApertar = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!disponivel) return
    // Segundo toque sobre un botón trabado: parar y entregar.
    if (travado && estado === 'gravando') {
      haptic('success')
      setPediuTrava(false)
      onParar()
      return
    }
    setPediuTrava(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    inicioPressRef.current = Date.now()
    haptic('impact')
    onIniciar()
  }

  const aoSoltar = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!disponivel) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (inicioPressRef.current === 0) return
    const duracaoPress = Date.now() - inicioPressRef.current
    inicioPressRef.current = 0

    if (duracaoPress < MS_PARA_TRAVAR) {
      // Tap corto: queda grabando en modo manos libres.
      setPediuTrava(true)
      haptic('selection')
      return
    }
    haptic('success')
    onParar()
  }

  const aoTeclar = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (gravando) {
      setPediuTrava(false)
      onParar()
    } else {
      setPediuTrava(true)
      onIniciar()
    }
  }

  const progresso = Math.min(1, segundos / MAX_SEGUNDOS)
  const perto = segundos > MAX_SEGUNDOS - 20

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Contador y waveform ocupan el mismo alto siempre: si aparecieran al
          empezar a grabar, el botón saltaría bajo el dedo. */}
      <div className="flex h-24 w-full flex-col items-center justify-end gap-2">
        {gravando ? (
          <>
            <div
              className={cx(
                'tnum text-3xl font-bold tracking-tight',
                perto ? 'text-warn' : 'text-fg',
              )}
              aria-live="off"
            >
              {formatarSegundos(segundos)}
            </div>
            <Waveform stream={stream} active={estado === 'gravando'} bars={36} height={44} />
          </>
        ) : (
          <p className="pb-2 text-center text-sm text-fg-muted">
            {disponivel
              ? 'Segure e conte o que aconteceu.'
              : 'Este aparelho não grava áudio — use o teclado.'}
          </p>
        )}
      </div>

      <div className="relative">
        {/* Halo pulsante. Solo transform/opacity y apagado con reduced-motion. */}
        {estado === 'gravando' && !reduzido && (
          <span
            aria-hidden
            className="absolute inset-0 animate-pulse-soft rounded-full bg-danger/25"
            style={{ transform: 'scale(1.18)' }}
          />
        )}

        <button
          type="button"
          disabled={!disponivel}
          onPointerDown={aoApertar}
          onPointerUp={aoSoltar}
          onPointerCancel={(e) => {
            // El sistema robó el puntero (llamada entrante, notificación).
            // Se entrega lo grabado en vez de tirarlo.
            const desde = inicioPressRef.current
            if (desde !== 0) {
              inicioPressRef.current = 0
              if (Date.now() - desde > MS_PARA_TRAVAR) onParar()
              else setPediuTrava(true)
            }
            e.preventDefault()
          }}
          onContextMenu={(e) => {
            // El long-press de Android abre el menú de contexto encima del
            // botón justo cuando el vendedor está dictando.
            e.preventDefault()
          }}
          onKeyDown={aoTeclar}
          aria-label={
            gravando ? 'Parar de gravar e enviar' : 'Segure para gravar uma nota de voz'
          }
          aria-pressed={gravando}
          className={cx(
            'relative flex size-44 select-none items-center justify-center rounded-full',
            'tap-highlight-none transition-transform duration-150 ease-ios',
            'shadow-fab active:scale-95 disabled:opacity-40',
            estado === 'gravando'
              ? 'bg-danger text-danger-fg'
              : estado === 'permissao'
                ? 'bg-brand/70 text-brand-fg'
                : 'bg-brand text-brand-fg',
          )}
          style={{ touchAction: 'none' }}
        >
          {/* Anillo de progreso hacia el corte de 3 minutos. */}
          {estado === 'gravando' && (
            <svg
              className="pointer-events-none absolute inset-0 -rotate-90"
              viewBox="0 0 100 100"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeOpacity="0.85"
                strokeLinecap="round"
                strokeDasharray={`${String(progresso * 289)} 289`}
              />
            </svg>
          )}
          {estado === 'gravando' && travado ? (
            <Square size={56} fill="currentColor" aria-hidden />
          ) : (
            <Mic size={64} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>

      <div className="flex h-12 items-center gap-3">
        {gravando ? (
          <>
            <span className="text-sm font-medium text-fg-muted">
              {travado ? 'Toque para parar' : 'Solte para enviar'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<X size={16} aria-hidden />}
              hapticPattern="warning"
              onClick={() => {
                setPediuTrava(false)
                onCancelar()
              }}
            >
              Descartar
            </Button>
          </>
        ) : (
          <span className="text-xs text-fg-subtle">
            Toque rápido para gravar sem segurar · até 3 min
          </span>
        )}
      </div>
    </div>
  )
}
