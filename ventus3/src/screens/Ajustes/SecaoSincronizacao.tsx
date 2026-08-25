// src/screens/Ajustes/SecaoSincronizacao.tsx
// SINCRONIZAÇÃO — la respuesta a «o que eu registrei chegou?».
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTA SECCIÓN EXISTE
// ══════════════════════════════════════════════════════════════════════════
// La app es offline-first: todo lo que se escribe entra en el outbox y sale
// cuando hay red. Eso funciona, pero deja una pregunta sin respuesta visible,
// y es LA pregunta del vendedor que acaba de dictar tres notas dentro de un
// galpón. Sin un lugar donde mirarlo, la gente vuelve a anotar en papel «por
// las dudas» — y ahí se perdió el offline entero.
//
// El uso de almacenamiento está por la misma razón que el cursor por tabla:
// cuando iOS purga el IndexedDB de una PWA que no se abre hace días, la
// cartera desaparece sin aviso. Ver la cuota y poder pedir almacenamiento
// persistente es lo único que se puede hacer desde el cliente.

import { CloudUpload, Database, RefreshCw } from 'lucide-react'
import { formatRelativeBr } from '@/core'
import {
  formatarBytes,
  requestPersistentStorage,
  useEstaOnline,
  useEstadoDeSincronizacao,
  useForcarEnvio,
} from '@/data'
import { Button, Skeleton, toast } from '@/ui'
import { Divisor, Secao } from './Secao'

const ROTULO_DA_TABELA: Readonly<Record<string, string>> = {
  vendors: 'Vendedores',
  opportunities: 'Oportunidades',
  leads: 'Leads',
  tasks: 'Tarefas',
  commitments: 'Compromissos',
  activities: 'Atividades',
  touchpoints: 'Toques',
}

export function SecaoSincronizacao({ vendorName }: { vendorName: string | null }) {
  const consulta = useEstadoDeSincronizacao(vendorName)
  const enviar = useForcarEnvio()
  const online = useEstaOnline()

  if (consulta.isPending || !consulta.data) {
    return (
      <Secao titulo="Sincronização" proposito="O que já saiu deste aparelho e o que ainda não.">
        <Skeleton variant="lista" count={3} />
      </Secao>
    )
  }

  const estado = consulta.data
  const { armazenamento } = estado

  return (
    <Secao
      titulo="Sincronização"
      icone={<CloudUpload size={14} aria-hidden />}
      proposito="O que já saiu deste aparelho e o que ainda está esperando sinal."
    >
      <div className="grid grid-cols-2 gap-3">
        <Numero
          valor={estado.pendentes}
          rotulo={estado.pendentes === 1 ? 'esperando envio' : 'esperando envio'}
          tom={estado.pendentes > 0 ? 'text-warn' : 'text-fg'}
        />
        <Numero
          valor={estado.comProblema}
          rotulo="travados"
          tom={estado.comProblema > 0 ? 'text-danger' : 'text-fg'}
        />
      </div>

      <p className="mt-3 text-sm leading-snug text-fg-muted">
        {estado.ultimoSync
          ? `Última sincronização ${formatRelativeBr(estado.ultimoSync)}.`
          : 'Ainda não houve nenhuma sincronização neste aparelho.'}{' '}
        {estado.pendentes > 0 &&
          'Nada se perde: tudo o que está aqui sai sozinho quando o sinal voltar.'}
      </p>

      <div className="mt-3">
        <Button
          variant="secondary"
          block
          icon={<RefreshCw size={18} aria-hidden />}
          disabled={!online || !vendorName}
          loading={enviar.isPending}
          onClick={() => {
            if (!vendorName) return
            enviar.mutate(vendorName, {
              onSuccess: (r) => {
                toast({
                  message:
                    r.enviados > 0
                      ? `${r.enviados} ${r.enviados === 1 ? 'registro enviado' : 'registros enviados'}, ${r.baixados} atualizações recebidas.`
                      : `Nada pendente. ${r.baixados} atualizações recebidas.`,
                  tone: r.falhados > 0 ? 'atencao' : 'ok',
                })
              },
              onError: () => {
                toast({
                  message: 'A tentativa falhou. O envio automático continua tentando sozinho.',
                  tone: 'atencao',
                })
              },
            })
          }}
        >
          {online ? 'Enviar e atualizar agora' : 'Sem conexão'}
        </Button>
      </div>

      <Divisor />

      <details className="group">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between text-sm font-medium text-fg-muted">
          Detalhe por tabela
          <span aria-hidden className="text-fg-subtle transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {estado.porTabela.map((t) => (
            <li key={t.tabela} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg-muted">{ROTULO_DA_TABELA[t.tabela] ?? t.tabela}</span>
              <span className="tnum shrink-0 text-xs text-fg-subtle">
                {t.ultimoSync ? formatRelativeBr(t.ultimoSync) : 'nunca'}
                {t.linhas > 0 && ` · ${t.linhas} linhas`}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <Divisor />

      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
          <Database size={16} aria-hidden />
          Espaço usado neste aparelho
        </p>
        {armazenamento.fracao >= 0 ? (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-3">
              <div
                className="h-full rounded-pill bg-brand"
                style={{ width: `${Math.max(1, Math.min(100, armazenamento.fracao * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-fg-muted">
              {formatarBytes(armazenamento.usado)} de {formatarBytes(armazenamento.cota)}{' '}
              disponíveis.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">
            Este navegador não informa a cota. Normal no Safari em janela privada.
          </p>
        )}

        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const ok = await requestPersistentStorage()
              toast({
                message: ok
                  ? 'Pronto: o iPhone não vai mais apagar a sua carteira por inatividade.'
                  : 'O navegador não concedeu agora. Costuma conceder depois de alguns dias de uso.',
                tone: ok ? 'ok' : 'neutro',
              })
            }}
          >
            Proteger os dados de limpeza automática
          </Button>
        </div>
        <p className="mt-1.5 text-xs leading-snug text-fg-subtle">
          Sem isto, o iPhone pode apagar a carteira offline se o app ficar dias sem abrir. Os
          dados voltam na próxima sincronização, mas nesse meio-tempo o app abre vazio.
        </p>
      </div>
    </Secao>
  )
}

function Numero({ valor, rotulo, tom }: { valor: number; rotulo: string; tom: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2.5">
      <p className={`tnum text-2xl font-bold tracking-tight ${tom}`}>{valor}</p>
      <p className="text-xs leading-snug text-fg-muted">{rotulo}</p>
    </div>
  )
}
