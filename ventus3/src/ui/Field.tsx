// src/ui/Field.tsx
// Campos de texto de la app. No existían: el editor de escala PPVVCC es la
// primera pantalla que le pide al vendedor escribir una cita textual, y sin
// esto cada pantalla se inventaría su propio <input> con su propio tamaño de
// fuente.
//
// Dos reglas que este archivo existe para no romper nunca:
//  · 16px REALES de fuente (text-base). Por debajo de eso, Safari en iOS hace
//    zoom al enfocar y el formulario queda descuadrado para siempre.
//  · alto mínimo de 44px y label siempre asociado, aunque esté oculto.

import { useId, type ReactNode, type Ref } from 'react'
import { cx } from './utils'

interface FieldBase {
  label: string
  /** Oculta el rótulo visualmente, pero lo deja para el lector de pantalla. */
  hideLabel?: boolean
  /** Ayuda bajo el campo. Se reemplaza por `error` cuando hay error. */
  hint?: ReactNode
  /** Mensaje de error. Marca el campo como inválido. */
  error?: string | null
  required?: boolean
  /** Elemento a la derecha del rótulo: contador, botón de dictado. */
  action?: ReactNode
  className?: string
}

export interface TextFieldProps extends FieldBase {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** `text` por defecto. `tel`/`email` solo cambian el teclado del móvil. */
  type?: 'text' | 'tel' | 'email' | 'search' | 'password'
  /**
   * Pista para el gestor de contraseñas. Sin esto, iOS y Android no ofrecen
   * autocompletar en el login y el vendedor teclea la contraseña a mano en la
   * puerta de una planta. Valores útiles: 'email', 'current-password',
   * 'one-time-code'.
   */
  autoComplete?: string
  /** `name` real del input. Los gestores de contraseña lo usan para agrupar. */
  name?: string
  autoFocus?: boolean
  disabled?: boolean
  maxLength?: number
  /** Teclado que abre el móvil. 'search' pone la lupa, 'numeric' el pad. */
  inputMode?: 'text' | 'search' | 'tel' | 'email' | 'url' | 'numeric' | 'decimal'
  /** Rótulo de la tecla de retorno: 'search', 'done', 'send'. */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send'
  /** Se dispara con Enter. Con enterKeyHint='search' es lo que espera el dedo. */
  onEnter?: () => void
  inputRef?: Ref<HTMLInputElement>
}

export interface TextAreaProps extends FieldBase {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  maxLength?: number
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send'
  textareaRef?: Ref<HTMLTextAreaElement>
}

const CAMPO_BASE =
  'w-full rounded-lg border bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle ' +
  'outline-none transition-colors disabled:opacity-50'

function Envoltorio({
  idCampo,
  idAjuda,
  label,
  hideLabel,
  hint,
  error,
  required,
  action,
  className,
  children,
}: FieldBase & { idCampo: string; idAjuda: string; children: ReactNode }) {
  const ajuda = error ?? hint
  return (
    <div className={cx('w-full', className)}>
      <div className={cx('flex items-baseline justify-between gap-2', hideLabel && 'sr-only')}>
        <label htmlFor={idCampo} className="text-sm font-medium text-fg-muted">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
        {action && <span className="shrink-0">{action}</span>}
      </div>
      <div className={cx(hideLabel ? '' : 'mt-1.5')}>{children}</div>
      {ajuda && (
        <p
          id={idAjuda}
          className={cx('mt-1.5 text-xs leading-snug', error ? 'text-danger' : 'text-fg-muted')}
          role={error ? 'alert' : undefined}
        >
          {ajuda}
        </p>
      )}
    </div>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  name,
  autoFocus = false,
  disabled = false,
  maxLength,
  inputMode,
  enterKeyHint,
  onEnter,
  inputRef,
  ...envoltorio
}: TextFieldProps) {
  const idCampo = useId()
  const idAjuda = `${idCampo}-ajuda`
  const invalido = Boolean(envoltorio.error)

  return (
    <Envoltorio idCampo={idCampo} idAjuda={idAjuda} {...envoltorio}>
      <input
        id={idCampo}
        ref={inputRef}
        type={type}
        name={name}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={maxLength}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
        aria-required={envoltorio.required || undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={(envoltorio.error ?? envoltorio.hint) ? idAjuda : undefined}
        className={cx(
          CAMPO_BASE,
          'min-h-touch',
          invalido ? 'border-danger' : 'border-border focus:border-brand',
        )}
      />
    </Envoltorio>
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  maxLength,
  enterKeyHint,
  textareaRef,
  ...envoltorio
}: TextAreaProps) {
  const idCampo = useId()
  const idAjuda = `${idCampo}-ajuda`
  const invalido = Boolean(envoltorio.error)

  return (
    <Envoltorio idCampo={idCampo} idAjuda={idAjuda} {...envoltorio}>
      <textarea
        id={idCampo}
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        enterKeyHint={enterKeyHint}
        aria-required={envoltorio.required || undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={(envoltorio.error ?? envoltorio.hint) ? idAjuda : undefined}
        className={cx(
          CAMPO_BASE,
          'resize-none leading-snug',
          invalido ? 'border-danger' : 'border-border focus:border-brand',
        )}
      />
    </Envoltorio>
  )
}
