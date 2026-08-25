// src/screens/Placar/Kudos.tsx
// Cinco por semana, no acumulables, con texto obligatorio sobre un hecho.
//
// La escasez es el diseño: si sobraran, se repartirían por cortesía y dejarían
// de significar algo. El texto obligatorio también: «bom trabalho» no es un
// kudo, es ruido educado. Y NO dan PA a propósito — cuatro personas que se
// conocen intercambiarían favores en una semana. Dan escudos y cuentan para
// el troféu Companheiro.
//
// Prospectar es solitario y el equipo está disperso: los kudos son lo que
// convierte esa actividad en social.

import { useState } from 'react'
import { Heart, Send } from 'lucide-react'
import { KUDOS_POR_SEMANA, KUDO_TEXTO_MINIMO, type KudosDaSemana } from '@/data'
import { Avatar, Button, Chip, Sheet, TextArea, cx, haptic, toast } from '@/ui'

export interface KudosProps {
  kudos: KudosDaSemana | undefined
  /** Nombres del equipo, ya sin el propio. */
  colegas: string[]
  enviando: boolean
  onEnviar: (para: string, texto: string) => Promise<void>
}

export function Kudos({ kudos, colegas, enviando, onEnviar }: KudosProps) {
  const [aberto, setAberto] = useState(false)
  const [para, setPara] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const restantes = kudos?.restantes ?? KUDOS_POR_SEMANA
  const podeEnviar = para !== null && texto.trim().length >= KUDO_TEXTO_MINIMO && restantes > 0

  const fechar = () => {
    setAberto(false)
    setPara(null)
    setTexto('')
  }

  const enviar = async () => {
    if (para === null) return
    await onEnviar(para, texto.trim())
    haptic('success')
    toast({ message: `Kudo enviado para ${primeiroNome(para)}`, tone: 'destaque' })
    fechar()
  }

  return (
    <section aria-label="Kudos" className="mt-7 px-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-fg">Kudos</h2>
        <span className="tnum text-2xs text-fg-subtle">
          {restantes} de {KUDOS_POR_SEMANA} nesta semana
        </span>
      </div>

      <div className="rounded-card border border-border bg-surface p-4">
        {kudos && kudos.recebidos.length > 0 ? (
          <ul className="mb-3 space-y-2.5">
            {kudos.recebidos.map((k) => (
              <li key={k.id} className="flex gap-2.5">
                <Avatar name={k.de} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-fg">{primeiroNome(k.de)}</span>
                  <p className="text-xs leading-relaxed text-fg-muted">{k.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-xs leading-relaxed text-fg-muted">
            Prospectar é solitário. Um kudo é a forma mais barata de alguém saber que o que fez foi
            visto.
          </p>
        )}

        {kudos && kudos.enviados.length > 0 && (
          <p className="mb-3 text-2xs text-fg-subtle">
            Você já reconheceu{' '}
            {kudos.enviados.map((k) => primeiroNome(k.para)).join(', ')} nesta semana.
          </p>
        )}

        <Button
          variant="secondary"
          block
          icon={<Heart size={16} />}
          disabled={restantes === 0 || colegas.length === 0}
          onClick={() => setAberto(true)}
        >
          {restantes === 0 ? 'Seus 5 já saíram — voltam na segunda' : 'Reconhecer alguém'}
        </Button>
      </div>

      <Sheet
        open={aberto}
        onClose={fechar}
        title="Reconhecer alguém"
        description="Conte o que a pessoa fez. Sem o fato concreto, o kudo não sai."
        footer={
          <Button
            block
            size="lg"
            icon={<Send size={17} />}
            loading={enviando}
            disabled={!podeEnviar}
            onClick={enviar}
          >
            Enviar kudo
          </Button>
        }
      >
        <div className="pb-2">
          <span className="mb-2 block text-xs font-medium text-fg-muted">Para quem</span>
          <div className="mb-4 flex flex-wrap gap-2">
            {colegas.map((nome) => (
              <Chip
                key={nome}
                tone="destaque"
                selected={para === nome}
                onClick={() => {
                  haptic('selection')
                  setPara(nome)
                }}
              >
                {primeiroNome(nome)}
              </Chip>
            ))}
          </div>

          <TextArea
            label="O que aconteceu"
            value={texto}
            onChange={setTexto}
            rows={4}
            maxLength={280}
            placeholder="Passou o contato da Tetra sabendo que era meu cliente e não dele."
            enterKeyHint="done"
            hint={
              texto.trim().length < KUDO_TEXTO_MINIMO
                ? 'Um fato concreto, não “bom trabalho”.'
                : `${texto.trim().length}/280`
            }
          />

          <p className={cx('mt-4 text-2xs leading-relaxed text-fg-subtle')}>
            Kudos não dão pontos — dão escudo para a sequência e contam para o troféu Companheiro.
            São 5 por semana e não acumulam.
          </p>
        </div>
      </Sheet>
    </section>
  )
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}
