// src/screens/Instalar/index.tsx
// /INSTALAR — ruta PÚBLICA. El link llega por el bot de Telegram.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS CUATRO DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NO PIDE SESIÓN. Es la página que se abre en un teléfono que todavía no
//    tiene nada. Pedir login para explicar cómo instalar sería un círculo.
//
// 2. MUESTRA PRIMERO LO QUE SIRVE EN ESTE APARATO. Un iPhone no necesita ver
//    el aviso de Play Protect y un Android no necesita el gesto de
//    Compartilhar. Las dos secciones existen igual, abajo, porque alguien va a
//    abrir esta página en la computadora para ayudar a un compañero — y para
//    ese caso está el QR arriba de todo.
//
// 3. EL AVISO DE PLAY PROTECT ESTÁ ESCRITO ANTES DE QUE APAREZCA. «App não
//    verificada» leído por sorpresa en la mitad de una instalación es el
//    momento exacto en que la gente abandona. Anticipado, con el botón
//    nombrado literal («Instalar mesmo assim»), deja de ser un susto.
//
// 4. LA SECCIÓN DE iOS DICE POR QUÉ, NO SÓLO CÓMO. Sin «Adicionar à Tela de
//    Início» NO HAY NOTIFICACIONES en iPhone — ninguna, nunca. No es un paso
//    opcional de comodidad: es el requisito. Si no se dice, se saltea.

import { useState } from 'react'
import {
  AlertTriangle,
  Apple,
  BellRing,
  Check,
  Copy,
  Download,
  Smartphone,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Card, Chip, Logotipo, QRCode, toast } from '@/ui'
import {
  IlustracaoAdicionar,
  IlustracaoCompartilhar,
  IlustracaoMenuAndroid,
  IlustracaoNaTela,
  IlustracaoPlayProtect,
} from './Ilustracoes'
import { URL_DO_APK, urlDaPagina, useInstalacao } from './plataforma'

export default function InstalarScreen() {
  const { plataforma, instalado, podeInstalar, instalar } = useInstalacao()
  const [endereco] = useState<string>(urlDaPagina)

  return (
    <main className="min-h-screen-svh bg-bg px-safe pb-safe pt-safe text-fg">
      <div className="mx-auto max-w-lg px-4 py-6">
        <header className="flex flex-col items-center text-center">
          <Logotipo size={52} comNome={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Instalar o Ventus</h1>
          <p className="mt-1 text-sm leading-snug text-fg-muted">
            Três minutos, uma vez só. Depois disso o Ventus abre como qualquer app do celular —
            inclusive sem sinal, dentro do galpão.
          </p>
        </header>

        {instalado && (
          <Card padding="md" accent="ok" className="mt-6">
            <div className="flex items-start gap-3">
              <Check size={20} aria-hidden className="mt-0.5 shrink-0 text-ok" />
              <div>
                <p className="font-semibold">Já está instalado neste aparelho.</p>
                <p className="mt-0.5 text-sm leading-snug text-fg-muted">
                  Você está vendo o Ventus rodando como app. Só falta entrar e vincular o
                  Telegram lá dentro, em Ajustes.
                </p>
              </div>
            </div>
          </Card>
        )}

        {!instalado && plataforma === 'android' && (
          <Card padding="md" className="mt-6">
            <p className="text-sm font-semibold">Você está num Android.</p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">
              O caminho mais curto é instalar direto do navegador. O APK abaixo é o plano B —
              serve se o botão não aparecer.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="primary"
                block
                icon={<Smartphone size={18} aria-hidden />}
                disabled={!podeInstalar}
                onClick={async () => {
                  const aceitou = await instalar()
                  if (!aceitou) {
                    toast({
                      message: 'Sem problema. O passo a passo abaixo faz a mesma coisa.',
                      tone: 'neutro',
                    })
                  }
                }}
              >
                {podeInstalar ? 'Instalar agora' : 'Use o menu do Chrome (passo 1 abaixo)'}
              </Button>
              {/* Sin VITE_APK_URL no hay APK publicado todavía: el botón no
                  se muestra en vez de llevar a una descarga que no existe. */}
              {URL_DO_APK !== null && (
                <Button
                  variant="secondary"
                  block
                  icon={<Download size={18} aria-hidden />}
                  onClick={() => {
                    if (URL_DO_APK !== null) window.location.href = URL_DO_APK
                  }}
                >
                  Baixar o APK
                </Button>
              )}
            </div>
          </Card>
        )}

        {!instalado && plataforma === 'ios' && (
          <Card padding="md" className="mt-6">
            <p className="text-sm font-semibold">Você está num iPhone ou iPad.</p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">
              No iOS não existe botão de instalar: são dois toques, e estão logo abaixo, em
              «No iPhone». Sem eles o Ventus funciona, mas <strong>não avisa nada</strong>.
            </p>
          </Card>
        )}

        {/* QR — el camino cuando esta página se abre en la computadora. */}
        <section className="mt-6">
          <Card padding="md">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
              <QRCode
                value={endereco}
                size={168}
                alt="QR code para abrir esta página no celular"
                className="shrink-0"
              />
              <div className="min-w-0 text-center sm:text-left">
                <p className="font-semibold">Abra esta página no celular</p>
                <p className="mt-1 text-sm leading-snug text-fg-muted">
                  Aponte a câmera do celular para o código. A instalação só faz sentido no
                  aparelho que você leva para a rua.
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
                  <code className="min-w-0 truncate rounded-md bg-surface-2 px-2 py-1 text-xs text-fg-muted">
                    {endereco}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Copy size={16} aria-hidden />}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(endereco)
                        toast({ message: 'Link copiado.', tone: 'ok' })
                      } catch {
                        toast({
                          message: 'O navegador não deixou copiar. Selecione o texto à mão.',
                          tone: 'atencao',
                        })
                      }
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <SecaoAndroid destacada={plataforma === 'android'} />
        <SecaoIOS destacada={plataforma === 'ios'} />

        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Depois de instalar</h2>
          <ol className="mt-3 flex flex-col gap-3">
            <Fecho numero={1} titulo="Entre com o seu e-mail Ventapel">
              Se não lembrar a senha, use o link por e-mail na tela de entrada.
            </Fecho>
            <Fecho numero={2} titulo="Vincule o Telegram em Ajustes">
              O app gera um código de 6 dígitos e você manda esse código para o bot. Leva dez
              segundos e vale por dez minutos.
            </Fecho>
            <Fecho numero={3} titulo="Ligue os avisos quando o app pedir">
              É um toque só, e é o que faz a Golden Hour te procurar em vez de você lembrar dela.
            </Fecho>
          </ol>
        </section>

        <p className="mt-8 pb-6 text-center text-xs leading-snug text-fg-subtle">
          Travou em algum passo? Manda print no grupo. Nenhum destes passos é óbvio na primeira
          vez — foi por isso que esta página existe.
        </p>
      </div>
    </main>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Secciones por plataforma
   ══════════════════════════════════════════════════════════════════════════ */

function SecaoAndroid({ destacada }: { destacada: boolean }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Smartphone size={20} aria-hidden className="text-fg-muted" />
        <h2 className="text-lg font-bold tracking-tight">No Android</h2>
        {destacada && <Chip tone="marca" size="sm">Você está aqui</Chip>}
      </div>

      <ol className="mt-3 flex flex-col gap-4">
        <Passo
          numero={1}
          titulo="Abra o menu do Chrome e toque em «Instalar aplicativo»"
          ilustracao={<IlustracaoMenuAndroid />}
        >
          É o botão de três pontinhos, no canto de cima à direita. Se a opção aparecer como
          «Adicionar à tela inicial», é a mesma coisa.
        </Passo>

        <Passo
          numero={2}
          titulo="Se você baixou o APK: libere a instalação"
          ilustracao={<IlustracaoPlayProtect />}
        >
          O Android vai perguntar se pode instalar apps deste navegador. É uma pergunta única,
          por aparelho.
        </Passo>

        <li>
          <Card padding="md" accent="atencao">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} aria-hidden className="mt-0.5 shrink-0 text-warn" />
              <div>
                <p className="font-semibold">Vai aparecer «App não verificada». É esperado.</p>
                <p className="mt-1 text-sm leading-snug text-fg-muted">
                  O Play Protect avisa isso de qualquer app que não venha da Play Store. O Ventus
                  é da própria Ventapel e ainda está em trâmite na loja. Toque em{' '}
                  <strong className="text-fg">«Instalar mesmo assim»</strong> — o outro botão
                  cancela tudo.
                </p>
              </div>
            </div>
          </Card>
        </li>

        <Passo
          numero={3}
          titulo="Confira o ícone na tela de início"
          ilustracao={<IlustracaoNaTela />}
        >
          Se o Ventus abrir com a barra de endereço do Chrome em cima, alguma coisa não colou:
          manda print no grupo antes de seguir.
        </Passo>
      </ol>
    </section>
  )
}

function SecaoIOS({ destacada }: { destacada: boolean }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Apple size={20} aria-hidden className="text-fg-muted" />
        <h2 className="text-lg font-bold tracking-tight">No iPhone</h2>
        {destacada && <Chip tone="marca" size="sm">Você está aqui</Chip>}
      </div>

      <Card padding="md" accent="info" className="mt-3">
        <div className="flex items-start gap-3">
          <BellRing size={20} aria-hidden className="mt-0.5 shrink-0 text-info" />
          <div>
            <p className="font-semibold">Este passo não é enfeite.</p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">
              O iPhone só entrega notificação para app que está na tela de início. Enquanto o
              Ventus for uma aba do Safari, ele não consegue te avisar de nada — nem da Golden
              Hour, nem de uma ação vencida.
            </p>
          </div>
        </div>
      </Card>

      <ol className="mt-4 flex flex-col gap-4">
        <Passo
          numero={1}
          titulo="Toque em Compartilhar, na barra de baixo do Safari"
          ilustracao={<IlustracaoCompartilhar />}
        >
          É o quadrado com a seta para cima. Precisa ser o <strong>Safari</strong>: no Chrome do
          iPhone essa opção não existe.
        </Passo>

        <Passo
          numero={2}
          titulo="Role e toque em «Adicionar à Tela de Início»"
          ilustracao={<IlustracaoAdicionar />}
        >
          A lista é comprida e essa opção costuma ficar bem embaixo. Depois toque em
          «Adicionar», no canto de cima à direita.
        </Passo>

        <Passo
          numero={3}
          titulo="Abra o Ventus pelo ícone novo"
          ilustracao={<IlustracaoNaTela />}
        >
          A partir de agora, entre sempre por aí. Aberto pelo ícone, o Ventus ocupa a tela
          inteira e pode notificar.
        </Passo>
      </ol>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas
   ══════════════════════════════════════════════════════════════════════════ */

function Passo({
  numero,
  titulo,
  ilustracao,
  children,
}: {
  numero: number
  titulo: string
  ilustracao?: ReactNode
  children: ReactNode
}) {
  return (
    <li>
      <Card padding="md">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg"
          >
            {numero}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{titulo}</p>
            <p className="mt-1 text-sm leading-snug text-fg-muted">{children}</p>
            {ilustracao && <div className="mt-3">{ilustracao}</div>}
          </div>
        </div>
      </Card>
    </li>
  )
}

function Fecho({
  numero,
  titulo,
  children,
}: {
  numero: number
  titulo: string
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold text-fg-muted"
      >
        {numero}
      </span>
      <div className="min-w-0">
        <p className="font-medium leading-snug">{titulo}</p>
        <p className="mt-0.5 text-sm leading-snug text-fg-muted">{children}</p>
      </div>
    </li>
  )
}
