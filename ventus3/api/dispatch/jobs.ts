// api/dispatch/jobs.ts — los jobs programados del v3, en UN endpoint.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ UNO SOLO Y NO NUEVE RUTAS
// ══════════════════════════════════════════════════════════════════════════
// Vercel Hobby tiene un tope de 12 Serverless Functions por deploy y el
// proyecto ya usa 7. Nueve rutas más no entran. Además todos los jobs hacen lo
// mismo —leer la cartera, correr el motor determinístico de src/core, encolar—
// y compartir el bundle evita nueve arranques en frío distintos.
//
// pg_cron agenda y pg_net hace el POST con `?job=<nome>` y el `CRON_SECRET`.
// Los horarios están declarados UNA vez, en 0012_cron.sql, en BRT. El v2 tenía
// tres horarios distintos para el mismo digest (vercel.json decía 12:00 UTC, el
// README prometía 7:30 y el comentario decía 10:30): nadie sabía cuál corría.
//
// REGLA COMÚN A TODOS: ningún job manda nada. Todos ENCOLAN. Quien decide si
// algo sale, cuándo y por dónde es el dispatcher (_politica.ts), que es el
// único que conoce el presupuesto. Un job que mandara directo sería otra vez
// el cron del v2 escribiendo 4.521 avisos sin preguntarle a nadie.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Activity, Opportunity, RiskSignal, Vendor } from '../../src/core/index.js'
import {
  addDays,
  avaliarRiscos,
  brOffset,
  escalaMaisFraca,
  formatarBRL,
  gateFaltante,
  getScaleValue,
  getScaleScores,
  rankDay,
  resumirMotivos,
  textosParaAvancar,
  todayBr,
  weekStart,
} from '../../src/core/index.js'
import type { AuthContext } from '../_lib/auth.js'
import { carregarCarteira } from '../_lib/carteira.js'
import type { ApiHandler } from '../_lib/http.js'
import { exigirMetodo, pedidoInvalido, rota } from '../_lib/http.js'
import { exigirCron } from './_cron.js'
import type { NovoAviso } from './_tipos.js'
import { db, enfileirarVarios, vendedoresAtivos } from './_repo.js'

/* ══════════════════════════════════════════════════════════════════════════
   Utilidades comunes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Contexto sintético para `carregarCarteira`. NO es una sesión: sólo lleva el
 * nombre del vendedor, y `isAdmin` va en false a propósito para que ningún job
 * pueda leer la cartera del equipo por accidente.
 */
function ctxDe(v: Vendor): AuthContext {
  return {
    userId: `cron:${String(v.id)}`,
    vendorName: v.name,
    vendorId: v.id,
    isAdmin: false,
    email: null,
    expiraEm: 0,
  }
}

const instante = (dia: string, hhmm: string, ref: Date): string =>
  `${dia}T${hhmm}:00${brOffset(ref)}`

export interface ResumoDoJob {
  job: string
  em: string
  vendedores: number
  enfileirados: number
  duplicados: number
  rejeitados: number
  detalhe?: Record<string, number | string>
}

async function paraCadaVendedor(
  cli: SupabaseClient,
  fn: (v: Vendor) => Promise<NovoAviso[]>,
): Promise<{ vendedores: number; avisos: NovoAviso[] }> {
  const vendedores = await vendedoresAtivos(cli)
  const avisos: NovoAviso[] = []
  for (const v of vendedores) {
    try {
      avisos.push(...(await fn(v)))
    } catch (erro) {
      // Un vendedor que explota no puede dejar a los otros cinco sin agenda.
      console.error(`[dispatch/jobs] ${v.name} falhou:`, erro)
    }
  }
  return { vendedores: vendedores.length, avisos }
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · Víspera 18h — la fila da Golden Hour para aprobar con un tap
   ══════════════════════════════════════════════════════════════════════════ */

interface LinhaGolden {
  vendor: string
  origem: string
  entity_kind: string
  entity_id: string
  titulo: string
  subtitulo: string
  canal_sugerido: string | null
  dias_atraso: number | null
  prioridade: number
  sugestao: string | null
}

/**
 * Arma la cola de mañana y la deja escrita en `golden_sessions` ANTES de
 * avisar. El vendedor no elige a quién llamar en el momento: eso es lo que
 * convierte una hora de prospección en una hora de mirar la pantalla.
 *
 * Las tres fuentes salen de `v_golden_queue` (cadencia vencida según
 * CADENCE_SCHEDULE + empresas de market_sweep asignadas sin lead + tasks de
 * contacto vencidas). Se lee con service_role a propósito: la rama de
 * market_sweep devuelve cero filas con un JWT de vendedor porque esa tabla
 * tiene RLS sin policies, y son 83 arranques de prospección reales.
 */
async function jobFilaGolden(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const amanha = addDays(todayBr(agora), 1)
  const { data, error } = await cli
    .from('v_golden_queue')
    .select('*')
    .order('prioridade')
    .order('dias_atraso', { ascending: false })
    .limit(400)
  if (error) {
    console.error(`[dispatch/jobs] v_golden_queue: ${error.code} ${error.message}`)
    return []
  }

  const porVendedor = new Map<string, LinhaGolden[]>()
  for (const linha of (data ?? []) as LinhaGolden[]) {
    if (linha.vendor === null) continue
    const lista = porVendedor.get(linha.vendor) ?? []
    if (lista.length < 15) lista.push(linha)
    porVendedor.set(linha.vendor, lista)
  }

  const vendedores = await vendedoresAtivos(cli)
  const idPorNome = new Map(vendedores.map((v) => [v.name, v.id]))
  const avisos: NovoAviso[] = []

  for (const [vendor, fila] of porVendedor) {
    if (fila.length === 0) continue
    const vendorId = idPorNome.get(vendor) ?? null

    const { error: erroSessao } = await cli.from('golden_sessions').upsert(
      {
        vendor,
        vendor_id: vendorId,
        dia: amanha,
        planejado_para: instante(amanha, '09:00', agora),
        fila: fila.map((f) => ({
          origem: f.origem,
          entity_kind: f.entity_kind,
          entity_id: f.entity_id,
          titulo: f.titulo,
          subtitulo: f.subtitulo,
          canal: f.canal_sugerido,
          sugestao: f.sugestao,
          dias_atraso: f.dias_atraso ?? 0,
        })),
        meta_toques: Math.min(12, fila.length),
      },
      { onConflict: 'vendor,dia' },
    )
    if (erroSessao) console.error(`[dispatch/jobs] golden_sessions: ${erroSessao.message}`)

    const atrasados = fila.filter((f) => (f.dias_atraso ?? 0) > 0).length
    const doMapa = fila.filter((f) => f.origem === 'mapa').length
    const primeiros = fila.slice(0, 3).map((f) => `• ${f.titulo} — ${f.sugestao ?? 'contatar'}`)

    avisos.push({
      vendor,
      vendor_id: vendorId,
      tipo: 'fila_golden',
      titulo: `Fila de amanhã: ${fila.length} contatos`,
      corpo: [
        `${atrasados} com toque vencido · ${doMapa} do mapa de mercado`,
        ...primeiros,
        'Aprove agora e amanhã é só executar.',
      ].join('\n'),
      dedupe_key: `${vendor}:fila_golden:${amanha}`,
      deep_link: `/golden?dia=${amanha}&revisar=1`,
      acoes: [
        { rotulo: `Aprovar os ${fila.length}`, callback: `golden:${amanha}:aprovar:v3` },
        { rotulo: 'Ajustar a fila', deep_link: `/golden?dia=${amanha}&revisar=1` },
      ],
      agendado_para: agora.toISOString(),
      payload: { dia: amanha, total: fila.length },
    })
  }
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · T-15 de la Golden Hour
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * "Começa em 15 — 12 contatos prontos". Corre cada 5 minutos y se apoya en el
 * dedupe de la fila para no repetirse. El silenciamiento del resto de los
 * avisos DURANTE el bloque no se hace acá: lo hace `_politica.ts`, que conoce
 * la ventana y adia todo lo que no sea de la Golden Hour.
 */
async function jobGoldenT15(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const { data, error } = await cli
    .from('golden_sessions')
    .select('vendor, vendor_id, dia, planejado_para, fila, inicio')
    .eq('dia', hoje)
    .is('inicio', null)
    .limit(20)
  if (error) {
    console.error(`[dispatch/jobs] golden_sessions: ${error.message}`)
    return []
  }

  const avisos: NovoAviso[] = []
  for (const linha of (data ?? []) as Array<{
    vendor: string; vendor_id: number | null; planejado_para: string | null; fila: unknown[]
  }>) {
    if (linha.planejado_para === null) continue
    const faltamMin = (Date.parse(linha.planejado_para) - agora.getTime()) / 60_000
    // Ventana de 10 min con el cron cada 5: siempre cae uno, nunca dos (el
    // índice único de dedupe se encarga del borde).
    if (faltamMin > 18 || faltamMin < 8) continue

    const total = Array.isArray(linha.fila) ? linha.fila.length : 0
    avisos.push({
      vendor: linha.vendor,
      vendor_id: linha.vendor_id,
      tipo: 'golden_t15',
      titulo: 'Golden Hour começa em 15',
      corpo: total > 0
        ? `${total} contatos prontos, na ordem. Silencio o resto durante o bloco.`
        : 'A fila está vazia — dá tempo de montar uma agora.',
      dedupe_key: `${linha.vendor}:golden_t15:${hoje}`,
      deep_link: '/golden?iniciar=1',
      acoes: [
        { rotulo: 'Começar agora', deep_link: '/golden?iniciar=1' },
        { rotulo: 'Adiar 30 min', callback: `golden:${hoje}:adiar30:v3` },
      ],
      agendado_para: agora.toISOString(),
    })
  }
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · 7h — la agenda da manhã, una por vendedor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cada vendedor recibe LA SUYA. Hoy el digest va sólo a los admins y repite el
 * mismo número gigante ("50 oportunidades sem data") todas las mañanas: fatiga
 * de alerta de fábrica. Acá van las 3 prioridades que calculó `rankDay()` —el
 * mismo motor determinístico que corre offline en el teléfono— más los anillos
 * y la racha, con un botón por prioridad.
 */
async function jobAgendaManha(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const { avisos } = await paraCadaVendedor(cli, async (v) => {
    const carteira = await carregarCarteira(ctxDe(v), { diasDeAtividade: 90 })
    const plano = rankDay({
      vendor: v.name,
      today: hoje,
      opportunities: carteira.oportunidades,
      leads: carteira.leads,
      activities: carteira.atividades,
      tasks: carteira.tarefas,
      commitments: carteira.compromissos,
      touchpoints: carteira.touchpoints,
      vendorInfo: carteira.vendorInfo,
    })
    if (plano.top.length === 0) return []

    const [aneis, racha] = await Promise.all([
      cli.from('daily_rings').select('contato, conversa, avanco, meta_contato, meta_conversa, meta_avanco')
        .eq('vendor', v.name).eq('dia', hoje).maybeSingle(),
      cli.from('streaks').select('atual, escudos').eq('vendor', v.name).maybeSingle(),
    ])
    const r = (aneis.data ?? null) as null | {
      contato: number; conversa: number; avanco: number
      meta_contato: number; meta_conversa: number; meta_avanco: number
    }
    const s = (racha.data ?? null) as null | { atual: number; escudos: number }

    const linhas = plano.top.map((a, i) => `${i + 1}. ${a.acao} — ${resumirMotivos(a)}`)
    const rodape: string[] = []
    if (r !== null) {
      rodape.push(
        `Anéis: ${r.contato}/${r.meta_contato} contato · ${r.conversa}/${r.meta_conversa} conversa · ${r.avanco}/${r.meta_avanco} avanço`,
      )
    }
    if (s !== null && s.atual > 0) {
      rodape.push(`Sequência: ${s.atual} dia(s)${s.escudos > 0 ? ` · ${s.escudos} escudo(s)` : ''}`)
    }
    if (plano.restantes > 0) rodape.push(`Mais ${plano.restantes} na lista.`)

    const primeira = plano.top[0]
    return [{
      vendor: v.name,
      vendor_id: v.id,
      tipo: 'agenda_manha',
      titulo: `Bom dia. 3 prioridades para hoje`,
      corpo: [...linhas, ...rodape].join('\n'),
      dedupe_key: `${v.name}:agenda_manha:${hoje}`,
      deep_link: '/hoje',
      acoes: [
        {
          rotulo: `Começar pela 1ª`,
          deep_link: primeira !== undefined ? `/hoje?foco=${primeira.id}` : '/hoje?foco=1',
        },
        { rotulo: 'Ver as 3', deep_link: '/hoje' },
      ],
      agendado_para: agora.toISOString(),
      payload: { top: plano.top.map((a) => a.id), restantes: plano.restantes },
    } satisfies NovoAviso]
  })
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · T-90 de cada reunión — preparo com 5 bullets
   ══════════════════════════════════════════════════════════════════════════ */

interface TarefaDeReuniao {
  id: string
  vendor: string
  vendor_id: number | null
  opportunity_id: number | null
  titulo: string
  due_date: string
  due_time: string | null
  expected_outcome: string | null
}

/**
 * Los 5 bullets salen del motor determinístico, no de un modelo: gate que
 * falta, escala más floja con la pregunta SPIN que la mueve, silencio, valor y
 * la prueba concreta que hay que traerse. Es lo mismo que la ficha de la
 * pantalla, en cinco líneas que se leen en el ascensor.
 */
async function jobPreparoReuniao(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const { data, error } = await cli
    .from('tasks')
    .select('id, vendor, vendor_id, opportunity_id, titulo, due_date, due_time, expected_outcome')
    .eq('canal', 'meeting')
    .in('status', ['pending', 'snoozed'])
    .eq('due_date', hoje)
    .not('due_time', 'is', null)
    .limit(50)
  if (error) {
    console.error(`[dispatch/jobs] tasks(meeting): ${error.message}`)
    return []
  }

  const tarefas = ((data ?? []) as TarefaDeReuniao[]).filter((t) => {
    if (t.due_time === null) return false
    const quando = Date.parse(instante(t.due_date, t.due_time.slice(0, 5), agora))
    if (Number.isNaN(quando)) return false
    const faltamMin = (quando - agora.getTime()) / 60_000
    return faltamMin <= 93 && faltamMin >= 83
  })
  if (tarefas.length === 0) return []

  const ids = [...new Set(tarefas.map((t) => t.opportunity_id).filter((n): n is number => n !== null))]
  const [opps, ativs] = await Promise.all([
    ids.length > 0
      ? cli.from('opportunities').select('*').in('id', ids).limit(50)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? cli.from('activities').select('*').in('opportunity_id', ids)
          .gte('activity_date', addDays(hoje, -90)).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ])
  const porId = new Map(((opps.data ?? []) as Opportunity[]).map((o) => [o.id, o]))
  const atividades = (ativs.data ?? []) as Activity[]

  const avisos: NovoAviso[] = []
  for (const t of tarefas) {
    const opp = t.opportunity_id === null ? undefined : porId.get(t.opportunity_id)
    const bullets: string[] = []

    if (opp !== undefined) {
      const etapa = opp.stage ?? 1
      const gate = gateFaltante(opp.scales, etapa)
      bullets.push(gate !== null ? `• ${gate.texto}` : `• Etapa ${String(etapa)}: gate cumprido`)

      const fraca = escalaMaisFraca(opp)
      const pergunta = textosParaAvancar(fraca.escala, fraca.valor, [], 1)[0]
      bullets.push(`• ${fraca.escala.toUpperCase()} está em ${fraca.valor}${pergunta !== undefined ? ` — pergunte: "${pergunta}"` : ''}`)

      const riscos = avaliarRiscos(opp, atividades, hoje)
      const pior = riscos[0]
      bullets.push(pior !== undefined ? `• Risco: ${pior.mensagem}` : '• Sem risco aberto nesta conta')

      const scores = getScaleScores(opp.scales)
      const poder = getScaleValue(scores.poder)
      bullets.push(
        `• ${formatarBRL(opp.value)} · ${poder >= 3 ? 'com acesso ao poder' : 'ainda sem acesso ao decisor'}`,
      )
    } else {
      bullets.push('• Reunião sem oportunidade vinculada — vincule ao registrar')
    }

    bullets.push(`• Prova para trazer: ${t.expected_outcome ?? 'próximo passo com data combinada'}`)

    avisos.push({
      vendor: t.vendor,
      vendor_id: t.vendor_id,
      tipo: 'preparo_reuniao',
      titulo: `Reunião em 90 min: ${t.titulo}`,
      corpo: bullets.slice(0, 5).join('\n'),
      dedupe_key: `${t.vendor}:preparo_reuniao:${t.id}`,
      deep_link: opp !== undefined ? `/carteira/${String(opp.id)}?preparo=1` : `/hoje?task=${t.id}`,
      acoes: [
        {
          rotulo: 'Abrir o preparo',
          deep_link: opp !== undefined ? `/carteira/${String(opp.id)}?preparo=1` : `/hoje?task=${t.id}`,
        },
        { rotulo: 'Reagendar', callback: `task:${t.id}:adiar:v3` },
      ],
      opportunity_id: t.opportunity_id,
      task_id: t.id,
      agendado_para: agora.toISOString(),
    })
  }
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Riesgo — máximo 1 por día por vendedor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La `dedupe_key` NO lleva la oportunidad: es `(vendor, risco, día)`. Ese
 * detalle es todo el diseño. Con la oportunidad adentro, seis negocios en
 * riesgo = seis avisos, que es exactamente cómo el v2 llegó a 17 en un día.
 * Se manda EL peor, con el resto contado en una línea.
 */
async function jobRisco(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const { avisos } = await paraCadaVendedor(cli, async (v) => {
    const carteira = await carregarCarteira(ctxDe(v), { diasDeAtividade: 90 })
    const achados: Array<{ opp: Opportunity; sinal: RiskSignal }> = []
    for (const opp of carteira.oportunidades) {
      for (const sinal of avaliarRiscos(opp, carteira.atividades, hoje)) {
        if (sinal.severidade === 'critical') achados.push({ opp, sinal })
      }
    }
    if (achados.length === 0) return []

    achados.sort((a, b) => (b.opp.value ?? 0) - (a.opp.value ?? 0))
    const pior = achados[0]
    if (pior === undefined) return []
    const outros = achados.length - 1

    return [{
      vendor: v.name,
      vendor_id: v.id,
      tipo: 'risco_critico',
      titulo: `Risco crítico: ${pior.opp.client ?? pior.opp.name}`,
      corpo: [
        pior.sinal.mensagem,
        `→ ${pior.sinal.sugestao}`,
        outros > 0 ? `Mais ${outros} negócio(s) em risco na sua carteira.` : '',
      ].filter((l) => l !== '').join('\n'),
      // (vendor, tipo, día): uno por día, pase lo que pase.
      dedupe_key: `${v.name}:risco_critico:${hoje}`,
      deep_link: `/carteira/${String(pior.opp.id)}?risco=${pior.sinal.codigo}`,
      acoes: [
        { rotulo: 'Abrir o negócio', deep_link: `/carteira/${String(pior.opp.id)}?risco=${pior.sinal.codigo}` },
        { rotulo: 'Agendar ação hoje', callback: `opp:${String(pior.opp.id)}:acao_hoje:v3` },
      ],
      opportunity_id: pior.opp.id,
      agendado_para: agora.toISOString(),
      payload: { codigo: pior.sinal.codigo, outros },
    } satisfies NovoAviso]
  })
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · Viernes 16h — veredicto de compromissos
   ══════════════════════════════════════════════════════════════════════════ */

async function jobVeredicto(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const semana = weekStart(hoje)
  const { data, error } = await cli
    .from('commitments')
    .select('id, vendor, committed_action, week_of, status')
    .eq('week_of', semana)
    .eq('status', 'pending')
    .limit(200)
  if (error) {
    console.error(`[dispatch/jobs] commitments: ${error.message}`)
    return []
  }

  const porVendedor = new Map<string, Array<{ id: number; committed_action: string }>>()
  for (const c of (data ?? []) as Array<{ id: number; vendor: string; committed_action: string }>) {
    const lista = porVendedor.get(c.vendor) ?? []
    lista.push({ id: c.id, committed_action: c.committed_action })
    porVendedor.set(c.vendor, lista)
  }

  const vendedores = await vendedoresAtivos(cli)
  const idPorNome = new Map(vendedores.map((v) => [v.name, v.id]))
  const avisos: NovoAviso[] = []

  for (const [vendor, lista] of porVendedor) {
    const primeiro = lista[0]
    if (primeiro === undefined) continue
    avisos.push({
      vendor,
      vendor_id: idPorNome.get(vendor) ?? null,
      tipo: 'veredicto_semana',
      titulo: `Veredicto da semana: ${lista.length} compromisso(s)`,
      corpo: lista.slice(0, 3).map((c) => `• ${c.committed_action}`).join('\n'),
      dedupe_key: `${vendor}:veredicto_semana:${semana}`,
      deep_link: `/rituais?aba=compromissos&semana=${semana}`,
      // Los tres botones del plano. El veredicto se cierra sin abrir la app.
      acoes: [
        { rotulo: 'Cumpri', callback: `commit:${String(primeiro.id)}:cumpri:v3` },
        { rotulo: 'Parcial', callback: `commit:${String(primeiro.id)}:parcial:v3` },
        { rotulo: 'Não deu', callback: `commit:${String(primeiro.id)}:naodeu:v3` },
        { rotulo: 'Ver todos', deep_link: `/rituais?aba=compromissos&semana=${semana}` },
      ],
      agendado_para: agora.toISOString(),
      payload: { semana, ids: lista.map((c) => c.id) },
    })
  }
  return avisos
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · Viernes 17h — los 5 troféus de la semana
   ══════════════════════════════════════════════════════════════════════════ */

interface AgregadoSemanal {
  vendor: string
  vendorId: number | null
  contato: number
  conversa: number
  avanco: number
  pa: number
}

/**
 * Los cinco troféus se ESCRIBEN en `trophies`, cuyo UNIQUE (semana, vendor)
 * impide que la misma persona gane dos en la misma semana. No se valida en
 * TypeScript: se deja fallar el insert y se sigue con el siguiente candidato.
 * Una regla del juego que sólo vive en el cliente no es una regla.
 */
async function jobTrofeus(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const semana = weekStart(hoje)
  const fim = addDays(semana, 4)

  const [aneis, pontos, vendedores] = await Promise.all([
    cli.from('daily_rings').select('vendor, vendor_id, contato, conversa, avanco')
      .gte('dia', semana).lte('dia', fim).limit(200),
    cli.from('points_ledger').select('vendor, pa').gte('dia', semana).lte('dia', fim).limit(2000),
    vendedoresAtivos(cli),
  ])
  if (aneis.error) console.error(`[dispatch/jobs] daily_rings: ${aneis.error.message}`)

  const agregado = new Map<string, AgregadoSemanal>()
  const idPorNome = new Map(vendedores.map((v) => [v.name, v.id]))
  const pegar = (vendor: string): AgregadoSemanal => {
    const atual = agregado.get(vendor)
    if (atual !== undefined) return atual
    const novo: AgregadoSemanal = {
      vendor, vendorId: idPorNome.get(vendor) ?? null, contato: 0, conversa: 0, avanco: 0, pa: 0,
    }
    agregado.set(vendor, novo)
    return novo
  }

  for (const linha of (aneis.data ?? []) as Array<{
    vendor: string; contato: number; conversa: number; avanco: number
  }>) {
    const a = pegar(linha.vendor)
    // Los 2 contactos de largada son endowed progress, no trabajo hecho: se
    // descuentan antes de repartir premios.
    a.contato += Math.max(0, linha.contato - 2)
    a.conversa += linha.conversa
    a.avanco += linha.avanco
  }
  for (const linha of (pontos.data ?? []) as Array<{ vendor: string; pa: number }>) {
    pegar(linha.vendor).pa += linha.pa
  }

  const criterios: Array<{ categoria: string; valor: (a: AgregadoSemanal) => number; detalhe: (a: AgregadoSemanal) => string }> = [
    { categoria: 'motor', valor: (a) => a.pa, detalhe: (a) => `${a.pa} PA na semana` },
    { categoria: 'escalador', valor: (a) => a.avanco, detalhe: (a) => `${a.avanco} avanço(s) com evidência` },
    {
      categoria: 'conversador',
      valor: (a) => (a.contato === 0 ? 0 : a.conversa / a.contato),
      detalhe: (a) => `${a.contato === 0 ? 0 : Math.round((a.conversa / a.contato) * 100)}% dos toques viraram conversa`,
    },
    { categoria: 'zelador', valor: (a) => a.conversa, detalhe: (a) => `${a.conversa} conversa(s) registradas` },
    { categoria: 'reanimador', valor: (a) => a.contato, detalhe: (a) => `${a.contato} contato(s) executados` },
  ]

  const jaGanhou = new Set<string>()
  const ganhos: Array<{ categoria: string; a: AgregadoSemanal; detalhe: string }> = []

  for (const c of criterios) {
    const candidatos = [...agregado.values()]
      .filter((a) => !jaGanhou.has(a.vendor) && c.valor(a) > 0)
      .sort((x, y) => c.valor(y) - c.valor(x))
    const ganhador = candidatos[0]
    if (ganhador === undefined) continue

    const { error } = await cli.from('trophies').insert({
      semana, categoria: c.categoria, vendor: ganhador.vendor, vendor_id: ganhador.vendorId,
      valor_metrica: c.valor(ganhador), detalhe: { texto: c.detalhe(ganhador) },
    })
    // 23505 = ya hay troféu de esa categoría o esa persona ya ganó. La base es
    // la que manda; acá sólo se registra y se sigue.
    if (error !== null && error.code !== '23505') {
      console.error(`[dispatch/jobs] trophies: ${error.code} ${error.message}`)
      continue
    }
    if (error !== null) continue
    jaGanhou.add(ganhador.vendor)
    ganhos.push({ categoria: c.categoria, a: ganhador, detalhe: c.detalhe(ganhador) })
  }
  if (ganhos.length === 0) return []

  const quadro = ganhos.map((g) => `• ${g.categoria}: ${g.a.vendor} — ${g.detalhe}`).join('\n')
  return [...agregado.values()].map((a) => ({
    vendor: a.vendor,
    vendor_id: a.vendorId,
    tipo: 'trofeus_semana',
    titulo: `Troféus da semana de ${semana}`,
    corpo: quadro,
    dedupe_key: `${a.vendor}:trofeus_semana:${semana}`,
    deep_link: `/placar?semana=${semana}`,
    acoes: [
      { rotulo: 'Ver o placar', deep_link: `/placar?semana=${semana}` },
      { rotulo: 'Mandar um kudos', deep_link: '/placar?kudos=1' },
    ],
    agendado_para: agora.toISOString(),
  }))
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · 18h — ritual de encerramento
   ══════════════════════════════════════════════════════════════════════════ */

async function jobEncerramento(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const { data } = await cli
    .from('daily_rings')
    .select('vendor, vendor_id, contato, conversa, avanco, meta_contato, meta_conversa, meta_avanco, fechado')
    .eq('dia', hoje)
    .limit(50)

  const linhas = (data ?? []) as Array<{
    vendor: string; vendor_id: number | null
    contato: number; conversa: number; avanco: number
    meta_contato: number; meta_conversa: number; meta_avanco: number; fechado: boolean
  }>
  if (linhas.length === 0) return []

  return linhas.map((r) => ({
    vendor: r.vendor,
    vendor_id: r.vendor_id,
    tipo: 'encerramento_dia',
    titulo: r.fechado ? 'Dia fechado. Os três anéis.' : 'Fechar o dia leva 2 minutos',
    corpo: [
      `Contato ${r.contato}/${r.meta_contato} · Conversa ${r.conversa}/${r.meta_conversa} · Avanço ${r.avanco}/${r.meta_avanco}`,
      r.fechado
        ? 'Deixe combinada a primeira ação de amanhã e a sequência segue.'
        : 'Registre o que ficou solto e combine a primeira de amanhã.',
    ].join('\n'),
    dedupe_key: `${r.vendor}:encerramento_dia:${hoje}`,
    deep_link: '/rituais?aba=encerramento',
    acoes: [
      { rotulo: 'Fechar o dia', deep_link: '/rituais?aba=encerramento' },
      { rotulo: 'Registrar por voz', deep_link: '/registrar?fonte=audio' },
    ],
    agendado_para: agora.toISOString(),
  }))
}

/* ══════════════════════════════════════════════════════════════════════════
   9 · Auditoría diaria de patrones sospechosos
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * NUNCA PENALIZA SOLA. Escribe en `ventus_audit` con evento `flag_calibracao`
 * y ahí lo lee la cola de calibración del Painel do Gestor. Un sistema de
 * juego que castiga automáticamente por un patrón estadístico produce dos
 * cosas: gente que aprende a esquivar el detector y gente honesta castigada
 * por un día raro. La decisión la toma una persona, con el caso delante.
 *
 * Tres patrones, los del plano:
 *   · más de 6 registros en menos de 10 minutos (ráfaga de fin de mes)
 *   · salto de escala de +3 o más sin transcripción que lo sostenga
 *   · reunión marcada como realizada sin ningún artefacto adjunto
 */
async function jobAuditoria(agora: Date, cli: SupabaseClient): Promise<NovoAviso[]> {
  const hoje = todayBr(agora)
  const ontem = addDays(hoje, -1)

  const [ativs, evid] = await Promise.all([
    cli.from('activities').select('id, vendor, activity_date, created_at, type, description, opportunity_id')
      .gte('activity_date', ontem).limit(1000),
    cli.from('scale_evidence').select('id, vendor, opportunity_id, escala, de, para, transcricao, created_at')
      .gte('created_at', `${ontem}T00:00:00-03:00`).limit(500),
  ])

  const flags: Array<{ vendor: string; padrao: string; detalhe: Record<string, unknown> }> = []

  // Ráfaga: ordena por vendedor y busca ventanas de 10 min con >6 registros.
  const porVendedor = new Map<string, number[]>()
  for (const a of (ativs.data ?? []) as Array<{ vendor: string | null; created_at: string | null }>) {
    if (a.vendor === null || a.created_at === null) continue
    const t = Date.parse(a.created_at)
    if (Number.isNaN(t)) continue
    const lista = porVendedor.get(a.vendor) ?? []
    lista.push(t)
    porVendedor.set(a.vendor, lista)
  }
  for (const [vendor, tempos] of porVendedor) {
    tempos.sort((x, y) => x - y)
    for (let i = 6; i < tempos.length; i += 1) {
      const fim = tempos[i]
      const comeco = tempos[i - 6]
      if (fim === undefined || comeco === undefined) continue
      if (fim - comeco < 10 * 60_000) {
        flags.push({ vendor, padrao: 'rajada_de_registros', detalhe: { janela_min: 10, registros: 7 } })
        break
      }
    }
  }

  // Salto de escala de +3 sin transcripción.
  for (const e of (evid.data ?? []) as Array<{
    vendor: string | null; opportunity_id: number | null; escala: string
    de: number | null; para: number | null; transcricao: string | null
  }>) {
    if (e.vendor === null || e.de === null || e.para === null) continue
    const salto = e.para - e.de
    const semTexto = e.transcricao === null || e.transcricao.trim().length < 40
    if (salto >= 3 && semTexto) {
      flags.push({
        vendor: e.vendor,
        padrao: 'salto_de_escala_sem_prova',
        detalhe: { opportunity_id: e.opportunity_id, escala: e.escala, de: e.de, para: e.para },
      })
    }
  }

  // Reunión "realizada" sin artefacto.
  for (const a of (ativs.data ?? []) as Array<{
    vendor: string | null; type: string | null; description: string | null; opportunity_id: number | null
  }>) {
    if (a.vendor === null || a.type !== 'meeting') continue
    if ((a.description ?? '').trim().length < 60) {
      flags.push({
        vendor: a.vendor,
        padrao: 'reuniao_sem_artefato',
        detalhe: { opportunity_id: a.opportunity_id },
      })
    }
  }

  if (flags.length > 0) {
    const { error } = await cli.from('ventus_audit').insert(
      flags.map((f) => ({
        actor: 'cron',
        evento: 'flag_calibracao',
        entity_kind: 'vendor',
        entity_id: f.vendor,
        contexto: { padrao: f.padrao, dia: ontem, ...f.detalhe, nunca_penaliza_sozinho: true },
      })),
    )
    if (error) console.error(`[dispatch/jobs] ventus_audit: ${error.code} ${error.message}`)
  }

  // Deliberadamente NO devuelve avisos: el vendedor no recibe nada. Esto entra
  // a la cola de calibración del gestor y se discute con la persona delante.
  return []
}

/* ══════════════════════════════════════════════════════════════════════════
   Router
   ══════════════════════════════════════════════════════════════════════════ */

type Job = (agora: Date, cli: SupabaseClient) => Promise<NovoAviso[]>

export const JOBS: Readonly<Record<string, Job>> = {
  'fila-golden': jobFilaGolden,
  'golden-t15': jobGoldenT15,
  'agenda-manha': jobAgendaManha,
  'preparo-reuniao': jobPreparoReuniao,
  risco: jobRisco,
  veredicto: jobVeredicto,
  trofeus: jobTrofeus,
  encerramento: jobEncerramento,
  auditoria: jobAuditoria,
}

export const NOMES_DE_JOB: readonly string[] = Object.keys(JOBS)

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')
  exigirCron(req)

  const bruto = req.query['job']
  const nome = Array.isArray(bruto) ? bruto[0] : bruto
  if (nome === undefined || !Object.prototype.hasOwnProperty.call(JOBS, nome)) {
    throw pedidoInvalido(`Job desconhecido. Válidos: ${NOMES_DE_JOB.join(', ')}.`, 'job_invalido')
  }

  const cli = db()
  const agora = new Date()
  const job = JOBS[nome]
  if (job === undefined) throw pedidoInvalido('Job desconhecido.', 'job_invalido')

  const avisos = await job(agora, cli)
  const resultado = await enfileirarVarios(avisos, cli)

  const resumo: ResumoDoJob = {
    job: nome,
    em: agora.toISOString(),
    vendedores: new Set(avisos.map((a) => a.vendor)).size,
    ...resultado,
  }
  res.status(200).json(resumo)
}

export default rota('dispatch/jobs', handler)
