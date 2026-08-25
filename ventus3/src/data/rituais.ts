// src/data/rituais.ts
// Los cuatro rituales: manhã, noite, segunda y sexta.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES REGLAS QUE NO SE NEGOCIAN
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NUNCA BLOQUEAN. Un ritual es una oferta, no un peaje. Se puede salir en
//    cualquier paso y no pasa nada: ni se pierde la racha, ni se marca nada,
//    ni Ventus lo menciona después. Un ritual que bloquea la app deja de ser
//    un hábito y pasa a ser un formulario, y los formularios se completan con
//    basura para poder seguir.
//
// 2. ≤ 20 SEGUNDOS Y ≤ 3 PANTALLAS. Todo lo que hace falta ya está calculado
//    y precargado: la manhã propone las 3 del planner, la segunda propone los
//    compromisos desde la cola, la sexta propone el veredicto cruzando lo
//    registrado. La persona confirma o corrige — no escribe de cero.
//
// 3. NO CREAN UNA ENTIDAD NUEVA. La manhã congela el MISMO plan del día que
//    lee la tela Hoje (`hoje:<vendor>:<dia>` en meta). Los compromisos de la
//    segunda son `tasks` de kind 'commitment', que es la entidad de primera
//    clase de M3 y ya sincroniza sola. Inventar una tabla paralela sería tener
//    dos verdades sobre el mismo día.
//
// Nota sobre por qué los compromisos son `tasks` y no filas de
// `public.commitments`: esa tabla es del v2 y NO tiene `client_uuid`. El
// outbox inyecta `client_uuid` en todo insert (es su anti-duplicado), así que
// un insert directo devolvería 42703 y la cola lo descartaría como permanente
// — perdiendo en silencio lo que la persona declaró. Las filas de
// `commitments` que YA existen sí se pueden actualizar (el veredicto de la
// sexta lo hace), porque un update no lleva client_uuid.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import {
  addDays,
  diasUteisEntre,
  ehDiaUtil,
  metasDaRampa,
  minutosDoDiaBRT,
  nomeCurtoDoDia,
  rankDay,
  todayBr,
  weekEnd,
  weekStart,
  weekdayBr,
  type Commitment,
  type CommitmentStatus,
  type EntityRef,
  type IsoDate,
  type MetasDosAneis,
  type PlannedAction,
  type Task,
} from '@/core'
import { carregarCarteira, getDb, gravarMeta, lerMeta } from './db'
import { criarTask } from './mutations'
import { enqueue, flush } from './outbox'
import { chaveEstadoDoDia, lerEstadoDoDia, type EstadoDoDia } from './plano-do-dia'
import { gravarCookbook, lerCookbookDaSemana } from './placar'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Vocabulario y ventanas
   ══════════════════════════════════════════════════════════════════════════ */

export type TipoRitual = 'manha' | 'noite' | 'segunda' | 'sexta'

export const RITUAIS: readonly TipoRitual[] = ['manha', 'noite', 'segunda', 'sexta']

export const ROTULO_DO_RITUAL: Readonly<Record<TipoRitual, string>> = {
  manha: 'Manhã',
  noite: 'Encerramento',
  segunda: 'Segunda',
  sexta: 'Sexta',
}

export const CHAMADA_DO_RITUAL: Readonly<Record<TipoRitual, string>> = {
  manha: 'Escolha suas 3 prioridades',
  noite: 'Como foi o dia?',
  segunda: 'Declare seus 3 compromissos',
  sexta: 'O veredicto da semana',
}

export const DURACAO_DO_RITUAL: Readonly<Record<TipoRitual, string>> = {
  manha: '20 segundos',
  noite: '20 segundos',
  segunda: '1 minuto',
  sexta: '40 segundos',
}

export interface JanelaDoRitual {
  /** Hora BRT a partir de la cual el ritual está en su momento. */
  desde: number | null
  /** Hora BRT hasta la cual sigue siendo «su» momento. */
  ate: number | null
  /** Día de la semana obligatorio (1 = segunda … 5 = sexta). null = todos. */
  diaDaSemana: number | null
  texto: string
}

/**
 * Las ventanas del PLANO, verbatim.
 *
 * Fuera de la ventana el ritual NO se bloquea: se puede abrir cuando se
 * quiera. La ventana solo decide cuál se ofrece primero y qué dice la línea
 * de tiempo. Cerrarle la puerta a alguien que quiere planear el día a las 11h
 * sería castigar exactamente la conducta que queremos.
 */
export const JANELAS_DOS_RITUAIS: Readonly<Record<TipoRitual, JanelaDoRitual>> = {
  manha: { desde: null, ate: 10, diaDaSemana: null, texto: 'antes das 10h' },
  noite: { desde: 18, ate: null, diaDaSemana: null, texto: 'a partir das 18h' },
  segunda: { desde: null, ate: null, diaDaSemana: 1, texto: 'segunda-feira' },
  sexta: { desde: 16, ate: null, diaDaSemana: 5, texto: 'sexta, a partir das 16h' },
}

export interface DisponibilidadeDoRitual {
  tipo: TipoRitual
  rotulo: string
  chamada: string
  duracao: string
  janela: string
  /** true cuando estamos dentro de su ventana natural. */
  noMomento: boolean
  /** true cuando ya se completó hoy (o esta semana, para segunda/sexta). */
  feito: boolean
  feitoEm: string | null
}

/**
 * El ritual que corresponde ahora, si alguno. Devuelve null fuera de toda
 * ventana: no hay nada que ofrecer y está bien — es la mayor parte del día.
 */
export function ritualDoMomento(
  hoje: IsoDate = todayBr(),
  agora: Date = new Date(),
): TipoRitual | null {
  const wd = weekdayBr(hoje)
  const hora = minutosDoDiaBRT(agora) / 60

  if (wd === 5 && hora >= 16) return 'sexta'
  if (hora >= 18 && ehDiaUtil(hoje)) return 'noite'
  if (wd === 1 && hora < 10) return 'segunda'
  if (hora < 10 && ehDiaUtil(hoje)) return 'manha'
  if (wd === 1) return 'segunda'
  return null
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Estado guardado
   ══════════════════════════════════════════════════════════════════════════ */

export interface EstadoRitual {
  vendor: string
  tipo: TipoRitual
  /** Día para manhã/noite; segunda-feira de la semana para segunda/sexta. */
  periodo: IsoDate
  feitoEm: string
  /** Pasos que llegó a completar. Salir antes NO es un fracaso: es un dato. */
  passos: number
}

export function chaveRitual(vendor: string, tipo: TipoRitual, periodo: IsoDate): string {
  return `ritual:${vendor}:${tipo}:${periodo}`
}

/** manhã y noite son del día; segunda y sexta, de la semana. */
export function periodoDoRitual(tipo: TipoRitual, hoje: IsoDate): IsoDate {
  return tipo === 'segunda' || tipo === 'sexta' ? weekStart(hoje) : hoje
}

export async function lerEstadoRitual(
  vendor: string,
  tipo: TipoRitual,
  hoje: IsoDate = todayBr(),
): Promise<EstadoRitual | null> {
  const guardado = await lerMeta<EstadoRitual>(chaveRitual(vendor, tipo, periodoDoRitual(tipo, hoje)))
  return guardado ?? null
}

export async function marcarRitualFeito(
  vendor: string,
  tipo: TipoRitual,
  hoje: IsoDate = todayBr(),
  passos = 0,
): Promise<EstadoRitual> {
  const periodo = periodoDoRitual(tipo, hoje)
  const estado: EstadoRitual = { vendor, tipo, periodo, feitoEm: new Date().toISOString(), passos }
  await gravarMeta(chaveRitual(vendor, tipo, periodo), estado)
  return estado
}

export async function fetchDisponibilidadeDosRituais(
  vendor: string,
  hoje: IsoDate = todayBr(),
  agora: Date = new Date(),
): Promise<DisponibilidadeDoRitual[]> {
  const wd = weekdayBr(hoje)
  const hora = minutosDoDiaBRT(agora) / 60

  const estados = await Promise.all(RITUAIS.map((t) => lerEstadoRitual(vendor, t, hoje)))

  return RITUAIS.map((tipo, i) => {
    const janela = JANELAS_DOS_RITUAIS[tipo]
    const diaOk = janela.diaDaSemana === null ? ehDiaUtil(hoje) : wd === janela.diaDaSemana
    const depois = janela.desde === null || hora >= janela.desde
    const antes = janela.ate === null || hora < janela.ate
    const estado = estados[i] ?? null
    return {
      tipo,
      rotulo: ROTULO_DO_RITUAL[tipo],
      chamada: CHAMADA_DO_RITUAL[tipo],
      duracao: DURACAO_DO_RITUAL[tipo],
      janela: janela.texto,
      noMomento: diaOk && depois && antes,
      feito: estado !== null,
      feitoEm: estado?.feitoEm ?? null,
    }
  })
}

export const chavesRituais = {
  disponibilidade: (vendor: string, dia: IsoDate) => ['plano', vendor, dia, 'rituais'] as const,
  manha: (vendor: string, dia: IsoDate) => ['plano', vendor, dia, 'ritual-manha'] as const,
  noite: (vendor: string, dia: IsoDate) => ['plano', vendor, dia, 'ritual-noite'] as const,
  semana: (vendor: string, semana: IsoDate) => ['plano', vendor, semana, 'ritual-semana'] as const,
}

export function useRituais(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<DisponibilidadeDoRitual[]> {
  return useQuery({
    queryKey: chavesRituais.disponibilidade(vendor ?? '', hoje),
    enabled: vendor !== null,
    queryFn: () => fetchDisponibilidadeDosRituais(vendor as string, hoje),
  })
}

export interface EntradaRitualFeito {
  vendor: string
  tipo: TipoRitual
  hoje: IsoDate
  passos?: number
}

export function useMarcarRitual(): UseMutationResult<EstadoRitual, Error, EntradaRitualFeito> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ vendor, tipo, hoje, passos }: EntradaRitualFeito) =>
      marcarRitualFeito(vendor, tipo, hoje, passos ?? 0),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plano'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · MANHÃ — escolher as 3 prioridades
   ══════════════════════════════════════════════════════════════════════════ */

export interface SugestaoDaManha {
  acao: PlannedAction
  /** true para las que el planner ya puso arriba: vienen premarcadas. */
  sugerida: boolean
}

export interface RitualDaManha {
  dia: IsoDate
  /** Hasta 8 candidatos, con los 3 del planner ya marcados. */
  candidatos: SugestaoDaManha[]
  /** Ids ya congelados. Si hay, el ritual es una revisión, no una elección. */
  jaFixados: string[]
  /**
   * Cuántas cosas suele cerrar por día hábil, de las últimas 4 semanas. Es el
   * insumo del aviso de sobrecarga — que NO es un reproche: es la diferencia
   * entre un plan y una lista de deseos.
   */
  mediaPorDia: number
  /** Semanas con dato real detrás de la media. 0 = no hay con qué avisar. */
  semanasMedidas: number
  fraseGoldenHour: string | null
  fraseSugerida: string
  carteiraVazia: boolean
}

/** El máximo del día. Tres, ni cuatro ni «las que haya». */
export const LIMITE_DE_PRIORIDADES = 3

/** Cuántos candidatos se ofrecen para elegir. Más que esto ya es la Carteira. */
const CANDIDATOS_DA_MANHA = 8

export async function fetchRitualDaManha(
  vendor: string,
  dia: IsoDate = todayBr(),
): Promise<RitualDaManha> {
  const carteira = await carregarCarteira(vendor)
  const plano = rankDay({
    vendor,
    today: dia,
    opportunities: carteira.opportunities,
    leads: carteira.leads,
    activities: carteira.activities,
    tasks: carteira.tasks,
    commitments: carteira.commitments,
    touchpoints: carteira.touchpoints,
    ...(carteira.vendor ? { vendorInfo: carteira.vendor } : {}),
  })

  const estado = await lerEstadoDoDia(vendor, dia)
  const jaFixados = estado?.ids ?? []
  const idsSugeridos = new Set(plano.top.map((a) => a.id))

  const candidatos: SugestaoDaManha[] = plano.todas
    .slice(0, CANDIDATOS_DA_MANHA)
    .map((acao) => ({ acao, sugerida: idsSugeridos.has(acao.id) }))

  const { media, semanas } = mediaDeEntregasPorDia(carteira.activities, carteira.touchpoints, dia)
  const cookbook = await lerCookbookDaSemana(vendor, dia)

  return {
    dia,
    candidatos,
    jaFixados,
    mediaPorDia: media,
    semanasMedidas: semanas,
    fraseGoldenHour: cookbook.fraseGoldenHour,
    fraseSugerida: frasePadraoDaGoldenHour(dia),
    carteiraVazia: carteira.opportunities.length === 0 && carteira.leads.length === 0,
  }
}

/**
 * Cuántas cosas cierra por día hábil, promedio de las 4 semanas anteriores.
 *
 * Se mide sobre lo REGISTRADO (actividades de contacto + toques), no sobre
 * tarjetas resueltas: el estado del día se poda y no hay histórico. Es una
 * aproximación honesta y se dice como tal en la pantalla.
 */
export function mediaDeEntregasPorDia(
  activities: ReadonlyArray<{ activity_date: string | null; created_at: string | null }>,
  touchpoints: ReadonlyArray<{ executed_at: string }>,
  hoje: IsoDate,
): { media: number; semanas: number } {
  const inicio = addDays(weekStart(hoje), -28)
  const fim = addDays(weekStart(hoje), -1)

  const dentro = (data: string): boolean => {
    const d = data.slice(0, 10)
    return d >= inicio && d <= fim
  }

  let n = 0
  for (const a of activities) {
    const data = a.activity_date ?? a.created_at ?? ''
    if (data !== '' && dentro(data)) n += 1
  }
  for (const t of touchpoints) if (dentro(t.executed_at)) n += 1

  const uteis = Math.max(1, diasUteisEntre(inicio, fim))
  if (n === 0) return { media: 0, semanas: 0 }
  return { media: Math.round((n / uteis) * 10) / 10, semanas: 4 }
}

/**
 * El aviso de sobrecarga. Nunca dice «você não vai conseguir»: dice el número
 * y devuelve la decisión. Con culpa, la persona elige menos para no sentirse
 * mal; con el dato, elige bien.
 */
export function avisoDeSobrecarga(
  escolhidas: number,
  mediaPorDia: number,
  semanasMedidas: number,
): string | null {
  if (semanasMedidas === 0 || mediaPorDia <= 0) return null
  if (escolhidas <= Math.ceil(mediaPorDia)) return null
  const media = mediaPorDia.toFixed(1).replace('.', ',')
  return `Nas últimas 4 semanas você fechou ${media} por dia útil. ${escolhidas} é uma semana boa — se hoje apertar, a terceira espera sem problema.`
}

/** La frase se-então por defecto, con el día de hoy adentro. */
export function frasePadraoDaGoldenHour(dia: IsoDate = todayBr()): string {
  return `Se são 16h de ${nomeCurtoDoDia(dia).toLowerCase()}, eu abro a Golden Hour com a lista da véspera.`
}

/**
 * Congela las prioridades elegidas. Escribe la MISMA llave que lee la tela
 * Hoje: elegir en el ritual y ver en Hoje tienen que ser el mismo plan, o el
 * ritual es teatro.
 *
 * Idempotente hacia arriba: si el día ya estaba congelado, respeta las
 * resoluciones ya anotadas y solo cambia los ids.
 */
export async function fixarPrioridadesDoDia(
  vendor: string,
  dia: IsoDate,
  ids: readonly string[],
): Promise<EstadoDoDia> {
  const anterior = await lerEstadoDoDia(vendor, dia)
  const novo: EstadoDoDia = {
    vendor,
    dia,
    fixadoEm: anterior?.fixadoEm ?? new Date().toISOString(),
    ids: [...ids].slice(0, LIMITE_DE_PRIORIDADES),
    resolucoes: (anterior?.resolucoes ?? []).filter((r) => ids.includes(r.acaoId)),
  }
  await gravarMeta(chaveEstadoDoDia(vendor, dia), novo)
  return novo
}

/** Guarda la frase se-então confirmada. Vive en el cookbook, con las metas. */
export async function confirmarFraseGoldenHour(vendor: string, frase: string): Promise<void> {
  const cookbook = await lerCookbookDaSemana(vendor)
  await gravarMeta(`jogo:cookbook:${vendor}`, {
    vendor,
    touches_per_week: cookbook.metasSemanais.contato,
    conversations_per_week: cookbook.metasSemanais.conversa,
    meetings_per_week: 1,
    advances_per_week: cookbook.metasSemanais.avanco,
    golden_hour_cue: frase.trim() === '' ? null : frase.trim(),
    golden_hour_days: [2, 3, 4, 5, 6],
    golden_hour_start: '16:00',
  })
}

export function useRitualDaManha(
  vendor: string | null,
  dia: IsoDate = todayBr(),
): UseQueryResult<RitualDaManha> {
  return useQuery({
    queryKey: chavesRituais.manha(vendor ?? '', dia),
    enabled: vendor !== null,
    queryFn: () => fetchRitualDaManha(vendor as string, dia),
  })
}

export interface EntradaPrioridades {
  vendor: string
  dia: IsoDate
  ids: string[]
  frase?: string | null
}

export function useFixarPrioridades(): UseMutationResult<EstadoDoDia, Error, EntradaPrioridades> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendor, dia, ids, frase }: EntradaPrioridades) => {
      const estado = await fixarPrioridadesDoDia(vendor, dia, ids)
      if (typeof frase === 'string') await confirmarFraseGoldenHour(vendor, frase)
      return estado
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plano'] })
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · SEGUNDA — declarar 3 compromissos escolhendo da fila
   ══════════════════════════════════════════════════════════════════════════ */

export interface CandidatoDeCompromisso {
  /** Id de la PlannedAction que lo originó. */
  id: string
  titulo: string
  cliente: string
  entidade: EntityRef
  /** La señal más fuerte del planner, para que la elección sea informada. */
  motivo: string
}

export interface RitualDaSegunda {
  semana: IsoDate
  fecha: IsoDate
  candidatos: CandidatoDeCompromisso[]
  /** Ya declarados esta semana. Si hay, el ritual muestra lo declarado. */
  declarados: Task[]
  /** Metas que el sistema propone desde el histórico. Se ajustan ±30 %. */
  proposta: MetasDosAneis
  /** Lo que hay hoy en el cookbook (o la rampa, si nunca se negoció). */
  atuais: MetasDosAneis
  origemDasMetas: 'negociado' | 'rampa'
  fraseGoldenHour: string | null
  fraseSugerida: string
  carteiraVazia: boolean
}

/** Cuántos compromisos se declaran. Tres: el mismo número que el día. */
export const LIMITE_DE_COMPROMISSOS = 3

export function chaveCompromissosDaSemana(vendor: string, semana: IsoDate): string {
  return `ritual:compromissos:${vendor}:${semana}`
}

export async function fetchRitualDaSegunda(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<RitualDaSegunda> {
  const semana = weekStart(hoje)
  const fecha = weekEnd(hoje)
  const carteira = await carregarCarteira(vendor)

  const plano = rankDay({
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

  const candidatos: CandidatoDeCompromisso[] = plano.todas.slice(0, 10).map((a) => ({
    id: a.id,
    titulo: a.acao,
    cliente: a.entidade.cliente,
    entidade: { kind: a.entidade.kind, id: a.entidade.id },
    motivo: a.porque[0] ? `${a.porque[0].sinal} — ${a.porque[0].detalhe}` : (a.prazo ?? ''),
  }))

  const ids = (await lerMeta<string[]>(chaveCompromissosDaSemana(vendor, semana))) ?? []
  const declarados = ids.length === 0 ? [] : await getDb().tasks.bulkGet(ids)

  const cookbook = await lerCookbookDaSemana(vendor, hoje)
  const { media } = mediaDeEntregasPorDia(carteira.activities, carteira.touchpoints, hoje)

  // La propuesta sale del histórico propio cuando lo hay, y de la rampa
  // cuando no. Victor Hugo y Andre usan mitades distintas del sistema: una
  // meta única sería injusta y se ignoraría.
  const rampa = metasDaRampa(cookbook.semanaDaRampa)
  const proposta: MetasDosAneis =
    media > 0
      ? {
          contato: Math.max(rampa.contato, Math.round(media * 5)),
          conversa: Math.max(rampa.conversa, Math.round(media)),
          avanco: rampa.avanco,
        }
      : rampa

  return {
    semana,
    fecha,
    candidatos,
    declarados: declarados.filter((t): t is Task => t !== undefined),
    proposta: { contato: proposta.contato * 5, conversa: proposta.conversa * 5, avanco: proposta.avanco * 5 },
    atuais: cookbook.metasSemanais,
    origemDasMetas: cookbook.origem,
    fraseGoldenHour: cookbook.fraseGoldenHour,
    fraseSugerida: frasePadraoDaGoldenHour(addDays(semana, 1)),
    carteiraVazia: carteira.opportunities.length === 0 && carteira.leads.length === 0,
  }
}

export interface EntradaCompromissos {
  vendor: string
  hoje: IsoDate
  escolhas: CandidatoDeCompromisso[]
  /** Metas semanales negociadas. Sin esto, el cookbook queda como estaba. */
  metas?: { proposta: MetasDosAneis; escolhida: MetasDosAneis }
  frase?: string | null
}

/**
 * Declara los compromisos de la semana.
 *
 * Cada uno nace como `task` de kind 'commitment' con vencimiento el viernes:
 * una tarea con fecha es la entidad que M3 pone de primera clase, sincroniza
 * sola por el outbox y ya aparece en la cola del día. Un compromiso sin fecha
 * es exactamente cómo el v2 llegó a 51 de 54 oportunidades sin próxima acción.
 */
export async function declararCompromissos(entrada: EntradaCompromissos): Promise<string[]> {
  const semana = weekStart(entrada.hoje)
  const vence = weekEnd(entrada.hoje)

  const ids: string[] = []
  for (const escolha of entrada.escolhas.slice(0, LIMITE_DE_COMPROMISSOS)) {
    const id = await criarTask({
      vendor: entrada.vendor,
      kind: 'commitment',
      target: escolha.entidade,
      title: escolha.titulo,
      dueDate: vence,
    })
    ids.push(id)
  }

  await gravarMeta(chaveCompromissosDaSemana(entrada.vendor, semana), ids)

  if (entrada.metas) {
    await gravarCookbook(
      entrada.vendor,
      entrada.metas.proposta,
      entrada.metas.escolhida,
      entrada.frase ?? null,
    )
  } else if (typeof entrada.frase === 'string') {
    await confirmarFraseGoldenHour(entrada.vendor, entrada.frase)
  }

  return ids
}

export function useRitualDaSegunda(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<RitualDaSegunda> {
  return useQuery({
    queryKey: chavesRituais.semana(vendor ?? '', weekStart(hoje)),
    enabled: vendor !== null,
    queryFn: () => fetchRitualDaSegunda(vendor as string, hoje),
  })
}

export function useDeclararCompromissos(): UseMutationResult<string[], Error, EntradaCompromissos> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: declararCompromissos,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plano'] })
      void queryClient.invalidateQueries({ queryKey: ['carteira'] })
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · SEXTA — o veredicto
   ══════════════════════════════════════════════════════════════════════════ */

export type Veredicto = 'cumprido' | 'parcial' | 'nao_rolou'

export const ROTULO_DO_VEREDICTO: Readonly<Record<Veredicto, string>> = {
  cumprido: 'Cumprido',
  parcial: 'Parcial',
  nao_rolou: 'Não rolou',
}

const STATUS_DO_VEREDICTO: Readonly<Record<Veredicto, CommitmentStatus>> = {
  cumprido: 'done',
  parcial: 'partial',
  nao_rolou: 'missed',
}

export interface ItemDoVeredicto {
  /** Id de la task (uuid) o del commitment del servidor (numérico en texto). */
  id: string
  origem: 'task' | 'commitment'
  titulo: string
  cliente: string
  /** Lo que Ventus propone, cruzando lo registrado contra lo declarado. */
  proposto: Veredicto
  /** Por qué lo propone. Con los hechos concretos, nunca «pelo histórico». */
  evidencia: string
  /** Lo ya registrado, si el veredicto ya se dio. */
  registrado: Veredicto | null
}

export interface RitualDaSexta {
  semana: IsoDate
  itens: ItemDoVeredicto[]
  /** true cuando no se declaró nada esta semana. No es una falta. */
  semCompromissos: boolean
}

export async function fetchRitualDaSexta(
  vendor: string,
  hoje: IsoDate = todayBr(),
): Promise<RitualDaSexta> {
  const semana = weekStart(hoje)
  const carteira = await carregarCarteira(vendor)

  const ids = (await lerMeta<string[]>(chaveCompromissosDaSemana(vendor, semana))) ?? []
  const tasks = ids.length === 0 ? [] : (await getDb().tasks.bulkGet(ids)).filter((t): t is Task => t !== undefined)
  const doServidor = carteira.commitments.filter((c) => c.week_of?.startsWith(semana))
  const registrados = (await lerMeta<Record<string, Veredicto>>(chaveVeredictos(vendor, semana))) ?? {}

  const nomeDe = (ref: EntityRef): string => {
    if (ref.kind === 'opportunity') {
      const opp = carteira.opportunities.find((o) => o.id === ref.id)
      return opp?.client ?? opp?.name ?? 'Cliente'
    }
    return carteira.leads.find((l) => l.id === ref.id)?.company_name ?? 'Lead'
  }

  const itens: ItemDoVeredicto[] = []

  for (const t of tasks) {
    const { proposto, evidencia } = proporVeredicto(t.target, semana, carteira)
    itens.push({
      id: t.id,
      origem: 'task',
      titulo: t.title,
      cliente: nomeDe(t.target),
      proposto: t.status === 'done' ? 'cumprido' : proposto,
      evidencia: t.status === 'done' ? 'Você já marcou esta como feita durante a semana.' : evidencia,
      registrado: registrados[t.id] ?? null,
    })
  }

  for (const c of doServidor) {
    const ref: EntityRef =
      c.opportunity_id !== null
        ? { kind: 'opportunity', id: c.opportunity_id }
        : { kind: 'lead', id: c.lead_id ?? 0 }
    const { proposto, evidencia } = proporVeredicto(ref, semana, carteira)
    itens.push({
      id: String(c.id),
      origem: 'commitment',
      titulo: c.committed_action,
      cliente: nomeDe(ref),
      proposto: c.status === 'done' ? 'cumprido' : proposto,
      evidencia,
      registrado: veredictoDoStatus(c),
    })
  }

  return { semana, itens, semCompromissos: itens.length === 0 }
}

type CarteiraLocal = Awaited<ReturnType<typeof carregarCarteira>>

/**
 * El veredicto propuesto sale de cruzar el compromiso contra lo que quedó
 * registrado en la semana. Ventus propone; la persona decide. Proponer mal y
 * que la persona corrija cuesta un tap; obligarla a recordar cuesta el ritual
 * entero.
 */
function proporVeredicto(
  ref: EntityRef,
  semana: IsoDate,
  carteira: CarteiraLocal,
): { proposto: Veredicto; evidencia: string } {
  const fim = addDays(semana, 6)
  const dentro = (data: string): boolean => {
    const d = data.slice(0, 10)
    return d >= semana && d <= fim
  }

  if (ref.kind === 'opportunity') {
    const acts = carteira.activities.filter(
      (a) => a.opportunity_id === ref.id && dentro(a.activity_date ?? a.created_at ?? ''),
    )
    if (acts.length === 0) {
      return {
        proposto: 'nao_rolou',
        evidencia: 'Não achei registro nesta conta durante a semana. Se aconteceu e não foi registrado, é só corrigir aqui.',
      }
    }
    const forte = acts.find(
      (a) => a.activity_type === 'meeting' || a.activity_type === 'stage_change' || a.result === 'positivo',
    )
    if (forte) {
      return {
        proposto: 'cumprido',
        evidencia: `${acts.length} registro(s) na semana, incluindo ${rotuloDeAtividade(forte.activity_type)}.`,
      }
    }
    return {
      proposto: 'parcial',
      evidencia: `${acts.length} registro(s) na semana, mas nenhum com resultado. Houve movimento — talvez não o que você combinou.`,
    }
  }

  const toques = carteira.touchpoints.filter((t) => t.lead_id === ref.id && dentro(t.executed_at))
  if (toques.length === 0) {
    return {
      proposto: 'nao_rolou',
      evidencia: 'Nenhum toque registrado neste lead na semana.',
    }
  }
  const respondeu = toques.some(
    (t) => t.result === 'interested' || t.result === 'meeting_scheduled' || t.result === 'not_interested',
  )
  return respondeu
    ? { proposto: 'cumprido', evidencia: `${toques.length} toque(s) e o cliente respondeu.` }
    : { proposto: 'parcial', evidencia: `${toques.length} toque(s) enviados, ainda sem resposta.` }
}

const ROTULOS_DE_ATIVIDADE: Readonly<Record<string, string>> = {
  meeting: 'uma reunião',
  call: 'uma ligação',
  whatsapp: 'um WhatsApp',
  email: 'um e-mail',
  stage_change: 'uma mudança de etapa',
  proposal: 'uma proposta',
  demo: 'uma demo',
  test: 'um teste',
  note: 'uma nota',
}

function rotuloDeAtividade(tipo: string): string {
  return ROTULOS_DE_ATIVIDADE[tipo] ?? 'um registro'
}

function veredictoDoStatus(c: Commitment): Veredicto | null {
  if (c.status === 'done') return 'cumprido'
  if (c.status === 'partial') return 'parcial'
  if (c.status === 'missed') return 'nao_rolou'
  return null
}

export function chaveVeredictos(vendor: string, semana: IsoDate): string {
  return `ritual:veredictos:${vendor}:${semana}`
}

export interface EntradaVeredicto {
  vendor: string
  hoje: IsoDate
  item: ItemDoVeredicto
  veredicto: Veredicto
  /** Lo que la persona quiera dejar dicho. Nunca obligatorio. */
  nota?: string
}

/**
 * Registra un veredicto.
 *
 * Para un `commitment` del servidor sale un UPDATE por el outbox — un update
 * no lleva `client_uuid`, así que no choca con el esquema del v2.
 * Para una `task` se marca el estado local y se guarda el veredicto en `meta`:
 * la task ya sincroniza sola por su propia mutación.
 */
export async function registrarVeredicto(entrada: EntradaVeredicto): Promise<void> {
  const semana = weekStart(entrada.hoje)
  const chave = chaveVeredictos(entrada.vendor, semana)
  const atuais = (await lerMeta<Record<string, Veredicto>>(chave)) ?? {}
  await gravarMeta(chave, { ...atuais, [entrada.item.id]: entrada.veredicto })

  if (entrada.item.origem === 'task') {
    const db = getDb()
    const task = await db.tasks.get(entrada.item.id)
    if (task) {
      const status = entrada.veredicto === 'cumprido' ? 'done' : 'dismissed'
      await db.tasks.put({ ...task, status })
      await enqueue({
        tabla: 'tasks',
        op: 'update',
        row_id: entrada.item.id,
        campos_tocados: ['status'],
        payload: { status },
      })
      void flush().catch(() => undefined)
    }
    return
  }

  const id = Number(entrada.item.id)
  if (!Number.isFinite(id)) return
  const status = STATUS_DO_VEREDICTO[entrada.veredicto]
  const avaliadoEm = new Date().toISOString()

  const db = getDb()
  const linha = await db.commitments.get(id)
  if (linha) {
    await db.commitments.put({
      ...linha,
      status,
      verdict_notes: entrada.nota ?? linha.verdict_notes,
      evaluated_at: avaliadoEm,
    })
  }

  await enqueue({
    tabla: 'commitments',
    op: 'update',
    row_id: id,
    campos_tocados: ['status', 'verdict_notes', 'evaluated_at'],
    payload: {
      status,
      ...(entrada.nota ? { verdict_notes: entrada.nota } : {}),
      evaluated_at: avaliadoEm,
    },
  })
  void flush().catch(() => undefined)
}

export function useRitualDaSexta(
  vendor: string | null,
  hoje: IsoDate = todayBr(),
): UseQueryResult<RitualDaSexta> {
  return useQuery({
    queryKey: [...chavesRituais.semana(vendor ?? '', weekStart(hoje)), 'sexta'] as const,
    enabled: vendor !== null,
    queryFn: () => fetchRitualDaSexta(vendor as string, hoje),
  })
}

export function useRegistrarVeredicto(): UseMutationResult<void, Error, EntradaVeredicto> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: registrarVeredicto,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plano'] })
      void queryClient.invalidateQueries({ queryKey: ['placar'] })
    },
  })
}
