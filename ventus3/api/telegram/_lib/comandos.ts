// api/telegram/_lib/comandos.ts
// Los comandos del bot. Cada uno termina en una ACCIÓN, nunca en «abra o app».
//
// Los cinco de lectura del v2 (`pendentes`, `status`, `sem toque`, `pipeline`,
// `compromissos`) siguen respondiendo igual, pero ahora salen del MISMO
// dominio que la app: `rankDay()`, `gatesFaltantes()`, `anelDoDia()`,
// `estadoDaSequencia()`. No hay un segundo motor de priorización en el bot.

import type { IsoDate } from '../../../src/core'
import { MAX_TOUCHPOINTS, addDays, todayBr } from '../../../src/core'
import { ErroDeTool } from '../../_lib/tools'
import type { CanalDoVendedor } from './identidade'
import {
  aneisDeHoje,
  buscarPorNome,
  carteiraDoBot,
  compromissosDaSemana,
  fichaDeStatus,
  filaGolden,
  paradas,
  pendencias,
  pipeline,
  placarDaSemana,
  planoDoDia,
  sequenciaDoVendedor,
} from './dados'
import { fpLead, fpOportunidade, fingerprint } from './callback'
import {
  botaoUrl,
  teclado,
  tecladoDeVeredicto,
  tecladoDoGolden,
  tecladoDoHoje,
  textoDeAjuda,
  textoDeCompromissos,
  textoDeParados,
  textoDePendentes,
  textoDoGolden,
  textoDoHoje,
  textoDoPipeline,
  textoDoPlacar,
  textoDoStatus,
  textoDosAneis,
  urlDoApp,
} from './render'
import { chaveDeSessao, gravarSessao } from './sessoes'
import type { ExtraDeMensagem } from './tg'
import { esc } from './tg'

export interface RespostaDeComando {
  texto: string
  extra?: ExtraDeMensagem
  /** Cómo cerrar la fila de `bot_log`. */
  outcome: string
}

/* ══════════════════════════════════════════════════════════════════════════
   /hoje
   ══════════════════════════════════════════════════════════════════════════ */

export async function comandoHoje(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const acoes = planoDoDia(carteira)

  // La huella de cada tarjeta: si alguien resuelve la acción desde la app, el
  // botón de este mensaje deja de valer y lo dice en vez de duplicar.
  const fps = new Map<string, string>()
  for (const a of acoes) {
    if (a.entidade.kind === 'lead') {
      const l = carteira.leads.find((x) => x.id === a.entidade.id)
      if (l) fps.set(`lead:${l.id}`, fpLead(l))
    } else {
      const o = carteira.oportunidades.find((x) => x.id === a.entidade.id)
      if (o) fps.set(`opp:${o.id}`, fpOportunidade(o))
    }
  }

  return {
    texto: textoDoHoje(canal.vendorName, carteira.hoje as IsoDate, acoes),
    extra: acoes.length > 0 ? { reply_markup: tecladoDoHoje(acoes, fps) } : undefined,
    outcome: 'cmd_hoje',
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /golden
   ══════════════════════════════════════════════════════════════════════════ */

export async function comandoGolden(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const fila = filaGolden(carteira)

  if (fila.length === 0) {
    return {
      texto: [
        '⚡️ <b>Golden Hour</b>',
        '',
        'Nenhum lead com toque pendente hoje. Puxa empresas do mapa de mercado no app pra encher a fila de amanhã.',
      ].join('\n'),
      extra: { reply_markup: teclado([botaoUrl('📋 Abrir Cadência', urlDoApp('/cadencia'))]) },
      outcome: 'cmd_golden_vazio',
    }
  }

  const chave = chaveDeSessao(canal.chatId, canal.ctx.vendorId ?? 0)
  const primeiro = fila[0]
  if (!primeiro) return { texto: 'Fila vazia.', outcome: 'cmd_golden_vazio' }

  // La fila se CONGELA acá: servir el lead 4 no puede depender de que la cola
  // no se haya movido mientras el vendedor trabajaba los tres primeros.
  await gravarSessao(canal.chatId, canal.ctx.vendorId ?? 0, canal.vendorId, 'golden', {
    tipo: 'golden',
    golden: { fila: fila.map((l) => l.id), indice: 0, comecouEm: new Date().toISOString(), feitos: 0 },
    messageId: null,
  })

  return {
    texto: textoDoGolden(primeiro, 0, fila.length, 0),
    extra: { reply_markup: tecladoDoGolden(chave, primeiro.id, fpLead(primeiro)) },
    outcome: 'cmd_golden',
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /status <cliente>
   ══════════════════════════════════════════════════════════════════════════ */

export async function comandoStatus(
  canal: CanalDoVendedor,
  argumento: string,
): Promise<RespostaDeComando> {
  const nome = argumento.trim()
  if (nome === '') {
    return {
      texto: 'De qual cliente? Ex.: <code>/status GDC</code>',
      outcome: 'cmd_status_sem_alvo',
    }
  }

  const carteira = await carteiraDoBot(canal.ctx)
  let alvo
  try {
    alvo = buscarPorNome(carteira, nome)
  } catch (erro) {
    // `resolverAlvo` lanza con las sugerencias adentro: se muestran tal cual,
    // porque saber cuáles son los parecidos es la mitad de la respuesta.
    const mensagem = erro instanceof ErroDeTool ? erro.message : 'Não encontrei esse cliente na sua carteira.'
    return { texto: `🤔 ${esc(mensagem)}`, outcome: 'cmd_status_nao_encontrado' }
  }

  const ficha = await fichaDeStatus(carteira, alvo)
  if (!ficha) return { texto: '🤔 Não encontrei esse cliente na sua carteira.', outcome: 'cmd_status_nao_encontrado' }

  const caminho = ficha.kind === 'opportunity' ? `/carteira/${alvo.id}` : `/cadencia?lead=${alvo.id}`
  return {
    texto: textoDoStatus(ficha),
    extra: { reply_markup: teclado([botaoUrl('📋 Abrir no app', urlDoApp(caminho))]) },
    outcome: 'cmd_status',
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /pendentes · /parados · /pipeline · /compromissos
   ══════════════════════════════════════════════════════════════════════════ */

export async function comandoPendentes(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const lista = pendencias(carteira)
  return {
    texto: textoDePendentes(lista, carteira.hoje as IsoDate, canal.isAdmin),
    outcome: 'cmd_pendentes',
  }
}

export async function comandoParados(
  canal: CanalDoVendedor,
  argumento: string,
): Promise<RespostaDeComando> {
  const pedido = Number.parseInt(argumento.trim(), 10)
  const dias = Number.isFinite(pedido) && pedido > 0 && pedido <= 365 ? pedido : 15
  const carteira = await carteiraDoBot(canal.ctx)
  return {
    texto: textoDeParados(paradas(carteira, dias), dias, canal.isAdmin),
    outcome: 'cmd_parados',
  }
}

export async function comandoPipeline(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const p = pipeline(carteira)
  return {
    texto: textoDoPipeline(p.linhas, p.total, p.semProximaAcao, canal.isAdmin),
    extra: { reply_markup: teclado([botaoUrl('📋 Abrir carteira', urlDoApp('/carteira'))]) },
    outcome: 'cmd_pipeline',
  }
}

export async function comandoCompromissos(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const comps = compromissosDaSemana(carteira)
  const pendentes = comps.filter((c) => c.status === 'pending')
  const fp = fingerprint(pendentes.map((c) => `${c.id}:${c.status}`).join('|'))

  return {
    texto: textoDeCompromissos(comps, canal.isAdmin),
    extra:
      pendentes.length > 0 && !canal.isAdmin
        ? { reply_markup: tecladoDeVeredicto(comps, fp) }
        : undefined,
    outcome: 'cmd_compromissos',
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   /anel · /placar
   ══════════════════════════════════════════════════════════════════════════ */

export async function comandoAnel(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const aneis = aneisDeHoje(carteira)
  const sequencia = await sequenciaDoVendedor(canal.vendorName, carteira.hoje as IsoDate)
  return { texto: textoDosAneis(aneis, sequencia), outcome: 'cmd_anel' }
}

export async function comandoPlacar(canal: CanalDoVendedor): Promise<RespostaDeComando> {
  const carteira = await carteiraDoBot(canal.ctx)
  const { dias, pa } = placarDaSemana(carteira)
  // Los troféus oficiales los revela el cron `weekly-awards` los viernes. El
  // bot no fabrica una comparación entre personas por su cuenta: mostrar una
  // prévia distinta de la oficial es peor que no mostrar nada.
  return { texto: textoDoPlacar(canal.vendorName, pa, dias, []), outcome: 'cmd_placar' }
}

/* ══════════════════════════════════════════════════════════════════════════
   /ajuda
   ══════════════════════════════════════════════════════════════════════════ */

export function comandoAjuda(canal: CanalDoVendedor): RespostaDeComando {
  return { texto: textoDeAjuda(canal.vendorName), outcome: 'cmd_ajuda' }
}

/* ══════════════════════════════════════════════════════════════════════════
   Utilitario compartido
   ══════════════════════════════════════════════════════════════════════════ */

/** Corta `/comando@BotName argumento` en las dos partes. */
export function partirComando(texto: string): { comando: string; argumento: string } {
  const limpo = texto.trim()
  if (!limpo.startsWith('/')) return { comando: '', argumento: limpo }
  const espaco = limpo.indexOf(' ')
  const cru = espaco === -1 ? limpo : limpo.slice(0, espaco)
  const argumento = espaco === -1 ? '' : limpo.slice(espaco + 1).trim()
  const arroba = cru.indexOf('@')
  const comando = (arroba === -1 ? cru : cru.slice(0, arroba)).toLowerCase()
  return { comando, argumento }
}

/** Los leads que quedan por trabajar hoy, para el aviso de cierre de Golden. */
export function restamNaFila(feitos: number, total: number): string {
  const faltam = Math.max(0, total - feitos)
  if (faltam === 0) return 'Fila zerada. 🎯'
  return `Faltam ${faltam} na fila de hoje.`
}

export { addDays, todayBr, MAX_TOUCHPOINTS }
