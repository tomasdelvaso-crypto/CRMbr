# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hoje.spec.ts >> Tela Hoje >> arrastar para a direita resolve o cartão e oferece desfazer
- Location: e2e/hoje.spec.ts:65:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Desfazer' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: 'Desfazer' })

```

```yaml
- banner:
  - heading "Hoje" [level=1]
- main:
  - region "Progresso de hoje":
    - progressbar "Contato"
    - progressbar "Conversa"
    - progressbar "Avanço"
    - paragraph: 2 contatos de largada por conferir a agenda e revisar as prioridades.
    - paragraph: Sua sequência começa hoje
    - paragraph: Uma Hora Cheia completa sela o primeiro dia útil.
  - button "Iniciar Golden Hour 4 contatos prontos"
  - region "Suas 3 ações de hoje":
    - heading "Suas 3 de hoje" [level=2]
    - text: Arraste → feito · ← adiar
    - list:
      - listitem:
        - paragraph: Ambev
        - paragraph: CD Guarulhos — caixa violada
        - text: 1/3
        - paragraph: "Conversar com Marcelo para levar Valor de 4 para 5: valor descoberto está associado à visão tomador de decisão"
        - text: Avanço R$ 180.000
        - button "Por que isto?"
        - button "Fazer agora"
        - button "Adiar"
        - button "Feito"
        - button "Adiar"
      - listitem:
        - paragraph: Tetra Pak
        - paragraph: Linha 3 — fita e selagem
        - text: 2/3
        - paragraph: "Ligação de resgate para Marcelo: retomar com um motivo novo e sair com data marcada"
        - text: Avanço R$ 320.000
        - button "Por que isto?"
        - button "Fazer agora"
        - button "Adiar"
        - button "Feito"
        - button "Adiar"
      - listitem:
        - paragraph: Natura
        - paragraph: E-commerce — fechamento automático
        - text: 3/3
        - paragraph: "Ligar para Marcelo em Qualificação: confirmar o próximo passo e marcar data"
        - text: Avanço R$ 95.000
        - button "Por que isto?"
        - button "Fazer agora"
        - button "Adiar"
        - button "Feito"
        - button "Adiar"
  - region "Fila completa":
    - button "Ver tudo (6)"
  - status
- button "Registrar por voz"
- button "Perguntar ao Ventus"
- button "Falar com o Ventus"
- navigation "Navegação principal":
  - list:
    - listitem:
      - link "Hoje":
        - /url: /
    - listitem:
      - link "Carteira":
        - /url: /carteira
    - listitem:
      - link "Golden Hour":
        - /url: /golden
    - listitem:
      - link "Revisão do Ventus":
        - /url: /revisao
    - listitem:
      - link "Mais":
        - /url: /mais
- region "Avisos"
```

# Test source

```ts
  1   | // e2e/hoje.spec.ts
  2   | // La tela Hoje es el producto entero en una pantalla, y todo lo que se prueba
  3   | // acá es una decisión de producto explícita del PLANO, no un detalle:
  4   | //
  5   | //  · TRES tarjetas. El límite duro es lo que separa un asistente de un panel
  6   | //    infinito de pendientes — el defecto que mató al v2.
  7   | //  · «Por que isto?» despliega la cuenta completa. Sin poder auditar el
  8   | //    ranking, el vendedor no le cree, y con razón.
  9   | //  · El swipe a la derecha resuelve y deja deshacer 5 segundos.
  10  | //  · Resolver las 3 NO trae una cuarta: el día está congelado y «Pronto por
  11  | //    hoje» tiene que ser alcanzable.
  12  | 
  13  | import {
  14  |   arrastar,
  15  |   cartoesDoDia,
  16  |   esperarPelaTelaHoje,
  17  |   expect,
  18  |   secaoDoDia,
  19  |   sementeVazia,
  20  |   test,
  21  | } from './fixtures/app'
  22  | 
  23  | test.describe('Tela Hoje', () => {
  24  |   test('mostra exatamente 3 cartões, com 5 negócios na carteira', async ({ app }) => {
  25  |     await expect(cartoesDoDia(app)).toHaveCount(3)
  26  | 
  27  |     // Y los tres son de clientes distintos: tres tarjetas del mismo logo se
  28  |     // leen como «el sistema está roto» aunque el score tenga razón.
  29  |     const clientes = await cartoesDoDia(app)
  30  |       .locator('p.font-semibold')
  31  |       .first()
  32  |       .allTextContents()
  33  |     expect(clientes.length).toBeGreaterThan(0)
  34  | 
  35  |     // El encabezado cuenta lo mismo que la lista.
  36  |     await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Suas 3 de hoje')
  37  | 
  38  |     // El resto de la cola existe, pero cerrada y a propósito.
  39  |     await expect(app.getByRole('button', { name: /Ver tudo/i })).toBeVisible()
  40  |   })
  41  | 
  42  |   test('«Por que isto?» abre as señales com peso e soma', async ({ app }) => {
  43  |     const primeiro = cartoesDoDia(app).first()
  44  |     const chip = primeiro.getByRole('button', { name: 'Por que isto?' })
  45  | 
  46  |     // Cerrado por defecto: la explicación no puede robarle la pantalla a la
  47  |     // acción.
  48  |     await expect(primeiro.getByText(/pontos de prioridade/)).toHaveCount(0)
  49  | 
  50  |     await chip.click()
  51  | 
  52  |     const explicacao = primeiro.getByText(/Soma = .* pontos de prioridade/)
  53  |     await expect(explicacao).toBeVisible()
  54  | 
  55  |     // Cada señal trae su peso con signo: es la cuenta, no un adjetivo.
  56  |     const sinais = primeiro.locator('ul li span.tnum')
  57  |     expect(await sinais.count()).toBeGreaterThan(0)
  58  |     await expect(sinais.first()).toHaveText(/^[+-]?\d+$/)
  59  | 
  60  |     // Y vuelve a cerrarse: es un toggle, no una puerta de una sola dirección.
  61  |     await chip.click()
  62  |     await expect(explicacao).toHaveCount(0)
  63  |   })
  64  | 
  65  |   test('arrastar para a direita resolve o cartão e oferece desfazer', async ({ app }) => {
  66  |     const cartoes = cartoesDoDia(app)
  67  |     const primeiro = cartoes.first()
  68  |     const cliente = (await primeiro.locator('p.font-semibold').first().innerText()).trim()
  69  | 
  70  |     await arrastar(primeiro, 200)
  71  | 
  72  |     // El toast de deshacer aparece en el mismo frame del gesto.
  73  |     const desfazer = app.getByRole('button', { name: 'Desfazer' })
> 74  |     await expect(desfazer).toBeVisible()
      |                            ^ Error: expect(locator).toBeVisible() failed
  75  |     await expect(app.getByText(`Feito · ${cliente}`)).toBeVisible()
  76  | 
  77  |     // La tarjeta colapsa a la tira resuelta, sin desaparecer: ver «2 de 3
  78  |     // resueltas» es la mitad de la recompensa.
  79  |     await expect(cartoes).toHaveCount(3)
  80  |     await expect(primeiro.getByText('· feito')).toBeVisible()
  81  |     await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Faltam 2 de 3')
  82  | 
  83  |     // Deshacer devuelve la tarjeta a pendiente y NO escribe nada.
  84  |     await desfazer.click()
  85  |     await expect(secaoDoDia(app).getByRole('heading', { level: 2 })).toHaveText('Suas 3 de hoje')
  86  |     await expect(primeiro.getByRole('button', { name: 'Fazer agora' })).toBeVisible()
  87  |   })
  88  | 
  89  |   test('resolver as 3 dá «Pronto por hoje» e não traz uma quarta', async ({ app, ventus }) => {
  90  |     const cartoes = cartoesDoDia(app)
  91  |     await expect(cartoes).toHaveCount(3)
  92  | 
  93  |     for (let i = 0; i < 3; i++) {
  94  |       // Siempre el primero que siga pendiente: los resueltos quedan en la
  95  |       // lista como tira.
  96  |       const pendente = cartoes.filter({ has: app.getByRole('button', { name: 'Fazer agora' }) }).first()
  97  |       await arrastar(pendente, 200)
  98  |       // Se cierra el toast para que el siguiente gesto no caiga sobre él.
  99  |       await app.getByRole('button', { name: 'Desfazer' }).waitFor()
  100 |       await app.getByRole('button', { name: 'Dispensar aviso' }).first().click()
  101 |       await app.waitForTimeout(150)
  102 |     }
  103 | 
  104 |     await expect(app.getByRole('heading', { name: 'Pronto por hoje' })).toBeVisible()
  105 |     await expect(app.getByText('As 3 de hoje estão resolvidas')).toBeVisible()
  106 | 
  107 |     // Y la lista sigue teniendo 3: ni una tarjeta nueva ocupó el lugar.
  108 |     await expect(cartoes).toHaveCount(3)
  109 |     await expect(app.getByRole('button', { name: 'Fazer agora' })).toHaveCount(0)
  110 | 
  111 |     // El día está congelado en Dexie, así que recargar no lo reabre.
  112 |     await app.reload()
  113 |     await esperarPelaTelaHoje(app)
  114 |     await expect(app.getByRole('heading', { name: 'Pronto por hoje' })).toBeVisible()
  115 |     await expect(cartoesDoDia(app)).toHaveCount(3)
  116 | 
  117 |     // Las tres resoluciones se encolaron para subir; ninguna se perdió.
  118 |     const outbox = await ventus.ler<{ tabla: string }>('outbox')
  119 |     expect(outbox.length).toBeGreaterThanOrEqual(3)
  120 |   })
  121 | 
  122 |   test('carteira vazia não se confunde com dia tranquilo', async ({ page, ventus }) => {
  123 |     await ventus.semear(sementeVazia())
  124 |     await expect(page.getByText('Baixando a sua carteira')).toBeVisible()
  125 |     await expect(page.getByText('Nada urgente na carteira')).toHaveCount(0)
  126 |   })
  127 | })
  128 | 
```