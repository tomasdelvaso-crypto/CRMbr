// src/screens/Rituais/RitualManha.tsx
// MANHÃ · «Escolha suas 3 prioridades» — antes de las 10h, en 20 segundos.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE RITUAL EXISTE
// ══════════════════════════════════════════════════════════════════════════
// Convertir la cola que impone el sistema en un compromiso propio. Las mismas
// tres tarjetas, elegidas en vez de recibidas, se cumplen mucho más — y el
// planner ya las trae precargadas, así que elegir cuesta un tap, no una
// decisión.
//
// Lo que se elige acá ES el plan del día de la tela Hoje: se escribe la misma
// llave. Si fueran dos listas distintas, el ritual sería teatro.
//
// El aviso de sobrecarga NUNCA dice «você não vai conseguir». Dice el número
// —«sua média é 1,4 por dia útil»— y devuelve la decisión. Con culpa, la
// persona elige menos para no sentirse mal; con el dato, elige bien.

import { useMemo, useState } from 'react'
import { Check, Sunrise } from 'lucide-react'
import {
  LIMITE_DE_PRIORIDADES,
  avisoDeSobrecarga,
  useFixarPrioridades,
  useRitualDaManha,
  type SugestaoDaManha,
} from '@/data'
import type { IsoDate } from '@/core'
import { Button, EmptyState, Skeleton, TextArea, cx, haptic, toast } from '@/ui'
import { Passos } from './Passos'

export interface RitualManhaProps {
  open: boolean
  onClose: () => void
  vendorName: string
  dia: IsoDate
  onPronto: () => void
}

export function RitualManha({ open, onClose, vendorName, dia, onPronto }: RitualManhaProps) {
  const dados = useRitualDaManha(open ? vendorName : null, dia)
  const fixar = useFixarPrioridades()

  const [passo, setPasso] = useState(1)
  // `null` = la persona todavía no tocó nada, así que manda la precarga. Se
  // DERIVA en el render en vez de sincronizarse con un efecto: un efecto que
  // copia props a estado produce un render de más y una ventana en la que la
  // lista se ve vacía.
  const [escolhidos, setEscolhidos] = useState<string[] | null>(null)
  const [fraseEditada, setFraseEditada] = useState<string | null>(null)

  // Precarga: las sugerencias del planner vienen ya marcadas. Elegir es
  // confirmar o cambiar una, nunca armar la lista de cero.
  const precarregados = useMemo(() => {
    if (!dados.data) return []
    if (dados.data.jaFixados.length > 0) return dados.data.jaFixados
    return dados.data.candidatos.filter((c) => c.sugerida).map((c) => c.acao.id)
  }, [dados.data])

  const marcados = escolhidos ?? precarregados
  const frase = fraseEditada ?? dados.data?.fraseGoldenHour ?? dados.data?.fraseSugerida ?? ''
  const setFrase = setFraseEditada

  const aviso = useMemo(() => {
    if (!dados.data) return null
    return avisoDeSobrecarga(marcados.length, dados.data.mediaPorDia, dados.data.semanasMedidas)
  }, [dados.data, marcados.length])

  const alternar = (id: string) => {
    haptic('selection')
    setEscolhidos((atual) => {
      const lista = atual ?? precarregados
      if (lista.includes(id)) return lista.filter((x) => x !== id)
      if (lista.length >= LIMITE_DE_PRIORIDADES) {
        // El límite de 3 es duro. Cambiar de idea es sacar una, no agregar
        // una cuarta: es lo que hace que «Pronto por hoje» sea alcanzable.
        toast({ message: 'Três é o teto do dia. Tire uma para pôr outra.', tone: 'neutro' })
        return lista
      }
      return [...lista, id]
    })
  }

  const fechar = () => {
    setPasso(1)
    onClose()
  }

  const confirmar = async () => {
    await fixar.mutateAsync({ vendor: vendorName, dia, ids: marcados, frase })
    haptic('success')
    setPasso(3)
  }

  const escolhidosDetalhe: SugestaoDaManha[] =
    dados.data?.candidatos.filter((c) => marcados.includes(c.acao.id)) ?? []

  return (
    <Passos
      open={open}
      onClose={fechar}
      titulo="Bom dia"
      descricao={DESCRICOES[passo - 1] ?? ''}
      passo={passo}
      total={3}
      footer={
        passo === 1 ? (
          <Button
            block
            size="lg"
            disabled={marcados.length === 0 || dados.isPending}
            onClick={() => setPasso(2)}
          >
            {marcados.length === 0
              ? 'Escolha ao menos uma'
              : `Seguir com ${marcados.length}`}
          </Button>
        ) : passo === 2 ? (
          <Button block size="lg" loading={fixar.isPending} onClick={confirmar}>
            Confirmar o dia
          </Button>
        ) : (
          <Button
            block
            size="lg"
            icon={<Check size={18} />}
            onClick={() => {
              onPronto()
              fechar()
            }}
          >
            Começar
          </Button>
        )
      }
    >
      {passo === 1 && (
        <>
          {dados.isPending ? (
            <Skeleton variant="card-acao" count={2} />
          ) : dados.data?.candidatos.length === 0 ? (
            <EmptyState
              icon={<Sunrise size={26} />}
              title={dados.data.carteiraVazia ? 'A carteira ainda está baixando' : 'Nada urgente hoje'}
              description={
                dados.data.carteiraVazia
                  ? 'Assim que ela chegar, as sugestões aparecem aqui.'
                  : 'Dia bom para prospectar: o mapa de mercado tem empresas esperando.'
              }
            />
          ) : (
            <>
              <ul className="space-y-2">
                {dados.data?.candidatos.map((c) => (
                  <li key={c.acao.id}>
                    <LinhaDeEscolha
                      sugestao={c}
                      marcado={marcados.includes(c.acao.id)}
                      onToggle={() => alternar(c.acao.id)}
                    />
                  </li>
                ))}
              </ul>

              {aviso && (
                <p className="mt-3 rounded-card bg-warn-soft px-3.5 py-3 text-xs leading-relaxed text-warn-soft-fg">
                  {aviso}
                </p>
              )}
            </>
          )}
        </>
      )}

      {passo === 2 && (
        <>
          <p className="mb-3 text-sm leading-relaxed text-fg-muted">
            A frase que decide a Golden Hour antes que o dia decida por você. É a peça com melhor
            evidência de todo o desenho — e custa uma linha.
          </p>

          <TextArea
            label="Se… então…"
            value={frase}
            onChange={setFrase}
            rows={3}
            maxLength={180}
            enterKeyHint="done"
            hint="Hora, lugar e com que lista. Quanto mais concreta, mais ela funciona."
          />

          <ul className="mt-4 space-y-1.5">
            {escolhidosDetalhe.map((c) => (
              <li key={c.acao.id} className="flex items-start gap-2 text-xs text-fg-muted">
                <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                <span className="leading-relaxed">
                  <span className="font-medium text-fg">{c.acao.entidade.cliente}</span> — {c.acao.acao}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {passo === 3 && (
        <div className="py-2">
          <p className="text-base leading-relaxed text-fg">
            Pronto. O dia está desenhado — e são {marcados.length}, não quinze.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {frase.trim() === ''
              ? 'A Golden Hour te espera às 16h com a lista da véspera.'
              : `“${frase.trim()}”`}
          </p>
          <p className="mt-4 text-2xs leading-relaxed text-fg-subtle">
            Dois contatos de largada já entraram no seu anel por ter feito isto.
          </p>
        </div>
      )}
    </Passos>
  )
}

const DESCRICOES = [
  'Escolha até 3. Já vêm marcadas as que o motor sugere.',
  'A frase da Golden Hour, para o dia não decidir por você.',
  'Vinte segundos bem gastos.',
]

function LinhaDeEscolha({
  sugestao,
  marcado,
  onToggle,
}: {
  sugestao: SugestaoDaManha
  marcado: boolean
  onToggle: () => void
}) {
  const { acao } = sugestao
  const motivo = acao.porque[0]

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      onClick={onToggle}
      className={cx(
        'flex min-h-touch w-full items-start gap-3 rounded-card border p-3 text-left transition-colors',
        marcado ? 'border-brand bg-brand-soft/50' : 'border-border bg-surface',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors',
          marcado ? 'border-brand bg-brand text-brand-fg' : 'border-border-strong',
        )}
      >
        {marcado && <Check size={13} strokeWidth={3} />}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-fg-muted">{acao.entidade.cliente}</span>
        <span className="mt-0.5 block text-sm leading-snug font-medium text-fg">{acao.acao}</span>
        {motivo && (
          <span className="mt-1 block text-2xs leading-relaxed text-fg-subtle">
            {motivo.sinal} — {motivo.detalhe}
          </span>
        )}
      </span>

      {sugestao.sugerida && (
        <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-2xs font-medium text-fg-muted">
          sugerida
        </span>
      )}
    </button>
  )
}
