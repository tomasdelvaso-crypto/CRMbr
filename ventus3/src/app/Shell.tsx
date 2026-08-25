// src/app/Shell.tsx
// El chrome de la app: header, contenido, bottom nav, FAB de micrófono y la
// dirección de las transiciones de pila.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
//
// 1. LA GUARDIA DE SESIÓN VIVE ACÁ Y NO EN EL ROUTER. `routes.tsx` está
//    cableado y es lo que montan los smoke tests, que corren SIN
//    SessionProvider. Por eso la guardia sólo actúa cuando hay contexto de
//    sesión de verdad: sin provider (test, render aislado) el Shell pinta
//    igual, y con provider redirige a /login guardando a dónde iba.
//
// 2. EL FAB DE MICRÓFONO LLEVA EL BADGE DEL OUTBOX. Es el único lugar donde
//    el vendedor ve, sin buscarla, la respuesta a «lo que dicté se guardó?».
//    El contador sale de `usePendentesDoOutbox()`, que escucha el store del
//    outbox y no una query: el badge tiene que aparecer en el mismo frame en
//    que la nota se encola, que es cuando la persona todavía está mirando.
//
// 3. LA DIRECCIÓN DE LA TRANSICIÓN SE DECIDE POR PROFUNDIDAD DE RUTA.
//    `direcaoEntreRotas` compara segmentos: /carteira → /carteira/46 es push,
//    la vuelta es pop. Se escribe en `data-vt` dentro de un LAYOUT effect
//    porque ese render ocurre DENTRO del callback de startViewTransition que
//    dispara react-router, y el CSS de `::view-transition-*` se lee cuando la
//    animación arranca — un `useEffect` normal llegaría tarde.
//
// 4. LA GOLDEN HOUR NO TIENE CHROME. Modo foco: sin header, sin nav, sin FAB,
//    sin barra de comando. Una salida lateral durante la Golden Hour es la
//    forma más barata de que la Golden Hour no ocurra.

import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Mic, WifiOff } from 'lucide-react'
import { BottomNav } from './BottomNav'
import { SessionContext } from './session-context'
import { useContagemRevisao, useEstaOnline, usePendentesDoOutbox } from '@/data'
import { BarraDeComando } from '@/screens/Ventus/BarraDeComando'
import { barraDeComandoVisivel } from '@/screens/Ventus/rotas'
import { ConfirmHost, Skeleton, ToastHost, direcaoEntreRotas, haptic } from '@/ui'

/** Títulos del header por ruta. En PT-BR, como todo lo visible. */
const TITULOS: Readonly<Record<string, string>> = {
  '/': 'Hoje',
  '/carteira': 'Carteira',
  '/golden': 'Golden Hour',
  '/revisao': 'Revisão do Ventus',
  '/mais': 'Mais',
  '/cadencia': 'Cadência',
  '/placar': 'Placar da Semana',
  '/rituais': 'Rituais',
  '/ventus': 'Ventus',
  '/gestor': 'Painel do Gestor',
  '/ajustes': 'Ajustes',
  '/registrar': 'Registrar',
  '/instalar': 'Instalar o app',
  '/kitchen': 'Kitchen Sink',
}

/**
 * Rutas que necesitan más ancho que la columna de teléfono.
 *
 * El resto de la app vive en `max-w-lg` a propósito: es una app de campo que
 * se usa con una mano. El Painel do Gestor es la excepción declarada del
 * PLANO —«optimizada para tablet y desktop, usable en teléfono»— porque
 * comparar seis vendedores en una columna de 32rem obliga a scrollear para
 * comparar, que es justo lo que el panel existe para no hacer.
 */
const ROTAS_LARGAS: readonly string[] = ['/gestor']

function larguraDe(pathname: string): string {
  return ROTAS_LARGAS.includes(pathname) ? 'max-w-5xl' : 'max-w-lg'
}

function tituloDe(pathname: string): string {
  const exato = TITULOS[pathname]
  if (exato) return exato
  // /carteira/46 → la ficha trae su propio título en el header interno.
  if (pathname.startsWith('/carteira/')) return 'Dossiê'
  return 'Ventus'
}

/**
 * Escribe la dirección de la transición antes de que el navegador anime.
 * Ver la decisión 3 del encabezado.
 */
function useDirecaoDaTransicao(pathname: string): void {
  const anterior = useRef(pathname)

  useLayoutEffect(() => {
    if (anterior.current === pathname) return
    const direcao = direcaoEntreRotas(anterior.current, pathname)
    anterior.current = pathname
    if (typeof document === 'undefined') return
    document.documentElement.dataset['vt'] = direcao
  }, [pathname])

  // La limpieza va aparte y en un efecto normal: si `data-vt` quedara puesto,
  // la siguiente transición (un morph del Dossiê, por ejemplo) heredaría la
  // gramática equivocada.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const id = window.setTimeout(() => {
      delete document.documentElement.dataset['vt']
    }, 400)
    return () => window.clearTimeout(id)
  }, [pathname])
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const titulo = tituloDe(location.pathname)
  const largura = larguraDe(location.pathname)

  useDirecaoDaTransicao(location.pathname)

  // Contador de la Revisão. Se lee acá y no dentro de BottomNav porque el hook
  // también pinta navigator.setAppBadge, y eso tiene que pasar UNA vez por app,
  // no una vez por render de la nav. Sin sesión no hay bandeja que contar.
  const sessao = useContext(SessionContext)
  const pendentesRevisao = useContagemRevisao(sessao?.vendorName ?? null)
  const pendentesOutbox = usePendentesDoOutbox()
  const online = useEstaOnline()

  // La Golden Hour es modo foco: sin header, sin nav, sin salidas laterales.
  const modoFoco = location.pathname.startsWith('/golden')

  // El FAB manda a /registrar. Estando YA en /registrar sería un botón que no
  // hace nada y que además tapa la barra de acción con «Confirmar» —el último
  // toque del camino feliz—. Se esconde, no se deshabilita.
  const mostrarFab = !location.pathname.startsWith('/registrar')
  // Y se apoya sobre la barra de comando sólo cuando la barra existe: si no,
  // queda flotando 4rem por encima de una franja vacía.
  const comBarra = barraDeComandoVisivel(location.pathname, sessao?.vendorName ?? null)
  const alturaDoFab = comBarra
    ? 'calc(var(--spacing-nav) + env(safe-area-inset-bottom, 0px) + 5rem)'
    : 'calc(var(--spacing-nav) + env(safe-area-inset-bottom, 0px) + 1rem)'

  // ── Guardia de sesión ──────────────────────────────────────────────────
  // Sólo cuando hay provider de verdad. Ver la decisión 1.
  if (sessao) {
    if (sessao.loading) return <EsqueletoDeArranque />
    if (!sessao.session) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    }
  }

  if (modoFoco) {
    return (
      <div className="min-h-screen-svh bg-bg text-fg">
        <Outlet />
        {/* Los hosts van fuera del scroll: son portales a document.body. */}
        <ToastHost />
        <ConfirmHost />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen-svh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-safe pt-safe backdrop-blur">
        <div className={`mx-auto flex h-14 ${largura} items-center justify-between gap-3 px-4`}>
          <h1 className="truncate text-lg font-semibold tracking-tight">{titulo}</h1>
          {/* Sin red: se dice, no se esconde. El vendedor sigue registrando
              igual —todo va al outbox—, pero tiene que saber por qué la
              carteira de hoy puede estar un toque vieja. */}
          {!online && (
            <span
              role="status"
              className="flex shrink-0 items-center gap-1.5 rounded-pill bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn-soft-fg"
            >
              <WifiOff size={13} aria-hidden />
              Sem conexão
            </span>
          )}
        </div>
      </header>

      <main className={`mx-auto w-full ${largura} flex-1 px-safe pb-nav-safe`}>
        <Outlet />
      </main>

      {/* FAB de micrófono: registrar por voz tiene que costar menos que abrir
          la libreta. El offset sube 4rem cuando está la barra de comando del
          Ventus, que ocupa la franja inmediatamente encima de la nav. El badge
          cuenta lo que el outbox todavía no pudo enviar. */}
      {mostrarFab && (
      <button
        type="button"
        aria-label={
          pendentesOutbox > 0
            ? `Registrar por voz. ${pendentesOutbox} ${pendentesOutbox === 1 ? 'registro pendente de envio' : 'registros pendentes de envio'}`
            : 'Registrar por voz'
        }
        onClick={() => {
          haptic('impact')
          void navigate('/registrar')
        }}
        className="fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg transition-transform active:scale-95"
        style={{ bottom: alturaDoFab }}
      >
        <Mic size={24} aria-hidden />
        {pendentesOutbox > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-bg bg-warn px-1 text-[10px] font-bold leading-4 text-warn-fg"
          >
            {pendentesOutbox > 99 ? '99+' : pendentesOutbox}
          </span>
        )}
      </button>
      )}

      {/* Barra persistente do Ventus: perguntar tem que custar menos que
          navegar. Ela mesma se esconde no modo foco e nas telas de captura. */}
      <BarraDeComando />

      <BottomNav badges={{ revisao: pendentesRevisao }} />

      {/* Únicos canales de feedback efímero y de confirmación de la app.
          Montados una sola vez acá: reemplazan a los 27 alert()/confirm(). */}
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}

/**
 * Arranque en frío: la silueta del Shell con una lista adentro. Un spinner
 * acá haría saltar la pantalla entera cuando `getSession()` resuelve.
 */
function EsqueletoDeArranque() {
  return (
    <div className="flex min-h-screen-svh flex-col bg-bg text-fg">
      <header className="border-b border-border px-safe pt-safe">
        <div className="mx-auto flex h-14 max-w-lg items-center px-4">
          <span className="sr-only">Carregando o Ventus</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-safe">
        <div className="px-4 py-6">
          <Skeleton variant="card-acao" count={2} />
        </div>
      </main>
    </div>
  )
}
