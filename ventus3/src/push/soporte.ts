// src/push/soporte.ts
// `soporteDeNotificacoes()` — qué puede hacer ESTE aparato, hoy, de verdad.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTA FUNCIÓN EXISTE
// ══════════════════════════════════════════════════════════════════════════
// El equipo tiene Android e iPhone mezclados y las dos plataformas no son
// «casi iguales»: son dos productos distintos.
//
//   Android / Chrome           iOS 16.4+ / Safari
//   ─────────────────────────  ────────────────────────────────────────────
//   Push sin instalar          Push SOLO si la app está en la tela de início
//   beforeinstallprompt        No existe: la instalación es manual, a mano
//   Background Sync            No existe
//   Periodic Sync              No existe
//   navigator.vibrate          No existe
//   setAppBadge                Solo instalada
//
// Ajustes tiene que mostrar la VERDAD de este aparato y no una promesa. La
// alternativa —un botón «Autorizar notificações» que en un iPhone sin instalar
// resuelve `denied` en silencio y quema el permiso PARA SIEMPRE— es la peor
// pantalla posible: el vendedor cree que activó los avisos y no los va a
// recibir nunca, y Safari no vuelve a preguntar.
//
// Por eso esto no devuelve un booleano: devuelve el mapa completo, con un
// `resumo` en PT-BR listo para pintar y un `podePedirAgora` que decide si el
// botón se muestra o si se muestra el paso a paso de instalación.

import { permissaoDeAviso, precisaInstalarParaAviso, type PermissaoDeAviso } from '@/data'

export type PlataformaDoAparelho = 'ios' | 'android' | 'desktop'

export interface SuporteDeAvisos {
  plataforma: PlataformaDoAparelho
  /** La app corre en modo instalado (standalone / TWA / Mini App). */
  instalado: boolean
  /** Existe la API `Notification`. */
  notificacoes: boolean
  /** Hay service worker registrable (no hay en modo privado de algunos). */
  serviceWorker: boolean
  /** Existe `PushManager`: sin esto no hay Web Push, punto. */
  push: boolean
  /** `navigator.setAppBadge`. */
  badge: boolean
  /** `SyncManager`: solo Chromium. En iOS no existe. */
  backgroundSync: boolean
  /** `PeriodicSyncManager`: solo Chromium, y con engagement. */
  periodicSync: boolean
  /** En iOS, el permiso NO se puede pedir hasta que la app esté instalada. */
  precisaInstalar: boolean
  permissao: PermissaoDeAviso
  /** ¿Tiene sentido mostrar el botón «Autorizar» ahora mismo? */
  podePedirAgora: boolean
  /** Una línea en PT-BR que describe este aparato sin mentir. */
  resumo: string
}

function ehIOS(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false
  const ua = navigator.userAgent
  // El iPad se presenta como Macintosh desde iPadOS 13: el táctil lo delata.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
}

function ehAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent)
}

export function plataformaDoAparelho(): PlataformaDoAparelho {
  if (ehIOS()) return 'ios'
  if (ehAndroid()) return 'android'
  return 'desktop'
}

/** ¿Está corriendo instalada? Cubre PWA, TWA y el Mini App de Telegram. */
export function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    return standalone
  } catch {
    return false
  }
}

/**
 * El mapa completo. Es síncrono a propósito: se lee en render y se refresca
 * cuando la persona toca algo, nunca en un intervalo.
 */
export function soporteDeNotificacoes(): SuporteDeAvisos {
  const plataforma = plataformaDoAparelho()
  const instalado = estaInstalado()
  const temNotification = typeof window !== 'undefined' && 'Notification' in window
  const temSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const temPush = typeof window !== 'undefined' && 'PushManager' in window
  const temBadge = typeof navigator !== 'undefined' && 'setAppBadge' in navigator
  const temSync = typeof window !== 'undefined' && 'SyncManager' in window
  const temPeriodic =
    typeof window !== 'undefined' &&
    'ServiceWorkerRegistration' in window &&
    'periodicSync' in ServiceWorkerRegistration.prototype

  const permissao = permissaoDeAviso()
  const precisaInstalar = precisaInstalarParaAviso()
  const podePedirAgora =
    temNotification && temSW && temPush && !precisaInstalar && permissao === 'por_pedir'

  return {
    plataforma,
    instalado,
    notificacoes: temNotification,
    serviceWorker: temSW,
    push: temPush,
    badge: temBadge,
    backgroundSync: temSync,
    periodicSync: temPeriodic,
    precisaInstalar,
    permissao,
    podePedirAgora,
    resumo: resumoDe({
      plataforma,
      instalado,
      precisaInstalar,
      permissao,
      temPush: temNotification && temSW && temPush,
    }),
  }
}

function resumoDe(d: {
  plataforma: PlataformaDoAparelho
  instalado: boolean
  precisaInstalar: boolean
  permissao: PermissaoDeAviso
  temPush: boolean
}): string {
  if (!d.temPush) {
    return 'Este navegador não entrega notificações. O Telegram entrega tudo igual.'
  }
  if (d.precisaInstalar) {
    return 'No iPhone, aviso só chega para app que está na tela de início. Enquanto isso, o Telegram entrega tudo.'
  }
  if (d.permissao === 'negada') {
    return 'As notificações estão bloqueadas nos ajustes do aparelho. O navegador não pergunta de novo.'
  }
  if (d.permissao === 'concedida') {
    return d.plataforma === 'ios'
      ? 'Este iPhone recebe avisos. Sem sincronização em segundo plano: o que ficou pendente sobe quando você abrir o app.'
      : 'Este aparelho recebe avisos e sincroniza em segundo plano.'
  }
  return 'Este aparelho pode receber avisos. Falta autorizar — é uma pergunta só.'
}
