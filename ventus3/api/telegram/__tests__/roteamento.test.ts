// api/telegram/__tests__/roteamento.test.ts
// El ruteo del webhook: lo único que `api/telegram.ts` aporta por encima de la
// biblioteca. Se prueban las tres cosas que rompen en producción y en silencio:
//
//   1. EL DEDUP POR `update_id`. Telegram reentrega mientras no vea un 200. Si
//      el claim decide mal, o se pierde un audio (el bug de los 4) o se
//      registra la misma visita dos veces.
//   2. EL PORTERO. Un webhook sin verificación de `secret_token` es una URL
//      pública que escribe en el CRM de cualquiera que la adivine.
//   3. EL DESPACHO. Cada tipo de update tiene que terminar en la pieza que le
//      toca, y el `outcome` con el que se cierra `bot_log` es la prueba
//      auditable de a cuál fue.
//
// Todo lo que sale de la máquina —Telegram, Postgres, Groq, Anthropic— está
// doblado. Lo que se afirma es la DECISIÓN, no que las dependencias funcionen.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarFakeDb, type FakeDb } from '../../__tests__/fake-supabase.js'
import type { CanalDoVendedor } from '../_lib/identidade.js'
import type { TelegramUpdate } from '../_lib/tg.js'

/* ══════════════════════════════════════════════════════════════════════════
   Dobles
   ══════════════════════════════════════════════════════════════════════════ */

const bd = vi.hoisted(() => ({ atual: null as unknown }))

vi.mock('../../_lib/supabase.js', () => ({
  serviceClient: () => bd.atual,
}))

vi.mock('../_lib/tg.js', async (original) => ({
  ...(await original<typeof import('../_lib/tg.js')>()),
  enviarMensagem: vi.fn(async () => ({ message_id: 9001, chat: { id: 555, type: 'private' } })),
  editarMensagem: vi.fn(async () => undefined),
  responderCallback: vi.fn(async () => undefined),
  baixarArquivo: vi.fn(async () => ({ conteudo: Buffer.alloc(4096), caminho: 'voice/nota.oga' })),
}))

vi.mock('../_lib/identidade.js', async (original) => ({
  ...(await original<typeof import('../_lib/identidade.js')>()),
  canalDoTelegram: vi.fn(async () => null as CanalDoVendedor | null),
  vincularPorCodigo: vi.fn(async () => ({ ok: true as const, vendorName: 'Renata' })),
}))

vi.mock('../_lib/comandos.js', async (original) => {
  const real = await original<typeof import('../_lib/comandos.js')>()
  const falso = (outcome: string) => vi.fn(async () => ({ texto: `<${outcome}>`, outcome }))
  return {
    ...real,
    comandoHoje: falso('cmd_hoje'),
    comandoGolden: falso('cmd_golden'),
    comandoAnel: falso('cmd_anel'),
    comandoPlacar: falso('cmd_placar'),
    comandoCompromissos: falso('cmd_compromissos'),
    comandoStatus: falso('cmd_status'),
    comandoPendentes: falso('cmd_pendentes'),
    comandoParados: falso('cmd_parados'),
    comandoPipeline: falso('cmd_pipeline'),
    comandoAjuda: vi.fn(() => ({ texto: '<cmd_ajuda>', outcome: 'cmd_ajuda' })),
  }
})

const CARTEIRA = {
  vendor: 'Renata',
  vendorInfo: null,
  oportunidades: [
    { id: 42, vendor: 'Renata', client: 'GDC', name: 'GDC', stage: 3, next_action_date: '2026-08-20', next_action_done: false },
  ],
  leads: [{ id: 311, vendor: 'Renata', company_name: 'Alpha', stage: '1a', touchpoints_count: 2 }],
  atividades: [],
  tarefas: [],
  compromissos: [],
  touchpoints: [],
  hoje: '2026-08-26',
}

vi.mock('../_lib/dados.js', async (original) => {
  const real = await original<typeof import('../_lib/dados.js')>()
  return {
    ...real,
    limparMemoDeCarteira: vi.fn(),
    carteiraDoBot: vi.fn(async () => CARTEIRA),
    carteiraParaPrompt: vi.fn(() => 'CARTEIRA'),
    compromissosDaSemana: vi.fn(() => []),
  }
})

vi.mock('../_lib/extracao.js', async (original) => ({
  ...(await original<typeof import('../_lib/extracao.js')>()),
  interpretar: vi.fn(async () => ({ intencao: 'outro' as const, registro: null, consulta: null })),
}))

vi.mock('../_lib/fluxo.js', async (original) => ({
  ...(await original<typeof import('../_lib/fluxo.js')>()),
  marcarAcaoFeita: vi.fn(async () => true),
  adiarPara: vi.fn(async () => true),
  gravarRegistro: vi.fn(),
  toqueDeGolden: vi.fn(async () => true),
  desfazerUltimo: vi.fn(async () => ({ ok: false as const, motivo: 'nada' as const })),
}))

vi.mock('../_lib/sessoes.js', async (original) => ({
  ...(await original<typeof import('../_lib/sessoes.js')>()),
  lerSessao: vi.fn(async () => null),
  gravarSessao: vi.fn(async () => undefined),
  limparSessao: vi.fn(async () => undefined),
}))

vi.mock('../../_lib/groq.js', async (original) => ({
  ...(await original<typeof import('../../_lib/groq.js')>()),
  transcrever: vi.fn(async () => ({ texto: 'visitei a GDC hoje', duracaoMs: 120 })),
}))

vi.mock('../_lib/log.js', async (original) => {
  const real = await original<typeof import('../_lib/log.js')>()
  return {
    ...real,
    reivindicarUpdate: vi.fn(async (u: TelegramUpdate) => ({ decisao: 'novo' as const, updateId: u.update_id })),
    anotarLog: vi.fn(async () => undefined),
    fecharComExito: vi.fn(async () => undefined),
    fecharComErro: vi.fn(async () => undefined),
  }
})

/* Imports DESPUÉS de los mocks. */
const tg = await import('../_lib/tg.js')
const identidade = await import('../_lib/identidade.js')
const comandos = await import('../_lib/comandos.js')
const extracao = await import('../_lib/extracao.js')
const fluxo = await import('../_lib/fluxo.js')
const groq = await import('../../_lib/groq.js')
const log = await import('../_lib/log.js')
const { fpOportunidade, montarCallback } = await import('../_lib/callback.js')
const rota = await import('../../telegram.js')

/* ══════════════════════════════════════════════════════════════════════════
   Utilidades
   ══════════════════════════════════════════════════════════════════════════ */

const SEGREDO = 'segredo-do-webhook-de-teste'

const CANAL: CanalDoVendedor = {
  ctx: { userId: 'auth-1', vendorName: 'Renata', vendorId: 3, isAdmin: false, email: null, expiraEm: 0 },
  vendorId: 3,
  vendorName: 'Renata',
  isAdmin: false,
  chatId: 555,
  capacidades: ['ler', 'registrar', 'confirmar'],
  legado: false,
}

interface RespostaFalsa {
  codigo: number
  corpo: unknown
  cabecalhos: Record<string, string | string[]>
}

function falsaResposta(): { res: Parameters<typeof rota.default>[1]; visto: RespostaFalsa } {
  const visto: RespostaFalsa = { codigo: 0, corpo: null, cabecalhos: {} }
  const res = {
    status(codigo: number) {
      visto.codigo = codigo
      return res
    },
    json(corpo: unknown) {
      visto.corpo = corpo
    },
    send(corpo: string) {
      visto.corpo = corpo
    },
    setHeader(nome: string, valor: string | string[]) {
      visto.cabecalhos[nome] = valor
    },
    end(corpo?: string) {
      if (corpo !== undefined) visto.corpo = corpo
    },
  }
  return { res: res as unknown as Parameters<typeof rota.default>[1], visto }
}

async function webhook(update: unknown, segredo: string = SEGREDO): Promise<RespostaFalsa> {
  const { res, visto } = falsaResposta()
  await rota.default(
    {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': segredo },
      query: {},
      body: update,
    },
    res,
  )
  return visto
}

function mensagem(texto: string, extra: Record<string, unknown> = {}): TelegramUpdate {
  return {
    update_id: 1001,
    message: {
      message_id: 7,
      from: { id: 777, is_bot: false, first_name: 'Renata' },
      chat: { id: 555, type: 'private' },
      text: texto,
      ...extra,
    },
  }
}

function db(): FakeDb {
  return bd.atual as FakeDb
}

/** Último `outcome` con el que se cerró `bot_log`. Es la prueba del despacho. */
function ultimoOutcome(): string | undefined {
  const chamadas = vi.mocked(log.fecharComExito).mock.calls
  return chamadas.at(-1)?.[1]
}

beforeEach(() => {
  bd.atual = criarFakeDb()
  process.env['TELEGRAM_WEBHOOK_SECRET'] = SEGREDO
  vi.mocked(identidade.canalDoTelegram).mockResolvedValue(CANAL)
  vi.mocked(identidade.vincularPorCodigo).mockResolvedValue({ ok: true, vendorName: 'Renata' })
  vi.mocked(extracao.interpretar).mockResolvedValue({ intencao: 'outro', registro: null, consulta: null })
  vi.mocked(groq.transcrever).mockResolvedValue({ texto: 'visitei a GDC hoje', duracaoMs: 120 })
  vi.mocked(log.reivindicarUpdate).mockImplementation(async (u) => ({
    decisao: 'novo',
    updateId: u.update_id,
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})

/* ══════════════════════════════════════════════════════════════════════════
   1 · Clasificación
   ══════════════════════════════════════════════════════════════════════════ */

describe('tipoDeUpdate', () => {
  it('reconhece callback, voz e texto', () => {
    expect(rota.tipoDeUpdate({ update_id: 1, callback_query: { id: 'c', from: { id: 1, is_bot: false } } })).toBe(
      'callback',
    )
    expect(rota.tipoDeUpdate(mensagem('', { voice: { file_id: 'f' } }))).toBe('voice')
    expect(rota.tipoDeUpdate(mensagem('oi'))).toBe('text')
  })

  it('trata a legenda de uma foto como texto', () => {
    const u = mensagem('', { text: undefined, caption: 'visitei a GDC' })
    expect(rota.tipoDeUpdate(u)).toBe('text')
  })

  it('ignora o que não é nem texto nem áudio, e o que veio de outro bot', () => {
    expect(rota.tipoDeUpdate(mensagem(''))).toBe('ignorado')
    expect(rota.tipoDeUpdate({ update_id: 2 })).toBe('ignorado')
    const deBot = mensagem('oi')
    if (deBot.message?.from) deBot.message.from.is_bot = true
    expect(rota.tipoDeUpdate(deBot)).toBe('ignorado')
  })

  it('atende também o edited_message', () => {
    const u: TelegramUpdate = { update_id: 3, edited_message: mensagem('corrigido').message }
    expect(rota.tipoDeUpdate(u)).toBe('text')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · O porteiro
   ══════════════════════════════════════════════════════════════════════════ */

describe('secret_token', () => {
  it('compara em tempo constante e recusa o que não bate', () => {
    expect(rota.segredoValido(SEGREDO, SEGREDO)).toBe(true)
    expect(rota.segredoValido('outro', SEGREDO)).toBe(false)
    // Mesmo tamanho, um byte diferente: o caminho que um `===` otimizaria.
    expect(rota.segredoValido(`${SEGREDO.slice(0, -1)}X`, SEGREDO)).toBe(false)
    expect(rota.segredoValido(undefined, SEGREDO)).toBe(false)
    expect(rota.segredoValido('', SEGREDO)).toBe(false)
  })

  it('responde 401 e NÃO processa quando o secret não bate', async () => {
    const visto = await webhook(mensagem('/hoje'), 'chute')
    expect(visto.codigo).toBe(401)
    expect(log.reivindicarUpdate).not.toHaveBeenCalled()
    expect(comandos.comandoHoje).not.toHaveBeenCalled()
  })

  it('responde 500 e não processa quando a env var não está configurada', async () => {
    delete process.env['TELEGRAM_WEBHOOK_SECRET']
    const visto = await webhook(mensagem('/hoje'))
    expect(visto.codigo).toBe(500)
    expect(log.reivindicarUpdate).not.toHaveBeenCalled()
  })

  it('GET é uma sonda, não um webhook', async () => {
    const { res, visto } = falsaResposta()
    await rota.default({ method: 'GET', headers: {}, query: {} }, res)
    expect(visto.codigo).toBe(200)
    expect(log.reivindicarUpdate).not.toHaveBeenCalled()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · Dedup por update_id
   ══════════════════════════════════════════════════════════════════════════ */

describe('dedup por update_id', () => {
  it('reivindica ANTES de trabalhar', async () => {
    await webhook(mensagem('/hoje'))
    const ordem = vi.mocked(log.reivindicarUpdate).mock.invocationCallOrder[0] as number
    const trabalho = vi.mocked(comandos.comandoHoje).mock.invocationCallOrder[0] as number
    expect(ordem).toBeLessThan(trabalho)
  })

  it('descarta o reenvio marcado como duplicado sem tocar em nada', async () => {
    vi.mocked(log.reivindicarUpdate).mockResolvedValue({ decisao: 'duplicado', updateId: 1001 })
    const visto = await webhook(mensagem('/hoje'))
    expect(visto.codigo).toBe(200)
    expect(comandos.comandoHoje).not.toHaveBeenCalled()
    expect(tg.enviarMensagem).not.toHaveBeenCalled()
    expect(log.fecharComExito).not.toHaveBeenCalled()
  })

  it('reprocessa o que ficou aberto — é o que salva o áudio de um Groq caído', async () => {
    vi.mocked(log.reivindicarUpdate).mockResolvedValue({ decisao: 'reprocessar', updateId: 1001 })
    await webhook(mensagem('/hoje'))
    expect(comandos.comandoHoje).toHaveBeenCalledTimes(1)
    expect(ultimoOutcome()).toBe('cmd_hoje')
  })

  it('classifica o kind com que a fila é reivindicada', async () => {
    await webhook(mensagem('', { voice: { file_id: 'f', mime_type: 'audio/ogg' } }))
    expect(vi.mocked(log.reivindicarUpdate).mock.calls[0]?.[1]).toBe('voice')
    expect(vi.mocked(log.reivindicarUpdate).mock.calls[0]?.[2]).toBe(777)
  })

  it('nem reivindica o que é ignorável', async () => {
    await webhook({ update_id: 5, message: { message_id: 1, chat: { id: 555, type: 'private' } } })
    expect(log.reivindicarUpdate).not.toHaveBeenCalled()
  })

  it('deixa a fila REPROCESÁVEL quando o processamento explode, e responde 200', async () => {
    vi.mocked(comandos.comandoHoje).mockRejectedValueOnce(new Error('Groq caiu'))
    const visto = await webhook(mensagem('/hoje'))
    expect(visto.codigo).toBe(200)
    expect(log.fecharComErro).toHaveBeenCalledTimes(1)
    expect(log.fecharComExito).not.toHaveBeenCalled()
    // Y el vendedor se entera: no queda esperando una respuesta que no llega.
    expect(vi.mocked(tg.enviarMensagem).mock.calls.at(-1)?.[1]).toContain('Deu erro')
  })
})

/* La decisión pura del claim, que es donde vive el arreglo de los 4 audios. */
describe('decidirClaim', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z')

  it('fila inexistente é novo', () => {
    expect(log.decidirClaim(null, agora)).toBe('novo')
  })

  it('desfecho ok: é duplicado de verdade', () => {
    expect(log.decidirClaim({ outcome: 'ok:cmd_hoje', created_at: '2026-08-26T11:00:00Z' }, agora)).toBe('duplicado')
  })

  it('desfecho erro: é REPROCESSÁVEL — o bug dos 4 áudios', () => {
    expect(log.decidirClaim({ outcome: 'erro:Groq 502', created_at: '2026-08-26T11:00:00Z' }, agora)).toBe(
      'reprocessar',
    )
  })

  it('recebido e recente é duplicado; recebido e velho é reprocessável', () => {
    expect(log.decidirClaim({ outcome: 'recebido', created_at: '2026-08-26T11:59:50Z' }, agora)).toBe('duplicado')
    expect(log.decidirClaim({ outcome: 'recebido', created_at: '2026-08-26T11:50:00Z' }, agora)).toBe('reprocessar')
  })
})

describe('reivindicarUpdate contra o banco', () => {
  it('insere a fila com o update CRU dentro, para poder reprocessar sem o Telegram', async () => {
    const real = await vi.importActual<typeof import('../_lib/log.js')>('../_lib/log.js')
    const update = mensagem('/hoje')
    const r = await real.reivindicarUpdate(update, 'text', 777)
    expect(r.decisao).toBe('novo')
    const insercao = db().chamadas.find((c) => c.op === 'insert' && c.tabela === 'bot_log')
    expect((insercao?.payload as { parsed: { update: TelegramUpdate } }).parsed.update).toEqual(update)
    expect((insercao?.payload as { outcome: string }).outcome).toBe('recebido')
  })

  it('um 23505 com desfecho ok: fecha como duplicado', async () => {
    const real = await vi.importActual<typeof import('../_lib/log.js')>('../_lib/log.js')
    db().responder('insert:bot_log', { data: null, error: { code: '23505', message: 'duplicate key' } })
    db().responder('select:bot_log', {
      data: { outcome: 'ok:cmd_hoje', created_at: new Date().toISOString() },
      error: null,
    })
    const r = await real.reivindicarUpdate(mensagem('/hoje'), 'text', 777)
    expect(r.decisao).toBe('duplicado')
  })

  it('se o bot_log está fora do ar, processa — perder um áudio é pior que logar duas vezes', async () => {
    const real = await vi.importActual<typeof import('../_lib/log.js')>('../_lib/log.js')
    db().responder('insert:bot_log', { data: null, error: { code: '42P01', message: 'sem tabela' } })
    const r = await real.reivindicarUpdate(mensagem('/hoje'), 'text', 777)
    expect(r.decisao).toBe('novo')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · Despacho de comandos
   ══════════════════════════════════════════════════════════════════════════ */

describe('comandos', () => {
  const registro = comandos as unknown as Record<string, ReturnType<typeof vi.fn>>
  const tabela: ReadonlyArray<[string, string, string]> = [
    ['/hoje', 'comandoHoje', 'cmd_hoje'],
    ['/golden', 'comandoGolden', 'cmd_golden'],
    ['/anel', 'comandoAnel', 'cmd_anel'],
    ['/placar', 'comandoPlacar', 'cmd_placar'],
    ['/compromissos', 'comandoCompromissos', 'cmd_compromissos'],
    ['/pendentes', 'comandoPendentes', 'cmd_pendentes'],
    ['/pipeline', 'comandoPipeline', 'cmd_pipeline'],
    ['/ajuda', 'comandoAjuda', 'cmd_ajuda'],
  ]

  for (const [texto, alvo, outcome] of tabela) {
    it(`${texto} chama ${alvo} e fecha a fila com ${outcome}`, async () => {
      await webhook(mensagem(texto))
      expect(registro[alvo]).toHaveBeenCalledTimes(1)
      expect(ultimoOutcome()).toBe(outcome)
      expect(vi.mocked(tg.enviarMensagem).mock.calls[0]?.[1]).toBe(`<${outcome}>`)
    })
  }

  it('/status leva o argumento; /parados também', async () => {
    await webhook(mensagem('/status GDC Embalagens'))
    expect(vi.mocked(comandos.comandoStatus).mock.calls[0]?.[1]).toBe('GDC Embalagens')

    vi.clearAllMocks()
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(CANAL)
    await webhook(mensagem('/parados 30'))
    expect(vi.mocked(comandos.comandoParados).mock.calls[0]?.[1]).toBe('30')
  })

  it('aceita o sufixo @NomeDoBot dos grupos', async () => {
    await webhook(mensagem('/hoje@VentusBot'))
    expect(comandos.comandoHoje).toHaveBeenCalledTimes(1)
  })

  it('/start e /help caem em /ajuda', async () => {
    await webhook(mensagem('/start'))
    expect(comandos.comandoAjuda).toHaveBeenCalledTimes(1)
    await webhook(mensagem('/help'))
    expect(comandos.comandoAjuda).toHaveBeenCalledTimes(2)
  })

  it('um comando que não existe responde e não inventa nada', async () => {
    await webhook(mensagem('/digest'))
    expect(ultimoOutcome()).toBe('cmd_desconhecido')
    expect(vi.mocked(tg.enviarMensagem).mock.calls[0]?.[1]).toContain('/ajuda')
  })

  it('/desfazer sem nada para desfazer diz isso, e não escreve', async () => {
    await webhook(mensagem('/desfazer'))
    expect(fluxo.desfazerUltimo).toHaveBeenCalledTimes(1)
    expect(ultimoOutcome()).toBe('desfazer_nada')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5 · Identidad: /id, /vincular y el no vinculado
   ══════════════════════════════════════════════════════════════════════════ */

describe('identidade', () => {
  it('/id funciona SEM canal: é o que se usa para dar de alta', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    await webhook(mensagem('/id'))
    expect(identidade.canalDoTelegram).not.toHaveBeenCalled()
    expect(vi.mocked(tg.enviarMensagem).mock.calls[0]?.[1]).toContain('777')
    expect(ultimoOutcome()).toBe('cmd_id')
  })

  it('/vincular é o único caminho de entrada de quem não tem canal', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    await webhook(mensagem('/vincular 482913'))
    expect(vi.mocked(identidade.vincularPorCodigo).mock.calls[0]).toEqual(['482913', 777, 555, false])
    expect(ultimoOutcome()).toBe('vinculo_ok')
  })

  it('um código vencido não vira canal e explica o que fazer', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    vi.mocked(identidade.vincularPorCodigo).mockResolvedValue({ ok: false, motivo: 'expirado' })
    await webhook(mensagem('/vincular 482913'))
    expect(ultimoOutcome()).toBe('vinculo_expirado')
    expect(vi.mocked(tg.enviarMensagem).mock.calls[0]?.[1]).toContain('10 minutos')
  })

  it('quem não está vinculado recebe as instruções, e nada mais acontece', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    await webhook(mensagem('em que pé está a GDC?'))
    expect(ultimoOutcome()).toBe('nao_vinculado')
    expect(extracao.interpretar).not.toHaveBeenCalled()
    expect(vi.mocked(tg.enviarMensagem).mock.calls[0]?.[1]).toContain('/vincular')
  })

  it('num grupo, uma mensagem solta de quem não tem canal NÃO vira spam', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    const u = mensagem('bom dia pessoal')
    if (u.message) u.message.chat = { id: -100123, type: 'supergroup' }
    await webhook(u)
    expect(tg.enviarMensagem).not.toHaveBeenCalled()
    expect(ultimoOutcome()).toBe('nao_vinculado')
  })

  it('num grupo o canal perde a capacidade de confirmar', () => {
    const restrito = rota.restringirAGrupo(CANAL)
    expect(restrito.capacidades).toEqual(['ler', 'registrar'])
    expect(CANAL.capacidades).toContain('confirmar')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6 · Texto livre e áudio
   ══════════════════════════════════════════════════════════════════════════ */

describe('mensagem livre', () => {
  it('texto vai para o motor de interpretação com origem "texto"', async () => {
    await webhook(mensagem('visitei a GDC e fechei o teste'))
    expect(extracao.interpretar).toHaveBeenCalledTimes(1)
    const [entrada, ctx] = vi.mocked(extracao.interpretar).mock.calls[0] as [string, { origem: string }]
    expect(entrada).toBe('visitei a GDC e fechei o teste')
    expect(ctx.origem).toBe('texto')
    expect(ultimoOutcome()).toBe('intencao_outro')
  })

  it('áudio: baixa, transcreve, e manda o ack ANTES de gastar um token', async () => {
    await webhook(mensagem('', { voice: { file_id: 'AwAC', mime_type: 'audio/ogg' } }))

    expect(tg.baixarArquivo).toHaveBeenCalledWith('AwAC')
    expect(groq.transcrever).toHaveBeenCalledTimes(1)

    const ack = vi.mocked(tg.enviarMensagem).mock.calls[0]
    expect(ack?.[1]).toContain('Ouvindo')
    const ordemDoAck = vi.mocked(tg.enviarMensagem).mock.invocationCallOrder[0] as number
    const ordemDaTranscricao = vi.mocked(groq.transcrever).mock.invocationCallOrder[0] as number
    expect(ordemDoAck).toBeLessThan(ordemDaTranscricao)

    // Y la respuesta REESCRIBE el ack en vez de dejar dos mensajes.
    expect(tg.editarMensagem).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tg.editarMensagem).mock.calls[0]?.[1]).toBe(9001)

    const ctx = vi.mocked(extracao.interpretar).mock.calls[0]?.[1] as { origem: string }
    expect(ctx.origem).toBe('voz')
  })

  it('uma transcrição vazia não gasta um token e diz o que fazer', async () => {
    vi.mocked(groq.transcrever).mockResolvedValueOnce({ texto: '   ', duracaoMs: 90 })
    await webhook(mensagem('', { voice: { file_id: 'AwAC' } }))
    expect(extracao.interpretar).not.toHaveBeenCalled()
    expect(ultimoOutcome()).toBe('transcricao_vazia')
  })

  it('uma consulta falada responde EXATAMENTE o mesmo que o comando', async () => {
    vi.mocked(extracao.interpretar).mockResolvedValueOnce({
      intencao: 'consulta',
      registro: null,
      consulta: { tipo: 'pendentes', alvo: null, dias: null },
    })
    await webhook(mensagem('o que tenho pendente esta semana?'))
    expect(comandos.comandoPendentes).toHaveBeenCalledTimes(1)
    expect(ultimoOutcome()).toBe('cmd_pendentes')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   7 · Callbacks
   ══════════════════════════════════════════════════════════════════════════ */

function callback(data: string): TelegramUpdate {
  return {
    update_id: 2002,
    callback_query: {
      id: 'cb-1',
      from: { id: 777, is_bot: false },
      data,
      message: { message_id: 9001, chat: { id: 555, type: 'private' } },
    },
  }
}

describe('callback_query', () => {
  const opp = CARTEIRA.oportunidades[0] as { stage: number; next_action_date: string; next_action_done: boolean }

  it('SEMPRE responde o callback: sem isso o spinner gira 30 s', async () => {
    await webhook(callback('lixo-que-não-é-nosso'))
    expect(tg.responderCallback).toHaveBeenCalledTimes(1)
    expect(ultimoOutcome()).toBe('callback_invalido')
  })

  it('responde o callback UMA vez mesmo quando o caminho falha', async () => {
    vi.mocked(fluxo.marcarAcaoFeita).mockRejectedValueOnce(new Error('Postgres caiu'))
    await webhook(callback(montarCallback({ ns: 'opp', id: '42', acao: 'done', fp: fpOportunidade(opp) })))
    expect(tg.responderCallback).toHaveBeenCalledTimes(1)
    expect(log.fecharComErro).toHaveBeenCalledTimes(1)
  })

  it('um botão com a impressão digital de hoje executa', async () => {
    await webhook(callback(montarCallback({ ns: 'opp', id: '42', acao: 'done', fp: fpOportunidade(opp) })))
    expect(fluxo.marcarAcaoFeita).toHaveBeenCalledTimes(1)
    expect(ultimoOutcome()).toBe('card_feito')
  })

  it('um botão de anteontem NÃO duplica: diz que já foi feito', async () => {
    await webhook(callback('opp:42:done:vvelho'))
    expect(fluxo.marcarAcaoFeita).not.toHaveBeenCalled()
    expect(ultimoOutcome()).toBe('card_velho')
    expect(vi.mocked(tg.responderCallback).mock.calls[0]?.[1]).toBe('Esta ação já foi feita.')
  })

  it('⏰ Amanhã adia com data, nunca apaga a próxima ação', async () => {
    await webhook(callback(montarCallback({ ns: 'opp', id: '42', acao: 'amanha', fp: fpOportunidade(opp) })))
    const [, alvo, data] = vi.mocked(fluxo.adiarPara).mock.calls[0] as [unknown, { id: number }, string]
    expect(alvo.id).toBe(42)
    expect(data).toBe('2026-08-27')
    expect(ultimoOutcome()).toBe('card_adiado')
  })

  it('um callback de quem não tem canal não executa nada', async () => {
    vi.mocked(identidade.canalDoTelegram).mockResolvedValue(null)
    await webhook(callback(montarCallback({ ns: 'opp', id: '42', acao: 'done', fp: fpOportunidade(opp) })))
    expect(fluxo.marcarAcaoFeita).not.toHaveBeenCalled()
    expect(ultimoOutcome()).toBe('callback_nao_vinculado')
    expect(tg.responderCallback).toHaveBeenCalledTimes(1)
  })
})
