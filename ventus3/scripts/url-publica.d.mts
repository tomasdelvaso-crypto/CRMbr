// Tipos de scripts/url-publica.mjs. Existe porque vite.config.ts lo importa y
// el proyecto compila con `allowJs: false` — un .mjs sin declaración sería un
// error de tipos en el build. Sólo se declara lo que vite.config.ts usa.

/** La URL pública que vale ahora: VENTUS_URL pisa config/url-publica.txt. */
export function lerUrlPublica(opts?: { env?: NodeJS.ProcessEnv }): string;

/** Ruta absoluta de config/url-publica.txt, para declararlo como dependencia. */
export const ARQUIVO_URL: string;
