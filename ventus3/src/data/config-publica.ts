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

/** Las variables que faltaron en el build. Vacío = todo bien. */
export const variaveisFaltando: readonly string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(anonKey ? [] : ['VITE_SUPABASE_ANON_KEY']),
]

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
