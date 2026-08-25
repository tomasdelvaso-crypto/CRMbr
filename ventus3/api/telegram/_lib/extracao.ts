// api/telegram/_lib/extracao.ts
// El motor de interpretación del bot: mensaje → intención + registro/consulta.
//
// ══════════════════════════════════════════════════════════════════════════
// EL PROMPT ES EL DEL v2, NO UNO NUEVO
// ══════════════════════════════════════════════════════════════════════════
// `ventus-bot/lib/claude.js` lleva meses en producción con la jerga real del
// equipo: «Pepito» por PPVVCC, el portuñol del CEO, el contenido pegado de
// e-mail o WhatsApp, la regla de que no se inventa ni un cliente. Ese texto se
// conserva. Lo que cambia son tres cosas y todas son arreglos verificados:
//
//   1. `result` deja de ser prosa. El CRM espera un ENUM (`positivo`,
//      `neutro`, `negativo`, `pendente`) y el bot escribía frases: 12 valores
//      conviviendo, el badge del histórico sin renderizar y el propio digest
//      sin icono. Ahora el modelo devuelve el enum en `resultado` y la frase
//      en `resultado_nota`.
//   2. Las escalas exigen CITA LITERAL, como en `/api/ingest`. Una escala sin
//      prueba es autoengaño y la base la rechaza a partir del nivel 6.
//   3. La próxima acción NO se pide en texto libre. El 43% de las respuestas
//      quedaba incompleta (7 de 16 medidas en `bot_log`). Se pide con botones.
//
// ══════════════════════════════════════════════════════════════════════════
// PROMPT CACHING
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 reinyecta la cartera completa 2-4 veces por interacción sin
// caché. Acá el system se arma con `systemComCache()` de `_lib/anthropic`: el
// prefijo estable (~2.500 tokens de PPVVCC, gates, cadencia y tono) lleva el
// breakpoint y la cartera va DESPUÉS, donde no lo invalida.

import type { ActivityResult, ActivityType, Channel, ScaleKey, TouchpointResult } from '../../../src/core'
import { ACTIVITY_RESULTS, ACTIVITY_TYPES, SCALE_KEYS, isIsoDate, todayBr } from '../../../src/core'
import { MODELOS, anthropic, custoUsd, systemComCache, textoDaResposta } from '../../_lib/anthropic'
import { registrarUso } from '../../_lib/usage'

/* ══════════════════════════════════════════════════════════════════════════
   Schema
   ══════════════════════════════════════════════════════════════════════════ */

const NULO_STR = { type: ['string', 'null'] }

const ALVO = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id', 'rotulo'],
  properties: {
    kind: { type: 'string', enum: ['opportunity', 'lead'] },
    id: { type: 'integer' },
    rotulo: { type: 'string', description: 'Nome curto e reconhecível, como aparece na carteira.' },
  },
}

const REGISTRO = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: [
    'alvo',
    'candidatos',
    'tipo',
    'canal',
    'resumo',
    'resultado',
    'resultado_nota',
    'resultado_lead',
    'proxima_acao',
    'proxima_acao_data',
    'escalas',
    'contatos',
  ],
  properties: {
    alvo: { anyOf: [ALVO, { type: 'null' }] },
    candidatos: {
      type: 'array',
      description: 'Até 5 candidatos quando o match é incerto. Só ids da carteira. Vazio se você reconheceu um só.',
      items: ALVO,
    },
    tipo: { type: 'string', enum: [...ACTIVITY_TYPES] },
    canal: { type: 'string', enum: ['linkedin', 'whatsapp', 'email', 'phone'] },
    resumo: { type: 'string', description: '1 a 3 frases em PT-BR limpo, sem muletas de fala.' },
    resultado: {
      type: 'string',
      enum: [...ACTIVITY_RESULTS],
      description: 'O desfecho CANÔNICO. É a única coluna pela qual dá para agrupar. Nunca prosa.',
    },
    resultado_nota: {
      ...NULO_STR,
      description: 'A frase sobre como ficou: "Ficou de mandar o volume até sexta". Aqui sim é prosa.',
    },
    resultado_lead: {
      anyOf: [
        {
          type: 'string',
          enum: ['no_response', 'interested', 'not_now', 'not_interested', 'meeting_scheduled', 'other'],
        },
        { type: 'null' },
      ],
      description: 'Só quando o alvo é um lead de prospecção.',
    },
    proxima_acao: { ...NULO_STR, description: 'Imperativa, começando com verbo. Null se o vendedor não disse.' },
    proxima_acao_data: { ...NULO_STR, description: 'YYYY-MM-DD já resolvida. Null se não foi dita.' },
    escalas: {
      type: 'array',
      description: 'Só escalas com sinal EXPLÍCITO. Cada uma exige a citação LITERAL que a sustenta.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['escala', 'para', 'citacao'],
        properties: {
          escala: { type: 'string', enum: [...SCALE_KEYS] },
          para: { type: 'integer', minimum: 0, maximum: 10 },
          citacao: { type: 'string', description: 'Trecho LITERAL do relato. Não parafraseie.' },
        },
      },
    },
    contatos: {
      type: 'array',
      description: 'Pessoas do cliente com papel EXPLÍCITO. Não deduza papéis.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['papel', 'nome'],
        properties: {
          papel: { type: 'string', enum: ['power_sponsor', 'sponsor', 'influencer', 'support_contact'] },
          nome: { type: 'string' },
        },
      },
    },
  },
}

const CONSULTA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['tipo', 'alvo', 'dias'],
  properties: {
    tipo: {
      type: 'string',
      enum: ['pendentes', 'status_cliente', 'sem_toque', 'pipeline', 'compromissos', 'hoje', 'outro'],
    },
    alvo: { anyOf: [ALVO, { type: 'null' }] },
    dias: { type: ['integer', 'null'] },
  },
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intencao', 'registro', 'consulta'],
  properties: {
    intencao: { type: 'string', enum: ['registro', 'consulta', 'outro'] },
    registro: REGISTRO,
    consulta: CONSULTA,
  },
}

/* ══════════════════════════════════════════════════════════════════════════
   Tipos de salida
   ══════════════════════════════════════════════════════════════════════════ */

export interface AlvoBruto {
  kind: 'opportunity' | 'lead'
  id: number
  rotulo: string
}

export interface RegistroBruto {
  alvo: AlvoBruto | null
  candidatos: AlvoBruto[]
  tipo: ActivityType
  canal: Channel
  resumo: string
  resultado: ActivityResult
  resultado_nota: string | null
  resultado_lead: TouchpointResult | null
  proxima_acao: string | null
  proxima_acao_data: string | null
  escalas: Array<{ escala: ScaleKey; para: number; citacao: string }>
  contatos: Array<{ papel: 'power_sponsor' | 'sponsor' | 'influencer' | 'support_contact'; nome: string }>
}

export interface ConsultaBruta {
  tipo: 'pendentes' | 'status_cliente' | 'sem_toque' | 'pipeline' | 'compromissos' | 'hoje' | 'outro'
  alvo: AlvoBruto | null
  dias: number | null
}

export interface Interpretacao {
  intencao: 'registro' | 'consulta' | 'outro'
  registro: RegistroBruto | null
  consulta: ConsultaBruta | null
}

export interface ContextoDeExtracao {
  vendorName: string
  isAdmin: boolean
  /** La cartera REAL leída del servidor. Es el único universo de match. */
  carteiraTexto: string
  origem: 'voz' | 'texto'
  /** Borrador previo, cuando el vendedor está corrigiendo. */
  rascunhoAtual?: string
  hoje?: string
}

/* ══════════════════════════════════════════════════════════════════════════
   El prompt validado
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El bloque volátil del system. Va DESPUÉS del breakpoint de caché: contiene
 * la fecha de hoy, el nombre del vendedor y la cartera, o sea todo lo que
 * cambia entre requests. Ponerlo antes dejaría `cache_read` en cero para
 * siempre sin dar ningún error.
 */
export function contextoDaExtracao(ctx: ContextoDeExtracao): string {
  const hoje = ctx.hoje ?? todayBr()
  const rotuloOrigem = ctx.origem === 'voz' ? 'transcrição de áudio' : 'texto'

  const partes = [
    `Você é o motor de interpretação do Ventus Bot, o bot de Telegram do CRM da Ventapel Brasil.`,
    `Hoje é ${hoje} (horário de Brasília). Quem fala é ${ctx.vendorName}${ctx.isAdmin ? ' (admin: enxerga a carteira de todos os vendedores)' : ''}.`,
    `A entrada é uma ${rotuloOrigem}. As mensagens vêm em português do Brasil, às vezes misturadas com espanhol — trate as duas como a mesma língua e responda sempre em PT-BR.`,
    '',
    'CLASSIFIQUE a mensagem:',
    '- "registro": relato de um contato com cliente (visita, ligação, reunião, demo, teste, proposta, negociação…). Transcrições de áudio quase sempre são registros.',
    '- "consulta": pergunta sobre a carteira. tipo: "pendentes" (agenda da semana), "hoje" (o que fazer hoje), "status_cliente" (em que pé está um cliente — preencha alvo com o id da carteira), "sem_toque" (oportunidades paradas; dias = janela pedida, default 15), "pipeline" (visão do funil), "compromissos" (compromissos da segunda), "outro".',
    '- "outro": saudações e assuntos fora do CRM.',
    '',
    'CONTEÚDO COLADO: o vendedor também pode colar um e-mail ou uma conversa de WhatsApp do cliente. Trate como registro desse contato: canal = email ou whatsapp conforme o caso, identifique o cliente pelo remetente, pela assinatura, pelo domínio ou pelo contexto, e o resumo conta quem disse o quê, decisões e números. Se o texto colado traz uma proposta de data do cliente ("podemos terça?"), isso ainda NÃO é a próxima ação do vendedor: só preencha proxima_acao se o vendedor a declarou.',
    '',
    'REGRAS DO REGISTRO (crítico):',
    '1. NUNCA invente cliente nem id. Só faça match com ids que aparecem na carteira abaixo. Match claro → alvo preenchido e candidatos vazio. Match incerto ou múltiplo → alvo null e até 5 candidatos. Nada plausível → alvo null e candidatos vazio.',
    '2. resumo: o que aconteceu, em PT-BR limpo, 1 a 3 frases, sem muletas de fala. Preserve números, nomes e datas mencionados.',
    '3. resultado: o desfecho CANÔNICO — positivo, neutro, negativo ou pendente. É um enum, não uma frase. A frase vai em resultado_nota ("demo realizada, cliente quer o teste na linha 3"). Sempre preencha os dois quando dá para inferir o desfecho.',
    '4. proxima_acao / proxima_acao_data: SÓ se o vendedor mencionou. Resolva datas relativas ("quinta que vem", "daqui a 15 dias") para YYYY-MM-DD contando a partir de hoje, sempre no futuro. Se não mencionou, deixe null: o bot pergunta com botões.',
    '5. escalas (metodologia Pepito/PPVVCC): capture sinais SÓ se aparecem explicitamente. dor = problema ou custo operacional do cliente; poder = quem decide ou influencia; visao = a solução que o cliente já visualiza; valor = números de economia ou ROI; controle = próximos passos acordados COM o cliente; compras = processo e prazos de compras. Cada escala exige a CITAÇÃO LITERAL do relato, copiada palavra por palavra. Não force: se não aparece, não proponha.',
    '6. tipo: a atividade mais próxima do contato. canal: o canal usado (importa para leads de prospecção). resultado_lead: só relevante quando o alvo é um lead.',
    '7. contatos: se o vendedor nomeia pessoas do cliente com papel claro, extraia SÓ o nome. power_sponsor: quem decide ou aprova. sponsor: quem defende a solução por dentro. influencer: quem influencia sem decidir. support_contact: o contato operacional do dia a dia. Não deduza papéis: se o papel não está explícito, não devolva o contato.',
    '',
    ctx.carteiraTexto,
  ]

  if (ctx.rascunhoAtual) {
    partes.push(
      '',
      'CORREÇÃO: o vendedor já tem um rascunho e está corrigindo UMA coisa. Aplique só o que a correção pede e mantenha o resto igual — a nota original tinha cinco dados e a correção toca um. Se a correção muda o cliente, refaça o match contra a carteira. Responda com intencao="registro" e o rascunho completo corrigido.',
      `RASCUNHO ATUAL: ${ctx.rascunhoAtual}`,
    )
  }

  return partes.join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   Llamada
   ══════════════════════════════════════════════════════════════════════════ */

export class ErroDeExtracao extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeExtracao'
  }
}

export async function interpretar(texto: string, ctx: ContextoDeExtracao): Promise<Interpretacao> {
  const comecou = Date.now()
  const modelo = MODELOS.redator

  const resposta = await anthropic().messages.create({
    model: modelo.id,
    max_tokens: 3000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'low' },
    system: systemComCache(contextoDaExtracao(ctx)),
    messages: [
      {
        role: 'user',
        content: `Mensagem do vendedor (${ctx.origem === 'voz' ? 'transcrição de áudio' : 'texto'}):\n"""${texto}"""`,
      },
    ],
  })

  void registrarUso({
    vendor: ctx.vendorName,
    bucket: 'ingest',
    modelo: modelo.id,
    entrada: resposta.usage?.input_tokens ?? 0,
    saida: resposta.usage?.output_tokens ?? 0,
    cacheEscrito: resposta.usage?.cache_creation_input_tokens ?? 0,
    cacheLido: resposta.usage?.cache_read_input_tokens ?? 0,
    custoUsd: custoUsd(modelo, resposta.usage),
    duracaoMs: Date.now() - comecou,
    extra: { superficie: 'telegram', origem: ctx.origem },
  })

  if (resposta.stop_reason === 'refusal') {
    throw new ErroDeExtracao('o modelo recusou a mensagem')
  }

  let bruta: Interpretacao
  try {
    bruta = JSON.parse(textoDaResposta(resposta)) as Interpretacao
  } catch {
    throw new ErroDeExtracao('resposta do modelo não é JSON')
  }
  return sanear(bruta)
}

/**
 * Poda lo que el modelo no puede sostener. Todo lo que se deja pasar acá se
 * escribe en el CRM, así que la política es la del plano: en la duda, no.
 */
export function sanear(bruta: Interpretacao): Interpretacao {
  const registro = bruta.registro
  if (registro) {
    registro.candidatos = (registro.candidatos ?? []).slice(0, 5)
    registro.escalas = (registro.escalas ?? []).filter((e) => e.citacao && e.citacao.trim().length >= 8)
    registro.contatos = (registro.contatos ?? []).filter((c) => c.nome && c.nome.trim() !== '')
    if (!isIsoDate(registro.proxima_acao_data ?? '')) registro.proxima_acao_data = null
    if (!(ACTIVITY_RESULTS as readonly string[]).includes(registro.resultado)) {
      registro.resultado = 'neutro'
    }
    if (!(ACTIVITY_TYPES as readonly string[]).includes(registro.tipo)) registro.tipo = 'note'
    // Una próxima acción sin fecha no es una próxima acción: se descarta el
    // texto para que el gate de botones la pida entera.
    if (!registro.proxima_acao_data) registro.proxima_acao = registro.proxima_acao ?? null
  }
  return { intencao: bruta.intencao, registro: registro ?? null, consulta: bruta.consulta ?? null }
}

/**
 * ¿La cita aparece de verdad en la transcripción?
 *
 * El modelo parafrasea sin querer, y una cita parafraseada es una prueba
 * falsa: exactamente lo que la regra da prova viene a matar.
 */
export function citacaoVerificada(citacao: string, fonte: string): boolean {
  const limpar = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const c = limpar(citacao)
  if (c.length < 8) return false
  return limpar(fonte).includes(c)
}
