// src/data/dossie.ts
// Lectura y escritura del Dossiê do Cliente.
//
// Por qué es un archivo aparte de queries.ts: el dossiê necesita CINCO cosas
// que el bundle mínimo de la Carteira no tiene —evidencia por escala, health
// verificado, gates pendientes, historial de cada escala y el estado de las
// perguntas SPIN ya usadas— y todas se resuelven en UNA sola pasada por
// Dexie. Mantenerlas juntas es lo que garantiza que abrir una ficha no dispare
// una query por panel (el v2 dispara ~195 al abrir la Carteira).
//
// Regla del proyecto que este archivo respeta: cero supabase acá dentro. Se
// lee de Dexie y se escribe por `atualizarEscala()` de mutations.ts, que es
// quien encola en el outbox.
//
// El historial de escalas y las perguntas usadas viven en el store `meta` a
// propósito: son estado LOCAL del vendedor mientras `scale_evidence` (migración
// 0002) no esté aplicada ni sincronizada. Cuando lo esté, esta capa cambia de
// fuente sin que la pantalla se entere. En el v2 ese estado se perdía al
// cerrar el modal: acá sobrevive a recargas, a cierres y al modo avión.

import { useMutation, useQueryClient, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import {
  SCALE_KEYS,
  calculateHealthScore,
  detectRisks,
  gateFaltante,
  gatesFaltantes,
  getDaysSinceLastContact,
  getScale,
  getScaleValue,
  healthVerificado,
  todayBr,
  type Activity,
  type Commitment,
  type DealRisk,
  type Evidence,
  type GateFaltante,
  type HealthVerificado,
  type IsoDate,
  type IsoDateTime,
  type Lead,
  type Opportunity,
  type ScaleKey,
  type ScaleValue,
  type StageId,
  type Task,
  type Touchpoint,
} from '@/core'
import { agora, atividadesDaOportunidade, getDb, gravarMeta, lerMeta } from './db'
import { novoClientUuid } from './outbox'
import { atualizarEscala, type EntradaEscala } from './mutations'

/* ══════════════════════════════════════════════════════════════════════════
   Historial de una escala (local)
   ══════════════════════════════════════════════════════════════════════════ */

/** Un movimiento de escala: quién la movió, cuándo, desde dónde y con qué prueba. */
export interface MovimentoEscala {
  id: string
  opportunity_id: number
  escala: ScaleKey
  de: number
  para: number
  citacao: string | null
  /** Quién lo dijo. */
  fonte_nome: string | null
  /** Cargo de quien lo dijo. Sin cargo, una cita no se puede auditar. */
  fonte_cargo: string | null
  /** Vendedor que movió la escala. */
  autor: string
  /** Fecha del hecho probado (no la de carga). */
  ocorrido_em: IsoDate
  criado_em: IsoDateTime
}

export function chaveHistoricoEscalas(opportunityId: number): string {
  return `dossie:escalas:${String(opportunityId)}`
}

/** Historial completo de las 6 escalas, del movimiento más nuevo al más viejo. */
export async function lerHistoricoEscalas(opportunityId: number): Promise<MovimentoEscala[]> {
  const linhas = (await lerMeta<MovimentoEscala[]>(chaveHistoricoEscalas(opportunityId))) ?? []
  return [...linhas].sort((a, b) => b.criado_em.localeCompare(a.criado_em))
}

/** Agrega un movimiento al historial local. Append-only: nunca reescribe. */
export async function registrarMovimentoEscala(mov: MovimentoEscala): Promise<void> {
  const chave = chaveHistoricoEscalas(mov.opportunity_id)
  const atual = (await lerMeta<MovimentoEscala[]>(chave)) ?? []
  // Se acotan a 120 movimientos por oportunidad: es historia de consulta, no
  // una tabla. Con 6 escalas eso son 20 cambios por escala.
  await gravarMeta(chave, [...atual, mov].slice(-120))
}

/* ══════════════════════════════════════════════════════════════════════════
   Perguntas SPIN ya usadas (local, persistidas)
   ══════════════════════════════════════════════════════════════════════════ */

/** Textos de SPIN ya usados, por escala. Vacío = ninguna usada todavía. */
export type PerguntasUsadas = Partial<Record<ScaleKey, string[]>>

export function chavePerguntasSpin(opportunityId: number): string {
  return `dossie:spin:${String(opportunityId)}`
}

export async function lerPerguntasSpinUsadas(opportunityId: number): Promise<PerguntasUsadas> {
  return (await lerMeta<PerguntasUsadas>(chavePerguntasSpin(opportunityId))) ?? {}
}

/**
 * Marca o desmarca una pergunta. Devuelve la lista resultante de esa escala.
 * Es un toggle porque el vendedor se equivoca de fila con el pulgar y tiene
 * que poder deshacerlo sin salir del sheet.
 */
export async function alternarPerguntaSpin(
  opportunityId: number,
  escala: ScaleKey,
  texto: string,
): Promise<string[]> {
  const chave = chavePerguntasSpin(opportunityId)
  const atual = (await lerMeta<PerguntasUsadas>(chave)) ?? {}
  const daEscala = atual[escala] ?? []
  const limpo = texto.trim()
  const proxima = daEscala.includes(limpo)
    ? daEscala.filter((t) => t !== limpo)
    : [...daEscala, limpo]
  await gravarMeta(chave, { ...atual, [escala]: proxima })
  return proxima
}

/* ══════════════════════════════════════════════════════════════════════════
   Evidencia
   ══════════════════════════════════════════════════════════════════════════ */

/** Separa «Marcelo Silva · Gerente de Logística» en nombre y cargo. */
export function partirFonte(fonte: string | null | undefined): {
  nome: string | null
  cargo: string | null
} {
  const bruto = (fonte ?? '').trim()
  if (bruto === '') return { nome: null, cargo: null }
  const partes = bruto.split(/\s*[·|,–-]\s*/).filter((p) => p.trim() !== '')
  const nome = partes[0]?.trim() ?? null
  const cargo = partes.length > 1 ? partes.slice(1).join(' · ').trim() : null
  return { nome, cargo }
}

/** Junta nombre y cargo en la sola cadena que guarda `scales.<escala>`. */
export function juntarFonte(nome: string | null, cargo: string | null): string | null {
  const n = (nome ?? '').trim()
  const c = (cargo ?? '').trim()
  if (n === '' && c === '') return null
  if (c === '') return n
  if (n === '') return c
  return `${n} · ${c}`
}

function ehObjetoDeEscala(valor: unknown): valor is ScaleValue {
  return typeof valor === 'object' && valor !== null && 'score' in valor
}

/**
 * Las pruebas de una oportunidad, leídas de las DOS fuentes que hay hoy:
 *
 *  1. el jsonb `opportunities.scales`, que es lo que el v2 escribió y lo que
 *     `atualizar_escala()` sigue escribiendo (evidence / evidence_source /
 *     evidence_at);
 *  2. el historial local de movimientos, que conserva las citas viejas.
 *
 * La segunda importa: si alguien BAJA una escala sin cita, el jsonb pierde la
 * prueba anterior y la ficha diría «nunca documentada» sobre un negocio que sí
 * tiene historia. `healthVerificado()` se queda igual con la más reciente.
 */
export function evidenciasDoDossie(
  opportunity: Opportunity | null,
  historico: readonly MovimentoEscala[] = [],
): Evidence[] {
  const saida: Evidence[] = []
  if (opportunity) {
    for (const escala of SCALE_KEYS) {
      const bruto = getScale(opportunity.scales, escala)
      if (!ehObjetoDeEscala(bruto)) continue
      const cita = (bruto.evidence ?? '').trim()
      const quando = bruto.evidence_at ?? bruto.updated_at ?? null
      if (cita === '' || !quando) continue
      const { nome, cargo } = partirFonte(bruto.evidence_source)
      saida.push({
        id: `scales:${String(opportunity.id)}:${escala}`,
        opportunity_id: opportunity.id,
        scale: escala,
        level: getScaleValue(bruto),
        kind: 'quote',
        quote: cita,
        source_name: nome,
        source_title: cargo,
        occurred_at: quando.slice(0, 10),
        created_at: quando,
        created_by: bruto.updated_by ?? opportunity.vendor ?? '',
        verified: null,
      })
    }
  }

  for (const mov of historico) {
    const cita = (mov.citacao ?? '').trim()
    if (cita === '') continue
    saida.push({
      id: `mov:${mov.id}`,
      opportunity_id: mov.opportunity_id,
      scale: mov.escala,
      level: mov.para,
      kind: 'quote',
      quote: cita,
      source_name: mov.fonte_nome,
      source_title: mov.fonte_cargo,
      occurred_at: mov.ocorrido_em,
      created_at: mov.criado_em,
      created_by: mov.autor,
      verified: null,
    })
  }

  return saida
}

/* ══════════════════════════════════════════════════════════════════════════
   El bundle del Dossiê — UNA sola lectura
   ══════════════════════════════════════════════════════════════════════════ */

export interface DossieCompleto {
  opportunity: Opportunity | null
  /** El lead del que nació la oportunidad: es el único que tiene teléfono. */
  lead: Lead | null
  activities: Activity[]
  touchpoints: Touchpoint[]
  commitments: Commitment[]
  tasks: Task[]
  risks: DealRisk[]
  evidencias: Evidence[]
  /** Los DOS números: declarado y verificado. */
  health: HealthVerificado
  /** Media declarada, para no recalcularla en cada componente. */
  healthDeclarado: number
  /** Lo que falta para SALIR de la etapa actual, ya redactado en PT-BR. */
  gate: GateFaltante | null
  gates: GateFaltante[]
  historicoEscalas: MovimentoEscala[]
  spinUsadas: PerguntasUsadas
  daysSinceContact: number
  hoje: IsoDate
}

function vazio(hoje: IsoDate): DossieCompleto {
  return {
    opportunity: null,
    lead: null,
    activities: [],
    touchpoints: [],
    commitments: [],
    tasks: [],
    risks: [],
    evidencias: [],
    health: { declarado: 0, verificado: 0, escalasSemProva: [...SCALE_KEYS], escalasComProva: [] },
    healthDeclarado: 0,
    gate: null,
    gates: [],
    historicoEscalas: [],
    spinUsadas: {},
    daysSinceContact: 0,
    hoje,
  }
}

/**
 * Todo el dossiê en una pasada. Ninguna sección de la pantalla vuelve a
 * consultar: reciben lo que sale de acá por props.
 */
export async function fetchDossieCompleto(
  opportunityId: number,
  hoje: IsoDate = todayBr(),
): Promise<DossieCompleto> {
  const db = getDb()
  const opportunity = (await db.opportunities.get(opportunityId)) ?? null
  if (!opportunity) return vazio(hoje)

  const [activities, tasks, commitments, leads, historicoEscalas, spinUsadas] = await Promise.all([
    atividadesDaOportunidade(opportunityId, 200),
    db.tasks.filter((t) => t.target.kind === 'opportunity' && t.target.id === opportunityId).toArray(),
    db.commitments.filter((c) => c.opportunity_id === opportunityId).toArray(),
    db.leads.filter((l) => l.opportunity_id === opportunityId).toArray(),
    lerHistoricoEscalas(opportunityId),
    lerPerguntasSpinUsadas(opportunityId),
  ])

  // Los toques de cadencia del lead de origen entran al mismo timeline: para
  // el vendedor son la misma conversación, aunque vivan en otra tabla.
  const idsLead = leads.map((l) => l.id)
  const touchpoints =
    idsLead.length === 0
      ? []
      : await db.touchpoints.where('lead_id').anyOf(idsLead).toArray()

  const evidencias = evidenciasDoDossie(opportunity, historicoEscalas)
  const etapa = (opportunity.stage ?? 1) as StageId

  return {
    opportunity,
    lead: leads[0] ?? null,
    activities,
    touchpoints: touchpoints.sort((a, b) => b.executed_at.localeCompare(a.executed_at)),
    commitments,
    tasks,
    risks: detectRisks(opportunity, activities, hoje),
    evidencias,
    health: healthVerificado(opportunity.scales, evidencias, hoje),
    healthDeclarado: calculateHealthScore(opportunity.scales),
    gate: gateFaltante(opportunity.scales, etapa),
    gates: gatesFaltantes(opportunity.scales, etapa),
    historicoEscalas,
    spinUsadas,
    daysSinceContact: getDaysSinceLastContact(opportunity.last_update, activities),
    hoje,
  }
}

/**
 * Clave propia, colgada de ['dossie'] para heredar las invalidaciones que ya
 * hacen el sync y las mutaciones de escala, etapa y actividad.
 */
export function chaveDossieCompleto(opportunityId: number): readonly unknown[] {
  return ['dossie', opportunityId, 'completo']
}

export function useDossieCompleto(
  opportunityId: number | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<DossieCompleto> {
  return useQuery({
    queryKey: chaveDossieCompleto(opportunityId ?? -1),
    enabled: opportunityId !== null,
    queryFn: () => fetchDossieCompleto(opportunityId as number, hoje),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Mover una escala — el gesto de 10 segundos
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaMoverEscala extends EntradaEscala {
  /** Nivel del que se parte, solo para el historial. */
  de: number
  /** Nombre de quien dijo la cita. */
  fonteNome?: string | null
  /** Cargo de quien la dijo. */
  fonteCargo?: string | null
  /** Fecha del hecho probado. Default: hoy en BRT. */
  ocorridoEm?: IsoDate
  /** Perguntas SPIN que se usaron en la conversación, para marcarlas. */
  perguntasUsadas?: readonly string[]
}

/**
 * Mueve una escala con su prueba y deja rastro.
 *
 * El orden importa: `atualizarEscala()` valida la regra da prova y ES quien
 * escribe en Dexie y encola en el outbox. Si lanza (nivel > 5 sin cita), el
 * historial NO se ensucia con un movimiento que nunca ocurrió. El gate se
 * revalida SIEMPRE en Postgres: lo que decide acá el cliente es solo lo que
 * pinta la pantalla mientras tanto.
 */
export async function moverEscala(entrada: EntradaMoverEscala): Promise<void> {
  const fonte = juntarFonte(entrada.fonteNome ?? null, entrada.fonteCargo ?? null)
  await atualizarEscala({
    opportunityId: entrada.opportunityId,
    escala: entrada.escala,
    nivel: entrada.nivel,
    citacao: entrada.citacao ?? null,
    fonte,
    vendor: entrada.vendor,
  })

  await registrarMovimentoEscala({
    id: novoClientUuid(),
    opportunity_id: entrada.opportunityId,
    escala: entrada.escala,
    de: entrada.de,
    para: entrada.nivel,
    citacao: entrada.citacao ?? null,
    fonte_nome: entrada.fonteNome?.trim() || null,
    fonte_cargo: entrada.fonteCargo?.trim() || null,
    autor: entrada.vendor,
    ocorrido_em: entrada.ocorridoEm ?? todayBr(),
    criado_em: agora(),
  })

  for (const texto of entrada.perguntasUsadas ?? []) {
    await alternarPerguntaSpin(entrada.opportunityId, entrada.escala, texto)
  }
}

/**
 * Hook del editor. Declara `mutationFn` en vez de tomarlo de los defaults
 * porque lo durable acá no es la mutación de React Query sino la fila del
 * outbox, que `atualizarEscala()` ya encoló antes de resolver.
 */
export function useMoverEscala(): UseMutationResult<void, Error, EntradaMoverEscala> {
  const queryClient = useQueryClient()
  return useMutation<void, Error, EntradaMoverEscala>({
    mutationFn: moverEscala,
    onSettled: () => {
      for (const raiz of ['dossie', 'carteira', 'plano']) {
        void queryClient.invalidateQueries({ queryKey: [raiz] })
      }
    },
  })
}

/** Marca perguntas SPIN como usadas sin mover la escala (se preguntó, no avanzó). */
export function useAlternarPerguntaSpin(): UseMutationResult<
  string[],
  Error,
  { opportunityId: number; escala: ScaleKey; texto: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { opportunityId: number; escala: ScaleKey; texto: string }) =>
      alternarPerguntaSpin(v.opportunityId, v.escala, v.texto),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['dossie'] })
    },
  })
}
