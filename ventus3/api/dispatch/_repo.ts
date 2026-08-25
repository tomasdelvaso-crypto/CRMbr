// api/dispatch/_repo.ts
// El único lugar del dispatcher que habla con Postgres. La política no sabe
// que Supabase existe y por eso se puede testear sin base; acá está todo lo
// sucio, concentrado y con los nombres de columna de 0005 sin traducir.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Vendor } from '../../src/core/index.js'
import { addDays, todayBr } from '../../src/core/index.js'
import { serviceClient } from '../_lib/supabase.js'
import { motivoSemAcaoDireta, definicaoDe, ehTipoConhecido } from './_catalogo.js'
import type {
  AvisoNaFila,
  CanaisDisponiveis,
  GastoDoDia,
  JanelaGolden,
  MotivoDeAdiamento,
  MotivoDeSupressao,
  NovoAviso,
  PreferenciasDeAviso,
} from './_tipos.js'
import { PREFS_PADRAO } from './_tipos.js'
import type { AssinaturaPush } from './_webpush.js'

export const db = (): SupabaseClient => serviceClient()

/** Comienzo del día civil BRT como instante ISO, para los cortes diarios. */
export function inicioDoDiaBRT(agora: Date): string {
  return `${todayBr(agora)}T00:00:00-03:00`
}

/* ══════════════════════════════════════════════════════════════════════════
   Lectura
   ══════════════════════════════════════════════════════════════════════════ */

export async function vendedoresAtivos(cli: SupabaseClient = db()): Promise<Vendor[]> {
  const { data, error } = await cli.from('vendors').select('*').order('id')
  if (error) {
    console.error(`[dispatch/repo] vendors: ${error.code} ${error.message}`)
    return []
  }
  return ((data ?? []) as Vendor[]).filter((v) => v.is_active !== false)
}

export async function preferencias(
  vendor: string,
  cli: SupabaseClient = db(),
): Promise<PreferenciasDeAviso> {
  const { data, error } = await cli
    .from('notification_prefs')
    .select('*')
    .eq('vendor', vendor)
    .maybeSingle()
  if (error) console.error(`[dispatch/repo] notification_prefs: ${error.code} ${error.message}`)

  const fila = (data ?? {}) as Partial<Record<keyof PreferenciasDeAviso, unknown>>
  // Fail-safe hacia el SILENCIO: si la fila no existe o viene rara, se usa el
  // default conservador. Nunca al revés — una prefs corrupta no puede volverse
  // permiso para mandar 17 avisos como hacía el v2.
  return {
    vendor,
    orcamento_diario:
      typeof fila.orcamento_diario === 'number' ? fila.orcamento_diario : PREFS_PADRAO.orcamento_diario,
    silencio_de: typeof fila.silencio_de === 'string' ? fila.silencio_de : PREFS_PADRAO.silencio_de,
    silencio_ate: typeof fila.silencio_ate === 'string' ? fila.silencio_ate : PREFS_PADRAO.silencio_ate,
    canais: Array.isArray(fila.canais)
      ? (fila.canais.filter((c): c is 'telegram' | 'push' => c === 'telegram' || c === 'push'))
      : PREFS_PADRAO.canais,
    tipos_mutados: Array.isArray(fila.tipos_mutados)
      ? fila.tipos_mutados.filter((t): t is string => typeof t === 'string')
      : PREFS_PADRAO.tipos_mutados,
    avisos_de_jogo: typeof fila.avisos_de_jogo === 'boolean' ? fila.avisos_de_jogo : true,
    hora_aprendida: typeof fila.hora_aprendida === 'number' ? fila.hora_aprendida : null,
  }
}

/** Lo pendiente y ya vencido de despacho, de todos los vendedores. */
export async function filaPendente(
  agora: Date,
  cli: SupabaseClient = db(),
): Promise<AvisoNaFila[]> {
  const { data, error } = await cli
    .from('notification_queue')
    .select('*')
    .is('enviado_em', null)
    .is('suprimido_motivo', null)
    .lte('agendado_para', agora.toISOString())
    .order('prioridade')
    .order('agendado_para')
    .limit(500)
  if (error) {
    console.error(`[dispatch/repo] fila: ${error.code} ${error.message}`)
    return []
  }
  return (data ?? []) as AvisoNaFila[]
}

/** Gasto de hoy, partido en total y no-urgente (la reserva de prioridad 1). */
export async function gastoDoDia(
  vendor: string,
  agora: Date,
  cli: SupabaseClient = db(),
): Promise<GastoDoDia> {
  const { data, error } = await cli
    .from('notification_queue')
    .select('prioridade')
    .eq('vendor', vendor)
    .gte('enviado_em', inicioDoDiaBRT(agora))
    .not('enviado_em', 'is', null)
    .limit(200)
  if (error) {
    console.error(`[dispatch/repo] gasto: ${error.code} ${error.message}`)
    // Fail-safe: si no se puede contar, se asume el peor caso y no se manda.
    return { total: Number.MAX_SAFE_INTEGER, naoUrgentes: Number.MAX_SAFE_INTEGER }
  }
  const filas = (data ?? []) as Array<{ prioridade: number }>
  return {
    total: filas.length,
    naoUrgentes: filas.filter((f) => f.prioridade !== 1).length,
  }
}

/** dedupe_keys ya enviadas hoy: la ventana de dedupe es el día civil BRT. */
export async function chavesEnviadasHoje(
  vendor: string,
  agora: Date,
  cli: SupabaseClient = db(),
): Promise<string[]> {
  const { data, error } = await cli
    .from('notification_queue')
    .select('dedupe_key')
    .eq('vendor', vendor)
    .gte('enviado_em', inicioDoDiaBRT(agora))
    .not('enviado_em', 'is', null)
    .limit(200)
  if (error) {
    console.error(`[dispatch/repo] chaves: ${error.code} ${error.message}`)
    return []
  }
  return ((data ?? []) as Array<{ dedupe_key: string }>).map((f) => f.dedupe_key)
}

export interface DestinosDoVendedor {
  push: AssinaturaPush[]
  chats: number[]
  disponiveis: CanaisDisponiveis
}

export async function destinos(
  vendor: string,
  vendorId: number | null,
  cli: SupabaseClient = db(),
): Promise<DestinosDoVendedor> {
  const [subs, canais] = await Promise.all([
    cli
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('vendor', vendor)
      .is('failed_at', null)
      .limit(10),
    vendorId === null
      ? Promise.resolve({ data: [], error: null })
      : cli
          .from('vendor_channels')
          .select('chat_id, is_primary')
          .eq('vendor_id', vendorId)
          .eq('is_active', true)
          .not('verificado_em', 'is', null)
          .limit(10),
  ])

  if (subs.error) console.error(`[dispatch/repo] push_subscriptions: ${subs.error.message}`)
  if (canais.error) console.error(`[dispatch/repo] vendor_channels: ${canais.error.message}`)

  const push = (subs.data ?? []) as AssinaturaPush[]
  const filas = (canais.data ?? []) as Array<{ chat_id: number; is_primary: boolean }>
  // Sólo el chat primario recibe avisos: mandar a los grupos convierte el
  // aviso personal en exposición pública del pipeline de otro.
  const chats = filas.filter((f) => f.is_primary).map((f) => Number(f.chat_id))

  return {
    push,
    chats,
    disponiveis: { push: push.length > 0, telegram: chats.length > 0 },
  }
}

/** Bloque de Golden Hour de hoy, en minutos BRT. null si no hay sesión agendada. */
export async function janelaGolden(
  vendor: string,
  agora: Date,
  cli: SupabaseClient = db(),
): Promise<JanelaGolden | null> {
  const { data, error } = await cli
    .from('golden_sessions')
    .select('planejado_para, inicio, fim')
    .eq('vendor', vendor)
    .eq('dia', todayBr(agora))
    .maybeSingle()
  if (error || data === null) return null

  const fila = data as { planejado_para: string | null; inicio: string | null; fim: string | null }
  const comeco = fila.inicio ?? fila.planejado_para
  if (comeco === null) return null

  const minutosBRT = (iso: string): number => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return -1
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).split(':')
    return Number(partes[0] ?? '0') * 60 + Number(partes[1] ?? '0')
  }

  const de = minutosBRT(comeco)
  if (de < 0) return null
  const ate = fila.fim !== null ? minutosBRT(fila.fim) : de + 60
  return { de, ate: Math.max(de + 1, ate) }
}

/* ══════════════════════════════════════════════════════════════════════════
   Escritura
   ══════════════════════════════════════════════════════════════════════════ */

export async function marcarEnviado(
  ids: readonly string[],
  canal: string,
  agora: Date,
  cli: SupabaseClient = db(),
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await cli
    .from('notification_queue')
    .update({ enviado_em: agora.toISOString(), canal })
    .in('id', [...ids])
  if (error) console.error(`[dispatch/repo] marcarEnviado: ${error.code} ${error.message}`)
}

export async function marcarSuprimido(
  ids: readonly string[],
  motivo: MotivoDeSupressao,
  cli: SupabaseClient = db(),
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await cli
    .from('notification_queue')
    .update({ suprimido_motivo: motivo })
    .in('id', [...ids])
  if (error) console.error(`[dispatch/repo] marcarSuprimido(${motivo}): ${error.message}`)
}

export async function marcarAdiado(
  id: string,
  ate: string,
  motivo: MotivoDeAdiamento,
  cli: SupabaseClient = db(),
): Promise<void> {
  const { error } = await cli.from('notification_queue').update({ adiado_para: ate }).eq('id', id)
  if (error) console.error(`[dispatch/repo] marcarAdiado(${motivo}): ${error.message}`)
}

/**
 * Borra una suscripción push muerta (404/410 del push service).
 *
 * Se BORRA la fila y no se marca `failed_at`: un 404/410 significa que el
 * navegador revocó esa suscripción para siempre —desinstalación, limpieza de
 * datos, rotación del endpoint—, y nunca va a volver a servir. Marcarla
 * dejaría una fila muerta ocupando el UNIQUE de `endpoint`, y el día que el
 * mismo aparato se vuelva a suscribir el upsert tendría que revivirla; borrar
 * hace que ese caso sea un insert limpio.
 *
 * Los fallos transitorios (429, 5xx, red) NO llegan acá: `enviarPush` solo
 * devuelve `morto: true` para 404 y 410.
 */
export async function matarAssinatura(id: string, cli: SupabaseClient = db()): Promise<void> {
  const { error } = await cli.from('push_subscriptions').delete().eq('id', id)
  if (error) console.error(`[dispatch/repo] matarAssinatura: ${error.message}`)
}

export async function desativarChat(chatId: number, cli: SupabaseClient = db()): Promise<void> {
  const { error } = await cli
    .from('vendor_channels')
    .update({ is_active: false })
    .eq('chat_id', chatId)
  if (error) console.error(`[dispatch/repo] desativarChat: ${error.message}`)
}

/* ══════════════════════════════════════════════════════════════════════════
   Encolado — la única puerta de entrada a la fila
   ══════════════════════════════════════════════════════════════════════════ */

export type ResultadoEnfileirar = 'enfileirado' | 'duplicado' | 'rejeitado' | 'erro'

/**
 * Encola UN aviso. Las tres validaciones de acá son la diferencia entre una
 * cola y un basurero:
 *
 *   1. tipo del catálogo — nada entra sin prioridad, topic y TTL declarados
 *   2. acción directa    — sin botones ni deep link específico, se rechaza
 *   3. dedupe            — el índice único de 0005 responde 23505 y eso NO es
 *                          un error: es el sistema funcionando. Se devuelve
 *                          'duplicado' y el job sigue.
 */
export async function enfileirar(
  novo: NovoAviso,
  cli: SupabaseClient = db(),
): Promise<ResultadoEnfileirar> {
  const def = definicaoDe(novo.tipo)
  if (!ehTipoConhecido(novo.tipo) || def === null) {
    console.error(`[dispatch/repo] tipo fora do catálogo: ${novo.tipo}`)
    return 'rejeitado'
  }
  const problema = motivoSemAcaoDireta(novo)
  if (problema !== null) {
    console.error(`[dispatch/repo] ${novo.tipo} sem ação direta: ${problema}`)
    return 'rejeitado'
  }

  const linha = {
    vendor: novo.vendor,
    vendor_id: novo.vendor_id ?? null,
    tipo: novo.tipo,
    prioridade: novo.prioridade ?? def.prioridade,
    titulo: novo.titulo,
    corpo: novo.corpo,
    payload: novo.payload ?? {},
    canal: novo.canal ?? def.canal,
    topic: novo.topic ?? def.topic,
    ttl_segundos: novo.ttl_segundos ?? def.ttl,
    deep_link: novo.deep_link ?? null,
    acoes: novo.acoes ?? null,
    opportunity_id: novo.opportunity_id ?? null,
    lead_id: novo.lead_id ?? null,
    task_id: novo.task_id ?? null,
    dedupe_key: novo.dedupe_key,
    agendado_para: novo.agendado_para ?? new Date().toISOString(),
  }

  const { error } = await cli.from('notification_queue').insert(linha)
  if (error === null) return 'enfileirado'
  if (error.code === '23505') return 'duplicado'
  console.error(`[dispatch/repo] enfileirar ${novo.tipo}: ${error.code} ${error.message}`)
  return 'erro'
}

/** Encola varios y devuelve el resumen. Nunca lanza: un job no cae por un dup. */
export async function enfileirarVarios(
  avisos: readonly NovoAviso[],
  cli: SupabaseClient = db(),
): Promise<{ enfileirados: number; duplicados: number; rejeitados: number }> {
  let enfileirados = 0
  let duplicados = 0
  let rejeitados = 0
  for (const aviso of avisos) {
    const r = await enfileirar(aviso, cli)
    if (r === 'enfileirado') enfileirados += 1
    else if (r === 'duplicado') duplicados += 1
    else rejeitados += 1
  }
  return { enfileirados, duplicados, rejeitados }
}

/** Ayuda a los jobs: la ventana "hace N días" en fecha civil BRT. */
export function haDias(agora: Date, dias: number): string {
  return addDays(todayBr(agora), -dias)
}
