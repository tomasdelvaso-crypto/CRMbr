// src/install/ConviteDeInstalacao.tsx
// La invitación a instalar, en el momento que `useConvite` considera decente.
//
// ══════════════════════════════════════════════════════════════════════════
// TRES INVITACIONES DISTINTAS, PORQUE SON TRES COSAS DISTINTAS
// ══════════════════════════════════════════════════════════════════════════
//  · Android: hay diálogo nativo. Un botón, un tap, listo.
//  · iOS + Safari: no hay diálogo. Hay que enseñar el gesto —Compartilhar →
//    Adicionar à Tela de Início— y decir POR QUÉ importa: sin eso el iPhone
//    no entrega ni una notificación, nunca.
//  · iOS fuera de Safari: el gesto ni siquiera está en ese navegador. Pedir
//    «tocá Compartilhar» ahí manda a la persona a buscar un botón que no
//    existe; lo único honesto es decirle que abra Safari.
//
// El sheet se descarta como cualquier otro (arrastre, backdrop, Escape) y
// «Agora não» anota el descarte: a la tercera, la app deja de preguntar.

import { Bell, Download, Plus, Share, Smartphone, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Sheet } from '@/ui'
import type { EstadoDoConvite } from './useConvite'

export function ConviteDeInstalacao(convite: EstadoDoConvite) {
  const { aberto, tipo, instalar, dispensar, fechar } = convite

  if (tipo === 'nenhum') return null

  if (tipo === 'nativo') {
    return (
      <Sheet
        open={aberto}
        onClose={dispensar}
        title="Deixar o Ventus na tela de início"
        description="Abre como app, ocupa a tela toda e continua funcionando sem sinal."
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              block
              icon={<Download size={18} aria-hidden />}
              onClick={() => void instalar()}
            >
              Instalar agora
            </Button>
            <Button variant="ghost" block onClick={dispensar}>
              Agora não
            </Button>
          </div>
        }
      >
        <ListaDeMotivos />
      </Sheet>
    )
  }

  if (tipo === 'ios-safari') {
    return (
      <Sheet
        open={aberto}
        onClose={dispensar}
        title="Adicione o Ventus à Tela de Início"
        description="No iPhone não existe botão de instalar — são dois toques, e valem para sempre."
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" block onClick={fechar}>
              Entendi, vou fazer agora
            </Button>
            <Button variant="ghost" block onClick={dispensar}>
              Agora não
            </Button>
          </div>
        }
      >
        <ol className="flex flex-col gap-3">
          <PassoIOS
            numero={1}
            icone={<Share size={18} aria-hidden />}
            titulo="Toque em Compartilhar"
          >
            É o quadrado com a seta para cima, na barra de baixo do Safari.
          </PassoIOS>
          <PassoIOS
            numero={2}
            icone={<Plus size={18} aria-hidden />}
            titulo="Escolha «Adicionar à Tela de Início»"
          >
            A lista é comprida; essa opção costuma ficar bem embaixo. Depois toque em
            «Adicionar».
          </PassoIOS>
          <PassoIOS
            numero={3}
            icone={<Smartphone size={18} aria-hidden />}
            titulo="Abra sempre pelo ícone novo"
          >
            Aberto assim, o Ventus ocupa a tela inteira e consegue te avisar.
          </PassoIOS>
        </ol>

        <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-sm leading-snug text-info-soft-fg">
          <Bell size={17} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Enquanto o Ventus for uma aba do Safari, o iPhone <strong>não entrega nenhuma
            notificação</strong> — nem da Golden Hour, nem de ação vencida.
          </span>
        </p>

        <p className="mt-3 text-center text-sm">
          <a href="/instalar" className="font-semibold text-brand underline-offset-4 hover:underline">
            Ver o passo a passo com imagens
          </a>
        </p>
      </Sheet>
    )
  }

  // tipo === 'ios-outro-navegador'
  return (
    <Sheet
      open={aberto}
      onClose={dispensar}
      title="Abra o Ventus no Safari"
      description="Só o Safari consegue colocar o Ventus na tela de início do iPhone."
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" block onClick={fechar}>
            Entendi
          </Button>
          <Button variant="ghost" block onClick={dispensar}>
            Agora não
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-snug text-fg-muted">
        Neste navegador a opção «Adicionar à Tela de Início» não existe. Copie o endereço,
        abra o Safari e cole lá — depois é só Compartilhar → Adicionar à Tela de Início.
      </p>
      <ListaDeMotivos />
      <p className="mt-4 text-center text-sm">
        <a href="/instalar" className="font-semibold text-brand underline-offset-4 hover:underline">
          Ver o passo a passo com imagens
        </a>
      </p>
    </Sheet>
  )
}

/** Las tres razones, sin adjetivos: lo que cambia de verdad al instalar. */
function ListaDeMotivos() {
  return (
    <ul className="mt-1 flex flex-col gap-3">
      <Motivo icone={<Bell size={18} aria-hidden />} titulo="Avisos na hora certa">
        A Golden Hour e as ações vencidas te procuram, em vez de você lembrar delas.
      </Motivo>
      <Motivo icone={<WifiOff size={18} aria-hidden />} titulo="Funciona dentro do galpão">
        Sem sinal você continua registrando; sobe sozinho quando a rede volta.
      </Motivo>
      <Motivo icone={<Smartphone size={18} aria-hidden />} titulo="Sem a barra do navegador">
        Tela inteira, ícone próprio, abre em um toque como qualquer app.
      </Motivo>
    </ul>
  )
}

function Motivo({
  icone,
  titulo,
  children,
}: {
  icone: ReactNode
  titulo: string
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-soft text-brand-soft-fg"
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className="font-medium leading-snug">{titulo}</p>
        <p className="mt-0.5 text-sm leading-snug text-fg-muted">{children}</p>
      </div>
    </li>
  )
}

function PassoIOS({
  numero,
  icone,
  titulo,
  children,
}: {
  numero: number
  icone: ReactNode
  titulo: string
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="relative flex size-9 shrink-0 items-center justify-center rounded-pill bg-surface-2 text-fg"
      >
        {icone}
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold leading-none text-brand-fg">
          {numero}
        </span>
      </span>
      <div className="min-w-0">
        <p className="font-medium leading-snug">{titulo}</p>
        <p className="mt-0.5 text-sm leading-snug text-fg-muted">{children}</p>
      </div>
    </li>
  )
}
