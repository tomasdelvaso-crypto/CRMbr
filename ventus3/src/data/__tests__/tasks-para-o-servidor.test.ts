// src/data/__tests__/tasks-para-o-servidor.test.ts
// EL CAMINO DE VUELTA: de la forma local a la forma de Postgres.
//
// `normalizarRemoto()` arregló la ENTRADA — la fila de `tasks` que llega del
// servidor con `titulo`/`opportunity_id`/`snoozed_to` se traduce a la forma que
// el motor sabe leer. La SALIDA hacía lo inverso mal:
//
//   · `criarTask` encolaba `kind`, `title` y `snoozed_until`. Ninguna de las
//     tres es una columna de `public.tasks`. PostgREST contesta
//     400 PGRST204, el outbox lo clasifica como 'permanente' y el ítem se
//     queda en el teléfono del vendedor PARA SIEMPRE, con el badge de
//     pendientes que ya nunca baja.
//   · `adiarTask` tocaba `snoozed_until`; la columna es `snoozed_to`.
//   · `concluirTask` mandaba solo `status:'done'`, y el CHECK `tasks_done_chk`
//     exige `done_at`.
//
// La traducción vive en el FLUSH (desnormalizarLocal, aplicada por
// transport.ts) y no en el enqueue, y eso es lo que prueba la tercera suite:
// los ítems que YA ESTABAN encolados con la forma vieja —los que hay ahora
// mismo en los teléfonos del equipo— tienen que sanar solos en el próximo
// flush, sin que nadie los reescriba.
//
// El esquema contra el que se valida es el real, leído por MCP el 2026-08-26.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, getDb } from '../db'
import { COLUNAS_TASKS, desnormalizarLocal, normalizarRemoto, nomesEquivalentes } from '../conflicts'
import { definirTransporte, enqueue, flush, pending } from '../outbox'
import { adiarTask, concluirTask, criarTask } from '../mutations'
import { registrarVeredicto, type ItemDoVeredicto } from '../rituais'
import type { OutboxMutation } from '../local-types'
import type { Task } from '@/core'

let db: VentusDatabase
let contador = 0

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-tasks-saida-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
})

afterEach(async () => {
  definirTransporte(null)
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

/** Un transporte que guarda lo que se le manda en vez de enviarlo. */
function transporteEspiao(): { enviadas: OutboxMutation[] } {
  const enviadas: OutboxMutation[] = []
  definirTransporte({
    enviar: (m) => {
      enviadas.push(m)
      return Promise.resolve()
    },
  })
  return { enviadas }
}

const COLUNAS = new Set<string>(COLUNAS_TASKS)

/** Ninguna clave inventada: todo lo que sale tiene columna en Postgres. */
function chavesInventadas(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).filter((c) => !COLUNAS.has(c))
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · desnormalizarLocal: el espejo exacto de normalizarRemoto
   ══════════════════════════════════════════════════════════════════════════ */

describe('desnormalizarLocal', () => {
  it('traduz o nome de cada campo que a tabela chama de outro jeito', () => {
    const { payload } = desnormalizarLocal('tasks', {
      title: 'Ligar para o Marcelo',
      target: { kind: 'opportunity', id: 89 },
      snoozed_until: '2026-08-27',
      status: 'snoozed',
    })

    expect(payload).toEqual({
      titulo: 'Ligar para o Marcelo',
      opportunity_id: 89,
      lead_id: null,
      snoozed_to: '2026-08-27',
      status: 'snoozed',
    })
    expect(chavesInventadas(payload)).toEqual([])
  })

  it('descarta o que a tabela não modela em vez de mandá-lo', () => {
    const { payload } = desnormalizarLocal('tasks', {
      kind: 'commitment',
      uid: 'chave-local',
      pendente: 1,
      title: 'Fechar o teste',
      target: { kind: 'lead', id: 56 },
    })

    expect(payload).toEqual({ titulo: 'Fechar o teste', opportunity_id: null, lead_id: 56 })
    expect(payload['kind']).toBeUndefined()
  })

  it('traduz também os campos_tocados — um PATCH tem que dizer snoozed_to', () => {
    const { campos_tocados } = desnormalizarLocal(
      'tasks',
      { status: 'snoozed', snoozed_until: '2026-08-27', due_date: '2026-08-27' },
      ['status', 'snoozed_until', 'due_date'],
    )
    expect(campos_tocados).toEqual(['status', 'snoozed_to', 'due_date'])
  })

  it('um campo_tocado que não é coluna não viaja', () => {
    const { campos_tocados } = desnormalizarLocal('tasks', {}, ['kind', 'title', 'target'])
    expect(campos_tocados).toEqual(['titulo', 'opportunity_id', 'lead_id'])
  })

  it('quando a linha traz os dois nomes, manda o da coluna', () => {
    // Pasa con las filas que vinieron del servidor y se editaron acá: llevan
    // `titulo` (crudo) y `title` (normalizado) a la vez.
    const { payload } = desnormalizarLocal('tasks', {
      titulo: 'O que diz a tabela',
      title: 'O que diz o motor',
    })
    expect(payload).toEqual({ titulo: 'O que diz a tabela' })
  })

  it('traduz o VALOR de status, não só o nome das colunas', () => {
    // `dismissed` es una clave válida (`status` ES columna) con un valor que el
    // CHECK `tasks_status_chk` no acepta: pending/done/snoozed/cancelled. Por
    // eso no lo agarraba la lista de columnas y solo se veía como un 400
    // permanente en el teléfono de quien cerraba el Ritual da Sexta.
    const { payload } = desnormalizarLocal('tasks', { status: 'dismissed' })
    expect(payload['status']).toBe('cancelled')
    // La vuelta es identidad: el motor sigue leyendo su propio vocabulario.
    expect(normalizarRemoto('tasks', payload)['status']).toBe('dismissed')
  })

  it('os status que a tabela já entende salem intactos', () => {
    for (const status of ['pending', 'done', 'snoozed']) {
      expect(desnormalizarLocal('tasks', { status }).payload['status']).toBe(status)
      expect(normalizarRemoto('tasks', { status })['status']).toBe(status)
    }
  })

  it('não toca as outras tabelas: activities já fala a língua do servidor', () => {
    const linha = { opportunity_id: 89, activity_type: 'call', description: 'Liguei' }
    expect(desnormalizarLocal('activities', linha, ['description'])).toEqual({
      payload: linha,
      campos_tocados: ['description'],
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · Ida y vuelta: local → pg → local
   ══════════════════════════════════════════════════════════════════════════ */

describe('ida e volta com normalizarRemoto', () => {
  /** Lo que Postgres agrega solo y el local no puede saber al salir. */
  function comoVoltaDoServidor(pg: Record<string, unknown>): Record<string, unknown> {
    return { ...pg, created_at: '2026-08-26T12:00:00+00:00', updated_at: '2026-08-26T12:00:00+00:00' }
  }

  it('uma next_action volta idêntica', () => {
    const local: Task = {
      id: '9d3c8a6e-1111-4222-8333-444455556666',
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'opportunity', id: 89 },
      title: 'Ir com prova maior de 1000 caixas',
      due_date: '2026-08-28',
      status: 'pending',
      snoozed_until: null,
      created_at: '2026-08-26T12:00:00+00:00',
      canal: 'call',
      prioridade: 2,
      origem: 'manual',
    }

    const { payload } = desnormalizarLocal('tasks', { ...local })
    expect(chavesInventadas(payload)).toEqual([])

    const devolta = normalizarRemoto('tasks', comoVoltaDoServidor(payload))

    // Campo por campo: la fila que vuelve dice lo mismo que la que salió.
    expect(devolta['id']).toBe(local.id)
    expect(devolta['vendor']).toBe(local.vendor)
    expect(devolta['kind']).toBe(local.kind)
    expect(devolta['target']).toEqual(local.target)
    expect(devolta['title']).toBe(local.title)
    expect(devolta['due_date']).toBe(local.due_date)
    expect(devolta['status']).toBe(local.status)
    expect(devolta['snoozed_until']).toBe(null)
    expect(devolta['canal']).toBe('call')
    expect(devolta['prioridade']).toBe(2)
    expect(devolta['origem']).toBe('manual')
  })

  it('uma tarefa adiada conserva a data do adiamento', () => {
    const local = {
      id: 'b3b3c471-2f78-4a83-b97d-e8f3c19792d2',
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'lead' as const, id: 56 },
      title: 'Retomar o Tomas Ripoll',
      due_date: '2026-08-27',
      status: 'snoozed',
      snoozed_until: '2026-08-27',
      created_at: '2026-08-26T12:00:00+00:00',
    }
    const { payload } = desnormalizarLocal('tasks', local)
    expect(payload['snoozed_to']).toBe('2026-08-27')
    expect(payload['lead_id']).toBe(56)

    const devolta = normalizarRemoto('tasks', comoVoltaDoServidor(payload))
    expect(devolta['snoozed_until']).toBe('2026-08-27')
    expect(devolta['target']).toEqual({ kind: 'lead', id: 56 })
  })

  it('`kind` é o único campo que a volta não pode reconstruir, e diz por quê', () => {
    // No hay columna en `public.tasks` que lo guarde. Todo lo que llega de
    // afuera es la próxima acción de un negocio, así que normalizarRemoto lo
    // reconstruye como 'next_action'. Esto está acá para que el día que se
    // agregue la columna, este test caiga y alguien lo revise.
    expect(COLUNAS.has('kind')).toBe(false)

    const { payload } = desnormalizarLocal('tasks', {
      kind: 'commitment',
      title: 'Fechar o mês da Prueba',
      target: { kind: 'opportunity', id: 89 },
    })
    expect(normalizarRemoto('tasks', payload)['kind']).toBe('next_action')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · El flush sana los ítems ya encolados con la forma vieja
   ══════════════════════════════════════════════════════════════════════════ */

describe('itens já encolados com a forma antiga', () => {
  /**
   * El transporte REAL de Supabase es el que traduce, así que acá se usa una
   * copia de su cuello —la misma llamada a desnormalizarLocal— para poder
   * probarlo sin red ni variables de entorno. Lo que se comprueba es el
   * contrato: lo que sale del flush no tiene claves inventadas.
   */
  function transporteQueTraduz(): { enviadas: Array<Record<string, unknown>> } {
    const enviadas: Array<Record<string, unknown>> = []
    definirTransporte({
      enviar: (m) => {
        const { payload } = desnormalizarLocal(m.tabla, m.payload, m.campos_tocados)
        enviadas.push(m.op === 'insert' ? { ...payload, client_uuid: m.id } : payload)
        return Promise.resolve()
      },
    })
    return { enviadas }
  }

  it('um insert encolado ontem sai bem hoje, sem que ninguém o reescreva', async () => {
    const espiao = transporteQueTraduz()

    // EXACTAMENTE el payload que criarTask dejaba en la cola antes del arreglo.
    await enqueue({
      id: '11111111-2222-4333-8444-555555555555',
      tabla: 'tasks',
      op: 'insert',
      row_id: '11111111-2222-4333-8444-555555555555',
      campos_tocados: [],
      payload: {
        id: '11111111-2222-4333-8444-555555555555',
        vendor: 'Tomás',
        kind: 'next_action',
        opportunity_id: 89,
        lead_id: null,
        title: 'Ir com prova maior de 1000 caixas',
        due_date: '2026-08-28',
        status: 'pending',
      },
    })

    const resultado = await flush()
    expect(resultado.enviados).toBe(1)
    expect(await pending()).toHaveLength(0)

    const linha = espiao.enviadas[0] as Record<string, unknown>
    expect(chavesInventadas(linha)).toEqual([])
    expect(linha['titulo']).toBe('Ir com prova maior de 1000 caixas')
    expect(linha['kind']).toBeUndefined()
    expect(linha['client_uuid']).toBe('11111111-2222-4333-8444-555555555555')
    expect(linha['id']).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('um adiamento encolado ontem sai como snoozed_to', async () => {
    const espiao = transporteQueTraduz()

    await enqueue({
      tabla: 'tasks',
      op: 'update',
      row_id: 'b3b3c471-2f78-4a83-b97d-e8f3c19792d2',
      campos_tocados: ['status', 'snoozed_until', 'due_date'],
      payload: { status: 'snoozed', snoozed_until: '2026-08-27', due_date: '2026-08-27' },
    })

    await flush()
    expect(espiao.enviadas[0]).toEqual({
      status: 'snoozed',
      snoozed_to: '2026-08-27',
      due_date: '2026-08-27',
    })
    expect(await pending()).toHaveLength(0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · Las mutaciones de dominio
   ══════════════════════════════════════════════════════════════════════════ */

describe('mutações de tarefa', () => {
  it('criarTask manda id = client_uuid: a fila que volta é a MESMA tarefa', async () => {
    const espiao = transporteEspiao()
    const id = await criarTask({
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'opportunity', id: 89 },
      title: 'Ligar para o Fernando',
      dueDate: '2026-08-28',
      canal: 'call',
    })
    await flush()

    const enviada = espiao.enviadas[0]
    expect(enviada).toBeDefined()
    const { payload } = desnormalizarLocal('tasks', enviada?.payload ?? {})
    // El uuid local manda en las dos columnas: `id` porque la copia optimista
    // de Dexie se indexa por ahí (si Postgres inventara el suyo, el pull
    // traería la misma tarea como una segunda fila), `client_uuid` porque es
    // el UNIQUE que hace que reintentar el insert sea inofensivo.
    expect(payload['id']).toBe(id)
    expect(enviada?.id).toBe(id)
    expect(chavesInventadas(payload)).toEqual([])
    expect(payload['canal']).toBe('call')
    expect(payload['prioridade']).toBe(2)
    expect(payload['origem']).toBe('manual')

    // Y la copia local quedó con la forma que el motor lee.
    const local = await getDb().tasks.get(id)
    expect(local?.target).toEqual({ kind: 'opportunity', id: 89 })
    expect(local?.title).toBe('Ligar para o Fernando')
  })

  it('criarTask manda vendor_id quando quem chamou já resolveu o vendedor', async () => {
    // `sessao.vendor.id` threadeado desde o SessionProvider até a mutação: a
    // cópia otimista de Dexie e o outbox JÁ levam a FK, sem depender apenas do
    // match por nome que faz `trg_tasks_before_write` do lado do servidor.
    const espiao = transporteEspiao()
    const id = await criarTask({
      vendor: 'Tomás',
      vendorId: 4,
      kind: 'next_action',
      target: { kind: 'opportunity', id: 89 },
      title: 'Ligar para o Fernando',
      dueDate: '2026-08-28',
    })
    await flush()
    const { payload } = desnormalizarLocal('tasks', espiao.enviadas[0]?.payload ?? {})
    expect(payload['vendor_id']).toBe(4)
    expect(chavesInventadas(payload)).toEqual([])

    const local = await getDb().tasks.get(id)
    expect(local?.vendor_id).toBe(4)
  })

  it('criarTask não inventa colunas para os campos que ninguém preencheu', async () => {
    const espiao = transporteEspiao()
    await criarTask({
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'lead', id: 56 },
      title: 'Retomar a cadência',
      dueDate: '2026-08-28',
    })
    await flush()
    const { payload } = desnormalizarLocal('tasks', espiao.enviadas[0]?.payload ?? {})
    // Sin canal, sin escala, sin borrador: esas columnas ni aparecen, para que
    // el default de Postgres siga mandando.
    expect(Object.keys(payload).sort()).toEqual(
      ['due_date', 'id', 'lead_id', 'opportunity_id', 'origem', 'prioridade', 'status', 'titulo', 'vendor'].sort(),
    )
  })

  it('criarTask recusa um alvo que a tabela não pode guardar', async () => {
    // CHECK `tasks_owner_chk`: opportunity_id OR lead_id. Fallar acá —donde la
    // pantalla lo puede mostrar— es mejor que dejar un 400 eterno en la cola.
    await expect(
      criarTask({
        vendor: 'Tomás',
        kind: 'commitment',
        target: { kind: 'commitment', id: 7 },
        title: 'Compromisso da semana',
        dueDate: '2026-08-28',
      }),
    ).rejects.toThrow()
    expect(await pending()).toHaveLength(0)
  })

  it('concluirTask manda done_at: sem ele o CHECK tasks_done_chk rejeita a fila', async () => {
    const espiao = transporteEspiao()
    await getDb().tasks.put({
      id: 'b3b3c471-2f78-4a83-b97d-e8f3c19792d2',
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'opportunity', id: 89 },
      title: 'Ir com prova maior',
      due_date: '2026-08-28',
      status: 'pending',
      snoozed_until: null,
      created_at: '2026-08-26T12:00:00+00:00',
    })

    await concluirTask({ taskId: 'b3b3c471-2f78-4a83-b97d-e8f3c19792d2' })
    await flush()

    const { payload } = desnormalizarLocal('tasks', espiao.enviadas[0]?.payload ?? {})
    expect(payload['status']).toBe('done')
    expect(typeof payload['done_at']).toBe('string')
    expect(chavesInventadas(payload)).toEqual([])
  })

  it('adiarTask sai com snoozed_to e a data, que é o que o CHECK do snooze pede', async () => {
    const espiao = transporteEspiao()
    await getDb().tasks.put({
      id: 'fae25c58-355c-436e-8828-10a417af9d75',
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'opportunity', id: 91 },
      title: 'Reunião com Tomas Ripoll',
      due_date: '2026-08-26',
      status: 'pending',
      snoozed_until: null,
      created_at: '2026-08-26T12:00:00+00:00',
    })

    await adiarTask({ taskId: 'fae25c58-355c-436e-8828-10a417af9d75', ate: '2026-08-27' })
    await flush()

    const enviada = espiao.enviadas[0]
    const { payload, campos_tocados } = desnormalizarLocal(
      'tasks',
      enviada?.payload ?? {},
      enviada?.campos_tocados ?? [],
    )
    expect(payload).toEqual({ status: 'snoozed', snoozed_to: '2026-08-27', due_date: '2026-08-27' })
    expect(campos_tocados).toContain('snoozed_to')
    expect(campos_tocados).not.toContain('snoozed_until')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5 · El Ritual da Sexta también escribe en `tasks`
   ══════════════════════════════════════════════════════════════════════════
   Es el tercer camino de escritura, y estaba roto de las dos maneras a la vez:
   un veredicto 'cumprido' mandaba `status:'done'` SIN `done_at` (CHECK
   `tasks_done_chk`) y uno 'parcial'/'nao_rolou' mandaba `status:'dismissed'`,
   que no está en `tasks_status_chk`. Los dos son 400 permanentes: el vendedor
   cierra su semana, la pantalla le dice que sí, y el veredicto se queda en el
   teléfono para siempre. */

describe('veredicto do Ritual da Sexta sobre uma tarefa', () => {
  const ID = 'c0ffee00-1111-4222-8333-444455556666'

  async function tarefaNaSemana(): Promise<void> {
    await getDb().tasks.put({
      id: ID,
      vendor: 'Tomás',
      kind: 'next_action',
      target: { kind: 'opportunity', id: 89 },
      title: 'Levar a prova de 1000 caixas',
      due_date: '2026-08-28',
      status: 'pending',
      snoozed_until: null,
      created_at: '2026-08-26T12:00:00+00:00',
    })
  }

  function item(): ItemDoVeredicto {
    return {
      id: ID,
      origem: 'task',
      titulo: 'Levar a prova de 1000 caixas',
      cliente: 'Prueba Tripolla',
      proposto: 'nao_rolou',
      evidencia: 'Nada registrado nesta semana.',
      registrado: null,
    }
  }

  it('«cumprido» manda done_at, que é o que o CHECK tasks_done_chk pede', async () => {
    const espiao = transporteEspiao()
    await tarefaNaSemana()

    await registrarVeredicto({
      vendor: 'Tomás',
      hoje: '2026-08-28',
      item: item(),
      veredicto: 'cumprido',
    })
    await flush()

    const { payload } = desnormalizarLocal('tasks', espiao.enviadas[0]?.payload ?? {})
    expect(payload['status']).toBe('done')
    expect(typeof payload['done_at']).toBe('string')
    expect(chavesInventadas(payload)).toEqual([])
  })

  it('«nao_rolou» sai como cancelled: «dismissed» não existe em tasks_status_chk', async () => {
    const espiao = transporteEspiao()
    await tarefaNaSemana()

    await registrarVeredicto({
      vendor: 'Tomás',
      hoje: '2026-08-28',
      item: item(),
      veredicto: 'nao_rolou',
    })
    await flush()

    const { payload } = desnormalizarLocal('tasks', espiao.enviadas[0]?.payload ?? {})
    expect(payload['status']).toBe('cancelled')
    expect(payload['done_at']).toBe(null)
    expect(chavesInventadas(payload)).toEqual([])

    // Y la copia local siguió hablando el idioma del motor.
    expect((await getDb().tasks.get(ID))?.status).toBe('dismissed')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6 · La regla dura no se escapa por el rename
   ══════════════════════════════════════════════════════════════════════════ */

describe('nomesEquivalentes', () => {
  it('conhece os dois nomes de cada campo renomeado', () => {
    expect(nomesEquivalentes('tasks', 'snoozed_until').sort()).toEqual(
      ['snoozed_to', 'snoozed_until'].sort(),
    )
    expect(nomesEquivalentes('tasks', 'title').sort()).toEqual(['title', 'titulo'].sort())
    expect(nomesEquivalentes('tasks', 'target').sort()).toEqual(
      ['lead_id', 'opportunity_id', 'target'].sort(),
    )
  })

  it('não mexe com as tabelas que já falam a língua do servidor', () => {
    expect(nomesEquivalentes('opportunities', 'scales.dor')).toEqual(['scales.dor'])
  })
})
