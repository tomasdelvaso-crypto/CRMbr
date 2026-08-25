// src/ui/VirtualList.tsx
// Lista virtualizada mínima, sin dependencias.
//
// La Carteira son 65 oportunidades hoy y ~500 con market_sweep cargado. Montar
// 500 filas con avatar y semáforo cuesta ~200ms de layout en un Android de
// gama media; virtualizada, cuesta lo mismo que 12 filas.
//
// Solo alturas fijas: es lo que necesitan las filas de 72px de la Carteira y
// evita el ResizeObserver por fila, que es lo caro.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from './utils'

export interface VirtualListProps<T> {
  items: readonly T[]
  /** Alto exacto de cada fila, en px. */
  itemHeight: number
  renderItem: (item: T, index: number) => ReactNode
  /** Clave estable por fila. Sin esto React remonta al scrollear. */
  getKey: (item: T, index: number) => string | number
  /** Filas de más arriba y abajo del viewport. */
  overscan?: number
  /** Alto del contenedor. Sin esto, ocupa el alto disponible del padre. */
  height?: number | string
  /** Rótulo del listado para el lector de pantalla. */
  'aria-label'?: string
  /** Contenido cuando `items` está vacío. */
  empty?: ReactNode
  className?: string
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  getKey,
  overscan = 6,
  height,
  'aria-label': ariaLabel,
  empty,
  className,
}: VirtualListProps<T>) {
  const viewport = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [alturaViewport, setAlturaViewport] = useState(0)
  const frame = useRef(0)

  // El scroll se lee en rAF: en iOS el evento dispara a 120Hz y sin esto se
  // hacen 120 renders por segundo.
  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = viewport.current
      if (el) setScrollTop(el.scrollTop)
    })
  }, [])

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    [],
  )

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const medir = () => setAlturaViewport(el.clientHeight)
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = items.length
  const alturaTotal = total * itemHeight
  const visiveis = Math.max(1, Math.ceil((alturaViewport || itemHeight * 8) / itemHeight))
  const inicio = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const fim = Math.min(total, inicio + visiveis + overscan * 2)
  const janela = items.slice(inicio, fim)

  if (total === 0 && empty) {
    return <div className={className}>{empty}</div>
  }

  return (
    <div
      ref={viewport}
      onScroll={onScroll}
      style={height != null ? { height } : undefined}
      className={cx('relative h-full overflow-y-auto scroll-momentum', className)}
    >
      {/* Espaciador del alto real: la barra de scroll tiene que ser honesta. */}
      <div style={{ height: alturaTotal }} className="relative">
        <ul
          aria-label={ariaLabel}
          // aria-setsize/posinset en cada fila: el lector anuncia «3 de 412»
          // aunque solo existan 18 nodos en el DOM.
          className="absolute inset-x-0 top-0 m-0 list-none p-0"
          style={{ transform: `translate3d(0, ${inicio * itemHeight}px, 0)` }}
        >
          {janela.map((item, i) => {
            const indice = inicio + i
            return (
              <li
                key={getKey(item, indice)}
                aria-setsize={total}
                aria-posinset={indice + 1}
                style={{ height: itemHeight }}
                className="overflow-hidden"
              >
                {renderItem(item, indice)}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
