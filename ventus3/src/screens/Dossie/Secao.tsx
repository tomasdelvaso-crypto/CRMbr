// src/screens/Dossie/Secao.tsx
// Bloque colapsable del dossiê. Sin tabs: la ficha es un scroll y cada bloque
// se pliega. El pliegue se recuerda entre visitas (ver secoes.ts).

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx, haptic } from '@/ui'
import { useSecaoAberta } from './secoes'

export interface SecaoProps {
  /** Id estable: es la clave con la que se recuerda el pliegue. */
  id: string
  titulo: string
  /** Resumen a la derecha del título, visible también plegado. */
  resumo?: ReactNode
  /** Aviso que obliga a mirar: se pinta aunque el bloque esté cerrado. */
  alerta?: ReactNode
  padraoAberta?: boolean
  children: ReactNode
}

export function Secao({ id, titulo, resumo, alerta, padraoAberta = true, children }: SecaoProps) {
  const [aberta, alternar] = useSecaoAberta(id, padraoAberta)
  const idConteudo = `secao-${id}`

  return (
    <section className="border-b border-border last:border-b-0">
      <h2>
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={idConteudo}
          onClick={() => {
            haptic('tap')
            alternar()
          }}
          className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left tap-highlight-none active:bg-surface-2"
        >
          <span className="flex-1 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {titulo}
          </span>
          {resumo && <span className="shrink-0 text-sm text-fg-muted">{resumo}</span>}
          <ChevronDown
            size={18}
            aria-hidden
            className={cx(
              'shrink-0 text-fg-subtle transition-transform duration-200 ease-ios motion-reduce:transition-none',
              aberta ? 'rotate-180' : '',
            )}
          />
        </button>
      </h2>

      {alerta && !aberta && <div className="px-4 pb-3">{alerta}</div>}

      <div id={idConteudo} hidden={!aberta} className="px-4 pb-4">
        {aberta && children}
      </div>
    </section>
  )
}
