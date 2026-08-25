# Ventus v3

CRM de campo da Ventapel Brasil. Metodologia PPVVCC, mobile-first, offline-first.
Interface inteira em PT-BR; comentários de código em espanhol.

Convive com o CRM v2 (`/home/user/CRMbr/src` e `/home/user/CRMbr/api`) até o corte.
**O v2 não se toca.** Todo o v3 vive dentro de `ventus3/`.

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
| `npm test` | Vitest sobre o domínio puro (`src/core`) |
| `npm run lint` | ESLint 10 (flat config) |

O service worker **não** roda em `dev` (`devOptions.enabled: false`).
Para testar PWA e offline use `npm run build && npm run preview`.

## Estrutura

```
ventus3/
  index.html            lang="pt-BR", viewport-fit=cover, theme-color claro/escuro
  vite.config.ts        react + tailwind v4 + VitePWA (injectManifest) + alias '@'
  vercel.json           functions, CORS específico, Content-Type do assetlinks.json
  public/               ícones, favicon, .well-known/assetlinks.json (placeholder)
  src/
    main.tsx            entrada; registra o SW em modo 'prompt'
    index.css           tokens de cor (claro/escuro), safe areas, utilidades base
    sw.ts               service worker próprio; NUNCA intercepta /api
    app/                App, routes, Shell, BottomNav, Theme/SessionProvider
    core/               DOMÍNIO PURO, isomórfico, sem rede nem DOM
    data/               supabase, dexie, outbox, sync, queries, realtime
    ui/                 design system (contratos)
    screens/            uma pasta por tela
  api/                  funções serverless da Vercel (stubs 501)
  supabase/migrations/  SQL versionado
  android/              projeto Bubblewrap (TWA) — gerado, fora do git
```

### As duas regras que sustentam a arquitetura

1. **`src/core` é puro.** Roda no navegador (offline, sem tokens), nas funções
   de `api/` e no bot do Telegram. Não importa rede, DOM nem Supabase.
   O motor determinístico (`rankDay`, gates, cadência, risco, PA) decide
   prioridade; a camada LLM só redige, extrai e explica.
2. **`api/` importa o domínio por caminho relativo** (`../src/core`), do mesmo
   jeito que o v2 compartilha `api/_lib/ppvvcc.js`. Uma só app Vite, um só
   deploy na Vercel — sem workspaces nem Turborepo.

## Regras duras do projeto

- Todo texto visível ao usuário em **PT-BR**; comentários de código em espanhol.
- TypeScript estrito. Nada de `any` fora de fronteiras com libs sem tipos.
- Mobile-first: `100svh` (nunca `100dvh`), `env(safe-area-inset-*)`,
  alvos de toque ≥ 44px, dark mode desde o dia 1.
- Zero `alert()` / `confirm()`: sheets e toasts com desfazer.
- Zero queries por linha: cada tela consome UMA view/RPC agregada.
- O SW nunca intercepta `/api` nem o Supabase — dados sempre frescos.
- `registerType: 'prompt'`: o app nunca se recarrega sozinho.

## Estado atual

Esqueleto compilando. `src/core`, `src/data`, `src/ui` e `api/` têm as
assinaturas exportadas com `throw new Error('TODO: ...')` no corpo — outros
agentes preenchem. As telas renderizam um placeholder com o próprio nome para
que o roteamento funcione de ponta a ponta.

Já estão portados de verdade, verbatim do v2:
`SCALE_DEFINITIONS` (6 × 11 níveis), `STAGES`, `STAGE_GATES`,
`PRODUCT_LINE_LABELS` e `CADENCE_SCHEDULE`.

## Android (TWA)

`public/.well-known/assetlinks.json` está com fingerprint **placeholder**.
Antes de publicar: gerar o keystore RSA 4096, registrar o fingerprint real e
conferir num celular de verdade — se aparecer a barra do Chrome, a verificação
falhou. O `Content-Type: application/json` desse arquivo já está forçado no
`vercel.json` (a Vercel às vezes o serve como texto puro e a verificação falha
em silêncio).
