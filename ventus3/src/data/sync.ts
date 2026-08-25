// src/data/sync.ts
// El motor de sincronización. Tres responsabilidades y ninguna más:
//
//  1. PULL incremental por `updated_at`, con un cursor por tabla en `meta`.
//     Nunca se baja la base entera dos veces (salvo purga, ver abajo).
//  2. FLUSH del outbox disparado por TRES vías:
//       · evento 'sync' del service worker  → solo Chromium
//       · evento 'online'                    → todos, poco confiable
//       · evento 'visibilitychange'          → EL mecanismo en iOS
//     En iOS no hay Background Sync ni Periodic Sync (y no hay fecha), así que
//     'visibilitychange' no es un extra: es la única garantía de que la nota
//     que el vendedor escribió en el galpón sale cuando vuelve a abrir la app.
//  3. PERSISTENCIA: navigator.storage.persist() y el manejo del caso "el store
//     apareció vacío con sesión viva" — iOS purga a los 7 días de no uso.
//     Se refetchea completo, sin drama y sin perder el outbox.

import type { IsoDateTime } from '@/core'
import {
  bancoVazio,
  getDb,
  gravarCursor,
  lerCursor,
  podarAtividades,
  requestPersistentStorage,
  resetDb,
  zerarCursores,
} from './db'
import { aplicarRemoto, podarConflitos } from './conflicts'
import { flush, reaplicarOtimistas, recuperarEnviando } from './outbox'
import { supabase, talvezOnline, temSessao } from './supabase'
import type { SyncTable } from './local-types'

/** Tag del Background Sync. El service worker registra este mismo string. */
export const SYNC_TAG = 'ventus-outbox'

/** Mensaje que el SW manda a la app cuando Chromium le da la ventana de sync. */
export const MENSAGEM_SW_SYNC = 'ventus:flush-outbox'

/* ══════════════════════════════════════════════════════════════════════════
   Configuración por tabla
   ══════════════════════════════════════════════════════════════════════════ */

interface ConfigTabla {
  tabla: SyncTable
  /** Columna del cursor incremental. */
  cursorCol: string
  /** Columna por la que se filtra la cartera del vendedor. null = sin filtro. */
  vendorCol: string | null
  /** Sólo trae filas más nuevas que N días (activities: 90). */
  retencaoDias?: number
  /** Columna de fecha para la retención, si difiere del cursor. */
  retencaoCol?: string
}

/**
 * Orden importante: las tablas padre primero. Si llegaran touchpoints antes
 * que sus leads, la cola de cadencia se pintaría con huecos por un instante.
 */
export const TABELAS_SYNC: readonly ConfigTabla[] = [
  { tabla: 'vendors', cursorCol: 'created_at', vendorCol: null },
  { tabla: 'opportunities', cursorCol: 'updated_at', vendorCol: 'vendor' },
  { tabla: 'leads', cursorCol: 'updated_at', vendorCol: 'vendor' },
  { tabla: 'tasks', cursorCol: 'updated_at', vendorCol: 'vendor' },
  { tabla: 'commitments', cursorCol: 'created_at', vendorCol: 'vendor' },
  {
    tabla: 'activities',
    cursorCol: 'created_at',
    vendorCol: 'vendor',
    retencaoDias: 90,
    retencaoCol: 'activity_date',
  },
  // touchpoints no tiene columna vendor: se filtra por los leads del vendedor.
  { tabla: 'touchpoints', cursorCol: 'executed_at', vendorCol: null },
]

/** Filas por página. 500 entra cómodo en una respuesta de PostgREST. */
const PAGINA = 500

/* ══════════════════════════════════════════════════════════════════════════
   Aviso de cambios (para invalidar el cache de TanStack Query)
   ══════════════════════════════════════════════════════════════════════════ */

type OuvinteMudanca = (tabelas: readonly SyncTable[]) => void
const ouvintesMudanca = new Set<OuvinteMudanca>()

/** Se dispara cuando el pull escribió filas nuevas en Dexie. */
export function assinarMudancas(ouvinte: OuvinteMudanca): () => void {
  ouvintesMudanca.add(ouvinte)
  return () => {
    ouvintesMudanca.delete(ouvinte)
  }
}

export function notificarMudancas(tabelas: readonly SyncTable[]): void {
  if (tabelas.length === 0) return
  for (const o of ouvintesMudanca) o(tabelas)
}

/* ══════════════════════════════════════════════════════════════════════════
   Pull
   ══════════════════════════════════════════════════════════════════════════ */

export interface SyncReport {
  puxados: number
  enviados: number
  conflitos: number
  falhados: number
  tabelas: SyncTable[]
  terminadoEm: IsoDateTime
  /** true si hubo que rehacer la carga completa (purga de iOS). */
  refetchCompleto: boolean
}

function relatorioVazio(): SyncReport {
  return {
    puxados: 0,
    enviados: 0,
    conflitos: 0,
    falhados: 0,
    tabelas: [],
    terminadoEm: new Date().toISOString(),
    refetchCompleto: false,
  }
}

/**
 * Trae de una tabla lo cambiado desde el último cursor y lo mezcla respetando
 * las reglas de conflicts.ts. Devuelve cuántas filas se aplicaron.
 */
export async function pullTabela(
  config: ConfigTabla,
  vendor: string,
  idsLead?: readonly number[],
): Promise<number> {
  const cursor = await lerCursor(config.tabla)
  let desde = cursor.desde
  let total = 0
  let ultimoValor: string | null = desde

  for (;;) {
    let q = supabase
      .from(config.tabla)
      .select('*')
      .order(config.cursorCol, { ascending: true })
      .limit(PAGINA)

    if (desde !== null) q = q.gt(config.cursorCol, desde)
    if (config.vendorCol !== null) q = q.eq(config.vendorCol, vendor)
    if (config.retencaoDias !== undefined) {
      const corte = new Date(Date.now() - config.retencaoDias * 86_400_000).toISOString()
      q = q.gte(config.retencaoCol ?? config.cursorCol, corte.slice(0, 10))
    }
    // touchpoints se acota por los leads del vendedor: sin esto bajaríamos la
    // cadencia de todo el equipo a un teléfono.
    if (config.tabla === 'touchpoints' && idsLead !== undefined) {
      if (idsLead.length === 0) break
      q = q.in('lead_id', [...idsLead])
    }

    const { data, error } = await q
    if (error) throw new Error(`Pull de ${config.tabla} falhou: ${error.message}`)
    const linhas = (data ?? []) as Array<Record<string, unknown>>
    if (linhas.length === 0) break

    for (const linha of linhas) {
      await aplicarRemoto(config.tabla, linha, { vendor })
      total += 1
      const valor = linha[config.cursorCol]
      if (typeof valor === 'string' && (ultimoValor === null || valor > ultimoValor)) {
        ultimoValor = valor
      }
    }

    if (linhas.length < PAGINA) break
    if (ultimoValor === desde) break // sin avance: corta para no ciclar
    desde = ultimoValor
  }

  await gravarCursor({
    tabla: config.tabla,
    desde: ultimoValor,
    ultimo_sync_em: new Date().toISOString(),
    ultimas_linhas: total,
  })
  return total
}

/** Pull de todas las tablas de la cartera. */
export async function pull(vendor: string): Promise<SyncReport> {
  const relatorio = relatorioVazio()
  if (!talvezOnline()) return relatorio

  for (const config of TABELAS_SYNC) {
    const idsLead =
      config.tabla === 'touchpoints'
        ? await getDb().leads.where('vendor').equals(vendor).primaryKeys()
        : undefined
    const n = await pullTabela(config, vendor, idsLead as number[] | undefined)
    relatorio.puxados += n
    if (n > 0) relatorio.tabelas.push(config.tabla)
  }

  await podarAtividades()
  await podarConflitos()
  relatorio.terminadoEm = new Date().toISOString()
  notificarMudancas(relatorio.tabelas)
  return relatorio
}

/* ══════════════════════════════════════════════════════════════════════════
   Sync completo
   ══════════════════════════════════════════════════════════════════════════ */

let syncEmCurso: Promise<SyncReport> | null = null

/**
 * Sincronización completa: primero SUBE, después BAJA.
 * El orden no es cosmético — si bajáramos primero, el pull traería el estado
 * anterior del servidor y la regla de "no pisar campos pendientes" tendría que
 * trabajar de más. Subiendo primero, la mayoría de las veces no hay conflicto.
 */
export interface OpcoesSync {
  /**
   * La red ACABA de volver. Se saltea la ventana de backoff de la cola: los
   * reintentos que se acumularon sin señal no tienen por qué seguir contando
   * cuando el teléfono vuelve a estar en línea.
   */
  redeVoltou?: boolean
}

export async function syncNow(vendor: string, opcoes: OpcoesSync = {}): Promise<SyncReport> {
  if (syncEmCurso) return syncEmCurso
  syncEmCurso = executarSync(vendor, opcoes).finally(() => {
    syncEmCurso = null
  })
  return syncEmCurso
}

async function executarSync(vendor: string, opcoes: OpcoesSync = {}): Promise<SyncReport> {
  const relatorio = relatorioVazio()
  if (!talvezOnline()) return relatorio

  const flushado = await flush(opcoes.redeVoltou === true ? { ignorarEspera: true } : {})
  relatorio.enviados = flushado.enviados
  relatorio.conflitos = flushado.conflitos
  relatorio.falhados = flushado.falhados

  const puxado = await pull(vendor)
  relatorio.puxados = puxado.puxados
  relatorio.tabelas = puxado.tabelas
  relatorio.terminadoEm = puxado.terminadoEm
  return relatorio
}

/* ══════════════════════════════════════════════════════════════════════════
   Purga de iOS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * iOS borra el IndexedDB de un sitio a los 7 días sin uso, aunque la sesión de
 * auth siga viva en otro storage. El síntoma es brutal: el vendedor abre la
 * app un lunes y su cartera está vacía.
 *
 * Detección: base vacía + sesión viva. Reacción: cursores a cero y refetch
 * completo, SIN tocar el outbox — lo que el vendedor escribió y no se envió
 * sigue ahí, y se vuelve a pintar en el timeline con reaplicarOtimistas().
 */
export async function recuperarDePurga(vendor: string): Promise<boolean> {
  if (!(await bancoVazio())) return false
  if (!(await temSessao())) return false

  await resetDb({ manterOutbox: true, manterAudios: true })
  await zerarCursores()
  await reaplicarOtimistas()
  if (talvezOnline()) await pull(vendor)
  return true
}

/** Arranque de la capa de datos. Idempotente: se puede llamar en cada mount. */
export async function iniciarSync(vendor: string): Promise<SyncReport> {
  await requestPersistentStorage()
  await recuperarEnviando()

  const refetch = await recuperarDePurga(vendor)
  if (refetch) {
    const r = relatorioVazio()
    r.refetchCompleto = true
    return r
  }
  return syncNow(vendor)
}

/* ══════════════════════════════════════════════════════════════════════════
   Los tres disparadores
   ══════════════════════════════════════════════════════════════════════════ */

/** `ServiceWorkerRegistration.sync` no está en lib.dom: se declara acá. */
interface SyncManagerLike {
  register(tag: string): Promise<void>
}

/** Registra el Background Sync si el navegador lo tiene (Chromium). */
export async function registrarBackgroundSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sm = (reg as unknown as { sync?: SyncManagerLike }).sync
    if (!sm) return false
    await sm.register(SYNC_TAG)
    return true
  } catch {
    // Safari, o el usuario negó permisos: no es un error, es el caso normal
    // en la mitad de los teléfonos del equipo.
    return false
  }
}

export interface OpcoesGatilhos {
  /** Intervalo de red de seguridad, en ms. 0 lo desactiva. */
  intervaloMs?: number
  aoSincronizar?: (relatorio: SyncReport) => void
}

/**
 * Instala los tres disparadores del flush y devuelve la función de limpieza.
 * Llamarla UNA vez por sesión de app (App.tsx), nunca por pantalla.
 */
export function instalarGatilhosDeSync(
  vendor: string,
  opcoes: OpcoesGatilhos = {},
): () => void {
  const { intervaloMs = 5 * 60_000, aoSincronizar } = opcoes
  if (typeof window === 'undefined') return () => undefined

  let vivo = true
  const disparar = (redeVoltou = false): void => {
    if (!vivo || !talvezOnline()) return
    void syncNow(vendor, { redeVoltou }).then((r) => {
      if (vivo) aoSincronizar?.(r)
    })
  }

  // 1) Vuelta de la red. Es el único disparador que sabe que la condición que
  //    hacía fallar la cola cambió, así que es el único que saltea la espera.
  const aoVoltarARede = (): void => disparar(true)
  window.addEventListener('online', aoVoltarARede)

  // 2) La app vuelve al frente. EL mecanismo en iOS.
  const aoMudarVisibilidade = (): void => {
    if (document.visibilityState === 'visible') disparar()
  }
  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  // pagehide/pageshow: iOS congela pestañas en el bfcache y a veces no emite
  // visibilitychange al volver.
  const aoVoltarDoBfcache = (): void => disparar()
  window.addEventListener('pageshow', aoVoltarDoBfcache)

  // 3) El service worker avisa que Chromium le dio la ventana de Background Sync.
  const aoMensagemDoSw = (evento: MessageEvent<unknown>): void => {
    const dado = evento.data
    if (typeof dado === 'object' && dado !== null && 'type' in dado) {
      if ((dado as { type: unknown }).type === MENSAGEM_SW_SYNC) disparar()
    }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', aoMensagemDoSw)
    void registrarBackgroundSync()
  }

  // Red de seguridad: la app abierta todo el día en el escritorio de Jordi.
  const timer = intervaloMs > 0 ? window.setInterval(() => disparar(), intervaloMs) : null

  // Primer disparo inmediato.
  disparar()

  return () => {
    vivo = false
    window.removeEventListener('online', aoVoltarARede)
    window.removeEventListener('pageshow', aoVoltarDoBfcache)
    document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', aoMensagemDoSw)
    }
    if (timer !== null) window.clearInterval(timer)
  }
}
