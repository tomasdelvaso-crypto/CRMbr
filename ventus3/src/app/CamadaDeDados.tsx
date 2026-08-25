// src/app/CamadaDeDados.tsx
// Enciende la capa de datos offline (sync incremental, outbox y realtime) para
// el vendedor de la sesión, y la apaga cuando cambia o al desmontar.
//
// Vive en un componente aparte y no dentro de SessionProvider porque necesita
// el QueryClient del contexto: el provider de sesión está POR ENCIMA del
// consumidor de queries y no puede leerlo.
//
// Sin vendedor no se enciende nada: sync y outbox filtran por nombre de
// vendedor, y arrancarlos con null bajaría la cartera de otra persona.

import { useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { montarCamadaDeDados } from '@/data'
import { useSession } from './useSession'

export function CamadaDeDados({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { vendorName } = useSession()

  useEffect(() => {
    if (!vendorName) return
    return montarCamadaDeDados(queryClient, vendorName)
  }, [queryClient, vendorName])

  return <>{children}</>
}
