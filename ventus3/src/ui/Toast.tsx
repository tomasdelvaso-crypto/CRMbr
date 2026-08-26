// src/ui/Toast.tsx
// Host de toasts. Se monta UNA vez en el Shell. Los toasts se disparan con
// `toast()` desde cualquier módulo (ver toast-store.ts).
//
// Se apoya por encima de la bottom nav y del home indicator (--toast-bottom).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Info, Undo2, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx, prefersReducedMotion } from './utils'
import { haptic } from './haptic'
import { TONE_SOFT, type Tone } from './tokens'
import { dismissToast, subscribeToasts, type ToastItem } from './toast-store'

const ICONES: Readonly<Record<Tone, LucideIcon>> = {
  neutro: Info,
  marca: Info,
  info: Info,
  ok: Check,
  atencao: AlertTriangle,
  perigo: XCircle,
  destaque: Check,
}

export function ToastHost() {
  const [itens, setItens] = useState<readonly ToastItem[]>([])

  useEffect(() => subscribeToasts(setItens), [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      // Región viva: el lector de pantalla anuncia sin robar el foco.
      role="region"
      aria-label="Avisos"
      // `lg:left-60`: en escritorio el DesktopRail ocupa los primeros 15rem
      // fijos de la pantalla (ver Shell.tsx). Sin este corrimiento el toast
      // se centra contra el viewport ENTERO y queda descentrado respecto de
      // la columna de contenido, que sí vive a la derecha del rail.
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 lg:inset-x-auto lg:left-60 lg:right-0"
      style={{ bottom: 'var(--toast-bottom)' }}
    >
      {itens.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>,
    document.body,
  )
}

function ToastCard({ item }: { item: ToastItem }) {
  const [saindo, setSaindo] = useState(false)
  const desfeito = useRef(false)
  const Icone = ICONES[item.tone]

  const fechar = useCallback(() => {
    setSaindo(true)
    window.setTimeout(() => dismissToast(item.id), prefersReducedMotion() ? 0 : 180)
  }, [item.id])

  useEffect(() => {
    const id = window.setTimeout(fechar, item.durationMs)
    return () => window.clearTimeout(id)
  }, [fechar, item.durationMs])

  const desfazer = () => {
    if (desfeito.current) return
    desfeito.current = true
    haptic('tap')
    void item.undo?.()
    fechar()
  }

  return (
    <div
      role={item.tone === 'perigo' ? 'alert' : 'status'}
      aria-live={item.tone === 'perigo' ? 'assertive' : 'polite'}
      className={cx(
        'pointer-events-auto flex w-full max-w-col items-center gap-3',
        'rounded-xl border border-border bg-surface px-3 py-2.5 shadow-toast',
        'transition-[transform,opacity] duration-200 ease-ios',
        saindo ? 'translate-y-3 opacity-0' : 'animate-toast-in',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-pill',
          TONE_SOFT[item.tone],
        )}
      >
        <Icone size={17} />
      </span>

      <p className="min-w-0 flex-1 text-sm leading-snug">{item.message}</p>

      {item.undo && (
        <button
          type="button"
          onClick={desfazer}
          className="flex min-h-touch shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand tap-highlight-none active:opacity-70"
        >
          <Undo2 size={16} aria-hidden />
          {item.undoLabel ?? 'Desfazer'}
        </button>
      )}

      <button
        type="button"
        onClick={fechar}
        aria-label="Dispensar aviso"
        className="flex size-8 shrink-0 items-center justify-center rounded-pill text-fg-subtle tap-highlight-none active:opacity-60"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
