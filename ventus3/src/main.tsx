// src/main.tsx — punto de entrada del bundle.

// PRIMER import a propósito: `@/host/arranque` resuelve el deep link del
// Mini App (`?startapp=opp_1842_log`) reescribiendo la URL ANTES de que
// `./app/App` cree el router — que lee window.location al evaluarse. Los
// módulos ES se evalúan en el orden en que aparecen los imports.
import '@/host/arranque'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { Diagnostico } from './screens/Diagnostico'
import { configOk, variaveisFaltando, variaveisMalformadas } from './data/config-publica'
// El nombre del evento sale del módulo que lo escucha, no de un string
// repetido: si alguien lo renombra allá y acá queda el viejo, el toast de
// «Nova versão» deja de aparecer y nadie se entera hasta la próxima release.
import { EVENTO_ATUALIZACAO, atenderNovaVersao, marcarInteracao } from '@/install/atualizacao'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado em index.html')

const root = createRoot(container)

if (configOk) {
  // Import DINÁMICO a propósito: `./app/App` arrastra el cliente de Supabase,
  // que no puede construirse sin configuración. Un import estático se evalúa
  // ANTES del cuerpo de este módulo — los módulos ES resuelven todo su grafo
  // primero —, así que el fallo ocurriría antes de que este `if` corriera y
  // volveríamos a la pantalla en blanco que este archivo existe para evitar.
  void import('./app/App').then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
} else {
  // Sin configuración no se monta la app: `./app/App` arrastra el cliente de
  // Supabase y éste no puede construirse. Antes esto era un throw en el tope
  // del módulo, o sea pantalla en blanco sin ninguna pista de qué pasó.
  console.error('[ventus] build sem configuração:', variaveisFaltando.join(', '))
  root.render(<Diagnostico faltando={variaveisFaltando} malformadas={variaveisMalformadas} />)
}

// El primer toque, la primera tecla: a partir de ahí el arranque deja de estar
// «en frío» y ninguna actualización se aplica sin permiso. Se registran ANTES
// del registerSW para que un toque muy temprano gane la carrera contra el
// `waiting` del service worker — el vendedor podría haber apretado grabar en
// el primer segundo, y esa nota no se pierde por una recarga nuestra.
for (const evento of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(evento, marcarInteracao, {
    once: true,
    capture: true,
    passive: true,
  })
}

// registerType: 'prompt'. La app no se recarga sola MIENTRAS SE USA: el
// vendedor puede estar en medio de una nota de voz. La única excepción es el
// arranque en frío —antes del primer toque—, donde quedarse con el bundle
// viejo es el riesgo real y recargar no le cuesta nada a nadie. Quién decide
// qué es `atenderNovaVersao`; ver src/install/atualizacao.ts.
export const updateSW = registerSW({
  onNeedRefresh() {
    atenderNovaVersao(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_ATUALIZACAO))
    })
  },
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('ventus:offline-ready'))
  },
})
