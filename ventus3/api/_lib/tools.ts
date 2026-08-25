// api/_lib/tools.ts
// Las 14 tools tipadas del Ventus (M9), con `strict: true`,
// `additionalProperties: false`, enums cerrados e IDENTIFICADORES NATURALES.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES DECISIONES QUE NO SON DECORATIVAS
// ══════════════════════════════════════════════════════════════════════════
//
// 1. IDENTIFICADORES NATURALES, NO UUIDs. El modelo escribe `cliente: "Tetra
//    Pak"`, no `opportunity_id: 47`. Un id que el modelo no puede verificar es
//    un id que el modelo va a inventar, y un id inventado que casualmente
//    existe escribe en la ficha equivocada en silencio. El nombre se resuelve
//    contra la cartera REAL del vendedor (`resolverAlvo`), y si es ambiguo el
//    error le devuelve los candidatos para que pregunte.
//
// 2. LOS ERRORES GUÍAN. Un `tool_result` con `is_error: true` que dice
//    «invalid input» quema un turno entero. Cada error de acá dice qué está
//    mal, qué se esperaba y cuál es el siguiente movimiento —incluyendo la
//    lista de valores válidos cuando la lista es corta.
//
// 3. LOS ENUMS SALEN DEL DOMINIO, NO DE UN LITERAL COPIADO. `ActivityType`,
//    `Channel`, `ScaleKey` y compañía se importan de src/core: si mañana se
//    agrega un canal, la tool lo acepta sin que nadie se acuerde de editar
//    este archivo. Los CHECK de Postgres siguen siendo la última palabra.

import type Anthropic from '@anthropic-ai/sdk'
import type { ScaleKey, StageId } from '../../src/core/index.js'
import {
  ACTIVITY_RESULTS,
  ACTIVITY_TYPES,
  SCALE_KEYS,
  SCALE_LABELS,
  SINAIS_DO_COMPRADOR,
} from '../../src/core/index.js'

/* ══════════════════════════════════════════════════════════════════════════
   Catálogo
   ══════════════════════════════════════════════════════════════════════════ */

export const VENTUS_TOOLS = [
  'ventus_registrar_atividade',
  'ventus_definir_proxima_acao',
  'ventus_atualizar_escala',
  'ventus_avancar_etapa',
  'ventus_criar_touchpoint',
  'ventus_converter_lead',
  'ventus_marcar_commitment',
  'ventus_redigir_mensagem',
  'ventus_adiar_acao',
  'ventus_registrar_sinal_comprador',
  'ventus_arquivar_lead',
  'ventus_buscar_carteira',
  'ventus_ler_oportunidade',
  'ventus_agendar_lembrete',
] as const

export type VentusTool = (typeof VENTUS_TOOLS)[number]

/** Tools que NO escriben: se ejecutan directo, sin proponer ni confirmar. */
export const TOOLS_LEITURA: ReadonlySet<VentusTool> = new Set<VentusTool>([
  'ventus_buscar_carteira',
  'ventus_ler_oportunidade',
])

/**
 * Tools que pueden auto-commitear cuando la confianza es ALTA.
 *
 * El criterio: son reversibles y de bajo daño. Mover una escala o avanzar una
 * etapa NUNCA auto-commitea aunque el cliente lo haya dicho textual — son las
 * dos cosas que corrompen el forecast del equipo entero.
 */
export const TOOLS_AUTOCOMMIT: ReadonlySet<VentusTool> = new Set<VentusTool>([
  'ventus_registrar_atividade',
  'ventus_definir_proxima_acao',
  'ventus_criar_touchpoint',
  'ventus_adiar_acao',
  'ventus_agendar_lembrete',
])

export const TOOL_LABELS: Readonly<Record<VentusTool, string>> = {
  ventus_registrar_atividade: 'Registrar atividade',
  ventus_definir_proxima_acao: 'Definir próxima ação',
  ventus_atualizar_escala: 'Atualizar escala',
  ventus_avancar_etapa: 'Avançar etapa',
  ventus_criar_touchpoint: 'Registrar toque',
  ventus_converter_lead: 'Converter lead',
  ventus_marcar_commitment: 'Marcar compromisso',
  ventus_redigir_mensagem: 'Redigir mensagem',
  ventus_adiar_acao: 'Adiar ação',
  ventus_registrar_sinal_comprador: 'Registrar sinal do comprador',
  ventus_arquivar_lead: 'Arquivar lead',
  ventus_buscar_carteira: 'Buscar na carteira',
  ventus_ler_oportunidade: 'Ler oportunidade',
  ventus_agendar_lembrete: 'Agendar lembrete',
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas reutilizables del schema
   ══════════════════════════════════════════════════════════════════════════ */

type Schema = Record<string, unknown>

const CLIENTE: Schema = {
  type: 'string',
  description:
    'Nome do cliente ou da empresa EXATAMENTE como aparece na carteira do vendedor. Nunca invente: se não estiver na lista, use ventus_buscar_carteira primeiro.',
}

const DATA_ISO: Schema = {
  type: 'string',
  description: 'Data em YYYY-MM-DD, no fuso de São Paulo, sempre no futuro (ou hoje).',
}

const CITACAO: Schema = {
  type: 'string',
  description:
    'A frase TEXTUAL do cliente que justifica isto. Sem citação não há prova, e sem prova a proposta não pode ter confiança alta.',
}

const CONFIANCA: Schema = {
  type: 'string',
  enum: ['alta', 'media', 'baixa'],
  description:
    'alta = o cliente disse textualmente e você tem a citação · media = é a sua inferência do relato · baixa = você está adivinhando, e nesse caso PERGUNTE em vez de propor.',
}

function objeto(props: Record<string, Schema>, obrigatorios: readonly string[]): Schema {
  return {
    type: 'object',
    properties: props,
    required: [...obrigatorios],
    additionalProperties: false,
  }
}

/** `strict: true` exige que TODA propiedad esté en `required`; lo opcional se declara nullable. */
function ouNulo(schema: Schema): Schema {
  const tipo = schema['type']
  return { ...schema, type: Array.isArray(tipo) ? tipo : [tipo, 'null'] }
}

/* ══════════════════════════════════════════════════════════════════════════
   Las 14
   ══════════════════════════════════════════════════════════════════════════ */

interface DefinicaoDeTool {
  name: VentusTool
  description: string
  input_schema: Schema
}

const DEFINICOES: readonly DefinicaoDeTool[] = [
  {
    name: 'ventus_registrar_atividade',
    description:
      'Registra no timeline do cliente uma conversa que já aconteceu (ligação, visita, reunião, demo, proposta...). Use quando o vendedor CONTA algo que fez. Não use para planejar o futuro — para isso é ventus_definir_proxima_acao.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        tipo: {
          type: 'string',
          enum: [...ACTIVITY_TYPES],
          description: 'Tipo de contato, o mais próximo do relato.',
        },
        resumo: {
          type: 'string',
          description: '1 a 3 frases em PT-BR limpo, sem muletas de fala. Preserve números, nomes e datas.',
        },
        resultado: {
          type: 'string',
          enum: [...ACTIVITY_RESULTS],
          description:
            'Desfecho canônico. É a única coluna pela qual dá para agrupar: nunca escreva prosa livre aqui.',
        },
        resultado_texto: ouNulo({
          type: 'string',
          description: 'A frase do cliente sobre como ficou, ex.: "Ficou de mandar o volume".',
        }),
        metodologia: ouNulo({
          type: 'string',
          description: 'Código do cookbook (1A a 6C), se der para identificar.',
        }),
      },
      ['cliente', 'tipo', 'resumo', 'resultado', 'resultado_texto', 'metodologia'],
    ),
  },
  {
    name: 'ventus_definir_proxima_acao',
    description:
      'Define O QUE o vendedor vai fazer a seguir com este cliente e QUANDO. A data é obrigatória: uma próxima ação sem data não existe — 51 das 54 oportunidades vivas estão assim hoje e é o buraco número um da carteira.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        acao: {
          type: 'string',
          description: 'Texto imperativo e concreto, começando com verbo: "Cobrar o volume mensal do Marcelo".',
        },
        data: DATA_ISO,
        canal: ouNulo({
          type: 'string',
          enum: ['phone', 'whatsapp', 'email', 'linkedin', 'meeting', 'visit'],
        }),
      },
      ['cliente', 'acao', 'data', 'canal'],
    ),
  },
  {
    name: 'ventus_atualizar_escala',
    description:
      'Move uma das 6 escalas PPVVCC. NUNCA chame isto sem citação textual do cliente: a regra da prova é validada no Postgres e a escrita é rejeitada sem ela. Mover a escala é declarar que o negócio avançou — se for a sua opinião e não a fala do cliente, use confianca "media" e deixe o vendedor decidir.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        escala: {
          type: 'string',
          enum: [...SCALE_KEYS],
          description: Object.entries(SCALE_LABELS)
            .map(([k, v]) => `${k} = ${v}`)
            .join(' · '),
        },
        nivel: {
          type: 'integer',
          minimum: 0,
          maximum: 10,
          description: 'Nível canônico 0-10. Use as definições exatas do prompt, não uma intuição.',
        },
        citacao: CITACAO,
        fonte: ouNulo({
          type: 'string',
          description: 'Quem disse: "Marcelo, comprador". Sem fonte é opinião, não prova.',
        }),
        confianca: CONFIANCA,
      },
      ['cliente', 'escala', 'nivel', 'citacao', 'fonte', 'confianca'],
    ),
  },
  {
    name: 'ventus_avancar_etapa',
    description:
      'Avança a oportunidade de etapa no funil. O gate PPVVCC é revalidado no Postgres contra o estado atual: se as escalas não chegam ao mínimo, a chamada falha e o erro diz qual escala falta. Nunca proponha um override sem um motivo que o vendedor possa defender numa reunião.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        nova_etapa: {
          type: 'integer',
          enum: [1, 2, 3, 4, 5, 6],
          description: '1 Prospecção · 2 Qualificação · 3 Apresentação · 4 Validação/Teste · 5 Negociação · 6 Fechado',
        },
        override_motivo: ouNulo({
          type: 'string',
          description: 'Só quando o gate não fecha e há razão real. Fica no timeline com autor.',
        }),
      },
      ['cliente', 'nova_etapa', 'override_motivo'],
    ),
  },
  {
    name: 'ventus_criar_touchpoint',
    description:
      'Registra um toque da cadência de prospecção sobre um LEAD (não sobre oportunidade). São 7 toques em 21 dias; o número da sequência e a próxima data as calcula o servidor — não os mande.',
    input_schema: objeto(
      {
        lead: {
          type: 'string',
          description: 'Nome da empresa do lead, exatamente como aparece na carteira.',
        },
        canal: { type: 'string', enum: ['linkedin', 'whatsapp', 'email', 'phone'] },
        resultado: {
          type: 'string',
          enum: ['no_response', 'interested', 'not_now', 'not_interested', 'meeting_scheduled', 'other'],
        },
        notas: ouNulo({ type: 'string', description: 'O que aconteceu, curto.' }),
      },
      ['lead', 'canal', 'resultado', 'notas'],
    ),
  },
  {
    name: 'ventus_converter_lead',
    description:
      'Converte um lead da prospecção em oportunidade. Só quando há reunião realizada ou interesse concreto: converter cedo infla o funil e destrói o forecast. Nasce na etapa 2 (a 1 é o funil de prospecção, de onde o lead acabou de sair).',
    input_schema: objeto(
      {
        lead: { type: 'string', description: 'Nome da empresa do lead.' },
        nome_do_negocio: ouNulo({ type: 'string', description: 'Como chamar a oportunidade. Default: o nome da empresa.' }),
        valor: ouNulo({ type: 'number', description: 'Valor estimado em R$. Null se o cliente não deu número.' }),
        linha_de_produto: ouNulo({
          type: 'string',
          enum: ['better_pack', 'better_pack_venom', 'ecomfill_resmas', 'ecombag', 'servico_manutencao'],
        }),
      },
      ['lead', 'nome_do_negocio', 'valor', 'linha_de_produto'],
    ),
  },
  {
    name: 'ventus_marcar_commitment',
    description:
      'Marca como cumprido (ou não) um compromisso que o vendedor assumiu na reunião de segunda. Serve para fechar o ciclo do ritual semanal, não para criar tarefas novas.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        situacao: { type: 'string', enum: ['done', 'partial', 'missed', 'cancelled'] },
        notas: ouNulo({ type: 'string', description: 'Por que ficou assim, em uma frase.' }),
      },
      ['cliente', 'situacao', 'notas'],
    ),
  },
  {
    name: 'ventus_redigir_mensagem',
    description:
      'Escreve o rascunho de um e-mail, WhatsApp ou mensagem de LinkedIn para este cliente. NÃO envia nada: devolve o texto para o vendedor revisar, editar e mandar. Use o gancho da última conversa real e termine com uma pergunta fechada.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        canal: { type: 'string', enum: ['email', 'whatsapp', 'linkedin'] },
        objetivo: {
          type: 'string',
          description: 'O que essa mensagem tem que conseguir: "marcar o teste", "cobrar o volume".',
        },
        tom: { type: 'string', enum: ['direto', 'consultivo', 'reativacao'] },
        assunto: ouNulo({ type: 'string', description: 'Assunto do e-mail. Null nos outros canais.' }),
        corpo: { type: 'string', description: 'A mensagem inteira, pronta para copiar. PT-BR, sem markdown.' },
      },
      ['cliente', 'canal', 'objetivo', 'tom', 'assunto', 'corpo'],
    ),
  },
  {
    name: 'ventus_adiar_acao',
    description:
      'Empurra a próxima ação de um cliente para outra data. Use quando o vendedor diz que não dá para hoje. Adiar é legítimo; adiar sem data nova, não.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        nova_data: DATA_ISO,
        motivo: ouNulo({ type: 'string', description: 'Por que foi adiada. Fica no histórico.' }),
      },
      ['cliente', 'nova_data', 'motivo'],
    ),
  },
  {
    name: 'ventus_registrar_sinal_comprador',
    description:
      'Registra um sinal de compra que o cliente deu. São os únicos sinais que o vendedor não consegue fabricar sozinho, e por isso são os que mais valem no placar.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        sinal: {
          type: 'string',
          enum: SINAIS_DO_COMPRADOR.map((s) => s.codigo),
          description: SINAIS_DO_COMPRADOR.map((s) => `${s.codigo} = ${s.rotulo}`).join(' · '),
        },
        citacao: CITACAO,
      },
      ['cliente', 'sinal', 'citacao'],
    ),
  },
  {
    name: 'ventus_arquivar_lead',
    description:
      'Arquiva um lead da prospecção. Use quando o lead disse não, ou quando a cadência de 7 toques se esgotou sem resposta. Arquivar libera a fila; deixar lixo na fila mata a cadência.',
    input_schema: objeto(
      {
        lead: { type: 'string', description: 'Nome da empresa do lead.' },
        motivo: {
          type: 'string',
          enum: ['nao_interessado', 'cadencia_esgotada', 'sem_fit', 'concorrente', 'outro'],
        },
        reciclar_em_dias: ouNulo({
          type: 'integer',
          minimum: 30,
          maximum: 365,
          description: 'Quando vale a pena voltar. Null se não vale.',
        }),
      },
      ['lead', 'motivo', 'reciclar_em_dias'],
    ),
  },
  {
    name: 'ventus_buscar_carteira',
    description:
      'SÓ LEITURA. Procura clientes, leads e oportunidades na carteira do vendedor por nome, etapa, dias sem contato ou valor. Use isto ANTES de qualquer escrita quando não tiver certeza do nome exato do cliente.',
    input_schema: objeto(
      {
        termo: ouNulo({ type: 'string', description: 'Pedaço do nome do cliente ou da empresa.' }),
        etapa: ouNulo({ type: 'integer', enum: [1, 2, 3, 4, 5, 6] }),
        sem_contato_ha_dias: ouNulo({
          type: 'integer',
          minimum: 1,
          maximum: 365,
          description: 'Filtra por silêncio medido em atividades reais, não em last_update.',
        }),
        so_leads: { type: 'boolean', description: 'true = só o funil de prospecção.' },
      },
      ['termo', 'etapa', 'sem_contato_ha_dias', 'so_leads'],
    ),
  },
  {
    name: 'ventus_ler_oportunidade',
    description:
      'SÓ LEITURA. Devolve a ficha completa de uma oportunidade: escalas com suas descrições, etapa e gate, contatos por papel, riscos, últimas atividades e próxima ação. Chame isto antes de dar qualquer diagnóstico — sem o histórico, o conselho sai genérico ou repete o que já foi feito.',
    input_schema: objeto(
      {
        cliente: CLIENTE,
        incluir_atividades: {
          type: 'boolean',
          description: 'true traz as últimas 10 atividades do timeline.',
        },
      },
      ['cliente', 'incluir_atividades'],
    ),
  },
  {
    name: 'ventus_agendar_lembrete',
    description:
      'Cria um lembrete para o vendedor numa data, sem prometer nada ao cliente. É a tarefa solta ("me lembra de ligar pro Paulo na quinta"), não a próxima ação do negócio.',
    input_schema: objeto(
      {
        titulo: { type: 'string', description: 'O que lembrar, imperativo e curto.' },
        data: DATA_ISO,
        cliente: ouNulo({ ...CLIENTE, description: `${String(CLIENTE['description'])} Null se o lembrete não é sobre ninguém.` }),
      },
      ['titulo', 'data', 'cliente'],
    ),
  },
]

/** Las 14 tools listas para mandar a la API. Orden ESTABLE: entran al caché. */
export function toolDefs(): Anthropic.Tool[] {
  return DEFINICOES.map((d) => ({
    name: d.name,
    description: d.description,
    strict: true,
    input_schema: d.input_schema as Anthropic.Tool['input_schema'],
  }))
}

/** Catálogo en texto para el prefijo cacheado del system prompt. */
export function catalogoDeTools(): string {
  return DEFINICOES.map((d) => {
    const marca = TOOLS_LEITURA.has(d.name) ? ' [leitura]' : TOOLS_AUTOCOMMIT.has(d.name) ? ' [escrita leve]' : ' [escrita sensível]'
    return `- ${d.name}${marca}: ${d.description.split('.')[0] ?? ''}.`
  }).join('\n')
}

export function ehVentusTool(nome: string): nome is VentusTool {
  return (VENTUS_TOOLS as readonly string[]).includes(nome)
}

/* ══════════════════════════════════════════════════════════════════════════
   Errores que GUÍAN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un error de tool que le dice al modelo qué hacer a continuación.
 *
 * Se devuelve como `tool_result` con `is_error: true`. La diferencia entre
 * «invalid input» y esto es un turno perdido contra un turno que se corrige.
 */
export class ErroDeTool extends Error {
  readonly guia: string
  readonly dados: Record<string, unknown>

  constructor(mensagem: string, guia: string, dados: Record<string, unknown> = {}) {
    super(mensagem)
    this.name = 'ErroDeTool'
    this.guia = guia
    this.dados = dados
  }

  /** El texto que ve el modelo. */
  paraModelo(): string {
    const extra = Object.keys(this.dados).length > 0 ? `\nDADOS: ${JSON.stringify(this.dados)}` : ''
    return `ERRO: ${this.message}\nCOMO CORRIGIR: ${this.guia}${extra}`
  }
}

export const erroAlvoNaoEncontrado = (nome: string, sugestoes: readonly string[]) =>
  new ErroDeTool(
    `Não existe "${nome}" na carteira deste vendedor.`,
    sugestoes.length > 0
      ? 'Escolha um dos nomes de "candidatos" abaixo, exatamente como está escrito, ou pergunte ao vendedor qual é.'
      : 'Chame ventus_buscar_carteira com um pedaço do nome para ver o que existe. Não invente o cliente.',
    { candidatos: sugestoes.slice(0, 5) },
  )

export const erroAlvoAmbiguo = (nome: string, candidatos: readonly string[]) =>
  new ErroDeTool(
    `"${nome}" casa com ${candidatos.length} registros diferentes.`,
    'NÃO escolha por conta própria. Pergunte ao vendedor qual dos candidatos é, citando os nomes exatos.',
    { candidatos: candidatos.slice(0, 5) },
  )

export const erroCampoInvalido = (campo: string, recebido: unknown, valores: readonly string[]) =>
  new ErroDeTool(
    `O campo "${campo}" recebeu ${JSON.stringify(recebido)}, que não é um valor válido.`,
    `Use um destes: ${valores.join(', ')}.`,
  )

export const erroSemProva = (escala: ScaleKey) =>
  new ErroDeTool(
    `Mover a escala ${escala.toUpperCase()} sem citação textual é rejeitado pelo banco (regra da prova).`,
    'Inclua em "citacao" a frase do cliente que sustenta o número. Se você não tem a frase, não mova a escala: registre a atividade e diga ao vendedor o que perguntar para conseguir a prova.',
  )

export const erroGateTravado = (etapa: StageId, faltando: readonly { escala: string; minimo: number; atual: number }[]) =>
  new ErroDeTool(
    `A etapa ${etapa} não libera: ${faltando.map((f) => `${f.escala.toUpperCase()} ${f.atual} < ${f.minimo}`).join(', ')}.`,
    'Não force a etapa. Proponha a jogada que move a escala que falta — é isso que destrava o funil — ou peça ao vendedor um override com motivo defensável.',
    { faltando: [...faltando] },
  )

export const erroDataInvalida = (recebido: unknown, hoje: string) =>
  new ErroDeTool(
    `"${String(recebido)}" não é uma data utilizável.`,
    `Use YYYY-MM-DD, no fuso de São Paulo, hoje (${hoje}) ou depois. Datas relativas ("quinta que vem") você mesmo resolve antes de chamar a tool.`,
  )
