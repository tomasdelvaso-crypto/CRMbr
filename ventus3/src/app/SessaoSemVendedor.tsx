// src/app/SessaoSemVendedor.tsx
// Tela terminal para quando a sessão existe mas não há vendedor ligado a ela.
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUE É UMA TELA E NÃO UM AVISO EM CADA PANTALLA
// ══════════════════════════════════════════════════════════════════════════
// É o modo de falha de qualquer conta nova mal cadastrada: o login funciona
// (auth.users tem a linha), mas `resolverVendorDaSessao()` volta null porque
// ninguém ligou esse e-mail a uma linha de `vendors`. Antes desta tela, cada
// pantalla resolvia o problema à sua maneira ou não o resolvia: Hoje mostrava
// três esqueletos, a Carteira ficava vazia sem explicar por quê, e a maioria
// das outras nem chegava a pensar nisso. É exatamente o limbo que qualquer
// conta nova mal dada de alta vai encontrar primeiro.
//
// Vive uma vez só — no Shell — e cobre TODAS as rotas autenticadas de uma vez.
// Duas saídas, nenhuma delas um beco sem volta: tentar de novo (o vendedor
// pode aparecer sem precisar de deploy, é só o Jordi ligar o e-mail) ou sair.
//
// ── POR QUE `onSair` É OPCIONAL ──────────────────────────────────────────
// Este é o ÚNICO componente desta tela em toda a app, e o Shell não é o único
// que o monta: a tela Hoje guarda o mesmo caso por dentro, como defesa em
// profundidade, para o dia em que alguém a renderize fora do Shell (é o que
// fazem os smoke tests do router) — sem essa guarda, Hoje volta a ser três
// esqueletos eternos, que foi exatamente o bug relatado. Nesse uso não há
// como sair da conta com sentido (quem tem o `signOut` à mão é o chrome), e
// um botão de saída que não sai seria pior que nenhum. Ter DOIS componentes
// com o mesmo texto, que foi como as duas correções chegaram, era pior ainda:
// só um deles podia ser visto, e o outro envelhecia sem que ninguém notasse.

import { UserX } from 'lucide-react'
import { EmptyState } from '@/ui'

export function SessaoSemVendedor({
  onTentar,
  onSair,
}: {
  onTentar: () => void
  /** Sem ela, a tela fica só com «Tentar de novo». Ver o cabeçalho. */
  onSair?: () => void
}) {
  return (
    <div className="px-4 pb-6 pt-10">
      <EmptyState
        icon={<UserX size={28} aria-hidden />}
        title="Ainda não achamos o seu nome de vendedor"
        description="Sua conta ainda não está ligada a um vendedor. Fale com o Jordi — é um ajuste de um minuto. Enquanto isso, você pode tentar de novo ou sair."
        actionLabel="Tentar de novo"
        onAction={onTentar}
        {...(onSair ? { secondaryLabel: 'Sair da conta', onSecondary: onSair } : {})}
      />
    </div>
  )
}
