#!/usr/bin/env node
// scripts/gerar-vapid.mjs
// Genera el par de claves VAPID (RFC 8292) del Web Push de Ventus.
//
// ══════════════════════════════════════════════════════════════════════════
// CÓMO SE USA
// ══════════════════════════════════════════════════════════════════════════
//     node scripts/gerar-vapid.mjs             # imprime el par y qué hacer
//     node scripts/gerar-vapid.mjs --env       # imprime solo las tres líneas
//     node scripts/gerar-vapid.mjs --json      # para pegarle a un script
//
// Después, en Vercel (Project → Settings → Environment Variables) o donde
// corra el backend:
//
//     VAPID_PUBLIC_KEY   = <la pública>
//     VAPID_PRIVATE_KEY  = <la privada>
//     VAPID_SUBJECT      = mailto:ventus@ventapel.com.br
//
// ══════════════════════════════════════════════════════════════════════════
// TRES COSAS QUE NO SE PUEDEN HACER MAL
// ══════════════════════════════════════════════════════════════════════════
//
// 1. LA PRIVADA NO ENTRA AL REPOSITORIO NI AL BUNDLE. Solo vive en las
//    variables de entorno del servidor. Cualquiera con esa clave puede mandar
//    notificaciones que el teléfono del equipo va a mostrar como si fueran del
//    Ventus. No hay `VITE_` en el nombre a propósito: una variable con ese
//    prefijo la hornea Vite dentro del JavaScript que descarga el navegador.
//
// 2. LA PÚBLICA SÍ ES PÚBLICA — pero igual no se hornea. Es el
//    `applicationServerKey` que el navegador necesita para suscribirse, así que
//    no es un secreto. Se sirve por `GET /api/dispatch/track?acao=chave` para
//    poder ROTARLA sin redeployar el front (ver src/push/assinatura.ts).
//
// 3. ROTAR LA CLAVE INVALIDA TODAS LAS SUSCRIPCIONES. Un `subscribe()` con una
//    clave distinta sobre una suscripción viva tira InvalidStateError. El
//    cliente ya lo maneja —compara la clave y se desuscribe primero—, pero el
//    equipo tiene que volver a tocar «Registrar este aparelho» en Ajustes, y
//    hasta entonces no recibe push. Si hay que rotar: hacerlo un lunes a la
//    mañana y avisar por el bot, no un viernes a la tarde.
//
// ══════════════════════════════════════════════════════════════════════════
// EL FORMATO, QUE ES DONDE FALLA TODO EL MUNDO
// ══════════════════════════════════════════════════════════════════════════
// El par es P-256 (prime256v1 / secp256r1).
//   · pública  = punto SIN COMPRIMIR: 65 bytes que empiezan con 0x04, en
//                base64url sin relleno. 87 caracteres.
//   · privada  = el escalar `d`: 32 bytes en base64url. 43 caracteres.
// `api/dispatch/_webpush.ts` valida exactamente eso (65 bytes y 0x04) y falla
// ruidoso si le dan un PEM o una clave comprimida — que es lo que devuelve
// `openssl ec` si uno se guía por el primer resultado de Google.

import { generateKeyPairSync } from 'node:crypto'

/** Devuelve el par en base64url, con la forma que exige RFC 8292. */
export function gerarParVapid() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })

  // El JWK trae x, y, d en base64url. La pública se rearma como 0x04||x||y,
  // que es el punto sin comprimir que espera `applicationServerKey`.
  const jwk = privateKey.export({ format: 'jwk' })
  const x = Buffer.from(jwk.x, 'base64url')
  const y = Buffer.from(jwk.y, 'base64url')
  const d = Buffer.from(jwk.d, 'base64url')

  if (x.length !== 32 || y.length !== 32 || d.length !== 32) {
    throw new Error(`Par P-256 com tamanho inesperado: x=${x.length} y=${y.length} d=${d.length}`)
  }

  const publica = Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url')
  const privada = d.toString('base64url')

  // Verificación de ida y vuelta: si esto falla, la clave no serviría y es
  // mucho mejor descubrirlo acá que con el push service devolviendo 401.
  const conferencia = Buffer.from(publica, 'base64url')
  if (conferencia.length !== 65 || conferencia[0] !== 0x04) {
    throw new Error('A chave pública gerada não é um ponto P-256 sem comprimir')
  }
  // `publicKey` se exporta solo para dejar constancia de que el par casa.
  void publicKey

  return { publica, privada }
}

function principal() {
  const args = new Set(process.argv.slice(2))
  const { publica, privada } = gerarParVapid()

  if (args.has('--json')) {
    process.stdout.write(`${JSON.stringify({ publica, privada }, null, 2)}\n`)
    return
  }

  const linhas = [
    `VAPID_PUBLIC_KEY=${publica}`,
    `VAPID_PRIVATE_KEY=${privada}`,
    'VAPID_SUBJECT=mailto:ventus@ventapel.com.br',
  ]

  if (args.has('--env')) {
    process.stdout.write(`${linhas.join('\n')}\n`)
    return
  }

  process.stdout.write(
    [
      '',
      '  Par VAPID gerado (P-256, RFC 8292)',
      '  ──────────────────────────────────────────────────────────────',
      '',
      ...linhas.map((l) => `  ${l}`),
      '',
      '  1. Cole as três linhas nas variáveis de ambiente do servidor.',
      '     NUNCA no repositório e NUNCA com prefixo VITE_.',
      '  2. Redeploy do backend.',
      '  3. Em Ajustes → Avisos, cada pessoa toca «Registrar este aparelho».',
      '',
      `  pública: ${String(publica.length)} chars · privada: ${String(privada.length)} chars`,
      '',
    ].join('\n'),
  )
}

// Solo corre cuando se ejecuta directo, no cuando alguien lo importa.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  principal()
}
