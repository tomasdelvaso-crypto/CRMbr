// src/screens/Ventus/useConversa.ts
// El motor de la conversación. Es donde se decide, turno por turno, si la
// pregunta la resuelve @/core en 40 ms o si vale gastar tokens.
//
// El orden NO es negociable:
//   1. motor determinístico  → instantáneo, sin red, sin tokens
//   2. sin señal             → motor determinístico + aviso explícito
//   3. servidor con SSE      → streaming desde el primer token
//
// Y la escritura nunca es directa: si el servidor propone una acción, llega
// como preview y el humano confirma. Confirmar es ventus_commit_action, la
// misma puerta que usa la Revisão.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  carregarCarteira,
  commitarAcaoPorId,
  descartarProposta,
  talvezOnline,
  type CarteiraLocal,
} from '@/data'
import { todayBr } from '@/core'
import {
  ERRO_LABELS,
  mockPorFallbackAtivo,
  type FeedbackMotivo,
  type FeedbackVoto,
  type VentusPreview,
  type VentusRequest,
} from './contrato'
import { abrirStreamVentus, enviarFeedback } from './stream'
import { responderLocalmente, respostaOffline } from './motor'
import {
  contextoParaServidor,
  gravarHistorico,
  lerHistorico,
  limparHistorico,
  novoTurnoId,
  type Mensagem,
} from './historico'

export interface EstadoConversa {
  mensagens: Mensagem[]
  /** Hay un turno en vuelo. Bloquea el envío y muestra «Parar». */
  enviando: boolean
  /** El backend no existe todavía y estamos con el mock. */
  emMock: boolean
  decisoes: Record<string, 'aceito' | 'recusado'>
  previewOcupado: string | null
  enviar: (texto: string) => Promise<void>
  parar: () => void
  votar: (mensagemId: string, voto: FeedbackVoto, motivo: FeedbackMotivo | null) => void
  confirmarPreview: (preview: VentusPreview) => Promise<void>
  recusarPreview: (preview: VentusPreview) => Promise<void>
  limpar: () => Promise<void>
}

function chaveDoPreview(p: VentusPreview): string {
  return p.actionId ?? p.tool
}

export function useConversaVentus(
  vendor: string | null,
  opportunityId: number | null,
): EstadoConversa {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [enviando, setEnviando] = useState(false)
  const [decisoes, setDecisoes] = useState<Record<string, 'aceito' | 'recusado'>>({})
  const [previewOcupado, setPreviewOcupado] = useState<string | null>(null)

  const abortar = useRef<AbortController | null>(null)
  const carteira = useRef<CarteiraLocal | null>(null)

  // Cambiar de vendedor o de ficha es cambiar de CONVERSACIÓN. El reset se
  // ajusta en render y no en un efecto: con un efecto se pintaría un frame con
  // los mensajes de la ficha anterior bajo el nombre de la nueva.
  const chave = `${vendor ?? ''}:${opportunityId === null ? 'geral' : String(opportunityId)}`
  const [chaveAtiva, setChaveAtiva] = useState(chave)
  if (chaveAtiva !== chave) {
    setChaveAtiva(chave)
    setMensagens([])
    setDecisoes({})
  }

  // Historial persistido por oportunidad: abrir la ficha de la Tetra Pak tiene
  // que traer la conversación de la Tetra Pak.
  useEffect(() => {
    if (vendor === null) return
    let vivo = true
    void lerHistorico(vendor, opportunityId).then((h) => {
      if (vivo) setMensagens(h)
    })
    return () => {
      vivo = false
    }
  }, [vendor, opportunityId])

  // La cartera se carga UNA vez y se reusa: el motor determinístico corre en
  // cada tecla del turno y no puede pagar una lectura de Dexie por pregunta.
  useEffect(() => {
    if (vendor === null) return
    let vivo = true
    void carregarCarteira(vendor).then((c) => {
      if (vivo) carteira.current = c
    })
    return () => {
      vivo = false
    }
  }, [vendor])

  const persistir = useCallback(
    (proximas: Mensagem[]) => {
      if (vendor === null) return
      void gravarHistorico(vendor, opportunityId, proximas).catch(() => undefined)
    },
    [vendor, opportunityId],
  )

  const atualizar = useCallback(
    (fn: (atual: Mensagem[]) => Mensagem[]) => {
      setMensagens((atual) => {
        const proximas = fn(atual)
        persistir(proximas)
        return proximas
      })
    },
    [persistir],
  )

  const parar = useCallback(() => {
    abortar.current?.abort()
    abortar.current = null
    setEnviando(false)
    atualizar((atual) =>
      atual.map((m) => (m.streaming === true ? { ...m, streaming: false } : m)),
    )
  }, [atualizar])

  const enviar = useCallback(
    async (texto: string) => {
      const pergunta = texto.trim()
      if (pergunta === '' || vendor === null || enviando) return

      const agora = new Date().toISOString()
      const doVendedor: Mensagem = {
        id: novoTurnoId(),
        papel: 'vendedor',
        texto: pergunta,
        em: agora,
      }

      // ── 1. ¿Lo resuelve el dominio? ──────────────────────────────────────
      const c = carteira.current ?? (await carregarCarteira(vendor))
      carteira.current = c
      const local = responderLocalmente(pergunta, c, vendor, todayBr())

      if (local !== null) {
        const resposta: Mensagem = {
          id: novoTurnoId(),
          papel: 'ventus',
          texto: local.texto,
          em: new Date().toISOString(),
          local: true,
          atalhos: local.atalhos,
        }
        atualizar((atual) => [...atual, doVendedor, resposta])
        return
      }

      // ── 2. ¿Hay red? ─────────────────────────────────────────────────────
      if (!talvezOnline()) {
        const fallback = respostaOffline(c, vendor, todayBr())
        atualizar((atual) => [
          ...atual,
          doVendedor,
          {
            id: novoTurnoId(),
            papel: 'ventus',
            texto: fallback.texto,
            em: new Date().toISOString(),
            offline: true,
            atalhos: fallback.atalhos,
          },
        ])
        return
      }

      // ── 3. Al servidor, con streaming ────────────────────────────────────
      const turnoId = novoTurnoId()
      const placeholder: Mensagem = {
        id: turnoId,
        papel: 'ventus',
        texto: '',
        em: new Date().toISOString(),
        streaming: true,
      }

      let historico: Mensagem[] = []
      setMensagens((atual) => {
        historico = atual
        const proximas = [...atual, doVendedor, placeholder]
        persistir(proximas)
        return proximas
      })

      const ctrl = new AbortController()
      abortar.current = ctrl
      setEnviando(true)

      const req: VentusRequest = {
        vendor,
        mensagem: pergunta,
        opportunityId,
        historico: contextoParaServidor([...historico, doVendedor]),
        hoje: todayBr(),
        turnoId,
        modo: 'chat',
      }

      // El texto se acumula acá y no en el estado: un setState por token
      // dispara un render por token y en un Android de gama media eso se ve.
      let acumulado = ''
      let ultimoPintado = 0
      const previews: VentusPreview[] = []

      const pintar = (forcar: boolean) => {
        const agoraMs = Date.now()
        if (!forcar && agoraMs - ultimoPintado < 60) return
        ultimoPintado = agoraMs
        const instantanea = acumulado
        const previewsAgora = [...previews]
        setMensagens((atual) =>
          atual.map((m) =>
            m.id === turnoId
              ? { ...m, texto: instantanea, previews: previewsAgora, streaming: true }
              : m,
          ),
        )
      }

      try {
        for await (const evento of abrirStreamVentus(req, { signal: ctrl.signal })) {
          if (evento.tipo === 'texto') {
            acumulado += evento.delta
            pintar(false)
          } else if (evento.tipo === 'preview') {
            previews.push(evento.preview)
            pintar(true)
          } else if (evento.tipo === 'erro') {
            // Aunque el servidor falle, el vendedor se va con algo en la mano.
            const socorro = respostaOffline(c, vendor, todayBr())
            const mensagemErro = `${ERRO_LABELS[evento.codigo]}\n\n${socorro.texto}`
            atualizar((atual) =>
              atual.map((m) =>
                m.id === turnoId
                  ? {
                      ...m,
                      texto: mensagemErro,
                      streaming: false,
                      offline: true,
                      atalhos: socorro.atalhos,
                      erro: evento.codigo,
                    }
                  : m,
              ),
            )
            return
          } else if (evento.tipo === 'fim') {
            // El `fim` trae el texto completo: es la verificación de que no se
            // perdió un delta por el camino.
            if (evento.texto.length > acumulado.length) acumulado = evento.texto
          }
        }
      } finally {
        abortar.current = null
        setEnviando(false)
        const textoFinal = acumulado
        const previewsFinais = [...previews]
        atualizar((atual) =>
          atual.map((m) =>
            m.id === turnoId && m.erro == null
              ? {
                  ...m,
                  texto: textoFinal,
                  previews: previewsFinais,
                  streaming: false,
                }
              : m,
          ),
        )
      }
    },
    [vendor, opportunityId, enviando, atualizar, persistir],
  )

  const votar = useCallback(
    (mensagemId: string, voto: FeedbackVoto, motivo: FeedbackMotivo | null) => {
      if (vendor === null) return
      atualizar((atual) => atual.map((m) => (m.id === mensagemId ? { ...m, voto } : m)))
      // Fire-and-forget: el voto ya quedó en el historial local, así que un
      // fallo de red no lo pierde ni interrumpe al vendedor.
      void enviarFeedback({
        vendor,
        turnoId: mensagemId,
        voto,
        motivo,
        opportunityId,
      })
    },
    [vendor, opportunityId, atualizar],
  )

  const confirmarPreview = useCallback(
    async (preview: VentusPreview) => {
      if (vendor === null) return
      const chave = chaveDoPreview(preview)
      if (preview.actionId === null) {
        setDecisoes((d) => ({ ...d, [chave]: 'aceito' }))
        return
      }
      setPreviewOcupado(chave)
      try {
        await commitarAcaoPorId(vendor, preview.actionId)
        setDecisoes((d) => ({ ...d, [chave]: 'aceito' }))
      } finally {
        setPreviewOcupado(null)
      }
    },
    [vendor],
  )

  const recusarPreview = useCallback(
    async (preview: VentusPreview) => {
      if (vendor === null) return
      const chave = chaveDoPreview(preview)
      setDecisoes((d) => ({ ...d, [chave]: 'recusado' }))
      if (preview.actionId === null) return
      // Rechazar en el chat es el mismo descarte de la bandeja, con el motivo
      // menos acusatorio de los tres: el vendedor no dijo que estuviera mal.
      await descartarProposta({
        vendor,
        acaoId: preview.actionId,
        motivo: 'nao_e_prioridade',
      })
    },
    [vendor],
  )

  const limpar = useCallback(async () => {
    if (vendor === null) return
    await limparHistorico(vendor, opportunityId)
    setMensagens([])
    setDecisoes({})
  }, [vendor, opportunityId])

  // Cortar el stream al desmontar: si el vendedor cierra el sheet, la conexión
  // tiene que morir de verdad, no seguir consumiendo datos en segundo plano.
  useEffect(() => {
    return () => {
      abortar.current?.abort()
    }
  }, [])

  return {
    mensagens,
    enviando,
    emMock: mockPorFallbackAtivo(),
    decisoes,
    previewOcupado,
    enviar,
    parar,
    votar,
    confirmarPreview,
    recusarPreview,
    limpar,
  }
}
