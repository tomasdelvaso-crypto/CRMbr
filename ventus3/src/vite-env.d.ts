/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Variables de entorno expuestas al bundle. Solo las VITE_* llegan al cliente.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL?: string
  /** 'off' apaga o Realtime no build. Qualquer outro valor o mantém ligado. */
  readonly VITE_REALTIME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
