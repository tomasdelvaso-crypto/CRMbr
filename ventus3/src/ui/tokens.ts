// src/ui/tokens.ts
// Vocabulario compartido del design system. Los nombres de tono van en PT-BR
// porque son los mismos que usan las pantallas y la metodología PPVVCC.

/** Tono semántico. Mapea 1:1 con los tokens de color de src/index.css. */
export type Tone = 'neutro' | 'marca' | 'ok' | 'atencao' | 'perigo' | 'info' | 'destaque'

/** Tamaño de control. `md` es el default y ya cumple los 44px de alto. */
export type Size = 'sm' | 'md' | 'lg'

/** Clases de fondo sólido + su color de texto legible, por tono. */
export const TONE_SOLID: Readonly<Record<Tone, string>> = {
  neutro: 'bg-surface-3 text-fg',
  marca: 'bg-brand text-brand-fg',
  ok: 'bg-ok text-ok-fg',
  atencao: 'bg-warn text-warn-fg',
  perigo: 'bg-danger text-danger-fg',
  info: 'bg-info text-info-fg',
  destaque: 'bg-accent text-accent-fg',
}

/** Variante suave (chips, badges, avisos): fondo tenue y texto del mismo hue. */
export const TONE_SOFT: Readonly<Record<Tone, string>> = {
  neutro: 'bg-surface-2 text-fg-muted',
  marca: 'bg-brand-soft text-brand-soft-fg',
  ok: 'bg-ok-soft text-ok-soft-fg',
  atencao: 'bg-warn-soft text-warn-soft-fg',
  perigo: 'bg-danger-soft text-danger-soft-fg',
  info: 'bg-info-soft text-info-soft-fg',
  destaque: 'bg-accent-soft text-accent-soft-fg',
}

/** Solo el color de texto/ícono, para variantes fantasma. */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  neutro: 'text-fg-muted',
  marca: 'text-brand',
  ok: 'text-ok',
  atencao: 'text-warn',
  perigo: 'text-danger',
  info: 'text-info',
  destaque: 'text-accent',
}

/** Borde por tono, para outlines y contornos punteados. */
export const TONE_BORDER: Readonly<Record<Tone, string>> = {
  neutro: 'border-border',
  marca: 'border-brand',
  ok: 'border-ok',
  atencao: 'border-warn',
  perigo: 'border-danger',
  info: 'border-info',
  destaque: 'border-accent',
}

/** Variable CSS del color sólido de cada tono (para SVG y canvas). */
export const TONE_VAR: Readonly<Record<Tone, string>> = {
  neutro: '--color-fg-subtle',
  marca: '--color-brand',
  ok: '--color-ok',
  atencao: '--color-warn',
  perigo: '--color-danger',
  info: '--color-info',
  destaque: '--color-accent',
}
