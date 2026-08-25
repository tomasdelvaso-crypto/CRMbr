// src/screens/Placar/index.tsx
// PLACAR DA SEMANA — presión social sana en un equipo de 4.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES QUE HACEN A ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NADIE ES ÚLTIMO. No hay ranking, no hay posiciones, no hay medallas de
//    plata. Cuatro carriles paralelos, cada uno contra SU meta, en orden
//    alfabético. Con n=4 un leaderboard fabrica un último público permanente
//    que es el 25 % del equipo comercial, sentado en la misma sala.
//
// 2. TODA MÉTRICA ES TOCABLE. Cada número abre la cuenta entera: fórmula,
//    insumos y regla. Si el equipo sospecha que los puntos son arbitrarios,
//    el sistema muere en un mes y se lleva puesta la credibilidad del CRM.
//
// 3. CINCO TÍTULOS PARA CUATRO PERSONAS. Todos ganan algo casi siempre, y
//    nadie gana dos. Se revelan viernes 17h: adelantar el resultado mata la
//    revelación, que es la mitad de lo que hace que la gente mire.
//
// 4. SE PUEDE APAGAR ENTERO. El interruptor está acá mismo, no escondido en
//    Ajustes, y apagado la pantalla sigue mostrando los números de la semana.
//    Se apaga el juego, nunca la información.
//
// Ventus es narrador, no capataz: celebra en concreto y jamás usa culpa. Un
// número que bajó se cuenta con el dato («sua média é 4 — a semana ainda tem
// espaço»), nunca con un reproche.

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { Info, Settings2, Trophy } from 'lucide-react'
import {
  useDefinirPreferenciasDoJogo,
  useEnviarKudo,
  useKudosDaSemana,
  usePlacarSemana,
  usePreferenciasDoJogo,
  useDiaVigente,
  type LinhaEuVsEu,
  type MetricaDeCarril,
  type PlacarSemana,
  type PreferenciasDoJogo,
  type TrofeuDaSemana,
} from '@/data'
import { Confetti, EmptyState, PullToRefresh, Skeleton, haptic, toast } from '@/ui'
import { SessionContext } from '@/app/session-context'
import { AjustesDoJogo } from './AjustesDoJogo'
import { CarrisDoTime } from './CarrisDoTime'
import { ColetivoETemporada } from './ColetivoETemporada'
import { ComoCalculei, type ExplicacaoDeMetrica } from './ComoCalculei'
import { EuVsEu } from './EuVsEu'
import { Kudos } from './Kudos'
import { ResumoDaSemana } from './ResumoDaSemana'
import { Trofeus } from './Trofeus'

export default function PlacarScreen() {
  const queryClient = useContext(QueryClientContext)
  const sessao = useContext(SessionContext)

  // El guardián existe para que la ruta nunca reviente cuando la capa de datos
  // todavía no está montada (arranque en frío, smoke test del router). Pinta
  // la MISMA silueta que el estado de carga real.
  if (!queryClient || !sessao) return <EsqueletoDoPlacar />
  return <Placar vendorName={sessao.vendorName} />
}

function Placar({ vendorName }: { vendorName: string | null }) {
  const hoje = useDiaVigente()
  const placar = usePlacarSemana(vendorName, hoje)
  const prefs = usePreferenciasDoJogo(vendorName)
  const kudos = useKudosDaSemana(vendorName, hoje)

  const definirPrefs = useDefinirPreferenciasDoJogo()
  const enviarKudo = useEnviarKudo()

  const [metrica, setMetrica] = useState<MetricaDeCarril>('avanco')
  const [explicacao, setExplicacao] = useState<ExplicacaoDeMetrica | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [celebrar, setCelebrar] = useState(false)

  const dados = placar.data
  const preferencias = prefs.data

  const mudarPrefs = (mudancas: Partial<PreferenciasDoJogo>): void => {
    if (vendorName === null) return
    definirPrefs.mutate({ vendor: vendorName, mudancas })
  }

  const meuTrofeu = useMemo(
    () => dados?.trofeus.find((t) => t.vencedor !== null && t.vencedor === vendorName) ?? null,
    [dados, vendorName],
  )

  /*
   * Celebración del troféu. Se dispara UNA vez por semana y por dispositivo:
   * el troféu es un momento, no un banner permanente, y volver a tirar confeti
   * cada vez que se abre la pantalla lo convierte en ruido.
   *
   * El guard vive en localStorage y no en memoria porque la revelación es a
   * las 17h de un viernes: casi siempre la pantalla se abre DESPUÉS, con el
   * troféu ya revelado, y un guard de sesión nunca llegaría a celebrar.
   */
  const jaCelebrou = useRef(false)
  useEffect(() => {
    if (jaCelebrou.current) return
    if (!dados || !meuTrofeu || !dados.revelacao.revelado) return
    if (preferencias?.ligado !== true || preferencias.celebracoes !== true) return

    const chave = `ventus:trofeu:${vendorName ?? ''}:${dados.semana}`
    if (leuBandeira(chave)) return

    jaCelebrou.current = true
    marcarBandeira(chave)
    haptic('celebration')
    toast({
      message: `${meuTrofeu.rotulo} é seu esta semana — ${meuTrofeu.detalhe ?? meuTrofeu.criterio}`,
      tone: 'destaque',
      durationMs: 6000,
    })

    // En el frame siguiente: el sheet y la lista terminan de pintar ANTES de
    // que arranque el confeti, y no se encadenan dos renders seguidos.
    const raf = requestAnimationFrame(() => setCelebrar(true))
    return () => cancelAnimationFrame(raf)
  }, [dados, meuTrofeu, preferencias, vendorName])

  const recarregar = async () => {
    await Promise.all([placar.refetch(), kudos.refetch()])
  }

  if (placar.isPending || prefs.isPending) return <EsqueletoDoPlacar />

  if (!dados || !preferencias) {
    return (
      <div className="px-4 pt-10">
        <EmptyState
          icon={<Trophy size={28} />}
          title="O placar abre com a sua carteira"
          description="Assim que a carteira terminar de baixar, a semana aparece aqui inteira."
          actionLabel="Tentar de novo"
          onAction={() => void placar.refetch()}
        />
      </div>
    )
  }

  const abrirMetrica = (linha: LinhaEuVsEu) => {
    setExplicacao({
      titulo: linha.rotulo,
      valor: String(linha.atual),
      linhas: linha.comoCalculei,
    })
  }

  /* ── Juego apagado: el resumen factual, sin perder acceso a nada ─────── */

  if (!preferencias.ligado) {
    return (
      <>
        <ResumoDaSemana
          rotuloSemana={dados.rotuloSemana}
          linhas={dados.euVsEu}
          onExplicar={abrirMetrica}
          onAjustes={() => setAjustes(true)}
        />
        <ComoCalculei explicacao={explicacao} onClose={() => setExplicacao(null)} />
        <AjustesDoJogo
          open={ajustes}
          onClose={() => setAjustes(false)}
          prefs={preferencias}
          onMudar={mudarPrefs}
        />
      </>
    )
  }

  const colegas = dados.carris[metrica]
    .filter((c) => !c.euMesmo)
    .map((c) => c.vendorName)

  return (
    <PullToRefresh onRefresh={recarregar}>
      <div className="pb-10">
        <Cabecalho placar={dados} onExplicarPa={() => abrirPa(dados, setExplicacao)} />

        <EuVsEu linhas={dados.euVsEu} onExplicar={abrirMetrica} />

        {preferencias.carrisDoTime && (
          <CarrisDoTime
            carris={dados.carris}
            metrica={metrica}
            onMetrica={setMetrica}
            onExplicar={() => setExplicacao(EXPLICACAO_DOS_CARRIS)}
          />
        )}

        <Trofeus
          trofeus={dados.trofeus}
          revelado={dados.revelacao.revelado}
          textoDaRevelacao={dados.revelacao.texto}
          vendorName={vendorName}
          onExplicar={(t) => setExplicacao(explicarTrofeu(t))}
        />

        <ColetivoETemporada
          meta={dados.metaColetiva}
          temporada={dados.temporada}
          recordes={dados.recordes}
          onExplicarMeta={() =>
            setExplicacao({
              titulo: 'Meta coletiva do mês',
              valor: `${dados.metaColetiva.atual} de ${dados.metaColetiva.meta}`,
              linhas: dados.metaColetiva.comoCalculei,
              rodape:
                'Num time de 4 que divide contas, a competição pura põe cada um a torcer para o outro falhar. A barra coletiva faz passar um contato para o colega valer a pena.',
            })
          }
          onExplicarTemporada={() =>
            setExplicacao({
              titulo: `Temporada ${dados.temporada.numero}`,
              valor: `${dados.temporada.bilhetes} bilhete(s)`,
              linhas: dados.temporada.comoCalculei,
              rodape:
                'Com 4 pessoas o líder fica inalcançável em três dias. O reset de 4 semanas é o que mantém o jogo vivo — e o sorteio é o que mantém motivo para quem começou devagar.',
            })
          }
        />

        {preferencias.kudos && (
          <Kudos
            kudos={kudos.data}
            colegas={colegas}
            enviando={enviarKudo.isPending}
            onEnviar={async (para, texto) => {
              if (vendorName === null) return
              await enviarKudo.mutateAsync({ de: vendorName, para, texto, hoje })
            }}
          />
        )}

        <div className="mt-8 px-4">
          <button
            type="button"
            onClick={() => setAjustes(true)}
            className="flex min-h-touch w-full items-center justify-center gap-2 text-xs font-medium text-fg-muted"
          >
            <Settings2 size={15} aria-hidden />
            Ajustes do jogo
          </button>
          <p className="mt-1 text-center text-2xs leading-relaxed text-fg-subtle">
            Dá para desligar pontos, troféus e carris sem perder acesso a nada.
          </p>
        </div>
      </div>

      <ComoCalculei explicacao={explicacao} onClose={() => setExplicacao(null)} />

      <AjustesDoJogo
        open={ajustes}
        onClose={() => setAjustes(false)}
        prefs={preferencias}
        onMudar={mudarPrefs}
      />

      <Confetti active={celebrar} onDone={() => setCelebrar(false)} />
    </PullToRefresh>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Cabeçalho
   ══════════════════════════════════════════════════════════════════════════ */

function Cabecalho({ placar, onExplicarPa }: { placar: PlacarSemana; onExplicarPa: () => void }) {
  return (
    <header className="px-4 pt-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs text-fg-subtle">{placar.rotuloSemana}</p>
          <button
            type="button"
            onClick={onExplicarPa}
            className="mt-0.5 flex items-baseline gap-1.5 text-left"
            aria-label={`${placar.paDaSemana} Pontos de Avanço na semana. Ver como foi calculado.`}
          >
            <span className="tnum text-4xl font-semibold tracking-tight text-fg">
              {placar.paDaSemana}
            </span>
            <span className="text-sm font-medium text-fg-muted">PA</span>
            <Info size={14} className="ml-0.5 self-center text-fg-subtle" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 text-right">
          <span className="block text-2xs text-fg-subtle">
            {placar.cookbook.origem === 'negociado' ? 'meta sua' : `rampa · semana ${placar.cookbook.semanaDaRampa}`}
          </span>
          <span className="tnum block text-xs font-medium text-fg-muted">
            {placar.cookbook.metasSemanais.contato} toques · {placar.cookbook.metasSemanais.avanco} avanços
          </span>
        </div>
      </div>

      {placar.pendentesDeProva > 0 && (
        <p className="mt-3 rounded-card bg-warn-soft px-3.5 py-2.5 text-xs leading-relaxed text-warn-soft-fg">
          {placar.pendentesDeProva} evento(s) esperando evidência para creditar. Um áudio de 20
          segundos, um nome com cargo ou a data combinada já resolve.
        </p>
      )}
    </header>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Explicaciones fijas
   ══════════════════════════════════════════════════════════════════════════ */

function abrirPa(
  placar: PlacarSemana,
  set: (e: ExplicacaoDeMetrica) => void,
): void {
  const linha = placar.euVsEu.find((l) => l.metrica === 'pa')
  set({
    titulo: 'Pontos de Avanço da semana',
    valor: `${placar.paDaSemana} PA`,
    linhas: linha?.comoCalculei ?? [],
    rodape:
      'As comissões ficam fora do jogo. Os pontos dão status e escolha, nunca dinheiro — quando pontos pagam dinheiro, a gente mente.',
  })
}

const EXPLICACAO_DOS_CARRIS: ExplicacaoDeMetrica = {
  titulo: 'Por que não tem posição',
  valor: 'Quatro carris, zero posições',
  linhas: [
    'Somos quatro. Um ranking produz um vencedor e um último público permanente — 25% do time comercial, sentado na mesma sala.',
    'Cada faixa mede a pessoa contra a META DELA, não contra a sua. Duas pessoas com metas diferentes podem estar as duas em 100% ao mesmo tempo.',
    'A ordem é alfabética e não muda com o resultado. Não há 1º, não há 4º, não há medalha de prata.',
    'Quem não tem snapshot da semana aparece com a faixa vazia e “sem dados”, nunca com zero: um telefone sem sinal não é uma acusação.',
    'O que se vê do colega é o carril, para saber onde o time está. O que não se vê é quem está ganhando, porque ninguém está.',
  ],
  rodape:
    'A única lista ordenada do produto são os recordes históricos — e são de marcas, que raramente trocam de dono, não de pessoas.',
}

function explicarTrofeu(t: TrofeuDaSemana): ExplicacaoDeMetrica {
  const comuns = [
    'Os cinco saem sexta às 17h, sobre a semana que fecha.',
    'Ninguém ganha dois: atribui-se o melhor disponível, e quando um nome sai, sai da fila dos outros quatro.',
    'Com 4 pessoas e 5 títulos, todo mundo ganha alguma coisa quase sempre. É de propósito.',
    'As categorias giram por trimestre, para que ninguém fique dono de um título por mérito de um perfil só.',
  ]
  const proprio: Readonly<Record<string, string>> = {
    motor: 'Motor: mais Pontos de Avanço na semana, já com tetos e regra da prova aplicados.',
    escalador: 'Escalador: maior variação de escalas PPVVCC sustentada por evidência. Corrigir para baixo com prova vale o mesmo que subir.',
    conversador: 'Conversador: melhor razão entre conversas e toques. Não é quem tocou mais — é quem fez o outro lado responder.',
    zelador: 'Zelador: zero compromissos vencidos e campos obrigatórios em dia. É o troféu que transforma higiene de dado em status.',
    reanimador: 'Reanimador: mais contas dormindo há 45 dias ou mais que voltaram a responder.',
  }
  return {
    titulo: `Troféu ${t.rotulo}`,
    valor: t.vencedor ? primeiroNomeDe(t.vencedor) : 'Sexta, 17h',
    linhas: [proprio[t.chave] ?? t.criterio, ...comuns],
    rodape:
      'Zelador é o truque do desenho inteiro: 51 das 54 oportunidades do v2 não tinham próxima ação com data. Transformar isso em status público é mais barato que qualquer cobrança.',
  }
}

function primeiroNomeDe(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}

/* ══════════════════════════════════════════════════════════════════════════
   Bandera de celebración (por dispositivo)
   ══════════════════════════════════════════════════════════════════════════ */

function leuBandeira(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) === '1'
  } catch {
    // Safari en modo privado tira acá. Sin bandera, celebramos igual: es
    // preferible una celebración de más que ninguna.
    return false
  }
}

function marcarBandeira(chave: string): void {
  try {
    window.localStorage.setItem(chave, '1')
  } catch {
    // Ídem: la celebración no puede depender de que el storage exista.
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Carga
   ══════════════════════════════════════════════════════════════════════════ */

function EsqueletoDoPlacar() {
  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <div className="h-3 w-28 animate-pulse rounded bg-skeleton" />
        <div className="mt-2 h-9 w-24 animate-pulse rounded bg-skeleton" />
      </div>
      <Skeleton variant="placar" />
    </div>
  )
}
