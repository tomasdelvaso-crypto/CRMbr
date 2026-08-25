// src/screens/Instalar/Ilustracoes.tsx
// Los dibujos de los pasos.
//
// Son SVG y no capturas de pantalla por tres razones concretas:
//  1. Una captura envejece con cada versión de iOS y de Chrome, y una captura
//     vieja es peor que ningún dibujo: manda a buscar un botón que se movió.
//  2. Una captura es un PNG de 80-200 kB por paso; esta página se abre con la
//     peor red del recorrido (teléfono nuevo, sin app, 4G de galpón).
//  3. Un SVG con `currentColor` acompaña el tema; una captura clara sobre
//     fondo oscuro grita «esto no es parte del app».
//
// Lo que sí es literal es el TEXTO dentro del dibujo: «Adicionar à Tela de
// Início», «Instalar mesmo assim». Es lo que la persona tiene que buscar con
// el ojo, y ahí no hay lugar para sinónimos.

import type { ReactNode } from 'react'

function Moldura({ children, titulo }: { children: ReactNode; titulo: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      role="img"
      aria-label={titulo}
      className="h-auto w-full max-w-[220px] rounded-lg border border-border bg-surface-2"
    >
      {children}
    </svg>
  )
}

/** iOS · el botón Compartilhar en la barra de Safari. */
export function IlustracaoCompartilhar() {
  return (
    <Moldura titulo="A barra do Safari com o botão Compartilhar destacado">
      {/* cuerpo de la página */}
      <rect x="10" y="8" width="140" height="76" rx="6" className="fill-surface" />
      <rect x="20" y="20" width="72" height="6" rx="3" className="fill-border-strong" />
      <rect x="20" y="34" width="110" height="4" rx="2" className="fill-border" />
      <rect x="20" y="44" width="96" height="4" rx="2" className="fill-border" />
      {/* barra inferior de Safari */}
      <rect x="10" y="88" width="140" height="24" rx="8" className="fill-surface-3" />
      <path d="M28 106v-8m0-8v8m0-8-4 4m4-4 4 4" className="stroke-fg-muted" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="52" y="96" width="44" height="8" rx="4" className="fill-border-strong" />
      {/* el botón Compartilhar, destacado */}
      <circle cx="124" cy="100" r="13" className="fill-brand-soft" />
      <path
        d="M124 106V95m0 0-4 4m4-4 4 4M117 103v5h14v-5"
        className="stroke-brand"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Moldura>
  )
}

/** iOS · la fila «Adicionar à Tela de Início» dentro del menú Compartilhar. */
export function IlustracaoAdicionar() {
  return (
    <Moldura titulo="A opção Adicionar à Tela de Início na lista">
      <rect x="10" y="8" width="140" height="104" rx="8" className="fill-surface" />
      <rect x="22" y="18" width="60" height="5" rx="2.5" className="fill-border-strong" />
      <rect x="22" y="34" width="116" height="16" rx="5" className="fill-surface-2" />
      <rect x="32" y="40" width="52" height="4" rx="2" className="fill-border" />
      {/* la fila que importa */}
      <rect x="22" y="56" width="116" height="20" rx="5" className="fill-brand-soft" />
      <rect x="30" y="62" width="8" height="8" rx="2" className="fill-brand" />
      <path d="M34 63v6m-3-3h6" className="stroke-brand-fg" strokeWidth="1.4" strokeLinecap="round" />
      <text x="44" y="69.5" className="fill-brand-soft-fg" fontSize="7" fontWeight="600">
        Adicionar à Tela de Início
      </text>
      <rect x="22" y="82" width="116" height="16" rx="5" className="fill-surface-2" />
      <rect x="32" y="88" width="40" height="4" rx="2" className="fill-border" />
    </Moldura>
  )
}

/** Android · el menú de Chrome con «Instalar aplicativo». */
export function IlustracaoMenuAndroid() {
  return (
    <Moldura titulo="O menu do Chrome com a opção Instalar aplicativo">
      <rect x="10" y="8" width="140" height="104" rx="8" className="fill-surface" />
      {/* barra superior con los tres puntos */}
      <rect x="18" y="16" width="94" height="10" rx="5" className="fill-surface-3" />
      <circle cx="132" cy="17" r="1.8" className="fill-fg-muted" />
      <circle cx="132" cy="21" r="1.8" className="fill-fg-muted" />
      <circle cx="132" cy="25" r="1.8" className="fill-fg-muted" />
      {/* menú desplegado */}
      <rect x="72" y="32" width="70" height="72" rx="6" className="fill-surface-2" />
      <rect x="80" y="40" width="42" height="4" rx="2" className="fill-border" />
      <rect x="80" y="52" width="50" height="4" rx="2" className="fill-border" />
      <rect x="76" y="62" width="62" height="16" rx="4" className="fill-brand-soft" />
      <text x="81" y="72.5" className="fill-brand-soft-fg" fontSize="7" fontWeight="600">
        Instalar aplicativo
      </text>
      <rect x="80" y="86" width="46" height="4" rx="2" className="fill-border" />
      <rect x="80" y="95" width="36" height="4" rx="2" className="fill-border" />
    </Moldura>
  )
}

/** Android · el aviso de Play Protect y dónde está el botón que sigue. */
export function IlustracaoPlayProtect() {
  return (
    <Moldura titulo="O aviso do Play Protect e o botão Instalar mesmo assim">
      <rect x="10" y="8" width="140" height="104" rx="8" className="fill-surface" />
      <rect x="20" y="20" width="120" height="72" rx="8" className="fill-surface-2" />
      {/* escudo */}
      <path
        d="M80 30l10 4v8c0 6-4 10-10 12-6-2-10-6-10-12v-8z"
        className="fill-warn-soft stroke-warn"
        strokeWidth="1.6"
      />
      <path d="M80 38v6m0 3.5v.5" className="stroke-warn" strokeWidth="1.8" strokeLinecap="round" />
      <text x="80" y="66" textAnchor="middle" className="fill-fg" fontSize="7" fontWeight="600">
        App não verificada
      </text>
      {/* los dos botones: el correcto, destacado */}
      <rect x="28" y="74" width="48" height="12" rx="6" className="fill-surface-3" />
      <text x="52" y="82.5" textAnchor="middle" className="fill-fg-muted" fontSize="6">
        Não instalar
      </text>
      <rect x="82" y="74" width="52" height="12" rx="6" className="fill-brand" />
      <text x="108" y="82.5" textAnchor="middle" className="fill-brand-fg" fontSize="6" fontWeight="600">
        Instalar mesmo assim
      </text>
    </Moldura>
  )
}

/** El resultado: el icono del Ventus en la pantalla de inicio. */
export function IlustracaoNaTela() {
  return (
    <Moldura titulo="O ícone do Ventus na tela de início do celular">
      <rect x="10" y="8" width="140" height="104" rx="10" className="fill-surface" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={26 + i * 38}
          y={26}
          width="26"
          height="26"
          rx="7"
          className="fill-surface-3"
        />
      ))}
      {/* el nuestro */}
      <rect x="26" y="66" width="26" height="26" rx="7" className="fill-brand" />
      <path
        d="M32 74l7 11 7-11"
        className="stroke-brand-fg"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="39" y="101" textAnchor="middle" className="fill-fg-muted" fontSize="6">
        Ventus
      </text>
      <rect x="64" y="66" width="26" height="26" rx="7" className="fill-surface-3" />
      <rect x="102" y="66" width="26" height="26" rx="7" className="fill-surface-3" />
    </Moldura>
  )
}
