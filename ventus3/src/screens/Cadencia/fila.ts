// src/screens/Cadencia/fila.ts
// La fila de cadencia: ordenar por la FECHA REAL del próximo toque y filtrar
// por etapa. Puro y síncrono, sobre los leads que ya están en memoria.
//
// La diferencia con el v2 no es cosmética. Allá la pantalla es un kanban de 4
// columnas donde cada una junta lo que cae dentro de un umbral fijo (3 días, 5
// días), así que un lead con el toque vencido hace 12 días y otro que vence
// mañana viven en la misma caja y se leen igual. Acá hay UNA lista, ordenada
// por cuánto hace que el toque venció: lo más atrasado arriba, siempre.

import {
  CADENCE_SCHEDULE,
  LEAD_STAGE_ORDER,
  MAX_TOUCHPOINTS,
  calcNextTouchpointDate,
  isCadenceExhausted,
  toBrDate,
  todayBr,
  type IsoDate,
  type Lead,
  type LeadStage,
} from '@/core'
import type { LinhaCadencia } from '@/data'

/* ══════════════════════════════════════════════════════════════════════════
   Fecha alvo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La fecha en la que ese toque tenía que salir.
 *
 * Es la MISMA cascada que usa `touchpointDelayDays` en el dominio —
 * `next_touchpoint_date`, si no el último toque + el intervalo del paso, si no
 * la fecha de creación — pero devolviendo la fecha en vez de los días. Se
 * duplica el orden de precedencia, no la aritmética: `calcNextTouchpointDate`
 * es de core y toda la matemática de fechas sigue viviendo allá.
 *
 * Devuelve null solo cuando la cadencia se agotó (7 de 7): ese lead ya no
 * espera ningún toque.
 */
export function dataAlvo(lead: Lead): IsoDate | null {
  if (isCadenceExhausted(lead)) return null
  if (lead.next_touchpoint_date) return toBrDate(lead.next_touchpoint_date)
  const base = lead.last_touchpoint_date ?? lead.created_at
  if (!base) return null
  return calcNextTouchpointDate(lead.touchpoints_count, toBrDate(base))
}

/** Estado del toque respecto de hoy. Decide el color y el orden. */
export type SituacaoToque = 'atrasado' | 'hoje' | 'agendado' | 'esgotado'

export function situacaoDoToque(lead: Lead, hoje: IsoDate = todayBr()): SituacaoToque {
  if (isCadenceExhausted(lead)) return 'esgotado'
  const alvo = dataAlvo(lead)
  if (alvo === null) return 'agendado'
  if (alvo < hoje) return 'atrasado'
  if (alvo === hoje) return 'hoje'
  return 'agendado'
}

/* ══════════════════════════════════════════════════════════════════════════
   Filtro por etapa
   ══════════════════════════════════════════════════════════════════════════ */

/** `todos` es una etapa más del control segmentado, no un estado aparte. */
export type FiltroEtapa = 'todos' | LeadStage

export const ETAPAS_FILTRO: readonly FiltroEtapa[] = ['todos', ...LEAD_STAGE_ORDER]

export const ETAPA_CURTA: Readonly<Record<FiltroEtapa, string>> = {
  todos: 'Tudo',
  '1a': '1A',
  '1b': '1B',
  '1c': '1C',
  '1d': '1D',
}

export type ContagemEtapas = Record<FiltroEtapa, number>

export function contarEtapas(linhas: readonly LinhaCadencia[]): ContagemEtapas {
  const contagem: ContagemEtapas = { todos: linhas.length, '1a': 0, '1b': 0, '1c': 0, '1d': 0 }
  for (const linha of linhas) contagem[linha.lead.stage] += 1
  return contagem
}

/**
 * Ordena por fecha alvo ascendente: lo más vencido primero.
 * Los que agotaron los 7 toques van al final — siguen visibles porque hay que
 * decidir qué hacer con ellos, pero no compiten con lo que todavía tiene
 * cadencia viva.
 */
export function ordenarPorDataAlvo(
  linhas: readonly LinhaCadencia[],
  hoje: IsoDate = todayBr(),
): LinhaCadencia[] {
  const chave = (linha: LinhaCadencia): string => {
    const alvo = dataAlvo(linha.lead)
    // '9999-…' empuja al final sin inventar una fecha que se pueda mostrar.
    return alvo ?? `9999-99-${situacaoDoToque(linha.lead, hoje) === 'esgotado' ? '99' : '98'}`
  }
  return [...linhas].sort(
    (a, b) => chave(a).localeCompare(chave(b)) || a.lead.id - b.lead.id,
  )
}

export function filtrarPorEtapa(
  linhas: readonly LinhaCadencia[],
  etapa: FiltroEtapa,
): LinhaCadencia[] {
  if (etapa === 'todos') return [...linhas]
  return linhas.filter((l) => l.lead.stage === etapa)
}

/** Fila lista para pintar: filtrada y ordenada por urgencia real. */
export function prepararFila(
  linhas: readonly LinhaCadencia[],
  etapa: FiltroEtapa,
  hoje: IsoDate = todayBr(),
): LinhaCadencia[] {
  return ordenarPorDataAlvo(filtrarPorEtapa(linhas, etapa), hoje)
}

/* ══════════════════════════════════════════════════════════════════════════
   Auxiliares de presentación
   ══════════════════════════════════════════════════════════════════════════ */

/** El paso del programa que toca ahora. null si ya se agotaron los 7. */
export function passoAtual(lead: Lead) {
  if (isCadenceExhausted(lead)) return null
  return CADENCE_SCHEDULE[lead.touchpoints_count] ?? null
}

/** Cuántos toques quedan de los 7. */
export function toquesRestantes(lead: Lead): number {
  return Math.max(0, MAX_TOUCHPOINTS - lead.touchpoints_count)
}
