// src/app/RouteError.tsx
// Error Boundary por ruta: sin esto, cualquier excepción deja pantalla blanca
// y el vendedor lee "o app travou".

import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'

export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const titulo = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : 'Algo deu errado'

  const detalhe =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? 'Esta tela não existe ou você não tem acesso.'
        : 'Erro inesperado.'

  return (
    <section
      role="alert"
      className="mx-auto flex min-h-screen-svh max-w-lg flex-col items-start justify-center gap-4 px-6"
    >
      <h2 className="text-xl font-bold">{titulo}</h2>
      <p className="text-sm text-fg-muted">{detalhe}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void navigate(-1)}
          className="min-h-touch rounded-full border border-border px-5 text-sm font-medium"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-touch rounded-full bg-brand px-5 text-sm font-medium text-brand-fg"
        >
          Recarregar
        </button>
      </div>
    </section>
  )
}
