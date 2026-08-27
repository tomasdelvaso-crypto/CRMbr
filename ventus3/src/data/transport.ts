// src/data/transport.ts
// El transporte real del outbox: cómo una mutación encolada se convierte en
// una escritura en Supabase. Está separado de outbox.ts a propósito, para que
// la cola pueda testearse entera sin red y sin variables de entorno.
//
// Contrato con Postgres (ver supabase/migrations):
//  - activities, touchpoints y demás append-only tienen `client_uuid uuid UNIQUE`.
//    Un reintento del mismo insert choca con el UNIQUE (23505) y eso se lee
//    como ÉXITO: la fila ya está.
//  - las RPC de dominio aceptan `p_idempotency_key text` y devuelven el mismo
//    resultado si se las llama dos veces con la misma clave.

import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { desnormalizarLocal } from './conflicts'
import { ErroOutbox, type OutboxMutation, type TransporteOutbox } from './local-types'

/** Código de violación de UNIQUE en Postgres. */
const PG_UNIQUE_VIOLATION = '23505'

/**
 * Tablas cuyo esquema real tiene `client_uuid` (verificado por MCP). Antes
 * `enviarInsert` se lo agregaba a TODO insert por igual; `golden_sessions` no
 * tiene esa columna (ni la tuvo nunca: la vuelta anterior creyó que sí,
 * confundida por el nombre `golden_hour_sessions` que tampoco existe) y
 * `touchpoints` tampoco —entra por la RPC `registrar_touchpoint`, nunca por
 * insert directo—, así que agregarla ahí sería el mismo 400 PGRST204 de
 * columna inventada. Si se suma una tabla nueva por insert directo, hay que
 * decidir acá si de verdad tiene la columna — no asumirlo.
 */
const TABLAS_COM_CLIENT_UUID: ReadonlySet<string> = new Set(['activities', 'tasks'])

/**
 * Tablas que se escriben por upsert sobre una CLAVE NATURAL, no por un `id`
 * nuevo. `golden_sessions` tiene `unique (vendor, dia)` y ya puede tener una
 * fila del día — la escribió `api/dispatch/jobs.ts` la víspera con la fila
 * aprobada y cero resultados — así que un `insert` liso chocaría contra ese
 * UNIQUE, el outbox lo leería como 'duplicado' (éxito disfrazado) y el
 * resultado real de la hora nunca pisaría el servidor.
 */
const UPSERT_POR_TABELA: Readonly<Record<string, string>> = {
  golden_sessions: 'vendor,dia',
}

/**
 * Traduce un error de PostgREST a la clasificación del outbox.
 * La regla de oro: ante la duda, 'rede'. Reintentar es barato; descartar una
 * nota que el vendedor escribió en el galpón, no.
 */
export function classificarErroPostgrest(
  erro: PostgrestError | null,
  status: number,
): ErroOutbox | null {
  if (!erro) return null

  if (erro.code === PG_UNIQUE_VIOLATION) {
    return new ErroOutbox(`Já existe no servidor: ${erro.message}`, 'duplicado', erro)
  }
  // 23xxx integridad (FK, check, not-null), 22xxx datos inválidos,
  // 42501 RLS: reintentar no lo arregla nunca.
  if (/^(22|23)/.test(erro.code) || erro.code === '42501' || erro.code === '42703') {
    return new ErroOutbox(erro.message, 'permanente', erro)
  }
  // Staleness declarada por la propia RPC (propose-then-commit).
  if (erro.code === 'P0002' || /stale|precondi/i.test(erro.message)) {
    return new ErroOutbox(erro.message, 'conflito', erro)
  }
  if (status >= 500 || status === 0 || status === 408 || status === 429) {
    return new ErroOutbox(erro.message, 'rede', erro)
  }
  if (status >= 400 && status < 500) {
    return new ErroOutbox(erro.message, 'permanente', erro)
  }
  return new ErroOutbox(erro.message, 'rede', erro)
}

/** Un fallo de fetch (sin señal, DNS, TLS) siempre es de red. */
function erroDeRede(erro: unknown): ErroOutbox {
  const mensagem = erro instanceof Error ? erro.message : String(erro)
  return new ErroOutbox(`Sem conexão: ${mensagem}`, 'rede', erro)
}

/**
 * EL CUELLO. Todo lo que sale del outbox hacia Supabase pasa por acá, y acá se
 * traduce de la forma local a la forma de Postgres.
 *
 * Está en el flush y no en el enqueue a propósito: los teléfonos del equipo ya
 * tienen ítems encolados con la forma vieja (`kind`, `title`, `snoozed_until`),
 * y esos ítems nadie los va a reescribir. Traduciendo acá, el próximo flush
 * después de actualizar la app los sana solos. Ver desnormalizarLocal().
 */
function traduzir(m: OutboxMutation): OutboxMutation {
  // Las RPC reciben ARGUMENTOS de función, no columnas: sus nombres los define
  // la propia función de Postgres y traducirlos sería romperlos.
  if (m.op === 'rpc') return m
  const { payload, campos_tocados } = desnormalizarLocal(m.tabla, m.payload, m.campos_tocados)
  return { ...m, payload, campos_tocados }
}

async function enviarInsert(m: OutboxMutation): Promise<void> {
  // client_uuid viaja SOLO a las tablas que de verdad tienen la columna: es el
  // anti-duplicado del servidor (UNIQUE en public.tasks igual que en las
  // append-only), pero agregarla ciegamente a una tabla sin esa columna es un
  // 400 PGRST204 — el mismo error de columna inventada que ya rompió
  // `criarTask` una vez. El `id` que ya trae el payload es el MISMO uuid, y eso
  // también es a propósito: `aplicarRemoto` indexa la copia local de tasks por
  // `id`, así que dejar que Postgres generara el suyo con gen_random_uuid()
  // haría que la fila volviera del pull como una SEGUNDA tarea, al lado de la
  // optimista que ya está en pantalla.
  const linha = TABLAS_COM_CLIENT_UUID.has(m.tabla)
    ? { ...m.payload, client_uuid: m.id }
    : { ...m.payload }

  const onConflict = UPSERT_POR_TABELA[m.tabla]
  const { error, status } = onConflict
    ? await supabase.from(m.tabla).upsert(linha, { onConflict })
    : await supabase.from(m.tabla).insert(linha)
  const classificado = classificarErroPostgrest(error, status)
  if (classificado) throw classificado
}

async function enviarUpdate(m: OutboxMutation): Promise<void> {
  if (m.row_id === null) {
    throw new ErroOutbox(`Update sem row_id em ${m.tabla}`, 'permanente')
  }
  const { data, error, status } = await supabase
    .from(m.tabla)
    .update(m.payload)
    .eq('id', m.row_id)
    .select('id')

  const classificado = classificarErroPostgrest(error, status)
  if (classificado) throw classificado

  // Cero filas afectadas con 2xx = la fila no existe o RLS la esconde. No es
  // un error de red: es un conflicto que el humano tiene que ver.
  if (Array.isArray(data) && data.length === 0) {
    throw new ErroOutbox(
      `A linha ${String(m.row_id)} de ${m.tabla} não existe mais no servidor`,
      'conflito',
    )
  }
}

/**
 * Llama a una función de dominio con EXACTAMENTE los argumentos que armó la
 * mutación. Ni uno más.
 *
 * Antes, esto inyectaba `p_idempotency_key` en toda llamada. PostgREST resuelve
 * la sobrecarga por el CONJUNTO de nombres de argumento, así que un argumento
 * de más no se ignora: no encuentra la función y devuelve PGRST202. Como
 * ninguna de las funciones de 0009_rpcs.sql declara ese parámetro, TODAS las
 * escrituras de dominio fallaban.
 *
 * La idempotencia es responsabilidad de cada función y tiene el nombre que la
 * función le dio (registrar_touchpoint usa `p_client_uuid`, que la mutación ya
 * manda). El `idempotency_key` del outbox sigue siendo la clave de la cola.
 */
async function enviarRpc(m: OutboxMutation): Promise<void> {
  const funcao = m.rpc
  if (funcao === null || funcao === '') {
    throw new ErroOutbox(`Mutação rpc sem nome de função (tabela ${m.tabla})`, 'permanente')
  }
  const { error, status } = await supabase.rpc(funcao, { ...m.payload })
  const classificado = classificarErroPostgrest(error, status)
  if (classificado) throw classificado
}

/** El transporte que usa la app. */
export const transporteSupabase: TransporteOutbox = {
  async enviar(mutacao: OutboxMutation): Promise<void> {
    const m = traduzir(mutacao)
    try {
      if (m.op === 'insert') return await enviarInsert(m)
      if (m.op === 'update') return await enviarUpdate(m)
      return await enviarRpc(m)
    } catch (erro) {
      if (erro instanceof ErroOutbox) throw erro
      throw erroDeRede(erro)
    }
  },
}
