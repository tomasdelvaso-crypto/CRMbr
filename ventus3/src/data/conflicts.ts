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

/* ══════════════════════════════════════════════════════════════════════════
   Normalización de forma: el servidor y el modelo del motor no hablan igual
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `tasks` es la ÚNICA tabla cuyo esquema en Postgres no coincide con el tipo
 * que consume el motor. En el servidor la fila es
 * `{ titulo, opportunity_id, lead_id, snoozed_to, origem, prioridade… }`;
 * `core/types.Task` es `{ title, target: EntityRef, snoozed_until, kind }`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ESTA FUNCIÓN ES EL ARREGLO DE «NO PUEDO ACCIONAR NINGÚN BOTÓN»
 * ══════════════════════════════════════════════════════════════════════════
 * Sin ella, el pull escribía la fila cruda del servidor en `db.tasks` y
 * `core/planner.indexarTasks()` hacía `t.target.kind` sobre un `target`
 * inexistente:
 *
 *     TypeError: Cannot read properties of undefined (reading 'kind')
 *
 * Ese throw sube por `rankDay()` → `fetchPlanoFixado()` → la query `plano` de
 * la tela Hoje. TanStack Query conserva el último dato bueno cuando la query
 * falla, y el último dato bueno era el del arranque en frío: cartera vacía.
 * Resultado en pantalla, para siempre y sin ningún error visible: tres
 * esqueletos grises, «Baixando a sua carteira. Isso acontece uma vez só.» y
 * NINGÚN control que tocar. Ni el tiempo ni navegar y volver lo arreglaban —
 * solo recargar la app a mano.
 *
 * Nadie lo vio antes porque hasta el backfill de esta mañana
 * (`created_by: 'backfill-v2'`) la tabla `tasks` del servidor estaba VACÍA, y
 * las tareas que crea la propia app (`mutations.criarTask`) sí se escriben con
 * la forma local. El primer login del dueño del producto fue el primero con
 * tareas del servidor en la cartera — y las 36 filas del backfill están todas
 * en `pending`, así que la pantalla Hoje del equipo entero se rompía igual.
 *
 * Lo que NO se toca: las columnas crudas viajan intactas junto a las
 * normalizadas. Un PATCH del outbox manda solo los campos que tocó, así que
 * conservar `titulo` y `snoozed_to` es lo que mantiene el round-trip honesto.
 */
export function normalizarRemoto(tabla: SyncTable, remoto: LinhaGenerica): LinhaGenerica {
  if (tabla !== 'tasks') return remoto

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const opportunityId = num(remoto['opportunity_id'])
  const leadId = num(remoto['lead_id'])

  // Sin entidad no hay a qué acción apuntar. Se deja `target` ausente a
  // propósito: el planner ya ignora las tareas sin alvo (ver indexarTasks).
  const target =
    opportunityId !== null
      ? { kind: 'opportunity' as const, id: opportunityId }
      : leadId !== null
        ? { kind: 'lead' as const, id: leadId }
        : null

  const titulo = remoto['titulo']
  const title = typeof remoto['title'] === 'string' ? remoto['title'] : titulo

  return {
    ...remoto,
    ...(target ? { target } : {}),
    ...(typeof title === 'string' ? { title } : {}),
    // `origem` del servidor ('manual', 'backfill-v2'…) no es un TaskKind. Todo
    // lo que llega de afuera es la próxima acción de un negocio, que es
    // exactamente lo que `next_action` significa acá.
    kind: typeof remoto['kind'] === 'string' ? remoto['kind'] : 'next_action',
    snoozed_until: remoto['snoozed_until'] ?? remoto['snoozed_to'] ?? null,
    // El otro rename, el que no se ve porque no cambia de nombre sino de
    // VALOR: la tabla dice 'cancelled' y el modelo local dice 'dismissed'.
    // Ver STATUS_PARA_O_SERVIDOR, que hace el camino de vuelta.
    ...(remoto['status'] === 'cancelled' ? { status: 'dismissed' } : {}),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Desnormalización: el ESPEJO de normalizarRemoto, para el camino de SALIDA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Columnas REALES de `public.tasks`, verificadas contra el esquema por MCP el
 * 2026-08-26 (project wtrbvgqxgcfjacqcndmb).
 *
 * Es la lista que decide qué puede viajar. PostgREST rechaza con 400 cualquier
 * clave que no sea una columna —`{"code":"PGRST204","message":"Could not find
 * the 'kind' column of 'tasks' in the schema cache"}`— y el outbox clasifica
 * ese 4xx como 'permanente': el ítem se queda en la cola del teléfono para
 * siempre y el vendedor ve un badge de pendientes que no baja nunca.
 */
export const COLUNAS_TASKS = [
  'id',
  'client_uuid',
  'vendor',
  'vendor_id',
  'opportunity_id',
  'lead_id',
  'titulo',
  'canal',
  'due_date',
  'due_time',
  'prioridade',
  'target_scale',
  'draft_content',
  'expected_outcome',
  'status',
  'origem',
  'done_at',
  'snoozed_to',
  'resolved_activity_id',
  'created_by',
  'created_at',
  'updated_at',
] as const

const SET_COLUNAS_TASKS: ReadonlySet<string> = new Set(COLUNAS_TASKS)

/**
 * Campo local → columna de Postgres. Es literalmente la inversa de lo que
 * normalizarRemoto() construye al entrar.
 */
const RENOMES_TASKS: Readonly<Record<string, string>> = {
  title: 'titulo',
  snoozed_until: 'snoozed_to',
}

/**
 * El rename que no cambia de NOMBRE sino de VALOR.
 *
 * `core/types.TaskStatus` dice 'dismissed'; el CHECK `tasks_status_chk` solo
 * acepta pending/done/snoozed/**cancelled**. Es la misma trampa que `title` vs
 * `titulo`, escondida un nivel más abajo: la clave `status` SÍ es columna, así
 * que la lista de columnas la deja pasar y recién Postgres se queja —
 * 400 23514, que el outbox clasifica como permanente y el ítem se queda en el
 * teléfono para siempre.
 *
 * Quien lo manda es el Ritual da Sexta: un veredicto 'parcial' o 'nao_rolou'
 * sobre una tarea la deja 'dismissed' (ver rituais.registrarVeredicto).
 */
const STATUS_PARA_O_SERVIDOR: Readonly<Record<string, string>> = {
  dismissed: 'cancelled',
}

/**
 * Campos que SOLO existen en el modelo local: `kind` (TaskKind del motor, sin
 * columna en Postgres), `target` —que se abre en opportunity_id/lead_id— y los
 * metadatos de Dexie. Se descartan al salir, en silencio y a propósito.
 */
const SEM_COLUNA_TASKS: ReadonlySet<string> = new Set(['kind', 'uid', 'pendente'])

export interface SaidaDesnormalizada {
  /** Cuerpo listo para PostgREST: solo columnas que existen. */
  payload: Record<string, unknown>
  /** Los mismos campos tocados, con el nombre que tienen en Postgres. */
  campos_tocados: string[]
}

/** Abre un EntityRef local en el par de columnas del servidor. */
function alvoParaColunas(valor: unknown): { opportunity_id: number | null; lead_id: number | null } {
  const alvo = (typeof valor === 'object' && valor !== null ? valor : {}) as {
    kind?: unknown
    id?: unknown
  }
  const id = typeof alvo.id === 'number' ? alvo.id : null
  return {
    opportunity_id: alvo.kind === 'opportunity' ? id : null,
    lead_id: alvo.kind === 'lead' ? id : null,
  }
}

/**
 * Traduce una fila local a la forma de Postgres. Es el espejo exacto de
 * normalizarRemoto(): `title`→`titulo`, `snoozed_until`→`snoozed_to`,
 * `target`→`opportunity_id`/`lead_id`, y todo lo que no sea columna se cae.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ VIVE EN EL FLUSH Y NO EN EL ENQUEUE
 * ══════════════════════════════════════════════════════════════════════════
 * Porque hay ítems YA ENCOLADOS con la forma vieja —en los teléfonos del
 * equipo y en producción ahora mismo— que nadie va a poder tocar. Un
 * `criarTask` de ayer dejó en IndexedDB un payload con `kind`/`title`/
 * `snoozed_until`; si la traducción viviera solo en mutations.ts, esos ítems
 * seguirían saliendo mal para siempre: el arreglo llegaría por la actualización
 * de la app pero la cola quedaría envenenada igual. Traduciendo en el camino de
 * salida, el próximo flush los SANA solos sin que nadie los reescriba.
 *
 * Nota sobre `kind`: no hay columna que lo guarde. Al volver del servidor,
 * normalizarRemoto() lo reconstruye como 'next_action', que es lo que una
 * próxima acción de un negocio significa. La ida y vuelta es identidad para
 * ese kind y lossy para los demás — está cubierto por los tests.
 */
export function desnormalizarLocal(
  tabla: string,
  payload: Record<string, unknown>,
  camposTocados: readonly string[] = [],
): SaidaDesnormalizada {
  if (tabla !== 'tasks') {
    return { payload: { ...payload }, campos_tocados: [...camposTocados] }
  }

  const saida: Record<string, unknown> = {}

  // Dos pasadas: primero los alias locales, después los nombres de columna
  // reales. Así, si una fila trae `title` Y `titulo` —pasa con las que
  // vinieron del servidor y se editaron acá—, gana el nombre de la columna.
  for (const [chave, valor] of Object.entries(payload)) {
    if (valor === undefined) continue
    if (chave === 'target') {
      const { opportunity_id, lead_id } = alvoParaColunas(valor)
      saida['opportunity_id'] = opportunity_id
      saida['lead_id'] = lead_id
      continue
    }
    const renome = RENOMES_TASKS[chave]
    if (renome !== undefined) saida[renome] = valor
  }
  for (const [chave, valor] of Object.entries(payload)) {
    if (valor === undefined) continue
    if (SEM_COLUNA_TASKS.has(chave) || chave === 'target') continue
    if (!SET_COLUNAS_TASKS.has(chave)) continue
    saida[chave] = valor
  }

  // El vocabulario, después de los nombres. Ver STATUS_PARA_O_SERVIDOR.
  const status = saida['status']
  if (typeof status === 'string') {
    const traduzido = STATUS_PARA_O_SERVIDOR[status]
    if (traduzido !== undefined) saida['status'] = traduzido
  }

  const campos: string[] = []
  for (const campo of camposTocados) {
    for (const traduzido of colunasDoCampo(campo)) {
      if (!campos.includes(traduzido)) campos.push(traduzido)
    }
  }

  return { payload: saida, campos_tocados: campos }
}

/** Columnas de Postgres que representan a UN campo local de `tasks`. */
function colunasDoCampo(campo: string): string[] {
  if (campo === 'target') return ['opportunity_id', 'lead_id']
  const renome = RENOMES_TASKS[campo]
  if (renome !== undefined) return [renome]
  return SET_COLUNAS_TASKS.has(campo) ? [campo] : []
}

/**
 * Todos los nombres con los que un campo puede aparecer: el local y el de la
 * columna. Es lo que hace que la REGLA DURA no se escape por el rename.
 *
 * Sin esto: el vendedor adia una tarea (mutación pendiente sobre
 * `snoozed_until`), llega por realtime la fila del servidor con `snoozed_to`,
 * mergeByField no encuentra `snoozed_to` en la lista de pendientes y el valor
 * viejo del servidor pisa el adiamiento. Es exactamente el bug «mi cambio se
 * revirtió solo», que es el que no se perdona.
 */
export function nomesEquivalentes(tabla: string, campo: string): string[] {
  if (tabla !== 'tasks') return [campo]
  const nomes = new Set<string>([campo])
  for (const c of colunasDoCampo(campo)) nomes.add(c)
  for (const [local, coluna] of Object.entries(RENOMES_TASKS)) {
    if (coluna === campo) nomes.add(local)
  }
  if (campo === 'opportunity_id' || campo === 'lead_id') nomes.add('target')
  return [...nomes]
}

export type ResultadoAplicacao = 'inserido' | 'mesclado' | 'sem_mudanca'

/**
 * Aplica una fila remota sobre la copia local respetando las tres reglas.
 * La usan tanto el pull incremental (sync.ts) como el realtime (realtime.ts):
 * un único camino de entrada para los datos del servidor.
 */
export async function aplicarRemoto(
  tabla: SyncTable,
  remotoCru: LinhaGenerica,
  opcoes: { vendor?: string | null } = {},
): Promise<ResultadoAplicacao> {
  const vendor = opcoes.vendor ?? null
  // Antes de cualquier regla: la fila tiene que tener la forma que el motor
  // sabe leer. Ver normalizarRemoto().
  const remoto = normalizarRemoto(tabla, remotoCru)

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

  // El outbox habla en nombres LOCALES ('snoozed_until') y la fila remota trae
  // los dos ('snoozed_to' crudo + 'snoozed_until' normalizado). Sin expandir,
  // la regla dura no cubriría la columna cruda. Ver nomesEquivalentes().
  const pendentesExpandidos = camposPendentes.flatMap((c) => nomesEquivalentes(tabla, c))
  const relogioExpandido: RelogioDeCampos = {}
  for (const [campo, ts] of Object.entries(relogioLocal)) {
    for (const nome of nomesEquivalentes(tabla, campo)) {
      const anterior = relogioExpandido[nome]
      if (anterior === undefined || anterior < ts) relogioExpandido[nome] = ts
    }
  }

  const { merged, conflitos, mudou } = mergeByField({
    tabla,
    rowId: id as string | number,
    local,
    remoto,
    relogioLocal: relogioExpandido,
    relogioRemoto: relogioRemotoDe(remoto),
    camposPendentes: pendentesExpandidos,
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
