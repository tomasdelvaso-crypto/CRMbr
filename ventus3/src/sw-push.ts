// src/sw-push.ts
// Web Push dentro del service worker: 'push', 'notificationclick' y
// 'pushsubscriptionchange'.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO VIVE EN UN ARCHIVO APARTE
// ══════════════════════════════════════════════════════════════════════════
// `src/sw.ts` lo tocan dos frentes a la vez: el precache/offline y el push.
// Partido en dos, `sw.ts` importa esto con UNA línea y las dos ramas se funden
// sin conflicto. Registrar los listeners al importar (efecto de módulo) es
// deliberado: obliga a que el import esté ANTES de que el SW termine de
// evaluarse, que es el único momento en que se pueden registrar listeners de
// eventos funcionales sin perderse el primer push.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES REGLAS DE PRODUCTO QUE ESTE ARCHIVO IMPLEMENTA
// ══════════════════════════════════════════════════════════════════════════
// 1. NINGUNA NOTIFICACIÓN DICE «ABRA O APP». Toda notificación trae acciones
//    directas y aterriza EN la pantalla del negocio, con lo que hay que hacer
//    ya abierto. Es la diferencia entre «el bot me avisó» y «el bot me hizo
//    hacerlo».
// 2. LA MEDICIÓN NO LA HACE EL SW. Marcar `agido_em` necesita el JWT del
//    vendedor, y el service worker no tiene sesión: pedirla acá significaría
//    guardar un token en el SW, que es exactamente lo que no se hace. El SW
//    despierta a la app y la app —que sí tiene sesión— mide. Si no hay ninguna
//    ventana abierta, los datos van en la URL que se abre.
// 3. EL BADGE CUENTA LO PENDIENTE, NO LO RECIBIDO. Ver src/push/badge.ts.

/// <reference lib="webworker" />

// Los nombres de los mensajes viven en un módulo sin imports que compila igual
// con lib DOM y con lib WebWorker: el otro extremo del cable está en
// src/push/recepcao.ts y no puede haber dos strings distintos.
import { MENSAGEM_ASSINATURA_MUDOU, MENSAGEM_AVISO_CLICADO } from './push/mensagens'

declare const self: ServiceWorkerGlobalScope

/* ══════════════════════════════════════════════════════════════════════════
   Contrato del payload
   ══════════════════════════════════════════════════════════════════════════
   Lo escribe `payloadPush()` en api/dispatch/run.ts. Si cambia allá, cambia
   acá: son las dos puntas del mismo cable y no hay tipo compartido posible
   (el SW no puede importar de api/). */

interface AcaoDoAviso {
  rotulo?: string
  deep_link?: string
  callback?: string
}

interface PayloadDeAviso {
  id?: string
  tipo?: string
  titulo?: string
  corpo?: string
  deep_link?: string | null
  acoes?: AcaoDoAviso[]
  topic?: string
  colapsados?: number
}

/**
 * Botón de una notificación. Se declara acá porque `NotificationAction` no
 * está en la lib de TypeScript de este proyecto — y castear a `never` para
 * hacerlo pasar escondería el día que la forma cambie.
 */
interface AcaoNativa {
  action: string
  title: string
  icon?: string
}

/** Los iconos ya están en el precache: son los mismos del manifest. */
const ICONE = '/icon-192.png'
const DISTINTIVO = '/favicon.svg'

/** Título de último recurso. Nunca se muestra una notificación vacía. */
const TITULO_PADRAO = 'Ventus'
const CORPO_PADRAO = 'Tem algo esperando você no Ventus.'

/* ══════════════════════════════════════════════════════════════════════════
   push
   ══════════════════════════════════════════════════════════════════════════ */

function lerPayload(evento: PushEvent): PayloadDeAviso {
  if (evento.data === null) return {}
  try {
    return evento.data.json() as PayloadDeAviso
  } catch {
    // Un push sin JSON (una prueba desde DevTools, por ejemplo) igual tiene
    // que mostrar algo: `userVisibleOnly` obliga a mostrar SIEMPRE, y no
    // mostrar nada le cuesta a la app la suscripción entera.
    try {
      const texto = evento.data.text()
      return texto === '' ? {} : { corpo: texto }
    } catch {
      return {}
    }
  }
}

/**
 * Las acciones del payload → botones de la notificación.
 *
 * Máximo 2: Android muestra dos y descarta el resto sin avisar, y una tercera
 * opción invisible es peor que no ofrecerla. Se quedan las que tienen destino
 * (`deep_link`); las de `callback` son de Telegram y acá no significan nada.
 */
function acoesDaNotificacao(acoes: AcaoDoAviso[] | undefined): AcaoNativa[] {
  if (!Array.isArray(acoes)) return []
  const uteis: AcaoNativa[] = []
  for (let i = 0; i < acoes.length && uteis.length < 2; i += 1) {
    const acao = acoes[i]
    if (acao === undefined) continue
    const rotulo = typeof acao.rotulo === 'string' ? acao.rotulo.trim() : ''
    const destino = typeof acao.deep_link === 'string' ? acao.deep_link.trim() : ''
    if (rotulo === '' || destino === '') continue
    uteis.push({ action: `ir:${String(i)}`, title: rotulo })
  }
  return uteis
}

/** Cuántas notificaciones quedan sin atender, para el badge. */
async function atualizarDistintivo(): Promise<void> {
  const badge = self.navigator as WorkerNavigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (typeof badge.setAppBadge !== 'function') return
  try {
    const abertas = await self.registration.getNotifications()
    if (abertas.length === 0) await badge.clearAppBadge?.()
    else await badge.setAppBadge(Math.min(abertas.length, 99))
  } catch {
    /* el badge es decoración útil, nunca una garantía */
  }
}

async function mostrar(payload: PayloadDeAviso): Promise<void> {
  const titulo = (payload.titulo ?? '').trim() || TITULO_PADRAO
  const corpo = (payload.corpo ?? '').trim() || CORPO_PADRAO
  const acoes = acoesDaNotificacao(payload.acoes)

  await self.registration.showNotification(titulo, {
    body: corpo,
    icon: ICONE,
    badge: DISTINTIVO,
    // `tag` = topic: un aviso nuevo del mismo tema REEMPLAZA al anterior en
    // vez de apilarse. Es la mitad del presupuesto de avisos del plano.
    tag: payload.topic ?? payload.tipo ?? 'ventus',
    // Sin `renotify`: reemplazar no puede volver a vibrar. El vendedor ya fue
    // interrumpido una vez por este tema.
    renotify: false,
    data: {
      id: payload.id ?? null,
      tipo: payload.tipo ?? null,
      deep_link: payload.deep_link ?? null,
      acoes: payload.acoes ?? [],
    },
    ...(acoes.length > 0 ? { actions: acoes } : {}),
  } as NotificationOptions)

  await atualizarDistintivo()
}

self.addEventListener('push', (evento: PushEvent) => {
  // `waitUntil` obligatorio: sin esto el SW puede morir antes de mostrar y el
  // navegador castiga la suscripción con su propia notificación genérica.
  evento.waitUntil(mostrar(lerPayload(evento)))
})

/* ══════════════════════════════════════════════════════════════════════════
   notificationclick
   ══════════════════════════════════════════════════════════════════════════ */

interface DadosDaNotificacao {
  id?: string | null
  tipo?: string | null
  deep_link?: string | null
  acoes?: AcaoDoAviso[]
}

/** A dónde lleva este toque: la acción tocada, o el deep link del aviso. */
function destinoDe(dados: DadosDaNotificacao, acaoTocada: string): string {
  const indice = acaoTocada.startsWith('ir:') ? Number(acaoTocada.slice(3)) : -1
  if (Number.isInteger(indice) && indice >= 0) {
    const acao = Array.isArray(dados.acoes) ? dados.acoes[indice] : undefined
    const destino = typeof acao?.deep_link === 'string' ? acao.deep_link.trim() : ''
    if (destino !== '') return destino
  }
  const principal = typeof dados.deep_link === 'string' ? dados.deep_link.trim() : ''
  // Nunca la raíz pelada: `/` con el aviso en la query deja rastro para medir.
  return principal !== '' ? principal : '/'
}

/** Deja el destino como una URL absoluta del propio origen. */
function urlAbsoluta(destino: string): URL {
  try {
    const url = new URL(destino, self.location.origin)
    // Fail-closed: un deep_link a otro origen no abre nada fuera de la app.
    if (url.origin !== self.location.origin) return new URL('/', self.location.origin)
    return url
  } catch {
    return new URL('/', self.location.origin)
  }
}

async function abrir(destino: string, dados: DadosDaNotificacao, acao: string): Promise<void> {
  const url = urlAbsoluta(destino)

  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const viva = janelas.find((c) => c.url.startsWith(self.location.origin))

  if (viva !== undefined) {
    // Hay app abierta: ella tiene la sesión, así que ella navega y ella mide.
    // Navegar desde el SW y además mandar el mensaje haría dos navegaciones.
    viva.postMessage({
      type: MENSAGEM_AVISO_CLICADO,
      id: dados.id ?? null,
      tipo: dados.tipo ?? null,
      acao,
      para: `${url.pathname}${url.search}`,
    })
    try {
      await viva.focus()
    } catch {
      /* algunos navegadores no dejan enfocar sin gesto: el mensaje ya salió */
    }
    return
  }

  // No hay app abierta: los datos de medición viajan en la URL y la app los
  // consume al arrancar. Sin esto, todo aviso que llega con la app cerrada
  // —o sea, casi todos— quedaría sin `agido_em` y la métrica mentiría.
  if (dados.id !== null && dados.id !== undefined && dados.id !== '') {
    url.searchParams.set('aviso', dados.id)
    if (acao !== '') url.searchParams.set('aviso_acao', acao)
  }
  await self.clients.openWindow(`${url.pathname}${url.search}`)
}

self.addEventListener('notificationclick', (evento: NotificationEvent) => {
  const dados = (evento.notification.data ?? {}) as DadosDaNotificacao
  const acao = evento.action ?? ''
  evento.notification.close()
  evento.waitUntil(
    (async () => {
      await abrir(destinoDe(dados, acao), dados, acao)
      await atualizarDistintivo()
    })(),
  )
})

self.addEventListener('notificationclose', (evento: NotificationEvent) => {
  // Cerrar sin tocar también baja el badge: lo pendiente es lo que espera una
  // decisión, y descartar el aviso ya fue una.
  evento.waitUntil(atualizarDistintivo())
})

/* ══════════════════════════════════════════════════════════════════════════
   pushsubscriptionchange
   ══════════════════════════════════════════════════════════════════════════
   El navegador puede rotar la suscripción por su cuenta (Chrome lo hace tras
   una actualización o una limpieza de datos). Si no se re-suscribe, el
   vendedor deja de recibir avisos y NADIE se entera: no hay error visible.
   Acá se re-suscribe con la MISMA clave y se avisa a la app, que es la que
   tiene sesión para guardar la fila nueva. */

interface EventoDeMudancaDeAssinatura extends ExtendableEvent {
  readonly oldSubscription?: PushSubscription | null
  readonly newSubscription?: PushSubscription | null
}

async function reassinar(evento: EventoDeMudancaDeAssinatura): Promise<void> {
  try {
    let nova = evento.newSubscription ?? null
    if (nova === null) {
      const chave = evento.oldSubscription?.options.applicationServerKey ?? null
      if (chave === null) return
      nova = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chave,
      })
    }
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const janela of janelas) {
      janela.postMessage({ type: MENSAGEM_ASSINATURA_MUDOU, endpoint: nova.endpoint })
    }
  } catch (erro) {
    console.error('[sw-push] não deu para reassinar:', erro)
  }
}

self.addEventListener('pushsubscriptionchange', (evento: Event) => {
  const e = evento as EventoDeMudancaDeAssinatura
  e.waitUntil(reassinar(e))
})
