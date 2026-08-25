// api/_lib/env.ts
// Lectura de variables de entorno con la regla fail-CLOSED del plano: si falta
// una env var, el log del servidor dice EXACTAMENTE cuál y el cliente recibe un
// mensaje genérico en PT-BR. Nunca al revés — un mensaje de error que nombra
// `SUPABASE_SERVICE_ROLE_KEY` en la respuesta HTTP le está contando al mundo
// cómo está armado el backend.

/** Falta de configuración. Se mapea a 500 con cuerpo genérico. */
export class ErroDeConfiguracao extends Error {
  readonly variavel: string

  constructor(variavel: string) {
    super(`Variável de ambiente ausente: ${variavel}`)
    this.name = 'ErroDeConfiguracao'
    this.variavel = variavel
  }
}

/** Devuelve la env var o lanza. El nombre solo viaja al log. */
export function requireEnv(nome: string): string {
  const valor = process.env[nome]
  if (valor === undefined || valor.trim() === '') {
    console.error(`[config] ${nome} não configurada`)
    throw new ErroDeConfiguracao(nome)
  }
  return valor
}

/** Devuelve la env var o `undefined`. Para lo opcional de verdad. */
export function optionalEnv(nome: string): string | undefined {
  const valor = process.env[nome]
  if (valor === undefined || valor.trim() === '') return undefined
  return valor
}

/**
 * Primera env var configurada de una lista de alias. Existe porque la misma
 * credencial vive con dos nombres distintos según el proyecto: el CRM v2
 * guarda la key de Anthropic como CLAUDE_API_KEY, y renombrarla en Vercel
 * rompería el v2, que está en producción.
 */
export function requireEnvAlias(...nomes: readonly string[]): string {
  for (const nome of nomes) {
    const valor = optionalEnv(nome)
    if (valor !== undefined) return valor
  }
  console.error(`[config] nenhuma de ${nomes.join(' / ')} configurada`)
  throw new ErroDeConfiguracao(nomes[0] ?? 'env')
}

/** ¿Alguno de los alias está configurado? */
export function temEnvAlias(...nomes: readonly string[]): boolean {
  return nomes.some((nome) => optionalEnv(nome) !== undefined)
}

/** ¿Está configurada? Se usa en /api/health sin exponer el valor. */
export function temEnv(nome: string): boolean {
  return optionalEnv(nome) !== undefined
}

/**
 * Orígenes permitidos para CORS. Coma-separados, NUNCA '*'.
 * El v2 respondía `Access-Control-Allow-Origin: *` con credenciales, que es la
 * combinación que el navegador rechaza y que además invita a cualquiera.
 */
export function origensPermitidas(): readonly string[] {
  const bruto = optionalEnv('ALLOWED_ORIGIN') ?? 'https://ventus.ventapel.com.br'
  return bruto
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '' && o !== '*')
}
