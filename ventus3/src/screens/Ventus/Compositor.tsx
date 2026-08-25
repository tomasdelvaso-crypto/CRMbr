// src/screens/Ventus/Compositor.tsx
// El campo de escritura del chat, con el botón de micrófono.
//
// Tres detalles que existen por bugs reales de Android:
//
//  · enterKeyHint='send' — la tecla de retorno del teclado dice «enviar», no
//    «intro». Es una palabra, y decide si el vendedor manda o busca el botón.
//  · onKeyDown, NUNCA onKeyPress — onKeyPress está deprecado y en Gboard con
//    predicción activa no dispara de forma confiable. Es el motivo por el que
//    «no manda nada al apretar enter» en la mitad de los teléfonos.
//  · isComposing — Gboard y los teclados con IME emiten Enter mientras todavía
//    están componiendo la palabra. Mandar ahí corta la palabra por la mitad.
//
// El textarea crece hasta 5 líneas y después scrollea: una barra que empuja la
// pantalla entera cuando alguien pega tres párrafos es peor que una que scrollea.

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { Mic, Send, Square } from 'lucide-react'
import { cx, haptic } from '@/ui'
import { useDitado } from '@/ui'

export interface CompositorProps {
  valor: string
  onChange: (valor: string) => void
  onEnviar: () => void
  /** Hay un turno en vuelo: el botón pasa a «parar». */
  enviando: boolean
  onParar: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

/** Alto máximo del textarea: 5 líneas. Después scrollea. */
const MAX_LINHAS = 5

export function Compositor({
  valor,
  onChange,
  onEnviar,
  enviando,
  onParar,
  placeholder = 'Pergunte ou peça algo ao Ventus',
  autoFocus = false,
  className,
}: CompositorProps) {
  const campo = useRef<HTMLTextAreaElement>(null)

  // El dictado APPENDA, no reemplaza: el vendedor puede escribir media frase,
  // dictar el resto y corregir a mano.
  const ditado = useDitado((texto) => {
    onChange(valor === '' ? texto : `${valor} ${texto}`)
  })

  // Auto-alto. Se recalcula en cada cambio porque el valor puede venir del
  // dictado, de un atajo o de un pegado, no solo del teclado.
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    const linha = Number.parseFloat(getComputedStyle(el).lineHeight) || 24
    const teto = linha * MAX_LINHAS + 20
    el.style.height = `${String(Math.min(el.scrollHeight, teto))}px`
    el.style.overflowY = el.scrollHeight > teto ? 'auto' : 'hidden'
  }, [valor])

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return
    // Enter con Shift = línea nueva, como en todo chat.
    if (e.shiftKey) return
    // El IME todavía está componiendo: Enter cierra la palabra, no manda.
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    if (!enviando && valor.trim() !== '') onEnviar()
  }

  const podeEnviar = valor.trim() !== '' && !enviando

  return (
    <div
      className={cx(
        'flex items-end gap-2 rounded-2xl border border-border bg-surface p-1.5',
        className,
      )}
    >
      {ditado.suportado && (
        <button
          type="button"
          onClick={() => {
            haptic('impact')
            ditado.alternar()
          }}
          aria-label={ditado.ouvindo ? 'Parar de ditar' : 'Ditar'}
          aria-pressed={ditado.ouvindo}
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            ditado.ouvindo
              ? 'bg-danger text-danger-fg'
              : 'bg-surface-2 text-fg-muted active:bg-surface-3',
          )}
        >
          <Mic size={20} aria-hidden />
          {ditado.ouvindo && <span className="sr-only">Ouvindo</span>}
        </button>
      )}

      <label className="sr-only" htmlFor="ventus-compositor">
        Mensagem para o Ventus
      </label>
      <textarea
        id="ventus-compositor"
        ref={campo}
        value={valor}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        onKeyDown={aoTeclar}
        rows={1}
        placeholder={ditado.ouvindo ? 'Ouvindo…' : placeholder}
        autoFocus={autoFocus}
        enterKeyHint="send"
        inputMode="text"
        // 16px reales: por debajo, Safari en iOS hace zoom al enfocar y el
        // layout queda descuadrado para siempre.
        className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-fg outline-none placeholder:text-fg-subtle"
      />

      <button
        type="button"
        onClick={() => {
          haptic(enviando ? 'warning' : 'success')
          if (enviando) onParar()
          else if (podeEnviar) onEnviar()
        }}
        disabled={!enviando && !podeEnviar}
        aria-label={enviando ? 'Parar resposta' : 'Enviar'}
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
          enviando
            ? 'bg-surface-3 text-fg'
            : podeEnviar
              ? 'bg-brand text-brand-fg'
              : 'bg-surface-2 text-fg-subtle',
        )}
      >
        {enviando ? <Square size={18} aria-hidden /> : <Send size={18} aria-hidden />}
      </button>
    </div>
  )
}
