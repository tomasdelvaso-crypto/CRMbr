// src/screens/Instalar/index.tsx
// Página pública: não exige sessão (o link chega pelo bot do Telegram).
import { ScreenPlaceholder } from '../ScreenPlaceholder'

export default function InstalarScreen() {
  return (
    <main className="min-h-screen-svh bg-bg px-safe pt-safe text-fg">
      <div className="mx-auto max-w-lg">
        <ScreenPlaceholder
          nome="Instalação"
          descricao="Instalar o app, vincular o Telegram e carregar a primeira fila."
        />
      </div>
    </main>
  )
}
