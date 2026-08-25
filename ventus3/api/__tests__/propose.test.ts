// api/__tests__/propose.test.ts
// El flujo propose → commit es lo que separa «un asistente que ayuda» de «un
// asistente que corrompe el CRM en silencio». Los tres invariantes que estos
// tests fijan:
//
//   1. CONFIANZA. `alta` sin cita textual se degrada a `media`; mover una
//      escala o avanzar una etapa NUNCA auto-commitea aunque la cita exista.
//   2. STALENESS. Si el registro cambió entre proponer y confirmar, el commit
//      se rechaza con 409 y la propuesta queda descartada como 'dado_errado'.
//   3. IDEMPOTENCIA. Confirmar dos veces devuelve el mismo resultado con
//      `idempotente: true` y NO vuelve a ejecutar.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarFakeDb } from './fake-supabase'
import type { AuthContext } from '../_lib/auth'

const db = criarFakeDb()
vi.mock('../_lib/supabase', () => ({ serviceClient: () => db }))

const { commitAcao, confiancaEfetiva, descartarAcao, podeAutoCommit, proporAcao, tipoDeAcao } =
  await import('../_lib/propose')

const ACTION_ID = '9f1c2b3a-4d5e-4f60-8a71-0b2c3d4e5f60'

const victor: AuthContext = {
  userId: 'u-victor',
  vendorName: 'Victor Hugo',
  vendorId: 3,
  isAdmin: false,
  email: null,
  expiraEm: 0,
}
const sandra: AuthContext = { ...victor, userId: 'u-sandra', vendorName: 'Sandra', vendorId: 5 }

beforeEach(() => {
  db.chamadas.length = 0
})

/** Fila de `ventus_actions` como la devuelve el select del commit. */
function acao(over: Record<string, unknown> = {}) {
  return {
    id: ACTION_ID,
    vendor: 'Victor Hugo',
    status: 'proposed',
    tipo: 'registrar_atividade',
    payload: { description: 'Ligação com o Marcelo' },
    entity_kind: 'opportunity',
    entity_id: '47',
    precondition_hash: 'hash-de-quando-o-ventus-leu',
    resultado: null,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    ...over,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Confianza graduada
   ══════════════════════════════════════════════════════════════════════════ */

describe('confiança graduada', () => {
  it('degrada alta para media quando não há citação', () => {
    expect(confiancaEfetiva('alta', null)).toBe('media')
    expect(confiancaEfetiva('alta', '   ')).toBe('media')
    expect(confiancaEfetiva('alta', 'curta')).toBe('media')
  })

  it('mantém alta quando a citação existe e é textual', () => {
    expect(confiancaEfetiva('alta', 'a caixa continua abrindo no transporte')).toBe('alta')
  })

  it('nunca sobe a confiança', () => {
    expect(confiancaEfetiva('baixa', 'uma citação bem longa e textual')).toBe('baixa')
    expect(confiancaEfetiva('media', 'uma citação bem longa e textual')).toBe('media')
  })

  it('auto-commit só nas ferramentas reversíveis e com confiança alta', () => {
    expect(podeAutoCommit('ventus_agendar_lembrete', 'alta')).toBe(true)
    expect(podeAutoCommit('ventus_agendar_lembrete', 'media')).toBe(false)
    // Las dos que corrompen el forecast del equipo entero:
    expect(podeAutoCommit('ventus_atualizar_escala', 'alta')).toBe(false)
    expect(podeAutoCommit('ventus_avancar_etapa', 'alta')).toBe(false)
  })

  it('mapeia cada tool ao tipo que a tabela entende', () => {
    expect(tipoDeAcao('ventus_atualizar_escala')).toBe('atualizar_escala')
    expect(tipoDeAcao('ventus_definir_proxima_acao')).toBe('criar_task')
    expect(tipoDeAcao('ventus_buscar_carteira')).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Proponer
   ══════════════════════════════════════════════════════════════════════════ */

describe('proporAcao', () => {
  it('com confiança baixa NÃO escreve nada: o Ventus pergunta', async () => {
    const proposta = await proporAcao({
      ctx: victor,
      tool: 'ventus_atualizar_escala',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { scale_key: 'dor', score_novo: 7 },
      confianca: 'baixa',
      resumo: 'DOR → 7',
      mudancas: [],
    })
    expect(proposta.actionId).toBeNull()
    expect(db.contar('insert:ventus_actions')).toBe(0)
  })

  it('com confiança media cria a proposta e espera o vendedor', async () => {
    db.responder('rpc:ventus_precondition_hash', { data: 'hash-atual', error: null })
    db.responder('insert:ventus_actions', { data: { id: ACTION_ID }, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    const proposta = await proporAcao({
      ctx: victor,
      tool: 'ventus_atualizar_escala',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { scale_key: 'dor', score_novo: 7 },
      confianca: 'media',
      resumo: 'DOR → 7 na Tetra Pak',
      mudancas: [{ campo: 'scales.dor', rotulo: 'DOR', de: '3', para: '7' }],
      citacao: 'a caixa continua abrindo no transporte',
    })

    expect(proposta.actionId).toBe(ACTION_ID)
    expect(proposta.precisaConfirmar).toBe(true)
    expect(proposta.resultado).toBeNull()
    expect(db.contar('rpc:ventus_commit_action')).toBe(0)

    const insert = db.chamadas.find((c) => c.op === 'insert' && c.tabela === 'ventus_actions')
    const linha = insert?.payload as Record<string, unknown>
    expect(linha['status']).toBe('proposed')
    expect(linha['vendor']).toBe('Victor Hugo')
    // El hash sale de Postgres, no de los datos que mandó el cliente.
    expect(linha['precondition_hash']).toBe('hash-atual')
    expect(String(linha['expires_at'])).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('deixa rastro em ventus_audit ao propor', async () => {
    db.responder('rpc:ventus_precondition_hash', { data: 'h', error: null })
    db.responder('insert:ventus_actions', { data: { id: ACTION_ID }, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await proporAcao({
      ctx: victor,
      tool: 'ventus_avancar_etapa',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { nova_etapa: 3 },
      confianca: 'media',
      resumo: 'Avançar para 3',
      mudancas: [],
    })

    const auditoria = db.chamadas.find((c) => c.op === 'insert' && c.tabela === 'ventus_audit')
    expect((auditoria?.payload as Record<string, unknown>)['evento']).toBe('proposed')
    expect((auditoria?.payload as Record<string, unknown>)['actor']).toBe('ventus')
  })

  it('sem a RPC de hash guarda null em vez de fingir um staleness check', async () => {
    db.responder('rpc:ventus_precondition_hash', {
      data: null,
      error: { code: 'PGRST202', message: 'function does not exist' },
    })
    db.responder('insert:ventus_actions', { data: { id: ACTION_ID }, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await proporAcao({
      ctx: victor,
      tool: 'ventus_avancar_etapa',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { nova_etapa: 3 },
      confianca: 'media',
      resumo: 'Avançar',
      mudancas: [],
    })

    const insert = db.chamadas.find((c) => c.op === 'insert' && c.tabela === 'ventus_actions')
    expect((insert?.payload as Record<string, unknown>)['precondition_hash']).toBeNull()
  })

  it('com confiança alta e ferramenta leve, executa sozinha e avisa', async () => {
    db.responder('rpc:ventus_precondition_hash', { data: 'h', error: null })
    db.responder('insert:ventus_actions', { data: { id: ACTION_ID }, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })
    // commitAcao: lee la fila y despacha por la RPC (tipo criar_task).
    db.responder('select:ventus_actions', { data: acao({ tipo: 'criar_task' }), error: null })
    db.responder('rpc:ventus_commit_action', { data: { ok: true, task_id: 't-1' }, error: null })

    const proposta = await proporAcao({
      ctx: victor,
      tool: 'ventus_agendar_lembrete',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { titulo: 'Ligar pro Paulo', due_date: '2026-09-01' },
      confianca: 'alta',
      citacao: 'me lembra de ligar pro Paulo na quinta',
      resumo: 'Lembrete: ligar pro Paulo',
      mudancas: [],
    })

    expect(proposta.precisaConfirmar).toBe(false)
    expect(proposta.resultado).toMatchObject({ ok: true })
    expect(db.contar('rpc:ventus_commit_action')).toBe(1)
  })

  it('recupera a proposta existente quando a idempotency_key já foi usada', async () => {
    db.responder('rpc:ventus_precondition_hash', { data: 'h', error: null })
    db.responder('insert:ventus_actions', {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    db.responder('select:ventus_actions', {
      data: { id: ACTION_ID, status: 'proposed', resultado: null },
      error: null,
    })

    const proposta = await proporAcao({
      ctx: victor,
      tool: 'ventus_registrar_atividade',
      entidade: { kind: 'opportunity', id: 47 },
      payload: { description: 'x' },
      confianca: 'media',
      resumo: 'Registrar',
      mudancas: [],
      idempotencyKey: 'turno-1:ventus_registrar_atividade:47',
    })

    expect(proposta.actionId).toBe(ACTION_ID)
    // No se creó una segunda fila: el reintento del outbox no duplica.
    expect(db.contar('insert:ventus_actions')).toBe(1)
  })

  it('impede propor na carteira de outro vendedor', async () => {
    await expect(
      proporAcao({
        ctx: sandra,
        tool: 'ventus_registrar_atividade',
        dono: 'Victor Hugo',
        entidade: { kind: 'opportunity', id: 47 },
        payload: {},
        confianca: 'media',
        resumo: 'x',
        mudancas: [],
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Confirmar
   ══════════════════════════════════════════════════════════════════════════ */

describe('commitAcao', () => {
  it('rejeita com 409 quando o registro mudou depois da proposta (staleness)', async () => {
    db.responder('select:ventus_actions', { data: acao(), error: null })
    db.responder('rpc:ventus_precondition_hash', { data: 'hash-DIFERENTE-agora', error: null })
    db.responder('update:ventus_actions', { data: null, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await expect(commitAcao(ACTION_ID, victor)).rejects.toMatchObject({
      status: 409,
      codigo: 'obsoleta',
    })

    // Y la propuesta queda descartada, no colgando para siempre.
    const update = db.chamadas.find((c) => c.op === 'update' && c.tabela === 'ventus_actions')
    expect(update?.payload).toMatchObject({ status: 'dismissed', dismissed_reason: 'dado_errado' })
    // Lo importante: NO se ejecutó nada.
    expect(db.contar('insert:activities')).toBe(0)
  })

  it('executa quando o hash não mudou', async () => {
    db.responder('select:ventus_actions', { data: acao(), error: null })
    db.responder('rpc:ventus_precondition_hash', { data: 'hash-de-quando-o-ventus-leu', error: null })
    db.responder('insert:activities', { data: { id: 5001 }, error: null })
    db.responder('update:ventus_actions', { data: [{ id: ACTION_ID }], error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    const resultado = await commitAcao(ACTION_ID, victor)
    expect(resultado).toMatchObject({ ok: true, activity_id: 5001 })
    expect(db.contar('insert:activities')).toBe(1)
  })

  it('é idempotente: confirmar de novo devolve o mesmo, sem reexecutar', async () => {
    db.responder('select:ventus_actions', {
      data: acao({ status: 'committed', resultado: { ok: true, activity_id: 5001 } }),
      error: null,
    })

    const resultado = await commitAcao(ACTION_ID, victor)
    expect(resultado).toMatchObject({ ok: true, activity_id: 5001, idempotente: true })
    expect(db.contar('insert:activities')).toBe(0)
    expect(db.contar('rpc:ventus_commit_action')).toBe(0)
  })

  it('recusa uma proposta vencida com 410 em vez de executar tarde', async () => {
    db.responder('select:ventus_actions', {
      data: acao({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      error: null,
    })
    db.responder('update:ventus_actions', { data: null, error: null })

    await expect(commitAcao(ACTION_ID, victor)).rejects.toMatchObject({ status: 410, codigo: 'expirada' })
    expect(db.contar('insert:activities')).toBe(0)
  })

  it('impede confirmar a proposta de outro vendedor', async () => {
    db.responder('select:ventus_actions', { data: acao({ vendor: 'Victor Hugo' }), error: null })
    await expect(commitAcao(ACTION_ID, sandra)).rejects.toMatchObject({ status: 403 })
  })

  it('deixa o admin confirmar a proposta de qualquer um', async () => {
    const admin = { ...sandra, isAdmin: true }
    db.responder('select:ventus_actions', { data: acao(), error: null })
    db.responder('rpc:ventus_precondition_hash', { data: 'hash-de-quando-o-ventus-leu', error: null })
    db.responder('insert:activities', { data: { id: 7 }, error: null })
    db.responder('update:ventus_actions', { data: [{ id: ACTION_ID }], error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await expect(commitAcao(ACTION_ID, admin)).resolves.toMatchObject({ ok: true })
  })

  it('aplica a edição por campo ANTES de executar', async () => {
    db.responder('select:ventus_actions', { data: acao(), error: null })
    db.responder('update:ventus_actions', { data: null, error: null }) // el update del payload
    db.responder('rpc:ventus_precondition_hash', { data: 'hash-de-quando-o-ventus-leu', error: null })
    db.responder('insert:activities', { data: { id: 8 }, error: null })
    db.responder('update:ventus_actions', { data: [{ id: ACTION_ID }], error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await commitAcao(ACTION_ID, victor, { description: 'Corrigido pelo vendedor' })

    const edicao = db.chamadas.find(
      (c) => c.op === 'update' && c.tabela === 'ventus_actions' && 'payload' in (c.payload as object),
    )
    expect((edicao?.payload as { payload: Record<string, unknown> }).payload['description']).toBe(
      'Corrigido pelo vendedor',
    )
    const inserida = db.chamadas.find((c) => c.op === 'insert' && c.tabela === 'activities')
    expect((inserida?.payload as Record<string, unknown>)['description']).toBe('Corrigido pelo vendedor')
  })

  it('devolve 404 quando a proposta não existe', async () => {
    db.responder('select:ventus_actions', { data: null, error: null })
    await expect(commitAcao(ACTION_ID, victor)).rejects.toMatchObject({ status: 404 })
  })

  it('traduz o erro de staleness da RPC para 409, não para 500', async () => {
    db.responder('select:ventus_actions', { data: acao({ tipo: 'avancar_etapa' }), error: null })
    db.responder('rpc:ventus_commit_action', {
      data: null,
      error: { code: '55000', message: 'A proposta ficou obsoleta: o registro mudou depois de ser proposta' },
    })
    await expect(commitAcao(ACTION_ID, victor)).rejects.toMatchObject({ status: 409, codigo: 'obsoleta' })
  })

  it('traduz a violação da regra da prova (23514) para 422 com mensagem útil', async () => {
    db.responder('select:ventus_actions', { data: acao({ tipo: 'atualizar_escala' }), error: null })
    db.responder('rpc:ventus_commit_action', {
      data: null,
      error: { code: '23514', message: 'scale_evidence_prova_chk' },
    })
    await expect(commitAcao(ACTION_ID, victor)).rejects.toMatchObject({ status: 422, codigo: 'sem_prova' })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Descartar
   ══════════════════════════════════════════════════════════════════════════ */

describe('descartarAcao', () => {
  it('grava o motivo e audita', async () => {
    db.responder('select:ventus_actions', { data: acao(), error: null })
    db.responder('update:ventus_actions', { data: null, error: null })
    db.responder('insert:ventus_audit', { data: null, error: null })

    await descartarAcao(ACTION_ID, victor, 'ja_fiz')

    const update = db.chamadas.find((c) => c.op === 'update' && c.tabela === 'ventus_actions')
    expect(update?.payload).toMatchObject({ status: 'dismissed', dismissed_reason: 'ja_fiz' })
    const auditoria = db.chamadas.find((c) => c.op === 'insert' && c.tabela === 'ventus_audit')
    expect((auditoria?.payload as Record<string, unknown>)['evento']).toBe('dismissed')
  })

  it('não descarta a proposta de outro vendedor', async () => {
    db.responder('select:ventus_actions', { data: acao(), error: null })
    await expect(descartarAcao(ACTION_ID, sandra, 'ja_fiz')).rejects.toMatchObject({ status: 403 })
  })

  it('é inócuo sobre uma proposta já resolvida', async () => {
    db.responder('select:ventus_actions', { data: acao({ status: 'committed' }), error: null })
    await expect(descartarAcao(ACTION_ID, victor, 'ja_fiz')).resolves.toBeUndefined()
    expect(db.contar('update:ventus_actions')).toBe(0)
  })
})
