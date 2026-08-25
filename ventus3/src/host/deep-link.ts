// src/host/deep-link.ts
// El `start_param` de un Telegram Mini App: parser, router y constructor.
// Módulo PURO — sin DOM, sin Telegram, sin react-router. Se testea solo.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE UNA CODIFICACIÓN PROPIA Y NO SE MANDA LA URL
// ══════════════════════════════════════════════════════════════════════════
// El dispatcher ya produce deep links que son rutas de la app
// (`/carteira/1842?preparo=1`). Telegram NO acepta eso en `startapp=`: el
// contrato es **máximo 64 caracteres** del alfabeto `A-Z a-z 0-9 _ -`. Ni la
// barra ni el `?` ni el `=` entran. Por eso hay una codificación corta y
// reversible, y por eso está acá y no repartida por las pantallas:
//
//     t.me/VentusBot/app?startapp=opp_1842_log
//                                 └──┬─┘ └┬─┘ └┬┘
//                              entidade  id  ação
//
// La regla de producto que esto sirve es la del plano: **ninguna notificación
// dice "abra o app"**. Un toque tiene que caer EN la ficha con el registro ya
// abierto, no en la pantalla de inicio. `opp_1842` abre el dossiê; `opp_1842_log`
// abre Registrar con esa oportunidad ya elegida.
//
// Si algún día un destino no se puede codificar, `startParamDoCaminho()`
// devuelve null y quien construye el link cae al enlace web normal. Nunca se
// emite un start_param inválido: Telegram lo trunca en silencio y el vendedor
// aterriza en la pantalla equivocada, que es peor que aterrizar en el inicio.

/** Contrato de Telegram. No es un límite nuestro: es el de la plataforma. */
export const MAX_START_PARAM = 64

/** Alfabeto admitido por `startapp=`. */
export const ALFABETO_START_PARAM = /^[A-Za-z0-9_-]+$/

/* ══════════════════════════════════════════════════════════════════════════
   Vocabulario
   ══════════════════════════════════════════════════════════════════════════ */

/** Qué entidad se abre. `tela` es una pantalla sin entidad. */
export type EntidadeDoAlvo = 'opp' | 'lead' | 'task' | 'tela'

/**
 * Un destino ya interpretado. `acao` es lo que hay que tener ABIERTO al
 * aterrizar, no lo que hay que hacer después.
 */
export interface AlvoDeDeepLink {
  entidade: EntidadeDoAlvo
  /** Id de la entidad. Para `tela` es el código de la pantalla. */
  id: string
  acao: string | null
}

/** Un destino ya resuelto a coordenadas de react-router. */
export interface DestinoDeRota {
  pathname: string
  /** Incluye el '?' cuando no está vacío. */
  search: string
  /** `pathname + search`, listo para `navigate()`. */
  para: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Tabla de acciones
   ══════════════════════════════════════════════════════════════════════════
   Cada fila declara las DOS direcciones a la vez. Tenerlas juntas es lo que
   evita el defecto clásico: agregar un destino nuevo al parser y olvidarse
   del constructor, y descubrirlo el día que la notificación no lleva a
   ninguna parte. */

interface RegraDeAcao {
  /** Sufijo del start_param. null = sin acción (solo abrir la entidad). */
  acao: string | null
  /** Ruta destino. `{id}` se sustituye. */
  pathname: string
  /** Query de la ruta destino, ya con `{id}` sustituido si hace falta. */
  search?: string
}

const REGRAS_OPP: readonly RegraDeAcao[] = [
  { acao: null, pathname: '/carteira/{id}' },
  // Registrar acepta `oportunidade` (y los alias de las otras pantallas).
  { acao: 'log', pathname: '/registrar', search: 'oportunidade={id}' },
  { acao: 'voz', pathname: '/registrar', search: 'oportunidade={id}&fonte=audio' },
  { acao: 'prep', pathname: '/carteira/{id}', search: 'preparo=1' },
  { acao: 'adiar', pathname: '/carteira/{id}', search: 'adiar=1' },
  { acao: 'avancar', pathname: '/carteira/{id}', search: 'avancar=1' },
  { acao: 'risco', pathname: '/carteira/{id}', search: 'risco=1' },
  { acao: 'escala', pathname: '/carteira/{id}', search: 'escala=1' },
]

const REGRAS_LEAD: readonly RegraDeAcao[] = [
  { acao: null, pathname: '/cadencia', search: 'lead={id}' },
  { acao: 'conv', pathname: '/cadencia', search: 'lead={id}&converter=1' },
  { acao: 'log', pathname: '/registrar', search: 'lead={id}' },
]

const REGRAS_TASK: readonly RegraDeAcao[] = [
  { acao: null, pathname: '/', search: 'task={id}' },
  { acao: 'feito', pathname: '/', search: 'task={id}&feito=1' },
  { acao: 'adiar', pathname: '/', search: 'task={id}&adiar=1' },
]

const REGRAS_POR_ENTIDADE: Readonly<Record<Exclude<EntidadeDoAlvo, 'tela'>, readonly RegraDeAcao[]>> =
  {
    opp: REGRAS_OPP,
    lead: REGRAS_LEAD,
    task: REGRAS_TASK,
  }

/**
 * Pantallas sin entidad. La clave es el start_param completo.
 *
 * `hoje` y no `''`: un start_param vacío no existe, y un código legible es lo
 * que permite leer un link de Telegram y saber a dónde lleva sin decodificar.
 */
const TELAS: Readonly<Record<string, { pathname: string; search?: string }>> = {
  hoje: { pathname: '/' },
  golden: { pathname: '/golden' },
  golden_ini: { pathname: '/golden', search: 'iniciar=1' },
  golden_rev: { pathname: '/golden', search: 'revisar=1' },
  carteira: { pathname: '/carteira' },
  cadencia: { pathname: '/cadencia' },
  revisao: { pathname: '/revisao' },
  placar: { pathname: '/placar' },
  kudos: { pathname: '/placar', search: 'kudos=1' },
  rituais: { pathname: '/rituais' },
  fechar_dia: { pathname: '/rituais', search: 'aba=encerramento' },
  compromissos: { pathname: '/rituais', search: 'aba=compromissos' },
  ventus: { pathname: '/ventus' },
  gestor: { pathname: '/gestor' },
  ajustes: { pathname: '/ajustes' },
  registrar: { pathname: '/registrar' },
  voz: { pathname: '/registrar', search: 'fonte=audio' },
}

/* ══════════════════════════════════════════════════════════════════════════
   Parser
   ══════════════════════════════════════════════════════════════════════════ */

/** El id de una oportunidad o de un lead es un entero positivo. */
const ID_NUMERICO = /^[1-9][0-9]{0,17}$/
/** El de una tarefa es un uuid; los guiones entran en el alfabeto de Telegram. */
const ID_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Interpreta un `start_param`. Devuelve null ante cualquier duda.
 *
 * Fail-closed también acá: el start_param viene de una URL que cualquiera
 * puede escribir. Un id que no es un id no se «intenta igual» — se descarta, y
 * el Mini App abre en Hoje.
 */
export function lerStartParam(bruto: string | null | undefined): AlvoDeDeepLink | null {
  if (typeof bruto !== 'string') return null
  const texto = bruto.trim()
  if (texto === '' || texto.length > MAX_START_PARAM) return null
  if (!ALFABETO_START_PARAM.test(texto)) return null

  const tela = TELAS[texto]
  if (tela !== undefined) return { entidade: 'tela', id: texto, acao: null }

  const partes = texto.split('_')
  const cabeca = partes[0]
  if (cabeca !== 'opp' && cabeca !== 'lead' && cabeca !== 'task') return null
  const id = partes[1]
  if (id === undefined || id === '') return null

  if (cabeca === 'task') {
    if (!ID_UUID.test(id)) return null
  } else if (!ID_NUMERICO.test(id)) {
    return null
  }

  const acao = partes.length > 2 ? partes.slice(2).join('_') : null
  const regras = REGRAS_POR_ENTIDADE[cabeca]
  if (!regras.some((r) => r.acao === acao)) return null

  return { entidade: cabeca, id, acao }
}

/** Resuelve el destino a coordenadas de router. */
export function rotaDoAlvo(alvo: AlvoDeDeepLink): DestinoDeRota {
  if (alvo.entidade === 'tela') {
    const tela = TELAS[alvo.id] ?? { pathname: '/' }
    return montar(tela.pathname, tela.search)
  }
  const regras = REGRAS_POR_ENTIDADE[alvo.entidade]
  const regra = regras.find((r) => r.acao === alvo.acao) ?? regras[0]
  // `regras[0]` siempre existe: las tres tablas declaran la fila `acao: null`.
  if (regra === undefined) return montar('/', undefined)
  return montar(regra.pathname.replace('{id}', alvo.id), regra.search?.replace('{id}', alvo.id))
}

function montar(pathname: string, search: string | undefined): DestinoDeRota {
  const q = search === undefined || search === '' ? '' : `?${search}`
  return { pathname, search: q, para: `${pathname}${q}` }
}

/** Atajo: del start_param crudo a la ruta. null si no se entiende. */
export function rotaDoStartParam(bruto: string | null | undefined): DestinoDeRota | null {
  const alvo = lerStartParam(bruto)
  return alvo === null ? null : rotaDoAlvo(alvo)
}

/* ══════════════════════════════════════════════════════════════════════════
   Constructor
   ══════════════════════════════════════════════════════════════════════════ */

/** Codifica un destino. null si no cabe en el contrato de Telegram. */
export function montarStartParam(alvo: AlvoDeDeepLink): string | null {
  const texto =
    alvo.entidade === 'tela'
      ? alvo.id
      : [alvo.entidade, alvo.id, alvo.acao].filter((p) => p !== null && p !== '').join('_')
  if (texto === '' || texto.length > MAX_START_PARAM) return null
  if (!ALFABETO_START_PARAM.test(texto)) return null
  // Simetría obligatoria: lo que se emite tiene que volver a leerse igual.
  const volta = lerStartParam(texto)
  if (volta === null) return null
  return texto
}

/**
 * El camino inverso del que más se usa: una ruta de la app —la que ya escriben
 * `api/dispatch/jobs.ts` y el catálogo de avisos— convertida en start_param.
 *
 * Devuelve null cuando el destino no tiene codificación. Quien arma el link
 * entonces manda la URL web normal en vez de inventar un start_param que
 * llevaría a otro lado.
 */
export function startParamDoCaminho(caminho: string): string | null {
  const limpo = caminho.trim()
  if (limpo === '') return null
  let url: URL
  try {
    url = new URL(limpo, 'https://ventus.local')
  } catch {
    return null
  }
  const q = url.searchParams
  const path = url.pathname.replace(/\/+$/, '') || '/'

  // /carteira/1842 → opp_1842 (+ acción por query)
  const dossie = /^\/carteira\/([1-9][0-9]{0,17})$/.exec(path)
  if (dossie !== null) {
    const id = dossie[1] as string
    const acao = REGRAS_OPP.find(
      (r) => r.acao !== null && r.pathname === '/carteira/{id}' && casaQuery(r.search, q, id),
    )
    return montarStartParam({ entidade: 'opp', id, acao: acao?.acao ?? null })
  }

  if (path === '/registrar') {
    const opp = primeiro(q, ['oportunidade', 'opportunityId', 'opp'])
    if (opp !== null && ID_NUMERICO.test(opp)) {
      const acao = q.get('fonte') === 'audio' ? 'voz' : 'log'
      return montarStartParam({ entidade: 'opp', id: opp, acao })
    }
    const lead = q.get('lead')
    if (lead !== null && ID_NUMERICO.test(lead)) {
      return montarStartParam({ entidade: 'lead', id: lead, acao: 'log' })
    }
  }

  if (path === '/cadencia') {
    const lead = q.get('lead')
    if (lead !== null && ID_NUMERICO.test(lead)) {
      const acao = q.get('converter') === '1' ? 'conv' : null
      return montarStartParam({ entidade: 'lead', id: lead, acao })
    }
  }

  if (path === '/') {
    const task = q.get('task')
    if (task !== null && ID_UUID.test(task)) {
      const acao = q.get('feito') === '1' ? 'feito' : q.get('adiar') === '1' ? 'adiar' : null
      return montarStartParam({ entidade: 'task', id: task, acao })
    }
  }

  // Pantallas: se busca la fila de TELAS cuya query esté contenida en la de la
  // ruta. Se prefiere la MÁS específica (la que declara más parámetros).
  let melhor: { codigo: string; peso: number } | null = null
  for (const [codigo, tela] of Object.entries(TELAS)) {
    if (tela.pathname !== path) continue
    if (!casaQuery(tela.search, q, '')) continue
    const peso = tela.search === undefined ? 0 : tela.search.split('&').length
    if (melhor === null || peso > melhor.peso) melhor = { codigo, peso }
  }
  if (melhor !== null) return montarStartParam({ entidade: 'tela', id: melhor.codigo, acao: null })

  return null
}

function primeiro(q: URLSearchParams, chaves: readonly string[]): string | null {
  for (const chave of chaves) {
    const valor = q.get(chave)
    if (valor !== null && valor !== '') return valor
  }
  return null
}

/** ¿La query declarada por la regla está contenida en la de la ruta? */
function casaQuery(declarada: string | undefined, q: URLSearchParams, id: string): boolean {
  if (declarada === undefined || declarada === '') return true
  for (const par of declarada.split('&')) {
    const [chave, valor] = par.split('=') as [string, string | undefined]
    const esperado = (valor ?? '').replace('{id}', id)
    if (q.get(chave) !== esperado) return false
  }
  return true
}

/* ══════════════════════════════════════════════════════════════════════════
   Links
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `https://t.me/<bot>/app?startapp=<param>` — el link que abre el Mini App
 * directo en el destino. `<bot>` sin arroba.
 */
export function linkDoMiniApp(bot: string, startParam: string | null): string {
  const nome = bot.replace(/^@/, '').trim()
  const base = `https://t.me/${nome}/app`
  if (startParam === null || startParam === '') return base
  return `${base}?startapp=${encodeURIComponent(startParam)}`
}

/**
 * Lee el start_param de una URL de navegador. Telegram lo pasa como
 * `tgWebAppStartParam` en el fragmento o en la query cuando el Mini App se
 * abre por link directo; `startapp` es la forma que escribe la gente a mano.
 */
export function startParamDaUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const daQuery = url.searchParams.get('tgWebAppStartParam') ?? url.searchParams.get('startapp')
  if (daQuery !== null && daQuery !== '') return daQuery
  // El fragmento viene como `#tgWebAppData=...&tgWebAppStartParam=...`.
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (hash === '') return null
  const doHash = new URLSearchParams(hash).get('tgWebAppStartParam')
  return doHash !== null && doHash !== '' ? doHash : null
}
