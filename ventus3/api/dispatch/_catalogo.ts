// api/dispatch/_catalogo.ts
// El catálogo de tipos de aviso: la tabla B del plano, ejecutable.
//
// POR QUÉ ES UNA TABLA Y NO IFS DESPARRAMADOS
//   El v2 tiene 4.521 notificaciones de DOS tipos y 0,0% de lectura. Nadie
//   puede decir hoy qué tipo funciona porque nunca hubo tipos: había un cron
//   que insertaba filas. Acá cada tipo tiene prioridad, topic, TTL y opt-out
//   declarados en un solo lugar, y `notification_queue` mide `lido_em` y
//   `agido_em` por tipo. Eso es lo que permite MATAR un tipo que nadie lee sin
//   discutir de memoria.

import type { AcaoDeAviso, CanalDaFila, Prioridade } from './_tipos.js'

export interface DefinicaoDeTipo {
  prioridade: Prioridade
  /** Clave de colapso. Dos avisos del mismo topic no ocupan dos lugares. */
  topic: string
  /** Segundos de vigencia. Corto: un "reunião em 15" que llega a las 18h miente. */
  ttl: number
  /** true = lo silencia `avisos_de_jogo = false` (opt-out real de anillos y rachas). */
  jogo: boolean
  /** true = puede sonar DURANTE la Golden Hour. Todo lo demás se calla. */
  duranteGolden: boolean
  /** Destino admisible. 'ambos' deja que la preferencia del vendedor decida. */
  canal: CanalDaFila
  /** Descripción PT-BR para el Painel do Gestor y para los tests de cobertura. */
  rotulo: string
}

/**
 * Los tipos que el v3 tiene derecho a mandar. Cualquier otro se rechaza al
 * encolar: una cola abierta es exactamente cómo el v2 terminó con 106 avisos
 * de la misma oportunidad en 106 días.
 */
export const CATALOGO = {
  // ── Prioridad 1: interrumpe. Tiene reserva de presupuesto propia. ──────────
  preparo_reuniao: {
    prioridade: 1, topic: 'preparo', ttl: 5400, jogo: false,
    duranteGolden: true, canal: 'ambos', rotulo: 'Preparo de reunião (T-90)',
  },
  golden_t15: {
    prioridade: 1, topic: 'golden', ttl: 900, jogo: false,
    duranteGolden: true, canal: 'ambos', rotulo: 'Golden Hour começa em 15',
  },

  // ── Prioridad 2: el ritmo del día. ────────────────────────────────────────
  fila_golden: {
    prioridade: 2, topic: 'golden-fila', ttl: 43200, jogo: false,
    duranteGolden: false, canal: 'telegram', rotulo: 'Fila da Golden Hour para aprovar',
  },
  agenda_manha: {
    prioridade: 2, topic: 'agenda', ttl: 10800, jogo: false,
    duranteGolden: false, canal: 'ambos', rotulo: 'Agenda da manhã',
  },
  risco_critico: {
    prioridade: 2, topic: 'risco', ttl: 21600, jogo: false,
    duranteGolden: false, canal: 'ambos', rotulo: 'Risco crítico detectado',
  },

  // ── Prioridad 3: útil, no urgente. ────────────────────────────────────────
  ventus_revisar: {
    prioridade: 3, topic: 'ventus', ttl: 21600, jogo: false,
    duranteGolden: false, canal: 'ambos', rotulo: 'Ventus propôs algo para revisar',
  },
  encerramento_dia: {
    prioridade: 3, topic: 'encerramento', ttl: 7200, jogo: true,
    duranteGolden: false, canal: 'ambos', rotulo: 'Ritual de encerramento',
  },
  resumo_adiado: {
    prioridade: 3, topic: 'resumo', ttl: 21600, jogo: false,
    duranteGolden: false, canal: 'ambos', rotulo: 'Resumo do que ficou de ontem',
  },
  celebracao: {
    prioridade: 3, topic: 'celebracao', ttl: 3600, jogo: true,
    duranteGolden: false, canal: 'telegram', rotulo: 'Celebração do time',
  },

  // ── Prioridad 4: puede esperar. ───────────────────────────────────────────
  veredicto_semana: {
    prioridade: 4, topic: 'compromissos', ttl: 14400, jogo: false,
    duranteGolden: false, canal: 'ambos', rotulo: 'Veredicto dos compromissos',
  },
  trofeus_semana: {
    prioridade: 4, topic: 'trofeus', ttl: 14400, jogo: true,
    duranteGolden: false, canal: 'telegram', rotulo: 'Troféus da semana',
  },
} as const satisfies Record<string, DefinicaoDeTipo>

export type TipoDeAviso = keyof typeof CATALOGO

export const TIPOS_VALIDOS: readonly string[] = Object.keys(CATALOGO)

export function ehTipoConhecido(tipo: string): tipo is TipoDeAviso {
  return Object.prototype.hasOwnProperty.call(CATALOGO, tipo)
}

export function definicaoDe(tipo: string): DefinicaoDeTipo | null {
  return ehTipoConhecido(tipo) ? CATALOGO[tipo] : null
}

/* ══════════════════════════════════════════════════════════════════════════
   La regla que no se negocia: acción directa
   ══════════════════════════════════════════════════════════════════════════ */

/** Deep links que NO cuentan como acción: llevan a la app, no a la acción. */
const DESTINOS_GENERICOS = new Set(['/', '', '/hoje', 'app', 'https://ventus.ventapel.com.br'])

/**
 * Un aviso sin acción directa es ruido con formato de aviso. Esta función es
 * la que impide que vuelva a entrar: se llama al ENCOLAR (no al enviar), así
 * el error aparece en el job que lo generó y no tres horas después.
 *
 * Devuelve el motivo del rechazo en PT-BR, o null si está bien.
 */
export function motivoSemAcaoDireta(aviso: {
  tipo: string
  deep_link?: string | null
  acoes?: readonly AcaoDeAviso[] | null
}): string | null {
  const temBotoes = Array.isArray(aviso.acoes) && aviso.acoes.length > 0
  if (temBotoes) {
    const vazio = aviso.acoes?.some((a) => a.rotulo.trim() === '')
    if (vazio === true) return 'Um dos botões está sem rótulo.'
    const semDestino = aviso.acoes?.some(
      (a) => (a.callback === undefined || a.callback.trim() === '') &&
             (a.deep_link === undefined || a.deep_link.trim() === ''),
    )
    if (semDestino === true) return 'Um dos botões não leva a lugar nenhum.'
    return null
  }
  const destino = (aviso.deep_link ?? '').trim()
  if (destino === '' || DESTINOS_GENERICOS.has(destino)) {
    return 'Todo aviso precisa de ação direta: botões ou um deep link que abra a tela certa.'
  }
  return null
}
