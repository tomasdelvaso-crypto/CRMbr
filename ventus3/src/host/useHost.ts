// src/host/useHost.ts
// Los hooks con los que las pantallas hablan con el host.
//
// ══════════════════════════════════════════════════════════════════════════
// EL CONTRATO CON LAS PANTALLAS
// ══════════════════════════════════════════════════════════════════════════
// Una pantalla NO pregunta «¿estoy en Telegram?». Declara su acción crítica y
// recibe un booleano:
//
//     const nativo = useBotaoPrimario({ rotulo: 'Registrar', aoTocar: salvar })
//     …
//     {!nativo && <Button variant="primary" onClick={salvar}>Registrar</Button>}
//
// En el Mini App el botón lo dibuja Telegram abajo de todo, con su progreso y
// su protección contra el doble tap. En la PWA lo dibuja la pantalla. El resto
// del componente es idéntico, que es todo el punto de `useHost()`.
//
// `useHost()` es TOLERANTE: fuera del provider devuelve el host detectado igual
// (misma decisión que `useVendorDaSessao`). Varias pantallas se montan sin
// providers —el smoke test del router monta cada ruta sola— y ahí lo correcto
// es que el host web funcione, no que la ruta reviente contra el errorElement.

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { hostAtual } from './detectar'
import { HostContext, type HostContextValue } from './host-context'
import { deveOferecerAtalho, marcarOfertaFeita, oferecerAtalho } from './atalho'
import { assinarTelaCheia, entrarEmTelaCheia, estaEmTelaCheia, sairDaTelaCheia, temTelaCheia } from './tela-cheia'
import type { ControleDeBotao, EstadoDoBotao, Host } from './tipos'

/** El host de esta carga. Funciona con provider y sin él. */
export function useHost(): Host {
  const ctx = useContext(HostContext)
  return ctx?.host ?? hostAtual()
}

/** Estado de la entrada automática del Mini App. Null fuera del provider. */
export function useEntradaDoHost(): HostContextValue | null {
  return useContext(HostContext)
}

/** Atajo para los textos condicionales: `useEhTelegram() ? 'Fechar' : 'Voltar'`. */
export function useEhTelegram(): boolean {
  return useHost().tipo === 'telegram'
}

/* ══════════════════════════════════════════════════════════════════════════
   Botones
   ══════════════════════════════════════════════════════════════════════════ */

export interface OpcoesDeBotao extends EstadoDoBotao {
  aoTocar: () => void | Promise<void>
}

/**
 * Declara un botón del host. `null` lo esconde.
 * Devuelve `true` si el host lo dibuja — la pantalla no debe dibujar el suyo.
 */
function useBotao(controle: ControleDeBotao, opcoes: OpcoesDeBotao | null): boolean {
  const acao = useRef<() => void | Promise<void>>(() => undefined)

  // El handler se guarda en un ref y NO entra en las dependencias: si entrara,
  // cada render con una función nueva volvería a registrar el onClick nativo,
  // y `onClick` de Telegram ACUMULA callbacks — el tercer render dispararía la
  // acción tres veces.
  useEffect(() => {
    acao.current = opcoes?.aoTocar ?? (() => undefined)
  })

  const rotulo = opcoes?.rotulo ?? null
  const visivel = opcoes?.visivel ?? true
  const ativo = opcoes?.ativo ?? true
  const carregando = opcoes?.carregando ?? false

  useEffect(() => {
    if (!controle.nativo) return
    if (rotulo === null) {
      controle.esconder()
      return
    }
    controle.definir({ rotulo, visivel, ativo, carregando }, () => acao.current())
    return () => controle.esconder()
  }, [controle, rotulo, visivel, ativo, carregando])

  return controle.nativo && rotulo !== null
}

/** LA acción crítica de la pantalla. Una sola, siempre. */
export function useBotaoPrimario(opcoes: OpcoesDeBotao | null): boolean {
  return useBotao(useHost().botao.primario, opcoes)
}

/** La salida con fecha: «Adiar». Nunca una segunda acción crítica. */
export function useBotaoSecundario(opcoes: OpcoesDeBotao | null): boolean {
  return useBotao(useHost().botao.secundario, opcoes)
}

/* ══════════════════════════════════════════════════════════════════════════
   Back
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Muestra el BackButton nativo mientras el componente esté montado.
 * En la PWA no hace nada: el back del sistema ya funciona.
 */
export function useBackNativo(aoVoltar: () => void, ativo = true): void {
  const host = useHost()
  const acao = useRef(aoVoltar)

  useEffect(() => {
    acao.current = aoVoltar
  })

  useEffect(() => {
    if (!ativo || !host.back.nativo) return
    return host.back.mostrar(() => acao.current())
  }, [host, ativo])
}

/* ══════════════════════════════════════════════════════════════════════════
   Pantalla completa (Golden Hour)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pantalla completa mientras `ativo` sea true. Devuelve si se consiguió.
 *
 * La limpieza NO es opcional: salir de la Golden Hour tiene que devolver el
 * header del cliente de Telegram, o el vendedor queda encerrado en una app sin
 * botón de cerrar.
 */
export function useTelaCheia(ativo: boolean): boolean {
  useEffect(() => {
    if (!ativo || !temTelaCheia()) return
    entrarEmTelaCheia()
    return () => {
      sairDaTelaCheia()
    }
  }, [ativo])

  // El estado real lo manda Telegram —el vendedor puede salir con un gesto del
  // sistema—, así que se LEE del cliente en vez de recordarse en un useState
  // que quedaría mintiendo. `getServerSnapshot` devuelve false: fuera del
  // navegador nunca hay pantalla completa.
  return useSyncExternalStore(assinarTelaCheia, estaEmTelaCheia, () => false)
}

/* ══════════════════════════════════════════════════════════════════════════
   Atajo en la pantalla de inicio
   ══════════════════════════════════════════════════════════════════════════ */

export interface OfertaDeAtalho {
  /** true solo en la tercera sesión, una vez en la vida, y si no lo tiene. */
  deveOferecer: boolean
  /** Dispara el flujo nativo. Marca la oferta como hecha pase lo que pase. */
  oferecer: () => Promise<boolean>
  /** «Agora não». También marca la oferta como hecha: no se insiste. */
  dispensar: () => void
}

export function useOfertaDeAtalho(): OfertaDeAtalho {
  const [deveOferecer, setDeveOferecer] = useState(false)

  useEffect(() => {
    let vivo = true
    void deveOferecerAtalho().then((deve) => {
      if (vivo) setDeveOferecer(deve)
    })
    return () => {
      vivo = false
    }
  }, [])

  const oferecer = useCallback(async () => {
    setDeveOferecer(false)
    return await oferecerAtalho()
  }, [])

  const dispensar = useCallback(() => {
    marcarOfertaFeita()
    setDeveOferecer(false)
  }, [])

  return { deveOferecer, oferecer, dispensar }
}
