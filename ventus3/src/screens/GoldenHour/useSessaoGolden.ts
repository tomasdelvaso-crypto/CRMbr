// src/screens/GoldenHour/useSessaoGolden.ts
// El estado de la hora y las cuatro acciones que la mueven.
//
// Todo lo que pasa acá es optimista y local: la pantalla no espera a la red
// en ningún punto. `registrarTouchpoint` escribe en Dexie, encola en el outbox
// y dispara el flush sin esperarlo; si el galpón no tiene señal, el toque ya
// está registrado y el siguiente contacto ya está en pantalla.

import { useCallback, useEffect, useState } from 'react'
import {
  MAX_TOUCHPOINTS,
  ehConversaReal,
  type Channel,
  type IsoDate,
  type Lead,
  type TouchpointResult,
  type TouchpointSeq,
} from '@/core'
import {
  agora,
  marcarEntradaGolden,
  registrarSessaoGolden,
  selarDiaDeHoraCheia,
  useRegistrarTouchpoint,
} from '@/data'
import {
  gravarSessao,
  iniciar as iniciarSessao,
  lerSessao,
  metaSugerida,
  sessaoNova,
  type Debrief,
  type SessaoLocal,
} from './sessao'

/**
 * Reloj de pared. No acumula ticks: cada render lee Date.now(), así que si iOS
 * congela la pestaña 10 minutos, al volver el reloj ya está en su lugar.
 */
export function useRelogio(ativo: boolean, intervaloMs = 500): number {
  const [ms, setMs] = useState(() => Date.now())
  useEffect(() => {
    if (!ativo) return
    const id = setInterval(() => setMs(Date.now()), intervaloMs)
    const aoVoltar = (): void => setMs(Date.now())
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [ativo, intervaloMs])
  return ms
}

export interface AcoesGolden {
  /** Arranca el bloque: congela la fila y fija duración y meta. */
  comecar: (duracaoMin: number, metaToques: number, fila: readonly number[]) => void
  /** Registra el toque del contacto actual y avanza. Nunca espera red. */
  registrar: (
    lead: Lead,
    canal: Channel,
    resultado: TouchpointResult,
    entradaUid: string | null,
  ) => void
  /** Pasa sin registrar toque. No consume paso de la cadencia. */
  pular: (lead: Lead, entradaUid: string | null) => void
  irPara: (indice: number) => void
  responder: (pergunta: keyof Debrief, resposta: string) => void
  anotarVoz: (clientUuid: string) => void
  /** Termina el bloque y abre el cierre de 60s. */
  encerrar: () => void
  /** Sella la hora: sube la sesión por el outbox y la deja cerrada. */
  selar: (horaCheia: boolean) => Promise<void>
}

export interface UseSessaoGolden {
  sessao: SessaoLocal | null
  carregando: boolean
  acoes: AcoesGolden
}

export function useSessaoGolden(vendor: string | null, day: IsoDate): UseSessaoGolden {
  const [sessao, setSessao] = useState<SessaoLocal | null>(null)
  const [carregando, setCarregando] = useState(true)
  const toque = useRegistrarTouchpoint()

  useEffect(() => {
    if (vendor === null) return
    let vivo = true
    void lerSessao(vendor, day)
      .then((s) => {
        if (vivo) {
          setSessao(s)
          setCarregando(false)
        }
      })
      .catch(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [vendor, day])

  /** Muta y persiste en un solo paso. Dexie es la fuente de verdad del ritual. */
  const atualizar = useCallback((f: (s: SessaoLocal) => SessaoLocal): void => {
    setSessao((prev) => {
      if (!prev) return prev
      const proxima = f(prev)
      void gravarSessao(proxima).catch(() => undefined)
      return proxima
    })
  }, [])

  const comecar = useCallback(
    (duracaoMin: number, metaToques: number, fila: readonly number[]): void => {
      if (vendor === null) return
      const meta = metaToques > 0 ? metaToques : metaSugerida(fila.length)
      const viva = iniciarSessao(sessaoNova(vendor, day, meta, fila), duracaoMin)
      setSessao(viva)
      void gravarSessao(viva).catch(() => undefined)
    },
    [vendor, day],
  )

  const registrar = useCallback(
    (
      lead: Lead,
      canal: Channel,
      resultado: TouchpointResult,
      entradaUid: string | null,
    ): void => {
      if (vendor === null) return

      // El servidor recalcula la secuencia con `for update`; este número es el
      // de la escritura optimista. Se topea en 7 para no salirse del CHECK.
      const sequencia = Math.min(
        MAX_TOUCHPOINTS,
        (lead.touchpoints_count ?? 0) + 1,
      ) as TouchpointSeq

      // Fire-and-forget a propósito: el outbox se encarga del resto y el
      // carrusel ya avanzó. Un await acá es un segundo de espera por toque.
      toque.mutate({
        leadId: lead.id,
        sequencia,
        canal,
        resultado,
        vendor,
        notas: 'Registrado na Golden Hour.',
      })

      if (entradaUid !== null) void marcarEntradaGolden(entradaUid, 'feito').catch(() => undefined)

      atualizar((s) => ({
        ...s,
        registros: [
          ...s.registros,
          {
            leadId: lead.id,
            empresa: lead.company_name,
            contato: lead.contact_name,
            canal,
            resultado,
            em: agora(),
          },
        ],
        indice: s.indice + 1,
      }))
    },
    [vendor, toque, atualizar],
  )

  const pular = useCallback(
    (lead: Lead, entradaUid: string | null): void => {
      // «Passar» NO registra touchpoint. Si lo hiciera, un contacto que el
      // vendedor ni miró se comería un paso de la cadencia de 7 y el lead
      // llegaría al TP7 sin que nadie le hubiera hablado nunca. El salto es
      // información de la sesión, no del funil.
      if (entradaUid !== null) void marcarEntradaGolden(entradaUid, 'pulado').catch(() => undefined)
      atualizar((s) => ({
        ...s,
        puladas: s.puladas.includes(lead.id) ? s.puladas : [...s.puladas, lead.id],
        indice: s.indice + 1,
      }))
    },
    [atualizar],
  )

  const irPara = useCallback(
    (indice: number): void => {
      atualizar((s) => (s.indice === indice ? s : { ...s, indice }))
    },
    [atualizar],
  )

  const responder = useCallback(
    (pergunta: keyof Debrief, resposta: string): void => {
      atualizar((s) => ({ ...s, debrief: { ...s.debrief, [pergunta]: resposta } }))
    },
    [atualizar],
  )

  const anotarVoz = useCallback(
    (clientUuid: string): void => {
      atualizar((s) =>
        s.notasDeVoz.includes(clientUuid)
          ? s
          : { ...s, notasDeVoz: [...s.notasDeVoz, clientUuid] },
      )
    },
    [atualizar],
  )

  const encerrar = useCallback((): void => {
    atualizar((s) =>
      s.fase === 'foco' ? { ...s, fase: 'fechamento', terminadaEm: agora() } : s,
    )
  }, [atualizar])

  const selar = useCallback(
    async (horaCheia: boolean): Promise<void> => {
      const atual = sessao
      if (!atual || atual.iniciadaEm === null) return
      const fim = atual.terminadaEm ?? agora()
      const duracaoSegundos = Math.max(
        0,
        Math.round((new Date(fim).getTime() - new Date(atual.iniciadaEm).getTime()) / 1000),
      )

      atualizar((s) => ({ ...s, fase: 'selada', terminadaEm: fim }))

      // Entra al outbox como todo lo demás: sin red, sube al volver la señal.
      await registrarSessaoGolden({
        vendor: atual.vendor,
        day: atual.day,
        iniciadaEm: atual.iniciadaEm,
        terminadaEm: fim,
        duracaoSegundos,
        toques: atual.registros.length,
        conversas: atual.registros.filter((r) => ehConversaReal(r.resultado)).length,
        reunioes: atual.registros.filter((r) => r.resultado === 'meeting_scheduled').length,
        puladas: atual.puladas.length,
        metaToques: atual.metaToques,
        horaCheia,
        debrief: { ...atual.debrief },
        superficie: 'app',
      }).catch(() => undefined)

      // La racha de la tela Hoje se alimenta SÓLO de acá. `meta` es el único
      // formato que lee fetchSequencia(): sellar en otro lado o con otra forma
      // haría que la Golden Hour ocurra y la racha siga diciendo cero, que es
      // la manera más rápida de que nadie vuelva a creerle al placar.
      // Se sella después de encolar la sesión y sin bloquear el cierre.
      if (horaCheia) {
        await selarDiaDeHoraCheia(atual.vendor, atual.day).catch(() => undefined)
      }
    },
    [sessao, atualizar],
  )

  return {
    sessao,
    carregando,
    acoes: {
      comecar,
      registrar,
      pular,
      irPara,
      responder,
      anotarVoz,
      encerrar,
      selar,
    },
  }
}
