#!/usr/bin/env node
// scripts/gerar-assetlinks.mjs
// Genera public/.well-known/assetlinks.json a partir del keystore de release
// y verifica que el resultado sea el que Android va a aceptar.
//
// ══════════════════════════════════════════════════════════════════════════
// PARA QUÉ SIRVE ESTE ARCHIVO
// ══════════════════════════════════════════════════════════════════════════
// El TWA es una Trusted Web Activity: un Chrome sin barra de direcciones que
// carga la URL de Ventus. Chrome solo esconde la barra si el sitio "declara"
// que confía en la app. Esa declaración es el Digital Asset Links:
//
//     https://<host>/.well-known/assetlinks.json
//
// que dice «el paquete br.com.ventapel.ventus, firmado con ESTE certificado,
// puede abrir mis URLs sin barra». Si el archivo falta, tiene el fingerprint
// equivocado o se sirve con el Content-Type equivocado, Chrome NO tira ningún
// error: simplemente muestra la barra de direcciones arriba de la app. Ese es
// el único síntoma. Por eso este script no solo genera: verifica.
//
// Requisitos que Android exige y que este script chequea (--verificar):
//   · HTTPS, sin redirecciones (una 301 de apex a www ya rompe la validación)
//   · HTTP 200
//   · Content-Type: application/json  (Vercel a veces manda text/plain →
//     por eso vercel.json tiene el header explícito)
//   · fingerprint SHA-256 en MAYÚSCULAS con dos puntos, 32 bytes
//
// ══════════════════════════════════════════════════════════════════════════
// CÓMO SE USA
// ══════════════════════════════════════════════════════════════════════════
//   node scripts/gerar-assetlinks.mjs
//   node scripts/gerar-assetlinks.mjs --verificar=https://ventus.ventapel.com.br
//   node scripts/gerar-assetlinks.mjs --check          # no escribe; falla si difiere
//   node scripts/gerar-assetlinks.mjs --extra-sha256=AA:BB:...  # 2ª clave
//
// Opciones:
//   --keystore=<path>       default: android/ventapel-ventus.keystore
//   --alias=<alias>         default: ventapel
//   --package=<id>          default: el packageId de android/twa-manifest.json
//   --senha-arquivo=<path>  default: /home/user/ventus-keystore-pass.txt
//   --saida=<path>          default: public/.well-known/assetlinks.json
//   --extra-sha256=<fp>     repetible. Para el Play App Signing o una 2ª clave
//   --verificar=<url>       baja el archivo publicado y lo compara
//   --check                 modo CI: no escribe, sale 1 si el disco no coincide
//   --json                  imprime el resultado como JSON y nada más
//
// LA CONTRASEÑA NUNCA VA EN argv: se pasa a keytool por stdin, así no queda
// visible en `ps aux` ni en el historial del shell.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

const PADRAO = {
  keystore: 'android/ventapel-ventus.keystore',
  alias: 'ventapel',
  senhaArquivo: '/home/user/ventus-keystore-pass.txt',
  saida: 'public/.well-known/assetlinks.json',
  twaManifest: 'android/twa-manifest.json',
};

// ─────────────────────────────────────────────────────────────────────────
// Utilidades de consola. Sin dependencias: este script tiene que correr en un
// runner de GitHub recién arrancado, antes de cualquier npm install.
// ─────────────────────────────────────────────────────────────────────────
let SILENCIO = false;
const log = (...a) => { if (!SILENCIO) console.log(...a); };
const erro = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

function lerArgs(argv) {
  const args = { extraSha256: [] };
  for (const bruto of argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(bruto);
    if (!m) erro(`Argumento não reconhecido: ${bruto}`);
    const [, chave, valor] = m;
    switch (chave) {
      case 'keystore': args.keystore = valor; break;
      case 'alias': args.alias = valor; break;
      case 'package': args.package = valor; break;
      case 'senha-arquivo': args.senhaArquivo = valor; break;
      case 'saida': args.saida = valor; break;
      case 'extra-sha256': args.extraSha256.push(valor); break;
      case 'verificar': args.verificar = valor; break;
      case 'check': args.check = true; break;
      case 'json': args.json = true; break;
      case 'help': case 'h': args.help = true; break;
      default: erro(`Opção desconhecida: --${chave}`);
    }
  }
  return args;
}

const abs = (p) => (isAbsolute(p) ? p : resolve(RAIZ, p));

// ─────────────────────────────────────────────────────────────────────────
// La contraseña. Orden de búsqueda, del más efímero al más persistente:
//   1. VENTUS_KEYSTORE_PASSWORD     (lo que usa el workflow de GitHub)
//   2. BUBBLEWRAP_KEYSTORE_PASSWORD (lo que ya usa build-apk.sh)
//   3. el archivo fuera del repo    (lo que usa una notebook)
// ─────────────────────────────────────────────────────────────────────────
function obterSenha(caminhoArquivo) {
  const doAmbiente =
    process.env['VENTUS_KEYSTORE_PASSWORD'] ?? process.env['BUBBLEWRAP_KEYSTORE_PASSWORD'];
  if (doAmbiente) return doAmbiente;

  if (!existsSync(caminhoArquivo)) {
    erro(
      `Não achei a senha do keystore.\n` +
        `  Defina VENTUS_KEYSTORE_PASSWORD, ou crie o arquivo ${caminhoArquivo}\n` +
        `  com a linha:  VENTUS_KEYSTORE_PASSWORD=<a senha>\n` +
        `  (esse arquivo mora FORA do repositório — nunca comitá-lo).`,
    );
  }
  const conteudo = readFileSync(caminhoArquivo, 'utf8');
  const m = /^VENTUS_KEYSTORE_PASSWORD=(.*)$/m.exec(conteudo);
  if (!m || !m[1]) erro(`${caminhoArquivo} não tem a linha VENTUS_KEYSTORE_PASSWORD=<senha>.`);
  return m[1].trim();
}

// ─────────────────────────────────────────────────────────────────────────
// keytool. La contraseña entra por stdin (keytool la pide interactivamente
// cuando falta -storepass), no por argv.
//
// JAVA_TOOL_OPTIONS ensucia el stdout de cualquier herramienta de la JVM con
// la línea «Picked up JAVA_TOOL_OPTIONS: …». Es el bug
// github.com/GoogleChromeLabs/bubblewrap/issues/446 y acá lo filtramos.
// ─────────────────────────────────────────────────────────────────────────
function keytoolLista(keystore, alias, senha) {
  return new Promise((ok, falha) => {
    const filho = execFile(
      'keytool',
      ['-list', '-v', '-keystore', keystore, '-alias', alias],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detalhe = `${stdout}\n${stderr}`
            .split('\n')
            .filter((l) => l && !l.includes('JAVA_TOOL_OPTIONS'))
            .join('\n')
            .trim();
          falha(new Error(detalhe || String(err)));
          return;
        }
        ok(stdout);
      },
    );
    filho.stdin.end(`${senha}\n`);
  });
}

const RE_FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function normalizarFingerprint(bruto, contexto) {
  const limpo = String(bruto).trim().toUpperCase().replace(/\s+/g, '');
  // Aceptamos también el formato sin dos puntos (64 hex), que es como lo
  // muestra la consola del Google Play y algún que otro tutorial.
  const semDoisPontos = limpo.replace(/:/g, '');
  if (!/^[0-9A-F]{64}$/.test(semDoisPontos)) {
    erro(`Fingerprint SHA-256 inválido em ${contexto}: «${bruto}»`);
  }
  const comDoisPontos = (semDoisPontos.match(/../g) ?? []).join(':');
  if (!RE_FP.test(comDoisPontos)) erro(`Fingerprint SHA-256 inválido em ${contexto}: «${bruto}»`);
  return comDoisPontos;
}

function extrairSha256(saidaKeytool) {
  // keytool -list -v imprime «SHA256: AA:BB:…». Ojo: en JDKs viejos aparece
  // como «SHA256:» dentro del bloque «Certificate fingerprints».
  const m = /SHA-?256:\s*([0-9A-Fa-f:]{95})/.exec(saidaKeytool);
  if (!m) {
    erro(
      'keytool respondeu, mas não achei o fingerprint SHA-256 na saída.\n' +
        'Rode manualmente:  keytool -list -v -keystore <keystore> -alias <alias>',
    );
  }
  return normalizarFingerprint(m[1], 'keystore');
}

// ─────────────────────────────────────────────────────────────────────────
// El documento en sí. La forma es fija: Android no perdona un campo de más
// ni un `relation` distinto.
// ─────────────────────────────────────────────────────────────────────────
function montarAssetLinks(packageName, fingerprints) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function validarDocumento(doc) {
  const problemas = [];
  if (!Array.isArray(doc)) return ['o JSON de topo tem que ser um array'];
  if (doc.length === 0) problemas.push('o array está vazio');
  doc.forEach((entrada, i) => {
    const onde = `entrada[${i}]`;
    if (!Array.isArray(entrada?.relation) ||
        !entrada.relation.includes('delegate_permission/common.handle_all_urls')) {
      problemas.push(`${onde}.relation precisa conter "delegate_permission/common.handle_all_urls"`);
    }
    const alvo = entrada?.target;
    if (alvo?.namespace !== 'android_app') problemas.push(`${onde}.target.namespace precisa ser "android_app"`);
    if (typeof alvo?.package_name !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(alvo.package_name)) {
      problemas.push(`${onde}.target.package_name inválido: ${alvo?.package_name}`);
    }
    const fps = alvo?.sha256_cert_fingerprints;
    if (!Array.isArray(fps) || fps.length === 0) {
      problemas.push(`${onde}.target.sha256_cert_fingerprints precisa ser um array não vazio`);
    } else {
      fps.forEach((fp, j) => {
        if (!RE_FP.test(String(fp))) problemas.push(`${onde}.sha256_cert_fingerprints[${j}] inválido: ${fp}`);
        if (/^(00:){31}00$/.test(String(fp))) problemas.push(`${onde}.sha256_cert_fingerprints[${j}] ainda é o placeholder de zeros`);
      });
    }
  });
  return problemas;
}

// ─────────────────────────────────────────────────────────────────────────
// Verificación contra el sitio publicado. Esto es lo que decide si la barra
// de Chrome aparece o no.
// ─────────────────────────────────────────────────────────────────────────
async function verificarPublicado(urlBase, esperado) {
  let base;
  try {
    base = new URL(urlBase);
  } catch {
    erro(`--verificar precisa de uma URL completa. Recebi: ${urlBase}`);
  }
  if (base.protocol !== 'https:') erro('--verificar exige https:// — Android não valida http.');

  const alvo = new URL('/.well-known/assetlinks.json', base).toString();
  log(`\n→ Verificando ${alvo}`);

  let resp;
  try {
    resp = await fetch(alvo, { redirect: 'manual', headers: { accept: 'application/json' } });
  } catch (e) {
    erro(`Não consegui buscar ${alvo}: ${e?.message ?? e}`);
  }

  const falhas = [];
  if (resp.status >= 300 && resp.status < 400) {
    falhas.push(
      `respondeu ${resp.status} → ${resp.headers.get('location')}. ` +
        'Android NÃO segue redirecionamentos aqui: o arquivo tem que estar no host exato ' +
        'que a app abre (apex vs. www é a pegadinha clássica).',
    );
  } else if (resp.status !== 200) {
    falhas.push(`respondeu HTTP ${resp.status}, esperado 200.`);
  }

  const ct = resp.headers.get('content-type') ?? '(sem Content-Type)';
  if (!ct.toLowerCase().includes('application/json')) {
    falhas.push(
      `Content-Type é «${ct}», precisa ser application/json. ` +
        'No Vercel isso se resolve com o bloco headers de /.well-known/assetlinks.json em vercel.json.',
    );
  }

  let publicado = null;
  if (resp.status === 200) {
    const texto = await resp.text();
    try {
      publicado = JSON.parse(texto);
    } catch {
      falhas.push(`o corpo não é JSON válido. Primeiros 200 caracteres: ${texto.slice(0, 200)}`);
    }
  }

  if (publicado) {
    for (const p of validarDocumento(publicado)) falhas.push(p);
    const fpsPublicados = new Set(
      publicado.flatMap((e) => e?.target?.sha256_cert_fingerprints ?? []).map(String),
    );
    for (const fp of esperado.fingerprints) {
      if (!fpsPublicados.has(fp)) falhas.push(`o fingerprint ${fp} NÃO está no arquivo publicado.`);
    }
    const pacotes = new Set(publicado.map((e) => e?.target?.package_name));
    if (!pacotes.has(esperado.packageName)) {
      falhas.push(`o package ${esperado.packageName} NÃO está no arquivo publicado (achei: ${[...pacotes].join(', ')}).`);
    }
  }

  if (falhas.length > 0) {
    console.error(`\n✖ O assetlinks publicado NÃO vai validar:\n`);
    for (const f of falhas) console.error(`   · ${f}`);
    console.error(
      '\n   Sintoma no telefone: a barra de endereço do Chrome aparece em cima da app.\n' +
        '   Depois de corrigir, force a revalidação:\n' +
        '     adb shell pm set-app-links --package ' + esperado.packageName + ' 0 all\n' +
        '     adb shell pm verify-app-links --re-verify ' + esperado.packageName + '\n' +
        '     adb shell pm get-app-links ' + esperado.packageName + '\n',
    );
    process.exit(1);
  }

  log(`✓ Publicado OK — HTTP 200, Content-Type ${ct}, fingerprint confere.`);
  log('  A barra do Chrome não deve aparecer (pode levar até ~1 min após instalar).');
}

// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const args = lerArgs(process.argv);
  SILENCIO = Boolean(args.json);

  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 44).join('\n'));
    return;
  }

  const keystore = abs(args.keystore ?? PADRAO.keystore);
  const saida = abs(args.saida ?? PADRAO.saida);
  const alias = args.alias ?? PADRAO.alias;
  const senhaArquivo = abs(args.senhaArquivo ?? PADRAO.senhaArquivo);

  // El packageId sale del twa-manifest.json para que no haya dos fuentes de
  // verdad: si alguien cambia el package ahí, el assetlinks lo sigue solo.
  let packageName = args.package;
  if (!packageName) {
    const caminhoManifest = abs(PADRAO.twaManifest);
    if (!existsSync(caminhoManifest)) erro(`Não achei ${caminhoManifest} para ler o packageId. Use --package=<id>.`);
    try {
      packageName = JSON.parse(readFileSync(caminhoManifest, 'utf8')).packageId;
    } catch (e) {
      erro(`${caminhoManifest} não é JSON válido: ${e?.message ?? e}`);
    }
    if (!packageName) erro(`${caminhoManifest} não tem "packageId".`);
  }

  if (!existsSync(keystore)) {
    erro(
      `Não achei o keystore em ${keystore}.\n` +
        `  Ele não está no repositório de propósito. Gere-o (uma única vez na vida do app) com:\n\n` +
        `    keytool -genkeypair -keystore ${keystore} -storetype PKCS12 \\\n` +
        `      -alias ${alias} -keyalg RSA -keysize 4096 -sigalg SHA384withRSA -validity 10950 \\\n` +
        `      -dname "CN=Ventus, OU=Comercial, O=Ventapel Brasil, L=Sao Paulo, ST=SP, C=BR"\n\n` +
        `  ATENÇÃO: perder esse arquivo = não conseguir mais atualizar a app instalada.`,
    );
  }

  const senha = obterSenha(senhaArquivo);
  let saidaKeytool;
  try {
    saidaKeytool = await keytoolLista(keystore, alias, senha);
  } catch (e) {
    erro(`keytool falhou (senha errada? alias errado?):\n${e.message}`);
  }

  const fingerprintPrincipal = extrairSha256(saidaKeytool);
  const extras = args.extraSha256.map((fp, i) => normalizarFingerprint(fp, `--extra-sha256[${i}]`));
  const fingerprints = [...new Set([fingerprintPrincipal, ...extras])];

  const doc = montarAssetLinks(packageName, fingerprints);
  const texto = `${JSON.stringify(doc, null, 2)}\n`;

  // ── Verificación del propio documento antes de tocar el disco ──────────
  const problemas = validarDocumento(JSON.parse(texto));
  if (problemas.length > 0) {
    erro(`O documento gerado não é válido:\n   · ${problemas.join('\n   · ')}`);
  }

  if (args.check) {
    if (!existsSync(saida)) erro(`--check: ${saida} não existe. Rode sem --check para gerá-lo.`);
    const emDisco = readFileSync(saida, 'utf8');
    if (emDisco.trim() !== texto.trim()) {
      console.error(`\n✖ --check: ${saida} está desatualizado.\n`);
      console.error('  Esperado:\n' + texto);
      console.error('  Em disco:\n' + emDisco);
      process.exit(1);
    }
    log(`✓ --check: ${saida} está em dia (fingerprint ${fingerprintPrincipal}).`);
  } else {
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(saida, texto, 'utf8');
    log(`✓ Escrito ${saida}`);
  }

  if (args.json) {
    console.log(JSON.stringify({ packageName, fingerprints, saida, keystore, alias }, null, 2));
  } else {
    log('');
    log('  package_name .... ' + packageName);
    log('  SHA-256 ......... ' + fingerprintPrincipal);
    for (const e of extras) log('  SHA-256 (extra) . ' + e);
    log('');
    log('  Esse mesmo SHA-256 é o que se registra no Android Developer Console');
    log('  (Limited Distribution Account) junto com o package name. Ver docs/ANDROID.md.');
    log('');
    log('  Falta publicar: o arquivo só vale depois de um deploy. Depois rode');
    log('    node scripts/gerar-assetlinks.mjs --verificar=https://<seu-host>');
  }

  if (args.verificar) {
    await verificarPublicado(args.verificar, { packageName, fingerprints });
  }
}

main().catch((e) => erro(e?.stack ?? String(e)));
