// src/screens/Revisao/SecaoSemCliente.tsx
// Los registros del bot de Telegram que no matchearon cliente.
//
// Sección aparte y NO mezclada con las propuestas: acá el vendedor no decide
// «sí o no», decide «de quién es». Confundir las dos preguntas es lo que hace
// que un audio dictado en la planta termine descartado por error.
//
// Nada se pierde: mientras no se vincule, el texto sigue guardado en
// ventus_actions y se muestra entero.

import { Link2, MessageSquareDashed } from 'lucide-react'
import {
  CONFIANCA_LABELS,
  FONTE_LABELS,
  textoDeExpiracao,
  type RegistroSolto,
} from '@/data'
import { Button, Card, Chip, EmptyState } from '@/ui'

export interface SecaoSemClienteProps {
  registros: readonly RegistroSolto[]
  ocupadoId: string | null
  onVincular: (registro: RegistroSolto) => void
  onDescartar: (registro: RegistroSolto) => void
}

/** De dónde llegó el registro. Se muestra: cambia cuánto se confía en él. */
const SUPERFICIE_LABELS: Readonly<Record<string, string>> = {
  telegram: 'Bot do Telegram',
  tma: 'Mini App',
  app: 'App',
  cron: 'Automático',
}

export function SecaoSemCliente({
  registros,
  ocupadoId,
  onVincular,
  onDescartar,
}: SecaoSemClienteProps) {
  if (registros.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareDashed size={28} aria-hidden />}
        title="Nada solto por aqui"
        description="Tudo que o bot capturou já está atribuído a um cliente."
        variant="sucesso"
      />
    )
  }

  return (
    <ul className="space-y-3">
      {registros.map((r) => (
        <li key={r.id}>
          <Card padding="md" accent="info">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip size="sm" tone="info">
                {r.superficie === null
                  ? 'Sem cliente'
                  : (SUPERFICIE_LABELS[r.superficie] ?? r.superficie)}
              </Chip>
              <Chip size="sm" tone="neutro">
                {FONTE_LABELS[r.fonte]}
              </Chip>
              <Chip size="sm" tone="neutro">
                {CONFIANCA_LABELS[r.confianca]}
              </Chip>
              <span className="ml-auto text-xs text-fg-muted">
                {textoDeExpiracao(r.expira_em)}
              </span>
            </div>

            <p className="mt-2.5 whitespace-pre-wrap text-sm leading-snug text-fg">{r.texto}</p>

            {r.quote !== null && r.quote !== r.texto && (
              <blockquote className="mt-2 border-l-2 border-info/40 pl-2.5 text-sm italic text-fg-muted">
                {`“${r.quote}”`}
              </blockquote>
            )}

            {r.sugestoes.length > 0 && (
              <div className="mt-2.5">
                <div className="text-xs uppercase tracking-wide text-fg-muted">
                  O Ventus achou parecido com
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.sugestoes.map((s) => (
                    <Chip key={s} size="sm" tone="marca">
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button
                block
                loading={ocupadoId === r.id}
                icon={<Link2 size={18} aria-hidden />}
                onClick={() => {
                  onVincular(r)
                }}
              >
                Vincular a…
              </Button>
              <Button
                variant="secondary"
                disabled={ocupadoId === r.id}
                onClick={() => {
                  onDescartar(r)
                }}
              >
                Descartar
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
