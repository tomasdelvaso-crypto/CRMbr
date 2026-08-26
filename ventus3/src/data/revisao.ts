// src/data/revisao.ts
// La bandeja de Revisão: lectura, proyección y las tres escrituras del
// propose-then-commit (aceitar, descartar, vincular).
//
// Vive en un archivo propio y no dentro de queries.ts/mutations.ts a propósito:
// `ventus_actions` no está en el pull incremental de sync.ts (no es una
// SyncTable: no tiene `updated_at` ni entra en la cartera) y su ciclo de vida
// es distinto —las filas nacen del servidor, mueren a las 48 h y nunca se
// editan salvo para resolverlas—. Mezclarla con la cartera habría obligado a
// versionar el esquema de Dexie por una tabla que cabe en `meta`.
//
// Reglas que se respetan igual que en el resto de la capa:
//  · ningún componente llama a supabase: se entra por acá
//  · toda escritura pasa por el outbox, con su client_uuid y su backoff
//  · Dexie primero: la bandeja se revisa sin señal, dentro del galpón
//
// PARTIAL ACCEPT — el porqué del rodeo
//   `ventus_commit_action(uuid)` ejecuta el payload TAL COMO ESTÁ GUARDADO en
//   la fila. Para aceptar 2 de 3 campos hay que reducir el payload ANTES de
//   confirmar, así que la aceptación parcial se encola como dos mutaciones
//   sobre la MISMA fila: primero el `update` del payload, después el `rpc`.
//   El flush del outbox es serial y, si una falla, saltea las posteriores
//   sobre esa misma fila — o sea que el orden está garantizado y nunca se
//   commitea un payload a medio reducir.

import { useEffect } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  formatarBRL,
  getStageName,
  SCALE_LABELS,
  todayBr,
  type Confianca,
  type DismissReason,
  type EntidadeRef,
  type FieldProposal,
  type IsoDate,
  type IsoDateTime,
  type MarketSweepEntry,
  type RevisaoItem,
  type ScaleKey,
  type VentusAction,
  type VentusActionKind,
} from '@/core'
import { agora, carregarCarteira, getDb, gravarMeta, lerMeta } from './db'
import { normalizarBusca } from './queries'
import { enqueue, flush } from './outbox'
import { supabase, talvezOnline } from './supabase'

/* ══════════════════════════════════════════════════════════════════════════
   Constantes del contrato con Postgres
   ══════════════════════════════════════════════════════════════════════════ */

/** Tabla de las propuestas. Ver supabase/migrations/0003_ventus_actions.sql. */
export const TABELA_ACOES = 'ventus_actions'

/** La RPC que ejecuta una propuesta con staleness check e idempotencia. */
export const RPC_COMMIT_ACAO = 'ventus_commit_action'

/** Mapa de mercado: el puente sweep → lead de M13. */
export const TABELA_SWEEP = 'market_sweep'

/**
 * Estados del barrido en los que la empresa todavía puede entrar como lead.
 * Los mismos que usa `fetchMapaDeMercado()` en queries.ts: si divergen, la
 * bandeja y la Cadência muestran mapas distintos del mismo mercado.
 *
 * OJO — `market_sweep` tiene RLS habilitado y CERO policies, así que con el
 * JWT de un vendedor esto devuelve 0 filas hasta que se apruebe la policy
 * `ms_select` de 0100. La sección del mapa se ve vacía, no rota.
 */
const STATUS_PROMOVIVEIS = ['asignada', 'pool', 'en_barrido'] as const

/** Cuánto vive una propuesta. El default de la columna `expires_at`. */
export const VALIDADE_HORAS = 48

/** Techo de filas que se traen por vendedor. Nadie revisa 200 propuestas. */
const LIMITE_ACOES = 120

/* ══════════════════════════════════════════════════════════════════════════
   Claves de cache local
   ══════════════════════════════════════════════════════════════════════════ */

/** Propuestas crudas, tal como vinieron del servidor. */
export function chaveAcoesVentus(vendor: string): string {
  return `ventus_actions:${vendor}`
}

/** Empresas del mapa asignadas al vendedor y todavía sin lead. */
export function chaveSweepSemLead(vendor: string): string {
  return `sweep_sem_lead:${vendor}`
}

/**
 * Marca de que el mapa vino vacío del servidor.
 *
 * Cero filas SIN error es indistinguible de «RLS las escondió»: PostgREST no
 * devuelve error cuando una policy filtra todo. Y en producción hay 174
 * empresas esperando, así que «mapa em dia» sería mentira. La pantalla usa
 * esta marca para decir la verdad: «o mapa ainda não está liberado».
 */
export function chaveMapaBloqueado(vendor: string): string {
  return `sweep_bloqueado:${vendor}`
}

/**
 * Resueltas localmente (aceitas o descartadas) mientras el outbox las envía.
 * Sin esto la tarjeta reaparece en cada repintado hasta que haya red, y el
 * objetivo de diseño de la pantalla es llegar a cero.
 */
export function chaveResolvidas(vendor: string): string {
  return `revisao_resolvidas:${vendor}`
}

/** Marca local de una propuesta ya resuelta por el humano. */
export interface ResolucaoLocal {
  id: string
  status: 'committed' | 'dismissed'
  motivo: DismissReason | null
  em: IsoDateTime
}

async function lerResolvidas(vendor: string): Promise<Record<string, ResolucaoLocal>> {
  return (await lerMeta<Record<string, ResolucaoLocal>>(chaveResolvidas(vendor))) ?? {}
}

async function marcarResolvida(vendor: string, resolucao: ResolucaoLocal): Promise<void> {
  const atual = await lerResolvidas(vendor)
  atual[resolucao.id] = resolucao
  await gravarMeta(chaveResolvidas(vendor), atual)
}

/* ══════════════════════════════════════════════════════════════════════════
   Motivos de descarte — la señal para matar reglas que nadie acepta
   ══════════════════════════════════════════════════════════════════════════ */

export interface MotivoDescarte {
  valor: DismissReason
  rotulo: string
  /** Qué significa para el equipo que este motivo se repita. */
  consequencia: string
}

/**
 * Los tres motivos fijos. No hay campo libre a propósito: un texto libre no se
 * agrega, y lo que se mide acá es la tasa de aceptación por regla.
 *
 * Solo 'dado_errado' acusa al modelo. 'ja_fiz' y 'nao_e_prioridade' son
 * decisiones legítimas del vendedor y no deberían disparar revisión del prompt.
 */
export const MOTIVOS_DESCARTE: readonly MotivoDescarte[] = [
  {
    valor: 'dado_errado',
    rotulo: 'Dado errado',
    consequencia: 'O Ventus entendeu errado. Isso vira revisão da regra.',
  },
  {
    valor: 'ja_fiz',
    rotulo: 'Já fiz isso',
    consequencia: 'A proposta chegou tarde. O registro já existe.',
  },
  {
    valor: 'nao_e_prioridade',
    rotulo: 'Não é prioridade agora',
    consequencia: 'A proposta está certa, o momento não.',
  },
] as const

/* ══════════════════════════════════════════════════════════════════════════
   Proyección: ventus_actions → RevisaoItem
   ══════════════════════════════════════════════════════════════════════════ */

/** Tipos que la pantalla sabe pintar. Lo que no está acá se descarta callado. */
const TIPOS_CONHECIDOS: ReadonlySet<string> = new Set<VentusActionKind>([
  'criar_task',
  'atualizar_escala',
  'avancar_etapa',
  'registrar_touchpoint',
  'registrar_atividade',
  'converter_lead',
  'promover_do_sweep',
  'arquivar_lead',
])

/**
 * OJO: la migración 0009 despacha el caso del mapa de mercado con el literal
 * `promover_lead`, mientras que `VentusActionKind` (core) lo llama
 * `promover_do_sweep`. Los dos se aceptan acá y se normalizan a la unión de
 * core; cuál gana en la base es una decisión del dueño del esquema y quedó
 * anotada como pendencia.
 */
const ALIAS_TIPO: Readonly<Record<string, VentusActionKind>> = {
  promover_lead: 'promover_do_sweep',
  promote_sweep_to_lead: 'promover_do_sweep',
}

function normalizarTipo(bruto: string): VentusActionKind | null {
  const alias = ALIAS_TIPO[bruto]
  if (alias) return alias
  return TIPOS_CONHECIDOS.has(bruto) ? (bruto as VentusActionKind) : null
}

const FONTES_VALIDAS: ReadonlySet<string> = new Set([
  'audio',
  'email',
  'meeting',
  'whatsapp',
  'manual',
])

type Fonte = FieldProposal['sourceKind']

/** Rótulos en PT-BR de la fuente. Se muestran tal cual en el chip. */
export const FONTE_LABELS: Readonly<Record<Fonte, string>> = {
  audio: 'Áudio',
  email: 'E-mail',
  meeting: 'Reunião',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
}

export const CONFIANCA_LABELS: Readonly<Record<Confianca, string>> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim() !== '') return valor.trim()
  return null
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function resolverFonte(evidencia: Record<string, unknown>): Fonte {
  const bruta = texto(evidencia['fonte']) ?? texto(evidencia['source']) ?? ''
  return FONTES_VALIDAS.has(bruta) ? (bruta as Fonte) : 'manual'
}

/**
 * La cita textual. Es lo que separa una propuesta auditable de una alucinación:
 * `confianca` alta sin cita se degrada a media en `campoDe()`.
 */
function resolverCita(
  evidencia: Record<string, unknown>,
  payload: Record<string, unknown>,
): string | null {
  return (
    texto(evidencia['quote']) ??
    texto(evidencia['cita']) ??
    texto(evidencia['trecho']) ??
    texto(payload['quote'])
  )
}

interface ContextoCampo {
  quote: string | null
  fonte: Fonte
  confianca: Confianca
}

function campoDe<T>(
  field: string,
  oldValue: T,
  newValue: T,
  ctx: ContextoCampo,
): FieldProposal<T> {
  // Sin cita, la confianza nunca es alta. La regla la enuncia FieldProposal en
  // core y acá es donde se aplica de verdad.
  const confianca: Confianca =
    ctx.confianca === 'alta' && ctx.quote === null ? 'media' : ctx.confianca
  return {
    field,
    oldValue,
    newValue,
    quote: ctx.quote,
    sourceKind: ctx.fonte,
    confidence: confianca,
  }
}

/** Estado actual de la entidad, para poder mostrar «valor antigo → valor novo». */
export interface EstadoAtual {
  entidade: EntidadeRef
  stage: number | null
  scales: Partial<Record<ScaleKey, number>>
  nextAction: string | null
  nextActionDate: string | null
}

/**
 * Rótulo humano de un campo. Lo consume la fila de la tarjeta y el resumen del
 * toast, así que vive acá y no en el componente.
 */
export const CAMPO_LABELS: Readonly<Record<string, string>> = {
  titulo: 'Título da tarefa',
  due_date: 'Prazo',
  canal: 'Canal',
  draft_content: 'Rascunho da mensagem',
  expected_outcome: 'Resultado esperado',
  target_scale: 'Escala alvo',
  nova_etapa: 'Etapa',
  resultado: 'Resultado do toque',
  notas: 'Notas',
  descricao: 'Descrição',
  next_action: 'Próxima ação',
  next_action_date: 'Data da próxima ação',
  override_motivo: 'Motivo do override',
}

export function rotuloDoCampo(field: string): string {
  const direto = CAMPO_LABELS[field]
  if (direto) return direto
  if (field.startsWith('scales.')) {
    const chave = field.slice('scales.'.length) as ScaleKey
    const rotulo = SCALE_LABELS[chave]
    return rotulo ? `Escala ${rotulo}` : field
  }
  return field
}

/** Valor mostrable de un campo. Nunca devuelve `[object Object]`. */
export function valorLegivel(field: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (field === 'nova_etapa') {
    const n = numero(valor)
    return n === null ? String(valor) : `${String(n)} · ${getStageName(n as never) || 'Sem etapa'}`
  }
  if (field.startsWith('scales.')) return `${String(valor)}/10`
  if (field === 'valor' || field === 'value') {
    const n = numero(valor)
    return n === null ? String(valor) : formatarBRL(n)
  }
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

/**
 * Los campos revisables de una propuesta, uno por fila de la tarjeta.
 *
 * El orden importa: el campo que define la propuesta va PRIMERO, porque es el
 * que, al rechazarse, vacía la acción entera (ver `campoEstruturalDe`).
 */
export function camposDaAcao(
  acao: VentusAction,
  atual: EstadoAtual | null,
): FieldProposal[] {
  const payload = objeto(acao.payload)
  const evidencia = objeto(acao.evidencia)
  const ctx: ContextoCampo = {
    quote: resolverCita(evidencia, payload),
    fonte: resolverFonte(evidencia),
    confianca: acao.confianca,
  }
  const campos: FieldProposal[] = []
  const push = (field: string, antigo: unknown, novo: unknown): void => {
    if (novo === null || novo === undefined || novo === '') return
    campos.push(campoDe(field, antigo ?? null, novo, ctx))
  }

  switch (acao.tipo) {
    case 'criar_task': {
      push('titulo', null, texto(payload['titulo']))
      push('due_date', atual?.nextActionDate ?? null, texto(payload['due_date']))
      push('canal', null, texto(payload['canal']))
      push('draft_content', null, texto(payload['draft_content']))
      push('expected_outcome', null, texto(payload['expected_outcome']))
      break
    }
    case 'atualizar_escala': {
      const chave = texto(payload['scale_key']) as ScaleKey | null
      if (chave) {
        const anterior = numero(payload['score_anterior']) ?? atual?.scales[chave] ?? null
        push(`scales.${chave}`, anterior, numero(payload['score_novo']))
      }
      break
    }
    case 'avancar_etapa': {
      push('nova_etapa', atual?.stage ?? null, numero(payload['nova_etapa']))
      push('override_motivo', null, texto(payload['override_motivo']))
      break
    }
    case 'registrar_touchpoint': {
      push('canal', null, texto(payload['canal']))
      push('resultado', null, texto(payload['resultado']))
      push('notas', null, texto(payload['notas']))
      break
    }
    case 'registrar_atividade': {
      push('descricao', null, texto(payload['descricao']) ?? texto(payload['description']))
      push('next_action', atual?.nextAction ?? null, texto(payload['next_action']))
      push(
        'next_action_date',
        atual?.nextActionDate ?? null,
        texto(payload['next_action_date']),
      )
      break
    }
    case 'converter_lead':
    case 'promover_do_sweep':
    case 'arquivar_lead': {
      // Acciones sin campos editables: la propuesta ES el hecho. Se acepta o
      // se descarta entera, y la tarjeta lo dice con una sola fila.
      push('descricao', null, acao.motivo ?? 'Executar a ação proposta')
      break
    }
    default:
      break
  }

  return campos
}

/**
 * El campo SIN el cual la acción no tiene sentido. Rechazarlo equivale a
 * descartar la propuesta entera, y la pantalla lo avisa antes de hacerlo.
 */
export function campoEstruturalDe(tipo: VentusActionKind): string | null {
  switch (tipo) {
    case 'criar_task':
      return 'titulo'
    case 'avancar_etapa':
      return 'nova_etapa'
    case 'registrar_touchpoint':
      return 'canal'
    case 'registrar_atividade':
      return 'descricao'
    case 'atualizar_escala':
      // Cualquiera de los `scales.*`: hay exactamente uno por acción.
      return null
    default:
      return null
  }
}

/** Clave del payload que corresponde a un campo de la tarjeta. */
function chaveDePayload(field: string): string {
  if (field.startsWith('scales.')) return 'score_novo'
  return field
}

/**
 * Payload reducido a los campos aceptados. Los campos que el vendedor rechazó
 * se BORRAN del payload antes del commit — es la única forma de que la RPC,
 * que ejecuta lo que está guardado, haga solo lo aceptado.
 */
export function reduzirPayload(
  acao: VentusAction,
  camposAceitos: readonly string[],
): Record<string, unknown> {
  const payload = { ...objeto(acao.payload) }
  const aceitos = new Set(camposAceitos.map(chaveDePayload))
  const todos = camposDaAcao(acao, null).map((c) => chaveDePayload(c.field))
  for (const chave of todos) {
    if (!aceitos.has(chave)) delete payload[chave]
  }
  return payload
}

/* ══════════════════════════════════════════════════════════════════════════
   Resolución de la entidad
   ══════════════════════════════════════════════════════════════════════════ */

const SEM_ENTIDADE: EntidadeRef = {
  kind: 'opportunity',
  id: 0,
  nome: 'Sem cliente',
  cliente: 'Sem cliente',
}

/** Índice de la cartera local para resolver entity_id → nombre y estado. */
export interface IndiceEntidades {
  porOportunidade: Map<number, EstadoAtual>
  porLead: Map<number, EstadoAtual>
}

export async function montarIndiceEntidades(vendor: string): Promise<IndiceEntidades> {
  const { opportunities, leads } = await carregarCarteira(vendor)
  const porOportunidade = new Map<number, EstadoAtual>()
  for (const o of opportunities) {
    const nome = o.name ?? o.client ?? `Oportunidade ${String(o.id)}`
    const scales: Partial<Record<ScaleKey, number>> = {}
    const bruto = objeto(o.scales)
    for (const [k, v] of Object.entries(bruto)) {
      const score = numero(objeto(v)['score'] ?? v)
      if (score !== null) scales[k as ScaleKey] = score
    }
    porOportunidade.set(o.id, {
      entidade: { kind: 'opportunity', id: o.id, nome, cliente: o.client ?? nome },
      stage: o.stage,
      scales,
      nextAction: o.next_action,
      nextActionDate: o.next_action_date,
    })
  }
  const porLead = new Map<number, EstadoAtual>()
  for (const l of leads) {
    porLead.set(l.id, {
      entidade: {
        kind: 'lead',
        id: l.id,
        nome: l.company_name,
        cliente: l.company_name,
      },
      stage: null,
      scales: {},
      nextAction: null,
      nextActionDate: l.next_touchpoint_date,
    })
  }
  return { porOportunidade, porLead }
}

function estadoDe(acao: VentusAction, indice: IndiceEntidades): EstadoAtual | null {
  if (acao.entity_id === null || acao.entity_id === '') return null
  const id = Number(acao.entity_id)
  if (!Number.isInteger(id)) return null
  if (acao.entity_kind === 'lead') return indice.porLead.get(id) ?? null
  return indice.porOportunidade.get(id) ?? null
}

/**
 * Proyecta UNA fila de ventus_actions a la tarjeta que la pantalla pinta.
 * Devuelve null cuando el tipo no se reconoce: mejor no mostrar nada que
 * mostrar una tarjeta que no sabe qué botones ofrecer.
 */
export function mapearAcao(acao: VentusAction, indice: IndiceEntidades): RevisaoItem | null {
  const tipo = normalizarTipo(acao.tipo)
  if (tipo === null) return null
  const atual = estadoDe(acao, indice)
  const normalizada: VentusAction = { ...acao, tipo }
  const campos = camposDaAcao(normalizada, atual)
  if (campos.length === 0) return null
  return {
    id: acao.id,
    vendor: acao.vendor,
    tipo,
    entidade: atual?.entidade ?? SEM_ENTIDADE,
    campos,
    motivo: acao.motivo ?? MOTIVO_PADRAO[tipo],
    confianca: acao.confianca,
    precondition_hash: acao.precondition_hash,
    criado_em: acao.created_at,
    expira_em: acao.expires_at,
  }
}

/** Fallback del «por que isto?» cuando el productor no mandó motivo. */
const MOTIVO_PADRAO: Readonly<Record<VentusActionKind, string>> = {
  criar_task: 'O Ventus propôs uma tarefa a partir do que você registrou.',
  atualizar_escala: 'O Ventus ouviu uma prova que move esta escala.',
  avancar_etapa: 'O Ventus entendeu que a etapa avançou.',
  registrar_touchpoint: 'O Ventus identificou um toque da cadência.',
  registrar_atividade: 'O Ventus transcreveu um registro e propôs guardá-lo.',
  converter_lead: 'O lead respondeu: o Ventus propõe abrir a oportunidade.',
  promover_do_sweep: 'Empresa do mapa atribuída a você e ainda sem lead.',
  arquivar_lead: 'Sete toques sem resposta: o Ventus propõe arquivar.',
}

/* ══════════════════════════════════════════════════════════════════════════
   La bandeja completa
   ══════════════════════════════════════════════════════════════════════════ */

/** Registro del bot que no encontró cliente. Necesita [Vincular a…]. */
export interface RegistroSolto {
  id: string
  /** Lo que el bot transcribió, tal cual. */
  texto: string
  quote: string | null
  fonte: Fonte
  confianca: Confianca
  superficie: string | null
  criado_em: IsoDateTime
  expira_em: IsoDateTime | null
  /** Candidatos que el productor sugirió, si los mandó. */
  sugestoes: readonly string[]
}

/** Empresa del mapa asignada al vendedor y todavía sin lead. */
export interface EmpresaSemLead {
  sweepId: number
  empresa: string
  cidade: string | null
  uf: string | null
  setor: string | null
  funcionarios: number | null
  anel: number | null
  /** Señal de mercado ya redactada, si el sweep la trae en `notes`. */
  sinal: string | null
}

export interface BandejaRevisao {
  propostas: RevisaoItem[]
  semCliente: RegistroSolto[]
  mercado: EmpresaSemLead[]
  /** Total accionable: es el número del badge. */
  total: number
  /** Cuántas vencen en menos de 6 h. */
  urgentes: number
  /**
   * El mapa vino vacío del servidor y no se puede distinguir de «RLS lo
   * escondió». La sección del mapa lo dice en vez de celebrar un cero falso.
   */
  mercadoBloqueado: boolean
  /** La bandeja se pintó sin poder revalidar contra el servidor. */
  offline: boolean
}

export const BANDEJA_VAZIA: BandejaRevisao = {
  propostas: [],
  semCliente: [],
  mercado: [],
  total: 0,
  urgentes: 0,
  mercadoBloqueado: false,
  offline: false,
}

function expirada(acao: { expires_at: IsoDateTime }, agoraMs: number): boolean {
  const t = Date.parse(acao.expires_at)
  return Number.isFinite(t) && t <= agoraMs
}

/** Horas que faltan para que la propuesta expire. Negativo = ya expiró. */
export function horasParaExpirar(expira: IsoDateTime | null, ref: number = Date.now()): number {
  if (expira === null) return VALIDADE_HORAS
  const t = Date.parse(expira)
  if (!Number.isFinite(t)) return VALIDADE_HORAS
  return (t - ref) / 3_600_000
}

/** «expira em 4 h», «expira em 35 min», «expirou». Siempre en PT-BR. */
export function textoDeExpiracao(expira: IsoDateTime | null, ref: number = Date.now()): string {
  const horas = horasParaExpirar(expira, ref)
  if (horas <= 0) return 'Expirou'
  if (horas < 1) return `Expira em ${String(Math.max(1, Math.round(horas * 60)))} min`
  if (horas < 24) return `Expira em ${String(Math.round(horas))} h`
  return `Expira em ${String(Math.round(horas / 24))} d`
}

/**
 * Arma la bandeja desde Dexie. CERO red: es lo que permite revisar las
 * propuestas en el estacionamiento antes de entrar a la planta.
 */
export async function fetchBandejaRevisao(vendor: string): Promise<BandejaRevisao> {
  const [acoes, sweep, resolvidas, bloqueado] = await Promise.all([
    lerMeta<VentusAction[]>(chaveAcoesVentus(vendor)),
    lerMeta<MarketSweepEntry[]>(chaveSweepSemLead(vendor)),
    lerResolvidas(vendor),
    lerMeta<boolean>(chaveMapaBloqueado(vendor)),
  ])
  const indice = await montarIndiceEntidades(vendor)
  const agoraMs = Date.now()

  const propostas: RevisaoItem[] = []
  const semCliente: RegistroSolto[] = []

  for (const acao of acoes ?? []) {
    if (acao.status !== 'proposed') continue
    if (resolvidas[acao.id]) continue
    if (expirada(acao, agoraMs)) continue

    const temEntidade = acao.entity_id !== null && acao.entity_id !== ''
    if (!temEntidade) {
      const payload = objeto(acao.payload)
      const evidencia = objeto(acao.evidencia)
      const bruto =
        texto(payload['descricao']) ??
        texto(payload['description']) ??
        texto(payload['titulo']) ??
        texto(evidencia['transcricao']) ??
        acao.motivo ??
        'Registro sem texto'
      const sugestoes = Array.isArray(evidencia['candidatos'])
        ? (evidencia['candidatos'] as unknown[]).map(String).slice(0, 3)
        : []
      semCliente.push({
        id: acao.id,
        texto: bruto,
        quote: resolverCita(evidencia, payload),
        fonte: resolverFonte(evidencia),
        confianca: acao.confianca,
        superficie: acao.superficie,
        criado_em: acao.created_at,
        expira_em: acao.expires_at,
        sugestoes,
      })
      continue
    }

    const item = mapearAcao(acao, indice)
    if (item) propostas.push(item)
  }

  // Lo que vence antes, arriba: la bandeja se ordena por urgencia real, no por
  // fecha de creación.
  propostas.sort((a, b) => horasParaExpirar(a.expira_em) - horasParaExpirar(b.expira_em))
  semCliente.sort((a, b) => a.criado_em.localeCompare(b.criado_em))

  const mercado: EmpresaSemLead[] = (sweep ?? [])
    .filter((s) => s.crm_lead_id === null && !resolvidas[`sweep:${String(s.id)}`])
    .map((s) => ({
      sweepId: s.id,
      empresa: s.company_name,
      cidade: s.city,
      uf: s.uf,
      setor: s.sector,
      funcionarios: s.size_employees,
      anel: s.ring,
      sinal: texto(s.notes),
    }))
    .sort((a, b) => (a.anel ?? 9) - (b.anel ?? 9) || a.empresa.localeCompare(b.empresa, 'pt-BR'))

  const urgentes = propostas.filter((p) => horasParaExpirar(p.expira_em) < 6).length

  return {
    propostas,
    semCliente,
    mercado,
    total: propostas.length + semCliente.length + mercado.length,
    urgentes,
    mercadoBloqueado: bloqueado === true && mercado.length === 0,
    offline: !talvezOnline(),
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Revalidación contra el servidor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Trae las propuestas vivas y el mapa sin lead, y los guarda en Dexie.
 *
 * No participa del pull incremental de sync.ts: `ventus_actions` no tiene
 * `updated_at` y su ventana es de 48 h, así que traer la lista entera del
 * vendedor es más barato que llevar un cursor.
 *
 * Sin red devuelve false y NO lanza: la bandeja ya pintó desde Dexie.
 */
export async function sincronizarRevisao(vendor: string): Promise<boolean> {
  if (!talvezOnline()) return false
  try {
    const [acoes, sweep] = await Promise.all([
      supabase
        .from(TABELA_ACOES)
        .select('*')
        .eq('vendor', vendor)
        .eq('status', 'proposed')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(LIMITE_ACOES),
      supabase
        .from(TABELA_SWEEP)
        .select(
          'id,company_name,city,uf,sector,size_employees,ring,notes,crm_lead_id,vendor,status',
        )
        .eq('vendor', vendor)
        .is('crm_lead_id', null)
        .in('status', STATUS_PROMOVIVEIS as unknown as string[])
        .limit(LIMITE_ACOES),
    ])

    if (!acoes.error && Array.isArray(acoes.data)) {
      await gravarMeta(chaveAcoesVentus(vendor), acoes.data as VentusAction[])
      // Poda: lo que el servidor ya no devuelve como 'proposed' salió de la
      // bandeja de verdad, así que su marca local dejó de hacer falta.
      const vivos = new Set((acoes.data as VentusAction[]).map((a) => a.id))
      const resolvidas = await lerResolvidas(vendor)
      let mudou = false
      for (const id of Object.keys(resolvidas)) {
        if (!id.startsWith('sweep:') && !vivos.has(id)) {
          delete resolvidas[id]
          mudou = true
        }
      }
      if (mudou) await gravarMeta(chaveResolvidas(vendor), resolvidas)
    }
    if (!sweep.error && Array.isArray(sweep.data)) {
      await gravarMeta(chaveSweepSemLead(vendor), sweep.data as MarketSweepEntry[])
      await gravarMeta(chaveMapaBloqueado(vendor), sweep.data.length === 0)
    } else if (sweep.error) {
      await gravarMeta(chaveMapaBloqueado(vendor), true)
    }
    return !acoes.error
  } catch {
    // Un fallo de red acá no es un error de la pantalla: es el estado normal.
    return false
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Escrituras — todas por el outbox
   ══════════════════════════════════════════════════════════════════════════ */

async function encolarEDisparar(entrada: Parameters<typeof enqueue>[0]): Promise<string> {
  const id = await enqueue(entrada)
  void flush().catch(() => undefined)
  return id
}

async function acaoBruta(vendor: string, id: string): Promise<VentusAction | null> {
  const acoes = (await lerMeta<VentusAction[]>(chaveAcoesVentus(vendor))) ?? []
  return acoes.find((a) => a.id === id) ?? null
}

export interface EntradaAceitar {
  vendor: string
  /** id de la fila de ventus_actions. */
  acaoId: string
  /** Los campos que el vendedor aceptó. Vacío = descartar. */
  camposAceitos: readonly string[]
  /**
   * Ediciones del vendedor antes de aceptar, por nombre de campo de la
   * tarjeta. Se aplican sobre el payload reducido.
   */
  edicoes?: Record<string, unknown>
}

/**
 * Acepta una propuesta, entera o por campo.
 *
 * Encola hasta DOS mutaciones sobre la misma fila:
 *   1. `update` del payload — solo si hubo recorte o edición
 *   2. `rpc ventus_commit_action` — siempre
 * El flush es serial por fila, así que el orden está garantizado.
 */
export async function aceitarProposta(entrada: EntradaAceitar): Promise<void> {
  const acao = await acaoBruta(entrada.vendor, entrada.acaoId)
  if (acao === null) {
    throw new Error('Proposta não encontrada no cache local. Puxe para atualizar.')
  }
  if (horasParaExpirar(acao.expires_at) <= 0) {
    throw new Error('Esta proposta expirou. Peça ao Ventus uma nova.')
  }

  const todos = camposDaAcao(acao, null).map((c) => c.field)
  const aceitos = entrada.camposAceitos
  const edicoes = entrada.edicoes ?? {}
  const recortou = aceitos.length < todos.length
  const editou = Object.keys(edicoes).length > 0

  if (recortou || editou) {
    const payload = reduzirPayload(acao, aceitos)
    for (const [field, valor] of Object.entries(edicoes)) {
      if (!aceitos.includes(field)) continue
      payload[chaveDePayload(field)] = valor
    }
    await encolarEDisparar({
      tabla: TABELA_ACOES,
      op: 'update',
      row_id: acao.id,
      campos_tocados: ['payload'],
      payload: { payload },
    })
  }

  await encolarEDisparar({
    tabla: TABELA_ACOES,
    op: 'rpc',
    rpc: RPC_COMMIT_ACAO,
    row_id: acao.id,
    campos_tocados: ['status', 'committed_at', 'resultado'],
    // Firma real: public.ventus_commit_action(p_action_id uuid). Ni un
    // argumento más: PostgREST resuelve por conjunto exacto de nombres.
    payload: { p_action_id: acao.id },
  })

  await marcarResolvida(entrada.vendor, {
    id: acao.id,
    status: 'committed',
    motivo: null,
    em: agora(),
  })
}

/**
 * Confirma una propuesta por su id, sin pasar por el cache local.
 *
 * Es el camino del chat: el preview que llega por SSE apunta a una fila de
 * ventus_actions que el servidor acaba de crear y que el pull todavía no
 * trajo. No hay recorte de campos posible —el preview se muestra entero y se
 * acepta entero—, así que basta con la RPC.
 */
export async function commitarAcaoPorId(vendor: string, acaoId: string): Promise<void> {
  await encolarEDisparar({
    tabla: TABELA_ACOES,
    op: 'rpc',
    rpc: RPC_COMMIT_ACAO,
    row_id: acaoId,
    campos_tocados: ['status', 'committed_at', 'resultado'],
    payload: { p_action_id: acaoId },
  })
  await marcarResolvida(vendor, {
    id: acaoId,
    status: 'committed',
    motivo: null,
    em: agora(),
  })
}

export interface EntradaDescartar {
  vendor: string
  acaoId: string
  motivo: DismissReason
}

/**
 * Descarta una propuesta con su motivo. El motivo NO es decorativo: es la
 * señal que permite matar reglas que nadie acepta, así que viaja al servidor
 * en la misma escritura.
 */
export async function descartarProposta(entrada: EntradaDescartar): Promise<void> {
  await encolarEDisparar({
    tabla: TABELA_ACOES,
    op: 'update',
    row_id: entrada.acaoId,
    campos_tocados: ['status', 'dismissed_reason', 'dismissed_at'],
    payload: {
      status: 'dismissed',
      dismissed_reason: entrada.motivo,
      // El trigger trg_ventus_actions_before_write también lo estampa, pero el
      // CHECK ventus_actions_dismissed_chk corre en la misma sentencia: si el
      // cliente no lo manda, depende del orden de evaluación. Mandarlo es
      // gratis y quita la duda.
      dismissed_at: new Date().toISOString(),
    },
  })
  await marcarResolvida(entrada.vendor, {
    id: entrada.acaoId,
    status: 'dismissed',
    motivo: entrada.motivo,
    em: agora(),
  })
}

export interface EntradaVincular {
  vendor: string
  acaoId: string
  alvo: { kind: 'opportunity' | 'lead'; id: number }
}

/**
 * Ata un registro suelto del bot a un cliente. Después de esto la propuesta
 * vuelve a la sección normal y se acepta como cualquier otra: vincular NO
 * ejecuta nada por sí solo.
 */
export async function vincularRegistroSolto(entrada: EntradaVincular): Promise<void> {
  const acao = await acaoBruta(entrada.vendor, entrada.acaoId)
  const payload = { ...objeto(acao?.payload) }
  if (entrada.alvo.kind === 'opportunity') payload['opportunity_id'] = entrada.alvo.id
  else payload['lead_id'] = entrada.alvo.id

  await encolarEDisparar({
    tabla: TABELA_ACOES,
    op: 'update',
    row_id: entrada.acaoId,
    campos_tocados: ['entity_kind', 'entity_id', 'payload'],
    payload: {
      entity_kind: entrada.alvo.kind,
      entity_id: String(entrada.alvo.id),
      payload,
    },
  })

  // Optimista: la fila cacheada se actualiza para que la tarjeta salte de
  // «Sem cliente» a la sección de propuestas sin esperar al servidor.
  const acoes = (await lerMeta<VentusAction[]>(chaveAcoesVentus(entrada.vendor))) ?? []
  const proximas = acoes.map((a) =>
    a.id === entrada.acaoId
      ? {
          ...a,
          entity_kind: entrada.alvo.kind,
          entity_id: String(entrada.alvo.id),
          payload,
        }
      : a,
  )
  await gravarMeta(chaveAcoesVentus(entrada.vendor), proximas)
}

/** Saca una empresa del mapa de la bandeja sin promoverla (no me interesa). */
export async function ignorarEmpresaDoMapa(vendor: string, sweepId: number): Promise<void> {
  await marcarResolvida(vendor, {
    id: `sweep:${String(sweepId)}`,
    status: 'dismissed',
    motivo: 'nao_e_prioridade',
    em: agora(),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   El badge del sistema operativo NO se pinta desde acá
   ══════════════════════════════════════════════════════════════════════════ */

// Antes este módulo tenía su propio `atualizarAppBadge()` y lo llamaba con el
// total de la bandeja. El badge del ícono es UNO SOLO: dos escritores se pisan
// —el último que corre gana— y el número terminaba contando la mitad del
// trabajo pendiente. Ahora hay un único escritor, `definirBadge()` de
// `@/push`, cableado en `src/app/Shell.tsx` con la suma real: tarjetas del día
// sin resolver + propuestas del Ventus sin revisar.

/* ══════════════════════════════════════════════════════════════════════════
   Hooks
   ══════════════════════════════════════════════════════════════════════════ */

export const chavesRevisao = {
  bandeja: (vendor: string) => ['revisao', vendor, 'bandeja'] as const,
} as const

export function useBandejaRevisao(vendor: string | null): UseQueryResult<BandejaRevisao> {
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: chavesRevisao.bandeja(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => fetchBandejaRevisao(vendor as string),
  })

  // Revalidación en background: la bandeja YA pintó desde Dexie. Si hay red,
  // esto la pone al día e invalida; si no la hay, no pasa nada.
  useEffect(() => {
    if (vendor === null) return
    let vivo = true
    void sincronizarRevisao(vendor).then((ok) => {
      if (ok && vivo) void queryClient.invalidateQueries({ queryKey: ['revisao'] })
    })
    return () => {
      vivo = false
    }
  }, [vendor, queryClient])

  return consulta
}

/**
 * Solo el número: es lo que consume el badge de la bottom nav y el del sistema.
 *
 * Revalida al montar y cada vez que la app vuelve al frente. En iOS no hay
 * Background Sync ni Periodic Sync: `visibilitychange` no es un extra, es EL
 * mecanismo — sin él, el badge diría el número de ayer.
 */
export function useContagemRevisao(vendor: string | null): number {
  const queryClient = useQueryClient()

  const consulta = useQuery({
    queryKey: chavesRevisao.bandeja(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => fetchBandejaRevisao(vendor as string),
  })
  const total = consulta.data?.total ?? 0

  useEffect(() => {
    if (vendor === null) return
    let vivo = true

    const revalidar = () => {
      void sincronizarRevisao(vendor).then((ok) => {
        if (ok && vivo) void queryClient.invalidateQueries({ queryKey: ['revisao'] })
      })
    }
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') revalidar()
    }

    revalidar()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [vendor, queryClient])

  // El badge del ícono no se pinta acá: ver el bloque de arriba. Este hook
  // devuelve el número y nada más.
  return total
}

function useMutacaoRevisao<TVars>(
  fn: (vars: TVars) => Promise<void>,
): UseMutationResult<void, Error, TVars> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['revisao'] })
      void queryClient.invalidateQueries({ queryKey: ['carteira'] })
      void queryClient.invalidateQueries({ queryKey: ['plano'] })
      void queryClient.invalidateQueries({ queryKey: ['dossie'] })
    },
  })
}

export function useAceitarProposta(): UseMutationResult<void, Error, EntradaAceitar> {
  return useMutacaoRevisao(aceitarProposta)
}

export function useDescartarProposta(): UseMutationResult<void, Error, EntradaDescartar> {
  return useMutacaoRevisao(descartarProposta)
}

export function useVincularRegistro(): UseMutationResult<void, Error, EntradaVincular> {
  return useMutacaoRevisao(vincularRegistroSolto)
}

/* ══════════════════════════════════════════════════════════════════════════
   Ayudas de lectura para la pantalla
   ══════════════════════════════════════════════════════════════════════════ */

/** Hoy en BRT. Reexportado para que la pantalla no importe dos barriles. */
export function hojeDaRevisao(): IsoDate {
  return todayBr()
}

/**
 * ¿Hay algo del mapa de mercado que ya sea lead? Se usa para no ofrecer
 * promover dos veces la misma empresa cuando el pull todavía no llegó.
 */
export async function leadJaExistePara(vendor: string, empresa: string): Promise<boolean> {
  const db = getDb()
  const alvo = normalizarBusca(empresa)
  const leads = await db.leads.where('vendor').equals(vendor).toArray()
  return leads.some((l) => normalizarBusca(l.company_name) === alvo)
}
