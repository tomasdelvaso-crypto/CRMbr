// src/screens/Cadencia/LinhaCadencia.tsx
// Una fila de la fila de cadencia. 80px fijos, sin ninguna consulta propia.
//
// Lo que tiene que poder leerse sin abrir nada: de qué empresa se trata, con
// quién se habla, en qué toque de los 7 va la secuencia, por dónde sale el
// próximo y cuánto hace que venció. Todo lo demás es del sheet.

import { memo } from 'react'
import { Link2, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import {
  CHANNEL_LABELS,
  MAX_TOUCHPOINTS,
  formatarDataCurta,
  type Channel,
  type IsoDate,
} from '@/core'
import type { LinhaCadencia as DadosLinha } from '@/data'
import { ProgressDots, cx } from '@/ui'
import { dataAlvo, passoAtual, situacaoDoToque } from './fila'

/** Alto exacto de la fila. Lo comparte la VirtualList. */
export const ALTURA_LINHA = 80

const ICONE_DO_CANAL: Readonly<Record<Channel, LucideIcon>> = {
  linkedin: Link2,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
}

export interface LinhaCadenciaProps {
  linha: DadosLinha
  hoje: IsoDate
  onAbrir: (linha: DadosLinha) => void
}

export const LinhaCadencia = memo(function LinhaCadencia({
  linha,
  hoje,
  onAbrir,
}: LinhaCadenciaProps) {
  const lead = linha.lead
  const situacao = situacaoDoToque(lead, hoje)
  const passo = passoAtual(lead)
  const canal = passo?.channel ?? null
  const Icone = canal ? ICONE_DO_CANAL[canal] : null
  const alvo = dataAlvo(lead)

  const contato =
    lead.contact_name !== null && lead.contact_name.trim() !== ''
      ? lead.contact_title
        ? `${lead.contact_name} · ${lead.contact_title}`
        : lead.contact_name
      : 'Sem contato identificado'

  return (
    <button
      type="button"
      onClick={() => onAbrir(linha)}
      style={{ height: ALTURA_LINHA }}
      className="flex w-full items-center gap-3 border-b border-border px-4 text-left tap-highlight-none active:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-5">{lead.company_name}</span>
        <span className="block truncate text-xs leading-4 text-fg-muted">{contato}</span>
        <span className="mt-1 flex items-center gap-2">
          <ProgressDots
            total={MAX_TOUCHPOINTS}
            feitos={lead.touchpoints_count}
            size="sm"
            tone={situacao === 'atrasado' ? 'perigo' : 'marca'}
            destacarProximo={situacao !== 'esgotado'}
          />
          {Icone && canal && (
            <span className="flex items-center gap-1 text-2xs leading-4 text-fg-subtle">
              <Icone size={12} aria-hidden />
              {CHANNEL_LABELS[canal]}
            </span>
          )}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        {situacao === 'atrasado' ? (
          <>
            <span className="text-sm font-bold tnum leading-5 text-danger">
              {linha.atraso === 1 ? '1 dia' : `${String(linha.atraso)} dias`}
            </span>
            <span className="text-2xs leading-4 text-danger">de atraso</span>
          </>
        ) : situacao === 'hoje' ? (
          <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-brand-soft-fg">
            Hoje
          </span>
        ) : situacao === 'esgotado' ? (
          <span className="text-2xs leading-4 text-fg-subtle">7 de 7 · reciclar</span>
        ) : (
          <span className={cx('text-2xs leading-4 text-fg-subtle tnum')}>
            {alvo ? formatarDataCurta(alvo, hoje) : 'Sem data'}
          </span>
        )}
      </span>
    </button>
  )
})
