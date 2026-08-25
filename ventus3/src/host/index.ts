// src/host/index.ts
// Barril de la capa de host. Lo que una pantalla necesita importar es
// `useHost` y los tres o cuatro hooks; el resto está acá para Ajustes, para el
// arranque y para los tests.
//
// Regla del proyecto: los barriles no comparten nombres entre sí. `@/host` no
// pisa ni un export de `@/core`, `@/data`, `@/ui` ni `@/push`.

/* ── El adaptador ───────────────────────────────────────────────────────── */
export { HostProvider } from './HostProvider'
export {
  useHost,
  useEhTelegram,
  useEntradaDoHost,
  useBotaoPrimario,
  useBotaoSecundario,
  useBackNativo,
  useTelaCheia,
  useOfertaDeAtalho,
} from './useHost'
export type { OpcoesDeBotao, OfertaDeAtalho } from './useHost'
export { hostAtual, tipoDeHost, redefinirHost } from './detectar'
export { HostContext } from './host-context'
export type { EstadoDeEntrada, HostContextValue } from './host-context'
export type {
  Host,
  TipoDeHost,
  AuthDoHost,
  AvisosDoHost,
  BackDoHost,
  BotoesDoHost,
  ControleDeBotao,
  EstadoDoBotao,
  HapticsDoHost,
  MotivoDeFalhaDeEntrada,
  ResultadoDeEntrada,
} from './tipos'

/* ── Telegram: lo que no entra en las cinco cosas del adaptador ──────────── */
export {
  dentroDoTelegram,
  initDataCru,
  plataforma as plataformaDoTelegram,
  versaoPeloMenos,
  webApp,
} from './ponte-telegram'
export type { ThemeParamsTelegram, UsuarioTelegramWebApp } from './ponte-telegram'

export { entrarComTelegram, jaTemSessao, TMA_AUTH_PATH } from './auth'

export {
  aplicarTema,
  aplicarSafeAreas,
  conectarTema,
  conectarSafeAreas,
  limparTema,
  normalizarCor,
  corDeTextoSobre,
  luminancia,
  PARAMS_DE_TEMA,
} from './tema'

export { salvarRascunho, lerRascunho, apagarRascunho, temNuvem, recortarParaNuvem } from './nuvem'

export {
  deveOferecerAtalho,
  estadoDoAtalho,
  oferecerAtalho,
  ofertaJaFeita,
  marcarOfertaFeita,
  // Sale con alias: `@/install` exporta otro `registrarSessao` (el del convite
  // de instalación, que es puro y recibe la memoria). Son dos contadores
  // distintos y ninguno debe poder pisar al otro en un import.
  registrarSessao as registrarSessaoDoAtalho,
  sessoesContadas,
  SESSAO_DA_OFERTA,
} from './atalho'
export type { EstadoDoAtalho } from './atalho'

export {
  entrarEmTelaCheia,
  sairDaTelaCheia,
  temTelaCheia,
  estaEmTelaCheia,
  aoFalharTelaCheia,
  assinarTelaCheia,
} from './tela-cheia'

/* ── Deep links ─────────────────────────────────────────────────────────── */
export {
  lerStartParam,
  rotaDoAlvo,
  rotaDoStartParam,
  montarStartParam,
  startParamDoCaminho,
  startParamDaUrl,
  linkDoMiniApp,
  MAX_START_PARAM,
  ALFABETO_START_PARAM,
} from './deep-link'
export type { AlvoDeDeepLink, DestinoDeRota, EntidadeDoAlvo } from './deep-link'

export { startParamDaSessao, destinoInicial } from './arranque'
