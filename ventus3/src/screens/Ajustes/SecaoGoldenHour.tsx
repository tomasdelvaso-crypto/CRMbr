// src/screens/Ajustes/SecaoGoldenHour.tsx
// GOLDEN HOUR — la hora se elige una vez y después no se piensa más.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ 16h POR DEFECTO Y POR QUÉ UNA FRASE
// ══════════════════════════════════════════════════════════════════════════
// 16h no salió de una reunión: es la franja en la que el equipo YA prospecta.
// Poner la Golden Hour a las 9h sería inventar un hábito nuevo; ponerla a las
// 16h es ponerle nombre a uno que existe, y eso es lo único que se sostiene
// sin que nadie vigile.
//
// La frase se-então («Se são 16h de terça, eu abro a Golden Hour con la lista
// de la víspera») es una implementation intention: un disparador concreto —
// hora + día + primer gesto— se cumple mucho más que una intención genérica.
// Por eso la frase se muestra siempre y se puede reescribir con palabras
// propias: la frase de otro no dispara nada.

import { useState } from 'react'
import { Timer } from 'lucide-react'
import {
  NOME_DO_DIA,
  fraseSeEntao,
  useConfigGoldenHour,
  useDefinirGoldenHour,
  type ConfigGoldenHour,
} from '@/data'
import { Button, Chip, NumberField, Skeleton, TextArea, cx, toast } from '@/ui'
import { Divisor, Secao } from './Secao'

/** Segunda a domingo, en el orden en que se lee un calendario brasileño. */
const DIAS: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

export function SecaoGoldenHour({ vendorName }: { vendorName: string | null }) {
  const consulta = useConfigGoldenHour(vendorName)
  const definir = useDefinirGoldenHour()
  const [rascunho, setRascunho] = useState<ConfigGoldenHour | null>(null)

  // El borrador se DERIVA en render: `null` = «todavía no tocó nada», así que
  // vale lo guardado. Ver la misma decisión en SecaoCookbook.
  const dados = consulta.data

  if (consulta.isPending || !dados) {
    return (
      <Secao titulo="Golden Hour" proposito="A hora fixa de prospectar.">
        <Skeleton variant="lista" count={2} />
      </Secao>
    )
  }

  const rasc: ConfigGoldenHour = rascunho ?? dados
  const mudou =
    rasc.hora !== dados.hora ||
    rasc.frase !== dados.frase ||
    rasc.dias.join(',') !== dados.dias.join(',')

  const alternarDia = (dia: number): void => {
    const tem = rasc.dias.includes(dia)
    const proximos = tem ? rasc.dias.filter((d) => d !== dia) : [...rasc.dias, dia]
    // Cero días es una Golden Hour que nunca llega: se ignora el último apagón.
    if (proximos.length === 0) return
    setRascunho({ ...rasc, dias: proximos.sort((a, b) => a - b) })
  }

  return (
    <Secao
      titulo="Golden Hour"
      icone={<Timer size={14} aria-hidden />}
      proposito="A hora fixa de prospectar, com a fila preparada na véspera."
    >
      <NumberField
        label="Começa às"
        sufixo="h"
        value={rasc.hora}
        onChange={(v) => setRascunho({ ...rasc, hora: v })}
        min={6}
        max={21}
        hint="O padrão é 16h porque é quando o time já prospecta. Mudar isso é mudar um hábito, não um horário."
      />

      <Divisor />

      <fieldset>
        <legend className="text-sm font-medium text-fg-muted">Em quais dias</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIAS.map((dia) => {
            const ativo = rasc.dias.includes(dia)
            const nome = NOME_DO_DIA[dia] ?? ''
            return (
              <Chip
                key={dia}
                tone={ativo ? 'marca' : 'neutro'}
                selected={ativo}
                onClick={() => alternarDia(dia)}
                className={cx(!ativo && 'opacity-70')}
              >
                {nome.slice(0, 3)}
              </Chip>
            )
          })}
        </div>
        <p className="mt-2 text-xs leading-snug text-fg-muted">
          Segunda a sexta é o padrão. Sábado existe porque alguém pode preferir a manhã do
          sábado a nenhum dia.
        </p>
      </fieldset>

      <Divisor />

      <div>
        <p className="text-sm font-medium text-fg-muted">A sua frase</p>
        <p
          className="mt-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-sm font-medium leading-snug text-brand-soft-fg"
          aria-live="polite"
        >
          {fraseSeEntao(rasc)}
        </p>
        <TextArea
          className="mt-3"
          label="Escrever com as minhas palavras"
          hint="Opcional. Uma frase que você reconheça funciona melhor do que uma frase correta."
          placeholder={fraseSeEntao({ ...rasc, frase: null })}
          rows={2}
          maxLength={160}
          value={rasc.frase ?? ''}
          onChange={(v) => setRascunho({ ...rasc, frase: v === '' ? null : v })}
        />
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
              { vendor: vendorName, ...rasc },
              {
                onSuccess: () => {
                  setRascunho(null)
                  toast({ message: 'Golden Hour combinada.', tone: 'ok' })
                },
              },
            )
          }}
        >
          {mudou ? 'Salvar a Golden Hour' : 'Golden Hour salva'}
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
