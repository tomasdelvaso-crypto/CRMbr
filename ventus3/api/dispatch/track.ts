// api/dispatch/track.ts — medición y suscripciones de push.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ LA MEDICIÓN ES OBLIGATORIA Y NO UN "nice to have"
// ══════════════════════════════════════════════════════════════════════════
// El v2 tiene 4.521 notificaciones y NADIE puede decir cuál sirve, porque
// `read_at` nunca se escribió: la tasa de lectura es 0,0% y no se sabe si es
// porque nadie lee o porque nadie mide. Sin `lido_em` y `agido_em` por tipo no
// hay forma de MATAR un tipo que no funciona, y un canal del que no se puede
// sacar nada termina, otra vez, silenciado entero.
//
// `agido_em` es la métrica que importa: leer un aviso no es actuar. Un tipo con
// 90% de lectura y 2% de acción es decoración cara.
//
// Todo lo de acá exige sesión (fail-closed). El vendedor sólo puede tocar sus
// propias filas: el `.eq('vendor', ...)` está en el servidor, no en el cliente.

import type { ApiHandler } from '../_lib/http'
import { handlePreflight, lerJson, pedidoInvalido, proibido, rota } from '../_lib/http'
import { requireAuth } from '../_lib/auth'
import { serviceClient } from '../_lib/supabase'
import { todayBr } from '../../src/core'
import { chavePublicaVapid, vapidConfigurado } from './_webpush'

interface CorpoDeTrack {
  acao?: string
  /** id de la fila de `notification_queue`. */
  id?: string
  endpoint?: string
  p256dh?: string
  auth?: string
  plataforma?: string
}

/** Marca leído o accionado. Idempotente: el primer timestamp gana. */
async function medir(vendor: string, id: string, campo: 'lido_em' | 'agido_em'): Promise<void> {
  const db = serviceClient()
  const agora = new Date().toISOString()
  // Marcar `agido_em` implica que fue leído: actuar sobre algo sin verlo no
  // existe, y sin esto la tasa de lectura queda por debajo de la de acción.
  const patch: Record<string, string> = campo === 'agido_em'
    ? { agido_em: agora, lido_em: agora }
    : { lido_em: agora }

  const { error } = await db
    .from('notification_queue')
    .update(patch)
    .eq('id', id)
    .eq('vendor', vendor)
    .is(campo, null)
    .not('enviado_em', 'is', null)
  if (error) console.error(`[dispatch/track] ${campo}: ${error.code} ${error.message}`)
}

interface LinhaDeMetrica {
  tipo: string
  enviados: number
  lidos: number
  agidos: number
  suprimidos: number
  taxa_leitura: number
  taxa_acao: number
}

/** El panel que permite matar un tipo con datos, no con opiniones. */
async function metricas(dias: number): Promise<LinhaDeMetrica[]> {
  const db = serviceClient()
  const desde = `${todayBr(new Date(Date.now() - dias * 86_400_000))}T00:00:00-03:00`
  const { data, error } = await db
    .from('notification_queue')
    .select('tipo, enviado_em, lido_em, agido_em, suprimido_motivo')
    .gte('created_at', desde)
    .limit(5000)
  if (error) {
    console.error(`[dispatch/track] metricas: ${error.message}`)
    return []
  }

  const acc = new Map<string, LinhaDeMetrica>()
  for (const f of (data ?? []) as Array<{
    tipo: string; enviado_em: string | null; lido_em: string | null
    agido_em: string | null; suprimido_motivo: string | null
  }>) {
    const linha = acc.get(f.tipo) ?? {
      tipo: f.tipo, enviados: 0, lidos: 0, agidos: 0, suprimidos: 0, taxa_leitura: 0, taxa_acao: 0,
    }
    if (f.enviado_em !== null) linha.enviados += 1
    if (f.lido_em !== null) linha.lidos += 1
    if (f.agido_em !== null) linha.agidos += 1
    if (f.suprimido_motivo !== null) linha.suprimidos += 1
    acc.set(f.tipo, linha)
  }
  return [...acc.values()]
    .map((l) => ({
      ...l,
      taxa_leitura: l.enviados === 0 ? 0 : Math.round((l.lidos / l.enviados) * 100),
      taxa_acao: l.enviados === 0 ? 0 : Math.round((l.agidos / l.enviados) * 100),
    }))
    .sort((a, b) => b.enviados - a.enviados)
}

const handler: ApiHandler = async (req, res) => {
  if (handlePreflight(req, res)) return
  const ctx = await requireAuth(req)

  const daQuery = req.query['acao']
  const acaoQuery = Array.isArray(daQuery) ? daQuery[0] : daQuery

  // GET: la clave pública de VAPID (no es secreta: es el applicationServerKey)
  // y el panel de métricas.
  if ((req.method ?? 'GET').toUpperCase() === 'GET') {
    if (acaoQuery === 'chave') {
      if (!vapidConfigurado()) {
        res.status(200).json({ chave: null, motivo: 'Push não configurado neste ambiente.' })
        return
      }
      res.status(200).json({ chave: chavePublicaVapid() })
      return
    }
    if (acaoQuery === 'metricas') {
      if (!ctx.isAdmin) throw proibido('Só o gestor vê as métricas de avisos.')
      const bruto = req.query['dias']
      const dias = Number(Array.isArray(bruto) ? bruto[0] : (bruto ?? '30'))
      res.status(200).json({ dias: Number.isFinite(dias) ? dias : 30, tipos: await metricas(Number.isFinite(dias) ? dias : 30) })
      return
    }
    throw pedidoInvalido('Ação desconhecida. Use ?acao=chave ou ?acao=metricas.')
  }

  const corpo = await lerJson<CorpoDeTrack>(req)
  const acao = corpo.acao ?? acaoQuery
  const db = serviceClient()

  switch (acao) {
    case 'lido':
    case 'agido': {
      if (corpo.id === undefined || corpo.id.trim() === '') {
        throw pedidoInvalido('Falta o id do aviso.')
      }
      await medir(ctx.vendorName, corpo.id, acao === 'agido' ? 'agido_em' : 'lido_em')
      res.status(200).json({ ok: true })
      return
    }

    case 'assinar': {
      const { endpoint, p256dh, auth } = corpo
      if (
        endpoint === undefined || !endpoint.startsWith('https://') ||
        p256dh === undefined || p256dh.length < 80 ||
        auth === undefined || auth.length < 20
      ) {
        throw pedidoInvalido('Assinatura de push inválida.')
      }
      const { error } = await db.from('push_subscriptions').upsert(
        {
          vendor: ctx.vendorName,
          vendor_id: ctx.vendorId,
          endpoint,
          p256dh,
          auth,
          plataforma: corpo.plataforma ?? null,
          last_seen_at: new Date().toISOString(),
          // Reactiva un endpoint que había fallado: el vendedor volvió a dar
          // permiso y esa suscripción vuelve a ser buena.
          failed_at: null,
        },
        { onConflict: 'endpoint' },
      )
      if (error) {
        console.error(`[dispatch/track] assinar: ${error.code} ${error.message}`)
        throw pedidoInvalido('Não deu para registrar este aparelho.')
      }
      res.status(200).json({ ok: true })
      return
    }

    case 'desassinar': {
      if (corpo.endpoint === undefined) throw pedidoInvalido('Falta o endpoint.')
      const { error } = await db
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', corpo.endpoint)
        .eq('vendor', ctx.vendorName)
      if (error) console.error(`[dispatch/track] desassinar: ${error.message}`)
      res.status(200).json({ ok: true })
      return
    }

    default:
      throw pedidoInvalido('Ação desconhecida.')
  }
}

export default rota('dispatch/track', handler)
