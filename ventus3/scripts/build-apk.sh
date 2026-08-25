#!/usr/bin/env bash
# scripts/build-apk.sh — gera o APK (TWA) do Ventus a partir de uma URL.
#
# ══════════════════════════════════════════════════════════════════════════
# USO
# ══════════════════════════════════════════════════════════════════════════
#     ./scripts/build-apk.sh https://ventus.ventapel.com.br
#
# Opções (env ou flag):
#     --version-code=<n>     código de versão (padrão: nº de commits do git)
#     --version-name=<s>     nome de versão  (padrão: v<code> ou a tag do git)
#     --permitir-http        aceita http:// (só para teste local; Android exige https)
#     --limpar               apaga o projeto gerado antes de recriá-lo
#     --so-manifest          gera o twa-manifest.json parametrizado e para
#
#     APK_VERSION_CODE, APK_VERSION_NAME, VENTUS_KEYSTORE_PASSWORD,
#     BUBBLEWRAP_JDK_PATH, ANDROID_HOME / ANDROID_SDK_ROOT
#
# ══════════════════════════════════════════════════════════════════════════
# O QUE ELE FAZ, EM ORDEM
# ══════════════════════════════════════════════════════════════════════════
#  1. valida a URL e monta android/twa/twa-manifest.json a partir do template
#     versionado android/twa-manifest.json, trocando TODA URL absoluta pela
#     origem que você passou (ícones, atalhos, share target, escopo).
#  2. `bubblewrap update` — regenera o projeto Android inteiro a partir desse
#     manifest. Usamos `update` e nunca `init`: `init` é interativo (faz 20
#     perguntas) e este script tem que rodar sozinho num runner de CI.
#  3. `bubblewrap build` — gradle + zipalign + apksigner com o keystore de
#     release. As senhas vão por variável de ambiente, nunca por argv.
#  4. copia o .apk (e o .aab) assinados para android/dist/.
#  5. lembra de regenerar/publicar o assetlinks.json.
#
# É IDEMPOTENTE: rodar duas vezes com a mesma URL dá o mesmo resultado. O
# projeto Android em android/twa/ é 100% derivado e está no .gitignore.
#
# ══════════════════════════════════════════════════════════════════════════
# A PEGADINHA QUE CUSTA UMA TARDE
# ══════════════════════════════════════════════════════════════════════════
# O APK é uma casca: ele só carrega a URL. Trocar a URL depois de instalado
# EXIGE recompilar e reinstalar em todos os telefones. Trocar o CONTEÚDO do
# site não exige nada — é só fazer deploy. Por isso a URL definitiva tem que
# estar decidida ANTES do primeiro APK, e o package name
# (br.com.ventapel.ventus) e o keystore nunca mudam depois disso.

set -Eeuo pipefail

# ── cores só quando há terminal ────────────────────────────────────────────
if [ -t 1 ]; then
  C_ERR=$'\033[1;31m'; C_OK=$'\033[1;32m'; C_INFO=$'\033[1;36m'; C_WARN=$'\033[1;33m'; C_OFF=$'\033[0m'
else
  C_ERR=''; C_OK=''; C_INFO=''; C_WARN=''; C_OFF=''
fi

passo() { printf '\n%s▶ %s%s\n' "$C_INFO" "$*" "$C_OFF"; }
ok()    { printf '%s✓ %s%s\n' "$C_OK" "$*" "$C_OFF"; }
aviso() { printf '%s! %s%s\n' "$C_WARN" "$*" "$C_OFF"; }
morrer() { printf '\n%s✖ %s%s\n\n' "$C_ERR" "$1" "$C_OFF" >&2; exit "${2:-1}"; }

trap 'morrer "Falhou na linha $LINENO. Comando: ${BASH_COMMAND}" 1' ERR

# ── caminhos ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DIR_ANDROID="$RAIZ/android"
TEMPLATE="$DIR_ANDROID/twa-manifest.json"
PROJETO="$DIR_ANDROID/twa"
DIST="$DIR_ANDROID/dist"
KEYSTORE="${VENTUS_KEYSTORE_PATH:-$DIR_ANDROID/ventapel-ventus.keystore}"
ARQUIVO_SENHA="${VENTUS_KEYSTORE_PASS_FILE:-/home/user/ventus-keystore-pass.txt}"

# ── argumentos ────────────────────────────────────────────────────────────
URL=""
PERMITIR_HTTP=0
LIMPAR=0
SO_MANIFEST=0
VERSION_CODE="${APK_VERSION_CODE:-}"
VERSION_NAME="${APK_VERSION_NAME:-}"

for arg in "$@"; do
  case "$arg" in
    --permitir-http) PERMITIR_HTTP=1 ;;
    --limpar)        LIMPAR=1 ;;
    --so-manifest)   SO_MANIFEST=1 ;;
    --version-code=*) VERSION_CODE="${arg#*=}" ;;
    --version-name=*) VERSION_NAME="${arg#*=}" ;;
    -h|--help)       sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    --*)             morrer "Opção desconhecida: $arg" ;;
    *)
      [ -n "$URL" ] && morrer "Passe UMA única URL. Recebi «$URL» e «$arg»."
      URL="$arg" ;;
  esac
done

[ -n "$URL" ] || morrer "Falta a URL.

    ./scripts/build-apk.sh https://ventus.ventapel.com.br

  É a URL que o APK vai abrir. Depois de distribuído, mudá-la exige
  recompilar e reinstalar nos 6 telefones — então decida antes."

# ── 1. valida e normaliza a URL ───────────────────────────────────────────
passo "1/6  URL"
URL="${URL%/}"
case "$URL" in
  https://*) ;;
  http://*)
    [ "$PERMITIR_HTTP" -eq 1 ] || morrer "A URL precisa ser https://.

  Android só valida Digital Asset Links sobre HTTPS: com http:// a barra de
  endereço do Chrome vai aparecer em cima da app, sempre.
  Para um teste local use --permitir-http (o APK resultante NÃO serve para
  distribuir)."
    aviso "http:// aceito por --permitir-http. Este APK é só para teste local." ;;
  *) morrer "URL inválida: «$URL». Precisa começar com https://" ;;
esac
HOST="$(printf '%s' "$URL" | sed -E 's#^[a-z]+://##; s#[:/].*$##')"
[ -n "$HOST" ] || morrer "Não consegui extrair o host de «$URL»."
ok "URL   $URL"
ok "host  $HOST"

# ── 2. pré-requisitos ─────────────────────────────────────────────────────
passo "2/6  Pré-requisitos"

command -v node >/dev/null 2>&1 || morrer "node não está no PATH. Precisa de Node 18+."
command -v keytool >/dev/null 2>&1 || morrer "keytool não está no PATH. Instale um JDK (17 ou 21)."

if command -v bubblewrap >/dev/null 2>&1; then
  BW=(bubblewrap)
else
  aviso "bubblewrap não está instalado; vou usar npx (baixa ~280 pacotes na 1ª vez)."
  BW=(npx --yes @bubblewrap/cli@1.25.0)
fi
ok "bubblewrap: ${BW[*]}"

[ -f "$TEMPLATE" ] || morrer "Não achei o template $TEMPLATE (deveria estar versionado)."

if [ ! -f "$KEYSTORE" ]; then
  morrer "Não achei o keystore de release em:
    $KEYSTORE

  Ele NÃO está no repositório de propósito. Se este é o primeiro build da
  vida do app, gere-o uma única vez:

    keytool -genkeypair -keystore \"$KEYSTORE\" -storetype PKCS12 \\
      -alias ventapel -keyalg RSA -keysize 4096 -sigalg SHA384withRSA \\
      -validity 10950 \\
      -dname \"CN=Ventus, OU=Comercial, O=Ventapel Brasil, L=Sao Paulo, ST=SP, C=BR\"

  e guarde a senha em $ARQUIVO_SENHA (fora do repo) e no gestor de senhas.

  Se NÃO é o primeiro build: pare. Assinar com outro keystore gera uma app
  que o Android trata como diferente — não atualiza a instalada, e o
  fingerprint registrado no Android Developer Console deixa de bater."
fi
ok "keystore $KEYSTORE"

# senha: env > arquivo fora do repo
SENHA="${VENTUS_KEYSTORE_PASSWORD:-}"
if [ -z "$SENHA" ] && [ -f "$ARQUIVO_SENHA" ]; then
  SENHA="$(sed -nE 's/^VENTUS_KEYSTORE_PASSWORD=(.*)$/\1/p' "$ARQUIVO_SENHA" | head -n1)"
fi
[ -n "$SENHA" ] || morrer "Não achei a senha do keystore.
  Defina VENTUS_KEYSTORE_PASSWORD, ou crie $ARQUIVO_SENHA com a linha
    VENTUS_KEYSTORE_PASSWORD=<a senha>"
ok "senha do keystore encontrada"

ALIAS="$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).signingKey.alias))" "$TEMPLATE")"

# ── 2b. JDK 17 + Android SDK para o bubblewrap ────────────────────────────
# O bubblewrap lê ~/.bubblewrap/config.json. Preenchemos sem interação para
# que o script rode em CI; se faltar algo, dizemos exatamente o quê.
# Com --so-manifest não compilamos nada, então nem checamos a toolchain.
if [ "$SO_MANIFEST" -eq 0 ]; then
CONFIG_BW="${HOME}/.bubblewrap/config.json"
mkdir -p "${HOME}/.bubblewrap"
[ -f "$CONFIG_BW" ] || printf '{"jdkPath":"","androidSdkPath":""}\n' > "$CONFIG_BW"

CFG_JDK="$(node -e "try{process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).jdkPath||''))}catch(e){}" "$CONFIG_BW")"
CFG_SDK="$(node -e "try{process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).androidSdkPath||''))}catch(e){}" "$CONFIG_BW")"

JDK_PATH="${BUBBLEWRAP_JDK_PATH:-$CFG_JDK}"
if [ -z "$JDK_PATH" ] || [ ! -x "$JDK_PATH/bin/javac" ]; then
  for cand in "$HOME/.bubblewrap/jdk/jdk-17.0.11+9" /usr/lib/jvm/java-17-openjdk-amd64 "${JAVA_HOME_17_X64:-}" "${JAVA_HOME:-}"; do
    if [ -n "$cand" ] && [ -x "$cand/bin/javac" ]; then JDK_PATH="$cand"; break; fi
  done
fi

SDK_PATH="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$CFG_SDK}}"
if [ -z "$SDK_PATH" ] || { [ ! -x "$SDK_PATH/tools/bin/sdkmanager" ] && [ ! -x "$SDK_PATH/cmdline-tools/latest/bin/sdkmanager" ] && [ ! -x "$SDK_PATH/cmdline-tools/bin/sdkmanager" ]; }; then
  if [ -d "$HOME/.bubblewrap/android_sdk/tools" ]; then SDK_PATH="$HOME/.bubblewrap/android_sdk"; fi
fi

if [ -z "$JDK_PATH" ] || [ ! -x "$JDK_PATH/bin/javac" ]; then
  morrer "Falta o JDK 17 que o bubblewrap usa.

  Instale-o com o próprio bubblewrap (interativo, uma vez só):
      bubblewrap doctor        # responda «Yes» quando ele oferecer baixar o JDK
  ou aponte um JDK 17 já instalado:
      bubblewrap updateConfig --jdkPath=/caminho/do/jdk-17
  ou exporte BUBBLEWRAP_JDK_PATH=/caminho/do/jdk-17

  Ele baixa de github.com/adoptium — NÃO serve JDK 21: as command line tools
  do Android não compilam com ele."
fi

if [ -z "$SDK_PATH" ]; then
  morrer "Falta o Android SDK (command line tools).

  Instale-o com o próprio bubblewrap (interativo, uma vez só):
      bubblewrap doctor        # responda «Yes» quando ele oferecer baixar o SDK
  ou aponte um SDK já instalado:
      bubblewrap updateConfig --androidSdkPath=/caminho/do/android-sdk
  ou exporte ANDROID_HOME=/caminho/do/android-sdk

  O download vem de https://dl.google.com/android/repository/ — se a sua rede
  bloqueia esse host, NÃO existe espelho oficial: use um runner do GitHub
  (o workflow .github/workflows/apk.yml já traz o SDK pronto) ou o PWABuilder.
  Ver docs/ANDROID.md, seção «Quando não dá para compilar aqui»."
fi

node -e '
  const fs = require("fs");
  const [arquivo, jdk, sdk] = process.argv.slice(1);
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch {}
  cfg.jdkPath = jdk; cfg.androidSdkPath = sdk;
  fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2) + "\n");
' "$CONFIG_BW" "$JDK_PATH" "$SDK_PATH"
ok "JDK 17     $JDK_PATH"
ok "AndroidSDK $SDK_PATH"
fi

# ── 3. versão ─────────────────────────────────────────────────────────────
passo "3/6  Versão"
if [ -z "$VERSION_CODE" ]; then
  if git -C "$RAIZ" rev-parse --git-dir >/dev/null 2>&1; then
    VERSION_CODE="$(git -C "$RAIZ" rev-list --count HEAD 2>/dev/null || echo 1)"
  else
    VERSION_CODE=1
  fi
fi
case "$VERSION_CODE" in ''|*[!0-9]*) morrer "version-code precisa ser um inteiro. Recebi «$VERSION_CODE»." ;; esac
[ "$VERSION_CODE" -gt 0 ] || morrer "version-code precisa ser > 0."
[ -n "$VERSION_NAME" ] || VERSION_NAME="$(git -C "$RAIZ" describe --tags --abbrev=0 2>/dev/null || echo "1.0.$VERSION_CODE")"
VERSION_NAME="${VERSION_NAME#v}"
ok "versionCode $VERSION_CODE   versionName $VERSION_NAME"
# O versionCode SÓ SOBE. Um APK com versionCode menor que o instalado é
# rejeitado pelo Android com INSTALL_FAILED_VERSION_DOWNGRADE.

# ── 4. twa-manifest.json parametrizado ────────────────────────────────────
passo "4/6  twa-manifest.json para $HOST"
[ "$LIMPAR" -eq 1 ] && { rm -rf "$PROJETO"; ok "android/twa/ apagado (--limpar)"; }
mkdir -p "$PROJETO" "$DIST"

node -e '
  const fs = require("fs");
  const [template, saida, url, host, keystore, alias, vCode, vName] = process.argv.slice(1);
  const m = JSON.parse(fs.readFileSync(template, "utf8"));
  const base = new URL(url);

  // Reescribe cualquier URL absoluta del template para que apunte a la nueva
  // origen, conservando path + query. Así el template versionado puede tener
  // un host de ejemplo y nunca queda una URL vieja perdida en un atajo.
  const reorigem = (v) => {
    if (typeof v !== "string" || !/^https?:\/\//.test(v)) return v;
    const u = new URL(v);
    return new URL(u.pathname + u.search + u.hash, base).toString();
  };
  const andar = (n) => {
    if (Array.isArray(n)) return n.map(andar);
    if (n && typeof n === "object") return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, andar(v)]));
    return reorigem(n);
  };

  const out = andar(m);
  out.host = host;
  out.fullScopeUrl = new URL("/", base).toString();
  out.webManifestUrl = new URL("/manifest.webmanifest", base).toString();
  out.signingKey = { path: keystore, alias };
  out.appVersionCode = Number(vCode);
  out.appVersion = vName;
  // startUrl é relativo ao escopo: nunca vira absoluto.
  out.startUrl = m.startUrl;

  fs.writeFileSync(saida, JSON.stringify(out, null, 2) + "\n");
' "$TEMPLATE" "$PROJETO/twa-manifest.json" "$URL" "$HOST" "$KEYSTORE" "$ALIAS" "$VERSION_CODE" "$VERSION_NAME"

ok "escrito $PROJETO/twa-manifest.json"
if [ "$SO_MANIFEST" -eq 1 ]; then
  node -e "console.log(require('fs').readFileSync(process.argv[1],'utf8'))" "$PROJETO/twa-manifest.json"
  exit 0
fi

# ── 5. gerar o projeto Android ────────────────────────────────────────────
# `update` é a versão não-interativa de `init`: lê o twa-manifest.json, apaga
# o projeto antigo e regenera tudo. --skipVersionUpgrade porque a versão já
# foi decidida no passo 3 (senão o bubblewrap incrementa por conta própria e
# o número deixa de ser reproduzível a partir do git).
passo "5/6  bubblewrap update  (baixa os ícones de $HOST e gera o projeto Android)"
if ! "${BW[@]}" update \
      --manifest="$PROJETO/twa-manifest.json" \
      --directory="$PROJETO" \
      --skipVersionUpgrade; then
  morrer "bubblewrap update falhou.

  Causas mais comuns, nesta ordem:
   · os ícones não estão publicados em $URL. O bubblewrap BAIXA
     $URL/icon-512.png e $URL/icon-maskable-512.png
     para gerar os mipmaps. Faça o deploy do site ANTES de gerar o APK.
   · a rede bloqueia $HOST.
   · o JDK apontado em ~/.bubblewrap/config.json não é o 17."
fi
ok "projeto Android gerado em $PROJETO"

# ── 6. compilar e assinar ─────────────────────────────────────────────────
# As senhas vão por env (é o contrato do bubblewrap) e não por argv, para não
# aparecerem em `ps aux`. --skipPwaValidation porque a validação chama a API
# do PageSpeed Insights: é lenta, precisa de rede e não muda o APK.
passo "6/6  bubblewrap build  (gradle + zipalign + apksigner)"
(
  cd "$PROJETO"
  BUBBLEWRAP_KEYSTORE_PASSWORD="$SENHA" \
  BUBBLEWRAP_KEY_PASSWORD="$SENHA" \
  "${BW[@]}" build --skipPwaValidation --manifest="$PROJETO/twa-manifest.json"
) || morrer "bubblewrap build falhou.

  Se a mensagem fala de sdkmanager, build-tools ou de um download:
  o Android SDK precisa baixar build-tools e a platform de
  https://dl.google.com/android/repository/ na primeira compilação.
  Sem acesso a esse host não há como compilar localmente — use o workflow
  .github/workflows/apk.yml (runner do GitHub) ou o PWABuilder.
  Ver docs/ANDROID.md, seção «Quando não dá para compilar aqui»."

APK_ORIGEM="$PROJETO/app-release-signed.apk"
AAB_ORIGEM="$PROJETO/app-release-bundle.aab"
[ -f "$APK_ORIGEM" ] || morrer "O build terminou mas não achei $APK_ORIGEM."

APK_FINAL="$DIST/ventus-$VERSION_NAME-$VERSION_CODE.apk"
cp -f "$APK_ORIGEM" "$APK_FINAL"
cp -f "$APK_ORIGEM" "$DIST/ventus.apk"      # nome estável para a página /instalar
if [ -f "$AAB_ORIGEM" ]; then
  cp -f "$AAB_ORIGEM" "$DIST/ventus-$VERSION_NAME-$VERSION_CODE.aab"
fi

# `|| true` porque um pipeline sem match sai !=0 e, dentro de uma atribuição,
# `set -e` derrubaria o script justo na hora de imprimir o resumo.
FP="$(keytool -list -v -keystore "$KEYSTORE" -alias "$ALIAS" -storepass "$SENHA" 2>/dev/null \
      | grep -oE 'SHA-?256: [0-9A-F:]{95}' | head -n1 | sed -E 's/^SHA-?256: //' || true)"
[ -n "$FP" ] || FP="(não consegui ler — rode: keytool -list -v -keystore $KEYSTORE -alias $ALIAS)"

printf '\n%s══════════════════════════════════════════════════════════════%s\n' "$C_OK" "$C_OFF"
ok "APK assinado: $APK_FINAL"
ls -la "$DIST"
printf '\n'
echo "  package    br.com.ventapel.ventus"
echo "  versão     $VERSION_NAME ($VERSION_CODE)"
echo "  abre       $URL"
echo "  SHA-256    $FP"
printf '\n'
echo "  Falta:"
echo "   1. node scripts/gerar-assetlinks.mjs   → public/.well-known/assetlinks.json"
echo "   2. deploy do site (o assetlinks só vale publicado)"
echo "   3. node scripts/gerar-assetlinks.mjs --verificar=$URL"
echo "   4. registrar package + SHA-256 no Android Developer Console"
echo "  Passo a passo completo: docs/ANDROID.md"
printf '\n'
