// src/screens/Ajustes/SecaoCookbook.tsx
// COOKBOOK SEMANAL — la meta es de quien la cumple.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTA SECCIÓN
// ══════════════════════════════════════════════════════════════════════════
//
// 1. LA PROPUESTA SE MUESTRA CON SU ORIGEN A LA VISTA. «O sistema propõe 32»
//    no significa nada; «nas últimas 4 semanas você fez 29, 34, 31 e 28»
//    sí. Una meta cuya procedencia no se puede ver es una meta impuesta con
//    disfraz de algoritmo, y con cuatro personas que se conocen eso se nota
//    en una semana.
//
// 2. LA BANDA DE ±30 % ES VISIBLE Y ES UN TOPE REAL. Fuera de esa banda no es
//    una meta negociada: hacia abajo deja de medir nada, hacia arriba deja de
//    ser alcanzable y se abandona en tres días. El control no deja salir de la
//    banda — no avisa después, no deja entrar.
//
// 3. NADA SE GUARDA SOLO. Un cookbook que se autoguarda mientras el dedo
//    arrastra convierte una decisión en un accidente. Hay un botón, y hasta
//    tocarlo la meta vigente sigue siendo la de antes.

import { useState } from 'react'
import { Target } from 'lucide-react'
import type { MetasSemanais, PropostaDoCookbook } from '@/data'
import { useDefinirCookbook, usePropostaDoCookbook } from '@/data'
import { Button, Chip, NumberField, Skeleton, toast } from '@/ui'
import { Divisor, Secao } from './Secao'

interface Metrica {
  chave: keyof MetasSemanais
  rotulo: string
  sufixo: string
  ajuda: string
}

const METRICAS: readonly Metrica[] = [
  {
    chave: 'contato',
    rotulo: 'Toques',
    sufixo: '/semana',
    ajuda: 'Qualquer contato registrado: ligação, e-mail, WhatsApp, LinkedIn, visita.',
  },
  {
    chave: 'conversa',
    rotulo: 'Conversas',
    sufixo: '/semana',
    ajuda: 'Contatos em que a outra pessoa respondeu. É o que separa atividade de diálogo.',
  },
  {
    chave: 'reuniao',
    rotulo: 'Reuniões',
    sufixo: '/semana',
    ajuda: 'Reuniões e demos realizadas. É o único número que vira pipeline novo.',
  },
  {
    chave: 'avanco',
    rotulo: 'Avanços',
    sufixo: '/semana',
    ajuda: 'Escala que subiu com prova, etapa que avançou, teste que aconteceu.',
  },
]

export function SecaoCookbook({ vendorName }: { vendorName: string | null }) {
  const consulta = usePropostaDoCookbook(vendorName)
  const definir = useDefinirCookbook()
  const [rascunho, setRascunho] = useState<MetasSemanais | null>(null)

  // El borrador se DERIVA en render: `null` significa «todavía no tocó nada»,
  // así que vale lo guardado. Copiarlo con un efecto obligaría a un render de
  // más y, peor, dejaría un frame con el valor viejo cada vez que el dato se
  // revalida.
  const dados = consulta.data

  if (consulta.isPending || !dados) {
    return (
      <Secao titulo="Cookbook da semana" proposito="Quanto você se compromete a fazer por semana.">
        <Skeleton variant="lista" count={3} />
      </Secao>
    )
  }

  const valores: MetasSemanais = rascunho ?? dados.atual
  const mudou = METRICAS.some((m) => valores[m.chave] !== dados.atual[m.chave])

  return (
    <Secao
      titulo="Cookbook da semana"
      icone={<Target size={14} aria-hidden />}
      proposito="Quanto você se compromete a fazer por semana. A meta é sua — o sistema só propõe."
    >
      <Procedencia dados={dados} />

      <Divisor />

      <div className="flex flex-col gap-5">
        {METRICAS.map((m) => {
          const banda = dados.bandas[m.chave]
          return (
            <NumberField
              key={m.chave}
              label={m.rotulo}
              sufixo={m.sufixo}
              value={valores[m.chave]}
              onChange={(v) => setRascunho({ ...valores, [m.chave]: v })}
              min={banda.min}
              max={banda.max}
              referencia={`proposta ${dados.proposta[m.chave]} · ajuste ${banda.min}–${banda.max}`}
              hint={m.ajuda}
            />
          )
        })}
      </div>

      <Divisor />

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          block
          disabled={!mudou}
          loading={definir.isPending}
          onClick={() => {
            if (!vendorName) return
            definir.mutate(
              { vendor: vendorName, proposta: dados.proposta, escolhida: valores },
              {
                onSuccess: () => {
                  setRascunho(null)
                  toast({ message: 'Cookbook da semana atualizado.', tone: 'ok' })
                },
                onError: () => {
                  toast({
                    message: 'Não deu para salvar agora. Tente de novo em alguns segundos.',
                    tone: 'perigo',
                  })
                },
              },
            )
          }}
        >
          {mudou ? 'Salvar minha meta' : 'Meta salva'}
        </Button>
        {mudou && (
          <Button variant="ghost" onClick={() => setRascunho(null)}>
            Desfazer
          </Button>
        )}
      </div>
    </Secao>
  )
}

/** De dónde salió la propuesta. Sin esto, la meta es un número caído del cielo. */
function Procedencia({ dados }: { dados: PropostaDoCookbook }) {
  const semanas = dados.historico
  const maximo = Math.max(1, ...semanas.map((s) => s.contato))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={dados.origem === 'historico' ? 'marca' : 'info'} size="sm">
          {dados.origem === 'historico' ? 'Baseado no seu histórico' : 'Rampa do time'}
        </Chip>
        {dados.negociado && (
          <Chip tone="ok" size="sm">
            Você já negociou esta meta
          </Chip>
        )}
        <Chip tone="neutro" size="sm">
          Semana {dados.semanaDaRampa}
        </Chip>
      </div>

      <p className="mt-2 text-sm leading-snug text-fg-muted">
        {dados.origem === 'historico'
          ? 'A proposta é a média das suas últimas 4 semanas fechadas, com a rampa do time como piso. Se você já faz mais, a meta não te puxa para baixo.'
          : 'Ainda não há 4 semanas de histórico neste aparelho, então vale a rampa do time: 4 → 8 → 12 toques por dia, calibrada contra o que o time realmente faz hoje.'}
      </p>

      {/* Las 4 semanas, en barras. Es la evidencia, no un adorno. */}
      <div className="mt-3 flex items-end gap-2" aria-hidden>
        {semanas.map((s) => (
          <div key={s.semana} className="flex flex-1 flex-col items-center gap-1">
            <span className="tnum text-2xs text-fg-subtle">{s.contato}</span>
            <span
              className="w-full rounded-sm bg-brand-soft"
              style={{ height: `${Math.max(4, (s.contato / maximo) * 40)}px` }}
            />
            <span className="text-2xs text-fg-subtle">{s.semana.slice(8, 10)}/{s.semana.slice(5, 7)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-2xs text-fg-subtle">
        Toques por semana nas 4 semanas fechadas (segunda de cada semana).
      </p>
    </div>
  )
}
