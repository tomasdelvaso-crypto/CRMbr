// api/_lib/auth.ts
// Auth fail-CLOSED: verificación local de la firma del JWT de Supabase, sin
// round-trip por request. Sin token válido no se responde nada.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ VERIFICACIÓN LOCAL Y NO `supabase.auth.getUser(token)`
// ══════════════════════════════════════════════════════════════════════════
// El v2 hacía un HTTP al GoTrue por cada request. Eso es (a) un round-trip de
// 80-200 ms desde São Paulo antes de empezar a trabajar, (b) un punto de falla
// que convierte un hipo del auth server en un 500 del CRM entero, y (c) un
// límite de rate compartido con el login. La firma se puede verificar acá
// mismo: el JWKS son tres claves públicas que cambian una vez por rotación.
//
// Se soportan las dos formas que conviven en Supabase hoy:
//   · Claves asimétricas (ES256/RS256/EdDSA) publicadas en el JWKS. Es lo
//     nuevo y lo que el proyecto va a usar cuando rote.
//   · El «legacy JWT secret» HS256 compartido (SUPABASE_JWT_SECRET). Es lo que
//     el proyecto tiene HOY.
// Si aparece un `alg` que no es ninguno de esos, se rechaza. `alg: none` y el
// truco de mandar un HS256 firmado con la clave pública RSA quedan cortados
// porque el algoritmo se resuelve por el TIPO de clave, nunca por el header.

import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import type { Vendor } from '../../src/core'
import { optionalEnv, requireEnv } from './env'
import { HttpError, header, naoAutorizado, proibido } from './http'
import type { ApiRequest } from './http'
import { serviceClient } from './supabase'

export interface AuthContext {
  /** sub del JWT de Supabase. */
  userId: string
  /** Nombre del vendedor tal como aparece en opportunities.vendor. */
  vendorName: string
  /** vendors.id. Las tablas nuevas del v3 lo traen en paralelo al texto. */
  vendorId: number | null
  isAdmin: boolean
  email: string | null
  /** Instante de expiración del token, en segundos epoch. */
  expiraEm: number
}

/* ══════════════════════════════════════════════════════════════════════════
   Decodificación
   ══════════════════════════════════════════════════════════════════════════ */

interface CabecalhoJwt {
  alg: string
  kid?: string
  typ?: string
}

interface ClaimsJwt {
  sub?: string
  iss?: string
  aud?: string | string[]
  exp?: number
  iat?: number
  nbf?: number
  email?: string
  role?: string
  session_id?: string
}

function base64urlParaBuffer(valor: string): Buffer {
  return Buffer.from(valor.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function jsonDeParte<T>(parte: string): T {
  return JSON.parse(base64urlParaBuffer(parte).toString('utf8')) as T
}

/* ══════════════════════════════════════════════════════════════════════════
   JWKS con caché en memoria
   ══════════════════════════════════════════════════════════════════════════ */

interface JwkBruto {
  kid?: string
  kty?: string
  alg?: string
  use?: string
  [k: string]: unknown
}

const chavesPorKid = new Map<string, KeyObject>()
let jwksBuscadoEm = 0
/** Ventana mínima entre dos búsquedas del JWKS ante un `kid` desconocido. */
const JWKS_MIN_INTERVALO_MS = 60_000
/** Refresco proactivo: una rotación se toma su tiempo en propagarse. */
const JWKS_TTL_MS = 10 * 60_000

function urlDoJwks(): string {
  const base = requireEnv('SUPABASE_URL').replace(/\/+$/, '')
  return `${base}/auth/v1/.well-known/jwks.json`
}

async function carregarJwks(): Promise<void> {
  const resposta = await fetch(urlDoJwks(), { headers: { accept: 'application/json' } })
  if (!resposta.ok) {
    throw new HttpError(
      503,
      'jwks_indisponivel',
      'Não deu para validar sua sessão agora. Tente de novo.',
      `JWKS ${resposta.status}`,
    )
  }
  const corpo = (await resposta.json()) as { keys?: JwkBruto[] }
  jwksBuscadoEm = Date.now()
  for (const jwk of corpo.keys ?? []) {
    if (!jwk.kid) continue
    if (jwk.use !== undefined && jwk.use !== 'sig') continue
    try {
      // `format: 'jwk'` es lo que evita tener que armar el DER a mano.
      chavesPorKid.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }))
    } catch (erro) {
      console.error(`[auth] JWK ${jwk.kid} ilegível:`, erro)
    }
  }
}

async function chavePublica(kid: string): Promise<KeyObject | null> {
  const emCache = chavesPorKid.get(kid)
  const vencido = Date.now() - jwksBuscadoEm > JWKS_TTL_MS
  if (emCache && !vencido) return emCache

  const podeBuscar = Date.now() - jwksBuscadoEm > JWKS_MIN_INTERVALO_MS
  if (!emCache && !podeBuscar) return null
  if (emCache && !podeBuscar) return emCache

  await carregarJwks()
  return chavesPorKid.get(kid) ?? null
}

/** Solo para tests: vacía el caché del JWKS. */
export function limparCacheJwks(): void {
  chavesPorKid.clear()
  jwksBuscadoEm = 0
}

/* ══════════════════════════════════════════════════════════════════════════
   Verificación de firma
   ══════════════════════════════════════════════════════════════════════════ */

function verificarHs256(assinado: string, assinatura: Buffer): boolean {
  const segredo = optionalEnv('SUPABASE_JWT_SECRET')
  if (!segredo) return false
  const esperado = createHmac('sha256', segredo).update(assinado).digest()
  if (esperado.length !== assinatura.length) return false
  return timingSafeEqual(esperado, assinatura)
}

function verificarAssimetrico(chave: KeyObject, alg: string, assinado: string, sig: Buffer): boolean {
  const dados = Buffer.from(assinado, 'utf8')
  const tipo = chave.asymmetricKeyType

  // El algoritmo se decide por el TIPO DE CLAVE, no por el header del token.
  // Aceptar el `alg` del atacante es la vulnerabilidad clásica de JWT.
  if (tipo === 'ed25519') {
    if (alg !== 'EdDSA') return false
    return verifySignature(null, dados, chave, sig)
  }
  if (tipo === 'ec') {
    if (alg !== 'ES256') return false
    // Un JWT trae la firma ECDSA como r||s crudo (P1363), no en DER.
    return verifySignature('sha256', dados, { key: chave, dsaEncoding: 'ieee-p1363' }, sig)
  }
  if (tipo === 'rsa' || tipo === 'rsa-pss') {
    if (alg !== 'RS256') return false
    return verifySignature('sha256', dados, chave, sig)
  }
  return false
}

/** Tolerancia de reloj. Los teléfonos del equipo se desfasan de verdad. */
const TOLERANCIA_SEG = 60

/**
 * Verifica firma y claims. Lanza `HttpError` 401 con detalle solo en el log.
 * Exportada porque el webhook de Telegram y los tests la usan directo.
 */
export async function verificarJwt(token: string): Promise<ClaimsJwt> {
  const partes = token.split('.')
  if (partes.length !== 3) throw naoAutorizado(undefined, 'token malformado')
  const [cabecalhoB64, claimsB64, assinaturaB64] = partes as [string, string, string]

  let cabecalho: CabecalhoJwt
  let claims: ClaimsJwt
  try {
    cabecalho = jsonDeParte<CabecalhoJwt>(cabecalhoB64)
    claims = jsonDeParte<ClaimsJwt>(claimsB64)
  } catch {
    throw naoAutorizado(undefined, 'header ou claims ilegíveis')
  }

  const assinado = `${cabecalhoB64}.${claimsB64}`
  const assinatura = base64urlParaBuffer(assinaturaB64)

  let assinaturaOk: boolean
  if (cabecalho.alg === 'HS256') {
    assinaturaOk = verificarHs256(assinado, assinatura)
  } else if (cabecalho.alg === 'ES256' || cabecalho.alg === 'RS256' || cabecalho.alg === 'EdDSA') {
    if (!cabecalho.kid) throw naoAutorizado(undefined, 'token assimétrico sem kid')
    const chave = await chavePublica(cabecalho.kid)
    if (!chave) throw naoAutorizado(undefined, `kid desconhecido: ${cabecalho.kid}`)
    assinaturaOk = verificarAssimetrico(chave, cabecalho.alg, assinado, assinatura)
  } else {
    // Incluye `alg: none`, que es exactamente lo que hay que rechazar.
    throw naoAutorizado(undefined, `alg não suportado: ${cabecalho.alg}`)
  }

  if (!assinaturaOk) throw naoAutorizado(undefined, 'assinatura inválida')

  const agora = Math.floor(Date.now() / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + TOLERANCIA_SEG < agora) {
    throw naoAutorizado(undefined, 'token expirado')
  }
  if (typeof claims.nbf === 'number' && claims.nbf - TOLERANCIA_SEG > agora) {
    throw naoAutorizado(undefined, 'token ainda não vale')
  }
  if (typeof claims.iat === 'number' && claims.iat - TOLERANCIA_SEG > agora) {
    throw naoAutorizado(undefined, 'token emitido no futuro')
  }

  const emissorEsperado =
    optionalEnv('SUPABASE_JWT_ISSUER') ?? `${requireEnv('SUPABASE_URL').replace(/\/+$/, '')}/auth/v1`
  if (claims.iss !== emissorEsperado) {
    throw naoAutorizado(undefined, `emissor inesperado: ${claims.iss ?? 'ausente'}`)
  }

  const audiencias = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!audiencias.includes('authenticated')) {
    throw naoAutorizado(undefined, `aud inesperada: ${audiencias.join(',') || 'ausente'}`)
  }
  if (claims.role !== 'authenticated') {
    throw naoAutorizado(undefined, `role inesperado: ${claims.role ?? 'ausente'}`)
  }
  if (!claims.sub) throw naoAutorizado(undefined, 'token sem sub')

  return claims
}

/* ══════════════════════════════════════════════════════════════════════════
   Resolución del vendedor
   ══════════════════════════════════════════════════════════════════════════ */

interface VendorEmCache {
  vendor: Pick<Vendor, 'id' | 'name' | 'is_admin' | 'is_active'>
  em: number
}

const vendorPorSub = new Map<string, VendorEmCache>()
const VENDOR_TTL_MS = 5 * 60_000

/** Solo para tests. */
export function limparCacheVendor(): void {
  vendorPorSub.clear()
}

/**
 * Busca el vendedor por `auth_id` y cae a `auth_user_id` tragándose el 42703.
 *
 * `auth_user_id` es la columna del v2, marcada para DROP. Consultar primero la
 * viva y caer a la muerta hace que esto siga funcionando el día que se borre,
 * sin coordinar un deploy con la migración.
 */
async function buscarVendor(sub: string): Promise<VendorEmCache['vendor'] | null> {
  const db = serviceClient()
  const colunas = 'id, name, is_admin, is_active'

  const principal = await db.from('vendors').select(colunas).eq('auth_id', sub).maybeSingle()
  if (!principal.error && principal.data) return principal.data as VendorEmCache['vendor']
  if (principal.error && principal.error.code !== '42703') {
    throw new HttpError(503, 'db_indisponivel', 'Não deu para confirmar seu acesso agora.', principal.error.message)
  }

  const legado = await db.from('vendors').select(colunas).eq('auth_user_id', sub).maybeSingle()
  if (legado.error) {
    if (legado.error.code === '42703') return null
    throw new HttpError(503, 'db_indisponivel', 'Não deu para confirmar seu acesso agora.', legado.error.message)
  }
  return (legado.data as VendorEmCache['vendor'] | null) ?? null
}

async function vendorDoSub(sub: string): Promise<VendorEmCache['vendor']> {
  const emCache = vendorPorSub.get(sub)
  if (emCache && Date.now() - emCache.em < VENDOR_TTL_MS) return emCache.vendor

  const vendor = await buscarVendor(sub)
  if (!vendor) {
    throw proibido(
      'Seu usuário não está ligado a nenhum vendedor. Fale com o Jordi.',
      `sub ${sub} sem vendors.auth_id`,
    )
  }
  if (vendor.is_active === false) {
    throw proibido('Seu acesso está desativado.', `vendor ${vendor.name} inativo`)
  }
  vendorPorSub.set(sub, { vendor, em: Date.now() })
  return vendor
}

/* ══════════════════════════════════════════════════════════════════════════
   API pública
   ══════════════════════════════════════════════════════════════════════════ */

function bearer(req: ApiRequest): string {
  const bruto = header(req, 'authorization')
  if (!bruto) throw naoAutorizado(undefined, 'sem header Authorization')
  const [esquema, token] = bruto.split(' ')
  if (!token || (esquema ?? '').toLowerCase() !== 'bearer') {
    throw naoAutorizado(undefined, 'Authorization não é Bearer')
  }
  return token.trim()
}

/** Extrae y valida el Bearer token. Lanza si es inválido o falta. */
export async function requireAuth(req: ApiRequest): Promise<AuthContext> {
  const claims = await verificarJwt(bearer(req))
  const sub = claims.sub as string
  const vendor = await vendorDoSub(sub)
  return {
    userId: sub,
    vendorName: vendor.name,
    vendorId: vendor.id,
    isAdmin: vendor.is_admin === true,
    email: claims.email ?? null,
    expiraEm: claims.exp ?? 0,
  }
}

/** Igual que requireAuth pero además exige is_admin. */
export async function requireAdmin(req: ApiRequest): Promise<AuthContext> {
  const ctx = await requireAuth(req)
  if (!ctx.isAdmin) throw proibido('Essa tela é só do gestor.')
  return ctx
}

/**
 * ¿Puede este vendedor tocar filas de `dono`?
 *
 * Espeja `public.ventus_autorizado`: admin, dueño, o el pool sin dueño. Se
 * revalida acá porque el backend usa `service_role`, que en Postgres pasa por
 * `__service__` y tiene permiso sobre todo. Sin esta comprobación en TS, la
 * autorización del v3 no existiría.
 */
export function podeTocar(ctx: AuthContext, dono: string | null | undefined): boolean {
  if (ctx.isAdmin) return true
  if (dono === null || dono === undefined || dono.trim() === '') return true
  return dono === ctx.vendorName
}

export function exigirPropriedade(ctx: AuthContext, dono: string | null | undefined): void {
  if (!podeTocar(ctx, dono)) {
    throw proibido('Isso está fora da sua carteira.', `${ctx.vendorName} tentou tocar em ${dono}`)
  }
}

// Re-export para no romper a quien ya importa checkRateLimit desde acá.
export { checkRateLimit } from './usage'
