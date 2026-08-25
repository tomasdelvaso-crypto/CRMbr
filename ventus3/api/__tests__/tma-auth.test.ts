// api/__tests__/tma-auth.test.ts
// La validación del initData es la única puerta del Mini App. Igual que
// `auth.test.ts` con el JWT, cada test de acá describe una forma real de
// entrar como otro vendedor, y la afirmación es que NO se entra.
//
// Los dos casos que el plano exige explícitamente están marcados: hash
// inválido y auth_date vencido.

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_START_PARAM,
  TTL_PADRAO_SEG,
  montarDataCheckString,
  validarInitData,
} from '../_lib/tma'

const TOKEN = '7654321:AAF-fake-bot-token-para-testes-do-ventus'
const OUTRO_TOKEN = '7654321:AAF-token-de-outro-bot-qualquer'

const VICTOR = { id: 501, first_name: 'Victor Hugo', username: 'victorh' }
const TOMAS = { id: 502, first_name: 'Tomás', username: 'tomasv' }

/** Construye un initData FIRMADO de verdad, como lo haría Telegram. */
function initData(
  campos: Record<string, string>,
  opcoes: { token?: string; hash?: string } = {},
): string {
  const params = new URLSearchParams(campos)
  const dcs = montarDataCheckString(params)
  const chave = createHmac('sha256', 'WebAppData').update(opcoes.token ?? TOKEN).digest()
  const hash = opcoes.hash ?? createHmac('sha256', chave).update(dcs).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

function agoraSeg(): number {
  return Math.floor(Date.now() / 1000)
}

function valido(extra: Record<string, string> = {}): string {
  return initData({
    user: JSON.stringify(VICTOR),
    auth_date: String(agoraSeg() - 10),
    query_id: 'AAH-query-de-teste',
    chat_type: 'private',
    signature: 'assinatura-ed25519-de-terceiros',
    ...extra,
  })
}

describe('montarDataCheckString', () => {
  it('ordena alfabeticamente e exclui só o hash', () => {
    const dcs = montarDataCheckString(
      new URLSearchParams({
        user: '{"id":1}',
        auth_date: '100',
        hash: 'deadbeef',
        chat_instance: 'xyz',
      }),
    )
    expect(dcs).toBe('auth_date=100\nchat_instance=xyz\nuser={"id":1}')
  })

  it('MANTÉM signature no data-check-string', () => {
    // Excluir `signature` es el error que hace fallar TODO initData de un
    // cliente moderno de Telegram: solo la validación por terceros lo saca.
    const dcs = montarDataCheckString(
      new URLSearchParams({ auth_date: '100', signature: 'abc', hash: 'x' }),
    )
    expect(dcs).toBe('auth_date=100\nsignature=abc')
  })
})

describe('validarInitData — caminho feliz', () => {
  it('aceita um initData assinado e recente', () => {
    const r = validarInitData(valido(), TOKEN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.usuario.id).toBe(VICTOR.id)
    expect(r.dados.usuario.username).toBe('victorh')
    expect(r.dados.queryId).toBe('AAH-query-de-teste')
    expect(r.dados.idadeSeg).toBeLessThan(60)
  })

  it('devolve o start_param quando cabe nos 64 chars', () => {
    const r = validarInitData(valido({ start_param: 'opp_1842_log' }), TOKEN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.startParam).toBe('opp_1842_log')
  })

  it('ignora um start_param mais longo que o contrato de 64', () => {
    const r = validarInitData(valido({ start_param: 'x'.repeat(MAX_START_PARAM + 1) }), TOKEN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dados.startParam).toBeNull()
  })
})

describe('validarInitData — hash inválido', () => {
  it('recusa um hash trocado por outro qualquer', () => {
    const r = validarInitData(valido({ }).replace(/hash=[0-9a-f]+/, `hash=${'a'.repeat(64)}`), TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('hash_invalido')
  })

  it('recusa quando alguém edita o user DEPOIS de assinar', () => {
    // El ataque de verdad: tomo mi propio initData válido y cambio el id por
    // el de otro vendedor para registrar visitas a su nombre.
    const meu = new URLSearchParams(valido())
    expect(meu.get('user')).toContain('501')
    meu.set('user', JSON.stringify(TOMAS)) // el hash sigue siendo el de Victor
    const r = validarInitData(meu.toString(), TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('hash_invalido')
  })

  it('recusa um initData assinado com o token de outro bot', () => {
    const r = validarInitData(valido(), OUTRO_TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('hash_invalido')
  })

  it('recusa quando não vem hash nenhum', () => {
    const r = validarInitData(`user=${encodeURIComponent(JSON.stringify(VICTOR))}&auth_date=1`, TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sem_hash')
  })

  it('recusa um hash que nem tem forma de hex de 64', () => {
    const r = validarInitData(valido().replace(/hash=[0-9a-f]+/, 'hash=nao-sou-hex'), TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sem_hash')
  })
})

describe('validarInitData — auth_date vencido', () => {
  it('recusa um initData mais velho que o TTL', () => {
    // Capturado de un log o de una URL compartida: el HMAC sigue siendo válido
    // para siempre, y por eso el reloj es una comprobación obligatoria.
    const velho = initData({
      user: JSON.stringify(VICTOR),
      auth_date: String(agoraSeg() - TTL_PADRAO_SEG - 60),
    })
    const r = validarInitData(velho, TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('vencido')
  })

  it('aceita o mesmo initData se o TTL for maior', () => {
    const idade = TTL_PADRAO_SEG + 60
    const velho = initData({
      user: JSON.stringify(VICTOR),
      auth_date: String(agoraSeg() - idade),
    })
    expect(validarInitData(velho, TOKEN, { ttlSeg: idade + 120 }).ok).toBe(true)
  })

  it('respeita o relógio injetado', () => {
    const auth = 1_700_000_000
    const assinado = initData({ user: JSON.stringify(VICTOR), auth_date: String(auth) })
    const dentro = validarInitData(assinado, TOKEN, { agora: new Date((auth + 10) * 1000) })
    const fora = validarInitData(assinado, TOKEN, {
      agora: new Date((auth + TTL_PADRAO_SEG + 10) * 1000),
    })
    expect(dentro.ok).toBe(true)
    expect(fora.ok).toBe(false)
    if (fora.ok) return
    expect(fora.motivo).toBe('vencido')
  })

  it('recusa um auth_date no futuro além da tolerância de relógio', () => {
    const futuro = initData({
      user: JSON.stringify(VICTOR),
      auth_date: String(agoraSeg() + 3600),
    })
    const r = validarInitData(futuro, TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('futuro')
  })

  it('tolera um desvio pequeno de relógio', () => {
    const quase = initData({ user: JSON.stringify(VICTOR), auth_date: String(agoraSeg() + 20) })
    expect(validarInitData(quase, TOKEN).ok).toBe(true)
  })
})

describe('validarInitData — o resto do fail-closed', () => {
  it('recusa initData vazio', () => {
    const r = validarInitData('', TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('vazio')
  })

  it('recusa quando falta o token do bot', () => {
    const r = validarInitData(valido(), '')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sem_token')
  })

  it('recusa um initData assinado mas sem user', () => {
    const r = validarInitData(initData({ auth_date: String(agoraSeg()) }), TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sem_usuario')
  })

  it('recusa um user que não é JSON com id', () => {
    const r = validarInitData(
      initData({ user: 'nao-sou-json', auth_date: String(agoraSeg()) }),
      TOKEN,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('usuario_ilegivel')
  })

  it('recusa um bot', () => {
    const r = validarInitData(
      initData({
        user: JSON.stringify({ id: 9, is_bot: true, first_name: 'Bot' }),
        auth_date: String(agoraSeg()),
      }),
      TOKEN,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('bot')
  })

  it('recusa um initData assinado sem auth_date', () => {
    const r = validarInitData(initData({ user: JSON.stringify(VICTOR) }), TOKEN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sem_auth_date')
  })
})
