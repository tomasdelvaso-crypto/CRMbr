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
  daysBetween,
  detectRisks,
  getDaysSinceLastContact,
  getStageName,
  healthVerificado,
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
import { evidenciasDoDossie } from './dossie'
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
  /** Cuelgan de ['golden'] a propósito: registrar un toque las invalida solas. */
  goldenToques: (vendor: string, date: IsoDate, ids: string) =>
    ['golden', vendor, date, 'toques', ids] as const,
  goldenLeads: (ids: string) => ['golden', 'leads', ids] as const,
  rings: (vendor: string, date: IsoDate) => ['rings', vendor, date] as const,
  revisao: (vendor: string) => ['revisao', vendor] as const,
  placar: (vendor: string, week: IsoDate) => ['placar', vendor, week] as const,
  gestor: (week: IsoDate) => ['gestor', week] as const,
  notifications: (vendor: string) => ['notifications', vendor] as const,
  /** Oportunidades + leads vivos del vendedor, para el matcheo de Registrar. */
  alvosRegistro: (vendor: string) => ['carteira', vendor, 'alvos'] as const,
  /** Pool de oportunidades sem dono. NO cuelga de ['carteira']: no es de nadie. */
  pool: ['pool'] as const,
  /** Empresas del mapa de mercado asignadas y todavía sin lead. */
  mapa: (vendor: string) => ['cadencia', vendor, 'mapa'] as const,
  /** Aviso de colisión de empresa. Cuelga aparte: es efímero y por texto. */
  colisao: (vendor: string, nome: string) => ['colisao', vendor, nome] as const,
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
  /**
   * El health VERIFICADO: la misma media de 6 escalas, pero las que no tienen
   * cita cuentan 0. Es la mitad honesta del par y en escritorio se muestra al
   * lado del declarado —si el declarado está en 4,2 con el verificado en 0,8,
   * el negocio es una opinión.
   *
   * Se calcula acá y no en la fila porque la regla de esta pantalla es CERO
   * queries por fila: `evidenciasDoDossie(o)` sale del jsonb `scales` que ya
   * está en memoria, así que el par no cuesta ni una lectura extra. Sin el
   * historial local de movimientos puede quedar por DEBAJO del número de la
   * ficha —una prueba vieja que el jsonb ya perdió no se ve desde acá—, que
   * es el lado correcto para equivocarse en un número que existe para no
   * mentir.
   */
  healthVerificado: number
  risks: DealRisk[]
  /**
   * Compromisos ya vencidos que siguen en 'pending': la Smart View
   * «Compromisso sem veredicto». Se cuenta acá, en la MISMA pasada que arma la
   * fila, para que el tile no dispare una query por oportunidad.
   */
  compromissosSemVeredicto: number
  /**
   * Texto normalizado (minúsculas, sin acentos) sobre el que filtra el
   * buscador. Se calcula UNA vez por fila, no una vez por tecla: normalizar 65
   * cadenas en cada pulsación traba el teclado en un Android de gama media.
   */
  busca: string
}

export async function fetchCarteira(vendor: string, hoje: IsoDate = todayBr()): Promise<CarteiraRow[]> {
  const { opportunities, activities, commitments } = await carregarCarteira(vendor)

  // Una sola pasada de indexación: nada de una query por oportunidad.
  const porOportunidade = new Map<number, Activity[]>()
  for (const a of activities) {
    const lista = porOportunidade.get(a.opportunity_id)
    if (lista) lista.push(a)
    else porOportunidade.set(a.opportunity_id, [a])
  }

  // Compromisos vencidos y sin veredicto, contados en la misma pasada.
  const semVeredicto = new Map<number, number>()
  for (const c of commitments) {
    if (c.opportunity_id === null) continue
    if (c.status !== 'pending') continue
    const prazo = c.due_date ?? c.week_of
    if (prazo >= hoje) continue
    semVeredicto.set(c.opportunity_id, (semVeredicto.get(c.opportunity_id) ?? 0) + 1)
  }

  return opportunities
    .filter((o) => !o.outcome)
    .map((o) => {
      const suas = porOportunidade.get(o.id) ?? []
      const nome = o.name ?? ''
      const cliente = o.client ?? ''
      return {
        opportunity: o,
        daysSinceContact: getDaysSinceLastContact(o.last_update, suas),
        nextAction: o.next_action,
        nextActionDate: o.next_action_date,
        healthScore: calculateHealthScore(o.scales),
        healthVerificado: healthVerificado(o.scales, evidenciasDoDossie(o), hoje).verificado,
        risks: detectRisks(o, suas, hoje),
        compromissosSemVeredicto: semVeredicto.get(o.id) ?? 0,
        busca: normalizarBusca(
          `${nome} ${cliente} ${o.power_sponsor ?? ''} ${o.sponsor ?? ''} ${o.industry ?? ''}`,
        ),
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

/* ══════════════════════════════════════════════════════════════════════════
   Último toque por lead — el contexto que la Golden Hour muestra en el card
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El último touchpoint de cada lead, en UNA pasada por el store.
 *
 * El modo foco necesita, para cada contacto de la fila, qué se hizo la última
 * vez y con qué resultado. Pedirlo lead por lead serían 12 queries al abrir la
 * hora; acá es una sola consulta por rango de `lead_id` y una reducción en
 * memoria. Devuelve un objeto plano (no un Map) porque el persister de Dexie
 * serializa el cache y un Record sobrevive mejor a las idas y vueltas.
 */
export async function fetchUltimosToques(
  leadIds: readonly number[],
): Promise<Record<number, Touchpoint>> {
  if (leadIds.length === 0) return {}
  const linhas = await getDb()
    .touchpoints.where('lead_id')
    .anyOf(leadIds as number[])
    .toArray()

  const porLead: Record<number, Touchpoint> = {}
  for (const tp of linhas) {
    const atual = porLead[tp.lead_id]
    if (!atual || tp.executed_at > atual.executed_at) porLead[tp.lead_id] = tp
  }
  return porLead
}

export function useUltimosToques(
  vendor: string | null,
  leadIds: readonly number[],
  day: IsoDate = todayBr(),
): UseQueryResult<Record<number, Touchpoint>> {
  // Los ids entran en la clave: la fila se conoce después del primer render y
  // sin esto la query quedaría pegada al resultado vacío del arranque.
  const assinatura = leadIds.join(',')
  return useQuery({
    queryKey: queryKeys.goldenToques(vendor ?? '', day, assinatura),
    enabled: vendor !== null && leadIds.length > 0,
    queryFn: () => fetchUltimosToques(leadIds),
  })
}

/**
 * Los leads de una fila ya decidida, en el orden pedido.
 *
 * La Golden Hour congela su fila al arrancar y desde ahí lee por id: si
 * releyera la fila derivada, cada toque registrado movería el
 * `next_touchpoint_date` del lead y `buildGoldenQueue` reordenaría el carrusel
 * bajo el dedo del vendedor.
 */
export async function fetchLeadsPorIds(ids: readonly number[]): Promise<Lead[]> {
  if (ids.length === 0) return []
  const linhas = await getDb().leads.bulkGet(ids as number[])
  const encontrados: Lead[] = []
  for (const l of linhas) {
    if (l) encontrados.push(l)
  }
  return encontrados
}

export function useLeadsPorIds(ids: readonly number[]): UseQueryResult<Lead[]> {
  const assinatura = ids.join(',')
  return useQuery({
    queryKey: queryKeys.goldenLeads(assinatura),
    enabled: ids.length > 0,
    queryFn: () => fetchLeadsPorIds(ids),
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Alvos de registro (tela Registrar)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Una cosa sobre la que se puede registrar: una oportunidad o un lead.
 *
 * La tela Registrar necesita las DOS listas en un solo array —el vendedor
 * dicta «falei com o Marcelo» y no sabe (ni le importa) si eso es un lead del
 * funil o una oportunidad. El matcheo del servidor devuelve candidatos con
 * `kind`, y la desambiguación manual busca sobre este mismo array.
 *
 * `busca` viene pre-normalizado (minúsculas, sin acentos) porque filtrar 300
 * filas en cada tecla con normalize() por fila hace que el teclado se trabe en
 * un Android de gama media.
 */
export interface AlvoRegistro {
  kind: 'opportunity' | 'lead'
  id: number
  /** Nombre del negocio (oportunidad) o de la empresa (lead). */
  nome: string
  /** Empresa / cliente. Puede coincidir con `nome` en los leads. */
  cliente: string
  /** Etapa en PT-BR (oportunidad) o estado del funil (lead). */
  detalhe: string
  valor: number | null
  /** Días desde el último contacto. -1 cuando nunca hubo. */
  diasSemContato: number
  /** Toques ya ejecutados de la cadencia de 7. 0 en las oportunidades. */
  toques: number
  /** Texto normalizado sobre el que se filtra. */
  busca: string
}

/** Minúsculas y sin acentos: 'Tetra Pak Ltda.' → 'tetra pak ltda.'. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export async function fetchAlvosDeRegistro(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<AlvoRegistro[]> {
  const db = getDb()
  const { opportunities, activities } = await carregarCarteira(vendor)

  const ultimaAtividade = new Map<number, Activity[]>()
  for (const a of activities) {
    const lista = ultimaAtividade.get(a.opportunity_id)
    if (lista) lista.push(a)
    else ultimaAtividade.set(a.opportunity_id, [a])
  }

  const alvos: AlvoRegistro[] = []

  for (const o of opportunities) {
    if (o.outcome) continue
    const nome = o.name ?? o.client ?? `Oportunidade ${String(o.id)}`
    const cliente = o.client ?? nome
    alvos.push({
      kind: 'opportunity',
      id: o.id,
      nome,
      cliente,
      detalhe: getStageName(o.stage) || 'Sem etapa',
      valor: o.value,
      diasSemContato: getDaysSinceLastContact(o.last_update, ultimaAtividade.get(o.id) ?? []),
      toques: 0,
      busca: normalizarBusca(`${nome} ${cliente} ${o.power_sponsor ?? ''} ${o.sponsor ?? ''}`),
    })
  }

  // Leads vivos: los archivados no son un destino válido de registro.
  const leads = await db.leads.where('vendor').equals(vendor).toArray()
  for (const l of leads) {
    if (l.archived_at !== null || l.status === 'converted' || l.status === 'archived') continue
    const contato = l.contact_name ?? ''
    alvos.push({
      kind: 'lead',
      id: l.id,
      nome: l.company_name,
      cliente: l.company_name,
      detalhe: `Funil · toque ${String(l.touchpoints_count)}/7`,
      valor: null,
      diasSemContato:
        l.last_touchpoint_date === null
          ? -1
          : Math.max(0, daysBetween(l.last_touchpoint_date as IsoDate, hoje)),
      toques: l.touchpoints_count,
      busca: normalizarBusca(`${l.company_name} ${contato} ${l.contact_email ?? ''}`),
    })
  }

  return alvos
}

export function useAlvosDeRegistro(vendor: string | null): UseQueryResult<AlvoRegistro[]> {
  return useQuery({
    queryKey: queryKeys.alvosRegistro(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: async () => {
      const linhas = await fetchAlvosDeRegistro(vendor as string)
      revalidar(vendor)
      return linhas
    },
  })
}

/**
 * Filtra por texto. Puro y síncrono: se llama en cada tecla del buscador.
 * Prioriza el prefijo sobre el substring — quien escribe 'tet' espera
 * 'Tetra Pak' arriba, no 'Cartetec'.
 */
export function filtrarAlvos(
  alvos: readonly AlvoRegistro[],
  termo: string,
  limite = 24,
): AlvoRegistro[] {
  const q = normalizarBusca(termo)
  if (q === '') return alvos.slice(0, limite)
  const pontuados: Array<{ alvo: AlvoRegistro; peso: number }> = []
  for (const alvo of alvos) {
    const pos = alvo.busca.indexOf(q)
    if (pos < 0) continue
    pontuados.push({ alvo, peso: pos === 0 ? 0 : 1 })
  }
  pontuados.sort((a, b) => a.peso - b.peso || a.alvo.nome.localeCompare(b.alvo.nome, 'pt-BR'))
  return pontuados.slice(0, limite).map((p) => p.alvo)
}

/* ══════════════════════════════════════════════════════════════════════════
   Pool de oportunidades sem dono
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Oportunidades vivas que no tienen vendedor asignado.
 *
 * NO se guardan en Dexie a propósito. `conflicts.aplicarRemoto` es la única
 * puerta de entrada de datos del servidor, y estas filas no pasan por el pull
 * (que filtra por vendedor): meterlas a mano con un `put` abriría una segunda
 * puerta para el mismo tipo de dato. Como el resultado sí vive en el cache de
 * TanStack —y ese cache se persiste en Dexie—, el pool igual se ve offline
 * después de la primera vez que se abrió la Carteira con señal.
 *
 * Hoy en producción son CERO: la pantalla tiene que verse bien igual, así que
 * el pool es una sección plegable que no ocupa nada cuando está vacía.
 */
export async function fetchPoolSemDono(limite = 50): Promise<Opportunity[]> {
  if (!talvezOnline()) return []
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .is('vendor', null)
    .is('outcome', null)
    .order('value', { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) return []
  return (data ?? []) as Opportunity[]
}

export function usePoolSemDono(): UseQueryResult<Opportunity[]> {
  return useQuery({
    queryKey: queryKeys.pool,
    queryFn: () => fetchPoolSemDono(),
    // El pool cambia cuando alguien asume algo, no cada minuto.
    staleTime: 5 * 60_000,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Mapa de mercado — las empresas listas para volverse lead
   ══════════════════════════════════════════════════════════════════════════ */

/** Empresa del mapa de mercado, con lo mínimo para decidir si vale un toque. */
export interface EmpresaDoMapa {
  id: number
  company_name: string
  city: string | null
  uf: string | null
  sector: string | null
  target_line: string | null
  size_employees: number | null
  status: string
}

/** Por qué el mapa vino vacío. La pantalla dice cosas distintas en cada caso. */
export type MotivoMapaVazio = 'ok' | 'offline' | 'sem_acesso'

export interface MapaDeMercado {
  empresas: EmpresaDoMapa[]
  motivo: MotivoMapaVazio
}

/** Estados del barrido en los que la empresa todavía puede entrar como lead. */
const STATUS_PROMOVIVEIS = ['asignada', 'pool', 'en_barrido'] as const

/**
 * Empresas asignadas al vendedor que nunca entraron al CRM (`crm_lead_id`
 * null). Son 174 en producción y explican por qué tres vendedores tienen CERO
 * leads: nadie las trajo nunca a la cadencia.
 *
 * OJO — `market_sweep` tiene RLS habilitado y CERO policies, así que con el
 * JWT de un vendedor esta consulta devuelve 0 filas hasta que se apruebe la
 * policy `ms_select` de `0100_seguranca_rls_grants_views.sql`. Por eso el
 * resultado trae `motivo`: la pantalla distingue «no tenés empresas pendientes»
 * de «el mapa todavía no está liberado», que son mensajes muy distintos.
 */
export async function fetchMapaDeMercado(vendor: string, limite = 200): Promise<MapaDeMercado> {
  if (!talvezOnline()) return { empresas: [], motivo: 'offline' }

  const { data, error } = await supabase
    .from('market_sweep')
    .select('id, company_name, city, uf, sector, target_line, size_employees, status')
    .eq('vendor', vendor)
    .is('crm_lead_id', null)
    .in('status', STATUS_PROMOVIVEIS as unknown as string[])
    .order('company_name', { ascending: true })
    .limit(limite)

  if (error) return { empresas: [], motivo: 'sem_acesso' }
  const empresas = (data ?? []) as EmpresaDoMapa[]
  // Cero filas sin error es indistinguible de «RLS las escondió»: PostgREST
  // no devuelve error cuando una policy filtra todo. Se informa como falta de
  // acceso porque en producción hay 174 esperando, no cero.
  return { empresas, motivo: empresas.length === 0 ? 'sem_acesso' : 'ok' }
}

export function useMapaDeMercado(vendor: string | null): UseQueryResult<MapaDeMercado> {
  return useQuery({
    queryKey: queryKeys.mapa(vendor ?? ''),
    enabled: vendor !== null,
    queryFn: () => fetchMapaDeMercado(vendor as string),
    staleTime: 5 * 60_000,
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Colisão de empresa — advierte, no bloquea
   ══════════════════════════════════════════════════════════════════════════ */

export interface ColisaoEmpresa {
  colide: boolean
  /** Vendedor que ya tiene la empresa. null cuando no hay colisión. */
  dono: string | null
  /** De dónde salió la respuesta: Dexie funciona sin señal. */
  origem: 'local' | 'servidor'
}

const SEM_COLISAO: ColisaoEmpresa = { colide: false, dono: null, origem: 'local' }

/**
 * ¿Otro vendedor ya trabaja esta empresa?
 *
 * Primero mira la copia local (funciona en modo avión y responde en el mismo
 * frame), y solo si ahí está limpio pregunta a `check_company_collision`, que
 * ve la cartera de TODOS —incluido lo que este teléfono nunca sincronizó.
 *
 * Nunca lanza: un aviso que rompe el formulario es peor que no avisar. Y NUNCA
 * bloquea: dos vendedores en la misma planta es un problema de coordinación
 * humana, no algo que un CRM deba prohibir por su cuenta.
 */
export async function verificarColisaoEmpresa(
  nome: string,
  vendor: string,
): Promise<ColisaoEmpresa> {
  const alvo = normalizarBusca(nome)
  if (alvo.length < 3) return SEM_COLISAO

  const db = getDb()

  const lead = await db.leads
    .filter(
      (l) =>
        l.vendor !== vendor &&
        (l.status === 'active' || l.status === 'converted') &&
        normalizarBusca(l.company_name) === alvo,
    )
    .first()
  if (lead) return { colide: true, dono: lead.vendor, origem: 'local' }

  const opp = await db.opportunities
    .filter(
      (o) =>
        o.vendor !== null &&
        o.vendor !== vendor &&
        o.outcome !== 'lost' &&
        o.outcome !== 'abandoned' &&
        normalizarBusca(o.client ?? '') === alvo,
    )
    .first()
  if (opp) return { colide: true, dono: opp.vendor, origem: 'local' }

  if (!talvezOnline()) return SEM_COLISAO

  try {
    const { data, error } = await supabase.rpc('check_company_collision', {
      p_company_name: nome.trim(),
      p_vendor: vendor,
    })
    if (error) return SEM_COLISAO
    // La función devuelve TABLE(is_taken boolean, taken_by text): PostgREST la
    // entrega como array de una fila.
    const linhas = (Array.isArray(data) ? data : [data]) as Array<{
      is_taken: boolean | null
      taken_by: string | null
    } | null>
    const primeira = linhas[0]
    if (!primeira || primeira.is_taken !== true) return SEM_COLISAO
    return { colide: true, dono: primeira.taken_by, origem: 'servidor' }
  } catch {
    return SEM_COLISAO
  }
}

/**
 * Hook del aviso de colisión. `nome` tiene que llegar ya debounceado: cada
 * cambio de valor puede costar un round-trip.
 */
export function useColisaoEmpresa(
  nome: string,
  vendor: string | null,
): UseQueryResult<ColisaoEmpresa> {
  const limpo = nome.trim()
  return useQuery({
    queryKey: queryKeys.colisao(vendor ?? '', normalizarBusca(limpo)),
    enabled: vendor !== null && limpo.length >= 3,
    queryFn: () => verificarColisaoEmpresa(limpo, vendor as string),
    staleTime: 60_000,
    // Es un aviso, no un gate: si falla, la respuesta correcta es el silencio.
    retry: false,
  })
}
