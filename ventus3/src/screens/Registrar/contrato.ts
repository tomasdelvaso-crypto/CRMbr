// src/screens/Registrar/contrato.ts
// EL CONTRATO de POST /api/ingest, escrito desde el lado del cliente.
//
// Este archivo es la fuente de verdad de la forma del request y del response.
// `api/ingest.ts` (otro agente) debe importar estos tipos —o replicarlos
// literalmente— para que el compilador ate las dos puntas. Mientras el
// endpoint devuelva 501, la pantalla funciona con `mockIngest()`.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUÉ CADA COSA ESTÁ COMO ESTÁ
//
// 1. El audio viaja como multipart/form-data, NUNCA como base64 en un JSON.
//    Un minuto de opus son ~120 kB; en base64 son 160 kB y hay que
//    materializar la cadena entera en memoria en un teléfono que ya está
//    grabando. El resto del pedido va en un campo `meta` con el JSON.
//
// 2. `clientUuid` lo genera el CLIENTE y es el mismo id que:
//      · la fila de `audioBlobs` en IndexedDB,
//      · el `client_uuid` de la `activity` que va a nacer,
//      · la clave de idempotencia del outbox.
//    El servidor NO escribe en la base desde acá: /api/ingest transcribe y
//    propone. Quien escribe es el vendedor al tocar Confirmar, y esa escritura
//    pasa por el outbox como cualquier otra. Es el propose-then-commit de M8
//    llevado a la ingesta: el modelo nunca es la última palabra.
//
// 3. `carteira` viaja en el request con los nombres reales del vendedor. Es la
//    única lista contra la que el servidor puede matchear, y es lo que impide
//    que invente un cliente que no existe (criterio de F3: 0 clientes
//    inventados en 20 audios de prueba). Si el modelo no reconoce a nadie,
//    devuelve `candidatos: []` y la pantalla pide desambiguación a mano.
//
// 4. Toda propuesta de escala VIENE CON CITA o no viene. La regra da prova
//    (M6) la impone `scale_evidence_prova_chk` en Postgres; acá se impone
//    antes, en el tipo: `citacao` es `string`, no `string | null`.
//
// 5. El idioma NO se fija ('auto'). El equipo mezcla portugués y español en la
//    misma frase; fijar `language: 'pt'` en Whisper degrade el portuñol.

import type {
  ActivityResult,
  ActivityType,
  DateShortcut,
  IsoDate,
  IsoDateTime,
  ScaleKey,
  StageId,
} from '@/core'
import { criarBandeiraDeMock } from '@/lib/mock-flag'

/** Versión del contrato. Sube si cambia la forma; el server rechaza otra. */
export const CONTRATO_VERSAO = '1' as const

/** Ruta del endpoint. Relativa: mismo origen que la app (Vercel). */
export const INGEST_PATH = '/api/ingest'

/* ══════════════════════════════════════════════════════════════════════════
   Request
   ══════════════════════════════════════════════════════════════════════════ */

/** De dónde salió lo que se manda a interpretar. */
export type FonteIngest = 'audio' | 'texto' | 'email' | 'whatsapp' | 'foto'

/** Un alvo posible, tal como la app se lo muestra al servidor para matchear. */
export interface ItemCarteiraIngest {
  kind: 'opportunity' | 'lead'
  id: number
  /** Nombre del negocio o de la empresa. */
  nome: string
  /** Empresa / cliente. */
  cliente: string
}

/**
 * El `meta` del multipart, o el cuerpo entero cuando `fonte` no es 'audio'.
 * Siempre JSON.
 */
export interface IngestMeta {
  versao: typeof CONTRATO_VERSAO
  /** `opportunities.vendor` — texto, como en producción. */
  vendor: string
  /** `vendors.id`, cuando la sesión ya lo resolvió. Informativo. */
  vendorId?: number | null
  /** Idempotencia y atadura con audioBlobs / activities.client_uuid. */
  clientUuid: string
  fonte: FonteIngest
  /** Instante de captura según el reloj del teléfono (puede venir corrido). */
  capturadoEm: IsoDateTime
  /** Duración real del audio. 0 en las fuentes de texto. */
  duracaoSeg: number
  /** mimeType negociado de verdad ('audio/mp4' en iOS <= 18.3). */
  mime?: string
  /**
   * Alvo sugerido cuando Registrar se abrió desde un Dossiê o desde una
   * tarjeta de Hoje. El servidor lo usa como prior, no como certeza.
   */
  alvoSugerido?: { kind: 'opportunity' | 'lead'; id: number } | null
  /** La cartera viva del vendedor. Fuera de esta lista no se matchea nada. */
  carteira: readonly ItemCarteiraIngest[]
  /** 'auto' = no fijar idioma en el ASR. Banca el portuñol. */
  idioma?: 'auto' | 'pt-BR'
  /** Fecha de hoje en America/Sao_Paulo, para resolver «segunda que vem». */
  hoje: IsoDate
  /**
   * Cuando esto es una corrección hablada de un registro que el vendedor está
   * mirando («não, o teste é na linha 4»), acá va lo que ya se había entendido.
   * El servidor tiene que MEZCLAR, no empezar de cero: la nota original tenía
   * cinco datos y la corrección toca uno.
   */
  correcao?: { resumo: string; transcricao: string | null } | null
}

/** Cuerpo cuando la fuente es texto pegado (teclado, e-mail, WhatsApp). */
export interface IngestRequestTexto extends IngestMeta {
  fonte: 'texto' | 'email' | 'whatsapp'
  texto: string
}

/**
 * Cuerpo cuando hay archivo. Va como multipart/form-data con dos campos:
 *   · `meta`    — JSON con IngestMeta
 *   · `arquivo` — el Blob (audio o imagen)
 */
export interface IngestRequestArquivo extends IngestMeta {
  fonte: 'audio' | 'foto'
}

export type IngestRequest = IngestRequestTexto | IngestRequestArquivo

/** Nombres de los campos del multipart. Fijos: el server los busca así. */
export const CAMPO_META = 'meta'
export const CAMPO_ARQUIVO = 'arquivo'

/* ══════════════════════════════════════════════════════════════════════════
   Response
   ══════════════════════════════════════════════════════════════════════════ */

/** Candidato de cliente. Nunca uno que no estuviera en `carteira`. */
export interface CandidatoIngest {
  kind: 'opportunity' | 'lead'
  id: number
  nome: string
  cliente: string
  /** 0..1. Por debajo de 0,6 la pantalla NO preselecciona: pregunta. */
  confianca: number
  /** Por qué lo eligió, en PT-BR y citando el audio: 'disse "Tetra"'. */
  motivo: string
}

/**
 * Un delta propuesto sobre una escala PPVVCC.
 * `citacao` no es opcional: sin prueba no hay propuesta (M6).
 */
export interface DeltaEscalaIngest {
  escala: ScaleKey
  /** Nivel actual conocido por el servidor, si lo tenía. */
  de: number | null
  /** Nivel propuesto, 0..10. */
  para: number
  /** Cita TEXTUAL del cliente. Es lo que justifica el número. */
  citacao: string
  /** Quién lo dijo: 'Marcelo, comprador'. Sin fuente es opinión, no prueba. */
  fonte: string | null
  confianca: number
}

/** Contacto detectado con su papel. Solo rellena huecos (ver mutations.ts). */
export interface ContatoIngest {
  papel: 'power_sponsor' | 'sponsor' | 'influencer' | 'support_contact'
  nome: string
  cargo: string | null
  confianca: number
}

/** La próxima acción propuesta. La FECHA la confirma el vendedor con botones. */
export interface ProximaAcaoIngest {
  /** Texto imperativo: 'Enviar proposta revisada para o Marcelo'. */
  texto: string
  /** Fecha ya resuelta a ISO, o null si el audio no la dijo. */
  data: IsoDate | null
  /** Qué atajo representa esa fecha, para preseleccionar la pastilla. */
  atalho: DateShortcut | null
}

export interface ExtracaoIngest {
  /** Ordenados por confianza descendente. Vacío = no reconoció a nadie. */
  candidatos: CandidatoIngest[]
  /** Tipo de actividad. null si no se puede inferir: la UI pide elegir. */
  tipo: ActivityType | null
  /** 1-3 frases en PT-BR. Es lo que se guarda en `activities.description`. */
  resumo: string
  /**
   * El valor canónico de `activities.result`.
   *
   * Verificado contra producción: de 168 actividades con resultado, 56 usan
   * este vocabulario ('positivo' 35, 'negativo' 10, 'pendente' 8, 'neutro' 3)
   * y solo 5 tienen prosa libre. Devolver prosa acá ensucia la única columna
   * con la que se puede agrupar. La frase va en `resultadoTexto`.
   */
  resultado: ActivityResult | null
  /** La frase del cliente sobre cómo quedó: 'Ficou de mandar o volume'. */
  resultadoTexto: string | null
  proximaAcao: ProximaAcaoIngest | null
  escalas: DeltaEscalaIngest[]
  contatos: ContatoIngest[]
  /** Etapa sugerida. La app NO la aplica sola: el gate se decide en el Dossiê. */
  etapaSugerida: StageId | null
  /** Código del cookbook, ej. '3B'. */
  metodologia: string | null
  /** Señales de comprador detectadas, en PT-BR. Informativas. */
  sinais: string[]
}

export interface IngestResponse {
  versao: typeof CONTRATO_VERSAO
  /** Eco del clientUuid pedido. Si no coincide, la app descarta la respuesta. */
  clientUuid: string
  /** Transcripción completa. null cuando la fuente ya era texto. */
  transcricao: string | null
  extracao: ExtracaoIngest
  /** ms del pipeline entero. Alimenta la métrica p95 de 45 s. */
  duracaoMs: number
  /** Aviso en PT-BR para mostrar sin bloquear ('áudio muito curto'). */
  aviso: string | null
}

/** Códigos de error que la pantalla sabe distinguir. */
export type CodigoErroIngest =
  | 'not_implemented'
  | 'sem_sessao'
  | 'audio_invalido'
  | 'audio_vazio'
  | 'muito_grande'
  | 'transcricao_falhou'
  | 'extracao_falhou'
  | 'limite'
  /** El aparato no tiene red: el pedido ni siquiera salió. */
  | 'sem_rede'
  /** El endpoint existe y está com problemas (5xx, timeout). Se reintenta. */
  | 'servidor'
  | 'interno'

/**
 * De QUIÉN es el problema cuando la ingesta no pudo completarse.
 *
 * Dos, y son dos porque piden cosas distintas del vendedor: con `sem_rede`
 * camina hasta la puerta del galpão a buscar señal; con `servidor` no hay nada
 * que hacer salvo seguir — el audio sube solo cuando el Ventus se cure.
 */
export type CausaDaFalha = 'sem_rede' | 'servidor'

export interface IngestErroBody {
  error: { code: CodigoErroIngest | string; message: string }
}

/* ══════════════════════════════════════════════════════════════════════════
   Errores tipados del cliente
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Falla de la ingesta.
 *
 * `recuperavel` distingue las dos únicas reacciones posibles:
 *   true  → el audio sigue en IndexedDB, se reintenta solo cuando haya red y
 *           el vendedor puede confirmar el registro a mano ahora mismo.
 *   false → no tiene arreglo reintentando (el audio está roto, el server dijo
 *           que no); igual el blob se conserva, pero no se reencola.
 */
export class ErroIngest extends Error {
  readonly codigo: CodigoErroIngest | string
  readonly recuperavel: boolean
  readonly status: number

  constructor(
    message: string,
    codigo: CodigoErroIngest | string,
    recuperavel: boolean,
    status = 0,
  ) {
    super(message)
    this.name = 'ErroIngest'
    this.codigo = codigo
    this.recuperavel = recuperavel
    this.status = status
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Mock — se activa con flag y NUNCA se cuela en producción por accidente
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ¿Modo mock?
 *
 * Tres formas de encenderlo, en orden de precedencia:
 *   1. `VITE_INGEST_MOCK=on` en el build (o `off` para forzar el real).
 *   2. `localStorage['ventus.ingest.mock'] = 'on'` — para probar en el
 *      teléfono sin rebuildear.
 *   3. Automático: si /api/ingest responde 404/501 —o sea, el endpoint NO
 *      EXISTE en este deploy—, la pantalla cae al mock por lo que queda de la
 *      sesión y lo DICE en la tarjeta. Un 500 NO entra acá: es una falla
 *      pasajera y el próximo audio vuelve a probar la API (ver mock-flag.ts).
 *
 * `localStorage['ventus.ingest.mock'] = 'off'` apaga el mock aunque el build
 * traiga la env en 'on', para poder probar el endpoint real en el aparato.
 *
 * La mecánica de la bandera (env → fallback → localStorage) es compartida:
 * vive en @/lib/mock-flag y la usa igual el chat del Ventus. El estado del
 * fallback NO se comparte: que /api/ingest esté caído no vuelve mock al chat.
 */
const bandeira = criarBandeiraDeMock({
  valorDaEnv: import.meta.env.VITE_INGEST_MOCK,
  chave: 'ventus.ingest.mock',
})

export const CHAVE_MOCK = bandeira.CHAVE
/** Enciende el mock para lo que queda de la sesión (SÓLO 404/501). */
export const ativarMockPorFallback = bandeira.ativarMockPorFallback
export const mockPorFallbackAtivo = bandeira.mockPorFallbackAtivo
export const modoMock = bandeira.modoMock
/** 5xx/timeout/red: falla pasajera. No latchea; sólo arma el backoff. */
export const registrarFalhaDoServidor = bandeira.registrarFalhaDoServidor
export const registrarSucesso = bandeira.registrarSucesso
export const podeTentarApi = bandeira.podeTentarApi
export const servidorComProblemas = bandeira.servidorComProblemas
/** Borra latch y racha de fallas. Para los tests y el diagnóstico. */
export const reiniciarBandeira = bandeira.reiniciar

/** Escenarios del mock: se rotan para ejercitar los caminos difíciles. */
export type CenarioMock = 'feliz' | 'ambiguo' | 'sem_cliente' | 'pobre'

let contadorMock = 0

/**
 * Respuesta simulada. Rota entre escenarios para que la pantalla se pruebe con
 * datos ricos Y con datos pobres —que es como se ve el 90% de la base real.
 */
export async function mockIngest(meta: IngestMeta, cenario?: CenarioMock): Promise<IngestResponse> {
  // Latencia realista de Groq + Claude: entre 2 y 4 s. Sin esto no se ve el
  // esqueleto y nadie descubre que la espera está mal contada.
  await new Promise((r) => setTimeout(r, 1400))

  contadorMock += 1
  const ordem: CenarioMock[] = ['feliz', 'ambiguo', 'pobre', 'sem_cliente']
  const escolhido = cenario ?? ordem[contadorMock % ordem.length] ?? 'feliz'

  const carteira = meta.carteira
  const primeiro = carteira[0]
  const segundo = carteira[1]

  const base: IngestResponse = {
    versao: CONTRATO_VERSAO,
    clientUuid: meta.clientUuid,
    transcricao:
      'Falei agora com o Marcelo da linha 3. Ele disse que a caixa continua abrindo no ' +
      'transporte e que já perderam três cargas esse mês. Falou que se resolver isso ' +
      'consegue aprovar sem passar pelo comitê. Ficou de me mandar o volume mensal ' +
      'até sexta e a gente marca o teste.',
    extracao: {
      candidatos: [],
      tipo: 'call',
      resumo:
        'Ligação com Marcelo (produção): caixa abrindo no transporte, 3 cargas perdidas no mês. ' +
        'Ele consegue aprovar sem comitê se resolvermos.',
      resultado: 'positivo',
      resultadoTexto: 'Ficou de mandar o volume mensal até sexta para agendarmos o teste.',
      proximaAcao: {
        texto: 'Cobrar o volume mensal do Marcelo e marcar o teste',
        data: null,
        atalho: null,
      },
      escalas: [
        {
          escala: 'dor',
          de: 3,
          para: 7,
          citacao: 'a caixa continua abrindo no transporte, já perdemos três cargas esse mês',
          fonte: 'Marcelo, produção',
          confianca: 0.86,
        },
        {
          escala: 'poder',
          de: 2,
          para: 5,
          citacao: 'se resolver isso eu consigo aprovar sem passar pelo comitê',
          fonte: 'Marcelo, produção',
          confianca: 0.71,
        },
      ],
      contatos: [{ papel: 'sponsor', nome: 'Marcelo', cargo: 'Produção', confianca: 0.8 }],
      etapaSugerida: null,
      metodologia: '2B',
      sinais: ['Falou de perda concreta com número', 'Sinalizou autonomia de aprovação'],
    },
    duracaoMs: 3120,
    aviso: null,
  }

  if (escolhido === 'feliz' && primeiro) {
    base.extracao.candidatos = [
      {
        ...primeiro,
        confianca: 0.93,
        motivo: `disse «${primeiro.cliente.split(' ')[0] ?? primeiro.cliente}» duas vezes`,
      },
    ]
    return base
  }

  if (escolhido === 'ambiguo' && primeiro && segundo) {
    base.extracao.candidatos = [
      { ...primeiro, confianca: 0.52, motivo: 'nome parecido no áudio' },
      { ...segundo, confianca: 0.44, motivo: 'mesmo contato mencionado' },
    ]
    return base
  }

  if (escolhido === 'pobre') {
    // El caso real más frecuente: audio corto, sin escalas, sin próxima acción.
    base.transcricao = 'Liguei pro comprador, não atendeu.'
    base.extracao = {
      candidatos: primeiro ? [{ ...primeiro, confianca: 0.88, motivo: 'único cliente citado' }] : [],
      tipo: 'call',
      resumo: 'Liguei para o comprador, não atendeu.',
      resultado: 'pendente',
      resultadoTexto: null,
      proximaAcao: null,
      escalas: [],
      contatos: [],
      etapaSugerida: null,
      metodologia: null,
      sinais: [],
    }
    base.aviso = 'Áudio curto: só deu para o essencial.'
    return base
  }

  // sem_cliente: el modelo no reconoció a nadie. La pantalla tiene que pedirlo.
  base.extracao.candidatos = []
  base.aviso = 'Não reconheci o cliente no áudio.'
  return base
}
