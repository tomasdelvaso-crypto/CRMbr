// src/screens/Diagnostico.tsx
// Pantalla que reemplaza a la app cuando el build salió sin configuración.
// Deliberadamente sin dependencias: no usa el design system ni Supabase,
// porque justamente lo que falló es la capa de datos. Estilos en línea para
// que funcione aunque el CSS no haya cargado.

interface Props {
  faltando: readonly string[]
  /** Las que existen pero traen un valor que no puede funcionar. */
  malformadas?: readonly string[]
}

export function Diagnostico({ faltando, malformadas = [] }: Props) {
  const sujas = new Set(malformadas)
  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        background: '#0b1220',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: '34rem', lineHeight: 1.6 }}>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px', color: '#f8fafc' }}>
          Ventus não conseguiu iniciar
        </h1>
        <p style={{ margin: '0 0 20px', color: '#94a3b8' }}>
          O aplicativo foi publicado sem as variáveis de ambiente que apontam para o banco de
          dados. Não é um problema do seu aparelho nem da sua conta: o build precisa ser refeito.
        </p>

        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No build:</p>
        <ul style={{ margin: '0 0 20px', paddingLeft: '1.2rem' }}>
          {faltando.map((nome) => (
            <li key={nome} style={{ marginBottom: '6px' }}>
              <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px' }}>
                {nome}
              </code>{' '}
              {sujas.has(nome) ? (
                <span style={{ color: '#fca5a5' }}>
                  — existe, mas o valor não serve. O erro mais comum é ter colado a linha
                  inteira <code>NOME=valor</code> no campo do valor: ali vai <strong>só</strong>{' '}
                  o valor.
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>— ausente</span>
              )}
            </li>
          ))}
        </ul>

        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Como resolver</p>
        <ol style={{ margin: '0 0 20px', paddingLeft: '1.2rem', color: '#cbd5e1' }}>
          <li>
            No Vercel, abra <strong>Settings › Environment Variables</strong> do projeto.
          </li>
          <li>
            Confirme que os nomes começam com <code>VITE_</code> — sem esse prefixo o Vite não as
            enxerga.
          </li>
          <li>
            Confirme que estão marcadas para o ambiente <strong>Production</strong>.
          </li>
          <li>
            Faça um <strong>Redeploy sem cache de build</strong>: estas variáveis entram no
            momento da compilação, não em tempo de execução.
          </li>
        </ol>

        <p style={{ margin: 0, fontSize: '.9rem', color: '#64748b' }}>
          As duas são públicas por natureza — viajam no bundle e a chave anon é publicável. Quem
          protege os dados é o RLS do banco.
        </p>
      </div>
    </main>
  )
}
