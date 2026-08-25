// src/app/telas.tsx
// Las pantallas tal como las monta el router: las diferidas y el envoltorio
// que las espera.
//
// Vive aparte de routes.tsx por el fast refresh: un archivo que exporta
// componentes Y una constante (`routes`) deja de recargarse en caliente, y
// perder el HMR en el archivo de rutas es perder el HMR de toda la app. Acá
// SÓLO se exportan componentes; en routes.tsx SÓLO la tabla de rutas.

import { Suspense, lazy, type ReactNode } from 'react'
import { Skeleton, type SkeletonVariant } from '@/ui'

/* ── Una ruta, un chunk ────────────────────────────────────────────────── */
export const CarteiraScreen = lazy(() => import('@/screens/Carteira'))
export const DossieScreen = lazy(() => import('@/screens/Dossie'))
export const GoldenHourScreen = lazy(() => import('@/screens/GoldenHour'))
export const RegistrarScreen = lazy(() => import('@/screens/Registrar'))
export const RevisaoScreen = lazy(() => import('@/screens/Revisao'))
export const CadenciaScreen = lazy(() => import('@/screens/Cadencia'))
export const PlacarScreen = lazy(() => import('@/screens/Placar'))
export const RituaisScreen = lazy(() => import('@/screens/Rituais'))
export const VentusScreen = lazy(() => import('@/screens/Ventus'))
export const GestorScreen = lazy(() => import('@/screens/Gestor'))
export const AjustesScreen = lazy(() => import('@/screens/Ajustes'))
export const MaisScreen = lazy(() => import('@/screens/Mais'))
export const InstalarScreen = lazy(() => import('@/screens/Instalar'))
export const KitchenSink = lazy(() => import('@/screens/Kitchen/KitchenSink'))

export interface RotaLentaProps {
  /** La silueta con la que espera ESTA ruta, no una genérica. */
  variant: SkeletonVariant
  count?: number
  children: ReactNode
}

/**
 * Espera al chunk con la forma del contenido que viene. NUNCA un spinner: es
 * la misma silueta que la pantalla usa después mientras cargan sus datos, así
 * que el paso de «bajando el código» a «bajando los datos» no se ve.
 *
 * `data-rota-carregando` es la marca del fallback y sólo la lleva él: el smoke
 * test del router la usa para saber si está mirando la pantalla o el esqueleto.
 */
export function RotaLenta({ variant, count = 3, children }: RotaLentaProps) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-4" data-rota-carregando="">
          <Skeleton variant={variant} count={count} />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
