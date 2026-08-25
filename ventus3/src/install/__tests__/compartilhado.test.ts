// src/install/__tests__/compartilhado.test.ts
// El contrato del share_target lo escriben dos programas distintos —el
// service worker y la app— y viven en tsconfigs distintos. Estos tests son
// lo único que garantiza que sigan hablando el mismo idioma.

import { describe, expect, it } from 'vitest'
import {
  VALIDADE_COMPARTILHADO_MS,
  instanteDoId,
  novoId,
  prefixoDoId,
  urlDoArquivo,
  urlDoPacote,
} from '../contrato-share'
import { idCompartilhadoDaUrl } from '../compartilhado'

const AGORA = 1_800_000_000_000

describe('ids del paquete compartido', () => {
  it('vuelve a leer el instante que codificó', () => {
    const id = novoId(AGORA, 'ab12cd')
    expect(instanteDoId(id)).toBe(AGORA)
  })

  it('devuelve null para un id que no tiene la forma esperada', () => {
    expect(instanteDoId('')).toBeNull()
    expect(instanteDoId('zzz-!')).toBe(Number.parseInt('zzz', 36))
    expect(instanteDoId('-abc')).toBeNull()
  })

  it('permite decidir la caducidad sin abrir el paquete', () => {
    const viejo = novoId(AGORA - VALIDADE_COMPARTILHADO_MS - 1, 'aaa111')
    const instante = instanteDoId(viejo)
    expect(instante).not.toBeNull()
    expect(AGORA - (instante ?? 0) > VALIDADE_COMPARTILHADO_MS).toBe(true)
  })

  it('las claves del cache cuelgan todas del mismo prefijo', () => {
    const id = novoId(AGORA, 'ab12cd')
    expect(urlDoPacote(id).startsWith(prefixoDoId(id))).toBe(true)
    expect(urlDoArquivo(id, 0).startsWith(prefixoDoId(id))).toBe(true)
    expect(urlDoArquivo(id, 3)).not.toBe(urlDoArquivo(id, 4))
  })
})

describe('idCompartilhadoDaUrl', () => {
  it('reconoce el parámetro que pone el service worker', () => {
    const id = novoId(AGORA, 'ab12cd')
    expect(idCompartilhadoDaUrl(`?compartilhado=${id}`)).toBe(id)
  })

  it('ignora una navegación normal', () => {
    expect(idCompartilhadoDaUrl('')).toBeNull()
    expect(idCompartilhadoDaUrl('?source=pwa')).toBeNull()
  })

  it('rechaza un id inventado a mano', () => {
    // Sin esto, un link armado podría hacer leer claves arbitrarias del cache.
    expect(idCompartilhadoDaUrl('?compartilhado=../../otro')).toBeNull()
    expect(idCompartilhadoDaUrl('?compartilhado=SEM-TRAÇO')).toBeNull()
    expect(idCompartilhadoDaUrl('?compartilhado=semtraco')).toBeNull()
  })
})
