// src/screens/GoldenHour/fila.ts
// De la fila cruda (leads + entradas aprobadas la víspera) a lo que pinta el
// carrusel: para cada contacto, qué toque toca, por qué canal y con qué texto.
//
// Todo sale del dominio: CADENCE_SCHEDULE decide el paso, canalExecutavel
// decide el canal REAL (si el paso pide LinkedIn y el lead no tiene perfil, un
// botón de LinkedIn es un botón muerto) y draftForStep escribe el rascunho.
// Acá no se inventa contenido: se compone.

import {
  canalExecutavel,
  draftForStep,
  nextCadenceStep,
  type CadenceStep,
  type Channel,
  type Lead,
} from '@/core'
import type { GoldenQueueEntry } from '@/data'

export interface ItemDaFila {
  lead: Lead
  /** uid de la entrada aprobada la víspera, si la hay. Null si es derivada. */
  entradaUid: string | null
  passo: CadenceStep
  /** Canal realmente ejecutable. Null si el lead no tiene ningún dato. */
  canal: Channel | null
  rascunho: string
}

/** El paso de cadencia del lead, con tope en el TP7. */
function passoDoLead(lead: Lead): CadenceStep {
  const passo = nextCadenceStep(lead.touchpoints_count ?? 0)
  if (passo) return passo
  // Cadencia agotada: se muestra el TP7 (la despedida) en vez de dejar el card
  // vacío. buildGoldenQueue ya filtra estos, pero una fila aprobada la víspera
  // puede traer uno que se agotó a la mañana.
  return {
    tp: 7,
    day: 21,
    channel: 'whatsapp',
    label: 'Cadência esgotada — encerrar ou reciclar',
  }
}

/**
 * Compone la fila. Respeta el orden de `ordem` que recibe y no reordena nada:
 * la decisión de a quién se llama primero se toma la víspera, no durante.
 */
export function montarFila(
  leads: readonly Lead[],
  ordem: readonly number[],
  entradas: readonly GoldenQueueEntry[],
): ItemDaFila[] {
  const porId = new Map(leads.map((l) => [l.id, l]))
  const uidPorLead = new Map(entradas.map((e) => [e.lead_id, e.uid]))

  const itens: ItemDaFila[] = []
  for (const id of ordem) {
    const lead = porId.get(id)
    if (!lead) continue
    const passo = passoDoLead(lead)
    itens.push({
      lead,
      entradaUid: uidPorLead.get(id) ?? null,
      passo,
      canal: canalExecutavel(lead, passo),
      rascunho: draftForStep(lead, passo),
    })
  }
  return itens
}

/** Orden de la fila tal como llega de @/data, ya resuelta a ids. */
export function ordemDaFila(leads: readonly Lead[]): number[] {
  return leads.map((l) => l.id)
}
