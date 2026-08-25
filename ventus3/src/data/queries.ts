// src/data/queries.ts
// Capa de lectura: TanStack Query montada SOBRE Dexie, no sobre la red.
//
// El contrato de cada hook es siempre el mismo:
//   1. lee de Dexie          → render en <100ms, sin red, dentro del galpón
//   2. revalida en background → el pull incremental actualiza Dexie
//   3. el aviso de sync      → invalida la query y la pantalla se repinta
//
// Reglas duras:
//  · CERO queries por fila. Cada pantalla arma su payload con UNA pasada por
//    los stores (el v2 dispara ~195 queries al abrir Carteira).
//  · Ningún componente importa supabase. Si necesita datos, hay un hook acá.
//  · El persister de IndexedDB y setMutationDefaults POR mutationKey van
//    juntos: sin los defaults, las mutaciones pausadas no se reanudan después
//    de recargar la app y el vendedor pierde lo que escribió.

import { useEffect } from 'react'
import {
  QueryClient,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'
import {
  buildGoldenQueue,
  calculateHealthScore,
  computeRings,
  detectRisks,
  getDaysSinceLastContact,
  rankDay,
  todayBr,
  touchpointDelayDays,
  type Activity,
  type Commitment,
  type DealRisk,
  type IsoDate,
  type Lead,
  type Opportunity,
  type PlannedAction,
  type RevisaoItem,
  type RingProgress,
  type RingKey,
  type Task,
  type Touchpoint,
  type Vendor,
} from '@/core'
import {
  atividadesDaOportunidade,
  carregarCarteira,
  getDb,
  lerFilaGolden,
  lerMeta,
  gravarMeta,
  touchpointsDoLead,
} from './db'
import { assinarMudancas, syncNow } from './sync'
import { supabase, talvezOnline } from './supabase'
import type { GoldenQueueEntry, SyncTable } from './local-types'

/* ══════════════════════════════════════════════════════════════════════════
   Claves
   ══════════════════════════════════════════════════════════════════════════ */

/** Claves jerárquicas: invalidar ['carteira'] invalida todo lo que cuelga. */
export const queryKeys = {
  session: ['session'] as const,
  vendor: (name: string) => ['vendor', name] as const,
  plano: (vendor: string, date: IsoDate) => ['plano', vendor, date] as const,
  carteira: (vendor: string) => ['carteira', vendor] as const,
  dossie: (opportunityId: number) => ['dossie', opportunityId] as const,
  cadencia: (vendor: string) => ['cadencia', vendor] as const,
  goldenQueue: (vendor: string, date: IsoDate) => ['golden', vendor, date] as const,
  rings: (vendor: string, date: IsoDate) => ['rings', vendor, date] as const,
  revisao: (vendor: string) => ['revisao', vendor] as const,
  placar: (vendor: string, week: IsoDate) => ['placar', vendor, week] as const,
  gestor: (week: IsoDate) => ['gestor', week] as const,
  notifications: (vendor: string) => ['notifications', vendor] as const,
} as const

/** Qué claves invalida cada tabla cuando el pull trae filas nuevas. */
const CHAVES_POR_TABELA: Readonly<Record<SyncTable, readonly string[]>> = {
  opportunities: ['carteira', 'plano', 'dossie'],
  leads: ['cadencia', 'golden', 'plano'],
  tasks: ['plano', 'carteira'],
  activities: ['dossie', 'carteira', 'plano', 'rings'],
  touchpoints: ['cadencia', 'golden', 'rings', 'dossie'],
  commitments: ['plano', 'dossie'],
  vendors: ['vendor'],
}

/* ══════════════════════════════════════════════════════════════════════════
   QueryClient y persistencia
   ══════════════════════════════════════════════════════════════════════════ */

/** Clave del cache persistido dentro del store `meta`. */
export const CHAVE_CACHE_QUERY = 'tanstack:query-cache'

/**
 * Persister sobre Dexie. No usamos localStorage: el cache de la cartera pasa
 * holgado los 5 MB de cuota de localStorage en Safari y el fallo sería
 * silencioso.
 */
export function criarPersisterDexie(chave: string = CHAVE_CACHE_QUERY): Persister {
  return {
    async persistClient(cliente: PersistedClient): Promise<void> {
      await gravarMeta(chave, cliente)
    },
    async restoreClient(): Promise<PersistedClient | undefined> {
      return lerMeta<PersistedClient>(chave)
    },
    async removeClient(): Promise<void> {
      const db = getDb()
      await db.meta.delete(chave)
    },
  }
}

/**
 * QueryClient de la app.
 * `networkMode: 'offlineFirst'` es obligatorio: sin eso, TanStack Query no
 * ejecuta nada cuando el navegador se declara offline y la pantalla queda en
 * blanco aunque Dexie tenga todo.
 */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        refetchOnWindowFocus: false,
        // Los datos vienen de Dexie: quedan frescos hasta que el sync avisa.
        staleTime: 60_000,
        gcTime: 24 * 60 * 60_000,
        retry: 1,
      },
      mutations: {
        networkMode: 'offlineFirst',
        // Los reintentos los maneja el outbox, no Query: si Query también
        // reintentara, tendríamos dos backoffs peleándose.
        retry: 0,
      },
    },
  })
}

/**
 * Conecta el motor de sync al cache: cuando el pull escribe filas nuevas en
 * Dexie, se invalidan solo las claves afectadas. Devuelve la baja.
 */
export function conectarCacheAoSync(queryClient: QueryClient): () => void {
  return assinarMudancas((tabelas) => {
    const raizes = new Set<string>()
    for (const t of tabelas) for (const chave of CHAVES_POR_TABELA[t]) raizes.add(chave)
    for (const raiz of raizes) void queryClient.invalidateQueries({ queryKey: [raiz] })
  })
}

/** Hook de conveniencia: instala conectarCacheAoSync durante el ciclo de vida. */
export function useSyncInvalidation(): void {
  const queryClient = useQueryClient()
  useEffect(() => conectarCacheAoSync(queryClient), [queryClient])
}

/* ══════════════════════════════════════════════════════════════════════════
   Revalidación en background
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dispara un sync sin bloquear el render. El resultado NO se espera: Dexie ya
 * respondió y la invalidación llega por assinarMudancas.
 */
function revalidar(vendor: string | null | undefined): void {
  if (!vendor) return
  void syncNow(vendor).catch(() => {
    // Sin red no pasa nada: el outbox y el cursor siguen donde estaban.
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Carteira
   ══════════════════════════════════════════════════════════════════════════ */

/** Fila agregada de Carteira: la próxima acción y los días sin contacto ya resueltos. */
export interface CarteiraRow {
  opportunity: Opportunity
  daysSinceContact: number
  nextAction: string | null
  nextActionDate: IsoDate | null
  healthScore: number
  risks: DealRisk[]
}

export async function fetchCarteira(vendor: string, hoje: IsoDate = todayBr()): Promise<CarteiraRow[]> {
  const { opportunities, activities } = await carregarCarteira(vendor)

  // Una sola pasada de indexación: nada de una query por oportunidad.
  const porOportunidade = new Map<number, Activity[]>()
  for (const a of activities) {
    const lista = porOportunidade.get(a.opportunity_id)
    if (lista) lista.push(a)
    else porOportunidade.set(a.opportunity_id, [a])
  }

  return opportunities
    .filter((o) => !o.outcome)
    .map((o) => {
      const suas = porOportunidade.get(o.id) ?? []
      return {
        opportunity: o,
        daysSinceContact: getDaysSinceLastContact(o.last_update, suas),
        nextAction: o.next_action,
        nextActionDate: o.next_action_date,
        healthScore: calculateHealthScore(o.scales),
        risks: detectRisks(o, suas, hoje),
      }
    })
    .sort((a, b) => (b.opportunity.value ?? 0) - (a.opportunity.value ?? 0))
}

export function useCarteira(vendor: string | null): UseQueryResult<CarteiraRow[]> {
  return useQuery({
    queryKey: queryKeys.carteira(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: async () => {
      const linhas = await fetchCarteira(vendor as string)
      revalidar(vendor)
      return linhas
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Hoje (Plano do Dia)
   ══════════════════════════════════════════════════════════════════════════ */

export interface PlanoDoDia {
  top: PlannedAction[]
  todas: PlannedAction[]
  restantes: number
  hoje: IsoDate
}

export async function fetchHoje(vendor: string, hoje: IsoDate = todayBr()): Promise<PlanoDoDia> {
  const carteira = await carregarCarteira(vendor)
  const resultado = rankDay({
    vendor,
    today: hoje,
    opportunities: carteira.opportunities,
    leads: carteira.leads,
    activities: carteira.activities,
    tasks: carteira.tasks,
    commitments: carteira.commitments,
    touchpoints: carteira.touchpoints,
    ...(carteira.vendor ? { vendorInfo: carteira.vendor } : {}),
  })
  return {
    top: resultado.top,
    todas: resultado.todas,
    restantes: resultado.restantes,
    hoje,
  }
}

export function useHoje(vendor: string | null, hoje: IsoDate = todayBr()): UseQueryResult<PlanoDoDia> {
  return useQuery({
    queryKey: queryKeys.plano(vendor ?? '', hoje),
    enabled: vendor !== null,
    queryFn: async () => {
      const plano = await fetchHoje(vendor as string, hoje)
      revalidar(vendor)
      return plano
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Dossiê
   ══════════════════════════════════════════════════════════════════════════ */

/** Todo lo que necesita el Dossiê, en UNA sola lectura. */
export interface DossieBundle {
  opportunity: Opportunity | null
  activities: Activity[]
  commitments: Commitment[]
  tasks: Task[]
  risks: DealRisk[]
  healthScore: number
  daysSinceContact: number
}

export async function fetchDossie(
  opportunityId: number,
  hoje: IsoDate = todayBr(),
): Promise<DossieBundle> {
  const db = getDb()
  const opportunity = (await db.opportunities.get(opportunityId)) ?? null
  const activities = await atividadesDaOportunidade(opportunityId, 100)

  if (!opportunity) {
    return {
      opportunity: null,
      activities,
      commitments: [],
      tasks: [],
      risks: [],
      healthScore: 0,
      daysSinceContact: 0,
    }
  }

  const [commitments, tasks] = await Promise.all([
    db.commitments.filter((c) => c.opportunity_id === opportunityId).toArray(),
    db.tasks.filter((t) => t.target.kind === 'opportunity' && t.target.id === opportunityId).toArray(),
  ])

  return {
    opportunity,
    activities,
    commitments,
    tasks,
    risks: detectRisks(opportunity, activities, hoje),
    healthScore: calculateHealthScore(opportunity.scales),
    daysSinceContact: getDaysSinceLastContact(opportunity.last_update, activities),
  }
}

export function useDossie(opportunityId: number | null): UseQueryResult<DossieBundle> {
  return useQuery({
    queryKey: queryKeys.dossie(opportunityId ?? -1),
    enabled: opportunityId !== null,
    queryFn: () => fetchDossie(opportunityId as number),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Cadência
   ══════════════════════════════════════════════════════════════════════════ */

export interface LinhaCadencia {
  lead: Lead
  /** Días de atraso del próximo toque. 0 = al día. */
  atraso: number
  touchpoints: Touchpoint[]
}

export async function fetchFilaCadencia(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<LinhaCadencia[]> {
  const { leads, touchpoints } = await carregarCarteira(vendor)

  const porLead = new Map<number, Touchpoint[]>()
  for (const tp of touchpoints) {
    const lista = porLead.get(tp.lead_id)
    if (lista) lista.push(tp)
    else porLead.set(tp.lead_id, [tp])
  }

  return leads
    .filter((l) => l.status === 'active')
    .map((lead) => ({
      lead,
      atraso: touchpointDelayDays(lead, hoje),
      touchpoints: (porLead.get(lead.id) ?? []).sort((a, b) =>
        a.executed_at.localeCompare(b.executed_at),
      ),
    }))
    .sort((a, b) => b.atraso - a.atraso || a.lead.id - b.lead.id)
}

export function useFilaCadencia(vendor: string | null): UseQueryResult<LinhaCadencia[]> {
  return useQuery({
    queryKey: queryKeys.cadencia(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: async () => {
      const fila = await fetchFilaCadencia(vendor as string)
      revalidar(vendor)
      return fila
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

export interface FilaGolden {
  /** La cola aprobada la víspera, si existe. */
  entradas: GoldenQueueEntry[]
  /** Los leads en el orden de la cola, listos para el modo foco. */
  leads: Lead[]
  /** true cuando la cola se derivó en el momento por no haber una aprobada. */
  derivada: boolean
}

export async function fetchGoldenQueue(
  vendor: string,
  day: IsoDate = todayBr(),
): Promise<FilaGolden> {
  const db = getDb()
  const entradas = await lerFilaGolden(vendor, day)

  if (entradas.length > 0) {
    const ids = entradas.map((e) => e.lead_id)
    const leads = await db.leads.where('id').anyOf(ids).toArray()
    const porId = new Map(leads.map((l) => [l.id, l]))
    const ordenados: Lead[] = []
    for (const e of entradas) {
      const lead = porId.get(e.lead_id)
      if (lead) ordenados.push(lead)
    }
    return { entradas, leads: ordenados, derivada: false }
  }

  // Sin cola aprobada: se deriva con el mismo criterio del planificador. El
  // vendedor nunca abre la Golden Hour y encuentra una pantalla vacía.
  const leads = await db.leads.where('vendor').equals(vendor).toArray()
  return { entradas: [], leads: buildGoldenQueue(leads, day), derivada: true }
}

export function useGoldenQueue(
  vendor: string | null,
  day: IsoDate = todayBr(),
): UseQueryResult<FilaGolden> {
  return useQuery({
    queryKey: queryKeys.goldenQueue(vendor ?? '', day),
    enabled: vendor !== null,
    queryFn: () => fetchGoldenQueue(vendor as string, day),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Anéis do dia
   ══════════════════════════════════════════════════════════════════════════ */

export interface AneisDoDia {
  aneis: Record<RingKey, RingProgress>
  fechado: boolean
  day: IsoDate
}

export async function fetchRings(
  vendor: string,
  day: IsoDate = todayBr(),
  metas?: Record<RingKey, number>,
): Promise<AneisDoDia> {
  const { activities, touchpoints } = await carregarCarteira(vendor)

  const doDia = activities.filter((a) => (a.activity_date ?? a.created_at ?? '').startsWith(day))
  const tpsDoDia = touchpoints.filter((t) => t.executed_at.startsWith(day))

  const aneis = metas
    ? computeRings(doDia, tpsDoDia, metas)
    : computeRings(doDia, tpsDoDia)
  const fechado =
    aneis.contato.ratio >= 1 && aneis.conversa.ratio >= 1 && aneis.avanco.ratio >= 1

  return { aneis, fechado, day }
}

export function useRings(
  vendor: string | null,
  day: IsoDate = todayBr(),
): UseQueryResult<AneisDoDia> {
  return useQuery({
    queryKey: queryKeys.rings(vendor ?? '', day),
    enabled: vendor !== null,
    queryFn: () => fetchRings(vendor as string, day),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Revisão do Ventus
   ══════════════════════════════════════════════════════════════════════════ */

export function chaveRevisao(vendor: string): string {
  return `revisao:${vendor}`
}

/**
 * Bandeja de propuestas de confianza media, aceptables o descartables POR
 * CAMPO. Se lee de Dexie: la propuesta tiene que poder revisarse sin red.
 *
 * TODO(F3): el llenado viene de public.ventus_actions cuando exista la tabla.
 */
export async function fetchRevisao(vendor: string): Promise<RevisaoItem[]> {
  return (await lerMeta<RevisaoItem[]>(chaveRevisao(vendor))) ?? []
}

export function useRevisao(vendor: string | null): UseQueryResult<RevisaoItem[]> {
  return useQuery({
    queryKey: queryKeys.revisao(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => fetchRevisao(vendor as string),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Vendedor
   ══════════════════════════════════════════════════════════════════════════ */

export async function fetchVendor(name: string): Promise<Vendor | null> {
  return (await getDb().vendors.where('name').equals(name).first()) ?? null
}

export function useVendor(name: string | null): UseQueryResult<Vendor | null> {
  return useQuery({
    queryKey: queryKeys.vendor(name ?? ''),
    enabled: name !== null,
    queryFn: () => fetchVendor(name as string),
  })
}

/** Busca en Dexie el vendedor ligado a un usuario de auth. Nunca toca la red. */
async function vendorLocalPorAuth(authUserId: string): Promise<Vendor | null> {
  const db = getDb()
  // auth_user_id está indexado; auth_id no, así que se resuelve con un filter.
  const porIndice = await db.vendors.where('auth_user_id').equals(authUserId).first()
  if (porIndice) return porIndice
  const porAuthId = await db.vendors.filter((v) => v.auth_id === authUserId).first()
  return porAuthId ?? null
}

/**
 * Resuelve QUÉ vendedor es el usuario logueado. Es el arranque de toda la app:
 * sin nombre de vendedor no hay cartera, no hay sync y no hay outbox.
 *
 * Dexie primero A PROPÓSITO: en el segundo arranque —y dentro del galpón, sin
 * señal— la identidad ya está en el dispositivo y la app abre igual. La red es
 * solo el camino del PRIMER login, y lo que trae se cachea para que no vuelva
 * a hacer falta.
 *
 * `auth_id` es la columna viva verificada contra producción; `auth_user_id`
 * es la columna vieja del v2, marcada para DROP. Se consulta como respaldo y
 * el error 42703 (columna inexistente) se traga a propósito: el día que se
 * borre, esta función sigue funcionando sin tocar nada.
 */
export async function resolverVendorDaSessao(authUserId: string): Promise<Vendor | null> {
  const local = await vendorLocalPorAuth(authUserId)
  if (local) return local
  if (!talvezOnline()) return null

  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('auth_id', authUserId)
    .limit(1)
  let filas = error ? [] : ((data ?? []) as Vendor[])

  if (filas.length === 0) {
    const respaldo = await supabase
      .from('vendors')
      .select('*')
      .eq('auth_user_id', authUserId)
      .limit(1)
    if (!respaldo.error) filas = (respaldo.data ?? []) as Vendor[]
  }

  const vendor = filas[0]
  if (!vendor) return null

  // Cachear para que el próximo arranque no dependa de la red.
  await getDb().vendors.put(vendor)
  return vendor
}

/** Timeline de un lead, para el Dossiê de cadencia. */
export async function fetchTouchpointsDoLead(leadId: number): Promise<Touchpoint[]> {
  return touchpointsDoLead(leadId)
}
