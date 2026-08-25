// api/__tests__/fake-supabase.ts
// Doble de prueba del cliente de Supabase.
//
// No es un mock que devuelve siempre lo mismo: registra las llamadas (tabla,
// operación, payload, filtros) y responde de una cola programada por clave
// `op:tabla`. Eso permite escribir tests que afirman COSAS DE VERDAD —«el
// commit no llamó a la RPC porque la acción ya estaba commiteada»— en vez de
// tests que solo comprueban que la función no explota.
//
// El builder es «thenable»: `await db.from('x').update(...).eq(...)` y
// `await db.from('x').select(...).maybeSingle()` resuelven los dos, que es
// exactamente cómo se comporta postgrest-js.

export interface RespostaFake {
  data: unknown
  error: { code: string; message: string } | null
  count?: number | null
}

export interface ChamadaFake {
  op: string
  tabela: string
  payload?: unknown
  filtros: Array<{ metodo: string; coluna: string; valor: unknown }>
  colunas?: string
}

export interface FakeDb {
  from(tabela: string): FakeBuilder
  rpc(nome: string, args?: Record<string, unknown>): Promise<RespostaFake>
  /** Programa la próxima respuesta para `op:tabla` (o `rpc:nombre`). */
  responder(chave: string, resposta: RespostaFake): void
  /** Todas las llamadas, en orden. */
  readonly chamadas: ChamadaFake[]
  /** Cuántas veces se llamó `op:tabla`. */
  contar(chave: string): number
}

interface FakeBuilder extends PromiseLike<RespostaFake> {
  select(colunas?: string, opcoes?: unknown): FakeBuilder
  insert(payload: unknown): FakeBuilder
  update(payload: unknown): FakeBuilder
  delete(): FakeBuilder
  eq(coluna: string, valor: unknown): FakeBuilder
  is(coluna: string, valor: unknown): FakeBuilder
  gte(coluna: string, valor: unknown): FakeBuilder
  like(coluna: string, valor: unknown): FakeBuilder
  in(coluna: string, valor: unknown): FakeBuilder
  limit(n: number): FakeBuilder
  maybeSingle(): Promise<RespostaFake>
  single(): Promise<RespostaFake>
}

const VAZIO: RespostaFake = { data: null, error: null, count: 0 }

export function criarFakeDb(): FakeDb {
  const fila = new Map<string, RespostaFake[]>()
  const chamadas: ChamadaFake[] = []

  const proxima = (chave: string): RespostaFake => {
    const pendentes = fila.get(chave)
    if (pendentes && pendentes.length > 0) return pendentes.shift() as RespostaFake
    return VAZIO
  }

  function builder(tabela: string): FakeBuilder {
    const registro: ChamadaFake = { op: 'select', tabela, filtros: [] }
    chamadas.push(registro)

    const filtro = (metodo: string) => (coluna: string, valor: unknown) => {
      registro.filtros.push({ metodo, coluna, valor })
      return b
    }

    const resolver = (): Promise<RespostaFake> => Promise.resolve(proxima(`${registro.op}:${tabela}`))

    const b: FakeBuilder = {
      select(colunas?: string) {
        if (registro.op === 'select') registro.colunas = colunas
        return b
      },
      insert(payload: unknown) {
        registro.op = 'insert'
        registro.payload = payload
        return b
      },
      update(payload: unknown) {
        registro.op = 'update'
        registro.payload = payload
        return b
      },
      delete() {
        registro.op = 'delete'
        return b
      },
      eq: filtro('eq'),
      is: filtro('is'),
      gte: filtro('gte'),
      like: filtro('like'),
      in: filtro('in'),
      limit() {
        return b
      },
      maybeSingle: resolver,
      single: resolver,
      then(aoResolver, aoRejeitar) {
        return resolver().then(aoResolver, aoRejeitar)
      },
    }
    return b
  }

  return {
    from: builder,
    rpc(nome: string, args?: Record<string, unknown>) {
      chamadas.push({ op: 'rpc', tabela: nome, payload: args, filtros: [] })
      return Promise.resolve(proxima(`rpc:${nome}`))
    },
    responder(chave: string, resposta: RespostaFake) {
      const atual = fila.get(chave) ?? []
      atual.push(resposta)
      fila.set(chave, atual)
    },
    chamadas,
    contar(chave: string) {
      const [op, alvo] = chave.split(':')
      return chamadas.filter((c) => c.op === op && c.tabela === alvo).length
    },
  }
}
