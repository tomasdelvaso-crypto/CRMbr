// src/screens/GoldenHour/useNotaDeVoz.ts
// Nota de voz de 15 segundos entre un contacto y el siguiente.
//
// Decisión de producto que hay que respetar al pie: el audio se GUARDA
// durante la hora y se TRANSCRIBE después. Mandar el blob a Whisper en el
// momento significa esperar red, ver un spinner y perder el hilo justo cuando
// el vendedor tenía que estar marcando el número siguiente. El blob queda en
// Dexie con estado 'gravado' y `audiosPendentes()` lo levanta al cerrar la
// hora. Offline es el caso normal, no el excepcional.
//
// El límite duro de 15s no es adorno: obliga a decir la única cosa que pasó
// («o comprador pediu preço por caixa»), que es lo que después sirve.

import { useCallback, useEffect, useRef, useState } from 'react'
import { agora, guardarAudio, novoClientUuid } from '@/data'

export const LIMITE_SEGUNDOS = 15

/** Candidatos en orden de preferencia. iOS ≤18.3 solo tiene audio/mp4. */
const MIMES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function escolherMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const m of MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return undefined
}

export type EstadoGravacao = 'ocioso' | 'gravando' | 'salvando' | 'negado' | 'indisponivel'

export interface NotaDeVoz {
  estado: EstadoGravacao
  /** 0..1 sobre los 15 segundos, para la barrita del botón. */
  progresso: number
  stream: MediaStream | null
  comecar: () => void
  parar: () => void
}

export interface OpcoesNotaDeVoz {
  vendor: string
  /** Lead al que se adjunta la nota. Null = nota suelta de la hora. */
  leadId: number | null
  /** Recibe el client_uuid del audio guardado. */
  onGravada: (clientUuid: string) => void
}

/**
 * Graba, corta a los 15s y guarda el blob en Dexie. Nunca lanza: si no hay
 * micrófono o el permiso está denegado, devuelve el estado y la pantalla
 * esconde el botón. La hora no se puede caer por una nota de voz.
 */
export function useNotaDeVoz({ vendor, leadId, onGravada }: OpcoesNotaDeVoz): NotaDeVoz {
  const [estado, setEstado] = useState<EstadoGravacao>('ocioso')
  const [progresso, setProgresso] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const inicioRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const vivoRef = useRef(true)
  // El callback y el lead cambian con el carrusel; el recorder ya está en
  // vuelo. Referencias para que el ondataavailable use siempre el actual.
  const cbRef = useRef(onGravada)
  const leadRef = useRef(leadId)
  useEffect(() => {
    cbRef.current = onGravada
    leadRef.current = leadId
  }, [onGravada, leadId])

  const limpar = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    timeoutRef.current = null
    rafRef.current = null
  }, [])

  const soltarStream = useCallback(() => {
    setStream((atual) => {
      atual?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  useEffect(() => {
    vivoRef.current = true
    return () => {
      vivoRef.current = false
      limpar()
      const r = recorderRef.current
      if (r && r.state !== 'inactive') r.stop()
      soltarStream()
    }
  }, [limpar, soltarStream])

  const parar = useCallback(() => {
    limpar()
    const r = recorderRef.current
    if (r && r.state !== 'inactive') r.stop()
  }, [limpar])

  const comecar = useCallback(() => {
    if (estado === 'gravando' || estado === 'salvando') return
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof MediaRecorder === 'undefined'
    ) {
      setEstado('indisponivel')
      return
    }

    void (async () => {
      let midia: MediaStream
      try {
        midia = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        if (vivoRef.current) setEstado('negado')
        return
      }
      if (!vivoRef.current) {
        midia.getTracks().forEach((t) => t.stop())
        return
      }

      const mime = escolherMime()
      const rec = mime ? new MediaRecorder(midia, { mimeType: mime }) : new MediaRecorder(midia)
      recorderRef.current = rec
      pedacosRef.current = []
      inicioRef.current = Date.now()

      rec.ondataavailable = (ev: BlobEvent) => {
        if (ev.data.size > 0) pedacosRef.current.push(ev.data)
      }

      rec.onstop = () => {
        limpar()
        midia.getTracks().forEach((t) => t.stop())
        if (vivoRef.current) {
          setStream(null)
          setEstado('salvando')
          setProgresso(0)
        }

        const duracao = Math.min(LIMITE_SEGUNDOS, (Date.now() - inicioRef.current) / 1000)
        const tipo = rec.mimeType || mime || 'audio/webm'
        const blob = new Blob(pedacosRef.current, { type: tipo })
        pedacosRef.current = []
        recorderRef.current = null

        // Menos de un segundo es un toque accidental en el botón, no una nota.
        if (blob.size === 0 || duracao < 1) {
          if (vivoRef.current) setEstado('ocioso')
          return
        }

        const clientUuid = novoClientUuid()
        void guardarAudio({
          id: clientUuid,
          blob,
          mime: tipo,
          duracao_seg: Math.round(duracao),
          vendor,
          alvo: leadRef.current === null ? null : { kind: 'lead', id: leadRef.current },
          estado: 'gravado',
          ultimo_error: null,
          criado_em: agora(),
        })
          .then(() => {
            cbRef.current(clientUuid)
          })
          .catch(() => undefined)
          .finally(() => {
            if (vivoRef.current) setEstado('ocioso')
          })
      }

      rec.start()
      setStream(midia)
      setEstado('gravando')
      setProgresso(0)

      // Corte duro a los 15s. El vendedor no tiene que acordarse de soltar.
      timeoutRef.current = setTimeout(() => {
        if (rec.state !== 'inactive') rec.stop()
      }, LIMITE_SEGUNDOS * 1000)

      const tick = (): void => {
        const p = Math.min(1, (Date.now() - inicioRef.current) / (LIMITE_SEGUNDOS * 1000))
        setProgresso(p)
        if (p < 1 && rec.state === 'recording') rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    })()
  }, [estado, limpar, vendor])

  return { estado, progresso, stream, comecar, parar }
}
