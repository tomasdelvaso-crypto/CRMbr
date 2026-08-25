// src/host/nuvem.ts
// Respaldo de borradores largos en el CloudStorage de Telegram.
//
// ══════════════════════════════════════════════════════════════════════════
// QUÉ PROBLEMA RESUELVE
// ══════════════════════════════════════════════════════════════════════════
// Dentro de Telegram, un bottom sheet se cierra con un gesto que el vendedor
// hace sin querer diez veces por día — y con él se va lo que estaba
// escribiendo. En la PWA eso se resuelve con Dexie; en el Mini App también,
// pero Dexie vive en el origen del WebView y algunos clientes de Telegram lo
// limpian entre sesiones. El CloudStorage lo guarda Telegram del lado del
// servidor y sobrevive incluso a cambiar de teléfono.
//
// ══════════════════════════════════════════════════════════════════════════
// LOS LÍMITES SON DE TELEGRAM, NO NUESTROS
// ══════════════════════════════════════════════════════════════════════════
//   · clave: 1-128 caracteres de [A-Za-z0-9_]
//   · valor: hasta 4096 bytes
//   · hasta 1024 claves por usuario
// Un borrador de una nota dictada puede pasarse de 4096. Se guarda el
// PRINCIPIO y se marca como recortado: media nota es mucho mejor que ninguna,
// y perder el final en silencio sería peor que las dos cosas.
//
// FUERA DE TELEGRAM esto cae a `localStorage` con el mismo prefijo, así que la
// pantalla que lo use funciona igual en la PWA y no tiene que preguntarse
// dónde está corriendo.

import { chamarEm, webApp } from './ponte-telegram'
import type { CloudStorageTelegram } from './ponte-telegram'

/** Prefijo de todas nuestras claves. Evita chocar con otro Mini App del bot. */
const PREFIXO = 'ventus_rasc_'

/** Techo de Telegram. Se cuenta en bytes UTF-8, no en caracteres. */
const MAX_BYTES = 4096

/** Marca al final de un borrador recortado. El vendedor tiene que verla. */
export const MARCA_DE_CORTE = '\n…(recortado)'

function chaveValida(bruta: string): string {
  const limpa = `${PREFIXO}${bruta}`.replace(/[^A-Za-z0-9_]/g, '_')
  return limpa.slice(0, 128)
}

/** Recorta a 4096 bytes sin partir un carácter multibyte por la mitad. */
export function recortarParaNuvem(texto: string): { valor: string; recortado: boolean } {
  const codificador = new TextEncoder()
  if (codificador.encode(texto).length <= MAX_BYTES) return { valor: texto, recortado: false }

  const reserva = codificador.encode(MARCA_DE_CORTE).length
  let corte = texto.length
  while (corte > 0 && codificador.encode(texto.slice(0, corte)).length > MAX_BYTES - reserva) {
    // Bisección barata: el texto de una nota no pasa de unos pocos kB.
    corte = Math.floor(corte * 0.9)
  }
  return { valor: `${texto.slice(0, corte)}${MARCA_DE_CORTE}`, recortado: true }
}

/* ══════════════════════════════════════════════════════════════════════════
   Telegram
   ══════════════════════════════════════════════════════════════════════════ */

function cloud(): CloudStorageTelegram | null {
  const cs = webApp()?.CloudStorage
  return cs !== undefined && typeof cs.setItem === 'function' ? cs : null
}

/** ¿Hay CloudStorage de verdad en este cliente? */
export function temNuvem(): boolean {
  return cloud() !== null
}

function guardarNaNuvem(chave: string, valor: string): Promise<boolean> {
  const cs = cloud()
  if (cs === null) return Promise.resolve(false)
  return new Promise((resolver) => {
    const ok = chamarEm(cs, 'setItem', chave, valor, (erro: string | null) => {
      if (erro !== null) console.error('[host/nuvem] setItem:', erro)
      resolver(erro === null)
    })
    if (!ok) resolver(false)
  })
}

function lerDaNuvem(chave: string): Promise<string | null> {
  const cs = cloud()
  if (cs === null || typeof cs.getItem !== 'function') return Promise.resolve(null)
  return new Promise((resolver) => {
    const ok = chamarEm(cs, 'getItem', chave, (erro: string | null, valor?: string) => {
      resolver(erro === null && typeof valor === 'string' && valor !== '' ? valor : null)
    })
    if (!ok) resolver(null)
  })
}

function apagarDaNuvem(chave: string): Promise<void> {
  const cs = cloud()
  if (cs === null || typeof cs.removeItem !== 'function') return Promise.resolve()
  return new Promise((resolver) => {
    const ok = chamarEm(cs, 'removeItem', chave, () => resolver())
    if (!ok) resolver()
  })
}

/* ══════════════════════════════════════════════════════════════════════════
   Respaldo local
   ══════════════════════════════════════════════════════════════════════════ */

function guardarLocal(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // Modo privado o cuota llena: el borrador vive mientras viva la pantalla.
  }
}

function lerLocal(chave: string): string | null {
  try {
    const valor = localStorage.getItem(chave)
    return valor === null || valor === '' ? null : valor
  } catch {
    return null
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   API
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Guarda un borrador. Escribe en los DOS lados cuando hay nube: la copia local
 * responde en el mismo frame y la de la nube sobrevive al aparato.
 */
export async function salvarRascunho(nome: string, texto: string): Promise<void> {
  const chave = chaveValida(nome)
  if (texto.trim() === '') {
    await apagarRascunho(nome)
    return
  }
  const { valor } = recortarParaNuvem(texto)
  guardarLocal(chave, valor)
  await guardarNaNuvem(chave, valor)
}

/** Devuelve el borrador. Prefiere la nube: puede venir de otro aparato. */
export async function lerRascunho(nome: string): Promise<string | null> {
  const chave = chaveValida(nome)
  const daNuvem = await lerDaNuvem(chave)
  if (daNuvem !== null) return daNuvem
  return lerLocal(chave)
}

/** Borra el borrador en los dos lados. Se llama al confirmar el registro. */
export async function apagarRascunho(nome: string): Promise<void> {
  const chave = chaveValida(nome)
  try {
    localStorage.removeItem(chave)
  } catch {
    /* no-op */
  }
  await apagarDaNuvem(chave)
}
