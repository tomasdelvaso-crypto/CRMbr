# Android — o APK do Ventus, do zero ao telefone

> ⏸️ **ESTA VIA ESTÁ PARADA — 26/08/2026.** O dono do produto decidiu que
> basta o atalho na tela de início, como no CRM v2: instalar a PWA pelo
> próprio navegador. Não é preciso APK, nem keystore, nem a conta de
> distribuição limitada do Google, nem o prazo de 30/09.
>
> Nada aqui foi apagado porque tudo já está feito e testado: se um dia
> fizer falta um APK — por exemplo para notificações mais confiáveis no
> Android — é só retomar a partir da seção 3. O keystore continua em
> `android/ventapel-ventus.keystore`; enquanto ninguém instalar um APK
> assinado com ele, perdê-lo não custa nada.
>
> Para instalar a app hoje: **`docs/INSTALAR.md`**.

> Estado em **26/08/2026**. Prazo externo original: **30/09/2026** (seção 8).
> Este documento se lê sem contexto nenhum. Tudo aqui foi executado de
> verdade, **menos a compilação final** — que não roda neste contêiner por
> bloqueio de rede e por isso acontece no GitHub (seção 3).

---

## 0 · O resumo em três frases

O Ventus Android **não é um app nativo**: é uma *Trusted Web Activity* (TWA),
um Chrome sem barra de endereço que abre a URL do Ventus em tela cheia. O APK é
uma casca de ~2 MB e **o conteúdo chega sozinho a cada deploy do site** — não se
recompila nada para trocar uma tela. O que **não** muda nunca depois de
distribuído é o `package name`, o keystore e a URL que a casca abre.

```
semana 4              semana 20
   │                      │
   ├─ APK casca ──────────┼──► app completo
   │  instalado nos 6     │    (nenhum reinstalar)
   │  telefones           │
   └─ registro feito      └─ deploys web
      antes de 30/09
```

Instalar cedo, com o app pela metade, **não é problema**. Adiar o registro no
Google até 30/09 é.

---

## 1 · Os cinco dados que este documento existe para entregar

Copiar e colar daqui. São os mesmos que o repositório já fixa.

| campo | valor |
|---|---|
| **package name** | `br.com.ventapel.ventus` |
| **SHA-256 do certificado** | `D4:83:EA:71:41:8E:2E:30:D4:56:87:48:67:8C:15:FD:79:D3:9D:A1:1D:99:A3:75:3C:86:43:0D:D6:74:EE:9F` |
| **URL que o APK abre** | `https://ventus3.vercel.app` — fonte única em `ventus3/config/url-publica.txt` |
| **keystore** | `ventus3/android/ventapel-ventus.keystore` (alias `ventapel`, RSA 4096, válido até 17/08/2056) |
| **senha do keystore** | `/home/user/ventus-keystore-pass.txt`, linha `VENTUS_KEYSTORE_PASSWORD=` |

O fingerprint acima já está publicado em `public/.well-known/assetlinks.json` e
é conferido a cada build. Para relê-lo do próprio keystore a qualquer momento:

```bash
cd ventus3
keytool -list -v -keystore android/ventapel-ventus.keystore -alias ventapel
# ele pergunta a senha; não passe -storepass na linha de comando
```

---

## 2 · Configurar o GitHub — uma vez na vida

Dois secrets e (opcionalmente) uma variable. Sem os dois secrets o workflow para
no primeiro minuto, com a mensagem exata do que falta.

### Pelo `gh` CLI (o caminho de copiar e colar)

Rodar **da raiz do repositório**, não de dentro de `ventus3/`:

```bash
cd /home/user/CRMbr            # a raiz do repo; o projeto vive em ventus3/

# 1. o keystore, em base64 numa linha só
gh secret set ANDROID_KEYSTORE_BASE64 \
  --repo tomasdelvaso-crypto/CRMbr \
  --body "$(base64 -w0 ventus3/android/ventapel-ventus.keystore)"

# 2. a senha (a mesma do keystore e da chave)
gh secret set ANDROID_KEYSTORE_PASSWORD \
  --repo tomasdelvaso-crypto/CRMbr \
  --body "$(sed -nE 's/^VENTUS_KEYSTORE_PASSWORD=(.*)$/\1/p' /home/user/ventus-keystore-pass.txt)"

# 3. (opcional) a URL, só se quiser pisar a do repositório
gh variable set VENTUS_URL \
  --repo tomasdelvaso-crypto/CRMbr \
  --body "$(cd ventus3 && node scripts/url-publica.mjs)"

# conferir que ficaram os três
gh secret list   --repo tomasdelvaso-crypto/CRMbr
gh variable list --repo tomasdelvaso-crypto/CRMbr
```

> **O `-w0` do `base64` importa.** Sem ele o `base64` quebra a saída em linhas
> de 76 caracteres, o secret chega picado e o keystore restaurado não abre. O
> workflow detecta isso e para com uma mensagem clara — mas melhor não passar
> por lá.

### Pela interface

*Settings → Secrets and variables → Actions*

| aba | nome | valor |
|---|---|---|
| Secrets | `ANDROID_KEYSTORE_BASE64` | a saída de `base64 -w0 ventus3/android/ventapel-ventus.keystore` |
| Secrets | `ANDROID_KEYSTORE_PASSWORD` | a senha, sem aspas nem espaços |
| Variables | `VENTUS_URL` | opcional — ver abaixo |

**`VENTUS_URL` é opcional de propósito.** Sem ela o workflow lê
`ventus3/config/url-publica.txt`, que é a fonte única versionada e já está
preenchida. A variable existe só para pisar essa URL num build pontual, sem
commit. Se as duas existirem, **a variable ganha**, então o caminho de menos
surpresa é não criar a variable e mudar só o arquivo.

---

## 3 · Apertar o botão

```bash
cd /home/user/CRMbr
git tag v1.0.0
git push origin v1.0.0
```

É isso. O workflow `.github/workflows/apk.yml` compila no runner do GitHub (que
já traz o Android SDK) e publica o APK como **GitHub Release**. Acompanhar em
*Actions → "APK (TWA)"*; leva de 8 a 15 minutos.

Sem tag, para só testar a compilação: *Actions → "APK (TWA)" → Run workflow*.
Aí o APK sai como **artefato** do run (não como Release) e fica 90 dias.
Publicar Release a partir de um branch é recusado logo no começo, de propósito:
a Release leva o nome do ref e um branch com barras faria algo que ninguém quer.

### O que o workflow faz, na ordem, e onde ele para

| passo | para se… |
|---|---|
| JDK 17 + Android SDK + Node 22 | — |
| resolver a URL | não achou URL em lugar nenhum, ou ela não é `https://` |
| conferir que dá para publicar | pediram Release fora de uma tag `v*` |
| restaurar o keystore do secret | falta o secret, ou o base64 veio picado |
| `gerar-assetlinks.mjs --check` | o fingerprint do keystore **não bate** com o `assetlinks.json` do repositório |
| conferir o assetlinks publicado | **só avisa**, não para (ver seção 5) |
| `build-apk.sh` | gradle, SDK ou ícones do site |
| upload do artefato + Release | — |

O `--check` do assetlinks antes de compilar é o guarda-corpo que importa: sem
ele, um keystore trocado produziria um APK que instala e abre **com a barra do
Chrome em cima**, e ninguém descobriria antes do telefone.

---

## 4 · A URL — mudar num lugar só

A URL que o APK abre vai **assinada dentro do APK**. Trocá-la depois de
distribuído obriga a recompilar e reinstalar nos seis telefones. Trocar o
*conteúdo* do site não exige nada — é só o deploy.

Hoje a URL é `https://ventus3.vercel.app`. O domínio próprio
`ventus.ventapel.com.br` **ainda não existe**.

**A fonte única é `ventus3/config/url-publica.txt`.** Dela leem o `index.html`
(og:image e og:url, injetados no build), o `build-apk.sh`, o
`gerar-assetlinks.mjs --verificar` e o próprio workflow. A variável de ambiente
`VENTUS_URL` pisa o arquivo em qualquer um deles.

### O dia em que existir ventus.ventapel.com.br

```bash
cd /home/user/CRMbr/ventus3

# 1. mudar a única linha de config/url-publica.txt para a URL nova
$EDITOR config/url-publica.txt

# 2. alinhar o template do APK e conferir
npm run url:sync
npm run url:check           # também roda dentro de `npm test`

# 3. deploy do site na URL nova (com os ícones e o assetlinks servidos lá)
npm run build

# 4. o assetlinks só vale publicado — conferir contra o host novo
npm run assetlinks:verificar

# 5. APK novo
cd /home/user/CRMbr && git tag v1.1.0 && git push origin v1.1.0

# 6. reinstalar nos 6 telefones
```

Os passos 3 e 4 antes do 5 porque o telefone verifica o assetlinks **na
instalação**. Um APK novo apontando para um host que ainda não serve o
assetlinks nasce com a barra do Chrome.

Se algum dia alguém escrever o host à mão em `index.html` ou no
`android/twa-manifest.json`, a prova `src/data/__tests__/url-publica.test.ts`
falha em `npm test`. É de propósito.

---

## 5 · assetlinks.json — o arquivo que decide se a barra do Chrome aparece

A TWA só esconde a barra de endereço se o **site** declarar que confia na app.
Essa declaração é o Digital Asset Links, servido em
`https://<host>/.well-known/assetlinks.json`.

Gerar (já está feito; refazer só se o keystore mudar):

```bash
cd ventus3
npm run assetlinks            # keystore → public/.well-known/assetlinks.json
npm run assetlinks:check      # não escreve; falha se o disco não bate
npm run assetlinks:verificar  # baixa o publicado e dá o veredito
```

Os quatro requisitos que o Android exige e que o script confere:

1. **HTTPS.** Sobre `http` não valida, ponto.
2. **HTTP 200 sem redirecionamento.** Um `301` de apex para `www` (ou o
   contrário) já quebra tudo. O arquivo tem que estar no host *exato* que a app
   abre.
3. **`Content-Type: application/json`.** O Vercel às vezes serve `.well-known`
   como `text/plain` e a validação falha **em silêncio**. Por isso `vercel.json`
   tem o bloco `headers` explícito para essa rota — não mexer nele.
4. **Fingerprint SHA-256 correto**, em maiúsculas com dois-pontos.

### Como saber se funcionou: abra o app

**Se aparecer a barra de endereço do Chrome no topo, falhou.** É o único
sintoma. Não há mensagem de erro em lugar nenhum — nem no telefone, nem no
build, nem no servidor. Um app que abre sem barra é um app verificado.

Diagnóstico, em ordem:

```bash
# 1. o que o site realmente serve, com cabeçalhos
curl -i https://ventus3.vercel.app/.well-known/assetlinks.json

# 2. o veredito do próprio script (usa a fonte única da URL)
cd ventus3 && npm run assetlinks:verificar

# 3. o que o telefone achou (cabo USB e depuração USB ligada)
adb shell pm get-app-links br.com.ventapel.ventus

# 4. forçar nova verificação (Android 12+)
adb shell pm set-app-links --package br.com.ventapel.ventus 0 all
adb shell pm verify-app-links --re-verify br.com.ventapel.ventus
```

O estado bom em `pm get-app-links` é `verified`. `1024` significa "nunca
verificado"; `1` e `2` significam falha de rede ou de conteúdo.

A verificação acontece **na instalação** e pode levar até cerca de um minuto.
Publicar o assetlinks depois de instalar exige forçar com o comando 4 ou
reinstalar.

> **Hoje, 26/08/2026, isto não pôde ser verificado deste contêiner**: o egress
> bloqueia `ventus3.vercel.app` com `CONNECT tunnel failed, response 403`. O
> arquivo em disco está correto e conferido contra o keystore; falta o veredito
> contra o site publicado, que o workflow dá no primeiro build (passo "Conferir
> o assetlinks já publicado").

---

## 6 · Instalar no telefone

O APK **não vem da Play Store**, então o Android vai avisar duas vezes. Os dois
avisos são esperados. Roteiro para mandar ao time, em PT-BR:

1. Abrir a página da Release **no Chrome do celular** e tocar em `ventus.apk`.
2. Se aparecer *"Por segurança, seu telefone não pode instalar apps
   desconhecidos desta fonte"*: tocar em **Configurações**, ligar **Permitir
   desta fonte** para o Chrome, voltar. É uma vez por telefone.
3. O **Play Protect** vai mostrar **"App não verificada"** ou *"Este app não foi
   analisado pelo Google Play Protect"* → tocar em **Mais detalhes** e depois em
   **Instalar mesmo assim**. **Não é um erro**: é o que o Android diz de
   qualquer app fora da loja, e vai dizer sempre.
4. Abrir o Ventus. **Não pode aparecer a barra de endereço do Chrome no topo.**
   Se aparecer, o assetlinks não validou — seção 5.
5. Aceitar a permissão de **notificações** quando o app pedir (o `twa-manifest`
   traz `enableNotifications: true`, então o pedido é nativo, com o ícone do
   Ventus).

### Plano B: `adb install -r`

O sideload por `adb` está **explicitamente isento** da verificação de
desenvolvedor da seção 8. É a via de emergência e a de teste.

```bash
# no telefone: Configurações → Sobre o telefone → tocar 7× em "Número da versão"
#              → Opções do desenvolvedor → Depuração USB: ligado
adb devices                                   # tem que listar o aparelho
adb install -r android/dist/ventus.apk        # -r = reinstala mantendo os dados
```

| erro | causa | solução |
|---|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | assinado com outro keystore | desinstalar (`adb uninstall br.com.ventapel.ventus`) e instalar de novo — perde os dados locais |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | `versionCode` menor que o instalado | subir o `--version-code` |
| `INSTALL_FAILED_ALREADY_EXISTS` | faltou o `-r` | usar `adb install -r` |
| `no devices/emulators found` | depuração USB desligada, ou o diálogo "Permitir depuração USB?" não foi aceito | olhar a tela do telefone |

---

## 7 · O keystore — o arquivo que não pode se perder

```
ventus3/android/ventapel-ventus.keystore
  tipo       PKCS12
  alias      ventapel
  chave      RSA 4096, SHA384withRSA
  validade   10.950 dias → 17/08/2056
  SHA-256    D4:83:EA:71:41:8E:2E:30:D4:56:87:48:67:8C:15:FD:
             79:D3:9D:A1:1D:99:A3:75:3C:86:43:0D:D6:74:EE:9F
```

> ## ⚠️ Perder o keystore = nunca mais atualizar a app instalada.
>
> O Android identifica um app pelo par **(package name, certificado)**. Com
> outro certificado, o mesmo `br.com.ventapel.ventus` vira um app **diferente**:
> não atualiza por cima, obriga a desinstalar (perdendo os dados locais de cada
> telefone — a fila offline inclusive), e o fingerprint registrado no Android
> Developer Console e no `assetlinks.json` deixa de bater.
>
> **Não existe recuperação. Não existe suporte que resolva. Não existe backup do
> lado do Google.** É o único arquivo insubstituível deste projeto.

**Fazer hoje, não amanhã** — são dois segredos e vão em dois lugares diferentes:

1. `ventus3/android/ventapel-ventus.keystore` → cofre de arquivos da Ventapel
   (o arquivo **não** está no git: o `.gitignore` exclui `*.keystore`, e é
   assim que tem que ficar).
2. A linha `VENTUS_KEYSTORE_PASSWORD=` de `/home/user/ventus-keystore-pass.txt`
   → gestor de senhas da Ventapel.

O secret `ANDROID_KEYSTORE_BASE64` do GitHub **não é um backup**: secrets não se
podem ler de volta, só sobrescrever.

**Nunca gerar um segundo keystore.** Se algum dia o `build-apk.sh` oferecer
gerar um porque não achou o arquivo, é sinal de que o keystore sumiu — parar e
procurar o backup, não seguir em frente.

---

## 8 · O trâmite do Google — antes de 30/09/2026

O Brasil é um dos quatro mercados-piloto (com Indonésia, Singapura e Tailândia).
A partir de **30/09/2026**, em aparelhos Android certificados desses países, um
app só instala se estiver **registrado por um desenvolvedor verificado**. O
registro é a dupla `package name` + `SHA-256 do certificado` — os dois valores
da seção 1.

Para o nosso caso **não é preciso conta paga nem documento de identidade**:
existe a **Limited Distribution Account** — grátis, sem ID governamental, até
**20 aparelhos**. A Ventapel tem 6. É exatamente o desenho para "apps de um
grupo fechado de pessoas conhecidas".

O *sideload* por `adb` (seção 6, plano B) e o "fluxo avançado" para usuários
experientes ficam **de fora** da verificação.

### Passo a passo

1. Entrar no **Android Developer Console**
   (`developer.android.com/developer-verification`) com a conta Google **da
   Ventapel** — nunca a conta pessoal de alguém. Se essa conta se perder,
   perde-se o registro.
2. Escolher o tipo **Limited Distribution** (grátis, até 20 aparelhos). As
   outras opções (Play Console / Android Developer Console pleno) pedem taxa e
   documento de identidade — não precisamos.
3. Registrar o app, copiando da seção 1:

   ```
   package name   br.com.ventapel.ventus
   SHA-256        D4:83:EA:71:41:8E:2E:30:D4:56:87:48:67:8C:15:FD:79:D3:9D:A1:1D:99:A3:75:3C:86:43:0D:D6:74:EE:9F
   ```

4. Cadastrar os aparelhos autorizados. O identificador de cada um aparece no
   próprio Console; o caminho usual é instalar uma vez e o Console listar o
   dispositivo, ou usar o Android ID que o Console indicar. Fazer isso **com os
   6 telefones em mãos, num único encontro** — é a parte que trava se ficar
   para depois.
5. Guardar o print da confirmação junto com o keystore.

> **Antes de 30/09/2026.** Depois da data, um aparelho novo sem registro
> simplesmente não instala pelo fluxo normal.

**Fontes** (verificadas em ago/2026):
[Android developer verification](https://developer.android.com/developer-verification),
[Android Developers Blog — rollout](https://android-developers.googleblog.com/2026/06/android-developer-verification.html).

---

## 9 · Compilar fora do GitHub

O caminho normal é o da seção 3. Isto é para quando alguém quiser um APK numa
máquina própria.

```bash
cd ventus3
./scripts/build-apk.sh                       # URL de config/url-publica.txt
./scripts/build-apk.sh https://outra.url     # pisa a fonte única
./scripts/build-apk.sh --so-manifest         # só mostra o manifest, não compila
./scripts/build-apk.sh --limpar              # apaga android/twa/ antes
./scripts/build-apk.sh --version-code=57 --version-name=1.2.0
```

Sem `--version-code`, o código sai de `git rev-list --count HEAD`: sobe sozinho
e é reproduzível. **O `versionCode` só pode subir** — um APK com código menor
que o instalado é recusado com `INSTALL_FAILED_VERSION_DOWNGRADE`.

### Pré-requisitos

| o quê | por quê | de onde vem |
|---|---|---|
| **JDK 17** | as command line tools do Android não compilam com o 21 | `bubblewrap doctor` baixa do Adoptium (GitHub) |
| **Android SDK** (command line tools + build-tools) | gradle, zipalign, apksigner | `bubblewrap doctor` baixa de `dl.google.com` |
| **Bubblewrap CLI 1.25.0** | gera e compila o projeto TWA | `npm i -g @bubblewrap/cli@1.25.0` |
| **o site publicado** | o Bubblewrap **baixa** `icon-512.png`, `icon-maskable-512.png` e o `manifest.webmanifest` da URL para gerar os mipmaps | o deploy |

O último é o que mais pega gente de surpresa: **não dá para gerar o APK antes de
o site estar no ar.**

### Por que não dá para compilar neste contêiner

```
$ curl -sS -o /dev/null -w "%{http_code}" \
    https://dl.google.com/android/repository/commandlinetools-linux-6609375_latest.zip
curl: (56) CONNECT tunnel failed, response 403

$ cat ~/.bubblewrap/android_sdk/commandlinetools-linux-6609375_latest.zip
Host not in allowlist: dl.google.com. Add this host to your network egress
settings to allow access.

$ bubblewrap doctor
Downloading the Android SDK...
Decompressing the Android SDK...
cli ERROR end of central directory record signature not found

$ bubblewrap build --skipPwaValidation
cli ERROR The provided androidSdk isn't correct.
```

Não há espelho oficial do `dl.google.com`. O que **funcionou** aqui, e portanto
está provado até onde dá:

- `bubblewrap --version` → **1.25.0**; o JDK 17 baixou e instalou sozinho
- o keystore RSA 4096 foi gerado, lido e conferido
- `./scripts/build-apk.sh --so-manifest` gera o `twa-manifest.json` correto
- `bubblewrap update` gerou o **projeto Android inteiro** — `AndroidManifest.xml`
  com `POST_NOTIFICATIONS`, `autoVerify="true"`, `asset_statements` e os três
  atalhos; mipmaps a partir dos ícones do site
- só a etapa final (gradle + build-tools) parou, por falta do SDK

Saídas, em ordem de preferência:

1. **GitHub Actions** — seção 3. É o caminho projetado para isto.
2. **Uma máquina com internet aberta** — `npm i -g @bubblewrap/cli@1.25.0`,
   `bubblewrap doctor` (responder `Yes` duas vezes), depois `build-apk.sh`.
3. **PWABuilder** (`pwabuilder.com`) — colar a URL do Ventus, *Android →
   Package for stores*. Em **Signing key** escolher **"Mine"** e subir o
   `ventapel-ventus.keystore` com a senha e o alias `ventapel` — **nunca
   "New"**, que gera uma chave nova e quebra o par (package, certificado). Usa o
   mesmo Bubblewrap por baixo; conferir à mão que o package saiu
   `br.com.ventapel.ventus` e que as notificações ficaram ligadas.

---

## 10 · Atualizar a app sem recompilar

**Esta é a razão de ser de toda a arquitetura.**

| o que mudou | precisa de APK novo? |
|---|---|
| qualquer tela, texto, lógica, API | **não** — deploy do site e pronto |
| ícone do launcher | sim |
| nome, atalhos do press-and-hold | sim |
| URL que a app abre | sim (e reinstalar nos 6 telefones) |
| package name ou keystore | sim — e vira um app **diferente** |

O ciclo normal é `git push` → deploy → o vendedor abre o Ventus e já está novo.
O service worker está em `registerType: 'prompt'`, então a app não se recarrega
sozinha no meio de uma nota ditada: ela oferece atualizar.

Como a TWA compartilha o armazenamento com o Chrome, o cache, o IndexedDB
(Dexie, a fila offline) e a sessão continuam intactos entre atualizações do
site. Um APK novo com o **mesmo** keystore instalado por cima (`-r` ou pela
Release) também preserva tudo.

---

## 11 · O que existe neste repositório

| arquivo | o que é |
|---|---|
| `ventus3/config/url-publica.txt` | **a fonte única da URL do site** |
| `ventus3/android/twa-manifest.json` | fonte de verdade do APK, alinhada com a URL acima |
| `ventus3/android/ventapel-ventus.keystore` | **não versionado.** Keystore de release RSA 4096 |
| `ventus3/android/twa/` | projeto Android gerado. Derivado, no `.gitignore` |
| `ventus3/android/dist/` | saída: `ventus.apk`, `ventus-<versão>-<code>.apk`, `.aab` |
| `ventus3/scripts/build-apk.sh` | um comando: URL → APK assinado |
| `ventus3/scripts/gerar-assetlinks.mjs` | keystore → `assetlinks.json` + verificação |
| `ventus3/scripts/url-publica.mjs` | resolve, sincroniza e confere a URL única |
| `ventus3/public/.well-known/assetlinks.json` | o que o Chrome baixa para decidir a barra |
| `ventus3/vercel.json` | serve o assetlinks com `Content-Type: application/json` |
| `.github/workflows/apk.yml` | **na raiz do repo**: tag `v*` → APK → GitHub Release |

---

## 12 · A ordem correta das coisas

Fazer fora de ordem custa uma tarde.

```
1. definir a URL definitiva            → config/url-publica.txt
2. deploy do site nessa URL (com os ícones e o assetlinks)
3. npm run assetlinks:verificar        → tem que passar
4. gh secret set ANDROID_KEYSTORE_BASE64 / _PASSWORD      (seção 2)
5. git tag v1.0.0 && git push origin v1.0.0               → APK na Release
6. registrar package + SHA-256 no Android Developer Console
7. cadastrar os 6 aparelhos            ← antes de 30/09/2026
8. instalar nos 6 telefones e conferir: sem barra do Chrome
9. guardar keystore e senha nos dois cofres               (seção 7)
```

Os passos 2 e 3 antes do 5 porque o assetlinks tem que estar no ar quando o
telefone instalar. Os passos 6 e 7 antes de 30/09 porque é o prazo. O passo 9
não tem prazo, o que é exatamente por que costuma não acontecer.

---

## 13 · Referências verificadas (ago/2026)

- [Android developer verification](https://developer.android.com/developer-verification) — tipos de conta, Limited Distribution, prazos
- [Android Developers Blog — rollout da verificação](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
- [Bubblewrap CLI — README](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md) — comandos e flags
- [Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks) — requisitos do assetlinks e os comandos `adb pm ...`
- [android-actions/setup-android](https://github.com/android-actions/setup-android) — SDK no runner
