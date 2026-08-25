// src/screens/Ventus/PainelCoaching.tsx
// Coaching contextual DENTRO de la ficha: diagnóstico + UNA jugada concreta
// con el texto listo para copiar.
//
// Se monta desde el Dossiê (`<PainelCoaching opportunityId={id} />`). Vive en
// mi carpeta porque el diagnóstico y la redacción son del Ventus, no de la
// ficha: la ficha solo le da el lugar.
//
// El diagnóstico NUNCA es del modelo. Sale de @/core —gate faltante, escala
// más débil, riesgos, días de silencio— porque tiene que ser el mismo número
// que muestra el hexágono dos centímetros más arriba. Lo que sí es del modelo
// es la REDACCIÓN de la jugada, y por eso llega en streaming y con preview.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Sparkles, Stethoscope } from 'lucide-react'
import type { Opportunity } from '@/core'
import { Button, Card, Chip, toast } from '@/ui'
import { diagnosticar } from './diagnostico'

export interface PainelCoachingProps {
  opportunity: Opportunity
  /** Días sin contacto, ya calculados por el Dossiê con las actividades reales. */
  diasSemContato: number
  className?: string
}

export function PainelCoaching({
  opportunity,
  diasSemContato,
  className,
}: PainelCoachingProps) {
  const navigate = useNavigate()
  const [copiado, setCopiado] = useState(false)

  const d = useMemo(
    () => diagnosticar(opportunity, diasSemContato),
    [opportunity, diasSemContato],
  )

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(d.rascunho)
      setCopiado(true)
      toast({ message: 'Texto copiado. É só colar no WhatsApp.', tone: 'ok' })
    } catch {
      toast({
        message: 'Seu navegador não deixou copiar. Selecione o texto e copie à mão.',
        tone: 'atencao',
      })
    }
  }

  return (
    <Card padding="md" accent="marca" className={className}>
      <div className="flex items-start gap-2">
        <Stethoscope size={18} aria-hidden className="mt-0.5 shrink-0 text-brand" />
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            Diagnóstico do Ventus
          </div>
          <p className="mt-0.5 text-base font-semibold leading-snug">{d.titulo}</p>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {d.evidencias.map((e) => (
          <li key={e} className="text-sm leading-snug text-fg-muted">
            {`· ${e}`}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg bg-brand-soft p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-soft-fg">
          A jogada
        </div>
        <p className="mt-1 text-sm leading-snug text-brand-soft-fg">{d.jogada}</p>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-fg-muted">Texto pronto</span>
          {copiado && (
            <Chip size="sm" tone="ok">
              copiado
            </Chip>
          )}
        </div>
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 font-sans text-sm leading-snug text-fg">
          {d.rascunho}
        </pre>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button block icon={<Copy size={18} aria-hidden />} onClick={() => void copiar()}>
          Copiar
        </Button>
        <Button
          variant="secondary"
          icon={<Sparkles size={18} aria-hidden />}
          onClick={() => void navigate(`/ventus?opp=${String(opportunity.id)}`)}
        >
          Refinar
        </Button>
      </div>
    </Card>
  )
}
