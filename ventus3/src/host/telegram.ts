// src/host/telegram.ts
// El host de Telegram: botones nativos, back nativo, haptics del SO y avisos
// por el bot.
//
// ══════════════════════════════════════════════════════════════════════════
// EL MAINBUTTON Y EL DOBLE TAP
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 sufre doble-registro por doble-tap: la persona toca, no ve
// respuesta inmediata, toca otra vez y quedan dos actividades. El MainButton
// nativo tiene un estado de progreso (`showProgress`) que además DESACTIVA el
// botón, y acá se usa junto con un candado en memoria:
//
//   · el handler nativo se registra UNA sola vez y nunca se re-registra —
//     `onClick` acumula callbacks, y re-registrar en cada render dispararía la
//     acción tantas veces como renders hubo;
//   · mientras la acción está en vuelo, el segundo toque se descarta;
//   · el progreso se apaga en `finally`, así una acción que falla no deja el
//     botón muerto.
//
// ══════════════════════════════════════════════════════════════════════════
// EL SECONDARYBUTTON ES PARA «ADIAR»
// ══════════════════════════════════════════════════════════════════════════
// Nunca para una segunda acción crítica. La regla del plano es que hay UNA
// acción por pantalla; la secundaria es la salida CON fecha —«Adiar»—, que es
// la única salida que el producto acepta. Un «dismiss» sin fecha es cómo el v2
// llegó a 36 de 40 oportunidades vivas sin próxima acción.

import { haptic } from '@/ui'
import { permissaoDeAviso } from '@/data'
import { soporteDeNotificacoes, type ResultadoDaAssinatura } from '@/push'
import { entrarComTelegram } from './auth'
import { conectarSafeAreas, conectarTema, limparTema } from './tema'
import { chamar, chamarEm, plataforma, versaoPeloMenos, webApp } from './ponte-telegram'
import type { BotaoTelegram } from './ponte-telegram'
import type { ControleDeBotao, EstadoDoBotao, Host } from './tipos'

/* ══════════════════════════════════════════════════════════════════════════
   Botones
   ══════════════════════════════════════════════════════════════════════════ */

function criarBotao(qual: 'MainButton' | 'SecondaryButton'): ControleDeBotao {
  const alvo = (): BotaoTelegram | undefined => webApp()?.[qual]

  let aoTocar: (() => void | Promise<void>) | null = null
  let registrado = false
  let ocupado = false
  let ultimo: EstadoDoBotao | null = null

  /** Handler ESTABLE. Se registra una vez y vive lo que vive el Mini App. */
  const disparar = (): void => {
    if (ocupado || aoTocar === null) return
    const botao = alvo()
    ocupado = true
    // Progreso nativo: además de mostrar el spinner, deja el botón inactivo.
    chamarEm(botao, 'showProgress', false)

    let resultado: void | Promise<void>
    try {
      resultado = aoTocar()
    } catch (erro) {
      console.error(`[host/telegram] ${qual} explodiu:`, erro)
      soltar()
      return
    }

    if (resultado instanceof Promise) {
      void resultado
        .catch((erro: unknown) => {
          console.error(`[host/telegram] ${qual} falhou:`, erro)
        })
        .finally(soltar)
      return
    }
    soltar()
  }

  const soltar = (): void => {
    ocupado = false
    const botao = alvo()
    chamarEm(botao, 'hideProgress')
    // El estado declarado manda: si la pantalla lo dejó inactivo, sigue inactivo.
    if (ultimo !== null && ultimo.ativo !== false) chamarEm(botao, 'enable')
  }

  return {
    nativo: true,

    definir(estado, handler) {
      const botao = alvo()
      if (botao === undefined) return
      aoTocar = handler
      ultimo = estado

      if (!registrado) {
        registrado = chamarEm(botao, 'onClick', disparar)
      }

      chamarEm(botao, 'setText', estado.rotulo)
      if (estado.ativo === false) chamarEm(botao, 'disable')
      else if (!ocupado) chamarEm(botao, 'enable')

      if (estado.carregando === true) {
        ocupado = true
        chamarEm(botao, 'showProgress', false)
      } else if (!ocupado) {
        chamarEm(botao, 'hideProgress')
      }

      if (estado.visivel === false) chamarEm(botao, 'hide')
      else chamarEm(botao, 'show')
    },

    esconder() {
      const botao = alvo()
      chamarEm(botao, 'hideProgress')
      chamarEm(botao, 'hide')
      if (registrado) {
        chamarEm(botao, 'offClick', disparar)
        registrado = false
      }
      aoTocar = null
      ultimo = null
      ocupado = false
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   El host
   ══════════════════════════════════════════════════════════════════════════ */

/** Texto único cuando alguien intenta suscribir Web Push dentro de Telegram. */
const PUSH_NAO_VALE: ResultadoDaAssinatura = {
  ok: false,
  motivo: 'sem_suporte',
  mensagem:
    'Aqui dentro do Telegram os avisos chegam pelo próprio bot — não precisa registrar nada.',
}

export function criarHostTelegram(): Host {
  const primario = criarBotao('MainButton')
  // SecondaryButton llegó en la 7.10. En un cliente viejo no existe: el
  // controlador igual se crea y sus llamadas caen en `chamarEm` sin efecto,
  // así que la pantalla tiene que seguir dibujando su propio «Adiar».
  const secundario = versaoPeloMenos('7.10')
    ? criarBotao('SecondaryButton')
    : ({ nativo: false, definir: () => undefined, esconder: () => undefined } as ControleDeBotao)

  return {
    tipo: 'telegram',
    plataforma: plataforma(),

    auth: { modo: 'telegram', entrar: entrarComTelegram },

    botao: { primario, secundario },

    back: {
      nativo: true,
      mostrar(aoVoltar) {
        const back = webApp()?.BackButton
        if (back === undefined) return () => undefined
        chamarEm(back, 'onClick', aoVoltar)
        chamarEm(back, 'show')
        return () => {
          chamarEm(back, 'offClick', aoVoltar)
          chamarEm(back, 'hide')
        }
      },
    },

    haptics: {
      // El único host donde el háptico funciona en iOS. `haptic()` de @/ui ya
      // prefiere el puente de Telegram cuando existe: no hay dos caminos.
      nativo: true,
      disparar: (padrao) => haptic(padrao),
    },

    avisos: {
      canal: 'telegram',
      // Se devuelve el soporte REAL del aparato igual: Ajustes se ve dentro del
      // Mini App y tiene que decir la verdad sobre el teléfono, no sobre el
      // WebView.
      suporte: soporteDeNotificacoes,
      assinar: () => Promise.resolve(PUSH_NAO_VALE),
      cancelar: () => Promise.resolve(),
      permissao: permissaoDeAviso,
    },

    montar() {
      // `ready()` le dice a Telegram que puede quitar su splash. Antes de esto
      // el vendedor mira una pantalla en blanco con el logo del bot.
      chamar('ready')
      chamar('expand')
      const desconectar = [conectarTema(), conectarSafeAreas()]
      return () => {
        for (const d of desconectar) d()
        limparTema()
        primario.esconder()
        secundario.esconder()
      }
    },
  }
}
