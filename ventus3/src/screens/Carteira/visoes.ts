// src/screens/Carteira/visoes.ts
// Las 6 Smart Views y el filtrado de la Carteira. Todo puro y síncrono: se
// ejecuta en cada tecla del buscador y en cada tap de un tile, sobre las 65
// filas que ya están en memoria. Ni una query acá dentro.
//
// Vive separado de los componentes porque el fast refresh se rompe cuando un
// archivo exporta componentes Y constantes sueltas.

import {
  AlarmClock,
  CalendarX2,
  ClipboardCheck,
  Lock,
  MoonStar,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { getStageName, todayBr, type IsoDate, type StageId } from '@/core'
import type { CarteiraRow } from '@/data'
import type { Tone } from '@/ui'

/* ══════════════════════════════════════════════════════════════════════════
   Smart Views
   ══════════════════════════════════════════════════════════════════════════ */

export type ChaveVisao =
  | 'sem_toque'
  | 'gate_travado'
  | 'cadencia_atrasada'
  | 'sem_data'
  | 'fecha_no_mes'
  | 'sem_veredicto'

export interface DefinicaoVisao {
  chave: ChaveVisao
  /** Rótulo completo. Va en el chip del filtro activo y en el lector de pantalla. */
  rotulo: string
  /**
   * Rótulo del tile. Los 6 tiles van en 3 columnas y no en 2: en un teléfono
   * de 360px, dos columnas se comen 220px de alto y dejan la lista —que es lo
   * que se vino a mirar— en cuatro filas y media.
   */
  rotuloCurto: string
  /** Qué significa el número. Se lee al tocar «por quê». */
  explicacao: string
  tone: Tone
  icone: LucideIcon
  /**
   * `lista` filtra la lista de abajo. `rota` lleva a otra pantalla: la
   * cadencia no vive en la Carteira y duplicarla acá sería mentir sobre dónde
   * se trabaja el funil.
   */
  destino: 'lista' | 'rota'
  rota?: string
}

/** Días de silencio a partir de los cuales la oportunidad entra en la vista. */
export const DIAS_SEM_TOQUE = 15

export const VISOES: readonly DefinicaoVisao[] = [
  {
    chave: 'sem_toque',
    rotuloCurto: 'Sem toque 15+d',
    rotulo: `Sem toque há ${String(DIAS_SEM_TOQUE)}+ dias`,
    explicacao:
      'Oportunidades vivas sem nenhuma atividade registrada nos últimos 15 dias. Silêncio comprado é silêncio que custa.',
    tone: 'atencao',
    icone: MoonStar,
    destino: 'lista',
  },
  {
    chave: 'gate_travado',
    rotuloCurto: 'Gate travado',
    rotulo: 'Gate travado',
    explicacao:
      'A etapa está acima do que as escalas PPVVCC permitem. O negócio parece mais adiantado do que está.',
    tone: 'perigo',
    icone: Lock,
    destino: 'lista',
  },
  {
    chave: 'cadencia_atrasada',
    rotuloCurto: 'TP atrasado',
    rotulo: 'TP de cadência atrasado',
    explicacao:
      'Leads do funil 1A–1D com o próximo toque vencido. Abre a Cadência, que é onde esse trabalho acontece.',
    tone: 'info',
    icone: AlarmClock,
    destino: 'rota',
    rota: '/cadencia',
  },
  {
    chave: 'sem_data',
    rotuloCurto: 'Sem data',
    rotulo: 'Sem próxima ação com data',
    explicacao:
      'Sem data, a oportunidade é invisível para o Hoje. São 51 de 54 assim na base atual.',
    tone: 'marca',
    icone: CalendarX2,
    destino: 'lista',
  },
  {
    chave: 'fecha_no_mes',
    rotuloCurto: 'Fecha no mês',
    rotulo: 'Fechamento este mês',
    explicacao: 'Previsão de fechamento dentro do mês corrente.',
    tone: 'destaque',
    icone: Target,
    destino: 'lista',
  },
  {
    chave: 'sem_veredicto',
    rotuloCurto: 'Sem veredicto',
    rotulo: 'Compromisso sem veredicto',
    explicacao:
      'Compromisso da semana já vencido e ainda sem «cumpri / não cumpri». Sem veredicto, o compromisso não ensina nada.',
    tone: 'atencao',
    icone: ClipboardCheck,
    destino: 'lista',
  },
]

/** ¿Esta fila entra en esa vista? La vista de cadencia nunca: no es de la cartera. */
export function combinaVisao(chave: ChaveVisao, linha: CarteiraRow, hoje: IsoDate): boolean {
  switch (chave) {
    case 'sem_toque':
      return linha.daysSinceContact >= DIAS_SEM_TOQUE
    case 'gate_travado':
      return linha.risks.some((r) => r.code === 'false_gate')
    case 'sem_data':
      return linha.nextActionDate === null
    case 'fecha_no_mes': {
      const prazo = linha.opportunity.expected_close
      return prazo !== null && prazo.slice(0, 7) === hoje.slice(0, 7)
    }
    case 'sem_veredicto':
      return linha.compromissosSemVeredicto > 0
    case 'cadencia_atrasada':
      return false
  }
}

export type ContagemVisoes = Record<ChaveVisao, number>

/**
 * Cuenta las 6 vistas en UNA pasada por las filas.
 * `leadsAtrasados` entra por parámetro porque sale de la fila de cadencia, que
 * ya está en el cache: contarlo acá obligaría a esta función a leer leads.
 */
export function contarVisoes(
  linhas: readonly CarteiraRow[],
  leadsAtrasados: number,
  hoje: IsoDate = todayBr(),
): ContagemVisoes {
  const contagem: ContagemVisoes = {
    sem_toque: 0,
    gate_travado: 0,
    cadencia_atrasada: leadsAtrasados,
    sem_data: 0,
    fecha_no_mes: 0,
    sem_veredicto: 0,
  }
  for (const linha of linhas) {
    if (combinaVisao('sem_toque', linha, hoje)) contagem.sem_toque += 1
    if (combinaVisao('gate_travado', linha, hoje)) contagem.gate_travado += 1
    if (combinaVisao('sem_data', linha, hoje)) contagem.sem_data += 1
    if (combinaVisao('fecha_no_mes', linha, hoje)) contagem.fecha_no_mes += 1
    if (combinaVisao('sem_veredicto', linha, hoje)) contagem.sem_veredicto += 1
  }
  return contagem
}

/* ══════════════════════════════════════════════════════════════════════════
   Filtros
   ══════════════════════════════════════════════════════════════════════════ */

export type OrdemCarteira = 'valor' | 'silencio' | 'saude' | 'fechamento'

export const ORDEM_LABELS: Readonly<Record<OrdemCarteira, string>> = {
  valor: 'Maior valor',
  silencio: 'Mais tempo em silêncio',
  saude: 'Saúde mais baixa',
  fechamento: 'Fechamento mais próximo',
}

export type FiltroRisco = 'todos' | 'critico' | 'atencao'

export const RISCO_LABELS: Readonly<Record<FiltroRisco, string>> = {
  todos: 'Todos os riscos',
  critico: 'Só crítico',
  atencao: 'Atenção ou pior',
}

export interface FiltrosCarteira {
  /** Smart View activa. null = la cartera entera. */
  visao: ChaveVisao | null
  /** Etapas 1..6 seleccionadas. Vacío = todas. */
  etapas: StageId[]
  risco: FiltroRisco
  ordem: OrdemCarteira
}

export const FILTROS_PADRAO: FiltrosCarteira = {
  visao: null,
  etapas: [],
  risco: 'todos',
  ordem: 'valor',
}

/** ¿Hay algo puesto además del orden por defecto? */
export function temFiltroAtivo(f: FiltrosCarteira): boolean {
  return f.visao !== null || f.etapas.length > 0 || f.risco !== 'todos' || f.ordem !== 'valor'
}

/** Nivel de riesgo de la fila, derivado de las señales que ya trae. */
export function nivelDeRisco(linha: CarteiraRow): 'ok' | 'atencao' | 'critico' {
  let aviso = false
  for (const r of linha.risks) {
    if (r.severity === 'critical') return 'critico'
    if (r.severity === 'warning') aviso = true
  }
  return aviso ? 'atencao' : 'ok'
}

export const TOM_DO_RISCO: Readonly<Record<'ok' | 'atencao' | 'critico', Tone>> = {
  ok: 'ok',
  atencao: 'atencao',
  critico: 'perigo',
}

function chaveDeOrdem(linha: CarteiraRow, ordem: OrdemCarteira): number {
  switch (ordem) {
    case 'valor':
      return -(linha.opportunity.value ?? 0)
    case 'silencio':
      return -linha.daysSinceContact
    case 'saude':
      return linha.healthScore
    case 'fechamento': {
      const prazo = linha.opportunity.expected_close
      // Sin fecha al final: no es que cierre mañana, es que nadie la puso.
      return prazo === null ? Number.MAX_SAFE_INTEGER : Number(prazo.replaceAll('-', ''))
    }
  }
}

/**
 * Aplica vista + filtros + búsqueda + orden. Devuelve un array nuevo.
 * `busca` llega ya normalizada (minúsculas, sin acentos) y ya debounceada.
 */
export function aplicarFiltros(
  linhas: readonly CarteiraRow[],
  filtros: FiltrosCarteira,
  busca: string,
  hoje: IsoDate = todayBr(),
): CarteiraRow[] {
  const etapas = new Set<number>(filtros.etapas)

  const filtradas = linhas.filter((linha) => {
    if (filtros.visao !== null && !combinaVisao(filtros.visao, linha, hoje)) return false
    if (etapas.size > 0 && !etapas.has(linha.opportunity.stage ?? 0)) return false
    if (filtros.risco !== 'todos') {
      const nivel = nivelDeRisco(linha)
      if (filtros.risco === 'critico' && nivel !== 'critico') return false
      if (filtros.risco === 'atencao' && nivel === 'ok') return false
    }
    if (busca !== '' && !linha.busca.includes(busca)) return false
    return true
  })

  return filtradas.sort(
    (a, b) =>
      chaveDeOrdem(a, filtros.ordem) - chaveDeOrdem(b, filtros.ordem) ||
      a.opportunity.id - b.opportunity.id,
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Chips de filtros activos
   ══════════════════════════════════════════════════════════════════════════ */

export interface ChipAtivo {
  id: string
  rotulo: string
  /** Los filtros que quedan al sacar este chip. */
  aoRemover: FiltrosCarteira
}

/** Los chips que se muestran bajo el buscador, con lo que hace cada «x». */
export function chipsAtivos(f: FiltrosCarteira): ChipAtivo[] {
  const chips: ChipAtivo[] = []

  if (f.visao !== null) {
    const def = VISOES.find((v) => v.chave === f.visao)
    chips.push({
      id: `visao:${f.visao}`,
      rotulo: def?.rotulo ?? 'Visão',
      aoRemover: { ...f, visao: null },
    })
  }

  for (const etapa of f.etapas) {
    chips.push({
      id: `etapa:${String(etapa)}`,
      rotulo: getStageName(etapa) || `Etapa ${String(etapa)}`,
      aoRemover: { ...f, etapas: f.etapas.filter((e) => e !== etapa) },
    })
  }

  if (f.risco !== 'todos') {
    chips.push({
      id: `risco:${f.risco}`,
      rotulo: RISCO_LABELS[f.risco],
      aoRemover: { ...f, risco: 'todos' },
    })
  }

  if (f.ordem !== 'valor') {
    chips.push({
      id: `ordem:${f.ordem}`,
      rotulo: ORDEM_LABELS[f.ordem],
      aoRemover: { ...f, ordem: 'valor' },
    })
  }

  return chips
}

/* ══════════════════════════════════════════════════════════════════════════
   Persistencia
   ══════════════════════════════════════════════════════════════════════════ */

const CHAVE_ARMAZENAMENTO = 'ventus.carteira.filtros.v1'

/**
 * Los filtros sobreviven al cambio de pantalla y al reload.
 * Es la diferencia entre «triar la cartera» y «volver a armar el filtro cada
 * vez que abro el Dossiê de una y vuelvo».
 */
export function lerFiltrosSalvos(): FiltrosCarteira {
  if (typeof localStorage === 'undefined') return FILTROS_PADRAO
  try {
    const cru = localStorage.getItem(CHAVE_ARMAZENAMENTO)
    if (cru === null) return FILTROS_PADRAO
    const bruto = JSON.parse(cru) as Partial<FiltrosCarteira>
    const chaves = new Set<string>(VISOES.map((v) => v.chave))
    return {
      visao:
        typeof bruto.visao === 'string' && chaves.has(bruto.visao)
          ? (bruto.visao as ChaveVisao)
          : null,
      etapas: Array.isArray(bruto.etapas)
        ? bruto.etapas.filter((e): e is StageId => typeof e === 'number' && e >= 1 && e <= 6)
        : [],
      risco:
        bruto.risco === 'critico' || bruto.risco === 'atencao' || bruto.risco === 'todos'
          ? bruto.risco
          : 'todos',
      ordem:
        bruto.ordem === 'silencio' || bruto.ordem === 'saude' || bruto.ordem === 'fechamento'
          ? bruto.ordem
          : 'valor',
    }
  } catch {
    // Un localStorage corrupto o bloqueado (Safari en modo privado) no puede
    // impedir que la Carteira abra.
    return FILTROS_PADRAO
  }
}

export function salvarFiltros(f: FiltrosCarteira): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(f))
  } catch {
    // Cuota llena o storage bloqueado: se pierde la persistencia, no la sesión.
  }
}
