#!/usr/bin/env node
// scripts/verificar-pwa.mjs
// Valida que lo construido sea REALMENTE instalable, y no «casi».
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE SCRIPT Y NO «ABRÍ LIGHTHOUSE»
// ══════════════════════════════════════════════════════════════════════════
// Todos los errores que arruinan una PWA fallan EN SILENCIO:
//   · un ícono declarado en el manifest que no existe → Chrome no ofrece
//     instalar y no dice por qué;
//   · `purpose: 'any maskable'` sobre el mismo PNG → Android le come las
//     puntas al ícono y nadie lo nota hasta ver un teléfono;
//   · apple-touch-icon con canal alfa → iOS lo pinta de NEGRO;
//   · assetlinks.json servido como text/plain → la TWA abre con la barra de
//     Chrome adentro y la verificación falla sin un solo error en consola;
//   · un `sizes` que no coincide con el PNG de verdad → la captura se
//     descarta del diálogo de instalación.
// Ninguno rompe el build. Este script los convierte en un exit code.
//
// Uso:
//   npm run build && node scripts/verificar-pwa.mjs
//   node scripts/verificar-pwa.mjs --dir dist
//
// ══════════════════════════════════════════════════════════════════════════
// NOTA SOBRE assetlinks.json (TWA)
// ══════════════════════════════════════════════════════════════════════════
// `public/.well-known/assetlinks.json` sale con un fingerprint PLACEHOLDER
// (todo ceros). Para que la TWA abra sin la barra de Chrome hay que:
//   1. keytool -list -v -keystore android/ventapel-ventus.keystore \
//        -alias ventus | grep SHA256
//   2. pegar ese SHA-256 en `sha256_cert_fingerprints`
//   3. desplegar y comprobar con:
//      curl -sI https://<dominio>/.well-known/assetlinks.json | grep -i content-type
//      → tiene que decir application/json (lo fuerza vercel.json)
//   4. abrir el APK en un teléfono real: si aparece la barra de Chrome, falló.
// Este script avisa mientras el placeholder siga ahí.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const iDir = args.indexOf('--dir')
const DIST = resolve(RAIZ, iDir >= 0 && args[iDir + 1] ? args[iDir + 1] : 'dist')

/* ══════════════════════════════════════════════════════════════════════════
   Reporte
   ══════════════════════════════════════════════════════════════════════════ */

const erros = []
const avisos = []
const oks = []

const falla = (msg) => erros.push(msg)
const avisa = (msg) => avisos.push(msg)
const pasa = (msg) => oks.push(msg)

/** Comprueba `condicion` y anota el resultado. */
function exigir(condicion, mensajeOk, mensajeError) {
  if (condicion) pasa(mensajeOk)
  else falla(mensajeError)
  return condicion
}

/* ══════════════════════════════════════════════════════════════════════════
   Lectura de PNG sin dependencias
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Lee el IHDR de un PNG: dimensiones y tipo de color.
 * colorType: 0 gris · 2 RGB · 3 paleta · 4 gris+alfa · 6 RGBA.
 */
function lerPng(ruta) {
  const buf = readFileSync(ruta)
  const firma = buf.subarray(0, 8).toString('hex')
  if (firma !== '89504e470d0a1a0a') return null
  return {
    largura: buf.readUInt32BE(16),
    altura: buf.readUInt32BE(20),
    profundidade: buf.readUInt8(24),
    colorType: buf.readUInt8(25),
    bytes: buf.length,
    conteudo: buf,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · El manifest
   ══════════════════════════════════════════════════════════════════════════ */

console.log(`\nVerificando la PWA en ${DIST}\n${'─'.repeat(60)}`)

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  console.error(`No existe ${DIST}. Corré primero: npm run build`)
  process.exit(1)
}

const rutaManifest = join(DIST, 'manifest.webmanifest')
if (!existsSync(rutaManifest)) {
  console.error('Falta dist/manifest.webmanifest. ¿Corrió el plugin PWA en el build?')
  process.exit(1)
}

/** @type {Record<string, any>} */
let manifest
try {
  manifest = JSON.parse(readFileSync(rutaManifest, 'utf8'))
  pasa('manifest.webmanifest es JSON válido')
} catch (e) {
  console.error(`manifest.webmanifest no parsea: ${e.message}`)
  process.exit(1)
}

// ── Requisitos duros de instalabilidad (Chrome/Edge/Samsung) ─────────────
exigir(
  typeof manifest.name === 'string' && manifest.name.length > 0,
  `name: «${manifest.name}»`,
  'Falta `name`: sin él no hay instalación.',
)
exigir(
  typeof manifest.short_name === 'string' && manifest.short_name.length > 0 && manifest.short_name.length <= 12,
  `short_name: «${manifest.short_name}» (cabe bajo el ícono)`,
  'Falta `short_name` o pasa de 12 caracteres: Android lo trunca con «…».',
)
exigir(typeof manifest.start_url === 'string', `start_url: ${manifest.start_url}`, 'Falta `start_url`.')
exigir(typeof manifest.scope === 'string', `scope: ${manifest.scope}`, 'Falta `scope`.')
exigir(typeof manifest.id === 'string', `id: ${manifest.id}`, 'Falta `id`: sin él, cambiar start_url crea una app «nueva».')

const DISPLAYS_OK = ['standalone', 'fullscreen', 'minimal-ui']
exigir(
  DISPLAYS_OK.includes(manifest.display),
  `display: ${manifest.display}`,
  `display «${manifest.display}» no es instalable. Tiene que ser uno de: ${DISPLAYS_OK.join(', ')}.`,
)

exigir(
  Array.isArray(manifest.display_override) && manifest.display_override.length > 0,
  `display_override: [${(manifest.display_override ?? []).join(', ')}]`,
  'Falta `display_override`: sin él no hay plan B si el navegador no soporta standalone.',
)

exigir(manifest.lang === 'pt-BR', `lang: ${manifest.lang}`, 'El `lang` tiene que ser pt-BR: la app es en portugués de Brasil.')

const HEX = /^#[0-9a-fA-F]{6}$/
exigir(HEX.test(manifest.theme_color ?? ''), `theme_color: ${manifest.theme_color}`, 'Falta `theme_color` o no es #rrggbb.')
exigir(
  HEX.test(manifest.background_color ?? ''),
  `background_color: ${manifest.background_color}`,
  'Falta `background_color`: es el color del splash de Android y sin él parpadea en blanco.',
)

if (manifest.orientation) pasa(`orientation: ${manifest.orientation}`)
else avisa('Sin `orientation`: la app rota con el teléfono.')

if (Array.isArray(manifest.categories) && manifest.categories.length > 0) {
  pasa(`categories: ${manifest.categories.join(', ')}`)
} else {
  avisa('Sin `categories`.')
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Íconos: existen, miden lo declarado y son archivos distintos
   ══════════════════════════════════════════════════════════════════════════ */

/** Resuelve una `src` del manifest a una ruta dentro de dist/. */
function rutaDe(src) {
  return join(DIST, String(src).replace(/^\//, ''))
}

/** Valida un recurso de imagen declarado en el manifest. */
function verificarImagem(rotulo, src, sizesEsperado) {
  const ruta = rutaDe(src)
  if (!existsSync(ruta)) {
    falla(`${rotulo}: ${src} está declarado en el manifest y NO EXISTE en dist/.`)
    return null
  }
  const png = lerPng(ruta)
  if (!png) {
    falla(`${rotulo}: ${src} no es un PNG válido.`)
    return null
  }
  if (sizesEsperado) {
    const [w, h] = sizesEsperado.split('x').map(Number)
    if (png.largura !== w || png.altura !== h) {
      falla(
        `${rotulo}: ${src} declara ${sizesEsperado} pero mide ${png.largura}x${png.altura}. ` +
          'Chrome descarta el recurso.',
      )
      return png
    }
  }
  pasa(`${rotulo}: ${src} ${png.largura}x${png.altura} (${(png.bytes / 1024).toFixed(1)} kB)`)
  return png
}

const icones = Array.isArray(manifest.icons) ? manifest.icons : []
exigir(icones.length > 0, `${icones.length} íconos declarados`, 'El manifest no declara íconos.')

const proposito = (icone) =>
  String(icone.purpose ?? 'any')
    .split(/\s+/)
    .filter(Boolean)

for (const icone of icones) {
  const props = proposito(icone)
  if (props.includes('any') && props.includes('maskable')) {
    falla(
      `${icone.src} declara «any maskable» sobre el mismo archivo. Android lo recorta con la ` +
        'máscara del fabricante y le come las puntas: tienen que ser dos PNG distintos.',
    )
  }
  verificarImagem('ícone', icone.src, icone.sizes)
}

const temQualquer = (tamanho) =>
  icones.some((i) => proposito(i).includes('any') && String(i.sizes).includes(tamanho))
const temMascarable = (tamanho) =>
  icones.some((i) => proposito(i).includes('maskable') && String(i.sizes).includes(tamanho))

exigir(temQualquer('192x192'), 'Hay ícono `any` de 192x192', 'Falta un ícono `any` de 192x192: es requisito de instalabilidad.')
exigir(temQualquer('512x512'), 'Hay ícono `any` de 512x512', 'Falta un ícono `any` de 512x512: es requisito de instalabilidad.')
exigir(temMascarable('512x512'), 'Hay ícono `maskable` de 512x512', 'Falta un ícono `maskable` de 512x512: Android recorta el `any` sin piedad.')
if (temMascarable('192x192')) pasa('Hay ícono `maskable` de 192x192')
else avisa('Sin maskable de 192x192: Android lo escala del de 512, que se ve blando en pantallas hdpi.')

// El error clásico: subir el mismo PNG como `any` y como `maskable`.
const anyGrande = icones.find((i) => proposito(i).includes('any') && String(i.sizes) === '512x512')
const maskGrande = icones.find((i) => proposito(i).includes('maskable') && String(i.sizes) === '512x512')
if (anyGrande && maskGrande) {
  const a = existsSync(rutaDe(anyGrande.src)) ? readFileSync(rutaDe(anyGrande.src)) : null
  const b = existsSync(rutaDe(maskGrande.src)) ? readFileSync(rutaDe(maskGrande.src)) : null
  if (a && b && a.equals(b)) {
    falla('El ícono `any` y el `maskable` de 512 son el MISMO archivo: la safe zone del 80% no está respetada.')
  } else if (a && b) {
    pasa('El `any` y el `maskable` son archivos distintos (safe zone propia)')
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Apple: el ícono que iOS pinta de negro si tiene alfa
   ══════════════════════════════════════════════════════════════════════════ */

const rutaApple = join(DIST, 'apple-touch-icon.png')
if (!existsSync(rutaApple)) {
  falla('Falta apple-touch-icon.png: en iOS el ícono de la Tela de Início sale como captura de la página.')
} else {
  const png = lerPng(rutaApple)
  if (!png) {
    falla('apple-touch-icon.png no es un PNG válido.')
  } else {
    if (png.largura !== 180 || png.altura !== 180) {
      avisa(`apple-touch-icon.png mide ${png.largura}x${png.altura}; iOS espera 180x180.`)
    }
    if (png.colorType === 6 || png.colorType === 4) {
      falla('apple-touch-icon.png tiene canal alfa. iOS NO respeta la transparencia: la pinta de negro.')
    } else {
      pasa(`apple-touch-icon.png ${png.largura}x${png.altura}, sin canal alfa`)
    }
  }
}

for (const nome of ['favicon.svg', 'favicon.ico']) {
  if (existsSync(join(DIST, nome))) pasa(`${nome} presente`)
  else avisa(`Falta ${nome}.`)
}
if (existsSync(join(DIST, 'og-image.png'))) pasa('og-image.png presente')
else avisa('Falta og-image.png: el link compartido en WhatsApp sale sin imagen.')

/* ══════════════════════════════════════════════════════════════════════════
   4 · Shortcuts, screenshots y share_target
   ══════════════════════════════════════════════════════════════════════════ */

const atalhos = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : []
if (atalhos.length === 0) {
  avisa('Sin `shortcuts`: el press-and-hold sobre el ícono no ofrece nada.')
} else {
  pasa(`${atalhos.length} shortcuts: ${atalhos.map((a) => a.name).join(' · ')}`)
  for (const atalho of atalhos) {
    if (typeof atalho.url !== 'string' || !atalho.url.startsWith('/')) {
      falla(`Shortcut «${atalho.name}»: url «${atalho.url}» tiene que ser absoluta dentro del scope.`)
    }
    for (const icone of atalho.icons ?? []) {
      verificarImagem(`shortcut «${atalho.name}»`, icone.src, icone.sizes)
    }
  }
}

const capturas = Array.isArray(manifest.screenshots) ? manifest.screenshots : []
if (capturas.length === 0) {
  avisa('Sin `screenshots`: Android muestra el mini-infobar en vez de la ficha de instalación.')
} else {
  const narrow = capturas.filter((c) => c.form_factor === 'narrow')
  const wide = capturas.filter((c) => c.form_factor === 'wide')
  if (narrow.length === 0) falla('Ninguna screenshot con form_factor «narrow»: es la que usa el teléfono.')
  else pasa(`${narrow.length} screenshots narrow`)
  if (wide.length === 0) avisa('Ninguna screenshot con form_factor «wide» (escritorio).')
  for (const captura of capturas) {
    if (!captura.label) {
      avisa(`Screenshot ${captura.src} sin label: el lector de pantalla no la puede describir.`)
    }
    verificarImagem('screenshot', captura.src, captura.sizes)
  }
}

const share = manifest.share_target
if (!share) {
  avisa('Sin `share_target`: compartir una foto desde el WhatsApp no ofrece el Ventus.')
} else {
  const metodo = String(share.method ?? 'GET').toUpperCase()
  pasa(`share_target: ${metodo} ${share.action}`)
  if (metodo === 'POST') {
    exigir(
      share.enctype === 'multipart/form-data',
      'share_target POST con enctype multipart/form-data',
      'Un share_target POST con archivos necesita enctype «multipart/form-data».',
    )
    exigir(
      Array.isArray(share.params?.files) && share.params.files.length > 0,
      'share_target acepta archivos',
      'share_target POST sin `params.files`: las fotos compartidas se pierden.',
    )
  }
  const swTexto = existsSync(join(DIST, 'sw.js')) ? readFileSync(join(DIST, 'sw.js'), 'utf8') : ''
  exigir(
    swTexto.includes(String(share.action)),
    'El service worker atiende la ruta del share_target',
    `El share_target apunta a ${share.action} pero el sw.js no la menciona: el POST se va a perder.`,
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Service worker e index.html
   ══════════════════════════════════════════════════════════════════════════ */

const rutaSw = join(DIST, 'sw.js')
if (!existsSync(rutaSw)) {
  falla('Falta dist/sw.js: sin service worker no hay instalación ni offline.')
} else {
  const sw = readFileSync(rutaSw, 'utf8')
  pasa(`sw.js presente (${(statSync(rutaSw).size / 1024).toFixed(1)} kB)`)
  exigir(
    /precache/i.test(sw),
    'El sw precachea el app-shell',
    'El sw.js no parece precachear nada: la app no abriría sin red.',
  )
  exigir(
    sw.includes('SKIP_WAITING'),
    'El sw espera la orden SKIP_WAITING (nada de recargas sorpresa)',
    'El sw.js no atiende SKIP_WAITING: el toast «Atualizar» no tendría a quién hablarle.',
  )
  if (/\/api\//.test(sw)) pasa('El sw declara explícitamente que no toca /api')
  else avisa('El sw.js no menciona /api: revisá que ninguna ruta se coma la API.')
}

const rutaIndex = join(DIST, 'index.html')
if (!existsSync(rutaIndex)) {
  falla('Falta dist/index.html.')
} else {
  const html = readFileSync(rutaIndex, 'utf8')
  exigir(
    /<link[^>]+rel=["']manifest["']/.test(html),
    'index.html enlaza el manifest',
    'index.html no tiene <link rel="manifest">: sin eso no hay nada que instalar.',
  )
  exigir(
    /<link[^>]+rel=["']apple-touch-icon["']/.test(html),
    'index.html enlaza el apple-touch-icon',
    'index.html no enlaza apple-touch-icon: iOS usa una captura de la página como ícono.',
  )
  exigir(
    /name=["']theme-color["']/.test(html),
    'index.html declara theme-color',
    'index.html no declara theme-color: la barra de estado no acompaña al tema.',
  )
  exigir(
    /viewport-fit=cover/.test(html),
    'index.html usa viewport-fit=cover (safe areas con valor)',
    'Sin viewport-fit=cover, env(safe-area-inset-*) vale 0 y la app se mete bajo el notch.',
  )
  if (/apple-mobile-web-app-capable/.test(html)) pasa('index.html declara apple-mobile-web-app-capable')
  else avisa('Sin apple-mobile-web-app-capable: en iOS la app abre con la barra del Safari.')
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · TWA: assetlinks.json y su Content-Type
   ══════════════════════════════════════════════════════════════════════════ */

const rutaLinks = join(DIST, '.well-known', 'assetlinks.json')
if (!existsSync(rutaLinks)) {
  falla('Falta dist/.well-known/assetlinks.json: la TWA abriría con la barra de Chrome.')
} else {
  try {
    const links = JSON.parse(readFileSync(rutaLinks, 'utf8'))
    if (!Array.isArray(links) || links.length === 0) {
      falla('assetlinks.json tiene que ser un array con al menos una declaración.')
    } else {
      for (const decl of links) {
        const relacion = Array.isArray(decl.relation) ? decl.relation : []
        exigir(
          relacion.includes('delegate_permission/common.handle_all_urls'),
          'assetlinks.json delega handle_all_urls',
          'assetlinks.json sin «delegate_permission/common.handle_all_urls».',
        )
        exigir(
          decl.target?.namespace === 'android_app' && typeof decl.target?.package_name === 'string',
          `assetlinks.json apunta a ${decl.target?.package_name}`,
          'assetlinks.json sin target.namespace=android_app o sin package_name.',
        )
        const fps = decl.target?.sha256_cert_fingerprints ?? []
        if (!Array.isArray(fps) || fps.length === 0) {
          falla('assetlinks.json sin sha256_cert_fingerprints.')
        } else {
          for (const fp of fps) {
            if (/^(00:){31}00$/.test(String(fp))) {
              avisa(
                'assetlinks.json todavía tiene el fingerprint PLACEHOLDER (todo ceros). ' +
                  'Hasta reemplazarlo por el SHA-256 del keystore de release, la TWA abre ' +
                  'con la barra de Chrome adentro. Ver el encabezado de este script.',
              )
            } else if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(String(fp))) {
              falla(`Fingerprint con formato inválido en assetlinks.json: «${fp}».`)
            } else {
              pasa('assetlinks.json con fingerprint real')
            }
          }
        }
      }
    }
  } catch (e) {
    falla(`assetlinks.json no parsea: ${e.message}`)
  }
}

// El header lo pone Vercel, no el build: se verifica sobre vercel.json.
const rutaVercel = join(RAIZ, 'vercel.json')
if (!existsSync(rutaVercel)) {
  avisa('Sin vercel.json: nadie fuerza el Content-Type de assetlinks.json.')
} else {
  const vercel = JSON.parse(readFileSync(rutaVercel, 'utf8'))
  const headers = Array.isArray(vercel.headers) ? vercel.headers : []
  const regla = headers.find((h) => String(h.source).includes('assetlinks.json'))
  const tipo = regla?.headers?.find((h) => String(h.key).toLowerCase() === 'content-type')
  exigir(
    tipo?.value === 'application/json',
    'vercel.json fuerza Content-Type: application/json en assetlinks.json',
    'vercel.json no fuerza «Content-Type: application/json» en /.well-known/assetlinks.json. ' +
      'Vercel lo manda como texto plano y la verificación de la TWA falla EN SILENCIO ' +
      '(síntoma: aparece la barra de Chrome dentro de la app).',
  )
  const reglaManifest = headers.find((h) => String(h.source).includes('manifest.webmanifest'))
  if (reglaManifest) pasa('vercel.json declara headers para el manifest')
  else avisa('vercel.json no declara Content-Type para manifest.webmanifest.')
}

/* ══════════════════════════════════════════════════════════════════════════
   Salida
   ══════════════════════════════════════════════════════════════════════════ */

for (const linea of oks) console.log(`  ✓ ${linea}`)
if (avisos.length > 0) {
  console.log('')
  for (const linea of avisos) console.log(`  ⚠ ${linea}`)
}
if (erros.length > 0) {
  console.log('')
  for (const linea of erros) console.log(`  ✗ ${linea}`)
}

console.log('─'.repeat(60))
console.log(`${oks.length} ok · ${avisos.length} avisos · ${erros.length} errores`)

if (erros.length > 0) {
  console.log('\nLa app NO es instalable como está.')
  process.exit(1)
}
console.log('\nInstalable. ✓')
