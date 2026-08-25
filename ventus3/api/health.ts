// api/health.ts — estado das dependências, sem expor um único segredo.
//
// Qué dice y qué NO dice: dice si cada dependencia está configurada y si
// responde. No dice la URL del proyecto, ni el prefijo de ninguna clave, ni el
// mensaje de error crudo del proveedor — un health check que filtra la forma
// del backend es un mapa gratis para quien lo pida.
//
// Supabase se prueba de verdad (un HEAD sobre `vendors`, la tabla más chica de
// la base, sin traer filas). Anthropic y Groq NO se prueban con una llamada
// real: sondear un modelo por cada health check cuesta plata y ninguno de los
// dos tiene un endpoint gratis que confirme la clave. Se reporta 'configurado'
// o 'ausente', que es la falla que de verdad ocurre en un deploy.

import type { ApiHandler } from './_lib/http.js'
import { exigirMetodo, rota } from './_lib/http.js'
import { temEnv } from './_lib/env.js'
import { serviceClient } from './_lib/supabase.js'

type EstadoDep = 'ok' | 'configurado' | 'ausente' | 'falha'

interface Dependencia {
  estado: EstadoDep
  /** Milisegundos de la sonda. null cuando no se sondea. */
  ms: number | null
  /** Mensaje corto en PT-BR. Nunca el error crudo del proveedor. */
  detalhe: string | null
}

export interface HealthResponse {
  ok: boolean
  service: 'ventus3'
  at: string
  /** Commit del deploy, cuando Vercel lo inyecta. Útil para saber qué corre. */
  versao: string | null
  dependencias: {
    supabase: Dependencia
    anthropic: Dependencia
    groq: Dependencia
    auth: Dependencia
  }
}

function porEnv(...nomes: readonly string[]): Dependencia {
  const faltando = nomes.filter((n) => !temEnv(n))
  return faltando.length === 0
    ? { estado: 'configurado', ms: null, detalhe: null }
    : { estado: 'ausente', ms: null, detalhe: `${faltando.length} variável(is) de ambiente faltando` }
}

async function sondarSupabase(): Promise<Dependencia> {
  if (!temEnv('SUPABASE_URL') || !temEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    return { estado: 'ausente', ms: null, detalhe: 'sem credenciais de servidor' }
  }
  const comecou = Date.now()
  try {
    const { error } = await serviceClient()
      .from('vendors')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    const ms = Date.now() - comecou
    if (error) {
      console.error(`[health] supabase: ${error.code} ${error.message}`)
      return { estado: 'falha', ms, detalhe: 'o banco respondeu com erro' }
    }
    return { estado: 'ok', ms, detalhe: null }
  } catch (erro) {
    console.error('[health] supabase explodiu:', erro)
    return { estado: 'falha', ms: Date.now() - comecou, detalhe: 'não deu para falar com o banco' }
  }
}

const handler: ApiHandler = async (req, res) => {
  exigirMetodo(req, 'GET')

  const supabase = await sondarSupabase()
  const dependencias: HealthResponse['dependencias'] = {
    supabase,
    anthropic: porEnv('ANTHROPIC_API_KEY'),
    groq: porEnv('GROQ_API_KEY'),
    // Basta con UNA de las dos formas de verificar la firma: JWKS (asimétrica,
    // derivada de SUPABASE_URL) o el secreto HS256 legado.
    auth: temEnv('SUPABASE_JWT_SECRET') || temEnv('SUPABASE_URL')
      ? { estado: 'configurado', ms: null, detalhe: null }
      : { estado: 'ausente', ms: null, detalhe: 'sem forma de verificar o JWT' },
  }

  const critico = supabase.estado === 'falha' || Object.values(dependencias).some((d) => d.estado === 'ausente')

  const corpo: HealthResponse = {
    ok: !critico,
    service: 'ventus3',
    at: new Date().toISOString(),
    versao: process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 7) ?? null,
    dependencias,
  }

  res.status(critico ? 503 : 200).json(corpo)
}

export default rota('/api/health', handler)
