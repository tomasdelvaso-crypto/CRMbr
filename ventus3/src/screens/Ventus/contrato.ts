// src/screens/Ventus/contrato.ts
// El contrato tipado de POST /api/ventus. Lo implementa otro agente; esto es
// lo que la pantalla espera recibir, palabra por palabra.
//
// DOS DECISIONES QUE NO SON NEGOCIABLES
//
//  1. STREAMING SIEMPRE. El v2 responde en una sola pieza y produce 504
//     silenciosos que el vendedor lee como «a app travou». Con SSE, el primer
//     token llega en <1 s y el vendedor ve que la cosa está viva aunque la
//     respuesta entera tarde 20. El servidor DEBE emitir `abertura` antes de
//     pensar, y un `ping` cada 15 s si va a tardar — los proxies móviles
//     brasileños cortan conexiones ociosas a los 30-60 s.
//
//  2. PREVIEW ANTES DE EJECUTAR. El servidor NUNCA escribe en el CRM por su
//     cuenta: propone en `ventus_actions` con status='proposed' y manda el
//     evento `preview`. La pantalla muestra qué va a pasar y el vendedor
//     confirma. Es el mismo propose-then-commit de la Revisão (M8), no un
//     camino paralelo.
//
// El transporte es SSE sobre POST (no EventSource: EventSource solo hace GET y
// no manda Authorization). Se lee con fetch + ReadableStream, que es lo que
// soportan Chrome Android e iOS 16.4+.

import type { Confianca, IsoDate } from '@/core'
import { criarBandeiraDeMock } from '@/lib/mock-flag'

/* ══════════════════════════════════════════════════════════════════════════
   Rutas
   ══════════════════════════════════════════════════════════════════════════ */

export const VENTUS_PATH = '/api/ventus'
export const VENTUS_FEEDBACK_PATH = '/api/ventus/feedback'

/* ══════════════════════════════════════════════════════════════════════════
   Pedido
   ══════════════════════════════════════════════════════════════════════════ */

/** Un turno del historial. `id` es estable para poder deduplicar. */
export interface VentusTurno {
  id: string
  papel: 'vendedor' | 'ventus'
  texto: string
  em: string
}

export type VentusModo = 'chat' | 'coaching'

export interface VentusRequest {
  /** Nombre del vendedor tal como está en opportunities.vendor. */
  vendor: string
  /** Lo que el vendedor escribió o dictó. */
  mensagem: string
  /**
   * Oportunidad abierta, si la hay. En modo 'coaching' es obligatoria: el
   * diagnóstico no existe sin una ficha.
   */
  opportunityId?: number | null
  /** Últimos turnos, ya recortados por el cliente. */
  historico: VentusTurno[]
  /**
   * Hechos que el motor determinístico YA resolvió del lado del cliente.
   * El servidor los usa como contexto y NO los vuelve a calcular: es lo que
   * evita quemar tokens en «quantos dias sem contato».
   */
  fatos?: Record<string, unknown>
  modo?: VentusModo
  /** Hoje em BRT, para que el servidor no dependa del reloj del contenedor. */
  hoje: IsoDate
  /** Idempotencia del turno: reenviar el mismo id no duplica propuestas. */
  turnoId: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Tools (M9) — 14 tools tipadas, no SQL genérico
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

/** Rótulos en PT-BR. Se muestran en el preview, así que viven acá. */
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

/** Tools de solo lectura: no piden confirmación porque no escriben nada. */
export const TOOLS_LEITURA: ReadonlySet<VentusTool> = new Set<VentusTool>([
  'ventus_buscar_carteira',
  'ventus_ler_oportunidade',
])

/**
 * Lo que el Ventus quiere hacer, listo para mostrar ANTES de hacerlo.
 * `actionId` apunta a la fila de ventus_actions ya creada con
 * status='proposed': confirmar es llamar a ventus_commit_action, exactamente
 * como en la Revisão.
 */
export interface VentusPreview {
  /** id de public.ventus_actions. null si la tool es de solo lectura. */
  actionId: string | null
  tool: VentusTool
  /** Frase imperativa en PT-BR: «Marcar visita na Tetra Pak para quinta». */
  resumo: string
  /** Una línea por campo que se va a tocar. */
  mudancas: readonly VentusMudanca[]
  confianca: Confianca
  /** Cita textual que la justifica, si sale de algo que el vendedor dijo. */
  citacao?: string | null
  /** ISO-8601. La propuesta caduca a las 48 h, igual que en la bandeja. */
  expiraEm?: string | null
  /** Alguna tool de lectura no necesita confirmación. */
  precisaConfirmar: boolean
}

export interface VentusMudanca {
  campo: string
  rotulo: string
  de: string | null
  para: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Eventos SSE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El stream. Cada línea `data:` es UNO de estos objetos, en JSON de una línea.
 * El orden garantizado es: abertura → (texto|preview|ping)* → fim | erro.
 */
export type VentusEvento =
  /** Primer evento, inmediato. Apaga el esqueleto y arranca el cursor. */
  | { tipo: 'abertura'; turnoId: string; modelo?: string }
  /** Un fragmento de texto. Se CONCATENA, no reemplaza. */
  | { tipo: 'texto'; delta: string }
  /** Lo que el Ventus quiere hacer. Puede haber más de uno por turno. */
  | { tipo: 'preview'; preview: VentusPreview }
  /** Keepalive. La pantalla lo ignora, pero mantiene viva la conexión. */
  | { tipo: 'ping' }
  /** Fin normal. `texto` es la respuesta completa, para verificar. */
  | { tipo: 'fim'; texto: string; tokens?: number }
  /** Fin con error. `codigo` decide el mensaje que ve el vendedor. */
  | { tipo: 'erro'; codigo: VentusErroCodigo; mensagem: string }

export type VentusErroCodigo =
  | 'sem_sessao'
  | 'sem_permissao'
  | 'limite_de_uso'
  | 'nao_implementado'
  | 'timeout'
  | 'interno'

/** Mensajes en PT-BR por código. Nunca se le muestra un stack al vendedor. */
export const ERRO_LABELS: Readonly<Record<VentusErroCodigo, string>> = {
  sem_sessao: 'Sua sessão expirou. Entre de novo.',
  sem_permissao: 'Isso está fora da sua carteira.',
  limite_de_uso: 'Muitas perguntas em pouco tempo. Tente daqui a um minuto.',
  nao_implementado: 'O Ventus ainda não está ligado neste ambiente.',
  timeout: 'O Ventus demorou demais. O que dá para responder sem ele está aí embaixo.',
  interno: 'Algo quebrou do lado do Ventus. Não foi você.',
}

/* ══════════════════════════════════════════════════════════════════════════
   Feedback 👍/👎
   ══════════════════════════════════════════════════════════════════════════ */

export type FeedbackVoto = 'bom' | 'ruim'

/**
 * Las tres razones fijas del 👎. Igual que en la Revisão: sin campo libre,
 * porque lo que se mide es la tasa por causa y un texto libre no se agrega.
 */
export type FeedbackMotivo = 'errado' | 'generico' | 'fora_de_contexto'

export const FEEDBACK_MOTIVOS: ReadonlyArray<{ valor: FeedbackMotivo; rotulo: string }> = [
  { valor: 'errado', rotulo: 'Está errado' },
  { valor: 'generico', rotulo: 'Genérico demais' },
  { valor: 'fora_de_contexto', rotulo: 'Não é sobre este cliente' },
]

export interface VentusFeedback {
  vendor: string
  turnoId: string
  voto: FeedbackVoto
  motivo?: FeedbackMotivo | null
  opportunityId?: number | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Errores del cliente
   ══════════════════════════════════════════════════════════════════════════ */

export class ErroVentus extends Error {
  readonly codigo: VentusErroCodigo
  constructor(codigo: VentusErroCodigo, mensagem?: string) {
    super(mensagem ?? ERRO_LABELS[codigo])
    this.name = 'ErroVentus'
    this.codigo = codigo
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Mock — se activa con flag y NUNCA se cuela en producción por accidente
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tres formas de encenderlo, en orden de precedencia:
 *   1. `VITE_VENTUS_MOCK=on` en el build (o `off` para forzar el real).
 *   2. `localStorage['ventus.chat.mock'] = 'on'` — para probar en el teléfono
 *      sin rebuildear.
 *   3. Automático: si /api/ventus responde 404/501, la pantalla cae al mock
 *      por lo que queda de la sesión y LO DICE. Sin esto, el chat es inusable
 *      hasta que el agente del backend termine.
 *
 * La mecánica de la bandera (env → fallback → localStorage) es compartida:
 * vive en @/lib/mock-flag y la usa igual la ingesta de Registrar. El estado
 * del fallback NO se comparte: son dos backends distintos.
 */
const bandeira = criarBandeiraDeMock({
  valorDaEnv: import.meta.env.VITE_VENTUS_MOCK,
  chave: 'ventus.chat.mock',
})

export const CHAVE_MOCK = bandeira.CHAVE
/** Enciende el mock para lo que queda de la sesión (fallback por 404/501). */
export const ativarMockPorFallback = bandeira.ativarMockPorFallback
export const mockPorFallbackAtivo = bandeira.mockPorFallbackAtivo
export const modoMock = bandeira.modoMock

/** Trocea un texto como lo haría un modelo. Palabras, no caracteres. */
function pedacos(texto: string): string[] {
  return texto.split(/(\s+)/).filter((p) => p !== '')
}

/**
 * Stream simulado. Emite de verdad, con pausas de verdad: el mock existe para
 * probar el streaming, y un mock que devuelve todo junto no prueba nada.
 */
export async function* mockVentus(
  req: VentusRequest,
  signal?: AbortSignal,
): AsyncGenerator<VentusEvento> {
  yield { tipo: 'abertura', turnoId: req.turnoId, modelo: 'mock' }

  const pergunta = req.mensagem.toLowerCase()
  const querEscrever = /escrev|redig|mensagem|whats|e-?mail|texto/.test(pergunta)
  const querAgendar = /agend|marcar|visita|reuni|lembr/.test(pergunta)

  const resposta = querEscrever
    ? 'Escrevi um rascunho curto, com o gancho da última conversa e uma pergunta fechada no fim. Ajuste o que quiser antes de mandar.'
    : querAgendar
      ? 'Dá para marcar. Deixei a proposta abaixo com a data e o objetivo da reunião — confirme e eu registro.'
      : 'Pelo que li da ficha, o gargalo é a prova: a escala mais fraca não tem citação nenhuma sustentando o número. A jogada é pedir um dado concreto na próxima conversa.'

  for (const p of pedacos(resposta)) {
    if (signal?.aborted) return
    await new Promise((r) => setTimeout(r, 26))
    yield { tipo: 'texto', delta: p }
  }

  if (querAgendar) {
    yield {
      tipo: 'preview',
      preview: {
        actionId: null,
        tool: 'ventus_definir_proxima_acao',
        resumo: 'Marcar visita técnica e registrar a próxima ação',
        mudancas: [
          { campo: 'next_action', rotulo: 'Próxima ação', de: null, para: 'Visita técnica' },
          { campo: 'next_action_date', rotulo: 'Data', de: null, para: req.hoje },
        ],
        confianca: 'media',
        citacao: null,
        expiraEm: new Date(Date.now() + 48 * 3600_000).toISOString(),
        precisaConfirmar: true,
      },
    }
  }

  yield { tipo: 'fim', texto: resposta, tokens: 0 }
}
