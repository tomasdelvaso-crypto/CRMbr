// src/host/atalho.ts
// `addToHomeScreen()` — el camino de instalación que iOS le niega a la PWA.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO IMPORTA MÁS DE LO QUE PARECE
// ══════════════════════════════════════════════════════════════════════════
// En Android existe `beforeinstallprompt` y la PWA se instala con un tap. En
// Safari NO existe: hay que explicarle a la persona que toque Compartilhar →
// Adicionar à Tela de Início, y la mitad no lo hace. Sin instalar, en iOS no
// hay Web Push, no hay badge y no hay nada proactivo.
//
// Telegram tiene su propio `addToHomeScreen()`, que en Android crea el atajo
// de una y en iOS muestra la instrucción del propio cliente. Ese ícono en el
// home es la diferencia entre «uso diario» y «cuando me acuerdo».
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EN LA TERCERA SESIÓN Y NO EN LA PRIMERA
// ══════════════════════════════════════════════════════════════════════════
// Pedir instalar antes de que la app haya servido para algo es la forma más
// rápida de que la respuesta sea no — y en iOS, un «no» de instalación es
// además el momento en que la persona aprende a ignorar lo que le pedimos.
// A la tercera apertura ya vio su cartera, cerró una tarjeta y sabe qué está
// instalando. Y `checkHomeScreenStatus()` existe para que, si ya lo tiene o ya
// dijo que no, no se le vuelva a preguntar: insistir es el otro modo de
// perderlo.

import { chamar, ouvir, versaoPeloMenos, webApp } from './ponte-telegram'

/** Cuántas aperturas antes de ofrecer. Ver la nota del encabezado. */
export const SESSAO_DA_OFERTA = 3

const CHAVE_SESSOES = 'ventus.host.sessoes'
const CHAVE_OFERTA = 'ventus.host.atalho-ofertado'

/* ══════════════════════════════════════════════════════════════════════════
   Conteo de sesiones
   ══════════════════════════════════════════════════════════════════════════ */

let contadaNestaCarga = false

function lerNumero(chave: string): number {
  try {
    const bruto = localStorage.getItem(chave)
    const n = bruto === null ? 0 : Number(bruto)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

/**
 * Cuenta esta apertura. Idempotente por carga: en StrictMode los efectos
 * corren dos veces y sin este candado la «tercera sesión» llegaría en la
 * segunda apertura real.
 */
export function registrarSessao(): number {
  if (contadaNestaCarga) return lerNumero(CHAVE_SESSOES)
  contadaNestaCarga = true
  const proxima = lerNumero(CHAVE_SESSOES) + 1
  try {
    localStorage.setItem(CHAVE_SESSOES, String(proxima))
  } catch {
    // Sin storage nunca se llega a la tercera sesión y nunca se ofrece. Es el
    // fallo correcto: no ofrecer de más.
  }
  return proxima
}

export function sessoesContadas(): number {
  return lerNumero(CHAVE_SESSOES)
}

/** ¿Ya se le ofreció alguna vez? Se pregunta una sola vez en la vida. */
export function ofertaJaFeita(): boolean {
  try {
    return localStorage.getItem(CHAVE_OFERTA) !== null
  } catch {
    return false
  }
}

export function marcarOfertaFeita(): void {
  try {
    localStorage.setItem(CHAVE_OFERTA, new Date().toISOString())
  } catch {
    /* no-op */
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Estado del atajo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Los cuatro estados de `checkHomeScreenStatus`, más el nuestro:
 *   'unsupported' — el cliente de Telegram no sabe hacerlo
 *   'unknown'     — no se puede saber (iOS: Telegram no puede mirar el home)
 *   'added'       — ya está
 *   'missed'      — no está
 */
export type EstadoDoAtalho = 'nao_suportado' | 'desconhecido' | 'ja_tem' | 'nao_tem'

/** `checkHomeScreenStatus`, prometido y con timeout. Nunca cuelga la UI. */
export function estadoDoAtalho(timeoutMs = 1500): Promise<EstadoDoAtalho> {
  const app = webApp()
  if (app === null || typeof app.checkHomeScreenStatus !== 'function') {
    return Promise.resolve('nao_suportado')
  }
  return new Promise((resolver) => {
    let respondido = false
    const responder = (estado: EstadoDoAtalho): void => {
      if (respondido) return
      respondido = true
      resolver(estado)
    }
    const relogio = setTimeout(() => responder('desconhecido'), timeoutMs)
    try {
      app.checkHomeScreenStatus?.((status: string) => {
        clearTimeout(relogio)
        if (status === 'added') responder('ja_tem')
        else if (status === 'missed') responder('nao_tem')
        else if (status === 'unsupported') responder('nao_suportado')
        else responder('desconhecido')
      })
    } catch {
      clearTimeout(relogio)
      responder('nao_suportado')
    }
  })
}

/**
 * ¿Hay que ofrecerlo AHORA? Las cuatro condiciones tienen que darse todas:
 * cliente capaz, tercera sesión, nunca ofrecido, y no lo tiene ya.
 */
export async function deveOferecerAtalho(): Promise<boolean> {
  if (!versaoPeloMenos('8.0')) return false
  if (ofertaJaFeita()) return false
  if (sessoesContadas() < SESSAO_DA_OFERTA) return false
  const estado = await estadoDoAtalho()
  // 'desconhecido' es el caso de iOS: no se puede saber, y ahí sí se ofrece —
  // una vez. Por eso `marcarOfertaFeita()` es lo que impide la insistencia.
  return estado === 'nao_tem' || estado === 'desconhecido'
}

/**
 * Dispara el flujo nativo. Devuelve una promesa que resuelve `true` si el
 * cliente confirmó que se agregó. En iOS resuelve `false` casi siempre: el
 * cliente muestra la instrucción y no reporta el resultado. Eso NO es un
 * fallo, y por eso la oferta se marca como hecha pase lo que pase.
 */
export function oferecerAtalho(esperaMs = 30_000): Promise<boolean> {
  marcarOfertaFeita()
  if (!chamar('addToHomeScreen')) return Promise.resolve(false)
  return new Promise((resolver) => {
    let respondido = false
    const desligar = ouvir('homeScreenAdded', () => {
      if (respondido) return
      respondido = true
      desligar()
      resolver(true)
    })
    setTimeout(() => {
      if (respondido) return
      respondido = true
      desligar()
      resolver(false)
    }, esperaMs)
  })
}
