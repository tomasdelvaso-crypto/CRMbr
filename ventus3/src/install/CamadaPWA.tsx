// src/install/CamadaPWA.tsx
// Lo que convierte una web en una app instalada, montado una sola vez.
//
// Dos responsabilidades, las dos invisibles cuando no hacen falta:
//
//  1. LA INVITACIÓN A INSTALAR, en el momento que `useConvite` juzga decente
//     (tercera sesión, 90 s adentro, fuera de la Golden Hour).
//  2. EL AVISO DE VERSIÓN NUEVA, como toast con acción. Nunca una recarga
//     automática: ver el encabezado de src/install/atualizacao.ts.
//
// Se monta en `App.tsx`, fuera del router: no navega ni depende de la ruta
// activa (la lee de `window.location` cuando le hace falta), así que no tiene
// por qué re-renderizar con cada cambio de pantalla.

import { useEffect } from 'react'
import { toast } from '@/ui'
import { ConviteDeInstalacao } from './ConviteDeInstalacao'
import { useConvite } from './useConvite'
import {
  agendarChecagens,
  aplicarAtualizacao,
  atenderNovaVersao,
  deveReoferecer,
  observarAtualizacao,
  temAtualizacaoEsperando,
} from './atualizacao'

/** Id fijo: si el aviso se repite, reemplaza al anterior en vez de apilarse. */
const ID_TOAST_ATUALIZACAO = 'ventus-atualizacao'

/**
 * Ocho horas. No es «para siempre» —el toast tiene su X— pero sí más que una
 * jornada de calle: el aviso tiene que seguir ahí cuando el vendedor vuelve
 * al teléfono, no haberse ido mientras manejaba.
 */
const DURACAO_TOAST_MS = 8 * 60 * 60 * 1000

export function CamadaPWA() {
  const convite = useConvite()

  useEffect(() => {
    const avisar = (): void => {
      toast({
        id: ID_TOAST_ATUALIZACAO,
        message: 'Nova versão disponível.',
        tone: 'info',
        durationMs: DURACAO_TOAST_MS,
        undoLabel: 'Atualizar',
        undo: () => {
          void aplicarAtualizacao()
        },
      })
    }

    const pararDeObservar = observarAtualizacao(avisar)
    const pararChecagens = agendarChecagens()

    // Si la persona cerró el toast y sigue habiendo versión esperando, se
    // vuelve a ofrecer cuando regresa a la app — pero NO cada vez que mira el
    // teléfono: sólo después de media hora. Un aviso que aparece cinco veces
    // por hora es un aviso que se aprende a ignorar, y así es como un teléfono
    // termina corriendo el bundle de la semana pasada.
    const aoVoltar = (): void => {
      if (document.visibilityState !== 'visible') return
      if (!deveReoferecer()) return
      void temAtualizacaoEsperando().then((tem) => {
        if (tem) atenderNovaVersao(avisar)
      })
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      pararDeObservar()
      pararChecagens()
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  return <ConviteDeInstalacao {...convite} />
}
