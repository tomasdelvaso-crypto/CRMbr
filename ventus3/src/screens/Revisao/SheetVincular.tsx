// src/screens/Revisao/SheetVincular.tsx
// [Vincular a…] — el destino de un registro que el bot no supo atribuir.
//
// Busca sobre la cartera YA cacheada en Dexie (useAlvosDeRegistro), así que
// funciona sin señal: es exactamente el caso del vendedor que dictó un audio
// en la planta y lo revisa en el estacionamiento.

import { useMemo, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { filtrarAlvos, useAlvosDeRegistro, type AlvoRegistro } from '@/data'
import { Chip, EmptyState, Sheet, Skeleton, TextField, cx, formatBrlCompacto } from '@/ui'

export interface SheetVincularProps {
  open: boolean
  vendor: string | null
  /** Texto del registro suelto, para no perder el contexto al elegir. */
  trecho: string
  onClose: () => void
  onEscolher: (alvo: AlvoRegistro) => void
}

export function SheetVincular({
  open,
  vendor,
  trecho,
  onClose,
  onEscolher,
}: SheetVincularProps) {
  const [termo, setTermo] = useState('')
  const consulta = useAlvosDeRegistro(vendor)

  const resultados = useMemo(
    () => filtrarAlvos(consulta.data ?? [], termo),
    [consulta.data, termo],
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vincular a…"
      description="O registro fica guardado; só falta dizer de quem é."
      snapPoints={[0.65, 0.94]}
    >
      <div className="space-y-3 pb-2">
        <blockquote className="rounded-lg border-l-2 border-brand/50 bg-surface-2 p-3 text-sm italic leading-snug text-fg-muted">
          {`“${trecho}”`}
        </blockquote>

        <TextField
          label="Buscar cliente"
          hideLabel
          value={termo}
          onChange={setTermo}
          placeholder="Nome da empresa ou do contato"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          action={<Search size={16} aria-hidden className="text-fg-subtle" />}
        />

        {consulta.isPending && <Skeleton variant="lista" count={5} />}

        {!consulta.isPending && resultados.length === 0 && (
          <EmptyState
            icon={<Building2 size={28} aria-hidden />}
            title="Nenhum cliente com esse nome"
            description="Tente parte do nome da empresa, ou o nome do contato."
          />
        )}

        <ul className="divide-y divide-border">
          {resultados.map((alvo) => (
            <li key={`${alvo.kind}:${String(alvo.id)}`}>
              <button
                type="button"
                onClick={() => {
                  onEscolher(alvo)
                }}
                className="flex min-h-touch w-full items-center gap-3 py-3 text-left active:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-medium">{alvo.nome}</div>
                  <div className="truncate text-sm text-fg-muted">{alvo.detalhe}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {alvo.valor !== null && alvo.valor > 0 && (
                    <span className="text-sm tabular-nums text-fg-muted">
                      {formatBrlCompacto(alvo.valor)}
                    </span>
                  )}
                  <Chip
                    size="sm"
                    tone={alvo.diasSemContato > 14 ? 'atencao' : 'neutro'}
                    className={cx('shrink-0')}
                  >
                    {alvo.diasSemContato < 0
                      ? 'Sem contato'
                      : `${String(alvo.diasSemContato)} d`}
                  </Chip>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}
