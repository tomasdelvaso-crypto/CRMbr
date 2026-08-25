// api/__tests__/auth.test.ts
// La verificación del JWT es la única puerta del backend. Estos tests fijan
// que sea FAIL-CLOSED: cada uno describe una forma real de entrar sin
// credenciales válidas, y la afirmación es que NO se entra.
//
// El caso `alg: none` y el de firma cambiada no son teóricos: son las dos
// primeras cosas que prueba cualquiera que encuentre un endpoint con Bearer.

import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarFakeDb } from './fake-supabase.js'

const SEGREDO = 'segredo-de-teste-do-ventus-v3'
const URL_SUPABASE = 'https://projeto.supabase.co'

const db = criarFakeDb()
vi.mock('../_lib/supabase', () => ({ serviceClient: () => db }))

const { limparCacheVendor, podeTocar, requireAuth, verificarJwt } = await import('../_lib/auth.js')
const { HttpError } = await import('../_lib/http.js')
import type { ApiRequest } from '../_lib/http.js'

/* ── Utilidades ─────────────────────────────────────────────────────────── */

function b64url(valor: object | string): string {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor)
  return Buffer.from(texto, 'utf8').toString('base64url')
}

interface OpcoesToken {
  alg?: string
  exp?: number
  iat?: number
  iss?: string
  aud?: string
  role?: string
  sub?: string
  assinar?: boolean
}

function token(opcoes: OpcoesToken = {}): string {
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = b64url({ alg: opcoes.alg ?? 'HS256', typ: 'JWT' })
  const claims = b64url({
    sub: opcoes.sub ?? '11111111-1111-1111-1111-111111111111',
    iss: opcoes.iss ?? `${URL_SUPABASE}/auth/v1`,
    aud: opcoes.aud ?? 'authenticated',
    role: opcoes.role ?? 'authenticated',
    email: 'vendedor@ventapel.com.br',
    iat: opcoes.iat ?? agora - 60,
    exp: opcoes.exp ?? agora + 3600,
  })
  const assinatura =
    opcoes.assinar === false
      ? 'assinatura-falsa'
      : createHmac('sha256', SEGREDO).update(`${cabecalho}.${claims}`).digest('base64url')
  return `${cabecalho}.${claims}.${assinatura}`
}

function pedido(autorizacao?: string): ApiRequest {
  return {
    method: 'POST',
    headers: autorizacao ? { authorization: autorizacao } : {},
    query: {},
  }
}

beforeEach(() => {
  process.env['SUPABASE_URL'] = URL_SUPABASE
  process.env['SUPABASE_JWT_SECRET'] = SEGREDO
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'service-role-de-teste'
  limparCacheVendor()
  db.chamadas.length = 0
})

/* ── Firma ──────────────────────────────────────────────────────────────── */

describe('verificarJwt · assinatura', () => {
  it('aceita um token HS256 bem assinado', async () => {
    const claims = await verificarJwt(token())
    expect(claims.sub).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('rejeita assinatura inválida', async () => {
    await expect(verificarJwt(token({ assinar: false }))).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita um byte trocado no payload', async () => {
    const valido = token()
    const [cabecalho, claims, assinatura] = valido.split('.') as [string, string, string]
    const adulterado = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as Record<string, unknown>
    adulterado['sub'] = '22222222-2222-2222-2222-222222222222'
    const forjado = `${cabecalho}.${b64url(adulterado)}.${assinatura}`
    await expect(verificarJwt(forjado)).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita alg: none — o ataque clássico de JWT', async () => {
    const cabecalho = b64url({ alg: 'none', typ: 'JWT' })
    const agora = Math.floor(Date.now() / 1000)
    const claims = b64url({
      sub: 'invasor',
      iss: `${URL_SUPABASE}/auth/v1`,
      aud: 'authenticated',
      role: 'authenticated',
      exp: agora + 3600,
    })
    await expect(verificarJwt(`${cabecalho}.${claims}.`)).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita um alg que não está na lista, mesmo bem assinado', async () => {
    // HS512 com o segredo correto: a assinatura «fecha» para quem confie no
    // header, e justamente por isso el header no decide nada.
    const cabecalho = b64url({ alg: 'HS512', typ: 'JWT' })
    const agora = Math.floor(Date.now() / 1000)
    const claims = b64url({
      sub: 'x',
      iss: `${URL_SUPABASE}/auth/v1`,
      aud: 'authenticated',
      role: 'authenticated',
      exp: agora + 3600,
    })
    const assinatura = createHmac('sha512', SEGREDO).update(`${cabecalho}.${claims}`).digest('base64url')
    await expect(verificarJwt(`${cabecalho}.${claims}.${assinatura}`)).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita um token malformado', async () => {
    await expect(verificarJwt('nao-e-um-jwt')).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita quando não há segredo nem JWKS configurados', async () => {
    const bom = token()
    delete process.env['SUPABASE_JWT_SECRET']
    await expect(verificarJwt(bom)).rejects.toMatchObject({ status: 401 })
  })
})

/* ── Claims ─────────────────────────────────────────────────────────────── */

describe('verificarJwt · claims', () => {
  it('rejeita token expirado', async () => {
    const agora = Math.floor(Date.now() / 1000)
    await expect(verificarJwt(token({ exp: agora - 3600 }))).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita emissor de outro projeto', async () => {
    await expect(
      verificarJwt(token({ iss: 'https://outro-projeto.supabase.co/auth/v1' })),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita audiência diferente de authenticated', async () => {
    await expect(verificarJwt(token({ aud: 'anon' }))).rejects.toMatchObject({ status: 401 })
  })

  it('rejeita o rol anon — a anon key do bundle não é uma sessão', async () => {
    await expect(verificarJwt(token({ role: 'anon' }))).rejects.toMatchObject({ status: 401 })
  })

  it('tolera 60 s de relógio adiantado no telefone', async () => {
    const agora = Math.floor(Date.now() / 1000)
    const claims = await verificarJwt(token({ iat: agora + 30 }))
    expect(claims.sub).toBeTruthy()
  })
})

/* ── requireAuth ────────────────────────────────────────────────────────── */

describe('requireAuth', () => {
  it('exige o header Authorization', async () => {
    await expect(requireAuth(pedido())).rejects.toMatchObject({ status: 401 })
  })

  it('exige o esquema Bearer', async () => {
    await expect(requireAuth(pedido(`Basic ${token()}`))).rejects.toMatchObject({ status: 401 })
  })

  it('resolve o vendedor por vendors.auth_id', async () => {
    db.responder('select:vendors', {
      data: { id: 3, name: 'Victor Hugo', is_admin: false, is_active: true },
      error: null,
    })
    const ctx = await requireAuth(pedido(`Bearer ${token()}`))
    expect(ctx.vendorName).toBe('Victor Hugo')
    expect(ctx.vendorId).toBe(3)
    expect(ctx.isAdmin).toBe(false)
    expect(db.chamadas[0]?.filtros[0]).toMatchObject({ metodo: 'eq', coluna: 'auth_id' })
  })

  it('cai para auth_user_id quando auth_id ainda não existe (42703)', async () => {
    db.responder('select:vendors', { data: null, error: { code: '42703', message: 'column does not exist' } })
    db.responder('select:vendors', {
      data: { id: 4, name: 'Jordi', is_admin: true, is_active: true },
      error: null,
    })
    const ctx = await requireAuth(pedido(`Bearer ${token()}`))
    expect(ctx.vendorName).toBe('Jordi')
    expect(ctx.isAdmin).toBe(true)
    expect(db.chamadas[1]?.filtros[0]).toMatchObject({ coluna: 'auth_user_id' })
  })

  it('nega acesso a um usuário sem vendedor ligado', async () => {
    db.responder('select:vendors', { data: null, error: null })
    db.responder('select:vendors', { data: null, error: null })
    await expect(requireAuth(pedido(`Bearer ${token()}`))).rejects.toMatchObject({ status: 403 })
  })

  it('nega acesso a um vendedor desativado', async () => {
    db.responder('select:vendors', {
      data: { id: 9, name: 'Ex-vendedor', is_admin: false, is_active: false },
      error: null,
    })
    await expect(requireAuth(pedido(`Bearer ${token()}`))).rejects.toMatchObject({ status: 403 })
  })

  it('não vai ao banco duas vezes pelo mesmo sub (cache de 5 min)', async () => {
    db.responder('select:vendors', {
      data: { id: 3, name: 'Victor Hugo', is_admin: false, is_active: true },
      error: null,
    })
    await requireAuth(pedido(`Bearer ${token()}`))
    const consultas = db.contar('select:vendors')
    await requireAuth(pedido(`Bearer ${token()}`))
    expect(db.contar('select:vendors')).toBe(consultas)
  })
})

/* ── Autorização por carteira ───────────────────────────────────────────── */

describe('podeTocar · o backend é service_role, então a regra vive aqui', () => {
  const vendedor = {
    userId: 'u',
    vendorName: 'Victor Hugo',
    vendorId: 3,
    isAdmin: false,
    email: null,
    expiraEm: 0,
  }
  const admin = { ...vendedor, vendorName: 'Jordi', isAdmin: true }

  it('deixa o dono tocar no que é dele', () => {
    expect(podeTocar(vendedor, 'Victor Hugo')).toBe(true)
  })

  it('impede tocar na carteira de outro', () => {
    expect(podeTocar(vendedor, 'Sandra')).toBe(false)
  })

  it('deixa o admin tocar em tudo', () => {
    expect(podeTocar(admin, 'Sandra')).toBe(true)
  })

  it('preserva o pool do v2: sem dono, qualquer um pega', () => {
    expect(podeTocar(vendedor, null)).toBe(true)
    expect(podeTocar(vendedor, '   ')).toBe(true)
  })
})

describe('HttpError', () => {
  it('nunca leva o detalhe técnico na mensagem visível', () => {
    const erro = new HttpError(401, 'sem_sessao', 'Sua sessão expirou. Entre de novo.', 'kid desconhecido: abc123')
    expect(erro.message).not.toContain('abc123')
    expect(erro.detalhe).toContain('abc123')
  })
})
