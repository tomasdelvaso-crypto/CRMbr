// src/screens/Ajustes/SecaoAparelho.tsx
// APARELHO — tema e instalación.
//
// La instalación vive acá y no sólo en /instalar porque el momento en que
// alguien descubre que le falta instalar la app es el momento en que intenta
// autorizar las notificaciones y no puede. Mandarlo a otra pantalla en ese
// punto pierde a la mitad de las personas; ofrecerle el botón ahí mismo, no.
//
// En Android el botón es el diálogo nativo (`beforeinstallprompt`, capturado
// en `plataforma.ts`). En iOS no existe tal cosa: se muestra la secuencia
// literal y un link a la página con los dibujos.

import { useNavigate } from 'react-router-dom'
import { Check, Moon, Share, Smartphone, Sun, SunMoon } from 'lucide-react'
import { SegmentedControl, Button, Chip, toast } from '@/ui'
import { useTheme } from '@/app/useTheme'
import type { ThemePreference } from '@/app/theme-context'
import { useInstalacao } from '@/screens/Instalar/plataforma'
import { Divisor, Secao } from './Secao'

export function SecaoAparelho() {
  const navigate = useNavigate()
  const { preference, setPreference } = useTheme()
  const { plataforma, instalado, podeInstalar, instalar } = useInstalacao()

  return (
    <Secao
      titulo="Aparelho"
      icone={<Smartphone size={14} aria-hidden />}
      proposito="Como o Ventus se vê e como ele mora neste celular."
    >
      <div>
        <p className="text-sm font-medium text-fg-muted">Tema</p>
        <div className="mt-2">
          <SegmentedControl<ThemePreference>
            label="Tema do aplicativo"
            value={preference}
            onChange={setPreference}
            block
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
              { value: 'system', label: 'Sistema' },
            ]}
          />
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
          {preference === 'light' && <Sun size={14} aria-hidden />}
          {preference === 'dark' && <Moon size={14} aria-hidden />}
          {preference === 'system' && <SunMoon size={14} aria-hidden />}
          {preference === 'system'
            ? 'Acompanha o modo escuro do celular, inclusive quando ele muda sozinho à noite.'
            : 'Fixo neste aparelho, independente do que o celular fizer.'}
        </p>
      </div>

      <Divisor />

      <div>
        <p className="text-sm font-medium text-fg-muted">Instalação</p>

        {instalado && (
          <p className="mt-2 flex items-center gap-2 text-sm text-ok-soft-fg">
            <Check size={16} aria-hidden className="text-ok" />
            O Ventus está instalado neste aparelho.
          </p>
        )}

        {!instalado && plataforma === 'android' && (
          <div className="mt-2">
            <p className="text-sm leading-snug text-fg-muted">
              Instalado, o Ventus abre em tela cheia, guarda a carteira offline e pode notificar.
            </p>
            <div className="mt-3">
              <Button
                variant="primary"
                size="sm"
                icon={<Smartphone size={16} aria-hidden />}
                disabled={!podeInstalar}
                onClick={async () => {
                  const aceitou = await instalar()
                  if (!aceitou) {
                    toast({
                      message: 'Tudo bem. O passo a passo está em «Como instalar».',
                      tone: 'neutro',
                    })
                  }
                }}
              >
                {podeInstalar ? 'Instalar o app' : 'Use o menu do Chrome'}
              </Button>
            </div>
          </div>
        )}

        {!instalado && plataforma === 'ios' && (
          <div className="mt-2">
            <p className="text-sm leading-snug text-fg-muted">
              No iPhone são dois toques, e sem eles{' '}
              <strong className="text-fg">nenhuma notificação chega</strong>:
            </p>
            <ol className="mt-2 flex flex-col gap-1.5 text-sm text-fg-muted">
              <li className="flex items-center gap-2">
                <Share size={15} aria-hidden className="shrink-0 text-brand" />
                1. Toque em <strong className="text-fg">Compartilhar</strong>, na barra de baixo
                do Safari.
              </li>
              <li className="flex items-center gap-2">
                <Chip tone="marca" size="sm">
                  +
                </Chip>
                2. Role e toque em{' '}
                <strong className="text-fg">Adicionar à Tela de Início</strong>.
              </li>
            </ol>
          </div>
        )}

        {!instalado && plataforma === 'desktop' && (
          <p className="mt-2 text-sm leading-snug text-fg-muted">
            A instalação vale a pena no celular, que é onde o Ventus é usado de verdade. Abra{' '}
            <strong className="text-fg">/instalar</strong> pelo telefone — tem um QR lá.
          </p>
        )}

        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={() => void navigate('/instalar')}>
            Ver o passo a passo com desenhos
          </Button>
        </div>
      </div>
    </Secao>
  )
}
