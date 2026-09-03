// api/_lib/promptBuilder.js
import {
  SCALE_KEYS,
  SCALE_DEFINITIONS,
  STAGES,
  STAGE_GATES,
  getScale,
  getScaleValue,
  getScaleDescription,
} from './ppvvcc.js';

// ============= PREPARAÇÃO DE DEMO / TESTE =============
// Detecta se há demo, teste ou POC no horizonte da oportunidade. Determinístico:
// atividade planejada do tipo demo/test, texto de próxima ação que fala em demo/teste,
// ou etapa 3-4 (Apresentação / Validação-Teste).
const DEMO_REGEX = /\b(demo|demonstra|teste|test|poc|piloto|prova|avalia|trial)/i;

export function detectPlannedDemo(opp, activities) {
  if (!opp) return null;
  const list = Array.isArray(activities) ? activities : [];

  const pendingDemo = list.find(a =>
    a && !a.next_action_done && a.result !== 'expirado' &&
    (['demo', 'test'].includes(a.activity_type) || DEMO_REGEX.test(a.next_action || '') || DEMO_REGEX.test(a.description || ''))
  );
  if (pendingDemo) {
    return { reason: 'atividade planejada', text: pendingDemo.next_action || pendingDemo.description || '' };
  }
  if (DEMO_REGEX.test(opp.next_action || '')) {
    return { reason: 'próxima ação registrada', text: opp.next_action };
  }
  if (opp.stage === 3 || opp.stage === 4) {
    const stage = STAGES.find(s => s.id === opp.stage);
    return { reason: `etapa ${opp.stage} (${stage ? stage.name : ''})`, text: '' };
  }
  return null;
}

// Mapa dor → o que medir. Guia para o coach, não gate. KPIs sempre nos números do cliente.
const DOR_KPI_MAP = `MAPA DOR → O QUE MEDIR (baseline ANTES da demo, medido DURANTE/DEPOIS):
- Caixas abrem no transporte / violação / roubo / avaria → % de caixas abertas ou violadas por período; reclamações e devoluções por mês; custo por ocorrência.
- Retrabalho / caixas refeitas / reforço com fita extra → caixas refeitas por dia; tempo por retrabalho; voltas de fita por caixa hoje.
- Lentidão / gargalo na expedição / hora extra → tempo de fechamento por caixa; caixas por operador por hora; horas extras no pico.
- Custo de fita / consumo alto → metros de fita por caixa; rolos por mês; preço por rolo e por caixa fechada.
- Ergonomia / rotatividade / afastamento → operadores por turno; rodízio; queixas registradas.
- Void fill / relleno / plástico (E-comfill, E-combag) → espaço de armazém ocupado por air pillows/bolha; metros lineares por caixa; tempo de preenchimento; custo de frete por volume; devoluções por dano interno.
BASELINE SEMPRE (qualquer dor): caixa mais usada (modelo e medidas), caixas por dia na caixa mais usada, tempo de fechamento por caixa, metros de fita por caixa, operadores por turno, sazonalidade (meses de pico).`;

// ============= SYSTEM ESTÁTICO (cacheável — não interpolar nada dinâmico aqui) =============
export function buildStaticSystem() {
  const scaleDefs = SCALE_KEYS.map(key => {
    const levels = SCALE_DEFINITIONS[key]
      .map(d => `  ${d.level} = ${d.text}`)
      .join('\n');
    return `${key.toUpperCase()}:\n${levels}`;
  }).join('\n\n');

  const stageDefs = STAGES.map(s => {
    const gates = STAGE_GATES[s.id]
      ? ' | Para avançar: ' + STAGE_GATES[s.id].map(g => `${g.scale.toUpperCase()} ≥ ${g.min}`).join(', ')
      : '';
    return `Etapa ${s.id} — ${s.name} (${s.probability}%): ${s.requirements.join('; ')}${gates}`;
  }).join('\n');

  return `Você é "Ventus", um coach de vendas da Ventapel Brasil, expert em metodologia PPVVCC (venda consultiva).

LINHAS DE PRODUTO VENTAPEL:
- Máquinas Better Pack: Seladoras automáticas/semi de caixas com fita gomada (WAT). Foco em velocidade, ergonomia e segurança do fechamento.
- Better Pack + Venom: Seladoras BP + Fita VENOM anti-violação. Foco em anti-roubo, tamper-evident, rastreabilidade. Para carga de alto valor.
- E-comfill + Resmas/Sobres: Máquinas de preenchimento de papel (void-fill, honeycomb wrap), E-combags Paper/Pro (sobres de papel que substituem caixas). Foco em sustentabilidade, eliminação de plástico, unboxing premium, logística inversa (Vai e Vem). Fabricados em Camboriú.
- Serviço de Manutenção: Manutenção preventiva e corretiva de máquinas Better Pack.

ADAPTE suas sugestões à linha de produto da oportunidade. Não sugira argumentos de anti-roubo para uma venda de E-comfill, nem argumentos de sustentabilidade/sobres para uma venda de máquinas BP puras.

METODOLOGIA PPVVCC — DEFINIÇÃO EXATA DE CADA NÍVEL (0-10):

${scaleDefs}

COMO USAR AS DEFINIÇÕES: quando analisar uma escala, olhe o nível ATUAL e o PRÓXIMO nível da definição acima. A ação recomendada deve ser o passo concreto que move a escala do nível atual para o próximo — não um conselho genérico de "trabalhar a escala".

ETAPAS DO FUNIL E O QUE CADA UMA EXIGE:
${stageDefs}

Diagnóstico de gap: compare as escalas atuais com o que a etapa atual exige para avançar. Se o vendedor está numa etapa avançada com escalas abaixo do gate, isso é um FREIO — aponte antes de qualquer outra coisa.

COMO FALAR: Converse como um colega experiente falaria num café. Direto, prático, sem enrolação. NUNCA use headers com ** **, NUNCA use listas numeradas, NUNCA formate como relatório. Fale em parágrafos curtos, como num WhatsApp profissional.

Exemplo do que NÃO fazer:
"**Análise de CLIENTE**
**Estado:** Saúde 5/10
**Próxima ação:** ..."

Exemplo do que SIM fazer:
"ANDREANI tá com saúde 2.8 e 156 dias sem contato. Basicamente morto. Mas tem o BID 2026 que abre uma janela. Liga pro Paulo Cunha hoje — pergunta se o BID ainda tá de pé e propõe uma reunião rápida pra revisar os números."

Seja específico, use nomes reais, dê ações concretas. Sem motivacional, sem teoria genérica.

REGRAS ABSOLUTAS:
1. NUNCA invente nomes de clientes, contatos, valores, volumes, percentuais de perda ou cifras de ROI. Se você não tem o dado, não o afirme.
2. Números só podem vir dos dados fornecidos no contexto ou de casos de referência explicitamente citados. Se precisar estimar, diga que é uma hipótese e que o vendedor deve validar com o cliente ("assumindo X, seria Y — confirma o volume real").
3. Se não há oportunidade selecionada (sem bloco CONTEXTO ATUAL), NÃO gere planos de ação nem próximos passos para nenhum cliente — mesmo que ele apareça no resumo do pipeline. Sem o histórico de atividades da oportunidade, qualquer sugestão sai genérica ou repete o que já foi feito. Perguntas de visão geral do pipeline pode responder normalmente; para ações, oriente: "abre a oportunidade no CRM e usa o Gerar ações IA no painel de atividades — aí eu tenho o histórico completo".
4. Respeite o histórico de atividades: nunca sugira algo já feito, descartado ou que falhou.`;
}

// ============= CONTEXTO DINÂMICO POR REQUEST =============
class PromptBuilder {
  constructor() {
    this.sections = [];
    this.userQuestion = null;
  }

  addOpportunityContext(opp) {
    if (!opp) return this;

    const stage = STAGES.find(s => s.id === opp.stage);
    this.sections.push(`
---
**CONTEXTO ATUAL:**

Cliente: ${opp.client || 'Não selecionado'}
Indústria: ${opp.industry || 'Não especificada'}
Valor negócio: R$ ${opp.value?.toLocaleString('pt-BR') || '0'}
Etapa: ${opp.stage || 0}/6${stage ? ` (${stage.name})` : ''}
Produto/Solução: ${opp.product || 'Não especificado'}
Linhas de Produto: ${opp.product_lines && opp.product_lines.length > 0 ? opp.product_lines.join(', ') : 'Não definida'}`);
    return this;
  }

  addScalesAnalysis(analysis) {
    if (!analysis?.opportunity) return this;

    const { opportunity } = analysis;
    const lines = SCALE_KEYS.map(key => {
      const score = opportunity.scaleBreakdown[key] ?? 0;
      const defs = SCALE_DEFINITIONS[key];
      const current = defs.find(d => d.level === Math.round(score));
      const next = defs.find(d => d.level === Math.round(score) + 1);
      let line = `  • ${key.toUpperCase()}: ${score}/10 — "${current ? current.text : ''}"`;
      if (next) line += ` → próximo nível: "${next.text}"`;
      return line;
    }).join('\n');

    this.sections.push(`
**ANÁLISE PPVVCC (nível atual → o que falta para o próximo):**
- Score de Saúde: ${opportunity.healthScore}/10
- Probabilidade estimada pelo motor (baseada nas escalas): ${opportunity.probability}%
- Dias sem contato real: ${opportunity.daysSince}
- Escalas:
${lines}`);
    return this;
  }

  addContacts(opp) {
    if (!opp) return this;

    const contacts = [];
    if (opp.power_sponsor) contacts.push(`  • Power Sponsor (Decisor): ${opp.power_sponsor}`);
    if (opp.sponsor) contacts.push(`  • Sponsor (Patrocinador): ${opp.sponsor}`);
    if (opp.influencer) contacts.push(`  • Influenciador: ${opp.influencer}`);
    if (opp.support_contact) contacts.push(`  • Contato de Suporte: ${opp.support_contact}`);

    if (contacts.length > 0) {
      this.sections.push(`
**CONTATOS MAPEADOS:**
${contacts.join('\n')}`);
    }
    return this;
  }

  addOperationalInfo(opp) {
    if (!opp) return this;

    const info = [];
    if (opp.next_action) info.push(`  • Próxima Ação Registrada: ${opp.next_action}`);
    if (opp.expected_close) {
      const closeDate = new Date(opp.expected_close).toLocaleDateString('pt-BR');
      info.push(`  • Data de Fechamento Esperada: ${closeDate}`);
    }

    if (info.length > 0) {
      this.sections.push(`
**INFORMAÇÕES OPERACIONAIS:**
${info.join('\n')}`);
    }
    return this;
  }

  addScaleDescriptions(analysis) {
    if (!analysis?.opportunity?.scaleDescriptions) return this;

    const desc = analysis.opportunity.scaleDescriptions;
    const descriptions = SCALE_KEYS
      .filter(key => desc[key])
      .map(key => `  • ${key.toUpperCase()}: "${desc[key]}"`);

    if (descriptions.length > 0) {
      this.sections.push(`
**OBSERVAÇÕES DO VENDEDOR SOBRE CADA ESCALA:**
${descriptions.join('\n')}`);
    }
    return this;
  }

  // Demo/teste no horizonte: orienta o que medir a partir da DOR registrada.
  // Se a DOR não está documentada, a instrução é pedir as dores antes de qualquer KPI.
  addDemoPrep(opp, activities) {
    const planned = detectPlannedDemo(opp, activities);
    if (!planned) return this;

    const dorScale = getScale(opp.scales, 'dor');
    const dorScore = getScaleValue(dorScale);
    const dorDesc = (getScaleDescription(dorScale) || '').trim();
    const hasDor = dorDesc.length >= 15 && !/^(gostaram|gostou|interessad|ok|bom|boa)\b/i.test(dorDesc);
    const ref = planned.text ? ` ("${planned.text.slice(0, 160)}")` : '';

    if (!hasDor) {
      this.sections.push(`
━━━ DEMO / TESTE NO HORIZONTE — DOR NÃO DOCUMENTADA ━━━
Detectado: ${planned.reason}${ref}. A escala DOR está em ${dorScore}/10 e ${dorDesc ? `a descrição é insuficiente ("${dorDesc.slice(0, 120)}")` : 'sem descrição'}.
PRIORIDADE ABSOLUTA nesta resposta: antes de qualquer sugestão de KPI ou roteiro de demo, peça ao vendedor que registre no CRM, na escala DOR, as dores NAS PALAVRAS DO CLIENTE: o que acontece (caixas abrem, retrabalho, lentidão, custo de fita, ergonomia...), com que frequência, e quanto custa ou quem sofre. Diga com todas as letras que sem a dor registrada você não consegue orientar o que medir na demo — uma demo sem dor documentada só serve para ver se o operador gosta da máquina, e ele sempre gosta. Não sugira KPIs genéricos; peça a dor primeiro. Pode dar 2-3 perguntas SPIN de situação/problema para ele fazer ao cliente e voltar com a resposta.`);
      return this;
    }

    this.sections.push(`
━━━ DEMO / TESTE NO HORIZONTE — PREPARAÇÃO OBRIGATÓRIA ━━━
Detectado: ${planned.reason}${ref}.
DOR registrada pelo vendedor (${dorScore}/10): "${dorDesc.slice(0, 400)}"
Sua orientação DEVE incluir, em linguagem de café, o que o vendedor tem que MEDIR para provar que a demo resolve ESSA dor específica — não uma lista genérica. Cruze a dor com o mapa abaixo, escolha só os KPIs que respondem à dor registrada e diga: (1) que baseline ele precisa levantar com o cliente ANTES de ir, (2) o que anotar DURANTE a demo/teste, (3) que resposta o cliente vai ter que dar no fim (ex.: "caixas fechadas vs. rolos consumidos"). Números do cliente, nunca os nossos. Se a demo já aconteceu e não há números registrados no histórico, diga que o próximo passo é voltar ao cliente para buscar exatamente esses números — sem eles não se apresenta proposta nem se escala ao decisor.
${DOR_KPI_MAP}`);
    return this;
  }

  addAlerts(analysis) {
    if (!analysis?.alerts?.length) return this;

    const topAlerts = analysis.alerts.slice(0, 3).map(a => `- ${a.message}`).join('\n');
    this.sections.push(`
**ALERTAS ATIVOS:**
${topAlerts}`);
    return this;
  }

  addRelevantCases(cases) {
    if (!cases || cases.length === 0) return this;

    const casesInfo = cases.slice(0, 2).map(c => ({
      empresa: c.empresa,
      problema: c.problema,
      solucao: c.solucao,
      roi_meses: c.resultados.roi_meses,
      metrica: c.resultados.perdas || c.resultados.roubos || c.resultados.eficiencia,
      aprendizado: c.aprendizado_chave || undefined,
    }));

    this.sections.push(`
**CASOS DE ÊXITO DISPONÍVEIS COMO REFERÊNCIA (usar apenas se agregar valor):**
${JSON.stringify(casesInfo, null, 2)}`);
    return this;
  }

  // Deals fechados (ganhos/perdidos) do mesmo cliente ou indústria — lições reais do CRM
  addClosedDealsContext(closedDeals) {
    if (!closedDeals || closedDeals.length === 0) return this;

    const lines = closedDeals.slice(0, 5).map(d => {
      const outcome = d.outcome === 'won' ? '✅ GANHO' : d.outcome === 'lost' ? '❌ PERDIDO' : '⏸️ ABANDONADO';
      let line = `- ${outcome} | ${d.client}${d.industry ? ` (${d.industry})` : ''} | R$ ${(d.value || 0).toLocaleString('pt-BR')}${d.product ? ` | ${d.product}` : ''}`;
      if (d.outcome_notes) line += `\n  Lições registradas: "${d.outcome_notes}"`;
      return line;
    }).join('\n');

    this.sections.push(`
**HISTÓRICO REAL DE DEALS FECHADOS (mesmo cliente ou indústria — use as lições):**
${lines}`);
    return this;
  }

  addWebSearchResults(webResults) {
    if (!webResults) return this;

    this.sections.push(`
**INFORMAÇÕES ATUALIZADAS DA INTERNET:**
${webResults}`);
    return this;
  }

  addUserQuestion(question) {
    this.userQuestion = question;
    return this;
  }

  addActivityHistory(activities) {
    if (!activities || activities.length === 0) return this;

    // Filter out "expirado" noise — they carry no useful info
    const meaningful = activities.filter(a => a.result !== 'expirado');
    if (meaningful.length === 0) return this;

    // Separate by outcome for clarity
    const done = meaningful.filter(a => a.next_action_done && a.result);
    const pending = meaningful.filter(a => !a.next_action_done);

    let block = '\n━━━ HISTÓRICO DE ATIVIDADES (LEIA COM ATENÇÃO) ━━━\n';

    if (done.length > 0) {
      block += '\n🔴 AÇÕES JÁ REALIZADAS OU DESCARTADAS (NÃO REPETIR):\n';
      done.slice(0, 15).forEach(a => {
        const date = new Date(a.activity_date || a.created_at).toLocaleDateString('pt-BR');
        const icon = a.result === 'positivo' ? '✅' : a.result === 'negativo' ? '❌' : a.result === 'descartado' ? '🚫' : '➖';
        block += `${icon} [${date}] ${a.description || ''}\n   → Resultado: ${a.result}\n\n`;
      });
    }

    if (pending.length > 0) {
      block += '\n⏳ AÇÕES PENDENTES (NÃO DUPLICAR):\n';
      pending.slice(0, 5).forEach(a => {
        block += `- ${a.description || ''}\n`;
      });
    }

    block += `
━━━ REGRAS ABSOLUTAS SOBRE O HISTÓRICO ━━━
1. NUNCA sugira uma ação que já aparece acima, mesmo com palavras diferentes. Se "ligar para X" foi feito, NÃO sugira "contatar X" ou "falar com X".
2. Se uma ação foi DESCARTADA (🚫) com motivo, NUNCA a repita — o vendedor já explicou por que não funciona.
3. Se uma ação teve resultado NEGATIVO (❌), NÃO insista na mesma abordagem.
4. Se uma ação teve resultado POSITIVO (✅), sugira o PRÓXIMO passo lógico a partir do que foi conquistado.
5. Leia os comentários do vendedor — eles contêm informação crucial sobre o que funciona e o que não funciona neste cliente.`;

    this.sections.push(block);
    return this;
  }

  // Instruções da tarefa Action Plan. O formato de saída é garantido por tool use
  // (submit_action_plan) — aqui só vão as regras de conteúdo.
  addActionPlanRequest(numActions) {
    this.sections.push(`
---
**TAREFA: GERAR PLANO DE AÇÕES**

Analise o contexto acima e gere ${numActions === 1 ? '1 ação concreta' : 'até 2 ações concretas'} para avançar esta oportunidade, usando a ferramenta submit_action_plan.

ATENÇÃO: Revise o HISTÓRICO DE ATIVIDADES acima ANTES de sugerir qualquer coisa. Suas ações devem ser DIFERENTES de tudo que já foi feito ou descartado.

${numActions === 2 ? 'Só gere 2 ações se forem realmente complementares (movem escalas diferentes) ou representam dois caminhos alternativos. Se uma única ação bem feita resolve, gere apenas 1. Qualidade > quantidade.' : 'Gere UMA ação focada e de alto impacto. A melhor coisa que o vendedor pode fazer AGORA.'}

REGRAS:
1. Cada ação DEVE mover uma escala específica do nível atual para o próximo nível da definição PPVVCC
2. Priorize a escala com score mais baixo vs o que a etapa exige
3. Use NOMES REAIS dos contatos quando disponíveis
4. O draft_content deve ser COMPLETO e USÁVEL — se for email, o email inteiro; se for ligação, o roteiro com perguntas SPIN; se for meeting, a pauta. Personalizado para este cliente.
5. NUNCA invente números (volumes, perdas, ROI) — se precisar de um número no draft, deixe claro que é hipótese a validar
6. Se há caso de referência da mesma indústria ou deal fechado com lições, incorpore no draft
7. NÃO repita a mesma escala em duas ações diferentes`);
    return this;
  }

  // depth: 'quick' = resposta curta estilo WhatsApp | 'deep' = análise completa
  addFinalInstructions(depth = 'quick') {
    if (this.userQuestion) {
      this.sections.push(`
---
**PERGUNTA DO VENDEDOR:**
"${this.userQuestion}"`);
    }

    if (depth === 'deep') {
      this.sections.push(`
---
Responda em português do Brasil, conversacional, sem headers markdown nem listas numeradas. Este é um pedido de ANÁLISE PROFUNDA: pode usar até 500 palavras, em parágrafos temáticos curtos. Cubra: onde o negócio realmente está (gap etapa vs escalas), qual é o freio principal, e o plano concreto. Integre os dados naturalmente — não os repita em formato de lista. Termine com o que o vendedor tem que fazer HOJE, com nome e canal de contato.`);
    } else {
      this.sections.push(`
---
Responda em português do Brasil, conversacional, sem formatação de relatório. Use os dados acima mas NÃO repita eles em formato de lista — integre naturalmente na conversa. Máximo 200 palavras. Termine com o que o vendedor tem que fazer HOJE, com nome e canal de contato.`);
    }
    return this;
  }

  build() {
    return this.sections.join('\n');
  }

  estimateTokens() {
    const text = this.build();
    return Math.ceil(text.length / 4);
  }

  getSectionCount() {
    return this.sections.length;
  }
}

export default PromptBuilder;
