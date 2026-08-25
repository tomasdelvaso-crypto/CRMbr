// src/screens/Ajustes/SecaoJogo.tsx
// O JOGO — el opt-out tiene que ser real, o no es un opt-out.
//
// ══════════════════════════════════════════════════════════════════════════
// LA DECISIÓN QUE SOSTIENE ESTA SECCIÓN
// ══════════════════════════════════════════════════════════════════════════
// Apagar el juego NO ESCONDE NINGÚN DATO y no saca acceso a nada. Se apagan
// los puntos, los anillos, la racha, los carriles y las celebraciones; el
// Placar sigue mostrando el resumen factual de la semana, la agenda sigue
// igual y los recordatorios también.
//
// Con cuatro personas que se conocen, un tono equivocado no produce «churn de
// usuario»: produce resentimiento con la empresa. Este interruptor es la única
// garantía estructural contra eso, y por eso vive en la capa de datos
// (`gamificacao.ts`) y no en el estado de una pantalla — un opt-out que se
// olvida al día siguiente es una burla.

import { Gamepad2, ScrollText } from 'lucide-react'
import {
  useDefinirPreferenciasDoJogo,
  usePreferenciasDoJogo,
  type PreferenciasDoJogo,
} from '@/data'
import { Button, Skeleton, Switch } from '@/ui'
import { Divisor, Secao } from './Secao'

export function SecaoJogo({
  vendorName,
  aoAbrirRegras,
}: {
  vendorName: string | null
  aoAbrirRegras: () => void
}) {
  const consulta = usePreferenciasDoJogo(vendorName)
  const definir = useDefinirPreferenciasDoJogo()

  if (consulta.isPending || !consulta.data) {
    return (
      <Secao titulo="O jogo" proposito="Anéis, racha e troféus — ou nada disso.">
        <Skeleton variant="lista" count={2} />
      </Secao>
    )
  }

  const prefs = consulta.data
  const salvar = (mudancas: Partial<PreferenciasDoJogo>): void => {
    if (!vendorName) return
    definir.mutate({ vendor: vendorName, mudancas })
  }

  return (
    <Secao
      titulo="O jogo"
      icone={<Gamepad2 size={14} aria-hidden />}
      proposito="Anéis, racha e troféus. Desligar aqui não tira acesso a nada."
      acao={
        <Button
          variant="ghost"
          size="sm"
          icon={<ScrollText size={16} aria-hidden />}
          onClick={aoAbrirRegras}
        >
          Regras
        </Button>
      }
    >
      <Switch
        label="Jogo ligado"
        description="Desligado: sem pontos, sem troféus, sem carris, sem comemorações. O Placar vira um resumo da semana e o resto do app continua igual."
        checked={prefs.ligado}
        onChange={(v) => salvar({ ligado: v })}
      />

      <Divisor />

      <div className="flex flex-col gap-1">
        <Switch
          label="Comemorações"
          description="Confete e vibração quando um anel fecha. Cada um regula o volume do seu."
          checked={prefs.celebracoes}
          disabled={!prefs.ligado}
          onChange={(v) => salvar({ celebracoes: v })}
        />
        <Switch
          label="Ver o carril dos colegas"
          description="Só ver: nunca há posições nem ranking. Serve para saber que ninguém está sozinho."
          checked={prefs.carrisDoTime}
          disabled={!prefs.ligado}
          onChange={(v) => salvar({ carrisDoTime: v })}
        />
        <Switch
          label="Kudos"
          description="Receber e poder dar reconhecimento. Cinco por semana, não acumulam."
          checked={prefs.kudos}
          disabled={!prefs.ligado}
          onChange={(v) => salvar({ kudos: v })}
        />
      </div>

      {!prefs.ligado && (
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-snug text-fg-muted">
          Com o jogo desligado você continua com a agenda, os lembretes, a Cadência, a Golden
          Hour, o Dossiê e o Ventus. Nada some. Se quiser voltar, é aqui mesmo.
        </p>
      )}
    </Secao>
  )
}
