// api/telegram/__tests__/pareamento.test.ts
// El ciclo completo del código de 6 dígitos: emisión (`POST /api/pairing-code`)
// y consumo (`/vincular <código>`).
//
// Es el mecanismo que decide QUIÉN es cada persona dentro del CRM. Las tres
// propiedades que se afirman acá son las que, si se rompen, dejan a alguien
// registrando visitas a nombre de otro:
//
//   1. EL VENDEDOR SALE DEL JWT, NUNCA DEL CUERPO. El cliente manda
//      `vendor_id` y el servidor lo ignora.
//   2. EL CÓDIGO ES DE UN SOLO USO Y VENCE. Y pedir uno nuevo mata al anterior:
//      dos códigos vivos del mismo vendedor son dos llaves de la misma puerta.
//   3. EL NÚMERO ES CRIPTOGRÁFICO. Seis dígitos son un millón de valores; con
//      `Math.random` adivinar el código vivo de otro deja de ser suerte.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarFakeDb, type FakeDb } from '../../__tests__/fake-supabase.js'
import type { AuthContext } from '../../_lib/auth.js'
import type { ApiResponse } from '../../_lib/http.js'

/* ══════════════════════════════════════════════════════════════════════════
   Dobles
   ══════════════════════════════════════════════════════════════════════════ */

const bd = vi.hoisted(() => ({ atual: null as unknown }))

vi.mock('../../_lib/supabase.js', () => ({
  serviceClient: () => bd.atual,
}))

vi.mock('../../_lib/auth.js', async (original) => ({
  ...(await original<typeof import('../../_lib/auth.js')>()),
  requireAuth: vi.fn(),
}))

const auth = await import('../../_lib/auth.js')
const http = await import('../../_lib/http.js')
const pairing = await import('../../pairing-code.js')
const { vincularPorCodigo } = await import('../_lib/identidade.js')

const CTX: AuthContext = {
  userId: 'auth-andre',
  vendorName: 'Andre',
  vendorId: 5,
  isAdmin: false,
  email: 'andre@ventapel.com.br',
  expiraEm: 0,
}

interface RespostaFalsa {
  codigo: number
  corpo: unknown
}

function falsaResposta(): { res: ApiResponse; visto: RespostaFalsa } {
  const visto: RespostaFalsa = { codigo: 0, corpo: null }
  const res = {
    status(codigo: number) {
      visto.codigo = codigo
      return res
    },
    json(corpo: unknown) {
      visto.corpo = corpo
    },
    send(corpo: string) {
      visto.corpo = corpo
    },
    setHeader() {
      /* CORS: no se mide acá. */
    },
    end() {
      /* vacío */
    },
  }
  return { res: res as unknown as ApiResponse, visto }
}

async function pedirCodigo(
  corpo: unknown = { vendor_id: 99 },
  metodo = 'POST',
): Promise<RespostaFalsa> {
  const { res, visto } = falsaResposta()
  await pairing.default(
    { method: metodo, headers: { authorization: 'Bearer jwt-de-teste' }, query: {}, body: corpo },
    res,
  )
  return visto
}

function db(): FakeDb {
  return bd.atual as FakeDb
}

beforeEach(() => {
  bd.atual = criarFakeDb()
  vi.mocked(auth.requireAuth).mockResolvedValue(CTX)
})

/* ══════════════════════════════════════════════════════════════════════════
   1 · El número
   ══════════════════════════════════════════════════════════════════════════ */

describe('gerarCodigo', () => {
  it('sempre 6 dígitos, zeros à esquerda incluídos', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(pairing.gerarCodigo()).toMatch(/^[0-9]{6}$/)
    }
  })

  it('não é uma constante disfarçada: 300 sorteios dão muitos valores distintos', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 300; i += 1) vistos.add(pairing.gerarCodigo())
    // Con un millón de valores, 300 sorteos casi nunca repiten. 280 deja un
    // margen enorme y aun así falla ruidosamente si alguien vuelve a un
    // generador degenerado.
    expect(vistos.size).toBeGreaterThan(280)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   2 · Emisión
   ══════════════════════════════════════════════════════════════════════════ */

describe('POST /api/pairing-code', () => {
  it('emite o código e devolve o vencimento que a tela conta', async () => {
    const antes = Date.now()
    const visto = await pedirCodigo()

    expect(visto.codigo).toBe(200)
    const corpo = visto.corpo as { ok: boolean; codigo: string; expira_em: string }
    expect(corpo.ok).toBe(true)
    expect(corpo.codigo).toMatch(/^[0-9]{6}$/)

    const vida = Date.parse(corpo.expira_em) - antes
    expect(vida).toBeGreaterThan(9 * 60_000)
    expect(vida).toBeLessThanOrEqual(pairing.TTL_CODIGO_MS + 2_000)
  })

  it('IGNORA o vendor_id do corpo e usa o do JWT', async () => {
    await pedirCodigo({ vendor_id: 99 })
    const insercao = db().chamadas.find((c) => c.op === 'insert' && c.tabela === 'pairing_codes')
    const payload = insercao?.payload as { vendor_id: number; criado_por: string; tentativas: number }
    expect(payload.vendor_id).toBe(5)
    expect(payload.criado_por).toBe('Andre')
    expect(payload.tentativas).toBe(0)
  })

  it('funciona com o corpo vazio: o pedido não precisa dizer nada', async () => {
    const visto = await pedirCodigo({})
    expect(visto.codigo).toBe(200)
  })

  it('QUEIMA os códigos vivos anteriores ANTES de inserir o novo', async () => {
    await pedirCodigo()
    const chamadas = db().chamadas
    const iQueima = chamadas.findIndex((c) => c.op === 'update' && c.tabela === 'pairing_codes')
    const iInsercao = chamadas.findIndex((c) => c.op === 'insert' && c.tabela === 'pairing_codes')

    expect(iQueima).toBeGreaterThanOrEqual(0)
    expect(iQueima).toBeLessThan(iInsercao)

    const queima = chamadas[iQueima]
    expect(queima?.payload).toEqual({ tentativas: 5 })
    // Sólo los suyos, y sólo los que nadie usó todavía.
    expect(queima?.filtros).toContainEqual({ metodo: 'eq', coluna: 'vendor_id', valor: 5 })
    expect(queima?.filtros).toContainEqual({ metodo: 'is', coluna: 'usado_em', valor: null })
  })

  it('conta o teto só sobre os códigos DESTE vendedor e dentro da janela', async () => {
    await pedirCodigo()
    const contagem = db().chamadas.find((c) => c.op === 'select' && c.tabela === 'pairing_codes')
    expect(contagem?.filtros).toContainEqual({ metodo: 'eq', coluna: 'vendor_id', valor: 5 })
    const janela = contagem?.filtros.find((f) => f.metodo === 'gte' && f.coluna === 'created_at')
    expect(janela).toBeDefined()
    const desde = Date.parse(String(janela?.valor))
    expect(Date.now() - desde).toBeCloseTo(pairing.JANELA_LIMITE_MS, -4)
  })

  it('no teto responde 429 e NÃO emite', async () => {
    db().responder('select:pairing_codes', {
      data: null,
      error: null,
      count: pairing.MAX_CODIGOS_POR_HORA,
    })
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(429)
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })

  it('um sorteio abaixo do teto ainda emite', async () => {
    db().responder('select:pairing_codes', {
      data: null,
      error: null,
      count: pairing.MAX_CODIGOS_POR_HORA - 1,
    })
    expect((await pedirCodigo()).codigo).toBe(200)
  })

  it('sorteia de novo quando o código colide (23505), sem perder o pedido', async () => {
    db().responder('insert:pairing_codes', { data: null, error: { code: '23505', message: 'duplicate key' } })
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(200)
    expect(db().contar('insert:pairing_codes')).toBe(2)

    const codigos = db()
      .chamadas.filter((c) => c.op === 'insert' && c.tabela === 'pairing_codes')
      .map((c) => (c.payload as { codigo: string }).codigo)
    expect(codigos[0]).not.toBe(codigos[1])
  })

  it('sem a tabela (migração 0006 não aplicada) responde 503 e diz o porquê em PT-BR', async () => {
    db().responder('select:pairing_codes', { data: null, error: { code: '42P01', message: 'sem tabela' } })
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(503)
    expect(JSON.stringify(visto.corpo)).toContain('Telegram')
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })

  it('fail-CLOSED: se não dá para medir o teto, não emite', async () => {
    db().responder('select:pairing_codes', { data: null, error: { code: '57014', message: 'timeout' } })
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(503)
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })

  it('sem sessão não emite nada', async () => {
    vi.mocked(auth.requireAuth).mockRejectedValue(http.naoAutorizado())
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(401)
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })

  it('um usuário sem vendedor recebe 403, não um código órfão', async () => {
    vi.mocked(auth.requireAuth).mockResolvedValue({ ...CTX, vendorId: null })
    const visto = await pedirCodigo()
    expect(visto.codigo).toBe(403)
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })

  it('só POST', async () => {
    const visto = await pedirCodigo({}, 'GET')
    expect(visto.codigo).toBe(405)
    expect(db().contar('insert:pairing_codes')).toBe(0)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   3 · Consumo — `/vincular <código>`
   ══════════════════════════════════════════════════════════════════════════ */

const TELEGRAM_ID = 8452693743
const CHAT_ID = 8452693743

function filaDeCodigo(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    codigo: '482913',
    vendor_id: 5,
    expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
    usado_em: null,
    tentativas: 0,
    ...patch,
  }
}

function prepararConsumoFeliz(fila = filaDeCodigo()): void {
  db().responder('select:pairing_codes', { data: fila, error: null })
  db().responder('select:vendors', {
    data: { id: 5, name: 'Andre', is_admin: false, is_active: true, auth_id: 'auth-andre' },
    error: null,
  })
  db().responder('update:pairing_codes', { data: [{ codigo: '482913' }], error: null })
  db().responder('upsert:vendor_channels', { data: null, error: null })
}

describe('/vincular <código>', () => {
  it('o formato se checa antes de tocar no banco', async () => {
    for (const errado of ['12345', '1234567', 'ABC123', '', '48 2913']) {
      const r = await vincularPorCodigo(errado, TELEGRAM_ID, CHAT_ID, false)
      expect(r).toEqual({ ok: false, motivo: 'formato' })
    }
    expect(db().chamadas).toHaveLength(0)
  })

  it('um código que existe e está vivo cria o canal VERIFICADO', async () => {
    prepararConsumoFeliz()
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: true, vendorName: 'Andre' })

    const canal = db().chamadas.find((c) => c.op === 'upsert' && c.tabela === 'vendor_channels')
    const payload = canal?.payload as Record<string, unknown>
    expect(payload['telegram_user_id']).toBe(TELEGRAM_ID)
    expect(payload['chat_id']).toBe(CHAT_ID)
    expect(payload['kind']).toBe('telegram')
    expect(payload['verificado_em']).toEqual(expect.any(String))
    expect(payload['capacidades']).toEqual(['ler', 'registrar', 'confirmar'])
  })

  it('marca o código como usado ANTES de criar o canal — dois /vincular à vez não fazem dois canais', async () => {
    prepararConsumoFeliz()
    await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)

    const chamadas = db().chamadas
    const iMarca = chamadas.findIndex((c) => c.op === 'update' && c.tabela === 'pairing_codes')
    const iCanal = chamadas.findIndex((c) => c.op === 'upsert' && c.tabela === 'vendor_channels')
    expect(iMarca).toBeGreaterThanOrEqual(0)
    expect(iMarca).toBeLessThan(iCanal)
    // Y la marca es CONDICIONAL a que siguiera sin usar.
    expect(chamadas[iMarca]?.filtros).toContainEqual({ metodo: 'is', coluna: 'usado_em', valor: null })
  })

  it('num grupo o canal nasce sem poder confirmar', async () => {
    prepararConsumoFeliz()
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, -100999, true)
    expect(r.ok).toBe(true)
    const canal = db().chamadas.find((c) => c.op === 'upsert' && c.tabela === 'vendor_channels')
    const payload = canal?.payload as Record<string, unknown>
    expect(payload['kind']).toBe('telegram_group')
    expect(payload['capacidades']).toEqual(['ler', 'registrar'])
    expect(payload['is_primary']).toBe(false)
  })

  it('um código inexistente não diz que é inexistente mais do que o necessário', async () => {
    db().responder('select:pairing_codes', { data: null, error: null })
    const r = await vincularPorCodigo('000001', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'inexistente' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
  })

  it('um código VENCIDO não vincula, e queima uma tentativa', async () => {
    db().responder('select:pairing_codes', {
      data: filaDeCodigo({ expira_em: new Date(Date.now() - 1_000).toISOString() }),
      error: null,
    })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'expirado' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
    const marca = db().chamadas.find((c) => c.op === 'update' && c.tabela === 'pairing_codes')
    expect(marca?.payload).toEqual({ tentativas: 1 })
  })

  it('um código JÁ USADO não vincula de novo', async () => {
    db().responder('select:pairing_codes', {
      data: filaDeCodigo({ usado_em: new Date().toISOString() }),
      error: null,
    })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'usado' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
  })

  it('o código queimado pelo pedido de um novo já não serve — é assim que se invalida o anterior', async () => {
    // `POST /api/pairing-code` deixa os anteriores com tentativas = 5.
    db().responder('select:pairing_codes', { data: filaDeCodigo({ tentativas: 5 }), error: null })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'queimado' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
  })

  it('a corrida entre dois /vincular simultâneos deixa passar UM só', async () => {
    db().responder('select:pairing_codes', { data: filaDeCodigo(), error: null })
    db().responder('select:vendors', {
      data: { id: 5, name: 'Andre', is_admin: false, is_active: true, auth_id: 'auth-andre' },
      error: null,
    })
    // El UPDATE condicional no tocó ninguna fila: alguien la marcó primero.
    db().responder('update:pairing_codes', { data: [], error: null })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'usado' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
  })

  it('um vendedor desativado não vincula', async () => {
    db().responder('select:pairing_codes', { data: filaDeCodigo(), error: null })
    db().responder('select:vendors', {
      data: { id: 5, name: 'Andre', is_admin: false, is_active: false, auth_id: 'auth-andre' },
      error: null,
    })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'inexistente' })
    expect(db().contar('upsert:vendor_channels')).toBe(0)
  })

  it('se o banco falha, não se afirma nada sobre o código', async () => {
    db().responder('select:pairing_codes', { data: null, error: { code: '57014', message: 'timeout' } })
    const r = await vincularPorCodigo('482913', TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: false, motivo: 'indisponivel' })
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   4 · El ciclo entero: lo que emite el servidor es lo que consume el bot
   ══════════════════════════════════════════════════════════════════════════ */

describe('emissão → consumo', () => {
  it('o código emitido passa o formato que o bot exige', async () => {
    const visto = await pedirCodigo()
    const { codigo } = visto.corpo as { codigo: string }

    // Se reinicia el doble: es otro request, el del bot.
    bd.atual = criarFakeDb()
    db().responder('select:pairing_codes', { data: filaDeCodigo({ codigo }), error: null })
    db().responder('select:vendors', {
      data: { id: 5, name: 'Andre', is_admin: false, is_active: true, auth_id: 'auth-andre' },
      error: null,
    })
    db().responder('update:pairing_codes', { data: [{ codigo }], error: null })

    const r = await vincularPorCodigo(codigo, TELEGRAM_ID, CHAT_ID, false)
    expect(r).toEqual({ ok: true, vendorName: 'Andre' })
  })

  it('o mesmo código com espaços em volta (o vendedor copia e cola) ainda serve', async () => {
    prepararConsumoFeliz()
    const r = await vincularPorCodigo('  482913 ', TELEGRAM_ID, CHAT_ID, false)
    expect(r.ok).toBe(true)
  })
})
