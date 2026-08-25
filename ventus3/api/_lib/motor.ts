// api/_lib/motor.ts
// El motor determinístico del chat: las consultas de sólo lectura se resuelven
// acá, con datos, sin gastar un token.
//
// POR QUÉ EXISTE: «o que eu faço hoje», «em que pé tá a Tetra», «quem tá sem
// toque há 15 dias» y «como tá o pipeline» son el 60% de lo que el equipo le
// pregunta al bot, y son exactamente las preguntas que un LLM responde peor:
// tiene que leer una cartera entera en el contexto para contar filas. El motor
// las responde en milisegundos, con la misma aritmética que la pantalla Hoje,
// y encima funciona cuando la API de Anthropic está caída.
//
// El acuerdo con el modelo es el del plano: el motor produce HECHOS y
// PRIORIDADES; la capa LLM redacta, explica y coachea. Si la pregunta no cae
// en ninguno de los cinco moldes, esto devuelve null y el turno sigue al chat.

import type { Opportunity } from '../../src/core/index.js'
import {
  analisarCarteira,
  calculateHealthScore,
  formatarBRL,
  formatarDataCurta,
  gateFaltante,
  getScaleScores,
  getStageName,
  rankDay,
} from '../../src/core/index.js'
import type { CarteiraDoVendedor } from './carteira.js'
import { diasSemContato, normalizar, resolverAlvo } from './carteira.js'
import { alvosDaCarteira } from './carteira.js'

export type IntencaoDeLeitura =
  | 'pendentes'
  | 'status_cliente'
  | 'sem_toque'
  | 'pipeline'
  | 'compromissos'
  | null

export interface RespostaDoMotor {
  texto: string
  intencao: Exclude<IntencaoDeLeitura, null>
  /** Siempre 0: es el punto del motor. */
  tokens: 0
}

const RE_PENDENTES = /\b(o que (eu )?(fa[çc]o|devo fazer)|pend[êe]ncias?|agenda|plano do dia|hoje|prioridade)\b/i
const RE_SEM_TOQUE = /\b(sem (contato|toque)|parad[ao]s?|esquecid[ao]s?|abandonad[ao]s?|h[áa] \d+ dias)\b/i
const RE_PIPELINE = /\b(pipeline|funil|carteira( toda)?|como (t[áa]|est[áa]) (o m[êe]s|a carteira)|previs[ãa]o)\b/i
const RE_COMPROMISSOS = /\b(compromissos?|o que (eu )?prometi|reuni[ãa]o de segunda)\b/i
// OJO con `\b` pegado a una vocal acentuada: en JS `\b` es ASCII, así que
// `p[ée]\b` NUNCA casa con «pé » — «é» no es word char y el espacio tampoco,
// así que no hay frontera. Es un bug que no da error, solo hace que el motor
// nunca reconozca «em que pé tá» y el equipo pague opus para leer una ficha.
const RE_STATUS = /(em que p[ée]|como (t[áa]|est[áa])|\bstatus\b|situa[çc][ãa]o|\bficha\b)/i

/** Clasificador por regex. Deliberadamente conservador: ante la duda, null. */
export function classificar(mensagem: string): IntencaoDeLeitura {
  const m = mensagem.trim()
  if (m.length > 220) return null // un texto largo es un relato, no una consulta
  if (RE_COMPROMISSOS.test(m)) return 'compromissos'
  if (RE_SEM_TOQUE.test(m)) return 'sem_toque'
  if (RE_PIPELINE.test(m)) return 'pipeline'
  if (RE_PENDENTES.test(m)) return 'pendentes'
  if (RE_STATUS.test(m)) return 'status_cliente'
  return null
}

/** Extrae «há N dias» de la pregunta. 15 es el default del bot. */
function janelaDeDias(mensagem: string): number {
  const m = /(\d{1,3})\s*dias?/i.exec(mensagem)
  const n = m?.[1] ? Number(m[1]) : NaN
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 15
}

function linhaDaOportunidade(o: Opportunity, carteira: CarteiraDoVendedor): string {
  const dias = diasSemContato(o, carteira)
  return `${o.client ?? o.name ?? `#${o.id}`} · etapa ${o.stage ?? '?'} ${getStageName(o.stage)} · ${formatarBRL(o.value)} · ${dias} dias sem contato`
}

function fichaCurta(o: Opportunity, carteira: CarteiraDoVendedor): string {
  const escalas = getScaleScores(o.scales)
  const saude = calculateHealthScore(o.scales)
  const dias = diasSemContato(o, carteira)
  const gate = o.stage ? gateFaltante(o.scales, o.stage) : null

  const linhas = [
    `${o.client ?? o.name} · etapa ${o.stage ?? '?'} ${getStageName(o.stage)} · ${formatarBRL(o.value)}`,
    `Saúde ${saude.toFixed(1)}/10 · ${dias} dias sem contato real`,
    `Escalas: ${Object.entries(escalas)
      .map(([k, v]) => `${k.toUpperCase()} ${v}`)
      .join(' · ')}`,
  ]
  if (gate) {
    linhas.push(`Trava para avançar: ${gate.escala.toUpperCase()} ${gate.atual} < ${gate.minimo} exigido.`)
  }
  linhas.push(
    o.next_action
      ? `Próxima ação: ${o.next_action}${o.next_action_date ? ` em ${formatarDataCurta(o.next_action_date, carteira.hoje)}` : ' — SEM DATA, e isso é o problema'}`
      : 'Próxima ação: não existe. É a primeira coisa a resolver.',
  )
  return linhas.join('\n')
}

/**
 * Responde sin tokens, o devuelve null para que el turno siga al modelo.
 *
 * `fatos` es lo que el cliente ya calculó offline con el mismo `src/core`. Se
 * usa como contexto, no se vuelve a calcular: eso es lo que evita quemar
 * tokens en «quantos dias sem contato».
 */
export function responderSemTokens(
  mensagem: string,
  carteira: CarteiraDoVendedor,
  opportunityId?: number | null,
): RespostaDoMotor | null {
  const intencao = classificar(mensagem)
  if (!intencao) return null

  switch (intencao) {
    case 'pendentes': {
      const plano = rankDay({
        vendor: carteira.vendor,
        today: carteira.hoje,
        opportunities: carteira.oportunidades,
        leads: carteira.leads,
        activities: carteira.atividades,
        tasks: carteira.tarefas,
        commitments: carteira.compromissos,
        touchpoints: carteira.touchpoints,
        vendorInfo: carteira.vendorInfo,
      })
      if (plano.top.length === 0) {
        return {
          intencao,
          tokens: 0,
          texto: 'Sua carteira está sem nada pendente hoje. Bom momento para puxar um lead novo da fila de prospecção.',
        }
      }
      const linhas = plano.top.map((a, i) => {
        const porque = a.porque[0]
        return `${i + 1}. ${a.entidade.cliente} — ${a.acao}${porque ? `\n   ${porque.sinal}: ${porque.detalhe}` : ''}`
      })
      const resto = plano.restantes > 0 ? `\n\nTem mais ${plano.restantes} na lista completa.` : ''
      return { intencao, tokens: 0, texto: `As 3 de hoje:\n${linhas.join('\n')}${resto}` }
    }

    case 'sem_toque': {
      const dias = janelaDeDias(mensagem)
      const paradas = carteira.oportunidades
        .map((o) => ({ o, d: diasSemContato(o, carteira) }))
        .filter((x) => x.d >= dias)
        .sort((a, b) => b.d - a.d)
        .slice(0, 10)
      if (paradas.length === 0) {
        return { intencao, tokens: 0, texto: `Nenhuma oportunidade sua está há ${dias} dias ou mais sem contato.` }
      }
      return {
        intencao,
        tokens: 0,
        texto: `${paradas.length} sem contato há ${dias} dias ou mais:\n${paradas
          .map((x) => `· ${linhaDaOportunidade(x.o, carteira)}`)
          .join('\n')}`,
      }
    }

    case 'pipeline': {
      const s = analisarCarteira(carteira.oportunidades, carteira.atividades, carteira.hoje)
      const semAcao = carteira.oportunidades.filter((o) => !o.next_action_date).length
      const linhas = [
        `${s.total} oportunidades vivas, ${formatarBRL(s.valorTotal)} de pipeline (${formatarBRL(s.valorPonderado)} ponderado).`,
        `${s.emRisco} em risco (${formatarBRL(s.valorEmRisco)}). Saúde média ${s.saudeMedia.toFixed(1)}/10.`,
        semAcao > 0 ? `${semAcao} sem próxima ação com data — é o buraco maior da carteira.` : null,
      ].filter((l): l is string => l !== null)
      if (s.topDeals.length > 0) {
        linhas.push(
          `Para empurrar: ${s.topDeals.map((d) => `${d.cliente} (${formatarBRL(d.valor)})`).join(', ')}.`,
        )
      }
      return { intencao, tokens: 0, texto: linhas.join('\n') }
    }

    case 'compromissos': {
      const pendentes = carteira.compromissos.filter((c) => c.status === 'pending')
      if (pendentes.length === 0) {
        return { intencao, tokens: 0, texto: 'Você não tem compromissos pendentes da reunião de segunda.' }
      }
      return {
        intencao,
        tokens: 0,
        texto: `${pendentes.length} compromissos abertos:\n${pendentes
          .map((c) => `· ${c.committed_action}${c.due_date ? ` — até ${formatarDataCurta(c.due_date, carteira.hoje)}` : ''}`)
          .join('\n')}`,
      }
    }

    case 'status_cliente': {
      const opp = opportunityId
        ? (carteira.oportunidades.find((o) => o.id === opportunityId) ?? null)
        : acharPeloTexto(mensagem, carteira)
      if (!opp) return null // sin cliente identificado, que responda el modelo
      return { intencao, tokens: 0, texto: fichaCurta(opp, carteira) }
    }
  }
}

/** Busca el cliente nombrado en la pregunta. Devuelve null si es ambiguo. */
function acharPeloTexto(mensagem: string, carteira: CarteiraDoVendedor): Opportunity | null {
  const alvos = alvosDaCarteira(carteira)
  const limpo = normalizar(mensagem)
  // Se prueba de la palabra más larga a la más corta: los nombres de empresa
  // suelen ser la palabra menos común de la frase.
  const palavras = [...new Set(limpo.split(' '))].filter((p) => p.length >= 4).sort((a, b) => b.length - a.length)
  for (const palavra of palavras) {
    try {
      const alvo = resolverAlvo(palavra, alvos, 'opportunity')
      return carteira.oportunidades.find((o) => o.id === alvo.id) ?? null
    } catch {
      // Ambiguo o inexistente: se prueba la siguiente palabra.
    }
  }
  return null
}
