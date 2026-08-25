# Deploy do Ventus v3

> Runbook. Cada passo tem **o comando exato** e **como verificar que funcionou**.
> Se a verificação falha, pare: o passo seguinte vai falhar de um jeito mais
> difícil de diagnosticar.
>
> Corte: 2026-08-25 · rama `claude/crm-web-app-redesign-f7tu7g`

---

## 0 · Antes de tocar em nada

### O v2 está em produção e compartilha o repositório

`/home/user/CRMbr/src` e `/home/user/CRMbr/api` são o CRM v2, **rodando hoje**,
com o time trabalhando dentro. O v3 vive inteiro em `/ventus3`. Nada deste
runbook toca o v2 — **desde que o projeto novo da Vercel tenha o root directory
`ventus3`**. Um projeto com root `.` compilaria o v2 por cima.

### O banco é o MESMO

Um só projeto Supabase (`wtrbvgqxgcfjacqcndmb`) serve os dois CRMs. As
migrações `0001`–`0011` e a `0100` (RLS, grants, views) **já estão aplicadas**.
A única que falta é a `0012_cron.sql`, e ela só deve ser aplicada depois do
deploy estar de pé (passo 5).

### Bloqueio conhecido antes de começar

**`/api/telegram` é um stub que devolve 501.** A biblioteca inteira do bot v3
existe (`api/telegram/_lib/`, 3.653 linhas: comandos, callbacks, sessões,
identidade, extração, fila idempotente), mas **falta o handler que roteia os
updates**. Consequência prática: os passos 6 e 7 (webhook e Mini App) ficam
bloqueados. O resto do deploy — app, PWA, avisos por push, jobs, APK — não
depende disso e pode ir hoje. Ver `ESTADO.md`, bloqueio 1.

---

## 1 · Criar o projeto na Vercel

| Campo | Valor |
|---|---|
| Repositório | `tomasdelvaso-crypto/CRMbr` |
| **Root Directory** | **`ventus3`** ← o campo que importa |
| Framework Preset | Vite (já vem do `vercel.json`) |
| Build Command | `npm run build` (= `type-check && vite build`) |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | 22.x (o `package.json` exige `>=20`) |
| **Production Branch** | **`claude/crm-web-app-redesign-f7tu7g`** |

> A Production Branch se troca em **Settings → Git → Production Branch**. Se
> ficar em `main`, todo deploy sai como *preview* e o domínio de produção
> aponta para o nada.

O `vercel.json` do `ventus3` declara as **11 funções** uma a uma, com
`maxDuration` por rota. O limite do plano Hobby é 12 — sobra exatamente uma.
Uma rota nova precisa ser adicionada lá **à mão** ou nasce com o default de 10 s.

**Verificar:** o primeiro deploy termina em verde e
`https://<projeto>.vercel.app/` pinta a tela de login.

---

## 2 · Variáveis de ambiente

A lista completa, com o que cada uma faz e qual arquivo a lê, está em
**`.env.example`** — ele é a fonte de verdade, não este documento.

Mínimo para o app subir de pé:

```
VITE_SUPABASE_URL           https://wtrbvgqxgcfjacqcndmb.supabase.co
VITE_SUPABASE_ANON_KEY      <anon key do projeto>
SUPABASE_URL                https://wtrbvgqxgcfjacqcndmb.supabase.co
SUPABASE_SERVICE_ROLE_KEY   <service_role key>       ← NUNCA com prefixo VITE_
SUPABASE_JWT_SECRET         <JWT secret do projeto>
ANTHROPIC_API_KEY           <ou CLAUDE_API_KEY, que é como o v2 a chama>
GROQ_API_KEY                <transcrição>
APP_URL                     https://ventus.ventapel.com.br
ALLOWED_ORIGIN              https://ventus.ventapel.com.br
CRON_SECRET                 <openssl rand -hex 32>
```

Depois: `VAPID_*` (passo 4), `TELEGRAM_*` (passos 6 e 7).

Duas armadilhas que já custaram tempo em outros projetos:

- **Nada de CORS no `vercel.json`.** O cabeçalho sai dos handlers
  (`api/_lib/http.ts` → `rota()`), com a origem ecoada e `Vary: Origin`.
  Declarar também na plataforma manda o cabeçalho **duplicado** e o navegador
  rejeita a resposta inteira — inclusive as que estavam certas.
- **`ALLOWED_ORIGIN` nunca é `*`.** Um `*` na lista é descartado de propósito
  (`origensPermitidas()`): `*` junto com credenciais é a combinação que o
  navegador recusa. Era o bug do v2.

**Verificar:**

```bash
curl -s https://<projeto>.vercel.app/api/health | jq
```

Espera-se `"ok": true` e as quatro dependências (`supabase`, `anthropic`,
`groq`, `auth`) em `ok`/`configurado`. Um `503` lista qual falta.
Atenção: **o health NÃO olha VAPID nem Telegram** — esses se verificam nos
passos 4 e 6.

---

## 3 · Domínio

Apontar `ventus.ventapel.com.br` para o projeto (Settings → Domains). O nome
aparece hardcoded como *fallback* em três lugares e trocá-lo depois obriga a
mexer nos três:

- `APP_URL` / `ALLOWED_ORIGIN` (env vars);
- `index.html` → `og:image` (URL absoluta: o WhatsApp não resolve relativa);
- `android/twa-manifest.json` → o APK **assinado** carrega o host dentro. Trocar
  o domínio depois do primeiro APK obriga a recompilar e **reinstalar nos 6
  aparelhos**. Decida antes do passo 8.

---

## 4 · Web Push (VAPID)

```bash
cd ventus3
node scripts/gerar-vapid.mjs --env
```

Saída (exemplo real do formato — **gere as suas**):

```
VAPID_PUBLIC_KEY=BOeHcuWX7Cbk2ppX1sv1Wo0FZe8NJWN_oF3-ai85_KPYz2JHxeuGamZO0P5pnZUdK61_AeD9f0raEs6YoBHax58
VAPID_PRIVATE_KEY=88jhW2mf6Jp5AcqXoAXxTIWt-RzMEGetqp2dm_Wey_U
VAPID_SUBJECT=mailto:ventus@ventapel.com.br
```

As três vão nas env vars da Vercel. **Nenhuma vai para o bundle**: a chave
pública (que não é segredo) chega ao aparelho por
`GET /api/dispatch/track?acao=chave`, com sessão. Por isso **não existe**
`VITE_VAPID_PUBLIC_KEY` — rotacionar a chave não pode depender de um rebuild.

**Rotacionar invalida todas as assinaturas**: cada aparelho precisa assinar de
novo. A app detecta e re-assina sozinha ao abrir (`assinarPush()` cancela a
assinatura velha antes, senão o `subscribe()` levanta `InvalidStateError` e o
aparelho fica sem push **para sempre**), mas até alguém abrir, não chega nada.

**Verificar** (com uma sessão válida no navegador):

```bash
curl -s -H "Authorization: Bearer <access_token>" \
  "https://ventus.ventapel.com.br/api/dispatch/track?acao=chave"
# {"chave":"BOeHcu..."}   ← se vier {"chave":null}, faltam as env vars
```

Depois, no aparelho: **Ajustes → Avisos → Autorizar**. No iPhone só funciona
com o app **instalado na tela de início** — o navegador não pergunta antes
disso, e perguntar cedo demais queima a única pergunta que o Safari permite.

---

## 5 · Jobs (pg_cron + pg_net)

**Ordem obrigatória: só depois do passo 2 verde.** Agendar antes é agendar
chamadas que dão 404 a cada minuto.

### 5.1 Gravar os segredos no Vault

No SQL Editor do Supabase, uma vez:

```sql
select vault.create_secret('https://ventus.ventapel.com.br', 'ventus_app_url',
       'Base absoluta do app v3');
select vault.create_secret('<o mesmo CRON_SECRET da Vercel>', 'ventus_cron_secret',
       'Bearer dos endpoints de cron do v3');
```

Os segredos ficam no Vault e **não** no comando do job: `cron.job` é legível
por qualquer um com acesso ao banco.

### 5.2 Aplicar a migração

`supabase/migrations/0012_cron.sql`, inteiro, no SQL Editor. Ela cria o schema
privado `ventus_cron` (fora do alcance do PostgREST), a função `chamar()`
fail-closed, e agenda os **dez jobs**:

| job | horário (BRT) | cron (UTC) |
|---|---|---|
| `ventus-run` — drena a fila e envia | todo minuto | `* * * * *` |
| `ventus-golden-t15` | a cada 5 min | `*/5 * * * *` |
| `ventus-preparo-reuniao` (T-90) | a cada 5 min | `*/5 * * * *` |
| `ventus-agenda-manha` | 07:00 seg-sex | `0 10 * * 1-5` |
| `ventus-risco` | 09:00 seg-sex | `0 12 * * 1-5` |
| `ventus-veredicto` | sexta 16:00 | `0 19 * * 5` |
| `ventus-trofeus` | sexta 17:00 | `0 20 * * 5` |
| `ventus-encerramento` | 18:00 seg-sex | `0 21 * * 1-5` |
| `ventus-fila-golden` | 18:05 seg-sex | `5 21 * * 1-5` |
| `ventus-auditoria` | 23:00 todo dia | `0 2 * * *` |

O servidor está em **UTC** e o Brasil não tem horário de verão desde 2019:
BRT = UTC-3, fixo.

**Só `ventus-run` envia alguma coisa.** Os outros nove **enfileiram**; quem
conhece o orçamento diário, o dedupe e as quiet hours é `_politica.ts`. Foi
assim que o v2 chegou a 17 avisos num dia para a mesma pessoa.

### 5.3 Verificar

```sql
-- 1) os dez jobs, ativos
select jobname, schedule, active from cron.job
 where jobname like 'ventus-%' order by jobname;

-- 2) disparar um inofensivo à mão
select ventus_cron.chamar('/api/health');

-- 3) o que o servidor respondeu
select id, status_code, left(content, 300)
  from net._http_response order by id desc limit 5;
--   200 → tudo certo
--   401 → o CRON_SECRET do Vault não é o da Vercel
--   404 → a URL do Vault aponta para outro lugar

-- 4) execuções e falhas
select jobname, status, return_message, start_time
  from cron.job_run_details
 where start_time > now() - interval '3 hours'
 order by start_time desc limit 30;
```

**Parar tudo** (rollback sem apagar nada):
`update cron.job set active = false where jobname like 'ventus-%';`

---

## 6 · Bot do Telegram — **BLOQUEADO**

> `api/telegram.ts` responde **501** a tudo hoje. Registrar o webhook agora faz
> o bot parar de responder e não ganha nada.

### 6.1 Antes de registrar: um bot só tem UM webhook

`setWebhook` **substitui** o webhook anterior desse token. Se o token for o do
bot v1 (`/home/user/ventus-bot`, que está no ar), apontá-lo para o v3
**desliga o v1 na hora**, sem aviso e sem rollback automático.

Faça a primeira volta com um **bot de teste** (`@BotFather` → `/newbot`), com o
token de teste nas env vars de *Preview* da Vercel. Só migre o bot de produção
quando o handler existir e o teste tiver passado.

### 6.2 Registrar (quando o handler existir)

```bash
BOT_TOKEN='123456:AA...'
SECRET='<o mesmo TELEGRAM_WEBHOOK_SECRET das env vars>'

curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"https://ventus.ventapel.com.br/api/telegram\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"edited_message\", \"callback_query\"],
    \"drop_pending_updates\": true,
    \"max_connections\": 40
  }"
```

`drop_pending_updates: true` na PRIMEIRA vez: senão o Telegram entrega de uma
vez toda a fila acumulada desde que o webhook velho parou de responder.

**Verificar:**

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq
```

Espera-se `"url"` com o endereço certo, `"pending_update_count": 0` e — o campo
que importa — **`last_error_message` ausente**. Se aparecer
`Wrong response from the webhook: 501 Not Implemented`, é o bloqueio deste
passo.

**Voltar atrás:** `curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook"`
e re-registrar o webhook do v1.

---

## 7 · Telegram Mini App — **depende do passo 6**

1. `@BotFather` → `/newapp` → escolher o bot → título, descrição, ícone 640×360,
   **URL = `https://ventus.ventapel.com.br`**, short name (ex.: `app`).
   Sem isto `t.me/<bot>/app` não existe e nenhum deep link abre nada.
2. Env var `TELEGRAM_BOT_USERNAME=<bot sem arroba>`. Com ela, os botões dos
   avisos abrem o **Mini App no destino exato**
   (`t.me/VentusBot/app?startapp=opp_1842_log`) em vez do navegador — o vendedor
   fica dentro do Telegram, já autenticado. Sem ela os botões viram a URL web de
   sempre, que funciona igual: é opcional de propósito.
3. Opcional: `TMA_INITDATA_TTL_SEG` (default 3600). O hash do Telegram não vence
   sozinho — quem olha o relógio é `auth_date`.

**Verificar:** abrir `t.me/<bot>/app` no celular. Tem que entrar **sem passar
pela tela de login**. Um **403** significa «este Telegram não está pareado»: só
os vendedores com `vendors.telegram_id` preenchido entram, porque a Edge
Function `pairing-code` ainda não existe (`ESTADO.md`, bloqueio 2).

---

## 8 · APK (TWA para Android)

O APK **não é compilado neste deploy**: sai do workflow
`.github/workflows/apk.yml`, que dispara com uma tag `v*`.

1. **GitHub → Settings → Secrets and variables → Actions:**
   - secret `ANDROID_KEYSTORE_BASE64` = `base64 -w0 ventus3/android/ventapel-ventus.keystore`
     (o `-w0` importa: sem ele o base64 vem quebrado em linhas)
   - secret `ANDROID_KEYSTORE_PASSWORD`
   - variable `VENTUS_URL` = `https://ventus.ventapel.com.br`
2. `public/.well-known/assetlinks.json` já tem o **SHA-256 real** do keystore
   (`node scripts/gerar-assetlinks.mjs --check` confirma). Ele precisa estar
   **publicado** para a TWA abrir sem a barra do Chrome:
   ```bash
   curl -sI https://ventus.ventapel.com.br/.well-known/assetlinks.json
   # HTTP/2 200 · content-type: application/json   ← o vercel.json força isso
   ```
   O `text/plain` é o erro clássico e faz a verificação de App Links falhar em
   silêncio.
3. `git tag v3.0.0 && git push origin v3.0.0` → o workflow compila com
   Bubblewrap e publica `ventus.apk` numa GitHub Release.
4. Env var `VITE_APK_URL` = a URL do asset da Release. **Sem ela, o botão
   «Baixar o APK» da tela `/instalar` simplesmente não aparece** — é de
   propósito: um botão que leva a 404 é pior que nenhum botão.

**Guardar hoje**, não depois: o keystore
(`ventus3/android/ventapel-ventus.keystore`, gitignorado) no cofre da Ventapel,
e a senha (`/home/user/ventus-keystore-pass.txt`) no gestor de senhas. Perder
esse arquivo = **nunca mais** conseguir atualizar o app instalado. Não tem
recuperação.

---

## 9 · Verificação final, na ordem

```bash
# 1 · o app responde e sabe quem é
curl -s https://ventus.ventapel.com.br/api/health | jq '.ok, .versao'

# 2 · o manifest é servido com o tipo certo
curl -sI https://ventus.ventapel.com.br/manifest.webmanifest | grep -i content-type
# application/manifest+json

# 3 · o service worker não é cacheado
curl -sI https://ventus.ventapel.com.br/sw.js | grep -i cache-control
# public, max-age=0, must-revalidate

# 4 · o assetlinks é JSON
curl -sI https://ventus.ventapel.com.br/.well-known/assetlinks.json | grep -i content-type

# 5 · a API não é engolida pelo rewrite de SPA
curl -s -o /dev/null -w '%{http_code}\n' https://ventus.ventapel.com.br/api/plan
# 401 (sem sessão) — nunca 200 com HTML dentro
```

Depois, no celular de verdade — é o único lugar onde o resto se verifica:

- [ ] Instalar (Android: banner nativo · iPhone: Compartilhar → Adicionar à
      Tela de Início). O ícone não pode sair cortado nem com fundo preto.
- [ ] Segurar o ícone: os **3 atalhos** (Registrar por voz, Golden Hour, Hoje).
- [ ] Entrar, ver a tela **Hoje** com as 3 cartas e registrar uma nota de voz.
- [ ] **Modo avião**: registrar assim mesmo, voltar a rede, ver a fila subir.
- [ ] Autorizar avisos e esperar um `ventus-run` (≤ 1 min) com algo na fila.
- [ ] Tocar o aviso: tem que abrir **na tela do aviso**, não na Hoje.

---

## 10 · Rollback

| O que | Como | Efeito |
|---|---|---|
| Deploy inteiro | Vercel → Deployments → *Promote to Production* no anterior | imediato |
| Só os jobs | `update cron.job set active=false where jobname like 'ventus-%'` | para de enfileirar e de enviar |
| Só os avisos | `VAPID_*` e `TELEGRAM_BOT_TOKEN` fora das env vars | o dispatcher fica sem transporte e não quebra |
| Webhook do bot | `deleteWebhook` + re-registrar o do v1 | volta o bot antigo |
| RLS / grants (`0100`) | bloco **D2** dentro do próprio arquivo da migração | recria as 23 policies anteriores |

**O v2 não tem rollback aqui porque não tem deploy aqui.** Se alguém reportar
algo estranho no v2 depois da migração `0100`, o caminho é o bloco D2 — não
mexer neste projeto.
