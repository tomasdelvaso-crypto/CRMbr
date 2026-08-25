// src/screens/Ventus/PreviewAcao.tsx
// «Mostra SEMPRE o que vai fazer antes de fazer.»
//
// Esto no es una cortesía de UX: es el mismo propose-then-commit de M8. El
// servidor deja la fila en ventus_actions con status='proposed' y acá el
// humano confirma. Si el vendedor no confirma, no pasa nada — y la propuesta
// sigue esperándolo en la Revisão hasta que expire a las 48 h.

import { ArrowRight, Check, ShieldQuestion, X } from 'lucide-react'
import { CONFIANCA_LABELS, textoDeExpiracao } from '@/data'
import { Button, Card, Chip, cx, type Tone } from '@/ui'
import { TOOL_LABELS, type VentusPreview } from './contrato'

const TOM_CONFIANCA: Readonly<Record<VentusPreview['confianca'], Tone>> = {
  alta: 'ok',
  media: 'info',
  baixa: 'atencao',
}

export interface PreviewAcaoProps {
  preview: VentusPreview
  /** null = todavía sin decidir. */
  decidido: 'aceito' | 'recusado' | null
  ocupado: boolean
  onConfirmar: () => void
  onRecusar: () => void
}

export function PreviewAcao({
  preview,
  decidido,
  ocupado,
  onConfirmar,
  onRecusar,
}: PreviewAcaoProps) {
  return (
    <Card
      padding="sm"
      accent={decidido === 'aceito' ? 'ok' : decidido === 'recusado' ? 'neutro' : 'marca'}
      className="mt-2"
    >
      <div className="flex items-start gap-2">
        <ShieldQuestion size={16} aria-hidden className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            {TOOL_LABELS[preview.tool]}
          </div>
          <div className="mt-0.5 text-sm font-medium leading-snug">{preview.resumo}</div>
        </div>
      </div>

      {preview.mudancas.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {preview.mudancas.map((m) => (
            <li key={m.campo} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-fg-muted">{m.rotulo}</span>
              <span className="text-fg-muted line-through decoration-fg-subtle/60">
                {m.de ?? '—'}
              </span>
              <ArrowRight size={12} aria-hidden className="text-fg-subtle" />
              <span className="font-semibold">{m.para}</span>
            </li>
          ))}
        </ul>
      )}

      {preview.citacao != null && preview.citacao !== '' && (
        <blockquote className="mt-2 border-l-2 border-brand/40 pl-2.5 text-sm italic text-fg-muted">
          {`“${preview.citacao}”`}
        </blockquote>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip size="sm" tone={TOM_CONFIANCA[preview.confianca]}>
          {CONFIANCA_LABELS[preview.confianca]}
        </Chip>
        {preview.expiraEm != null && (
          <Chip size="sm" tone="neutro">
            {textoDeExpiracao(preview.expiraEm)}
          </Chip>
        )}
      </div>

      {decidido === null && preview.precisaConfirmar && (
        <div className={cx('mt-3 flex items-center gap-2')}>
          <Button
            block
            size="sm"
            variant="success"
            loading={ocupado}
            icon={<Check size={16} aria-hidden />}
            onClick={onConfirmar}
          >
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={ocupado}
            aria-label="Não fazer isso"
            onClick={onRecusar}
          >
            <X size={16} aria-hidden />
          </Button>
        </div>
      )}

      {decidido === 'aceito' && (
        <p className="mt-2 text-sm font-medium text-ok-soft-fg">Feito. Já está no CRM.</p>
      )}
      {decidido === 'recusado' && (
        <p className="mt-2 text-sm text-fg-muted">
          Não fiz. A proposta segue na Revisão até expirar.
        </p>
      )}
      {decidido === null && !preview.precisaConfirmar && (
        <p className="mt-2 text-sm text-fg-muted">Só leitura: nada foi alterado.</p>
      )}
    </Card>
  )
}
