// src/screens/Ventus/diagnostico.ts
// El diagnóstico determinístico de una ficha.
//
// NO es del modelo, y esa es la decisión importante: tiene que dar el MISMO
// número que el hexágono dos centímetros más arriba en la ficha. Un coach que
// contradice a la pantalla que lo contiene no es un coach, es ruido.
//
// Lo que sí es del modelo es refinar la redacción — para eso está el botón
// «Refinar», que abre el chat con la ficha en contexto.
//
// Vive fuera de PainelCoaching.tsx porque ese archivo solo puede exportar
// componentes (react-refresh/only-export-components), y porque una función
// pura se testea sin montar nada.

import {
  calculateHealthScore,
  escalaMaisFraca,
  gateFaltante,
  questionsForScale,
  SCALE_LABELS,
  type Opportunity,
} from '@/core'

export interface Diagnostico {
  /** Una frase. Lo que traba el negocio, sin rodeos. */
  titulo: string
  /** Dos o tres líneas con los números que lo sostienen. */
  evidencias: string[]
  /** La jugada: qué hacer ahora, concreto. */
  jogada: string
  /** El texto listo para mandar. El vendedor lo copia y sale. */
  rascunho: string
}

/**
 * El diagnóstico determinístico. Puro y testeable: mismas entradas, misma
 * salida, y ningún número que no venga del dominio.
 */
export function diagnosticar(opp: Opportunity, diasSemContato: number): Diagnostico {
  const saude = calculateHealthScore(opp.scales)
  const fraca = escalaMaisFraca(opp)
  const gate = opp.stage !== null ? gateFaltante(opp.scales, opp.stage) : null
  const cliente = opp.client ?? opp.name ?? 'o cliente'
  const contato = opp.power_sponsor ?? opp.sponsor ?? null
  const tratamento = contato !== null ? contato.split(' ')[0] : null

  // La pregunta SPIN sale del catálogo del dominio (192 preguntas con
  // vocabulario de planta), no de la imaginación del modelo: la implicación es
  // la categoría que mueve una escala baja.
  const perguntas = questionsForScale(fraca.escala, 'implicacao')
  const pergunta =
    perguntas[0]?.text ??
    questionsForScale(fraca.escala)[0]?.text ??
    'O que muda para vocês se isso continuar como está?'

  const evidencias = [
    `Saúde ${String(saude)}/10 · escala mais fraca: ${SCALE_LABELS[fraca.escala]} em ${String(fraca.valor)}.`,
    diasSemContato < 0
      ? 'Nenhum contato registrado até agora.'
      : `${String(diasSemContato)} dias sem contato registrado.`,
  ]
  if (gate !== null) evidencias.push(gate.texto)
  if (opp.next_action_date === null) {
    evidencias.push('Sem próxima ação com data — é o que faz o negócio parar sozinho.')
  }

  const titulo =
    gate !== null
      ? `O gate trava: ${SCALE_LABELS[fraca.escala]} não sustenta a etapa.`
      : diasSemContato >= 14
        ? `${String(diasSemContato)} dias de silêncio — o negócio esfriou.`
        : `Falta prova em ${SCALE_LABELS[fraca.escala]}.`

  const jogada = `Na próxima conversa, subir ${SCALE_LABELS[fraca.escala]} um nível com um dado concreto. Uma pergunta, uma citação anotada, e o número se move com prova.`

  const abertura =
    tratamento !== null ? `Oi, ${tratamento}!` : `Oi! Falo do time da Ventapel.`
  const rascunho = [
    abertura,
    '',
    diasSemContato >= 14
      ? `Faz um tempo que não conversamos sobre ${cliente} e quero retomar do ponto certo.`
      : `Queria fechar um ponto antes de seguir com ${cliente}.`,
    '',
    pergunta,
    '',
    'Se você me passar esse número, eu já trago a proposta ajustada na próxima.',
  ].join('\n')

  return { titulo, evidencias, jogada, rascunho }
}

