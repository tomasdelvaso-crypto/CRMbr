// src/screens/GoldenHour/CartaoContato.tsx
// Un contacto a pantalla completa. Todo lo que hace falta para el toque y
// NADA más: sin campos editables, sin links a otras pantallas, sin métricas.
//
// La regla del power hour es «nada de gestión de CRM durante la hora». Cada
// cosa que se pueda tocar acá y no sea marcar, escribir o registrar, es un
// toque que no entra.

import { Check, Copy, Link2, Mail, MessageCircle, Phone } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import {
  CHANNEL_LABELS,
  LEAD_STAGE_LABELS,
  TOUCHPOINT_RESULT_LABELS,
  atrasoEmDias,
  formatRelativeBr,
  type CadenceStep,
  type Channel,
  type IsoDate,
  type Lead,
  type Touchpoint,
} from '@/core'
import { Badge, Chip, cx, haptic, toast } from '@/ui'
import { linksDoContato, telefoneVisivel } from './telefone'

const ICONES: Readonly<Record<Channel, ReactNode>> = {
  whatsapp: <MessageCircle size={20} aria-hidden />,
  phone: <Phone size={20} aria-hidden />,
  email: <Mail size={20} aria-hidden />,
  linkedin: <Link2 size={20} aria-hidden />,
}

export interface CartaoContatoProps {
  lead: Lead
  /** El paso de la cadencia que toca (TP y canal previstos). */
  passo: CadenceStep
  /** El canal realmente ejecutable, que puede no ser el previsto. */
  canal: Channel | null
  /** Rascunho ya redactado para ESE canal y ESE número de toque. */
  rascunho: string
  ultimoToque: Touchpoint | null
  hoje: IsoDate
  /** El contacto actual del carrusel: solo ese pinta a color completo. */
  ativo: boolean
}

export function CartaoContato({
  lead,
  passo,
  canal,
  rascunho,
  ultimoToque,
  hoje,
  ativo,
}: CartaoContatoProps) {
  const [copiado, setCopiado] = useState(false)
  const atraso = atrasoEmDias(lead, hoje)
  const links = linksDoContato(lead, rascunho)
  const telefone = telefoneVisivel(lead)

  const copiar = useCallback(() => {
    const escrever =
      typeof navigator !== 'undefined' && navigator.clipboard
        ? navigator.clipboard.writeText(rascunho)
        : Promise.reject(new Error('sem clipboard'))

    void escrever
      .then(() => {
        haptic('success')
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1600)
      })
      .catch(() => {
        toast({ message: 'Não deu para copiar. Selecione o texto e copie na mão.', tone: 'atencao' })
      })
  }, [rascunho])

  return (
    <article
      className={cx(
        'flex h-full min-h-0 w-full shrink-0 snap-center flex-col px-4',
        // El card que no está en foco se apaga: el ojo sabe dónde está sin
        // tener que leer. Solo opacity, que no fuerza layout.
        'transition-opacity duration-200 motion-reduce:transition-none',
        ativo ? 'opacity-100' : 'opacity-40',
      )}
      aria-current={ativo ? 'true' : undefined}
    >
      {/* ── Rolagem interna do card ─────────────────────────────────────────
          Em telas baixas e estreitas (360x640, 355x700 — o Android real do
          dono do produto) o HUD + Aqui agora + os 4 botões de resultado já
          ocupam boa parte da altura, e o que sobra para nome + rascunho +
          links não entra inteiro. Antes esse sobrante ficava cortado sem
          rolagem: o Carrossel tem overflow-y-hidden e cada bloco daqui era
          de altura fixa, então o que não coubesse simplesmente não existia
          na tela.
          A correção é ESTE único contêiner rolar (não um por bloco — dois
          scrolls aninhados é exatamente o tipo de coisa que mata o gesto de
          toque real, ver e2e/golden-estreito.spec.ts). `touch-pan-y-only`
          deixa o dedo rolar o card em vertical sem que o pan-x do carrossel
          por cima capture o gesto; `scroll-momentum` já traz
          overscroll-behavior: contain, então o rubber-band não escapa para o
          gesto de voltar do sistema.
          Os 4 botões — Ligou · Falou · Agendou · Passar — ficam DE FORA
          deste contêiner, como irmãos `shrink-0` no layout do modo foco
          (ver index.tsx): nunca ficam escondidos atrás de uma rolagem. */}
      <div className="scroll-momentum touch-pan-y-only flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3">
        {/* ── Cabecera: qué toque es y por qué está en la fila ─────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone="marca" variant="solid">
            Toque {passo.tp} de 7
          </Badge>
          <Badge tone="info">{canal ? CHANNEL_LABELS[canal] : 'Sem canal'}</Badge>
          {atraso > 0 && (
            <Badge tone={atraso >= 7 ? 'perigo' : 'atencao'}>
              {atraso === 1 ? '1 dia de atraso' : `${atraso} dias de atraso`}
            </Badge>
          )}
        </div>

        {/* ── Quién es ─────────────────────────────────────────────────────── */}
        <header className="min-w-0 shrink-0">
          <h2 className="truncate text-2xl font-bold leading-tight tracking-tight">
            {lead.company_name}
          </h2>
          <p className="mt-1 truncate text-base font-medium text-fg">
            {lead.contact_name ?? 'Contato ainda sem nome'}
          </p>
          <p className="truncate text-sm text-fg-muted">
            {lead.contact_title ?? 'Cargo não identificado'}
            {telefone !== null && <span className="tnum"> · {telefone}</span>}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">{LEAD_STAGE_LABELS[lead.stage]}</p>
        </header>

        {/* ── El último toque y qué salió ──────────────────────────────────── */}
        <div className="shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2">
          {ultimoToque ? (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">
                {CHANNEL_LABELS[ultimoToque.channel]} · TP{ultimoToque.sequence_number}
              </span>{' '}
              {formatRelativeBr(ultimoToque.executed_at)} —{' '}
              {TOUCHPOINT_RESULT_LABELS[ultimoToque.result]}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">Primeiro contato.</span> Ninguém falou com
              essa empresa ainda.
            </p>
          )}
        </div>

        {/* ── El rascunho, listo para ese canal y ese toque ─────────────────
            Ya no fuerza flex-1 con scroll propio: con el card entero
            deslizable, un segundo scroll adentro del rascunho sería un
            contenedor anidado innecesario. La caja crece con su contenido y
            listo. */}
        <div className="flex shrink-0 flex-col rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-fg-subtle">
              {passo.label}
            </span>
            <button
              type="button"
              onClick={copiar}
              className="flex min-h-touch items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand tap-highlight-none active:bg-brand-soft"
            >
              {copiado ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="select-text px-3 py-3 text-[15px] leading-relaxed text-fg">{rascunho}</p>
        </div>

        {/* ── Deep links accionables ───────────────────────────────────────── */}
        {links.length > 0 ? (
          <nav aria-label="Abrir o contato" className="grid shrink-0 grid-cols-4 gap-2">
            {links.map((l) => (
              <a
                key={l.canal}
                href={l.href}
                {...(l.externo ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                onClick={() => haptic('tap')}
                className={cx(
                  'flex min-h-touch-lg flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold tap-highlight-none',
                  'transition-transform active:scale-95 motion-reduce:transition-none',
                  l.canal === canal
                    ? 'border-brand bg-brand-soft text-brand-soft-fg'
                    : 'border-border bg-surface-2 text-fg-muted',
                )}
              >
                {ICONES[l.canal]}
                {l.rotulo}
              </a>
            ))}
          </nav>
        ) : (
          <Chip tone="atencao">Sem telefone, e-mail nem LinkedIn — passe e peça enriquecimento</Chip>
        )}
      </div>
    </article>
  )
}
