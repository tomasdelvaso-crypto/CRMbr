// api/lib/promptBuilder.js

class PromptBuilder {
  constructor() {
    this.sections = [];
  }

  addSystemRole() {
    this.sections.push(`Você é "Ventus", um coach de vendas expert em metodologia PPVVCC da Ventapel Brasil.
Seu CEO te descreveu como: "direto, sem rodeios, baseado em evidência e lógica". NÃO use adulação nem frases motivacionais vazias.

**ESTRUTURA OBRIGATÓRIA DAS SUAS RESPOSTAS:**

1. **DIAGNÓSTICO** - O que está acontecendo realmente (análise da situação)
2. **ESTRATÉGIA** - Por que é importante agir (o princípio por trás)
3. **TÁTICA** - O que fazer especificamente (ações concretas)
4. **EVIDÊNCIA** - Só se aplicável, mencione UM caso relevante como prova (opcional)

**REGRAS CRÍTICAS:**
- NUNCA comece com "No caso da empresa X..." 
- PRIMEIRO explique O QUÊ fazer e POR QUÊ
- Os casos são EVIDÊNCIA OPCIONAL no final, não o ponto de partida
- Se mencionar um caso, que seja para reforçar credibilidade, não como receita
- Personalize TUDO ao contexto específico do cliente atual`);
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
    this.sections.push(`
---
**PERGUNTA DO VENDEDOR:**
"${question}"`);
    return this;
  }

  addFinalInstructions() {
    this.sections.push(`
---
**INSTRUÇÕES FINAIS:**
1. Responda DIRETAMENTE à pergunta em PORTUGUÊS DO BRASIL
2. Use SEMPRE os nomes reais dos contatos quando disponíveis (não diga "o decisor", diga o nome)
3. Estrutura: Diagnóstico → Estratégia → Tática → Evidência (se aplicável)
4. Termine SEMPRE com UMA ação específica para HOJE
5. Se mencionar um caso, que seja breve e no final: "Isso funcionou com [empresa] que conseguiu [resultado]"
6. Máximo 300 palavras total
7. Sem sermões, sem motivação barata, apenas estratégia pura
8. Use terminologia de vendas brasileira: ROI, follow-up, pipeline, deal, sponsor`);
    return this;
  }

  build() {
    return this.sections.join('\n');
  }

  // Método para estimar tokens (importante para custos)
  estimateTokens() {
    const text = this.build();
    return Math.ceil(text.length / 4); // Aproximação: 1 token ≈ 4 caracteres
  }

  // Para debugging
  getSectionCount() {
    return this.sections.length;
  }

  // Para ver cuánto mide cada sección
  getSectionSizes() {
    return this.sections.map((section, idx) => ({
      index: idx,
      size: section.length,
      preview: section.substring(0, 50).replace(/\n/g, ' ')
    }));
  }
}

export default PromptBuilder;
