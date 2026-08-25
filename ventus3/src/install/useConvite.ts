// src/install/useConvite.ts
// El hook que junta las tres piezas: dónde estamos (deteccao), qué se puede
// ofrecer (prompt-android) y cuándo conviene ofrecerlo (momento).

import { useCallback, useEffect, useState } from 'react'
import {
  detectarNavegador,
  detectarPlataforma,
  ehSafariDeIOS,
  estaInstalado,
  observarModo,
  type Navegador,
  type Plataforma,
} from './deteccao'
import {
  deveOferecer,
  esperaAteOferecer,
  guardarMemoria,
  leerMemoria,
  registrarDispensa,
  registrarSessao,
  rotaAceitaConvite,
} from './momento'
import { dispararPromptNativo, observarPrompt, temPromptNativo } from './prompt-android'

/** Qué invitación corresponde mostrar. */
export type TipoDeConvite =
  /** Android/desktop con diálogo nativo listo. */
  | 'nativo'
  /** iOS + Safari: coaching de Compartilhar → Adicionar à Tela de Início. */
  | 'ios-safari'
  /** iOS fuera de Safari: primero hay que abrir Safari. */
  | 'ios-outro-navegador'
  /** No hay nada que ofrecer. */
  | 'nenhum'

export interface EstadoDoConvite {
  /** El sheet está abierto. */
  aberto: boolean
  tipo: TipoDeConvite
  plataforma: Plataforma
  navegador: Navegador
  instalado: boolean
  /** Dispara el diálogo nativo. Sólo desde un tap. */
  instalar: () => Promise<void>
  /** «Agora não»: cierra y anota el descarte. */
  dispensar: () => void
  /** Cierra sin anotar (la persona ya siguió el camino, ej. tocó «Ver como»). */
  fechar: () => void
}

/** El arranque de esta sesión. Módulo, no estado: no cambia con los renders. */
const INICIO_DA_SESSAO = Date.now()

function segundosNaSessao(): number {
  return (Date.now() - INICIO_DA_SESSAO) / 1000
}

function tipoDeConvite(instaladoAgora: boolean): TipoDeConvite {
  if (instaladoAgora) return 'nenhum'
  if (temPromptNativo()) return 'nativo'
  if (detectarPlataforma() === 'ios') {
    return ehSafariDeIOS() ? 'ios-safari' : 'ios-outro-navegador'
  }
  return 'nenhum'
}

/**
 * Decide si —y cuándo— mostrar la invitación de instalación.
 *
 * La sesión se cuenta UNA vez por montaje (el efecto sin dependencias corre
 * una sola vez por vida de la app; en StrictMode corre dos, y por eso
 * `registrarSessao` mira el reloj y no un contador ciego).
 */
export function useConvite(): EstadoDoConvite {
  const [aberto, setAberto] = useState(false)
  const [instalado, setInstalado] = useState(estaInstalado)
  const [plataforma] = useState<Plataforma>(detectarPlataforma)
  const [navegador] = useState<Navegador>(detectarNavegador)
  // Se re-evalúa cuando llega (o se gasta) el `beforeinstallprompt`.
  const [versaoDoPrompt, setVersaoDoPrompt] = useState(0)

  // Modo de visualización: instalar la app puede cambiarlo sin recargar.
  useEffect(() => observarModo(() => setInstalado(estaInstalado())), [])
  useEffect(() => observarPrompt(() => setVersaoDoPrompt((v) => v + 1)), [])

  // Cuenta la sesión al arrancar.
  useEffect(() => {
    guardarMemoria(registrarSessao(leerMemoria(), Date.now()))
  }, [])

  const tipo = tipoDeConvite(instalado)

  // El temporizador: espera a que se cumplan los 90 s y recién ahí abre.
  useEffect(() => {
    if (instalado || tipo === 'nenhum' || aberto) return
    const ctx = {
      segundosNaSessao: segundosNaSessao(),
      temOQueOferecer: true,
      instalado: false,
    }
    const espera = esperaAteOferecer(leerMemoria(), Date.now(), ctx)
    if (espera === null) return

    const id = window.setTimeout(() => {
      // La ruta se lee en el momento de abrir, no al plantear el timer: en 90
      // segundos el vendedor pudo entrar a la Golden Hour.
      if (!rotaAceitaConvite(window.location.pathname)) return
      const agora = Date.now()
      const listo = deveOferecer(leerMemoria(), agora, {
        segundosNaSessao: segundosNaSessao(),
        temOQueOferecer: true,
        instalado: estaInstalado(),
      })
      if (listo) setAberto(true)
    }, espera)

    return () => window.clearTimeout(id)
    // `versaoDoPrompt` está en las dependencias a propósito: si el evento de
    // Chrome llega tarde, el temporizador se replantea con él ya disponible.
  }, [instalado, tipo, aberto, versaoDoPrompt])

  const instalar = useCallback(async () => {
    const aceitou = await dispararPromptNativo()
    setAberto(false)
    if (!aceitou) {
      // Un «no» al diálogo nativo también es un «no»: se anota, para no
      // volver a aparecer la semana que viene.
      guardarMemoria(registrarDispensa(leerMemoria(), Date.now()))
    }
  }, [])

  const dispensar = useCallback(() => {
    setAberto(false)
    guardarMemoria(registrarDispensa(leerMemoria(), Date.now()))
  }, [])

  const fechar = useCallback(() => setAberto(false), [])

  return { aberto, tipo, plataforma, navegador, instalado, instalar, dispensar, fechar }
}
