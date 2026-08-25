// api/dispatch/_politica.ts
// LA POLÍTICA DEL DISPATCHER. Función pura, sin red, sin Supabase, sin Date.now()
// escondido: todo instante entra por parámetro. Por eso se puede testear de
// verdad y por eso los tests de presupuesto, quiet hours, dedupe y colapso son
// determinísticos.
//
// ══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA QUE ESTO RESUELVE
// ══════════════════════════════════════════════════════════════════════════
// La base de producción tiene 4.521 notificaciones de dos tipos con 0,0% de
// lectura. La oportunidad 46 acumuló 106 avisos en 106 días — uno por día,
// siempre el mismo, porque el cron insertaba sin preguntar si ya lo había
// dicho. Victor Hugo llegó a 17 en un día. El canal está entrenado como ruido.
//
// Conectarle Web Push encima sin política no mejora nada: acelera el momento
// en que el equipo silencia la app. Las cinco reglas de abajo son, en orden,
// lo que impide que eso pase otra vez.
//
//   1. TIPO MUTADO      · el vendedor apagó ese tipo, o apagó los del juego
//   2. DEDUPE           · (vendor, dedupe_key) una sola vez por ventana diaria
//   3. HORARIO          · 20-7h BRT no se toca; la Golden Hour tampoco
//   4. COLAPSO POR TOPIC· teléfono apagado toda la mañana = UNA agenda, no seis
//   5. PRESUPUESTO      · 4/día duro; lo que no entra se agrega y sale mañana
//
// ══════════════════════════════════════════════════════════════════════════
// LA RESERVA DE LA PRIORIDAD 1 — la decisión menos obvia del archivo
// ══════════════════════════════════════════════════════════════════════════
// «Presupuesto duro de 4/día» y «reunião em 15 minutos» se contradicen si el
// presupuesto es por orden de llegada: tres anillos y un resumen a la mañana
// se comen el cupo, y a las 15h el aviso de la reunión no sale. Un tope que
// silencia justo lo único que importaba es peor que no tener tope.
//
// Solución: el tope sigue siendo 4 (nunca se manda un quinto), pero las
// prioridades 2-4 sólo pueden gastar `orcamento - RESERVA_P1` (2 de 4). Los
// otros dos lugares quedan reservados para lo que interrumpe con derecho:
// preparo de reunión y Golden Hour. Nadie recibe más de 4; lo urgente nunca
// se queda afuera por culpa de lo rutinario.

import { addDays, brOffset, minutosDoDiaBRT, todayBr } from '../../src/core'
import { definicaoDe } from './_catalogo'
import type {
  AdiamentoPlanejado,
  AvisoNaFila,
  CanaisDisponiveis,
  EnvioPlanejado,
  GastoDoDia,
  JanelaGolden,
  NovoAviso,
  PlanoDeDespacho,
  PreferenciasDeAviso,
  Prioridade,
  SupressaoPlanejada,
  Transporte,
  UrgenciaPush,
} from './_tipos'

/** Lugares del presupuesto reservados a la prioridad 1. Ver el bloque de arriba. */
export const RESERVA_PRIORIDADE_1 = 2

/** Piso del TTL: por debajo de esto el push service ni intenta entregar. */
export const TTL_MINIMO = 60

/** Cuántos títulos caben en el resumen agregado antes del "e mais N". */
const MAX_LINHAS_AGREGADO = 6

/* ══════════════════════════════════════════════════════════════════════════
   Horarios — todo en BRT, vía src/core/dates.ts
   ══════════════════════════════════════════════════════════════════════════ */

/** 'HH:MM' o 'HH:MM:SS' (lo que devuelve Postgres para `time`) → minutos. */
export function minutosDe(hora: string): number {
  const partes = hora.split(':')
  const h = Number(partes[0] ?? '0')
  const m = Number(partes[1] ?? '0')
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, Math.min(24 * 60 - 1, h * 60 + m))
}

/**
 * ¿Estamos en horario de silencio?
 *
 * La ventana por defecto (20:00 → 07:00) CRUZA la medianoche, así que la
 * comparación ingenua `de <= x && x < ate` da falso siempre. Ese es el bug
 * clásico de las quiet hours y por eso hay un test dedicado a las 23:00.
 */
export function emSilencio(minutosAgora: number, prefs: PreferenciasDeAviso): boolean {
  const de = minutosDe(prefs.silencio_de)
  const ate = minutosDe(prefs.silencio_ate)
  if (de === ate) return false // ventana vacía: silencio desactivado
  return de < ate
    ? minutosAgora >= de && minutosAgora < ate
    : minutosAgora >= de || minutosAgora < ate
}

/** Construye un instante BRT a partir de una fecha civil y minutos del día. */
function instanteBRT(dia: string, minutos: number, ref: Date): string {
  const hh = String(Math.floor(minutos / 60)).padStart(2, '0')
  const mm = String(minutos % 60).padStart(2, '0')
  return `${dia}T${hh}:${mm}:00${brOffset(ref)}`
}

/**
 * Próxima vez que se abre la ventana (fin del silencio). Si ya pasó hoy,
 * mañana. Es también el horario al que se manda el resumen agregado.
 */
export function proximaAbertura(agora: Date, prefs: PreferenciasDeAviso): string {
  const ate = minutosDe(prefs.silencio_ate)
  const alvo = prefs.hora_aprendida !== null ? Math.max(ate, prefs.hora_aprendida * 60) : ate
  const hoje = todayBr(agora)
  const minutos = minutosDoDiaBRT(agora)
  return minutos < alvo ? instanteBRT(hoje, alvo, agora) : instanteBRT(addDays(hoje, 1), alvo, agora)
}

/** Fin del bloque de Golden Hour, como instante BRT. */
export function fimDaJanelaGolden(agora: Date, janela: JanelaGolden): string {
  return instanteBRT(todayBr(agora), Math.min(janela.ate, 24 * 60 - 1), agora)
}

export function dentroDaJanela(minutosAgora: number, janela: JanelaGolden): boolean {
  return minutosAgora >= janela.de && minutosAgora < janela.ate
}

/* ══════════════════════════════════════════════════════════════════════════
   Topic, urgencia y TTL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `Topic` de RFC 8030: como máximo 32 caracteres del alfabeto base64url. Un
 * topic inválido hace que el push service devuelva 400 y el aviso se pierda en
 * silencio — que es exactamente el modo de falla que no queremos repetir.
 */
export function sanearTopic(bruto: string): string {
  const limpo = bruto.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-{2,}/g, '-')
  const cortado = limpo.slice(0, 32)
  return cortado === '' ? 'ventus' : cortado
}

/** Topic efectivo: el explícito, si no el del catálogo, si no el tipo. */
export function topicDe(aviso: AvisoNaFila): string {
  const bruto = aviso.topic ?? definicaoDe(aviso.tipo)?.topic ?? aviso.tipo
  return sanearTopic(bruto)
}

/**
 * `Urgency` de RFC 8030. `very-low` en el veredicto del viernes es a propósito:
 * puede esperar a que el teléfono esté en wifi y cargando.
 */
export function urgenciaDe(prioridade: Prioridade): UrgenciaPush {
  switch (prioridade) {
    case 1: return 'high'
    case 2: return 'normal'
    case 3: return 'low'
    case 4: return 'very-low'
  }
}

/** Instante en que el aviso deja de ser verdad. */
export function expiraEm(aviso: AvisoNaFila): number {
  return Date.parse(aviso.agendado_para) + aviso.ttl_segundos * 1000
}

/**
 * TTL real que se le pide al push service: lo que queda de vigencia, no el TTL
 * nominal. Un "começa em 15 minutos" retenido 4 horas llega como una mentira.
 */
export function ttlRestante(aviso: AvisoNaFila, agora: Date): number {
  const restante = Math.floor((expiraEm(aviso) - agora.getTime()) / 1000)
  return Math.max(TTL_MINIMO, Math.min(aviso.ttl_segundos, restante))
}

/* ══════════════════════════════════════════════════════════════════════════
   Transportes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Qué transportes admite este aviso, respetando el canal de la fila, la
 * preferencia del vendedor y lo que existe de verdad.
 *
 * Fallback deliberado: si el vendedor prefiere Telegram y no lo tiene
 * vinculado, sale por push. La alternativa es no avisarle nada, que es peor.
 * Sólo cuando NO hay ningún transporte se suprime con `sem_canal`.
 */
export function transportesDe(
  aviso: AvisoNaFila,
  prefs: PreferenciasDeAviso,
  canais: CanaisDisponiveis,
): Transporte[] {
  const admitidos: Transporte[] =
    aviso.canal === 'ambos' ? ['telegram', 'push'] : [aviso.canal]

  // Orden = preferencia del vendedor. Lo que no está en `canais` no se ofrece.
  const preferidos = prefs.canais.filter((c) => admitidos.includes(c) && canais[c])
  if (preferidos.length > 0) {
    // Prioridad 1 sale por TODOS los transportes disponibles: es el único caso
    // en que la redundancia vale el ruido.
    if (aviso.prioridade === 1) return preferidos
    const primeiro = preferidos[0]
    return primeiro === undefined ? [] : [primeiro]
  }
  // Fallback: el canal admitido que exista, aunque no sea el preferido.
  return admitidos.filter((c) => canais[c])
}

/* ══════════════════════════════════════════════════════════════════════════
   Colapso por topic
   ══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoColapso {
  mantidos: AvisoNaFila[]
  /** id del colapsado → id del que sobrevive. */
  colapsados: Map<string, string>
}

/**
 * Teléfono apagado toda la mañana: al prenderlo tiene que aparecer UNA
 * notificación de agenda, no seis. El header `Topic` lo resuelve para lo que
 * todavía está en el push service; esto lo resuelve para lo que todavía está
 * en NUESTRA cola, que es la mitad que el v2 nunca miró.
 *
 * Gana el de menor prioridad numérica; a igualdad, el más reciente (dice la
 * verdad más nueva); a igualdad, el id menor, para que el orden sea estable.
 */
export function colapsarPorTopic(avisos: readonly AvisoNaFila[]): ResultadoColapso {
  const melhorPorTopic = new Map<string, AvisoNaFila>()
  const colapsados = new Map<string, string>()

  for (const aviso of avisos) {
    const topic = topicDe(aviso)
    const atual = melhorPorTopic.get(topic)
    if (atual === undefined) {
      melhorPorTopic.set(topic, aviso)
      continue
    }
    const ganha =
      aviso.prioridade < atual.prioridade ||
      (aviso.prioridade === atual.prioridade &&
        (aviso.agendado_para > atual.agendado_para ||
          (aviso.agendado_para === atual.agendado_para && aviso.id < atual.id)))
    if (ganha) {
      melhorPorTopic.set(topic, aviso)
      colapsados.set(atual.id, aviso.id)
    } else {
      colapsados.set(aviso.id, atual.id)
    }
  }

  // Cadena: si A se colapsó en B y después B se colapsó en C, A tiene que
  // apuntar a C. Sin esto los hijos del primer ganador quedan colgando de una
  // fila suprimida y el envío reporta un colapso de menos.
  const resolvido = new Map<string, string>()
  for (const filho of colapsados.keys()) {
    let pai = colapsados.get(filho)
    const visitados = new Set<string>([filho])
    while (pai !== undefined && colapsados.has(pai) && !visitados.has(pai)) {
      visitados.add(pai)
      pai = colapsados.get(pai)
    }
    if (pai !== undefined) resolvido.set(filho, pai)
  }

  const mantidos = avisos.filter((a) => !resolvido.has(a.id))
  return { mantidos, colapsados: resolvido }
}

/* ══════════════════════════════════════════════════════════════════════════
   El plan
   ══════════════════════════════════════════════════════════════════════════ */

export interface EntradaDaPolitica {
  vendor: string
  agora: Date
  prefs: PreferenciasDeAviso
  /** Pendientes de este vendedor con `agendado_para <= agora`. */
  fila: readonly AvisoNaFila[]
  gasto: GastoDoDia
  canais: CanaisDisponiveis
  /** Bloque de Golden Hour de hoy, si está agendado. */
  janelaGolden?: JanelaGolden | null
  /** `dedupe_key` ya enviadas hoy: la ventana de dedupe es el día civil BRT. */
  chavesEnviadasHoje?: readonly string[]
}

function ordenar(fila: readonly AvisoNaFila[]): AvisoNaFila[] {
  return [...fila].sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade
    if (a.agendado_para !== b.agendado_para) return a.agendado_para < b.agendado_para ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Decide, para UN vendedor, qué sale ahora, qué se corre, qué se tira y qué se
 * junta en el resumen de mañana. No toca la base: devuelve un plan que el
 * llamador persiste. Así el mismo plan se puede loguear, testear y auditar.
 */
export function planejarDespacho(entrada: EntradaDaPolitica): PlanoDeDespacho {
  const { vendor, agora, prefs, gasto, canais } = entrada
  const janela = entrada.janelaGolden ?? null
  const minutos = minutosDoDiaBRT(agora)
  const agoraMs = agora.getTime()

  const suprimidos: SupressaoPlanejada[] = []
  const adiados: AdiamentoPlanejado[] = []
  const aguardando: string[] = []
  const candidatos: AvisoNaFila[] = []

  const vistos = new Set<string>(entrada.chavesEnviadasHoje ?? [])

  for (const aviso of ordenar(entrada.fila)) {
    const def = definicaoDe(aviso.tipo)

    // 1 · Tipo mutado / opt-out del juego. Es opt-out de verdad: no se manda
    //     "igual pero más suave", no se manda.
    if (prefs.tipos_mutados.includes(aviso.tipo) || (def?.jogo === true && !prefs.avisos_de_jogo)) {
      suprimidos.push({ id: aviso.id, motivo: 'tipo_mutado' })
      continue
    }

    // 2 · Soneca vigente: no es supresión, es "todavía no".
    if (aviso.adiado_para !== null && Date.parse(aviso.adiado_para) > agoraMs) {
      aguardando.push(aviso.id)
      continue
    }

    // 3 · Dedupe por (vendor, dedupe_key) dentro de la ventana diaria. El
    //     índice único de 0005 ya lo impide al insertar; esto cubre el caso
    //     del aviso que se encoló ayer y se despacha hoy.
    if (vistos.has(aviso.dedupe_key)) {
      suprimidos.push({ id: aviso.id, motivo: 'duplicada' })
      continue
    }
    vistos.add(aviso.dedupe_key)

    // 4 · Ya venció antes de poder salir. Se tira y queda medido como tal.
    if (expiraEm(aviso) <= agoraMs) {
      suprimidos.push({ id: aviso.id, motivo: 'expirada' })
      continue
    }

    // 5 · Quiet hours. Se corre al fin del silencio; si para entonces ya no es
    //     verdad, se tira en vez de mentir a las 7 de la mañana.
    if (emSilencio(minutos, prefs)) {
      const ate = proximaAbertura(agora, prefs)
      if (Date.parse(ate) >= expiraEm(aviso)) {
        suprimidos.push({ id: aviso.id, motivo: 'expirada' })
      } else {
        adiados.push({ id: aviso.id, ate, motivo: 'horario_silencio' })
      }
      continue
    }

    // 6 · Bloque de Golden Hour: silencio de todo lo que no sea la Golden Hour
    //     misma. La hora de prospección se protege con la misma seriedad con la
    //     que se protege la noche.
    if (janela !== null && dentroDaJanela(minutos, janela) && def?.duranteGolden !== true) {
      const ate = fimDaJanelaGolden(agora, janela)
      if (Date.parse(ate) >= expiraEm(aviso)) {
        suprimidos.push({ id: aviso.id, motivo: 'expirada' })
      } else {
        adiados.push({ id: aviso.id, ate, motivo: 'bloco_golden_hour' })
      }
      continue
    }

    candidatos.push(aviso)
  }

  // 7 · Colapso por topic sobre lo que quedó vivo.
  const { mantidos, colapsados } = colapsarPorTopic(candidatos)
  for (const id of colapsados.keys()) suprimidos.push({ id, motivo: 'duplicada' })

  const colapsadosDe = new Map<string, string[]>()
  for (const [filho, pai] of colapsados) {
    const lista = colapsadosDe.get(pai) ?? []
    lista.push(filho)
    colapsadosDe.set(pai, lista)
  }

  // 8 · Presupuesto. Duro arriba, con reserva para la prioridad 1.
  const teto = Math.max(0, prefs.orcamento_diario)
  const reserva = Math.min(RESERVA_PRIORIDADE_1, teto)
  const tetoNaoUrgente = Math.max(0, teto - reserva)

  let usados = gasto.total
  let usadosNaoUrgentes = gasto.naoUrgentes

  const envios: EnvioPlanejado[] = []
  const adiadosPorOrcamento: AvisoNaFila[] = []

  for (const aviso of mantidos) {
    const transportes = transportesDe(aviso, prefs, canais)
    if (transportes.length === 0) {
      suprimidos.push({ id: aviso.id, motivo: 'sem_canal' })
      continue
    }
    const cabeNoTeto = usados < teto
    const cabeNoSeuCarril = aviso.prioridade === 1 || usadosNaoUrgentes < tetoNaoUrgente
    if (!cabeNoTeto || !cabeNoSeuCarril) {
      adiadosPorOrcamento.push(aviso)
      suprimidos.push({ id: aviso.id, motivo: 'orcamento_diario' })
      continue
    }
    usados += 1
    if (aviso.prioridade !== 1) usadosNaoUrgentes += 1
    envios.push({
      aviso,
      transportes,
      topic: topicDe(aviso),
      urgencia: urgenciaDe(aviso.prioridade),
      ttl: ttlRestante(aviso, agora),
      colapsados: colapsadosDe.get(aviso.id) ?? [],
    })
  }

  return {
    vendor,
    envios,
    adiados,
    suprimidos,
    agregado: montarAgregado(vendor, adiadosPorOrcamento, agora, prefs),
    aguardando,
  }
}

/**
 * Lo que no entró en el presupuesto no se pierde ni se repite mañana uno por
 * uno: se junta en UN aviso que sale con la primera ventana del día siguiente.
 * Cuatro avisos que no cabían se convierten en una línea cada uno dentro de un
 * mensaje que sí se lee.
 */
export function montarAgregado(
  vendor: string,
  adiados: readonly AvisoNaFila[],
  agora: Date,
  prefs: PreferenciasDeAviso,
): NovoAviso | null {
  if (adiados.length === 0) return null

  const ordenados = ordenar(adiados)
  const linhas = ordenados.slice(0, MAX_LINHAS_AGREGADO).map((a) => `• ${a.titulo}`)
  const sobra = ordenados.length - linhas.length
  if (sobra > 0) linhas.push(`• e mais ${sobra}`)

  const primeiro = ordenados[0]
  const dia = todayBr(agora)
  const n = ordenados.length

  return {
    vendor,
    vendor_id: primeiro?.vendor_id ?? null,
    tipo: 'resumo_adiado',
    prioridade: 3,
    titulo: n === 1 ? '1 aviso ficou de ontem' : `${n} avisos ficaram de ontem`,
    corpo: linhas.join('\n'),
    topic: 'resumo',
    ttl_segundos: 21600,
    canal: 'ambos',
    // Acción directa, no "abra o app": abre la lista con los avisos del día.
    deep_link: '/rituais?aba=avisos',
    acoes: [
      { rotulo: 'Ver os avisos', deep_link: '/rituais?aba=avisos', callback: 'avisos:pendentes:v3' },
      { rotulo: 'Ignorar tudo', callback: 'avisos:limpar:v3' },
    ],
    dedupe_key: `${vendor}:resumo_adiado:${dia}`,
    agendado_para: proximaAbertura(agora, prefs),
    payload: { origem: ordenados.map((a) => a.id) },
  }
}
