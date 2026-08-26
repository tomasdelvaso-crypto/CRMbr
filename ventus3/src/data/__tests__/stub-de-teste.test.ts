// src/data/__tests__/stub-de-teste.test.ts
// Las claves falsas con las que arrancan las pruebas tienen que pasar la MISMA
// validación que la app le hace a la clave real.
//
// Esto existe por una regresión concreta y cara en tiempo. `config-publica.ts`
// pasó a rechazar una anon key que no tuviera forma de JWT —el arreglo del
// login, donde en Vercel se había pegado la línea entera dentro del campo del
// valor—. Correcto y necesario. Pero el arrancador de Playwright venía usando
// la cadena `chave-anon-de-teste`, que no tiene forma de nada: desde ese
// commit la app mostraba la pantalla de diagnóstico en vez de montar, y las
// 117 pruebas de punta a punta fallaban todas con el mismo mensaje despistante
// («A app nunca resolveu o vendedor da sessão»), que apunta a la sesión y no a
// la configuración.
//
// El test es barato y la falla que evita no lo es: lee los arrancadores como
// texto y mide sus stubs con `pareceJwt()`, la función de producción. Si
// alguien endurece la validación otra vez, esto se pone rojo en `vitest` —diez
// segundos— en vez de en Playwright —nueve minutos— y dice exactamente por qué.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { pareceJwt } from '../config-publica'

const raiz = fileURLToPath(new URL('../../../', import.meta.url))

/** El valor de `VITE_SUPABASE_ANON_KEY` escrito en un arrancador. */
function stubDoArquivo(rel: string): string {
  const texto = readFileSync(raiz + rel, 'utf8')
  const m = /VITE_SUPABASE_ANON_KEY:\s*\n?\s*'([^']+)'/.exec(texto)
  if (m?.[1] === undefined) {
    throw new Error(`${rel} ya no declara VITE_SUPABASE_ANON_KEY como literal`)
  }
  return m[1]
}

const ARRANCADORES = ['playwright.config.ts', 'scripts/medir-arranque.mjs'] as const

describe('los stubs de las pruebas pasan la validación de producción', () => {
  it.each(ARRANCADORES)('%s declara una anon key con forma de JWT', (arquivo) => {
    expect(pareceJwt(stubDoArquivo(arquivo))).toBe(true)
  })

  it('los dos arrancadores usan exactamente la misma clave', () => {
    // Dos stubs distintos se separan, y el segundo se descubre el día que
    // alguien corre la medición de arranque y no entiende por qué mide la
    // pantalla de diagnóstico.
    const [a, b] = ARRANCADORES.map(stubDoArquivo)
    expect(a).toBe(b)
  })

  it('ningún arrancador puede alcanzar el proyecto real', () => {
    // El candado que importa: el host de producción no puede aparecer en un
    // arrancador de pruebas ni por accidente. Se busca el HOST completo, no el
    // ref suelto: el encabezado de playwright.config.ts nombra el ref justamente
    // para explicar que no lo usa, y eso hay que dejarlo escrito.
    for (const arquivo of ARRANCADORES) {
      const texto = readFileSync(raiz + arquivo, 'utf8')
      expect(texto).not.toContain('wtrbvgqxgcfjacqcndmb.supabase.co')
      expect(stubDoArquivo(arquivo)).not.toContain('wtrbvgqxgcfjacqcndmb')
    }
  })
})

describe('pareceJwt', () => {
  it('acepta un JWT bien formado y rechaza lo que no lo es', () => {
    expect(pareceJwt('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura')).toBe(true)
    expect(pareceJwt('chave-anon-de-teste')).toBe(false)
    expect(pareceJwt('')).toBe(false)
    // El error que originó todo: la línea entera pegada en el campo del valor.
    expect(pareceJwt('VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.eyJ9.x')).toBe(false)
  })
})
