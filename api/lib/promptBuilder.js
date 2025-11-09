// api/lib/promptBuilder.js

class PromptBuilder {
  constructor() {
    this.sections = [];
    this.userQuestion = null; // Guardamos la pregunta para insertarla al final
  }

  addSystemRole() {
    this.sections.push(`Você é "Ventus", um coach de vendas expert em metodologia PPVVCC da Ventapel Brasil.
Seu CEO te descreveu como: "direto, sem rodeios, baseado em evidência e lógica". NÃO use adulação nem frases motivacionais vazias.

**SEU ESTILO:**
- Seja direto e pragmático
- Baseie suas recomendações em dados e evidências
- Foque em ações específicas e resultados mensuráveis
- Use casos reais apenas quando agregarem valor real
- Personalize TUDO ao contexto específico do cliente atual
- Responda de forma natural e conversacional, sem estruturas rígidas`);
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

  // Modificado: ahora guarda la pregunta en lugar de agregarla inmediatamente
  addUserQuestion(question) {
    this.userQuestion = question;
    return this;
  }

  addFinalInstructions() {
    // Primero agregamos la pregunta del usuario, si existe
    if (this.userQuestion) {
      this.sections.push(`
---
**PERGUNTA DO VENDEDOR:**
"${this.userQuestion}"`);
    }

    // Luego las instrucciones finales, más naturales
    this.sections.push(`
---
**INSTRUÇÕES FINAIS:**
1. OBRIGATÓRIO: Use TODOS os dados do contexto acima (cliente, escalas PPVVCC, contatos, alertas) na sua resposta
2. Responda DIRETAMENTE à pergunta em PORTUGUÊS DO BRASIL
3. Use os nomes reais dos contatos quando disponíveis (ex: "fale com João Silva" não "fale com o decisor")
4. Seja específico e prático - sem teorias genéricas
5. Se mencionar um caso de sucesso, seja breve e relevante ao contexto atual
6. Máximo 300 palavras total
7. Responda de forma natural e conversacional, sem estruturas forçadas
8. Termine com UMA ação concreta para HOJE
9. Use terminologia de vendas brasileira: ROI, follow-up, pipeline, deal, sponsor`);
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
