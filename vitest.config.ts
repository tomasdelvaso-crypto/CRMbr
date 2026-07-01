import { defineConfig } from 'vitest/config'

// Configuración de Vitest.
// Los tests actuales son de lógica pura (sin DOM), por eso el entorno es 'node'.
// La cobertura se limita a los módulos de lógica de negocio ya extraídos, para
// no penalizar la adopción con la UI legada aún sin testear.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'api/**/*.{test,spec}.{ts,js}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'api/lib/**'],
    },
  },
})
