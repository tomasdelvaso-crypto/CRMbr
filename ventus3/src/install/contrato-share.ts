// src/install/contrato-share.ts
// El contrato del share_target, compartido por el service worker y la app.
//
// Vive aparte porque es el ÚNICO módulo que importan los dos lados: `src/sw.ts`
// se compila con `tsconfig.worker.json` (lib WebWorker, sin DOM) y la app con
// `tsconfig.json` (lib DOM). Todo lo que esté acá adentro tiene que ser válido
// en los dos: constantes y funciones puras sobre strings, nada más.

/** Cache Storage donde el SW deja lo que llegó por «Compartilhar». */
export const CACHE_COMPARTILHADO = 'ventus-compartilhado-v1'

/** Nombre del campo de archivos declarado en el `share_target` del manifest. */
export const CAMPO_ARQUIVOS = 'arquivos'

/** Parámetro con el que el SW redirige a /registrar. */
export const PARAM_COMPARTILHADO = 'compartilhado'

/**
 * Header donde viaja el nombre original del archivo.
 * El nombre no sobrevive a `new Response(file)`: hay que guardarlo aparte.
 */
export const HEADER_NOME = 'x-ventus-nome'

/** Clave interna del paquete de metadatos (título, texto, url, cantidad). */
export function urlDoPacote(id: string): string {
  return `/__compartilhado/${id}/pacote.json`
}

/** Clave interna de cada archivo del paquete. */
export function urlDoArquivo(id: string, indice: number): string {
  return `/__compartilhado/${id}/arquivo/${indice}`
}

/** Prefijo común de todo lo que pertenece a un id. */
export function prefixoDoId(id: string): string {
  return `/__compartilhado/${id}/`
}

/**
 * Id de un paquete: `<timestamp base36>-<azar>`.
 * El timestamp va adelante y legible a propósito: es lo que permite barrer
 * los paquetes viejos sin abrir cada JSON.
 */
export function novoId(agora: number, azar: string): string {
  return `${agora.toString(36)}-${azar}`
}

/** Milisegundos del id, o null si el string no tiene la forma esperada. */
export function instanteDoId(id: string): number | null {
  const [ts] = id.split('-')
  if (!ts) return null
  const ms = Number.parseInt(ts, 36)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/** Un paquete compartido caduca en 24 h: es un traspaso, no un almacén. */
export const VALIDADE_COMPARTILHADO_MS = 24 * 60 * 60 * 1000

/** Metadatos de texto del paquete, tal como se serializan en el cache. */
export interface PacoteCompartilhado {
  /** Título que mandó la app de origen (WhatsApp manda vacío). */
  titulo: string
  /** El texto compartido. Es lo que el vendedor quiere registrar. */
  texto: string
  /** URL compartida, si la hubo. */
  url: string
  /** Cuántos archivos hay en el paquete. */
  arquivos: number
  /** Cuándo llegó, en ms. */
  criadoEm: number
}
