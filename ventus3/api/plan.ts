// api/plan.ts — o Plano do Dia.
//
// ══════════════════════════════════════════════════════════════════════════
// ESTE ENDPOINT NO PIENSA CON UN MODELO
// ══════════════════════════════════════════════════════════════════════════
// La prioridad la decide `rankDay()` de src/core: función pura, <5 ms, cero
// tokens, y el mismo código que corre offline en el teléfono. El plano lo dice
// con todas las letras («la capa LLM NUNCA decide prioridad sola») y hay una
// razón práctica además de la doctrinaria: el vendedor tiene que poder abrir
// «Por que isto?» y ver una cuenta que cierra. Un ranking que sale de un
// modelo no se puede auditar, no se puede reproducir y cambia de humor.
//
// El modelo solo entra si se pide `narrativa: true`, y solo para REDACTAR en
// lenguaje natural el porqué que el motor ya calculó. Si falla, se devuelve el
// plan igual: la narrativa es un adorno, el plan no.
//
// Es cacheable por vendedor y por día: mismas entradas, misma salida. Se manda
// ETag para que el bot y los rituais no repitan la consulta entera.

import { createHash } from 'node:crypto'
import type { IsoDate, PlannedAction, SaudeDaCarteira } from '../src/core/index.js'
import { analisarCarteira, avaliarRiscos, rankDay, todayBr } from '../src/core/index.js'
import { MODELOS, anthropic, custoUsd, systemComCache, textoDaResposta } from './_lib/anthropic.js'
import { requireAuth } from './_lib/auth.js'
import { carregarCarteira } from './_lib/carteira.js'
import type { ApiHandler } from './_lib/http.js'
import { exigirMetodo, header, lerJson, rota } from './_lib/http.js'
import { checarCota, registrarUso } from './_lib/usage.js'

export interface PlanoRequest {
  /** Hoje em BRT. Si no viene, lo pone el servidor. */
  hoje?: IsoDate
  /** Redactar el porqué en lenguaje natural (gasta tokens). Default false. */
  narrativa?: boolean
  /** Cuántas tarjetas devolver en el top. Default 3, el límite duro de M2. */
  limite?: number
  /** Solo para admin: el plan del equipo entero. */
  todosOsVendedores?: boolean
}

export interface PlanoResponse {
  vendor: string
  hoje: IsoDate
  /** Las 3 acciones del día, ya diversificadas por cliente. */
  top: PlannedAction[]
  /** La lista completa ordenada — alimenta «Ver tudo (17)». */
  todas: PlannedAction[]
  restantes: number
  saude: SaudeDaCarteira
  /** Cuántos riesgos abiertos hay, por severidad. */
  riscos: { criticos: number; atencao: number; total: number }
  /** Redacción del porqué. null cuando no se pidió o cuando el modelo falló. */
  narrativa: string | null
  /** Siempre true: sirve para que el cliente sepa que esto no salió de un LLM. */
  determinista: true
  geradoEm: string
}

/** El plan cambia como mucho una vez por minuto: la cartera no se mueve más. */
const CACHE_SEG = 60

async function redigirNarrativa(
  vendor: string,
  hoje: IsoDate,
  top: readonly PlannedAction[],
): Promise<{ texto: string | null; custo: number; modelo: string }> {
  const modelo = MODELOS.redator
  if (top.length === 0) {
    return { texto: null, custo: 0, modelo: modelo.id }
  }

  const fatos = top
    .map((a, i) => {
      const motivos = a.porque.map((m) => `${m.sinal}: ${m.detalhe} (+${m.peso})`).join(' · ')
      return `${i + 1}. ${a.entidade.cliente} — ${a.acao}\n   score ${a.score} = ${motivos}`
    })
    .join('\n')

  const resposta = await anthropic().messages.create({
    model: modelo.id,
    max_tokens: 700,
    output_config: { effort: 'low' },
    system: systemComCache(
      `Hoje é ${hoje} e o vendedor é ${vendor}.`,
      'Você recebe as 3 ações que o motor determinístico já escolheu, com o score e os fatores que o compõem. Escreva 3 frases curtas em PT-BR — uma por ação — explicando por que ela é a primeira coisa a fazer hoje. Use os números que estão nos fatores. NÃO reordene, NÃO acrescente ações, NÃO invente dados. Sem markdown, sem títulos, sem numeração.',
    ),
    messages: [{ role: 'user', content: `Ações do dia:\n${fatos}` }],
  })

  if (resposta.stop_reason === 'refusal') {
    return { texto: null, custo: 0, modelo: modelo.id }
  }
  return {
    texto: textoDaResposta(resposta) || null,
    custo: custoUsd(modelo, resposta.usage),
    modelo: modelo.id,
  }
}

const handler: ApiHandler = async (req, res) => {
  const comecou = Date.now()
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)

  const corpo = await lerJson<PlanoRequest>(req).catch(() => ({}) as PlanoRequest)
  const hoje = corpo.hoje ?? todayBr()
  const limite = Math.min(Math.max(corpo.limite ?? 3, 1), 10)

  const carteira = await carregarCarteira(ctx, {
    ...(corpo.todosOsVendedores === true ? { todosOsVendedores: true } : {}),
  })

  // ── El motor. Cero tokens. ──
  const plano = rankDay(
    {
      vendor: ctx.vendorName,
      today: hoje,
      opportunities: carteira.oportunidades,
      leads: carteira.leads,
      activities: carteira.atividades,
      tasks: carteira.tarefas,
      commitments: carteira.compromissos,
      touchpoints: carteira.touchpoints,
      vendorInfo: carteira.vendorInfo,
    },
    undefined,
    limite,
  )

  const saude = analisarCarteira(carteira.oportunidades, carteira.atividades, hoje)
  const riscos = carteira.oportunidades.flatMap((o) => avaliarRiscos(o, carteira.atividades, hoje))

  let narrativa: string | null = null
  if (corpo.narrativa === true) {
    await checarCota(ctx, 'plan')
    try {
      const redacao = await redigirNarrativa(ctx.vendorName, hoje, plano.top)
      narrativa = redacao.texto
      await registrarUso({
        vendor: ctx.vendorName,
        bucket: 'plan',
        modelo: redacao.modelo,
        entrada: 0,
        saida: 0,
        cacheEscrito: 0,
        cacheLido: 0,
        custoUsd: redacao.custo,
        duracaoMs: Date.now() - comecou,
        extra: { acoes: plano.top.length },
      })
    } catch (erro) {
      // La narrativa es un adorno: si falla, el plan sale igual.
      console.error('[plan] narrativa falhou:', erro)
    }
  }

  const corpoResposta: PlanoResponse = {
    vendor: ctx.vendorName,
    hoje,
    top: plano.top,
    todas: plano.todas,
    restantes: plano.restantes,
    saude,
    riscos: {
      criticos: riscos.filter((r) => r.severidade === 'critical').length,
      atencao: riscos.filter((r) => r.severidade === 'warning').length,
      total: riscos.length,
    },
    narrativa,
    determinista: true,
    geradoEm: new Date().toISOString(),
  }

  // ETag sobre lo que de verdad determina el plan (no sobre `geradoEm`, que
  // cambiaría en cada request y haría el ETag inútil sin que nadie lo note).
  const etag = `"${createHash('sha1')
    .update(JSON.stringify({ top: plano.top, todas: plano.todas.length, hoje, v: ctx.vendorName }))
    .digest('hex')
    .slice(0, 24)}"`

  res.setHeader('Cache-Control', `private, max-age=${CACHE_SEG}, must-revalidate`)
  res.setHeader('ETag', etag)
  if (header(req, 'if-none-match') === etag) {
    res.status(304).end()
    return
  }
  res.status(200).json(corpoResposta)
}

export default rota('/api/plan', handler)
