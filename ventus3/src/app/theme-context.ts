// src/app/theme-context.ts
// El contexto vive aparte del provider: si el archivo del provider exporta
// algo que no es un componente, se rompe el fast refresh.

import { createContext } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeContextValue {
  /** Lo que eligió el usuario. */
  preference: ThemePreference
  /** Lo que se está pintando ahora mismo. */
  resolved: 'light' | 'dark'
  setPreference: (value: ThemePreference) => void
}

export const THEME_STORAGE_KEY = 'ventus.theme'

export const ThemeContext = createContext<ThemeContextValue | null>(null)
