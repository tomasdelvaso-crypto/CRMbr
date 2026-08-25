// src/ui/QRCode.tsx
// El QR como SVG. Ver src/ui/qr.ts para por qué el codificador es propio.

import { useMemo } from 'react'
import { cx } from './utils'
import { encodeQr } from './qr'

export interface QRCodeProps {
  /** Lo que se codifica. Normalmente una URL. */
  value: string
  /** Lado del dibujo en px. El SVG escala solo dentro de su contenedor. */
  size?: number
  /**
   * Módulos claros alrededor. La norma pide 4 y no es negociable: sin zona
   * tranquila muchos lectores no encuentran el símbolo, sobre todo cuando el
   * QR queda pegado a un borde de color.
   */
  quietZone?: number
  /** Texto alternativo. Si no se pasa, el QR es decorativo para el lector. */
  alt?: string
  className?: string
}

export function QRCode({ value, size = 200, quietZone = 4, alt, className }: QRCodeProps) {
  const desenho = useMemo(() => {
    try {
      return { qr: encodeQr(value), erro: null as string | null }
    } catch (e) {
      return { qr: null, erro: e instanceof Error ? e.message : 'Não foi possível gerar o QR.' }
    }
  }, [value])

  if (!desenho.qr) {
    return (
      <div
        role="status"
        className={cx(
          'flex items-center justify-center rounded-lg border border-dashed border-border bg-surface-2 p-4 text-center text-xs text-fg-muted',
          className,
        )}
        style={{ width: size, height: size }}
      >
        {desenho.erro}
      </div>
    )
  }

  const { size: lado, modules } = desenho.qr
  const total = lado + quietZone * 2

  // Un solo <path> con todos los módulos en vez de N <rect>: un QR versión 6
  // son 1.681 módulos y ~700 rects hacen que Safari pinte la página a
  // tirones. El path es un único nodo.
  const d: string[] = []
  for (let r = 0; r < lado; r += 1) {
    const linha = modules[r] as boolean[]
    for (let c = 0; c < lado; c += 1) {
      if (linha[c]) d.push(`M${c + quietZone} ${r + quietZone}h1v1h-1z`)
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      // shapeRendering crispEdges: sin esto el antialiasing come los bordes de
      // los módulos y el escaneo falla en pantallas de baja densidad.
      shapeRendering="crispEdges"
      role={alt ? 'img' : 'presentation'}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
      className={cx('block max-w-full', className)}
    >
      {/* Fondo blanco explícito y no `bg-surface`: el contraste del QR se mide
          contra blanco, y en modo oscuro un QR sobre gris carbón no escanea. */}
      <rect width={total} height={total} fill="#ffffff" />
      <path d={d.join('')} fill="#000000" />
    </svg>
  )
}
