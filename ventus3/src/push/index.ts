// src/push/index.ts
// Barril de la capa de Web Push.
//
// Qué entra acá: todo lo que corre en la APP (permiso, suscripción, badge,
// recepción del toque). Qué NO entra: `src/sw-push.ts`, que corre en el
// service worker y compila contra otra lib de TypeScript. Los dos lados solo
// comparten `mensagens.ts`, que no importa nada.
//
// Regla del proyecto: los barriles `@/core`, `@/data`, `@/ui` no comparten ni
// un nombre. `@/push` tampoco: `soporteDeNotificacoes` no pisa a
// `permissaoDeAviso` de `@/data`, la usa.

// `estaInstalado` NO sale por aquí: vive en `@/install` y es uno solo en todo
// el proyecto. Dos barriles con el mismo nombre es una colisión esperando a
// que alguien importe los dos en el mismo archivo.
export { soporteDeNotificacoes, plataformaDoAparelho } from './soporte'
export type { SuporteDeAvisos, PlataformaDoAparelho } from './soporte'

export {
  assinarPush,
  cancelarPush,
  estaAssinado,
  assinaturaAtual,
  chaveVapidPublica,
  base64urlParaBytes,
  bytesParaBase64url,
  TRACK_PATH,
} from './assinatura'
export type { ResultadoDaAssinatura, MotivoDeFalhaDeAssinatura } from './assinatura'

export { badgeDisponivel, definirBadge, limparBadge } from './badge'

export { conectarRecepcaoDeAvisos, consumirAvisoDaUrl, medirAviso } from './recepcao'

export { MENSAGEM_AVISO_CLICADO, MENSAGEM_ASSINATURA_MUDOU } from './mensagens'

// `BlocoDePush` NO se reexporta a propósito: es un componente de Ajustes y
// este barril lo importa el host, que está en el camino crítico del arranque.
// Reexportarlo arrastraría la pantalla de Ajustes —y sus íconos— al chunk de
// entrada. Se importa por ruta directa: `@/push/BlocoDePush`.
