// api/_lib/multipart.ts
// Parser mínimo de multipart/form-data. Dos campos (`meta` y `arquivo`) no
// justifican traer `busboy` con sus dependencias a un bundle serverless que
// arranca en frío en cada invocación.
//
// El audio viaja como multipart y NUNCA como base64 dentro de un JSON: un
// minuto de opus son ~120 kB, en base64 son 160 kB, y hay que materializar la
// cadena entera en memoria en un teléfono que ya está grabando (contrato.ts
// de la tela Registrar, punto 1).
//
// Se trabaja sobre Buffer, no sobre string: convertir el cuerpo a UTF-8 para
// buscar el boundary corrompe los bytes del audio.

import { HttpError, header } from './http.js'
import type { ApiRequest } from './http.js'

export interface ParteMultipart {
  nome: string
  nomeDeArquivo: string | null
  contentType: string | null
  conteudo: Buffer
}

/** Extrae el boundary del Content-Type. */
export function boundaryDoContentType(contentType: string | undefined): string | null {
  if (!contentType) return null
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const bruto = m?.[1] ?? m?.[2]
  return bruto ? bruto.trim() : null
}

function cabecalhosDaParte(bloco: Buffer): Record<string, string> {
  const cabecalhos: Record<string, string> = {}
  for (const linha of bloco.toString('utf8').split('\r\n')) {
    const corte = linha.indexOf(':')
    if (corte <= 0) continue
    cabecalhos[linha.slice(0, corte).trim().toLowerCase()] = linha.slice(corte + 1).trim()
  }
  return cabecalhos
}

/** Divide un Buffer por un separador, sin pasar por string. */
function dividir(buf: Buffer, separador: Buffer): Buffer[] {
  const partes: Buffer[] = []
  let inicio = 0
  for (;;) {
    const corte = buf.indexOf(separador, inicio)
    if (corte === -1) {
      partes.push(buf.subarray(inicio))
      return partes
    }
    partes.push(buf.subarray(inicio, corte))
    inicio = corte + separador.length
  }
}

export function parseMultipart(corpo: Buffer, boundary: string): ParteMultipart[] {
  const separador = Buffer.from(`--${boundary}`)
  const blocos = dividir(corpo, separador)
  const partes: ParteMultipart[] = []

  for (const bloco of blocos) {
    // El primer trozo es el preámbulo y el último es `--\r\n`: los dos se
    // reconocen porque no empiezan con CRLF seguido de cabeceras.
    if (bloco.length < 4) continue
    let cuerpo = bloco
    if (cuerpo.subarray(0, 2).toString('latin1') === '\r\n') cuerpo = cuerpo.subarray(2)
    if (cuerpo.subarray(0, 2).toString('latin1') === '--') continue

    const corte = cuerpo.indexOf('\r\n\r\n')
    if (corte === -1) continue

    const cabecalhos = cabecalhosDaParte(cuerpo.subarray(0, corte))
    let conteudo = cuerpo.subarray(corte + 4)
    // El CRLF final pertenece al delimitador, no al contenido.
    if (conteudo.subarray(-2).toString('latin1') === '\r\n') conteudo = conteudo.subarray(0, -2)

    const disposicao = cabecalhos['content-disposition'] ?? ''
    const nome = /name="([^"]*)"/i.exec(disposicao)?.[1]
    if (!nome) continue

    partes.push({
      nome,
      nomeDeArquivo: /filename="([^"]*)"/i.exec(disposicao)?.[1] ?? null,
      contentType: cabecalhos['content-type'] ?? null,
      conteudo,
    })
  }

  return partes
}

export interface FormularioLido {
  campos: Map<string, ParteMultipart>
  /** true si el pedido venía como multipart; false si era JSON puro. */
  ehMultipart: boolean
  /** El cuerpo crudo, cuando NO era multipart. */
  bruto: Buffer
}

/**
 * Lee el cuerpo y, si es multipart, lo parsea. Si no lo es, devuelve el crudo
 * para que el endpoint lo trate como JSON: la tela Registrar manda multipart
 * cuando hay audio y JSON cuando el vendedor pegó un texto.
 */
export async function lerFormulario(
  req: ApiRequest,
  lerCorpo: (req: ApiRequest) => Promise<Buffer>,
): Promise<FormularioLido> {
  const contentType = header(req, 'content-type')
  const boundary = boundaryDoContentType(contentType)

  if (!boundary) {
    return { campos: new Map(), ehMultipart: false, bruto: await lerCorpo(req) }
  }

  const corpo = await lerCorpo(req)
  if (corpo.length === 0) {
    throw new HttpError(400, 'pedido_invalido', 'O pedido chegou vazio.')
  }

  const campos = new Map<string, ParteMultipart>()
  for (const parte of parseMultipart(corpo, boundary)) campos.set(parte.nome, parte)
  return { campos, ehMultipart: true, bruto: corpo }
}
