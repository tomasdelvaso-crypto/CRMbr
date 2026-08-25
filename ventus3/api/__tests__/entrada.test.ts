// api/__tests__/entrada.test.ts
// Las dos puertas de entrada que se rompen en silencio:
//
//   · EL PARSER MULTIPART. Está hecho a mano sobre Buffer (dos campos no
//     justifican traer busboy a un bundle serverless). Si corta un byte de
//     más, el audio llega corrupto y Groq devuelve una transcripción vacía sin
//     decir por qué. Por eso el test compara BYTES, no texto.
//   · EL CLASIFICADOR DEL MOTOR. Decide si un turno gasta tokens o no. Si
//     clasifica de más, se come relatos que tenían que ir al modelo; si
//     clasifica de menos, el equipo paga opus para contar filas.

import { describe, expect, it } from 'vitest'
import { boundaryDoContentType, parseMultipart } from '../_lib/multipart'
import { extensaoDoMime, nomeSeguro } from '../_lib/groq'
import { classificar, responderSemTokens } from '../_lib/motor'
import type { CarteiraDoVendedor } from '../_lib/carteira'

/* ══════════════════════════════════════════════════════════════════════════
   Multipart
   ══════════════════════════════════════════════════════════════════════════ */

function montarMultipart(boundary: string, meta: string, audio: Buffer): Buffer {
  const partes: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\nContent-Type: application/json\r\n\r\n${meta}\r\n`,
      'utf8',
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="nota.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
      'utf8',
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]
  return Buffer.concat(partes)
}

describe('parseMultipart', () => {
  const boundary = '----WebKitFormBoundaryQ7dK2xVn'
  // Bytes que rompen cualquier parser que pase por string: 0x00, 0x0d, 0x0a,
  // y un byte alto que no es UTF-8 válido.
  const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x0d, 0x0a, 0xff, 0xfe, 0x42])

  it('extrai o boundary do Content-Type', () => {
    expect(boundaryDoContentType(`multipart/form-data; boundary=${boundary}`)).toBe(boundary)
    expect(boundaryDoContentType(`multipart/form-data; boundary="${boundary}"`)).toBe(boundary)
    expect(boundaryDoContentType('application/json')).toBeNull()
    expect(boundaryDoContentType(undefined)).toBeNull()
  })

  it('separa os dois campos do contrato', () => {
    const corpo = montarMultipart(boundary, '{"versao":"1"}', audio)
    const partes = parseMultipart(corpo, boundary)
    expect(partes.map((p) => p.nome)).toEqual(['meta', 'arquivo'])
  })

  it('devolve o áudio byte a byte, sem tocar nos bytes altos', () => {
    const corpo = montarMultipart(boundary, '{"versao":"1"}', audio)
    const parte = parseMultipart(corpo, boundary).find((p) => p.nome === 'arquivo')
    expect(parte?.conteudo.equals(audio)).toBe(true)
    expect(parte?.conteudo.length).toBe(audio.length)
  })

  it('preserva o filename e o content-type do arquivo', () => {
    const corpo = montarMultipart(boundary, '{}', audio)
    const parte = parseMultipart(corpo, boundary).find((p) => p.nome === 'arquivo')
    expect(parte?.nomeDeArquivo).toBe('nota.webm')
    expect(parte?.contentType).toBe('audio/webm')
  })

  it('devolve o meta como JSON íntegro, com acentos', () => {
    const meta = JSON.stringify({ versao: '1', vendor: 'Victor Hugo', obs: 'reunião com ação' })
    const corpo = montarMultipart(boundary, meta, audio)
    const parte = parseMultipart(corpo, boundary).find((p) => p.nome === 'meta')
    expect(JSON.parse(parte?.conteudo.toString('utf8') ?? '{}')).toMatchObject({ obs: 'reunião com ação' })
  })

  it('ignora o preâmbulo e o delimitador final', () => {
    const corpo = Buffer.concat([
      Buffer.from('preâmbulo que alguns clientes mandam\r\n', 'utf8'),
      montarMultipart(boundary, '{}', audio),
    ])
    expect(parseMultipart(corpo, boundary)).toHaveLength(2)
  })
})

describe('nome do arquivo para o ASR', () => {
  it('traduz o mimeType negociado pelo navegador', () => {
    // Android manda webm/opus; iOS <= 18.3 manda mp4.
    expect(extensaoDoMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensaoDoMime('audio/mp4')).toBe('m4a')
    expect(extensaoDoMime('audio/ogg')).toBe('ogg')
  })

  it('cai para .ogg quando o mime é desconhecido — Groq valida por extensão', () => {
    expect(nomeSeguro('application/octet-stream')).toBe('audio.ogg')
    expect(nomeSeguro(null)).toBe('audio.ogg')
  })

  it('respeita uma extensão que o Groq aceita', () => {
    expect(nomeSeguro('audio/webm', 'gravacao.m4a')).toBe('audio.m4a')
  })

  it('descarta a extensão que o Groq rejeita, como o .oga do Telegram', () => {
    expect(nomeSeguro('audio/ogg', 'voice.oga')).toBe('audio.ogg')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Motor determinístico
   ══════════════════════════════════════════════════════════════════════════ */

describe('classificar', () => {
  it('reconhece as consultas que não precisam de modelo', () => {
    expect(classificar('o que eu faço hoje?')).toBe('pendentes')
    expect(classificar('quem tá sem contato há 20 dias')).toBe('sem_toque')
    expect(classificar('como tá o pipeline')).toBe('pipeline')
    expect(classificar('quais são meus compromissos')).toBe('compromissos')
    expect(classificar('em que pé tá a Tetra Pak')).toBe('status_cliente')
  })

  it('não sequestra um relato: isso vai para o modelo', () => {
    expect(
      classificar(
        'Falei agora com o Marcelo da linha 3. Ele disse que a caixa continua abrindo no transporte e que já perderam três cargas esse mês. Ficou de me mandar o volume mensal até sexta e a gente marca o teste na semana que vem.',
      ),
    ).toBeNull()
  })

  it('não sequestra um pedido de redação nem um diagnóstico', () => {
    expect(classificar('escreve um whats pro Marcelo')).toBeNull()
    expect(classificar('me dá uma jogada pra destravar esse negócio')).toBeNull()
  })
})

describe('responderSemTokens', () => {
  const carteira: CarteiraDoVendedor = {
    vendor: 'Victor Hugo',
    vendorInfo: null,
    oportunidades: [
      {
        id: 47,
        created_at: '2026-01-01',
        name: 'Linha 3',
        client: 'Tetra Pak',
        vendor: 'Victor Hugo',
        value: 250_000,
        stage: 2,
        priority: 'alta',
        expected_close: null,
        next_action: null,
        next_action_date: null,
        product: 'BP555',
        product_lines: ['better_pack'],
        power_sponsor: null,
        sponsor: 'Marcelo',
        influencer: null,
        support_contact: null,
        probability: 20,
        last_update: '2026-05-01T12:00:00Z',
        last_activity_date: null,
        scales: { dor: 3, poder: 2, visao: 1, valor: 0, controle: 0, compras: 0 },
        health_score: null,
        is_stalled: null,
        industry: 'Alimentos',
        loss_reason: null,
        outcome: null,
        outcome_notes: null,
        updated_at: null,
      },
    ],
    leads: [],
    atividades: [],
    tarefas: [],
    compromissos: [],
    touchpoints: [],
    hoje: '2026-08-25',
  }

  it('responde o pipeline com números, sem gastar um token', () => {
    const r = responderSemTokens('como tá o pipeline', carteira)
    expect(r?.tokens).toBe(0)
    expect(r?.texto).toContain('1 oportunidades vivas')
    expect(r?.texto).toContain('sem próxima ação com data')
  })

  it('responde o status do cliente citado pelo nome', () => {
    const r = responderSemTokens('em que pé tá a Tetra?', carteira)
    expect(r?.intencao).toBe('status_cliente')
    expect(r?.texto).toContain('Tetra Pak')
    // El gate trabado es lo primero que tiene que ver el vendedor.
    expect(r?.texto).toContain('Trava para avançar')
    expect(r?.texto).toContain('Próxima ação: não existe')
  })

  it('lista o silêncio com a janela pedida', () => {
    const r = responderSemTokens('quem tá sem contato há 30 dias', carteira)
    expect(r?.texto).toContain('sem contato há 30 dias')
    expect(r?.texto).toContain('Tetra Pak')
  })

  it('devolve null quando não sabe: aí sim entra o modelo', () => {
    expect(responderSemTokens('escreve um e-mail pro Marcelo', carteira)).toBeNull()
  })

  it('não inventa cliente quando o nome não está na carteira', () => {
    // 'status_cliente' sem cliente reconhecido devolve null em vez de chutar.
    expect(responderSemTokens('em que pé tá a Ambev?', carteira)).toBeNull()
  })
})
