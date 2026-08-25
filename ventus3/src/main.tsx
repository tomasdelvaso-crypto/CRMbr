// src/main.tsx — punto de entrada del bundle.

// PRIMER import a propósito: `@/host/arranque` resuelve el deep link del
// Mini App (`?startapp=opp_1842_log`) reescribiendo la URL ANTES de que
// `./app/App` cree el router — que lee window.location al evaluarse. Los
// módulos ES se evalúan en el orden en que aparecen los imports.
import '@/host/arranque'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado em index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// registerType: 'prompt'. La app NUNCA se recarga sola: el vendedor puede
// estar en medio de una nota de voz. Se emite un evento y la UI decide cuándo
// ofrecer la actualización (nada de confirm(): siempre sheets y toasts).
export const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('ventus:update-available'))
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('ventus:offline-ready'))
  },
})
