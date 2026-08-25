// src/install/momento.ts
// CUÁNDO se ofrece instalar. La parte difícil no es el diálogo: es el momento.
//
// ══════════════════════════════════════════════════════════════════════════
// LA REGLA
// ══════════════════════════════════════════════════════════════════════════
// Ofrecer «Instalar» a los dos segundos de entrar es la forma más eficiente de
// que digan que no PARA SIEMPRE: `beforeinstallprompt` se consume una sola vez
// por sesión, y Chrome castiga el rechazo dejando de emitirlo por meses. Un
// «não» temprano no es neutral, es una puerta que se cierra.
//
// Por eso la invitación espera a que la app ya haya servido para algo:
//
//   1. tercera sesión o más          → no es alguien que entró a mirar
//   2. ≥ 90 s dentro de esta sesión  → está usando la app, no cerrándola
//   3. no la descartó hace poco      → 7 días de silencio después de un «no»
//   4. no la descartó tres veces     → a la tercera, no se pregunta más
//   5. no está instalada             → obvio, y aun así hay que chequearlo
//
// Las funciones de este archivo son PURAS y por eso testeables: la memoria
// entra por parámetro y sale por valor. El único que toca localStorage es el
// par leerMemoria/guardarMemoria, envuelto en try/catch porque en modo
// privado de iOS escribir tira excepción.

/** Lo que se recuerda entre sesiones. Todo en ms epoch. */
export interface MemoriaDeConvite {
  /** Cuántas veces se abrió la app (arranques separados por > 30 min). */
  sessoes: number
  /** Cuándo arrancó la última sesión contada. */
  ultimaSessaoEm: number
  /** Cuántas veces se descartó la invitación. */
  dispensas: number
  /** Cuándo fue el último descarte. */
  dispensadoEm: number
}

export const MEMORIA_VAZIA: MemoriaDeConvite = {
  sessoes: 0,
  ultimaSessaoEm: 0,
  dispensas: 0,
  dispensadoEm: 0,
}

const CHAVE = 'ventus.pwa.convite'

/** A partir de la tercera sesión. */
export const SESSOES_MINIMAS = 3
/** Un minuto y medio adentro antes de interrumpir. */
export const SEGUNDOS_MINIMOS = 90
/** Silencio después de un «agora não». */
export const ESPERA_APOS_DISPENSA_MS = 7 * 24 * 60 * 60 * 1000
/** A la tercera negativa, la app deja de preguntar. */
export const DISPENSAS_MAXIMAS = 3
/** Dos arranques dentro de esta ventana son la MISMA sesión (recarga, F5). */
export const JANELA_DE_SESSAO_MS = 30 * 60 * 1000

/* ══════════════════════════════════════════════════════════════════════════
   Lógica pura
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cuenta una sesión nueva si el último arranque fue hace más de 30 minutos.
 * Devuelve memoria nueva: no muta la que recibe.
 */
export function registrarSessao(memoria: MemoriaDeConvite, agora: number): MemoriaDeConvite {
  const mesmaSessao = agora - memoria.ultimaSessaoEm < JANELA_DE_SESSAO_MS
  if (mesmaSessao) return { ...memoria, ultimaSessaoEm: agora }
  return { ...memoria, sessoes: memoria.sessoes + 1, ultimaSessaoEm: agora }
}

/** Registra un «agora não». */
export function registrarDispensa(memoria: MemoriaDeConvite, agora: number): MemoriaDeConvite {
  return { ...memoria, dispensas: memoria.dispensas + 1, dispensadoEm: agora }
}

export interface ContextoDoConvite {
  /** Segundos que la persona lleva en esta sesión. */
  segundosNaSessao: number
  /** ¿Hay algo que ofrecer? (Android con el evento capturado, o iOS/Safari.) */
  temOQueOferecer: boolean
  /** ¿Ya está instalada? */
  instalado: boolean
}

/** El juicio completo. Ver la regla del encabezado. */
export function deveOferecer(
  memoria: MemoriaDeConvite,
  agora: number,
  ctx: ContextoDoConvite,
): boolean {
  if (ctx.instalado) return false
  if (!ctx.temOQueOferecer) return false
  if (memoria.dispensas >= DISPENSAS_MAXIMAS) return false
  if (memoria.dispensadoEm > 0 && agora - memoria.dispensadoEm < ESPERA_APOS_DISPENSA_MS) {
    return false
  }
  if (memoria.sessoes < SESSOES_MINIMAS) return false
  if (ctx.segundosNaSessao < SEGUNDOS_MINIMOS) return false
  return true
}

/**
 * Cuántos ms faltan para que valga la pena volver a preguntar dentro de ESTA
 * sesión. `null` = no va a pasar hoy (faltan sesiones, o ya se descartó).
 */
export function esperaAteOferecer(
  memoria: MemoriaDeConvite,
  agora: number,
  ctx: ContextoDoConvite,
): number | null {
  if (ctx.instalado || !ctx.temOQueOferecer) return null
  if (memoria.dispensas >= DISPENSAS_MAXIMAS) return null
  if (memoria.dispensadoEm > 0 && agora - memoria.dispensadoEm < ESPERA_APOS_DISPENSA_MS) {
    return null
  }
  if (memoria.sessoes < SESSOES_MINIMAS) return null
  const faltam = SEGUNDOS_MINIMOS - ctx.segundosNaSessao
  return faltam > 0 ? faltam * 1000 : 0
}

/**
 * Rutas donde la invitación NO se muestra, aunque toque.
 *
 *  · `/golden` es modo foco: la Golden Hour existe para que nada la
 *    interrumpa, y un sheet de instalación es exactamente una interrupción.
 *  · `/login` es antes de que la app haya servido para algo.
 *  · `/instalar` ya es la pantalla de instalación: ofrecer ahí es cómico.
 *  · `/registrar` puede tener una nota de voz grabando.
 */
export function rotaAceitaConvite(pathname: string): boolean {
  const proibidas = ['/golden', '/login', '/instalar', '/registrar']
  return !proibidas.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/* ══════════════════════════════════════════════════════════════════════════
   Persistencia
   ══════════════════════════════════════════════════════════════════════════ */

function ehNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Normaliza cualquier cosa que haya en localStorage a una memoria válida. */
export function normalizarMemoria(bruto: unknown): MemoriaDeConvite {
  if (typeof bruto !== 'object' || bruto === null) return MEMORIA_VAZIA
  const o = bruto as Record<string, unknown>
  return {
    sessoes: ehNumero(o['sessoes']) ? o['sessoes'] : 0,
    ultimaSessaoEm: ehNumero(o['ultimaSessaoEm']) ? o['ultimaSessaoEm'] : 0,
    dispensas: ehNumero(o['dispensas']) ? o['dispensas'] : 0,
    dispensadoEm: ehNumero(o['dispensadoEm']) ? o['dispensadoEm'] : 0,
  }
}

export function leerMemoria(): MemoriaDeConvite {
  if (typeof localStorage === 'undefined') return MEMORIA_VAZIA
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return MEMORIA_VAZIA
    return normalizarMemoria(JSON.parse(bruto))
  } catch {
    return MEMORIA_VAZIA
  }
}

export function guardarMemoria(memoria: MemoriaDeConvite): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CHAVE, JSON.stringify(memoria))
  } catch {
    // Modo privado de iOS: la invitación pasa a decidirse sólo con esta
    // sesión. Es degradación aceptable; romper el arranque no lo es.
  }
}
