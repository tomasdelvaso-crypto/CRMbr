// La URL pública tiene que estar escrita en UN solo lugar.
//
// El defecto que estas pruebas existen para impedir: el host aparecía a mano
// en index.html y en las siete URLs absolutas de android/twa-manifest.json.
// La copia que queda vieja en el APK no se arregla con un deploy —el host va
// firmado adentro—: obliga a recompilar y reinstalar en los seis teléfonos.
//
// Corre en Node (vitest environment 'node'), leyendo los archivos reales.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error — .mjs sin tipos propios; acá sólo se usa en la prueba.
import { lerArquivoUrl, twaManifestPara } from '../../../scripts/url-publica.mjs'

const RAIZ = resolve(__dirname, '../../..')
const ler = (p: string) => readFileSync(resolve(RAIZ, p), 'utf8')

describe('a URL pública vive num só lugar', () => {
  const url: string = lerArquivoUrl()

  it('config/url-publica.txt tem uma origem https sem barra no fim', () => {
    expect(url).toMatch(/^https:\/\/[^/]+$/)
  })

  it('android/twa-manifest.json está alinhado com a fonte única', () => {
    // Es el mismo `--check` que corre el script; acá falla en `npm test`, que
    // es donde alguien lo va a ver antes de compilar un APK equivocado.
    expect(ler('android/twa-manifest.json').trim()).toBe(twaManifestPara(url).trim())
  })

  it('index.html não escreve nenhum host a mão: usa %VENTUS_URL%', () => {
    const html = ler('index.html')
    expect(html).toContain('content="%VENTUS_URL%/og-image.png"')
    // Ninguna URL absoluta http(s) fuera de los placeholders. Si mañana entra
    // un CDN o una fuente externa, esta prueba lo hace visible a propósito.
    const absolutas = html.match(/https?:\/\/[^"'\s]+/g) ?? []
    expect(absolutas).toEqual([])
  })

  it('o assetlinks publicado aponta ao mesmo package do twa-manifest', () => {
    const twa = JSON.parse(ler('android/twa-manifest.json')) as { packageId: string }
    const links = JSON.parse(ler('public/.well-known/assetlinks.json')) as Array<{
      target: { package_name: string; sha256_cert_fingerprints: string[] }
    }>
    expect(links[0]?.target.package_name).toBe(twa.packageId)
    // Y no puede seguir siendo el placeholder de 32 ceros: con él la TWA abre
    // con la barra del Chrome encima, que es el síntoma silencioso de todo esto.
    for (const fp of links[0]?.target.sha256_cert_fingerprints ?? []) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
      expect(fp).not.toMatch(/^(00:){31}00$/)
    }
  })
})
