# Deploy do Ventus v3

> Runbook. Cada passo tem **o comando exato** e **como verificar que funcionou**.
> Se a verificação falha, pare: o passo seguinte vai falhar de um jeito mais
> difícil de diagnosticar.
>
> Corte: 2026-08-26 · rama `claude/crm-web-app-redesign-f7tu7g`

---

## 0-bis · O que JÁ está feito (26/08/2026)

Este runbook foi escrito antes do primeiro deploy. Boa parte já aconteceu.
O que **não** é preciso refazer:

| passo | estado |
|---|---|
| §1 · projeto na Vercel | **feito** — no ar em `https://ventus3.vercel.app`, root directory `ventus3`, deploy automático desde `claude/crm-web-app-redesign-f7tu7g` |
| §2 · variáveis de ambiente | **feito** — `/api/health` responde `ok:true` com Supabase, Anthropic, Groq e auth configurados |
| banco · migrações `0001`–`0014` e a `0100` | **aplicadas** no projeto `wtrbvgqxgcfjacqcndmb`. Desde 27/08 o diretório `supabase/migrations/` mapeia **1 a 1** contra `schema_migrations` |
| banco · jobs de `pg_cron` | **agendados e ativos** (11 jobs `ventus-%`) desde 27/08 — mas o endpoint que eles chamam está caído, ver **§5.4** |
| banco · RLS e grants | **saneados e verificados**: `anon` sem nenhum grant, 67 policies sobre `authenticated` |
| APK · assetlinks.json | **com o SHA-256 real** do keystore, conferido (`npm run assetlinks:check`) |
| APK · workflow | **revisado linha a linha**; falta só carregar os dois secrets |

O que **falta**, por ordem de prioridade, está em `ESTADO.md` §5. Os passos
deste documento que continuam pendentes são o **§3** (domínio próprio),
o **§4** (VAPID), o **§6** (webhook do bot — leia o §6.1 antes de tocar em nada)
e o **§8** (APK).

---

## 0 · Antes de tocar em nada

### O v2 está em produção e compartilha o repositório

`/home/user/CRMbr/src` e `/home/user/CRMbr/api` são o CRM v2, **rodando hoje**,
com o time trabalhando dentro. O v3 vive inteiro em `/ventus3`. Nada deste
runbook toca o v2 — **desde que o projeto novo da Vercel tenha o root directory
`ventus3`**. Um projeto com root `.` compilaria o v2 por cima.

### O banco é o MESMO

Um só projeto Supabase (`wtrbvgqxgcfjacqcndmb`) serve os dois CRMs. As
migrações `0001`–`0014` e a `0100` (RLS, grants, views) **já estão aplicadas**,
`0014_cron.sql` inclusive (27/08). Não falta nenhuma.

> **Numeração:** o arquivo dos jobs chamou-se `0012_cron.sql` até 27/08. Os
> números 0012 e 0013 já estavam tomados no banco por migrações corridas direto
> (`ventus3_0012_revoke_trigger_fn_authenticated` e
> `ventus3_0013_backfill_tasks`), então virou `0014_cron.sql`. Se você achar um
> `0012_cron.sql` em algum lugar, é um documento velho.

### O bot v1 está no ar e um token tem UM webhook

`/api/telegram` **já está implementado** (o roteamento existe; era o bloqueio 1
de `ESTADO.md`) e `/api/pairing-code` também (bloqueio 2). O que continua sendo
um risco real é o passo 6: **apontar o webhook do token de produção para o v3
desliga o bot v1 na hora**, porque o Telegram guarda um webhook por token. Leia
o §6.1 inteiro antes de rodar qualquer `setWebhook`.

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
APP_URL                     https://ventus3.vercel.app    ← hoje. Ver §3
ALLOWED_ORIGIN              https://ventus3.vercel.app
CRON_SECRET                 <openssl rand -hex 32>
```

Depois: `VAPID_*` (passo 4), `TELEGRAM_*` (passos 6 e 7).

**`TELEGRAM_WEBHOOK_SECRET` não é opcional.** `api/telegram.ts` é fail-**closed**:
sem ela o webhook responde `500` a tudo e não processa nenhum update (o
`/api/digest` do v2 fazia o contrário, fail-open, e está na lista de bugs do
plano). Gere com `openssl rand -hex 32` e use **exatamente o mesmo valor** no
`secret_token` do `setWebhook` do §6.2 — o handler compara em tempo constante e
um byte diferente é um `401`.

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

**Hoje a URL de produção é `https://ventus3.vercel.app`.**
`ventus.ventapel.com.br` **ainda não existe** — não é um domínio configurado
esperando DNS, é um nome que ninguém registrou. Onde ele aparecia escrito à
mão, agora aparece a URL real.

A URL vive num lugar só: **`ventus3/config/url-publica.txt`**. Dela leem o
`index.html` (og:image e og:url, injetados no build por um plugin de
`vite.config.ts`), o `scripts/build-apk.sh`, o `gerar-assetlinks.mjs
--verificar` e o `.github/workflows/apk.yml`. A variável de ambiente
`VENTUS_URL` pisa o arquivo em qualquer um deles.

Fora dessa fonte única sobram só as env vars do backend, que a Vercel gerencia:
`APP_URL` e `ALLOWED_ORIGIN`.

### O dia em que existir ventus.ventapel.com.br

1. Vercel → Settings → Domains → apontar o domínio ao projeto e esperar o
   certificado.
2. `ventus3/config/url-publica.txt`: mudar a única linha.
3. `cd ventus3 && npm run url:sync && npm run url:check`
4. Vercel: atualizar `APP_URL` e `ALLOWED_ORIGIN`.
5. Deploy. Conferir: `npm run assetlinks:verificar` tem que passar contra o
   host novo (o assetlinks só vale publicado).
6. **APK novo e reinstalação nos 6 aparelhos**: o host vai *assinado* dentro do
   APK. Passo a passo em `ANDROID.md` §4.

O passo 6 é a razão de decidir o domínio **antes** do primeiro APK, não depois.

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
  "https://ventus3.vercel.app/api/dispatch/track?acao=chave"
# {"chave":"BOeHcu..."}   ← se vier {"chave":null}, faltam as env vars
```

Depois, no aparelho: **Ajustes → Avisos → Autorizar**. No iPhone só funciona
com o app **instalado na tela de início** — o navegador não pergunta antes
disso, e perguntar cedo demais queima a única pergunta que o Safari permite.

---

## 5 · Jobs (pg_cron + pg_net)

> **FEITO em 2026-08-27.** Os segredos estão no Vault e `0014_cron.sql` foi
> aplicada como `ventus3_0014_cron` (version `20260827112510`). Os **onze** jobs
> `ventus-%` existem e estão `active = true`. Esta seção fica como runbook para
> reaplicar ou recriar.
>
> **`CRON_SECRET` já está nas env vars da Vercel** (carregado em 2026-08-27,
> por volta das 12:25 UTC) e o defeito do §5.4 já foi corrigido. O caminho
> inteiro responde **200** desde as 12:26 UTC. Detalhe medido no §5.4.

**Ordem obrigatória: só depois do passo 2 verde.** Agendar antes é agendar
chamadas que dão 404 a cada minuto.

### 5.1 Gravar os segredos no Vault

No SQL Editor do Supabase, uma vez:

```sql
select vault.create_secret('https://ventus3.vercel.app', 'ventus_app_url',
       'Base absoluta do app v3');
select vault.create_secret('<o mesmo CRON_SECRET da Vercel>', 'ventus_cron_secret',
       'Bearer dos endpoints de cron do v3');
```

Os segredos ficam no Vault e **não** no comando do job: `cron.job` é legível
por qualquer um com acesso ao banco.

### 5.2 Aplicar a migração

`supabase/migrations/0014_cron.sql`, inteiro, no SQL Editor. Ela cria o schema
privado `ventus_cron` (fora do alcance do PostgREST), a função `chamar()`
fail-closed, e agenda os **onze jobs**:

| job | horário (BRT) | cron (UTC) |
|---|---|---|
| `ventus-run` — drena a fila e envia | todo minuto | `* * * * *` |
| `ventus-golden-t15` | a cada 5 min | `*/5 * * * *` |
| `ventus-preparo-reuniao` (T-90) | a cada 5 min | `*/5 * * * *` |
| `ventus-reprocesso` — re-drive da fila do bot | a cada 10 min, 24×7 | `*/10 * * * *` |
| `ventus-agenda-manha` | 07:00 seg-sex | `0 10 * * 1-5` |
| `ventus-risco` | 09:00 seg-sex | `0 12 * * 1-5` |
| `ventus-veredicto` | sexta 16:00 | `0 19 * * 5` |
| `ventus-trofeus` | sexta 17:00 | `0 20 * * 5` |
| `ventus-encerramento` | 18:00 seg-sex | `0 21 * * 1-5` |
| `ventus-fila-golden` | 18:05 seg-sex | `5 21 * * 1-5` |
| `ventus-auditoria` | 23:00 todo dia | `0 2 * * *` |

O servidor está em **UTC** e o Brasil não tem horário de verão desde 2019:
BRT = UTC-3, fixo. Os quatro jobs de intervalo (`run`, `golden-t15`,
`preparo-reuniao`, `reprocesso`) não têm horário BRT porque não são eventos do
dia.

**Só `ventus-run` envia alguma coisa.** Os oito jobs de aviso **enfileiram**;
quem conhece o orçamento diário, o dedupe e as quiet hours é `_politica.ts`. Foi
assim que o v2 chegou a 17 avisos num dia para a mesma pessoa. Os outros dois não
enfileiram nada: `ventus-auditoria` escreve `flag_calibracao` em `ventus_audit`, e
`ventus-reprocesso` faz `POST /api/dispatch/jobs?job=reprocesso`, que varre
`pendentesDeReprocesso()` do `bot_log` e devolve cada update a
`processarUpdate()` — o áudio que falhou porque o Groq caiu no meio volta a ser
processado em vez de se perder. Entrou como mais um nome do router de
`api/dispatch/jobs.ts` e não como rota nova de propósito: o `vercel.json` está
nas 12 funções, o teto do plano Hobby.

### 5.3 Verificar

```sql
-- 1) os onze jobs, ativos
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
--   405 «Use GET nesta rota» → NORMAL no passo 2: `chamar()` faz POST e
--       /api/health só aceita GET. Já prova o que importa — DNS, TLS, a URL do
--       Vault e o deploy de pé. Para exercitar o Bearer, chame antes
--       `/api/dispatch/jobs?job=auditoria`, que é POST e não manda nada a
--       ninguém (só escreve em ventus_audit).

-- 4) execuções e falhas
select jobname, status, return_message, start_time
  from cron.job_run_details
 where start_time > now() - interval '3 hours'
 order by start_time desc limit 30;
```

**Parar tudo** (rollback sem apagar nada):
`update cron.job set active = false where jobname like 'ventus-%';`

### 5.4 · ⚠️ O que a primeira corrida encontrou (2026-08-27)

Os jobs foram aplicados e a verificação do §5.3 rodou de imediato. **pg_cron e
pg_net fizeram a parte deles desde o primeiro minuto**; o outro lado levou uma
hora para ficar verde, em dois consertos. A história inteira, medida sobre
`net._http_response` — que é o que o banco viu o servidor responder:

| janela (UTC) | resposta | n |
|---|---|---|
| 11:26 → 11:52 | 500 `FUNCTION_INVOCATION_FAILED` | 40 |
| 11:53 → 12:25 | 500 `nao_configurado` | 51 |
| 12:26 → 12:35 | **200 `{"ok":true,…}`** | 14 |

E o estado de hoje:

| verificação | saída real |
|---|---|
| `cron.job` | os 11 jobs `ventus-%`, todos `active = true` |
| `cron.job_run_details` | zero `failed` nas últimas 6 h |
| `chamar('/api/health')` | **405** «Use GET nesta rota» (esperado: `chamar()` faz POST) |
| `POST /api/dispatch/run` | **200** `{"ok":true,…}`, todo minuto |
| `POST /api/dispatch/jobs?job=golden-t15` | **200** `{"job":"golden-t15",…}` |
| `POST /api/dispatch/jobs?job=reprocesso` | **400 `job_invalido`** ← única pendência, ver o fim desta seção |

**O primeiro 500 não tinha nada a ver com o cron.** O log de runtime da Vercel:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/var/task/ventus3/src/core/types'
  imported from /var/task/ventus3/src/core/index.js
```

`src/core/index.ts` reexportava sem extensão (`export * from './types'`). O Vite
resolve isso; o runtime **Node ESM** da Vercel não. Derrubava **toda** função de
`api/` que importasse `src/core/index.js` — `dispatch/run`, `dispatch/jobs`,
`telegram`, `act`, `plan`, `ingest`, `ventus` —, ou seja quase o backend inteiro.
`/api/health`, que não importa nada de `src/`, respondia normal, e era por isso
que o §2 aparecia verde. **Corrigido** pelo commit `2e1bf82`, que pôs `.js` nos
29 imports relativos dos nove arquivos de `src/core/*.ts`.

**O segundo 500 era o segredo mesmo**, e apagou quando o dono carregou
`CRON_SECRET` na Vercel. Responder **200 e não 401** a partir dali prova — só
olhando o status, sem ler valor nenhum — que o segredo da Vercel e o
`ventus_cron_secret` do Vault **são o mesmo**.

**A única pendência é um 400.** `ventus-reprocesso` chama
`/api/dispatch/jobs?job=reprocesso`, e esse nome ainda só existe no
`api/dispatch/jobs.ts` da árvore local, sem commit. Resolve-se com um push: o
deploy sai sozinho a partir da branch.

---

## 6 · Bot do Telegram

`api/telegram.ts` roteia os updates: verifica o `secret_token`, reivindica o
`update_id` em `bot_log` (claim em duas fases), despacha para comando / áudio /
texto / botão inline, e responde **200 sempre**. Os comandos ligados são
`/hoje` `/golden` `/anel` `/placar` `/compromissos` `/status` `/pendentes`
`/parados` `/pipeline` `/vincular` `/desfazer` `/ajuda` `/id`.

### 6.1 · ⚠️ UM TOKEN TEM UM SÓ WEBHOOK — apontar o v3 APAGA o v1

`setWebhook` **substitui** o webhook anterior desse token. Não há dois. Não há
aviso. Não há rollback automático.

> O bot v1 (`/home/user/ventus-bot`) está **em produção e o time usa hoje**. Se
> você rodar o `setWebhook` do §6.2 com o token de produção, o v1 para de
> responder **no mesmo segundo** — os áudios que o time mandar a partir daí vão
> para o v3, e o que o v3 ainda não souber fazer ninguém faz.

**Antes de qualquer coisa, guarde o estado atual** — depois do `setWebhook` ele
não está em lugar nenhum:

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq > /tmp/webhook-v1.json
```

Por isso: **a primeira volta é com um bot de teste.**

```bash
# 1. @BotFather → /newbot → anota o token de TESTE
# 2. Vercel → Settings → Environment Variables → escopo *Preview*:
#      TELEGRAM_BOT_TOKEN      = <token de teste>
#      TELEGRAM_WEBHOOK_SECRET = <openssl rand -hex 32>
# 3. registra o webhook do §6.2 contra a URL de Preview
# 4. manda /id, /ajuda, /hoje e um áudio de 20s pelo bot de TESTE
```

Só depois que essa volta passar inteira se migra o bot de produção — e de
preferência fora do horário comercial, com o time avisado.

### 6.2 · Registrar o webhook

```bash
BOT_TOKEN='123456:AA...'                                   # de TESTE na 1ª volta
SECRET='<o mesmo TELEGRAM_WEBHOOK_SECRET das env vars>'
URL='https://ventus3.vercel.app/api/telegram'               # ou a URL de Preview

curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"${URL}\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"edited_message\", \"callback_query\"],
    \"drop_pending_updates\": true,
    \"max_connections\": 40
  }"
# {"ok":true,"result":true,"description":"Webhook was set"}
```

`drop_pending_updates: true` na PRIMEIRA vez: senão o Telegram entrega de uma
vez toda a fila acumulada desde que o webhook velho parou de responder.
Nas vezes seguintes, **tire essa linha** — ela descarta trabalho real.

`allowed_updates` é a lista exata que o handler entende. Pedir mais tipos só
gera updates que ele classifica como `ignorado` e descarta.

### 6.3 · Verificar

```bash
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq
```

| Campo | O que tem que aparecer |
|---|---|
| `url` | exatamente a URL do §6.2 |
| `pending_update_count` | `0` |
| `last_error_message` | **ausente** |
| `has_custom_certificate` | `false` |

Um `Wrong response from the webhook: 401 Unauthorized` significa que o
`secret_token` do `setWebhook` e a env var `TELEGRAM_WEBHOOK_SECRET` **não são
o mesmo texto**. Um `500` significa que a env var não existe no ambiente.

Depois, no chat do bot, na ordem:

```
/id          → devolve o seu Telegram ID e o ID do chat (funciona sem vínculo)
/vincular <código de 6 dígitos gerado em Ajustes → Telegram>   → §6.4
/ajuda       → o menu
/hoje        → as 3 ações do dia com botões
<áudio 20s>  → "🎙 Ouvindo o áudio…" em menos de 1s, e depois a confirmação
               NO MESMO mensagem, editada
```

O ack tem que chegar **antes** da transcrição: é o desenho do §5 do
`api/telegram.ts`. Se demorar, olhe os logs da função — o gargalo é o
`getFile` do Telegram, não o Groq.

### 6.4 · Emparelhar os vendedores (`/api/pairing-code`)

`pairing_codes` tem `revoke all … from anon, authenticated`: o código de 6
dígitos **só** o emite o servidor. `POST /api/pairing-code` faz isso, com o JWT
do vendedor; o `vendor_id` do corpo é ignorado de propósito (vale o do token).

Hoje só Renata, Jordi e Tomás têm `vendors.telegram_id` carregado à mão.
**Victor Hugo, Andre e Paulo entram por aqui**, cada um do seu telefone:

1. app → **Ajustes → Telegram → Gerar código**
2. no chat do bot: `/vincular 482913`
3. o bot responde «Pronto, <nome>. Este Telegram ficou ligado ao Ventus.»

Regras do código: 6 dígitos, **10 minutos**, **um só uso**, 5 tentativas erradas
e queima, e **pedir um novo invalida o anterior**. Teto de 6 códigos por
vendedor por hora.

Comprovar o endpoint sem passar pela tela:

```bash
JWT='<access_token de uma sessão real>'
curl -sS -X POST https://ventus3.vercel.app/api/pairing-code \
  -H "Authorization: Bearer ${JWT}" -H 'Content-Type: application/json' -d '{}'
# {"ok":true,"codigo":"482913","expira_em":"2026-08-26T13:41:02.000Z"}

curl -sS -X POST https://ventus3.vercel.app/api/pairing-code -d '{}'
# 401 — sem sessão não sai código
```

Um `503 pareamento_indisponivel` quer dizer que a migração `0006_telegram.sql`
não está aplicada nesse banco.

Num **grupo** o pareamento também funciona (`/vincular` dentro do grupo), mas o
canal nasce só com `ler` e `registrar`: confirmar um registro é do chat privado.
Seis pessoas no mesmo chat não fecham a oportunidade de uma com um tap.

### 6.5 · Voltar atrás

```bash
# desliga o webhook do v3
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook"
# e re-registra o do v1
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://<projeto-do-v1>.vercel.app/api/telegram"}'
```

A URL exata do v1 é a que está hoje em `getWebhookInfo` — **anote-a antes** de
rodar o `setWebhook` do §6.2, porque depois ela já não está em lugar nenhum
(`/home/user/ventus-bot/README.md` só traz o molde com `<proyecto>`).

O v1 não usa `secret_token`, então o `setWebhook` dele vai sem esse campo. Nada
se perde nos dois sentidos: os updates que ficaram abertos continuam em
`bot_log` com desfecho `erro:` ou `recebido` e são reprocessáveis.

---

## 7 · Telegram Mini App — **depende do passo 6**

1. `@BotFather` → `/newapp` → escolher o bot → título, descrição, ícone 640×360,
   **URL = `https://ventus3.vercel.app`** (a de `config/url-publica.txt`),
   short name (ex.: `app`).
   Sem isto `t.me/<bot>/app` não existe e nenhum deep link abre nada.
2. Env var `TELEGRAM_BOT_USERNAME=<bot sem arroba>`. Com ela, os botões dos
   avisos abrem o **Mini App no destino exato**
   (`t.me/VentusBot/app?startapp=opp_1842_log`) em vez do navegador — o vendedor
   fica dentro do Telegram, já autenticado. Sem ela os botões viram a URL web de
   sempre, que funciona igual: é opcional de propósito.
3. Opcional: `TMA_INITDATA_TTL_SEG` (default 3600). O hash do Telegram não vence
   sozinho — quem olha o relógio é `auth_date`.

**Verificar:** abrir `t.me/<bot>/app` no celular. Tem que entrar **sem passar
pela tela de login**. Um **403** significa «este Telegram não está pareado»:
resolve-se com o `/vincular` do §6.4, que agora existe.

---

## 8 · APK (TWA para Android)

O APK **não é compilado neste deploy** nem neste contêiner (`dl.google.com`
está bloqueado, então o Android SDK não baixa): sai do workflow
`.github/workflows/apk.yml`, que roda no runner do GitHub e dispara com uma tag
`v*`. O guia completo — trâmite do Google, instalação no telefone, diagnóstico
— é `ANDROID.md`. Aqui fica só o que este runbook precisa.

**Só faltam os dois secrets.** Tudo o resto já está pronto no repositório: o
`assetlinks.json` com o SHA-256 real, o `twa-manifest.json` alinhado com a URL
única, e o workflow revisado.

1. **Carregar os dois secrets** (da **raiz do repo**, não de `ventus3/`):
   ```bash
   cd /home/user/CRMbr
   gh secret set ANDROID_KEYSTORE_BASE64 --repo tomasdelvaso-crypto/CRMbr \
     --body "$(base64 -w0 ventus3/android/ventapel-ventus.keystore)"
   gh secret set ANDROID_KEYSTORE_PASSWORD --repo tomasdelvaso-crypto/CRMbr \
     --body "$(sed -nE 's/^VENTUS_KEYSTORE_PASSWORD=(.*)$/\1/p' /home/user/ventus-keystore-pass.txt)"
   ```
   O `-w0` importa: sem ele o base64 vem quebrado em linhas e o keystore
   restaurado não abre. A variable `VENTUS_URL` é **opcional** — sem ela o
   workflow lê `ventus3/config/url-publica.txt`.
2. **O assetlinks tem que estar publicado** para a TWA abrir sem a barra do
   Chrome:
   ```bash
   curl -sI https://ventus3.vercel.app/.well-known/assetlinks.json
   # HTTP/2 200 · content-type: application/json   ← o vercel.json força isso
   cd ventus3 && npm run assetlinks:verificar      # o veredito completo
   ```
   O `text/plain` é o erro clássico e faz a verificação de App Links falhar em
   silêncio. O workflow também confere isso, como aviso, antes de compilar.
3. `git tag v3.0.0 && git push origin v3.0.0` → o workflow compila com
   Bubblewrap e publica `ventus.apk` numa GitHub Release.
4. Env var `VITE_APK_URL` = a URL do asset da Release. **Sem ela, o botão
   «Baixar o APK» da tela `/instalar` simplesmente não aparece** — é de
   propósito: um botão que leva a 404 é pior que nenhum botão.
5. Trâmite do Google (Limited Distribution Account, `br.com.ventapel.ventus` +
   o SHA-256): `ANDROID.md` §8. **Prazo 30/09/2026.**

> ### ⚠️ Guardar o keystore hoje, não depois
> O keystore (`ventus3/android/ventapel-ventus.keystore`, gitignorado) vai ao
> cofre de arquivos da Ventapel, e a senha
> (`/home/user/ventus-keystore-pass.txt`) ao gestor de senhas. **São dois
> segredos e vão em dois lugares.**
>
> Perder esse arquivo = **nunca mais** conseguir atualizar o app instalado nos
> telefones, porque o Android identifica um app pelo par (package, certificado).
> Não tem recuperação, não tem suporte, não tem backup do lado do Google. O
> secret do GitHub **não** serve de backup: secrets não se leem de volta.

---

## 9 · Verificação final, na ordem

```bash
# A URL sai da fonte única, para que esta lista não envelheça:
VENTUS="$(cd ventus3 && node scripts/url-publica.mjs)"   # https://ventus3.vercel.app

# 1 · o app responde e sabe quem é
curl -s "$VENTUS"/api/health | jq '.ok, .versao'

# 2 · o manifest é servido com o tipo certo
curl -sI "$VENTUS"/manifest.webmanifest | grep -i content-type
# application/manifest+json

# 3 · o service worker não é cacheado
curl -sI "$VENTUS"/sw.js | grep -i cache-control
# public, max-age=0, must-revalidate

# 4 · o assetlinks é JSON
curl -sI "$VENTUS"/.well-known/assetlinks.json | grep -i content-type

# 5 · a API não é engolida pelo rewrite de SPA
curl -s -o /dev/null -w '%{http_code}\n' "$VENTUS"/api/plan
# 401 (sem sessão) — nunca 200 com HTML dentro

# 6 · o webhook do bot é fail-closed
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$VENTUS"/api/telegram -d '{"update_id":1}'
# 401 — sem o secret_token do Telegram não entra nada. Um 200 aqui é um furo;
# um 500 quer dizer que falta TELEGRAM_WEBHOOK_SECRET no ambiente.

# 7 · o emissor de códigos existe e exige sessão
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$VENTUS"/api/pairing-code -d '{}'
# 401 — nunca 404 (não deployada) nem 200 (sem porteiro)
```

Depois, no celular de verdade — é o único lugar onde o resto se verifica:

- [ ] Instalar (Android: banner nativo · iPhone: Compartilhar → Adicionar à
      Tela de Início). O ícone não pode sair cortado nem com fundo preto.
- [ ] Segurar o ícone: os **3 atalhos** (Registrar por voz, Golden Hour, Hoje).
- [ ] Entrar, ver a tela **Hoje** com as 3 cartas e registrar uma nota de voz.
- [ ] **Modo avião**: registrar assim mesmo, voltar a rede, ver a fila subir.
- [ ] Autorizar avisos e esperar um `ventus-run` (≤ 1 min) com algo na fila.
- [ ] Tocar o aviso: tem que abrir **na tela do aviso**, não na Hoje.
- [ ] **Ajustes → Telegram → Gerar código** e `/vincular` no bot: o app tem que
      passar a dizer «Telegram conectado» (§6.4).
- [ ] Mandar o **mesmo áudio duas vezes** de propósito: tem que entrar uma vez
      só. O dedup é por `update_id`, mas o `idempotency_key` do registro é a
      segunda rede.

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
