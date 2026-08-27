// src/screens/Registrar/rascunho.ts
// El borrador que se pinta en la tarjeta de confirmación y el reducer que lo
// mueve. Vive fuera de los componentes por una razón concreta: es lo único que
// hay que mirar para responder «¿por qué el botón Confirmar está apagado?».
//
// Regla del gate (M5): NADA se confirma sin próxima acción CON fecha. La
// validación está acá, en un solo lugar, y la UI solo la refleja.

import {
  ACTIVITY_TYPE_CONFIG,
  todayBr,
  type ActivityResult,
  type ActivityType,
  type IsoDate,
  type ScaleKey,
} from '@/core'
import type { AlvoRegistro } from '@/data'
import type {
  CandidatoIngest,
  ContatoIngest,
  DeltaEscalaIngest,
  FonteIngest,
  IngestResponse,
  CausaDaFalha,
} from './contrato'

/** Confianza mínima para preseleccionar un cliente sin preguntar. */
export const CONFIANCA_MINIMA = 0.6

/** Los tipos que se ofrecen como chips, en orden de frecuencia real. */
export const TIPOS_OFERECIDOS: readonly ActivityType[] = [
  'call',
  'whatsapp',
  'meeting',
  'email',
  'demo',
  'test',
  'proposal',
  'negotiation',
  'note',
]

export const RESULTADOS_OFERECIDOS: readonly ActivityResult[] = [
  'positivo',
  'neutro',
  'negativo',
  'pendente',
]

/** Estado de una propuesta del Ventus. Por escala, nunca por bloque entero. */
export type EstadoProposta = 'pendente' | 'aceita' | 'dispensada'

export interface PropostaEscala {
  escala: ScaleKey
  de: number | null
  /** Nivel propuesto, ya editable por el vendedor. */
  para: number
  /** La cita textual que lo justifica. Sin ella no se puede aceptar. */
  citacao: string
  fonte: string | null
  confianca: number
  estado: EstadoProposta
  /** true si el vendedor cambió el número o la cita. Se marca en la UI. */
  editada: boolean
}

export interface PropostaContato {
  papel: ContatoIngest['papel']
  nome: string
  cargo: string | null
  confianca: number
  estado: EstadoProposta
  /** true cuando la oportunidad YA tiene alguien en ese papel. */
  ocupado: boolean
}

export interface Rascunho {
  /** client_uuid: ata audio, ingest y activity. Nunca cambia. */
  clientUuid: string
  fonte: FonteIngest
  /** Alvo elegido. null obliga a desambiguar antes de confirmar. */
  alvo: AlvoRegistro | null
  /** Candidatos que devolvió el servidor, para los botones de desambiguación. */
  candidatos: CandidatoIngest[]
  tipo: ActivityType
  resumo: string
  resultado: ActivityResult | null
  proximaAcao: string
  proximaAcaoData: IsoDate | null
  /** true si la fecha la propuso el Ventus y el vendedor no la tocó. */
  dataSugerida: boolean
  escalas: PropostaEscala[]
  contatos: PropostaContato[]
  transcricao: string | null
  metodologia: string | null
  sinais: string[]
  aviso: string | null
  /** Segundos de audio. 0 en las entradas de texto. */
  duracaoSeg: number
  /** true cuando el audio quedó en cola sin transcribir (sin red). */
  pendenteDeTranscricao: boolean
  /** true cuando la respuesta vino del mock y no del pipeline real. */
  simulado: boolean
  /**
   * De QUIÉN es el problema cuando la ingesta no pudo completarse.
   *
   * `null` = no hubo falla. La distinción existe porque «sem rede» y «o
   * servidor está com problemas» piden cosas distintas del vendedor: en la
   * primera camina hasta la puerta a buscar señal; en la segunda no hay nada
   * que hacer salvo seguir, y el audio sube solo cuando el Ventus se cure.
   */
  causa: CausaDaFalha | null
}

/* ══════════════════════════════════════════════════════════════════════════
   Constructores
   ══════════════════════════════════════════════════════════════════════════ */

function propostasDeEscala(deltas: readonly DeltaEscalaIngest[]): PropostaEscala[] {
  return deltas
    // Sin cita no se propone: es la regra da prova, aplicada antes de la UI.
    .filter((d) => d.citacao.trim() !== '')
    .map((d) => ({
      escala: d.escala,
      de: d.de,
      para: Math.max(0, Math.min(10, Math.round(d.para))),
      citacao: d.citacao.trim(),
      fonte: d.fonte,
      confianca: d.confianca,
      estado: 'pendente' as EstadoProposta,
      editada: false,
    }))
}

function propostasDeContato(
  contatos: readonly ContatoIngest[],
  alvo: AlvoRegistro | null,
  ocupados: ReadonlySet<string>,
): PropostaContato[] {
  return contatos
    .filter((c) => c.nome.trim() !== '')
    .map((c) => ({
      papel: c.papel,
      nome: c.nome.trim(),
      cargo: c.cargo,
      confianca: c.confianca,
      // Un papel ya ocupado nace dispensado: la propuesta se ve, pero no se
      // aplica ni por accidente. Nunca se pisa un contacto cargado a mano.
      estado: ocupados.has(c.papel) ? ('dispensada' as EstadoProposta) : ('pendente' as EstadoProposta),
      ocupado: alvo?.kind === 'opportunity' && ocupados.has(c.papel),
    }))
}

export interface ContextoRascunho {
  clientUuid: string
  fonte: FonteIngest
  duracaoSeg: number
  /** Alvo pre-elegido (vino de un Dossiê, o el vendedor ya lo tocó). */
  alvoInicial: AlvoRegistro | null
  /** Para resolver el candidato a un AlvoRegistro real. */
  alvos: readonly AlvoRegistro[]
  /** Papeles ya ocupados en la oportunidad elegida. */
  papeisOcupados: ReadonlySet<string>
  simulado: boolean
  /**
   * Lo que el vendedor escribió o pegó, cuando la fuente era texto.
   *
   * Si la ingesta falla, ESTO no se puede perder: acaba de teclearlo. El
   * borrador offline lo usa como resumo para que quede exactamente donde
   * estaba, listo para confirmar a mano.
   */
  textoOriginal?: string | null
}

/** Arma el borrador a partir de lo que devolvió /api/ingest. */
export function rascunhoDeResposta(
  resposta: IngestResponse,
  ctx: ContextoRascunho,
): Rascunho {
  const e = resposta.extracao
  const melhor = e.candidatos[0]

  // Solo se preselecciona con confianza suficiente Y un único candidato claro.
  // Con dos candidatos parejos, preseleccionar es peor que preguntar: el
  // vendedor confirma en piloto automático y el registro va al cliente errado.
  const segundo = e.candidatos[1]
  const claro =
    melhor !== undefined &&
    melhor.confianca >= CONFIANCA_MINIMA &&
    (segundo === undefined || melhor.confianca - segundo.confianca >= 0.15)

  const resolvido = claro
    ? (ctx.alvos.find((a) => a.kind === melhor.kind && a.id === melhor.id) ?? null)
    : null

  const alvo = ctx.alvoInicial ?? resolvido

  const resumoCompleto =
    e.resultadoTexto && e.resultadoTexto.trim() !== ''
      ? `${e.resumo.trim()}\n\n${e.resultadoTexto.trim()}`
      : e.resumo.trim()

  return {
    clientUuid: resposta.clientUuid,
    fonte: ctx.fonte,
    alvo,
    candidatos: e.candidatos,
    tipo: e.tipo ?? tipoPorFonte(ctx.fonte),
    resumo: resumoCompleto,
    resultado: e.resultado,
    proximaAcao: e.proximaAcao?.texto ?? '',
    proximaAcaoData: e.proximaAcao?.data ?? null,
    dataSugerida: Boolean(e.proximaAcao?.data),
    escalas: propostasDeEscala(e.escalas),
    contatos: propostasDeContato(e.contatos, alvo, ctx.papeisOcupados),
    transcricao: resposta.transcricao,
    metodologia: e.metodologia,
    sinais: e.sinais,
    aviso: resposta.aviso,
    duracaoSeg: ctx.duracaoSeg,
    pendenteDeTranscricao: false,
    simulado: ctx.simulado,
    causa: null,
  }
}

/**
 * Borrador cuando la ingesta NO pudo correr (sin red, servidor caído).
 *
 * Esto es lo que hace que la pantalla siga sirviendo dentro del galpão: el
 * audio ya está en IndexedDB, el vendedor elige el cliente y la fecha con dos
 * toques, y el registro entra igual. La transcripción llega después y aparece
 * en Revisão. Lo inaceptable sería una pantalla que diga «sem conexão» y tire
 * la nota.
 */
export function rascunhoOffline(
  ctx: ContextoRascunho,
  motivo: string,
  causa: CausaDaFalha | null = 'sem_rede',
): Rascunho {
  return {
    clientUuid: ctx.clientUuid,
    fonte: ctx.fonte,
    alvo: ctx.alvoInicial,
    candidatos: [],
    tipo: tipoPorFonte(ctx.fonte),
    resumo: ctx.textoOriginal?.trim() ?? '',
    resultado: null,
    proximaAcao: '',
    proximaAcaoData: null,
    dataSugerida: false,
    escalas: [],
    contatos: [],
    transcricao: null,
    metodologia: null,
    sinais: [],
    aviso: motivo,
    duracaoSeg: ctx.duracaoSeg,
    pendenteDeTranscricao: ctx.fonte === 'audio' || ctx.fonte === 'foto',
    simulado: false,
    causa,
  }
}

function tipoPorFonte(fonte: FonteIngest): ActivityType {
  if (fonte === 'email') return 'email'
  if (fonte === 'whatsapp') return 'whatsapp'
  return 'call'
}

/* ══════════════════════════════════════════════════════════════════════════
   Validación — el gate en un solo lugar
   ══════════════════════════════════════════════════════════════════════════ */

export interface FaltantesRascunho {
  cliente: boolean
  resumo: boolean
  proximaAcao: boolean
  data: boolean
}

export function faltantes(r: Rascunho): FaltantesRascunho {
  return {
    cliente: r.alvo === null,
    // Con audio pendiente de transcribir se acepta un resumo vacío: la nota
    // existe, y exigir que la escriba a mano sería castigarlo por no tener red.
    resumo: r.resumo.trim() === '' && !r.pendenteDeTranscricao,
    proximaAcao: r.proximaAcao.trim() === '',
    data: r.proximaAcaoData === null,
  }
}

export function podeConfirmar(r: Rascunho): boolean {
  const f = faltantes(r)
  return !f.cliente && !f.resumo && !f.proximaAcao && !f.data
}

/** Qué falta, en PT-BR y en una línea. Es el texto del botón deshabilitado. */
export function textoDoQueFalta(r: Rascunho): string | null {
  const f = faltantes(r)
  if (f.cliente) return 'Escolha o cliente'
  if (f.resumo) return 'Escreva o que aconteceu'
  if (f.proximaAcao) return 'Diga qual é a próxima ação'
  if (f.data) return 'Escolha a data da próxima ação'
  return null
}

/** Título de la nota, para la cola de pendientes. */
export function tituloDoRascunho(r: Rascunho): string {
  if (r.alvo) return r.alvo.nome
  const cfg = ACTIVITY_TYPE_CONFIG[r.tipo]
  return `${cfg.label} sem cliente`
}

/* ══════════════════════════════════════════════════════════════════════════
   Acciones del reducer
   ══════════════════════════════════════════════════════════════════════════ */

export type AcaoRascunho =
  | { tipo: 'definir'; rascunho: Rascunho }
  | { tipo: 'alvo'; alvo: AlvoRegistro | null; papeisOcupados: ReadonlySet<string> }
  | { tipo: 'tipoAtividade'; valor: ActivityType }
  | { tipo: 'resumo'; valor: string }
  | { tipo: 'resultado'; valor: ActivityResult | null }
  | { tipo: 'proximaAcao'; valor: string }
  | { tipo: 'proximaAcaoData'; valor: IsoDate }
  | { tipo: 'escalaEstado'; escala: ScaleKey; estado: EstadoProposta }
  | { tipo: 'escalaEditar'; escala: ScaleKey; para: number; citacao: string; fonte: string | null }
  | { tipo: 'contatoEstado'; papel: ContatoIngest['papel']; estado: EstadoProposta }
  | { tipo: 'limpar' }

export function reduzir(estado: Rascunho | null, acao: AcaoRascunho): Rascunho | null {
  if (acao.tipo === 'definir') return acao.rascunho
  if (acao.tipo === 'limpar') return null
  if (estado === null) return null

  switch (acao.tipo) {
    case 'alvo':
      return {
        ...estado,
        alvo: acao.alvo,
        // Cambiar de cliente recalcula qué papeles están ocupados: la
        // propuesta de contacto que era válida para uno puede pisar al otro.
        contatos: estado.contatos.map((c) => ({
          ...c,
          ocupado: acao.alvo?.kind === 'opportunity' && acao.papeisOcupados.has(c.papel),
          estado: acao.papeisOcupados.has(c.papel) ? 'dispensada' : c.estado,
        })),
      }
    case 'tipoAtividade':
      return { ...estado, tipo: acao.valor }
    case 'resumo':
      return { ...estado, resumo: acao.valor }
    case 'resultado':
      return { ...estado, resultado: acao.valor }
    case 'proximaAcao':
      return { ...estado, proximaAcao: acao.valor }
    case 'proximaAcaoData':
      return { ...estado, proximaAcaoData: acao.valor, dataSugerida: false }
    case 'escalaEstado':
      return {
        ...estado,
        escalas: estado.escalas.map((e) =>
          e.escala === acao.escala ? { ...e, estado: acao.estado } : e,
        ),
      }
    case 'escalaEditar':
      return {
        ...estado,
        escalas: estado.escalas.map((e) =>
          e.escala === acao.escala
            ? {
                ...e,
                para: acao.para,
                citacao: acao.citacao,
                fonte: acao.fonte,
                editada: true,
                // Editar es aceptar: el vendedor ya se hizo cargo del número.
                estado: 'aceita',
              }
            : e,
        ),
      }
    case 'contatoEstado':
      return {
        ...estado,
        contatos: estado.contatos.map((c) =>
          c.papel === acao.papel ? { ...c, estado: acao.estado } : c,
        ),
      }
    default:
      return estado
  }
}

/** Fecha de hoy en BRT. Se aísla acá para poder congelarla en tests. */
export function hoje(): IsoDate {
  return todayBr()
}
