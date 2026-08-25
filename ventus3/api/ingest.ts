// api/ingest.ts — captura por voz (e por texto colado).
//
// Contrato: src/screens/Registrar/contrato.ts. Los tipos de allá son la fuente
// de verdad; acá se replican los que hacen falta porque `contrato.ts` importa
// `import.meta.env` y no puede cargarse desde el runtime de Node.
//
// ══════════════════════════════════════════════════════════════════════════
// ESTE ENDPOINT NO ESCRIBE EN LA BASE
// ══════════════════════════════════════════════════════════════════════════
// Transcribe, extrae y PROPONE. Quien escribe es el vendedor al tocar
// Confirmar, y esa escritura pasa por el outbox como cualquier otra. Es el
// propose-then-commit de M8 llevado a la ingesta: el modelo nunca es la última
// palabra sobre el CRM.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES REGLAS DURAS DEL PIPELINE
// ══════════════════════════════════════════════════════════════════════════
// 1. EL IDIOMA NO SE FIJA. El equipo habla portuñol; fijar 'pt' degrada las
//    partes en español y viceversa (ver _lib/groq.ts).
// 2. EL CLIENTE SE MATCHEA CONTRA LA CARTERA REAL, la que el servidor lee de
//    Supabase, no la que mandó el cliente. La lista del request se usa como
//    prior y se INTERSECTA: un candidato que no existe en la cartera del
//    vendedor se descarta aunque el modelo lo devuelva. Criterio de F3: cero
//    clientes inventados en 20 audios de prueba.
// 3. UNA ESCALA SIN CITA NO SE PROPONE, y una cita que no aparece en la
//    transcripción baja de confianza por debajo del umbral de preselección
//    (0,6). El modelo parafrasea sin querer, y una cita parafraseada es una
//    prueba falsa — exactamente lo que M6 viene a matar.

import type {
  ActivityResult,
  ActivityType,
  DateShortcut,
  IsoDate,
  IsoDateTime,
  ScaleKey,
  StageId,
} from '../src/core/index.js'
import {
  ACTIVITY_RESULTS,
  ACTIVITY_TYPES,
  SCALE_KEYS,
  getScaleScores,
  isIsoDate,
  resolveShortcut,
  todayBr,
} from '../src/core/index.js'
import { MODELOS, anthropic, custoUsd, systemComCache, textoDaResposta } from './_lib/anthropic.js'
import { requireAuth } from './_lib/auth.js'
import { carregarCarteira, normalizar } from './_lib/carteira.js'
import { transcrever } from './_lib/groq.js'
import type { ApiHandler } from './_lib/http.js'
import { HttpError, exigirMetodo, lerCorpoBruto, pedidoInvalido, rota } from './_lib/http.js'
import { lerFormulario } from './_lib/multipart.js'
import { checarCota, registrarUso } from './_lib/usage.js'

/* ══════════════════════════════════════════════════════════════════════════
   El contrato (espejo de src/screens/Registrar/contrato.ts)
   ══════════════════════════════════════════════════════════════════════════ */

export const CONTRATO_VERSAO = '1' as const
export const CAMPO_META = 'meta'
export const CAMPO_ARQUIVO = 'arquivo'

type FonteIngest = 'audio' | 'texto' | 'email' | 'whatsapp' | 'foto'

interface ItemCarteiraIngest {
  kind: 'opportunity' | 'lead'
  id: number
  nome: string
  cliente: string
}

interface IngestMeta {
  versao: typeof CONTRATO_VERSAO
  vendor: string
  vendorId?: number | null
  clientUuid: string
  fonte: FonteIngest
  capturadoEm: IsoDateTime
  duracaoSeg: number
  mime?: string
  alvoSugerido?: { kind: 'opportunity' | 'lead'; id: number } | null
  carteira: readonly ItemCarteiraIngest[]
  idioma?: 'auto' | 'pt-BR'
  hoje: IsoDate
  correcao?: { resumo: string; transcricao: string | null } | null
  /** Presente solo cuando la fuente es de texto. */
  texto?: string
}

interface CandidatoIngest {
  kind: 'opportunity' | 'lead'
  id: number
  nome: string
  cliente: string
  confianca: number
  motivo: string
}

interface DeltaEscalaIngest {
  escala: ScaleKey
  de: number | null
  para: number
  citacao: string
  fonte: string | null
  confianca: number
}

interface ContatoIngest {
  papel: 'power_sponsor' | 'sponsor' | 'influencer' | 'support_contact'
  nome: string
  cargo: string | null
  confianca: number
}

interface ProximaAcaoIngest {
  texto: string
  data: IsoDate | null
  atalho: DateShortcut | null
}

interface ExtracaoIngest {
  candidatos: CandidatoIngest[]
  tipo: ActivityType | null
  resumo: string
  resultado: ActivityResult | null
  resultadoTexto: string | null
  proximaAcao: ProximaAcaoIngest | null
  escalas: DeltaEscalaIngest[]
  contatos: ContatoIngest[]
  etapaSugerida: StageId | null
  metodologia: string | null
  sinais: string[]
}

interface IngestResponse {
  versao: typeof CONTRATO_VERSAO
  clientUuid: string
  transcricao: string | null
  extracao: ExtracaoIngest
  duracaoMs: number
  aviso: string | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Schema de la extracción (structured outputs)
   ══════════════════════════════════════════════════════════════════════════ */

const NULO_STR = { type: ['string', 'null'] }

const SCHEMA_EXTRACAO = {
  type: 'object',
  additionalProperties: false,
  required: [
    'candidatos',
    'tipo',
    'resumo',
    'resultado',
    'resultado_texto',
    'proxima_acao',
    'escalas',
    'contatos',
    'etapa_sugerida',
    'metodologia',
    'sinais',
  ],
  properties: {
    candidatos: {
      type: 'array',
      description:
        'Clientes possíveis, ordenados por confiança. Só ids que aparecem na CARTEIRA. Vazio se você não reconheceu ninguém — nunca invente.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'id', 'confianca', 'motivo'],
        properties: {
          kind: { type: 'string', enum: ['opportunity', 'lead'] },
          id: { type: 'integer' },
          confianca: { type: 'number', minimum: 0, maximum: 1 },
          motivo: {
            type: 'string',
            description: 'Por que este, citando o áudio: disse "Tetra" duas vezes.',
          },
        },
      },
    },
    tipo: { type: ['string', 'null'], enum: [...ACTIVITY_TYPES, null] },
    resumo: {
      type: 'string',
      description: '1 a 3 frases em PT-BR limpo, sem muletas de fala. Preserve números, nomes e datas.',
    },
    resultado: { type: ['string', 'null'], enum: [...ACTIVITY_RESULTS, null] },
    resultado_texto: {
      ...NULO_STR,
      description: 'A frase sobre como ficou: "Ficou de mandar o volume até sexta".',
    },
    proxima_acao: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['texto', 'data'],
      properties: {
        texto: { type: 'string', description: 'Imperativo, começando com verbo.' },
        data: { ...NULO_STR, description: 'YYYY-MM-DD já resolvida a partir de hoje. Null se não foi dita.' },
      },
    },
    escalas: {
      type: 'array',
      description:
        'Só escalas com sinal EXPLÍCITO no relato. Cada uma exige a citação TEXTUAL que a sustenta. Sem citação, não proponha a escala.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['escala', 'para', 'citacao', 'fonte', 'confianca'],
        properties: {
          escala: { type: 'string', enum: [...SCALE_KEYS] },
          para: { type: 'integer', minimum: 0, maximum: 10 },
          citacao: {
            type: 'string',
            description: 'Trecho LITERAL do relato, copiado palavra por palavra. Não parafraseie.',
          },
          fonte: { ...NULO_STR, description: 'Quem disse: "Marcelo, produção".' },
          confianca: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    contatos: {
      type: 'array',
      description: 'Pessoas do cliente com papel EXPLÍCITO no relato. Não deduza papéis.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['papel', 'nome', 'cargo', 'confianca'],
        properties: {
          papel: { type: 'string', enum: ['power_sponsor', 'sponsor', 'influencer', 'support_contact'] },
          nome: { type: 'string' },
          cargo: NULO_STR,
          confianca: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    etapa_sugerida: { type: ['integer', 'null'], enum: [1, 2, 3, 4, 5, 6, null] },
    metodologia: { ...NULO_STR, description: 'Código do cookbook, ex.: "3B".' },
    sinais: {
      type: 'array',
      description: 'Sinais de comprador detectados, em PT-BR, uma frase cada.',
      items: { type: 'string' },
    },
  },
}

interface ExtracaoBruta {
  candidatos: Array<{ kind: 'opportunity' | 'lead'; id: number; confianca: number; motivo: string }>
  tipo: ActivityType | null
  resumo: string
  resultado: ActivityResult | null
  resultado_texto: string | null
  proxima_acao: { texto: string; data: string | null } | null
  escalas: Array<{ escala: ScaleKey; para: number; citacao: string; fonte: string | null; confianca: number }>
  contatos: ContatoIngest[]
  etapa_sugerida: number | null
  metodologia: string | null
  sinais: string[]
}

/* ══════════════════════════════════════════════════════════════════════════
   Prompt — el system validado del bot, adaptado
   ══════════════════════════════════════════════════════════════════════════ */

function contextoDaExtracao(meta: IngestMeta, carteiraTexto: string, kindLabel: string): string {
  const partes = [
    `Hoje é ${meta.hoje} (fuso de São Paulo). Quem fala é ${meta.vendor}.`,
    `A entrada é uma ${kindLabel}. As mensagens vêm em português do Brasil, às vezes misturado com espanhol — trate as duas como a mesma língua e responda sempre em PT-BR.`,
    '',
    'REGRAS DO REGISTRO (críticas):',
    '1. NUNCA invente cliente nem id. Só faça match com ids que aparecem na carteira abaixo. Match claro → um candidato com confiança alta. Match incerto ou múltiplo → até 5 candidatos com confiança baixa. Nada plausível → lista vazia.',
    '2. resumo: o que aconteceu, em PT-BR limpo, 1 a 3 frases, sem muletas de fala. Preserve números, nomes e datas mencionados.',
    '3. resultado: o desfecho canônico. Use prosa livre só em resultado_texto — a coluna canônica é a única pela qual dá para agrupar.',
    '4. proxima_acao: SÓ se o vendedor a mencionou. Resolva datas relativas ("quinta que vem", "daqui a 15 dias") para YYYY-MM-DD contando a partir de hoje, sempre no futuro. Se não mencionou, deixe null — a tela pergunta com botões.',
    '5. escalas (PPVVCC): capture sinais SÓ se aparecem explicitamente. dor = problema ou custo operacional do cliente; poder = quem decide ou influencia; visao = a solução que o cliente já visualiza; valor = números de economia ou ROI; controle = próximos passos acordados COM o cliente; compras = processo e prazos de compras. Cada escala proposta exige a CITAÇÃO LITERAL do relato. Não force: se não aparece, não proponha.',
    '6. contatos: extraia só o nome quando o papel está explícito. Eles só preenchem campos vazios da ficha, nunca sobrescrevem o que já está no CRM.',
    '7. CONTEÚDO COLADO (e-mail ou WhatsApp do cliente): trate como registro desse contato. Identifique o cliente pelo remetente, pela assinatura, pelo domínio ou pelo contexto. Se o texto colado traz uma proposta de data do cliente ("podemos terça?"), isso ainda NÃO é a próxima ação do vendedor: só preencha proxima_acao se o vendedor a declarou.',
    '',
    carteiraTexto,
  ]

  if (meta.correcao) {
    partes.push(
      '',
      'CORREÇÃO FALADA: o vendedor já tem um rascunho e está corrigindo UMA coisa. Aplique só o que a correção pede e MANTENHA o resto igual — a nota original tinha cinco dados e a correção toca um. Se a correção muda o cliente, refaça o match contra a carteira.',
      `RASCUNHO ATUAL: ${meta.correcao.resumo}`,
      meta.correcao.transcricao ? `TRANSCRIÇÃO ORIGINAL: ${meta.correcao.transcricao}` : '',
    )
  }

  return partes.filter((p) => p !== '').join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   Validaciones del lado del servidor
   ══════════════════════════════════════════════════════════════════════════ */

/** ¿La cita aparece de verdad en la transcripción? */
function citacaoVerificada(citacao: string, fonte: string): boolean {
  const c = normalizar(citacao)
  if (c.length < 8) return false
  return normalizar(fonte).includes(c)
}

/** Qué atajo representa esa fecha, para preseleccionar la pastilla correcta. */
function atalhoDaData(data: IsoDate, hoje: IsoDate): DateShortcut | null {
  const candidatos: DateShortcut[] = ['hoje', 'amanha', 'segunda', 'mais7']
  for (const atalho of candidatos) {
    if (resolveShortcut(atalho, hoje) === data) return atalho
  }
  return null
}

function ehStageId(n: number | null): n is StageId {
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 6
}

/* ══════════════════════════════════════════════════════════════════════════
   Handler
   ══════════════════════════════════════════════════════════════════════════ */

/** 40 s de audio son ~700 kB en opus; 20 MB es un audio de casi 20 minutos. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

const handler: ApiHandler = async (req, res) => {
  const comecou = Date.now()
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)
  await checarCota(ctx, 'ingest')

  const formulario = await lerFormulario(req, (r) => lerCorpoBruto(r, MAX_AUDIO_BYTES))

  let meta: IngestMeta
  let arquivo: Buffer | null = null
  let mimeDoArquivo: string | null = null
  let nomeDoArquivo: string | undefined

  if (formulario.ehMultipart) {
    const parteMeta = formulario.campos.get(CAMPO_META)
    if (!parteMeta) throw pedidoInvalido('Faltou o campo meta.', 'pedido_invalido')
    try {
      meta = JSON.parse(parteMeta.conteudo.toString('utf8')) as IngestMeta
    } catch {
      throw pedidoInvalido('O campo meta não é JSON válido.', 'pedido_invalido')
    }
    const parteArquivo = formulario.campos.get(CAMPO_ARQUIVO)
    if (parteArquivo) {
      arquivo = parteArquivo.conteudo
      mimeDoArquivo = parteArquivo.contentType
      nomeDoArquivo = parteArquivo.nomeDeArquivo ?? undefined
    }
  } else {
    try {
      meta = JSON.parse(formulario.bruto.toString('utf8')) as IngestMeta
    } catch {
      throw pedidoInvalido('Corpo do pedido não é JSON válido.', 'pedido_invalido')
    }
  }

  if (meta.versao !== CONTRATO_VERSAO) {
    throw new HttpError(
      400,
      'versao_incompativel',
      'Sua versão do app está velha. Atualize e tente de novo.',
      `versão ${String(meta.versao)}`,
    )
  }
  if (!meta.clientUuid) throw pedidoInvalido('Faltou o clientUuid.', 'pedido_invalido')

  const hoje = isIsoDate(meta.hoje) ? meta.hoje : todayBr()

  // ── 1. Transcripción ──────────────────────────────────────────────────
  let transcricao: string | null = null
  let texto: string
  let aviso: string | null = null

  if (meta.fonte === 'audio') {
    if (!arquivo) throw new HttpError(400, 'audio_invalido', 'O áudio não chegou. Tente gravar de novo.')
    const asr = await transcrever(arquivo, mimeDoArquivo ?? meta.mime, nomeDoArquivo)
    transcricao = asr.texto
    texto = asr.texto
    if (texto.length < 12) {
      aviso = 'Áudio curto: só deu para o essencial.'
    }
    if (texto === '') {
      throw new HttpError(422, 'audio_vazio', 'Não saiu nada no áudio. Segura o botão e fala de novo.')
    }
  } else if (meta.fonte === 'foto') {
    // La lectura de imágenes todavía no está: se dice, no se finge.
    throw new HttpError(
      501,
      'not_implemented',
      'Ler foto ainda não está ligado. Cola o texto ou grava um áudio.',
    )
  } else {
    texto = (meta.texto ?? '').trim()
    if (texto === '') throw pedidoInvalido('Não veio nenhum texto para interpretar.', 'pedido_invalido')
  }

  // ── 2. La cartera REAL, no la que mandó el cliente ────────────────────
  const carteira = await carregarCarteira(ctx, { diasDeAtividade: 30 })
  const reais = new Map<string, ItemCarteiraIngest>()
  for (const o of carteira.oportunidades) {
    reais.set(`opportunity:${o.id}`, {
      kind: 'opportunity',
      id: o.id,
      nome: o.name ?? o.client ?? `Oportunidade ${o.id}`,
      cliente: o.client ?? o.name ?? `Oportunidade ${o.id}`,
    })
  }
  for (const l of carteira.leads) {
    reais.set(`lead:${l.id}`, { kind: 'lead', id: l.id, nome: l.company_name, cliente: l.company_name })
  }
  // Si el servidor no pudo leer nada (tabla caída), se usa lo que mandó el
  // cliente: es peor no registrar la visita que registrarla sin verificar.
  if (reais.size === 0) {
    for (const item of meta.carteira ?? []) reais.set(`${item.kind}:${item.id}`, item)
  }

  const listaParaPrompt = [...reais.values()]
    .map((i) => `[${i.kind} ${i.id}] ${i.cliente}${i.nome !== i.cliente ? ` — ${i.nome}` : ''}`)
    .join('\n')
  const blocoCarteira =
    listaParaPrompt === ''
      ? 'CARTEIRA DISPONÍVEL PARA MATCH: vazia. Devolva candidatos vazio.'
      : `CARTEIRA DISPONÍVEL PARA MATCH (a única lista válida):\n${listaParaPrompt}`

  const prior = meta.alvoSugerido ? reais.get(`${meta.alvoSugerido.kind}:${meta.alvoSugerido.id}`) : undefined
  const blocoPrior = prior
    ? `O vendedor abriu o registro a partir da ficha de ${prior.cliente} [${prior.kind} ${prior.id}]. Isso é um indício forte, mas NÃO é certeza: se o relato fala claramente de outro cliente da carteira, use o outro.`
    : ''

  // ── 3. Extracción ────────────────────────────────────────────────────
  const kindLabel =
    meta.fonte === 'audio'
      ? 'transcrição de áudio'
      : meta.fonte === 'email'
        ? 'troca de e-mails colada'
        : meta.fonte === 'whatsapp'
          ? 'conversa de WhatsApp colada'
          : 'nota digitada'

  const modelo = MODELOS.redator
  const resposta = await anthropic().messages.create({
    model: modelo.id,
    max_tokens: 4000,
    output_config: {
      format: { type: 'json_schema', schema: SCHEMA_EXTRACAO },
      effort: 'low',
    },
    system: systemComCache(contextoDaExtracao(meta, blocoCarteira, kindLabel), blocoPrior),
    messages: [{ role: 'user', content: `Relato do vendedor (${kindLabel}):\n"""${texto}"""` }],
  })

  if (resposta.stop_reason === 'refusal') {
    throw new HttpError(422, 'extracao_falhou', 'Não consegui interpretar esse relato. Tente de outro jeito.')
  }

  let bruta: ExtracaoBruta
  try {
    bruta = JSON.parse(textoDaResposta(resposta)) as ExtracaoBruta
  } catch {
    throw new HttpError(
      502,
      'extracao_falhou',
      'Entendi o áudio mas não consegui organizar os dados. O registro segue salvo no telefone.',
    )
  }

  // ── 4. Saneamiento: nada sale de acá sin pasar por el servidor ────────
  const candidatos: CandidatoIngest[] = (bruta.candidatos ?? [])
    .map((c) => {
      const real = reais.get(`${c.kind}:${c.id}`)
      if (!real) return null
      return {
        kind: real.kind,
        id: real.id,
        nome: real.nome,
        cliente: real.cliente,
        confianca: Math.max(0, Math.min(1, c.confianca ?? 0)),
        motivo: c.motivo ?? '',
      }
    })
    .filter((c): c is CandidatoIngest => c !== null)
    .sort((a, b) => b.confianca - a.confianca)
    .slice(0, 5)

  if (candidatos.length === 0) {
    aviso = aviso ?? 'Não reconheci o cliente no relato.'
  }

  // Los niveles actuales salen del CRM, no del modelo.
  const escolhido = candidatos[0]
  const oppEscolhida =
    escolhido && escolhido.kind === 'opportunity'
      ? carteira.oportunidades.find((o) => o.id === escolhido.id)
      : undefined
  const atuais = oppEscolhida ? getScaleScores(oppEscolhida.scales) : null

  let citacaoInventada = false
  const escalas: DeltaEscalaIngest[] = (bruta.escalas ?? [])
    .filter((e) => SCALE_KEYS.includes(e.escala) && typeof e.citacao === 'string' && e.citacao.trim() !== '')
    .map((e) => {
      const verificada = citacaoVerificada(e.citacao, texto)
      if (!verificada) citacaoInventada = true
      return {
        escala: e.escala,
        de: atuais ? (atuais[e.escala] ?? null) : null,
        para: Math.max(0, Math.min(10, Math.round(e.para))),
        citacao: e.citacao.trim(),
        fonte: e.fonte ?? null,
        // Cita no encontrada en el relato = paráfrasis. Se queda por debajo
        // del umbral de preselección (0,6) para que la pantalla la muestre
        // apagada y el vendedor decida a mano.
        confianca: verificada ? Math.max(0, Math.min(1, e.confianca ?? 0.5)) : 0.4,
      }
    })

  if (citacaoInventada && aviso === null) {
    aviso = 'Algumas citações não batem com o áudio: confira antes de aceitar as escalas.'
  }

  let proximaAcao: ProximaAcaoIngest | null = null
  if (bruta.proxima_acao && bruta.proxima_acao.texto) {
    const data = bruta.proxima_acao.data
    const valida = data !== null && isIsoDate(data) && data >= hoje ? data : null
    proximaAcao = {
      texto: bruta.proxima_acao.texto,
      data: valida,
      atalho: valida ? atalhoDaData(valida, hoje) : null,
    }
  }

  const extracao: ExtracaoIngest = {
    candidatos,
    tipo: bruta.tipo && ACTIVITY_TYPES.includes(bruta.tipo) ? bruta.tipo : null,
    resumo: (bruta.resumo ?? '').trim(),
    resultado: bruta.resultado && ACTIVITY_RESULTS.includes(bruta.resultado) ? bruta.resultado : null,
    resultadoTexto: bruta.resultado_texto ?? null,
    proximaAcao,
    escalas,
    contatos: (bruta.contatos ?? []).slice(0, 6),
    etapaSugerida: ehStageId(bruta.etapa_sugerida) ? bruta.etapa_sugerida : null,
    metodologia: bruta.metodologia ?? null,
    sinais: (bruta.sinais ?? []).slice(0, 6),
  }

  const duracaoMs = Date.now() - comecou

  await registrarUso({
    vendor: ctx.vendorName,
    bucket: 'ingest',
    modelo: modelo.id,
    entrada: resposta.usage.input_tokens ?? 0,
    saida: resposta.usage.output_tokens ?? 0,
    cacheEscrito: resposta.usage.cache_creation_input_tokens ?? 0,
    cacheLido: resposta.usage.cache_read_input_tokens ?? 0,
    custoUsd: custoUsd(modelo, resposta.usage),
    duracaoMs,
    extra: { fonte: meta.fonte, client_uuid: meta.clientUuid, candidatos: candidatos.length },
  })

  const corpo: IngestResponse = {
    versao: CONTRATO_VERSAO,
    clientUuid: meta.clientUuid,
    transcricao,
    extracao,
    duracaoMs,
    aviso,
  }
  res.status(200).json(corpo)
}

export default rota('/api/ingest', handler)
