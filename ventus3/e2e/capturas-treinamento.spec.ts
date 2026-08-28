// e2e/capturas-treinamento.spec.ts
// As 17 capturas do treinamento em PT-BR para os vendedores (Victor Hugo,
// Renata, Andre, Paulo), com dados encenados — realistas e "vivos": nomes de
// empresas brasileiras do ramo, valores em R$, escalas PPVVCC variadas e
// evidência com citação textual.
//
// Mesma convenção do resto da suite de capturas: apagada por defeito, se
// pede a propósito —
//
//   CAPTURAS=1 npx playwright test --project=mobile capturas-treinamento.spec.ts
//
// Reusa os fixtures de e2e/fixtures/app.ts e dados.ts como base (a mesma
// cartera determinística, os mesmos helpers de interação) e monta por cima
// uma semente mais rica: 4 vendedores, atividades e toques da semana em
// curso (para os anéis, a sequência e o Placar), uma escala com evidência
// fresca/velha/ausente (para o hexágono) e uma proposta do Ventus esperando
// na Revisão.
//
// Um só teste percorre as 15 telas de telefone em sequência — a mesma sessão,
// sem recarregar o bundle entre passos onde importa (Registrar) — e depois
// muda o viewport para as 2 capturas de escritorio, sem resemear.

import { mkdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  abrir,
  diasAdiante,
  diasAtras,
  expect,
  leadDeCadencia,
  oportunidade,
  propostaCriarTask,
  secaoDoDia,
  sementePadrao,
  test,
  vendedor,
  VENDEDOR,
  type Semente,
} from './fixtures/app'
import type { Activity, EntityRef, IsoDate, ScalesRecord, Task, Touchpoint, Vendor } from '@/core'
// Import direto do submódulo — não do barril `@/data` — porque este pulla
// realtime.ts/config-publica.ts (usam `import.meta.env`) e o tsconfig do e2e
// não carrega os tipos de ambiente do Vite: um `import type` do barril quebra
// o type-check só por isto, sem ter nada que ver com o que esta prova precisa.
import type { LocalActivity, LocalTouchpoint, MetaRecord, RingsSnapshot } from '@/data/local-types'

const DESTINO = 'docs/capturas/treinamento'
const LIGADO = process.env['CAPTURAS'] === '1'

/* ══════════════════════════════════════════════════════════════════════════
   A semente do treinamento
   ══════════════════════════════════════════════════════════════════════════ */

/** As escalas da Tetra Pak: uma com prova fresca, uma com prova velha, uma
 * sem prova nenhuma — a variedade que o hexágono existe para mostrar. */
function escalasTetraPak(): ScalesRecord {
  return {
    dor: {
      score: 8,
      evidence: 'O Marcelo disse que perdem 4 horas por semana refazendo caixas mal fechadas.',
      evidence_source: 'Marcelo Silva · Gerente de Logística',
      evidence_at: diasAtras(6),
      updated_by: VENDEDOR,
      updated_at: `${diasAtras(6)}T14:30:00.000Z`,
    },
    poder: {
      score: 6,
      evidence: 'Ele falou que decide sozinho até R$ 50 mil, sem passar pelo comitê.',
      evidence_source: 'Marcelo Silva · Gerente de Logística',
      evidence_at: diasAtras(100),
      updated_by: VENDEDOR,
      updated_at: `${diasAtras(100)}T11:00:00.000Z`,
    },
    visao: { score: 5, description: '' },
    valor: {
      score: 7,
      evidence:
        'Comparou os números: hoje perdem R$ 18 mil por mês em caixas rejeitadas pela transportadora.',
      evidence_source: 'Marcelo Silva · Gerente de Logística',
      evidence_at: diasAtras(3),
      updated_by: VENDEDOR,
      updated_at: `${diasAtras(3)}T09:15:00.000Z`,
    },
    controle: { score: 3, description: '' },
    compras: { score: 4, description: '' },
  }
}

let proximoIdAtividade = 90_001
function atividade(over: Partial<Activity> & { opportunity_id: number; activity_date: IsoDate }): LocalActivity {
  const id = proximoIdAtividade++
  return {
    id,
    vendor: VENDEDOR,
    created_at: `${over.activity_date}T15:00:00.000Z`,
    activity_type: 'call',
    description: '',
    result: 'positivo',
    stage_at_time: null,
    methodology_code: null,
    ai_suggested_action: null,
    ai_suggested_scales: null,
    ai_confidence: null,
    next_action: null,
    next_action_date: null,
    next_action_done: null,
    source: 'manual',
    uid: `seed-treinamento-atividade-${String(id)}`,
    client_uuid: null,
    pendente: 0,
    ...over,
  }
}

let proximoIdToque = 91_001
function toque(over: Partial<Touchpoint> & { lead_id: number; executed_at: string }): LocalTouchpoint {
  const id = proximoIdToque++
  return {
    id,
    sequence_number: 1,
    channel: 'phone',
    result: 'interested',
    notes: null,
    uid: `seed-treinamento-toque-${String(id)}`,
    client_uuid: null,
    pendente: 0,
    vendor: VENDEDOR,
    ...over,
  }
}

/** Os 5 dias úteis da semana em curso (hoje é um deles). */
function diasDaSemana(): readonly IsoDate[] {
  return [diasAtras(4), diasAtras(3), diasAtras(2), diasAtras(1), diasAtras(0)]
}

function ringDoColega(vendor: string, dia: IsoDate, over: Partial<RingsSnapshot> = {}): RingsSnapshot {
  return {
    uid: `${vendor}:${dia}`,
    vendor,
    day: dia,
    contatos: 11,
    conversas: 3,
    avancos: 1,
    metas: { contato: 12, conversa: 3, avanco: 1 },
    fechado: 1,
    atualizado_em: `${dia}T19:00:00.000Z`,
    ...over,
  }
}

/**
 * `rings` e `meta` NÃO entram no objeto que `ventus.semear()` escreve: esse
 * caminho termina em `notificarMudancas()`, que só sabe invalidar as tabelas
 * do sync real (opportunities/leads/tasks/activities/touchpoints/commitments/
 * vendors) — passar uma tabela extra ali quebra com «is not iterable». Como
 * cada tela desta suite é uma navegação NOVA (`abrir()` recarrega a página),
 * o TanStack Query nunca tem cache velho para invalidar: dá para escrever
 * `rings`/`meta` direto no Dexie, sem passar pelo aviso de sync.
 */
interface SementeComExtras {
  semente: Semente & { activities: LocalActivity[]; touchpoints: LocalTouchpoint[]; tasks: Task[] }
  extras: { rings: RingsSnapshot[]; meta: MetaRecord[] }
}

function sementeTreinamento(): SementeComExtras {
  const base = sementePadrao()
  const [seg, ter, qua, qui, sex] = diasDaSemana() as [IsoDate, IsoDate, IsoDate, IsoDate, IsoDate]

  const opportunities = base.opportunities.map((o) =>
    o.id === 101
      ? oportunidade({
          ...o,
          sponsor: 'Marcelo Silva',
          scales: escalasTetraPak(),
          next_action: 'Levar amostra da fita nova para o teste na linha 3',
          next_action_date: diasAdiante(2),
          last_update: `${diasAtras(1)}T16:00:00Z`,
          last_activity_date: diasAtras(1),
        })
      : o,
  )

  const leads = [
    ...base.leads,
    leadDeCadencia({
      id: 205,
      company_name: 'Rodalog Soluções em Logística e Transporte Ltda',
      contact_name: 'Leandro Domingues',
      contact_title: 'Gerente de Logística',
      contact_email: null,
      contact_phone: null,
      touchpoints_count: 1,
      next_touchpoint_date: diasAtras(2),
      last_touchpoint_date: diasAtras(8),
    }),
  ]

  const vendors: Vendor[] = [
    vendedor(),
    {
      id: 2,
      name: 'Victor Hugo',
      email: 'vhfarias@ventapel.com.br',
      role: 'vendedor',
      phone: null,
      is_admin: false,
      is_active: true,
      monthly_target: null,
      auth_user_id: null,
      auth_id: null,
      telegram_id: null,
      telegram_username: null,
      created_at: '2025-09-12T10:53:16Z',
    },
    {
      id: 3,
      name: 'Andre',
      email: 'adettmer@ventapel.com.br',
      role: 'vendedor',
      phone: null,
      is_admin: false,
      is_active: true,
      monthly_target: null,
      auth_user_id: null,
      auth_id: null,
      telegram_id: null,
      telegram_username: null,
      created_at: '2025-09-21T12:08:04Z',
    },
    {
      id: 4,
      name: 'Paulo',
      email: 'psalvioni@ventapel.com.br',
      role: 'vendedor',
      phone: null,
      is_admin: false,
      is_active: true,
      monthly_target: null,
      auth_user_id: null,
      auth_id: null,
      telegram_id: null,
      telegram_username: null,
      created_at: '2026-03-24T21:36:06Z',
    },
  ]

  // Atividades da própria Renata, distribuídas na semana em curso — é o que
  // alimenta os 3 anéis de Hoje, o «Eu vs eu» do Placar e o histórico do
  // Dossiê da Tetra Pak.
  const activities: LocalActivity[] = [
    atividade({
      opportunity_id: 101,
      activity_date: seg,
      activity_type: 'call',
      description: 'Ligação com o Marcelo: alinhamos o teste da fita nova na linha 3.',
    }),
    atividade({
      opportunity_id: 103,
      activity_date: seg,
      activity_type: 'call',
      result: 'neutro',
      description: 'Liguei para a Natura, ficou de olhar a proposta com o time de compras.',
    }),
    atividade({
      opportunity_id: 102,
      activity_date: ter,
      activity_type: 'whatsapp',
      description: 'Mandei o vídeo do teste de queda para o comprador da Ambev.',
    }),
    atividade({
      opportunity_id: 104,
      activity_date: ter,
      activity_type: 'meeting',
      description: 'Reunião na Suzano com o time de expedição — aprovaram o piloto.',
    }),
    atividade({
      opportunity_id: 101,
      activity_date: qua,
      activity_type: 'call',
      description: 'Confirmei com o Marcelo a data do teste e quem vai acompanhar.',
    }),
    atividade({
      opportunity_id: 105,
      activity_date: qua,
      activity_type: 'call',
      description: 'Liguei para a Klabin sobre a troca de insumo — seguem avaliando.',
    }),
    atividade({
      opportunity_id: 101,
      activity_date: qui,
      activity_type: 'stage_change',
      description: 'Avançou para Negociação depois do teste aprovado na linha 3.',
      stage_at_time: 3,
    }),
    atividade({
      opportunity_id: 103,
      activity_date: qui,
      activity_type: 'whatsapp',
      description: 'Natura confirmou o piloto do fechamento automático para o mês que vem.',
    }),
    atividade({
      opportunity_id: 102,
      activity_date: sex,
      activity_type: 'call',
      description: 'Ligação com o CD Guarulhos: o Fernando quer uma reunião com a equipe.',
    }),
    atividade({
      opportunity_id: 105,
      activity_date: sex,
      activity_type: 'whatsapp',
      description: 'Mandei a ficha técnica nova para a Klabin.',
    }),
  ]

  const touchpoints: LocalTouchpoint[] = [
    toque({
      lead_id: 204,
      executed_at: `${seg}T10:00:00.000Z`,
      sequence_number: 1,
      channel: 'email',
      result: 'no_response',
    }),
    toque({
      lead_id: 201,
      executed_at: `${qua}T13:30:00.000Z`,
      sequence_number: 3,
      channel: 'whatsapp',
      result: 'interested',
      notes: 'Pediu para retomar depois do fechamento do mês.',
    }),
    toque({
      lead_id: 202,
      executed_at: `${qui}T09:00:00.000Z`,
      sequence_number: 2,
      channel: 'phone',
      result: 'not_now',
    }),
    toque({
      lead_id: 203,
      executed_at: `${sex}T11:00:00.000Z`,
      sequence_number: 4,
      channel: 'whatsapp',
      result: 'meeting_scheduled',
      notes: 'Agendou reunião para quinta que vem.',
    }),
  ]

  // Os carris do time: Victor Hugo forte, Andre na média, Paulo mais devagar
  // — o suficiente para que os 3 carris paralelos do Placar não fiquem
  // «sem dados».
  const rings: RingsSnapshot[] = []
  for (const dia of [seg, ter, qua, qui, sex]) {
    rings.push(
      ringDoColega('Victor Hugo', dia, { contatos: 15, conversas: 5, avancos: 2, fechado: 1 }),
      ringDoColega('Andre', dia, { contatos: 10, conversas: 2, avancos: 1, fechado: 0 }),
      ringDoColega('Paulo', dia, { contatos: 8, conversas: 1, avancos: 0, fechado: 0 }),
    )
  }

  // A próxima ação da Tetra Pak, para o bloco «Próximo passo» do Dossiê.
  const tarefaTetraPak: Task = {
    id: 'seed-treinamento-task-101',
    vendor: VENDEDOR,
    kind: 'next_action',
    target: { kind: 'opportunity', id: 101 } as EntityRef,
    title: 'Levar amostra da fita nova para o teste na linha 3',
    due_date: diasAdiante(2),
    status: 'pending',
    snoozed_until: null,
    created_at: `${diasAtras(1)}T16:00:00.000Z`,
    canal: 'visit',
    prioridade: 1,
  }

  // A sequência de Golden Hour: 4 dias úteis seguidos com Hora Cheia, até
  // ontem — hoje ainda está por fazer, que é a chamada à ação da tela.
  const meta: MetaRecord[] = [
    {
      chave: `sequencia:${VENDEDOR}`,
      valor: { selados: [seg, ter, qua, qui], escudos: 1, resgatesNoMes: 0 },
      atualizado_em: `${qui}T19:00:00.000Z`,
    },
  ]

  // A proposta do Ventus para a Revisão — a mesma da base, mas com uma fonte
  // diferente da que já aparece no Dossiê da Tetra Pak.
  const proposta = propostaCriarTask({
    evidencia: {
      quote: 'Se a caixa chegar violada de novo, eu perco o contrato com a rede.',
      fonte: { nome: 'Fernando Costa', cargo: 'Gerente do CD' },
    },
  })

  return {
    semente: {
      ...base,
      opportunities,
      leads,
      vendors,
      activities,
      touchpoints,
      tasks: [tarefaTetraPak],
      servidor: { ventus_actions: [proposta] },
    },
    extras: { rings, meta },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Helpers de cena
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Adianta o contador interno do mock de ingest (contrato.ts) SEM passar pela
 * UI: `mockIngest` roda ['feliz','ambiguo','pobre','sem_cliente'] e o cenário
 * "feliz" — o único com «Ventus sugere» — é o 4º de cada carga de página. Em
 * vez de gravar e descartar 3 notas de voz de verdade, chama o mesmo módulo
 * que a app usa (é o MESMO singleton do Vite, como db.ts) e adianta o
 * contador para que a PRÓXIMA gravação real caia em "feliz".
 */
const MODULO_INGEST = '/src/screens/Registrar/contrato.ts'

async function aquecerMockDeIngest(page: Page, vezes: number): Promise<void> {
  await page.evaluate(async ([n, modulo]) => {
    const mod = (await import(/* @vite-ignore */ modulo)) as {
      mockIngest: (meta: Record<string, unknown>) => Promise<unknown>
    }
    for (let i = 0; i < n; i++) {
      await mod.mockIngest({
        versao: '1',
        vendor: 'Renata',
        clientUuid: `aquecimento-${String(i)}-${String(Date.now())}`,
        fonte: 'audio',
        capturadoEm: new Date().toISOString(),
        duracaoSeg: 1,
        carteira: [],
        hoje: new Date().toISOString().slice(0, 10),
      })
    }
  }, [vezes, MODULO_INGEST] as const)
}

const MODULO_DB = '/src/data/db.ts'

/**
 * Escreve `rings` e `meta` direto no Dexie da página — ver o comentário de
 * `SementeComExtras`.
 *
 * TAMBÉM apaga `meta.tanstack:query-cache`: é onde o QueryClient persiste seu
 * cache (ver `criarPersisterDexie` em src/data/queries.ts), escrito pelo
 * PRIMEIRO carregamento — antes desta escrita. Sem apagar, a PRÓXIMA
 * navegação reidrata esse cache velho (sequência «começa hoje», colegas «sem
 * dados») em vez de reler o Dexie que acabamos de atualizar.
 */
async function escreverExtras(
  page: Page,
  extras: { rings: RingsSnapshot[]; meta: MetaRecord[] },
): Promise<void> {
  await page.evaluate(
    async ([modulo, dados]) => {
      const mod = (await import(/* @vite-ignore */ modulo)) as {
        getDb: () => {
          open: () => Promise<unknown>
          table: (n: string) => {
            bulkPut: (linhas: readonly unknown[]) => Promise<unknown>
            delete: (chave: string) => Promise<unknown>
          }
        }
      }
      const db = mod.getDb()
      await db.open()
      await db.table('rings').bulkPut(dados.rings)
      await db.table('meta').bulkPut(dados.meta)
      await db.table('meta').delete('tanstack:query-cache')
    },
    [MODULO_DB, extras] as const,
  )
}

async function tirar(page: Page, nome: string, opcoes: { fullPage?: boolean } = {}): Promise<void> {
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${DESTINO}/${nome}.png`, fullPage: opcoes.fullPage === true })
}

/**
 * Telas como Hoje e a Golden Hour não rolam a PÁGINA: `PullToRefresh` e afins
 * embrulham o conteúdo num `<div>` com altura fixa (`100svh` menos o chrome) e
 * scroll PRÓPRIO, então `fullPage` não vê nada além do que já está na tela —
 * é o mesmo caso do bottom sheet em `07-escala-editor`. Alargar o viewport só
 * para a captura dá a esse `100svh` mais altura de verdade para trabalhar, e
 * a tela inteira aparece sem precisar rolar nada.
 */
async function tirarAlto(page: Page, nome: string, altura = 1500): Promise<void> {
  const original = page.viewportSize()
  const largura = original?.width ?? 390
  await page.setViewportSize({ width: largura, height: altura })
  await page.waitForTimeout(300)
  await tirar(page, nome)
  if (original) await page.setViewportSize(original)
}

/* ══════════════════════════════════════════════════════════════════════════
   As capturas
   ══════════════════════════════════════════════════════════════════════════ */

test.describe('Capturas do treinamento', () => {
  test.skip(!LIGADO, 'Só com CAPTURAS=1. Ver o encabezado do arquivo.')
  test.describe.configure({ mode: 'serial' })

  test('as 17 telas do treinamento — tema claro', async ({ app, ventus }) => {
    test.setTimeout(240_000)
    mkdirSync(DESTINO, { recursive: true })

    // Tema claro forçado — projeta melhor, e é o padrão do fixture (light).
    await app.evaluate(() => {
      localStorage.setItem('ventus.theme', 'light')
    })
    const { semente, extras } = sementeTreinamento()
    await ventus.semear(semente)
    await escreverExtras(app, extras)
    // `escreverExtras` escreve `rings`/`meta` direto no Dexie, sem passar
    // pelo aviso de sync (ver o comentário de `SementeComExtras`) — o
    // TanStack Query já tinha cacheado a sequência e os anéis do time do
    // primeiro carregamento, ANTES dessa escrita. Uma navegação nova lê tudo
    // de novo, já com rings e meta no lugar.
    await abrir(app, '/')
    await expect(secaoDoDia(app)).toBeVisible()

    /* ── 01 · Hoje: os anéis, a sequência, Iniciar Golden Hour, os 3 cartões */
    // A 664px de altura real (iPhone 14) conta como «tela curta» (≤880px) e a
    // faixa da sequência desce para depois dos 3 cartões, DENTRO do scroll
    // próprio do PullToRefresh — fullPage não vê isso (ver tirarAlto).
    await tirarAlto(app, '01-hoje-geral')

    /* ── 02 · o chip «Por que isto?» aberto ─────────────────────────────── */
    await secaoDoDia(app).getByRole('button', { name: 'Por que isto?' }).first().click()
    await tirar(app, '02-hoje-porque')

    /* ── 03 · o sheet de Adiar, com os 4 botões de data ─────────────────── */
    await secaoDoDia(app).getByRole('button', { name: 'Adiar', exact: true }).first().click()
    const sheetAdiar = app.getByRole('dialog')
    await expect(sheetAdiar.getByText('Adiar para quando?')).toBeVisible()
    await tirar(app, '03-hoje-adiar')
    await app.keyboard.press('Escape')
    await expect(sheetAdiar).toHaveCount(0)

    /* ── 04/05 · Registrar: gravando, e a confirmação com «Ventus sugere» ─ */
    await abrir(app, '/registrar?opportunityId=101')
    const microfone = app.getByRole('button', { name: 'Segure para gravar uma nota de voz' })
    await expect(microfone).toBeVisible()
    // Adianta o mock para que ESTA gravação caia no cenário "feliz".
    await aquecerMockDeIngest(app, 3)

    const caixa = await microfone.boundingBox()
    if (!caixa) throw new Error('O microfone não está visível')
    await app.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await app.mouse.down()
    await app.waitForTimeout(1200)
    await tirar(app, '04-registrar-gravando')
    await app.waitForTimeout(500)
    await app.mouse.up()

    await expect(app.getByRole('button', { name: 'Confirmar' })).toBeVisible({ timeout: 20_000 })
    // Escolhe a data da próxima ação: sem isso o gate fica vermelho e o botão
    // apagado — o mock não sugere data nenhuma para «cobrar o volume mensal».
    await app.getByRole('radio', { name: 'Amanhã', exact: true }).click()
    // O aviso «Modo simulado» é um artefato SÓ deste ambiente de captura
    // (VITE_INGEST_MOCK=on no dev server, ver playwright.config.ts): em
    // produção, com /api/ingest no ar, ele nunca aparece. Esconder aqui é
    // encenação de captura, não um hack no código — nada de produção muda.
    const bannerSimulado = app.locator('p', { hasText: 'Modo simulado.' })
    if ((await bannerSimulado.count()) > 0) {
      await bannerSimulado.first().evaluate((p) => {
        const cartao = p.parentElement
        if (cartao) (cartao as HTMLElement).style.display = 'none'
      })
    }
    // tirarAlto, não fullPage: a captura «beyond viewport» do Chromium desenha
    // o header sticky da tela DUAS vezes (uma flutuando no meio da imagem) —
    // um viewport realmente alto renderiza uma vez só, sem esse artefato.
    await tirarAlto(app, '05-registrar-confirmacao', 1850)

    /* ── 06 · Dossiê: header, Próximo passo, hexágono com evidência ─────── */
    await abrir(app, '/carteira/101')
    await expect(app.getByRole('button', { name: /^8\s*Dor/ })).toBeVisible()
    // O header + Próximo passo + o risco de "pessoa só" empurram o hexágono
    // para baixo da dobra a 664px reais — idem tirarAlto acima.
    await tirarAlto(app, '06-dossie', 2900)

    /* ── 07 · editor de escala: níveis canônicos + evidência preenchida ───
       O sheet é um bottom sheet com snap baixo (72% de 664px de altura real
       do iPhone 14 — não os 844 nominais) e um footer fixo (Stepper + Salvar)
       que sozinho come quase metade disso. Nessa altura não cabem ao mesmo
       tempo a cauda da lista de níveis E os campos de evidência preenchidos.
       Alargar o viewport só para esta captura dá ao sheet a altura que
       precisa — sem tocar nenhuma regra de layout do produto. */
    const viewportMobile = app.viewportSize()
    await app.setViewportSize({ width: 390, height: 1400 })
    await app.getByRole('button', { name: /^3\s*Controle/ }).click()
    const sheetEscala = app.getByRole('dialog')
    await expect(sheetEscala).toBeVisible()
    await sheetEscala.getByRole('button', { name: /^7\D/ }).first().click()
    await sheetEscala
      .getByLabel('A frase do cliente')
      .fill('O Fernando disse que decide sozinho a compra até o fim do trimestre.')
    await sheetEscala.getByLabel('Quem disse').fill('Fernando Costa')
    const campoCargo = sheetEscala.getByLabel('Cargo')
    await campoCargo.fill('Gerente do CD')
    await campoCargo.evaluate((el) => el.blur())
    await campoCargo.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await app.waitForTimeout(300)
    await tirar(app, '07-escala-editor')
    await app.keyboard.press('Escape')
    if (viewportMobile) await app.setViewportSize(viewportMobile)

    /* ── 08 · Cadência: a fila com os 7 pontinhos e o atraso em vermelho ── */
    await abrir(app, '/cadencia')
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Cadência')
    await tirar(app, '08-cadencia-fila')

    /* ── 09/10/11 · Golden Hour: abertura, foco, fechamento ─────────────── */
    await abrir(app, '/golden')
    await expect(app.getByRole('button', { name: 'Começar a hora' })).toBeVisible()
    // O botão «Começar a hora» fica no fim da lista de ajustes, bem abaixo da
    // dobra a 664px de altura real, dentro do scroll próprio da tela — ver
    // tirarAlto().
    await tirarAlto(app, '09-golden-abertura', 1150)

    await app.getByRole('button', { name: 'Começar a hora' }).click()
    await expect(app.getByRole('group', { name: /Contato \d+ de \d+/ })).toBeVisible()
    await tirar(app, '10-golden-foco')

    await app.getByRole('button', { name: /Ligou/ }).click()
    await app.getByRole('button', { name: /Encerrar|Fechar/ }).click()
    await expect(app.getByRole('heading', { name: 'Fechamento' })).toBeVisible()
    // As 3 perguntas do debrief mais o selo de Hora Cheia não cabem juntas a
    // 664px de altura real — mesmo caso de tirarAlto().
    await tirarAlto(app, '11-golden-fechamento', 1550)

    /* ── 12 · Revisão: aceitar/recusar por campo ────────────────────────── */
    const viewportRevisao = app.viewportSize()
    await app.setViewportSize({ width: viewportRevisao?.width ?? 390, height: 1150 })
    await abrir(app, '/revisao')
    const cartaoRevisao = app.getByRole('listitem').filter({ hasText: 'CD Guarulhos' }).first()
    await expect(cartaoRevisao).toBeVisible({ timeout: 15_000 })
    // Com o viewport já alto, o cartão inteiro cabe e o clique não precisa
    // rolar nada — ver o comentário de tirarAlto() sobre a captura fullPage.
    await cartaoRevisao.getByRole('button', { name: 'Recusar Canal' }).click()
    await app.waitForTimeout(200)
    await tirar(app, '12-revisao')
    if (viewportRevisao) await app.setViewportSize(viewportRevisao)

    /* ── 13 · Ventus: pergunta do vendedor + resposta útil ──────────────── */
    await abrir(app, '/ventus')
    const composer = app.getByPlaceholder('Pergunte ou peça algo ao Ventus')
    await expect(composer).toBeVisible()
    await composer.fill('O que fazer com a Rodalog?')
    await composer.press('Enter')
    // Espera o FIM do streaming (a última frase), não só o começo — senão a
    // captura pega a resposta a meio caminho, com o cursor ainda piscando.
    await expect(app.getByText(/próxima conversa/i)).toBeVisible({ timeout: 15_000 })
    await app.waitForTimeout(200)
    // O chip «Modo simulado · exemplo» também é um artefato só deste ambiente
    // (VITE_VENTUS_MOCK=on) — mesma encenação do banner em 05-registrar.
    const chipSimulado = app.getByText('Modo simulado · exemplo', { exact: true })
    if ((await chipSimulado.count()) > 0) {
      await chipSimulado.first().evaluate((el) => {
        const linha = el.closest('div')
        if (linha) (linha as HTMLElement).style.display = 'none'
      })
    }
    await tirar(app, '13-ventus-chat')

    /* ── 14 · Placar: eu vs eu + os carris do time ──────────────────────── */
    await abrir(app, '/placar')
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Placar da Semana')
    await expect(app.getByRole('heading', { name: 'O time' })).toBeVisible({ timeout: 15_000 })
    await tirarAlto(app, '14-placar', 2300)

    /* ── 15 · Mais: perfil com chip de rol e o menu ─────────────────────── */
    await abrir(app, '/mais')
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Mais')
    await tirar(app, '15-mais-perfil')

    /* ── 16/17 · Escritorio, 1920×1080, sem resemear ────────────────────── */
    await app.setViewportSize({ width: 1920, height: 1080 })

    await abrir(app, '/carteira')
    await expect(app.getByRole('button', { name: 'Filtros da carteira' })).toBeVisible()
    await tirar(app, '16-desktop-carteira')

    await abrir(app, '/cadencia')
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Cadência')
    await tirar(app, '17-desktop-cadencia')

    // As capturas não escrevem nada no servidor: nenhum PATCH saiu do aparelho.
    expect(ventus.pedidos.filter((p) => p.metodo === 'PATCH')).toHaveLength(0)
  })
})
