// src/push/mensagens.ts
// Los nombres de los mensajes que cruzan entre el service worker y la app.
//
// Viven en un módulo propio, sin imports, porque los leen los DOS lados: el SW
// (`src/sw-push.ts`, que compila con lib WebWorker) y la app
// (`src/push/recepcao.ts`, que compila con lib DOM). Un string repetido en dos
// archivos es un bug esperando: el día que uno cambie, el mensaje deja de
// llegar y no hay error en ningún lado — solo notificaciones que no navegan.

/** El vendedor tocó una notificación y la app tiene que navegar y medir. */
export const MENSAGEM_AVISO_CLICADO = 'ventus:aviso-clicado'

/** El navegador rotó la suscripción de push por su cuenta. */
export const MENSAGEM_ASSINATURA_MUDOU = 'ventus:assinatura-de-push-mudou'
