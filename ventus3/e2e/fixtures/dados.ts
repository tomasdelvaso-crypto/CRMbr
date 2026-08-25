// e2e/fixtures/dados.ts
// La semilla del QA: una cartera completa, plausible y DETERMINÍSTICA.
//
// Nada de esto toca la base de producción. Los objetos de acá se serializan y
// se escriben en el IndexedDB del navegador de prueba (ver `semear()` en
// app.ts). El dev server que corre bajo Playwright apunta a un host Supabase
// inexistente (`stub.supabase.test`), interceptado por `page.route`, así que
// aunque un módulo intentara salir a la red no habría a dónde ir.
//
// Las fechas son relativas a HOY en America/São_Paulo: el planner puntúa por
// días de silencio y una semilla con fechas fijas dejaría de rankear igual la
// semana que viene.

import type {
  Commitment,
  IsoDate,
  Lead,
  Opportunity,
  ScalesRecord,
  StageId,
  Task,
  Vendor,
} from '@/core'

/* ══════════════════════════════════════════════════════════════════════════
   Fechas
   ══════════════════════════════════════════════════════════════════════════ */

/** Hoy en America/São_Paulo, que es el único hoy que la app conoce. */
export function hojeBrt(): IsoDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()) as IsoDate
}

/** Un día civil desplazado. Ancla al mediodía UTC, igual que `@/core/dates`. */
export function diasAtras(dias: number, desde: IsoDate = hojeBrt()): IsoDate {
  const base = new Date(`${desde}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() - dias)
  return base.toISOString().slice(0, 10) as IsoDate
}

export function diasAdiante(dias: number, desde: IsoDate = hojeBrt()): IsoDate {
  return diasAtras(-dias, desde)
}

/* ══════════════════════════════════════════════════════════════════════════
   Constructores
   ══════════════════════════════════════════════════════════════════════════ */

export const VENDEDOR = 'Renata'
export const AUTH_USER_ID = 'e2e-user-renata'

export function vendedor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    name: VENDEDOR,
    email: 'renata@ventapel.com.br',
    role: 'vendedor',
    phone: null,
    is_admin: false,
    is_active: true,
    monthly_target: null,
    auth_user_id: AUTH_USER_ID,
    auth_id: AUTH_USER_ID,
    telegram_id: null,
    telegram_username: null,
    created_at: '2026-01-01T12:00:00Z',
    ...over,
  }
}

export function escalas(v: Partial<Record<keyof ScalesRecord, number>>): ScalesRecord {
  const out: ScalesRecord = {}
  for (const [k, n] of Object.entries(v)) {
    out[k as keyof ScalesRecord] = { score: n as number, description: '' }
  }
  return out
}

export function oportunidade(over: Partial<Opportunity> & { id: number }): Opportunity {
  return {
    created_at: '2026-01-10T12:00:00Z',
    name: 'Fechamento de caixas',
    client: 'Cliente Teste',
    vendor: VENDEDOR,
    value: 80_000,
    stage: 3 as StageId,
    priority: 'media',
    expected_close: null,
    next_action: null,
    next_action_date: null,
    product: null,
    product_lines: null,
    power_sponsor: null,
    sponsor: 'Marcelo',
    influencer: null,
    support_contact: null,
    probability: null,
    last_update: null,
    last_activity_date: null,
    scales: escalas({ dor: 5, poder: 4, visao: 5, valor: 4, controle: 3, compras: 2 }),
    health_score: null,
    is_stalled: null,
    industry: null,
    loss_reason: null,
    outcome: null,
    outcome_notes: null,
    updated_at: null,
    ...over,
  }
}

export function leadDeCadencia(over: Partial<Lead> & { id: number }): Lead {
  return {
    vendor: VENDEDOR,
    source: 'market_sweep',
    company_name: 'Embalagens Vale',
    company_domain: null,
    contact_name: 'Ana Souza',
    contact_title: 'Gerente de Logística',
    contact_email: 'ana@vale.com.br',
    contact_phone: '(11) 98765-4321',
    contact_whatsapp: null,
    contact_linkedin: null,
    active_channels: null,
    stage: '1b',
    status: 'active',
    touchpoints_count: 2,
    next_touchpoint_date: diasAtras(3),
    last_touchpoint_date: diasAtras(6),
    opportunity_id: null,
    notes: null,
    archived_at: null,
    recycle_after: null,
    created_at: '2026-02-01T12:00:00Z',
    updated_at: '2026-02-01T12:00:00Z',
    ...over,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   La semilla
   ══════════════════════════════════════════════════════════════════════════ */

export interface Semente {
  vendors: Vendor[]
  opportunities: Opportunity[]
  leads: Lead[]
  tasks: Task[]
  commitments: Commitment[]
}

/**
 * Cinco oportunidades atrasadas (más de las 3 que caben en el día, para que
 * el freeze tenga algo que dejar afuera) y cuatro leads con el toque vencido
 * (la fila de la Golden Hour se deriva sola de ahí).
 *
 * Los valores y los silencios están escalonados a propósito: el planner
 * puntúa el valor en logarítmico y aplana el silencio a los 45 días, así que
 * cinco negocios idénticos darían un orden arbitrario y el test sería frágil.
 */
export function sementePadrao(): Semente {
  return {
    vendors: [vendedor()],
    opportunities: [
      oportunidade({
        id: 101,
        client: 'Tetra Pak',
        name: 'Linha 3 — fita e selagem',
        value: 320_000,
        stage: 3 as StageId,
        last_update: `${diasAtras(38)}T12:00:00Z`,
        last_activity_date: diasAtras(38),
      }),
      oportunidade({
        id: 102,
        client: 'Ambev',
        name: 'CD Guarulhos — caixa violada',
        value: 180_000,
        stage: 4 as StageId,
        last_update: `${diasAtras(26)}T12:00:00Z`,
        last_activity_date: diasAtras(26),
      }),
      oportunidade({
        id: 103,
        client: 'Natura',
        name: 'E-commerce — fechamento automático',
        value: 95_000,
        stage: 2 as StageId,
        last_update: `${diasAtras(19)}T12:00:00Z`,
        last_activity_date: diasAtras(19),
      }),
      oportunidade({
        id: 104,
        client: 'Suzano',
        name: 'Expedição — teste de fita',
        value: 60_000,
        stage: 2 as StageId,
        last_update: `${diasAtras(12)}T12:00:00Z`,
        last_activity_date: diasAtras(12),
      }),
      oportunidade({
        id: 105,
        client: 'Klabin',
        name: 'Paletização — troca de insumo',
        value: 40_000,
        stage: 1 as StageId,
        last_update: `${diasAtras(9)}T12:00:00Z`,
        last_activity_date: diasAtras(9),
      }),
    ],
    leads: [
      leadDeCadencia({
        id: 201,
        company_name: 'Embalagens Vale',
        contact_name: 'Ana Souza',
        touchpoints_count: 2,
        next_touchpoint_date: diasAtras(4),
        last_touchpoint_date: diasAtras(9),
      }),
      leadDeCadencia({
        id: 202,
        company_name: 'Distribuidora Norte',
        contact_name: 'Paulo Ribeiro',
        contact_title: 'Compras',
        touchpoints_count: 1,
        next_touchpoint_date: diasAtras(2),
        last_touchpoint_date: diasAtras(7),
      }),
      leadDeCadencia({
        id: 203,
        company_name: 'Frigorífico Sul',
        contact_name: 'Carla Menezes',
        contact_title: 'Diretora de Operações',
        touchpoints_count: 3,
        next_touchpoint_date: diasAtras(1),
        last_touchpoint_date: diasAtras(5),
      }),
      leadDeCadencia({
        id: 204,
        company_name: 'Cosmético Bela',
        contact_name: 'Rogério Lima',
        contact_title: 'Logística',
        touchpoints_count: 0,
        next_touchpoint_date: hojeBrt(),
        last_touchpoint_date: null,
      }),
    ],
    tasks: [],
    commitments: [],
  }
}

/** Semilla vacía: la cartera que todavía no bajó. */
export function sementeVazia(): Semente {
  return { vendors: [vendedor()], opportunities: [], leads: [], tasks: [], commitments: [] }
}
