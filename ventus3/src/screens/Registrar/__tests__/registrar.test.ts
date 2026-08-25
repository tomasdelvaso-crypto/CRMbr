// src/screens/Registrar/__tests__/registrar.test.ts
// Las tres decisiones de esta pantalla que no se pueden verificar mirándola:
// la negociación de mimeType (necesitaría cuatro navegadores), el gate de
// próxima acción (el arreglo de mayor impacto del plan) y el umbral de
// desambiguación de cliente (el que evita registrar en el cliente errado).

import { describe, expect, it } from 'vitest'
import { MIMES_CANDIDATOS, negociarMimeType } from '../gravacao'
import {
  faltantes,
  podeConfirmar,
  rascunhoDeResposta,
  rascunhoOffline,
  reduzir,
  textoDoQueFalta,
  type ContextoRascunho,
} from '../rascunho'
import { CONTRATO_VERSAO, type IngestResponse } from '../contrato'
import type { AlvoRegistro } from '@/data'

/* ── Matriz de navegadores ─────────────────────────────────────────────── */

/** Fábrica de un isTypeSupported que solo acepta esta lista. */
function soporta(...aceptados: string[]): (mime: string) => boolean {
  return (mime) => aceptados.includes(mime)
}

describe('negociarMimeType', () => {
  it('elige opus en Chrome/Android, que es lo mejor para Whisper', () => {
    expect(negociarMimeType(soporta('audio/webm;codecs=opus', 'audio/webm'))).toBe(
      'audio/webm;codecs=opus',
    )
  })

  it('cae a mp4 en Safari iOS <= 18.3, que no soporta webm en MediaRecorder', () => {
    // Es el caso que rompe el pipeline si no se negocia: el constructor de
    // MediaRecorder lanza NotSupportedError con un mimeType webm.
    expect(negociarMimeType(soporta('audio/mp4'))).toBe('audio/mp4')
  })

  it('vuelve a preferir opus en Safari iOS >= 18.4', () => {
    expect(negociarMimeType(soporta('audio/mp4', 'audio/webm;codecs=opus'))).toBe(
      'audio/webm;codecs=opus',
    )
  })

  it('devuelve null cuando no hay isTypeSupported: decide el navegador', () => {
    // null NO significa «no se puede grabar»: significa construir el
    // MediaRecorder sin opciones y leer recorder.mimeType después.
    expect(negociarMimeType(null)).toBeNull()
  })

  it('devuelve null si el navegador no acepta ninguno de los candidatos', () => {
    expect(negociarMimeType(soporta('video/x-matroska'))).toBeNull()
  })

  it('sobrevive a un isTypeSupported que lanza', () => {
    const explota = (mime: string): boolean => {
      if (mime.includes('webm')) throw new Error('WebView roto')
      return mime === 'audio/mp4'
    }
    expect(negociarMimeType(explota)).toBe('audio/mp4')
  })

  it('nunca ofrece un contenedor de video', () => {
    for (const mime of MIMES_CANDIDATOS) expect(mime.startsWith('audio/')).toBe(true)
  })
})

/* ── Fixtures ──────────────────────────────────────────────────────────── */

const TETRA: AlvoRegistro = {
  kind: 'opportunity',
  id: 46,
  nome: 'Tetra Pak — linha 3',
  cliente: 'Tetra Pak',
  detalhe: 'Qualificação',
  valor: 180000,
  diasSemContato: 9,
  toques: 0,
  busca: 'tetra pak linha 3',
}

const TETRAPACK_SP: AlvoRegistro = { ...TETRA, id: 47, nome: 'Tetra Pak SP', busca: 'tetra pak sp' }

function ctx(extra: Partial<ContextoRascunho> = {}): ContextoRascunho {
  return {
    clientUuid: 'uuid-1',
    fonte: 'audio',
    duracaoSeg: 22,
    alvoInicial: null,
    alvos: [TETRA, TETRAPACK_SP],
    papeisOcupados: new Set(),
    simulado: false,
    ...extra,
  }
}

function resposta(parcial: Partial<IngestResponse['extracao']> = {}): IngestResponse {
  return {
    versao: CONTRATO_VERSAO,
    clientUuid: 'uuid-1',
    transcricao: 'texto',
    duracaoMs: 2000,
    aviso: null,
    extracao: {
      candidatos: [],
      tipo: 'call',
      resumo: 'Falei com o Marcelo.',
      resultado: 'positivo',
      resultadoTexto: null,
      proximaAcao: null,
      escalas: [],
      contatos: [],
      etapaSugerida: null,
      metodologia: null,
      sinais: [],
      ...parcial,
    },
  }
}

/* ── El gate de próxima acción (M5) ────────────────────────────────────── */

describe('gate de próxima ação', () => {
  it('no deja confirmar sin fecha, aunque haya texto de próxima acción', () => {
    let r = rascunhoDeResposta(
      resposta({
        candidatos: [
          { kind: 'opportunity', id: 46, nome: TETRA.nome, cliente: 'Tetra Pak', confianca: 0.95, motivo: 'x' },
        ],
        proximaAcao: { texto: 'Ligar para o Marcelo', data: null, atalho: null },
      }),
      ctx(),
    )
    expect(r.alvo?.id).toBe(46)
    expect(faltantes(r).data).toBe(true)
    expect(podeConfirmar(r)).toBe(false)
    expect(textoDoQueFalta(r)).toBe('Escolha a data da próxima ação')

    // Un solo toque en una pastilla de fecha lo destraba: ese es todo el fix.
    r = reduzir(r, { tipo: 'proximaAcaoData', valor: '2026-08-26' }) as NonNullable<typeof r>
    expect(podeConfirmar(r)).toBe(true)
  })

  it('no deja confirmar sin cliente aunque todo lo demás esté', () => {
    let r = rascunhoDeResposta(
      resposta({ proximaAcao: { texto: 'Enviar proposta', data: '2026-08-26', atalho: 'amanha' } }),
      ctx(),
    )
    expect(r.alvo).toBeNull()
    expect(textoDoQueFalta(r)).toBe('Escolha o cliente')
    r = reduzir(r, { tipo: 'alvo', alvo: TETRA, papeisOcupados: new Set() }) as NonNullable<typeof r>
    expect(podeConfirmar(r)).toBe(true)
  })

  it('elegir la fecha apaga la marca de «sugerido»: la decisión pasó a ser del vendedor', () => {
    const r = rascunhoDeResposta(
      resposta({ proximaAcao: { texto: 'Ligar', data: '2026-08-26', atalho: 'amanha' } }),
      ctx({ alvoInicial: TETRA }),
    )
    expect(r.dataSugerida).toBe(true)
    const depois = reduzir(r, { tipo: 'proximaAcaoData', valor: '2026-08-31' })
    expect(depois?.dataSugerida).toBe(false)
  })
})

/* ── Desambiguación de cliente ─────────────────────────────────────────── */

describe('match de cliente', () => {
  it('preselecciona cuando hay un candidato claro', () => {
    const r = rascunhoDeResposta(
      resposta({
        candidatos: [
          { kind: 'opportunity', id: 46, nome: TETRA.nome, cliente: 'Tetra Pak', confianca: 0.93, motivo: 'x' },
        ],
      }),
      ctx(),
    )
    expect(r.alvo?.id).toBe(46)
  })

  it('NO preselecciona con dos candidatos parejos: pregunta', () => {
    // Preseleccionar acá es peor que preguntar: el vendedor confirma en piloto
    // automático y el registro entero va al cliente equivocado.
    const r = rascunhoDeResposta(
      resposta({
        candidatos: [
          { kind: 'opportunity', id: 46, nome: TETRA.nome, cliente: 'Tetra Pak', confianca: 0.52, motivo: 'x' },
          { kind: 'opportunity', id: 47, nome: 'Tetra Pak SP', cliente: 'Tetra Pak', confianca: 0.48, motivo: 'y' },
        ],
      }),
      ctx(),
    )
    expect(r.alvo).toBeNull()
    expect(r.candidatos).toHaveLength(2)
  })

  it('nunca resuelve un candidato que no está en la cartera local', () => {
    const r = rascunhoDeResposta(
      resposta({
        candidatos: [
          { kind: 'opportunity', id: 999, nome: 'Cliente Inventado', cliente: 'X', confianca: 0.99, motivo: 'x' },
        ],
      }),
      ctx(),
    )
    expect(r.alvo).toBeNull()
  })
})

/* ── Propuestas del Ventus ─────────────────────────────────────────────── */

describe('Ventus sugere', () => {
  it('descarta las propuestas sin cita: sin prueba no hay número', () => {
    const r = rascunhoDeResposta(
      resposta({
        escalas: [
          { escala: 'dor', de: 3, para: 7, citacao: 'perdemos três cargas', fonte: null, confianca: 0.9 },
          { escala: 'valor', de: 1, para: 8, citacao: '   ', fonte: null, confianca: 0.9 },
        ],
      }),
      ctx({ alvoInicial: TETRA }),
    )
    expect(r.escalas.map((e) => e.escala)).toEqual(['dor'])
  })

  it('nace todo pendiente: nada se aplica sin que el vendedor lo toque', () => {
    const r = rascunhoDeResposta(
      resposta({
        escalas: [
          { escala: 'dor', de: 3, para: 7, citacao: 'perdemos cargas', fonte: null, confianca: 0.9 },
        ],
      }),
      ctx({ alvoInicial: TETRA }),
    )
    expect(r.escalas[0]?.estado).toBe('pendente')
  })

  it('editar una escala la acepta y la marca como editada', () => {
    const r = rascunhoDeResposta(
      resposta({
        escalas: [
          { escala: 'dor', de: 3, para: 9, citacao: 'perdemos cargas', fonte: null, confianca: 0.9 },
        ],
      }),
      ctx({ alvoInicial: TETRA }),
    )
    const depois = reduzir(r, {
      tipo: 'escalaEditar',
      escala: 'dor',
      para: 6,
      citacao: 'a caixa abre no transporte',
      fonte: 'Marcelo, produção',
    })
    expect(depois?.escalas[0]).toMatchObject({ para: 6, estado: 'aceita', editada: true })
  })

  it('un papel de contacto ya ocupado nace descartado y nunca se pisa', () => {
    const r = rascunhoDeResposta(
      resposta({
        contatos: [{ papel: 'sponsor', nome: 'Marcelo', cargo: 'Produção', confianca: 0.8 }],
      }),
      ctx({ alvoInicial: TETRA, papeisOcupados: new Set(['sponsor']) }),
    )
    expect(r.contatos[0]?.estado).toBe('dispensada')
    expect(r.contatos[0]?.ocupado).toBe(true)
  })
})

/* ── Sin red ───────────────────────────────────────────────────────────── */

describe('borrador offline', () => {
  it('marca el audio como pendiente y no exige resumen escrito a mano', () => {
    const r = rascunhoOffline(ctx({ alvoInicial: TETRA }), 'sem rede')
    expect(r.pendenteDeTranscricao).toBe(true)
    expect(faltantes(r).resumo).toBe(false)
    // Pero el gate sigue en pie: sin próxima acción con fecha no cierra.
    expect(podeConfirmar(r)).toBe(false)
    expect(textoDoQueFalta(r)).toBe('Diga qual é a próxima ação')
  })

  it('no pierde el texto que el vendedor acababa de escribir', () => {
    const r = rascunhoOffline(
      ctx({ fonte: 'texto', duracaoSeg: 0, textoOriginal: 'Reunião com o comprador.' }),
      'sem rede',
    )
    expect(r.resumo).toBe('Reunião com o comprador.')
    expect(r.pendenteDeTranscricao).toBe(false)
  })

  it('con fuente de texto SÍ exige resumen: no hay transcripción que esperar', () => {
    const r = rascunhoOffline(ctx({ fonte: 'texto', duracaoSeg: 0 }), 'sem rede')
    expect(faltantes(r).resumo).toBe(true)
  })
})
