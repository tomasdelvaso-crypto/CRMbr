// src/data/__tests__/plano-do-dia.test.ts
// La invariante entera de la tela Hoje: el día se CONGELA.
//
// Sin freeze, resolver una tarjeta trae otra, «Pronto por hoje» es inalcanzable
// y el límite de 3 —la decisión de producto de M2— queda decorativo. Es el tipo
// de regresión que no rompe ningún type-check y que solo se nota en producción
// cuando un vendedor dice «esto nunca se termina».

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste } from '../db'
import {
  adiarAcaoDoDia,
  concluirAcaoDoDia,
  fetchCorrenteDoTime,
  fetchPlanoFixado,
  fetchSequencia,
  lerEstadoDoDia,
  selarDiaDeHoraCheia,
} from '../plano-do-dia'
import { definirTransporte } from '../outbox'
import { opp, lead, tarefa } from '@/core/__tests__/fixtures'
import type { Opportunity, Vendor } from '@/core'

const VENDOR = 'Renata'
const HOJE = '2026-08-25' // terça-feira, dia útil

let db: VentusDatabase
let contador = 0

/** Oportunidad vencida hace mucho: score alto garantizado. */
function oppVencida(id: number, cliente: string): Opportunity {
  return opp({
    id,
    client: cliente,
    name: `Negócio ${cliente}`,
    vendor: VENDOR,
    last_update: '2026-04-01T12:00:00Z',
    value: 120_000,
  })
}

function vendorRow(nome: string, id: number): Vendor {
  return {
    id,
    name: nome,
    email: null,
    role: null,
    phone: null,
    is_admin: false,
    is_active: true,
    monthly_target: null,
    auth_user_id: null,
    auth_id: null,
    telegram_id: null,
    telegram_username: null,
    created_at: null,
  }
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-plano-${contador}`)
  _setDbParaTeste(db)
  await db.open()
  // El outbox nunca sale a la red en los tests: solo interesa el estado local.
  definirTransporte({ enviar: async () => {} })
})

afterEach(async () => {
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

describe('o plano do dia congela', () => {
  it('fixa no máximo 3 ações e as guarda em meta', async () => {
    await db.opportunities.bulkPut([
      oppVencida(1, 'Tetra Pak'),
      oppVencida(2, 'Ambev'),
      oppVencida(3, 'Natura'),
      oppVencida(4, 'Suzano'),
      oppVencida(5, 'Klabin'),
    ])

    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    expect(plano.fixadas).toHaveLength(3)
    expect(plano.pronto).toBe(false)

    const estado = await lerEstadoDoDia(VENDOR, HOJE)
    expect(estado?.ids).toEqual(plano.fixadas.map((f) => f.acao.id))
  })

  it('nunca traz dois cartões do mesmo cliente', async () => {
    // Cinco negócios do MESMO cliente, todos vencidos, mais dois de outros.
    await db.opportunities.bulkPut([
      ...Array.from({ length: 5 }, (_, i) => oppVencida(10 + i, 'Tetra Pak')),
      oppVencida(20, 'Ambev'),
      oppVencida(21, 'Natura'),
    ])

    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const clientes = plano.fixadas.map((f) => f.acao.entidade.cliente)
    expect(new Set(clientes).size).toBe(3)
  })

  it('resolver um cartão NÃO traz outro no lugar', async () => {
    await db.opportunities.bulkPut([
      oppVencida(1, 'Tetra Pak'),
      oppVencida(2, 'Ambev'),
      oppVencida(3, 'Natura'),
      oppVencida(4, 'Suzano'),
    ])

    const antes = await fetchPlanoFixado(VENDOR, HOJE)
    const primeiro = antes.fixadas[0]
    expect(primeiro).toBeDefined()

    await concluirAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: primeiro!.acao })

    const depois = await fetchPlanoFixado(VENDOR, HOJE)
    expect(depois.fixadas.map((f) => f.acao.id)).toEqual(antes.fixadas.map((f) => f.acao.id))
    expect(depois.resolvidas).toBe(1)
    expect(depois.fixadas[0]?.resolucao?.motivo).toBe('feito')
  })

  it('«Pronto por hoje» quando as três estão resolvidas, e não recarrega', async () => {
    await db.opportunities.bulkPut([
      oppVencida(1, 'Tetra Pak'),
      oppVencida(2, 'Ambev'),
      oppVencida(3, 'Natura'),
      oppVencida(4, 'Suzano'),
      oppVencida(5, 'Klabin'),
    ])

    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    for (const item of plano.fixadas) {
      await concluirAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao })
    }

    const final = await fetchPlanoFixado(VENDOR, HOJE)
    expect(final.fixadas).toHaveLength(3)
    expect(final.pronto).toBe(true)
    expect(final.fixadas.every((f) => f.resolucao !== null)).toBe(true)
  })

  it('não congela um dia vazio: a carteira pode estar sincronizando ainda', async () => {
    const vazio = await fetchPlanoFixado(VENDOR, HOJE)
    expect(vazio.fixadas).toEqual([])
    expect(vazio.pronto).toBe(false)
    expect(await lerEstadoDoDia(VENDOR, HOJE)).toBeNull()

    // Chega a carteira: agora sim congela.
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    const cheio = await fetchPlanoFixado(VENDOR, HOJE)
    expect(cheio.fixadas).toHaveLength(1)
  })
})

describe('resolver uma ação deixa registro real', () => {
  it('«Feito» sobre oportunidade cria uma activity no outbox', async () => {
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const item = plano.fixadas[0]!

    await concluirAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao })

    const atividades = await db.activities.toArray()
    expect(atividades).toHaveLength(1)
    expect(atividades[0]?.opportunity_id).toBe(1)
    expect(atividades[0]?.description).toBe(item.acao.acao)
    expect(await db.outbox.count()).toBeGreaterThan(0)
  })

  it('«Adiar» cria uma tarefa COM data — nunca um dismiss sem compromisso', async () => {
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const item = plano.fixadas[0]!

    await adiarAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao, ate: '2026-08-27' })

    const tarefas = await db.tasks.toArray()
    expect(tarefas).toHaveLength(1)
    expect(tarefas[0]?.due_date).toBe('2026-08-27')
    expect(tarefas[0]?.status).toBe('pending')

    const depois = await fetchPlanoFixado(VENDOR, HOJE)
    expect(depois.fixadas[0]?.resolucao?.motivo).toBe('adiado')
    expect(depois.fixadas[0]?.resolucao?.ate).toBe('2026-08-27')
  })

  it('«Feito» sobre lead registra o toque da cadência, não uma conversa inventada', async () => {
    await db.leads.put(
      lead({
        id: 77,
        vendor: VENDOR,
        company_name: 'Fábrica Nova',
        touchpoints_count: 0,
        next_touchpoint_date: '2026-08-01',
      }),
    )

    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const item = plano.fixadas.find((f) => f.acao.entidade.kind === 'lead')
    expect(item).toBeDefined()

    await concluirAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item!.acao })

    const toques = await db.touchpoints.toArray()
    expect(toques).toHaveLength(1)
    expect(toques[0]?.lead_id).toBe(77)
    // no_response é o que de verdade aconteceu ao mandar o toque: 'interested'
    // seria fabricar uma conversa que ninguém teve.
    expect(toques[0]?.result).toBe('no_response')
  })
})

describe('o cartão que nasce de uma task opera sobre ELA', () => {
  // La regresión que cubren estos tres: con el backfill, casi toda tarjeta de
  // Hoje nace de una task pendiente. «Adiar» creaba una SEGUNDA task (dos
  // filas por la misma acción, y el planner eligiendo cualquiera al día
  // siguiente) y «Feito» dejaba la original 'pending' — la tarjeta volvía
  // mañana como fantasma de lo ya hecho.

  async function plantarOppComTask() {
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    const t = tarefa({ kind: 'opportunity', id: 1 }, HOJE, {
      vendor: VENDOR,
      title: 'Mandar a proposta revisada',
    })
    await db.tasks.put(t)
    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const item = plano.fixadas.find((f) => f.acao.entidade.id === 1)
    expect(item).toBeDefined()
    return { t, item: item! }
  }

  it('o planner carrega o id da task na tarjeta', async () => {
    const { t, item } = await plantarOppComTask()
    expect(item.acao.tarefaId).toBe(t.id)
    expect(item.acao.acao).toBe('Mandar a proposta revisada')
  })

  it('«Adiar» pospõe a task original — não fabrica uma segunda', async () => {
    const { t, item } = await plantarOppComTask()

    await adiarAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao, ate: '2026-08-27' })

    const tarefas = await db.tasks.toArray()
    expect(tarefas).toHaveLength(1) // la misma fila, ninguna nueva
    expect(tarefas[0]?.id).toBe(t.id)
    expect(tarefas[0]?.status).toBe('snoozed')
    expect(tarefas[0]?.snoozed_until).toBe('2026-08-27')
    expect(tarefas[0]?.due_date).toBe('2026-08-27')

    const depois = await fetchPlanoFixado(VENDOR, HOJE)
    expect(depois.fixadas.find((f) => f.acao.id === item.acao.id)?.resolucao?.motivo).toBe(
      'adiado',
    )
  })

  it('«Feito» conclui a task original e registra a activity no mesmo gesto', async () => {
    const { t, item } = await plantarOppComTask()

    await concluirAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao })

    const fila = await db.tasks.get(t.id)
    expect(fila?.status).toBe('done')
    expect(fila?.done_at).toBeTruthy()

    const atividades = await db.activities.toArray()
    expect(atividades).toHaveLength(1)
    expect(atividades[0]?.opportunity_id).toBe(1)

    // Nada duplicado: sigue habiendo UNA task, ahora cerrada.
    expect(await db.tasks.count()).toBe(1)
  })

  it('sem task de origem, «Adiar» segue criando a task nova de sempre', async () => {
    await db.opportunities.put(oppVencida(2, 'Ambev'))
    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const item = plano.fixadas.find((f) => f.acao.entidade.id === 2)!
    expect(item.acao.tarefaId).toBeUndefined()

    await adiarAcaoDoDia({ vendor: VENDOR, dia: HOJE, acao: item.acao, ate: '2026-08-27' })
    const tarefas = await db.tasks.toArray()
    expect(tarefas).toHaveLength(1)
    expect(tarefas[0]?.status).toBe('pending')
  })
})

describe('a resolução automática', () => {
  it('fecha o cartão quando o vendedor registra pelo caminho longo', async () => {
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    const estado = await lerEstadoDoDia(VENDOR, HOJE)
    expect(plano.fixadas[0]?.resolucao).toBeNull()

    // Uma activity criada DEPOIS de congelar o plano.
    const depoisDeFixar = new Date(Date.parse(estado!.fixadoEm) + 1000).toISOString()
    await db.activities.put({
      uid: 'a1',
      client_uuid: 'a1',
      pendente: 0,
      id: 9001,
      opportunity_id: 1,
      vendor: VENDOR,
      created_at: depoisDeFixar,
      activity_date: HOJE,
      activity_type: 'call',
      description: 'Liguei pro Marcelo',
      result: 'positivo',
      stage_at_time: null,
      methodology_code: null,
      ai_suggested_action: null,
      ai_suggested_scales: null,
      ai_confidence: null,
      next_action: null,
      next_action_date: null,
      next_action_done: false,
      source: 'manual',
    })

    const depois = await fetchPlanoFixado(VENDOR, HOJE)
    expect(depois.fixadas[0]?.resolucao?.automatica).toBe(true)
    expect(depois.pronto).toBe(true)
  })

  it('o que se registrou ANTES de ver o cartão não o resolve', async () => {
    await db.opportunities.put(oppVencida(1, 'Tetra Pak'))
    await db.activities.put({
      uid: 'a0',
      client_uuid: 'a0',
      pendente: 0,
      id: 9000,
      opportunity_id: 1,
      vendor: VENDOR,
      created_at: '2026-08-25T06:00:00Z',
      activity_date: HOJE,
      activity_type: 'note',
      description: 'Anotação da madrugada',
      result: null,
      stage_at_time: null,
      methodology_code: null,
      ai_suggested_action: null,
      ai_suggested_scales: null,
      ai_confidence: null,
      next_action: null,
      next_action_date: null,
      next_action_done: false,
      source: 'manual',
    })

    const plano = await fetchPlanoFixado(VENDOR, HOJE)
    expect(plano.fixadas[0]?.resolucao).toBeNull()
  })
})

describe('a racha de Golden Hour', () => {
  it('nunca mostra 0: sem histórico, convida em vez de acusar', async () => {
    const seq = await fetchSequencia(VENDOR, HOJE)
    expect(seq.dias).toBe(0)
    expect(seq.resgate).toBeNull()
    expect(seq.texto).toContain('começa')
  })

  it('conta os dias úteis selados pela Hora Cheia', async () => {
    // Sexta 21 e segunda 24: o fim de semana no meio NÃO quebra a sequência.
    // Castigar alguém por não prospectar no sábado destrói a credibilidade.
    await selarDiaDeHoraCheia(VENDOR, '2026-08-21')
    await selarDiaDeHoraCheia(VENDOR, '2026-08-24')
    const seq = await fetchSequencia(VENDOR, HOJE)
    expect(seq.dias).toBeGreaterThanOrEqual(2)
    expect(seq.exibicao).toBeGreaterThanOrEqual(2)
  })
})

describe('a corrente do time', () => {
  it('não inventa um 0 para quem não tem dado local', async () => {
    await db.vendors.bulkPut([vendorRow(VENDOR, 1), vendorRow('Andre', 2), vendorRow('Paulo', 3)])
    const elos = await fetchCorrenteDoTime(VENDOR, HOJE)

    expect(elos).toHaveLength(3)
    const eu = elos.find((e) => e.euMesmo)
    expect(eu?.temDados).toBe(true)
    expect(elos.filter((e) => !e.euMesmo).every((e) => e.temDados === false)).toBe(true)
  })

  it('usa o snapshot de anéis do companheiro quando existe', async () => {
    await db.vendors.bulkPut([vendorRow(VENDOR, 1), vendorRow('Andre', 2)])
    await db.rings.put({
      uid: `Andre:${HOJE}`,
      vendor: 'Andre',
      day: HOJE,
      contatos: 9,
      conversas: 2,
      avancos: 1,
      metas: { contato: 12, conversa: 3, avanco: 1 },
      fechado: 0,
      atualizado_em: `${HOJE}T18:00:00Z`,
    })

    const elos = await fetchCorrenteDoTime(VENDOR, HOJE)
    const andre = elos.find((e) => e.vendorName === 'Andre')
    expect(andre?.temDados).toBe(true)
    expect(andre?.avanco.ratio).toBe(1)
  })
})
