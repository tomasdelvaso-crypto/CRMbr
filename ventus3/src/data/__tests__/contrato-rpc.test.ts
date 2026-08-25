// src/data/__tests__/contrato-rpc.test.ts
//
// El contrato entre mutations.ts y las funciones de Postgres.
//
// POR QUÉ EXISTE: PostgREST resuelve una función por el CONJUNTO EXACTO de
// nombres de argumento. Un argumento de más, o uno mal escrito, no se ignora:
// devuelve PGRST202 «function does not exist» y la escritura muere en la cola.
// Es invisible para el type-check, para el linter y para el build — pasó de
// verdad: las cinco RPC de dominio se escribieron con nombres que ninguna
// función aceptaba (p_stage por p_nova_etapa, un p_idempotency_key inyectado
// en todas, un p_vendor que no existe).
//
// Este test lee las MIGRACIONES REALES y compara. Si alguien renombra un
// parámetro de un lado, falla acá y no en el teléfono de un vendedor sin señal.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VentusDatabase, _setDbParaTeste, getDb } from '../db'
import { definirTransporte, novoClientUuid, pending } from '../outbox'
import {
  RPC,
  atualizarEscala,
  avancarEtapa,
  converterLead,
  promoverDoSweep,
  registrarTouchpoint,
} from '../mutations'
import type { OutboxMutation, TransporteOutbox } from '../local-types'

/* ── Lectura de las firmas reales en supabase/migrations ──────────────────── */

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

interface Assinatura {
  /** Nombres de parámetro en orden de declaración. */
  parametros: string[]
  /** Los que NO tienen `default`: si falta uno, la llamada no resuelve. */
  obrigatorios: string[]
  arquivo: string
}

/**
 * Extrae las firmas de `create [or replace] function public.<nome>(...)`.
 * Se hace con regex y no con un parser de SQL a propósito: el test tiene que
 * correr en el CI de Node sin dependencias de Postgres. La forma del DDL en
 * estas migraciones es uniforme y está cubierta por el parser real de pglast
 * en el flujo de las migraciones.
 */
function lerAssinaturas(): Map<string, Assinatura> {
  const mapa = new Map<string, Assinatura>()
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const arquivo of arquivos) {
    const sql = readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8')
    const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(sql)) !== null) {
      const nome = m[1]
      const corpo = m[2]
      if (nome === undefined || corpo === undefined) continue

      const parametros: string[] = []
      const obrigatorios: string[] = []
      for (const bruto of corpo.split(',')) {
        const arg = bruto.trim()
        if (arg === '') continue
        const nomeArg = /^(\w+)\b/.exec(arg)?.[1]
        if (nomeArg === undefined) continue
        parametros.push(nomeArg)
        if (!/\bdefault\b/i.test(arg)) obrigatorios.push(nomeArg)
      }
      // `create or replace` puede aparecer más de una vez: gana la última.
      mapa.set(nome, { parametros, obrigatorios, arquivo })
    }
  }
  return mapa
}

const ASSINATURAS = lerAssinaturas()

/* ── Andamiaje: capturamos lo que la mutación encola, sin red ─────────────── */

let db: VentusDatabase
let contador = 0

/**
 * Transporte mudo. No se usa para capturar: sin sesión de Supabase el flush no
 * llega a llamarlo. Lo que se inspecciona es la COLA, que es justamente lo que
 * viaja cuando el teléfono recupera señal.
 */
const transporteMudo: TransporteOutbox = {
  enviar(): Promise<void> {
    return Promise.resolve()
  },
}

beforeEach(async () => {
  contador += 1
  db = new VentusDatabase(`ventus-test-contrato-${String(contador)}`)
  _setDbParaTeste(db)
  await db.open()
  definirTransporte(transporteMudo)
})

afterEach(async () => {
  definirTransporte(null)
  db.close()
  await db.delete()
  _setDbParaTeste(null)
})

/** Encuentra en la cola la mutación que llama a esa función. */
async function chamadaA(funcao: string): Promise<OutboxMutation> {
  const achado = (await pending()).find((m) => m.rpc === funcao)
  if (!achado) throw new Error(`Nenhuma chamada a ${funcao} foi enfileirada`)
  return achado
}

/**
 * La verificación que importa: TODO argumento enviado tiene que existir en la
 * firma, y todo parámetro sin default tiene que ir en la llamada.
 */
async function conferirContrato(funcao: string): Promise<void> {
  const assinatura = ASSINATURAS.get(funcao)
  expect(assinatura, `public.${funcao}() não está definida em supabase/migrations`).toBeDefined()
  if (!assinatura) return

  const enviadosArgs = Object.keys((await chamadaA(funcao)).payload)
  const desconhecidos = enviadosArgs.filter((a) => !assinatura.parametros.includes(a))
  expect(desconhecidos, `argumentos que ${funcao}() não aceita`).toEqual([])

  const faltantes = assinatura.obrigatorios.filter((p) => !enviadosArgs.includes(p))
  expect(faltantes, `parâmetros obrigatórios de ${funcao}() que ninguém manda`).toEqual([])
}

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe('contrato RPC app ↔ Postgres', () => {
  it('as cinco funções de domínio existem nas migrações', () => {
    for (const funcao of Object.values(RPC)) {
      expect(ASSINATURAS.has(funcao), `falta public.${funcao}()`).toBe(true)
    }
  })

  it('atualizar_escala', async () => {
    await getDb().opportunities.put({
      id: 46,
      vendor: 'Renata',
      scales: {},
    } as never)
    await atualizarEscala({
      opportunityId: 46,
      escala: 'dor',
      nivel: 7,
      citacao: 'Perdemos 3 cargas por caixa violada no trimestre.',
      fonte: 'reuniao',
      vendor: 'Renata',
    })
    await conferirContrato(RPC.atualizarEscala)
  })

  it('avancar_etapa', async () => {
    await getDb().opportunities.put({ id: 46, vendor: 'Renata', stage: 2 } as never)
    await avancarEtapa({ opportunityId: 46, para: 3, vendor: 'Renata' })
    await conferirContrato(RPC.avancarEtapa)
  })

  it('registrar_touchpoint', async () => {
    await getDb().leads.put({
      id: 12,
      vendor: 'Andre',
      company_name: 'Frigorífico X',
      stage: '1a',
      status: 'active',
      touchpoints_count: 0,
    } as never)
    await registrarTouchpoint({
      leadId: 12,
      sequencia: 1,
      canal: 'whatsapp',
      resultado: 'interested',
      notas: 'Pediu proposta.',
      vendor: 'Andre',
    })
    await conferirContrato(RPC.registrarTouchpoint)
  })

  it('converter_lead', async () => {
    await getDb().leads.put({
      id: 12,
      vendor: 'Andre',
      company_name: 'Frigorífico X',
      stage: '1d',
      status: 'active',
      touchpoints_count: 4,
    } as never)
    await converterLead({ leadId: 12, valor: 84_000, vendor: 'Andre' })
    await conferirContrato(RPC.converterLead)
  })

  it('promote_sweep_to_lead', async () => {
    await promoverDoSweep({ sweepId: 501, vendor: 'Paulo' })
    await conferirContrato(RPC.promoverDoSweep)
  })

  it('o transporte não inventa argumentos: p_idempotency_key não é de ninguém', () => {
    for (const assinatura of ASSINATURAS.values()) {
      expect(assinatura.parametros).not.toContain('p_idempotency_key')
    }
  })

  it('a mensagem enviada não se perde: vai dentro de p_notas', async () => {
    await getDb().leads.put({
      id: 12,
      vendor: 'Andre',
      company_name: 'Frigorífico X',
      stage: '1a',
      status: 'active',
      touchpoints_count: 0,
    } as never)
    await registrarTouchpoint({
      leadId: 12,
      sequencia: 1,
      canal: 'email',
      resultado: 'no_response',
      notas: 'Sem resposta.',
      mensagemEnviada: 'Bom dia, vi que vocês expedem 400 caixas/dia…',
      vendor: 'Andre',
    })
    const notas = (await chamadaA(RPC.registrarTouchpoint)).payload['p_notas']
    expect(String(notas)).toContain('Sem resposta.')
    expect(String(notas)).toContain('Mensagem enviada:')
  })

  it('cada client_uuid enfileirado é o id da mutação: reenviar não duplica', async () => {
    await getDb().opportunities.put({ id: 46, vendor: 'Renata', scales: {} } as never)
    await atualizarEscala({
      opportunityId: 46,
      escala: 'poder',
      nivel: 4,
      vendor: 'Renata',
    })
    const chamada = await chamadaA(RPC.atualizarEscala)
    expect(chamada.payload['p_client_uuid']).toBe(chamada.id)
    expect(novoClientUuid()).not.toBe(chamada.id)
  })
})
