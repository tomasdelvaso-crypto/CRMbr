// src/screens/Rituais/RitualSegunda.tsx
// SEGUNDA · declarar 3 compromissos ELEGIÉNDOLOS DE LA COLA.
//
// ══════════════════════════════════════════════════════════════════════════
// ELEGIR, NO ESCRIBIR
// ══════════════════════════════════════════════════════════════════════════
// Un compromiso escrito de cero es una intención vaga («falar com a Tetra»)
// que el viernes nadie puede evaluar. Un compromiso elegido de la cola nace
// con entidad, con texto imperativo y con el porqué del motor detrás — y el
// viernes Ventus puede cruzarlo contra lo registrado y proponer el veredicto.
//
// El segundo paso es el cookbook negociado: el sistema propone desde el
// histórico propio y la persona ajusta ±30 %. Victor Hugo (25 oportunidades,
// R$ 1,15M, 0 leads) y Andre (44 leads, 0 cierres) usan mitades distintas del
// sistema: una meta única sería injusta y se ignoraría. La autonomía sobre la
// meta es exactamente lo que separa gamificación de vigilancia.

import { useState } from 'react'
import { Check, Flag } from 'lucide-react'
import type { IsoDate, MetasDosAneis } from '@/core'
import {
  LIMITE_DE_COMPROMISSOS,
  useDeclararCompromissos,
  useRitualDaSegunda,
  type CandidatoDeCompromisso,
} from '@/data'
import { Button, EmptyState, Skeleton, Stepper, TextArea, cx, haptic } from '@/ui'
import { Passos } from './Passos'

export interface RitualSegundaProps {
  open: boolean
  onClose: () => void
  vendorName: string
  vendorId: number | null
  dia: IsoDate
  onPronto: () => void
}

export function RitualSegunda({
  open,
  onClose,
  vendorName,
  vendorId,
  dia,
  onPronto,
}: RitualSegundaProps) {
  const dados = useRitualDaSegunda(open ? vendorName : null, dia)
  const declarar = useDeclararCompromissos()

  const [passo, setPasso] = useState(1)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  // Igual que en a manhã: se DERIVA del dato mientras nadie tocó nada. Copiar
  // props a estado con un efecto cuesta un render de más y deja una ventana
  // en la que los steppers aparecen con el valor equivocado.
  const [metasEditadas, setMetasEditadas] = useState<MetasDosAneis | null>(null)
  const [fraseEditada, setFraseEditada] = useState<string | null>(null)

  const metas: MetasDosAneis | null = metasEditadas ?? dados.data?.atuais ?? null
  const setMetas = setMetasEditadas
  const frase = fraseEditada ?? dados.data?.fraseGoldenHour ?? dados.data?.fraseSugerida ?? ''
  const setFrase = setFraseEditada

  const candidatos = dados.data?.candidatos ?? []
  const jaDeclarados = dados.data?.declarados ?? []

  const alternar = (id: string) => {
    haptic('selection')
    setEscolhidos((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id)
      if (atual.length >= LIMITE_DE_COMPROMISSOS) return atual
      return [...atual, id]
    })
  }

  const fechar = () => {
    setPasso(1)
    onClose()
  }

  const confirmar = async () => {
    if (!dados.data || metas === null) return
    const escolhas: CandidatoDeCompromisso[] = candidatos.filter((c) => escolhidos.includes(c.id))
    await declarar.mutateAsync({
      vendor: vendorName,
      vendorId,
      hoje: dia,
      escolhas,
      metas: { proposta: dados.data.proposta, escolhida: metas },
      frase,
    })
    haptic('success')
    setPasso(3)
  }

  // El ±30 % del PLANO, aplicado a la propuesta del sistema. Fuera de esa
  // banda no es una meta negociada, es otra cosa.
  const faixa = (base: number): { min: number; max: number; step: number } => {
    const min = Math.max(1, Math.floor(base * 0.7))
    const max = Math.max(min + 1, Math.ceil(base * 1.3))
    // Nunca más de 13 marcas: con más, cada una queda por debajo del pulgar.
    return { min, max, step: Math.max(1, Math.ceil((max - min) / 12)) }
  }

  const proposta = dados.data?.proposta ?? { contato: 20, conversa: 5, avanco: 5 }

  return (
    <Passos
      open={open}
      onClose={fechar}
      titulo="Semana nova"
      descricao={DESCRICOES[passo - 1] ?? ''}
      passo={passo}
      total={3}
      footer={
        passo === 1 ? (
          <Button
            block
            size="lg"
            disabled={escolhidos.length === 0}
            onClick={() => setPasso(2)}
          >
            {escolhidos.length === 0
              ? 'Escolha ao menos um'
              : `Seguir com ${escolhidos.length}`}
          </Button>
        ) : passo === 2 ? (
          <Button block size="lg" loading={declarar.isPending} onClick={confirmar}>
            Fechar a semana
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
            Pronto
          </Button>
        )
      }
    >
      {passo === 1 && (
        <>
          {dados.isPending ? (
            <Skeleton variant="card-acao" count={3} />
          ) : jaDeclarados.length > 0 ? (
            <div>
              <p className="mb-3 text-sm leading-relaxed text-fg-muted">
                Você já declarou {jaDeclarados.length} nesta semana. Dá para somar mais um se fizer
                sentido — o teto é {LIMITE_DE_COMPROMISSOS}.
              </p>
              <ul className="mb-4 space-y-1.5">
                {jaDeclarados.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-xs text-fg-muted">
                    <Flag size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                    <span className="leading-relaxed">{t.title}</span>
                  </li>
                ))}
              </ul>
              <ListaDeCandidatos
                candidatos={candidatos}
                escolhidos={escolhidos}
                onToggle={alternar}
              />
            </div>
          ) : candidatos.length === 0 ? (
            <EmptyState
              icon={<Flag size={26} />}
              title={dados.data?.carteiraVazia ? 'A carteira ainda está baixando' : 'A fila está limpa'}
              description={
                dados.data?.carteiraVazia
                  ? 'Os candidatos aparecem assim que ela chegar.'
                  : 'Sem nada pendente, o compromisso da semana pode ser prospectar: o mapa de mercado tem empresas esperando.'
              }
            />
          ) : (
            <ListaDeCandidatos candidatos={candidatos} escolhidos={escolhidos} onToggle={alternar} />
          )}
        </>
      )}

      {passo === 2 && metas !== null && (
        <>
          <p className="mb-4 text-sm leading-relaxed text-fg-muted">
            Suas metas da semana. O sistema propõe a partir do seu histórico; você ajusta até 30%
            para cima ou para baixo. Ninguém edita isto sem falar com você.
          </p>

          <div className="space-y-5">
            <Stepper
              label="Toques na semana"
              value={metas.contato}
              onChange={(v) => setMetas({ ...metas, contato: v })}
              min={faixa(proposta.contato).min}
              max={faixa(proposta.contato).max}
              step={faixa(proposta.contato).step}
              levelText={`Proposta do sistema: ${proposta.contato}`}
            />
            <Stepper
              label="Conversas na semana"
              value={metas.conversa}
              onChange={(v) => setMetas({ ...metas, conversa: v })}
              min={faixa(proposta.conversa).min}
              max={faixa(proposta.conversa).max}
              step={faixa(proposta.conversa).step}
              levelText={`Proposta do sistema: ${proposta.conversa}`}
            />
            <Stepper
              label="Avanços na semana"
              value={metas.avanco}
              onChange={(v) => setMetas({ ...metas, avanco: v })}
              min={faixa(proposta.avanco).min}
              max={faixa(proposta.avanco).max}
              step={faixa(proposta.avanco).step}
              levelText={`Proposta do sistema: ${proposta.avanco}`}
            />
          </div>

          <div className="mt-5">
            <TextArea
              label="Frase da Golden Hour"
              value={frase}
              onChange={setFrase}
              rows={3}
              maxLength={180}
              enterKeyHint="done"
              hint="Vale a semana inteira. Só dá para mover o horário na véspera, nunca na hora."
            />
          </div>
        </>
      )}

      {passo === 3 && (
        <div className="py-2">
          <p className="text-base leading-relaxed text-fg">
            Semana declarada. Na sexta às 16h o Ventus traz o veredicto já proposto — você só
            confirma ou corrige.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            {frase.trim() === '' ? 'A Golden Hour te espera às 16h.' : `“${frase.trim()}”`}
          </p>
        </div>
      )}
    </Passos>
  )
}

const DESCRICOES = [
  'Escolha até 3 da fila. Nada de escrever do zero.',
  'Suas metas e a frase da Golden Hour.',
  'É isto. Boa semana.',
]

function ListaDeCandidatos({
  candidatos,
  escolhidos,
  onToggle,
}: {
  candidatos: CandidatoDeCompromisso[]
  escolhidos: string[]
  onToggle: (id: string) => void
}) {
  return (
    <ul className="space-y-2">
      {candidatos.map((c) => {
        const marcado = escolhidos.includes(c.id)
        return (
          <li key={c.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={marcado}
              onClick={() => onToggle(c.id)}
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
                <span className="block text-xs font-medium text-fg-muted">{c.cliente}</span>
                <span className="mt-0.5 block text-sm leading-snug font-medium text-fg">
                  {c.titulo}
                </span>
                {c.motivo !== '' && (
                  <span className="mt-1 block text-2xs leading-relaxed text-fg-subtle">
                    {c.motivo}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
