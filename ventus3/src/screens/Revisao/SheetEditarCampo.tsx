// src/screens/Revisao/SheetEditarCampo.tsx
// Editar UN campo antes de aceptarlo.
//
// El «Edit» del Accept/Edit/Dismiss por campo. El valor editado reemplaza al
// propuesto en el payload que se manda a ventus_commit_action; los campos que
// el vendedor no tocó viajan tal como el Ventus los propuso.

import { useState } from 'react'
import { rotuloDoCampo, valorLegivel } from '@/data'
import { Button, DatePills, Sheet, Stepper, TextArea, TextField } from '@/ui'
import type { IsoDate } from '@/core'

export interface SheetEditarCampoProps {
  open: boolean
  field: string | null
  valorAtual: unknown
  valorProposto: unknown
  onClose: () => void
  onSalvar: (valor: unknown) => void
}

/** Campos que se editan con calendario, no con teclado. */
const CAMPOS_DATA = new Set(['due_date', 'next_action_date'])
/** Campos largos: el rascunho de mensagem se lee mejor en un textarea. */
const CAMPOS_LONGOS = new Set(['draft_content', 'notas', 'descricao', 'override_motivo'])

export function SheetEditarCampo({
  open,
  field,
  valorAtual,
  valorProposto,
  onClose,
  onSalvar,
}: SheetEditarCampoProps) {
  if (field === null) return null
  // `key={field}` remonta el formulario al cambiar de campo. Es la forma
  // barata de resetear el valor sin un efecto que pise el estado: sin esto,
  // abrir el sheet sobre otro campo mostraba el valor del anterior — el bug
  // clásico de reusar un sheet para N campos.
  return (
    <FormularioCampo
      key={field}
      open={open}
      field={field}
      valorAtual={valorAtual}
      valorProposto={valorProposto}
      onClose={onClose}
      onSalvar={onSalvar}
    />
  )
}

function FormularioCampo({
  open,
  field,
  valorAtual,
  valorProposto,
  onClose,
  onSalvar,
}: SheetEditarCampoProps & { field: string }) {
  const ehEscalaInicial = field.startsWith('scales.')
  const [texto, setTexto] = useState(() =>
    ehEscalaInicial || valorProposto === null || valorProposto === undefined
      ? ''
      : String(valorProposto),
  )
  const [numero, setNumero] = useState(() =>
    typeof valorProposto === 'number' ? valorProposto : 0,
  )

  const ehData = CAMPOS_DATA.has(field)
  const ehEscala = field.startsWith('scales.')
  const ehLongo = CAMPOS_LONGOS.has(field)
  const rotulo = rotuloDoCampo(field)

  const salvar = () => {
    onSalvar(ehEscala ? numero : texto.trim())
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Editar ${rotulo}`}
      description={`Hoje: ${valorLegivel(field, valorAtual)} · O Ventus propôs: ${valorLegivel(field, valorProposto)}`}
      footer={
        <Button block onClick={salvar}>
          Usar este valor
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {ehEscala && (
          <Stepper
            label={rotulo}
            value={numero}
            onChange={setNumero}
            min={0}
            max={10}
          />
        )}

        {ehData && (
          <DatePills
            value={texto === '' ? null : (texto as IsoDate)}
            onChange={(iso) => {
              setTexto(iso)
            }}
            label={rotulo}
          />
        )}

        {!ehEscala && !ehData && ehLongo && (
          <TextArea
            label={rotulo}
            value={texto}
            onChange={setTexto}
            rows={5}
          />
        )}

        {!ehEscala && !ehData && !ehLongo && (
          <TextField label={rotulo} value={texto} onChange={setTexto} enterKeyHint="done" />
        )}
      </div>
    </Sheet>
  )
}
