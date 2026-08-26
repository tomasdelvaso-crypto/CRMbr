# Instalar o Ventus no telefone

O Ventus é uma PWA: instala-se pelo próprio navegador, sem loja de
aplicativos e sem APK. Fica com ícone próprio, abre sem a barra do
navegador e funciona sem sinal.

**Endereço:** https://ventus3.vercel.app

---

## Android — Chrome

1. Abrir **https://ventus3.vercel.app** no Chrome.
2. Menu **⋮** (canto superior direito) → **Instalar app**.
   Se aparecer **Adicionar à tela inicial**, é o mesmo caminho.
3. Confirmar. O ícone do Ventus aparece na tela de início.

Se o item não aparecer no menu, recarregue a página uma vez e tente de
novo — o Chrome só oferece a instalação depois de registrar o service
worker.

## iPhone e iPad — Safari

No iOS **só funciona pelo Safari**. Chrome e Firefox no iPhone não
conseguem instalar.

1. Abrir **https://ventus3.vercel.app** no **Safari**.
2. Botão **Compartilhar** (o quadrado com a seta para cima, na barra de
   baixo).
3. Rolar a lista e tocar em **Adicionar à Tela de Início**.
4. Confirmar em **Adicionar**.

Este passo não é opcional no iPhone: sem ele o Ventus não pode enviar
notificações, porque o iOS só as libera para apps adicionadas à tela de
início.

---

## O que o atalho ganha em relação a abrir pelo navegador

- **Abre sem barra de navegador** — a tela inteira é do app.
- **Funciona sem sinal.** A carteira fica no aparelho; um registro feito
  dentro de um galpão sai da fila assim que houver rede.
- **Atalhos de toque longo.** Segurar o ícone abre direto em
  **Registrar por voz**, **Golden Hour** ou **Hoje**.
- **Compartilhar para o Ventus.** Um áudio ou uma foto compartilhada de
  outro app oferece o Ventus como destino e cai na tela de registro já
  carregada.
- **Notificações** (depois de aceitar o pedido nos Ajustes).

## Atualizações

Não há nada a fazer: o app aponta para o site, então cada publicação
chega sozinha. Quando há versão nova aparece um aviso **«Nova versão
disponível · Atualizar»** — nunca uma recarga de surpresa no meio de uma
nota de voz.

## Se aparecer o CRM antigo

Quem abriu `ventus3.vercel.app` no primeiro dia pegou o service worker do
CRM v2, que ficou servindo a tela velha de cache. Resolve-se uma única
vez: nas configurações do site, **limpar dados**, e recarregar. Em
aparelhos novos isso não acontece.
