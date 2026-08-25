// src/screens/Dossie/secoes.ts
// Estado recordado de las secciones colapsables del dossiê.
//
// El plano prohíbe tabs internos: la ficha es UN scroll. Para que eso no
// signifique 2.000px de scroll ciego, cada bloque se pliega y el pliegue se
// recuerda — si un vendedor nunca mira «Linhas de produto», no la vuelve a ver
// abierta mañana.
//
// Vive en localStorage y no en Dexie a propósito: es preferencia de ESTE
// teléfono, tiene que leerse SÍNCRONA en el primer render (si no, cada sección
// parpadea abierta y se cierra sola) y no vale la pena sincronizarla.

import { useCallback, useState } from 'react'

const CHAVE = 'ventus:dossie:secoes'

type Estado = Record<string, boolean>

function ler(): Estado {
  if (typeof localStorage === 'undefined') return {}
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return {}
    const parseado: unknown = JSON.parse(bruto)
    if (typeof parseado !== 'object' || parseado === null) return {}
    return parseado as Estado
  } catch {
    // Safari en modo privado tira al leer. Un dossiê con todo abierto es un
    // dossiê perfectamente usable.
    return {}
  }
}

function gravar(estado: Estado): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch {
    // Sin cuota: la sesión sigue, solo no se recuerda.
  }
}

/** `[aberta, alternar]` para una sección, con el pliegue persistido. */
export function useSecaoAberta(id: string, padrao = true): [boolean, () => void] {
  const [aberta, setAberta] = useState<boolean>(() => ler()[id] ?? padrao)

  const alternar = useCallback(() => {
    setAberta((atual) => {
      const proxima = !atual
      gravar({ ...ler(), [id]: proxima })
      return proxima
    })
  }, [id])

  return [aberta, alternar]
}
