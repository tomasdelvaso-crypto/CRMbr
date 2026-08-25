// src/push/BlocoDePush.tsx
// El bloque de Ajustes → Avisos que registra ESTE aparato para Web Push.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTE COMPONENTE
// ══════════════════════════════════════════════════════════════════════════
//
// 1. TODO SALE DE UN TAP. `assinarPush()` se llama en el handler del botón y
//    en ningún otro lado. En un `useEffect`, iOS rechaza el permiso en
//    silencio y lo quema PARA SIEMPRE. El único efecto de este archivo lee si
//    el aparato ya está suscrito, que no pide permiso ni abre diálogos.
//
// 2. SE DICE LA VERDAD DE ESTE APARATO, NO UNA PROMESA. `soporteDeNotificacoes()`
//    devuelve qué puede este teléfono de verdad, y el bloque muestra eso:
//    en un iPhone sin instalar dice que falta instalar, y NO muestra un botón
//    que resolvería 'denied' sin diálogo. El equipo tiene Android e iPhone
//    mezclados; una pantalla que trata los dos igual miente en la mitad de los
//    casos.
//
// 3. NUNCA SE PROMETE EXCLUSIVIDAD. Todos los mensajes recuerdan que el
//    Telegram entrega igual. En iOS el push es la red de seguridad, no el
//    canal principal — y decirlo evita que alguien apague el Telegram creyendo
//    que ya tiene avisos.

import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, Check, Loader2, Smartphone, Vibrate, WifiOff } from 'lucide-react'
import { Button, Chip, toast } from '@/ui'
import { assinarPush, cancelarPush, estaAssinado } from './assinatura'
import { badgeDisponivel } from './badge'
import { soporteDeNotificacoes, type SuporteDeAvisos } from './soporte'

type Estado = 'lendo' | 'ligado' | 'desligado' | 'trabalhando'

export function BlocoDePush() {
  const [suporte, setSuporte] = useState<SuporteDeAvisos>(soporteDeNotificacoes)
  const [estado, setEstado] = useState<Estado>('lendo')

  // Lectura pasiva: NO pide permiso, solo pregunta si ya hay suscripción.
  useEffect(() => {
    let vivo = true
    void estaAssinado().then((assinado) => {
      if (vivo) setEstado(assinado ? 'ligado' : 'desligado')
    })
    return () => {
      vivo = false
    }
  }, [])

  const ligar = useCallback(async () => {
    setEstado('trabalhando')
    const resultado = await assinarPush()
    setSuporte(soporteDeNotificacoes())
    if (resultado.ok) {
      setEstado('ligado')
      toast({
        message: resultado.jaExistia
          ? 'Este aparelho já estava registrado. Confirmado.'
          : 'Pronto. Os avisos chegam neste aparelho.',
        tone: 'ok',
      })
      return
    }
    setEstado('desligado')
    toast({ message: resultado.mensagem, tone: resultado.motivo === 'sem_rede' ? 'neutro' : 'atencao' })
  }, [])

  const desligar = useCallback(async () => {
    setEstado('trabalhando')
    await cancelarPush()
    setSuporte(soporteDeNotificacoes())
    setEstado('desligado')
    toast({
      message: 'Este aparelho não recebe mais push. O Telegram continua entregando.',
      tone: 'neutro',
    })
  }, [])

  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Push neste aparelho</p>
          <p className="mt-1 text-xs leading-snug text-fg-muted">{suporte.resumo}</p>
        </div>
        <Selo estado={estado} />
      </div>

      <Capacidades suporte={suporte} />

      <div className="mt-3">
        <Acao estado={estado} suporte={suporte} aoLigar={ligar} aoDesligar={desligar} />
      </div>
    </div>
  )
}

function Selo({ estado }: { estado: Estado }) {
  if (estado === 'ligado') {
    return (
      <Chip tone="ok" size="sm">
        Registrado
      </Chip>
    )
  }
  if (estado === 'trabalhando') {
    return (
      <Chip tone="neutro" size="sm">
        Registrando…
      </Chip>
    )
  }
  return (
    <Chip tone="neutro" size="sm">
      Não registrado
    </Chip>
  )
}

/**
 * Qué puede este aparato. No es decoración: la diferencia entre un Android y
 * un iPhone del mismo equipo decide qué canal es el principal para cada uno,
 * y el vendedor tiene derecho a ver por qué su teléfono se comporta distinto.
 */
function Capacidades({ suporte }: { suporte: SuporteDeAvisos }) {
  const linhas: Array<{ ok: boolean; texto: string; icone: React.ReactNode }> = [
    {
      ok: suporte.push && !suporte.precisaInstalar,
      texto: suporte.precisaInstalar
        ? 'Push: só depois de instalar na tela de início'
        : suporte.push
          ? 'Push: disponível'
          : 'Push: este navegador não tem',
      icone: <BellRing size={13} aria-hidden />,
    },
    {
      ok: badgeDisponivel() && suporte.instalado,
      texto: badgeDisponivel()
        ? suporte.instalado
          ? 'Contador no ícone: sim'
          : 'Contador no ícone: só com o app instalado'
        : 'Contador no ícone: este aparelho não tem',
      icone: <Smartphone size={13} aria-hidden />,
    },
    {
      ok: suporte.backgroundSync,
      texto: suporte.backgroundSync
        ? 'Envia o que ficou pendente sozinho, em segundo plano'
        : 'Sem envio em segundo plano: o pendente sobe quando você abrir o app',
      icone: <WifiOff size={13} aria-hidden />,
    },
  ]

  return (
    <ul className="mt-3 flex flex-col gap-1">
      {linhas.map((linha) => (
        <li
          key={linha.texto}
          className={`flex items-center gap-2 text-xs ${linha.ok ? 'text-fg-muted' : 'text-fg-subtle'}`}
        >
          <span className={linha.ok ? 'text-ok' : 'text-fg-subtle'}>{linha.icone}</span>
          {linha.texto}
        </li>
      ))}
    </ul>
  )
}

function Acao({
  estado,
  suporte,
  aoLigar,
  aoDesligar,
}: {
  estado: Estado
  suporte: SuporteDeAvisos
  aoLigar: () => void | Promise<void>
  aoDesligar: () => void | Promise<void>
}) {
  if (estado === 'lendo') {
    return <p className="text-xs text-fg-subtle">Verificando este aparelho…</p>
  }

  if (estado === 'trabalhando') {
    return (
      <Button variant="secondary" size="sm" disabled icon={<Loader2 size={16} aria-hidden />}>
        Registrando…
      </Button>
    )
  }

  if (estado === 'ligado') {
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={<BellOff size={16} aria-hidden />}
        onClick={() => void aoDesligar()}
      >
        Desligar neste aparelho
      </Button>
    )
  }

  // Desligado. Solo se ofrece el botón cuando el aparato PUEDE hacerlo hoy.
  if (suporte.precisaInstalar) {
    return (
      <p className="flex items-center gap-2 text-xs leading-snug text-fg-muted">
        <Smartphone size={14} aria-hidden className="shrink-0 text-info" />
        Instale o app pela tela de início primeiro — em Ajustes → Aparelho tem o passo a passo.
      </p>
    )
  }
  if (!suporte.push || !suporte.serviceWorker || suporte.permissao === 'negada') {
    return (
      <p className="flex items-center gap-2 text-xs leading-snug text-fg-muted">
        <Vibrate size={14} aria-hidden className="shrink-0 text-fg-subtle" />
        Nada a fazer aqui neste aparelho. O Telegram entrega tudo igual.
      </p>
    )
  }

  return (
    <>
      {/* Tap explícito, sempre. Ver a decisão 1 do cabeçalho. */}
      <Button
        variant="primary"
        size="sm"
        icon={<Check size={16} aria-hidden />}
        onClick={() => void aoLigar()}
      >
        Registrar este aparelho
      </Button>
      <p className="mt-2 text-xs leading-snug text-fg-subtle">
        Vale só para este celular. Se você usa o Ventus em dois aparelhos, registre nos dois.
      </p>
    </>
  )
}
