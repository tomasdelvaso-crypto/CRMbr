// src/screens/Dossie/copiar.ts
// Copiar al portapapeles con un tap, con el fallback que iOS todavía necesita.
//
// `navigator.clipboard` exige contexto seguro y, en Safari, un gesto del
// usuario en el MISMO turno del event loop: si se copia después de un await,
// falla en silencio. Por eso el fallback con <textarea> + execCommand sigue
// acá, y por eso la función es síncrona hasta donde puede serlo.

import { haptic, toast } from '@/ui'

function fallbackCopiar(texto: string): boolean {
  if (typeof document === 'undefined') return false
  const area = document.createElement('textarea')
  area.value = texto
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  area.style.pointerEvents = 'none'
  document.body.appendChild(area)
  area.select()
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/**
 * Copia y avisa con un toast. `rotulo` es lo que se nombra en el aviso:
 * «Pergunta copiada», «Citação copiada».
 */
export function copiarTexto(texto: string, rotulo = 'Texto'): void {
  const limpo = texto.trim()
  if (limpo === '') return

  const avisarOk = () => {
    haptic('success')
    toast({ message: `${rotulo} copiado. É só colar no WhatsApp.`, tone: 'ok' })
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard
      .writeText(limpo)
      .then(avisarOk)
      .catch(() => {
        if (fallbackCopiar(limpo)) avisarOk()
        else toast({ message: 'Não deu para copiar neste navegador.', tone: 'atencao' })
      })
    return
  }

  if (fallbackCopiar(limpo)) avisarOk()
  else toast({ message: 'Não deu para copiar neste navegador.', tone: 'atencao' })
}
