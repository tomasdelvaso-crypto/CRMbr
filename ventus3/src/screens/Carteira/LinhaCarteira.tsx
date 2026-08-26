// src/screens/Carteira/LinhaCarteira.tsx
// La fila compacta: 72px exactos, porque es lo que la VirtualList necesita para
// no medir nada y lo que hace que 65 (o 500) filas cuesten lo mismo que 12.
//
// Todo lo que se ve acá ya viene resuelto en CarteiraRow. La fila NO consulta
// nada: cero queries por fila es el requisito que separa esta pantalla de la
// del v2, que dispara ~195 al abrirse.

import { memo } from 'react'
import { ChevronRight, MessageSquarePlus, CalendarClock } from 'lucide-react'
import { formatarDataCurta, getStageName, todayBr } from '@/core'
import type { CarteiraRow } from '@/data'
import { Badge, SwipeRow, cx, formatBrlCompacto } from '@/ui'
import { TOM_DO_RISCO, nivelDeRisco } from './visoes'

/** Alto exacto de la fila. Lo comparte la VirtualList y el Skeleton. */
export const ALTURA_LINHA = 72

export interface LinhaCarteiraProps {
  linha: CarteiraRow
  /** El nodo va con el id: es el origen del morph hacia el Dossiê. */
  onAbrir: (id: number, elemento: HTMLElement | null) => void
  onRegistrar: (linha: CarteiraRow) => void
  onAdiar: (linha: CarteiraRow) => void
}

/** Tono de la saúde declarada: verde a partir de 7, rojo por debajo de 4. */
function tomDaSaude(health: number): 'ok' | 'atencao' | 'perigo' {
  if (health >= 7) return 'ok'
  if (health >= 4) return 'atencao'
  return 'perigo'
}

function silencioTexto(dias: number): string {
  if (dias <= 0) return 'Falado hoje'
  if (dias === 1) return 'Ontem'
  return `${String(dias)}d sem contato`
}

export const LinhaCarteira = memo(function LinhaCarteira({
  linha,
  onAbrir,
  onRegistrar,
  onAdiar,
}: LinhaCarteiraProps) {
  const opp = linha.opportunity
  const nome = opp.name ?? opp.client ?? `Oportunidade ${String(opp.id)}`
  const cliente = opp.client ?? '—'
  const etapa = getStageName(opp.stage) || 'Sem etapa'
  const nivel = nivelDeRisco(linha)
  const silencioso = linha.daysSinceContact >= 15

  return (
    <SwipeRow
      aria-label={`${nome}. ${cliente}. ${etapa}.`}
      onSwipeRight={() => onRegistrar(linha)}
      onSwipeLeft={() => onAdiar(linha)}
      rightLabel="Registrar"
      leftLabel="Adiar"
      rightIcon={<MessageSquarePlus size={20} aria-hidden />}
      leftIcon={<CalendarClock size={20} aria-hidden />}
      // La fila no se colapsa: registrar navega y adiar abre um sheet. Colapsar
      // dejaría un hueco en la lista para una fila que sigue existiendo.
      collapseOnAction={false}
      // Acá SÍ hace falta: «Registrar»/«Adiar» sólo existen como gesto —no
      // hay otro botón en la fila que haga lo mismo—, así que en lg+ (mouse)
      // necesitan un equivalente clickeable visible al pasar el mouse.
      hoverVisivelEmDesktop
    >
      <button
        type="button"
        onClick={(evento) => onAbrir(opp.id, evento.currentTarget)}
        style={{ height: ALTURA_LINHA }}
        className="flex w-full items-center gap-3 border-b border-border px-4 text-left tap-highlight-none active:bg-surface-2 lg:gap-4 lg:hover:bg-surface-2"
      >
        {/* Semáforo de riesgo: las 6 reglas de risk.ts en un punto. */}
        <Badge
          dot
          tone={TOM_DO_RISCO[nivel]}
          aria-label={
            nivel === 'critico' ? 'Risco crítico' : nivel === 'atencao' ? 'Atenção' : 'Sob controle'
          }
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5">{nome}</span>
          {/* El subtítulo se apaga EN DOS TIEMPOS, uno por cada columna que
              lo reemplaza — nunca antes, o el dato desaparece de la fila:

                · « · etapa» se va en `xl`, que es donde nace la columna Etapa.
                · el cliente se va en `2xl`, que es donde nace la columna
                  Cliente.

              Apagar el subtítulo entero en `xl` (como estaba en una versión
              intermedia de esta pasada) dejaba la franja 1280–1536 SIN el
              nombre del cliente en ningún lado: ni acá, porque estaba oculto,
              ni en su columna, porque todavía no existía. La fila decía
              «Prueba» y no «Prueba Tripolla», y con ella se cayeron cuatro
              pruebas que buscan la fila por el nombre del cliente. */}
          <span className="block truncate text-xs leading-4 text-fg-muted 2xl:hidden">
            {cliente}
            <span className="xl:hidden"> · {etapa}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-2xs leading-4 xl:hidden">
            <span className={cx('tnum', silencioso ? 'text-warn-soft-fg' : 'text-fg-subtle')}>
              {silencioTexto(linha.daysSinceContact)}
            </span>
            {linha.nextActionDate === null && (
              <span className="text-brand">Sem data</span>
            )}
            {linha.compromissosSemVeredicto > 0 && (
              <span className="text-warn-soft-fg">Sem veredicto</span>
            )}
          </span>
        </span>

        {/* ── LAS COLUMNAS DE ESCRITORIO ──────────────────────────────────
            En lg+ la carteira usa TODO el área de contenido (ver
            src/app/largura.ts) y esta fila deja de ser una tarjeta de teléfono
            estirada para volverse una fila de tabla densa: cliente, etapa,
            saúde declarada/verificada, días sin contacto, próxima acción con
            fecha y valor, cada cosa en su columna.

            Los anchos son FIJOS y no `flex-1` a propósito: con proporciones,
            el nombre del negocio se comía todo el sobrante y las columnas de
            la derecha quedaban flotando a 400 px del texto —que es justo lo
            que se veía en la captura del dueño—. Con anchos fijos el sobrante
            se lo lleva el nombre (que es lo que más lo necesita) y las
            columnas quedan en el mismo eje fila a fila, que es lo que hace
            que una tabla se pueda leer en vertical.

            ══════════════════════════════════════════════════════════════
            LAS COLUMNAS SE REVELAN DE A PASOS, Y EL NOMBRE NUNCA PAGA
            ══════════════════════════════════════════════════════════════
            Anchos fijos + `flex-1 min-w-0` para el nombre tienen un modo de
            falla que hay que decir con todas las letras: cuando los fijos NO
            ENTRAN, el que se encoge hasta cero es el flexible. Con las seis
            columnas prendidas todas juntas en `lg:`, el área de contenido a
            1024 px son 752 px contra 842 px de columnas fijas, y el nombre del
            negocio —el único dato que dice DE QUÉ negocio se trata— medía
            EXACTAMENTE 0 px. No truncado: ausente. A 1280 px medía 38, a 1366
            (un portátil corriente) 124. Sólo a partir de ~1600 se leía.

            Por eso las columnas entran cuando el ancho alcanza, y no antes:

              lg  (1024+) · saúde y valor. El resto sigue en las dos líneas de
                  abajo del nombre (`xl:hidden` arriba), que es donde ya vivían
                  en el teléfono: no se pierde ni un dato.
              xl  (1280+) · modo tabla: etapa, contato y próxima ação toman su
                  columna y las líneas de abajo se apagan.
              2xl (1536+) · entra cliente y próxima ação se ensancha.

            Medido, no estimado: el nombre queda en 454 px a 1024, 262 a 1280,
            294 a 1536 y 678 a 1920. Nunca más abajo de 260.

            Mismo alto de 72px — sólo se agrega ancho, nunca alto: es lo que la
            VirtualList necesita para no medir nada. */}
        <span className="hidden w-40 shrink-0 truncate text-xs text-fg-muted 2xl:block">
          {cliente}
        </span>
        <span className="hidden w-28 shrink-0 xl:block">
          <Badge tone="neutro">{etapa}</Badge>
        </span>

        {/* LOS DOS NÚMEROS DEL HEALTH, uno al lado del otro. Es la tesis de M6
            y en el teléfono no cabía: el declarado es lo que el vendedor cargó
            y el verificado es esa misma media con las escalas sin cita
            contando 0. Un 4,2 declarado con 0,8 verificado es un negocio que
            es una opinión, y en un monitor eso se lee sin abrir la ficha. */}
        <span className="hidden w-28 shrink-0 flex-col gap-0.5 text-2xs leading-4 lg:flex">
          <span className="tnum text-fg-muted">
            {linha.healthScore.toFixed(1).replace('.', ',')} declarada
          </span>
          <span
            className={cx(
              'tnum font-semibold',
              linha.healthVerificado <= 0 ? 'text-danger' : 'text-fg-subtle',
            )}
          >
            {linha.healthVerificado.toFixed(1).replace('.', ',')} com prova
          </span>
        </span>

        <span className="hidden w-28 shrink-0 flex-col gap-0.5 text-2xs leading-4 xl:flex">
          <span className={cx('tnum', silencioso ? 'text-warn-soft-fg' : 'text-fg-subtle')}>
            {silencioTexto(linha.daysSinceContact)}
          </span>
          {linha.compromissosSemVeredicto > 0 && (
            <span className="text-warn-soft-fg">
              {linha.compromissosSemVeredicto === 1
                ? '1 sem veredicto'
                : `${String(linha.compromissosSemVeredicto)} sem veredicto`}
            </span>
          )}
        </span>

        {/* La próxima acción CON FECHA. Es la columna que no existía y la que
            resume el defecto del v2: 51 de 54 oportunidades sin próxima acción
            fechada. Acá se ve sin abrir nada. */}
        <span className="hidden w-44 shrink-0 flex-col gap-0.5 text-2xs leading-4 xl:flex 2xl:w-56">
          {linha.nextActionDate === null ? (
            <span className="font-semibold text-brand">Sem próxima ação</span>
          ) : (
            <>
              <span className="truncate text-fg-muted">{linha.nextAction ?? 'Próxima ação'}</span>
              <span className="tnum font-medium text-fg-subtle">
                {formatarDataCurta(linha.nextActionDate, todayBr())}
              </span>
            </>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1 lg:w-24">
          <span className="text-sm font-semibold tnum leading-5">
            {formatBrlCompacto(opp.value)}
          </span>
          {/* El badge del health declarado. `lg:hidden` porque en escritorio
              la columna «Saúde» ya dice los DOS números en texto plano —que
              además es mejor para un lector de pantalla que un badge con
              aria-label—, y repetir el declarado acá al lado sería la misma
              cifra dos veces en la misma fila. */}
          <Badge
            className="lg:hidden"
            tone={tomDaSaude(linha.healthScore)}
            aria-label={`Saúde ${String(linha.healthScore)} de 10`}
          >
            {linha.healthScore.toFixed(1).replace('.', ',')}
          </Badge>
        </span>

        <ChevronRight size={18} aria-hidden className="shrink-0 text-fg-subtle" />
      </button>
    </SwipeRow>
  )
})
