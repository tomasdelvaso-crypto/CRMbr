// src/core/ppvvcc.ts
// Port tipado de /home/user/CRMbr/api/_lib/ppvvcc.js — fuente única de verdad
// de la metodología PPVVCC. Los catálogos están portados verbatim del v2: si
// cambia un nivel acá tiene que cambiar también en api/_lib/ppvvcc.js y en el
// bot, o el equipo va a ver dos números distintos para el mismo negocio.
//
// Cero red, cero DOM, cero dependencias: esto corre igual en el navegador
// offline, en una función de Vercel y en el bot de Telegram.

import type {
  Evidence,
  GateCheck,
  GateFaltante,
  HealthVerificado,
  IsoDate,
  ProductLine,
  ScaleDefinition,
  ScaleKey,
  ScaleScores,
  ScalesRecord,
  ScaleValue,
  Stage,
  StageGate,
  StageId,
  StageName,
} from './types.js'
import { daysBetween, todayBr } from './dates.js'

/* ── Catálogos (portados del v2, no tocar sin cambiar también el bot) ────── */

export const SCALE_KEYS = ['dor', 'poder', 'visao', 'valor', 'controle', 'compras'] as const

/** Aliases legados en inglés que pueden existir en registros antiguos. */
export const SCALE_ALIASES: Readonly<Record<ScaleKey, string>> = {
  dor: 'pain',
  poder: 'power',
  visao: 'vision',
  valor: 'value',
  controle: 'control',
  compras: 'purchase',
}

export const SCALE_LABELS: Readonly<Record<ScaleKey, string>> = {
  dor: 'Dor',
  poder: 'Poder',
  visao: 'Visão',
  valor: 'Valor',
  controle: 'Controle',
  compras: 'Compras',
}

export const STAGES: readonly Stage[] = [
  {
    id: 1,
    name: 'Prospecção',
    probability: 0,
    requirements: ['Identificar dor do cliente', 'Contato inicial estabelecido'],
  },
  {
    id: 2,
    name: 'Qualificação',
    probability: 20,
    requirements: ['Score DOR ≥ 5', 'Score PODER ≥ 4', 'Budget confirmado'],
  },
  {
    id: 3,
    name: 'Apresentação',
    probability: 40,
    requirements: ['Score VISÃO ≥ 5', 'Apresentação agendada', 'Stakeholders definidos'],
  },
  {
    id: 4,
    name: 'Validação/Teste',
    probability: 60,
    requirements: ['Score VALOR ≥ 6', 'Teste/POC executado', 'ROI validado'],
  },
  {
    id: 5,
    name: 'Negociação',
    probability: 80,
    requirements: ['Score CONTROLE ≥ 7', 'Score COMPRAS ≥ 6', 'Proposta enviada'],
  },
  {
    id: 6,
    name: 'Fechado',
    probability: 100,
    requirements: ['Contrato assinado', 'Pagamento processado'],
  },
] as const

/**
 * Gates de escala mínima para SALIR de la etapa (avanzar a la siguiente).
 * La clave es la etapa ACTUAL. Se revalidan SIEMPRE en Postgres: el cliente
 * puede estar con datos viejos.
 */
export const STAGE_GATES: Readonly<Partial<Record<StageId, readonly StageGate[]>>> = {
  2: [
    { scale: 'dor', min: 5 },
    { scale: 'poder', min: 4 },
  ],
  3: [{ scale: 'visao', min: 5 }],
  4: [{ scale: 'valor', min: 6 }],
  5: [
    { scale: 'controle', min: 7 },
    { scale: 'compras', min: 6 },
  ],
}

export const PRODUCT_LINE_LABELS: Readonly<Record<ProductLine, string>> = {
  better_pack: 'Máquinas Better Pack',
  better_pack_venom: 'Better Pack + Venom',
  ecomfill_resmas: 'E-comfill + Resmas',
  ecombag: 'E-Combag',
  servico_manutencao: 'Serviço de Manutenção',
}

/** Los 11 niveles canónicos (0..10) de cada escala. */
export const SCALE_DEFINITIONS: Readonly<Record<ScaleKey, readonly ScaleDefinition[]>> = {
  dor: [
    { level: 0, text: 'Não há identificação de necessidade ou dor pelo cliente' },
    { level: 1, text: 'Vendedor assume necessidades do cliente' },
    { level: 2, text: 'Pessoa de Contato admite necessidade' },
    { level: 3, text: 'Pessoa de Contato admite razões e sintomas causadores de dor' },
    { level: 4, text: 'Pessoa de Contato admite dor' },
    { level: 5, text: 'Vendedor documenta dor e Pessoa de Contato concorda' },
    { level: 6, text: 'Pessoa de Contato formaliza necessidades do Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão admite necessidades' },
    { level: 8, text: 'Tomador de Decisão admite razões e sintomas causadores de dor' },
    { level: 9, text: 'Tomador de Decisão admite dor' },
    { level: 10, text: 'Vendedor documenta dor e Power concorda' },
  ],
  poder: [
    { level: 0, text: 'Tomador de Decisão não foi identificado ainda' },
    { level: 1, text: 'Processo de decisão revelado por Pessoa de Contato' },
    { level: 2, text: 'Tomador de Decisão Potencial identificado' },
    { level: 3, text: 'Pedido de acesso a Tomador de Decisão acordado por Pessoa de Contato' },
    { level: 4, text: 'Tomador de Decisão acessado' },
    { level: 5, text: 'Tomador de Decisão concorda em explorar oportunidade' },
    { level: 6, text: 'Processo de decisão e compra confirmado pelo Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão concorda em fazer uma Prova de Valor' },
    { level: 8, text: 'Tomador de Decisão concorda com conteúdo da proposta' },
    { level: 9, text: 'Tomador de Decisão confirma aprovação verbal' },
    { level: 10, text: 'Tomador de Decisão aprova formalmente internamente' },
  ],
  visao: [
    { level: 0, text: 'Nenhuma visão ou visão concorrente estabelecida' },
    { level: 1, text: 'Visão do Pessoa de Contato criada em termos de produto' },
    { level: 2, text: 'Visão Pessoa de Contato criada em termos: Situação/Problema/Implicação' },
    { level: 3, text: 'Visão diferenciada criada com Pessoa de Contato (SPI)' },
    { level: 4, text: 'Visão diferenciada documentada com Pessoa de Contato' },
    { level: 5, text: 'Documentação concordada por Pessoa de Contato' },
    { level: 6, text: 'Visão Power criada em termos de produto' },
    { level: 7, text: 'Visão Power criada em termos: Situação/Problema/Implicação' },
    { level: 8, text: 'Visão diferenciada criada com Tomador de Decisão (SPIN)' },
    { level: 9, text: 'Visão diferenciada documentada com Tomador de Decisão' },
    { level: 10, text: 'Documentação concordada por Tomador de Decisão' },
  ],
  valor: [
    { level: 0, text: 'Pessoa de Contato explora a solução, mas valor não foi identificado' },
    { level: 1, text: 'Vendedor identifica proposição de valor para o negócio' },
    { level: 2, text: 'Pessoa de Contato concorda em explorar a proposta de valor' },
    { level: 3, text: 'Tomador de Decisão concorda em explorar a proposta de valor' },
    { level: 4, text: 'Critérios para definição de valor estabelecidos com Tomador de Decisão' },
    { level: 5, text: 'Valor descoberto está associado à visão Tomador de Decisão' },
    { level: 6, text: 'Análise de valor conduzida por vendedor (demo)' },
    { level: 7, text: 'Análise de valor conduzida pelo Pessoa de Contato (trial)' },
    { level: 8, text: 'Tomador de Decisão concorda com análise de Valor' },
    { level: 9, text: 'Conclusão da análise de valor documentada pelo vendedor' },
    { level: 10, text: 'Tomador de Decisão confirma por escrito conclusões da análise' },
  ],
  controle: [
    { level: 0, text: 'Nenhum follow documentado de conversa com Pessoa de Contato' },
    { level: 1, text: '1ª visão (SPI) enviada para Pessoa de Contato' },
    { level: 2, text: '1ª visão concordada ou modificada por Pessoa de Contato (SPIN)' },
    { level: 3, text: '1ª visão enviada para Tomador de Decisão (SPI)' },
    { level: 4, text: '1ª visão concordada ou modificada por Tomador de Decisão (SPIN)' },
    { level: 5, text: 'Vendedor recebe aprovação para explorar Valor' },
    { level: 6, text: 'Plano de avaliação enviado para Tomador de Decisão' },
    { level: 7, text: 'Tomador de Decisão concorda ou modifica a Avaliação' },
    { level: 8, text: 'Plano de Avaliação conduzido (quando aplicável)' },
    { level: 9, text: 'Resultado da Avaliação aprovado pelo Tomador de Decisão' },
    { level: 10, text: 'Tomador de Decisão aprova proposta para negociação final' },
  ],
  compras: [
    { level: 0, text: 'Processo de compras desconhecido' },
    { level: 1, text: 'Processo de compras esclarecido pela pessoa de contato' },
    { level: 2, text: 'Processo de compras confirmado pelo Tomador de Decisão' },
    { level: 3, text: 'Condições comerciais validadas com o cliente' },
    { level: 4, text: 'Proposta apresentada para o cliente' },
    { level: 5, text: 'Processo de negociação iniciado com departamento de compras' },
    { level: 6, text: 'Condições comerciais aprovadas e formalizadas' },
    { level: 7, text: 'Contrato assinado' },
    { level: 8, text: 'Pedido de compras recebido' },
    { level: 9, text: 'Cobrança emitida' },
    { level: 10, text: 'Pagamento realizado' },
  ],
}

/** Por encima de este nivel, mover una escala exige evidencia con cita. */
export const EVIDENCE_REQUIRED_ABOVE = 5


/** Ventana de frescura de una prueba: pasados 90 días deja de valer. */
export const EVIDENCE_FRESH_DAYS = 90

/* ── Lectura defensiva del jsonb ─────────────────────────────────────────── */

/**
 * Normaliza a número una escala que puede venir como number, objeto o null.
 * El jsonb de producción tiene las tres formas conviviendo; leerlo directo es
 * la causa de la mitad de los NaN del v2.
 */
export function getScaleValue(scale: ScaleValue | number | null | undefined): number {
  if (scale === null || scale === undefined) return 0
  if (typeof scale === 'number') return Number.isFinite(scale) ? scale : 0
  if (typeof scale === 'object' && typeof scale.score === 'number') {
    return Number.isFinite(scale.score) ? scale.score : 0
  }
  return 0
}

/** Devuelve la descripción textual asociada a una escala, o cadena vacía. */
export function getScaleDescription(scale: ScaleValue | number | null | undefined): string {
  if (scale && typeof scale === 'object' && typeof scale.description === 'string') {
    return scale.description
  }
  return ''
}

/** Lee una escala por su nombre canónico, aceptando el alias legado en inglés. */
export function getScale(
  scales: ScalesRecord | null | undefined,
  key: ScaleKey,
): ScaleValue | number | null | undefined {
  if (!scales) return undefined
  const canonico = scales[key]
  if (canonico !== undefined) return canonico
  const alias = SCALE_ALIASES[key] as keyof ScalesRecord
  return scales[alias]
}

/** Las 6 escalas normalizadas a número, siempre con las 6 claves presentes. */
export function getScaleScores(scales: ScalesRecord | null | undefined): ScaleScores {
  return {
    dor: getScaleValue(getScale(scales, 'dor')),
    poder: getScaleValue(getScale(scales, 'poder')),
    visao: getScaleValue(getScale(scales, 'visao')),
    valor: getScaleValue(getScale(scales, 'valor')),
    controle: getScaleValue(getScale(scales, 'controle')),
    compras: getScaleValue(getScale(scales, 'compras')),
  }
}

/**
 * Media de las 6 escalas con 1 decimal. Sustituye a la columna health_score,
 * que en producción está desincronizada en 38 de 65 oportunidades.
 */
export function calculateHealthScore(scales: ScalesRecord | null | undefined): number {
  if (!scales) return 0
  const scores = getScaleScores(scales)
  const total = SCALE_KEYS.reduce((acc, k) => acc + scores[k], 0)
  return Math.round((total / SCALE_KEYS.length) * 10) / 10
}

/** Definición canónica de un nivel concreto de una escala. */
export function getScaleDefinition(scale: ScaleKey, level: number): ScaleDefinition | undefined {
  const niveis = SCALE_DEFINITIONS[scale]
  const idx = Math.round(level)
  if (idx < 0 || idx > 10) return undefined
  return niveis[idx]
}

/**
 * Texto del nivel SIGUIENTE de una escala — el «para dónde tengo que ir».
 * Devuelve null si ya está en 10: no hay nada más que empujar.
 */
export function proximoNivel(scaleKey: ScaleKey, score: number): string | null {
  const atual = Math.max(0, Math.min(10, Math.floor(score)))
  if (atual >= 10) return null
  return getScaleDefinition(scaleKey, atual + 1)?.text ?? null
}

/** El nivel siguiente completo (nivel + texto), para el stepper del editor. */
export function proximoNivelDetalhe(
  scaleKey: ScaleKey,
  score: number,
): ScaleDefinition | undefined {
  const atual = Math.max(0, Math.min(10, Math.floor(score)))
  if (atual >= 10) return undefined
  return getScaleDefinition(scaleKey, atual + 1)
}

/* ── Etapas y gates ──────────────────────────────────────────────────────── */

/** Metadatos de una etapa por id. */
export function getStage(stageId: StageId): Stage | undefined {
  return STAGES.find((s) => s.id === stageId)
}

/** Nombre PT-BR de la etapa; cadena vacía si el id no existe. */
export function getStageName(stageId: StageId | number | null | undefined): StageName | '' {
  if (stageId === null || stageId === undefined) return ''
  return STAGES.find((s) => s.id === stageId)?.name ?? ''
}

/** true si la etapa puede avanzar: todos sus gates cumplidos. */
export function checkStageRequirements(
  scales: ScalesRecord | null | undefined,
  stageId: StageId,
): boolean {
  const gates = STAGE_GATES[stageId]
  if (!gates) return true
  return gates.every((g) => getScaleValue(getScale(scales, g.scale)) >= g.min)
}

/** Igual que checkStageRequirements pero detallando qué falta y por cuánto. */
export function evaluateGate(
  scales: ScalesRecord | null | undefined,
  stageId: StageId,
): GateCheck {
  const gates = STAGE_GATES[stageId] ?? []
  const blocking: Array<StageGate & { current: number }> = []
  for (const g of gates) {
    const current = getScaleValue(getScale(scales, g.scale))
    if (current < g.min) blocking.push({ ...g, current })
  }
  return { stage: stageId, passed: blocking.length === 0, blocking }
}

/**
 * La escala que más bloquea el avance: entre las que no llegan al mínimo, la
 * que está MÁS LEJOS de su umbral. Es la que hay que atacar hoy — mover una
 * escala que le falta 1 antes que otra a la que le faltan 4 no destraba nada.
 */
export function lowestBlockingScale(
  scales: ScalesRecord | null | undefined,
  stageId: StageId,
): ScaleKey | null {
  const { blocking } = evaluateGate(scales, stageId)
  if (blocking.length === 0) return null
  let peor = blocking[0]
  if (!peor) return null
  for (const b of blocking) {
    if (b.min - b.current > peor.min - peor.current) peor = b
  }
  return peor.scale
}

/**
 * Qué falta para SALIR de la etapa, en texto PT-BR listo para pintar:
 *   «Para sair de Validação/Teste falta VALOR ≥ 6 (hoje 4)»
 * Devuelve null si el gate ya está cumplido o la etapa no tiene gate.
 */
export function gateFaltante(
  scales: ScalesRecord | null | undefined,
  stageId: StageId,
): GateFaltante | null {
  const { blocking } = evaluateGate(scales, stageId)
  if (blocking.length === 0) return null

  let peor = blocking[0]
  if (!peor) return null
  for (const b of blocking) {
    if (b.min - b.current > peor.min - peor.current) peor = b
  }

  const stageName = getStageName(stageId) || 'a etapa atual'
  const rotulo = SCALE_LABELS[peor.scale].toUpperCase()
  return {
    stage: stageId,
    stageName: stageName as StageName,
    escala: peor.scale,
    minimo: peor.min,
    atual: peor.current,
    falta: peor.min - peor.current,
    texto: `Para sair de ${stageName} falta ${rotulo} ≥ ${peor.min} (hoje ${peor.current})`,
  }
}

/** Todos los gates pendientes de la etapa, cada uno ya redactado en PT-BR. */
export function gatesFaltantes(
  scales: ScalesRecord | null | undefined,
  stageId: StageId,
): GateFaltante[] {
  const { blocking } = evaluateGate(scales, stageId)
  const stageName = getStageName(stageId) || 'a etapa atual'
  return blocking.map((b) => ({
    stage: stageId,
    stageName: stageName as StageName,
    escala: b.scale,
    minimo: b.min,
    atual: b.current,
    falta: b.min - b.current,
    texto: `Para sair de ${stageName} falta ${SCALE_LABELS[b.scale].toUpperCase()} ≥ ${b.min} (hoje ${b.current})`,
  }))
}

/**
 * Etapa MÁXIMA que las escalas realmente habilitan. Si la oportunidad está por
 * encima de este número el gate se saltó a mano: es el «gate falso» de risk.ts.
 */
export function maxStageAllowed(scales: ScalesRecord | null | undefined): StageId {
  let permitido: StageId = 1
  for (const s of STAGES) {
    if (s.id === 6) break
    if (checkStageRequirements(scales, s.id)) permitido = (s.id + 1) as StageId
    else break
  }
  return permitido
}

/* ── Evidencia (M6) ──────────────────────────────────────────────────────── */

/**
 * Los DOS números del health.
 *
 * `declarado` es la media de las 6 escalas tal como las cargó el vendedor.
 * `verificado` es la MISMA media, pero las escalas sin prueba de los últimos
 * EVIDENCE_FRESH_DAYS días cuentan 0.
 *
 * Se divide siempre por 6 a propósito. Promediar solo las escalas probadas
 * daría 10 a un negocio con una sola escala documentada, que es exactamente el
 * autoengaño que M6 viene a matar. Un negocio con media prueba vale la mitad.
 */
export function healthVerificado(
  scales: ScalesRecord | null | undefined,
  evidencias: readonly Evidence[],
  hoje: IsoDate = todayBr(),
): HealthVerificado {
  const scores = getScaleScores(scales)

  // La prueba más reciente por escala. Solo cuentan las no rechazadas.
  const maisRecente = new Map<ScaleKey, Evidence>()
  for (const ev of evidencias) {
    if (ev.verified === false) continue
    const atual = maisRecente.get(ev.scale)
    if (!atual || ev.occurred_at > atual.occurred_at) maisRecente.set(ev.scale, ev)
  }

  const escalasSemProva: ScaleKey[] = []
  const escalasComProva: HealthVerificado['escalasComProva'] = []
  let somaVerificada = 0

  for (const key of SCALE_KEYS) {
    const ev = maisRecente.get(key)
    if (!ev) {
      escalasSemProva.push(key)
      continue
    }
    const idadeDias = daysBetween(ev.occurred_at, hoje)
    // Prueba del futuro (dato sucio) o vencida: no cuenta.
    if (idadeDias < 0 || idadeDias > EVIDENCE_FRESH_DAYS) {
      escalasSemProva.push(key)
      continue
    }
    somaVerificada += scores[key]
    escalasComProva.push({ escala: key, nivel: scores[key], idadeDias })
  }

  return {
    declarado: calculateHealthScore(scales),
    verificado: Math.round((somaVerificada / SCALE_KEYS.length) * 10) / 10,
    escalasSemProva,
    escalasComProva,
  }
}

/** Estado visual de una escala en el dossiê: verde / âmbar / vermelho. */
export type EstadoEvidencia = 'com_prova' | 'prova_velha' | 'sem_prova'

/** En qué estado está la prueba de una escala concreta. */
export function estadoDaEvidencia(
  scale: ScaleKey,
  evidencias: readonly Evidence[],
  hoje: IsoDate = todayBr(),
): { estado: EstadoEvidencia; idadeDias: number | null; texto: string } {
  let mais: Evidence | undefined
  for (const ev of evidencias) {
    if (ev.scale !== scale || ev.verified === false) continue
    if (!mais || ev.occurred_at > mais.occurred_at) mais = ev
  }
  if (!mais) return { estado: 'sem_prova', idadeDias: null, texto: 'Nunca documentada' }
  const idadeDias = daysBetween(mais.occurred_at, hoje)
  if (idadeDias < 0 || idadeDias > EVIDENCE_FRESH_DAYS) {
    return { estado: 'prova_velha', idadeDias, texto: `Sem evidência há ${idadeDias} dias` }
  }
  return { estado: 'com_prova', idadeDias, texto: `Documentada há ${idadeDias} dias` }
}

/** true si mover esa escala a ese nivel exige cita textual (regra da prova). */
export function exigeEvidencia(level: number): boolean {
  return level > EVIDENCE_REQUIRED_ABOVE
}

/* ── Contacto real ───────────────────────────────────────────────────────── */

/** Lo mínimo que necesitamos de una actividad para fechar el último contacto. */
export interface ContactoDatable {
  activity_date?: string | null
  created_at?: string | null
}

/**
 * Días desde el último contacto REAL. Usa la actividad más reciente; solo cae
 * a last_update (que se pisa con cualquier edición del registro, así que miente
 * sistemáticamente) si no hay historial. 999 = nunca hubo contacto.
 */
export function getDaysSinceLastContact(
  lastUpdate: string | null | undefined,
  activityHistory?: readonly ContactoDatable[],
  now: Date = new Date(),
): number {
  let referencia: number | null = null

  if (activityHistory && activityHistory.length > 0) {
    for (const a of activityHistory) {
      const bruto = a.activity_date ?? a.created_at
      if (!bruto) continue
      const t = new Date(bruto).getTime()
      if (Number.isNaN(t)) continue
      if (referencia === null || t > referencia) referencia = t
    }
  }

  if (referencia === null && lastUpdate) {
    const t = new Date(lastUpdate).getTime()
    if (!Number.isNaN(t)) referencia = t
  }

  if (referencia === null) return 999
  const dias = Math.floor((now.getTime() - referencia) / 86_400_000)
  return dias < 0 ? 0 : dias
}

/**
 * Probabilidad derivada de las escalas y castigada por el silencio.
 * Port del analyzeOpportunity del v2 — es el número que el equipo ya conoce,
 * no lo cambiamos por gusto.
 */
export function probabilidadeCalculada(healthScore: number, daysSinceContact: number): number {
  let p: number
  if (healthScore >= 8) p = 85
  else if (healthScore >= 7) p = 70
  else if (healthScore >= 5) p = 40
  else if (healthScore >= 3) p = 20
  else p = 5

  if (daysSinceContact > 30) p = Math.max(p - 50, 5)
  else if (daysSinceContact > 14) p = Math.max(p - 20, 10)
  else if (daysSinceContact > 7) p = Math.max(p - 10, 15)

  return p
}
