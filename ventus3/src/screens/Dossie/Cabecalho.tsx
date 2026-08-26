// src/screens/Dossie/Cabecalho.tsx
// Header pegajoso del dossiê: quién es, cuánto vale, en qué etapa está y las
// tres únicas cosas que el vendedor hace parado en el estacionamiento —
// ligar, mandar WhatsApp y registrar por voz.
//
// Los DOS números de saúde van acá arriba y no en un panel: el declarado en
// gris y el verificado grande. Es la tesis entera de M6 — si el verificado
// está en 0,8 con el declarado en 4,2, el negocio es una opinión.

import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mic, MessageCircle, Phone } from 'lucide-react'
import {
  channelDeepLink,
  getStageName,
  type Lead,
  type Opportunity,
  type HealthVerificado,
} from '@/core'
import { Badge, Button, IconButton, cx, formatBrl, haptic, toast, viewTransitionName } from '@/ui'

export interface CabecalhoProps {
  opportunity: Opportunity
  lead: Lead | null
  health: HealthVerificado
  /** Días desde el último contacto real (actividades, no last_update). */
  diasSemContato: number
}

/** Tono del health verificado: es el número honesto, se pinta sin piedad. */
function tomDaSaude(valor: number): 'ok' | 'atencao' | 'perigo' {
  if (valor >= 6) return 'ok'
  if (valor >= 3) return 'atencao'
  return 'perigo'
}

function abrir(url: string): void {
  // _blank + noopener: en la PWA standalone, un tel:/wa.me en la misma pestaña
  // deja la app en blanco al volver de la llamada.
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function Cabecalho({ opportunity, lead, health, diasSemContato }: CabecalhoProps) {
  const navigate = useNavigate()

  const linkTelefone = lead ? channelDeepLink('phone', lead) : null
  const linkWhats = lead ? channelDeepLink('whatsapp', lead) : null
  const nome = opportunity.name ?? opportunity.client ?? 'Sem nome'
  const etapa = getStageName(opportunity.stage)
  const tom = tomDaSaude(health.verificado)

  const semCanal = (canal: string) => {
    haptic('warning')
    toast({
      message: lead
        ? `Sem ${canal} cadastrado para ${lead.contact_name ?? nome}.`
        : 'Esta oportunidade não veio de um lead: não há contato com telefone.',
      tone: 'atencao',
    })
  }

  return (
    <div
      className="sticky z-20 border-b border-border bg-bg/95 px-4 pb-3 pt-2 backdrop-blur"
      style={{ top: 'calc(var(--spacing-header) + var(--safe-top))' }}
    >
      <div className="flex items-start gap-2">
        <IconButton
          aria-label="Voltar para a carteira"
          variant="ghost"
          onClick={() => void navigate(-1)}
        >
          <ArrowLeft size={20} aria-hidden />
        </IconButton>

        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-xl font-bold tracking-tight"
            style={{ viewTransitionName: viewTransitionName('opp', opportunity.id) }}
          >
            {nome}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            {etapa && <Badge tone="info">{etapa}</Badge>}
            <span className="tnum font-semibold text-fg">{formatBrl(opportunity.value)}</span>
            <span aria-hidden>·</span>
            <span className={cx(diasSemContato > 14 ? 'text-danger' : '')}>
              {diasSemContato >= 999
                ? 'Nunca contatado'
                : `${String(diasSemContato)} d sem contato`}
            </span>
          </div>
        </div>

        {/* Los dos números. El verificado manda; el declarado va chico. */}
        <div className="shrink-0 text-right">
          <div
            className={cx(
              'tnum text-2xl font-bold leading-none',
              tom === 'ok' ? 'text-ok' : tom === 'atencao' ? 'text-warn' : 'text-danger',
            )}
          >
            {health.verificado.toFixed(1).replace('.', ',')}
          </div>
          <div className="mt-1 text-2xs leading-tight text-fg-subtle">
            verificada
            <br />
            <span className="tnum">
              {health.declarado.toFixed(1).replace('.', ',')} declarada
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          block
          size="sm"
          variant="secondary"
          icon={<Phone size={17} aria-hidden />}
          onClick={() => (linkTelefone ? abrir(linkTelefone) : semCanal('telefone'))}
        >
          Ligar
        </Button>
        <Button
          block
          size="sm"
          variant="secondary"
          icon={<MessageCircle size={17} aria-hidden />}
          onClick={() => (linkWhats ? abrir(linkWhats) : semCanal('WhatsApp'))}
        >
          WhatsApp
        </Button>
        {/* El nombre accesible NO puede ser «Registrar por voz» a secas: ese es
            el del FAB del Shell, que está en la misma pantalla y manda a la
            captura sin cliente. Dos botones con el mismo nombre le suenan
            idénticos a un lector de pantalla. Éste dice a QUIÉN registra; el
            del Shell queda como la captura genérica. El rótulo visible («Voz»)
            sigue contenido en el nombre, como pide el criterio 2.5.3. */}
        <Button
          block
          size="sm"
          aria-label={`Registrar conversa por voz em ${nome}`}
          icon={<Mic size={17} aria-hidden />}
          onClick={() => void navigate(`/registrar?oportunidade=${String(opportunity.id)}`)}
        >
          Voz
        </Button>
      </div>
    </div>
  )
}
