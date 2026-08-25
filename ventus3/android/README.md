# `android/` — o empacotamento Android (TWA)

Quase tudo aqui é **derivado** e não entra no git. O `.gitignore` da raiz do
projeto ignora `android/*` e devolve só os arquivos que são fonte.

| caminho | versionado? | o que é |
|---|---|---|
| `twa-manifest.json` | **sim** | fonte de verdade do APK. O `scripts/build-apk.sh` copia daqui e troca a URL |
| `README.md` | **sim** | este arquivo |
| `ventapel-ventus.keystore` | **não** | chave de release RSA 4096. Insubstituível. Senha em `/home/user/ventus-keystore-pass.txt` e no gestor de senhas |
| `twa/` | **não** | projeto Android gerado pelo Bubblewrap. Apagar e recriar à vontade |
| `dist/` | **não** | saída: `ventus.apk`, `ventus-<versão>-<code>.apk`, `.aab` |

## Comandos

```bash
../scripts/build-apk.sh https://ventus.ventapel.com.br      # URL → APK assinado
../scripts/build-apk.sh <url> --so-manifest                 # só mostra o manifest
node ../scripts/gerar-assetlinks.mjs                        # keystore → assetlinks.json
```

## Não fazer

- **Não** editar `twa/` à mão: o próximo build apaga tudo. Mudanças vão no
  `twa-manifest.json`.
- **Não** gerar um keystore novo. Um segundo keystore torna o app instalado
  impossível de atualizar e invalida o fingerprint registrado no Android
  Developer Console.
- **Não** comitar `.keystore`, `.apk` ou `.aab`.

O passo a passo completo — trâmite do Google, instalação no telefone,
diagnóstico do assetlinks — está em [`../docs/ANDROID.md`](../docs/ANDROID.md).
