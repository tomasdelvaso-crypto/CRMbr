// src/screens/Cadencia/Kanban.tsx
// El kanban 1A–1D. SOLO en md+ (tablet y desktop).
//
// En un teléfono, cuatro columnas con overflow interno dentro de una página
// que también scrollea es scroll anidado: el dedo nunca sabe qué se va a
// mover, y en iOS el rubber-band de la columna se come el gesto de la página.
// Es literalmente la peor experiencia táctil posible y es lo que el v2 hace
// hoy con `max-h-60vh` en cada columna.
//
// En una pantalla ancha el problema desaparece: las cuatro columnas caben una
// al lado de la otra, la página no scrollea y cada columna es una región de
// scroll independiente y previsible. Ahí el kanban sí aporta —ver el funil
// entero de un vistazo.
//
// ══════════════════════════════════════════════════════════════════════════
// LA DENSIDAD DE ESCRITORIO (el defecto de la captura del dueño)
// ══════════════════════════════════════════════════════════════════════════
// Este kanban vivía dentro de una columna de 896 px flotando en el medio de
// un monitor de 1.920: cuatro columnas de ~200 px con las tarjetas cortadas
// («TECADI Operador Logíst…», «Rodalog Soluções em Lo…»). El ancho lo arregla
// el contenedor (ver src/app/largura.ts: /cadencia usa TODO el área de
// contenido), y lo que arregla este archivo es qué se hace con ese ancho:
//
//  · `grid-cols-4` reparte el área en partes iguales. A 1.920 px son ~400 px
//    por columna: no hace falta un `min-w` porque la grilla no puede
//    desbordar, y un `min-w` de 260 px sí desbordaría en una tablet de 768.
//  · El nombre de la empresa YA NO SE TRUNCA en lg+: envuelve hasta dos
//    líneas. Truncar el nombre del cliente en un monitor de 27" es el defecto
//    entero en una sola clase de CSS.
//  · Cada tarjeta gana lo que la fila del teléfono ya mostraba y la del
//    kanban escondía: el cargo del contacto, el canal del próximo toque y el
//    atraso escrito en palabras («126 dias de atraso», no «126d»).
//
// Lo que NO vuelve en ningún tamaño: el drag&drop. La etapa la mueve el
// resultado del toque, no el dedo.

import { Link2, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import {
  CHANNEL_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_ORDER,
  MAX_TOUCHPOINTS,
  formatarDataCurta,
  type Channel,
  type IsoDate,
  type LeadStage,
} from '@/core'
import type { LinhaCadencia } from '@/data'
import { ProgressDots, cx } from '@/ui'
import { dataAlvo, passoAtual, situacaoDoToque } from './fila'

export interface KanbanProps {
  linhas: readonly LinhaCadencia[]
  hoje: IsoDate
  onAbrir: (linha: LinhaCadencia) => void
}

/** Rótulo corto de la columna: el largo va en el title del encabezado. */
const CURTO: Readonly<Record<LeadStage, string>> = {
  '1a': '1A · Empresa',
  '1b': '1B · Contato',
  '1c': '1C · Interesse',
  '1d': '1D · Reunião',
}

const ICONE_DO_CANAL: Readonly<Record<Channel, LucideIcon>> = {
  linkedin: Link2,
  whatsapp: MessageCircle,
  email: Mail,
  phone: Phone,
}

export function Kanban({ linhas, hoje, onAbrir }: KanbanProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-4 gap-3 px-4 pb-4 lg:gap-4">
      {LEAD_STAGE_ORDER.map((etapa) => {
        const daEtapa = linhas.filter((l) => l.lead.stage === etapa)
        return (
          <section key={etapa} className="flex min-h-0 min-w-0 flex-col rounded-card bg-surface-2">
            <h3
              title={LEAD_STAGE_LABELS[etapa]}
              className="shrink-0 border-b border-border px-3 py-2 text-xs font-semibold lg:text-sm"
            >
              {CURTO[etapa]}{' '}
              <span className="tnum text-fg-muted">({String(daEtapa.length)})</span>
            </h3>

            <ul className="min-h-0 flex-1 list-none space-y-2 overflow-y-auto scroll-momentum p-2">
              {daEtapa.length === 0 && (
                <li className="px-1 py-3 text-2xs text-fg-subtle">Nenhum lead aqui.</li>
              )}
              {daEtapa.map((linha) => (
                <li key={linha.lead.id}>
                  <CartaoDeLead linha={linha} hoje={hoje} onAbrir={onAbrir} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/**
 * La tarjeta del kanban. Es la MISMA información que la fila del teléfono
 * (LinhaCadencia.tsx) reordenada en vertical: empresa, quién, en qué toque de
 * los 7 va, por dónde sale el próximo y cuánto hace que venció.
 */
function CartaoDeLead({
  linha,
  hoje,
  onAbrir,
}: {
  linha: LinhaCadencia
  hoje: IsoDate
  onAbrir: (linha: LinhaCadencia) => void
}) {
  const lead = linha.lead
  const situacao = situacaoDoToque(lead, hoje)
  const passo = passoAtual(lead)
  const canal = passo?.channel ?? null
  const Icone = canal ? ICONE_DO_CANAL[canal] : null
  const alvo = dataAlvo(lead)

  const contato =
    lead.contact_name !== null && lead.contact_name.trim() !== ''
      ? lead.contact_name
      : 'Sem contato identificado'

  return (
    <button
      type="button"
      onClick={() => onAbrir(linha)}
      className="w-full rounded-lg border border-border bg-surface p-2.5 text-left active:bg-surface-2 lg:p-3 lg:hover:bg-surface-2"
    >
      {/* `truncate` hasta md, `line-clamp-2` en lg+: en una tablet la columna
          mide ~175 px y una empresa de tres palabras rompería la altura de
          todas las tarjetas; en un monitor sobra ancho y cortar el nombre del
          cliente es el defecto que esta pasada existe para matar. */}
      <span className="block truncate text-sm font-semibold lg:whitespace-normal lg:line-clamp-2 lg:break-words">
        {lead.company_name}
      </span>

      <span className="block truncate text-2xs text-fg-muted lg:whitespace-normal">
        {contato}
        {lead.contact_title !== null && lead.contact_title.trim() !== '' && (
          <span className="hidden lg:inline"> · {lead.contact_title}</span>
        )}
      </span>

      <span className="mt-1.5 flex items-center justify-between gap-2">
        <ProgressDots
          total={MAX_TOUCHPOINTS}
          feitos={lead.touchpoints_count}
          size="sm"
          tone={situacao === 'atrasado' ? 'perigo' : 'marca'}
          destacarProximo={situacao !== 'esgotado'}
        />
        {/* El atajo «126d». `lg:hidden` porque en escritorio la franja de
            abajo ya lo dice en palabras, y decir dos veces lo mismo en la
            misma tarjeta es ruido, no densidad. */}
        {linha.atraso > 0 && (
          <span className="shrink-0 text-2xs font-bold tnum text-danger lg:hidden">
            {String(linha.atraso)}d
          </span>
        )}
      </span>

      {/* La franja de escritorio: el canal del próximo toque a la izquierda y
          la situación en palabras a la derecha. En móvil el kanban ni existe,
          y en tablet no entra: por eso `hidden lg:flex`. */}
      <span className="mt-2 hidden items-center justify-between gap-2 border-t border-border pt-2 text-2xs lg:flex">
        {Icone && canal ? (
          <span className="flex min-w-0 items-center gap-1 text-fg-subtle">
            <Icone size={12} aria-hidden className="shrink-0" />
            <span className="truncate">{CHANNEL_LABELS[canal]}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">Sequência completa</span>
        )}

        {situacao === 'atrasado' ? (
          <span className="shrink-0 font-semibold tnum text-danger">
            {linha.atraso === 1 ? '1 dia de atraso' : `${String(linha.atraso)} dias de atraso`}
          </span>
        ) : situacao === 'hoje' ? (
          <span className="shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 font-semibold text-brand-soft-fg">
            Hoje
          </span>
        ) : situacao === 'esgotado' ? (
          <span className="shrink-0 text-fg-subtle">7 de 7 · reciclar</span>
        ) : (
          <span className={cx('shrink-0 tnum text-fg-subtle')}>
            {alvo ? formatarDataCurta(alvo, hoje) : 'Sem data'}
          </span>
        )}
      </span>
    </button>
  )
}
