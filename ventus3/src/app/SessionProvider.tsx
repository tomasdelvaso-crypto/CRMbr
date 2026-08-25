// src/app/SessionProvider.tsx
// Sesión de Supabase + vendedor actual.
//
// El vendedor NO se pide a la red en cada arranque: resolverVendorDaSessao()
// lee primero la copia de Dexie, así que a partir del segundo login la app
// sabe quién sos dentro del galpón, sin señal. Ese es el único orden que
// permite que la Golden Hour funcione en modo avión.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Vendor } from '@/core'
import { resolverVendorDaSessao } from '@/data'
import { supabase } from '@/data/supabase'
import { SessionContext, type SessionContextValue } from './session-context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // El vendedor se guarda JUNTO al usuario que lo resolvió. Así, cuando la
  // sesión cambia, la identidad vieja se descarta EN RENDER —sin efecto, sin
  // setState en cascada y sin un frame mostrando la cartera de otro.
  const [resolvido, setResolvido] = useState<{ userId: string; vendor: Vendor | null } | null>(
    null,
  )
  // Arranca en true: hasta que sepamos si hay sesión, nadie decide nada.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
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

  useEffect(() => {
    if (!userId) return
    let alive = true
    void resolverVendorDaSessao(userId)
      .then((v) => {
        if (alive) setResolvido({ userId, vendor: v })
      })
      .catch(() => {
        // Sin red y sin copia local no hay vendedor: la UI muestra el estado
        // de «sessão sem vendedor» en vez de romperse.
        if (alive) setResolvido({ userId, vendor: null })
      })
    return () => {
      alive = false
    }
  }, [userId])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      vendor,
      vendorName: vendor?.name ?? null,
      isAdmin: vendor?.is_admin === true,
      loading,
      signOut,
    }),
    [session, vendor, loading, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
