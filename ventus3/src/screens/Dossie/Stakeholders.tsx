// src/screens/Dossie/Stakeholders.tsx
// Mapa de poder del negocio: los cuatro papeles que el PPVVCC exige conocer.
//
// Los que faltan se pintan igual, en gris y con la pregunta que hay que hacer
// para llenarlos. Un hueco visible es información; una lista corta de nombres
// no dice nada. Y si hay un solo nombre, el aviso de single-threading es
// explícito: si esa persona cambia de área, el negocio se va con ella.

import { UserPlus, Users } from 'lucide-react'
import { isSingleThreaded, stakeholders, type Lead, type Opportunity } from '@/core'
import { Avatar, Card, Chip, cx, formatBrl } from '@/ui'

interface Papel {
  chave: 'power_sponsor' | 'sponsor' | 'influencer' | 'support_contact'
  rotulo: string
  /** Qué es esta persona, en una línea. */
  papel: string
  /** Qué preguntar para descubrirla. */
  pergunta: string
}

const PAPEIS: readonly Papel[] = [
  {
    chave: 'power_sponsor',
    rotulo: 'Power Sponsor',
    papel: 'Quem assina e libera o orçamento',
    pergunta: '«Quem assina uma compra desse porte aqui?»',
  },
  {
    chave: 'sponsor',
    rotulo: 'Sponsor',
    papel: 'Quem defende o projeto por dentro',
    pergunta: '«Quem seria o padrinho disto aqui dentro?»',
  },
  {
    chave: 'influencer',
    rotulo: 'Influenciador',
    papel: 'Quem opina e pode travar',
    pergunta: '«Quem mais é impactado no dia a dia?»',
  },
  {
    chave: 'support_contact',
    rotulo: 'Contato de apoio',
    papel: 'Quem abre portas na operação',
    pergunta: '«Quem acompanha o teste na planta?»',
  },
]

export interface StakeholdersProps {
  opportunity: Opportunity
  lead: Lead | null
}

export function Stakeholders({ opportunity, lead }: StakeholdersProps) {
  const conhecidos = stakeholders(opportunity)
  const sozinho = isSingleThreaded(opportunity)
  const valor = opportunity.value ?? 0

  return (
    <div className="space-y-3">
      {sozinho && (
        <Card accent={valor >= 50_000 ? 'perigo' : 'atencao'} padding="sm">
          <div className="flex items-start gap-2">
            <Users size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
            <p className="text-sm leading-snug">
              {conhecidos.length === 0 ? (
                <>Nenhum contato mapeado neste negócio. Não há a quem ligar.</>
              ) : (
                <>
                  Só <strong>{conhecidos[0]}</strong> está mapeado
                  {valor > 0 && <> em {formatBrl(valor)}</>}. Se essa pessoa mudar de área, o
                  negócio some junto.
                </>
              )}
            </p>
          </div>
        </Card>
      )}

      <ul className="grid grid-cols-2 gap-2">
        {PAPEIS.map((p) => {
          const nome = (opportunity[p.chave] ?? '').trim()
          const temNome = nome !== ''
          return (
            <li
              key={p.chave}
              className={cx(
                'rounded-lg border p-3',
                temNome ? 'border-border bg-surface' : 'border-dashed border-border-strong bg-surface-2/40',
              )}
            >
              <div className="flex items-center gap-2">
                {temNome ? (
                  <Avatar name={nome} size="sm" />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-3 text-fg-subtle"
                  >
                    <UserPlus size={15} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-2xs uppercase tracking-wide text-fg-subtle">
                    {p.rotulo}
                  </span>
                  <span
                    className={cx(
                      'block truncate text-sm font-semibold',
                      temNome ? 'text-fg' : 'text-fg-subtle',
                    )}
                  >
                    {temNome ? nome : 'Não mapeado'}
                  </span>
                </span>
              </div>
              <p className="mt-2 text-2xs leading-snug text-fg-muted">
                {temNome ? p.papel : p.pergunta}
              </p>
            </li>
          )
        })}
      </ul>

      {lead?.contact_name && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span>Contato do lead de origem:</span>
          <Chip size="sm" tone="info">
            {lead.contact_name}
            {lead.contact_title ? ` · ${lead.contact_title}` : ''}
          </Chip>
        </div>
      )}
    </div>
  )
}
