// api/dispatch/_webpush.ts
// Web Push con VAPID, implementado con node:crypto — sin dependencia externa.
//
// POR QUÉ SIN LIBRERÍA
//   `web-push` arrastra su propio árbol de dependencias para hacer exactamente
//   lo que hay acá: un JWT ES256 y un AES-128-GCM con las claves derivadas por
//   HKDF. Son 120 líneas auditables contra dos RFCs cortos. En un backend que
//   maneja el pipeline de R$2,1M, «una dependencia menos que revisar» vale más
//   que «120 líneas menos que escribir».
//
//   RFC 8291 — Message Encryption for Web Push (aes128gcm)
//   RFC 8292 — VAPID: Voluntary Application Server Identification
//   RFC 8030 §5 — headers TTL, Urgency y Topic
//
// SECRETOS: `VAPID_PRIVATE_KEY` sólo existe en el servidor. La pública sí va al
// cliente (es el `applicationServerKey` del `subscribe()`), y por eso se expone
// por `/api/dispatch/track?acao=chave` en vez de hornearse en el bundle: así
// rotarla no obliga a redeployar el front.

import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { optionalEnv, requireEnv } from '../_lib/env'
import type { UrgenciaPush } from './_tipos'

export interface AssinaturaPush {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface ResultadoPush {
  ok: boolean
  status: number
  /** true cuando el endpoint está muerto (404/410): hay que dejar de gastarlo. */
  morto: boolean
  detalhe: string | null
}

/* ── base64url ─────────────────────────────────────────────────────────────── */

const b64url = (b: Buffer): string => b.toString('base64url')
const deB64url = (s: string): Buffer => Buffer.from(s, 'base64url')

/* ── HKDF (RFC 5869), explícito a propósito ───────────────────────────────── */

function hmac(chave: Buffer, dados: Buffer): Buffer {
  return createHmac('sha256', chave).update(dados).digest()
}

/** HKDF con un solo bloque de salida: todas las derivaciones de acá piden ≤32 bytes. */
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, tamanho: number): Buffer {
  const prk = hmac(salt, ikm)
  const okm = hmac(prk, Buffer.concat([info, Buffer.from([1])]))
  return okm.subarray(0, tamanho)
}

/* ── VAPID ─────────────────────────────────────────────────────────────────── */

let chaveCache: { publica: string; privada: KeyObject } | null = null

function chaveVapid(): { publica: string; privada: KeyObject } {
  if (chaveCache) return chaveCache
  const publica = requireEnv('VAPID_PUBLIC_KEY')
  const privadaRaw = requireEnv('VAPID_PRIVATE_KEY')

  const pub = deB64url(publica)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY não é um ponto P-256 sem comprimir (65 bytes, 0x04)')
  }
  const privada = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
      d: b64url(deB64url(privadaRaw)),
    },
    format: 'jwk',
  })
  chaveCache = { publica, privada }
  return chaveCache
}

/** La clave pública en base64url. Es lo único de VAPID que el cliente puede ver. */
export function chavePublicaVapid(): string {
  return requireEnv('VAPID_PUBLIC_KEY')
}

export function vapidConfigurado(): boolean {
  return optionalEnv('VAPID_PUBLIC_KEY') !== undefined && optionalEnv('VAPID_PRIVATE_KEY') !== undefined
}

/**
 * `Authorization: vapid t=<jwt>, k=<clave pública>`.
 * `aud` es el ORIGEN del endpoint, no el endpoint entero: mandarlo completo es
 * el error que hace que FCM devuelva 401 sin explicar por qué.
 */
function cabecalhoVapid(endpoint: string): string {
  const { publica, privada } = chaveVapid()
  const aud = new URL(endpoint).origin
  const sub = optionalEnv('VAPID_SUBJECT') ?? 'mailto:ventus@ventapel.com.br'
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url(
    Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })),
  )
  const entrada = `${header}.${claims}`
  // ieee-p1363 = R||S de 64 bytes. Con DER (el default de Node) el push service
  // rechaza la firma y el aviso se pierde sin error visible.
  const assinatura = sign('sha256', Buffer.from(entrada), {
    key: privada,
    dsaEncoding: 'ieee-p1363',
  })
  return `vapid t=${entrada}.${b64url(assinatura)}, k=${publica}`
}

/* ── Cifrado del cuerpo (RFC 8291, aes128gcm) ─────────────────────────────── */

/** Tamaño de registro. 4096 entra en el mínimo que todo push service acepta. */
const RS = 4096
const MAX_PAYLOAD = RS - 16 - 1 // tag GCM + delimitador de registro

export function cifrar(payload: string, p256dh: string, auth: string): Buffer {
  const clientePub = deB64url(p256dh)
  const authSecret = deB64url(auth)
  if (clientePub.length !== 65) throw new Error('p256dh inválido')
  if (authSecret.length !== 16) throw new Error('auth inválido')

  const texto = Buffer.from(payload, 'utf8')
  if (texto.length > MAX_PAYLOAD) throw new Error('payload de push grande demais')

  const ecdh = createECDH('prime256v1')
  const servidorPub = ecdh.generateKeys()
  const compartilhado = ecdh.computeSecret(clientePub)
  const salt = randomBytes(16)

  // IKM: liga el secreto ECDH a las DOS claves públicas, así un atacante que
  // sustituya una de ellas no puede derivar la misma clave.
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientePub,
    servidorPub,
  ])
  const ikm = hkdf(authSecret, compartilhado, info, 32)

  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)

  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const corpo = Buffer.concat([
    cipher.update(Buffer.concat([texto, Buffer.from([0x02])])), // 0x02 = último registro
    cipher.final(),
    cipher.getAuthTag(),
  ])

  const cabecalho = Buffer.alloc(21)
  salt.copy(cabecalho, 0)
  cabecalho.writeUInt32BE(RS, 16)
  cabecalho.writeUInt8(servidorPub.length, 20)

  return Buffer.concat([cabecalho, servidorPub, corpo])
}

/* ── Envío ─────────────────────────────────────────────────────────────────── */

export interface OpcoesDePush {
  ttl: number
  urgencia: UrgenciaPush
  topic: string
}

/**
 * Manda UN push. No lanza: devuelve el resultado, porque un endpoint muerto de
 * un vendedor no puede tumbar el despacho de los otros cinco.
 */
export async function enviarPush(
  assinatura: AssinaturaPush,
  payload: string,
  opcoes: OpcoesDePush,
): Promise<ResultadoPush> {
  let corpo: Buffer
  try {
    corpo = cifrar(payload, assinatura.p256dh, assinatura.auth)
  } catch (erro) {
    console.error('[dispatch/push] cifrado falhou:', erro)
    return { ok: false, status: 0, morto: true, detalhe: 'assinatura inválida' }
  }

  try {
    const resp = await fetch(assinatura.endpoint, {
      method: 'POST',
      headers: {
        Authorization: cabecalhoVapid(assinatura.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(Math.max(0, Math.floor(opcoes.ttl))),
        Urgency: opcoes.urgencia,
        Topic: opcoes.topic,
      },
      body: new Uint8Array(corpo),
    })
    // 404/410 = suscripción revocada. 413 = payload grande. 429 = backoff.
    const morto = resp.status === 404 || resp.status === 410
    if (!resp.ok) console.error(`[dispatch/push] ${resp.status} em ${new URL(assinatura.endpoint).origin}`)
    return {
      ok: resp.ok,
      status: resp.status,
      morto,
      detalhe: resp.ok ? null : `push service respondeu ${resp.status}`,
    }
  } catch (erro) {
    console.error('[dispatch/push] rede falhou:', erro)
    return { ok: false, status: 0, morto: false, detalhe: 'falha de rede' }
  }
}
