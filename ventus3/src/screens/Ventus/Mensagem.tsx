// src/screens/Ventus/Mensagem.tsx
// Una burbuja del chat.
//
// El texto llega en streaming, así que la burbuja tiene que verse bien VACÍA:
// mientras no hay un solo token, muestra el cursor. Sin eso el vendedor ve un
// hueco blanco y cree que la app se colgó — que es exactamente lo que pasa hoy
// en el v2 con los 504 silenciosos.

import { CloudOff, Zap } from 'lucide-react'
import { Chip, cx } from '@/ui'
import { PreviewAcao } from './PreviewAcao'
import { Feedback } from './Feedback'
import type { FeedbackMotivo, FeedbackVoto, VentusPreview } from './contrato'
import type { Mensagem as MensagemDados } from './historico'

export interface MensagemProps {
  mensagem: MensagemDados
  /** Decisiones ya tomadas sobre los previews de ESTE turno. */
  decisoes: Readonly<Record<string, 'aceito' | 'recusado'>>
  previewOcupado: string | null
  onConfirmarPreview: (preview: VentusPreview) => void
  onRecusarPreview: (preview: VentusPreview) => void
  onVotar: (voto: FeedbackVoto, motivo: FeedbackMotivo | null) => void
  onAtalho: (atalho: { rotulo: string; opportunityId?: number; rota?: string }) => void
}

/** Clave estable de un preview: el actionId, o la tool si es de solo lectura. */
function chaveDoPreview(p: VentusPreview, i: number): string {
  return p.actionId ?? `${p.tool}:${String(i)}`
}

export function Mensagem({
  mensagem,
  decisoes,
  previewOcupado,
  onConfirmarPreview,
  onRecusarPreview,
  onVotar,
  onAtalho,
}: MensagemProps) {
  const doVendedor = mensagem.papel === 'vendedor'
  const vazioEmStream = mensagem.streaming === true && mensagem.texto === ''

  return (
    <li className={cx('flex flex-col', doVendedor ? 'items-end' : 'items-start')}>
      <div
        className={cx(
          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-base leading-relaxed',
          doVendedor
            ? 'rounded-br-md bg-brand text-brand-fg'
            : 'rounded-bl-md bg-surface-2 text-fg',
          mensagem.erro != null && 'bg-danger-soft text-danger-soft-fg',
        )}
      >
        {vazioEmStream ? (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span className="sr-only">O Ventus está respondendo…</span>
            <Ponto atraso={0} />
            <Ponto atraso={140} />
            <Ponto atraso={280} />
          </span>
        ) : (
          <p className="whitespace-pre-wrap">
            {mensagem.texto}
            {mensagem.streaming === true && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom motion-reduce:animate-none"
              />
            )}
          </p>
        )}
      </div>

      {/* Marcas de procedencia. El vendedor tiene derecho a saber si la
          respuesta salió del motor o del modelo. */}
      {!doVendedor && (mensagem.local === true || mensagem.offline === true) && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {mensagem.offline === true ? (
            <Chip size="sm" tone="atencao" icon={<CloudOff size={12} aria-hidden />}>
              Sem conexão · resposta local
            </Chip>
          ) : (
            <Chip size="sm" tone="ok" icon={<Zap size={12} aria-hidden />}>
              Resposta instantânea
            </Chip>
          )}
        </div>
      )}

      {mensagem.atalhos && mensagem.atalhos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {mensagem.atalhos.map((a) => (
            <Chip
              key={`${a.rotulo}:${String(a.opportunityId ?? a.rota ?? '')}`}
              size="sm"
              tone="marca"
              onClick={() => {
                onAtalho(a)
              }}
            >
              {a.rotulo}
            </Chip>
          ))}
        </div>
      )}

      {mensagem.previews && mensagem.previews.length > 0 && (
        <div className="w-full max-w-[92%]">
          {mensagem.previews.map((p, i) => {
            const chave = chaveDoPreview(p, i)
            return (
              <PreviewAcao
                key={chave}
                preview={p}
                decidido={decisoes[chave] ?? null}
                ocupado={previewOcupado === chave}
                onConfirmar={() => {
                  onConfirmarPreview(p)
                }}
                onRecusar={() => {
                  onRecusarPreview(p)
                }}
              />
            )
          })}
        </div>
      )}

      {!doVendedor && mensagem.streaming !== true && mensagem.erro == null && (
        <Feedback voto={mensagem.voto ?? null} onVotar={onVotar} />
      )}
    </li>
  )
}

/** Los tres puntitos del «pensando». Solo opacity: barato de animar. */
function Ponto({ atraso }: { atraso: number }) {
  return (
    <span
      aria-hidden
      className="inline-block size-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
      style={{ animationDelay: `${String(atraso)}ms` }}
    />
  )
}
