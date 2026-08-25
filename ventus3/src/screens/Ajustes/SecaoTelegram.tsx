// src/screens/Ajustes/SecaoTelegram.tsx
// TELEGRAM — vinculación por código de 6 dígitos, nunca por @username.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EL @USERNAME NO ES UNA OPCIÓN
// ══════════════════════════════════════════════════════════════════════════
// El bot del v2 identifica al vendedor por su @username de Telegram. Un
// username de Telegram se libera en cuanto su dueño lo cambia, y el siguiente
// que lo tome hereda la identidad: la cartera entera de esa persona, sus
// oportunidades, su capacidad de registrar y de avanzar etapas. No es un
// riesgo teórico, es cómo funciona Telegram.
//
// El código de 6 dígitos invierte la prueba: lo emite el servidor para una
// sesión YA AUTENTICADA, vale 10 minutos, se usa una sola vez y se quema a los
// 5 intentos. La app no lo inventa —si lo inventara, cualquiera podría teclear
// seis dígitos en el bot— y la tabla `pairing_codes` le está revocada al rol
// del cliente a propósito.

import { useEffect, useState } from 'react'
import { Check, MessageCircle, RefreshCw, Send } from 'lucide-react'
import {
  ErroDePareamento,
  TTL_DO_CODIGO_MS,
  lerCodigoVivo,
  useEstadoDoTelegram,
  useGerarCodigoDePareamento,
  type CodigoDePareamento,
} from '@/data'
import { Button, Card, Chip, Skeleton, toast } from '@/ui'
import { Secao } from './Secao'

export function SecaoTelegram({ vendorId }: { vendorId: number | null }) {
  const estado = useEstadoDoTelegram(vendorId)
  const gerar = useGerarCodigoDePareamento()
  const [codigo, setCodigo] = useState<CodigoDePareamento | null>(null)
  const [restante, setRestante] = useState(0)

  // Un código emitido hace 3 minutos sigue sirviendo: al volver a la pantalla
  // se recupera en vez de quemar otro.
  useEffect(() => {
    if (vendorId === null) return
    let vivo = true
    void lerCodigoVivo(vendorId).then((c) => {
      if (vivo && c) setCodigo(c)
    })
    return () => {
      vivo = false
    }
  }, [vendorId])

  // Cuenta regresiva. Un código sin reloj a la vista se teclea vencido.
  useEffect(() => {
    if (!codigo) return
    const tick = () => {
      const ms = Date.parse(codigo.expiraEm) - Date.now()
      setRestante(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0) setCodigo(null)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [codigo])

  if (estado.isPending) {
    return (
      <Secao titulo="Telegram" proposito="O Ventus no seu bolso, sem abrir o app.">
        <Skeleton variant="lista" count={2} />
      </Secao>
    )
  }

  const dados = estado.data

  if (dados && !dados.disponivel) {
    return (
      <Secao titulo="Telegram" icone={<MessageCircle size={14} aria-hidden />}>
        <p className="text-sm leading-snug text-fg-muted">
          A vinculação por código ainda não está ligada no servidor. Enquanto isso o bot
          continua funcionando como hoje — o que muda depois é só quem ele acredita que você é.
        </p>
      </Secao>
    )
  }

  if (dados?.vinculado) {
    return (
      <Secao
        titulo="Telegram"
        icone={<MessageCircle size={14} aria-hidden />}
        proposito="Registrar e receber avisos sem abrir o app."
      >
        <div className="flex items-start gap-3">
          <Check size={20} aria-hidden className="mt-0.5 shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="font-semibold">Telegram conectado.</p>
            <p className="mt-0.5 text-sm leading-snug text-fg-muted">
              Você pode mandar <code className="rounded bg-surface-2 px-1">/hoje</code> ou{' '}
              <code className="rounded bg-surface-2 px-1">/golden</code> para o bot, e registrar
              por áudio direto de lá.
            </p>
            {dados.ultimoUsoEm && (
              <p className="mt-2 text-xs text-fg-subtle">
                Último uso: {new Date(dados.ultimoUsoEm).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={16} aria-hidden />}
            loading={gerar.isPending}
            onClick={() => pedirCodigo(vendorId, gerar, setCodigo)}
          >
            Vincular outro aparelho
          </Button>
        </div>

        {codigo && <CartaoDoCodigo codigo={codigo} restante={restante} />}
      </Secao>
    )
  }

  return (
    <Secao
      titulo="Telegram"
      icone={<MessageCircle size={14} aria-hidden />}
      proposito="Registrar e receber avisos sem abrir o app."
    >
      <p className="text-sm leading-snug text-fg-muted">
        Gere um código de 6 dígitos aqui e mande esse código para o bot. É o próprio servidor
        que emite o código — por isso ninguém consegue se passar por você trocando de
        @username.
      </p>

      <div className="mt-4">
        <Button
          variant="primary"
          block
          icon={<Send size={18} aria-hidden />}
          loading={gerar.isPending}
          onClick={() => pedirCodigo(vendorId, gerar, setCodigo)}
        >
          Gerar código de vinculação
        </Button>
      </div>

      {codigo && <CartaoDoCodigo codigo={codigo} restante={restante} />}
    </Secao>
  )
}

function pedirCodigo(
  vendorId: number | null,
  gerar: ReturnType<typeof useGerarCodigoDePareamento>,
  setCodigo: (c: CodigoDePareamento) => void,
): void {
  if (vendorId === null) {
    toast({
      message: 'Esta sessão ainda não está ligada a um vendedor. Avise o Jordi.',
      tone: 'atencao',
    })
    return
  }
  gerar.mutate(vendorId, {
    onSuccess: (c) => setCodigo(c),
    onError: (e) => {
      toast({
        message:
          e instanceof ErroDePareamento
            ? e.message
            : 'Não deu para gerar o código agora. Tente de novo.',
        tone: 'perigo',
      })
    },
  })
}

function CartaoDoCodigo({
  codigo,
  restante,
}: {
  codigo: CodigoDePareamento
  restante: number
}) {
  const minutos = Math.floor(restante / 60)
  const segundos = restante % 60
  const total = Math.max(1, TTL_DO_CODIGO_MS / 1000)
  const fracao = Math.min(1, restante / total)

  return (
    <Card padding="md" accent="marca" className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Mande este código para o bot
      </p>
      {/* Dos grupos de tres: seis dígitos corridos se teclean mal. */}
      <p
        className="tnum mt-2 text-center text-4xl font-bold tracking-[0.2em] text-fg"
        aria-label={`Código ${codigo.codigo.split('').join(' ')}`}
      >
        {codigo.codigo.slice(0, 3)} {codigo.codigo.slice(3)}
      </p>

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-1000 ease-linear"
            style={{ width: `${fracao * 100}%` }}
          />
        </div>
        <p className="mt-1.5 text-center text-xs text-fg-muted" aria-live="off">
          {restante > 0
            ? `Vale por mais ${minutos}:${String(segundos).padStart(2, '0')}`
            : 'Este código venceu. Gere outro.'}
        </p>
      </div>

      <ol className="mt-4 flex flex-col gap-2 text-sm leading-snug text-fg-muted">
        <li>1. Abra a conversa com o bot do Ventus no Telegram.</li>
        <li>
          2. Mande <code className="rounded bg-surface-2 px-1">/vincular {codigo.codigo}</code>.
        </li>
        <li>3. O bot confirma na hora. Se der erro, gere outro código aqui.</li>
      </ol>

      <p className="mt-3 flex items-center gap-2 text-xs text-fg-subtle">
        <Chip tone="atencao" size="sm">
          Uso único
        </Chip>
        Não mande este código em grupo. Vale para uma vinculação só.
      </p>
    </Card>
  )
}
