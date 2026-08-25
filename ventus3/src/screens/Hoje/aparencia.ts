// src/screens/Hoje/aparencia.ts
// Traducciones visuales de la tela Hoje: de un dato del dominio a un ícono,
// un tono y un verbo. Vive aparte de los componentes porque el fast refresh
// se rompe si un archivo exporta componentes y constantes sueltas.

import {
  ArrowUpRight,
  CalendarCheck,
  FileText,
  FlaskConical,
  Handshake,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RotateCcw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TipoAcao, Urgencia } from '@/core'
import type { Tone } from '@/ui'
import type { ZonaDoFunil } from '@/data'

/** Ícono por tipo de acción. El mismo que usa el verbo de la tarjeta. */
export const ICONE_DA_ACAO: Readonly<Record<TipoAcao, LucideIcon>> = {
  ligar: Phone,
  mensagem: MessageCircle,
  email: Mail,
  reuniao: CalendarCheck,
  visita: MapPin,
  proposta: FileText,
  evidencia: FlaskConical,
  tarefa: Handshake,
  compromisso: Handshake,
  reativar: RotateCcw,
}

/** Rótulo corto del tipo, para el lector de pantalla y la fila de «Ver tudo». */
export const ROTULO_DA_ACAO: Readonly<Record<TipoAcao, string>> = {
  ligar: 'Ligar',
  mensagem: 'Mensagem',
  email: 'E-mail',
  reuniao: 'Reunião',
  visita: 'Visita',
  proposta: 'Proposta',
  evidencia: 'Evidência',
  tarefa: 'Tarefa',
  compromisso: 'Compromisso',
  reativar: 'Reativar',
}

/**
 * Tono por urgencia. `critica` es rojo y `alta` ámbar; media y baja quedan
 * neutras a propósito: si todo grita, nada grita.
 */
export const TOM_DA_URGENCIA: Readonly<Record<Urgencia, Tone>> = {
  critica: 'perigo',
  alta: 'atencao',
  media: 'neutro',
  baixa: 'neutro',
}

export const TOM_DA_ZONA: Readonly<Record<ZonaDoFunil, Tone>> = {
  prospeccao: 'info',
  avanco: 'marca',
  fechamento: 'destaque',
}

export const ICONE_DA_ZONA: Readonly<Record<ZonaDoFunil, LucideIcon>> = {
  prospeccao: MessageCircle,
  avanco: ArrowUpRight,
  fechamento: Handshake,
}
