// src/screens/Dossie/Hexagono.tsx
// Las 6 escalas PPVVCC en un radar, con los DOS polígonos superpuestos:
//
//   · el declarado, punteado, es lo que el vendedor dice que tiene;
//   · el verificado, relleno, es lo que tiene con prova de los últimos 90 dias.
//
// El hueco entre los dos es la tesis de M6 y no hace falta explicarlo con
// palabras: se ve. En producción hoy hay 65 de 65 oportunidades donde el
// polígono relleno es un punto en el centro.
//
// El SVG es decorativo (aria-hidden). Lo que lee el lector de pantalla —y lo
// que el pulgar toca— es la lista de abajo: seis filas de 44px+ con el badge
// de evidencia y su cita.

import { ChevronRight } from 'lucide-react'
import {
  SCALE_KEYS,
  SCALE_LABELS,
  estadoDaEvidencia,
  getScaleDefinition,
  type Evidence,
  type EstadoEvidencia,
  type GateFaltante,
  type IsoDate,
  type ScaleKey,
  type ScaleScores,
} from '@/core'
import { Badge, Chip, cx } from '@/ui'

export interface HexagonoProps {
  scores: ScaleScores
  /** Escalas con prova fresca: las que cuentan en el health verificado. */
  comProva: readonly ScaleKey[]
  evidencias: readonly Evidence[]
  /** Gates pendientes de la etapa actual: marcan qué escala traba el avance. */
  gates: readonly GateFaltante[]
  hoje: IsoDate
  onEscolher: (escala: ScaleKey) => void
}

const CENTRO_X = 120
const CENTRO_Y = 104
const RAIO = 76

/** Punto cartesiano de una escala a un nivel dado (0..10). */
function ponto(indice: number, nivel: number): { x: number; y: number } {
  const angulo = (Math.PI / 180) * (indice * 60 - 90)
  const r = (Math.max(0, Math.min(10, nivel)) / 10) * RAIO
  return { x: CENTRO_X + r * Math.cos(angulo), y: CENTRO_Y + r * Math.sin(angulo) }
}

function poligono(valores: readonly number[]): string {
  return valores
    .map((v, i) => {
      const p = ponto(i, v)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')
}

const TOM_POR_ESTADO: Readonly<Record<EstadoEvidencia, 'ok' | 'atencao' | 'perigo'>> = {
  com_prova: 'ok',
  prova_velha: 'atencao',
  sem_prova: 'perigo',
}

const COR_POR_ESTADO: Readonly<Record<EstadoEvidencia, string>> = {
  com_prova: 'var(--color-ok)',
  prova_velha: 'var(--color-warn)',
  sem_prova: 'var(--color-danger)',
}

export function Hexagono({
  scores,
  comProva,
  evidencias,
  gates,
  hoje,
  onEscolher,
}: HexagonoProps) {
  const provadas = new Set(comProva)
  const declarados = SCALE_KEYS.map((k) => scores[k])
  const verificados = SCALE_KEYS.map((k) => (provadas.has(k) ? scores[k] : 0))
  const porGate = new Map(gates.map((g) => [g.escala, g]))

  return (
    <div>
      <svg
        // El viewBox EMPIEZA EN NEGATIVO a propósito. La malla vive en
        // 0…240, pero los rótulos se dibujan FUERA del hexágono: «Controle 0»
        // se ancla en x=37 con `text-anchor=end` y se extiende hasta x≈-25,
        // así que con el viewBox pegado a 0 la palabra salía cortada
        // («ontrole 0») en todos los tamaños. Los 36 px de aire a cada lado
        // son el ancho del rótulo más largo, no un número redondo.
        viewBox="-36 0 312 208"
        className="mx-auto block w-full max-w-[20rem] lg:max-w-[24rem]"
        aria-hidden
        focusable="false"
      >
        {/* Malla: anillos de 2 en 2 y los seis ejes. */}
        {[2, 4, 6, 8, 10].map((nivel) => (
          <polygon
            key={nivel}
            points={poligono(SCALE_KEYS.map(() => nivel))}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={nivel === 10 ? 1.2 : 0.8}
          />
        ))}
        {SCALE_KEYS.map((k, i) => {
          const p = ponto(i, 10)
          return (
            <line
              key={k}
              x1={CENTRO_X}
              y1={CENTRO_Y}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-border)"
              strokeWidth={0.8}
            />
          )
        })}

        {/* Declarado: punteado, sin relleno. Es una afirmação, não um fato. */}
        <polygon
          points={poligono(declarados)}
          fill="none"
          stroke="var(--color-fg-subtle)"
          strokeWidth={1.6}
          strokeDasharray="4 3"
        />

        {/* Verificado: relleno. Es lo que se puede sostener con una cita. */}
        <polygon
          points={poligono(verificados)}
          fill="var(--color-brand)"
          fillOpacity={0.22}
          stroke="var(--color-brand)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {SCALE_KEYS.map((k, i) => {
          const p = ponto(i, scores[k])
          const estado = estadoDaEvidencia(k, evidencias, hoje).estado
          return <circle key={k} cx={p.x} cy={p.y} r={3.4} fill={COR_POR_ESTADO[estado]} />
        })}

        {/* Rótulos: fuera del hexágono, alineados según el cuadrante. */}
        {SCALE_KEYS.map((k, i) => {
          const p = ponto(i, 12.6)
          const ancoragem = i === 0 || i === 3 ? 'middle' : i < 3 ? 'start' : 'end'
          return (
            <text
              key={k}
              x={p.x}
              y={p.y + 4}
              textAnchor={ancoragem}
              fill="var(--color-fg-muted)"
              fontSize="11"
              fontWeight="600"
            >
              {SCALE_LABELS[k]} {scores[k]}
            </text>
          )
        })}
      </svg>

      <div className="mt-2 flex items-center justify-center gap-4 text-2xs text-fg-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-4 border-t-2 border-dashed border-fg-subtle"
          />
          Declarada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-xs bg-brand/30 ring-1 ring-brand" />
          Com prova
        </span>
      </div>

      <ul className="mt-3 divide-y divide-border border-t border-border">
        {SCALE_KEYS.map((k) => {
          const nivel = scores[k]
          const estado = estadoDaEvidencia(k, evidencias, hoje)
          const prova = evidencias
            .filter((e) => e.scale === k)
            .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
          const gate = porGate.get(k)
          const definicao = getScaleDefinition(k, nivel)

          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => onEscolher(k)}
                className="flex min-h-touch w-full items-center gap-3 py-3 text-left tap-highlight-none active:bg-surface-2 lg:hover:bg-surface-2"
              >
                <span
                  className={cx(
                    'tnum flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-bold',
                    estado.estado === 'com_prova'
                      ? 'bg-ok-soft text-ok-soft-fg'
                      : estado.estado === 'prova_velha'
                        ? 'bg-warn-soft text-warn-soft-fg'
                        : 'bg-danger-soft text-danger-soft-fg',
                  )}
                >
                  {nivel}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{SCALE_LABELS[k]}</span>
                    <Badge tone={TOM_POR_ESTADO[estado.estado]}>
                      {estado.estado === 'com_prova'
                        ? `há ${String(estado.idadeDias ?? 0)} d`
                        : estado.estado === 'prova_velha'
                          ? `sem prova há ${String(estado.idadeDias ?? 0)} d`
                          : 'nunca documentada'}
                    </Badge>
                    {gate && (
                      <Chip size="sm" tone="atencao">
                        trava a etapa · falta {gate.minimo}
                      </Chip>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    {prova?.quote ? `“${prova.quote}”` : (definicao?.text ?? 'Sem definição')}
                  </span>
                </span>

                <ChevronRight size={18} aria-hidden className="shrink-0 text-fg-subtle" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
