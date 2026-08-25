// src/screens/Cadencia/MapaSheet.tsx
// «Puxar do mapa de mercado»: de empresa mapeada a lead con cadencia viva, en
// un tap.
//
// Son 174 empresas ya asignadas que nunca entraron al CRM. No es una lista de
// prospección nueva: es prospección que ya se hizo y se quedó en una planilla.
// Por eso el botón dice «Puxar» y no «Criar»: la información ya existe.
//
// El anti-duplicado NO se decide acá. `promote_sweep_to_lead()` valida contra
// los índices únicos parciales de cnpj_raiz y domain_normalized del lado del
// servidor: intentar adivinarlo en el cliente sería inventar una segunda
// verdad para la misma regla.

import { useMemo, useState } from 'react'
import { Building2, CloudOff, Lock, MapPinned, Search } from 'lucide-react'
import { normalizarBusca, type EmpresaDoMapa, type MapaDeMercado } from '@/data'
import { Button, EmptyState, Sheet } from '@/ui'

export interface MapaSheetProps {
  open: boolean
  onClose: () => void
  mapa: MapaDeMercado | undefined
  carregando: boolean
  /** Ids ya promovidos en esta sesión: la fila se marca sin esperar el pull. */
  puxados: ReadonlySet<number>
  onPuxar: (empresa: EmpresaDoMapa) => void
}

export function MapaSheet({
  open,
  onClose,
  mapa,
  carregando,
  puxados,
  onPuxar,
}: MapaSheetProps) {
  const [busca, setBusca] = useState('')

  const empresas = useMemo(() => mapa?.empresas ?? [], [mapa])
  const termo = normalizarBusca(busca)

  const visiveis = useMemo(() => {
    if (termo === '') return empresas
    return empresas.filter((e) =>
      normalizarBusca(`${e.company_name} ${e.city ?? ''} ${e.sector ?? ''}`).includes(termo),
    )
  }, [empresas, termo])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mapa de mercado"
      description="Empresas já atribuídas a você que nunca entraram no CRM."
      snapPoints={[0.75, 0.95]}
    >
      {carregando ? (
        <p className="py-6 text-center text-sm text-fg-muted">Carregando o mapa…</p>
      ) : empresas.length === 0 ? (
        <VazioDoMapa motivo={mapa?.motivo ?? 'ok'} />
      ) : (
        <div className="pb-4">
          <label className="relative mb-3 flex items-center">
            <span className="sr-only">Buscar empresa no mapa</span>
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 text-fg-subtle"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa, cidade, setor"
              inputMode="search"
              className="min-h-touch w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-base text-fg outline-none placeholder:text-fg-subtle focus-visible:border-brand"
            />
          </label>

          <p className="mb-2 text-xs text-fg-muted">
            {visiveis.length === empresas.length
              ? `${String(empresas.length)} empresas prontas para virar lead`
              : `${String(visiveis.length)} de ${String(empresas.length)}`}
          </p>

          <ul className="list-none space-y-2">
            {visiveis.map((empresa) => {
              const jaPuxada = puxados.has(empresa.id)
              return (
                <li
                  key={empresa.id}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
                >
                  <Building2 size={18} aria-hidden className="shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {empresa.company_name}
                    </span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[empresa.city, empresa.uf, empresa.sector].filter(Boolean).join(' · ') ||
                        'Sem detalhes no mapa'}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant={jaPuxada ? 'ghost' : 'secondary'}
                    disabled={jaPuxada}
                    onClick={() => onPuxar(empresa)}
                  >
                    {jaPuxada ? 'Na fila' : 'Puxar'}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Sheet>
  )
}

/** Los tres vacíos posibles dicen cosas distintas: no son el mismo problema. */
function VazioDoMapa({ motivo }: { motivo: MapaDeMercado['motivo'] }) {
  if (motivo === 'offline') {
    return (
      <EmptyState
        icon={<CloudOff size={28} aria-hidden />}
        title="Sem conexão para abrir o mapa"
        description="O mapa de mercado mora no servidor. Assim que voltar o sinal, ele aparece aqui."
      />
    )
  }
  if (motivo === 'sem_acesso') {
    return (
      <EmptyState
        icon={<Lock size={28} aria-hidden />}
        title="O mapa ainda não está liberado"
        description="As empresas do barrido existem, mas o acesso do app à tabela market_sweep depende de uma liberação de segurança pendente. Fale com quem cuida do banco — é uma política, não um cadastro."
      />
    )
  }
  return (
    <EmptyState
      icon={<MapPinned size={28} aria-hidden />}
      title="Você puxou tudo"
      description="Nenhuma empresa atribuída a você está esperando virar lead. Boa hora para trabalhar a fila que já existe."
      variant="sucesso"
    />
  )
}
