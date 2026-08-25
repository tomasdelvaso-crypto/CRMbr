// api/tma-auth.ts
// POST /api/tma-auth — entrada al CRM desde el Telegram Mini App, sin login.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ HACE, EN ORDEN, Y POR QUÉ ESE ORDEN
// ══════════════════════════════════════════════════════════════════════════
//   1. Valida el `initData` CRUDO contra el token del bot (api/_lib/tma.ts).
//      HMAC primero, reloj después. Sin esto, `initDataUnsafe.user.id` es un
//      campo de JavaScript que cualquiera edita desde la consola del WebView.
//   2. Resuelve `telegram_id → vendors` con `canalDoTelegram()`, la MISMA
//      función que usa el bot. Un solo camino de identidad para las dos
//      superficies: si el emparejamiento se revoca, se revoca en las dos.
//   3. Emite la sesión. Dos caminos, en este orden:
//        a) `admin.generateLink` → `hashed_token`. El cliente lo canjea con
//           `verifyOtp()` y obtiene una sesión REAL de GoTrue, con refresh
//           token: sobrevive a la hora, al cierre del Mini App y al avión.
//        b) Respaldo: un JWT HS256 firmado acá con `SUPABASE_JWT_SECRET`, con
//           el `sub` del vendedor. Vale una hora, no se refresca y sirve
//           sobre todo para hablarle a /api/* — que ya verifica HS256 en
//           `_lib/auth.ts`. Existe para que un hipo del GoTrue no deje al
//           vendedor afuera del Mini App.
//      Si ninguno de los dos se puede emitir: 503 y nadie entra.
//
// ══════════════════════════════════════════════════════════════════════════
// FAIL-CLOSED
// ══════════════════════════════════════════════════════════════════════════
// Todo motivo de rechazo devuelve el MISMO mensaje genérico en PT-BR. El
// detalle (hash inválido vs vencido vs sin emparejar) vive en el log del
// servidor. Decirle a quien prueba initDatas cuál de los pasos falló es
// regalarle el oráculo que necesita para afinar el ataque. La única excepción
// es «no estás emparejado», que sí se distingue con 403 porque es la única
// que el vendedor puede resolver por su cuenta — y ese texto no revela nada
// que el atacante no supiera ya.

import { randomUUID, createHmac } from 'node:crypto'
import { optionalEnv, requireEnv } from './_lib/env'
import {
  HttpError,
  exigirMetodo,
  lerJson,
  naoAutorizado,
  proibido,
  rota,
  type ApiHandler,
} from './_lib/http'
import { serviceClient } from './_lib/supabase'
import { TTL_PADRAO_SEG, validarInitData, type InitDataValido } from './_lib/tma'
import { canalDoTelegram } from './telegram/_lib/identidade'

/* ══════════════════════════════════════════════════════════════════════════
   Contrato
   ══════════════════════════════════════════════════════════════════════════ */

interface CorpoDeEntrada {
  /** El string crudo de `window.Telegram.WebApp.initData`. Nunca el parseado. */
  initData?: unknown
}

export interface RespostaTmaAuth {
  vendor: { id: number; nome: string; isAdmin: boolean }
  /** Canje de sesión real de Supabase. null si el GoTrue no pudo emitirlo. */
  otp: { tokenHash: string; email: string; tipo: 'magiclink' } | null
  /** JWT HS256 propio, respaldo y llave del backend /api. null si no hay secreto. */
  token: { accessToken: string; expiraEm: number } | null
  /** `startapp=` del deep link, ya validado en largo y alfabeto. */
  startParam: string | null
}

/** Mensaje único de rechazo. Ver la nota de fail-closed del encabezado. */
const RECUSA = 'Não deu para confirmar que este Telegram é seu. Feche e abra o app de novo.'

/* ══════════════════════════════════════════════════════════════════════════
   Freno de fuerza bruta (memoria del proceso)
   ══════════════════════════════════════════════════════════════════════════
   No reemplaza al HMAC —que ya es infalsificable sin el token del bot— pero
   corta el goteo de intentos automáticos contra la función serverless, que en
   Vercel se paga por invocación. La ventana es por IP-ish/instancia: es un
   freno, no una garantía, y está dicho acá para que nadie lo confunda. */

const TETO_POR_JANELA = 20
const JANELA_MS = 5 * 60_000
const tentativas = new Map<string, { n: number; desde: number }>()

function freio(chave: string): boolean {
  const agora = Date.now()
  const atual = tentativas.get(chave)
  if (!atual || agora - atual.desde > JANELA_MS) {
    tentativas.set(chave, { n: 1, desde: agora })
    return true
  }
  atual.n += 1
  if (tentativas.size > 500) {
    // Poda barata: el mapa vive en una lambda que se recicla sola.
    for (const [k, v] of tentativas) if (agora - v.desde > JANELA_MS) tentativas.delete(k)
  }
  return atual.n <= TETO_POR_JANELA
}

/* ══════════════════════════════════════════════════════════════════════════
   Emisión de sesión
   ══════════════════════════════════════════════════════════════════════════ */

interface FilaVendor {
  id: number
  name: string
  email: string | null
  is_admin: boolean | null
  is_active: boolean | null
  auth_id: string | null
  auth_user_id: string | null
}

function b64url(valor: object | string): string {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor)
  return Buffer.from(texto, 'utf8').toString('base64url')
}

/**
 * JWT HS256 con la forma que espera Supabase (y que `_lib/auth.ts` verifica).
 *
 * `sub` es el usuario de auth del vendedor, así que PostgREST aplica las mismas
 * RLS que en la PWA: no hay un camino privilegiado por ser Mini App. Devuelve
 * null si el proyecto ya rotó a claves asimétricas y no hay secreto compartido
 * — en ese caso el único camino es el OTP, que es el bueno igual.
 */
function emitirJwt(vendor: FilaVendor, sub: string): { accessToken: string; expiraEm: number } | null {
  const segredo = optionalEnv('SUPABASE_JWT_SECRET')
  if (segredo === undefined) return null

  const emissor =
    optionalEnv('SUPABASE_JWT_ISSUER') ?? `${requireEnv('SUPABASE_URL').replace(/\/+$/, '')}/auth/v1`
  const agora = Math.floor(Date.now() / 1000)
  const expiraEm = agora + TTL_PADRAO_SEG

  const cabecalho = b64url({ alg: 'HS256', typ: 'JWT' })
  const claims = b64url({
    sub,
    iss: emissor,
    aud: 'authenticated',
    role: 'authenticated',
    email: vendor.email ?? undefined,
    iat: agora,
    exp: expiraEm,
    session_id: randomUUID(),
    is_anonymous: false,
    amr: [{ method: 'telegram_mini_app', timestamp: agora }],
    app_metadata: { provider: 'telegram', providers: ['telegram'] },
    // Informativo: la autorización real la resuelven las RLS con el `sub`.
    user_metadata: { vendor_id: vendor.id, vendor_name: vendor.name },
  })
  const assinado = `${cabecalho}.${claims}`
  const assinatura = createHmac('sha256', segredo).update(assinado).digest('base64url')
  return { accessToken: `${assinado}.${assinatura}`, expiraEm }
}

/**
 * `hashed_token` de un magic link, para que el cliente lo canjee por una sesión
 * de verdad. No se devuelve NUNCA el link entero: el link lleva un redirect y
 * un `token` de un solo uso que, si se loguea, entra a la cuenta.
 */
async function emitirOtp(email: string): Promise<{ tokenHash: string; email: string; tipo: 'magiclink' } | null> {
  try {
    const db = serviceClient()
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
    if (error) {
      console.error(`[tma-auth] generateLink falhou: ${error.message}`)
      return null
    }
    const hash = data?.properties?.hashed_token
    if (typeof hash !== 'string' || hash === '') return null
    return { tokenHash: hash, email, tipo: 'magiclink' }
  } catch (erro) {
    console.error('[tma-auth] generateLink explodiu:', erro)
    return null
  }
}

async function buscarVendor(vendorId: number): Promise<FilaVendor | null> {
  const db = serviceClient()
  const { data, error } = await db
    .from('vendors')
    .select('id, name, email, is_admin, is_active, auth_id, auth_user_id')
    .eq('id', vendorId)
    .maybeSingle()
  if (error) {
    console.error(`[tma-auth] vendors: ${error.code} ${error.message}`)
    throw new HttpError(503, 'db_indisponivel', 'Não deu para confirmar seu acesso agora.')
  }
  return (data as FilaVendor | null) ?? null
}

/* ══════════════════════════════════════════════════════════════════════════
   Handler
   ══════════════════════════════════════════════════════════════════════════ */

function ttlConfigurado(): number {
  const bruto = optionalEnv('TMA_INITDATA_TTL_SEG')
  const n = bruto === undefined ? NaN : Number(bruto)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : TTL_PADRAO_SEG
}

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')

  const corpo = await lerJson<CorpoDeEntrada>(req)
  const initData = typeof corpo.initData === 'string' ? corpo.initData : ''

  const botToken = optionalEnv('TELEGRAM_BOT_TOKEN')
  if (botToken === undefined) {
    console.error('[tma-auth] TELEGRAM_BOT_TOKEN não configurada')
    throw new HttpError(503, 'nao_configurado', 'O Mini App não está configurado neste ambiente.')
  }

  const resultado = validarInitData(initData, botToken, { ttlSeg: ttlConfigurado() })
  if (!resultado.ok) {
    console.error(`[tma-auth] initData recusado (${resultado.motivo}): ${resultado.detalhe}`)
    throw naoAutorizado(RECUSA, resultado.motivo)
  }

  const dados: InitDataValido = resultado.dados
  if (!freio(String(dados.usuario.id))) {
    throw new HttpError(429, 'limite_de_uso', 'Muitas tentativas seguidas. Espere um minuto.')
  }

  // El chat privado de una persona tiene el mismo id que la persona. Se pasa
  // para que `canalDoTelegram` deje la huella de uso en el canal correcto.
  const canal = await canalDoTelegram(dados.usuario.id, dados.usuario.id)
  if (canal === null) {
    console.error(`[tma-auth] telegram ${String(dados.usuario.id)} sem vínculo`)
    throw proibido(
      'Este Telegram ainda não está ligado a nenhum vendedor. Abra o Ventus no navegador, vá em Ajustes → Telegram e use o código de 6 dígitos com /vincular.',
      `telegram_user_id ${String(dados.usuario.id)} sem vendor_channels`,
    )
  }

  const vendor = await buscarVendor(canal.vendorId)
  if (vendor === null || vendor.is_active === false) {
    throw proibido('Seu acesso está desativado.', `vendor ${String(canal.vendorId)} inativo`)
  }

  const sub = vendor.auth_id ?? vendor.auth_user_id
  if (sub === null) {
    // El vendedor existe pero no tiene usuario de auth: sin `sub` no hay RLS
    // posible y entrar sería entrar como nadie.
    throw proibido(
      'Seu usuário ainda não tem acesso ao Ventus. Fale com o Jordi.',
      `vendor ${vendor.name} sem auth_id`,
    )
  }

  const otp = vendor.email !== null && vendor.email !== '' ? await emitirOtp(vendor.email) : null
  const token = emitirJwt(vendor, sub)

  if (otp === null && token === null) {
    console.error('[tma-auth] nem OTP nem JWT: sem SUPABASE_JWT_SECRET e generateLink falhou')
    throw new HttpError(503, 'sessao_indisponivel', 'Não deu para abrir sua sessão agora. Tente de novo em alguns minutos.')
  }

  const resposta: RespostaTmaAuth = {
    vendor: { id: vendor.id, nome: vendor.name, isAdmin: vendor.is_admin === true },
    otp,
    token,
    startParam: dados.startParam,
  }
  // Un token de sesión no se cachea ni en el navegador ni en el edge.
  res.setHeader('Cache-Control', 'no-store, private')
  res.status(200).json(resposta)
}

export default rota('tma-auth', handler)
