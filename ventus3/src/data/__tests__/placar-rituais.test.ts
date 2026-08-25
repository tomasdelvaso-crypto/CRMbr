// src/data/__tests__/placar-rituais.test.ts
// Las promesas del Placar y de los Rituais que no se pueden romper en
// silencio. Ninguna de estas es cosmética: cada una es una decisión de
// producto que, si se rompe, produce el daño exacto que el diseño evita.
//
//  1. LOS CARRILES NO SE ORDENAN POR RESULTADO. Nunca. Con n=4 ordenar por
//     porcentaje fabrica un último público permanente.
//  2. QUIEN NO TIENE SNAPSHOT NO APARECE EN CERO. Un teléfono sin señal no es
//     una acusación.
//  3. LOS TROFÉUS NO SE ADELANTAN. Antes de las 17h del viernes, nada.
//  4. EL AVISO DE SOBRECARGA NO EXISTE SIN HISTÓRICO. Avisar sin datos es
//     inventar una advertencia.
//  5. LOS KUDOS SON 5, EXIGEN TEXTO Y NO SE AUTOENVÍAN.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste } from '../db'
import { fetchPlacarSemana, revelacaoDosTrofeus, diasUteisDaSemana } from '../placar'
import { avisoDeSobrecarga, mediaDeEntregasPorDia, ritualDoMomento } from '../rituais'
import { KUDOS_POR_SEMANA, enviarKudo, fetchKudosDaSemana } from '../gamificacao'
import { atividade } from '@/core/__tests__/fixtures'
import type { LocalActivity } from '../local-types'
import type { Vendor } from '@/core'

/** Segunda-feira da semana de teste. 2026-08-24 é segunda. */
const SEGUNDA = '2026-08-24'
const TERCA = '2026-08-25'
const SEXTA = '2026-08-28'
const SABADO = '2026-08-29'

const VENDOR = 'Renata'

function vendedor(nome: string, id: number): Vendor {
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

/** Uma atividade da Renata na terça, já na forma local que o Dexie guarda. */
function local(uid: string): LocalActivity {
  return {
    ...atividade(1, TERCA, { vendor: VENDOR }),
    uid,
    client_uuid: null,
    pendente: 0,
  }
}

/** Um instante BRT dentro do dia, expresso em UTC (BRT = UTC−3). */
function brt(dia: string, hora: number, minuto = 0): Date {
  return new Date(`${dia}T${String(hora + 3).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00Z`)
}

let db: VentusDatabase

beforeEach(async () => {
  db = new VentusDatabase(`placar-teste-${Math.random().toString(36).slice(2)}`)
  _setDbParaTeste(db)
  await db.open()
})

afterEach(async () => {
  await db.delete()
  _setDbParaTeste(null)
})

/* ══════════════════════════════════════════════════════════════════════════
   1 · Os carris do time
   ══════════════════════════════════════════════════════════════════════════ */

describe('carris do time', () => {
  it('ordena alfabeticamente e NUNCA por resultado', async () => {
    await db.vendors.bulkPut([
      vendedor('Victor Hugo', 1),
      vendedor('Andre', 2),
      vendedor(VENDOR, 3),
      vendedor('Paulo', 4),
    ])
    // A Renata é a única com atividade: se houvesse ordenação por resultado,
    // ela iria para o topo. Tem que ficar no seu lugar alfabético.
    await db.activities.bulkPut([0, 1, 2].map((i) => local(`a-${i}`)))

    const placar = await fetchPlacarSemana(VENDOR, TERCA, brt(TERCA, 10))
    const nomes = placar.carris.contato.map((c) => c.vendorName)

    expect(nomes).toEqual(['Andre', 'Paulo', 'Renata', 'Victor Hugo'])
  })

  it('marca «sem dados» em vez de inventar um zero', async () => {
    await db.vendors.bulkPut([vendedor(VENDOR, 1), vendedor('Andre', 2)])

    const placar = await fetchPlacarSemana(VENDOR, TERCA, brt(TERCA, 10))
    const andre = placar.carris.avanco.find((c) => c.vendorName === 'Andre')

    expect(andre?.temDados).toBe(false)
    // O valor cru é 0, mas a tela lê `temDados` e desenha o carril vazio.
    expect(andre?.pct).toBe(0)
  })

  it('inclui o vendedor logado mesmo sem a tabela vendors baixada', async () => {
    const placar = await fetchPlacarSemana(VENDOR, TERCA, brt(TERCA, 10))
    expect(placar.carris.contato.map((c) => c.vendorName)).toEqual([VENDOR])
    expect(placar.carris.contato[0]?.euMesmo).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · A revelação dos troféus
   ══════════════════════════════════════════════════════════════════════════ */

describe('revelação dos troféus', () => {
  it('não adianta nada antes das 17h de sexta', () => {
    expect(revelacaoDosTrofeus(TERCA, brt(TERCA, 18)).revelado).toBe(false)
    expect(revelacaoDosTrofeus(SEXTA, brt(SEXTA, 16, 59)).revelado).toBe(false)
  })

  it('revela às 17h de sexta e segue revelado no fim de semana', () => {
    expect(revelacaoDosTrofeus(SEXTA, brt(SEXTA, 17)).revelado).toBe(true)
    expect(revelacaoDosTrofeus(SABADO, brt(SABADO, 9)).revelado).toBe(true)
  })

  it('sem revelação, nenhum troféu mostra vencedor', async () => {
    await db.vendors.bulkPut([vendedor(VENDOR, 1)])
    await db.activities.put(local('a-1'))

    const placar = await fetchPlacarSemana(VENDOR, TERCA, brt(TERCA, 10))
    expect(placar.trofeus).toHaveLength(5)
    expect(placar.trofeus.every((t) => t.vencedor === null)).toBe(true)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · Semana e dias úteis
   ══════════════════════════════════════════════════════════════════════════ */

describe('dias úteis da semana', () => {
  it('são cinco numa semana sem feriado', () => {
    expect(diasUteisDaSemana(TERCA)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
  })

  it('tira o feriado: a semana do 7 de setembro tem quatro', () => {
    // 2026-09-07 é segunda e é a Independência.
    expect(diasUteisDaSemana('2026-09-08')).toHaveLength(4)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · A janela de cada ritual
   ══════════════════════════════════════════════════════════════════════════ */

describe('ritual do momento', () => {
  it('segunda cedo é o ritual da segunda, não o da manhã', () => {
    expect(ritualDoMomento(SEGUNDA, brt(SEGUNDA, 8))).toBe('segunda')
  })

  it('terça antes das 10h é a manhã', () => {
    expect(ritualDoMomento(TERCA, brt(TERCA, 8, 30))).toBe('manha')
  })

  it('depois das 18h de um dia útil é o encerramento', () => {
    expect(ritualDoMomento(TERCA, brt(TERCA, 19))).toBe('noite')
  })

  it('sexta a partir das 16h é o veredicto, não o encerramento', () => {
    expect(ritualDoMomento(SEXTA, brt(SEXTA, 16, 5))).toBe('sexta')
    expect(ritualDoMomento(SEXTA, brt(SEXTA, 19))).toBe('sexta')
  })

  it('no meio da tarde não oferece nada — e está certo', () => {
    expect(ritualDoMomento(TERCA, brt(TERCA, 14))).toBeNull()
  })

  it('no fim de semana não cobra nada de ninguém', () => {
    expect(ritualDoMomento(SABADO, brt(SABADO, 9))).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5 · O aviso de sobrecarga
   ══════════════════════════════════════════════════════════════════════════ */

describe('aviso de sobrecarga', () => {
  it('não avisa sem histórico: seria inventar uma advertência', () => {
    expect(avisoDeSobrecarga(3, 0, 0)).toBeNull()
  })

  it('não avisa quando três está dentro da média', () => {
    expect(avisoDeSobrecarga(3, 3.4, 4)).toBeNull()
  })

  it('avisa com o número na mão e sem culpa', () => {
    const texto = avisoDeSobrecarga(3, 1.4, 4)
    expect(texto).toContain('1,4')
    // O tom é o requisito: nada de «você não vai conseguir».
    expect(texto).not.toMatch(/não vai|falhou|fracass/i)
  })

  it('a média sai dos 20 dias úteis das 4 semanas anteriores', () => {
    // 10 registros na semana anterior, 5 dias úteis nela e 15 nas outras três.
    const acts = Array.from({ length: 10 }, () => ({
      activity_date: '2026-08-18',
      created_at: '2026-08-18T12:00:00Z',
    }))
    const { media, semanas } = mediaDeEntregasPorDia(acts, [], TERCA)
    expect(semanas).toBe(4)
    expect(media).toBeGreaterThan(0)
    expect(media).toBeLessThan(1)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   6 · Kudos
   ══════════════════════════════════════════════════════════════════════════ */

describe('kudos', () => {
  const bom = 'Passou o contato da Tetra sabendo que era meu cliente.'

  it('exige texto com um fato concreto', async () => {
    await expect(enviarKudo({ de: VENDOR, para: 'Andre', texto: 'boa!', hoje: TERCA })).rejects.toThrow()
  })

  it('não deixa dar kudo para si mesmo', async () => {
    await expect(enviarKudo({ de: VENDOR, para: VENDOR, texto: bom, hoje: TERCA })).rejects.toThrow()
  })

  it('são cinco por semana e não acumulam', async () => {
    for (let i = 0; i < KUDOS_POR_SEMANA; i += 1) {
      await enviarKudo({ de: VENDOR, para: 'Andre', texto: `${bom} ${i}`, hoje: TERCA })
    }
    await expect(
      enviarKudo({ de: VENDOR, para: 'Paulo', texto: bom, hoje: TERCA }),
    ).rejects.toThrow()

    const saldo = await fetchKudosDaSemana(VENDOR, TERCA)
    expect(saldo.restantes).toBe(0)
    expect(saldo.enviados).toHaveLength(KUDOS_POR_SEMANA)
    // Semana nova, saldo novo — nunca acumulado.
    const proxima = await fetchKudosDaSemana(VENDOR, '2026-08-31')
    expect(proxima.restantes).toBe(KUDOS_POR_SEMANA)
  })
})
