// src/screens/Registrar/gravacao.ts
// MediaRecorder de verdad: negociación de mimeType, permisos, contador de
// segundos y liberación del micrófono.
//
// ⚠️ NUNCA `webkitSpeechRecognition`. Pasa el feature detection (el objeto
// existe), pide permiso, y en una PWA standalone en iOS no emite jamás un
// evento `result`: falla EN SILENCIO. La transcripción la hace el servidor con
// Whisper sobre el blob, que además es lo único auditable después.
//
// La negociación no es paranoia:
//   · Chrome/Firefox/Android → audio/webm;codecs=opus (el mejor para Whisper)
//   · Safari iOS <= 18.3     → NO soporta webm en MediaRecorder. Solo mp4/AAC.
//     `isTypeSupported('audio/webm')` devuelve false ahí, y si se le pasa
//     igual, el constructor lanza NotSupportedError.
//   · Safari iOS >= 18.4     → ya acepta opus, así que el primer candidato
//     gana solo cuando corresponde. La lista se recorre en orden de calidad.
//   · Si NADA es soportado (o `isTypeSupported` ni existe, como en algunos
//     WebViews viejos de Android), se construye el recorder SIN opciones y se
//     lee `recorder.mimeType` después de arrancar: el navegador elige, y ese
//     es el valor que viaja al servidor.

import { useCallback, useEffect, useRef, useState } from 'react'

/** Candidatos en orden de preferencia para transcribir. */
export const MIMES_CANDIDATOS: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
]

/** Duración máxima de una nota. Más que esto es una reunión, no una nota. */
export const MAX_SEGUNDOS = 180

/** Por debajo de esto fue un toque accidental, no una nota. */
export const MIN_SEGUNDOS = 1

/** Bloques de 1s: si la app muere a mitad, lo grabado hasta ahí ya está. */
const INTERVALO_CHUNK_MS = 1000

export type EstadoGravacao =
  | 'ocioso'
  | 'permissao'
  | 'gravando'
  | 'finalizando'
  | 'erro'

export interface NotaGravada {
  blob: Blob
  /** El mimeType REAL con el que grabó, no el que pedimos. */
  mime: string
  duracaoSeg: number
}

export type MotivoErroGravacao =
  | 'sem_suporte'
  | 'sem_permissao'
  | 'sem_microfone'
  | 'curto'
  | 'vazio'
  | 'falhou'

export interface ErroGravacao {
  motivo: MotivoErroGravacao
  /** Ya en PT-BR, listo para el toast. */
  mensagem: string
}

/** ¿Este navegador puede grabar? Se chequea antes de pintar el botón. */
export function gravacaoDisponivel(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    'MediaRecorder' in window
  )
}

/**
 * Elige el mimeType. Devuelve `null` cuando hay que dejar decidir al navegador
 * —que NO es lo mismo que «no se puede grabar».
 *
 * `suporta` se inyecta para poder testear la matriz de navegadores sin tener
 * los navegadores.
 */
export function negociarMimeType(
  suporta: ((mime: string) => boolean) | null = obterIsTypeSupported(),
): string | null {
  if (!suporta) return null
  for (const mime of MIMES_CANDIDATOS) {
    try {
      if (suporta(mime)) return mime
    } catch {
      // Un WebView que lanza en isTypeSupported existe. Se sigue con el próximo.
    }
  }
  return null
}

function obterIsTypeSupported(): ((mime: string) => boolean) | null {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return null
  const ctor = window.MediaRecorder as unknown as {
    isTypeSupported?: (mime: string) => boolean
  }
  if (typeof ctor.isTypeSupported !== 'function') return null
  return (mime: string) => ctor.isTypeSupported?.(mime) ?? false
}

/** Traduce el error de getUserMedia al motivo que la UI sabe explicar. */
function classificarErroMidia(erro: unknown): ErroGravacao {
  const nome = erro instanceof Error ? erro.name : ''
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return {
      motivo: 'sem_permissao',
      mensagem: 'Sem permissão para o microfone. Libere nas configurações do navegador.',
    }
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return { motivo: 'sem_microfone', mensagem: 'Nenhum microfone encontrado neste aparelho.' }
  }
  return { motivo: 'falhou', mensagem: 'Não consegui gravar agora. Tente pelo teclado.' }
}

export interface OpcoesGravador {
  /** Se llama con la nota lista. Es donde la pantalla la guarda en IndexedDB. */
  aoTerminar: (nota: NotaGravada) => void
  aoFalhar: (erro: ErroGravacao) => void
}

export interface Gravador {
  estado: EstadoGravacao
  /** Segundos transcurridos, con un decimal de precisión interna. */
  segundos: number
  /** Stream vivo para el AnalyserNode del Waveform. null en reposo. */
  stream: MediaStream | null
  /** mimeType negociado, para mostrarlo en diagnóstico. */
  mime: string | null
  iniciar: () => void
  /** Cierra y entrega la nota. */
  parar: () => void
  /** Cierra y TIRA lo grabado. Sin preguntar: el gesto ya fue explícito. */
  cancelar: () => void
}

export function useGravador({ aoTerminar, aoFalhar }: OpcoesGravador): Gravador {
  const [estado, setEstado] = useState<EstadoGravacao>('ocioso')
  const [segundos, setSegundos] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [mime, setMime] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const inicioRef = useRef(0)
  const descartarRef = useRef(false)
  const tickRef = useRef<number | null>(null)
  // Los callbacks se guardan en refs: los handlers de MediaRecorder se atan
  // una sola vez y no pueden capturar un render viejo.
  const terminarRef = useRef(aoTerminar)
  const falharRef = useRef(aoFalhar)

  useEffect(() => {
    terminarRef.current = aoTerminar
    falharRef.current = aoFalhar
  })

  const limparTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const soltarMicrofone = useCallback(() => {
    const s = streamRef.current
    if (s) {
      for (const track of s.getTracks()) track.stop()
    }
    streamRef.current = null
    setStream(null)
  }, [])

  const parar = useCallback(() => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    setEstado('finalizando')
    limparTick()
    try {
      rec.stop()
    } catch {
      // Parar dos veces no es un error del vendedor.
      soltarMicrofone()
      setEstado('ocioso')
    }
  }, [limparTick, soltarMicrofone])

  const cancelar = useCallback(() => {
    descartarRef.current = true
    parar()
  }, [parar])

  const iniciar = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') return
    if (!gravacaoDisponivel()) {
      falharRef.current({
        motivo: 'sem_suporte',
        mensagem: 'Este navegador não grava áudio. Use o teclado.',
      })
      return
    }

    descartarRef.current = false
    pedacosRef.current = []
    setSegundos(0)
    setEstado('permissao')

    void (async () => {
      let midia: MediaStream
      try {
        midia = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
      } catch (erro) {
        setEstado('erro')
        falharRef.current(classificarErroMidia(erro))
        return
      }

      // El vendedor soltó el botón mientras el navegador pedía permiso.
      if (descartarRef.current) {
        for (const t of midia.getTracks()) t.stop()
        setEstado('ocioso')
        return
      }

      streamRef.current = midia
      setStream(midia)

      const escolhido = negociarMimeType()
      let rec: MediaRecorder
      try {
        rec = escolhido
          ? new MediaRecorder(midia, { mimeType: escolhido, audioBitsPerSecond: 64_000 })
          : new MediaRecorder(midia)
      } catch {
        // El mimeType pasó isTypeSupported pero el constructor lo rechazó.
        // Pasa en WebViews de Android con codecs recortados. Segundo intento
        // sin opciones: que elija el navegador.
        try {
          rec = new MediaRecorder(midia)
        } catch {
          soltarMicrofone()
          setEstado('erro')
          falharRef.current({
            motivo: 'sem_suporte',
            mensagem: 'Este aparelho não grava áudio. Use o teclado.',
          })
          return
        }
      }

      recorderRef.current = rec
      // El mimeType REAL: el navegador puede haber elegido otro.
      setMime(rec.mimeType || escolhido || 'audio/webm')

      rec.ondataavailable = (evento: BlobEvent) => {
        if (evento.data.size > 0) pedacosRef.current.push(evento.data)
      }

      rec.onerror = () => {
        limparTick()
        soltarMicrofone()
        recorderRef.current = null
        setEstado('erro')
        falharRef.current({ motivo: 'falhou', mensagem: 'A gravação falhou no meio.' })
      }

      rec.onstop = () => {
        limparTick()
        const duracao = (Date.now() - inicioRef.current) / 1000
        const tipo = rec.mimeType || escolhido || 'audio/webm'
        const pedacos = pedacosRef.current
        pedacosRef.current = []
        recorderRef.current = null
        soltarMicrofone()
        setEstado('ocioso')
        setSegundos(0)

        if (descartarRef.current) return

        const blob = new Blob(pedacos, { type: tipo })
        if (blob.size === 0) {
          falharRef.current({ motivo: 'vazio', mensagem: 'O áudio saiu vazio. Tente de novo.' })
          return
        }
        if (duracao < MIN_SEGUNDOS) {
          falharRef.current({
            motivo: 'curto',
            mensagem: 'Segure o botão e fale. Solte quando terminar.',
          })
          return
        }
        terminarRef.current({ blob, mime: tipo, duracaoSeg: Math.round(duracao * 10) / 10 })
      }

      inicioRef.current = Date.now()
      rec.start(INTERVALO_CHUNK_MS)
      setEstado('gravando')

      tickRef.current = window.setInterval(() => {
        const t = (Date.now() - inicioRef.current) / 1000
        setSegundos(t)
        // Corte duro: el vendedor dejó el botón trabado y se fue a almorzar.
        if (t >= MAX_SEGUNDOS) {
          const atual = recorderRef.current
          if (atual && atual.state === 'recording') {
            limparTick()
            setEstado('finalizando')
            atual.stop()
          }
        }
      }, 100)
    })()
  }, [limparTick, soltarMicrofone])

  // Desmontar la pantalla en medio de una grabación no puede dejar el LED del
  // micrófono prendido: se descarta y se sueltan las pistas.
  useEffect(() => {
    return () => {
      descartarRef.current = true
      limparTick()
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop()
        } catch {
          /* ya estaba cerrado */
        }
      }
      const s = streamRef.current
      if (s) {
        for (const t of s.getTracks()) t.stop()
      }
      streamRef.current = null
    }
  }, [limparTick])

  return { estado, segundos, stream, mime, iniciar, parar, cancelar }
}

/** '0:07' — el contador tiene que ser legible de reojo mientras se habla. */
export function formatarSegundos(total: number): string {
  const seg = Math.max(0, Math.floor(total))
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${String(m)}:${s.toString().padStart(2, '0')}`
}
