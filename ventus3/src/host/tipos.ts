// src/host/tipos.ts
// El contrato del adaptador de host. CINCO cosas y ni una más.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ SOLO CINCO
// ══════════════════════════════════════════════════════════════════════════
// El mismo bundle corre como PWA y como Telegram Mini App. La tentación es
// hacer un `useHost()` que abstraiga todo lo que Telegram sabe hacer —cerrar
// la ventana, abrir un chat, pedir un contacto, escanear un QR— y terminar con
// una interfaz que ninguna pantalla usa entera y que hay que implementar dos
// veces. La regla del plano es la contraria: **el resto del código de las
// pantallas no debe saber en cuál está corriendo**, y para eso alcanzan cinco
// diferencias reales:
//
//   1. auth          — con login (web) o sin login (initData de Telegram)
//   2. botón primario— nativo abajo (Telegram) o dibujado por la pantalla (web)
//   3. back          — BackButton nativo o el del navegador
//   4. haptics       — HapticFeedback nativo (funciona en iOS) o vibrate
//   5. notificaciones— el bot entrega (Telegram) o Web Push (web)
//
// Todo lo demás que Telegram ofrece —CloudStorage, fullscreen,
// addToHomeScreen, deep links— NO entra en esta interfaz: son módulos
// separados que no hacen nada fuera de Telegram. Meterlos acá obligaría al
// host web a implementar cinco no-ops más y a cada pantalla a preguntarse si
// están disponibles.

import type { HapticPattern } from '@/ui'
import type { PermissaoDeAviso } from '@/data'
import type { ResultadoDaAssinatura, SuporteDeAvisos } from '@/push'

/* ══════════════════════════════════════════════════════════════════════════
   1 · Auth
   ══════════════════════════════════════════════════════════════════════════ */

export type MotivoDeFalhaDeEntrada =
  | 'nao_aplica'
  | 'sem_initdata'
  | 'recusado'
  | 'sem_vinculo'
  | 'rede'
  | 'servidor'

export type ResultadoDeEntrada =
  | { ok: true; vendorNome: string }
  | { ok: false; motivo: MotivoDeFalhaDeEntrada; mensagem: string }

export interface AuthDoHost {
  /** 'senha' → hay pantalla de login. 'telegram' → se entra con initData. */
  readonly modo: 'senha' | 'telegram'
  /**
   * Abre sesión sin login. En el host web devuelve `nao_aplica` sin tocar la
   * red: la puerta de la PWA es /login y no puede haber una segunda.
   */
  entrar(): Promise<ResultadoDeEntrada>
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · Botones
   ══════════════════════════════════════════════════════════════════════════ */

export interface EstadoDoBotao {
  /** Texto en PT-BR. Es lo que va a leer el vendedor. */
  rotulo: string
  /** false esconde el botón sin desmontarlo. Por defecto true. */
  visivel?: boolean
  /** false lo deja gris y sin respuesta (gate no cumplido). Por defecto true. */
  ativo?: boolean
  /** Muestra el progreso nativo y BLOQUEA el segundo toque. */
  carregando?: boolean
}

export interface ControleDeBotao {
  /**
   * true cuando el botón lo dibuja el host y NO la pantalla.
   * La pantalla usa esto para no pintar dos botones en el Mini App.
   */
  readonly nativo: boolean
  /** Declara el estado del botón. Idempotente: se puede llamar en cada render. */
  definir(estado: EstadoDoBotao, aoTocar: () => void | Promise<void>): void
  /** Lo esconde y suelta el handler. Obligatorio al desmontar la pantalla. */
  esconder(): void
}

export interface BotoesDoHost {
  /** LA acción crítica de la pantalla. Una sola, siempre. */
  readonly primario: ControleDeBotao
  /** La alternativa que no cierra nada: «Adiar», «Depois». */
  readonly secundario: ControleDeBotao
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · Back
   ══════════════════════════════════════════════════════════════════════════ */

export interface BackDoHost {
  /** true si el host tiene un botón de volver propio (Telegram). */
  readonly nativo: boolean
  /**
   * Muestra el back y llama a `aoVoltar`. Devuelve el desinstalador.
   * En el host web devuelve un no-op: el back del sistema ya funciona y
   * duplicarlo con un listener de `popstate` rompe los overlays del design
   * system, que ya empujan su propia entrada de historial.
   */
  mostrar(aoVoltar: () => void): () => void
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · Haptics
   ══════════════════════════════════════════════════════════════════════════ */

export interface HapticsDoHost {
  /** true cuando el feedback lo da el SO (Telegram, también en iOS). */
  readonly nativo: boolean
  disparar(padrao: HapticPattern): void
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · Notificaciones
   ══════════════════════════════════════════════════════════════════════════ */

export interface AvisosDoHost {
  /** Por dónde llega lo proactivo en ESTE host. */
  readonly canal: 'telegram' | 'push'
  /** Qué se puede hacer en ESTE aparato. Para que Ajustes diga la verdad. */
  suporte(): SuporteDeAvisos
  /** **Solo desde un tap.** En un efecto, iOS lo rechaza en silencio. */
  assinar(): Promise<ResultadoDaAssinatura>
  cancelar(): Promise<void>
  permissao(): PermissaoDeAviso
}

/* ══════════════════════════════════════════════════════════════════════════
   El host
   ══════════════════════════════════════════════════════════════════════════ */

export type TipoDeHost = 'web' | 'telegram'

export interface Host {
  readonly tipo: TipoDeHost
  /** 'ios' | 'android' | 'tdesktop' | 'web'… Solo para decidir textos. */
  readonly plataforma: string
  readonly auth: AuthDoHost
  readonly botao: BotoesDoHost
  readonly back: BackDoHost
  readonly haptics: HapticsDoHost
  readonly avisos: AvisosDoHost
  /** Se llama una vez al montar. Devuelve la limpieza. */
  montar(): () => void
}
