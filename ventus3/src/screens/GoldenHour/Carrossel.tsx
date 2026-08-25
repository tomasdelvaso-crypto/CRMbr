// src/screens/GoldenHour/Carrossel.tsx
// Un contacto por vez, deslizando en horizontal.
//
// `overscroll-behavior: contain` no es cosmético: sin él, el rubber-band de
// Safari al llegar al final del carrusel arrastra la página entera y, en una
// PWA standalone, dispara el gesto de volver atrás del sistema — o sea, saca
// al vendedor de la Golden Hour en el toque número tres.
//
// El avance lo manda el estado (el índice de la sesión), no el dedo: al
// registrar un toque el carrusel se mueve solo. El dedo sirve para mirar el
// siguiente sin registrar nada.

import { useEffect, useRef } from 'react'
import type { IsoDate, Touchpoint } from '@/core'
import { prefersReducedMotion } from '@/ui'
import { CartaoContato } from './CartaoContato'
import type { ItemDaFila } from './fila'

export interface CarrosselProps {
  itens: readonly ItemDaFila[]
  indice: number
  onIndice: (indice: number) => void
  ultimos: Record<number, Touchpoint>
  hoje: IsoDate
}

export function Carrossel({ itens, indice, onIndice, ultimos, hoje }: CarrosselProps) {
  const refScroller = useRef<HTMLDivElement>(null)
  // Mientras el scroll lo movemos nosotros, el handler no debe reinterpretarlo
  // como una decisión del dedo: sería un bucle de índices.
  const programaticoRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = refScroller.current
    if (!el) return
    const alvo = Math.max(0, Math.min(indice, itens.length - 1))
    const left = alvo * el.clientWidth
    if (Math.abs(el.scrollLeft - left) < 4) return

    programaticoRef.current = true
    el.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      programaticoRef.current = false
    }, 420)
  }, [indice, itens.length])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  return (
    <div
      ref={refScroller}
      // scroll-momentum ya trae overscroll-behavior: contain y esconde la
      // barra; snap-x mandatory hace que nunca quede medio card a la vista.
      className="scroll-momentum flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      style={{ overscrollBehavior: 'contain', touchAction: 'pan-x' }}
      onScroll={(e) => {
        if (programaticoRef.current) return
        const el = e.currentTarget
        if (el.clientWidth === 0) return
        const atual = Math.round(el.scrollLeft / el.clientWidth)
        if (atual !== indice && atual >= 0 && atual < itens.length) onIndice(atual)
      }}
      role="group"
      aria-label={`Contato ${Math.min(indice + 1, itens.length)} de ${itens.length}`}
    >
      {itens.map((item, i) => (
        <CartaoContato
          key={item.lead.id}
          lead={item.lead}
          passo={item.passo}
          canal={item.canal}
          rascunho={item.rascunho}
          ultimoToque={ultimos[item.lead.id] ?? null}
          hoje={hoje}
          ativo={i === indice}
        />
      ))}
    </div>
  )
}
