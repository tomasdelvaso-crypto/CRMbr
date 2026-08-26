// src/ui/Sheet.tsx
// Bottom sheet arrastrable. Es el contenedor de casi todo en esta app:
// filtros, editor de escala PPVVCC, adiar, confirmaciones, chat del Ventus.
//
// Reglas que cumple:
//  · drag-to-dismiss con resistencia y snap points
//  · backdrop cuya opacidad sigue al dedo
//  · focus trap + devolución de foco
//  · cierra con Escape y con el back del sistema
//  · solo transform/opacity animados
//  · respeta prefers-reduced-motion (duración 0, sin saltos)

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { X } from 'lucide-react'
import { useBackDismiss, useEscape, useFocusTrap, useScrollLock } from './internals'
import { haptic } from './haptic'
import { clamp, cx, prefersReducedMotion, rubberband } from './utils'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** Título visible. Si falta, pasá `labelledBy` o `aria-label`. */
  title?: string
  /** Bajada corta bajo el título. */
  description?: string
  children: ReactNode
  /**
   * Alturas de anclaje como fracción de la pantalla, en orden ascendente.
   * Ej. `[0.45, 0.92]`. Sin este prop el sheet se adapta al contenido.
   */
  snapPoints?: readonly number[]
  /** Índice del snap inicial dentro de `snapPoints`. */
  initialSnap?: number
  /** `false` bloquea el cierre por gesto/backdrop (cierres no salteables). */
  dismissible?: boolean
  /** Muestra la barrita de arrastre. */
  showHandle?: boolean
  /** Barra fija al pie, por encima de la safe area (MainButton de la PWA). */
  footer?: ReactNode
  /** Id de un elemento que titula el sheet, si no se usa `title`. */
  labelledBy?: string
  'aria-label'?: string
  className?: string
  onSnapChange?: (index: number) => void
}

/** Distancia mínima, en px, para considerar que hubo arrastre y no un tap. */
const LIMIAR_ARRASTE = 4
/** Velocidad (px/ms) que dispara el cierre sin importar la distancia. */
const VELOCIDADE_FECHO = 0.55
/** Cuánto proyecta el gesto hacia adelante al soltar. */
const PROJECAO_MS = 140

function transicao(): { type: 'spring'; stiffness: number; damping: number; mass: number } | {
  duration: number
} {
  if (prefersReducedMotion()) return { duration: 0 }
  return { type: 'spring', stiffness: 460, damping: 44, mass: 0.9 }
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  snapPoints,
  initialSnap = 0,
  dismissible = true,
  showHandle = true,
  footer,
  labelledBy,
  'aria-label': ariaLabel,
  className,
  onSnapChange,
}: SheetProps) {
  const [montado, setMontado] = useState(open)
  const [snapAtual, setSnapAtual] = useState(initialSnap)

  const painelRef = useRef<HTMLDivElement>(null)
  const conteudoRef = useRef<HTMLDivElement>(null)
  const alturaRef = useRef(1)

  const y = useMotionValue(0)
  // La opacidad del backdrop sigue al dedo: es el 80% de la sensación nativa.
  const opacidadeFundo = useTransform(y, (v) => clamp(1 - v / Math.max(alturaRef.current, 1), 0, 1))

  const idTitulo = useId()
  const idDescricao = useId()

  // Snaps normalizados y ordenados. Sin snapPoints, el sheet mide su contenido.
  const snaps = useMemo<readonly number[]>(() => {
    if (!snapPoints || snapPoints.length === 0) return [1]
    return [...snapPoints].map((s) => clamp(s, 0.15, 1)).sort((a, b) => a - b)
  }, [snapPoints])

  const alturaFixa = snaps.length > 1
  const snapMax = snaps[snaps.length - 1] ?? 1
  const snapMin = snaps[0] ?? snapMax

  /* ── El pie no puede quedar abajo de la pantalla ────────────────────────
     Con varios snaps, el panel mide SIEMPRE el snap más alto y los snaps
     bajos se logran empujándolo hacia abajo con un transform. Consecuencia:
     lo que está al pie del panel —justo la barra de acción— queda fuera de la
     pantalla en cualquier snap que no sea el último. En el editor de escala,
     eso era el botón «Salvar»: el vendedor abría el sheet y no había con qué
     guardar hasta arrastrar el panel hacia arriba.

     Se corrige compensando el pie con el transform inverso, así queda pegado
     al borde inferior visible, y reservando esa misma altura al final del
     contenido para que el pie nunca tape la última línea. La compensación se
     limita al offset del snap más bajo: durante la animación de cierre el
     panel baja mucho más que eso y el pie tiene que irse CON él, no quedarse
     flotando en pantalla. */
  const reservaMaxima = useCallback(
    () => alturaRef.current * (1 - snapMin / snapMax),
    [snapMin, snapMax],
  )
  const [reservaDoRodape, setReservaDoRodape] = useState(0)
  const compensacaoDoRodape = useTransform(y, (v) =>
    alturaFixa && footer ? -clamp(v, 0, reservaMaxima()) : 0,
  )

  /** Offset de reposo (px desde la posición «abierto del todo») de cada snap. */
  const offsetDoSnap = useCallback(
    (indice: number) => {
      const s = snaps[clamp(indice, 0, snaps.length - 1)] ?? snapMax
      return alturaRef.current * (1 - s / snapMax)
    },
    [snaps, snapMax],
  )

  /* ── Ciclo de vida: montar → animar entrada → animar salida → desmontar ──
     El montaje se ajusta EN RENDER, no en un efecto: abrir un sheet no puede
     costar un commit extra, y así el panel ya existe cuando corre el
     useLayoutEffect que lo mide. Es el patrón «adjusting state when a prop
     changes» de la documentación de React. */

  const [abertoAnterior, setAbertoAnterior] = useState(open)
  if (open !== abertoAnterior) {
    setAbertoAnterior(open)
    if (open) {
      setMontado(true)
      setSnapAtual(initialSnap)
    }
  }

  /* ── El punto de partida de la entrada se coloca UNA vez por apertura ────
     `y.set(alturaRef.current)` deja el panel entero por debajo del borde de la
     pantalla para que el efecto de abajo lo suba animando. Es la POSICIÓN DE
     ARRANQUE, no un estado que haya que mantener — y sin este candado se
     volvía a aplicar en cada corrida del efecto.

     Lo que eso costaba, medido: este efecto depende de `footer`, que es un
     ReactNode que la pantalla de arriba vuelve a crear en CADA render. En un
     sheet sin `snapPoints` el reposo abierto es exactamente `y === 0`, así que
     el primer re-render del padre con el sheet abierto encontraba la condición
     cumplida y TELETRANSPORTABA el panel un alto entero hacia abajo. El efecto
     que anima no depende de `footer`, así que no volvía a correr: el panel se
     quedaba ahí, fuera de la pantalla, para siempre.

     Lo que se veía: en «Adiar» (tela Hoje), tocar una fecha hacía DESAPARECER
     el sheet —y con él la fecha recién elegida y el botón que la confirma—
     mientras la app seguía en modo modal, con el scroll bloqueado y el foco
     atrapado en un panel invisible. O sea: la pantalla dejaba de responder a
     todo. Medido en el build de producción, en los dos tamaños:

         adiar-aberto        painel.top = 435   transform: none
         después de «+7d»    painel.top = 844   transform: translateY(409px)
         1,7 s más tarde     painel.top = 844   (no vuelve)

     Le pasaba a los sheets SIN `snapPoints` y con `footer` propio — «Adiar» de
     Hoje y de Carteira, Filtros, os quatro Rituais, Próximo Passo, Kudos,
     Descartar y Editar Campo da Revisão. Los que tienen snaps se salvaban de
     casualidad: su reposo abierto no es 0, sino el offset del snap.

     El candado es un ref y no una dependencia menos: hay que seguir midiendo
     el alto y recalculando la reserva del pie cuando el contenido cambia. Lo
     único que pasa a ocurrir una sola vez es la colocación inicial. */
  const arranqueColocado = useRef(false)

  useLayoutEffect(() => {
    if (!montado) return
    const el = painelRef.current
    if (!el) return
    alturaRef.current = Math.max(el.offsetHeight, 1)
    setReservaDoRodape(alturaFixa && footer ? reservaMaxima() : 0)

    if (!open) {
      // Cerrando: la próxima apertura vuelve a necesitar su punto de partida.
      arranqueColocado.current = false
      return
    }
    if (arranqueColocado.current) return
    arranqueColocado.current = true
    if (y.get() === 0) y.set(alturaRef.current)
  }, [montado, open, y, alturaFixa, footer, reservaMaxima])

  useEffect(() => {
    if (!montado) return
    const el = painelRef.current
    if (!el) return
    alturaRef.current = Math.max(el.offsetHeight, 1)

    if (open) {
      const controles = animate(y, offsetDoSnap(initialSnap), transicao())
      return () => controles.stop()
    }

    const controles = animate(y, alturaRef.current, transicao())
    void controles.then(() => setMontado(false))
    return () => controles.stop()
    // offsetDoSnap depende de snaps, que es estable por useMemo.
  }, [open, montado, initialSnap, offsetDoSnap, y])

  // Si el teclado o el contenido cambian la altura, hay que recalcular.
  useEffect(() => {
    if (!montado || typeof ResizeObserver === 'undefined') return
    const el = painelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      alturaRef.current = Math.max(el.offsetHeight, 1)
      setReservaDoRodape(alturaFixa && footer ? reservaMaxima() : 0)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [montado, alturaFixa, footer, reservaMaxima])

  const fechar = useCallback(() => {
    if (!dismissible) {
      // Rebote corto: comunica «no se puede» sin un alert.
      const atual = y.get()
      void animate(y, [atual, atual + 14, atual], { duration: prefersReducedMotion() ? 0 : 0.22 })
      haptic('warning')
      return
    }
    onClose()
  }, [dismissible, onClose, y])

  useScrollLock(montado)
  useFocusTrap(painelRef, montado && open)
  useEscape(montado && open, fechar)
  useBackDismiss(montado && open, fechar)

  /* ── Arrastre ─────────────────────────────────────────────────────────── */

  const arraste = useRef({
    ativo: false,
    pointerId: -1,
    inicioY: 0,
    offsetInicial: 0,
    ultimoY: 0,
    ultimoT: 0,
    velocidade: 0,
    moveu: false,
    desdeConteudo: false,
  })

  const iniciarArraste = useCallback(
    (e: ReactPointerEvent<HTMLElement>, desdeConteudo: boolean) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (desdeConteudo) {
        const sc = conteudoRef.current
        // Desde el contenido solo se arrastra si la lista ya está arriba de todo.
        if (!sc || sc.scrollTop > 0) return
      }
      const d = arraste.current
      d.ativo = true
      d.pointerId = e.pointerId
      d.inicioY = e.clientY
      d.offsetInicial = y.get()
      d.ultimoY = e.clientY
      d.ultimoT = e.timeStamp
      d.velocidade = 0
      d.moveu = false
      d.desdeConteudo = desdeConteudo
    },
    [y],
  )

  const moverArraste = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = arraste.current
      if (!d.ativo || d.pointerId !== e.pointerId) return

      const dy = e.clientY - d.inicioY

      // Arrastrando hacia arriba desde una lista: es scroll, no gesto de sheet.
      if (d.desdeConteudo && dy < -LIMIAR_ARRASTE) {
        d.ativo = false
        return
      }
      if (!d.moveu && Math.abs(dy) < LIMIAR_ARRASTE) return
      if (!d.moveu) {
        d.moveu = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }

      const bruto = d.offsetInicial + dy
      const minimo = offsetDoSnap(snaps.length - 1)
      const maximo = dismissible ? alturaRef.current : offsetDoSnap(0)

      let proximo = bruto
      if (bruto < minimo) {
        // Tirar hacia arriba del tope: resistencia, nunca despegue.
        proximo = minimo - rubberband(minimo - bruto, 220, 0.5)
      } else if (bruto > maximo) {
        proximo = maximo + rubberband(bruto - maximo, 220, 0.5)
      }

      const dt = e.timeStamp - d.ultimoT
      if (dt > 0) d.velocidade = (e.clientY - d.ultimoY) / dt
      d.ultimoY = e.clientY
      d.ultimoT = e.timeStamp

      y.set(proximo)
    },
    [dismissible, offsetDoSnap, snaps.length, y],
  )

  const soltarArraste = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = arraste.current
      if (!d.ativo || d.pointerId !== e.pointerId) return
      d.ativo = false
      if (!d.moveu) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* el puntero puede haberse perdido con el gesto del sistema */
      }

      const atual = y.get()
      const projetado = atual + d.velocidade * PROJECAO_MS

      // Candidatos: cada snap y, si se permite, la posición «cerrado».
      const candidatos: Array<{ offset: number; snap: number }> = snaps.map((_, i) => ({
        offset: offsetDoSnap(i),
        snap: i,
      }))
      if (dismissible) candidatos.push({ offset: alturaRef.current, snap: -1 })

      let melhor = candidatos[0]
      if (!melhor) return
      for (const c of candidatos) {
        if (Math.abs(c.offset - projetado) < Math.abs(melhor.offset - projetado)) melhor = c
      }

      // Un flick rápido hacia abajo cierra aunque el dedo no haya bajado mucho.
      if (dismissible && d.velocidade > VELOCIDADE_FECHO && melhor.snap === 0) {
        melhor = { offset: alturaRef.current, snap: -1 }
      }

      if (melhor.snap === -1) {
        haptic('tap')
        onClose()
        return
      }
      if (melhor.snap !== snapAtual) {
        setSnapAtual(melhor.snap)
        onSnapChange?.(melhor.snap)
        haptic('selection')
      }
      void animate(y, melhor.offset, transicao())
    },
    [dismissible, offsetDoSnap, onClose, onSnapChange, snapAtual, snaps, y],
  )

  if (!montado || typeof document === 'undefined') return null

  const rotulado = title ? idTitulo : labelledBy

  return createPortal(
    // `lg:flex lg:items-center lg:justify-center`: en escritorio (≥1024px) un
    // bottom sheet pegado al piso de un monitor de 27" es tan absurdo como el
    // gesto que lo abre; acá se convierte en modal centrado. El backdrop
    // sigue `absolute inset-0` —no participa del centrado, ya cubre todo— y
    // es el panel el que pasa de anclado abajo a ítem centrado por flexbox.
    <div className="fixed inset-0 z-50 lg:flex lg:items-center lg:justify-center lg:p-6" data-ventus-sheet="">
      <motion.div
        aria-hidden
        onPointerDown={dismissible ? fechar : undefined}
        style={{ opacity: opacidadeFundo }}
        className="absolute inset-0 bg-overlay backdrop-blur-[2px]"
      />

      <motion.div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={rotulado}
        aria-describedby={description ? idDescricao : undefined}
        aria-label={!rotulado ? ariaLabel : undefined}
        tabIndex={-1}
        style={{ y, maxHeight: 'var(--sheet-max-h)' }}
        className={cx(
          'absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-col flex-col',
          'rounded-t-sheet border border-b-0 border-border bg-surface text-fg shadow-sheet',
          'outline-none will-change-transform',
          // Desktop: deja de estar anclado al borde inferior de la pantalla y
          // pasa a ser un ítem más del flex centrado de arriba. `lg:relative`
          // y no `lg:static`: sigue necesitando quedar en el mismo grupo de
          // apilado que el backdrop (`position` distinto de `static`) para
          // pintarse ENCIMA de él — si no, el backdrop, que es `absolute`,
          // gana el apilado sobre un panel `static` sin importar el orden en
          // el DOM.
          'lg:relative lg:inset-auto lg:mx-0 lg:w-full lg:max-w-md lg:rounded-sheet lg:border-b',
          className,
        )}
      >
        {/* Zona de agarre: handle + título. Todo el bloque arrastra. */}
        <div
          className="shrink-0 touch-pan-y-only select-none"
          onPointerDown={(e) => iniciarArraste(e, false)}
          onPointerMove={moverArraste}
          onPointerUp={soltarArraste}
          onPointerCancel={soltarArraste}
        >
          {showHandle && (
            // La barrita de arrastre es una convención de bottom sheet. En el
            // modal centrado de escritorio no hay de dónde «tirar hacia
            // abajo»: se esconde, no el gesto —el mouse puede seguir
            // arrastrando desde este bloque si quiere, ver el comentario de
            // arriba del componente.
            <div className="flex h-6 items-center justify-center pt-2 lg:hidden">
              <span aria-hidden className="h-1 w-10 rounded-pill bg-border-strong" />
            </div>
          )}

          {(title || dismissible) && (
            <div className="flex items-start gap-3 px-4 pb-2 pt-1">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 id={idTitulo} className="truncate text-lg font-semibold tracking-tight">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={idDescricao} className="mt-0.5 text-sm text-fg-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="-mr-1 -mt-1 flex size-touch shrink-0 items-center justify-center rounded-pill text-fg-muted transition-transform active:scale-90"
                >
                  <X size={20} aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>

        <div
          ref={conteudoRef}
          className={cx(
            'min-h-0 flex-1 overflow-y-auto scroll-momentum px-4',
            alturaFixa ? 'grow' : '',
            footer ? 'pb-2' : 'pb-[calc(var(--safe-bottom)+1rem)]',
          )}
          style={alturaFixa ? { height: `calc(${snapMax * 100}svh)` } : undefined}
          onPointerDown={(e) => iniciarArraste(e, true)}
          onPointerMove={moverArraste}
          onPointerUp={soltarArraste}
          onPointerCancel={soltarArraste}
        >
          {children}
          {/* Colchón del pie compensado. Ver el bloque «El pie no puede quedar
              abajo de la pantalla». */}
          {reservaDoRodape > 0 && <div aria-hidden style={{ height: reservaDoRodape }} />}
        </div>

        {footer && (
          <motion.div
            style={{ y: compensacaoDoRodape }}
            className="shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(var(--safe-bottom)+0.75rem)]"
          >
            {footer}
          </motion.div>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}
