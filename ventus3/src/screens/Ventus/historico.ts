// src/screens/Ventus/historico.ts
// El historial del chat, persistido POR OPORTUNIDAD.
//
// Por qué por oportunidad y no una sola conversación: el vendedor no habla con
// un asistente, habla SOBRE un cliente. Abrir la ficha de la Tetra Pak y
// encontrar la conversación de la Tetra Pak es la diferencia entre un chat y
// una herramienta de trabajo.
//
// Se guarda en el store `meta` de Dexie (no en localStorage): el historial con
// previews de acciones pasa fácil los 5 MB de cuota de Safari, y ahí el fallo
// sería silencioso.

import { gravarMeta, lerMeta } from '@/data'
import type { OrigemDaResposta, VentusPreview, VentusTurno } from './contrato'

/** Cuántos turnos se guardan por conversación. Más que esto nadie relee. */
export const LIMITE_TURNOS = 60

/** Cuántos turnos viajan como contexto al servidor. */
export const TURNOS_DE_CONTEXTO = 8

export type PapelMensagem = 'vendedor' | 'ventus'

/** Un turno tal como lo pinta la pantalla: el turno del contrato + estado. */
export interface Mensagem {
  id: string
  papel: PapelMensagem
  texto: string
  em: string
  /** true mientras los deltas siguen llegando: pinta el cursor. */
  streaming?: boolean
  /**
   * De dónde salió la respuesta. Es lo que la burbuja anuncia.
   *
   * Reemplaza a `local`/`offline`, que sólo sabían decir dos cosas y por eso
   * un 500 del servidor se mostraba como «sem conexão».
   */
  origem?: OrigemDaResposta
  /** @deprecated Sólo para los historiales ya guardados. Usar `origem`. */
  local?: boolean
  /** @deprecated Sólo para los historiales ya guardados. Usar `origem`. */
  offline?: boolean
  /** Enlaces que la respuesta local ofrece. */
  atalhos?: ReadonlyArray<{ rotulo: string; opportunityId?: number; rota?: string }>
  /** Lo que el Ventus quiere hacer, todavía sin hacer. */
  previews?: VentusPreview[]
  /** Voto ya emitido, para no volver a preguntar. */
  voto?: 'bom' | 'ruim' | null
  /** Código del error, cuando el turno terminó mal. */
  erro?: string | null
}

/**
 * De dónde salió esta respuesta, para la marca que pinta la burbuja.
 *
 * `local`/`offline` se siguen leyendo para los historiales YA guardados en
 * Dexie: una conversación de ayer no puede perder su procedencia sólo porque
 * el modelo de datos mejoró.
 */
export function origemDaMensagem(m: Mensagem): OrigemDaResposta | null {
  if (m.origem) return m.origem
  if (m.offline === true) return 'sem_rede'
  if (m.local === true) return 'motor'
  return null
}

/** Clave de la conversación. `geral` es el chat sin ficha abierta. */
export function chaveHistorico(vendor: string, opportunityId: number | null): string {
  return `ventus:chat:${vendor}:${opportunityId === null ? 'geral' : String(opportunityId)}`
}

export async function lerHistorico(
  vendor: string,
  opportunityId: number | null,
): Promise<Mensagem[]> {
  const bruto = await lerMeta<Mensagem[]>(chaveHistorico(vendor, opportunityId))
  if (!Array.isArray(bruto)) return []
  // El `streaming` no sobrevive a un reload: si la app murió a mitad de un
  // turno, la burbuja quedaría con el cursor parpadeando para siempre.
  return bruto.map((m) => ({ ...m, streaming: false }))
}

export async function gravarHistorico(
  vendor: string,
  opportunityId: number | null,
  mensagens: readonly Mensagem[],
): Promise<void> {
  const recortado = mensagens.slice(-LIMITE_TURNOS)
  await gravarMeta(chaveHistorico(vendor, opportunityId), recortado)
}

export async function limparHistorico(
  vendor: string,
  opportunityId: number | null,
): Promise<void> {
  await gravarMeta(chaveHistorico(vendor, opportunityId), [])
}

/** Los últimos turnos, en la forma que espera el contrato del servidor. */
export function contextoParaServidor(mensagens: readonly Mensagem[]): VentusTurno[] {
  return mensagens
    .filter((m) => m.texto.trim() !== '' && m.erro == null)
    .slice(-TURNOS_DE_CONTEXTO)
    .map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, em: m.em }))
}

/** Id de turno. No usa crypto.randomUUID solo: hay WebViews viejas sin él. */
export function novoTurnoId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `t${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`
}
