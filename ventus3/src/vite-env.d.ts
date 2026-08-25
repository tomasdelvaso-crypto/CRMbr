/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Variables de entorno expuestas al bundle. Solo las VITE_* llegan al cliente.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_BASE_URL?: string
  /** 'off' apaga o Realtime no build. Qualquer outro valor o mantém ligado. */
  readonly VITE_REALTIME?: string
  /**
   * De onde /instalar baixa o APK. Fica em variável porque o destino final
   * depende do trâmite da Play Store, que ainda não fechou.
   */
  readonly VITE_APK_URL?: string
  /**
   * Mocks de los dos endpoints que pueden no estar desplegados todavía.
   * 'on' fuerza el simulado, 'off' lo prohíbe (y un 501 se ve como error).
   * Se declaran acá para que las pantallas no tengan que castear
   * `import.meta.env` — el cast era la marca de que faltaba esta línea.
   */
  readonly VITE_INGEST_MOCK?: string
  readonly VITE_VENTUS_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
