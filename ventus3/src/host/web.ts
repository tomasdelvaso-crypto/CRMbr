// src/host/web.ts
// El host web: la PWA de siempre. Es la implementación de referencia y la que
// define qué significa «el host no hace nada especial».
//
// Casi todo acá es un no-op DECLARADO, y eso es exactamente lo que se quiere:
// las pantallas preguntan `botao.primario.nativo` y, como es false, dibujan su
// propio botón. No hay una segunda rama de código para el caso web — hay UNA
// rama que consulta al host.

import { haptic, hapticDisponivel } from '@/ui'
import { permissaoDeAviso } from '@/data'
import { assinarPush, cancelarPush, soporteDeNotificacoes } from '@/push'
import type { ControleDeBotao, Host } from './tipos'

/** Botón que no existe: la pantalla dibuja el suyo. */
const BOTAO_INEXISTENTE: ControleDeBotao = {
  nativo: false,
  definir: () => undefined,
  esconder: () => undefined,
}

export function criarHostWeb(): Host {
  return {
    tipo: 'web',
    plataforma: 'web',

    auth: {
      modo: 'senha',
      entrar: () =>
        Promise.resolve({
          ok: false,
          motivo: 'nao_aplica',
          mensagem: 'Fora do Telegram, a entrada é pela tela de login.',
        } as const),
    },

    botao: { primario: BOTAO_INEXISTENTE, secundario: BOTAO_INEXISTENTE },

    back: {
      nativo: false,
      // El back del sistema ya funciona, y el design system ya empuja una
      // entrada de historial para cerrar overlays. Un segundo listener de
      // `popstate` acá cerraría dos cosas con un solo gesto.
      mostrar: () => () => undefined,
    },

    haptics: {
      nativo: hapticDisponivel(),
      disparar: (padrao) => haptic(padrao),
    },

    avisos: {
      canal: 'push',
      suporte: soporteDeNotificacoes,
      assinar: assinarPush,
      cancelar: cancelarPush,
      permissao: permissaoDeAviso,
    },

    montar: () => () => undefined,
  }
}
