# Android — o APK do Ventus, do zero ao telefone

> Estado em **25/08/2026**. Prazo externo: **30/09/2026**.
> Tudo neste documento foi executado de verdade, menos a compilação final —
> ver a seção [Quando não dá para compilar aqui](#quando-não-dá-para-compilar-aqui),
> que diz o erro exato e o caminho de saída.

---

## 0 · O resumo de uma frase

O Ventus Android **não é um app nativo**: é uma *Trusted Web Activity* (TWA), um
Chrome sem barra de endereço que abre a URL do Ventus em tela cheia. O APK é uma
casca de ~2 MB. **Instalar cedo, com o app pela metade, não é problema: o
conteúdo chega sozinho com cada deploy do site.** O que não muda nunca depois de
distribuído é o `package name`, o keystore e a URL.

Daí a sequência que este projeto escolheu:

```
semana 4              semana 20
   │                      │
   ├─ APK casca ──────────┼──► app completo
   │  instalado nos 6     │    (nenhum reinstalar)
   │  telefones           │
   └─ registro feito      └─ deploys web
      antes de 30/09
```

---

## 1 · O prazo: Android Developer Verification

O Brasil é um dos quatro mercados-piloto (com Indonésia, Singapura e Tailândia).
A partir de **30/09/2026**, em aparelhos Android certificados desses países, um
app só instala se estiver **registrado por um desenvolvedor verificado**. O
registro é a dupla:

```
package name  +  SHA-256 do certificado de assinatura
```

Para o nosso caso não é preciso conta paga nem documento de identidade: existe a
**Limited Distribution Account** — grátis, sem ID governamental, **até 20
aparelhos**. A Ventapel tem 6. É exatamente o desenho para "apps de um grupo
fechado de pessoas conhecidas".

Fica de fora da verificação o *sideload* por `adb` e o "fluxo avançado" para
usuários experientes — é o nosso plano B da seção 8.

**Fontes** (verificadas em ago/2026): [Android developer verification](https://developer.android.com/developer-verification),
[Android Developers Blog — rollout](https://android-developers.googleblog.com/2026/06/android-developer-verification.html).

### O trâmite, passo a passo

1. Entrar no **Android Developer Console** (`developer.android.com/developer-verification`)
   com a conta Google da Ventapel — **não** a conta pessoal de ninguém. Se essa
   conta se perder, perde-se o registro.
2. Escolher o tipo **Limited Distribution** (grátis, até 20 aparelhos).
   As outras opções (Play Console / Android Developer Console pleno) pedem taxa
   e documento de identidade — não precisamos.
3. Registrar o app com os dois dados abaixo (é o que este repositório já fixa):

   | campo | valor |
   |---|---|
   | package name | `br.com.ventapel.ventus` |
   | SHA-256 do certificado | o do keystore de release — ver seção 3 |

4. Cadastrar os aparelhos autorizados. O identificador de cada aparelho aparece
   no próprio Console; o caminho usual é instalar uma vez e o Console listar o
   dispositivo, ou usar o Android ID que o Console indicar. Fazer isso **com os
   6 telefones em mãos**, num único encontro — é a parte que trava se ficar para
   depois.
5. Guardar o print da confirmação junto com o keystore.

> **Fazer isto antes de 30/09.** Depois da data, um aparelho novo sem registro
> simplesmente não instala pelo fluxo normal.

---

## 2 · O que já existe neste repositório

| arquivo | o que é |
|---|---|
| `android/twa-manifest.json` | fonte de verdade do APK, parametrizada pela URL |
| `android/ventapel-ventus.keystore` | **não versionado.** Keystore de release RSA 4096 |
| `android/twa/` | projeto Android gerado. Derivado, no `.gitignore` |
| `android/dist/` | saída: `ventus.apk`, `ventus-<versão>-<code>.apk`, `.aab` |
| `scripts/build-apk.sh` | um comando: URL → APK assinado |
| `scripts/gerar-assetlinks.mjs` | keystore → `public/.well-known/assetlinks.json` + verificação |
| `.github/workflows/apk.yml` | tag `v*` → APK → GitHub Release |
| `vercel.json` | serve o assetlinks com `Content-Type: application/json` |

O `.gitignore` já exclui `*.keystore`, `*.jks`, `*.apk`, `*.aab` e todo o
conteúdo de `android/` menos o `twa-manifest.json` e este par de docs.

---

## 3 · O keystore — o arquivo que não pode se perder

Já foi gerado. **Só se gera uma vez na vida do app.**

```
android/ventapel-ventus.keystore
  tipo       PKCS12
  alias      ventapel
  chave      RSA 4096, SHA384withRSA
  validade   10.950 dias → 17/08/2056
  SHA-256    D4:83:EA:71:41:8E:2E:30:D4:56:87:48:67:8C:15:FD:
             79:D3:9D:A1:1D:99:A3:75:3C:86:43:0D:D6:74:EE:9F
```

A **senha está em `/home/user/ventus-keystore-pass.txt`** (fora do repositório,
modo `600`), na linha `VENTUS_KEYSTORE_PASSWORD=`.
Copiá-la **hoje** para o gestor de senhas da Ventapel e o keystore para o cofre
de arquivos. São dois segredos, dois lugares.

Para reler o fingerprint a qualquer momento:

```bash
keytool -list -v \
  -keystore android/ventapel-ventus.keystore \
  -alias ventapel
# ele pergunta a senha; não passe -storepass na linha de comando
```

> **Perder o keystore = não conseguir mais atualizar a app instalada.** Android
> identifica um app pelo par (package, certificado). Com outro certificado o
> mesmo package vira um app *diferente*: não atualiza, tem que desinstalar, e o
> fingerprint registrado no Developer Console deixa de bater. Não existe
> recuperação. É o único arquivo insubstituível deste projeto.

---

## 4 · assetlinks.json — o arquivo que decide se a barra do Chrome aparece

A TWA só esconde a barra de endereço se o **site** declarar que confia na app.
Essa declaração é o Digital Asset Links, servido em:

```
https://<host>/.well-known/assetlinks.json
```

Gerar (já feito, e a rodar de novo se o keystore mudar):

```bash
node scripts/gerar-assetlinks.mjs
```

O script lê o fingerprint do keystore, escreve o arquivo em `public/` e
**valida a forma** antes de gravar. Ele também verifica o que está publicado:

```bash
node scripts/gerar-assetlinks.mjs --verificar=https://ventus.ventapel.com.br
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

### Se a barra do Chrome aparecer

É o **único** sintoma de assetlinks quebrado — não há mensagem de erro em lugar
nenhum. Diagnóstico, em ordem:

```bash
# 1. o que o site realmente serve, com cabeçalhos
curl -i https://ventus.ventapel.com.br/.well-known/assetlinks.json

# 2. o veredito do próprio script
node scripts/gerar-assetlinks.mjs --verificar=https://ventus.ventapel.com.br

# 3. o que o telefone achou (com o cabo USB e depuração USB ligada)
adb shell pm get-app-links br.com.ventapel.ventus

# 4. forçar nova verificação (Android 12+)
adb shell pm set-app-links --package br.com.ventapel.ventus 0 all
adb shell pm verify-app-links --re-verify br.com.ventapel.ventus
```

O estado bom em `pm get-app-links` é `verified`. `1024` significa "nunca
verificado" e `1` / `2` significam falha de rede ou de conteúdo.

A verificação acontece **na instalação** e pode levar até cerca de um minuto.
Publicar o assetlinks depois de instalar exige forçar com o comando 4 acima ou
reinstalar.

---

## 5 · Gerar o APK

### O caminho normal: um comando

```bash
cd ventus3
./scripts/build-apk.sh https://ventus.ventapel.com.br
```

O script faz, em ordem: valida a URL → monta `android/twa/twa-manifest.json`
trocando **toda** URL absoluta pela origem que você passou → `bubblewrap update`
(baixa os ícones do site e gera o projeto Android) → `bubblewrap build` (gradle,
zipalign, apksigner) → copia para `android/dist/`.

É idempotente: rodar duas vezes com a mesma URL dá o mesmo resultado.

Opções úteis:

```bash
./scripts/build-apk.sh <url> --limpar             # apaga android/twa/ antes
./scripts/build-apk.sh <url> --so-manifest        # só mostra o manifest, não compila
./scripts/build-apk.sh <url> --version-code=57 --version-name=1.2.0
```

Sem `--version-code`, o código de versão sai de `git rev-list --count HEAD`, que
sobe sozinho e é reproduzível. **O `versionCode` só pode subir**: um APK com
código menor que o instalado é recusado com
`INSTALL_FAILED_VERSION_DOWNGRADE`.

### Pré-requisitos do build

| o quê | por quê | de onde vem |
|---|---|---|
| **JDK 17** | as command line tools do Android não compilam com o 21 | `bubblewrap doctor` baixa do Adoptium (GitHub) |
| **Android SDK** (command line tools + build-tools) | gradle, zipalign, apksigner | `bubblewrap doctor` baixa de `dl.google.com` |
| **Bubblewrap CLI 1.25.0** | gera e compila o projeto TWA | `npm i -g @bubblewrap/cli@1.25.0` |
| **o site publicado** | o Bubblewrap **baixa** `icon-512.png`, `icon-maskable-192/512.png` e o `manifest.webmanifest` da URL para gerar os mipmaps | o deploy |

O último é o que mais pega gente de surpresa: **não dá para gerar o APK antes de
o site estar no ar.** O Bubblewrap busca o web manifest e os ícones pela rede.

### Pelo GitHub Actions (recomendado)

```bash
git tag v1.0.0
git push origin v1.0.0
```

O workflow `.github/workflows/apk.yml` compila no runner (que já tem o SDK) e
publica o APK como **GitHub Release**. O time baixa abrindo a página da release
no Chrome do celular.

Antes do primeiro uso, em *Settings → Secrets and variables → Actions*:

```bash
# Secret ANDROID_KEYSTORE_BASE64
base64 -w0 ventus3/android/ventapel-ventus.keystore
# Secret ANDROID_KEYSTORE_PASSWORD
grep VENTUS_KEYSTORE_PASSWORD /home/user/ventus-keystore-pass.txt
# Variable VENTUS_URL
https://ventus.ventapel.com.br
```

O `-w0` importa: sem ele o `base64` quebra linhas e o secret chega corrompido.
O workflow abre o keystore restaurado com `keytool` antes de compilar, para
falhar cedo e com mensagem clara se isso acontecer.

O workflow também roda `gerar-assetlinks.mjs --check`: se o fingerprint do
keystore do CI não bater com `public/.well-known/assetlinks.json`, o build para.
É o guarda-corpo contra distribuir um APK que nasceria com a barra do Chrome.

---

## 6 · Quando não dá para compilar aqui

**No contêiner de desenvolvimento deste projeto o APK não pôde ser gerado.** O
motivo, textual:

```
$ curl -sS -o /dev/null -w "%{http_code}" \
    https://dl.google.com/android/repository/commandlinetools-linux-6609375_latest.zip
curl: (56) CONNECT tunnel failed, response 403

$ cat ~/.bubblewrap/android_sdk/commandlinetools-linux-6609375_latest.zip
Host not in allowlist: dl.google.com. Add this host to your network egress
settings to allow access.

$ bubblewrap doctor
Downloading the Android SDK...
 >> [████████████████████████████████████████] 100% | 0k of 0k
Decompressing the Android SDK...
cli ERROR end of central directory record signature not found

$ bubblewrap build --skipPwaValidation
cli ERROR The provided androidSdk isn't correct.
```

O que **funcionou** aqui, e portanto está provado:

- `bubblewrap --version` → **1.25.0**
- o JDK 17 (Temurin 17.0.11+9) baixou e instalou sozinho, do GitHub
- o keystore RSA 4096 foi gerado e lido
- `scripts/build-apk.sh <url> --so-manifest` gera o `twa-manifest.json`
  parametrizado corretamente
- `bubblewrap update` gerou o **projeto Android inteiro** — `AndroidManifest.xml`
  com `POST_NOTIFICATIONS`, `autoVerify="true"`, `asset_statements` e os três
  atalhos; mipmaps `ic_launcher.png` e `ic_maskable.png` a partir dos ícones do
  site
- só a etapa final (gradle + build-tools) parou, por falta do SDK

Não há espelho oficial do `dl.google.com`. As saídas, em ordem de preferência:

1. **GitHub Actions** — `.github/workflows/apk.yml`. O runner `ubuntu-latest` já
   traz o SDK. É o caminho projetado para isto.
2. **Uma máquina com internet aberta** — `npm i -g @bubblewrap/cli@1.25.0`,
   `bubblewrap doctor` (responder `Yes` duas vezes) e depois `build-apk.sh`.
3. **PWABuilder** (`pwabuilder.com`) — cola-se a URL do Ventus, escolhe-se
   *Android → Package for stores*. Em **Signing key**, escolher **"Mine"** e
   subir o `ventapel-ventus.keystore` com a senha e o alias `ventapel` — **nunca
   "New"**, que gera uma chave nova e quebra o par (package, certificado). Ele
   usa o mesmo Bubblewrap por baixo, então o resultado é equivalente; só é
   preciso conferir à mão que o package name saiu `br.com.ventapel.ventus` e que
   as notificações ficaram ligadas.

---

## 7 · Instalar no telefone

O APK **não vem da Play Store**, então o Android vai avisar duas vezes. Ambos os
avisos são esperados. Roteiro para mandar ao time, em PT-BR:

1. Abrir a página da Release **no Chrome do celular** e tocar em `ventus.apk`.
2. Se aparecer *"Por segurança, seu telefone não pode instalar apps
   desconhecidos desta fonte"*: tocar em **Configurações**, ligar
   **Permitir desta fonte** para o Chrome, voltar. É uma vez por telefone.
3. O **Play Protect** vai mostrar **"App não verificada"** ou
   *"Este app não foi analisado pelo Google Play Protect"*.
   → tocar em **Mais detalhes** e depois em **Instalar mesmo assim**.
   Não é um erro: é o que o Android diz de qualquer app fora da loja.
4. Abrir o Ventus. **Não pode aparecer a barra de endereço do Chrome no topo.**
   Se aparecer, o assetlinks não validou — seção 4.
5. Aceitar a permissão de **notificações** quando o app pedir (o `twa-manifest`
   traz `enableNotifications: true`, então o pedido é nativo, com o ícone do
   Ventus).

### Plano B: `adb install -r`

O sideload por `adb` está **explicitamente isento** da verificação de
desenvolvedor. É a via de emergência e a de teste.

```bash
# no telefone: Configurações → Sobre o telefone → tocar 7× em "Número da versão"
#              → Opções do desenvolvedor → Depuração USB: ligado
adb devices                                   # tem que listar o aparelho
adb install -r android/dist/ventus.apk        # -r = reinstala mantendo os dados
```

Erros comuns:

| erro | causa | solução |
|---|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | assinado com outro keystore | desinstalar (`adb uninstall br.com.ventapel.ventus`) e instalar de novo — perde os dados locais |
| `INSTALL_FAILED_VERSION_DOWNGRADE` | `versionCode` menor que o instalado | subir o `--version-code` |
| `INSTALL_FAILED_ALREADY_EXISTS` | faltou o `-r` | usar `adb install -r` |
| `no devices/emulators found` | depuração USB desligada, ou o diálogo "Permitir depuração USB?" não foi aceito no telefone | olhar a tela do telefone |

---

## 8 · Atualizar a app sem recompilar

**Esta é a razão de ser de toda a arquitetura.**

| o que mudou | precisa de APK novo? |
|---|---|
| qualquer tela, texto, lógica, API | **não** — deploy do site e pronto |
| ícone do launcher | sim |
| nome, atalhos do press-and-hold | sim |
| URL que a app abre | sim (e reinstalar nos 6 telefones) |
| package name ou keystore | sim — e vira um app **diferente** |

O ciclo normal é: `git push` → deploy → o vendedor abre o Ventus e já está novo.
O service worker está em `registerType: 'prompt'`, então a app não se recarrega
sozinha no meio de uma nota ditada: ela oferece atualizar.

Como o TWA compartilha o armazenamento com o Chrome, o cache, o IndexedDB
(Dexie, a fila offline) e a sessão continuam intactos entre atualizações do
site. Um APK novo com o **mesmo** keystore instalado por cima (`-r` ou pela
Release) também preserva tudo.

---

## 9 · A ordem correta das coisas

Fazer fora de ordem custa uma tarde. A sequência é:

```
1. definir a URL definitiva                       ← depois disso não muda mais
2. deploy do site nessa URL (com os ícones)
3. node scripts/gerar-assetlinks.mjs              → public/.well-known/assetlinks.json
4. deploy de novo (o assetlinks só vale publicado)
5. node scripts/gerar-assetlinks.mjs --verificar=<url>     → tem que passar
6. git tag v1.0.0 && git push origin v1.0.0       → APK na Release
7. registrar package + SHA-256 no Android Developer Console
8. cadastrar os 6 aparelhos                       ← antes de 30/09/2026
9. instalar nos 6 telefones e conferir: sem barra do Chrome
```

Os passos 3 a 5 antes do 6 porque o assetlinks tem que estar no ar quando o
telefone instalar. Os passos 7 e 8 antes de 30/09 porque é o prazo.

---

## 10 · Referências verificadas (ago/2026)

- [Android developer verification](https://developer.android.com/developer-verification) — tipos de conta, Limited Distribution, prazos
- [Android Developers Blog — rollout da verificação](https://android-developers.googleblog.com/2026/06/android-developer-verification.html)
- [Bubblewrap CLI — README](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md) — comandos e flags
- [Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks) — requisitos do assetlinks e os comandos `adb pm ...`
- [android-actions/setup-android](https://github.com/android-actions/setup-android) — SDK no runner
