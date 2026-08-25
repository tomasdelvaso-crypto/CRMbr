// src/screens/Ventus/sugestoes.ts
// Los atajos que arrancan la conversación.
//
// Los cuatro son de respuesta LOCAL a propósito: la primera experiencia del
// vendedor con el Ventus tiene que ser instantánea y offline, no una espera de
// ocho segundos. Si lo primero que prueba tarda, no vuelve.
//
// Vive en su propio módulo porque Conversa.tsx solo puede exportar componentes
// (react-refresh/only-export-components).

export const SUGESTOES: readonly string[] = [
  'O que eu faço hoje?',
  'Quem está sem contato há 15 dias?',
  'Como está meu pipeline?',
  'Que compromissos eu assumi?',
]
