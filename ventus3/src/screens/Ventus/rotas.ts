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
