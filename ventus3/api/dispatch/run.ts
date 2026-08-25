// api/dispatch/run.ts — el drenaje de la cola. Lo llama pg_cron cada minuto.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL SCHEDULER ES pg_cron Y EL HANDLER ESTÁ ACÁ
// ══════════════════════════════════════════════════════════════════════════
// Vercel Cron en el plan Hobby da UNA ejecución por día con precisión de hora:
// "reunião em 15 minutos" es literalmente imposible. pg_cron + pg_net corren
// dentro de Supabase, tienen precisión de minuto y no cuestan nada.
//
// Pero la POLÍTICA no puede vivir en plpgsql: `rankDay()`, `avaliarRiscos()` y
// las quiet hours de `dates.ts` ya existen en TypeScript, están testeadas y
// corren igual en el navegador, en api/ y en el bot. Reescribirlas en SQL
// crearía el pecado original del v2 —dos motores divergentes sobre las mismas
// columnas— pero en la base.
//
// Entonces: pg_cron agenda, pg_net hace el POST, y el dominio corre una sola
// vez, acá, en el mismo código que ve el vendedor. Ver 0012_cron.sql.

import type { ApiHandler } from '../_lib/http.js'
import { exigirMetodo, rota } from '../_lib/http.js'
import { exigirCron } from './_cron.js'
import { planejarDespacho } from './_politica.js'
import type { EnvioPlanejado } from './_tipos.js'
import {
  chavesEnviadasHoje,
  db,
  destinos,
  enfileirar,
  filaPendente,
  gastoDoDia,
  janelaGolden,
  marcarAdiado,
  marcarEnviado,
  marcarSuprimido,
  matarAssinatura,
  desativarChat,
  preferencias,
  vendedoresAtivos,
} from './_repo.js'
import type { DestinosDoVendedor } from './_repo.js'
import { enviarTelegram, telegramConfigurado } from './_telegram.js'
import { enviarPush, vapidConfigurado } from './_webpush.js'

export interface RunResponse {
  ok: boolean
  em: string
  vendedores: number
  enviados: number
  adiados: number
  suprimidos: number
  agregados: number
  falhas: number
}

/** Lo que viaja dentro del push cifrado. El SW lo lee para pintar y para medir. */
function payloadPush(envio: EnvioPlanejado): string {
  const a = envio.aviso
  return JSON.stringify({
    id: a.id,
    tipo: a.tipo,
    titulo: a.titulo,
    corpo: a.corpo,
    // Regla dura: siempre hay a dónde ir. Nunca "abra o app".
    deep_link: a.deep_link,
    acoes: a.acoes ?? [],
    topic: envio.topic,
    colapsados: envio.colapsados.length,
  })
}

/** Devuelve el canal efectivo si algo salió, o null si no salió nada. */
async function despachar(
  envio: EnvioPlanejado,
  dest: DestinosDoVendedor,
): Promise<string | null> {
  const entregues: string[] = []

  for (const transporte of envio.transportes) {
    if (transporte === 'telegram' && telegramConfigurado()) {
      for (const chat of dest.chats) {
        const r = await enviarTelegram(chat, envio.aviso.titulo, envio.aviso.corpo, envio.aviso.acoes)
        if (r.ok) entregues.push('telegram')
        else if (r.morto) await desativarChat(chat)
      }
    }
    if (transporte === 'push' && vapidConfigurado()) {
      const corpo = payloadPush(envio)
      for (const assinatura of dest.push) {
        const r = await enviarPush(assinatura, corpo, {
          ttl: envio.ttl,
          urgencia: envio.urgencia,
          topic: envio.topic,
        })
        if (r.ok) entregues.push('push')
        else if (r.morto) await matarAssinatura(assinatura.id)
      }
    }
  }

  if (entregues.length === 0) return null
  return entregues.includes('telegram') && entregues.includes('push')
    ? 'ambos'
    : (entregues[0] ?? null)
}

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'POST')
  exigirCron(req)

  const cli = db()
  const agora = new Date()
  const fila = await filaPendente(agora, cli)

  // vendor → vendor_id, para poder resolver los canales de Telegram.
  const vendedores = await vendedoresAtivos(cli)
  const idPorNome = new Map(vendedores.map((v) => [v.name, v.id]))

  const porVendedor = new Map<string, typeof fila>()
  for (const aviso of fila) {
    const lista = porVendedor.get(aviso.vendor) ?? []
    lista.push(aviso)
    porVendedor.set(aviso.vendor, lista)
  }

  const resposta: RunResponse = {
    ok: true,
    em: agora.toISOString(),
    vendedores: porVendedor.size,
    enviados: 0,
    adiados: 0,
    suprimidos: 0,
    agregados: 0,
    falhas: 0,
  }

  for (const [vendor, avisos] of porVendedor) {
    const vendorId = avisos[0]?.vendor_id ?? idPorNome.get(vendor) ?? null
    const [prefs, gasto, chaves, dest, janela] = await Promise.all([
      preferencias(vendor, cli),
      gastoDoDia(vendor, agora, cli),
      chavesEnviadasHoje(vendor, agora, cli),
      destinos(vendor, vendorId, cli),
      janelaGolden(vendor, agora, cli),
    ])

    const plano = planejarDespacho({
      vendor,
      agora,
      prefs,
      fila: avisos,
      gasto,
      canais: dest.disponiveis,
      janelaGolden: janela,
      chavesEnviadasHoje: chaves,
    })

    for (const envio of plano.envios) {
      const canal = await despachar(envio, dest)
      if (canal === null) {
        // No salió por ningún transporte. Se deja pendiente: el próximo minuto
        // reintenta y, si para entonces ya no es verdad, la política misma lo
        // suprime como 'expirada'. Nunca se marca enviado algo que no salió.
        resposta.falhas += 1
        continue
      }
      await marcarEnviado([envio.aviso.id], canal, agora, cli)
      // Los colapsados quedan medidos como duplicados, no como enviados: si no,
      // la tasa de lectura por tipo se infla sola y vuelve a no medir nada.
      await marcarSuprimido(envio.colapsados, 'duplicada', cli)
      resposta.enviados += 1
    }

    for (const adiado of plano.adiados) {
      await marcarAdiado(adiado.id, adiado.ate, adiado.motivo, cli)
      resposta.adiados += 1
    }

    // Agrupados por motivo: un UPDATE por motivo en vez de uno por fila.
    const porMotivo = new Map<string, string[]>()
    for (const s of plano.suprimidos) {
      const lista = porMotivo.get(s.motivo) ?? []
      lista.push(s.id)
      porMotivo.set(s.motivo, lista)
    }
    for (const [motivo, ids] of porMotivo) {
      await marcarSuprimido(ids, motivo as Parameters<typeof marcarSuprimido>[1], cli)
      resposta.suprimidos += ids.length
    }

    if (plano.agregado !== null) {
      const r = await enfileirar(plano.agregado, cli)
      if (r === 'enfileirado') resposta.agregados += 1
    }
  }

  res.status(200).json(resposta)
}

export default rota('dispatch/run', handler)
