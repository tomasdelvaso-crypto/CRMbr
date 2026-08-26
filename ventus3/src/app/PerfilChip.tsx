// src/app/PerfilChip.tsx
// Indicador de perfil: quién sos y qué rol tenés, siempre a la vista.
//
// Nace acá y no sólo dentro de Mais/CartaoDeIdentidade porque esa tarjeta vive
// detrás de un tab que nadie abre para saber su propio rol — el reclamo real
// fue «no sé si tengo perfil administrador». En el rail de escritorio
// (DesktopRail.tsx) queda fijo al pie, siempre visible, sin tener que navegar
// a ningún lado para responder esa pregunta.
//
// Se lee del `SessionContext` directamente y no por props: así el rail lo
// monta con `<PerfilChip />` a secas, y Mais y Ajustes lo agrandan con
// `tamanho="lg"` sin que nadie tenga que pasarle el vendedor a mano.
//
// TRES ESTADOS, no dos. `vendorName === null` no es un caso de error que se
// esconde: es la sesión sin vendedor, con su propia forma (avatar «?», sin
// chip de rol) en vez de romper o mostrar un nombre vacío.

import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, UserRound } from 'lucide-react'
import { Avatar, Chip } from '@/ui'
import { SessionContext } from './session-context'

export interface PerfilChipProps {
  /** `sm` es el del rail (por defecto). `lg` es el de Mais y Ajustes. */
  tamanho?: 'sm' | 'lg'
  /** Muestra el e-mail debajo del nombre. Sólo tiene sentido con `tamanho="lg"`. */
  comEmail?: boolean
  /** Sin link: para cuando la tarjeta ya vive en la pantalla a la que llevaría. */
  link?: boolean
  className?: string
}

/** El rótulo del rol, tal como lo pide el PLANO: «Administrador» / «Vendedor». */
function rotuloDoRol(isAdmin: boolean): string {
  return isAdmin ? 'Administrador' : 'Vendedor'
}

/**
 * `null` sin `SessionContext` (smoke tests del router, que corren sin
 * provider): el rail se pinta igual y el pie queda vacío, como el resto del
 * chrome que depende de la sesión.
 */
export function PerfilChip({ tamanho = 'sm', comEmail = false, link = true, className }: PerfilChipProps) {
  const sessao = useContext(SessionContext)
  if (!sessao || sessao.loading || !sessao.session) return null

  const grande = tamanho === 'lg'
  // El padding de la fila sólo tiene sentido cuando hay link: es el área
  // táctil extra del rail. En Mais/Ajustes ya viene dentro de un `Card` con
  // su propio padding, y duplicarlo dejaría el avatar pegado a una esquina
  // que no es la del contenedor.
  const classesBase = `flex min-w-0 items-center gap-2 rounded-xl text-left transition-colors ${
    link ? 'px-2 py-2 lg:hover:bg-surface-2' : ''
  }${className ? ` ${className}` : ''}`

  if (sessao.vendorName === null) {
    const conteudo = (
      <>
        <Avatar name="?" size={grande ? 'lg' : 'sm'} />
        <div className="min-w-0 flex-1">
          <p className={grande ? 'truncate font-semibold text-fg-muted' : 'truncate text-xs text-fg-muted'}>
            Sessão sem vendedor
          </p>
          {grande && <p className="truncate text-xs text-fg-subtle">Fale com o Jordi</p>}
        </div>
      </>
    )
    if (!link) return <div className={`${classesBase} text-fg-muted`}>{conteudo}</div>
    return (
      <Link to="/mais" className={`${classesBase} text-fg-muted`}>
        {conteudo}
      </Link>
    )
  }

  const conteudo = (
    <>
      <Avatar name={sessao.vendorName} size={grande ? 'lg' : 'sm'} />
      <div className="min-w-0 flex-1" aria-hidden={link}>
        <p
          className={
            grande
              ? 'truncate text-lg font-semibold leading-tight tracking-tight'
              : 'truncate text-sm font-semibold leading-5'
          }
        >
          {sessao.vendorName}
        </p>
        {grande && comEmail && sessao.vendor?.email && (
          <p className="truncate text-sm text-fg-muted">{sessao.vendor.email}</p>
        )}
        {grande ? (
          <div className="mt-1.5">
            <Chip
              tone={sessao.isAdmin ? 'marca' : 'neutro'}
              size="sm"
              icon={
                sessao.isAdmin ? (
                  <ShieldCheck size={12} aria-hidden />
                ) : (
                  <UserRound size={12} aria-hidden />
                )
              }
            >
              {rotuloDoRol(sessao.isAdmin)}
            </Chip>
          </div>
        ) : (
          <span className="flex items-center gap-1 text-2xs leading-4 text-fg-muted">
            {sessao.isAdmin && <ShieldCheck size={12} aria-hidden className="shrink-0 text-brand" />}
            <span className="truncate">{rotuloDoRol(sessao.isAdmin)}</span>
          </span>
        )}
      </div>
    </>
  )

  if (!link) return <div className={classesBase}>{conteudo}</div>

  return (
    <Link
      to="/mais"
      aria-label={`${sessao.vendorName}. ${rotuloDoRol(sessao.isAdmin)}. Abrir Mais.`}
      className={classesBase}
    >
      {conteudo}
    </Link>
  )
}
