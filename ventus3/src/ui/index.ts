// src/ui/index.ts
// Design system de Ventus. Mobile-first, PT-BR, dark mode desde el día 1.
//
// Reglas que valen para todo lo que sale de acá:
//  · target táctil >= 44px
//  · safe areas respetadas en los cuatro bordes
//  · solo transform/opacity en animaciones, y todas respetan
//    prefers-reduced-motion
//  · todo componente funciona con teclado y con lector de pantalla
//  · cero alert()/confirm()/prompt(): Sheet, Confirm y Toast los reemplazan

/* ── Fundamentos ───────────────────────────────────────────────────────── */
export { cx, clamp, lerp, rubberband, formatBrl, formatBrlCompacto, formatPercent, initials, prefersReducedMotion, motionDuration, uid } from './utils'
export { TONE_SOLID, TONE_SOFT, TONE_TEXT, TONE_BORDER, TONE_VAR } from './tokens'
export type { Tone, Size } from './tokens'

export { haptic, hapticDisponivel, hapticCancelar } from './haptic'
export type { HapticPattern } from './haptic'

export {
  runViewTransition,
  pushTransition,
  popTransition,
  morphTransition,
  suportaViewTransition,
  viewTransitionName,
  direcaoEntreRotas,
} from './transitions'
export type { StackDirection, TransitionKind, UpdateCallback } from './transitions'

/* ── Contenedores y gestos ─────────────────────────────────────────────── */
export { Sheet } from './Sheet'
export type { SheetProps } from './Sheet'

export { SwipeRow } from './SwipeRow'
export type { SwipeRowProps } from './SwipeRow'

export { PullToRefresh } from './PullToRefresh'
export type { PullToRefreshProps } from './PullToRefresh'

export { VirtualList } from './VirtualList'
export type { VirtualListProps } from './VirtualList'

/* ── Controles ─────────────────────────────────────────────────────────── */
export { Button, IconButton } from './Button'
export type { ButtonProps, ButtonVariant, IconButtonProps } from './Button'

export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl'

export { Stepper } from './Stepper'
export type { StepperProps } from './Stepper'

export { DatePills } from './DatePills'
export type { DatePillsProps } from './DatePills'
export { hojeBr, somarDias, proximaSegunda, formatarCurtoBr } from './datas'
export type { IsoDate } from './datas'

/* ── Presentación ──────────────────────────────────────────────────────── */
export { Card, CardHeader } from './Card'
export type { CardProps } from './Card'

export { Chip } from './Chip'
export type { ChipProps } from './Chip'

export { Badge, CountBadge } from './Badge'
export type { BadgeProps } from './Badge'

export { Avatar, AvatarStack } from './Avatar'
export type { AvatarProps, AvatarSize } from './Avatar'

export { Skeleton, SkeletonBlock } from './Skeleton'
export type { SkeletonProps, SkeletonVariant } from './Skeleton'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { Ring, RingTrio } from './Ring'
export type { RingProps, RingKind, RingTrioProps } from './Ring'

/* ── Feedback ──────────────────────────────────────────────────────────── */
export { ToastHost } from './Toast'
export { toast, dismissToast, clearToasts, subscribeToasts, getToasts } from './toast-store'
export type { ToastOptions, ToastItem } from './toast-store'

export { ConfirmHost } from './Confirm'
export { confirmar, avisar, subscribeConfirm } from './confirm-store'
export type { ConfirmOptions, ConfirmRequest } from './confirm-store'

export { Waveform } from './Waveform'
export type { WaveformProps } from './Waveform'

export { Confetti } from './Confetti'
export type { ConfettiProps } from './Confetti'
