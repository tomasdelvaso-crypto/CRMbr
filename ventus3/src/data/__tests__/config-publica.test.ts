// Prueba de la detección de configuración del build.
//
// Estos casos no son hipotéticos: cada uno ocurrió de verdad en el despliegue
// del 26/08/2026 y costó horas de diagnóstico. La clave llegó a producción con
// el nombre de la variable pegado adelante — se copió la línea entera
// `NOMBRE=valor` dentro del campo del valor — y Supabase respondía
// «Invalid API key · Not a JWT» con un 401 que la app leía como contraseña
// incorrecta.

import { afterEach, describe, expect, it, vi } from 'vitest'

/** Recarga el módulo con el entorno indicado: lee import.meta.env al evaluarse. */
async function comEnv(url: string | undefined, anonKey: string | undefined) {
  vi.resetModules()
  if (url === undefined) vi.stubEnv('VITE_SUPABASE_URL', '')
  else vi.stubEnv('VITE_SUPABASE_URL', url)
  if (anonKey === undefined) vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  else vi.stubEnv('VITE_SUPABASE_ANON_KEY', anonKey)
  return import('../config-publica')
}

const JWT_VALIDO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0' +
  '.8PB0OjF2vvCtCCDnYCeemMSyvR51E2SAHe7slS1UyQU'

const URL_VALIDA = 'https://wtrbvgqxgcfjacqcndmb.supabase.co'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('config do build', () => {
  it('com as duas variáveis certas, a app arranca', async () => {
    const m = await comEnv(URL_VALIDA, JWT_VALIDO)
    expect(m.configOk).toBe(true)
    expect(m.variaveisFaltando).toHaveLength(0)
    expect(m.configPublica()).toEqual({ url: URL_VALIDA, anonKey: JWT_VALIDO })
  })

  it('acusa as variáveis ausentes pelo nome', async () => {
    const m = await comEnv(undefined, undefined)
    expect(m.configOk).toBe(false)
    expect([...m.variaveisFaltando].sort()).toEqual([
      'VITE_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_URL',
    ])
    expect(m.variaveisMalformadas).toHaveLength(0)
  })

  it('pega a linha inteira colada no campo do valor — o erro real de produção', async () => {
    const m = await comEnv(URL_VALIDA, `VITE_SUPABASE_ANON_KEY=${JWT_VALIDO}`)
    expect(m.configOk).toBe(false)
    expect(m.variaveisMalformadas).toContain('VITE_SUPABASE_ANON_KEY')
  })

  it('pega o caso exato que foi a produção, com o nome duplicado', async () => {
    const m = await comEnv(
      URL_VALIDA,
      `VITE_SUPABASE_ANON=VITE_SUPABASE_ANON_KEY=${JWT_VALIDO}`,
    )
    expect(m.configOk).toBe(false)
    expect(m.variaveisMalformadas).toContain('VITE_SUPABASE_ANON_KEY')
  })

  it('não confunde ausente com mal formada: são listas distintas', async () => {
    const m = await comEnv(URL_VALIDA, 'isto-nao-e-um-jwt')
    expect(m.variaveisMalformadas).toEqual(['VITE_SUPABASE_ANON_KEY'])
    expect(m.variaveisFaltando).toEqual(['VITE_SUPABASE_ANON_KEY'])
  })

  it('tolera espaço em volta, que é o que sobra de um copiar e colar', async () => {
    const m = await comEnv(`  ${URL_VALIDA}  `, `\n${JWT_VALIDO}\n`)
    expect(m.variaveisMalformadas).toHaveLength(0)
  })

  it('recusa uma URL que não é de Supabase', async () => {
    const m = await comEnv('https://exemplo.com', JWT_VALIDO)
    expect(m.variaveisMalformadas).toContain('VITE_SUPABASE_URL')
  })

  it('recusa um JWT truncado', async () => {
    const m = await comEnv(URL_VALIDA, 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSJ9')
    expect(m.variaveisMalformadas).toContain('VITE_SUPABASE_ANON_KEY')
  })

  it('configPublica() lança em vez de devolver lixo quando algo não serve', async () => {
    const m = await comEnv(URL_VALIDA, 'lixo')
    expect(() => m.configPublica()).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })
})
