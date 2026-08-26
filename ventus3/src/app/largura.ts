// src/app/largura.ts
// EL ANCHO DE LA COLUMNA DE CONTENIDO, POR RUTA. Un solo lugar.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTO VIVE EN SU PROPIO MÓDULO
// ══════════════════════════════════════════════════════════════════════════
// Lo necesitan TRES consumidores: el header del Shell, el <main> del Shell y
// la BarraDeComando del Ventus. Mientras la barra tenía su propio ancho fijo
// (`lg:max-w-2xl`) y el contenido otro, en escritorio quedaban dos cajas
// centradas de anchos distintos: la barra flotaba desalineada respecto de la
// columna que decía comandar. Ese es el defecto que este archivo cierra —
// «alineado con el contenido» sólo se puede garantizar si el número sale del
// MISMO lugar.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REGLA DE DENSIDAD (la pasada anterior no la tenía)
// ══════════════════════════════════════════════════════════════════════════
// En móvil TODA la app vive en `max-w-lg`: es una app de campo que se usa con
// una mano. En escritorio la pasada anterior se limitó a ensanchar el margen
// —`max-w-4xl` para las listas densas— y el resultado fue exactamente lo que
// el dueño del producto reportó con la captura en la mano: 896 px de contenido
// flotando en el medio de 1.700, con el kanban de Cadência metiendo cuatro
// columnas de 150 px y nombres cortados.
//
// La regla nueva es que UN MONITOR MUESTRA MÁS INFORMACIÓN, no la misma
// columna con más aire. Por eso:
//
//  · Cadência y Carteira son TABLAS: usan todo el ancho disponible
//    (`lg:max-w-none`). Cuatro columnas de kanban a 400 px cada una y filas de
//    carteira con seis columnas visibles es la diferencia entre un monitor y
//    un teléfono estirado.
//  · Placar y Dossiê pasan a `lg:max-w-6xl` porque su ganancia es de LAYOUT
//    (los 4 carriles en una fila, la ficha en dos columnas), no de tabla:
//    estirarlos a 1.700 px dejaría líneas de texto ilegibles de 200 caracteres.
//  · Hoje se queda angosta A PROPÓSITO — es la pantalla de foco, una decisión
//    por vez— pero el contenedor sube a `lg:max-w-6xl` para que la columna de
//    foco (max-w-3xl, ver Hoje/index.tsx) tenga a su derecha una columna
//    secundaria con la corrente do time y la racha. El centro respira sin
//    perder el foco.
//  · Revisão sube a `lg:max-w-5xl`: es donde el diff «antigo → novo» entra en
//    dos columnas lado a lado sin que la cita textual se vuelva una plana.
//  · Registrar queda en `max-w-lg` en TODOS los tamaños, sin excepción: su
//    barra de acción es `fixed` y centra su propio `max-w-lg` independiente de
//    este ancho —lo necesita para no moverse cuando el teclado empuja el
//    layout—, así que ensanchar el contenido dejaría los botones más angostos
//    que el formulario que confirman.
//  · La Golden Hour es modo foco y ni pasa por esta función (ver `modoFoco` en
//    Shell.tsx).

/** El Painel do Gestor ya nacía ancho: sube a 6xl con el resto. */
const ROTAS_6XL: readonly string[] = ['/gestor', '/placar']

/** Tablas: todo el ancho del área de contenido. Ver la regla de densidad. */
const ROTAS_LARGAS: readonly string[] = ['/carteira', '/cadencia']

/** Ver el comentario de Registrar más arriba. */
const ROTAS_ANGOSTAS: readonly string[] = ['/registrar']

/**
 * Las clases de ancho de la columna de contenido para `pathname`.
 *
 * Siempre arrancan en `max-w-lg` (móvil) y sólo cambian a partir de `lg:`
 * (≥1024px), que es donde aparece el DesktopRail y desaparece la BottomNav.
 */
export function larguraDe(pathname: string): string {
  if (ROTAS_ANGOSTAS.includes(pathname)) return 'max-w-lg'
  if (ROTAS_6XL.includes(pathname)) return 'max-w-lg lg:max-w-6xl'
  if (pathname === '/') return 'max-w-lg lg:max-w-6xl'
  // /carteira/46 → Dossiê. Antes del check de ROTAS_LARGAS: si no, /carteira
  // (sin id) lo captura primero y listo, pero /carteira/46 empieza igual.
  if (pathname.startsWith('/carteira/')) return 'max-w-lg lg:max-w-6xl'
  if (ROTAS_LARGAS.includes(pathname)) return 'max-w-lg lg:max-w-none'
  if (pathname === '/revisao') return 'max-w-lg lg:max-w-5xl'
  return 'max-w-lg lg:max-w-2xl'
}

/**
 * El tope del CAMPO de la barra de comando del Ventus, dentro de la columna.
 *
 * La barra usa `larguraDe()` para su caja externa —mismo eje y mismo
 * max-width que la ruta activa, que es lo que la deja de hacer flotar
 * centrada sobre la ventana— y este tope para el campo de adentro, alineado
 * al borde IZQUIERDO de esa caja.
 *
 * Por qué un tope y no el ancho entero: en las rutas de tabla la columna mide
 * 1.700 px, y un campo de texto de una línea con ese ancho es la caricatura
 * opuesta al defecto que se está arreglando. En las rutas más angostas que el
 * tope (Hoje, Revisão, Ajustes…) no hace nada y la barra queda exactamente
 * del ancho de su columna.
 */
export const TOPO_DA_BARRA = 'lg:max-w-4xl'
