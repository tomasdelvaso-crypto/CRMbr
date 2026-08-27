# Ventus v3

CRM de campo da Ventapel Brasil. Metodologia PPVVCC, mobile-first,
offline-first. Interface inteira em PT-BR; comentários de código em espanhol.

**No ar em https://ventus3.vercel.app** — deploy automático a partir da rama
`claude/crm-web-app-redesign-f7tu7g`, root directory `ventus3`.

Convive com o CRM v2 (`/home/user/CRMbr/src` e `/home/user/CRMbr/api`), que
segue **em produção**, até o corte. **O v2 não se toca.** Todo o v3 vive dentro
de `ventus3/`.

---

## Em que estado está — a versão honesta

**Funciona e está no ar:** as 15 telas, a PWA instalável, o Web Push, os 12
endpoints de `api/` (incluindo o webhook do bot e o emissor de códigos de
emparelhamento), a camada offline com fila de saída, e o motor determinístico
que decide as três ações do dia. 868 testes verdes, `type-check`, `eslint` e
`build` limpos.

**O banco está pronto:** as 12 migrações do v3 estão aplicadas no projeto
Supabase `wtrbvgqxgcfjacqcndmb`, com o RLS saneado e re-verificado — `anon` não
tem nenhum grant sobre tabelas, e há 67 policies sobre `authenticated`.

**O que falta**, por ordem de prioridade:

| # | o quê | onde está o passo a passo |
|---|---|---|
| 1 | Carregar os 2 secrets do APK no GitHub e empurrar uma tag `v*` | `docs/ANDROID.md` §2-3 |
| 2 | Respaldar o keystore e a senha em dois cofres diferentes | `docs/ANDROID.md` §7 |
| 3 | Trâmite Limited Distribution do Google — **prazo 30/09/2026** | `docs/ANDROID.md` §8 |
| 4 | Aplicar `0014_cron.sql` (sem ela não sai nenhum aviso) | `docs/DEPLOY.md` §5 |
| 5 | Webhook do bot no Telegram — ⚠️ um token tem **um** webhook | `docs/DEPLOY.md` §6.1 |
| 6 | Emparelhar os vendedores e registrar o Mini App no @BotFather | `docs/DEPLOY.md` §6.4, §7 |
| 7 | Testar em telefone de verdade (um iPhone e um Android) | `docs/ESTADO.md` §5.1-bis |

A lista completa, com os 43 itens e o que é andaime declarado, está em
`docs/ESTADO.md`.

**Duas coisas que valem um aviso antes de qualquer coisa:**

- **Um token de Telegram tem UM só webhook.** Apontar o token de produção para
  o v3 apaga o bot v1 que o time usa hoje, no mesmo segundo. A primeira volta
  vai com um bot de teste. `docs/DEPLOY.md` §6.1.
- **O keystore do Android é insubstituível.** Perdê-lo significa nunca mais
  conseguir atualizar a app instalada nos telefones. Não há recuperação.
  `docs/ANDROID.md` §7.

---

## Rodar

```bash
cd ventus3
cp .env.example .env      # e preencha VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

| Script | O que faz |
|---|---|
| `npm run dev` | Vite em modo desenvolvimento (host exposto, para testar no celular da rede) |
| `npm run build` | `type-check` + build de produção em `dist/` |
| `npm run preview` | Serve `dist/` localmente |
| `npm run type-check` | `tsc --noEmit` nos três projetos (app, node/api, service worker) |
| `npm test` | Vitest: domínio, capa de dados, telas e `api/` |
| `npm run lint` | ESLint 10 (flat config) |
| `npm run verificar:pwa` | Checa ícones e instalabilidade sobre `dist/` |
| `npx playwright test` | 87 testes de interação em iPhone 14, Pixel 7 e desktop |
| `npm run url` | Imprime a URL pública (a fonte única) |
| `npm run url:sync` / `url:check` | Alinha e confere `android/twa-manifest.json` com essa URL |
| `npm run assetlinks` | Keystore → `public/.well-known/assetlinks.json` |
| `npm run assetlinks:check` | Confere que o arquivo bate com o keystore (roda no CI do APK) |
| `npm run assetlinks:verificar` | Baixa o publicado e diz se a TWA vai abrir sem a barra do Chrome |
| `npm run apk` | Compila o APK localmente (exige Android SDK — normalmente use a tag `v*`) |

O service worker **não** roda em `dev` (`devOptions.enabled: false`).
Para testar PWA e offline: `npm run build && npm run preview`.

---

## A URL do site vive num lugar só

`config/url-publica.txt`. Dela leem o `og:image`/`og:url` do `index.html`
(injetados no build), o `scripts/build-apk.sh`, o `gerar-assetlinks.mjs
--verificar` e o `.github/workflows/apk.yml`. A variável de ambiente
`VENTUS_URL` pisa o arquivo em qualquer um deles.

Hoje é `https://ventus3.vercel.app`. **`ventus.ventapel.com.br` ainda não
existe.** O dia em que existir: `docs/ANDROID.md` §4 e `docs/DEPLOY.md` §3 —
lembrando que trocar a URL obriga a recompilar e **reinstalar o APK nos 6
telefones**, porque o host vai assinado dentro dele.

`src/data/__tests__/url-publica.test.ts` falha se alguém voltar a escrever um
host à mão.

---

## Documentos

| Arquivo | O que responde |
|---|---|
| `docs/ESTADO.md` | **Em que ponto estamos.** O que funciona, o que é andaime, o que falta. Começa pelo §0. |
| `docs/DEPLOY.md` | Os passos exatos para produção, com o comando e como verificar cada um. |
| `docs/ANDROID.md` | O APK (TWA), o keystore, o assetlinks e o trâmite do Google. Guia completo, sem contexto prévio. |
| `docs/QA.md` | A suite de Playwright: o que cobre e o que não. |
| `docs/PLANO.md` | O plano de produto completo. |
| `docs/AUDITORIA.md` | A auditoria do v2 que originou tudo isto. |
| `.env.example` | **A lista completa** das variáveis de ambiente, cada uma com o arquivo que a lê. |

---

## Estrutura

```
ventus3/
  index.html            lang="pt-BR", viewport-fit=cover, %VENTUS_URL% no Open Graph
  vite.config.ts        react + tailwind v4 + VitePWA (injectManifest) + alias '@'
  vercel.json           as 12 funções uma a uma, Content-Type do assetlinks.json
  config/               url-publica.txt — a fonte única da URL do site
  public/               ícones (any + maskable), favicon, .well-known/assetlinks.json
  src/
    main.tsx            entrada; registra o SW em modo 'prompt'
    sw.ts / sw-push.ts  service worker próprio; NUNCA intercepta /api
    app/                App, routes, Shell, BottomNav, Theme/SessionProvider
    core/               DOMÍNIO PURO, isomórfico, sem rede nem DOM
    data/               supabase, dexie, outbox, sync, queries, realtime
    ui/                 design system
    host/               adaptador de anfitrião (navegador/PWA vs Telegram Mini App)
    push/ install/      Web Push e identidade instalável
    screens/            uma pasta por tela
  api/                  funções serverless da Vercel
  supabase/migrations/  SQL versionado
  android/              TWA: twa-manifest.json versionado, o resto é gerado
  scripts/              build-apk.sh, gerar-assetlinks.mjs, url-publica.mjs, ícones
  e2e/                  Playwright
```

O workflow do APK vive em `../.github/workflows/apk.yml` — **na raiz do
repositório**, porque o Actions só lê workflows de lá, ainda que o projeto viva
em `ventus3/`.

### As duas regras que sustentam a arquitetura

1. **`src/core` é puro.** Roda no navegador (offline, sem tokens), nas funções
   de `api/` e no bot do Telegram. Não importa rede, DOM nem Supabase. O motor
   determinístico (`rankDay`, gates, cadência, risco, PA) decide prioridade; a
   camada LLM só redige, extrai e explica.
2. **`api/` importa o domínio por caminho relativo** (`../src/core`), do mesmo
   jeito que o v2 compartilha `api/_lib/ppvvcc.js`. Uma só app Vite, um só
   deploy na Vercel — sem workspaces nem Turborepo.

---

## Regras duras do projeto

- Todo texto visível ao usuário em **PT-BR**; comentários de código em espanhol.
- TypeScript estrito. Nada de `any` fora de fronteiras com libs sem tipos.
- Mobile-first: `100svh` (nunca `100dvh`), `env(safe-area-inset-*)`, alvos de
  toque ≥ 44px, dark mode desde o dia 1.
- Zero `alert()` / `confirm()`: sheets e toasts com desfazer.
- Zero queries por linha: cada tela consome UMA view/RPC agregada.
- O SW nunca intercepta `/api` nem o Supabase — dados sempre frescos.
- `registerType: 'prompt'`: o app nunca se recarrega sozinho.
- **Não sair sem data.** Adiar cria uma tarefa *com* data; não existe "dismiss".
  É assim que o v2 chegou a 36 de 40 oportunidades vivas sem próxima ação.
- **Não inventar um 0 por um dado que não se tem.** Do colega sem snapshot se
  diz «sem dados». Um 0 fabricado acusa alguém de não trabalhar.

A lista longa de coisas fáceis de quebrar sem perceber está em `docs/ESTADO.md`
§6. Vale ler antes do primeiro commit.
