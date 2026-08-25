// src/ui/useDitado.ts
// Dictado de la cita del cliente con la Web Speech API.
//
// Por qué ésta y no el pipeline de audio + Whisper del FAB: acá el vendedor
// está DENTRO de un sheet, con el pulgar sobre un campo, y necesita ver el
// texto aparecer mientras habla para corregirlo. Grabar, subir y esperar la
// transcripción rompe ese gesto. La nota de voz larga sigue siendo del FAB.
//
// La API no está en lib.dom, así que se declara acá el mínimo que se usa. No
// hay `any`: es una frontera con el navegador, y se tipa como tal. Donde no
// existe (Firefox, WebViews viejas), `suportado` es false y el botón no se
// pinta — nunca un botón muerto.

import { useCallback, useEffect, useRef, useState } from 'react'

interface ResultadoDeFala {
  readonly transcript: string
}

interface AlternativasDeFala {
  readonly length: number
  readonly isFinal: boolean
  item: (index: number) => ResultadoDeFala
  [index: number]: ResultadoDeFala
}

interface ListaDeResultados {
  readonly length: number
  item: (index: number) => AlternativasDeFala
  [index: number]: AlternativasDeFala
}

interface EventoDeFala {
  readonly resultIndex: number
  readonly results: ListaDeResultados
}

interface ReconhecimentoDeFala {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((evento: EventoDeFala) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type ConstrutorDeReconhecimento = new () => ReconhecimentoDeFala

interface JanelaComFala {
  SpeechRecognition?: ConstrutorDeReconhecimento
  webkitSpeechRecognition?: ConstrutorDeReconhecimento
}

function construtor(): ConstrutorDeReconhecimento | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as JanelaComFala
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface Ditado {
  /** false = el navegador no la tiene: no se pinta el botón. */
  suportado: boolean
  ouvindo: boolean
  alternar: () => void
}

/**
 * `onTexto` recibe el acumulado final. Se llama a cada frase cerrada, no a
 * cada palabra: reemplazar el campo entero con resultados intermedios hace
 * imposible corregir a mano mientras se dicta.
 */
export function useDitado(onTexto: (texto: string) => void): Ditado {
  const [ouvindo, setOuvindo] = useState(false)
  const reconhecimento = useRef<ReconhecimentoDeFala | null>(null)
  const callback = useRef(onTexto)
  // El callback se refresca en un efecto y no en render: tocar un ref durante
  // el render es una carrera con el modo concurrente de React.
  useEffect(() => {
    callback.current = onTexto
  }, [onTexto])

  const suportado = construtor() !== null

  const parar = useCallback(() => {
    const r = reconhecimento.current
    reconhecimento.current = null
    setOuvindo(false)
    if (!r) return
    r.onresult = null
    r.onerror = null
    r.onend = null
    try {
      r.stop()
    } catch {
      // Ya estaba detenido: no hay nada que hacer.
    }
  }, [])

  // Un reconocimiento vivo al desmontar deja el micrófono tomado y el punto
  // rojo de iOS encendido.
  useEffect(() => parar, [parar])

  const alternar = useCallback(() => {
    if (reconhecimento.current) {
      parar()
      return
    }
    const Construtor = construtor()
    if (!Construtor) return

    const r = new Construtor()
    r.lang = 'pt-BR'
    r.continuous = true
    r.interimResults = false
    r.onresult = (evento) => {
      let texto = ''
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const alternativa = evento.results[i]
        if (!alternativa?.isFinal) continue
        texto += alternativa[0]?.transcript ?? ''
      }
      if (texto.trim() !== '') callback.current(texto.trim())
    }
    r.onerror = () => parar()
    r.onend = () => parar()

    reconhecimento.current = r
    setOuvindo(true)
    try {
      r.start()
    } catch {
      parar()
    }
  }, [parar])

  return { suportado, ouvindo, alternar }
}
