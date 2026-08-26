// src/app/SessionProvider.tsx
// Sesión de Supabase + vendedor actual.
//
// El vendedor NO se pide a la red en cada arranque: resolverVendorDaSessao()
// lee primero la copia de Dexie, así que a partir del segundo login la app
// sabe quién sos dentro del galpón, sin señal. Ese es el único orden que
// permite que la Golden Hour funcione en modo avión.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ `loading` TAMBIÉN CUBRE LA RESOLUCIÓN DEL VENDEDOR
// ══════════════════════════════════════════════════════════════════════════
// Porque si no, la app pasa por un estado que se ve cargado y no responde a
// nada. Casi todas las pantallas piden sus datos con
// `enabled: vendorName !== null`, y una query deshabilitada es `isPending`
// para TanStack Query. Con sesión resuelta y vendedor todavía nulo, Hoje
// pintaba tres esqueletos y el botón de la Golden Hour como un rectángulo
// gris pulsante: cero controles en pantalla. El dueño del producto lo
// describió exactamente así —«no puedo accionar ningún botón»— en su primer
// login, que es justo el único arranque en el que el vendedor NO está todavía
// en Dexie y hay que ir a buscarlo a la red.
//
// Y por eso mismo la resolución REINTENTA. Antes, un solo fallo —una respuesta
// vacía por un token que todavía no había llegado a PostgREST, un corte de 4G
// en el primer segundo— dejaba `vendor: null` para toda la vida de la página,
// sin mensaje y sin salida que no fuera recargar a mano.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Vendor } from '@/core'
import { resolverVendorDaSessao } from '@/data'
import { supabase } from '@/data/supabase'
import { SessionContext, type SessionContextValue } from './session-context'

/** Intentos extra tras el primero. Tres en total, ~2 s de ventana. */
const REINTENTOS = 2
/** Espera entre intentos. Corta: es un round-trip, no un backoff largo. */
const ESPERA_REINTENTO_MS = 900

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // El vendedor se guarda JUNTO al usuario que lo resolvió. Así, cuando la
  // sesión cambia, la identidad vieja se descarta EN RENDER —sin efecto, sin
  // setState en cascada y sin un frame mostrando la cartera de otro.
  const [resolvido, setResolvido] = useState<{ userId: string; vendor: Vendor | null } | null>(
    null,
  )
  // Arranca en true: hasta que sepamos si hay sesión, nadie decide nada.
  const [sessaoCarregando, setSessaoCarregando] = useState(true)
  // Cada incremento dispara un intento nuevo de resolución.
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let alive = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setSessaoCarregando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Resolución del vendedor a partir del usuario de auth. Se rehace sola
  // cuando la sesión cambia (login, refresh de token, logout).
  const userId = session?.user.id ?? null
  const vendor = resolvido !== null && resolvido.userId === userId ? resolvido.vendor : null

  /** Hay usuario pero todavía no hay veredicto sobre su vendedor. */
  const resolucaoPendente = userId !== null && (resolvido === null || resolvido.userId !== userId)

  useEffect(() => {
    if (userId === null) return
    let alive = true
    let timer = 0

    const tentar = (restantes: number): void => {
      void resolverVendorDaSessao(userId)
        .then((v) => {
          if (!alive) return
          // Una respuesta VACÍA no es un veredicto todavía: la causa más común
          // es que el token recién emitido aún no viaja en el pedido y RLS
          // devuelve cero filas sin error. Se reintenta antes de darla por
          // buena.
          if (v === null && restantes > 0) {
            timer = window.setTimeout(() => tentar(restantes - 1), ESPERA_REINTENTO_MS)
            return
          }
          setResolvido({ userId, vendor: v })
        })
        .catch(() => {
          if (!alive) return
          if (restantes > 0) {
            timer = window.setTimeout(() => tentar(restantes - 1), ESPERA_REINTENTO_MS)
            return
          }
          // Sin red y sin copia local no hay vendedor: la UI muestra el estado
          // de «sessão sem vendedor» en vez de romperse.
          setResolvido({ userId, vendor: null })
        })
    }

    tentar(REINTENTOS)

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [userId, tentativa])

  const revalidarVendor = useCallback(() => {
    setTentativa((n) => n + 1)
  }, [])

  // La vuelta de la red reintenta sola. Solo cuando falta el vendedor: con uno
  // ya resuelto, volver a pedirlo sería re-renderizar el árbol entero de gusto.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (userId === null || vendor !== null) return
    const aoVoltarARede = (): void => {
      setTentativa((n) => n + 1)
    }
    window.addEventListener('online', aoVoltarARede)
    return () => {
      window.removeEventListener('online', aoVoltarARede)
    }
  }, [userId, vendor])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const loading = sessaoCarregando || resolucaoPendente

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      vendor,
      vendorName: vendor?.name ?? null,
      isAdmin: vendor?.is_admin === true,
      loading,
      vendorAusente: !loading && session !== null && vendor === null,
      revalidarVendor,
      signOut,
    }),
    [session, vendor, loading, revalidarVendor, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
