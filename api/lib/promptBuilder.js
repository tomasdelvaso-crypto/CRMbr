// api/lib/promptBuilder.js

class PromptBuilder {
  constructor() {
    this.sections = [];
    this.userQuestion = null;
  }

  addSystemRole() {
    this.sections.push(`Você é "Ventus", um coach de vendas da Ventapel Brasil, expert em metodologia PPVVCC.

COMO FALAR: Converse como um colega experiente falaria num café. Direto, prático, sem enrolação. NUNCA use headers com ** **, NUNCA use listas numeradas, NUNCA formate como relatório. Fale em parágrafos curtos, como num WhatsApp profissional.

Exemplo do que NÃO fazer:
"**Análise de CLIENTE**
**Estado:** Saúde 5/10
**Próxima ação:** ..."

Exemplo do que SIM fazer:
"ANDREANI tá com saúde 2.8 e 156 dias sem contato. Basicamente morto. Mas tem o BID 2026 que abre uma janela. Liga pro Paulo Cunha hoje — pergunta se o BID ainda tá de pé e propõe uma reunião rápida pra revisar os números."

Seja específico, use nomes reais, dê ações concretas. Sem motivacional, sem teoria genérica.`);
    return this;
  }

  addOpportunityContext(opp) {
    if (!opp) return this;
    
    this.sections.push(`
---
**CONTEXTO ATUAL:**

Cliente: ${opp.client || 'Não selecionado'}
Indústria: ${opp.industry || 'Não especificada'}
Valor negócio: R$ ${opp.value?.toLocaleString('pt-BR') || '0'}
Etapa: ${opp.stage || 0}/6
Produto/Solução: ${opp.product || 'Não especificado'}`);
    return this;
  }

  addScalesAnalysis(analysis) {
    if (!analysis?.opportunity) return this;
    
    const { opportunity } = analysis;
    this.sections.push(`
**ANÁLISE PPVVCC:**
- Score de Saúde: ${opportunity.healthScore}/10
- Probabilidade: ${opportunity.probability}%
- Dias sem contato: ${opportunity.daysSince}
- Escalas:
  • DOR: ${opportunity.scaleBreakdown.dor}/10
  • PODER: ${opportunity.scaleBreakdown.poder}/10
  • VISÃO: ${opportunity.scaleBreakdown.visao}/10
  • VALOR: ${opportunity.scaleBreakdown.valor}/10
  • CONTROLE: ${opportunity.scaleBreakdown.controle}/10
  • COMPRAS: ${opportunity.scaleBreakdown.compras}/10`);
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
    const descriptions = [];
    
    if (desc.dor) descriptions.push(`  • DOR: "${desc.dor}"`);
    if (desc.poder) descriptions.push(`  • PODER: "${desc.poder}"`);
    if (desc.visao) descriptions.push(`  • VISÃO: "${desc.visao}"`);
    if (desc.valor) descriptions.push(`  • VALOR: "${desc.valor}"`);
    if (desc.controle) descriptions.push(`  • CONTROLE: "${desc.controle}"`);
    if (desc.compras) descriptions.push(`  • COMPRAS: "${desc.compras}"`);
    
    if (descriptions.length > 0) {
      this.sections.push(`
**DESCRIÇÕES DETALHADAS DAS ESCALAS:**
${descriptions.join('\n')}`);
    }
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
      roi_meses: c.resultados.roi_meses,
      metrica: c.resultados.perdas || c.resultados.roubos || c.resultados.eficiencia
    }));
    
    this.sections.push(`
**CASOS DISPONÍVEIS COMO REFERÊNCIA (usar apenas se agregar valor):**
${JSON.stringify(casesInfo, null, 2)}`);
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

  // ============= NUEVO: ACTIVITY HISTORY =============
  addActivityHistory(activities) {
    if (!activities || activities.length === 0) return this;
    
    const historyLines = activities.slice(0, 10).map(a => {
      const date = new Date(a.activity_date || a.created_at).toLocaleDateString('pt-BR');
      const result = a.result ? ` → Resultado: ${a.result}` : ' (pendente)';
      const source = a.source === 'ai_generated' ? '[IA]' : '[Manual]';
      const desc = a.description ? a.description.substring(0, 100) : '';
      return `- ${date} ${source} ${a.activity_type}: ${desc}${result}`;
    }).join('\n');
    
    this.sections.push(`
**HISTÓRICO DE ATIVIDADES RECENTES (últimas ${activities.length}):**
${historyLines}

IMPORTANTE: Baseie suas novas sugestões no que JÁ foi tentado. NÃO repita ações que foram descartadas ou que tiveram resultado negativo. Se uma ação teve resultado positivo, sugira o próximo passo lógico.`);
    return this;
  }

  // ============= NUEVO: ACTION PLAN REQUEST =============
  addActionPlanRequest(numActions) {
    this.sections.push(`
---
**TAREFA ESPECIAL: GERAR PLANO DE AÇÕES**

Analise o contexto acima e gere exatamente ${numActions} ação(ões) concretas e personalizadas para avançar esta oportunidade.

Responda SOMENTE com JSON válido, sem markdown, sem backticks, sem texto antes ou depois. Formato exato:

{
  "actions": [
    {
      "title": "Título curto da ação (max 60 chars)",
      "description": "O que fazer especificamente, com nomes reais dos contatos e dados concretos",
      "target_scale": "dor|poder|visao|valor|controle|compras",
      "current_score": 0,
      "target_score": 0,
      "action_type": "call|email|meeting|demo|proposal|whatsapp|linkedin",
      "priority": "critica|alta|media",
      "draft_content": "Rascunho completo: se for email, escrever o email inteiro. Se for ligação, roteiro completo com perguntas SPIN. Se for meeting, pauta. PERSONALIZADO para este cliente.",
      "tool_reference": "Nome do caso de êxito ou ferramenta a usar, ou null",
      "expected_outcome": "Resultado esperado em 1 frase"
    }
  ],
  "diagnosis": "1 frase com o diagnóstico principal desta oportunidade"
}

REGRAS:
1. Cada ação DEVE mover uma escala específica
2. Priorize escalas com score mais baixo vs o que a etapa exige
3. Use NOMES REAIS dos contatos quando disponíveis
4. O draft_content deve ser COMPLETO e USÁVEL — não genérico
5. Se há caso de referência da mesma indústria, incorpore-o no draft
6. Ordene por impacto: a ação 1 é a mais urgente
7. NÃO repita a mesma escala em duas ações diferentes`);
    return this;
  }

  addFinalInstructions() {
    if (this.userQuestion) {
      this.sections.push(`
---
**PERGUNTA DO VENDEDOR:**
"${this.userQuestion}"`);
    }

    this.sections.push(`
---
Responda em português do Brasil, conversacional, sem formatação de relatório. Use os dados acima mas NÃO repita eles em formato de lista — integre naturalmente na conversa. Máximo 200 palavras. Termine com o que o vendedor tem que fazer HOJE, com nome e canal de contato.`);
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

  getSectionSizes() {
    return this.sections.map((section, idx) => ({
      index: idx,
      size: section.length,
      preview: section.substring(0, 50).replace(/\n/g, ' ')
    }));
  }
}

export default PromptBuilder;
