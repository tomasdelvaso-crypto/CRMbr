// src/data/config-publica.ts
// Origen y clave publicable de Supabase, resueltas en tiempo de BUILD.
//
// Por qué existe este archivo aparte: cuando estas dos variables faltan en el
// build, `supabase.ts` lanzaba en el tope del módulo. Un throw ahí ocurre
// ANTES de que React monte, así que el resultado es una pantalla en blanco sin
// ninguna pista — y el screenshotter de Vercel muestra lo mismo. Nos costó un
// diagnóstico entero. Ahora la ausencia se detecta acá y la app arranca igual,
// mostrando qué falta y dónde configurarlo.
//
// Ambas son públicas por diseño: viajan en el bundle y la anon key es una
// clave *publicable*. Lo que protege los datos es el RLS, no esconderlas.

export interface ConfigPublica {
  url: string
  anonKey: string
}

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * ¿Esto tiene forma de JWT? Tres segmentos base64url separados por punto, y el
 * primero empieza en `eyJ` (que es `{"` en base64).
 *
 * Existe porque el error más caro de este proyecto no fue una variable
 * ausente sino una PRESENTE Y SUCIA: en Vercel se pegó la línea entera
 * `VITE_SUPABASE_ANON_KEY=eyJ…` dentro del campo de valor, así que la clave
 * viajaba con el nombre de la variable adelante. Supabase respondía
 * «Invalid API key · Not a JWT», el cliente lo leía como 401 y la app decía
 * «e-mail ou senha incorretos». Horas de procurar uma senha que estava certa.
 * Uma verificação de formato o teria dito na primeira tela.
 *
 * Se exporta para que los ARRANCADORES DE PRUEBA se puedan medir con la misma
 * vara: el stub de `playwright.config.ts` decía `chave-anon-de-teste`, esta
 * regla lo rechazó y la suite entera pasó a ver la pantalla de diagnóstico en
 * vez de la app. La regresión se fija en
 * `src/data/__tests__/stub-de-teste.test.ts`.
 */
export function pareceJwt(valor: string): boolean {
  const partes = valor.split('.')
  return (
    partes.length === 3 &&
    partes[0]?.startsWith('eyJ') === true &&
    partes.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p))
  )
}

/** Variables ausentes en el build. */
const ausentes: readonly string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(anonKey ? [] : ['VITE_SUPABASE_ANON_KEY']),
]

/** Variables presentes pero con un valor que no puede funcionar. */
export const variaveisMalformadas: readonly string[] = [
  ...(url && !/^https:\/\/[a-z0-9-]+\.supabase\./.test(url.trim())
    ? ['VITE_SUPABASE_URL']
    : []),
  ...(anonKey && !pareceJwt(anonKey.trim()) ? ['VITE_SUPABASE_ANON_KEY'] : []),
]

/** Las variables que el build no dejó utilizables. Vacío = todo bien. */
export const variaveisFaltando: readonly string[] = [...ausentes, ...variaveisMalformadas]

export const configOk = variaveisFaltando.length === 0

/**
 * Sólo llamar cuando `configOk` es true. Se mantiene como función para que el
 * cliente de Supabase no se construya durante la evaluación del módulo.
 */
export function configPublica(): ConfigPublica {
  if (!configOk) {
    throw new Error(`Configuração ausente: ${variaveisFaltando.join(', ')}`)
  }
  return { url: url as string, anonKey: anonKey as string }
}
