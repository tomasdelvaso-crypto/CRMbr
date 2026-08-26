#!/usr/bin/env node
// scripts/url-publica.mjs
// La URL pública del Ventus, resuelta desde UN solo lugar.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE
// ══════════════════════════════════════════════════════════════════════════
// La URL del sitio aparecía escrita a mano en cuatro archivos: el og:image de
// index.html, las siete URLs absolutas de android/twa-manifest.json, el
// ejemplo del workflow y la variable VENTUS_URL de GitHub. Cuatro copias del
// mismo dato es cuatro oportunidades de que una quede vieja — y la que queda
// vieja en el APK no se arregla con un deploy: hay que recompilar y
// reinstalar en los seis teléfonos, porque el host va firmado adentro.
//
// Desde ahora el valor vive en config/url-publica.txt y todos leen de acá.
//
// Precedencia:
//   1. VENTUS_URL           (variable de entorno: CI, Vercel, una prueba)
//   2. config/url-publica.txt
//
// ══════════════════════════════════════════════════════════════════════════
// CÓMO SE USA
// ══════════════════════════════════════════════════════════════════════════
//   node scripts/url-publica.mjs           → imprime la URL y nada más
//   node scripts/url-publica.mjs --check   → falla si twa-manifest.json difiere
//   node scripts/url-publica.mjs --sync    → reescribe twa-manifest.json
//
// `--check` ignora VENTUS_URL a propósito: compara siempre contra el archivo
// versionado, que es lo que el repositorio promete. Si mirara el entorno, un
// CI con otra variable lo daría por bueno y el drift pasaría igual.
//
// import { lerUrlPublica } from './url-publica.mjs'   ← lo que usa vite.config

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const RAIZ = resolve(AQUI, '..')

export const ARQUIVO_URL = resolve(RAIZ, 'config/url-publica.txt')
export const ARQUIVO_TWA = resolve(RAIZ, 'android/twa-manifest.json')

/**
 * Valida y normaliza. Devuelve la URL sin barra final; tira si no sirve.
 * `https://` es obligatorio: Android no valida Digital Asset Links sobre http,
 * y un APK apuntando a http nace con la barra del Chrome encima.
 */
export function normalizarUrl(bruto, origem) {
  const texto = String(bruto ?? '').trim()
  if (!texto) throw new Error(`A URL pública está vazia (${origem}).`)
  let u
  try {
    u = new URL(texto)
  } catch {
    throw new Error(`A URL pública não é uma URL válida (${origem}): «${texto}»`)
  }
  if (u.protocol !== 'https:') {
    throw new Error(`A URL pública precisa começar com https:// (${origem}): «${texto}»`)
  }
  if (u.pathname !== '/' || u.search || u.hash) {
    throw new Error(
      `A URL pública é só a origem, sem caminho nem query (${origem}): «${texto}»`,
    )
  }
  return u.origin
}

/** Lee config/url-publica.txt: primera línea que no sea comentario ni vacía. */
export function lerArquivoUrl(caminho = ARQUIVO_URL) {
  let conteudo
  try {
    conteudo = readFileSync(caminho, 'utf8')
  } catch {
    throw new Error(`Não achei ${caminho}. É a fonte única da URL pública.`)
  }
  const linha = conteudo
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  if (!linha) throw new Error(`${caminho} não tem nenhuma linha com a URL.`)
  return normalizarUrl(linha, caminho)
}

/** La URL que vale ahora: el entorno pisa el archivo. */
export function lerUrlPublica({ env = process.env } = {}) {
  const doAmbiente = env['VENTUS_URL']
  if (doAmbiente && doAmbiente.trim()) return normalizarUrl(doAmbiente, 'VENTUS_URL')
  return lerArquivoUrl()
}

// ─────────────────────────────────────────────────────────────────────────
// twa-manifest.json. El template versionado tiene siete URLs absolutas
// (ícono, ícono maskable, web manifest, scope, tres atajos y el share_target).
// build-apk.sh las reescribe todas a partir de la URL que recibe, así que en
// el APK nunca queda una vieja; el template igual se mantiene alineado para
// que leerlo no mienta y para que `--so-manifest` muestre lo que va a salir.
// ─────────────────────────────────────────────────────────────────────────
function reorigemProfunda(no, base) {
  if (Array.isArray(no)) return no.map((v) => reorigemProfunda(v, base))
  if (no && typeof no === 'object') {
    return Object.fromEntries(Object.entries(no).map(([k, v]) => [k, reorigemProfunda(v, base)]))
  }
  if (typeof no !== 'string' || !/^https?:\/\//.test(no)) return no
  const u = new URL(no)
  return new URL(u.pathname + u.search + u.hash, base).toString()
}

/** Devuelve el texto que `android/twa-manifest.json` debería tener para `url`. */
export function twaManifestPara(url, caminho = ARQUIVO_TWA) {
  const base = new URL(`${url}/`)
  const original = JSON.parse(readFileSync(caminho, 'utf8'))
  const saida = reorigemProfunda(original, base)
  saida.host = base.hostname
  saida.fullScopeUrl = new URL('/', base).toString()
  saida.webManifestUrl = new URL('/manifest.webmanifest', base).toString()
  // startUrl es relativo al scope: nunca se vuelve absoluto.
  saida.startUrl = original.startUrl
  return `${JSON.stringify(saida, null, 2)}\n`
}

// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const desconhecido = args.find((a) => a !== '--check' && a !== '--sync')
  if (desconhecido) {
    console.error(`Opção desconhecida: ${desconhecido}. Use --check, --sync ou nada.`)
    process.exit(1)
  }

  const doArquivo = lerArquivoUrl()

  if (args.includes('--sync')) {
    writeFileSync(ARQUIVO_TWA, twaManifestPara(doArquivo), 'utf8')
    console.log(`✓ ${ARQUIVO_TWA} alinhado com ${doArquivo}`)
    return
  }

  if (args.includes('--check')) {
    const esperado = twaManifestPara(doArquivo)
    const emDisco = readFileSync(ARQUIVO_TWA, 'utf8')
    if (emDisco.trim() !== esperado.trim()) {
      console.error(
        `\n✖ android/twa-manifest.json não bate com ${ARQUIVO_URL}.\n` +
          `  A URL da fonte única é ${doArquivo}.\n` +
          `  Rode:  node scripts/url-publica.mjs --sync\n`,
      )
      process.exit(1)
    }
    console.log(`✓ android/twa-manifest.json em dia com ${doArquivo}`)
    return
  }

  // Sin flags: sólo la URL, para que el bash pueda hacer URL="$(node ...)".
  process.stdout.write(`${lerUrlPublica()}\n`)
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => {
    console.error(`\n✖ ${e?.message ?? e}\n`)
    process.exit(1)
  })
}
