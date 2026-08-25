// src/data/db.ts
// Dexie: la cartera del vendedor en IndexedDB. Toda la base son ~3,3 MB, así
// que la cartera de uno entra sin esfuerzo y la app arranca sin red.
//
// Reglas de este archivo:
//  1. UNA sola instancia de la base en todo el bundle (getDb()).
//  2. El esquema está VERSIONADO: cada cambio suma una version() nueva con su
//     upgrade(). Nunca se edita una version() ya publicada — los teléfonos del
//     equipo tienen la anterior instalada.
//  3. Las tablas append-only (activities, touchpoints) se indexan por `uid`
//     —el client_uuid propio o 'srv:<id>'— para que una fila creada offline y
//     después confirmada por el servidor ocupe una sola entrada.

import { Dexie, type Table } from 'dexie'
import type {
  Activity,
  Commitment,
  IsoDate,
  IsoDateTime,
  Lead,
  Opportunity,
  Task,
  Touchpoint,
  Vendor,
} from '@/core'
import type {
  AudioBlobRecord,
  ConflictRecord,
  GoldenQueueEntry,
  LocalActivity,
  LocalTouchpoint,
  MetaRecord,
  OutboxMutation,
  RingsSnapshot,
  SyncCursor,
  SyncTable,
} from './local-types'

/** Nombre de la base. Cambiarlo equivale a borrarle la cartera al equipo. */
export const DB_NAME = 'ventus3'

/** Días de actividades que se conservan en local. Más viejo se poda. */
export const RETENCAO_ATIVIDADES_DIAS = 90

/* ══════════════════════════════════════════════════════════════════════════
   Esquema
   ══════════════════════════════════════════════════════════════════════════ */

export class VentusDatabase extends Dexie {
  declare opportunities: Table<Opportunity, number>
  declare leads: Table<Lead, number>
  declare tasks: Table<Task, string>
  declare activities: Table<LocalActivity, string>
  declare touchpoints: Table<LocalTouchpoint, string>
  declare commitments: Table<Commitment, number>
  declare vendors: Table<Vendor, number>
  declare goldenQueue: Table<GoldenQueueEntry, string>
  declare rings: Table<RingsSnapshot, string>
  declare meta: Table<MetaRecord, string>
  declare outbox: Table<OutboxMutation, string>
  declare conflicts: Table<ConflictRecord, number>
  declare audioBlobs: Table<AudioBlobRecord, string>

  constructor(nome: string = DB_NAME) {
    super(nome)

    // ── v1 · esquema inicial ────────────────────────────────────────────────
    // Los índices compuestos existen para las tres consultas calientes:
    // [vendor+stage] (Carteira), [vendor+due_date] (Hoje) y
    // [vendor+next_touchpoint_date] (fila de cadencia / Golden Hour).
    this.version(1).stores({
      opportunities: 'id, vendor, stage, outcome, updated_at, [vendor+stage], [vendor+updated_at]',
      leads:
        'id, vendor, stage, status, next_touchpoint_date, updated_at, [vendor+status], [vendor+next_touchpoint_date]',
      tasks: 'id, vendor, status, due_date, [vendor+status], [vendor+due_date]',
      activities:
        'uid, id, client_uuid, opportunity_id, vendor, activity_date, created_at, [vendor+activity_date], [opportunity_id+activity_date]',
      touchpoints: 'uid, id, client_uuid, lead_id, executed_at, vendor, [lead_id+executed_at]',
      commitments: 'id, vendor, status, week_of, [vendor+week_of]',
      vendors: 'id, name, auth_user_id',
      goldenQueue: 'uid, vendor, day, lead_id, [vendor+day]',
      rings: 'uid, vendor, day, [vendor+day]',
      meta: 'chave',
      outbox: 'id, estado, tabla, criado_em, [tabla+row_id]',
      conflicts: '++id, tabla, row_id, campo, criado_em, visto, [tabla+row_id]',
    })

    // ── v2 · audio offline + backoff persistido ────────────────────────────
    // Suma audioBlobs (una nota de voz no puede perderse porque Groq falle) y
    // el campo proxima_tentativa_em del outbox, con su índice, para poder
    // consultar la ventana de reintento por rango. La migración lo rellena en
    // las mutaciones que ya estaban encoladas con la v1: si quedaran sin ese
    // campo, el flush las trataría como vencidas y las reintentaría en bucle.
    this.version(2)
      .stores({
        outbox: 'id, estado, tabla, criado_em, proxima_tentativa_em, [tabla+row_id], [estado+proxima_tentativa_em]',
        audioBlobs: 'id, estado, criado_em',
      })
      .upgrade(async (tx) => {
        const agora = new Date().toISOString()
        await tx
          .table<OutboxMutation, string>('outbox')
          .toCollection()
          .modify((m) => {
            const linha = m as Partial<OutboxMutation>
            if (typeof linha.proxima_tentativa_em !== 'string') {
              m.proxima_tentativa_em = linha.criado_em ?? agora
            }
            if (typeof linha.estado !== 'string') m.estado = 'pendente'
            if (typeof linha.intentos !== 'number') m.intentos = 0
          })
      })
  }
}

let instancia: VentusDatabase | null = null

/** Instancia única de Dexie. Nunca construir VentusDatabase a mano fuera de acá. */
export function getDb(): VentusDatabase {
  instancia ??= new VentusDatabase()
  return instancia
}

/**
 * Reemplaza la instancia. SOLO para tests: permite abrir una base con nombre
 * propio por archivo de test y cerrarla al terminar.
 */
export function _setDbParaTeste(db: VentusDatabase | null): void {
  instancia = db
}

/* ══════════════════════════════════════════════════════════════════════════
   Ciclo de vida
   ══════════════════════════════════════════════════════════════════════════ */

export interface OpcoesReset {
  /**
   * Conservar el outbox. Es el default y no es negociable en el caso de la
   * purga de iOS: si al refetchear completo también borráramos la cola, el
   * vendedor perdería las notas que registró en el galpón.
   */
  manterOutbox?: boolean
  /** Conservar los audios sin transcribir. También default. */
  manterAudios?: boolean
}

/**
 * Borra los datos espejados del servidor y los cursores. Se usa cuando iOS
 * purga el store, al cambiar de vendedor y al cerrar sesión.
 */
export async function resetDb(opcoes: OpcoesReset = {}): Promise<void> {
  const { manterOutbox = true, manterAudios = true } = opcoes
  const db = getDb()

  const nomes = [
    'opportunities',
    'leads',
    'tasks',
    'activities',
    'touchpoints',
    'commitments',
    'vendors',
    'goldenQueue',
    'rings',
    'meta',
  ]
  // El log de conflictos acompaña al outbox: es historia local que el vendedor
  // todavía puede no haber visto. Solo se borra al cerrar sesión de verdad.
  if (!manterOutbox) nomes.push('outbox', 'conflicts')
  if (!manterAudios) nomes.push('audioBlobs')

  await Promise.all(nomes.map((nome) => db.table(nome).clear()))
}

/**
 * Pide almacenamiento persistente. Mitiga —no elimina— la purga de 7 días de
 * iOS: Safari puede negarlo sin avisar, así que el resultado es informativo y
 * la app nunca depende de que sea true.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Bytes usados / disponibles, para el bloque de estado de Ajustes. */
export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 }
  }
  try {
    const e = await navigator.storage.estimate()
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 }
  } catch {
    return { usage: 0, quota: 0 }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Meta y cursores
   ══════════════════════════════════════════════════════════════════════════ */

export async function lerMeta<T>(chave: string): Promise<T | undefined> {
  const linha = await getDb().meta.get(chave)
  return linha === undefined ? undefined : (linha.valor as T)
}

export async function gravarMeta(chave: string, valor: unknown): Promise<void> {
  await getDb().meta.put({ chave, valor, atualizado_em: new Date().toISOString() })
}

export async function apagarMeta(chave: string): Promise<void> {
  await getDb().meta.delete(chave)
}

const PREFIXO_CURSOR = 'cursor:'

export async function lerCursor(tabla: SyncTable): Promise<SyncCursor> {
  const guardado = await lerMeta<SyncCursor>(`${PREFIXO_CURSOR}${tabla}`)
  return guardado ?? { tabla, desde: null, ultimo_sync_em: null, ultimas_linhas: 0 }
}

export async function gravarCursor(cursor: SyncCursor): Promise<void> {
  await gravarMeta(`${PREFIXO_CURSOR}${cursor.tabla}`, cursor)
}

/** Resetea los cursores sin tocar datos: el próximo pull trae todo de nuevo. */
export async function zerarCursores(): Promise<void> {
  const db = getDb()
  const chaves = await db.meta.toCollection().primaryKeys()
  const doCursor = chaves.filter((k) => k.startsWith(PREFIXO_CURSOR))
  await db.meta.bulkDelete(doCursor)
}

/* ══════════════════════════════════════════════════════════════════════════
   Utilidades de filas append-only
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clave local de una fila append-only. El client_uuid manda; sin él, el id del
 * servidor. Es lo que hace imposible duplicar una actividad reintentada.
 */
export function chaveLocal(fila: {
  client_uuid?: string | null
  id?: number | string | null
}): string {
  const uuid = fila.client_uuid
  if (typeof uuid === 'string' && uuid !== '') return uuid
  return `srv:${String(fila.id ?? '')}`
}

/** Poda las actividades más viejas que la retención local. */
export async function podarAtividades(
  limiteDias: number = RETENCAO_ATIVIDADES_DIAS,
): Promise<number> {
  const db = getDb()
  const corte = new Date(Date.now() - limiteDias * 86_400_000).toISOString().slice(0, 10)
  // Se conservan siempre las pendientes: son notas que todavía no llegaron al
  // servidor, aunque su fecha sea vieja (un registro cargado con fecha pasada).
  const viejas = await db.activities
    .filter((a) => a.pendente !== 1 && (a.activity_date ?? a.created_at ?? '') < corte)
    .primaryKeys()
  if (viejas.length > 0) await db.activities.bulkDelete(viejas)
  return viejas.length
}

/* ══════════════════════════════════════════════════════════════════════════
   Lectura de la cartera
   ══════════════════════════════════════════════════════════════════════════ */

export interface CarteiraLocal {
  opportunities: Opportunity[]
  leads: Lead[]
  tasks: Task[]
  activities: Activity[]
  touchpoints: Touchpoint[]
  commitments: Commitment[]
  vendor: Vendor | null
}

/**
 * Cartera completa cacheada, lista para alimentar rankDay sin red.
 * Una sola pasada por store, cero queries por fila: es lo que hace que el
 * Plano do Dia pinte en <100ms en modo avión.
 */
export async function carregarCarteira(vendor: string): Promise<CarteiraLocal> {
  const db = getDb()
  const [opportunities, leads, tasks, activities, commitments, vendorRow] = await Promise.all([
    db.opportunities.where('vendor').equals(vendor).toArray(),
    db.leads.where('vendor').equals(vendor).toArray(),
    db.tasks.where('vendor').equals(vendor).toArray(),
    db.activities.where('vendor').equals(vendor).toArray(),
    db.commitments.where('vendor').equals(vendor).toArray(),
    db.vendors.where('name').equals(vendor).first(),
  ])

  // Los touchpoints no tienen vendor en el esquema de producción: se filtran
  // por los leads del vendedor, que ya están en memoria.
  const idsLead = new Set(leads.map((l) => l.id))
  const touchpoints = await db.touchpoints.filter((tp) => idsLead.has(tp.lead_id)).toArray()

  return {
    opportunities,
    leads,
    tasks,
    activities,
    touchpoints,
    commitments,
    vendor: vendorRow ?? null,
  }
}

/** Alias en inglés, por compatibilidad con el stub original. */
export const loadPortfolio = carregarCarteira

/** Actividades de una oportunidad, de la más nueva a la más vieja. */
export async function atividadesDaOportunidade(
  opportunityId: number,
  limite = 50,
): Promise<Activity[]> {
  const db = getDb()
  const linhas = await db.activities.where('opportunity_id').equals(opportunityId).toArray()
  return linhas
    .sort((a, b) => (b.activity_date ?? b.created_at ?? '').localeCompare(a.activity_date ?? a.created_at ?? ''))
    .slice(0, limite)
}

/** Touchpoints de un lead, del más viejo al más nuevo (es una cadencia). */
export async function touchpointsDoLead(leadId: number): Promise<Touchpoint[]> {
  const linhas = await getDb().touchpoints.where('lead_id').equals(leadId).toArray()
  return linhas.sort((a, b) => a.executed_at.localeCompare(b.executed_at))
}

/** ¿La base local está vacía? Señal de purga de iOS si hay sesión viva. */
export async function bancoVazio(): Promise<boolean> {
  const db = getDb()
  const [opps, leads] = await Promise.all([db.opportunities.count(), db.leads.count()])
  return opps === 0 && leads === 0
}

/* ══════════════════════════════════════════════════════════════════════════
   Anillos y cola de Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

export function uidAneis(vendor: string, day: IsoDate): string {
  return `${vendor}:${day}`
}

export async function lerAneis(vendor: string, day: IsoDate): Promise<RingsSnapshot | undefined> {
  return getDb().rings.get(uidAneis(vendor, day))
}

export async function gravarAneis(snapshot: RingsSnapshot): Promise<void> {
  await getDb().rings.put(snapshot)
}

export async function lerFilaGolden(vendor: string, day: IsoDate): Promise<GoldenQueueEntry[]> {
  const linhas = await getDb().goldenQueue.where('[vendor+day]').equals([vendor, day]).toArray()
  return linhas.sort((a, b) => a.ordem - b.ordem)
}

export async function gravarFilaGolden(entradas: readonly GoldenQueueEntry[]): Promise<void> {
  await getDb().goldenQueue.bulkPut(entradas as GoldenQueueEntry[])
}

/* ══════════════════════════════════════════════════════════════════════════
   Audio
   ══════════════════════════════════════════════════════════════════════════ */

export async function guardarAudio(registro: AudioBlobRecord): Promise<void> {
  await getDb().audioBlobs.put(registro)
}

export async function audiosPendentes(): Promise<AudioBlobRecord[]> {
  return getDb().audioBlobs.where('estado').anyOf('gravado', 'erro').toArray()
}

export async function apagarAudio(id: string): Promise<void> {
  await getDb().audioBlobs.delete(id)
}

/** Instante ISO actual. Un solo lugar, para poder congelarlo en los tests. */
export function agora(): IsoDateTime {
  return new Date().toISOString()
}

/* ══════════════════════════════════════════════════════════════════════════
   Estado de la fila de la Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Marca una entrada de la fila como hecha o saltada.
 *
 * Es estado LOCAL a propósito: si el teléfono se queda sin batería a los 20
 * minutos, al reabrir la app la hora retoma donde estaba en vez de volver a
 * ofrecer los contactos ya tocados. La fila del día la arma el job de la
 * víspera; el servidor no necesita enterarse de por dónde va el dedo.
 */
export async function marcarEntradaGolden(
  uid: string,
  estado: GoldenQueueEntry['estado'],
): Promise<void> {
  await getDb().goldenQueue.update(uid, { estado })
}
