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
import { ErroOutbox, type OutboxMutation, type TransporteOutbox } from './local-types'

/** Código de violación de UNIQUE en Postgres. */
const PG_UNIQUE_VIOLATION = '23505'

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

async function enviarInsert(m: OutboxMutation): Promise<void> {
  // client_uuid viaja SIEMPRE: es el anti-duplicado del servidor.
  const linha = { ...m.payload, client_uuid: m.id }
  const { error, status } = await supabase.from(m.tabla).insert(linha)
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
  async enviar(m: OutboxMutation): Promise<void> {
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
