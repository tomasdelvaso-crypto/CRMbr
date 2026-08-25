// api/ventus.ts — el chat del Ventus. Streaming SSE obligatorio.
//
// Contrato: src/screens/Ventus/contrato.ts. Los eventos y sus nombres son de
// allá; se replican acá porque ese archivo lee `import.meta.env` y no puede
// cargarse desde el runtime de Node.
//
// ══════════════════════════════════════════════════════════════════════════
// EL ORDEN DE LAS TRES PUERTAS
// ══════════════════════════════════════════════════════════════════════════
// 1. MOTOR DETERMINÍSTICO. Si la pregunta es de sólo lectura («o que faço
//    hoje», «em que pé tá a Tetra», «quem tá parado há 15 dias»), se responde
//    con datos y CERO tokens. Es el 60% del tráfico del bot actual y es lo que
//    un LLM responde peor y más caro.
// 2. MODELO CON TOOLS. Coaching y diagnóstico con opus (effort alto); extraer
//    y redactar con sonnet. La elección es por MODO y por forma de la
//    pregunta, no por gusto: un diagnóstico con sonnet sale plano y un
//    rascunho de WhatsApp con opus es tirar plata.
// 3. PROPOSE, NUNCA COMMIT. Cada tool de escritura crea una fila en
//    `ventus_actions` con status 'proposed' y emite un evento `preview`. El
//    vendedor confirma desde la pantalla y ahí recién se ejecuta.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL PRIMER EVENTO SALE ANTES DE PENSAR
// ══════════════════════════════════════════════════════════════════════════
// `abertura` se emite apenas se abre el stream, antes de cualquier llamada al
// modelo. Sin eso el vendedor mira una pantalla quieta durante los 2-3
// segundos que tarda el primer token, y en 4G brasileña eso se lee como «a app
// travou». El v2 no tiene streaming y produce 504 silenciosos: este endpoint
// existe en buena medida para matar eso.

import type Anthropic from '@anthropic-ai/sdk'
import type { Confianca, IsoDate } from '../src/core'
import { getScaleScores, isIsoDate, todayBr } from '../src/core'
import { MODELOS, anthropic, custoUsd, systemComCache } from './_lib/anthropic'
import { requireAuth } from './_lib/auth'
import type { AuthContext } from './_lib/auth'
import { blocoDeCasos } from './_lib/casos'
import type { AlvoDaCarteira, CarteiraDoVendedor } from './_lib/carteira'
import {
  alvosDaCarteira,
  carregarCarteira,
  carteiraTexto,
  diasSemContato,
  fichaDaOportunidade,
  resolverAlvo,
} from './_lib/carteira'
import type { ApiHandler } from './_lib/http'
import { exigirMetodo, lerJson, rota } from './_lib/http'
import { responderSemTokens } from './_lib/motor'
import type { MudancaProposta, PropostaCriada } from './_lib/propose'
import { proporAcao } from './_lib/propose'
import { abrirSse } from './_lib/sse'
import { ErroDeTool, VENTUS_TOOLS, ehVentusTool, erroDataInvalida, toolDefs } from './_lib/tools'
import type { VentusTool } from './_lib/tools'
import { checarCota, registrarUso } from './_lib/usage'

/* ══════════════════════════════════════════════════════════════════════════
   Contrato (espejo de src/screens/Ventus/contrato.ts)
   ══════════════════════════════════════════════════════════════════════════ */

interface VentusTurno {
  id: string
  papel: 'vendedor' | 'ventus'
  texto: string
  em: string
}

interface VentusRequest {
  vendor: string
  mensagem: string
  opportunityId?: number | null
  historico: VentusTurno[]
  fatos?: Record<string, unknown>
  modo?: 'chat' | 'coaching'
  hoje: IsoDate
  turnoId: string
}

interface VentusPreview {
  actionId: string | null
  tool: VentusTool
  resumo: string
  mudancas: readonly MudancaProposta[]
  confianca: Confianca
  citacao?: string | null
  expiraEm?: string | null
  precisaConfirmar: boolean
}

type VentusEvento =
  | { tipo: 'abertura'; turnoId: string; modelo?: string }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'preview'; preview: VentusPreview }
  | { tipo: 'ping' }
  | { tipo: 'fim'; texto: string; tokens?: number }
  | { tipo: 'erro'; codigo: string; mensagem: string }

/* ══════════════════════════════════════════════════════════════════════════
   Elección de modelo
   ══════════════════════════════════════════════════════════════════════════ */

const RE_COACHING = /\b(diagn[óo]stico|por que|porque|an[áa]lis|estrat[ée]gia|trav|gargalo|como (fa[çc]o|avan[çc]o)|o que falta|risco)\b/i
const RE_REDACAO = /\b(escrev|redig|rascunho|mensagem|e-?mail|whats|texto (pra|para))\b/i

interface Escolha {
  modelo: (typeof MODELOS)['coach' | 'redator']
  effort: 'low' | 'medium' | 'high'
  maxTokens: number
}

/**
 * Coaching y diagnóstico piden razonamiento sobre el negocio: opus con effort
 * alto. Redactar una mensaje o resolver un pedido concreto es sonnet: el
 * resultado es indistinguible y cuesta la quinta parte.
 */
export function escolherModelo(mensagem: string, modo: 'chat' | 'coaching'): Escolha {
  if (modo === 'coaching') {
    return { modelo: MODELOS.coach, effort: 'high', maxTokens: 8000 }
  }
  if (RE_REDACAO.test(mensagem)) {
    return { modelo: MODELOS.redator, effort: 'low', maxTokens: 4000 }
  }
  if (RE_COACHING.test(mensagem)) {
    return { modelo: MODELOS.coach, effort: 'high', maxTokens: 8000 }
  }
  return { modelo: MODELOS.redator, effort: 'medium', maxTokens: 4000 }
}

/* ══════════════════════════════════════════════════════════════════════════
   Ejecución de tools
   ══════════════════════════════════════════════════════════════════════════ */

interface ResultadoDeTool {
  /** Lo que se le devuelve al modelo. */
  paraModelo: string
  ehErro: boolean
  /** El preview a emitir por SSE, si la tool escribe. */
  preview: VentusPreview | null
}

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
}

function exigirData(valor: unknown, hoje: IsoDate): IsoDate {
  const s = comoTexto(valor)
  if (!isIsoDate(s) || s < hoje) throw erroDataInvalida(valor, hoje)
  return s
}

function previewDe(proposta: PropostaCriada): VentusPreview {
  return {
    actionId: proposta.actionId,
    tool: proposta.tool,
    resumo: proposta.resumo,
    mudancas: proposta.mudancas,
    confianca: proposta.confianca,
    citacao: proposta.citacao,
    expiraEm: proposta.expiraEm,
    precisaConfirmar: proposta.precisaConfirmar,
  }
}

function respostaDaProposta(proposta: PropostaCriada): string {
  if (proposta.confianca === 'baixa') {
    return 'NÃO PROPOSTO: sua confiança é baixa. Não escreva no CRM adivinhando — pergunte ao vendedor o que falta e só então proponha.'
  }
  if (!proposta.precisaConfirmar && proposta.resultado) {
    return `EXECUTADO (confiança alta, citação textual): ${JSON.stringify(proposta.resultado)}. Avise ao vendedor em uma frase o que você registrou.`
  }
  return `PROPOSTO e aguardando confirmação do vendedor (id ${proposta.actionId ?? 'efêmero'}). NÃO chame esta ferramenta de novo para a mesma coisa. Diga em uma frase o que vai acontecer quando ele confirmar.`
}

async function executarTool(
  tool: VentusTool,
  args: Record<string, unknown>,
  ctx: AuthContext,
  carteira: CarteiraDoVendedor,
  alvos: readonly AlvoDaCarteira[],
  hoje: IsoDate,
  turnoId: string,
): Promise<ResultadoDeTool> {
  const alvoDe = (campo: string, tipo?: 'opportunity' | 'lead'): AlvoDaCarteira =>
    resolverAlvo(comoTexto(args[campo]), alvos, tipo)

  switch (tool) {
    /* ── Sólo lectura: se ejecutan directo ── */
    case 'ventus_buscar_carteira': {
      const termo = args['termo'] ? String(args['termo']) : null
      const etapa = typeof args['etapa'] === 'number' ? args['etapa'] : null
      const silencio = typeof args['sem_contato_ha_dias'] === 'number' ? args['sem_contato_ha_dias'] : null
      const soLeads = args['so_leads'] === true

      const opps = soLeads
        ? []
        : carteira.oportunidades
            .filter((o) => (etapa === null ? true : o.stage === etapa))
            .filter((o) => (silencio === null ? true : diasSemContato(o, carteira) >= silencio))
            .filter((o) =>
              termo === null
                ? true
                : `${o.client ?? ''} ${o.name ?? ''}`.toLowerCase().includes(termo.toLowerCase()),
            )
            .slice(0, 25)
            .map((o) => ({
              tipo: 'oportunidade',
              cliente: o.client ?? o.name,
              negocio: o.name,
              etapa: o.stage,
              valor: o.value,
              dias_sem_contato: diasSemContato(o, carteira),
              proxima_acao: o.next_action,
              proxima_data: o.next_action_date,
            }))

      const leads = carteira.leads
        .filter((l) => (termo === null ? true : l.company_name.toLowerCase().includes(termo.toLowerCase())))
        .slice(0, 25)
        .map((l) => ({
          tipo: 'lead',
          empresa: l.company_name,
          etapa: l.stage,
          toques: `${l.touchpoints_count}/7`,
          proximo_toque: l.next_touchpoint_date,
        }))

      const achados = [...opps, ...leads]
      if (achados.length === 0) {
        return {
          paraModelo:
            'Nada encontrado com esse filtro. Diga isso ao vendedor com essas palavras — não invente um cliente parecido.',
          ehErro: false,
          preview: null,
        }
      }
      return { paraModelo: JSON.stringify(achados), ehErro: false, preview: null }
    }

    case 'ventus_ler_oportunidade': {
      const alvo = alvoDe('cliente', 'opportunity')
      const opp = carteira.oportunidades.find((o) => o.id === alvo.id)
      if (!opp) {
        return { paraModelo: `A ficha de ${alvo.nome} não está disponível agora.`, ehErro: true, preview: null }
      }
      const ficha = fichaDaOportunidade(opp, carteira, args['incluir_atividades'] === true ? 10 : 0)
      const casos = blocoDeCasos(opp)
      return { paraModelo: casos ? `${ficha}\n\n${casos}` : ficha, ehErro: false, preview: null }
    }

    /* ── Redacción: devuelve el borrador, no escribe nada ── */
    case 'ventus_redigir_mensagem': {
      const alvo = alvoDe('cliente')
      const corpo = comoTexto(args['corpo'])
      const assunto = args['assunto'] ? comoTexto(args['assunto']) : null
      return {
        paraModelo:
          'Rascunho recebido. Mostre-o ao vendedor no seu texto de resposta, inteiro e pronto para copiar, e diga que ele pode editar antes de mandar.',
        ehErro: false,
        preview: {
          actionId: null,
          tool,
          resumo: `Rascunho de ${comoTexto(args['canal'])} para ${alvo.cliente}`,
          mudancas: [
            ...(assunto ? [{ campo: 'assunto', rotulo: 'Assunto', de: null, para: assunto }] : []),
            { campo: 'corpo', rotulo: 'Mensagem', de: null, para: corpo },
          ],
          confianca: 'media',
          citacao: null,
          expiraEm: null,
          // Nada que confirmar: el vendedor copia, edita y manda desde su app.
          precisaConfirmar: false,
        },
      }
    }

    /* ── Escritura: propone ── */
    case 'ventus_registrar_atividade': {
      const alvo = alvoDe('cliente', 'opportunity')
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'opportunity', id: alvo.id },
        payload: {
          activity_type: comoTexto(args['tipo']),
          description: comoTexto(args['resumo']),
          result: args['resultado'] ?? null,
          methodology_code: args['metodologia'] ?? null,
        },
        confianca: 'media',
        resumo: `Registrar ${comoTexto(args['tipo'])} na ficha da ${alvo.cliente}`,
        mudancas: [{ campo: 'timeline', rotulo: 'Timeline', de: null, para: comoTexto(args['resumo']) }],
        citacao: args['resultado_texto'] ? comoTexto(args['resultado_texto']) : null,
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_definir_proxima_acao':
    case 'ventus_adiar_acao': {
      const alvo = alvoDe('cliente')
      const campoData = tool === 'ventus_adiar_acao' ? 'nova_data' : 'data'
      const data = exigirData(args[campoData], hoje)
      const titulo =
        tool === 'ventus_adiar_acao'
          ? `Adiar: ${comoTexto(args['motivo']) || 'próxima ação'}`
          : comoTexto(args['acao'])
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: alvo.kind, id: alvo.id },
        payload: {
          titulo,
          due_date: data,
          canal: args['canal'] ?? null,
          ...(alvo.kind === 'opportunity' ? { opportunity_id: alvo.id } : { lead_id: alvo.id }),
        },
        confianca: 'media',
        resumo: `${titulo} — ${alvo.cliente}, ${data}`,
        mudancas: [
          { campo: 'next_action', rotulo: 'Próxima ação', de: null, para: titulo },
          { campo: 'next_action_date', rotulo: 'Data', de: null, para: data },
        ],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_agendar_lembrete': {
      const data = exigirData(args['data'], hoje)
      const alvo = args['cliente'] ? alvoDe('cliente') : null
      const titulo = comoTexto(args['titulo'])
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: alvo ? { kind: alvo.kind, id: alvo.id } : null,
        payload: {
          titulo,
          due_date: data,
          ...(alvo?.kind === 'opportunity' ? { opportunity_id: alvo.id } : {}),
          ...(alvo?.kind === 'lead' ? { lead_id: alvo.id } : {}),
        },
        confianca: 'alta',
        citacao: titulo,
        resumo: `Lembrete: ${titulo} — ${data}`,
        mudancas: [{ campo: 'tarefa', rotulo: 'Lembrete', de: null, para: `${titulo} (${data})` }],
        idempotencyKey: `${turnoId}:${tool}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_atualizar_escala': {
      const alvo = alvoDe('cliente', 'opportunity')
      const opp = carteira.oportunidades.find((o) => o.id === alvo.id)
      const escala = comoTexto(args['escala'])
      const nivel = Number(args['nivel'])
      const citacao = comoTexto(args['citacao'])
      // El nivel anterior sale del CRM, nunca de lo que diga el modelo: es lo
      // que después compara `scale_evidence` para saber si esto fue un avance.
      const anterior = opp ? (getScaleScores(opp.scales)[escala as keyof ReturnType<typeof getScaleScores>] ?? null) : null
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'opportunity', id: alvo.id },
        payload: {
          scale_key: escala,
          score_novo: nivel,
          score_anterior: anterior,
          quote: citacao,
          autor_quote: args['fonte'] ?? null,
          fonte: 'ventus',
        },
        confianca: (args['confianca'] as Confianca) ?? 'media',
        citacao,
        resumo: `${escala.toUpperCase()} → ${nivel} na ${alvo.cliente}`,
        mudancas: [{ campo: `scales.${escala}`, rotulo: escala.toUpperCase(), de: null, para: String(nivel) }],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}:${escala}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_avancar_etapa': {
      const alvo = alvoDe('cliente', 'opportunity')
      const etapa = Number(args['nova_etapa'])
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'opportunity', id: alvo.id },
        payload: { nova_etapa: etapa, override_motivo: args['override_motivo'] ?? null },
        confianca: 'media',
        resumo: `Avançar ${alvo.cliente} para a etapa ${etapa}`,
        mudancas: [{ campo: 'stage', rotulo: 'Etapa', de: null, para: String(etapa) }],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_criar_touchpoint': {
      const alvo = alvoDe('lead', 'lead')
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'lead', id: alvo.id },
        payload: {
          canal: comoTexto(args['canal']),
          resultado: comoTexto(args['resultado']),
          notas: args['notas'] ?? null,
        },
        confianca: 'media',
        resumo: `Registrar toque ${comoTexto(args['canal'])} em ${alvo.cliente}`,
        mudancas: [
          { campo: 'touchpoint', rotulo: 'Toque', de: null, para: `${comoTexto(args['canal'])} · ${comoTexto(args['resultado'])}` },
        ],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_converter_lead': {
      const alvo = alvoDe('lead', 'lead')
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'lead', id: alvo.id },
        payload: {
          name: args['nome_do_negocio'] ?? alvo.cliente,
          value: args['valor'] ?? null,
          product_line: args['linha_de_produto'] ?? null,
        },
        confianca: 'media',
        resumo: `Converter ${alvo.cliente} em oportunidade`,
        mudancas: [{ campo: 'lead', rotulo: 'Lead', de: alvo.cliente, para: 'Oportunidade na etapa 2' }],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_arquivar_lead': {
      const alvo = alvoDe('lead', 'lead')
      const dias = typeof args['reciclar_em_dias'] === 'number' ? args['reciclar_em_dias'] : null
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'lead', id: alvo.id },
        payload: {
          motivo: comoTexto(args['motivo']),
          recycle_after: dias ? new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10) : null,
        },
        confianca: 'media',
        resumo: `Arquivar ${alvo.cliente} (${comoTexto(args['motivo'])})`,
        mudancas: [{ campo: 'status', rotulo: 'Situação', de: 'ativo', para: 'arquivado' }],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_marcar_commitment': {
      const alvo = alvoDe('cliente')
      const compromisso = carteira.compromissos.find(
        (c) => c.opportunity_id === alvo.id || c.lead_id === alvo.id,
      )
      if (!compromisso) {
        return {
          paraModelo: `Não há compromisso pendente registrado para ${alvo.cliente}. Diga isso ao vendedor em vez de criar um.`,
          ehErro: true,
          preview: null,
        }
      }
      const proposta = await proporAcao({
        ctx,
        tool,
        // `entity_kind` no tiene 'commitment' (CHECK de 0003) y el hash de
        // precondición solo sabe hashear opportunity/lead/task/market_sweep.
        // Poner acá el id del compromiso con kind 'opportunity' haría que el
        // staleness check comparase OTRA fila: mejor sin entidad y con el id
        // en el payload, que es honesto sobre lo que se puede verificar.
        entidade: null,
        payload: {
          commitment_id: compromisso.id,
          status: comoTexto(args['situacao']),
          notas: args['notas'] ?? null,
        },
        confianca: 'media',
        resumo: `Marcar compromisso de ${alvo.cliente} como ${comoTexto(args['situacao'])}`,
        mudancas: [{ campo: 'status', rotulo: 'Compromisso', de: 'pendente', para: comoTexto(args['situacao']) }],
        idempotencyKey: `${turnoId}:${tool}:${compromisso.id}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }

    case 'ventus_registrar_sinal_comprador': {
      const alvo = alvoDe('cliente', 'opportunity')
      const sinal = comoTexto(args['sinal'])
      const citacao = comoTexto(args['citacao'])
      const proposta = await proporAcao({
        ctx,
        tool,
        entidade: { kind: 'opportunity', id: alvo.id },
        payload: { description: `Sinal do comprador (${sinal}): ${citacao}`, result: 'positivo', sinal },
        confianca: 'media',
        citacao,
        resumo: `Registrar sinal "${sinal}" em ${alvo.cliente}`,
        mudancas: [{ campo: 'sinal', rotulo: 'Sinal do comprador', de: null, para: sinal }],
        idempotencyKey: `${turnoId}:${tool}:${alvo.id}:${sinal}`,
      })
      return { paraModelo: respostaDaProposta(proposta), ehErro: false, preview: previewDe(proposta) }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Handler
   ══════════════════════════════════════════════════════════════════════════ */

/** Tope de vueltas del loop de tools. Un turno que pide más está en loop. */
const MAX_VOLTAS = 5

const handler: ApiHandler = async (req, res) => {
  const comecou = Date.now()
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)
  const pedido = await lerJson<VentusRequest>(req)
  const hoje = isIsoDate(pedido.hoje) ? pedido.hoje : todayBr()
  const modo = pedido.modo ?? 'chat'
  const turnoId = pedido.turnoId || `${Date.now()}`

  const canal = abrirSse(res)
  const emitir = (evento: VentusEvento): void => {
    canal.enviar(evento)
  }

  try {
    await checarCota(ctx, 'ventus')
  } catch (erro) {
    emitir({
      tipo: 'erro',
      codigo: 'limite_de_uso',
      mensagem: erro instanceof Error ? erro.message : 'Muitas perguntas em pouco tempo.',
    })
    canal.fechar()
    return
  }

  const carteira = await carregarCarteira(ctx)

  // ── Puerta 1: el motor determinístico ────────────────────────────────
  const doMotor = responderSemTokens(pedido.mensagem, carteira, pedido.opportunityId)
  if (doMotor) {
    emitir({ tipo: 'abertura', turnoId, modelo: 'motor' })
    // Se trocea para que se vea como un stream de verdad: la pantalla no tiene
    // que tener dos caminos de render según de dónde salió la respuesta.
    for (const pedaco of doMotor.texto.split(/(?<=\n)/)) {
      emitir({ tipo: 'texto', delta: pedaco })
    }
    emitir({ tipo: 'fim', texto: doMotor.texto, tokens: 0 })
    canal.fechar()
    await registrarUso({
      vendor: ctx.vendorName,
      bucket: 'ventus',
      modelo: 'motor-deterministico',
      entrada: 0,
      saida: 0,
      cacheEscrito: 0,
      cacheLido: 0,
      custoUsd: 0,
      duracaoMs: Date.now() - comecou,
      extra: { intencao: doMotor.intencao, turno: turnoId },
    })
    return
  }

  // ── Puerta 2: el modelo ──────────────────────────────────────────────
  const escolha = escolherModelo(pedido.mensagem, modo)
  emitir({ tipo: 'abertura', turnoId, modelo: escolha.modelo.id })

  const alvos = alvosDaCarteira(carteira)
  const oppAberta = pedido.opportunityId
    ? (carteira.oportunidades.find((o) => o.id === pedido.opportunityId) ?? null)
    : null

  const contexto = [
    `Hoje é ${hoje} (fuso de São Paulo). Quem fala é ${ctx.vendorName}.`,
    carteiraTexto(carteira),
    oppAberta ? fichaDaOportunidade(oppAberta, carteira, 10) : null,
    oppAberta ? blocoDeCasos(oppAberta) : null,
    pedido.fatos && Object.keys(pedido.fatos).length > 0
      ? `FATOS JÁ CALCULADOS PELO MOTOR (use, não recalcule): ${JSON.stringify(pedido.fatos)}`
      : null,
    modo === 'coaching'
      ? 'MODO COACHING: diagnostique o gargalo real e proponha UMA jogada concreta com o texto pronto. Nada de lista de recomendações.'
      : null,
  ]

  const mensagens: Anthropic.MessageParam[] = pedido.historico
    .slice(-12)
    .map((t) => ({ role: t.papel === 'vendedor' ? ('user' as const) : ('assistant' as const), content: t.texto }))
  mensagens.push({ role: 'user', content: pedido.mensagem })

  let textoCompleto = ''
  let entrada = 0
  let saida = 0
  let cacheEscrito = 0
  let cacheLido = 0

  try {
    for (let volta = 0; volta < MAX_VOLTAS; volta += 1) {
      const stream = anthropic().messages.stream({
        model: escolha.modelo.id,
        max_tokens: escolha.maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: escolha.effort },
        system: systemComCache(...contexto),
        tools: toolDefs(),
        messages: mensagens,
      })

      for await (const evento of stream) {
        if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
          textoCompleto += evento.delta.text
          emitir({ tipo: 'texto', delta: evento.delta.text })
        }
      }

      const final = await stream.finalMessage()
      entrada += final.usage.input_tokens ?? 0
      saida += final.usage.output_tokens ?? 0
      cacheEscrito += final.usage.cache_creation_input_tokens ?? 0
      cacheLido += final.usage.cache_read_input_tokens ?? 0

      if (final.stop_reason === 'refusal') {
        emitir({ tipo: 'erro', codigo: 'interno', mensagem: 'Não posso responder isso.' })
        break
      }
      if (final.stop_reason !== 'tool_use') break

      const chamadas = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (chamadas.length === 0) break

      mensagens.push({ role: 'assistant', content: final.content })

      // Todos los tool_result van en UN solo mensaje de usuario: repartirlos
      // en varios le enseña al modelo a dejar de llamar en paralelo.
      const resultados: Anthropic.ToolResultBlockParam[] = []
      for (const chamada of chamadas) {
        if (!ehVentusTool(chamada.name)) {
          resultados.push({
            type: 'tool_result',
            tool_use_id: chamada.id,
            is_error: true,
            content: `ERRO: a ferramenta "${chamada.name}" não existe. Use uma das ${VENTUS_TOOLS.length} do catálogo.`,
          })
          continue
        }
        try {
          const saidaDaTool = await executarTool(
            chamada.name,
            (chamada.input ?? {}) as Record<string, unknown>,
            ctx,
            carteira,
            alvos,
            hoje,
            turnoId,
          )
          if (saidaDaTool.preview) emitir({ tipo: 'preview', preview: saidaDaTool.preview })
          resultados.push({
            type: 'tool_result',
            tool_use_id: chamada.id,
            is_error: saidaDaTool.ehErro,
            content: saidaDaTool.paraModelo,
          })
        } catch (erro) {
          // Un error de tool NO tumba el turno: vuelve al modelo con la guía.
          const texto =
            erro instanceof ErroDeTool
              ? erro.paraModelo()
              : `ERRO: ${erro instanceof Error ? erro.message : 'falha inesperada'}\nCOMO CORRIGIR: diga ao vendedor que isso não deu para fazer agora e siga com o resto.`
          if (!(erro instanceof ErroDeTool)) console.error(`[ventus] tool ${chamada.name}:`, erro)
          resultados.push({ type: 'tool_result', tool_use_id: chamada.id, is_error: true, content: texto })
        }
      }
      mensagens.push({ role: 'user', content: resultados })
    }

    emitir({ tipo: 'fim', texto: textoCompleto, tokens: saida })
  } catch (erro) {
    console.error('[ventus] stream falhou:', erro)
    emitir({
      tipo: 'erro',
      codigo: 'interno',
      mensagem: 'Algo quebrou do lado do Ventus. Não foi você.',
    })
  } finally {
    canal.fechar()
  }

  await registrarUso({
    vendor: ctx.vendorName,
    bucket: 'ventus',
    modelo: escolha.modelo.id,
    entrada,
    saida,
    cacheEscrito,
    cacheLido,
    custoUsd: custoUsd(escolha.modelo, {
      input_tokens: entrada,
      output_tokens: saida,
      cache_creation_input_tokens: cacheEscrito,
      cache_read_input_tokens: cacheLido,
    }),
    duracaoMs: Date.now() - comecou,
    extra: { turno: turnoId, modo, opportunity_id: pedido.opportunityId ?? null },
  })
}

export default rota('/api/ventus', handler)
