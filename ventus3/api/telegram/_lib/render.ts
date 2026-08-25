// api/telegram/_lib/render.ts
// Todo el texto que ve el vendedor. PT-BR, HTML de Telegram, sin markdown.
//
// Dos reglas que valen para cada función de este archivo:
//   · Todo dato de la base pasa por `esc()`. Un cliente llamado «Móveis & Cia»
//     rompe el `parse_mode: HTML` y Telegram rechaza el mensaje entero.
//   · Ningún mensaje termina sin una acción. «Abra o app» no es una acción.

import type { Commitment, IsoDate, Lead, PlannedAction } from '../../../src/core'
import {
  CHANNEL_LABELS,
  LEAD_STAGE_LABELS,
  RING_LABELS,
  SCALE_LABELS,
  TOUCHPOINT_RESULT_LABELS,
  draftForStep,
  formatarBRL,
  formatarDataCurta,
  proximoTouchpoint,
  resumirMotivos,
} from '../../../src/core'
import { optionalEnv } from '../../_lib/env'
import type { AcaoDeCallback } from './callback'
import { montarCallback } from './callback'
import type { FichaDeStatus, LinhaDePipeline, Parada, Pendencia } from './dados'
import type { RascunhoDeRegistro } from './sessoes'
import type { BotaoInline, TecladoInline } from './tg'
import { esc } from './tg'

/* ══════════════════════════════════════════════════════════════════════════
   Iconografía
   ══════════════════════════════════════════════════════════════════════════ */

export const ICONE_TIPO: Readonly<Record<string, string>> = {
  call: '📞',
  email: '📧',
  meeting: '🤝',
  whatsapp: '💬',
  linkedin: '💼',
  demo: '🖥',
  test: '🧪',
  proposal: '📄',
  negotiation: '💰',
  note: '📝',
  ai_suggestion: '🤖',
  stage_change: '📈',
}

export const ICONE_RESULTADO: Readonly<Record<string, string>> = {
  positivo: '✅',
  neutro: '➡️',
  negativo: '❌',
  pendente: '⏳',
}

const ICONE_URGENCIA: Readonly<Record<string, string>> = {
  critica: '🔴',
  alta: '🟠',
  media: '🟡',
  baixa: '⚪️',
}

export function urlDoApp(caminho: string): string {
  const base = optionalEnv('APP_URL') ?? 'https://ventus.ventapel.com.br'
  return `${base.replace(/\/$/, '')}${caminho}`
}

/* ══════════════════════════════════════════════════════════════════════════
   Teclados
   ══════════════════════════════════════════════════════════════════════════ */

export function teclado(...linhas: BotaoInline[][]): TecladoInline {
  return { inline_keyboard: linhas.filter((l) => l.length > 0) }
}

export function botao(texto: string, acao: AcaoDeCallback): BotaoInline {
  return { text: texto, callback_data: montarCallback(acao) }
}

export function botaoUrl(texto: string, url: string): BotaoInline {
  return { text: texto, url }
}

/* ══════════════════════════════════════════════════════════════════════════
   O gate de próxima ação — BOTÕES, não texto livre
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Los cuatro atajos del plano. Son exactamente los mismos de `DatePills` en la
 * app y los mismos de `resolveShortcut` en el dominio: Hoje, Amanhã, Segunda,
 * +7 dias. Pedirlo en texto libre dejaba el 43% de las respuestas incompletas
 * (7 de 16 medidas en `bot_log`), porque la gente contesta «ligo pra ele» sin
 * fecha y el registro se queda a medias.
 */
export const ATALHOS_DO_GATE = [
  { acao: 'hoje', rotulo: 'Hoje' },
  { acao: 'amanha', rotulo: 'Amanhã' },
  { acao: 'segunda', rotulo: 'Segunda' },
  { acao: 'mais7', rotulo: '+7 dias' },
] as const

export type AtalhoDoGate = (typeof ATALHOS_DO_GATE)[number]['acao']

export function ehAtalhoDoGate(valor: string): valor is AtalhoDoGate {
  return ATALHOS_DO_GATE.some((a) => a.acao === valor)
}

export function tecladoDoGate(chave: string, fp: string): TecladoInline {
  const b = (a: (typeof ATALHOS_DO_GATE)[number]): BotaoInline =>
    botao(a.rotulo, { ns: 'na', id: chave, acao: a.acao, fp })
  return teclado(
    [b(ATALHOS_DO_GATE[0]), b(ATALHOS_DO_GATE[1])],
    [b(ATALHOS_DO_GATE[2]), b(ATALHOS_DO_GATE[3])],
  )
}

export function textoDoGate(rotuloCliente: string, proximaAcao: string | null): string {
  return [
    `📝 Anotei o contato com <b>${esc(rotuloCliente)}</b>.`,
    '',
    proximaAcao
      ? `⏭ Próxima ação: <b>${esc(proximaAcao)}</b>`
      : '⏭ <b>Qual é a próxima ação?</b> Pode responder por texto ou áudio.',
    'Falta a <b>data</b>. Toca num botão — nenhum registro fecha sem próxima ação com data. 😉',
  ].join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   Confirmação do registro
   ══════════════════════════════════════════════════════════════════════════ */

export function textoDaConfirmacao(rascunho: RascunhoDeRegistro): string {
  const alvo = rascunho.alvo
  const linhas: string[] = [
    '📋 <b>Confirmar registro</b>',
    `🏢 ${esc(alvo?.rotulo ?? '?')}${alvo?.kind === 'lead' ? ' <i>(lead)</i>' : ''}`,
    `${ICONE_TIPO[rascunho.tipo] ?? '📝'} ${esc(rascunho.tipo)} — ${esc(rascunho.resumo)}`,
    `${ICONE_RESULTADO[rascunho.resultado] ?? '➡️'} Resultado: <b>${esc(rascunho.resultado)}</b>` +
      (rascunho.resultadoNota ? ` — ${esc(rascunho.resultadoNota)}` : ''),
  ]

  if (rascunho.proximaAcao && rascunho.proximaAcaoData) {
    linhas.push(
      `⏭ ${esc(rascunho.proximaAcao)} — <b>${esc(formatarDataCurta(rascunho.proximaAcaoData as IsoDate))}</b>`,
    )
  }
  if (rascunho.escalas.length > 0) {
    const escalas = rascunho.escalas
      .map((e) => `<b>${esc(SCALE_LABELS[e.escala])}</b> ${e.para}`)
      .join(' · ')
    linhas.push(`📊 Pepito: ${escalas}`)
    linhas.push(`<i>com citação do cliente — o score só muda se você confirmar</i>`)
  }
  if (rascunho.contatos.length > 0) {
    linhas.push(`👤 ${rascunho.contatos.map((c) => `${esc(c.nome)} (${esc(c.papel)})`).join(' · ')}`)
  }
  return linhas.join('\n')
}

export function tecladoDaConfirmacao(chave: string, fp: string): TecladoInline {
  return teclado([
    botao('✅ Confirmar', { ns: 'reg', id: chave, acao: 'ok', fp }),
    botao('✏️ Corrigir', { ns: 'reg', id: chave, acao: 'edit', fp }),
    botao('❌ Cancelar', { ns: 'reg', id: chave, acao: 'x', fp }),
  ])
}

export function tecladoDeCandidatos(
  chave: string,
  fp: string,
  candidatos: readonly { rotulo: string }[],
): TecladoInline {
  const linhas = candidatos
    .slice(0, 5)
    .map((c, i) => [botao(c.rotulo.slice(0, 55), { ns: 'reg', id: chave, acao: `p${i}`, fp })])
  linhas.push([botao('❌ Nenhum desses', { ns: 'reg', id: chave, acao: 'pn', fp })])
  return teclado(...linhas)
}

/* ══════════════════════════════════════════════════════════════════════════
   /hoje — os 3 cards em UM mensagem
   ══════════════════════════════════════════════════════════════════════════ */

export function textoDoHoje(vendor: string, hoje: IsoDate, acoes: readonly PlannedAction[]): string {
  if (acoes.length === 0) {
    return [
      `☀️ <b>Hoje, ${esc(vendor)}</b> — ${esc(formatarDataCurta(hoje))}`,
      '',
      '👌 Nenhuma ação prioritária hoje. Ou está tudo em dia, ou falta agendar próximas ações.',
      'Use /pipeline pra ver o funil ou /golden pra prospectar.',
    ].join('\n')
  }

  const linhas: string[] = [`☀️ <b>Hoje, ${esc(vendor)}</b> — ${esc(formatarDataCurta(hoje))}`, '']
  acoes.forEach((a, i) => {
    linhas.push(
      `${ICONE_URGENCIA[a.urgencia] ?? '⚪️'} <b>${i + 1}. ${esc(a.entidade.cliente)}</b>`,
      `   ${esc(a.acao)}`,
      `   <i>${esc(resumirMotivos(a))}</i>`,
      '',
    )
  })
  linhas.push('Toca num botão pra resolver o primeiro. Os outros ficam aqui.')
  return linhas.join('\n')
}

/**
 * Los botones del `/hoje`. Uno por acción, en su propia fila, con la huella
 * del estado de la entidad: si alguien ya la resolvió desde la app, el botón
 * viejo responde «esta ação já foi feita» en vez de duplicar.
 */
export function tecladoDoHoje(
  acoes: readonly PlannedAction[],
  fps: ReadonlyMap<string, string>,
): TecladoInline {
  const linhas: BotaoInline[][] = []
  acoes.forEach((a, i) => {
    const ns = a.entidade.kind === 'lead' ? 'lead' : 'opp'
    const id = String(a.entidade.id)
    const fp = fps.get(`${ns}:${id}`) ?? 'v0'
    linhas.push([
      botao(`✅ ${i + 1} Feito`, { ns, id, acao: 'done', fp }),
      botao('⏰ Amanhã', { ns, id, acao: 'amanha', fp }),
      botao('🎙 Registrar', { ns, id, acao: 'reg', fp }),
    ])
  })
  const primeira = acoes[0]
  if (primeira) {
    const caminho =
      primeira.entidade.kind === 'lead' ? '/cadencia' : `/carteira/${primeira.entidade.id}`
    linhas.push([botaoUrl('📋 Abrir no app', urlDoApp(caminho))])
  }
  return teclado(...linhas)
}

/* ══════════════════════════════════════════════════════════════════════════
   /golden — um lead por mensagem, com o rascunho pronto
   ══════════════════════════════════════════════════════════════════════════ */

export function textoDoGolden(lead: Lead, indice: number, total: number, feitos: number): string {
  const passo = proximoTouchpoint(lead)
  const linhas: string[] = [
    `⚡️ <b>Golden Hour</b> — ${indice + 1}/${total} · ${feitos} toque(s) feitos`,
    '',
    `🏢 <b>${esc(lead.company_name)}</b>${lead.contact_name ? ` · ${esc(lead.contact_name)}` : ''}`,
    `📍 ${esc(LEAD_STAGE_LABELS[lead.stage])} · TP ${lead.touchpoints_count}/7`,
  ]
  if (passo) {
    linhas.push(`📨 Canal de agora: <b>${esc(CHANNEL_LABELS[passo.channel])}</b> — ${esc(passo.label)}`)
    linhas.push('', '<b>Rascunho:</b>', `<code>${esc(draftForStep(lead, passo))}</code>`)
  } else {
    linhas.push('', 'Cadência esgotada: arquiva e recicla, não insiste.')
  }
  return linhas.join('\n')
}

export function tecladoDoGolden(chave: string, leadId: number, fp: string): TecladoInline {
  return teclado(
    [
      botao('💬 Respondeu', { ns: 'gh', id: chave, acao: 'resp', fp }),
      botao('🤝 Reunião', { ns: 'gh', id: chave, acao: 'meet', fp }),
    ],
    [
      botao('🔇 Sem resposta', { ns: 'gh', id: chave, acao: 'nores', fp }),
      botao('⏭ Pular', { ns: 'gh', id: chave, acao: 'skip', fp }),
    ],
    [
      botao('🏁 Encerrar sessão', { ns: 'gh', id: chave, acao: 'stop', fp }),
      botaoUrl('📋 Abrir no app', urlDoApp(`/cadencia?lead=${leadId}`)),
    ],
  )
}

export function textoDoFechamentoGolden(feitos: number, total: number): string {
  return [
    '🏁 <b>Golden Hour encerrada</b>',
    `${feitos} de ${total} contatos trabalhados.`,
    feitos >= 10
      ? 'Hora Cheia. A racha conta esse dia. 🔥'
      : 'Faltou pra Hora Cheia (10 toques + 1 conversa + debrief). Amanhã tem outra.',
  ].join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   /status
   ══════════════════════════════════════════════════════════════════════════ */

export function textoDoStatus(ficha: FichaDeStatus): string {
  const linhas: string[] = [`📌 <b>${esc(ficha.rotulo)}</b>`]

  if (ficha.kind === 'opportunity') {
    linhas.push(
      `Etapa ${ficha.etapa ?? '?'} · ${esc(ficha.etapaNome)} · ${esc(formatarBRL(ficha.valor))}`,
      '',
      '<b>PPVVCC</b> (saúde declarada ' + ficha.saudeDeclarada.toFixed(1) + '/10)',
      ficha.escalas
        .map((e) => `${esc(SCALE_LABELS[e.escala as keyof typeof SCALE_LABELS] ?? e.escala)} ${e.nivel}`)
        .join(' · '),
    )
    if (ficha.gates.length > 0) {
      linhas.push('', '🚧 <b>O que trava o avanço</b>')
      for (const g of ficha.gates) linhas.push(`• ${esc(g)}`)
    } else {
      linhas.push('', '✅ Gate da etapa cumprido — dá pra avançar.')
    }
  } else {
    const t = ficha.toques
    linhas.push(
      `Lead de prospecção · ${esc(ficha.etapaNome)}` +
        (t ? ` · TP ${t.feitos}/${t.total}` : ''),
    )
    if (t && t.proximoCanal) {
      linhas.push(
        `📨 Próximo toque: ${esc(CHANNEL_LABELS[t.proximoCanal as keyof typeof CHANNEL_LABELS] ?? t.proximoCanal)}` +
          (t.atraso > 0 ? ` — <b>${t.atraso} dia(s) atrasado</b>` : ''),
      )
    }
  }

  linhas.push(
    '',
    ficha.diasSemContato < 0
      ? '🕰 Sem nenhum contato registrado ainda.'
      : `🕰 <b>${ficha.diasSemContato} dia(s)</b> sem contato real.`,
  )

  if (ficha.contatos.length > 0) {
    linhas.push('', `👤 ${ficha.contatos.map((c) => esc(c)).join(' · ')}`)
  } else if (ficha.kind === 'opportunity') {
    linhas.push('', '⚠️ <b>Single-threaded</b>: nenhum contato mapeado.')
  }

  linhas.push(
    '',
    ficha.proximaAcao
      ? `⏭ ${esc(ficha.proximaAcao.texto)} — ${
          ficha.proximaAcao.data ? esc(formatarDataCurta(ficha.proximaAcao.data as IsoDate)) : '<b>SEM DATA</b>'
        }`
      : '⏭ <b>Sem próxima ação.</b> Isso é o que trava o negócio.',
  )

  if (ficha.ultimasAtividades.length > 0) {
    linhas.push('', '<b>Últimos registros</b>')
    for (const a of ficha.ultimasAtividades) {
      const icone = ICONE_TIPO[a.tipo] ?? ICONE_RESULTADO[a.resultado ?? ''] ?? '•'
      const res = a.resultado ? ` → ${esc(TOUCHPOINT_RESULT_LABELS[a.resultado as never] ?? a.resultado)}` : ''
      linhas.push(`${icone} ${esc(a.data)} ${esc(a.descricao.slice(0, 120))}${res}`)
    }
  }
  return linhas.join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   Consultas de lista
   ══════════════════════════════════════════════════════════════════════════ */

const MAX_LINHAS = 15

export function textoDePendentes(pend: readonly Pendencia[], hoje: IsoDate, admin: boolean): string {
  if (pend.length === 0) {
    return '👌 Nada com data até domingo. Ou está tudo em dia, ou falta agendar próximas ações — /pipeline mostra quantas estão sem data.'
  }
  const linhas = [`📅 <b>Pendências até domingo</b> (${pend.length})`, '']
  for (const p of pend.slice(0, MAX_LINHAS)) {
    const quando = p.data ? formatarDataCurta(p.data as IsoDate, hoje) : 'sem data'
    const dono = admin ? ` <i>(${esc(p.vendor)})</i>` : ''
    linhas.push(`${p.vencida ? '⚠️' : '•'} ${esc(quando)} — <b>${esc(p.rotulo)}</b>${dono}: ${esc(p.texto)}`)
  }
  if (pend.length > MAX_LINHAS) linhas.push(`… e mais ${pend.length - MAX_LINHAS}`)
  return linhas.join('\n')
}

export function textoDeParados(paradas: readonly Parada[], dias: number, admin: boolean): string {
  if (paradas.length === 0) return `👌 Nenhuma oportunidade viva parada há mais de ${dias} dias.`
  const linhas = [`🥶 <b>Sem contato há mais de ${dias} dias</b> (${paradas.length})`, '']
  for (const p of paradas.slice(0, MAX_LINHAS)) {
    const dono = admin ? ` <i>(${esc(p.vendor)})</i>` : ''
    linhas.push(`• <b>${esc(p.rotulo)}</b>${dono} — ${p.dias} dias · ${esc(p.etapa)} · ${esc(formatarBRL(p.valor))}`)
  }
  if (paradas.length > MAX_LINHAS) linhas.push(`… e mais ${paradas.length - MAX_LINHAS}`)
  return linhas.join('\n')
}

export function textoDoPipeline(
  linhasPipe: readonly LinhaDePipeline[],
  total: { quantidade: number; valor: number },
  semProximaAcao: number,
  admin: boolean,
): string {
  if (total.quantidade === 0) return '📊 Nenhuma oportunidade viva na carteira.'
  const linhas = [`📊 <b>Pipeline${admin ? ' (time todo)' : ''}</b>`, '']
  for (const l of linhasPipe) {
    linhas.push(`${l.etapa}. ${esc(l.nome)}: <b>${l.quantidade}</b> — ${esc(formatarBRL(l.valor))}`)
  }
  linhas.push('', `<b>Total: ${total.quantidade} — ${esc(formatarBRL(total.valor))}</b>`)
  if (semProximaAcao > 0) {
    linhas.push('', `⚠️ <b>${semProximaAcao}</b> sem próxima ação com data. É o número que o Ventus existe pra mover.`)
  }
  return linhas.join('\n')
}

const ICONE_COMPROMISSO: Readonly<Record<string, string>> = {
  pending: '⏳',
  done: '✅',
  partial: '🟡',
  missed: '❌',
  cancelled: '➖',
}

export function textoDeCompromissos(comps: readonly Commitment[], admin: boolean): string {
  if (comps.length === 0) {
    return '🤝 Nenhum compromisso desta semana nem da passada. Os 3 da segunda se declaram em /compromissos.'
  }
  const linhas = ['🤝 <b>Compromissos</b>', '']
  for (const c of comps.slice(0, MAX_LINHAS)) {
    const dono = admin ? `<b>${esc(c.vendor)}</b>: ` : ''
    const prazo = c.due_date ? ` (até ${esc(formatarDataCurta(c.due_date as IsoDate))})` : ''
    linhas.push(`${ICONE_COMPROMISSO[c.status] ?? '•'} ${dono}${esc(c.committed_action)}${prazo}`)
  }
  return linhas.join('\n')
}

export function tecladoDeVeredicto(comps: readonly Commitment[], fp: string): TecladoInline {
  const pendentes = comps.filter((c) => c.status === 'pending').slice(0, 3)
  const linhas = pendentes.map((c) => [
    botao(`✅ ${c.committed_action.slice(0, 20)}`, { ns: 'cmp', id: String(c.id), acao: 'done', fp }),
    botao('🟡 Parcial', { ns: 'cmp', id: String(c.id), acao: 'partial', fp }),
    botao('❌ Não', { ns: 'cmp', id: String(c.id), acao: 'missed', fp }),
  ])
  return teclado(...linhas)
}

/* ══════════════════════════════════════════════════════════════════════════
   /anel · /placar
   ══════════════════════════════════════════════════════════════════════════ */

function barra(ratio: number): string {
  const cheios = Math.max(0, Math.min(10, Math.round(ratio * 10)))
  return '█'.repeat(cheios) + '░'.repeat(10 - cheios)
}

export function textoDosAneis(
  aneis: { contato: { current: number; goal: number; ratio: number }; conversa: { current: number; goal: number; ratio: number }; avanco: { current: number; goal: number; ratio: number }; fechado: boolean },
  sequencia: { exibicao: number; texto: string; proximoMarco: { marco: number; faltam: number } | null },
): string {
  const linha = (k: 'contato' | 'conversa' | 'avanco'): string =>
    `${esc(RING_LABELS[k])}  <code>${barra(aneis[k].ratio)}</code> ${aneis[k].current}/${aneis[k].goal}`

  const linhas = [
    '🎯 <b>Seus três anéis de hoje</b>',
    '',
    linha('contato'),
    linha('conversa'),
    linha('avanco'),
    '',
    aneis.fechado ? '🔥 Três anéis fechados hoje.' : 'Falta fechar. O anel de Avanço é o que conta de verdade.',
    '',
    `⚡️ ${esc(sequencia.texto)}`,
  ]
  if (sequencia.proximoMarco) {
    linhas.push(`Faltam ${sequencia.proximoMarco.faltam} dia(s) úteis pro marco de ${sequencia.proximoMarco.marco}.`)
  }
  return linhas.join('\n')
}

export function textoDoPlacar(
  vendor: string,
  pa: number,
  dias: readonly { rings: { contato: { current: number }; conversa: { current: number }; avanco: { current: number } } }[],
  trofeus: readonly { trophy: string; vendor: string; detail: string }[],
): string {
  const soma = (k: 'contato' | 'conversa' | 'avanco'): number =>
    dias.reduce((s, d) => s + d.rings[k].current, 0)

  const linhas = [
    `🏅 <b>Placar da semana — ${esc(vendor)}</b>`,
    '',
    `Pontos de Avanço: <b>${pa}</b>`,
    `Contatos ${soma('contato')} · Conversas ${soma('conversa')} · Avanços ${soma('avanco')}`,
  ]
  if (trofeus.length > 0) {
    linhas.push('', '<b>Troféus (prévia — os oficiais saem sexta)</b>')
    for (const t of trofeus) linhas.push(`• ${esc(t.trophy)}: <b>${esc(t.vendor)}</b> — ${esc(t.detail)}`)
  }
  linhas.push('', 'Comparação é com você mesmo. Ninguém aparece em último aqui.')
  return linhas.join('\n')
}

/* ══════════════════════════════════════════════════════════════════════════
   Ajuda
   ══════════════════════════════════════════════════════════════════════════ */

export function textoDeAjuda(vendor: string): string {
  return [
    `🤖 <b>Ventus</b> — oi, ${esc(vendor)}!`,
    '',
    '🎙 <b>Registrar:</b> logo depois da visita ou da ligação, manda um áudio de ~40s: qual cliente, o que aconteceu, qual a próxima ação e quando. Texto também vale, e dá pra colar um e-mail ou um WhatsApp do cliente.',
    '',
    '<b>Comandos</b>',
    '/hoje — as 3 ações do dia, com botões',
    '/golden — sessão de prospecção, um lead por vez',
    '/status &lt;cliente&gt; — escalas, gate e dias sem contato',
    '/pendentes — o que tem data até domingo',
    '/parados [dias] — oportunidades sem contato',
    '/pipeline — o funil e quantas estão sem data',
    '/compromissos — os 3 da segunda e o veredicto',
    '/anel · /placar — anéis, racha e troféus',
    '/desfazer — reverte o último registro confirmado',
    '/vincular &lt;código&gt; — conecta este Telegram ao seu usuário',
    '',
    'Regras do jogo: todo contato registrado no mesmo dia, e nenhuma oportunidade viva sem próxima ação com data. 😉',
  ].join('\n')
}

export function textoNaoVinculado(telegramUserId: number): string {
  return [
    '👋 Este Telegram ainda não está ligado ao Ventus.',
    '',
    'No app: <b>Ajustes → Telegram → Gerar código</b>. Depois manda aqui:',
    '<code>/vincular 123456</code>',
    '',
    `<i>Seu Telegram ID: ${telegramUserId}</i>`,
  ].join('\n')
}
