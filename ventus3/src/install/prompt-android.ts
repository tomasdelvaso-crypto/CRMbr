// src/install/prompt-android.ts
// El evento `beforeinstallprompt`, capturado UNA vez y guardado.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ES UN SINGLETON DE MÓDULO Y NO UN useEffect
// ══════════════════════════════════════════════════════════════════════════
// Chrome dispara `beforeinstallprompt` muy temprano —muchas veces antes de
// que React monte— y una sola vez. Si el listener se registra en un efecto,
// el evento ya pasó y el botón «Instalar» nunca aparece: el síntoma clásico
// es «en mi teléfono el botón está gris».
//
// Además hay que llamar a `preventDefault()`: sin eso Chrome se queda con el
// evento, muestra su propio mini-infobar y nosotros no podemos ofrecer nada
// en el momento que elegimos.
//
// El módulo se importa desde la capa PWA, que a su vez la importa `App.tsx`:
// el listener queda puesto en el primer tick del bundle.

/** Frontera tipada: el evento todavía no está en lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let capturado: BeforeInstallPromptEvent | null = null
let instalado = false
const ouvintes = new Set<() => void>()

function avisar(): void {
  for (const o of ouvintes) o()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    capturado = e as BeforeInstallPromptEvent
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    // El evento gastado ya no sirve: Chrome no lo devuelve.
    capturado = null
    instalado = true
    avisar()
  })
}

/** ¿Hay un diálogo nativo listo para disparar? */
export function temPromptNativo(): boolean {
  return capturado !== null
}

/** true desde que llega el evento `appinstalled` en esta pestaña. */
export function foiInstaladoNestaSessao(): boolean {
  return instalado
}

/** Se suscribe a los cambios de disponibilidad del prompt. */
export function observarPrompt(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
  }
}

/**
 * Dispara el diálogo nativo de Chrome.
 *
 * SÓLO se puede llamar desde el handler de un tap: sin gesto del usuario,
 * Chrome rechaza la promesa en silencio. Devuelve si la persona aceptó.
 */
export async function dispararPromptNativo(): Promise<boolean> {
  const evento = capturado
  if (!evento) return false
  // Se consume aunque falle: Chrome no lo entrega dos veces.
  capturado = null
  avisar()
  try {
    await evento.prompt()
    const { outcome } = await evento.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}
