// src/screens/Dossie/timeline.ts
// El timeline unificado del dossiê: append-only y ordenado por fecha
// descendente, mezclando lo que en la base son cuatro cosas distintas.
//
// Para el vendedor todo esto es UNA conversación con el cliente:
//   · activities            lo que él registró (a mano, dictado o por el bot)
//   · touchpoints           los toques de cadencia del lead de origen
//   · mudanças de etapa     activities de tipo stage_change, con su propia forma
//   · movimentos de escala  el historial local, con la cita que lo sostiene
//
// El badge de origen es la parte que no se puede perder: 🎙 dictado, 🤖 escrito
// por el Ventus, ✋ tecleado por el vendedor, 💬 toque de cadencia. Saber quién
// escribió una línea es lo que separa un registro de un rumor.

import {
  ACTIVITY_TYPE_CONFIG,
  CHANNEL_LABELS,
  SCALE_LABELS,
  TOUCHPOINT_RESULT_LABELS,
  type Activity,
  type Touchpoint,
} from '@/core'
import type { MovimentoEscala } from '@/data'

/** De dónde salió la línea. Determina el badge. */
export type OrigemItem = 'voz' | 'ventus' | 'manual' | 'cadencia'

export const ORIGEM_ICONE: Readonly<Record<OrigemItem, string>> = {
  voz: '🎙',
  ventus: '🤖',
  manual: '✋',
  cadencia: '💬',
}

export const ORIGEM_ROTULO: Readonly<Record<OrigemItem, string>> = {
  voz: 'Nota de voz transcrita',
  ventus: 'Registrado pelo Ventus',
  manual: 'Registrado por você',
  cadencia: 'Toque de cadência',
}

export type TipoItem = 'atividade' | 'toque' | 'etapa' | 'escala'

export interface ItemLinhaDoTempo {
  id: string
  tipo: TipoItem
  origem: OrigemItem
  /** Instante ISO usado para ordenar. Siempre comparable como string. */
  quando: string
  /** Fecha civil YYYY-MM-DD, para agrupar por día. */
  dia: string
  /** Ícono del tipo de contacto (📞, 🤝, 🧪…). */
  icone: string
  titulo: string
  /** Cuerpo: la descripción, la transcripción o las notas del toque. */
  corpo: string | null
  /** Resultado, cuando lo hay. */
  resultado: string | null
  /** Cita textual asociada (movimientos de escala). */
  citacao: string | null
  /** Código del cookbook, ej. '3B'. */
  codigo: string | null
}

/** Instante comparable de una actividad: la fecha del hecho manda sobre la de carga. */
function instanteDaAtividade(a: Activity): string {
  const data = a.activity_date ?? ''
  const criado = a.created_at ?? ''
  if (data === '') return criado
  // activity_date es solo YYYY-MM-DD: se le pega la hora de carga para que dos
  // registros del mismo día no queden en orden aleatorio.
  const hora = criado.length > 10 ? criado.slice(10) : 'T23:59:59.999Z'
  return `${data}${hora}`
}

function origemDaAtividade(a: Activity): OrigemItem {
  switch (a.source) {
    case 'ai_parsed':
      return 'voz'
    case 'ai_generated':
    case 'system':
      return 'ventus'
    default:
      return 'manual'
  }
}

export interface EntradaLinhaDoTempo {
  activities: readonly Activity[]
  touchpoints: readonly Touchpoint[]
  movimentos: readonly MovimentoEscala[]
}

/** Arma el timeline completo, del más nuevo al más viejo. */
export function montarLinhaDoTempo(entrada: EntradaLinhaDoTempo): ItemLinhaDoTempo[] {
  const itens: ItemLinhaDoTempo[] = []

  for (const a of entrada.activities) {
    const quando = instanteDaAtividade(a)
    if (quando === '') continue
    const config = ACTIVITY_TYPE_CONFIG[a.activity_type]
    const etapa = a.activity_type === 'stage_change'
    itens.push({
      id: `a:${String(a.id)}:${quando}`,
      tipo: etapa ? 'etapa' : 'atividade',
      origem: origemDaAtividade(a),
      quando,
      dia: quando.slice(0, 10),
      icone: config.icon,
      titulo: config.label,
      corpo: a.description.trim() === '' ? null : a.description,
      resultado: a.result,
      citacao: null,
      codigo: a.methodology_code,
    })
  }

  for (const tp of entrada.touchpoints) {
    itens.push({
      id: `t:${String(tp.id)}:${tp.executed_at}`,
      tipo: 'toque',
      origem: 'cadencia',
      quando: tp.executed_at,
      dia: tp.executed_at.slice(0, 10),
      icone: '💬',
      titulo: `Toque ${String(tp.sequence_number)}/7 · ${CHANNEL_LABELS[tp.channel]}`,
      corpo: tp.notes,
      resultado: TOUCHPOINT_RESULT_LABELS[tp.result],
      citacao: null,
      codigo: null,
    })
  }

  for (const m of entrada.movimentos) {
    const subiu = m.para >= m.de
    itens.push({
      id: `e:${m.id}`,
      tipo: 'escala',
      origem: 'manual',
      quando: m.criado_em,
      dia: m.criado_em.slice(0, 10),
      icone: subiu ? '📈' : '📉',
      titulo: `${SCALE_LABELS[m.escala]}: ${String(m.de)} → ${String(m.para)}`,
      corpo: null,
      resultado: null,
      citacao: m.citacao,
      codigo: null,
    })
  }

  return itens.sort((a, b) => b.quando.localeCompare(a.quando))
}
