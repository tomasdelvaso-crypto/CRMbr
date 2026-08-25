// src/screens/Placar/AjustesDoJogo.tsx
// El opt-out. Vive acá y no solo en Ajustes a propósito: el interruptor tiene
// que estar donde está el juego, al alcance de quien en ese momento decidió
// que no lo quiere. Mandar a alguien a buscar el switch en otra pantalla es
// una forma educada de no dárselo.
//
// «Cualquiera puede apagar anillos y rachas y quedarse con agenda y
// recordatorios, SIN PERDER ACCESO A NADA.» Por eso el sheet lo dice con todas
// las letras y por eso el Placar apagado sigue mostrando el resumen factual de
// la semana: se apaga la capa lúdica, no la información.

import type { PreferenciasDoJogo } from '@/data'
import { Sheet, Switch } from '@/ui'

export interface AjustesDoJogoProps {
  open: boolean
  onClose: () => void
  prefs: PreferenciasDoJogo
  onMudar: (mudancas: Partial<PreferenciasDoJogo>) => void
}

export function AjustesDoJogo({ open, onClose, prefs, onMudar }: AjustesDoJogoProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajustes do jogo"
      description="Nada aqui esconde informação. Só decide quanto jogo você quer por cima dela."
    >
      <div className="divide-y divide-border pb-2">
        <div className="pb-2">
          <Switch
            checked={prefs.ligado}
            onChange={(v) => onMudar({ ligado: v })}
            label="Pontos, troféus e carris"
            description="Desligado, o Placar vira um resumo da semana: os mesmos números, sem jogo em cima. Agenda, lembretes e carteira seguem iguais."
          />
        </div>

        <div className="py-2">
          <Switch
            checked={prefs.celebracoes}
            onChange={(v) => onMudar({ celebracoes: v })}
            disabled={!prefs.ligado}
            label="Celebrações"
            description="Confete e vibração quando um troféu é seu. Você baixa o volume das suas; as dos outros seguem."
          />
        </div>

        <div className="py-2">
          <Switch
            checked={prefs.carrisDoTime}
            onChange={(v) => onMudar({ carrisDoTime: v })}
            disabled={!prefs.ligado}
            label="Ver o time"
            description="As quatro faixas paralelas. Nunca houve posição nem ranking — se preferir, some daqui também."
          />
        </div>

        <div className="pt-2">
          <Switch
            checked={prefs.kudos}
            onChange={(v) => onMudar({ kudos: v })}
            label="Kudos"
            description="Dar e receber reconhecimento do time. Independe do resto do jogo."
          />
        </div>
      </div>

      <p className="mt-3 rounded-card bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-fg-muted">
        As comissões ficam fora do jogo, sempre. Os pontos dão status e escolha, nunca dinheiro.
      </p>
    </Sheet>
  )
}
