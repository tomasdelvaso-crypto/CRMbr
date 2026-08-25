// api/_lib/usage.ts
// Rate limiting y cuota por vendedor, con el uso PERSISTIDO.
//
// El v2 imprime el costo en un console.log y ahí muere: nadie sabe cuánto
// gastó el equipo el mes pasado ni quién, y no hay ningún techo. Acá cada
// llamada al modelo deja una fila.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ SE GUARDA EN `ventus_audit` Y NO EN UNA TABLA NUEVA
// ══════════════════════════════════════════════════════════════════════════
// Las migraciones 0001-0010 están escritas y NINGUNA fue aplicada todavía
// (ver ESTADO.md §5.1). Meter una tabla más en esa cola es agregarle un
// bloqueo al backend por algo que ya tiene dónde vivir: `ventus_audit` es
// append-only, tiene `actor`, `at` y un `contexto jsonb`, y el consumo del
// agente ES parte de la trilha del agente. Cuando exista una tabla dedicada,
// se cambia `TABELA_USO` y nada más.
//
// Como el registro de uso NO puede tumbar un pedido que ya se respondió, todo
// fallo de escritura se traga con un console.error. La cuota, en cambio, se
// evalúa ANTES de gastar y falla cerrada solo si la base contesta un error
// real: si la base no contesta, se deja pasar y se loguea (un vendedor en el
// galpón sin poder registrar una visita es peor que un dólar de más).

import type { AuthContext } from './auth.js'
import { limiteExcedido } from './http.js'
import { serviceClient } from './supabase.js'

const TABELA_USO = 'ventus_audit'
const EVENTO_USO = 'ventus_uso'

/** Cubos de consumo. Uno por endpoint que gasta tokens o CPU de terceros. */
export type BucketDeUso = 'ventus' | 'ingest' | 'plan' | 'act'

export interface LimiteDeUso {
  /** Ventana deslizante, en minutos. */
  janelaMin: number
  /** Máximo de llamadas en la ventana. */
  max: number
  /** Techo de gasto diario en USD para este cubo. 0 = sin techo. */
  tetoDiarioUsd: number
}

/**
 * Los números salen del uso real: 6 vendedores, ~15 registros por día cada uno
 * en el mejor de los casos. 30 audios por hora es diez veces el pico observado
 * y aun así corta un bucle de reintentos antes de que cueste plata.
 */
export const LIMITES: Readonly<Record<BucketDeUso, LimiteDeUso>> = Object.freeze({
  ventus: { janelaMin: 5, max: 40, tetoDiarioUsd: 5 },
  ingest: { janelaMin: 60, max: 120, tetoDiarioUsd: 4 },
  plan: { janelaMin: 60, max: 60, tetoDiarioUsd: 1 },
  act: { janelaMin: 5, max: 60, tetoDiarioUsd: 0 },
})

export interface RegistroDeUso {
  vendor: string
  bucket: BucketDeUso
  modelo: string
  entrada: number
  saida: number
  cacheEscrito: number
  cacheLido: number
  custoUsd: number
  duracaoMs: number
  /** Detalle libre: la ruta, el turno, el id de la oportunidad. */
  extra?: Record<string, unknown>
}

function inicioDoDiaUtc(): string {
  const agora = new Date()
  // El día operativo se corta en BRT (UTC−3). No es contabilidad: es un techo
  // diario, y que empiece a las 21h UTC del día anterior es lo correcto acá.
  const inicio = new Date(agora.getTime() - 3 * 3600_000)
  inicio.setUTCHours(0, 0, 0, 0)
  return new Date(inicio.getTime() + 3 * 3600_000).toISOString()
}

/**
 * Cuota por vendedor. Lanza 429 si se excedió.
 *
 * Dos techos independientes: uno de FRECUENCIA (evita el bucle de reintentos)
 * y otro de GASTO (evita el mes caro). El de gasto solo aplica a los cubos que
 * queman tokens.
 */
export async function checkRateLimit(vendorName: string, bucket: string): Promise<void> {
  const limite = LIMITES[bucket as BucketDeUso]
  if (!limite) return

  const db = serviceClient()
  const desde = new Date(Date.now() - limite.janelaMin * 60_000).toISOString()

  const janela = await db
    .from(TABELA_USO)
    .select('id', { count: 'exact', head: true })
    .eq('actor', vendorName)
    .eq('evento', EVENTO_USO)
    .eq('contexto->>bucket', bucket)
    .gte('at', desde)

  if (janela.error) {
    // Fail-open deliberado y ruidoso: ver la cabecera del archivo.
    console.error(`[usage] não deu para medir a janela de ${vendorName}/${bucket}:`, janela.error.message)
    return
  }
  if ((janela.count ?? 0) >= limite.max) {
    throw limiteExcedido(
      `Você já usou o Ventus ${limite.max} vezes nos últimos ${limite.janelaMin} minutos. Respira e tenta de novo.`,
    )
  }

  if (limite.tetoDiarioUsd <= 0) return

  const doDia = await db
    .from(TABELA_USO)
    .select('contexto')
    .eq('actor', vendorName)
    .eq('evento', EVENTO_USO)
    .gte('at', inicioDoDiaUtc())
    .limit(2000)

  if (doDia.error) {
    console.error(`[usage] não deu para somar o gasto de ${vendorName}:`, doDia.error.message)
    return
  }

  let gasto = 0
  for (const linha of doDia.data ?? []) {
    const ctx = (linha as { contexto?: Record<string, unknown> | null }).contexto
    const custo = ctx?.['custo_usd']
    if (typeof custo === 'number' && Number.isFinite(custo)) gasto += custo
  }
  if (gasto >= limite.tetoDiarioUsd) {
    throw limiteExcedido('Você bateu o limite de uso do Ventus por hoje. Volta amanhã.')
  }
}

/** Igual pero tomando el contexto de auth, que es como lo usan los endpoints. */
export function checarCota(ctx: AuthContext, bucket: BucketDeUso): Promise<void> {
  return checkRateLimit(ctx.vendorName, bucket)
}

/**
 * Persiste el consumo. NUNCA lanza: si la auditoría falla, la respuesta ya
 * salió y no hay nada que el vendedor pueda hacer al respecto.
 */
export async function registrarUso(registro: RegistroDeUso): Promise<void> {
  try {
    const db = serviceClient()
    const { error } = await db.from(TABELA_USO).insert({
      actor: registro.vendor,
      evento: EVENTO_USO,
      contexto: {
        bucket: registro.bucket,
        modelo: registro.modelo,
        entrada: registro.entrada,
        saida: registro.saida,
        cache_escrito: registro.cacheEscrito,
        cache_lido: registro.cacheLido,
        custo_usd: Number(registro.custoUsd.toFixed(6)),
        duracao_ms: registro.duracaoMs,
        ...(registro.extra ?? {}),
      },
    })
    if (error) console.error('[usage] insert falhou:', error.message)
  } catch (erro) {
    console.error('[usage] insert explodiu:', erro)
  }
}
