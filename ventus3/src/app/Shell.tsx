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
// 2. EL BOTÓN DE MICRÓFONO LLEVA EL BADGE DEL OUTBOX. Es el único lugar donde
//    el vendedor ve, sin buscarla, la respuesta a «lo que dicté se guardó?».
//    El contador sale de `usePendentesDoOutbox()`, que escucha el store del
//    outbox y no una query: el badge tiene que aparecer en el mismo frame en
//    que la nota se encola, que es cuando la persona todavía está mirando.
//
//    Y DONDE HAY BARRA DE COMANDO, EL MICRÓFONO VIVE DENTRO DE ELLA. Antes
//    flotaba encima, a 5rem del piso: dos capas de chrome fijo, 122 px, sobre
//    la primera tarjeta de Hoje en un teléfono de 664 px. La barra ya tenía un
//    micrófono propio que abría el MISMO sheet que su campo de texto —o sea,
//    redundante— y ese es el lugar que ocupa ahora el de Registrar. Resultado:
//    una sola franja de chrome, un solo micrófono, y cero superposición sobre
//    el contenido. Flotando queda sólo donde no hay barra.
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
import { DesktopRail } from './DesktopRail'
import { SessaoSemVendedor } from './SessaoSemVendedor'
import { SessionContext, type SessionContextValue } from './session-context'
import {
  useContagemRevisao,
  useDiaVigente,
  useEstaOnline,
  usePendentesDoOutbox,
  usePlanoFixado,
} from '@/data'
import { definirBadge } from '@/push'
import { BarraDeComando } from '@/screens/Ventus/BarraDeComando'
import { barraDeComandoVisivel, microfoneFlutuanteVisivel } from '@/screens/Ventus/rotas'
import { ConfirmHost, Skeleton, ToastHost, confirmar, direcaoEntreRotas, haptic } from '@/ui'
import { larguraDe } from './largura'

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
 * Ancho de la columna de contenido: vive en `largura.ts` porque lo comparten
 * el header, el <main> y la BarraDeComando del Ventus. Tener el número dos
 * veces es exactamente lo que hacía que la barra flotara desalineada de la
 * columna que dice comandar.
 */

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

/**
 * La salida de la pantalla de «sessão sem vendedor». Con confirmación porque
 * el dispositivo puede llevar registros de OTRO vendedor esperando en el
 * outbox —el outbox no filtra por sesión— y salir sin avisar los dejaría
 * varados hasta el próximo login.
 */
async function sairSemVendedor(
  sessao: SessionContextValue,
  navigate: (to: string, opts?: { replace?: boolean }) => void,
): Promise<void> {
  const ok = await confirmar({
    title: 'Sair da conta?',
    description: 'Você ainda não está ligado a um vendedor, então não há nada seu pendente de envio. Para voltar, é só entrar de novo.',
    confirmLabel: 'Sair',
    tone: 'perigo',
  })
  if (!ok) return
  await sessao.signOut()
  navigate('/login', { replace: true })
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const titulo = tituloDe(location.pathname)
  const largura = larguraDe(location.pathname)

  useDirecaoDaTransicao(location.pathname)

  // Contador de la Revisão. Se lee acá y no dentro de BottomNav porque el badge
  // del sistema operativo se pinta UNA vez por app, no una vez por render de la
  // nav. Sin sesión no hay bandeja que contar.
  const sessao = useContext(SessionContext)
  const vendorName = sessao?.vendorName ?? null
  const pendentesRevisao = useContagemRevisao(vendorName)
  const pendentesOutbox = usePendentesDoOutbox()
  const online = useEstaOnline()

  // ── El badge del ícono ────────────────────────────────────────────────
  // Cuenta LO QUE ESPERA UNA DECISIÓN: las tarjetas del día que siguen sin
  // resolver más las propuestas del Ventus sin revisar. No cuenta avisos —un
  // badge de avisos es el mismo ruido que ya mató las notificaciones del v2, y
  // encima uno que no se puede silenciar.
  //
  // Vive en el Shell y en ningún otro lado: el badge es UNO solo y dos
  // escritores se pisan (el que corre último gana y el número queda a medias).
  // La query del plano es la MISMA que usa Hoje —misma queryKey—, así que no
  // agrega ni una lectura: react-query la comparte.
  const hoje = useDiaVigente()
  const plano = usePlanoFixado(vendorName, hoje)
  const dadosDoPlano = plano.data
  const pendentesDoDia =
    dadosDoPlano === undefined ? 0 : dadosDoPlano.fixadas.length - dadosDoPlano.resolvidas

  useEffect(() => {
    // `definirBadge(0)` limpia el badge en vez de pintar un cero, así que el
    // llegar a cero se apaga solo. Sin sesión tampoco hay nada que contar.
    void definirBadge(vendorName === null ? 0 : pendentesDoDia + pendentesRevisao)
  }, [vendorName, pendentesDoDia, pendentesRevisao])

  // La Golden Hour es modo foco: sin header, sin nav, sin salidas laterales.
  const modoFoco = location.pathname.startsWith('/golden')

  // El micrófono manda a /registrar. Estando YA en /registrar sería un botón
  // que no hace nada y que además tapa la barra de acción con «Confirmar» —el
  // último toque del camino feliz—. Se esconde, no se deshabilita.
  const mostrarMicrofone = !location.pathname.startsWith('/registrar')
  const comBarra = barraDeComandoVisivel(location.pathname, sessao?.vendorName ?? null)

  // El FAB FLOTANTE tiene una regla más estricta que el micrófono del rail o
  // el de la barra: es `fixed z-40` sobre el contenido, así que en las rutas
  // que traen su propio compositor pegado abajo le queda ENCIMA del botón de
  // enviar. Ver `microfoneFlutuanteVisivel` en Ventus/rotas.ts — ahí está la
  // medición y el porqué. El del DesktopRail no entra en este pleito: vive en
  // una columna propia y el FAB ya es `lg:hidden`.
  const mostrarMicrofoneFlutuante =
    mostrarMicrofone && microfoneFlutuanteVisivel(location.pathname)

  const rotuloDoMicrofone =
    pendentesOutbox > 0
      ? `Registrar por voz. ${String(pendentesOutbox)} ${pendentesOutbox === 1 ? 'registro pendente de envio' : 'registros pendentes de envio'}`
      : 'Registrar por voz'
  const irRegistrar = () => {
    haptic('impact')
    void navigate('/registrar')
  }

  // ── La reserva del chrome de abajo ────────────────────────────────────
  // Todo lo que scrollea resta `--spacing-chrome` de su alto (ver index.css).
  // Se escribe en <html> y no en el <div> de acá porque los portales —Sheet,
  // Toast, Confirm— cuelgan de <body> y no verían la variable.
  //
  // Va en un LAYOUT effect: si se escribiera en un efecto normal, el primer
  // frame de cada navegación mediría el scroll con la reserva de la pantalla
  // anterior y la lista saltaría.
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const raiz = document.documentElement
    raiz.style.setProperty('--spacing-chrome', comBarra ? 'var(--spacing-ventus)' : '0px')
    return () => {
      raiz.style.removeProperty('--spacing-chrome')
    }
  }, [comBarra])

  // ── Guardia de sesión ──────────────────────────────────────────────────
  // Sólo cuando hay provider de verdad. Ver la decisión 1.
  if (sessao) {
    if (sessao.loading) return <EsqueletoDeArranque />
    if (!sessao.session) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />
    }

    // ── Sesión sin vendedor: UNA sola pantalla, para TODAS las rutas ──────
    // `resolverVendorDaSessao` volvió null: hay usuario de auth pero ninguna
    // fila de `vendors` lo reclama. Es el modo de falla de cualquier cuenta
    // nueva mal dada de alta, y antes de esta guardia cada pantalla lo vivía
    // a su manera —o no lo vivía—: Hoje se quedaba en esqueletos, la mayoría
    // ni se enteraba. Se corta acá, una vez, para las 14 rutas de una sola
    // vez, y se deja el chrome (header + nav) para que la única salida
    // disponible no sea recargar la app a mano.
    if (sessao.vendorAusente) {
      return (
        <div className="flex min-h-screen-svh flex-col bg-bg text-fg lg:pl-60">
          <DesktopRail
            isAdmin={false}
            mostrarMicrofone={false}
            rotuloDoMicrofone={rotuloDoMicrofone}
            pendentesOutbox={0}
            onRegistrar={irRegistrar}
          />
          <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-safe pt-safe backdrop-blur">
            <div className="mx-auto flex h-14 max-w-lg items-center px-4 lg:max-w-2xl">
              <h1 className="truncate text-lg font-semibold tracking-tight">Ventus</h1>
            </div>
          </header>
          <main className="mx-auto w-full max-w-lg flex-1 px-safe pb-nav-safe lg:max-w-2xl">
            <SessaoSemVendedor
              onTentar={sessao.revalidarVendor}
              onSair={() => void sairSemVendedor(sessao, navigate)}
            />
          </main>
          <BottomNav />
          <ToastHost />
          <ConfirmHost />
        </div>
      )
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
    <div className="flex min-h-screen-svh flex-col bg-bg text-fg lg:pl-60">
      {/* Rail lateral: reemplaza a la BottomNav en lg+ (≥1024px). Ver
          DesktopRail.tsx — mismos 5 destinos + Gestor (si admin) + Ajustes,
          el micrófono como acción destacada y el indicador de perfil al pie. */}
      <DesktopRail
        isAdmin={sessao?.isAdmin === true}
        mostrarMicrofone={mostrarMicrofone}
        rotuloDoMicrofone={rotuloDoMicrofone}
        pendentesOutbox={pendentesOutbox}
        onRegistrar={irRegistrar}
      />

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

      {/* Sin barra de comando el micrófono flota, a 1rem por encima de la nav.
          Con barra, va DENTRO de ella (ver la decisión 2). El badge cuenta lo
          que el outbox todavía no pudo enviar.

          `lg:hidden`: en escritorio esta acción vive en el DesktopRail (ver la
          decisión 2 de ese archivo) — un FAB flotando sobre un monitor de 27"
          es la misma rareza que un bottom sheet ahí abajo. */}
      {mostrarMicrofoneFlutuante && !comBarra && (
        <button
          type="button"
          aria-label={rotuloDoMicrofone}
          onClick={irRegistrar}
          className="fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg transition-transform active:scale-95 lg:hidden"
          style={{ bottom: 'calc(var(--spacing-nav) + env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <Mic size={24} aria-hidden />
          <BadgeDoOutbox pendentes={pendentesOutbox} />
        </button>
      )}

      {/* Barra persistente do Ventus: perguntar tem que custar menos que
          navegar. Ela mesma se esconde no modo foco e nas telas de captura. */}
      <BarraDeComando
        acao={
          mostrarMicrofone ? (
            <button
              type="button"
              aria-label={rotuloDoMicrofone}
              onClick={irRegistrar}
              className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg active:bg-brand-strong lg:hidden"
            >
              <Mic size={20} aria-hidden />
              <BadgeDoOutbox pendentes={pendentesOutbox} />
            </button>
          ) : null
        }
      />

      <BottomNav badges={{ revisao: pendentesRevisao }} />

      {/* Únicos canales de feedback efímero y de confirmación de la app.
          Montados una sola vez acá: reemplazan a los 27 alert()/confirm(). */}
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}

/**
 * El contador de lo que el outbox todavía no pudo enviar. `aria-hidden` porque
 * el mismo número ya está en el `aria-label` del botón, escrito en palabras:
 * repetirlo sería leerlo dos veces.
 */
function BadgeDoOutbox({ pendentes }: { pendentes: number }) {
  if (pendentes <= 0) return null
  return (
    <span
      aria-hidden
      className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border-2 border-bg bg-warn px-1 text-[10px] font-bold leading-4 text-warn-fg"
    >
      {pendentes > 99 ? '99+' : pendentes}
    </span>
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
