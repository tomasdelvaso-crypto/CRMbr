// src/install/compartilhado.ts
// El lado App del share_target: leer lo que llegó por «Compartilhar».
//
// ══════════════════════════════════════════════════════════════════════════
// EL CAMINO COMPLETO
// ══════════════════════════════════════════════════════════════════════════
//  1. El vendedor comparte una foto del galpón, o el texto de un mail, o una
//     conversación de WhatsApp, y elige «Ventus».
//  2. Android hace un POST multipart contra /registrar (declarado en el
//     `share_target` del manifest, en vite.config.ts).
//  3. `src/sw.ts` intercepta ese POST —un POST no se puede responder con el
//     app-shell sin perder el cuerpo—, guarda el paquete en Cache Storage y
//     redirige a `/registrar?compartilhado=<id>`.
//  4. La pantalla Registrar llama a `consumirCompartilhamento()` en su
//     arranque y aparece con el texto y las fotos YA cargados.
//
// El paquete se consume una sola vez: se borra al leerlo y el parámetro se
// saca de la URL. Si no, una recarga volvería a precargar lo mismo encima de
// lo que la persona ya estaba escribiendo.

import {
  CACHE_COMPARTILHADO,
  HEADER_NOME,
  PARAM_COMPARTILHADO,
  prefixoDoId,
  urlDoArquivo,
  urlDoPacote,
  type PacoteCompartilhado,
} from './contrato-share'

export interface Compartilhamento {
  /** Título que mandó la app de origen. WhatsApp manda vacío. */
  titulo: string
  /** El texto compartido: lo que se va a registrar. */
  texto: string
  /** URL compartida, si la hubo. */
  url: string
  /** Fotos, audios o PDFs que vinieron con el share. */
  arquivos: File[]
}

/** ¿Hay algo? `null` si esta navegación no viene de un «Compartilhar». */
export function idCompartilhadoDaUrl(busca: string): string | null {
  try {
    const params = new URLSearchParams(busca)
    const id = params.get(PARAM_COMPARTILHADO)
    // Formato `<base36>-<azar>`: cualquier otra cosa es un parámetro pegado a
    // mano y no se usa para abrir el cache.
    return id && /^[0-9a-z]+-[0-9a-z]+$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** Lee el paquete sin borrarlo. Devuelve `null` si ya no está. */
export async function lerCompartilhamento(id: string): Promise<Compartilhamento | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(CACHE_COMPARTILHADO)
    const respostaPacote = await cache.match(urlDoPacote(id))
    if (!respostaPacote) return null

    const pacote = (await respostaPacote.json()) as PacoteCompartilhado
    const arquivos: File[] = []
    for (let i = 0; i < pacote.arquivos; i += 1) {
      const resposta = await cache.match(urlDoArquivo(id, i))
      if (!resposta) continue
      const blob = await resposta.blob()
      const bruto = resposta.headers.get(HEADER_NOME)
      let nome = `compartilhado-${i}`
      if (bruto) {
        try {
          nome = decodeURIComponent(bruto)
        } catch {
          // Nombre ilegible: se queda con el genérico y sigue.
        }
      }
      arquivos.push(new File([blob], nome, { type: blob.type }))
    }

    return {
      titulo: pacote.titulo ?? '',
      texto: pacote.texto ?? '',
      url: pacote.url ?? '',
      arquivos,
    }
  } catch {
    return null
  }
}

/** Borra el paquete del cache. Idempotente. */
export async function descartarCompartilhamento(id: string): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE_COMPARTILHADO)
    const prefixo = prefixoDoId(id)
    for (const chave of await cache.keys()) {
      if (new URL(chave.url).pathname.startsWith(prefixo)) await cache.delete(chave)
    }
  } catch {
    // Cache inaccesible: el barrido de las 24 h del SW lo limpia igual.
  }
}

/**
 * Lo que usa la pantalla Registrar: lee, borra y limpia la URL.
 *
 * @param busca `window.location.search` — se pasa por parámetro para que la
 *              función sea testeable sin tocar el objeto global.
 */
export async function consumirCompartilhamento(
  busca: string = typeof window === 'undefined' ? '' : window.location.search,
): Promise<Compartilhamento | null> {
  const id = idCompartilhadoDaUrl(busca)
  if (!id) return null

  const conteudo = await lerCompartilhamento(id)
  await descartarCompartilhamento(id)

  // El parámetro sale de la barra: una recarga no vuelve a precargar nada.
  if (typeof window !== 'undefined' && typeof history !== 'undefined') {
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete(PARAM_COMPARTILHADO)
      history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    } catch {
      // Sin History API no pasa nada grave: el paquete ya se borró.
    }
  }

  return conteudo
}
