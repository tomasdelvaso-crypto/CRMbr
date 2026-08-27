// src/core/index.ts
// Dominio puro de Ventus. Isomórfico: corre en el navegador (offline, sin
// tokens), en las funciones serverless de api/ y en el bot de Telegram.
//
// Regla dura: nada de acá importa red, DOM ni Supabase. Todo son funciones
// puras sobre datos planos. Si algo necesita fetch, IndexedDB o `window`, vive
// en src/data/, no acá.
//
// Mapa de módulos:
//   types       tipos del esquema real de Supabase + los derivados del motor
//   ppvvcc      metodología: escalas, gates, health declarado vs verificado
//   cadence     7 toques en 21 días y la derivación de la etapa 1a→1d
//   methodology cookbook de hitos 1A-6C y catálogos de actividad
//   dates       todo en America/Sao_Paulo, días hábiles y feriados BR/SP
//   planner     rankDay: las 3 acciones del día con su porqué auditable
//   risk        las 6 reglas de riesgo de negocio
//   scoring     Pontos de Avanço, anillos, racha de Golden Hour, trofeos
//   spin        192 preguntas SPIN del negocio real de Ventapel
//
// Verificado: los 272 símbolos exportados no colisionan entre módulos, así que
// `export *` es seguro y `import { X } from '@/core'` siempre resuelve.

export * from './types.js'
export * from './ppvvcc.js'
export * from './cadence.js'
export * from './methodology.js'
export * from './dates.js'
export * from './planner.js'
export * from './risk.js'
export * from './scoring.js'
export * from './spin.js'
