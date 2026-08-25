// src/host/HostProvider.tsx
// Monta el host y, dentro de Telegram, resuelve la entrada ANTES de que el
// router exista.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ HAY UNA PANTALLA DE ESPERA Y NO UN SPINNER EN OTRO LADO
// ══════════════════════════════════════════════════════════════════════════
// La guardia de sesión del Shell manda a /login apenas `SessionProvider`
// resuelve que no hay sesión. En el Mini App eso pasa SIEMPRE en el primer
// arranque: la sesión se abre con el initData un instante después. Si el
// router montara mientras tanto, el vendedor vería la pantalla de login —la
// única pantalla que el Mini App existe para no mostrar— y probablemente
// escribiría su contraseña.
//
// Por eso este provider va POR FUERA del router y no renderiza a sus hijos
// hasta que la entrada se resolvió. En el host web no gatea nada: `entrada`
// arranca en 'nao_aplica' y los hijos se montan en el primer render.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { conectarRecepcaoDeAvisos } from '@/push'
import { hostAtual } from './detectar'
import { OfertaDeAtalho } from './OfertaDeAtalho'
import { HostContext, type EstadoDeEntrada, type HostContextValue } from './host-context'
import { jaTemSessao } from './auth'
import { registrarSessao } from './atalho'
import type { ResultadoDeEntrada } from './tipos'

type Falha = Extract<ResultadoDeEntrada, { ok: false }>

export function HostProvider({ children }: { children: ReactNode }) {
  const [host] = useState(hostAtual)
  const ehTelegram = host.auth.modo === 'telegram'

  const [entrada, setEntrada] = useState<EstadoDeEntrada>(
    ehTelegram ? 'verificando' : 'nao_aplica',
  )
  const [falha, setFalha] = useState<Falha | null>(null)
  const [tentativa, setTentativa] = useState(0)

  // Montaje del host: ready/expand/tema/safe areas en Telegram, nada en web.
  useEffect(() => {
    const desmontar = host.montar()
    const desconectarAvisos = conectarRecepcaoDeAvisos()
    // Se cuenta la apertura acá y no en `arranque.ts` para que el conteo
    // signifique «el vendedor vio la app», no «el bundle se evaluó».
    registrarSessao()
    return () => {
      desconectarAvisos()
      desmontar()
    }
  }, [host])

  // Entrada sin login. Solo en Telegram.
  useEffect(() => {
    if (!ehTelegram) return
    let vivo = true

    void (async () => {
      // Si ya hay sesión (el Mini App se reabrió con la anterior viva) no se
      // vuelve a pedir nada: re-entrar rotaría el token sin necesidad.
      if (await jaTemSessao()) {
        if (vivo) setEntrada('pronto')
        return
      }
      if (!vivo) return
      setEntrada('entrando')
      const resultado = await host.auth.entrar()
      if (!vivo) return
      if (resultado.ok) {
        setFalha(null)
        setEntrada('pronto')
        return
      }
      setFalha(resultado)
      setEntrada('falhou')
    })()

    return () => {
      vivo = false
    }
  }, [ehTelegram, host, tentativa])

  const tentarDeNovo = useCallback(() => {
    setFalha(null)
    setEntrada('verificando')
    setTentativa((n) => n + 1)
  }, [])

  const valor = useMemo<HostContextValue>(
    () => ({ host, entrada, falha, tentarDeNovo }),
    [host, entrada, falha, tentarDeNovo],
  )

  return (
    <HostContext.Provider value={valor}>
      {entrada === 'verificando' || entrada === 'entrando' ? (
        <Esperando />
      ) : entrada === 'falhou' ? (
        <NaoEntrou falha={falha} aoTentar={tentarDeNovo} />
      ) : (
        <>
          {children}
          {/* Chrome del host, no de una pantalla: la tercera sesión llega
              esté donde esté el vendedor. No renderiza nada fuera de Telegram. */}
          <OfertaDeAtalho />
        </>
      )}
    </HostContext.Provider>
  )
}

/**
 * La espera no dice «carregando»: dice qué está pasando. Son dos segundos en
 * los que el vendedor tiene que entender que NO le van a pedir contraseña.
 */
function Esperando() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
        aria-hidden
      />
      <p className="text-sm text-fg-muted" role="status">
        Entrando pelo Telegram…
      </p>
      <p className="text-xs text-fg-subtle">Sem senha: o Ventus reconhece você pelo seu Telegram.</p>
    </div>
  )
}

function NaoEntrou({ falha, aoTentar }: { falha: Falha | null; aoTentar: () => void }) {
  const mensagem = falha?.mensagem ?? 'Não deu para entrar agora.'
  const podeTentar = falha?.motivo !== 'sem_vinculo'

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-base font-medium">Não deu para entrar</p>
      <p className="max-w-sm text-sm leading-snug text-fg-muted">{mensagem}</p>
      {podeTentar && (
        <button
          type="button"
          onClick={aoTentar}
          className="min-h-touch rounded-pill bg-brand px-5 text-sm font-medium text-brand-fg"
        >
          Tentar de novo
        </button>
      )}
    </div>
  )
}
