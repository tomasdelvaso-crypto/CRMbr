// src/screens/Registrar/ContatosDetectados.tsx
// Contactos por papel detectados en la nota.
//
// LA REGLA: solo rellenan huecos vacíos. Nunca pisan un valor existente.
//
// No es cortesía. La extracción acierta el nombre con facilidad y se equivoca
// de PAPEL todo el tiempo: «falei com o Marcelo» no dice si Marcelo es el
// power sponsor, el sponsor o el que atiende el teléfono. Sobrescribir un
// contacto que el vendedor cargó a mano con lo que dedujo un modelo es
// exactamente cómo un CRM pierde la confianza del equipo — y recuperarla
// cuesta meses, no un deploy.
//
// La regla se impone DOS veces: acá visualmente (el papel ocupado nace
// descartado y se muestra tachado) y de nuevo en `atualizarContatos()`, que
// vuelve a leer la fila antes de escribir. La UI puede estar desactualizada;
// la mutación no.

import { Check, UserPlus, X } from 'lucide-react'
import { PAPEL_CONTATO_LABELS } from '@/data'
import { Badge, Button, Card, cx, haptic } from '@/ui'
import type { EstadoProposta, PropostaContato } from './rascunho'

export interface ContatosDetectadosProps {
  contatos: readonly PropostaContato[]
  /** Valor que la oportunidad ya tiene en ese papel, si hay alguno. */
  valorAtual: (papel: PropostaContato['papel']) => string | null
  onEstado: (papel: PropostaContato['papel'], estado: EstadoProposta) => void
  /** false cuando el alvo es un lead: los papeles viven en la oportunidad. */
  aplicavel: boolean
}

export function ContatosDetectados({
  contatos,
  valorAtual,
  onEstado,
  aplicavel,
}: ContatosDetectadosProps) {
  if (contatos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-fg-subtle">
        <UserPlus size={14} aria-hidden />
        Contatos detectados
      </h3>

      {!aplicavel && (
        <p className="text-xs text-fg-muted">
          Os papéis são da oportunidade. Neste lead eles entram na conversão.
        </p>
      )}

      {contatos.map((c) => {
        const atual = valorAtual(c.papel)
        const ocupado = atual !== null && atual.trim() !== ''
        const aceita = c.estado === 'aceita'
        return (
          <Card key={c.papel} padding="sm" className={cx(ocupado && 'opacity-70')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {PAPEL_CONTATO_LABELS[c.papel]}
                </p>
                <p className="mt-0.5 truncate font-semibold">
                  {c.nome}
                  {c.cargo && <span className="font-normal text-fg-muted"> · {c.cargo}</span>}
                </p>
                {ocupado && (
                  <p className="mt-1 text-xs text-warn-soft-fg">
                    Já preenchido com «{atual}». Não vou sobrescrever.
                  </p>
                )}
              </div>
              {aceita && !ocupado && (
                <Badge tone="ok" variant="soft">
                  vai entrar
                </Badge>
              )}
            </div>

            {!ocupado && aplicavel && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={aceita ? 'success' : 'secondary'}
                  icon={<Check size={16} aria-hidden />}
                  hapticPattern="success"
                  onClick={() => {
                    onEstado(c.papel, aceita ? 'pendente' : 'aceita')
                  }}
                >
                  {aceita ? 'Aceito' : 'Preencher'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={16} aria-hidden />}
                  onClick={() => {
                    haptic('tap')
                    onEstado(c.papel, 'dispensada')
                  }}
                >
                  Descartar
                </Button>
              </div>
            )}
          </Card>
        )
      })}
    </section>
  )
}
