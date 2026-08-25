// api/dispatch/__tests__/telegram-link.test.ts
// El botón de un aviso de Telegram y a dónde lleva.
//
// Esto existe por una razón concreta: la ruta que escribe quien encola el
// aviso ('/carteira/46?preparo=1') y el start_param que la app sabe leer
// ('opp_46_preparo') son dos codificaciones distintas de lo MISMO, y viven en
// archivos distintos —`api/dispatch/_catalogo.ts` y `src/host/deep-link.ts`—.
// Si se separan, el botón abre otra pantalla que la que promete el rótulo y
// nadie se entera: el vendedor toca «Preparar reunião» y aterriza en Hoje.
//
// Por eso el test no comprueba un string escrito a mano: comprueba que el ida
// y vuelta cierra contra la MISMA tabla que usa la app al arrancar.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { rotaDoStartParam, startParamDaUrl } from '../../../src/host/deep-link.js'
import { urlDoBotao } from '../_telegram.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('urlDoBotao', () => {
  it('deja pasar un link absoluto tal cual', () => {
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'VentusBot')
    expect(urlDoBotao('https://exemplo.com/x')).toBe('https://exemplo.com/x')
  })

  it('sin TELEGRAM_BOT_USERNAME manda a la web, que siempre funciona', () => {
    vi.stubEnv('TELEGRAM_BOT_USERNAME', '')
    vi.stubEnv('APP_URL', 'https://ventus.ventapel.com.br')
    expect(urlDoBotao('/carteira/46?preparo=1')).toBe(
      'https://ventus.ventapel.com.br/carteira/46?preparo=1',
    )
  })

  it('con bot configurado abre el Mini App en el destino exacto', () => {
    vi.stubEnv('TELEGRAM_BOT_USERNAME', '@VentusBot')
    const url = urlDoBotao('/carteira/46?preparo=1')
    expect(url.startsWith('https://t.me/VentusBot/app?startapp=')).toBe(true)

    // El ida y vuelta: la ruta que resuelve la app al abrirse es EXACTAMENTE
    // la que el dispatcher quiso mandar. Este es el invariante que importa.
    const startParam = startParamDaUrl(url)
    expect(startParam).not.toBeNull()
    expect(rotaDoStartParam(startParam)?.para).toBe('/carteira/46?preparo=1')
  })

  it('cae a la web cuando el destino no tiene codificación de start_param', () => {
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'VentusBot')
    vi.stubEnv('APP_URL', 'https://ventus.ventapel.com.br')
    // Inventar un start_param para una ruta que la tabla no conoce llevaría a
    // otra pantalla. Mejor el navegador, que abre exactamente esta ruta.
    expect(urlDoBotao('/uma/rota/que-no-existe')).toBe(
      'https://ventus.ventapel.com.br/uma/rota/que-no-existe',
    )
  })
})
