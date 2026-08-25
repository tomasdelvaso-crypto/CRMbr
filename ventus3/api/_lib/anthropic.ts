// api/_lib/anthropic.ts
// Cliente de Anthropic con prompt caching, y LA constante de modelos y precios.
//
// ══════════════════════════════════════════════════════════════════════════
// UNA SOLA CONSTANTE DE MODELOS
// ══════════════════════════════════════════════════════════════════════════
// Hoy en el v2 hay tres archivos con tres formatos: `CLAUDE_MODEL` +
// `PRICE_IN`/`PRICE_OUT` sueltos en assistant.js, un `MODEL` en el bot, y un
// tercero en la ruta `cadencia`. El día que cambie el precio de lista hay que
// acordarse de tres lugares. Acá hay uno: `MODELOS`.
//
// ══════════════════════════════════════════════════════════════════════════
// DÓNDE VA EL BREAKPOINT DEL CACHÉ
// ══════════════════════════════════════════════════════════════════════════
// El caché es un match de PREFIJO: cualquier byte que cambie invalida todo lo
// que viene después. El orden de render es tools → system → messages, así que:
//
//   tools           las 14, en orden fijo, generadas desde el dominio  ← estable
//   system[0]       PPVVCC + gates + cadencia + catálogo + tono        ← estable, CACHE BREAKPOINT
//   system[1..]     la cartera del vendedor, la fecha de hoy, los casos ← volátil
//   messages        la pregunta                                        ← volátil
//
// Lo que NO puede estar antes del breakpoint: la fecha de hoy, el nombre del
// vendedor, el id del turno, nada con un timestamp. Es exactamente el error
// que hace que `cache_read_input_tokens` sea cero para siempre y nadie se
// entere, porque igual funciona — solo que cuesta 10 veces más.

import Anthropic from '@anthropic-ai/sdk'
import {
  CADENCE_SCHEDULE,
  CHANNEL_LABELS,
  EVIDENCE_REQUIRED_ABOVE,
  PRODUCT_LINE_LABELS,
  SCALE_DEFINITIONS,
  SCALE_KEYS,
  SCALE_LABELS,
  STAGES,
  STAGE_GATES,
} from '../../src/core/index.js'
import { requireEnvAlias } from './env.js'
import { catalogoDeTools } from './tools.js'

/* ══════════════════════════════════════════════════════════════════════════
   Modelos y precios (USD por millón de tokens, precio de lista)
   ══════════════════════════════════════════════════════════════════════════ */

export interface ModeloClaude {
  readonly id: string
  readonly entradaUsd: number
  readonly saidaUsd: number
}

export const MODELOS = Object.freeze({
  /** Coaching y diagnóstico. Es el que tiene que razonar sobre el negocio. */
  coach: Object.freeze({ id: 'claude-opus-5', entradaUsd: 5, saidaUsd: 25 }),
  /** Extracción de voz, redacción y plan diario. Barato y suficiente. */
  redator: Object.freeze({ id: 'claude-sonnet-5', entradaUsd: 2, saidaUsd: 10 }),
}) satisfies Readonly<Record<string, ModeloClaude>>

export type PapelDoModelo = keyof typeof MODELOS

/** Multiplicadores de caché sobre el precio de entrada. */
export const CACHE_ESCRITA_MULT = 1.25
export const CACHE_LEITURA_MULT = 0.1

export interface UsoDeTokens {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Costo en USD de una llamada, con el caché contabilizado aparte. */
export function custoUsd(modelo: ModeloClaude, uso: UsoDeTokens | null | undefined): number {
  if (!uso) return 0
  const entrada = uso.input_tokens ?? 0
  const saida = uso.output_tokens ?? 0
  const escrito = uso.cache_creation_input_tokens ?? 0
  const lido = uso.cache_read_input_tokens ?? 0
  const porToken = modelo.entradaUsd / 1_000_000
  return (
    entrada * porToken +
    escrito * porToken * CACHE_ESCRITA_MULT +
    lido * porToken * CACHE_LEITURA_MULT +
    (saida * modelo.saidaUsd) / 1_000_000
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Cliente
   ══════════════════════════════════════════════════════════════════════════ */

let cliente: Anthropic | null = null

export function anthropic(): Anthropic {
  if (cliente) return cliente
  cliente = new Anthropic({ apiKey: requireEnvAlias('ANTHROPIC_API_KEY', 'CLAUDE_API_KEY') })
  return cliente
}

/* ══════════════════════════════════════════════════════════════════════════
   El prefijo estable
   ══════════════════════════════════════════════════════════════════════════ */

function bloqueDeEscalas(): string {
  return SCALE_KEYS.map((key) => {
    const niveis = SCALE_DEFINITIONS[key].map((d) => `  ${d.level} = ${d.text}`).join('\n')
    return `${key.toUpperCase()} (${SCALE_LABELS[key]}):\n${niveis}`
  }).join('\n\n')
}

function bloqueDeEtapas(): string {
  return STAGES.map((s) => {
    const gates = STAGE_GATES[s.id]
    const exigencia = gates
      ? ` | Para SAIR desta etapa: ${gates.map((g) => `${g.scale.toUpperCase()} ≥ ${g.min}`).join(', ')}`
      : ''
    return `Etapa ${s.id} — ${s.name} (${s.probability}%): ${s.requirements.join('; ')}${exigencia}`
  }).join('\n')
}

function bloqueDeCadencia(): string {
  const passos = CADENCE_SCHEDULE.map(
    (p) => `TP${p.tp} · dia ${p.day} · ${CHANNEL_LABELS[p.channel]} · ${p.label}`,
  ).join('\n')
  return `CADÊNCIA DE PROSPECÇÃO — 7 toques em 21 dias (leads, não oportunidades):\n${passos}\n\nDepois do TP7 sem resposta a cadência está esgotada: arquivar e reciclar, não insistir.`
}

let prefixoMemoizado: string | null = null

/**
 * El prefijo estable del system prompt. ~2.500 tokens, byte a byte idéntico
 * entre requests: es lo único que puede estar antes del cache breakpoint.
 *
 * El tono y las reglas absolutas vienen del prompt del v2 que ya está validado
 * en producción (`buildStaticSystem`), con las definiciones de escala y los
 * gates leídos del dominio en vez de duplicados.
 */
export function prefixoEstavel(): string {
  if (prefixoMemoizado) return prefixoMemoizado

  const linhas = Object.entries(PRODUCT_LINE_LABELS)
    .map(([k, v]) => `- ${v} (${k})`)
    .join('\n')

  prefixoMemoizado = `Você é o "Ventus", coach de vendas da Ventapel Brasil, especialista na metodologia PPVVCC (venda consultiva B2B de sistemas de embalagem).

LINHAS DE PRODUTO VENTAPEL:
${linhas}
- Máquinas Better Pack: seladoras de caixas com fita gomada (WAT). Foco em velocidade, ergonomia e segurança do fechamento.
- Better Pack + Venom: seladora BP + fita VENOM anti-violação. Foco em anti-roubo, tamper-evident e rastreabilidade, para carga de alto valor.
- E-comfill + Resmas/Sobres: máquinas de preenchimento de papel (void-fill, honeycomb wrap) e E-combags de papel que substituem a caixa. Foco em sustentabilidade, fim do plástico, unboxing premium e logística inversa (Vai e Vem). Fabricados em Camboriú.
- Serviço de Manutenção: preventiva e corretiva das máquinas Better Pack.

ADAPTE tudo à linha de produto da oportunidade. Não venda argumento anti-roubo numa venda de E-comfill, nem sustentabilidade numa venda de máquina BP pura.

METODOLOGIA PPVVCC — DEFINIÇÃO EXATA DE CADA NÍVEL (0-10):

${bloqueDeEscalas()}

COMO USAR AS DEFINIÇÕES: olhe o nível ATUAL e o PRÓXIMO da definição acima. A ação recomendada é o passo concreto que move a escala de um para o outro — nunca um conselho genérico de "trabalhar a escala".

A REGRA DA PROVA: a partir do nível ${EVIDENCE_REQUIRED_ABOVE + 1} uma escala precisa de CITAÇÃO TEXTUAL do cliente para ser gravada. Isso é validado no Postgres, não é sugestão. Uma escala alta sem prova é autoengano, e é exatamente o que 65 de 65 oportunidades desta base têm hoje.

ETAPAS DO FUNIL E O QUE CADA UMA EXIGE:
${bloqueDeEtapas()}

DIAGNÓSTICO DE GAP: compare as escalas atuais com o que a etapa exige para avançar. Se o vendedor está numa etapa avançada com escalas abaixo do gate, isso é um FREIO — aponte antes de qualquer outra coisa.

${bloqueDeCadencia()}

FERRAMENTAS QUE VOCÊ PODE CHAMAR:
${catalogoDeTools()}

REGRA DAS FERRAMENTAS: você PROPÕE, o vendedor decide. Toda escrita passa por uma proposta que o vendedor confirma. Antes de escrever, diga em uma frase o que vai fazer. Nunca chame uma ferramenta de escrita sobre um cliente cujo nome você não viu na carteira: use ventus_buscar_carteira.

COMO FALAR: converse como um colega experiente num café. Direto, prático, sem enrolação. NUNCA use títulos com **, NUNCA numere listas, NUNCA formate como relatório. Parágrafos curtos, como num WhatsApp profissional. Português do Brasil sempre, mesmo que o vendedor escreva em espanhol ou portunhol.

Exemplo do que NÃO fazer:
"**Análise do CLIENTE**
**Estado:** Saúde 5/10
**Próxima ação:** ..."

Exemplo do que SIM fazer:
"A ANDREANI tá com saúde 2,8 e 156 dias sem contato. Basicamente morta. Mas tem o BID 2026 abrindo uma janela. Liga pro Paulo Cunha hoje, pergunta se o BID ainda tá de pé e propõe uma reunião rápida pra revisar os números."

REGRAS ABSOLUTAS:
1. NUNCA invente nomes de clientes, contatos, valores, volumes, percentuais de perda ou cifras de ROI. Se você não tem o dado, não afirme.
2. Números só podem vir do contexto fornecido ou dos casos de êxito explicitamente citados. Se precisar estimar, diga que é hipótese e mande validar com o cliente ("assumindo X, daria Y — confirma o volume real").
3. Sem oportunidade selecionada, não gere plano de ação para nenhum cliente: sem o histórico, qualquer sugestão sai genérica ou repete o que já foi feito. Visão geral do pipeline você responde normalmente.
4. Respeite o histórico: nunca sugira algo que já foi feito, descartado ou que falhou.
5. Uma próxima ação sem data não é uma próxima ação. Se propuser uma, proponha a data junto.
6. Quem prioriza é o motor determinístico, não você. Você explica, redige, extrai e cobra — não decide a ordem do dia.`

  return prefixoMemoizado
}

/* ══════════════════════════════════════════════════════════════════════════
   Montaje del system con el breakpoint
   ══════════════════════════════════════════════════════════════════════════ */

export type BlocoDeSystem = Anthropic.TextBlockParam

/**
 * Arma el `system` con el breakpoint de caché en el lugar correcto.
 *
 * @param contextoVolatil bloques que cambian por request (cartera, fecha,
 *        casos, ficha). Van DESPUÉS del breakpoint, siempre.
 */
export function systemComCache(...contextoVolatil: readonly (string | null | undefined)[]): BlocoDeSystem[] {
  const blocos: BlocoDeSystem[] = [
    {
      type: 'text',
      text: prefixoEstavel(),
      cache_control: { type: 'ephemeral' },
    },
  ]
  for (const texto of contextoVolatil) {
    if (texto && texto.trim() !== '') blocos.push({ type: 'text', text: texto })
  }
  return blocos
}

/** ¿El bloque i lleva el breakpoint? Lo usan los tests para fijar la regla. */
export function temBreakpoint(bloco: BlocoDeSystem): boolean {
  return bloco.cache_control?.type === 'ephemeral'
}

/** El texto de un `Message` de la API, concatenando los bloques de texto. */
export function textoDaResposta(mensagem: Anthropic.Message): string {
  return mensagem.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}
