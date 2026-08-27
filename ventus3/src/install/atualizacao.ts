// src/install/atualizacao.ts
// La actualización de la app, del lado del cliente.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ NO SE RECARGA SOLA
// ══════════════════════════════════════════════════════════════════════════
// `registerType: 'prompt'` (vite.config.ts) existe por una razón concreta: el
// vendedor puede estar dictando una nota de 40 segundos con la pantalla
// apagada contra la oreja. Un `location.reload()` automático en ese momento
// tira la grabación a la basura y nadie entiende por qué.
//
// Entonces: cuando hay versión nueva CON LA APP ABIERTA, `src/main.tsx` emite
// el evento `ventus:update-available`; la capa PWA lo escucha y muestra un
// toast «Nova versão disponível · Atualizar». La recarga la decide la persona.
//
// ══════════════════════════════════════════════════════════════════════════
// …Y POR QUÉ, EN EL ARRANQUE EN FRÍO, SÍ SE APLICA SOLA
// ══════════════════════════════════════════════════════════════════════════
// El toast tiene un agujero que costó tres días de depuración: si el vendedor
// NO lo toca, el teléfono queda pegado al bundle viejo PARA SIEMPRE. Con el
// bundle de antes del arreglo de los endpoints, /api/ventus y /api/ingest
// nunca se alcanzaban y la app quedaba muda con el servidor sano.
//
// El arranque en frío —los primeros segundos del primer load, antes de que la
// persona toque nada— es el único momento en que recargar no le cuesta nada a
// nadie: no puede haber una nota de voz en curso porque no hubo ni un toque.
// Ahí se aplica sin preguntar. Después de la primera interacción, el toast.
//
// Este módulo NO importa nada de `main.tsx` a propósito: hablar con el
// service worker por la API estándar evita un ciclo de imports (main → App →
// capa PWA → main) que en producción se resuelve con un módulo a medio
// inicializar.

/** Evento que emite main.tsx cuando el SW nuevo quedó esperando. */
export const EVENTO_ATUALIZACAO = 'ventus:update-available'

/** Cada cuánto se le pregunta al servidor si hay versión nueva. */
export const INTERVALO_DE_CHECAGEM_MS = 60 * 60 * 1000

/** Mínimo entre dos chequeos disparados por volver a la app. */
const ESPERA_ENTRE_CHECAGENS_MS = 30 * 60 * 1000

/**
 * Ventana del arranque en frío.
 *
 * Ocho segundos: alcanza para que el service worker termine de instalarse y
 * dispare `waiting` en una red de campo, y es menos de lo que tarda cualquiera
 * en leer la pantalla y decidir qué hacer.
 */
export const JANELA_ARRANQUE_MS = 8_000

/**
 * Mínimo entre dos ofertas del toast al volver del background.
 *
 * Volver a la app cada dos minutos y encontrarse el mismo aviso es lo que hace
 * que la gente aprenda a ignorarlo — que es exactamente cómo se llega a un
 * teléfono pegado a un bundle de la semana pasada.
 */
export const ESPERA_PARA_REOFERECER_MS = 30 * 60 * 1000

/**
 * Cuántas veces se permite la recarga automática del arranque en frío.
 *
 * Una. Si SKIP_WAITING no prendiera —otra pestaña reteniendo al worker viejo,
 * un SW que no activa—, la red de contención de 3 s recargaría, el arranque
 * volvería a estar «en frío» y tendríamos un bucle de recargas infinito con el
 * vendedor mirando. Se marca en sessionStorage, que muere con la pestaña.
 */
const CHAVE_ARRANQUE = 'ventus.atualizacao.arranque'

let recarregando = false
let ultimaChecagem = 0
let ultimaOferta = 0

/** Momento en que se evaluó este módulo ≈ momento del load. */
const MOMENTO_DO_ARRANQUE = Date.now()

let houveInteracao = false

/**
 * Marca que la persona ya empezó a usar la app.
 *
 * Se llama desde `main.tsx` con los tres eventos que prueban que hay alguien
 * del otro lado; a partir del primero, el arranque deja de estar «en frío» y
 * cualquier actualización vuelve a pasar por el toast.
 */
export function marcarInteracao(): void {
  houveInteracao = true
}

/**
 * ¿Estamos en el arranque en frío?
 *
 * Tres condiciones, todas necesarias:
 *  · nadie tocó nada todavía (no puede haber una nota de voz en curso)
 *  · pasaron menos de 8 s desde el load
 *  · no aplicamos ya una actualización automática en esta pestaña
 */
export function emArranqueFrio(agora: number = Date.now()): boolean {
  if (houveInteracao) return false
  if (agora - MOMENTO_DO_ARRANQUE >= JANELA_ARRANQUE_MS) return false
  try {
    return sessionStorage.getItem(CHAVE_ARRANQUE) === null
  } catch {
    // Safari en modo privado: sin marca no hay red de contención contra el
    // bucle, así que se prefiere el toast.
    return false
  }
}

/** Deja la marca de «ya se aplicó una actualización sola en esta pestaña». */
function marcarArranqueAplicado(): void {
  try {
    sessionStorage.setItem(CHAVE_ARRANQUE, String(Date.now()))
  } catch {
    /* modo privado: el guard de emArranqueFrio() ya devolvió false */
  }
}

/**
 * Decide qué hacer con una versión nueva que acaba de quedar esperando.
 *
 * Aplicar sin preguntar SÓLO en el arranque en frío; en cualquier otro momento
 * la persona decide, porque puede estar dictando.
 */
export function atenderNovaVersao(oferecerToast: () => void): void {
  if (emArranqueFrio()) {
    marcarArranqueAplicado()
    void aplicarAtualizacao()
    return
  }
  ultimaOferta = Date.now()
  oferecerToast()
}

/**
 * ¿Toca volver a ofrecer el toast al regresar del background?
 *
 * Sí sólo si pasó media hora desde la última oferta. Antes de eso, la persona
 * ya lo vio y lo dejó pasar a propósito.
 */
export function deveReoferecer(agora: number = Date.now()): boolean {
  return agora - ultimaOferta >= ESPERA_PARA_REOFERECER_MS
}

function temServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Aplica la versión que está esperando y recarga.
 *
 * El orden importa: primero se engancha `controllerchange` y recién después
 * se manda SKIP_WAITING. Al revés, el worker nuevo puede tomar el control
 * antes de que estemos escuchando y la página se queda con la versión vieja
 * pintada hasta el próximo arranque.
 */
export async function aplicarAtualizacao(): Promise<void> {
  if (recarregando) return
  if (!temServiceWorker()) {
    window.location.reload()
    return
  }

  const registro = await navigator.serviceWorker.getRegistration()
  const esperando = registro?.waiting
  if (!esperando) {
    recarregando = true
    window.location.reload()
    return
  }

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => {
      if (recarregando) return
      recarregando = true
      window.location.reload()
    },
    { once: true },
  )

  esperando.postMessage({ type: 'SKIP_WAITING' })

  // Red de contención: si el worker no toma el control en 3 s (pasa cuando
  // hay otra pestaña abierta reteniendo al viejo), se recarga igual.
  window.setTimeout(() => {
    if (recarregando) return
    recarregando = true
    window.location.reload()
  }, 3000)
}

/** ¿Ya hay una versión nueva esperando en este momento? */
export async function temAtualizacaoEsperando(): Promise<boolean> {
  if (!temServiceWorker()) return false
  const registro = await navigator.serviceWorker.getRegistration()
  return registro?.waiting != null
}

/**
 * Escucha el aviso de versión nueva.
 *
 * Además del evento de `main.tsx`, chequea al montar: si la pestaña se abrió
 * con un worker YA esperando (arranque en frío después de un deploy), no hay
 * evento que escuchar y sin este chequeo el toast no aparecería nunca.
 *
 * Los dos caminos pasan por `atenderNovaVersao`, que es quien decide entre
 * aplicar sola (arranque en frío) y ofrecer el toast (todo lo demás).
 */
export function observarAtualizacao(aoTerNovaVersao: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const escuta = () => {
    atenderNovaVersao(aoTerNovaVersao)
  }
  window.addEventListener(EVENTO_ATUALIZACAO, escuta)

  let vivo = true
  void temAtualizacaoEsperando().then((tem) => {
    if (tem && vivo) atenderNovaVersao(aoTerNovaVersao)
  })

  return () => {
    vivo = false
    window.removeEventListener(EVENTO_ATUALIZACAO, escuta)
  }
}

/**
 * Le pide al navegador que busque una versión nueva.
 *
 * Sin esto, un TWA que queda abierto días —que es exactamente lo que hace un
 * teléfono de campo— puede seguir corriendo el bundle de la semana pasada:
 * el navegador sólo chequea en la navegación, y en una app instalada casi no
 * hay navegaciones.
 */
export function agendarChecagens(): () => void {
  if (!temServiceWorker() || typeof window === 'undefined') return () => {}

  const checar = (forcado: boolean): void => {
    const agora = Date.now()
    if (!forcado && agora - ultimaChecagem < ESPERA_ENTRE_CHECAGENS_MS) return
    ultimaChecagem = agora
    void navigator.serviceWorker.getRegistration().then((registro) => {
      // `update()` puede rechazar sin red: no es un error que valga reportar.
      void registro?.update().catch(() => {})
    })
  }

  const id = window.setInterval(() => checar(true), INTERVALO_DE_CHECAGEM_MS)
  const aoVoltar = () => {
    if (document.visibilityState === 'visible') checar(false)
  }
  document.addEventListener('visibilitychange', aoVoltar)

  return () => {
    window.clearInterval(id)
    document.removeEventListener('visibilitychange', aoVoltar)
  }
}
