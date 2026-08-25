// src/data/conflicts.ts
// Modelo de conflictos. Tres reglas, en este orden de fuerza:
//
//  1. APPEND-ONLY con client_uuid para activities y touchpoints. Son ~80 % del
//     tráfico y NO PUEDEN conflictuar: nadie edita una actividad ya escrita;
//     dos dispositivos que registran el mismo hecho producen dos filas con
//     UUID distinto, y un reintento produce una sola.
//
//  2. LWW POR CAMPO —no por fila— con timestamp por campo, para escalas,
//     etapa y fechas. Que Renata suba `dor` desde el celular y Jordi corrija
//     `expected_close` desde la web no puede hacer que uno de los dos pierda
//     su cambio.
//
//  3. REGLA DURA, por encima de todo lo anterior: un evento remoto NUNCA pisa
//     un valor local que tiene una mutación pendiente sobre el mismo campo.
//     El bug "mi cambio se revirtió solo" mata la confianza en la app y no se
//     recupera: el vendedor vuelve a la libreta y no hay segunda oportunidad.
//
// Todo lo que se descarta —de un lado o del otro— queda en la tabla conflicts
// para poder mostrarlo y auditarlo.

import type { Table } from 'dexie'
import { agora, getDb } from './db'
import { pendingFields, relogioPendente } from './outbox'
import type {
  ConflictRecord,
  RelogioDeCampos,
  ResolucaoConflito,
  SyncTable,
} from './local-types'
import { TABELAS_APPEND_ONLY } from './local-types'

/** Campos que nunca se mergean: los define el servidor y punto. */
const CAMPOS_IMUTAVEIS = new Set(['id', 'created_at', 'client_uuid', 'uid'])

/** jsonb con timestamp por sub-campo. Hoy solo `scales`. */
const CAMPOS_JSONB_POR_CAMPO = new Set(['scales'])

export function ehAppendOnly(tabla: string): boolean {
  return (TABELAS_APPEND_ONLY as readonly string[]).includes(tabla)
}

/* ══════════════════════════════════════════════════════════════════════════
   Merge puro (testeable sin IndexedDB)
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaMerge<T extends Record<string, unknown>> {
  tabla: string
  rowId: string | number
  /** La fila tal como está hoy en Dexie. */
  local: T
  /** Lo que llegó del servidor (pull o realtime). Puede ser parcial. */
  remoto: Partial<T>
  /** Timestamp por campo del lado local. La clave '*' vale para toda la fila. */
  relogioLocal?: RelogioDeCampos
  /** Idem del lado remoto: updated_at en '*', scales_updated_at por escala. */
  relogioRemoto?: RelogioDeCampos
  /** Campos con mutación local todavía en el outbox. Intocables. */
  camposPendentes?: readonly string[]
  vendor?: string | null
  /** Instante de registro del conflicto. Inyectable para los tests. */
  agora?: string
}

export interface ResultadoMerge<T> {
  merged: T
  conflitos: ConflictRecord[]
  /** false si el remoto no aportó nada: evita un write inútil a IndexedDB. */
  mudou: boolean
}

/** Igualdad suficiente para valores de columna (escalares y jsonb chicos). */
function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}

/** Raíz de una ruta con punto: 'scales.dor' → 'scales'. */
function raiz(caminho: string): string {
  const i = caminho.indexOf('.')
  return i === -1 ? caminho : caminho.slice(0, i)
}

function tsDe(relogio: RelogioDeCampos | undefined, caminho: string): string | null {
  if (!relogio) return null
  const exato = relogio[caminho]
  if (exato !== undefined) return exato
  const pai = relogio[raiz(caminho)]
  if (pai !== undefined) return pai
  return relogio['*'] ?? null
}

/**
 * Merge campo por campo.
 *
 * Devuelve la fila resultante y la lista de conflictos a registrar. Es una
 * función PURA: no toca IndexedDB ni la red, por eso se puede testear entera.
 */
export function mergeByField<T extends Record<string, unknown>>(
  entrada: EntradaMerge<T>,
): ResultadoMerge<T> {
  const {
    tabla,
    rowId,
    local,
    remoto,
    relogioLocal,
    relogioRemoto,
    camposPendentes = [],
    vendor = null,
  } = entrada
  const quando = entrada.agora ?? agora()

  const pendentes = new Set(camposPendentes)
  const merged: Record<string, unknown> = { ...local }
  const conflitos: ConflictRecord[] = []
  let mudou = false

  const anotar = (
    campo: string,
    valorLocal: unknown,
    valorRemoto: unknown,
    resolucao: ResolucaoConflito,
    tsLocal: string | null,
    tsRemoto: string | null,
  ): void => {
    conflitos.push({
      tabla,
      row_id: rowId,
      campo,
      valor_local: valorLocal,
      valor_remoto: valorRemoto,
      valor_vencedor: resolucao === 'local_pendente' || resolucao === 'local_mais_novo' ? valorLocal : valorRemoto,
      resolucao,
      ts_local: tsLocal,
      ts_remoto: tsRemoto,
      vendor,
      criado_em: quando,
      visto: 0,
    })
  }

  /** Decide UN campo. `escrever` aplica el valor ganador en la fila mergeada. */
  const decidir = (
    caminho: string,
    valorLocal: unknown,
    valorRemoto: unknown,
    escrever: (valor: unknown) => void,
  ): void => {
    if (igual(valorLocal, valorRemoto)) return

    const tsLocal = tsDe(relogioLocal, caminho)
    const tsRemoto = tsDe(relogioRemoto, caminho)

    // ── Regla dura ────────────────────────────────────────────────────────
    // Hay una mutación local en vuelo sobre este campo: el remoto no entra,
    // ni siquiera si su timestamp es más nuevo. Ese cambio todavía no llegó
    // al servidor; el servidor está respondiendo con el estado ANTERIOR.
    if (pendentes.has(caminho) || pendentes.has(raiz(caminho))) {
      anotar(caminho, valorLocal, valorRemoto, 'local_pendente', tsLocal, tsRemoto)
      return
    }

    // ── LWW por campo ─────────────────────────────────────────────────────
    if (tsLocal !== null) {
      if (tsRemoto !== null && tsRemoto > tsLocal) {
        anotar(caminho, valorLocal, valorRemoto, 'remoto_mais_novo', tsLocal, tsRemoto)
        escrever(valorRemoto)
        mudou = true
        return
      }
      // El local es más nuevo (o el remoto no declaró reloj): se conserva.
      anotar(caminho, valorLocal, valorRemoto, 'local_mais_novo', tsLocal, tsRemoto)
      return
    }

    // Sin reloj local: la copia local es un espejo viejo del servidor, no una
    // edición del vendedor. Se aplica el remoto en silencio — registrar esto
    // como "conflicto" llenaría la bandeja de ruido en cada pull.
    escrever(valorRemoto)
    mudou = true
  }

  for (const [campo, valorRemoto] of Object.entries(remoto)) {
    if (CAMPOS_IMUTAVEIS.has(campo)) continue

    if (CAMPOS_JSONB_POR_CAMPO.has(campo)) {
      if (typeof valorRemoto !== 'object' || valorRemoto === null) continue
      const objLocal = (typeof local[campo] === 'object' && local[campo] !== null
        ? local[campo]
        : {}) as Record<string, unknown>
      const objRemoto = valorRemoto as Record<string, unknown>

      const resultado: Record<string, unknown> = { ...objLocal }
      for (const chave of new Set([...Object.keys(objLocal), ...Object.keys(objRemoto)])) {
        decidir(`${campo}.${chave}`, objLocal[chave], objRemoto[chave], (valor) => {
          if (valor === undefined) delete resultado[chave]
          else resultado[chave] = valor
        })
      }
      if (!igual(resultado, objLocal)) merged[campo] = resultado
      continue
    }

    decidir(campo, local[campo], valorRemoto, (valor) => {
      merged[campo] = valor
    })
  }

  return { merged: merged as T, conflitos, mudou }
}

/* ══════════════════════════════════════════════════════════════════════════
   Relojes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Reloj remoto de una fila: `updated_at` para toda la fila y, si la tabla lo
 * tiene, `scales_updated_at` (jsonb) con un timestamp por escala. Ese jsonb es
 * lo que hace posible el LWW por campo de verdad y no por fila.
 */
export function relogioRemotoDe(linha: Record<string, unknown>): RelogioDeCampos {
  const relogio: RelogioDeCampos = {}
  const updatedAt = linha['updated_at'] ?? linha['last_update']
  if (typeof updatedAt === 'string') relogio['*'] = updatedAt

  const porEscala = linha['scales_updated_at']
  if (porEscala !== null && typeof porEscala === 'object') {
    for (const [chave, valor] of Object.entries(porEscala as Record<string, unknown>)) {
      if (typeof valor === 'string') relogio[`scales.${chave}`] = valor
    }
  }
  return relogio
}

/* ══════════════════════════════════════════════════════════════════════════
   Registro de conflictos
   ══════════════════════════════════════════════════════════════════════════ */

export async function registrarConflitos(conflitos: readonly ConflictRecord[]): Promise<void> {
  if (conflitos.length === 0) return
  await getDb().conflicts.bulkAdd(conflitos as ConflictRecord[])
}

/** Compat con la firma del stub original. */
export async function logConflict(
  tabla: string,
  rowId: string | number,
  campo: string,
  valorLocal: unknown,
  valorRemoto: unknown,
  resolucao: ResolucaoConflito = 'local_pendente',
): Promise<void> {
  await registrarConflitos([
    {
      tabla,
      row_id: rowId,
      campo,
      valor_local: valorLocal,
      valor_remoto: valorRemoto,
      valor_vencedor: resolucao.startsWith('local') ? valorLocal : valorRemoto,
      resolucao,
      ts_local: null,
      ts_remoto: null,
      vendor: null,
      criado_em: agora(),
      visto: 0,
    },
  ])
}

export async function listarConflitos(limite = 50): Promise<ConflictRecord[]> {
  const linhas = await getDb().conflicts.orderBy('criado_em').reverse().limit(limite).toArray()
  return linhas
}

export async function contarConflitosNaoVistos(): Promise<number> {
  return getDb().conflicts.where('visto').equals(0).count()
}

export async function marcarConflitosVistos(): Promise<void> {
  await getDb().conflicts.where('visto').equals(0).modify({ visto: 1 })
}

/** Poda: el log local no es el registro de auditoría (ese vive en Postgres). */
export async function podarConflitos(maximo = 500): Promise<void> {
  const db = getDb()
  const total = await db.conflicts.count()
  if (total <= maximo) return
  const sobrando = await db.conflicts
    .orderBy('criado_em')
    .limit(total - maximo)
    .primaryKeys()
  await db.conflicts.bulkDelete(sobrando)
}

/* ══════════════════════════════════════════════════════════════════════════
   Reconciliador: dónde se aplican las tres reglas
   ══════════════════════════════════════════════════════════════════════════ */

/** Fila genérica de un store espejado. */
type LinhaGenerica = Record<string, unknown>

/**
 * El store de Dexie que corresponde a una tabla del servidor. Hoy es 1:1;
 * la indirección existe para que un rename en Postgres no obligue a migrar
 * el IndexedDB de los seis teléfonos.
 */
export function storeDe(tabla: SyncTable): string {
  return tabla
}

function tabelaLocal(tabla: SyncTable): Table<LinhaGenerica, string | number> {
  return getDb().table(storeDe(tabla)) as Table<LinhaGenerica, string | number>
}

export type ResultadoAplicacao = 'inserido' | 'mesclado' | 'sem_mudanca'

/**
 * Aplica una fila remota sobre la copia local respetando las tres reglas.
 * La usan tanto el pull incremental (sync.ts) como el realtime (realtime.ts):
 * un único camino de entrada para los datos del servidor.
 */
export async function aplicarRemoto(
  tabla: SyncTable,
  remoto: LinhaGenerica,
  opcoes: { vendor?: string | null } = {},
): Promise<ResultadoAplicacao> {
  const vendor = opcoes.vendor ?? null

  // ── Regla 1: append-only ────────────────────────────────────────────────
  if (ehAppendOnly(tabla)) {
    return aplicarAppendOnly(tabla, remoto)
  }

  const id = remoto['id']
  if (id === undefined || id === null) return 'sem_mudanca'

  const store = tabelaLocal(tabla)
  const local = await store.get(id as string | number)

  if (!local) {
    await store.put(remoto)
    return 'inserido'
  }

  const [camposPendentes, relogioLocal] = await Promise.all([
    pendingFields(tabla, id as string | number),
    relogioPendente(tabla, id as string | number),
  ])

  const { merged, conflitos, mudou } = mergeByField({
    tabla,
    rowId: id as string | number,
    local,
    remoto,
    relogioLocal,
    relogioRemoto: relogioRemotoDe(remoto),
    camposPendentes,
    vendor,
  })

  await registrarConflitos(conflitos)
  if (!mudou) return 'sem_mudanca'
  await store.put(merged)
  return 'mesclado'
}

/**
 * Append-only: la fila entra por client_uuid. Si ya estaba (porque la
 * escribimos nosotros offline), se actualiza con el id definitivo del
 * servidor y se apaga el flag `pendente` — pero NUNCA se duplica.
 */
async function aplicarAppendOnly(
  tabla: SyncTable,
  remoto: LinhaGenerica,
): Promise<ResultadoAplicacao> {
  const clientUuid = typeof remoto['client_uuid'] === 'string' ? remoto['client_uuid'] : null
  const uid = clientUuid ?? `srv:${String(remoto['id'] ?? '')}`
  const store = tabelaLocal(tabla)

  const existente = await store.get(uid)
  const linha: LinhaGenerica = { ...remoto, uid, client_uuid: clientUuid, pendente: 0 }

  if (existente && igual({ ...existente, pendente: 0 }, linha)) return 'sem_mudanca'
  await store.put(linha)
  return existente ? 'mesclado' : 'inserido'
}
