// src/host/__tests__/deep-link.test.ts
// El start_param es lo que convierte «el bot me avisó» en «el bot me hizo
// hacerlo». Si el parser se equivoca, el vendedor aterriza en la pantalla de
// otro negocio y registra ahí — que es peor que no haber recibido el aviso.
//
// Dos propiedades se fijan acá y no se negocian:
//   1. ida y vuelta: todo lo que `montarStartParam` emite, `lerStartParam` lo
//      vuelve a leer igual;
//   2. fail-closed: cualquier cosa rara es null, nunca «algo parecido».

import { describe, expect, it } from 'vitest'
import {
  ALFABETO_START_PARAM,
  MAX_START_PARAM,
  linkDoMiniApp,
  lerStartParam,
  montarStartParam,
  rotaDoAlvo,
  rotaDoStartParam,
  startParamDaUrl,
  startParamDoCaminho,
} from '../deep-link'

const UUID = '3f6b1c2e-8a44-4f1d-9b0e-77c2a1d5e900'

describe('lerStartParam', () => {
  it('lê a entidade, o id e a ação', () => {
    expect(lerStartParam('opp_1842_log')).toEqual({ entidade: 'opp', id: '1842', acao: 'log' })
  })

  it('lê uma entidade sem ação', () => {
    expect(lerStartParam('opp_1842')).toEqual({ entidade: 'opp', id: '1842', acao: null })
  })

  it('lê uma tela sem entidade', () => {
    expect(lerStartParam('golden_ini')).toEqual({ entidade: 'tela', id: 'golden_ini', acao: null })
  })

  it('lê uma tarefa por uuid', () => {
    expect(lerStartParam(`task_${UUID}_feito`)).toEqual({
      entidade: 'task',
      id: UUID,
      acao: 'feito',
    })
  })

  it('ignora espaços em volta', () => {
    expect(lerStartParam('  opp_1842  ')).toEqual({ entidade: 'opp', id: '1842', acao: null })
  })

  it.each([
    ['nulo', null],
    ['indefinido', undefined],
    ['vazio', ''],
    ['entidade desconhecida', 'cliente_9'],
    ['sem id', 'opp_'],
    ['id não numérico', 'opp_abc'],
    ['id com zero à esquerda', 'opp_0042'],
    ['ação inexistente', 'opp_1842_apagar'],
    ['uuid inválido em task', 'task_1842'],
    ['tela inexistente', 'painel_secreto'],
    ['fora do alfabeto de Telegram', 'opp/1842'],
    ['injeção de caminho', '..%2Fadmin'],
  ])('recusa: %s', (_nome, entrada) => {
    expect(lerStartParam(entrada)).toBeNull()
  })

  it('recusa acima de 64 caracteres', () => {
    expect(lerStartParam(`opp_1${'2'.repeat(MAX_START_PARAM)}`)).toBeNull()
  })
})

describe('rotaDoStartParam', () => {
  it.each([
    ['opp_1842', '/carteira/1842'],
    ['opp_1842_log', '/registrar?oportunidade=1842'],
    ['opp_1842_voz', '/registrar?oportunidade=1842&fonte=audio'],
    ['opp_1842_prep', '/carteira/1842?preparo=1'],
    ['opp_1842_adiar', '/carteira/1842?adiar=1'],
    ['lead_77', '/cadencia?lead=77'],
    ['lead_77_conv', '/cadencia?lead=77&converter=1'],
    ['hoje', '/'],
    ['golden_ini', '/golden?iniciar=1'],
    ['fechar_dia', '/rituais?aba=encerramento'],
    ['voz', '/registrar?fonte=audio'],
  ])('%s → %s', (param, esperado) => {
    expect(rotaDoStartParam(param)?.para).toBe(esperado)
  })

  it('a tarefa aterrissa em Hoje com o foco na tarefa', () => {
    expect(rotaDoStartParam(`task_${UUID}`)?.para).toBe(`/?task=${UUID}`)
  })

  it('devolve null quando não entende', () => {
    expect(rotaDoStartParam('opp_1842_apagar')).toBeNull()
  })

  it('separa pathname de search', () => {
    const rota = rotaDoStartParam('opp_1842_prep')
    expect(rota?.pathname).toBe('/carteira/1842')
    expect(rota?.search).toBe('?preparo=1')
  })
})

describe('montarStartParam — ida e volta', () => {
  const alvos = [
    { entidade: 'opp', id: '1842', acao: null },
    { entidade: 'opp', id: '1842', acao: 'log' },
    { entidade: 'lead', id: '77', acao: 'conv' },
    { entidade: 'task', id: UUID, acao: 'adiar' },
    { entidade: 'tela', id: 'placar', acao: null },
  ] as const

  it.each(alvos)('$entidade/$id/$acao volta igual', (alvo) => {
    const param = montarStartParam(alvo)
    expect(param).not.toBeNull()
    expect(param!.length).toBeLessThanOrEqual(MAX_START_PARAM)
    expect(ALFABETO_START_PARAM.test(param!)).toBe(true)
    expect(lerStartParam(param)).toEqual(alvo)
  })

  it('recusa emitir algo que não se possa reler', () => {
    expect(montarStartParam({ entidade: 'opp', id: 'abc', acao: null })).toBeNull()
    expect(montarStartParam({ entidade: 'opp', id: '1', acao: 'apagar' })).toBeNull()
  })

  it('recusa emitir acima do teto de 64', () => {
    expect(montarStartParam({ entidade: 'opp', id: '9'.repeat(70), acao: null })).toBeNull()
  })
})

describe('startParamDoCaminho — os deep links que o dispatcher já escreve', () => {
  it.each([
    ['/carteira/1842', 'opp_1842'],
    ['/carteira/1842?preparo=1', 'opp_1842_prep'],
    ['/carteira/1842?adiar=1', 'opp_1842_adiar'],
    ['/registrar?oportunidade=46', 'opp_46_log'],
    ['/registrar?opportunityId=46', 'opp_46_log'],
    ['/registrar?fonte=audio', 'voz'],
    ['/cadencia?lead=77&converter=1', 'lead_77_conv'],
    ['/golden?iniciar=1', 'golden_ini'],
    ['/golden', 'golden'],
    ['/rituais?aba=encerramento', 'fechar_dia'],
    ['/placar?kudos=1', 'kudos'],
    ['/placar?semana=2026-W34', 'placar'],
    ['/', 'hoje'],
  ])('%s → %s', (caminho, esperado) => {
    expect(startParamDoCaminho(caminho)).toBe(esperado)
  })

  it('prefere a tela mais específica', () => {
    // `/rituais?aba=encerramento` casa con `rituais` y con `fechar_dia`: gana
    // el que declara más parámetros, porque es el que lleva más lejos.
    expect(startParamDoCaminho('/rituais?aba=encerramento')).toBe('fechar_dia')
    expect(startParamDoCaminho('/rituais')).toBe('rituais')
  })

  it('degrada a abrir a ficha quando a query não é codificável', () => {
    // El dispatcher manda `?risco=<codigo>`; no hay código para cada señal, y
    // abrir la ficha sigue siendo el destino correcto.
    expect(startParamDoCaminho('/carteira/1842?risco=silencio_45d')).toBe('opp_1842')
  })

  it('devolve null quando não há destino codificável', () => {
    expect(startParamDoCaminho('/kitchen')).toBeNull()
    expect(startParamDoCaminho('')).toBeNull()
  })

  it('fecha o ciclo: caminho → start_param → caminho', () => {
    for (const caminho of ['/carteira/1842?preparo=1', '/cadencia?lead=77&converter=1', '/golden?iniciar=1']) {
      const param = startParamDoCaminho(caminho)
      expect(param).not.toBeNull()
      expect(rotaDoStartParam(param)?.para).toBe(caminho)
    }
  })
})

describe('links', () => {
  it('monta o link do Mini App', () => {
    expect(linkDoMiniApp('VentusBot', 'opp_1842_log')).toBe(
      'https://t.me/VentusBot/app?startapp=opp_1842_log',
    )
  })

  it('aceita o bot com arroba e sem start_param', () => {
    expect(linkDoMiniApp('@VentusBot', null)).toBe('https://t.me/VentusBot/app')
  })

  it('lê o start_param da query e do fragmento', () => {
    expect(startParamDaUrl('https://ventus.app/?tgWebAppStartParam=opp_1842')).toBe('opp_1842')
    expect(startParamDaUrl('https://ventus.app/?startapp=golden')).toBe('golden')
    expect(startParamDaUrl('https://ventus.app/#tgWebAppData=x&tgWebAppStartParam=placar')).toBe(
      'placar',
    )
    expect(startParamDaUrl('https://ventus.app/')).toBeNull()
    expect(startParamDaUrl('nao-e-url')).toBeNull()
  })
})

describe('rotaDoAlvo', () => {
  it('cai na primeira regra quando a ação não existe', () => {
    // Defensa: `rotaDoAlvo` es pública y puede recibir un alvo armado a mano.
    expect(rotaDoAlvo({ entidade: 'opp', id: '9', acao: 'inventada' }).para).toBe('/carteira/9')
  })

  it('cai em Hoje quando a tela não existe', () => {
    expect(rotaDoAlvo({ entidade: 'tela', id: 'inexistente', acao: null }).para).toBe('/')
  })
})
