// src/lib/mock-flag.ts
// La bandera «esta pantalla está hablando con un mock», en un solo lugar.
//
// Dos pantallas dependen de un endpoint que todavía puede no existir
// (/api/ingest en Registrar, /api/ventus en el chat) y las dos resolvieron lo
// mismo por separado: una flag por env var, una por localStorage para poder
// probar en el teléfono sin rebuildear, y un fallback automático cuando el
// servidor contesta 404/501. Era el mismo código dos veces con otro nombre de
// variable.
//
// Lo que NO se comparte es el estado: cada bandera tiene su propio
// `mockPorFallback`. Que /api/ingest esté sin desplegar no es motivo para que
// el chat empiece a inventar respuestas — son dos backends distintos.
//
// REGLA QUE ESTO SOSTIENE: un mock siempre se anuncia en pantalla. La bandera
// existe para que la UI pueda decir «Modo simulado»; si alguien la usa para
// esconder que las respuestas son falsas, rompió el trato con el vendedor.

export interface BandeiraDeMock {
  /** Clave de localStorage: ponerla en 'on' enciende el mock en el aparato. */
  readonly CHAVE: string
  /** ¿Estamos sirviendo respuestas simuladas ahora mismo? */
  modoMock: () => boolean
  /** Enciende el mock para lo que queda de la sesión (fallback por 404/501). */
  ativarMockPorFallback: () => void
  mockPorFallbackAtivo: () => boolean
}

export interface OpcoesBandeiraDeMock {
  /** Valor de la env var VITE_*_MOCK: 'on' fuerza, 'off' prohíbe. */
  valorDaEnv: string | undefined
  /** Clave de localStorage. */
  chave: string
}

export function criarBandeiraDeMock({ valorDaEnv, chave }: OpcoesBandeiraDeMock): BandeiraDeMock {
  let porFallback = false

  return {
    CHAVE: chave,
    ativarMockPorFallback() {
      porFallback = true
    },
    mockPorFallbackAtivo() {
      return porFallback
    },
    modoMock() {
      // La env manda: 'off' apaga incluso el fallback, que es lo que uno
      // quiere en producción para que un 501 se vea como el error que es.
      if (valorDaEnv === 'on') return true
      if (valorDaEnv === 'off') return false
      if (porFallback) return true
      try {
        return localStorage.getItem(chave) === 'on'
      } catch {
        // Safari en modo privado puede lanzar al leer localStorage.
        return false
      }
    },
  }
}
