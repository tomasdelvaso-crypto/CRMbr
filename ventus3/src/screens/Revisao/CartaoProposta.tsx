// src/screens/Revisao/CartaoProposta.tsx
// Una propuesta del Ventus, con su decisión POR CAMPO.
//
// Estado inicial: todos los campos aceptados. Es la apuesta de diseño de la
// pantalla — el objetivo es llegar a cero todos los días, así que el camino
// barato tiene que ser el de aceptar, y rechazar un campo cuesta un tap.
//
// Gestos: → aceitar lo marcado, ← abrir el sheet de motivo. El colapso lo
// maneja el padre (ver Colapsavel), no SwipeRow: descartar abre un sheet y una
// tarjeta ya plegada no se puede desplegar si el vendedor se arrepiente.

import { useMemo, useState } from 'react'
import { Check, Clock3, Trash2 } from 'lucide-react'
import type { RevisaoItem } from '@/core'
import { horasParaExpirar, textoDeExpiracao } from '@/data'
import { Button, Card, Chip, SwipeRow, cx } from '@/ui'
import { LinhaCampo } from './LinhaCampo'
import { SheetEditarCampo } from './SheetEditarCampo'

/** Rótulo del tipo de propuesta, arriba de todo. */
const TIPO_LABELS: Readonly<Record<RevisaoItem['tipo'], string>> = {
  criar_task: 'Nova tarefa',
  atualizar_escala: 'Mover escala',
  avancar_etapa: 'Avançar etapa',
  registrar_touchpoint: 'Registrar toque',
  registrar_atividade: 'Registrar atividade',
  converter_lead: 'Converter lead',
  promover_do_sweep: 'Virar lead',
  arquivar_lead: 'Arquivar lead',
}

export interface DecisaoProposta {
  camposAceitos: string[]
  edicoes: Record<string, unknown>
}

export interface CartaoPropostaProps {
  item: RevisaoItem
  /** La tarjeta está esperando a que el outbox la resuelva. */
  ocupado: boolean
  onAceitar: (decisao: DecisaoProposta) => void
  onDescartar: () => void
  /** Abrir la ficha del cliente para decidir con contexto. */
  onAbrirCliente?: () => void
}

export function CartaoProposta({
  item,
  ocupado,
  onAceitar,
  onDescartar,
  onAbrirCliente,
}: CartaoPropostaProps) {
  const [recusados, setRecusados] = useState<ReadonlySet<string>>(new Set())
  const [edicoes, setEdicoes] = useState<Record<string, unknown>>({})
  const [editando, setEditando] = useState<string | null>(null)

  const horas = horasParaExpirar(item.expira_em)
  const vencida = horas <= 0
  const urgente = horas > 0 && horas < 6

  const aceitos = useMemo(
    () => item.campos.map((c) => c.field).filter((f) => !recusados.has(f)),
    [item.campos, recusados],
  )

  const alternar = (field: string) => {
    setRecusados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(field)) proximo.delete(field)
      else proximo.add(field)
      return proximo
    })
  }

  const confirmar = () => {
    if (aceitos.length === 0) {
      onDescartar()
      return
    }
    onAceitar({ camposAceitos: aceitos, edicoes })
  }

  const campoEmEdicao = editando === null ? null : item.campos.find((c) => c.field === editando)

  const corpo = (
    <Card padding="md" accent={vencida ? 'neutro' : urgente ? 'atencao' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">
            {TIPO_LABELS[item.tipo]}
          </div>
          <button
            type="button"
            onClick={onAbrirCliente}
            disabled={!onAbrirCliente}
            className="mt-0.5 block max-w-full truncate text-left text-base font-semibold tracking-tight text-fg disabled:cursor-default"
          >
            {item.entidade.nome}
          </button>
          {item.entidade.cliente !== item.entidade.nome && (
            <div className="truncate text-sm text-fg-muted">{item.entidade.cliente}</div>
          )}
        </div>

        {/* Los ítems expiran a las 48 h y la tarjeta lo dice. Sin esto el
            vendedor descubre el vencimiento cuando la RPC lo rechaza. */}
        <Chip
          size="sm"
          tone={vencida ? 'perigo' : urgente ? 'atencao' : 'neutro'}
          icon={<Clock3 size={13} aria-hidden />}
        >
          {textoDeExpiracao(item.expira_em)}
        </Chip>
      </div>

      <p className="mt-2 text-sm leading-snug text-fg-muted">{item.motivo}</p>

      <ul className="mt-3 space-y-2">
        {item.campos.map((campo) => (
          <LinhaCampo
            key={campo.field}
            campo={campo}
            valorFinal={
              Object.prototype.hasOwnProperty.call(edicoes, campo.field)
                ? edicoes[campo.field]
                : campo.newValue
            }
            aceito={!recusados.has(campo.field)}
            travado={vencida || ocupado}
            onAlternar={() => {
              alternar(campo.field)
            }}
            onEditar={() => {
              setEditando(campo.field)
            }}
          />
        ))}
      </ul>

      {vencida ? (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-fg-muted">
          Esta proposta expirou. Peça ao Ventus uma nova sobre o estado atual —
          confirmar agora usaria dados de dois dias atrás.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            block
            variant="success"
            loading={ocupado}
            icon={<Check size={18} aria-hidden />}
            onClick={confirmar}
          >
            {aceitos.length === item.campos.length
              ? 'Aceitar'
              : aceitos.length === 0
                ? 'Descartar tudo'
                : `Aceitar ${String(aceitos.length)} de ${String(item.campos.length)}`}
          </Button>
          <Button
            variant="secondary"
            aria-label="Descartar proposta"
            disabled={ocupado}
            onClick={onDescartar}
            className={cx('shrink-0 px-3')}
          >
            <Trash2 size={18} aria-hidden />
          </Button>
        </div>
      )}
    </Card>
  )

  return (
    <>
      <SwipeRow
        aria-label={`Proposta para ${item.entidade.nome}`}
        rightLabel="Aceitar"
        leftLabel="Descartar"
        rightIcon={<Check size={20} aria-hidden />}
        leftIcon={<Trash2 size={20} aria-hidden />}
        collapseOnAction={false}
        undoMs={0}
        {...(vencida || ocupado ? {} : { onSwipeRight: confirmar, onSwipeLeft: onDescartar })}
      >
        {corpo}
      </SwipeRow>

      <SheetEditarCampo
        open={editando !== null}
        field={editando}
        valorAtual={campoEmEdicao?.oldValue ?? null}
        valorProposto={
          campoEmEdicao && Object.prototype.hasOwnProperty.call(edicoes, campoEmEdicao.field)
            ? edicoes[campoEmEdicao.field]
            : (campoEmEdicao?.newValue ?? null)
        }
        onClose={() => {
          setEditando(null)
        }}
        onSalvar={(valor) => {
          if (editando === null) return
          setEdicoes((atual) => ({ ...atual, [editando]: valor }))
          // Editar un campo lo vuelve a aceptar: nadie edita para descartar.
          setRecusados((atual) => {
            if (!atual.has(editando)) return atual
            const proximo = new Set(atual)
            proximo.delete(editando)
            return proximo
          })
          setEditando(null)
        }}
      />
    </>
  )
}
