// src/screens/Instalar/plataforma.ts
// Detección de plataforma y el prompt de instalación de Android.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO NO ES UN DETALLE
// ══════════════════════════════════════════════════════════════════════════
// La instalación es DISTINTA en cada plataforma y no hay un camino común:
//   · Android/Chrome dispara `beforeinstallprompt`, que hay que CAPTURAR y
//     guardar — si no se llama a `preventDefault()`, Chrome muestra su propio
//     mini-infobar y el evento se pierde. Y sólo se puede usar UNA vez.
//   · iOS/Safari no tiene ningún evento: la única vía es Compartilhar →
//     Adicionar à Tela de Início, a mano. Y sin ese paso NO HAY PUSH en iOS:
//     no es una mejora, es el requisito.
//   · Un teléfono que ya tiene la app instalada no puede volver a instalarla,
//     y ofrecérselo es la forma más rápida de que deje de creerle a la
//     pantalla.
//
// Por eso la pantalla pregunta primero dónde está parada y recién después
// decide qué mostrar.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import {
  detectarPlataforma as detectarPlataformaDoAparelho,
  estaInstalado,
  observarModo,
} from '@/install/deteccao'
import {
  dispararPromptNativo,
  foiInstaladoNestaSessao,
  observarPrompt,
  temPromptNativo,
} from '@/install/prompt-android'

export type Plataforma = 'ios' | 'android' | 'desktop'

// ══════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN: ESTA PANTALLA YA NO ESCUCHA `beforeinstallprompt`
// ══════════════════════════════════════════════════════════════════════════
// Antes registraba su propio listener en un `useEffect`, y ése es justo el
// error que deja el botón gris en el teléfono de verdad: Chrome dispara el
// evento UNA vez y casi siempre antes de que React monte, así que la pantalla
// llegaba tarde. El evento lo captura ahora `@/install/prompt-android`, un
// singleton de módulo que se instala en el primer tick del bundle (lo importa
// `CamadaPWA` desde `App.tsx`), y esta pantalla sólo lo lee.
//
// La detección de plataforma y de «ya está instalado» también sale de
// `@/install/deteccao`: había tres copias en el árbol y ninguna miraba la TWA.
// Se importan los módulos sueltos, no el barril `@/install`, para no arrastrar
// los componentes del convite al chunk de esta pantalla.

export function detectarPlataforma(): Plataforma {
  return detectarPlataformaDoAparelho()
}

/** ¿La app ya está corriendo instalada (standalone, TWA o Mini App)? */
export function jaInstalado(): boolean {
  return estaInstalado()
}

export interface EstadoDeInstalacao {
  plataforma: Plataforma
  instalado: boolean
  /** true cuando Chrome ya nos dio el evento y hay algo que ofrecer. */
  podeInstalar: boolean
  /** Dispara el diálogo nativo. Devuelve si la persona aceptó. */
  instalar: () => Promise<boolean>
}

/**
 * Expone el estado de instalación de este aparato.
 *
 * `instalar()` SÓLO puede llamarse desde un tap: Chrome exige gesto del
 * usuario y, sin él, la promesa se rechaza en silencio.
 */
export function useInstalacao(): EstadoDeInstalacao {
  const [plataforma] = useState<Plataforma>(detectarPlataforma)
  const [instalado, setInstalado] = useState<boolean>(
    () => jaInstalado() || foiInstaladoNestaSessao(),
  )

  // El prompt vive fuera de React: `useSyncExternalStore` es la lectura
  // correcta —un useState se quedaría con la foto del primer render y el
  // botón no se encendería cuando Chrome entrega el evento tarde.
  const podeInstalar = useSyncExternalStore(observarPrompt, temPromptNativo, () => false)

  useEffect(() => {
    // El modo de visualización cambia sin recargar: abrir desde el ícono de la
    // pantalla de inicio con la pestaña todavía viva.
    const soltar = observarModo(() => {
      setInstalado(jaInstalado() || foiInstaladoNestaSessao())
    })
    const aoInstalar = () => {
      setInstalado(true)
    }
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      soltar()
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  const instalar = useCallback(async (): Promise<boolean> => {
    const aceitou = await dispararPromptNativo()
    if (aceitou) setInstalado(true)
    return aceitou
  }, [])

  return { plataforma, instalado, podeInstalar, instalar }
}

/**
 * De dónde se baja el APK.
 *
 * Es una variable de entorno porque el archivo NO vive en este sitio: el
 * workflow `.github/workflows/apk.yml` compila la TWA con Bubblewrap y publica
 * `ventus.apk` en una GitHub Release (el `android/dist/` local está
 * gitignoreado a propósito — un APK firmado no se versiona).
 *
 * `null` cuando la variable no está: entonces el botón NO se muestra. Antes
 * caía a `/ventus.apk`, una ruta que en este sitio devuelve el index.html
 * —por el rewrite de SPA del vercel.json— y el vendedor se quedaba mirando una
 * descarga que nunca aparecía. Un botón ausente se entiende; uno que no hace
 * nada, no.
 */
export const URL_DO_APK: string | null = import.meta.env.VITE_APK_URL ?? null

/** La URL que se codifica en el QR: esta misma página, en el origen actual. */
export function urlDaPagina(): string {
  if (typeof window === 'undefined') return 'https://ventus.ventapel.com.br/instalar'
  return `${window.location.origin}/instalar`
}
