// src/screens/Ventus/rotas.ts
// Dónde aparece la barra de comando del Ventus, en un solo lugar.
//
// La lista la necesitan DOS archivos: la propia barra (para no pintarse) y el
// Shell (para saber a qué altura poner el FAB del micrófono). Tenerla dos
// veces significa que un día el FAB va a flotar sobre una franja vacía, o
// peor, encima de la barra. Vive en un módulo sin componentes para no romper
// el fast refresh de BarraDeComando.tsx.

/** Rutas donde la barra NO aparece: modo foco y pantallas de captura. */
export const ROTAS_SEM_BARRA: readonly string[] = [
  '/golden',
  '/registrar',
  '/ventus',
  '/login',
  '/instalar',
]

/**
 * Sin vendedor resuelto no hay a quién preguntarle nada: la barra no se pinta,
 * y el Shell tiene que bajar el FAB para no dejar un hueco de 4rem.
 */
export function barraDeComandoVisivel(pathname: string, vendorName: string | null): boolean {
  if (vendorName === null) return false
  return !ROTAS_SEM_BARRA.some((r) => pathname.startsWith(r))
}

/**
 * Rutas que traen SU PROPIO compositor pegado abajo, y donde por lo tanto el
 * FAB flotante del micrófono no puede aparecer.
 *
 * No es preferencia estética: el FAB es `fixed right-4 z-40` y el compositor
 * del Ventus es `sticky`, así que el FAB le gana siempre y le queda ENCIMA del
 * botón «Enviar». Medido a 360x780 en el Android del dueño: el FAB en
 * y=644..700 y «Enviar» en y=608..652 — se pisan, y Playwright lo confirma con
 * «<button aria-label="Registrar por voz"> … intercepts pointer events». En un
 * teléfono de verdad eso significa que tocar «Enviar» abre la grabadora.
 *
 * Y además sobra: el compositor ya tiene su propio botón «Ditar» a la
 * izquierda del campo, que es el mismo gesto —hablar en vez de escribir—
 * pero DENTRO de la conversación. El FAB manda a /registrar, que es otra
 * tarea; quien la quiera la tiene a un toque en la bottom nav.
 *
 * Es exactamente el mismo razonamiento que ya se aplicaba a /registrar en el
 * Shell («sería un botón que no hace nada y que además tapa la barra de
 * acción»), sólo que allá estaba escrito en línea y acá vive con las demás
 * reglas de qué ocupa el pie de cada ruta.
 */
export const ROTAS_COM_COMPOSITOR_PROPRIO: readonly string[] = ['/ventus', '/registrar']

/** `true` cuando el FAB flotante del micrófono puede pintarse en esta ruta. */
export function microfoneFlutuanteVisivel(pathname: string): boolean {
  return !ROTAS_COM_COMPOSITOR_PROPRIO.some((r) => pathname.startsWith(r))
}
