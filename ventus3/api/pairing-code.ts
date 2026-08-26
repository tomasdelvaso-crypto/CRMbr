// api/pairing-code.ts — emisión del código de emparejamiento de Telegram.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO NO PUEDE VIVIR EN EL CLIENTE
// ══════════════════════════════════════════════════════════════════════════
// `pairing_codes` tiene `revoke all … from anon, authenticated` en la
// migración 0006, y es a propósito: si el navegador pudiera insertar la fila,
// cualquiera escribiría seis dígitos elegidos por él mismo y después los
// tipearía en el bot para quedarse con la cartera de otro. El código lo emite
// el servidor con `service_role`, a partir de una sesión YA autenticada, y el
// vendedor al que se le emite sale del JWT — nunca del cuerpo del pedido.
//
// El consumo lo hace el bot: `/vincular <código>` →
// `vincularPorCodigo()` en `api/telegram/_lib/identidade.ts`, que exige formato
// de 6 dígitos, comprueba `tentativas < 5`, `usado_em is null` y
// `expira_em > now()`, y marca la fila usada ANTES de crear el canal.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES DECISIONES QUE PARECEN DETALLE
// ══════════════════════════════════════════════════════════════════════════
// 1. `crypto.randomInt`, nunca `Math.random`. Seis dígitos son un espacio de
//    un millón: con un PRNG predecible, adivinar el código vivo de otro
//    vendedor deja de ser un problema de suerte y pasa a ser uno de aritmética.
// 2. Los códigos anteriores del mismo vendedor se QUEMAN (`tentativas = 5`).
//    Es el único estado terminal que la tabla admite sin inventar un
//    `usado_por_telegram_user_id` falso —la constraint `pairing_codes_uso_chk`
//    lo exige— y `vincularPorCodigo()` lo lee como 'queimado'. Así, pedir un
//    código nuevo invalida el viejo de verdad, en vez de dejar dos vivos.
// 3. El techo por hora se cuenta sobre las filas emitidas, no sobre un
//    contador en memoria: en serverless cada invocación es un proceso nuevo y
//    un contador de módulo no limita nada.

import { randomInt } from 'node:crypto'
import { requireAuth } from './_lib/auth.js'
import type { ApiHandler } from './_lib/http.js'
import { exigirMetodo, HttpError, limiteExcedido, rota } from './_lib/http.js'
import { serviceClient } from './_lib/supabase.js'

/** 10 minutos. Coincide con el default de la columna y con `TTL_DO_CODIGO_MS`. */
export const TTL_CODIGO_MS = 10 * 60_000

/** Techo por vendedor y por hora. Cuatro reintentos honestos entran de sobra. */
export const MAX_CODIGOS_POR_HORA = 6

export const JANELA_LIMITE_MS = 60 * 60_000

/** Intentos de generar un código libre antes de rendirse. */
const TENTATIVAS_DE_SORTEIO = 8

/** Códigos que quedan quemados al emitir uno nuevo. */
const TENTATIVAS_QUEIMADO = 5

export interface PairingCodeResponse {
  ok: true
  codigo: string
  /** ISO del momento en que deja de servir. El cliente cuenta con esto. */
  expira_em: string
}

/**
 * Seis dígitos criptográficamente aleatorios, ceros a la izquierda incluidos.
 *
 * `000042` es tan válido como cualquier otro: el CHECK de la tabla es
 * `^[0-9]{6}$` y descartar los que empiezan con cero recortaría el espacio en
 * un 10% sin ganar nada.
 */
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Códigos que este vendedor pidió dentro de la ventana. */
async function emitidosNaJanela(vendorId: number): Promise<number> {
  const desde = new Date(Date.now() - JANELA_LIMITE_MS).toISOString()
  const { count, error } = await serviceClient()
    .from('pairing_codes')
    .select('codigo', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .gte('created_at', desde)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new HttpError(
        503,
        'pareamento_indisponivel',
        'O pareamento com o Telegram ainda não está disponível neste ambiente.',
        `pairing_codes ausente: ${error.code}`,
      )
    }
    // Fail-CLOSED: si no se puede medir el techo, no se emite. Un código de
    // identidad no es un lugar para fallar hacia el lado permisivo.
    throw new HttpError(
      503,
      'pareamento_indisponivel',
      'Não deu para gerar o código agora. Tenta de novo em alguns minutos.',
      `contagem falhou: ${error.code} ${error.message}`,
    )
  }
  return count ?? 0
}

/** Quema los códigos vivos del vendedor: pedir uno nuevo invalida el anterior. */
async function queimarAnteriores(vendorId: number): Promise<void> {
  const { error } = await serviceClient()
    .from('pairing_codes')
    .update({ tentativas: TENTATIVAS_QUEIMADO })
    .eq('vendor_id', vendorId)
    .is('usado_em', null)
  if (error) {
    console.error(`[pairing-code] queimar anteriores falhou: ${error.code} ${error.message}`)
  }
}

/** Inserta un código libre. Reintenta ante colisión de PK (23505). */
async function inserirCodigo(vendorId: number, criadoPor: string): Promise<PairingCodeResponse> {
  const db = serviceClient()

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_SORTEIO; tentativa += 1) {
    const codigo = gerarCodigo()
    const expiraEm = new Date(Date.now() + TTL_CODIGO_MS).toISOString()

    const { error } = await db.from('pairing_codes').insert({
      codigo,
      vendor_id: vendorId,
      criado_por: criadoPor,
      expira_em: expiraEm,
      tentativas: 0,
    })

    if (!error) return { ok: true, codigo, expira_em: expiraEm }
    // 23505: el código ya existe (uno vivo o uno viejo sin purgar). Se sortea
    // otro; con un millón de valores esto casi nunca pasa dos veces.
    if (error.code !== '23505') {
      throw new HttpError(
        503,
        'pareamento_indisponivel',
        'Não deu para gerar o código agora. Tenta de novo em alguns minutos.',
        `insert falhou: ${error.code} ${error.message}`,
      )
    }
  }

  throw new HttpError(
    503,
    'pareamento_indisponivel',
    'Não deu para gerar o código agora. Tenta de novo em alguns minutos.',
    `${TENTATIVAS_DE_SORTEIO} colisões seguidas de código`,
  )
}

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')
  const ctx = await requireAuth(req)

  // El `vendor_id` que manda el cliente se IGNORA a propósito: el código se
  // emite para quien tiene la sesión, no para quien lo pida en el cuerpo.
  const vendorId = ctx.vendorId
  if (vendorId === null) {
    throw new HttpError(
      403,
      'sem_vendedor',
      'Seu usuário não está ligado a nenhum vendedor. Fale com o Jordi.',
    )
  }

  const emitidos = await emitidosNaJanela(vendorId)
  if (emitidos >= MAX_CODIGOS_POR_HORA) {
    throw limiteExcedido(
      `Você já pediu ${MAX_CODIGOS_POR_HORA} códigos nesta hora. Espera um pouco antes de pedir outro.`,
    )
  }

  await queimarAnteriores(vendorId)
  const resposta = await inserirCodigo(vendorId, ctx.vendorName)

  console.info(`[pairing-code] código emitido para ${ctx.vendorName} (vendor ${vendorId})`)
  res.status(200).json(resposta)
}

export default rota('/api/pairing-code', handler)
