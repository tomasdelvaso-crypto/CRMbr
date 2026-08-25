// src/screens/Revisao/SecaoMercado.tsx
// Empresas del mapa asignadas al vendedor y todavía sin lead, más los sinais
// de mercado que traiga cada fila.
//
// Por qué está en Revisão y no en Cadência: son 83 empresas «atribuídas» con
// crm_lead_id NULL en producción — la razón por la que Victor Hugo, Renata y
// Paulo tienen CERO leads. No es una lista para navegar: es una bandeja para
// vaciar, y un tap la vacía (M13, promote_sweep_to_lead).

import { MapPinned, Sparkles } from 'lucide-react'
import type { EmpresaSemLead } from '@/data'
import { Button, Card, Chip, EmptyState } from '@/ui'

export interface SecaoMercadoProps {
  empresas: readonly EmpresaSemLead[]
  /** El servidor devolvió cero: puede ser RLS, no «tudo em dia». */
  bloqueado: boolean
  ocupadoId: number | null
  onPromover: (empresa: EmpresaSemLead) => void
  onIgnorar: (empresa: EmpresaSemLead) => void
}

function localidade(e: EmpresaSemLead): string | null {
  if (e.cidade && e.uf) return `${e.cidade}/${e.uf}`
  return e.cidade ?? e.uf
}

export function SecaoMercado({
  empresas,
  bloqueado,
  ocupadoId,
  onPromover,
  onIgnorar,
}: SecaoMercadoProps) {
  if (empresas.length === 0) {
    // Cero filas del servidor puede ser RLS escondendo tudo. Celebrar um zero
    // que talvez seja um bloqueio é mentir para o vendedor.
    return bloqueado ? (
      <EmptyState
        icon={<MapPinned size={28} aria-hidden />}
        title="O mapa ainda não está liberado"
        description="O servidor não devolveu nenhuma empresa. Pode ser que o acesso ao mapa ainda não tenha sido aberto — fale com o time."
      />
    ) : (
      <EmptyState
        icon={<MapPinned size={28} aria-hidden />}
        title="Mapa em dia"
        description="Toda empresa atribuída a você já virou lead com cadência rodando."
        variant="sucesso"
      />
    )
  }

  return (
    <ul className="space-y-3">
      {empresas.map((e) => {
        const onde = localidade(e)
        return (
          <li key={e.sweepId}>
            <Card padding="md" accent="destaque">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold tracking-tight">
                    {e.empresa}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {onde !== null && (
                      <Chip size="sm" tone="neutro">
                        {onde}
                      </Chip>
                    )}
                    {e.setor !== null && (
                      <Chip size="sm" tone="neutro">
                        {e.setor}
                      </Chip>
                    )}
                    {e.funcionarios !== null && (
                      <Chip size="sm" tone="neutro">
                        {`${String(e.funcionarios)} func.`}
                      </Chip>
                    )}
                  </div>
                </div>
                {e.anel !== null && (
                  <Chip size="sm" tone={e.anel <= 1 ? 'destaque' : 'neutro'}>
                    {`Anel ${String(e.anel)}`}
                  </Chip>
                )}
              </div>

              {/* Sinal de mercado: la razón por la que esta empresa está en el
                  mapa. Sin ella, promover es una lotería. */}
              {e.sinal !== null && (
                <p className="mt-2 flex gap-2 rounded-lg bg-accent-soft p-2.5 text-sm leading-snug text-accent-soft-fg">
                  <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0" />
                  <span>{e.sinal}</span>
                </p>
              )}

              <div className="mt-3 flex items-center gap-2">
                <Button
                  block
                  loading={ocupadoId === e.sweepId}
                  onClick={() => {
                    onPromover(e)
                  }}
                >
                  Virar lead
                </Button>
                <Button
                  variant="secondary"
                  disabled={ocupadoId === e.sweepId}
                  onClick={() => {
                    onIgnorar(e)
                  }}
                >
                  Agora não
                </Button>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
