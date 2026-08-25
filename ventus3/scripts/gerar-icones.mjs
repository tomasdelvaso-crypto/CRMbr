#!/usr/bin/env node
// scripts/gerar-icones.mjs
// Generador de la identidad visual instalable de Ventus.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE ARCHIVO EXISTE
// ══════════════════════════════════════════════════════════════════════════
// Los íconos de una PWA no son decoración: son el único momento en que la app
// compite por atención en una pantalla de inicio llena de WhatsApp, Instagram
// y el banco. Un PNG genérico de 413 bytes se lee como «atajo del navegador» y
// el vendedor no lo abre. Por eso los íconos se GENERAN acá, del mismo trazo
// que `src/ui/Logotipo.tsx`, y no se dibujan a mano en cinco tamaños que
// después se desincronizan.
//
// Reglas duras de plataforma que este script respeta y que son la razón de
// que haya seis variantes y no una:
//
//  · MASKABLE (Android): Android recorta el ícono con la máscara del
//    fabricante —círculo, squircle, gota—. Todo lo que importa tiene que
//    caber en el círculo central del 80% (la «safe zone»); el fondo tiene que
//    sangrar hasta el borde. Si se sube el mismo PNG que el `any`, Android le
//    come las puntas al chevron.
//  · APPLE TOUCH ICON: iOS NO respeta la transparencia — la pinta de negro—
//    y aplica su propia máscara redondeada. Por eso sale cuadrado, opaco y
//    sin esquinas propias (dibujarlas dejaría un halo).
//  · FAVICON 16px: a ese tamaño el degradado y el radio se convierten en
//    barro. La variante `compacto` engorda el trazo y achica el radio.
//
// Uso:
//   node scripts/gerar-icones.mjs            → escribe en public/
//   node scripts/gerar-icones.mjs --check    → falla si falta algún archivo
//
// Verificación: ls -la public/ && file public/*.png

import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// sharp se carga bajo demanda: `--check` sólo mira el disco y tiene que poder
// correr en el build de CI aunque las devDependencies nativas no estén.
/** @type {import('sharp').default} */
let sharp

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLICO = join(RAIZ, 'public')
const CAPTURAS = join(PUBLICO, 'screenshots')

/* ══════════════════════════════════════════════════════════════════════════
   Paleta — la misma de src/index.css. El azul de marca es #2563eb.
   ══════════════════════════════════════════════════════════════════════════ */
const MARCA = '#2563eb'
const MARCA_CLARA = '#3b82f6'
const MARCA_ESCURA = '#1d4ed8'
const TINTA = '#ffffff'
const FUNDO_ESCURO = '#0b1220'
const SUPERFICIE_ESCURA = '#131c2f'
const FUNDO_CLARO = '#f8fafc'
const TEXTO_TENUE = '#94a3b8'
const OK = '#16a34a'
const ATENCAO = '#f59e0b'

/** Pila tipográfica que existe de verdad en el contenedor que genera esto. */
const FONTE = 'Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif'

/* ══════════════════════════════════════════════════════════════════════════
   El símbolo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El chevron de Ventus sobre la caja de marca.
 *
 * `escala` mueve el tamaño del glifo dentro del lienzo: 1 para el ícono
 * normal, ~0.86 para el maskable (donde el glifo tiene que caber en el
 * círculo del 80%).
 *
 * @param {object} opciones
 * @param {number} [opciones.lado]       Lado del lienzo en px del viewBox.
 * @param {number} [opciones.raio]       Radio de las esquinas, en fracción del lado.
 * @param {number} [opciones.escala]     Tamaño del glifo respecto del lienzo.
 * @param {boolean} [opciones.fita]      Dibuja la banda diagonal (la «fita» de Ventapel).
 * @param {boolean} [opciones.degradado] Fondo con degradado; `false` = plano.
 * @returns {string} SVG completo.
 */
function svgSimbolo({ lado = 512, raio = 0.225, escala = 1, fita = true, degradado = true } = {}) {
  const S = lado
  const r = S * raio
  // Caja del glifo: ancho 52% del lienzo, proporción 1 : 0.72.
  const w = S * 0.52 * escala
  const h = w * 0.72
  const cx = S / 2
  const cy = S / 2
  const x0 = cx - w / 2
  const x2 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const trazo = w * 0.235

  const fondo = degradado
    ? `<linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${MARCA_CLARA}"/>
      <stop offset="0.55" stop-color="${MARCA}"/>
      <stop offset="1" stop-color="${MARCA_ESCURA}"/>
    </linearGradient>`
    : ''

  // La banda diagonal evoca la cinta de embalaje sin dibujar una caja: a 48px
  // se lee como profundidad, a 512px como identidad.
  const banda = fita
    ? `<g clip-path="url(#c)">
    <path d="M ${-0.1 * S} ${0.78 * S} L ${0.62 * S} ${-0.06 * S} L ${0.82 * S} ${-0.06 * S} L ${0.1 * S} ${0.78 * S} Z" fill="${TINTA}" opacity="0.1"/>
  </g>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="Ventus">
  <defs>
    ${fondo}
    <clipPath id="c"><rect width="${S}" height="${S}" rx="${r}" ry="${r}"/></clipPath>
  </defs>
  <rect width="${S}" height="${S}" rx="${r}" ry="${r}" fill="${degradado ? 'url(#g)' : MARCA}"/>
  ${banda}
  <path d="M ${x0} ${y0} L ${cx} ${y1} L ${x2} ${y0}" fill="none" stroke="${TINTA}" stroke-width="${trazo}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
}

/**
 * Variante compacta para 16/32px: sin degradado ni banda (a ese tamaño son
 * ruido), trazo más grueso y radio menor para que el chevron sobreviva.
 */
function svgCompacto(lado = 64) {
  return svgSimbolo({ lado, raio: 0.19, escala: 1.06, fita: false, degradado: false })
}

/* ══════════════════════════════════════════════════════════════════════════
   Íconos de los shortcuts del manifest
   ══════════════════════════════════════════════════════════════════════════ */

/** Micrófono — «Registrar por voz». */
function glifoMicrofone(S) {
  const w = S * 0.16
  return `<g fill="none" stroke="${TINTA}" stroke-width="${S * 0.075}" stroke-linecap="round" stroke-linejoin="round">
    <rect x="${S / 2 - w / 2}" y="${S * 0.22}" width="${w}" height="${S * 0.34}" rx="${w / 2}" fill="${TINTA}" stroke="none"/>
    <path d="M ${S * 0.31} ${S * 0.47} a ${S * 0.19} ${S * 0.19} 0 0 0 ${S * 0.38} 0"/>
    <path d="M ${S / 2} ${S * 0.66} L ${S / 2} ${S * 0.78}"/>
  </g>`
}

/** Rayo — «Golden Hour». */
function glifoRaio(S) {
  return `<path d="M ${S * 0.56} ${S * 0.16} L ${S * 0.3} ${S * 0.54} L ${S * 0.47} ${S * 0.54} L ${S * 0.43} ${S * 0.84} L ${S * 0.7} ${S * 0.45} L ${S * 0.52} ${S * 0.45} Z" fill="${TINTA}"/>`
}

/** Lista con tilde — «Hoje». */
function glifoLista(S) {
  const linha = (y, largura) =>
    `<rect x="${S * 0.34}" y="${y}" width="${largura}" height="${S * 0.075}" rx="${S * 0.037}" fill="${TINTA}"/>`
  const ponto = (y) => `<circle cx="${S * 0.24}" cy="${y + S * 0.037}" r="${S * 0.045}" fill="${TINTA}" opacity="0.75"/>`
  return `<g>
    ${ponto(S * 0.24)}${linha(S * 0.24, S * 0.42)}
    ${ponto(S * 0.44)}${linha(S * 0.44, S * 0.42)}
    ${ponto(S * 0.64)}${linha(S * 0.64, S * 0.28)}
  </g>`
}

function svgAtalho(glifo, lado = 96) {
  const S = lado
  const r = S * 0.225
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${MARCA_CLARA}"/><stop offset="1" stop-color="${MARCA_ESCURA}"/>
  </linearGradient></defs>
  <rect width="${S}" height="${S}" rx="${r}" ry="${r}" fill="url(#g)"/>
  ${glifo(S)}
</svg>`
}

/* ══════════════════════════════════════════════════════════════════════════
   og-image y capturas del manifest
   ══════════════════════════════════════════════════════════════════════════ */

function svgOgImage() {
  const W = 1200
  const H = 630
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${FUNDO_ESCURO}"/><stop offset="1" stop-color="#16233f"/>
    </linearGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${MARCA_CLARA}"/><stop offset="1" stop-color="${MARCA_ESCURA}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W * 0.86}" cy="${H * 0.12}" r="220" fill="${MARCA}" opacity="0.14"/>
  <circle cx="${W * 0.08}" cy="${H * 0.95}" r="180" fill="${MARCA}" opacity="0.1"/>

  <g transform="translate(96 150)">
    <rect width="132" height="132" rx="30" fill="url(#mark)"/>
    <path d="M 32 44 L 66 96 L 100 44" fill="none" stroke="${TINTA}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <text x="264" y="222" font-family="${FONTE}" font-size="86" font-weight="700" fill="${TINTA}">Ventus</text>
  <text x="264" y="272" font-family="${FONTE}" font-size="30" font-weight="400" fill="${TEXTO_TENUE}">CRM de campo da Ventapel Brasil</text>

  <text x="96" y="392" font-family="${FONTE}" font-size="42" font-weight="600" fill="${TINTA}">A próxima melhor ação, decidida por você</text>
  <text x="96" y="446" font-family="${FONTE}" font-size="42" font-weight="600" fill="${TINTA}">antes de sair para a rua.</text>

  <g font-family="${FONTE}" font-size="26" font-weight="600" fill="${TINTA}">
    <rect x="96" y="500" width="216" height="56" rx="28" fill="${MARCA}" opacity="0.9"/>
    <text x="204" y="536" text-anchor="middle">PPVVCC</text>
    <rect x="330" y="500" width="248" height="56" rx="28" fill="#ffffff" opacity="0.1"/>
    <text x="454" y="536" text-anchor="middle">Golden Hour</text>
    <rect x="596" y="500" width="300" height="56" rx="28" fill="#ffffff" opacity="0.1"/>
    <text x="746" y="536" text-anchor="middle">Funciona sem sinal</text>
  </g>
</svg>`
}

/**
 * Capturas del manifest. Son mock-ups deliberados —no datos de nadie— que
 * muestran la forma de la pantalla en el diálogo de instalación de Chrome.
 * Sin `screenshots`, Android muestra el mini-infobar chiquito en vez de la
 * ficha rica de instalación.
 */
function svgCapturaHoje({ W = 1080, H = 1920 } = {}) {
  const cartao = (y, titulo, empresa, tom) => `
    <rect x="60" y="${y}" width="${W - 120}" height="230" rx="28" fill="${SUPERFICIE_ESCURA}"/>
    <rect x="60" y="${y}" width="10" height="230" rx="5" fill="${tom}"/>
    <text x="110" y="${y + 76}" font-family="${FONTE}" font-size="40" font-weight="700" fill="${TINTA}">${titulo}</text>
    <text x="110" y="${y + 128}" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">${empresa}</text>
    <rect x="110" y="${y + 156}" width="230" height="48" rx="24" fill="${MARCA}" opacity="0.22"/>
    <text x="225" y="${y + 189}" font-family="${FONTE}" font-size="26" font-weight="600" fill="#93b4fd" text-anchor="middle">Abrir dossiê</text>`

  const anel = (cx, cor, pct, rotulo) => {
    const R = 78
    const circ = 2 * Math.PI * R
    return `<g transform="translate(${cx} 470)">
      <circle r="${R}" fill="none" stroke="#22304d" stroke-width="20"/>
      <circle r="${R}" fill="none" stroke="${cor}" stroke-width="20" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}" transform="rotate(-90)"/>
      <text y="14" font-family="${FONTE}" font-size="42" font-weight="700" fill="${TINTA}" text-anchor="middle">${Math.round(pct * 100)}%</text>
      <text y="130" font-family="${FONTE}" font-size="28" fill="${TEXTO_TENUE}" text-anchor="middle">${rotulo}</text>
    </g>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${FUNDO_ESCURO}"/>
  <text x="60" y="150" font-family="${FONTE}" font-size="52" font-weight="700" fill="${TINTA}">Hoje</text>
  <text x="60" y="212" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">Três ações. Nada de lista infinita.</text>
  ${anel(230, MARCA, 0.75, 'Avanço')}
  ${anel(540, OK, 0.6, 'Contato')}
  ${anel(850, ATENCAO, 0.4, 'Higiene')}
  ${cartao(700, 'Confirmar orçamento', 'Indústria exemplo · Vendas', MARCA)}
  ${cartao(970, 'Voltar ao contato', 'Distribuidora exemplo · 12 dias', ATENCAO)}
  ${cartao(1240, 'Registrar a visita', 'Embalagens exemplo · hoje', OK)}
  <rect x="60" y="1530" width="${W - 120}" height="110" rx="55" fill="${SUPERFICIE_ESCURA}"/>
  <text x="120" y="1600" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">Pergunte ao Ventus…</text>
  <rect x="0" y="${H - 170}" width="${W}" height="170" fill="${SUPERFICIE_ESCURA}"/>
  <circle cx="${W - 140}" cy="${H - 240}" r="82" fill="${MARCA}"/>
  ${glifoMicrofone(164).replace('<g', `<g transform="translate(${W - 222} ${H - 322})"`)}
</svg>`
}

function svgCapturaGolden({ W = 1080, H = 1920 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a1204"/><stop offset="1" stop-color="${FUNDO_ESCURO}"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${W / 2}" y="220" font-family="${FONTE}" font-size="34" font-weight="600" fill="${ATENCAO}" text-anchor="middle">GOLDEN HOUR</text>
  <text x="${W / 2}" y="330" font-family="${FONTE}" font-size="120" font-weight="700" fill="${TINTA}" text-anchor="middle">12:47</text>
  <text x="${W / 2}" y="392" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}" text-anchor="middle">4 de 8 empresas</text>

  <rect x="70" y="470" width="${W - 140}" height="820" rx="40" fill="${SUPERFICIE_ESCURA}"/>
  <text x="130" y="580" font-family="${FONTE}" font-size="46" font-weight="700" fill="${TINTA}">Empresa exemplo Ltda</text>
  <text x="130" y="646" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">São Paulo · fita gomada · 2 contatos</text>
  <rect x="130" y="700" width="${W - 260}" height="4" fill="#22304d"/>
  <text x="130" y="790" font-family="${FONTE}" font-size="34" font-weight="600" fill="#93b4fd">Pergunta sugerida</text>
  <text x="130" y="856" font-family="${FONTE}" font-size="34" fill="${TINTA}">«Quantas caixas por dia saem</text>
  <text x="130" y="906" font-family="${FONTE}" font-size="34" fill="${TINTA}">dessa linha hoje?»</text>
  <rect x="130" y="960" width="300" height="60" rx="30" fill="${MARCA}" opacity="0.25"/>
  <text x="280" y="1000" font-family="${FONTE}" font-size="28" font-weight="600" fill="#93b4fd" text-anchor="middle">Escala P — 2/5</text>
  <text x="130" y="1110" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">Último contato há 9 dias</text>
  <text x="130" y="1170" font-family="${FONTE}" font-size="32" fill="${TEXTO_TENUE}">Cadência: ligar esta semana</text>

  <rect x="70" y="1400" width="${(W - 180) / 2}" height="120" rx="60" fill="#22304d"/>
  <text x="${70 + (W - 180) / 4}" y="1475" font-family="${FONTE}" font-size="36" font-weight="600" fill="${TINTA}" text-anchor="middle">Adiar</text>
  <rect x="${110 + (W - 180) / 2}" y="1400" width="${(W - 180) / 2}" height="120" rx="60" fill="${MARCA}"/>
  <text x="${110 + (3 * (W - 180)) / 4}" y="1475" font-family="${FONTE}" font-size="36" font-weight="600" fill="${TINTA}" text-anchor="middle">Registrar</text>
  <text x="${W / 2}" y="1640" font-family="${FONTE}" font-size="30" fill="${TEXTO_TENUE}" text-anchor="middle">Sem sinal? Segue funcionando.</text>
</svg>`
}

function svgCapturaLarga({ W = 1920, H = 1080 } = {}) {
  const coluna = (x, titulo, n) => {
    const cartoes = Array.from({ length: n }, (_, i) => {
      const y = 260 + i * 150
      return `<rect x="${x}" y="${y}" width="400" height="126" rx="20" fill="${SUPERFICIE_ESCURA}"/>
      <rect x="${x + 28}" y="${y + 30}" width="240" height="20" rx="10" fill="${TINTA}" opacity="0.85"/>
      <rect x="${x + 28}" y="${y + 70}" width="160" height="16" rx="8" fill="${TEXTO_TENUE}" opacity="0.7"/>`
    }).join('')
    return `<text x="${x}" y="220" font-family="${FONTE}" font-size="30" font-weight="600" fill="${TEXTO_TENUE}">${titulo}</text>${cartoes}`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${FUNDO_CLARO}"/>
  <rect width="${W}" height="140" fill="${FUNDO_ESCURO}"/>
  <text x="80" y="88" font-family="${FONTE}" font-size="44" font-weight="700" fill="${TINTA}">Painel do gestor</text>
  <rect y="140" width="${W}" height="${H - 140}" fill="${FUNDO_ESCURO}" opacity="0.97"/>
  ${coluna(80, 'Sem contato há 14 dias', 4)}
  ${coluna(560, 'Escala travada', 4)}
  ${coluna(1040, 'Golden Hour hoje', 4)}
  ${coluna(1520, 'Sem próximo passo', 3)}
</svg>`
}

/* ══════════════════════════════════════════════════════════════════════════
   Empaquetador .ico
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Arma un .ico con PNGs adentro (ICO/PNG, soportado por todo navegador
 * moderno). sharp no escribe .ico, y traer una dependencia más para 300 bytes
 * de cabecera no se justifica.
 *
 * @param {Array<{ tamanho: number, png: Buffer }>} imagens
 * @returns {Buffer}
 */
function empacotarIco(imagens) {
  const cabecalho = Buffer.alloc(6)
  cabecalho.writeUInt16LE(0, 0) // reservado
  cabecalho.writeUInt16LE(1, 2) // tipo: 1 = ícono
  cabecalho.writeUInt16LE(imagens.length, 4)

  const entradas = []
  let offset = 6 + imagens.length * 16
  for (const { tamanho, png } of imagens) {
    const e = Buffer.alloc(16)
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0) // ancho (0 = 256)
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1) // alto
    e.writeUInt8(0, 2) // paleta
    e.writeUInt8(0, 3) // reservado
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entradas.push(e)
    offset += png.length
  }

  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)])
}

/* ══════════════════════════════════════════════════════════════════════════
   Generación
   ══════════════════════════════════════════════════════════════════════════ */

/** @param {string} svg @param {number} lado */
async function png(svg, lado) {
  return sharp(Buffer.from(svg)).resize(lado, lado).png({ compressionLevel: 9 }).toBuffer()
}

/** Como png(), pero aplanado sobre el azul de marca: cero canal alfa. */
async function pngOpaco(svg, lado) {
  return sharp(Buffer.from(svg))
    .resize(lado, lado)
    .flatten({ background: MARCA })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Todo lo que este script produce. `verificar-pwa.mjs` lee esta misma lista. */
export const ARQUIVOS_GERADOS = [
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon.svg',
  'favicon.ico',
  'atalho-registrar.png',
  'atalho-golden.png',
  'atalho-hoje.png',
  'og-image.png',
  'screenshots/hoje.png',
  'screenshots/golden.png',
  'screenshots/gestor.png',
]

async function escrever(nome, dados) {
  const destino = join(PUBLICO, nome)
  await mkdir(dirname(destino), { recursive: true })
  await writeFile(destino, dados)
  const kb = (dados.length / 1024).toFixed(1)
  console.log(`  ✓ public/${nome}  (${kb} kB)`)
}

async function gerar() {
  sharp = (await import('sharp')).default
  await mkdir(CAPTURAS, { recursive: true })
  console.log('Gerando a identidade instalável do Ventus…\n')

  // ── Íconos «any»: caja de marca con esquinas propias ──────────────────
  const base = svgSimbolo({ lado: 512 })
  await escrever('icon-192.png', await png(base, 192))
  await escrever('icon-512.png', await png(base, 512))

  // ── Maskable: fondo a sangre, glifo dentro del círculo del 80% ────────
  // El fondo llega al borde (raio 0) porque la máscara del fabricante recorta
  // encima; el glifo va al 86% para no rozar el borde de la safe zone.
  const mascarable = svgSimbolo({ lado: 512, raio: 0, escala: 0.86 })
  await escrever('icon-maskable-192.png', await png(mascarable, 192))
  await escrever('icon-maskable-512.png', await png(mascarable, 512))

  // ── Apple: 180x180, cuadrado y SIN alfa ───────────────────────────────
  await escrever('apple-touch-icon.png', await pngOpaco(svgSimbolo({ lado: 512, raio: 0 }), 180))

  // ── Favicons ──────────────────────────────────────────────────────────
  await escrever('favicon.svg', Buffer.from(svgSimbolo({ lado: 64 }), 'utf8'))
  const ico = empacotarIco([
    { tamanho: 16, png: await png(svgCompacto(64), 16) },
    { tamanho: 32, png: await png(svgCompacto(64), 32) },
    { tamanho: 48, png: await png(svgSimbolo({ lado: 512 }), 48) },
  ])
  await escrever('favicon.ico', ico)

  // ── Shortcuts del manifest ────────────────────────────────────────────
  await escrever('atalho-registrar.png', await png(svgAtalho(glifoMicrofone), 96))
  await escrever('atalho-golden.png', await png(svgAtalho(glifoRaio), 96))
  await escrever('atalho-hoje.png', await png(svgAtalho(glifoLista), 96))

  // ── og-image y capturas ───────────────────────────────────────────────
  await escrever(
    'og-image.png',
    await sharp(Buffer.from(svgOgImage())).png({ compressionLevel: 9 }).toBuffer(),
  )
  await escrever(
    'screenshots/hoje.png',
    await sharp(Buffer.from(svgCapturaHoje())).png({ compressionLevel: 9 }).toBuffer(),
  )
  await escrever(
    'screenshots/golden.png',
    await sharp(Buffer.from(svgCapturaGolden())).png({ compressionLevel: 9 }).toBuffer(),
  )
  await escrever(
    'screenshots/gestor.png',
    await sharp(Buffer.from(svgCapturaLarga())).png({ compressionLevel: 9 }).toBuffer(),
  )

  console.log('\nListo. Verificá con: ls -la public/ && file public/*.png')
}

function checar() {
  const faltantes = ARQUIVOS_GERADOS.filter((f) => !existsSync(join(PUBLICO, f)))
  if (faltantes.length > 0) {
    console.error('Faltan íconos generados:\n  ' + faltantes.join('\n  '))
    console.error('\nCorré: node scripts/gerar-icones.mjs')
    process.exit(1)
  }
  console.log(`✓ Los ${ARQUIVOS_GERADOS.length} archivos generados están en public/.`)
}

const args = process.argv.slice(2)
if (args.includes('--check')) {
  checar()
} else {
  await gerar()
}
