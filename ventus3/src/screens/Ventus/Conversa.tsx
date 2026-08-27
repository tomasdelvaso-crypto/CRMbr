// src/screens/Ventus/Conversa.tsx
// La lista de burbujas + el compositor. Se usa igual en la pantalla /ventus y
// dentro del bottom sheet de la barra de comando, así que no sabe nada de
// rutas ni de layout: recibe el estado y lo pinta.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Chip, EmptyState, useAlturaDoTeclado } from '@/ui'
import { Compositor } from './Compositor'
import { Mensagem } from './Mensagem'
import { SUGESTOES } from './sugestoes'
import type { EstadoConversa } from './useConversa'

export interface ConversaProps {
  conversa: EstadoConversa
  /** Nombre del cliente cuando el chat abre desde una ficha. */
  contexto?: string | null
  /** Cierra el contenedor (el sheet) al navegar a otro lado. */
  onNavegar?: () => void
  autoFocus?: boolean
  className?: string
  /**
   * `true` cuando quien pinta esta Conversa (hoy, sólo `BarraDeComando`) ya
   * va a poner el compositor en OTRO lugar — el `footer` del Sheet — y no acá
   * adentro.
   *
   * Por qué hace falta: el Sheet con `snapPoints` mide su contenido SIEMPRE
   * contra el snap MÁS ALTO (ver el comentario grande en Sheet.tsx, «El pie
   * no puede quedar abajo de la pantalla»), así que un compositor `sticky
   * bottom-0` que vive ACÁ ADENTRO —como children, no como `footer`— queda
   * pegado al fondo de una caja más alta que lo que el snap bajo muestra. Con
   * una conversa corta (recién abierta, sin mensajes todavía) esa caja tiene
   * mucho aire vacío abajo, y el compositor termina literalmente fuera de la
   * pantalla en el snap de apertura (0,6): el vendedor ve la lista de
   * sugerencias y nada más, ni una línea del campo de texto.
   *
   * El `footer` del Sheet no tiene este problema: es un hijo de flex NORMAL
   * del panel —no de la caja de contenido con altura fija— así que queda
   * pegado al fondo VISIBLE del panel en cualquier snap, con la compensación
   * de transform que el propio Sheet ya calcula. `BarraDeComando` arma ese
   * compositor aparte (mismo componente `Compositor`, mismo estado de
   * rascunho) y lo cuelga de `footer`; acá simplemente no se repite.
   */
  semCompositor?: boolean
}

export function Conversa({
  conversa,
  contexto,
  onNavegar,
  autoFocus = false,
  className,
  semCompositor = false,
}: ConversaProps) {
  const navigate = useNavigate()
  const [rascunho, setRascunho] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  // Scroll al final con cada token. `block:'end'` y no scrollTop: el sheet y
  // la página tienen contenedores de scroll distintos y esto funciona en los dos.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [conversa.mensagens])

  /*
   * Bug real de campo (primer teste em Android físico): con el teclado
   * abierto, el compositor desaparecía atrás — quedaba visible apenas una
   * linha fina do seu topo. El motivo: `sticky bottom-0` ancla al borde
   * inferior del contenedor de scroll, y ESE borde no se mueve cuando el
   * teclado abre — en Android el layout viewport no se redimensiona (ver
   * useTeclado.ts, bug M22), solo el visualViewport se achica. `bottom: 0`
   * queda entonces exactamente donde el teclado tapa.
   *
   * `useAlturaDoTeclado()` ya existía —lo usa Registrar para su barra
   * `position: fixed`— pero acá adentro nunca se conectó: el Ventus se quedó
   * con el `sticky bottom-0` sordo al teclado. La cuenta es la misma que ahí,
   * aplicada al `bottom` del sticky en vez de a un `translateY`: sin teclado,
   * `alturaTeclado` es 0 y no cambia nada.
   */
  const alturaTeclado = useAlturaDoTeclado()

  const enviar = () => {
    const texto = rascunho
    setRascunho('')
    void conversa.enviar(texto)
  }

  const vazio = conversa.mensagens.length === 0

  return (
    <div className={className}>
      {conversa.emMock && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn-soft-fg">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            O Ventus ainda não está ligado neste ambiente. As respostas abaixo são
            simuladas — o que vem do motor determinístico continua sendo real.
          </span>
        </p>
      )}

      {vazio ? (
        <div className="py-6">
          <EmptyState
            icon={<Sparkles size={28} aria-hidden />}
            title={contexto != null ? `Pergunte sobre ${contexto}` : 'Pergunte qualquer coisa'}
            description="Pendências, status de cliente, pipeline e compromissos saem na hora, sem internet. O resto eu penso."
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGESTOES.map((s) => (
              <Chip
                key={s}
                tone="marca"
                onClick={() => {
                  void conversa.enviar(s)
                }}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-4" aria-live="polite" aria-atomic="false">
          {conversa.mensagens.map((m) => (
            <Mensagem
              key={m.id}
              mensagem={m}
              decisoes={conversa.decisoes}
              previewOcupado={conversa.previewOcupado}
              onConfirmarPreview={(p) => void conversa.confirmarPreview(p)}
              onRecusarPreview={(p) => void conversa.recusarPreview(p)}
              onVotar={(voto, motivo) => {
                conversa.votar(m.id, voto, motivo)
              }}
              onAtalho={(a) => {
                onNavegar?.()
                if (a.opportunityId !== undefined) {
                  void navigate(`/carteira/${String(a.opportunityId)}`)
                } else if (a.rota !== undefined) {
                  void navigate(a.rota)
                }
              }}
            />
          ))}
        </ul>
      )}

      <div ref={fim} />

      {!semCompositor && (
        <div
          className="sticky z-10 -mx-1 mt-4 bg-bg/95 px-1 pb-1 pt-2 backdrop-blur"
          style={{
            /*
             * SIN teclado, `bottom: 0` NO alcanza. Un `position: sticky` se
             * pega al borde del SCROLLPORT —acá, el viewport— y el borde de
             * abajo del viewport es justamente donde vive la bottom nav
             * (`fixed inset-x-0 bottom-0 z-40`). El `pb-nav-safe` del `<main>`
             * empuja el CONTENIDO en flujo, pero un sticky no se entera: se
             * pegaba a 0 y quedaba TAPADO por la nav y por el FAB.
             *
             * Medido a 360x640 (el Android del dueño): «Enviar» caía en
             * y=585..629 con la nav ocupando 576..640, y Playwright fallaba
             * con «<nav aria-label="Navegação principal"> … intercepts
             * pointer events». En el teléfono eso es un botón de enviar que
             * no se puede tocar — el dueño llegó a escribir y no pudo mandar.
             *
             * CON teclado la cuenta cambia: la nav queda ella misma detrás
             * del teclado (en Android el layout viewport no se achica, ver
             * useTeclado.ts), así que reservar su alto de nuevo sería un
             * hueco muerto. Se levanta sólo lo que mide el teclado.
             *
             * Es la misma bifurcación que ya hace Registrar para su barra
             * fija (ver `paddingBottom` en Registrar/index.tsx).
             */
            bottom:
              alturaTeclado > 0
                ? alturaTeclado
                : 'calc(var(--spacing-nav-visivel) + var(--safe-bottom))',
          }}
        >
          <Compositor
            valor={rascunho}
            onChange={setRascunho}
            onEnviar={enviar}
            enviando={conversa.enviando}
            onParar={conversa.parar}
            autoFocus={autoFocus}
            {...(contexto != null ? { placeholder: `Pergunte sobre ${contexto}` } : {})}
          />
        </div>
      )}
    </div>
  )
}
