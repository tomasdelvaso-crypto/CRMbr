// src/install/index.ts
// La capa «esto es una app instalada»: manifest vivo, invitación de
// instalación por plataforma, actualización sin recargas sorpresa y el
// share_target de Android.
//
// El único componente que hay que montar es `CamadaPWA` (lo hace App.tsx).
// El resto se usa suelto: `consumirCompartilhamento()` desde Registrar,
// `estaInstalado()` desde Ajustes o desde el flujo de push.

export { CamadaPWA } from './CamadaPWA'
export { ConviteDeInstalacao } from './ConviteDeInstalacao'
export { useConvite } from './useConvite'
export type { EstadoDoConvite, TipoDeConvite } from './useConvite'

export {
  detectarNavegador,
  detectarPlataforma,
  ehSafariDeIOS,
  estaInstalado,
  modoDeExibicao,
  observarModo,
} from './deteccao'
export type { ModoDeExibicao, Navegador, Plataforma } from './deteccao'

export {
  dispararPromptNativo,
  foiInstaladoNestaSessao,
  observarPrompt,
  temPromptNativo,
} from './prompt-android'

export {
  agendarChecagens,
  aplicarAtualizacao,
  observarAtualizacao,
  temAtualizacaoEsperando,
  EVENTO_ATUALIZACAO,
} from './atualizacao'

export {
  consumirCompartilhamento,
  descartarCompartilhamento,
  idCompartilhadoDaUrl,
  lerCompartilhamento,
} from './compartilhado'
export type { Compartilhamento } from './compartilhado'

export {
  deveOferecer,
  esperaAteOferecer,
  registrarDispensa,
  registrarSessao,
  rotaAceitaConvite,
  normalizarMemoria,
  MEMORIA_VAZIA,
} from './momento'
export type { ContextoDoConvite, MemoriaDeConvite } from './momento'
