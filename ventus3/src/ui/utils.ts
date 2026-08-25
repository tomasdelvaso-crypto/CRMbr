// src/ui/utils.ts
// Helpers sin estado del design system. Nada de acá toca el DOM.

import { formatarBRL } from '@/core'

/** Concatena clases condicionales. Sustituye a clsx: no vale la pena la dep. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = ''
  for (const part of parts) {
    if (!part) continue
    out = out === '' ? part : `${out} ${part}`
  }
  return out
}

/** Acota un número al rango [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Interpolación lineal. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Resistencia de arrastre: cuanto más lejos del borde, menos se mueve.
 * Es lo que hace que un sheet «tire» en vez de despegarse de la pantalla.
 */
export function rubberband(distance: number, dimension: number, factor = 0.55): number {
  if (dimension <= 0) return 0
  return (1 - 1 / ((distance * factor) / dimension + 1)) * dimension
}

/**
 * Formatea BRL sin centavos: R$ 1.234.567.
 *
 * Delega en formatarBRL() del dominio A PROPÓSITO. Antes había acá un
 * Intl.NumberFormat propio que producía la MISMA cifra con un espacio duro
 * (U+00A0) donde el dominio pone un espacio normal. Como los textos del
 * planner y de risk.ts ya vienen formateados desde src/core, una tarjeta y su
 * línea de motivo mostraban el mismo valor con dos espaciados distintos.
 *
 * Lo único que la UI decide es el vacío: en una tarjeta alcanza un guión;
 * el dominio devuelve 'R$ —' porque sus strings van también a Telegram, donde
 * un guión suelto no se entiende.
 */
export function formatBrl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatarBRL(value)
}

const BRL_COMPACTO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Formato compacto para cards angostos: R$ 1,2 mi. */
export function formatBrlCompacto(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  // Se normaliza el espacio duro de Intl al espacio normal que usa el dominio:
  // los dos formatos conviven en la misma pantalla.
  return BRL_COMPACTO.format(value).replace('\u00a0', ' ')
}

/** Porcentaje entero en PT-BR: 73%. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}

/** Iniciales de un nombre: «Victor Hugo Santos» → «VS». */
export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '?'
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  const a = first.charAt(0)
  const b = last ? last.charAt(0) : ''
  return (a + b).toUpperCase()
}

/** `true` si el usuario pidió menos movimiento. Seguro en SSR y en tests. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Duración efectiva: 0 cuando el usuario pidió menos movimiento. */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms
}

let contador = 0
/** Id estable para relaciones aria cuando no hay uno de dominio a mano. */
export function uid(prefix = 'ventus'): string {
  contador += 1
  return `${prefix}-${contador.toString(36)}`
}
