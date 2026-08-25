// api/dispatch/__tests__/politica.test.ts
// Los cuatro tests que el plano pide por nombre —presupuesto, dedupe, quiet
// hours y colapso por topic— más los bordes donde el v2 se rompió de verdad.
//
// Todo es determinístico: la política no lee el reloj, lo recibe. `agora` se
// construye siempre con offset -03:00 explícito para que el test diga lo mismo
// corriendo en São Paulo, en un runner UTC o en un contenedor con TZ rara.

import { describe, expect, it } from 'vitest'
import {
  RESERVA_PRIORIDADE_1,
  colapsarPorTopic,
  emSilencio,
  minutosDe,
  montarAgregado,
  planejarDespacho,
  proximaAbertura,
  sanearTopic,
  transportesDe,
  ttlRestante,
  urgenciaDe,
} from '../_politica'
import { motivoSemAcaoDireta } from '../_catalogo'
import type {
  AvisoNaFila,
  CanaisDisponiveis,
  GastoDoDia,
  PreferenciasDeAviso,
  Prioridade,
} from '../_tipos'
import { PREFS_PADRAO } from '../_tipos'

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const VENDOR = 'Victor Hugo'

const prefs = (over: Partial<PreferenciasDeAviso> = {}): PreferenciasDeAviso => ({
  vendor: VENDOR,
  ...PREFS_PADRAO,
  ...over,
})

const CANAIS_OK: CanaisDisponiveis = { telegram: true, push: true }
const SEM_GASTO: GastoDoDia = { total: 0, naoUrgentes: 0 }

let seq = 0
function aviso(over: Partial<AvisoNaFila> = {}): AvisoNaFila {
  seq += 1
  return {
    id: `n${String(seq).padStart(3, '0')}`,
    vendor: VENDOR,
    vendor_id: 3,
    tipo: 'agenda_manha',
    prioridade: 2,
    titulo: 'Agenda da manhã',
    corpo: '3 prioridades',
    canal: 'ambos',
    topic: null,
    ttl_segundos: 10_800,
    deep_link: '/hoje?foco=1',
    acoes: [{ rotulo: 'Abrir a 1ª', deep_link: '/hoje?foco=1' }],
    dedupe_key: `${VENDOR}:agenda:2026-08-25`,
    agendado_para: '2026-08-25T07:00:00-03:00',
    adiado_para: null,
    opportunity_id: null,
    lead_id: null,
    task_id: null,
    ...over,
  }
}

/** 25/08/2026 (terça) às HH:MM em BRT. */
const emBRT = (hhmm: string): Date => new Date(`2026-08-25T${hhmm}:00-03:00`)

const base = (over: Partial<Parameters<typeof planejarDespacho>[0]> = {}) => ({
  vendor: VENDOR,
  agora: emBRT('09:00'),
  prefs: prefs(),
  fila: [] as AvisoNaFila[],
  gasto: SEM_GASTO,
  canais: CANAIS_OK,
  ...over,
})

/* ══════════════════════════════════════════════════════════════════════════
   1 · Presupuesto
   ══════════════════════════════════════════════════════════════════════════ */

describe('presupuesto diario', () => {
  it('nunca manda más de orcamento_diario en un día', () => {
    // 8 avisos rutinarios de topics distintos: el tope es 4 y la reserva de la
    // prioridad 1 deja sólo 2 lugares para lo no urgente.
    const fila = Array.from({ length: 8 }, (_, i) =>
      aviso({ topic: `t${i}`, dedupe_key: `k${i}` }),
    )
    const plano = planejarDespacho(base({ fila }))

    expect(plano.envios).toHaveLength(4 - RESERVA_PRIORIDADE_1)
    expect(plano.suprimidos.filter((s) => s.motivo === 'orcamento_diario')).toHaveLength(6)
  })

  it('cuenta lo ya enviado hoy: el presupuesto es por día, no por corrida', () => {
    const fila = [aviso({ topic: 'a', dedupe_key: 'ka' })]
    const plano = planejarDespacho(
      base({ fila, gasto: { total: 2, naoUrgentes: 2 } }),
    )
    expect(plano.envios).toHaveLength(0)
    expect(plano.suprimidos[0]?.motivo).toBe('orcamento_diario')
  })

  it('la reserva protege la prioridad 1 aunque lo rutinario haya gastado su carril', () => {
    // Escenario real: a las 7h salieron agenda y resumen. A las 15h aparece
    // "reunião em 90 minutos". Con presupuesto por orden de llegada, se perdía.
    const fila = [
      aviso({ tipo: 'preparo_reuniao', prioridade: 1, topic: 'preparo', dedupe_key: 'kp',
              ttl_segundos: 5400, agendado_para: '2026-08-25T09:00:00-03:00' }),
      aviso({ topic: 'rot', dedupe_key: 'kr' }),
    ]
    const plano = planejarDespacho(base({ fila, gasto: { total: 2, naoUrgentes: 2 } }))

    expect(plano.envios).toHaveLength(1)
    expect(plano.envios[0]?.aviso.tipo).toBe('preparo_reuniao')
    expect(plano.envios[0]?.urgencia).toBe('high')
  })

  it('el tope duro se respeta también para la prioridad 1', () => {
    const fila = Array.from({ length: 3 }, (_, i) =>
      aviso({ tipo: 'preparo_reuniao', prioridade: 1, topic: `p${i}`, dedupe_key: `kp${i}`,
              ttl_segundos: 5400, agendado_para: '2026-08-25T09:00:00-03:00' }),
    )
    const plano = planejarDespacho(base({ fila, gasto: { total: 3, naoUrgentes: 2 } }))
    expect(plano.envios).toHaveLength(1) // 3 gastados + 1 = 4. Ni uno más.
  })

  it('orcamento_diario = 0 apaga los avisos sin romper nada', () => {
    const fila = [aviso({ tipo: 'preparo_reuniao', prioridade: 1, dedupe_key: 'kx' })]
    const plano = planejarDespacho(base({ fila, prefs: prefs({ orcamento_diario: 0 }) }))
    expect(plano.envios).toHaveLength(0)
    expect(plano.agregado).not.toBeNull()
  })

  it('lo que no entra vuelve como UN resumen al día siguiente, no como N avisos', () => {
    const fila = Array.from({ length: 5 }, (_, i) =>
      aviso({ topic: `t${i}`, dedupe_key: `k${i}`, titulo: `Aviso ${i}` }),
    )
    const plano = planejarDespacho(base({ fila }))
    const agregado = plano.agregado

    expect(agregado).not.toBeNull()
    expect(agregado?.tipo).toBe('resumo_adiado')
    expect(agregado?.titulo).toBe('3 avisos ficaram de ontem')
    expect(agregado?.agendado_para).toBe('2026-08-26T07:00:00-03:00')
    // Y el resumen también lleva acción directa.
    expect(motivoSemAcaoDireta({ tipo: 'resumo_adiado', ...agregado })).toBeNull()
  })

  it('el resumen recorta a 6 líneas y dice cuántas quedaron', () => {
    const muitos = Array.from({ length: 9 }, (_, i) =>
      aviso({ titulo: `Aviso ${i}`, dedupe_key: `k${i}` }),
    )
    const agregado = montarAgregado(VENDOR, muitos, emBRT('09:00'), prefs())
    const linhas = (agregado?.corpo ?? '').split('\n')
    expect(linhas).toHaveLength(7)
    expect(linhas[6]).toBe('• e mais 3')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · Dedupe
   ══════════════════════════════════════════════════════════════════════════ */

describe('dedupe por (vendor, entidade, tipo)', () => {
  it('dos avisos con la misma dedupe_key: sale uno solo', () => {
    const fila = [
      aviso({ dedupe_key: 'opp:46:acao_vencida', topic: 'a' }),
      aviso({ dedupe_key: 'opp:46:acao_vencida', topic: 'b' }),
    ]
    const plano = planejarDespacho(base({ fila }))
    expect(plano.envios).toHaveLength(1)
    expect(plano.suprimidos).toContainEqual({ id: fila[1]?.id, motivo: 'duplicada' })
  })

  it('no repite hoy lo que ya se envió hoy — el bug de los 106 días', () => {
    // La opp 46 acumuló 106 avisos idénticos, uno por día. La ventana es el día
    // civil BRT: lo ya enviado hoy no vuelve a salir hoy.
    const fila = [aviso({ dedupe_key: 'opp:46:acao_vencida' })]
    const plano = planejarDespacho(
      base({ fila, chavesEnviadasHoje: ['opp:46:acao_vencida'] }),
    )
    expect(plano.envios).toHaveLength(0)
    expect(plano.suprimidos[0]?.motivo).toBe('duplicada')
  })

  it('la soneca del vendedor no suprime: espera', () => {
    const fila = [aviso({ adiado_para: '2026-08-25T14:00:00-03:00' })]
    const plano = planejarDespacho(base({ fila, agora: emBRT('09:00') }))
    expect(plano.aguardando).toEqual([fila[0]?.id])
    expect(plano.suprimidos).toHaveLength(0)
    expect(plano.envios).toHaveLength(0)
  })

  it('vencida la soneca, sale', () => {
    const fila = [aviso({ adiado_para: '2026-08-25T08:00:00-03:00' })]
    const plano = planejarDespacho(base({ fila, agora: emBRT('09:00') }))
    expect(plano.envios).toHaveLength(1)
  })

  it('un tipo mutado no sale ni agregado', () => {
    const fila = [aviso({ tipo: 'agenda_manha' })]
    const plano = planejarDespacho(
      base({ fila, prefs: prefs({ tipos_mutados: ['agenda_manha'] }) }),
    )
    expect(plano.suprimidos[0]?.motivo).toBe('tipo_mutado')
    expect(plano.agregado).toBeNull()
  })

  it('avisos_de_jogo = false apaga de verdad los troféus', () => {
    const fila = [aviso({ tipo: 'trofeus_semana', prioridade: 4, dedupe_key: 'kt' })]
    const plano = planejarDespacho(base({ fila, prefs: prefs({ avisos_de_jogo: false }) }))
    expect(plano.envios).toHaveLength(0)
    expect(plano.suprimidos[0]?.motivo).toBe('tipo_mutado')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · Quiet hours
   ══════════════════════════════════════════════════════════════════════════ */

describe('quiet hours 20-7h BRT', () => {
  it('la ventana cruza la medianoche', () => {
    const p = prefs()
    expect(emSilencio(minutosDe('23:00'), p)).toBe(true)
    expect(emSilencio(minutosDe('02:30'), p)).toBe(true)
    expect(emSilencio(minutosDe('20:00'), p)).toBe(true)
    expect(emSilencio(minutosDe('06:59'), p)).toBe(true)
    expect(emSilencio(minutosDe('07:00'), p)).toBe(false)
    expect(emSilencio(minutosDe('19:59'), p)).toBe(false)
  })

  it('a las 23h nada sale: se corre a las 7h', () => {
    const fila = [aviso({ ttl_segundos: 86_400, agendado_para: '2026-08-25T22:00:00-03:00' })]
    const plano = planejarDespacho(base({ fila, agora: emBRT('23:00') }))
    expect(plano.envios).toHaveLength(0)
    expect(plano.adiados[0]).toEqual({
      id: fila[0]?.id,
      ate: '2026-08-26T07:00:00-03:00',
      motivo: 'horario_silencio',
    })
  })

  it('a las 3h de la madrugada la ventana abre a las 7h del MISMO día', () => {
    expect(proximaAbertura(new Date('2026-08-25T03:00:00-03:00'), prefs()))
      .toBe('2026-08-25T07:00:00-03:00')
  })

  it('lo que ya no será verdad a las 7h se tira en vez de mentir', () => {
    // "Golden Hour começa em 15" encolado a las 21h con TTL de 15 min.
    const fila = [aviso({
      tipo: 'golden_t15', prioridade: 1, ttl_segundos: 900, dedupe_key: 'kg',
      agendado_para: '2026-08-25T21:00:00-03:00',
    })]
    const plano = planejarDespacho(base({ fila, agora: emBRT('21:01') }))
    expect(plano.adiados).toHaveLength(0)
    expect(plano.suprimidos[0]?.motivo).toBe('expirada')
  })

  it('hora_aprendida corre la apertura, nunca la adelanta dentro del silencio', () => {
    const p = prefs({ hora_aprendida: 9 })
    expect(proximaAbertura(emBRT('23:00'), p)).toBe('2026-08-26T09:00:00-03:00')
    const p2 = prefs({ hora_aprendida: 5 }) // más temprano que el fin del silencio
    expect(proximaAbertura(emBRT('23:00'), p2)).toBe('2026-08-26T07:00:00-03:00')
  })

  it('el bloque de Golden Hour silencia todo lo que no es la Golden Hour', () => {
    const fila = [
      aviso({ topic: 'rot', dedupe_key: 'kr', ttl_segundos: 21_600 }),
      aviso({ tipo: 'preparo_reuniao', prioridade: 1, dedupe_key: 'kp', ttl_segundos: 5400,
              agendado_para: '2026-08-25T09:00:00-03:00' }),
    ]
    const plano = planejarDespacho(
      base({ fila, agora: emBRT('09:20'), janelaGolden: { de: 9 * 60, ate: 10 * 60 } }),
    )
    expect(plano.envios.map((e) => e.aviso.tipo)).toEqual(['preparo_reuniao'])
    expect(plano.adiados[0]).toEqual({
      id: fila[0]?.id,
      ate: '2026-08-25T10:00:00-03:00',
      motivo: 'bloco_golden_hour',
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · Colapso por topic
   ══════════════════════════════════════════════════════════════════════════ */

describe('colapso por topic', () => {
  it('teléfono apagado toda la mañana = UNA notificación de agenda, no seis', () => {
    const seis = Array.from({ length: 6 }, (_, i) =>
      aviso({
        topic: 'agenda',
        dedupe_key: `agenda:${i}`,
        titulo: `Agenda ${i}`,
        ttl_segundos: 86_400,
        agendado_para: `2026-08-25T${String(i + 7).padStart(2, '0')}:00:00-03:00`,
      }),
    )
    const plano = planejarDespacho(base({ fila: seis, agora: emBRT('12:00') }))

    expect(plano.envios).toHaveLength(1)
    expect(plano.envios[0]?.topic).toBe('agenda')
    // Gana el más reciente: la agenda de las 6h ya no dice la verdad a mediodía.
    expect(plano.envios[0]?.aviso.titulo).toBe('Agenda 5')
    expect(plano.envios[0]?.colapsados).toHaveLength(5)
    // Y los cinco quedan medidos como duplicados, no como enviados.
    expect(plano.suprimidos.filter((s) => s.motivo === 'duplicada')).toHaveLength(5)
  })

  it('el colapso no gasta cinco lugares del presupuesto, gasta uno', () => {
    const seis = Array.from({ length: 6 }, (_, i) =>
      aviso({ topic: 'agenda', dedupe_key: `agenda:${i}`, ttl_segundos: 86_400 }),
    )
    const outro = aviso({
      topic: 'risco', tipo: 'risco_critico', dedupe_key: 'krisco', ttl_segundos: 86_400,
    })
    const plano = planejarDespacho(base({ fila: [...seis, outro], agora: emBRT('12:00') }))
    expect(plano.envios).toHaveLength(2)
    expect(plano.suprimidos.filter((s) => s.motivo === 'orcamento_diario')).toHaveLength(0)
  })

  it('la prioridad manda sobre la hora dentro del mismo topic', () => {
    const rutina = aviso({ topic: 'golden', prioridade: 3, dedupe_key: 'k1',
                           agendado_para: '2026-08-25T11:00:00-03:00' })
    const urgente = aviso({ topic: 'golden', prioridade: 1, tipo: 'golden_t15', dedupe_key: 'k2',
                            ttl_segundos: 900, agendado_para: '2026-08-25T09:55:00-03:00' })
    const { mantidos } = colapsarPorTopic([rutina, urgente])
    expect(mantidos.map((m) => m.id)).toEqual([urgente.id])
  })

  it('topics distintos no se colapsan', () => {
    const { mantidos } = colapsarPorTopic([
      aviso({ topic: 'agenda' }),
      aviso({ topic: 'risco' }),
    ])
    expect(mantidos).toHaveLength(2)
  })

  it('el topic se sanea al alfabeto que el push service acepta', () => {
    expect(sanearTopic('opp:46/ação vencida!')).toBe('opp-46-a-o-vencida-')
    expect(sanearTopic('x'.repeat(64))).toHaveLength(32)
    expect(sanearTopic('!!!')).toBe('-')
    expect(sanearTopic('')).toBe('ventus')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   5 · Transportes, TTL y acción directa
   ══════════════════════════════════════════════════════════════════════════ */

describe('transportes', () => {
  it('respeta la preferencia del vendedor', () => {
    const a = aviso({ canal: 'ambos' })
    expect(transportesDe(a, prefs({ canais: ['push', 'telegram'] }), CANAIS_OK)).toEqual(['push'])
    expect(transportesDe(a, prefs({ canais: ['telegram', 'push'] }), CANAIS_OK)).toEqual(['telegram'])
  })

  it('cae al canal que existe cuando el preferido no está vinculado', () => {
    const a = aviso({ canal: 'ambos' })
    expect(transportesDe(a, prefs({ canais: ['telegram'] }), { telegram: false, push: true }))
      .toEqual(['push'])
  })

  it('la prioridad 1 sale por todos los transportes disponibles', () => {
    const a = aviso({ tipo: 'golden_t15', prioridade: 1, canal: 'ambos' })
    expect(transportesDe(a, prefs(), CANAIS_OK)).toEqual(['telegram', 'push'])
  })

  it('sin ningún canal se suprime con sem_canal, no se pierde en silencio', () => {
    const plano = planejarDespacho(
      base({ fila: [aviso()], canais: { telegram: false, push: false } }),
    )
    expect(plano.suprimidos[0]?.motivo).toBe('sem_canal')
  })

  it('el TTL que se pide es lo que queda de vigencia, no el nominal', () => {
    const a = aviso({ ttl_segundos: 5400, agendado_para: '2026-08-25T09:00:00-03:00' })
    expect(ttlRestante(a, emBRT('10:00'))).toBe(1800)
    expect(ttlRestante(a, emBRT('09:00'))).toBe(5400)
    // Nunca por debajo del piso: un TTL de 3s no llega a ningún lado.
    expect(ttlRestante(a, new Date('2026-08-25T10:29:58-03:00'))).toBe(60)
  })

  it('urgencia por prioridad', () => {
    const esperado: Record<Prioridade, string> = {
      1: 'high', 2: 'normal', 3: 'low', 4: 'very-low',
    }
    for (const p of [1, 2, 3, 4] as Prioridade[]) expect(urgenciaDe(p)).toBe(esperado[p])
  })
})

describe('acción directa obligatoria', () => {
  it('rechaza el aviso que sólo dice "abra o app"', () => {
    expect(motivoSemAcaoDireta({ tipo: 'agenda_manha', deep_link: '/', acoes: [] }))
      .toMatch(/ação direta/)
    expect(motivoSemAcaoDireta({ tipo: 'agenda_manha', deep_link: null, acoes: null }))
      .toMatch(/ação direta/)
  })

  it('acepta deep link específico o botones que cierran la acción', () => {
    expect(motivoSemAcaoDireta({ tipo: 'agenda_manha', deep_link: '/carteira/46?registrar=1' }))
      .toBeNull()
    expect(motivoSemAcaoDireta({
      tipo: 'agenda_manha',
      acoes: [{ rotulo: 'Feito', callback: 'task:abc:done:v3' }],
    })).toBeNull()
  })

  it('rechaza botones sin destino o sin rótulo', () => {
    expect(motivoSemAcaoDireta({ tipo: 'x', acoes: [{ rotulo: 'Feito' }] })).toMatch(/lugar nenhum/)
    expect(motivoSemAcaoDireta({ tipo: 'x', acoes: [{ rotulo: ' ', callback: 'a:b:v3' }] }))
      .toMatch(/rótulo/)
  })
})
