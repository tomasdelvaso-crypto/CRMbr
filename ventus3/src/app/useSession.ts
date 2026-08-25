// src/app/useSession.ts — hook separado del provider para no romper fast refresh.
import { useContext } from 'react'
import { SessionContext, type SessionContextValue } from './session-context'

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession precisa estar dentro de <SessionProvider>')
  return ctx
}
