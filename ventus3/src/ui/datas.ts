// src/ui/datas.ts
// Adaptador de fechas para la capa de UI.
//
// NO implementa aritmética de calendario: la delega ENTERA en src/core/dates.ts.
// Existe por dos razones que siguen valiendo:
//   1. fast refresh se rompe si un archivo exporta componentes y funciones
//      sueltas, así que DatePills no puede exportar helpers;
//   2. las pantallas quieren nombres cortos en PT-BR sin importar todo @/core.
//
// Historia: mientras src/core/dates.ts era un stub que lanzaba, este archivo
// tenía su propia implementación con Intl y aritmética en UTC. El dominio ya
// está completo y probado (28 tests), así que esa copia se retiró: había DOS
// definiciones del huso de São Paulo y DOS tipos IsoDate distintos.

import {
  addDays,
  formatShortBr,
  nomeCurtoDoDia,
  resolveShortcut,
  todayBr,
  type IsoDate,
} from '@/core'

/** Fecha civil YYYY-MM-DD. Reexportado del dominio: hay UN solo IsoDate. */
export type { IsoDate }

/** Hoy en BRT como YYYY-MM-DD. */
export function hojeBr(now: Date = new Date()): IsoDate {
  return todayBr(now)
}

/** Suma días calendario sobre una fecha civil brasileña. */
export function somarDias(iso: IsoDate, dias: number): IsoDate {
  return addDays(iso, dias)
}

/** Próxima segunda-feira, estrictamente futura: si hoy ES lunes, la siguiente. */
export function proximaSegunda(iso: IsoDate): IsoDate {
  // resolveShortcut('segunda') solo devuelve null para 'escolher'; el ?? iso
  // es defensa de tipos, no una rama alcanzable.
  return resolveShortcut('segunda', iso) ?? iso
}

/** Rótulo corto PT-BR para el chip de «Escolher»: 'seg, 03/03'. */
export function formatarCurtoBr(iso: IsoDate): string {
  return `${nomeCurtoDoDia(iso)}, ${formatShortBr(iso)}`
}
