// src/screens/Login/index.tsx
// ENTRAR — la primera pantalla y la que menos veces se ve.
//
// ══════════════════════════════════════════════════════════════════════════
// LAS TRES DECISIONES DE ESTA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
//
// 1. NO DICE DÓNDE ESTÁN LOS DATOS. Ni el dominio del proyecto, ni el nombre
//    del proveedor, ni un «powered by». Un login que anuncia su backend le
//    regala a cualquiera con el teléfono en la mano la mitad del trabajo de un
//    ataque. Lo único que se ve es la marca y dos campos.
//
// 2. EL ERROR ES UNA FRASE, NO UN CÓDIGO. `traduzirErroDeLogin` (en
//    `@/data/auth`) convierte los mensajes de Supabase en PT-BR accionable y
//    dice QUÉ CAMPO está mal, así el rojo cae en el campo correcto. «Sem
//    conexão» y «senha errada» piden cosas distintas de la persona y no pueden
//    verse igual.
//
// 3. EL LINK MÁGICO ESTÁ, PERO NO PRIMERO. Salir al mail y volver rompe la
//    sesión de trabajo en el teléfono. Existe porque la contraseña se olvida,
//    no porque sea el camino bueno — y por eso el segmento arranca en «Senha».
//
// Después de entrar, el redirect vuelve a donde la persona quería ir (el
// `from` que dejó el Shell). Aterrizar siempre en «Hoje» después de tocar un
// link de Telegram que apuntaba a una oportunidad sería perder el contexto.

import { useContext, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import {
  ErroDeLogin,
  aplicarPreferenciaDeSessao,
  definirLembrarSessao,
  lembrarSessao,
  useEntrarComSenha,
  useEnviarLinkMagico,
} from '@/data'
import {
  Button,
  Logotipo,
  SegmentedControl,
  Skeleton,
  Switch,
  TextField,
  toast,
} from '@/ui'
import { SessionContext } from '@/app/session-context'

type Modo = 'senha' | 'link'

interface EstadoDeOrigem {
  from?: string
}

export default function LoginScreen() {
  // `useContext` y no `useSession()`: sin provider, `useSession` lanza. Esta
  // pantalla es pública y tiene que poder renderizarse sola —el smoke test del
  // router la monta sin sesión—, así que la ausencia de contexto significa
  // «nadie está logueado», que es exactamente el caso que el Login atiende.
  const sessao = useContext(SessionContext)
  const location = useLocation()
  const destino = (location.state as EstadoDeOrigem | null)?.from ?? '/'

  // Mientras no se sabe si hay sesión, no se decide nada: pintar el formulario
  // y sacarlo medio segundo después es peor que esperar medio segundo.
  if (sessao?.loading) return <EsqueletoLogin />
  if (sessao?.session) return <Navigate to={destino} replace />
  return <Formulario destino={destino} />
}

function Formulario({ destino }: { destino: string }) {
  const navigate = useNavigate()
  const [modo, setModo] = useState<Modo>('senha')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState<boolean>(() => lembrarSessao())
  const [erro, setErro] = useState<ErroDeLogin | null>(null)
  const [linkEnviado, setLinkEnviado] = useState(false)

  const entrar = useEntrarComSenha()
  const enviarLink = useEnviarLinkMagico()

  // Reinstala el «não lembrar» guardado. No pide permisos ni abre diálogos:
  // sólo vuelve a colgar el handler de pagehide.
  useEffect(() => {
    aplicarPreferenciaDeSessao()
  }, [])

  const ocupado = entrar.isPending || enviarLink.isPending

  function tratarErro(e: unknown): void {
    const erroDeLogin =
      e instanceof ErroDeLogin
        ? e
        : new ErroDeLogin('desconhecido', 'Não deu para entrar agora. Tente de novo.', null)
    setErro(erroDeLogin)
  }

  function submeter(): void {
    setErro(null)
    if (modo === 'senha') {
      entrar.mutate(
        { email, senha, lembrar },
        {
          onSuccess: () => {
            void navigate(destino, { replace: true })
          },
          onError: tratarErro,
        },
      )
      return
    }

    enviarLink.mutate(email, {
      onSuccess: () => {
        setLinkEnviado(true)
        toast({ message: 'Link enviado. Confira o seu e-mail.', tone: 'ok' })
      },
      onError: tratarErro,
    })
  }

  return (
    <main className="flex min-h-screen-svh flex-col bg-bg px-safe pb-safe pt-safe text-fg">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
        <header className="mb-8 flex flex-col items-center text-center">
          <Logotipo size={56} comNome={false} />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Ventus</h1>
          <p className="mt-1 text-sm text-fg-muted">CRM de campo · Ventapel Brasil</p>
        </header>

        <SegmentedControl
          label="Como entrar"
          value={modo}
          onChange={(v) => {
            setModo(v)
            setErro(null)
            setLinkEnviado(false)
          }}
          options={[
            { value: 'senha', label: 'Com senha' },
            { value: 'link', label: 'Link por e-mail' },
          ]}
          block
        />

        {/* form de verdad: el gestor de contraseñas de iOS y Android sólo
            ofrece autocompletar dentro de un <form> con inputs nombrados. */}
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submeter()
          }}
        >
          <TextField
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint={modo === 'senha' ? 'next' : 'go'}
            placeholder="voce@ventapel.com.br"
            value={email}
            onChange={(v) => {
              setEmail(v)
              if (erro?.campo === 'email') setErro(null)
            }}
            error={erro?.campo === 'email' ? erro.message : null}
            disabled={ocupado}
          />

          {modo === 'senha' && (
            <TextField
              label="Senha"
              name="password"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              placeholder="Sua senha"
              value={senha}
              onChange={(v) => {
                setSenha(v)
                if (erro?.campo === 'senha') setErro(null)
              }}
              error={erro?.campo === 'senha' ? erro.message : null}
              disabled={ocupado}
              onEnter={submeter}
            />
          )}

          {/* Error que no pertenece a ningún campo (sin red, rate limit). */}
          {erro && erro.campo === null && (
            <p
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2.5 text-sm leading-snug text-danger-soft-fg"
            >
              {erro.message}
            </p>
          )}

          {modo === 'link' && linkEnviado && (
            <p
              role="status"
              className="rounded-lg border border-ok/40 bg-ok-soft px-3 py-2.5 text-sm leading-snug text-ok-soft-fg"
            >
              Enviamos um link para <strong>{email}</strong>. Abra pelo mesmo celular — o link
              entra direto no app.
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={ocupado}
            icon={modo === 'senha' ? <KeyRound size={20} aria-hidden /> : <Mail size={20} aria-hidden />}
          >
            {modo === 'senha' ? 'Entrar' : 'Enviar link de acesso'}
          </Button>

          {modo === 'senha' && (
            <Switch
              label="Manter conectado neste aparelho"
              description="Desligado, a sessão fecha quando você sair do app. Use em celular emprestado."
              checked={lembrar}
              onChange={(v) => {
                setLembrar(v)
                definirLembrarSessao(v)
              }}
            />
          )}
        </form>

        <footer className="mt-8 flex items-start gap-2 text-xs leading-snug text-fg-subtle">
          <ShieldCheck size={16} className="mt-px shrink-0" aria-hidden />
          <p>
            Esqueceu a senha? Use o link por e-mail acima. Se o e-mail não chegar, fale com o
            Jordi — o acesso é liberado por pessoa.
          </p>
        </footer>
      </div>
    </main>
  )
}

/** La silueta del formulario, no un spinner: nada salta cuando llega. */
function EsqueletoLogin() {
  return (
    <main className="flex min-h-screen-svh flex-col bg-bg px-safe pb-safe pt-safe text-fg">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-5 py-10">
        <div className="mb-4 flex flex-col items-center">
          <Logotipo size={56} comNome={false} />
        </div>
        <Skeleton variant="lista" count={3} />
      </div>
    </main>
  )
}
