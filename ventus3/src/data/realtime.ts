// src/data/realtime.ts
// Realtime de Supabase, con el reconciliador que respeta el outbox.
//
// Ojo con la herencia del v2: en producción la publicación `supabase_realtime`
// tiene CERO tablas — el "realtime" del v2 es ficción, la suscripción existe y
// no llega nunca nada. Se habilita tabla por tabla con REPLICA IDENTITY en la
// migración de F0. Hasta que eso esté, este módulo se queda callado sin
// romper nada.
//
// REGLA DURA (implementada en conflicts.aplicarRemoto): un evento remoto NUNCA
// pisa un valor local con mutación pendiente sobre el mismo campo.
//
// Y una flag de apagado total: si el socket empieza a pelearse con el outbox
// en la calle, se apaga el realtime y la app sigue funcionando con pull —
// degradar tiene que ser una decisión de un renglón, no un deploy de urgencia.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { aplicarRemoto } from './conflicts'
import { getDb } from './db'
import { supabase } from './supabase'
import { notificarMudancas } from './sync'
import type { SyncTable } from './local-types'

/** Tablas que se escuchan en vivo. El resto llega por pull incremental. */
export type RealtimeTable = Extract<
  SyncTable,
  'opportunities' | 'leads' | 'tasks' | 'activities' | 'touchpoints' | 'commitments'
>

export const TABELAS_REALTIME: readonly RealtimeTable[] = [
  'opportunities',
  'leads',
  'tasks',
  'activities',
  'touchpoints',
  'commitments',
]

/** Tablas sin columna `vendor`: se filtran del lado del cliente. */
const SEM_COLUNA_VENDOR: ReadonlySet<string> = new Set(['touchpoints'])

export interface RealtimeEvent<T = Record<string, unknown>> {
  table: RealtimeTable
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T | null
  old: Partial<T> | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Kill switch
   ══════════════════════════════════════════════════════════════════════════ */

// VITE_REALTIME=off apaga el realtime en el build. En runtime lo apaga
// desativarRealtime() (Ajustes → 'Modo econômico').
let habilitado = import.meta.env.VITE_REALTIME !== 'off'

export function realtimeHabilitado(): boolean {
  return habilitado
}

/** Apaga/prende el realtime. Apagarlo corta todas las suscripciones vivas. */
export function definirRealtimeHabilitado(valor: boolean): void {
  habilitado = valor
  if (!valor) desconectarTudo()
}

/* ══════════════════════════════════════════════════════════════════════════
   Reconexión con backoff
   ══════════════════════════════════════════════════════════════════════════ */

const RECONEXAO_BASE_MS = 1_000
const RECONEXAO_TETO_MS = 60_000

function atrasoReconexao(tentativas: number, jitter: number = Math.random()): number {
  const base = Math.min(RECONEXAO_BASE_MS * 2 ** Math.max(0, tentativas - 1), RECONEXAO_TETO_MS)
  return Math.round(base * (0.8 + jitter * 0.4))
}

const canaisVivos = new Set<RealtimeChannel>()

function desconectarTudo(): void {
  for (const canal of canaisVivos) void supabase.removeChannel(canal)
  canaisVivos.clear()
}

/* ══════════════════════════════════════════════════════════════════════════
   Suscripción de la cartera
   ══════════════════════════════════════════════════════════════════════════ */

export interface OpcoesRealtime {
  /** Se llama después de aplicar el evento en Dexie. Para invalidar queries. */
  aoAplicar?: (evento: RealtimeEvent) => void
  /** Diagnóstico: cambios de estado del socket. */
  aoMudarEstado?: (estado: string, tabla: RealtimeTable) => void
}

/**
 * Se suscribe a los cambios de la cartera del vendedor.
 * Un canal por tabla: si una tabla no está en la publicación (o pierde
 * permisos por RLS) se cae sola sin arrastrar a las demás.
 */
export function subscribePortfolio(
  vendor: string,
  opcoes: OpcoesRealtime = {},
): () => void {
  if (!habilitado) return () => undefined

  const limpezas = TABELAS_REALTIME.map((tabla) => assinarTabela(tabla, vendor, opcoes))
  return () => {
    for (const limpar of limpezas) limpar()
  }
}

function assinarTabela(
  tabla: RealtimeTable,
  vendor: string,
  opcoes: OpcoesRealtime,
): () => void {
  let tentativas = 0
  let cancelado = false
  let canal: RealtimeChannel | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const conectar = (): void => {
    if (cancelado || !habilitado) return

    const filtro: { event: '*'; schema: string; table: string; filter?: string } = {
      event: '*',
      schema: 'public',
      table: tabla,
    }
    if (!SEM_COLUNA_VENDOR.has(tabla)) filtro.filter = `vendor=eq.${vendor}`

    canal = supabase
      .channel(`ventus:${tabla}:${vendor}`)
      .on<Record<string, unknown>>('postgres_changes', filtro, (payload) => {
        void aplicarEvento(tabla, payload.eventType, payload.new, payload.old, vendor, opcoes)
      })
      .subscribe((estado) => {
        opcoes.aoMudarEstado?.(estado, tabla)
        if (estado === 'SUBSCRIBED') {
          tentativas = 0
          return
        }
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
          reagendar()
        }
      })
    canaisVivos.add(canal)
  }

  const reagendar = (): void => {
    if (cancelado) return
    if (canal) {
      canaisVivos.delete(canal)
      void supabase.removeChannel(canal)
      canal = null
    }
    tentativas += 1
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(conectar, atrasoReconexao(tentativas))
  }

  conectar()

  return () => {
    cancelado = true
    if (timer !== null) clearTimeout(timer)
    if (canal) {
      canaisVivos.delete(canal)
      void supabase.removeChannel(canal)
      canal = null
    }
  }
}

/** Aplica un evento remoto pasando SIEMPRE por el reconciliador. */
async function aplicarEvento(
  tabla: RealtimeTable,
  tipo: 'INSERT' | 'UPDATE' | 'DELETE',
  novo: Record<string, unknown> | Record<string, never>,
  antigo: Partial<Record<string, unknown>>,
  vendor: string,
  opcoes: OpcoesRealtime,
): Promise<void> {
  try {
    if (tipo === 'DELETE') {
      await aplicarDelete(tabla, antigo)
    } else {
      const linha = novo as Record<string, unknown>
      if (!(await ehDaCarteira(tabla, linha, vendor))) return
      await aplicarRemoto(tabla, linha, { vendor })
    }
    notificarMudancas([tabla])
    opcoes.aoAplicar?.({
      table: tabla,
      type: tipo,
      new: tipo === 'DELETE' ? null : (novo as Record<string, unknown>),
      old: antigo,
    })
  } catch {
    // Un evento que no se pudo aplicar no puede tirar abajo el socket: el
    // pull incremental lo va a recuperar igual en el próximo ciclo.
  }
}

/**
 * ¿Esta fila es de la cartera de este vendedor? Para las tablas sin columna
 * `vendor` (touchpoints) hay que preguntarle al lead. Sin este filtro, un
 * teléfono terminaría espejando la cadencia de todo el equipo.
 */
async function ehDaCarteira(
  tabla: RealtimeTable,
  linha: Record<string, unknown>,
  vendor: string,
): Promise<boolean> {
  if (!SEM_COLUNA_VENDOR.has(tabla)) {
    const dono = linha['vendor']
    return dono === undefined || dono === vendor
  }
  const leadId = linha['lead_id']
  if (typeof leadId !== 'number') return false
  const lead = await getDb().leads.get(leadId)
  return lead?.vendor === vendor
}

async function aplicarDelete(
  tabla: RealtimeTable,
  antigo: Partial<Record<string, unknown>>,
): Promise<void> {
  const id = antigo['id']
  if (id === undefined || id === null) return
  const db = getDb()
  if (tabla === 'activities' || tabla === 'touchpoints') {
    // Append-only: la fila no debería borrarse nunca. Si el servidor la borró
    // (moderación, limpieza), se saca la copia local por su id de servidor.
    const store = db.table(tabla)
    const alvos = await store.where('id').equals(id as number).primaryKeys()
    await store.bulkDelete(alvos)
    return
  }
  await db.table(tabla).delete(id as number)
}

/* ══════════════════════════════════════════════════════════════════════════
   Presencia y high-fives de la Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

/** Quién más está en la Golden Hour ahora. Solo estado efímero, nada en Dexie. */
export function subscribeGoldenPresence(
  vendor: string,
  onChange: (vendorsOnline: string[]) => void,
): () => void {
  if (!habilitado) return () => undefined

  const canal = supabase.channel('ventus:golden', {
    config: { presence: { key: vendor } },
  })

  canal
    .on('presence', { event: 'sync' }, () => {
      const estado = canal.presenceState()
      onChange(Object.keys(estado))
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void canal.track({ vendor, desde: new Date().toISOString() })
      }
    })

  canaisVivos.add(canal)
  return () => {
    canaisVivos.delete(canal)
    void supabase.removeChannel(canal)
  }
}

/** Manda un high-five al compañero. Broadcast puro: no se persiste. */
export async function sendHighFive(fromVendor: string, toVendor: string): Promise<void> {
  if (!habilitado) return
  const canal = supabase.channel('ventus:golden')
  await canal.send({
    type: 'broadcast',
    event: 'high-five',
    payload: { de: fromVendor, para: toVendor, em: new Date().toISOString() },
  })
}

/** Escucha los high-fives dirigidos a este vendedor. */
export function subscribeHighFives(
  vendor: string,
  onHighFive: (de: string) => void,
): () => void {
  if (!habilitado) return () => undefined

  const canal = supabase
    .channel('ventus:golden')
    .on('broadcast', { event: 'high-five' }, (mensagem) => {
      const carga = (mensagem as { payload?: { de?: unknown; para?: unknown } }).payload
      if (carga?.para === vendor && typeof carga.de === 'string') onHighFive(carga.de)
    })
    .subscribe()

  canaisVivos.add(canal)
  return () => {
    canaisVivos.delete(canal)
    void supabase.removeChannel(canal)
  }
}
