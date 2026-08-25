// src/screens/Registrar/EntradaAlternativa.tsx
// Las otras tres puertas: teclado, pegar (e-mail o conversa de WhatsApp) y
// foto.
//
// Existen porque la voz falla en tres situaciones reales y frecuentes: la
// reunión que sigue en la sala de al lado, el galpão con 90 dB de ruido, y el
// e-mail que ya tiene todo escrito y solo hay que meterlo. Sin estas puertas,
// el vendedor que no puede hablar simplemente no registra.
//
// Pegar una conversa de WhatsApp es la de mayor rendimiento: son 40 líneas de
// contexto con fechas y compromisos que el vendedor ya tiene en el portapapeles
// y que hoy se pierden enteras.

import { useRef, useState } from 'react'
import { Camera, ClipboardPaste, Keyboard } from 'lucide-react'
import { Button, SegmentedControl, Sheet, TextArea, toast } from '@/ui'
import type { FonteIngest } from './contrato'

type ModoTexto = 'texto' | 'email' | 'whatsapp'

const PLACEHOLDERS: Readonly<Record<ModoTexto, string>> = {
  texto: 'Liguei para o Marcelo. Ele disse que a caixa continua abrindo…',
  email: 'Cole o e-mail inteiro, com assunto e assinatura.',
  whatsapp: 'Cole a conversa exportada do WhatsApp.',
}

const AJUDA: Readonly<Record<ModoTexto, string>> = {
  texto: 'Escreva como você contaria para um colega.',
  email: 'Pode colar tudo: eu separo o que importa.',
  whatsapp: 'Cole com os horários — eles ajudam a datar os compromissos.',
}

export interface EntradaAlternativaProps {
  open: boolean
  onClose: () => void
  /** Manda a interpretar. `fonte` decide cómo lo lee el servidor. */
  onEnviar: (fonte: FonteIngest, texto: string) => void
  ocupado: boolean
}

export function EntradaAlternativa({ open, onClose, onEnviar, ocupado }: EntradaAlternativaProps) {
  const [modo, setModo] = useState<ModoTexto>('texto')
  const [texto, setTexto] = useState('')

  const colar = async () => {
    try {
      // navigator.clipboard.readText exige gesto del usuario y permiso; en
      // Safari iOS muestra un prompt nativo. Si falla, el vendedor pega a mano
      // con el teclado: no se rompe nada.
      const conteudo = await navigator.clipboard.readText()
      if (conteudo.trim() === '') {
        toast({ message: 'A área de transferência está vazia.', tone: 'atencao' })
        return
      }
      setTexto((atual) => (atual === '' ? conteudo : `${atual}\n\n${conteudo}`))
    } catch {
      toast({ message: 'Cole com o teclado — o navegador não deixou ler.', tone: 'neutro' })
    }
  }

  const enviar = () => {
    const limpo = texto.trim()
    if (limpo.length < 10) {
      toast({ message: 'Escreva um pouco mais para eu entender.', tone: 'atencao' })
      return
    }
    onEnviar(modo, limpo)
    setTexto('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Escrever ou colar"
      description="Serve o mesmo motor da voz."
      snapPoints={[0.7, 0.95]}
      initialSnap={1}
      footer={
        <Button block size="lg" loading={ocupado} onClick={enviar} hapticPattern="success">
          Analisar
        </Button>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <SegmentedControl
          label="Origem do texto"
          value={modo}
          onChange={setModo}
          block
          options={[
            { value: 'texto', label: 'Teclado' },
            { value: 'email', label: 'E-mail' },
            { value: 'whatsapp', label: 'WhatsApp' },
          ]}
        />

        <TextArea
          label="Conteúdo"
          hideLabel
          value={texto}
          onChange={setTexto}
          rows={9}
          maxLength={20000}
          placeholder={PLACEHOLDERS[modo]}
          hint={AJUDA[modo]}
        />

        <Button
          variant="secondary"
          block
          icon={<ClipboardPaste size={18} aria-hidden />}
          onClick={() => void colar()}
        >
          Colar da área de transferência
        </Button>
      </div>
    </Sheet>
  )
}

/* ── Fila de atajos bajo el micrófono ──────────────────────────────────── */

export interface AtalhosDeEntradaProps {
  onTeclado: () => void
  onFoto: (arquivo: File) => void
  desabilitado: boolean
}

export function AtalhosDeEntrada({ onTeclado, onFoto, desabilitado }: AtalhosDeEntradaProps) {
  const inputFoto = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="secondary"
        icon={<Keyboard size={18} aria-hidden />}
        disabled={desabilitado}
        onClick={onTeclado}
      >
        Teclado
      </Button>
      <Button
        variant="secondary"
        icon={<Camera size={18} aria-hidden />}
        disabled={desabilitado}
        onClick={() => {
          inputFoto.current?.click()
        }}
      >
        Foto
      </Button>
      {/* capture="environment" abre la cámara trasera directo en Android; en
          iOS abre la hoja de acciones con Câmera / Fotos, que es lo correcto:
          muchas veces la foto del quadro branco ya está sacada. */}
      <input
        ref={inputFoto}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (arquivo) onFoto(arquivo)
        }}
      />
    </div>
  )
}
