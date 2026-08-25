// src/data/index.ts
// La capa de datos offline-first de Ventus. Un solo punto de entrada:
// `import { useHoje, registrarAtividade } from '@/data'`.
//
// Mapa:
//   supabase     cliente único (auth persistida). Nadie más crea uno.
//   db           Dexie: la cartera del vendedor, versionada y con migraciones
//   outbox       cola de mutaciones con client_uuid, backoff y badge
//   transport    cómo una mutación encolada llega a Supabase
//   sync         pull incremental + los tres disparadores del flush
//   conflicts    append-only, LWW por campo y la regla dura del outbox
//   realtime     suscripciones en vivo pasando por el mismo reconciliador
//   queries      lectura con TanStack Query montada sobre Dexie
//   mutations    las 10 escrituras de dominio, todas optimistas

import type { QueryClient } from '@tanstack/react-query'
import { conectarCacheAoSync } from './queries'
import { registrarMutationDefaults } from './mutations'
import { instalarGatilhosDeSync, iniciarSync } from './sync'
import { subscribePortfolio } from './realtime'

export * from './local-types'
export * from './supabase'
export * from './db'
export * from './outbox'
// transport.ts NO se reexporta a propósito. outbox.ts lo carga con import()
// dinámico para que la cola se pueda testear sin red y sin variables de
// entorno; reexportarlo acá lo volvía estático otra vez y anulaba esa
// separación (rolldown lo reportaba como INEFFECTIVE_DYNAMIC_IMPORT). Quien
// necesite el transporte lo importa de '@/data/transport'.
export * from './conflicts'
export * from './sync'
export * from './realtime'
export * from './queries'
export * from './mutations'
// Estado del día de la tela Hoje: plan congelado, racha y Corrente do time.
export * from './plano-do-dia'
// Dossiê do Cliente: evidencia por escala, health verificado, historial de
// escalas y perguntas SPIN usadas — todo en una sola lectura de Dexie.
export * from './dossie'
// Revisão do Ventus: la bandeja del propose-then-commit. Vive aparte porque
// ventus_actions no es una SyncTable (sin updated_at, ventana de 48 h) y sus
// escrituras son las tres del contrato: aceitar por campo, descartar con
// motivo y vincular un registro solto.
export * from './revisao'
// Gamificação: a preferência do jogo (opt-out real, ver o cabeçalho do
// arquivo) e os kudos. Vive aparte porque a lê TODA tela que mostra jogo.
export * from './gamificacao'
// Placar da Semana: a agregação semanal de «eu vs eu», os carris do time sem
// posições, os cinco troféus, a meta coletiva, a temporada e os recordes.
export * from './placar'
// Rituais: manhã, encerramento, segunda e sexta. Nunca bloqueiam a app e
// escrevem no MESMO plano do dia que a tela Hoje lê.
export * from './rituais'

// Autenticação: a tela Login é a única que toca a sessão, e passa por aqui.
// Nenhum componente importa `supabase` direto — nem para entrar.
export * from './auth'
// Ajustes: cookbook negociado, Golden Hour, avisos, Telegram, estado de
// sincronização e as regras do jogo. Reusa o cookbook de placar.ts em vez de
// duplicá-lo: duas chaves para a mesma meta seriam duas metas.
export * from './ajustes'
// Painel do Gestor: a ÚNICA leitura da app que sai do Dexie e vai à rede —
// o gestor precisa das seis carteiras e elas não estão no telefone dele.
export * from './gestor'

export interface OpcoesCamadaDeDados {
  /** Desactiva el realtime aunque la flag de build lo permita. */
  semRealtime?: boolean
}

/**
 * Enciende toda la capa de datos para un vendedor y devuelve la limpieza.
 *
 * Orden obligatorio:
 *   1. setMutationDefaults ANTES de hidratar el cache persistido — si no, las
 *      mutaciones pausadas se restauran sin mutationFn y no se reanudan nunca.
 *   2. los disparadores de sync (online / visibilitychange / SW).
 *   3. el realtime, que es el único opcional de los tres.
 */
export function montarCamadaDeDados(
  queryClient: QueryClient,
  vendor: string,
  opcoes: OpcoesCamadaDeDados = {},
): () => void {
  registrarMutationDefaults(queryClient)

  const desconectarCache = conectarCacheAoSync(queryClient)
  const desinstalarGatilhos = instalarGatilhosDeSync(vendor)
  const desconectarRealtime = opcoes.semRealtime === true ? null : subscribePortfolio(vendor)

  void iniciarSync(vendor).catch(() => {
    // Arrancar sin red es el caso normal: Dexie ya tiene la cartera.
  })

  return () => {
    desconectarRealtime?.()
    desinstalarGatilhos()
    desconectarCache()
  }
}
