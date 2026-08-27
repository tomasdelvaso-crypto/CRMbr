// src/ui/Skeleton.tsx
// Esqueletos con la FORMA EXACTA del contenido que reemplazan.
// Nada de spinners: un spinner no dice qué está por aparecer y hace que la
// pantalla salte cuando llegan los datos.

import { cx } from './utils'

/** Bloque base. Sirve para armar formas nuevas sin repetir el shimmer. */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'block rounded-md bg-skeleton',
        'bg-[linear-gradient(90deg,var(--color-skeleton)_25%,var(--color-skeleton-shine)_50%,var(--color-skeleton)_75%)]',
        'bg-[length:200%_100%] animate-shimmer',
        className,
      )}
    />
  )
}

export type SkeletonVariant =
  | 'card-acao'
  | 'linha-carteira'
  | 'linha-cadencia'
  | 'tiles-carteira'
  | 'dossie'
  | 'lista'
  | 'aneis'
  | 'placar'
  | 'rituais'
  | 'revisao'
  | 'chat'
  | 'golden'
  | 'gestor'

export interface SkeletonProps {
  /** Forma exacta del contenido que reemplaza. */
  variant: SkeletonVariant
  count?: number
  className?: string
}

export function Skeleton({ variant, count = 1, className }: SkeletonProps) {
  const itens = Array.from({ length: Math.max(1, count) }, (_, i) => i)
  return (
    // aria-busy + role=status: el lector anuncia «carregando» una sola vez y
    // no lee cada rectángulo.
    <div role="status" aria-busy="true" aria-live="polite" className={cx('space-y-3', className)}>
      <span className="sr-only">Carregando…</span>
      {itens.map((i) => (
        <Forma key={i} variant={variant} />
      ))}
    </div>
  )
}

function Forma({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    // Card de ação de Hoje: título, cliente, chip «Por que isto?» y 2 botones.
    case 'card-acao':
      return (
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <SkeletonBlock className="h-4 w-2/5" />
            <SkeletonBlock className="h-5 w-14 rounded-pill" />
          </div>
          <SkeletonBlock className="mt-3 h-5 w-4/5" />
          <SkeletonBlock className="mt-2 h-4 w-3/5" />
          <SkeletonBlock className="mt-3 h-6 w-32 rounded-pill" />
          <div className="mt-4 flex gap-2">
            <SkeletonBlock className="h-touch flex-1 rounded-lg" />
            <SkeletonBlock className="h-touch w-24 rounded-lg" />
          </div>
        </div>
      )

    // Fila de Carteira: 72px exactos, como la real.
    case 'linha-carteira':
      return (
        <div className="flex h-[72px] items-center gap-3 border-b border-border px-1">
          <SkeletonBlock className="size-10 rounded-pill" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="mt-2 h-3 w-1/3" />
          </div>
          <SkeletonBlock className="h-6 w-12 rounded-pill" />
        </div>
      )

    // Fila de Cadência: 80px exactos. Empresa, contacto, 7 puntitos y atraso.
    case 'linha-cadencia':
      return (
        <div className="flex h-20 items-center gap-3 border-b border-border px-1">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-2/5" />
            <SkeletonBlock className="mt-2 h-3 w-1/3" />
            <SkeletonBlock className="mt-2.5 h-2 w-20 rounded-pill" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <SkeletonBlock className="h-5 w-16 rounded-pill" />
            <SkeletonBlock className="h-3 w-10" />
          </div>
        </div>
      )

    // Los 6 tiles de Smart View de la Carteira, en dos columnas.
    case 'tiles-carteira':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-card border border-border bg-surface p-3">
              <SkeletonBlock className="h-7 w-10" />
              <SkeletonBlock className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      )

    // Dossiê: header pegajoso + acciones + hexágono PPVVCC.
    case 'dossie':
      return (
        <div className="space-y-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <SkeletonBlock className="h-6 w-3/5" />
            <SkeletonBlock className="mt-2 h-4 w-2/5" />
            <div className="mt-4 flex gap-2">
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
            </div>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <SkeletonBlock className="mx-auto size-44 rounded-lg" />
          </div>
        </div>
      )

    // Placar da Semana: os cards horizontais de «eu vs eu» e os 4 carris.
    // A forma copia o card real — 15,5rem de largura, número grande, barra.
    case 'placar':
      return (
        <div>
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-[15.5rem] shrink-0 rounded-card border border-border bg-surface p-4">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-9 w-16" />
                <SkeletonBlock className="mt-2 h-4 w-24 rounded-pill" />
                <SkeletonBlock className="mt-3 h-3 w-full" />
                <SkeletonBlock className="mt-4 h-1.5 w-full rounded-pill" />
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5">
                <SkeletonBlock className="size-8 rounded-pill" />
                <div className="min-w-0 flex-1">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="mt-1.5 h-2 w-full rounded-pill" />
                </div>
                <SkeletonBlock className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>
      )

    // Rituais: a linha do tempo dos quatro momentos do dia.
    case 'rituais':
      return (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5">
              <SkeletonBlock className="size-10 rounded-pill" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-2/5" />
                <SkeletonBlock className="mt-2 h-3 w-3/5" />
              </div>
              <SkeletonBlock className="h-5 w-14 rounded-pill" />
            </div>
          ))}
        </div>
      )

    case 'aneis':
      return (
        <div className="flex items-center justify-around py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <SkeletonBlock className="size-20 rounded-pill" />
              <SkeletonBlock className="h-3 w-14" />
            </div>
          ))}
        </div>
      )

    // Modo foco da Golden Hour: HUD, card do contato a tela cheia e os 4
    // botões. Ocupa a tela inteira porque a tela real também ocupa.
    case 'golden':
      return (
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-10 w-28 rounded-lg" />
            <SkeletonBlock className="h-6 w-24 rounded-pill" />
          </div>
          <div className="flex-1 rounded-card border border-border bg-surface p-5">
            <SkeletonBlock className="h-5 w-24 rounded-pill" />
            <SkeletonBlock className="mt-4 h-7 w-4/5" />
            <SkeletonBlock className="mt-3 h-5 w-3/5" />
            <SkeletonBlock className="mt-2 h-4 w-2/5" />
            <SkeletonBlock className="mt-6 h-24 w-full rounded-lg" />
            <div className="mt-5 flex gap-2">
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
              <SkeletonBlock className="h-touch flex-1 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SkeletonBlock className="h-touch-lg rounded-xl" />
            <SkeletonBlock className="h-touch-lg rounded-xl" />
            <SkeletonBlock className="h-touch-lg rounded-xl" />
            <SkeletonBlock className="h-touch-lg rounded-xl" />
          </div>
        </div>
      )

    // Tarjeta da Revisão: cabeçalho com cliente, 2 linhas de campo
    // (antigo → novo), a citação e a barra de ações.
    case 'revisao':
      return (
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
            <SkeletonBlock className="h-6 w-20 rounded-pill" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-3 w-14" />
              <SkeletonBlock className="h-3 w-10" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-3 w-10" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
          <SkeletonBlock className="mt-4 h-10 w-full rounded-lg" />
          <div className="mt-3 flex gap-2">
            <SkeletonBlock className="h-11 flex-1 rounded-lg" />
            <SkeletonBlock className="h-11 w-11 rounded-lg" />
            <SkeletonBlock className="h-11 w-11 rounded-lg" />
          </div>
        </div>
      )

    // Painel do Gestor: cabecera (semana + pipeline + a frase da leitura),
    // as 4 pestañas do SegmentedControl e dois cartões de vendedor (avatar,
    // nome, pipeline, dias com registro, barra de adoção e duas seções).
    case 'gestor':
      return (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
          <SkeletonBlock className="mt-3 h-5 w-4/5" />
          <div className="mt-4 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-8 w-20 rounded-pill" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <SkeletonBlock className="size-10 shrink-0 rounded-pill" />
                  <div className="min-w-0 flex-1">
                    <SkeletonBlock className="h-4 w-2/5" />
                    <SkeletonBlock className="mt-2 h-3 w-3/5" />
                  </div>
                  <SkeletonBlock className="h-8 w-10 shrink-0" />
                </div>
                <SkeletonBlock className="mt-4 h-1.5 w-full rounded-pill" />
                <SkeletonBlock className="mt-4 h-3 w-1/3" />
                <SkeletonBlock className="mt-2 h-4 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      )

    case 'chat':
      return (
        <div className="space-y-2">
          <SkeletonBlock className="h-10 w-3/4 rounded-xl" />
          <SkeletonBlock className="ml-auto h-10 w-1/2 rounded-xl" />
        </div>
      )

    case 'lista':
    default:
      return (
        <div className="flex items-center gap-3 py-2">
          <SkeletonBlock className="size-8 rounded-pill" />
          <SkeletonBlock className="h-4 flex-1" />
        </div>
      )
  }
}
