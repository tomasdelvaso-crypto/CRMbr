// src/screens/Ajustes/index.tsx
// AJUSTES — autonomía sobre la meta y sobre el ruido.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. EL ORDEN ES EL ORDEN DE LAS PREGUNTAS REALES. Primero la meta (es lo que
//    la persona vino a discutir), después la Golden Hour (es lo que la meta
//    exige), después Telegram y avisos (cómo el sistema la busca), y sólo al
//    final el juego, la sincronización y el aparato. Un Ajustes ordenado por
//    «configuración técnica» manda al final justo lo que la gente vino a ver.
//
// 2. CADA SECCIÓN GUARDA A SU MANERA, Y ESO ES DELIBERADO. Los interruptores
//    (avisos, juego, tema) se aplican al toque: son reversibles con el mismo
//    dedo. Las metas y la Golden Hour tienen botón: son compromisos, y un
//    compromiso que se cambia sin querer arrastrando un número no es un
//    compromiso.
//
// 3. SIN VENDEDOR LA PANTALLA NO MIENTE. Si la sesión existe pero no está
//    ligada a un vendedor, se dice exactamente eso y se deja el tema, que es
//    lo único que sí funciona sin identidad.

import { useContext, useState } from 'react'
import { Skeleton } from '@/ui'
import { SessionContext } from '@/app/session-context'
import { SecaoCookbook } from './SecaoCookbook'
import { SecaoGoldenHour } from './SecaoGoldenHour'
import { SecaoTelegram } from './SecaoTelegram'
import { SecaoAvisos } from './SecaoAvisos'
import { SecaoJogo } from './SecaoJogo'
import { SecaoSincronizacao } from './SecaoSincronizacao'
import { SecaoAparelho } from './SecaoAparelho'
import { RegrasDoJogoSheet } from './RegrasDoJogo'

export default function AjustesScreen() {
  const sessao = useContext(SessionContext)

  // Sin contexto de sesión (render aislado, smoke test) se pinta la silueta.
  if (!sessao) return <EsqueletoAjustes />

  return (
    <Ajustes
      vendorName={sessao.vendorName}
      vendorId={sessao.vendor?.id ?? null}
    />
  )
}

function Ajustes({
  vendorName,
  vendorId,
}: {
  vendorName: string | null
  vendorId: number | null
}) {
  const [regrasAbertas, setRegrasAbertas] = useState(false)

  return (
    <div className="px-4 py-4">
      {vendorName === null && (
        <div className="mb-6 rounded-card border border-warn/40 bg-warn-soft px-4 py-3">
          <p className="text-sm font-semibold text-warn-soft-fg">
            Esta sessão ainda não está ligada a um vendedor.
          </p>
          <p className="mt-1 text-sm leading-snug text-warn-soft-fg/90">
            Metas, Golden Hour e avisos ficam disponíveis assim que o Jordi ligar o seu e-mail
            ao seu nome de vendedor. O tema, abaixo, já funciona.
          </p>
        </div>
      )}

      {vendorName !== null && (
        <>
          <SecaoCookbook vendorName={vendorName} />
          <SecaoGoldenHour vendorName={vendorName} />
          <SecaoTelegram vendorId={vendorId} />
          <SecaoAvisos vendorName={vendorName} />
          <SecaoJogo vendorName={vendorName} aoAbrirRegras={() => setRegrasAbertas(true)} />
          <SecaoSincronizacao vendorName={vendorName} />
        </>
      )}

      <SecaoAparelho />

      <p className="mt-8 pb-4 text-center text-2xs text-fg-subtle">
        Ventus v3 · Ventapel Brasil
      </p>

      <RegrasDoJogoSheet aberto={regrasAbertas} aoFechar={() => setRegrasAbertas(false)} />
    </div>
  )
}

function EsqueletoAjustes() {
  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <Skeleton variant="lista" count={4} />
      <Skeleton variant="lista" count={3} />
    </div>
  )
}
