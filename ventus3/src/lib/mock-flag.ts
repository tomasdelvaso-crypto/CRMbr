// src/lib/mock-flag.ts
// La bandera «esta pantalla está hablando con un mock», en un solo lugar, y el
// estado de salud del backend que la acompaña.
//
// Dos pantallas dependen de un endpoint que todavía puede no existir
// (/api/ingest en Registrar, /api/ventus en el chat) y las dos resolvieron lo
// mismo por separado: una flag por env var, una por localStorage para poder
// probar en el teléfono sin rebuildear, y un fallback automático cuando el
// servidor no contesta. Era el mismo código dos veces con otro nombre de
// variable.
//
// Lo que NO se comparte es el estado: cada bandera tiene su propio
// `mockPorFallback`. Que /api/ingest esté sin desplegar no es motivo para que
// el chat empiece a inventar respuestas — son dos backends distintos.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL LATCH DEJÓ DE SER PARA SIEMPRE
// ══════════════════════════════════════════════════════════════════════════
// Primer test en un teléfono real: /api/ventus devolvió 500 durante unos
// minutos (un import roto ya arreglado). El teléfono cayó al camino local y
// se quedó ahí TODA la sesión — con señal perfecta y el servidor ya sano, el
// vendedor siguió leyendo «sem conexão» hasta que reinstaló la app.
//
// La regla nueva distingue dos fallas que no se parecen en nada:
//
//   · 404 / 501  → el endpoint NO EXISTE en este deploy. Insistir no arregla
//                  nada: se enciende el mock y se dice en pantalla. Latch
//                  permanente, que para esto sí es lo correcto.
//
//   · 5xx / timeout / red → el endpoint existe y está teniendo un mal
//                  momento. NUNCA latchea. La próxima pregunta vuelve a
//                  probar la API. Sólo si vuelve a fallar se espera un
//                  minuto antes de gastar otra espera de 25 s — que es todo
//                  el backoff que hace falta y ni un milisegundo más.
//
// REGLA QUE ESTO SOSTIENE: un mock siempre se anuncia en pantalla, y un 500
// nunca se anuncia como «sem conexão». La bandera existe para que la UI pueda
// decir la verdad; si alguien la usa para esconder que las respuestas son
// falsas, rompió el trato con el vendedor.

/** Cuánto se espera antes de volver a molestar a un servidor que ya falló dos veces. */
export const ESPERA_APOS_FALHA_MS = 60_000

/**
 * Fallas seguidas que se toleran sin esperar.
 *
 * Con 2: la PRIMERA reintenta enseguida —es la que arregla el caso del test
 * en el teléfono, donde el servidor se cura solo en un minuto— y recién la
 * segunda abre la ventana de espera.
 */
export const FALHAS_ANTES_DE_ESPERAR = 2

export interface BandeiraDeMock {
  /** Clave de localStorage: 'on' enciende el mock en el aparato, 'off' lo apaga. */
  readonly CHAVE: string
  /** ¿Estamos sirviendo respuestas simuladas ahora mismo? */
  modoMock: () => boolean
  /**
   * Latch PERMANENTE por endpoint inexistente (404/501). Es lo único que
   * enciende el mock por lo que queda de la sesión.
   */
  ativarMockPorFallback: () => void
  mockPorFallbackAtivo: () => boolean
  /**
   * El servidor existe pero falló (5xx, timeout, fetch que no salió). NO
   * enciende el mock y NO se recuerda más allá del backoff.
   */
  registrarFalhaDoServidor: (agora?: number) => void
  /** El servidor contestó bien: se olvida la racha de fallas. */
  registrarSucesso: () => void
  /** ¿Vale la pena gastar una llamada de red ahora, o estamos en el backoff? */
  podeTentarApi: (agora?: number) => boolean
  /** Para la UI: ¿la última noticia del servidor fue mala? */
  servidorComProblemas: () => boolean
  /**
   * Borra TODO el estado en memoria (latch y racha de fallas).
   *
   * Existe para los tests y para el botón de diagnóstico: nadie debería tener
   * que cerrar la app para volver a probar el endpoint real.
   */
  reiniciar: () => void
}

export interface OpcoesBandeiraDeMock {
  /** Valor de la env var VITE_*_MOCK: 'on' fuerza, 'off' prohíbe. */
  valorDaEnv: string | undefined
  /** Clave de localStorage. */
  chave: string
}

export function criarBandeiraDeMock({ valorDaEnv, chave }: OpcoesBandeiraDeMock): BandeiraDeMock {
  let porFallback = false
  let falhasSeguidas = 0
  let ultimaFalhaEm = 0

  function lerLocal(): 'on' | 'off' | null {
    try {
      const valor = localStorage.getItem(chave)
      return valor === 'on' || valor === 'off' ? valor : null
    } catch {
      // Safari en modo privado puede lanzar al leer localStorage.
      return null
    }
  }

  return {
    CHAVE: chave,

    ativarMockPorFallback() {
      porFallback = true
    },
    mockPorFallbackAtivo() {
      return porFallback
    },

    registrarFalhaDoServidor(agora = Date.now()) {
      falhasSeguidas += 1
      ultimaFalhaEm = agora
    },
    registrarSucesso() {
      falhasSeguidas = 0
      ultimaFalhaEm = 0
    },
    podeTentarApi(agora = Date.now()) {
      // La primera falla no cuesta nada: la próxima pregunta reintenta ya.
      if (falhasSeguidas < FALHAS_ANTES_DE_ESPERAR) return true
      return agora - ultimaFalhaEm >= ESPERA_APOS_FALHA_MS
    },
    servidorComProblemas() {
      return falhasSeguidas > 0
    },

    reiniciar() {
      porFallback = false
      falhasSeguidas = 0
      ultimaFalhaEm = 0
    },

    modoMock() {
      const local = lerLocal()
      // El aparato manda para APAGARLO: es la única forma de probar el
      // endpoint real en un teléfono que ya tiene un bundle con el mock
      // encendido, y fue exactamente lo que faltó en el primer test de campo.
      if (local === 'off') return false
      if (valorDaEnv === 'on') return true
      // La env 'off' apaga incluso el latch, que es lo que uno quiere en
      // producción para que un 501 se vea como el error que es.
      if (valorDaEnv === 'off') return false
      if (local === 'on') return true
      return porFallback
    },
  }
}
