// src/screens/Registrar/index.tsx
// REGISTRAR — la puerta principal de entrada de datos del CRM.
//
// El número que esta pantalla existe para mover: 18 interacciones registradas
// en 5 meses. No es que el equipo no trabaje; es que registrar cuesta más que
// no registrar. Todo lo de acá está subordinado a eso.
//
// EL CAMINO FELIZ SON 3 TOQUES:
//   1. mantener apretado el micrófono y soltar   → graba, guarda y transcribe
//   2. tocar una pastilla de fecha               → el gate de próxima acción
//   3. tocar Confirmar                           → se escribe todo
// El cliente, el tipo, el resumen y el resultado llegan pre-llenados. Cada
// widget extra que se ponga entre el paso 1 y el 3 hay que pagarlo con un
// motivo mejor que «queda lindo».
//
// ORDEN DE ESCRITURA (no es negociable):
//   blob → IndexedDB → intento de subida.
// Nunca al revés. Si no hay red, el registro entra igual con lo que el
// vendedor pone a mano y el audio queda en la cola. La nota no se pierde ni
// aunque iOS mate la pestaña.

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, CloudOff, Mic, Trash2, X } from 'lucide-react'
import {
  ACTIVITY_TYPE_CONFIG,
  todayBr,
  type ActivityType,
  type CanalTarefa,
  type Channel,
  type ScaleKey,
  type TouchpointResult,
  type TouchpointSeq,
  type PlannedAction,
} from '@/core'
import {
  novoClientUuid,
  observarPendentes,
  registrarAtividade,
  criarTask,
  atualizarEscala,
  atualizarContatos,
  registrarTouchpoint,
  useAlvosDeRegistro,
  useCarteira,
  ErroRegraDaProva,
  type AlvoRegistro,
} from '@/data'
import { SessionContext } from '@/app/session-context'
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Skeleton,
  avisar,
  confirmar,
  cx,
  haptic,
  toast,
} from '@/ui'
import { useBackNativo, useBotaoPrimario, useBotaoSecundario } from '@/host'
import { consumirCompartilhamento, idCompartilhadoDaUrl } from '@/install/compartilhado'
import { BotaoGravar } from './BotaoGravar'
import { CartaoConfirmacao } from './CartaoConfirmacao'
import { EsqueletoAnalise } from './EsqueletoAnalise'
import { AtalhosDeEntrada, EntradaAlternativa } from './EntradaAlternativa'
import { SeletorDeAlvo } from './SeletorDeAlvo'
import { chamarIngest } from './ingest'
import {
  CONTRATO_VERSAO,
  ErroIngest,
  modoMock,
  mockPorFallbackAtivo,
  type FonteIngest,
  type IngestMeta,
} from './contrato'
import { gravacaoDisponivel, useGravador, type NotaGravada } from './gravacao'
import {
  atarNotaAoAlvo,
  descartarNota,
  guardarNota,
  lerNota,
  marcarNota,
  marcarNotaRegistrada,
  useNotasPendentes,
} from './fila'
import {
  hoje as hojeBrt,
  podeConfirmar,
  rascunhoDeResposta,
  rascunhoOffline,
  reduzir,
  textoDoQueFalta,
  type ContextoRascunho,
  type PropostaContato,
} from './rascunho'
import { useAlturaDoTeclado } from '@/ui'

type Fase = 'captura' | 'analisando' | 'confirmando' | 'salvando'

export default function RegistrarScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Se lee el contexto directo en vez de useSession(): ese hook LANZA cuando
  // no hay <SessionProvider>, y esta pantalla tiene que poder montarse sin él
  // —el smoke test de rutas monta cada pantalla con Theme + Query y nada más—.
  // El camino real no cambia: sin vendedor resuelto se pinta el esqueleto, que
  // es exactamente lo que hay que mostrar mientras la sesión se resuelve.
  const sessao = useContext(SessionContext)
  const vendorName = sessao?.vendorName ?? null
  const vendor = sessao?.vendor ?? null

  const [fase, setFase] = useState<Fase>('captura')
  const [rascunho, despachar] = useReducer(reduzir, null)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [tecladoAberto, setTecladoAberto] = useState(false)
  const [transcricaoAberta, setTranscricaoAberta] = useState(false)
  const [pendentesOutbox, setPendentesOutbox] = useState(0)
  const [duracaoEmAnalise, setDuracaoEmAnalise] = useState(0)

  // Contexto de una corrección hablada: lo que ya se había entendido.
  // Es ESTADO y no un ref porque se pinta (el cartel «fale a correção»), y un
  // ref leído en render no re-renderiza: el cartel aparecería recién en el
  // próximo render, que puede no llegar nunca.
  const [correcao, setCorrecao] = useState<{ resumo: string; transcricao: string | null } | null>(
    null,
  )
  const abortRef = useRef<AbortController | null>(null)

  const alturaTeclado = useAlturaDoTeclado()
  const { pendentes, recarregar: recarregarPendentes } = useNotasPendentes()

  const { data: alvos = [], isLoading: carregandoAlvos } = useAlvosDeRegistro(vendorName)
  const { data: carteira = [] } = useCarteira(vendorName)

  const podeGravar = useMemo(() => gravacaoDisponivel(), [])

  /* ── Alvo pre-elegido por quien nos trajo hasta acá ────────────────────
     Tres pantallas navegan a /registrar y cada una lo dice a su manera. Las
     tres se aceptan acá, en un solo lugar, en vez de pedirles que cambien:
       · Carteira  →  /registrar?opportunityId=46
       · Dossiê    →  /registrar?oportunidade=46      (alias en PT-BR)
       · Hoje      →  navigate('/registrar', { state: { acao, origem } })
     El `state` es el contrato que la tela Hoje documentó: `{ acao:
     PlannedAction; origem: 'hoje' }`. De la acción sacamos la entidad; el
     tipo de actividad lo sigue decidiendo la ingesta, que escuchó el audio. */
  const location = useLocation()

  const acaoDeOrigem = useMemo((): PlannedAction | null => {
    const state: unknown = location.state
    if (typeof state !== 'object' || state === null || !('acao' in state)) return null
    const { acao } = state as { acao: unknown }
    if (typeof acao !== 'object' || acao === null) return null
    const candidata = acao as Partial<PlannedAction>
    if (!candidata.entidade || typeof candidata.entidade.id !== 'number') return null
    return acao as PlannedAction
  }, [location.state])

  const alvoDaUrl = useMemo((): AlvoRegistro | null => {
    const achar = (kind: AlvoRegistro['kind'], id: number): AlvoRegistro | null =>
      alvos.find((a) => a.kind === kind && a.id === id) ?? null

    const opp = params.get('opportunityId') ?? params.get('oportunidade')
    const lead = params.get('leadId') ?? params.get('lead')
    if (opp) return achar('opportunity', Number(opp))
    if (lead) return achar('lead', Number(lead))
    if (acaoDeOrigem) return achar(acaoDeOrigem.entidade.kind, acaoDeOrigem.entidade.id)
    return null
  }, [params, alvos, acaoDeOrigem])

  /* ── Badge del outbox ─────────────────────────────────────────────────── */
  useEffect(() => observarPendentes(setPendentesOutbox), [])

  /* ── Papeles ya ocupados en la oportunidad elegida ─────────────────────── */
  const oportunidadeAtual = useMemo(() => {
    const alvo = rascunho?.alvo
    if (!alvo || alvo.kind !== 'opportunity') return null
    return carteira.find((c) => c.opportunity.id === alvo.id)?.opportunity ?? null
  }, [rascunho?.alvo, carteira])

  const valorAtualDoContato = useCallback(
    (papel: PropostaContato['papel']): string | null => oportunidadeAtual?.[papel] ?? null,
    [oportunidadeAtual],
  )

  const papeisOcupados = useCallback(
    (alvo: AlvoRegistro | null): ReadonlySet<string> => {
      if (!alvo || alvo.kind !== 'opportunity') return new Set()
      const opp = carteira.find((c) => c.opportunity.id === alvo.id)?.opportunity
      if (!opp) return new Set()
      const ocupados = new Set<string>()
      for (const papel of ['power_sponsor', 'sponsor', 'influencer', 'support_contact'] as const) {
        const v = opp[papel]
        if (v !== null && v.trim() !== '') ocupados.add(papel)
      }
      return ocupados
    },
    [carteira],
  )

  /* ══════════════════════════════════════════════════════════════════════
     Ingesta
     ══════════════════════════════════════════════════════════════════════ */

  const montarMeta = useCallback(
    (clientUuid: string, fonte: FonteIngest, duracaoSeg: number, mime?: string): IngestMeta => ({
      versao: CONTRATO_VERSAO,
      vendor: vendorName ?? '',
      vendorId: vendor?.id ?? null,
      clientUuid,
      fonte,
      capturadoEm: new Date().toISOString(),
      duracaoSeg,
      mime,
      alvoSugerido: alvoDaUrl ? { kind: alvoDaUrl.kind, id: alvoDaUrl.id } : null,
      // La cartera entera viaja: es la ÚNICA lista contra la que el servidor
      // puede matchear, y lo que impide que invente un cliente.
      carteira: alvos.map((a) => ({ kind: a.kind, id: a.id, nome: a.nome, cliente: a.cliente })),
      idioma: 'auto',
      hoje: todayBr(),
      correcao,
    }),
    [vendorName, vendor?.id, alvoDaUrl, alvos, correcao],
  )

  const contexto = useCallback(
    (
      clientUuid: string,
      fonte: FonteIngest,
      duracaoSeg: number,
      textoOriginal: string | null,
    ): ContextoRascunho => ({
      clientUuid,
      fonte,
      duracaoSeg,
      alvoInicial: alvoDaUrl,
      alvos,
      papeisOcupados: papeisOcupados(alvoDaUrl),
      simulado: modoMock() || mockPorFallbackAtivo(),
      textoOriginal,
    }),
    [alvoDaUrl, alvos, papeisOcupados],
  )

  /**
   * Manda a interpretar. `guardarAntes` es la promesa que persiste el blob:
   * se espera ANTES del fetch, siempre. Ese await es la diferencia entre una
   * nota perdida y una nota pendiente.
   */
  const interpretar = useCallback(
    async (opciones: {
      clientUuid: string
      fonte: FonteIngest
      duracaoSeg: number
      mime?: string
      arquivo?: Blob | null
      texto?: string | null
    }) => {
      const { clientUuid, fonte, duracaoSeg, mime, arquivo, texto } = opciones
      setDuracaoEmAnalise(duracaoSeg)
      setFase('analisando')

      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const meta = montarMeta(clientUuid, fonte, duracaoSeg, mime)
      const ctx = contexto(clientUuid, fonte, duracaoSeg, texto ?? null)

      try {
        if (arquivo) await marcarNota(clientUuid, 'enviando')
        const resposta = await chamarIngest({
          meta,
          arquivo: arquivo ?? null,
          texto: texto ?? null,
          signal: ctrl.signal,
        })
        if (arquivo) await marcarNota(clientUuid, 'transcrito')
        setCorrecao(null)
        despachar({ tipo: 'definir', rascunho: rascunhoDeResposta(resposta, ctx) })
        setFase('confirmando')
        haptic('selection')
      } catch (erro) {
        const e = erro instanceof ErroIngest ? erro : null
        // El blob se queda en 'gravado' cuando el fallo es recuperable: así
        // vuelve solo a la cola de pendientes.
        if (arquivo) {
          await marcarNota(
            clientUuid,
            e?.recuperavel === false ? 'erro' : 'gravado',
            e?.message ?? 'falhou',
          )
        }
        const motivo =
          e?.recuperavel === false
            ? (e.message)
            : 'Sem rede para transcrever agora. O áudio está salvo — complete o essencial.'
        despachar({ tipo: 'definir', rascunho: rascunhoOffline(ctx, motivo) })
        setFase('confirmando')
        haptic('warning')
      } finally {
        recarregarPendentes()
      }
    },
    [montarMeta, contexto, recarregarPendentes],
  )

  /* ── Audio listo: PRIMERO al disco, después a la red ──────────────────── */
  const processarAudio = useCallback(
    async (nota: NotaGravada) => {
      const clientUuid = novoClientUuid()
      const guardado = await guardarNota({
        id: clientUuid,
        blob: nota.blob,
        mime: nota.mime,
        duracaoSeg: nota.duracaoSeg,
        vendor: vendorName ?? '',
        alvo: alvoDaUrl ? { kind: alvoDaUrl.kind, id: alvoDaUrl.id } : null,
      })
      if (!guardado) {
        toast({
          message: 'Não consegui salvar o áudio no aparelho. Não feche a tela.',
          tone: 'atencao',
        })
      }
      await interpretar({
        clientUuid,
        fonte: 'audio',
        duracaoSeg: nota.duracaoSeg,
        mime: nota.mime,
        arquivo: nota.blob,
      })
    },
    [vendorName, alvoDaUrl, interpretar],
  )

  const gravador = useGravador({
    aoTerminar: (nota) => {
      void processarAudio(nota)
    },
    aoFalhar: (erro) => {
      haptic('error')
      toast({ message: erro.mensagem, tone: erro.motivo === 'curto' ? 'neutro' : 'perigo' })
    },
  })

  /* ── Texto y foto ─────────────────────────────────────────────────────── */
  const enviarTexto = useCallback(
    (fonte: FonteIngest, texto: string) => {
      setTecladoAberto(false)
      void interpretar({ clientUuid: novoClientUuid(), fonte, duracaoSeg: 0, texto })
    },
    [interpretar],
  )

  const enviarFoto = useCallback(
    async (arquivo: File) => {
      const clientUuid = novoClientUuid()
      await guardarNota({
        id: clientUuid,
        blob: arquivo,
        mime: arquivo.type || 'image/jpeg',
        duracaoSeg: 0,
        vendor: vendorName ?? '',
        alvo: alvoDaUrl ? { kind: alvoDaUrl.kind, id: alvoDaUrl.id } : null,
      })
      await interpretar({
        clientUuid,
        fonte: 'foto',
        duracaoSeg: 0,
        mime: arquivo.type,
        arquivo: arquivo,
      })
    },
    [vendorName, alvoDaUrl, interpretar],
  )

  /* ── «Compartilhar» de Android ────────────────────────────────────────
     El manifest declara un share_target POST contra /registrar: el vendedor
     puede mandar acá una foto del galpón desde la cámara o el texto de una
     conversa de WhatsApp sin abrir el CRM primero. El POST no llega a React
     —un POST no se puede responder con el index.html sin perder el cuerpo—:
     lo atiende el service worker, guarda el paquete en Cache Storage y
     redirige a /registrar?compartilhado=<id>. Acá se consume ESE id.

     Corre una sola vez y recién cuando hay vendedor: `enviarFoto` persiste el
     blob con el nombre del vendedor adentro, y guardarlo con '' dejaría la
     nota huérfana en la cola.                                             */
  const compartilhadoConsumido = useRef(false)
  useEffect(() => {
    if (compartilhadoConsumido.current || !vendorName) return
    if (!idCompartilhadoDaUrl(window.location.search)) return
    compartilhadoConsumido.current = true

    let vivo = true
    void (async () => {
      const pacote = await consumirCompartilhamento(window.location.search)
      if (!pacote || !vivo) return

      // Orden de preferencia: la foto es lo que más cuesta reponer, el audio
      // después, y el texto es lo que el vendedor puede volver a pegar.
      const imagem = pacote.arquivos.find((a) => a.type.startsWith('image/'))
      if (imagem) {
        await enviarFoto(imagem)
        return
      }

      const audio = pacote.arquivos.find((a) => a.type.startsWith('audio/'))
      if (audio) {
        const clientUuid = novoClientUuid()
        await guardarNota({
          id: clientUuid,
          blob: audio,
          mime: audio.type || 'audio/mp4',
          duracaoSeg: 0,
          vendor: vendorName,
          alvo: alvoDaUrl ? { kind: alvoDaUrl.kind, id: alvoDaUrl.id } : null,
        })
        await interpretar({
          clientUuid,
          fonte: 'audio',
          duracaoSeg: 0,
          mime: audio.type,
          arquivo: audio,
        })
        return
      }

      const texto = [pacote.titulo, pacote.texto, pacote.url]
        .map((t) => t.trim())
        .filter((t) => t !== '')
        .join('\n')
      if (texto !== '') {
        enviarTexto('texto', texto)
        return
      }

      toast({ message: 'O compartilhamento chegou vazio.', tone: 'neutro' })
    })()

    return () => {
      vivo = false
    }
  }, [vendorName, alvoDaUrl, enviarFoto, enviarTexto, interpretar])

  /* ══════════════════════════════════════════════════════════════════════
     Confirmar — la única escritura
     ══════════════════════════════════════════════════════════════════════ */

  const confirmarRegistro = useCallback(async () => {
    if (!rascunho || !rascunho.alvo || !vendorName) return
    if (!podeConfirmar(rascunho)) {
      haptic('warning')
      toast({ message: textoDoQueFalta(rascunho) ?? 'Falta alguma coisa.', tone: 'atencao' })
      return
    }

    setFase('salvando')
    const alvo = rascunho.alvo
    const data = rascunho.proximaAcaoData
    // podeConfirmar() ya garantizó que hay fecha; el check calla al compilador
    // sin inventar un default silencioso.
    if (data === null) return

    try {
      if (alvo.kind === 'opportunity') {
        await registrarAtividade({
          vendor: vendorName,
          opportunityId: alvo.id,
          tipo: rascunho.tipo,
          descricao: rascunho.resumo.trim() === '' ? notaSemTranscricao(rascunho.tipo) : rascunho.resumo,
          resultado: rascunho.resultado,
          data: hojeBrt(),
          codigoMetodologia: rascunho.metodologia,
          proximaAcao: rascunho.proximaAcao,
          proximaAcaoData: data,
          // 'ai_parsed' solo si el modelo realmente participó.
          origem: rascunho.pendenteDeTranscricao ? 'manual' : 'ai_parsed',
          clientUuid: rascunho.clientUuid,
        })
      } else {
        await registrarTouchpoint({
          leadId: alvo.id,
          sequencia: proximaSequencia(alvo.toques),
          canal: canalDoTipo(rascunho.tipo),
          resultado: resultadoDoTouchpoint(rascunho),
          notas: rascunho.resumo.trim() === '' ? notaSemTranscricao(rascunho.tipo) : rascunho.resumo,
          vendor: vendorName,
        })
      }

      // El gate: la tarea con fecha es lo que hace que esto aparezca en Hoje.
      // `canal` sale del tipo de lo que se acaba de registrar: si la última
      // conversa fue por WhatsApp, la próxima acción nace con ese medio puesto
      // y mañana la tarjeta ya sabe por dónde se hace.
      await criarTask({
        vendor: vendorName,
        kind: 'next_action',
        target: { kind: alvo.kind, id: alvo.id },
        title: rascunho.proximaAcao.trim(),
        dueDate: data,
        canal: canalDaTarefa(rascunho.tipo),
        // 'ia' solo si el modelo de verdad participó — el mismo criterio que
        // `origem` de la actividad, unas líneas más arriba.
        origem: rascunho.pendenteDeTranscricao ? 'manual' : 'ia',
      })

      // Escalas aceptadas, una por una. Un fallo de la regra da prova no puede
      // tumbar el registro entero: la actividad ya está escrita.
      let escalasOk = 0
      const escalasComProblema: ScaleKey[] = []
      if (alvo.kind === 'opportunity') {
        for (const p of rascunho.escalas) {
          if (p.estado !== 'aceita') continue
          try {
            await atualizarEscala({
              opportunityId: alvo.id,
              escala: p.escala,
              nivel: p.para,
              citacao: p.citacao,
              fonte: p.fonte,
              vendor: vendorName,
            })
            escalasOk += 1
          } catch (erro) {
            escalasComProblema.push(p.escala)
            if (!(erro instanceof ErroRegraDaProva)) throw erro
          }
        }

        // Contactos: la mutación vuelve a leer la fila antes de escribir, así
        // que aunque esta pantalla tenga datos viejos, no pisa nada.
        const contatos: Partial<Record<PropostaContato['papel'], string>> = {}
        for (const c of rascunho.contatos) {
          if (c.estado !== 'aceita') continue
          contatos[c.papel] = c.cargo ? `${c.nome} (${c.cargo})` : c.nome
        }
        if (Object.keys(contatos).length > 0) {
          await atualizarContatos({ opportunityId: alvo.id, vendor: vendorName, contatos })
        }
      }

      // El audio: se conserva si todavía le falta transcripción, se borra si ya
      // cumplió. Los MB de una nota transcripta no le sirven a nadie.
      if (rascunho.pendenteDeTranscricao) {
        await atarNotaAoAlvo(rascunho.clientUuid, { kind: alvo.kind, id: alvo.id })
        await marcarNotaRegistrada(rascunho.clientUuid, rascunho.clientUuid)
      } else {
        await descartarNota(rascunho.clientUuid)
      }

      haptic('success')
      const extras: string[] = []
      if (escalasOk > 0) extras.push(`${String(escalasOk)} escala(s)`)
      if (rascunho.pendenteDeTranscricao) extras.push('áudio na fila')
      toast({
        message:
          extras.length > 0
            ? `Registrado · ${extras.join(' · ')}`
            : `Registrado em ${alvo.nome}`,
        tone: 'ok',
      })
      if (escalasComProblema.length > 0) {
        toast({
          message: 'Alguma escala precisava de citação e ficou de fora.',
          tone: 'atencao',
        })
      }

      despachar({ tipo: 'limpar' })
      setFase('captura')
      recarregarPendentes()
      void navigate(alvo.kind === 'opportunity' ? `/carteira/${String(alvo.id)}` : '/cadencia')
    } catch (erro) {
      setFase('confirmando')
      haptic('error')
      const msg = erro instanceof Error ? erro.message : 'Não consegui salvar.'
      void avisar({
        title: 'Não deu para salvar',
        description: msg,
        footnote: 'Sua nota continua aqui. Tente de novo em um instante.',
      })
    }
  }, [rascunho, vendorName, navigate, recarregarPendentes])

  /* ── Corrigir falando ─────────────────────────────────────────────────── */
  const corrigirFalando = useCallback(() => {
    if (!rascunho) return
    setCorrecao({ resumo: rascunho.resumo, transcricao: rascunho.transcricao })
    haptic('tap')
    setFase('captura')
    toast({ message: 'Fale só a correção — eu junto com o resto.', tone: 'info' })
  }, [rascunho])

  /* ── Descartar ────────────────────────────────────────────────────────── */
  const descartar = useCallback(async () => {
    if (!rascunho) return
    const ok = await confirmar({
      title: 'Descartar este registro?',
      description: 'A nota de voz e tudo que o Ventus entendeu vão embora.',
      confirmLabel: 'Descartar',
      tone: 'perigo',
    })
    if (!ok) return
    await descartarNota(rascunho.clientUuid)
    setCorrecao(null)
    despachar({ tipo: 'limpar' })
    setFase('captura')
    recarregarPendentes()
    haptic('warning')
  }, [rascunho, recarregarPendentes])

  /* ── Notas que quedaron en la cola ────────────────────────────────────── */

  /**
   * Nota que NUNCA se confirmó: se reabre el flujo completo con el mismo
   * client_uuid, así el registro que salga sigue siendo el mismo hecho.
   */
  const retomarNota = useCallback(
    async (id: string) => {
      const registro = await lerNota(id)
      if (!registro) {
        recarregarPendentes()
        return
      }
      await interpretar({
        clientUuid: id,
        fonte: registro.mime.startsWith('image/') ? 'foto' : 'audio',
        duracaoSeg: registro.duracao_seg,
        mime: registro.mime,
        arquivo: registro.blob,
      })
    },
    [interpretar, recarregarPendentes],
  )

  /**
   * Nota YA registrada a la que solo le faltaba la transcripción.
   *
   * Acá NO se vuelve a pasar por el formulario: la próxima acción, el cliente y
   * el resultado ya están escritos y volver a pedirlos sería castigar al
   * vendedor por no haber tenido señal. La transcripción entra como una
   * actividad `note` sobre el mismo cliente —append-only, que es como funciona
   * `activities`— y por ser 'note' no cuenta como conversa en los anillos: no
   * infla el placar con un hecho que ya se contó.
   */
  const transcreverNotaRegistrada = useCallback(
    async (id: string) => {
      const registro = await lerNota(id)
      if (!registro || !vendorName) {
        recarregarPendentes()
        return
      }
      try {
        await marcarNota(id, 'enviando')
        const resposta = await chamarIngest({
          meta: montarMeta(novoClientUuid(), 'audio', registro.duracao_seg, registro.mime),
          arquivo: registro.blob,
        })
        const texto = resposta.transcricao ?? resposta.extracao.resumo
        const alvo = registro.alvo

        if (alvo && alvo.kind === 'opportunity' && texto.trim() !== '') {
          await registrarAtividade({
            vendor: vendorName,
            opportunityId: alvo.id,
            tipo: 'note',
            descricao: `Transcrição da nota de voz:\n\n${texto.trim()}`,
            data: hojeBrt(),
            origem: 'ai_parsed',
          })
          toast({ message: 'Transcrição anexada ao cliente.', tone: 'ok' })
        } else {
          // Lead o transcripción vacía: no hay dónde anexarla sin inventar una
          // fila. Se muestra para que el vendedor decida qué hacer con ella.
          void avisar({
            title: 'Transcrição pronta',
            description: texto.trim() === '' ? 'O áudio saiu sem fala.' : texto,
          })
        }
        await descartarNota(id)
        haptic('success')
      } catch (erro) {
        await marcarNota(id, 'gravado', erro instanceof Error ? erro.message : 'falhou')
        toast({ message: 'Ainda sem rede para transcrever. Continua na fila.', tone: 'atencao' })
      } finally {
        recarregarPendentes()
      }
    },
    [vendorName, montarMeta, recarregarPendentes],
  )

  /* ── Abortar la ingesta si la pantalla se va ──────────────────────────── */
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  /* ══════════════════════════════════════════════════════════════════════
     La acción crítica de esta pantalla
     ══════════════════════════════════════════════════════════════════════
     «Confirmar» es el tercer y último toque del camino feliz, y es EL momento
     en que el doble tap duplica el registro —el bug que el bot del v2 sufre
     hoy—. Por eso se declara al host: el MainButton del Mini App tiene
     progreso nativo que además desactiva el botón mientras la escritura está
     en vuelo, y eso no hay forma de conseguirlo dibujando el botón propio.

     «Descartar» es el secundario: es la salida, no una segunda acción crítica.
     «Corrigir falando» se queda SIEMPRE en la barra propia — el host tiene dos
     botones y el tercero es el que se sacrifica.

     Los dos se apagan mientras hay un sheet abierto (buscar cliente, teclado):
     un botón fijo abajo que escribe sobre lo que quedó detrás del modal es una
     trampa. Todo esto vive arriba del `return` temprano porque un hook no
     puede quedar del otro lado de un `if`. */
  const emConfirmacao = fase === 'confirmando' || fase === 'salvando'
  const bloqueado = !rascunho || !podeConfirmar(rascunho)
  const sheetAberto = buscaAberta || tecladoAberto
  const podeDecidir = emConfirmacao && rascunho !== null && !sheetAberto

  const confirmarNativo = useBotaoPrimario(
    !podeDecidir
      ? null
      : {
          rotulo: 'Confirmar',
          ativo: !bloqueado,
          carregando: fase === 'salvando',
          aoTocar: () => {
            void confirmarRegistro()
          },
        },
  )

  const descartarNativo = useBotaoSecundario(
    !podeDecidir
      ? null
      : {
          rotulo: 'Descartar',
          ativo: fase !== 'salvando',
          aoTocar: () => {
            void descartar()
          },
        },
  )

  // Registrar se abre EMPILHADA casi siempre (el FAB, una tarjeta del día), y
  // el back nativo del Mini App tiene que devolver a donde estaba. Casi:
  // entrar por el share_target o por un deep link la deja como PRIMERA entrada
  // del historial —`location.key === 'default'`— y ahí `navigate(-1)` no tiene
  // a dónde volver, así que el botón quedaría muerto. Se manda a Hoje.
  useBackNativo(() => {
    if (location.key === 'default') void navigate('/')
    else void navigate(-1)
  })

  /* ══════════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════════ */

  if (!vendorName) {
    return (
      <div className="px-4 py-6">
        <Skeleton variant="card-acao" count={2} />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div
        className="flex-1 px-4 pt-4"
        // Espacio para la barra de acción fija + safe area + teclado.
        style={{ paddingBottom: emConfirmacao ? 'calc(9rem + var(--safe-bottom))' : '1.5rem' }}
      >
        {fase === 'captura' && (
          <div className="flex flex-col gap-6">
            {alvoDaUrl && (
              <Card padding="sm" accent="marca">
                <p className="text-sm">
                  Registrando em <strong>{alvoDaUrl.nome}</strong>
                </p>
                {/* Vino de una tarjeta do dia: se repite QUÉ iba a hacer, para
                    que no tenga que recordarlo mientras habla. */}
                {acaoDeOrigem && (
                  <p className="mt-1 text-xs text-fg-muted">{acaoDeOrigem.acao}</p>
                )}
              </Card>
            )}

            {correcao && (
              <Card padding="sm" accent="info">
                <p className="text-sm">Fale a correção. O resto do registro fica como está.</p>
              </Card>
            )}

            <div className="pt-2">
              <BotaoGravar
                estado={gravador.estado}
                segundos={gravador.segundos}
                stream={gravador.stream}
                disponivel={podeGravar}
                onIniciar={gravador.iniciar}
                onParar={gravador.parar}
                onCancelar={gravador.cancelar}
              />
            </div>

            <AtalhosDeEntrada
              desabilitado={gravador.estado === 'gravando'}
              onTeclado={() => {
                haptic('tap')
                setTecladoAberto(true)
              }}
              onFoto={(arquivo) => {
                void enviarFoto(arquivo)
              }}
            />

            <FilaPendente
              itens={pendentes.map((p) => ({
                id: p.id,
                titulo: rotuloDaNota(p.mime, p.duracao_seg),
                registrada: Boolean(p.atividade_uid),
              }))}
              onRetomar={(id, registrada) => {
                void (registrada ? transcreverNotaRegistrada(id) : retomarNota(id))
              }}
              onDescartar={(id) => {
                void descartarNota(id).then(recarregarPendentes)
              }}
            />

            {pendentesOutbox > 0 && (
              <p className="text-center text-xs text-fg-subtle">
                {pendentesOutbox} registro(s) esperando rede para subir. Já estão salvos.
              </p>
            )}

            {alvos.length === 0 && !carregandoAlvos && (
              <EmptyState
                icon={<Mic size={28} aria-hidden />}
                title="Sua carteira ainda não chegou"
                description="Sem clientes na carteira eu não tenho contra o que casar o áudio. Puxe a Carteira uma vez com rede e volte aqui."
                actionLabel="Abrir a Carteira"
                onAction={() => void navigate('/carteira')}
              />
            )}
          </div>
        )}

        {fase === 'analisando' && <EsqueletoAnalise segundosDeAudio={duracaoEmAnalise} />}

        {emConfirmacao && rascunho && (
          <CartaoConfirmacao
            rascunho={rascunho}
            alvos={alvos}
            despachar={despachar}
            onAbrirBusca={() => {
              setBuscaAberta(true)
            }}
            onEscolherAlvo={(alvo) => {
              despachar({ tipo: 'alvo', alvo, papeisOcupados: papeisOcupados(alvo) })
            }}
            valorAtualDoContato={valorAtualDoContato}
            transcricaoAberta={transcricaoAberta}
            onAlternarTranscricao={() => {
              setTranscricaoAberta((v) => !v)
            }}
          />
        )}
      </div>

      {/* ── Barra de acción, levantada sobre el teclado ─────────────────── */}
      {emConfirmacao && rascunho && (
        <div
          className={cx(
            'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur',
            'px-safe',
          )}
          style={{
            // visualViewport: en Android el teclado NO mueve el layout
            // viewport, así que sin esto la barra queda DEBAJO del teclado.
            transform: `translateY(-${String(alturaTeclado)}px)`,
            paddingBottom:
              alturaTeclado > 0 ? '0.75rem' : 'calc(var(--safe-bottom) + var(--spacing-nav-visivel))',
          }}
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2 px-4 pt-3">
            {bloqueado && (
              <p className="text-center text-xs font-medium text-danger">
                {textoDoQueFalta(rascunho)}
              </p>
            )}
            {/* Cuando el host los dibuja abajo de todo, no se dibujan acá:
                dos «Confirmar» para la misma escritura es exactamente cómo se
                registra dos veces el mismo hecho. */}
            {!confirmarNativo && (
              <Button
                block
                size="lg"
                icon={<Check size={20} aria-hidden />}
                disabled={bloqueado}
                loading={fase === 'salvando'}
                hapticPattern="success"
                onClick={() => void confirmarRegistro()}
              >
                Confirmar
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                block
                icon={<Mic size={18} aria-hidden />}
                disabled={fase === 'salvando' || !podeGravar}
                onClick={corrigirFalando}
              >
                Corrigir falando
              </Button>
              {!descartarNativo && (
                <Button
                  variant="ghost"
                  block
                  icon={<X size={18} aria-hidden />}
                  disabled={fase === 'salvando'}
                  onClick={() => void descartar()}
                >
                  Descartar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <SeletorDeAlvo
        open={buscaAberta}
        onClose={() => {
          setBuscaAberta(false)
        }}
        alvos={alvos}
        selecionado={rascunho?.alvo ?? null}
        carregando={carregandoAlvos}
        onEscolher={(alvo) => {
          despachar({ tipo: 'alvo', alvo, papeisOcupados: papeisOcupados(alvo) })
        }}
      />

      <EntradaAlternativa
        open={tecladoAberto}
        onClose={() => {
          setTecladoAberto(false)
        }}
        onEnviar={enviarTexto}
        ocupado={fase === 'analisando'}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Fila de notas pendientes
   ══════════════════════════════════════════════════════════════════════════ */

function FilaPendente({
  itens,
  onRetomar,
  onDescartar,
}: {
  itens: ReadonlyArray<{ id: string; titulo: string; registrada: boolean }>
  onRetomar: (id: string, registrada: boolean) => void
  onDescartar: (id: string) => void
}) {
  if (itens.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-fg-subtle">
        <CloudOff size={14} aria-hidden />
        Notas na fila
      </h3>
      {itens.map((i) => (
        <Card key={i.id} padding="sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{i.titulo}</p>
              <p className="text-xs text-fg-muted">
                {i.registrada ? 'Registro salvo · falta a transcrição' : 'Ainda não registrada'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onRetomar(i.id, i.registrada)
                }}
              >
                {i.registrada ? 'Transcrever' : 'Retomar'}
              </Button>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Descartar nota"
                onClick={() => {
                  onDescartar(i.id)
                }}
              >
                <Trash2 size={16} aria-hidden />
              </IconButton>
            </div>
          </div>
        </Card>
      ))}
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Traducciones de dominio
   ══════════════════════════════════════════════════════════════════════════ */

function notaSemTranscricao(tipo: ActivityType): string {
  return `${ACTIVITY_TYPE_CONFIG[tipo].label} registrada por voz — transcrição pendente.`
}

/** El canal del touchpoint sale del tipo de actividad, no se pregunta. */
function canalDoTipo(tipo: ActivityType): Channel {
  const canal = ACTIVITY_TYPE_CONFIG[tipo].channel
  // meeting/demo/test no tienen canal propio en el CHECK del v2: el toque
  // presencial entra como 'phone' hasta que se amplíe touchpoints_channel_check
  // (TODO 5.1.7 de ESTADO.md).
  return canal ?? 'phone'
}

/**
 * El canal de la TAREA que deja el gate. Es otro vocabulario que el de los
 * toques de cadencia: `tasks.canal` acepta 'meeting'/'visit'/'demo' y NO acepta
 * 'phone' (CHECK `tasks_canal_chk`). Traducir acá es lo que evita un 400 que el
 * outbox reintentaría para siempre.
 */
const CANAL_DA_TAREFA: Readonly<Record<ActivityType, CanalTarefa>> = {
  call: 'call',
  email: 'email',
  meeting: 'meeting',
  whatsapp: 'whatsapp',
  linkedin: 'linkedin',
  demo: 'demo',
  test: 'demo',
  proposal: 'proposal',
  negotiation: 'meeting',
  note: 'other',
  ai_suggestion: 'other',
  stage_change: 'other',
}

function canalDaTarefa(tipo: ActivityType): CanalTarefa {
  return CANAL_DA_TAREFA[tipo]
}

function proximaSequencia(toquesFeitos: number): TouchpointSeq {
  const n = Math.min(7, Math.max(1, toquesFeitos + 1))
  return n as TouchpointSeq
}

function resultadoDoTouchpoint(r: { tipo: ActivityType; resultado: string | null }): TouchpointResult {
  if (r.tipo === 'meeting' || r.tipo === 'demo') return 'meeting_scheduled'
  if (r.resultado === 'positivo') return 'interested'
  if (r.resultado === 'negativo') return 'not_interested'
  if (r.resultado === 'pendente') return 'no_response'
  return 'other'
}

function rotuloDaNota(mime: string, segundos: number): string {
  if (mime.startsWith('image/')) return 'Foto'
  return `Nota de voz · ${String(Math.round(segundos))}s`
}
