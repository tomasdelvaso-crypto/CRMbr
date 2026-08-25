// src/screens/Registrar/SeletorDeAlvo.tsx
// Elegir el cliente: los botones de desambiguación y el buscador completo.
//
// La desambiguación va ARRIBA y como botones grandes, no como un <select>.
// Cuando el modelo duda entre dos clientes, la respuesta correcta está a un
// toque; mandar al vendedor a un buscador para resolver una duda binaria es
// cambiar un toque por cuatro.

import { useMemo, useState } from 'react'
import { Building2, Check, Search } from 'lucide-react'
import { filtrarAlvos, type AlvoRegistro } from '@/data'
import { Button, Chip, EmptyState, Sheet, TextField, cx, formatBrlCompacto, haptic } from '@/ui'
import type { CandidatoIngest } from './contrato'

/* ── Botones de desambiguación ─────────────────────────────────────────── */

export interface BotoesDesambiguacaoProps {
  candidatos: readonly CandidatoIngest[]
  alvos: readonly AlvoRegistro[]
  onEscolher: (alvo: AlvoRegistro) => void
  onBuscar: () => void
}

export function BotoesDesambiguacao({
  candidatos,
  alvos,
  onEscolher,
  onBuscar,
}: BotoesDesambiguacaoProps) {
  // Solo se ofrecen candidatos que EXISTEN en la cartera local. Si el servidor
  // devolviera un id que no está, no se pinta: es la última barrera contra un
  // cliente inventado llegando a la pantalla.
  const opcoes = useMemo(
    () =>
      candidatos
        .map((c) => ({
          candidato: c,
          alvo: alvos.find((a) => a.kind === c.kind && a.id === c.id) ?? null,
        }))
        .filter((o): o is { candidato: CandidatoIngest; alvo: AlvoRegistro } => o.alvo !== null),
    [candidatos, alvos],
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg-muted">
        {opcoes.length > 0 ? 'Foi com qual cliente?' : 'Não reconheci o cliente.'}
      </p>
      {opcoes.map(({ candidato, alvo }) => (
        <button
          key={`${alvo.kind}-${String(alvo.id)}`}
          type="button"
          onClick={() => {
            haptic('selection')
            onEscolher(alvo)
          }}
          className={cx(
            'flex min-h-touch-lg w-full items-center gap-3 rounded-lg border border-border',
            'bg-surface px-3 py-2.5 text-left tap-highlight-none',
            'transition-transform duration-150 ease-ios active:scale-[0.98]',
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
            <Building2 size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{alvo.nome}</span>
            <span className="block truncate text-xs text-fg-muted">{candidato.motivo}</span>
          </span>
          <span className="tnum shrink-0 text-xs font-semibold text-fg-subtle">
            {Math.round(candidato.confianca * 100)}%
          </span>
        </button>
      ))}
      <Button variant="secondary" block icon={<Search size={18} aria-hidden />} onClick={onBuscar}>
        {opcoes.length > 0 ? 'É outro cliente' : 'Buscar na carteira'}
      </Button>
    </div>
  )
}

/* ── Buscador completo ─────────────────────────────────────────────────── */

export interface SeletorDeAlvoProps {
  open: boolean
  onClose: () => void
  alvos: readonly AlvoRegistro[]
  selecionado: AlvoRegistro | null
  onEscolher: (alvo: AlvoRegistro) => void
  carregando?: boolean
}

export function SeletorDeAlvo({
  open,
  onClose,
  alvos,
  selecionado,
  onEscolher,
  carregando = false,
}: SeletorDeAlvoProps) {
  const [termo, setTermo] = useState('')
  const resultados = useMemo(() => filtrarAlvos(alvos, termo), [alvos, termo])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cliente"
      description="Oportunidades e leads da sua carteira."
      snapPoints={[0.6, 0.92]}
      initialSnap={1}
    >
      <div className="flex flex-col gap-3 pb-2">
        <TextField
          label="Buscar cliente"
          hideLabel
          value={termo}
          onChange={setTermo}
          placeholder="Nome da empresa ou do contato"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus
        />

        {carregando && (
          <p className="py-6 text-center text-sm text-fg-muted">Carregando sua carteira…</p>
        )}

        {!carregando && resultados.length === 0 && (
          <EmptyState
            icon={<Search size={28} aria-hidden />}
            title="Nada com esse nome"
            description="Tente pelo nome da empresa. Se o cliente ainda não existe, crie a oportunidade na Carteira e volte."
            actionLabel="Limpar busca"
            onAction={() => {
              setTermo('')
            }}
          />
        )}

        <ul className="flex flex-col gap-1.5">
          {resultados.map((alvo) => {
            const ativo = selecionado?.kind === alvo.kind && selecionado.id === alvo.id
            return (
              <li key={`${alvo.kind}-${String(alvo.id)}`}>
                <button
                  type="button"
                  onClick={() => {
                    haptic('selection')
                    onEscolher(alvo)
                    onClose()
                  }}
                  className={cx(
                    'flex min-h-touch-lg w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                    'tap-highlight-none transition-colors',
                    ativo ? 'bg-brand-soft text-brand-soft-fg' : 'bg-surface-2 text-fg',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{alvo.nome}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                      <Chip size="sm" tone={alvo.kind === 'lead' ? 'info' : 'neutro'}>
                        {alvo.detalhe}
                      </Chip>
                      {alvo.valor !== null && (
                        <span className="tnum">{formatBrlCompacto(alvo.valor)}</span>
                      )}
                      <span className="tnum">
                        {alvo.diasSemContato < 0
                          ? 'sem contato'
                          : `${String(alvo.diasSemContato)}d`}
                      </span>
                    </span>
                  </span>
                  {ativo && <Check size={20} aria-hidden className="shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Sheet>
  )
}
