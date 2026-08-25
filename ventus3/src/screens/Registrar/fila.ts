// src/screens/Registrar/fila.ts
// La cola de notas de voz. Es la mitad del producto que nadie ve.
//
// La regla es una sola y no se negocia: EL BLOB VA A INDEXEDDB ANTES DE
// INTENTAR SUBIRLO. Nunca al revés. Si el vendedor está en el galpão de un
// cliente sin señal —que es exactamente donde se dictan estas notas— el
// registro queda «pendente» y el audio sigue ahí cuando vuelva la red. Lo que
// no puede pasar nunca es que la nota exista solo en la RAM de un Safari que
// iOS va a matar en cuanto el vendedor abra el WhatsApp.
//
// Estados de `audioBlobs` (ver src/data/local-types.ts):
//   gravado    → en disco, todavía no transcripto. Es lo que se reintenta.
//   enviando   → hay un intento en vuelo ahora mismo.
//   transcrito → ya volvió del /api/ingest. Se borra al confirmar el registro.
//   erro       → falló de forma recuperable; vuelve a la cola.

import { useCallback, useEffect, useState } from 'react'
import {
  agora,
  apagarAudio,
  audiosPendentes,
  getDb,
  guardarAudio,
  talvezOnline,
  type AudioBlobRecord,
} from '@/data'

export interface EntradaFila {
  /** client_uuid: el mismo de la activity que va a nacer. */
  id: string
  blob: Blob
  mime: string
  duracaoSeg: number
  vendor: string
  alvo: { kind: 'opportunity' | 'lead'; id: number } | null
}

/**
 * Guarda la nota en disco. Se llama ANTES de cualquier fetch.
 * No lanza hacia arriba si IndexedDB falla: devuelve false y la pantalla avisa
 * que esta nota no sobrevive a un cierre de app —pero deja seguir grabando.
 */
export async function guardarNota(entrada: EntradaFila): Promise<boolean> {
  const registro: AudioBlobRecord = {
    id: entrada.id,
    blob: entrada.blob,
    mime: entrada.mime,
    duracao_seg: entrada.duracaoSeg,
    vendor: entrada.vendor,
    alvo: entrada.alvo,
    estado: 'gravado',
    ultimo_error: null,
    criado_em: agora(),
  }
  try {
    await guardarAudio(registro)
    return true
  } catch {
    // Cuota llena o modo privado de Safari. No se pierde la sesión en curso:
    // el blob sigue en memoria mientras la pantalla esté abierta.
    return false
  }
}

/** Cambia el estado de una nota sin reescribir el blob entero. */
export async function marcarNota(
  id: string,
  estado: AudioBlobRecord['estado'],
  erro: string | null = null,
): Promise<void> {
  try {
    await getDb().audioBlobs.update(id, { estado, ultimo_error: erro })
  } catch {
    /* si el registro no existe, no hay nada que marcar */
  }
}

/** Ata la nota a un alvo cuando el vendedor lo elige a mano. */
export async function atarNotaAoAlvo(
  id: string,
  alvo: { kind: 'opportunity' | 'lead'; id: number },
): Promise<void> {
  try {
    await getDb().audioBlobs.update(id, { alvo })
  } catch {
    /* idem */
  }
}

/**
 * La nota ya se registró como actividad, pero le falta la transcripción.
 *
 * Queda en `gravado` a propósito —así sigue apareciendo en la cola y se puede
 * reintentar— pero con `atividade_uid` puesto, que es lo que distingue «hay que
 * retomar esta nota» de «esto ya está registrado, solo falta el texto».
 */
export async function marcarNotaRegistrada(id: string, atividadeUid: string): Promise<void> {
  try {
    await getDb().audioBlobs.update(id, { atividade_uid: atividadeUid, estado: 'gravado' })
  } catch {
    /* si el registro no existe, no hay nada que marcar */
  }
}

/** La nota ya cumplió: el registro se confirmó. Libera los MB. */
export async function descartarNota(id: string): Promise<void> {
  try {
    await apagarAudio(id)
  } catch {
    /* idem */
  }
}

export async function lerNota(id: string): Promise<AudioBlobRecord | undefined> {
  try {
    return await getDb().audioBlobs.get(id)
  } catch {
    return undefined
  }
}

/**
 * Cuántas notas siguen esperando, y su detalle.
 *
 * Se re-lee al montar, al volver la red y al volver la app al frente. No hay
 * polling: en un teléfono, un `setInterval` abierto es batería tirada.
 */
export function useNotasPendentes(): {
  pendentes: AudioBlobRecord[]
  recarregar: () => void
} {
  const [pendentes, setPendentes] = useState<AudioBlobRecord[]>([])

  const recarregar = useCallback(() => {
    void audiosPendentes()
      .then((linhas) => {
        setPendentes(linhas.sort((a, b) => a.criado_em.localeCompare(b.criado_em)))
      })
      .catch(() => {
        setPendentes([])
      })
  }, [])

  useEffect(() => {
    recarregar()
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') recarregar()
    }
    window.addEventListener('online', recarregar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.removeEventListener('online', recarregar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [recarregar])

  return { pendentes, recarregar }
}

/** ¿Vale la pena siquiera intentar el envío? */
export function vaiTentarAgora(): boolean {
  return talvezOnline()
}
