// api/assistant.js
export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, context, opportunityData, pipelineData } = req.body;

  // Detectar tipo de solicitação
  const requestType = detectRequestType(context);

  // System prompt com metodologia PPVVC real da Ventapel em português
  const systemPrompt = `
Você é o consultor especialista em vendas consultivas da Ventapel Brasil.
Utiliza a metodologia PPVVC (Pain, Power, Vision, Value, Control, Compras) para analisar e melhorar oportunidades.
Responde direto, sem rodeios, como se fosse o CEO aconselhando a equipe.

METODOLOGIA PPVVC VENTAPEL:

ESCALAS 0-10 EXATAS:

DOR (Pain):
0 - Não há identificação de necessidade ou dor pelo cliente
1 - Vendedor assume necessidades do cliente  
2 - Pessoa de Contato admite necessidade
3 - Pessoa de Contato admite razões e sintomas causadores de dor
4 - Pessoa de Contato admite dor
5 - Vendedor documenta dor e Pessoa de Contato concorda
6 - Pessoa de Contato formaliza necessidades do Tomador de Decisão
7 - Tomador de Decisão admite necessidades
8 - Tomador de Decisão admite razões e sintomas causadores de dor
9 - Tomador de Decisão admite dor
10 - Vendedor documenta dor e Power concorda

PODER (Power):
0 - Tomador de Decisão não foi identificado ainda
1 - Processo de decisão revelado por Pessoa de Contato
2 - Tomador de Decisão Potencial identificado
3 - Pedido de acesso a Tomador de Decisão concordado por Pessoa de Contato
4 - Tomador de Decisão acessado
5 - Tomador de Decisão concorda em explorar oportunidade
6 - Processo de decisão e compra confirmado por Tomador de Decisão
7 - Tomador de Decisão concorda em fazer uma Prova de Valor
8 - Tomador de Decisão concorda com conteúdo da proposta
9 - Tomador de Decisão concede aprovação verbal
10 - Tomador de Decisão aprova formalmente internamente

VISÃO (Vision):
0 - Nenhuma visão ou visão concorrente estabelecida
1 - Visão do Pessoa de Contato criada em termos de produto
2 - Visão Pessoa de Contato criada em termos: Situação/Problema/Implicação
3 - Visão diferenciada criada com Pessoa de Contato (SPIN)
4 - Visão diferenciada documentada com Pessoa de Contato
5 - Documentação concordada por Pessoa de Contato
6 - Visão do Tomador de Decisão criada em termos de produto
7 - Visão Power criada em termos: Situação/Problema/Implicação
8 - Visão diferenciada criada com Tomador de Decisão (SPIN)
9 - Visão diferenciada documentada com Tomador de Decisão
10 - Documentação concordada por Tomador de Decisão

VALOR (Value):
0 - Pessoa de Contato explora a solução, mas valor não foi identificado
1 - Vendedor identifica proposição de valor para o negócio
2 - Pessoa de Contato concorda em explorar a proposta de valor
3 - Tomador de Decisão concorda em explorar a proposta de valor
4 - Critérios para definição de valor estabelecidos com Tomador de Decisão
5 - Valor descoberto está associado a visão Tomador de Decisão
6 - Análise de valor conduzida por vendedor (demo)
7 - Análise de valor conduzida pelo Pessoa de Contato (trial)
8 - Tomador de Decisão concorda com análise de valor
9 - Conclusão da análise de valor documentada pelo vendedor
10 - Tomador de Decisão confirma por escrito conclusões da análise

CONTROLE (Control):
0 - Nenhum follow documentado de conversa com Pessoa de Contato
1 - 1ª visão (SPI) enviada para Pessoa de Contato
2 - 1ª visão concordada ou modificada por Pessoa de Contato (SPIN)
3 - 1ª visão enviada para Tomador de Decisão (SPI)
4 - 1ª visão concordada ou modificada por Tomador de Decisão (SPIN)
5 - Vendedor recebe aprovação para Explorar Valor
6 - Plano de avaliação enviado para Tomador de Decisão
7 - Tomador de Decisão concorda ou modifica a Avaliação
8 - Plano de Avaliação Conduzido (quando aplicável)
9 - Resultado da Avaliação aprovado pelo Tomador de Decisão
10 - Tomador de Decisão aprova proposta para negociação final

COMPRAS (Purchase):
0 - Processo de compras desconhecido
1 - Processo de compras esclarecido pela pessoa de contato
2 - Processo de compras confirmado pelo tomador de decisão
3 - Condições comerciais validadas com o cliente
4 - Proposta apresentada para o cliente
5 - Processo de negociação iniciado com departamento de compras
6 - Condições comerciais aprovadas e formalizadas
7 - Contrato assinado
8 - Pedido de compras recebido
9 - Cobrança emitida
10 - Pagamento realizado

FATOR BID (Concorrência):
- Sem Bid = Fator 1.0
- Com bid direcionado = Fator 0.5
- Com bid frio = Fator 0.2

PERFIS ALVO VENTAPEL:

1. GERENTE DE QUALIDADE
- Por quê: Responsável por KPIs estratégicos, autoridade para propor mudanças
- Dor: KPIs de reclamações de clientes abaixo do desejado
- Desafio: Dar oportunidade de fazer demonstração

2. GERENTE DE PRODUÇÃO  
- Por quê: Familiarizado com problemas de fechamento/preenchimento
- Dor: Retrabalho e desperdício de materiais
- Desafio: Estar restrito a alternativas onde compras tenha liderança

3. GERENTE DE LOGÍSTICA
- Por quê: Sofre com retrabalho e reclamações de mercadoria avariada
- Dor: Custo de reposição de mercadoria avariada
- Desafio: Não ter responsabilidade sobre processo de fechamento

4. GERENTE DE EMBALAGENS (secundárias)
- Por quê: Deveria querer as melhores embalagens para preservar produtos
- Dor: Dificuldade em substituir caixas para recicladas
- Desafio: Podem não ter interesse em embalagens secundárias

5. GERENTE OPERACIONAL
- Por quê: Desempenho da operação ponta a ponta sob sua responsabilidade
- Dor: Alto custo operacional por retrabalho
- Desafio: Gerar senso de urgência

6. DIRETOR GERAL (varejo)
- Por quê: Consegue nos colocar na frente das pessoas certas
- Dor: Reclamações de clientes por produtos avariados
- Desafio: Pode ser assunto muito pequeno para sua agenda

EVITAR: EQUIPE DE COMPRAS
- Não sabem avaliar diferenciais da Ventapel
- Comparam nossas soluções com outras inferiores

PERGUNTAS SPIN VENTAPEL (Gerente Logística com Fitas):

SITUAÇÃO: "Que tipo de fita vocês utilizam para garantir a inviolabilidade das caixas?"

PROBLEMA: 
- "Acontece das caixas abrirem antes de chegar no cliente?"
- "Como vocês medem isso?"
- "Como vocês sabem que não chegam violadas?"
- "De acordo com a nossa experiência, empresas como a sua costumam ter pelo menos 30% de incidentes"

IMPLICAÇÃO:
- "Qual o nível de reclamação dos clientes ao receber os produtos avariados ou com as caixas abertas?"
- "Como vocês medem esse impacto?"
- "Como os executivos da sua empresa se envolvem no processo quando isso acontece?"

NECESSIDADE DE SOLUÇÃO:
- "Como seria para o seu departamento se você pudesse reduzir drasticamente, ou até mesmo eliminar, as ocorrências de caixas violadas ou danificadas?"
- "Como seria se você pudesse gastar 3X menos fita e reduzir drasticamente o retrabalho da sua equipe?"

USPs DOCUMENTADOS VENTAPEL:

1. SOLUÇÃO MAIS EFICIENTE DO MERCADO
- Máquina exclusiva que dispensa fitas gomadas em medidas exatas
- Evita desperdício e facilita instalação
- Confirmação: "Melhorar a eficiência e reduzir o desperdício é importante para você?"

2. SISTEMA DE INVIOLABILIDADE TOTAL
- Sistema exclusivo de instalação com inviolabilidade garantida
- Segurança total até destino final
- Confirmação: "Dar segurança de inviolabilidade para seus clientes é prioridade?"

3. TRANQUILIDADE PARA COMERCIAL
- Garantia de produtos intactos até cliente final
- Confirmação: "Dar tranquilidade ao departamento comercial sobre entregas perfeitas é prioritário?"

OBJEÇÕES E RESPOSTAS VENTAPEL:

"PRODUTO É IMPORTADO, PODE FALTAR":
→ Mostramos estoques para mais de 6 meses
→ Nunca falhamos com a Amazon
→ Temos fábrica em Santa Catarina

"MAIOR FREQUÊNCIA DE TROCA DE RESMAS":
→ Damos todo o apoio na organização dos novos processos
→ Cases e depoimentos de clientes sobre a mudança
→ Benefício supera amplamente a mudança de processo

CONTEXTO REAL VENTAPEL:
- Fábrica em Santa Catarina + escritório São Paulo (desde 2022)
- Representante exclusivo IPG no Brasil, Chile e Argentina
- +50 colaboradores, +200 clientes, +3500 máquinas instaladas
- Clientes atuais: Amazon, Nike, L'Oréal, McCain, Honda, VW, Ford
- Soluções: Fechamento (fitas), Preenchimento (enchimento), Envelopes

CASES DE SUCESSO REAIS:
- Amazon: Implementou solução de fechamento Water AT
- L'Oréal: Usa fita Gorilla 700mts + RSA 12 caixas/minuto
- McCain: Solução de fechamento BOPP
- VW: Deal de R$ 1.5M em negociação
- Nike: Cliente ativo (case em materiais de treinamento)

REGRAS CRÍTICAS - NUNCA VIOLAR:
1. APENAS usar dados REAIS de opportunityData ou pipelineData
2. NUNCA inventar clientes, valores ou métricas
3. Se não há dados, pedir para carregar a oportunidade
4. Usar APENAS clientes que apareçam nos dados
5. Não criar exemplos fictícios

${getRequestSpecificContent(requestType)}

${pipelineData ? generatePipelineAnalysis(pipelineData) : ''}

${opportunityData ? generateOpportunityAnalysis(opportunityData) : ''}

INSTRUÇÕES PARA RESPONDER:
${getResponseInstructions(requestType, context, opportunityData)}
`;

  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('API key do Claude não encontrada');
      return res.status(200).json({ 
        response: generatePPVVCFallbackResponse(opportunityData, context, requestType, pipelineData)
      });
    }

    // Chamada para Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages && messages.length > 0 ? messages : [
          { role: 'user', content: context || 'Analise esta oportunidade' }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API Claude:', response.status, errorText);
      throw new Error(`Erro API Claude: ${response.status}`);
    }

    const data = await response.json();
    
    res.status(200).json({ 
      response: data.content?.[0]?.text || generatePPVVCFallbackResponse(opportunityData, context, requestType, pipelineData),
      analysis: opportunityData ? generatePPVVCAnalysis(opportunityData) : null
    });

  } catch (error) {
    console.error('Erro chamando API Claude:', error);
    
    res.status(200).json({ 
      response: generatePPVVCFallbackResponse(opportunityData, context, requestType, pipelineData)
    });
  }
}

// Detectar tipo de solicitação
function detectRequestType(context) {
  const lowerContext = context?.toLowerCase() || '';
  
  if (lowerContext.includes('email') || lowerContext.includes('e-mail') || lowerContext.includes('mensagem')) {
    return 'email';
  }
  if (lowerContext.includes('ligação') || lowerContext.includes('ligar') || lowerContext.includes('telefone') || lowerContext.includes('script')) {
    return 'script';
  }
  if (lowerContext.includes('spin')) {
    return 'spin';
  }
  if (lowerContext.includes('objeção') || lowerContext.includes('caro') || lowerContext.includes('importado')) {
    return 'objection';
  }
  if (lowerContext.includes('demo') || lowerContext.includes('apresentação')) {
    return 'demo';
  }
  if (lowerContext.includes('poder') || lowerContext.includes('decisor') || lowerContext.includes('sponsor')) {
    return 'power';
  }
  if (lowerContext.includes('dor') || lowerContext.includes('pain') || lowerContext.includes('problema')) {
    return 'pain';
  }
  
  return 'general';
}

// Conteúdo específico por tipo de request
function getRequestSpecificContent(requestType) {
  const content = {
    'email': `
TEMPLATES DE E-MAIL POR NÍVEL PPVVC:

DOR < 3 (Não admite problema):
Assunto: Amazon reduziu 30% violações - caso relevante para [Cliente]
- Gancho com estatística da indústria (30% incidentes média)
- Pergunta que gere reflexão sobre sua situação
- Case similar (Amazon, L'Oréal, McCain)
- CTA para conversa exploratória

DOR 4-6 + PODER < 4 (Dor admitida, sem acesso poder):
Assunto: Acesso ao decisor - Solução violações [Cliente]
- Referência dor já admitida
- Necessidade de envolver tomador de decisão
- Valor potencial calculado
- Solicitação específica de acesso

VALOR > 6 + CONTROLE > 7 (Pronto para proposta):
Assunto: Proposta Ventapel [Cliente] - Garantia 40% redução
- ROI validado na prova
- Investimento e condições IPG
- Garantia de resultados
- Timeline implementação`,

    'script': `
SCRIPT DE LIGAÇÃO POR ETAPA:

QUALIFICAÇÃO (Etapa 2):
Abertura: "Olá [Nome], sou [Vendedor] da Ventapel, representantes IPG. Tem 30 segundos?"
SPIN Situação: "Que tipo de fita vocês usam hoje para fechar caixas?"
SPIN Problema: "Com que frequência as caixas chegam abertas no cliente?"
SPIN Implicação: "Quanto tempo dedicam para re-embalar por esse problema?"
SPIN Necessidade: "Se eliminassem esse retrabalho, qual seria o impacto?"

APRESENTAÇÃO (Etapa 3):
"[Nome], baseado no que conversamos sobre [dor específica],
a Ventapel tem uma solução que reduziu 30% as violações na Amazon.
Podemos incluir o [Tomador Decisão] numa demo de 30 minutos?"`,

    'spin': `
PERGUNTAS SPIN ADAPTADAS POR PERFIL:

GERENTE PRODUÇÃO:
S: "Como é o processo de fechamento de caixas na sua linha?"
P: "Qual percentual precisa de retrabalho por mal selamento?"
I: "Quanto custa cada parada de linha por esse tema?"
N: "Se automatizassem o selamento perfeito, quanto economizariam?"

GERENTE QUALIDADE:
S: "Como medem satisfação nas entregas?"
P: "Qual % de reclamações são por embalagem danificada?"
I: "Como isso impacta na renovação de contratos?"
N: "Se garantissem entregas perfeitas, qual seria o valor?"`,

    'objection': `
MANEJO DE OBJEÇÕES VENTAPEL:

"PRODUTO IMPORTADO":
1. "Entendo a preocupação. Temos fábrica em Santa Catarina desde 2019"
2. "Mantemos 6 meses de estoque mínimo garantido"
3. "A Amazon trabalha conosco há 3 anos sem uma falha"

"MUDANÇA DE PROCESSO COMPLICADA":
1. "A mudança leva 2 horas com nossa equipe de suporte"
2. "McCain fez a transição sem parar produção"
3. "Incluímos treinamento completo e acompanhamento 30 dias"

"JÁ TEMOS FORNECEDOR":
1. "Estão 100% satisfeitos com os resultados atuais?"
2. "Muitos clientes usam ambos: nós para linhas críticas"
3. "Testamos em uma linha por 30 dias? Garantimos 40% melhoria"`,

    'power': `
ESTRATÉGIAS PARA ACESSAR O PODER:

DESDE CONTATO TÉCNICO:
"[Nome], para desenhar a solução correta preciso entender as prioridades do [Gerente Operacional]. Podemos incluí-lo 20 minutos?"

CRIAR URGÊNCIA PARA PODER:
"O ROI que calculamos é R$[X]/mês, mas preciso validar com quem aprova investimentos desse tamanho. Quem seria?"

BYPASS COMPRAS:
"Compras avalia preço, mas isso é sobre eliminar R$[X] em perdas operacionais. Podemos apresentar o case ao dono do P&L?"`,

    'pain': `
DESENVOLVIMENTO DA DOR POR PERFIL:

LOGÍSTICA (30% incidentes):
- Quantificar: "[X] caixas/mês = R$[Y] em reposições"
- Imagem: "Como o CEO vê essas métricas?"
- Concorrência: "MercadoLivre já eliminou esse problema"

PRODUÇÃO (Retrabalho):
- Tempo: "3 pessoas x 2 horas/dia = 6 horas perdidas"
- Custo: "R$50/hora x 6 x 22 dias = R$6.600/mês"
- Oportunidade: "O que fariam com 130 horas/mês extras?"`,

    'general': ''
  };
  
  return content[requestType] || content.general;
}

// Gerar análise do pipeline
function generatePipelineAnalysis(pipelineData) {
  if (!pipelineData) return '';
  
  const opportunities = pipelineData.allOpportunities || [];
  const health = pipelineData.pipelineHealth || {};
  
  // Calcular deals por etapa
  const byStage = opportunities.reduce((acc, opp) => {
    acc[opp.stage] = (acc[opp.stage] || 0) + 1;
    return acc;
  }, {});
  
  // Identificar deals single-threaded
  const singleThreaded = opportunities.filter(opp => {
    const contacts = [opp.power_sponsor, opp.sponsor, opp.influencer].filter(Boolean);
    return contacts.length < 2;
  });
  
  return `
ANÁLISE PIPELINE PPVVC:

DISTRIBUIÇÃO POR ETAPA:
${Object.entries(byStage).map(([stage, count]) => 
  `Etapa ${stage}: ${count} deals`
).join('\n')}

RISCOS IDENTIFICADOS:
- Deals single-threaded: ${singleThreaded.length} (${Math.round(singleThreaded.length/opportunities.length*100)}%)
- Deals sem Power identificado: ${opportunities.filter(o => !o.power_sponsor).length}
- Deals > 7 dias sem contato: ${opportunities.filter(o => getDaysSinceLastContact(o.last_update) > 7).length}

TOP DEALS PARA ACELERAR:
${opportunities
  .sort((a, b) => b.value - a.value)
  .slice(0, 3)
  .map(opp => `${opp.client}: R$${opp.value.toLocaleString('pt-BR')} - Ação: ${getNextActionForOpportunity(opp)}`)
  .join('\n')}
`;
}

// Gerar análise de oportunidade específica
function generateOpportunityAnalysis(opportunity) {
  if (!opportunity) return '';
  
  const scales = opportunity.scales || {};
  const avgPPVVC = calculatePPVVCAverage(scales);
  const bidFactor = getBidFactor(opportunity);
  const realProbability = avgPPVVC * bidFactor;
  
  return `
ANÁLISE PPVVC DE ${opportunity.client}:

ESTADO GERAL:
- Média PPVVC: ${avgPPVVC.toFixed(1)}/10
- Fator BID: ${bidFactor} ${bidFactor < 1 ? '⚠️ HÁ CONCORRÊNCIA' : '✓ Sem concorrência'}
- Probabilidade real: ${(realProbability * 10).toFixed(0)}%
- Valor ponderado: R$${Math.round(opportunity.value * realProbability).toLocaleString('pt-BR')}

ESCALAS DETALHADAS:
${generateScaleAnalysis(scales)}

CONTATOS MAPEADOS:
- Power Sponsor: ${opportunity.power_sponsor || '❌ NÃO IDENTIFICADO - CRÍTICO'}
- Sponsor: ${opportunity.sponsor || '❌ Não identificado'}
- Influenciador: ${opportunity.influencer || '⚠️ Não identificado'}
- Apoio: ${opportunity.support_contact || 'Não identificado'}

ANÁLISE SITUACIONAL:
${generateSituationalInsight(opportunity, scales, avgPPVVC)}

PRÓXIMOS 3 PASSOS:
${generateNext3Actions(opportunity, scales)}
`;
}

// Calcular média PPVVC
function calculatePPVVCAverage(scales) {
  const values = [
    scales.pain || 0,
    scales.power || 0,
    scales.vision || 0,
    scales.value || 0,
    scales.control || 0,
    scales.purchase || 0
  ];
  return values.reduce((a, b) => a + b, 0) / 6;
}

// Obter fator BID
function getBidFactor(opportunity) {
  if (opportunity.competition === 'none') return 1.0;
  if (opportunity.competition === 'directed') return 0.5;
  if (opportunity.competition === 'cold') return 0.2;
  return 0.5; // Default: assumir concorrência moderada
}

// Gerar análise de escalas
function generateScaleAnalysis(scales) {
  const analysis = [];
  
  // DOR
  if (scales.pain < 4) {
    analysis.push(`🔴 DOR (${scales.pain}/10): Cliente NÃO admite dor - BLOQUEIO CRÍTICO`);
  } else if (scales.pain < 7) {
    analysis.push(`🟡 DOR (${scales.pain}/10): Dor admitida por contato, falta tomador decisão`);
  } else {
    analysis.push(`🟢 DOR (${scales.pain}/10): Dor admitida pelo decisor`);
  }
  
  // PODER
  if (scales.power < 4) {
    analysis.push(`🔴 PODER (${scales.power}/10): Sem acesso ao decisor - BLOQUEIO CRÍTICO`);
  } else if (scales.power < 7) {
    analysis.push(`🟡 PODER (${scales.power}/10): Acesso parcial, falta aprovação formal`);
  } else {
    analysis.push(`🟢 PODER (${scales.power}/10): Decisor comprometido`);
  }
  
  // VISÃO
  if (scales.vision < 3) {
    analysis.push(`🔴 VISÃO (${scales.vision}/10): Sem visão ou visão concorrente`);
  } else if (scales.vision < 7) {
    analysis.push(`🟡 VISÃO (${scales.vision}/10): Visão parcial, falta diferenciação`);
  } else {
    analysis.push(`🟢 VISÃO (${scales.vision}/10): Visão diferenciada documentada`);
  }
  
  // VALOR
  if (scales.value < 4) {
    analysis.push(`🔴 VALOR (${scales.value}/10): ROI não identificado`);
  } else if (scales.value < 7) {
    analysis.push(`🟡 VALOR (${scales.value}/10): Valor explorado, falta validação`);
  } else {
    analysis.push(`🟢 VALOR (${scales.value}/10): ROI validado e documentado`);
  }
  
  return analysis.join('\n');
}

// Gerar insight situacional
function generateSituationalInsight(opportunity, scales, avgPPVVC) {
  const insights = [];
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  // Temperatura do deal
  if (daysSince > 7) {
    insights.push(`🚨 DEAL FRIO: ${daysSince} dias sem contato - Reativar URGENTE`);
  }
  
  // Estado segundo média
  if (avgPPVVC < 3) {
    insights.push('💀 DEAL ZUMBI: Considerar desqualificar ou intervenção maior');
  } else if (avgPPVVC < 5) {
    insights.push('⚠️ DEAL EM RISCO: Precisa trabalho intensivo esta semana');
  } else if (avgPPVVC > 7) {
    insights.push('🔥 DEAL QUENTE: Acelerar fechamento, concorrência pode entrar');
  }
  
  // Análise de etapa vs escalas
  const expectedScales = getExpectedScalesForStage(opportunity.stage);
  if (scales.pain < expectedScales.pain || scales.power < expectedScales.power) {
    insights.push(`⚠️ DESALINHADO: Etapa ${opportunity.stage} requer Dor>${expectedScales.pain} e Poder>${expectedScales.power}`);
  }
  
  // Multi-threading
  const contacts = [opportunity.power_sponsor, opportunity.sponsor, opportunity.influencer].filter(Boolean).length;
  if (contacts < 2) {
    insights.push('🎯 SINGLE-THREADED: Alto risco - mapear mais contatos JÁ');
  }
  
  return insights.join('\n');
}

// Obter escalas esperadas por etapa
function getExpectedScalesForStage(stage) {
  const expectations = {
    1: { pain: 0, power: 0 }, // Prospecção
    2: { pain: 3, power: 2 }, // Qualificação
    3: { pain: 5, power: 4 }, // Apresentação
    4: { pain: 7, power: 6 }, // Validação
    5: { pain: 8, power: 8 }, // Negociação
    6: { pain: 10, power: 10 } // Fechado
  };
  return expectations[stage] || { pain: 0, power: 0 };
}

// Gerar próximas 3 ações
function generateNext3Actions(opportunity, scales) {
  const actions = [];
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  // Prioridade 1: Reativar se está frio
  if (daysSince > 7) {
    actions.push(`1. HOJE: E-mail reativação - "Ainda é prioridade eliminar R$${Math.round(opportunity.value * 0.03).toLocaleString('pt-BR')} em violações?"`);
  }
  
  // Prioridade 2: Resolver bloqueio mais crítico
  if (scales.pain < 4) {
    actions.push(`${actions.length + 1}. URGENTE: Ligação SPIN para admitir dor - Usar case Amazon 30% redução`);
  }
  
  if (scales.power < 4 && scales.pain >= 4) {
    actions.push(`${actions.length + 1}. ESTA SEMANA: Acessar ${opportunity.power_sponsor || 'Gerente Operacional'} - "ROI requer sua validação"`);
  }
  
  if (scales.vision < 5 && scales.pain >= 4) {
    actions.push(`${actions.length + 1}. PRÓXIMA CALL: Demo diferenciada - Mostrar máquina IPG + case McCain`);
  }
  
  if (scales.value < 6 && scales.vision >= 5) {
    actions.push(`${actions.length + 1}. VALIDAR: ROI específico - "R$${Math.round(opportunity.value * 0.2).toLocaleString('pt-BR')}/mês em economia"`);
  }
  
  // Se tudo está alto, fechar
  if (scales.pain >= 7 && scales.power >= 7 && scales.value >= 6) {
    actions.push(`${actions.length + 1}. FECHAR JÁ: "Implementação em 2 semanas, enviamos contrato hoje?"`);
  }
  
  // Preencher até 3 ações
  while (actions.length < 3) {
    if (!opportunity.power_sponsor) {
      actions.push(`${actions.length + 1}. MAPEAR: Identificar Power Sponsor real (quem assina)`);
    } else if (actions.length < 3) {
      actions.push(`${actions.length + 1}. CONCORRÊNCIA: Validar se há outros fornecedores avaliando`);
    }
  }
  
  return actions.slice(0, 3).join('\n');
}

// Obter próxima ação para oportunidade
function getNextActionForOpportunity(opportunity) {
  const scales = opportunity.scales || {};
  
  if (scales.pain < 4) return 'Desenvolver dor com SPIN';
  if (scales.power < 4) return 'Acessar tomador de decisão';
  if (scales.vision < 5) return 'Demo diferenciada';
  if (scales.value < 6) return 'Validar ROI';
  if (scales.purchase < 3) return 'Mapear processo compras';
  return 'Pressionar fechamento';
}

// Instruções de resposta melhoradas
function getResponseInstructions(requestType, context, opportunityData) {
  if (!opportunityData) {
    return `
RESPONDA: "Não há oportunidade carregada. Preciso de dados reais para gerar conteúdo específico.

Para ajudar, carregue uma oportunidade com:
- Cliente e valor do deal
- Escalas PPVVC atuais
- Contatos mapeados
- Última interação

Enquanto isso, posso explicar:
- Metodologia PPVVC da Ventapel
- Perguntas SPIN por perfil
- Cases de sucesso (Amazon, L'Oréal, McCain)
- Manejo de objeções comuns"`;
  }
  
  const instructions = {
    'email': `GERE E-MAIL ESPECÍFICO para ${opportunityData.client}:
- Baseado nas escalas PPVVC atuais
- Usar case real (Amazon, L'Oréal, McCain)
- CTA específico para avançar escala mais baixa
- Máximo 150 palavras`,
    
    'script': `GERE SCRIPT para ${opportunityData.client}:
- Perguntas SPIN adaptadas à indústria
- Baseado na dor atual (nível ${opportunityData.scales?.pain || 0})
- Incluir manejo de objeção provável
- Duração máxima 5 minutos`,
    
    'spin': `PERGUNTAS SPIN para ${opportunityData.client}:
- Adaptadas ao perfil do contato
- Progressão S→P→I→N completa
- Quantificar com números reais deles
- Cases da indústria deles`,
    
    'objection': `MANEJO DE OBJEÇÃO para ${opportunityData.client}:
- Usar resposta documentada Ventapel
- Referenciar case similar exitoso
- Voltar à dor/valor identificado
- Fechar com pergunta que avance`,
    
    'power': `ESTRATÉGIA DE PODER para ${opportunityData.client}:
- Atual: ${opportunityData.scales?.power || 0}/10
- Identificar caminho ao decisor
- Script específico para pedir acesso
- Criar urgência com ROI`,
    
    'pain': `DESENVOLVIMENTO DE DOR para ${opportunityData.client}:
- Atual: ${opportunityData.scales?.pain || 0}/10
- Quantificar problema (30% indústria)
- Implicações para o negócio deles
- Urgência por concorrência`,
    
    'general': `ANÁLISE E AÇÃO para ${opportunityData.client}:
- Diagnóstico PPVVC brutal
- 3 ações específicas priorizadas
- Scripts/e-mails exatos
- Riscos se não agirem`
  };
  
  return instructions[requestType] || instructions.general;
}

// Dias desde último contato
function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  const last = new Date(lastUpdate);
  const now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// Resposta fallback melhorada com PPVVC
function generatePPVVCFallbackResponse(opportunityData, context, requestType, pipelineData) {
  if (!opportunityData) {
    return `Sem oportunidade carregada. A metodologia PPVVC da Ventapel requer dados reais.

📊 METODOLOGIA PPVVC (0-10):
- Pain: Dor admitida pelo decisor
- Power: Acesso ao tomador de decisão  
- Vision: Solução diferenciada criada
- Value: ROI validado e documentado
- Control: Processo controlado
- Compras: Processo de compra mapeado

🎯 PERFIS ALVO:
1. Gerente Logística (30% violações)
2. Gerente Produção (retrabalho)
3. Gerente Qualidade (KPIs entregas)
4. Diretor Operacional (P&L)

❌ EVITAR: Compras (não avaliam diferencial)

🏆 CASES SUCESSO:
- Amazon: -30% violações
- L'Oréal: 12 caixas/min com Gorilla
- VW: Deal R$ 1.5M em processo

Carregue uma oportunidade para análise específica.`;
  }
  
  const scales = opportunityData.scales || {};
  const avgPPVVC = calculatePPVVCAverage(scales);
  const analysis = generatePPVVCAnalysis(opportunityData);
  
  // Gerar resposta específica por tipo de request
  if (requestType === 'email') {
    return generatePPVVCEmail(opportunityData, scales);
  }
  
  if (requestType === 'script' || requestType === 'spin') {
    return generatePPVVCScript(opportunityData, scales);
  }
  
  return `📊 ANÁLISE PPVVC - ${opportunityData.client}

ESTADO: ${avgPPVVC < 4 ? '💀 ZUMBI' : avgPPVVC < 6 ? '⚠️ EM RISCO' : '🔥 QUENTE'} (${avgPPVVC.toFixed(1)}/10)

${analysis}

✅ AÇÃO IMEDIATA:
${generateNext3Actions(opportunityData, scales).split('\n')[0]}

💬 Pergunte-me:
- "E-mail para reativar"
- "Script SPIN para ${opportunityData.client}"
- "Como acessar o poder"
- "Manejo objeção produto importado"`;
}

// Gerar análise PPVVC
function generatePPVVCAnalysis(opportunity) {
  if (!opportunity) return '';
  
  const scales = opportunity.scales || {};
  return generateScaleAnalysis(scales);
}

// Gerar e-mail PPVVC
function generatePPVVCEmail(opportunity, scales) {
  const painLevel = scales.pain || 0;
  const powerLevel = scales.power || 0;
  
  if (painLevel < 4) {
    // E-mail para desenvolver dor
    return `📧 E-MAIL DESENVOLVIMENTO DE DOR - ${opportunity.client}

ASSUNTO: Amazon reduziu 30% violações com Ventapel - caso relevante para ${opportunity.client}

${opportunity.sponsor || 'Prezado cliente'},

Empresas como ${opportunity.client} perdem em média 3-5% dos envios por violação de caixas.

Com seu volume, isso representa:
• ${Math.round(opportunity.value / 50)} caixas violadas/mês  
• R$${Math.round(opportunity.value * 0.03).toLocaleString('pt-BR')} em perdas mensais
• Horas de retrabalho re-embalando

A Amazon tinha o mesmo problema. Hoje economiza 30% com nossa solução IPG.

Como vocês lidam com esse tema na ${opportunity.client}?

Podemos conversar 20 minutos esta semana?

${opportunity.vendor || 'Equipe Ventapel'}

P.S. McCain também eliminou o problema. Case disponível.`;
  }
  
  if (powerLevel < 4) {
    // E-mail para acessar o poder
    return `📧 E-MAIL ACESSO AO PODER - ${opportunity.client}

ASSUNTO: ROI R$${Math.round(opportunity.value * 0.2).toLocaleString('pt-BR')}/mês requer validação gerencial

${opportunity.sponsor || 'Prezado'},

Baseado em nossas conversas, identificamos potencial de economia de R$${Math.round(opportunity.value * 0.2).toLocaleString('pt-BR')} mensais eliminando violações.

Para garantir esses resultados na ${opportunity.client}, preciso de 20 minutos com quem aprova investimentos em ${opportunity.industry || 'operações'}.

Pontos-chave a validar:
• ROI em 4-6 meses
• Garantia 40% redução violações
• Implementação sem parar operação

Podemos incluir o ${opportunity.power_sponsor || 'Gerente de Operações'} em nossa call de quinta?

${opportunity.vendor || 'Equipe Ventapel'}`;
  }
  
  // E-mail padrão
  return `📧 E-MAIL para ${opportunity.client}

ASSUNTO: Próximos passos - Solução Ventapel ${opportunity.client}

${opportunity.power_sponsor || opportunity.sponsor || 'Prezado cliente'},

[Personalizar conforme situação atual]

Ventapel garante:
• 40% redução violações ou devolvemos seu dinheiro
• ROI em 4-6 meses
• Suporte local (fábrica Santa Catarina)

Cases de sucesso: Amazon, L'Oréal, McCain

Avançamos esta semana?

${opportunity.vendor || 'Equipe Ventapel'}`;
}

// Gerar script PPVVC
function generatePPVVCScript(opportunity, scales) {
  const painLevel = scales.pain || 0;
  const powerLevel = scales.power || 0;
  
  return `📞 SCRIPT PPVVC - ${opportunity.client}

ABERTURA:
"Olá ${opportunity.sponsor || opportunity.power_sponsor || 'Maria'}, sou ${opportunity.vendor || 'da Ventapel'}.
Representamos a IPG no Brasil. Tem 30 segundos sobre o tema de violações que conversamos?"

${painLevel < 4 ? `
DESENVOLVIMENTO DE DOR (SPIN):

SITUAÇÃO:
"Que tipo de fita vocês usam hoje para fechar as caixas?"
[ESCUTAR]

PROBLEMA:  
"Pela nossa experiência, empresas como ${opportunity.client} têm 30% de incidentes.
Com que frequência vocês recebem reclamações por caixas abertas?"
[ESCUTAR E QUANTIFICAR]

IMPLICAÇÃO:
"Com ${Math.round(opportunity.value / 50)} envios mensais, isso seriam ${Math.round(opportunity.value / 50 * 0.3)} caixas violadas.
Quanto tempo sua equipe dedica para resolver esses problemas?"
[APROFUNDAR NO CUSTO]

NECESSIDADE:
"Se eliminassem completamente esse retrabalho e as reclamações,
qual seria o impacto na sua operação?"
[DEIXAR VISUALIZAR O VALOR]` : ''}

${powerLevel < 4 ? `
ACESSO AO PODER:
"${opportunity.sponsor || 'Maria'}, as economias que identificamos são de R$${Math.round(opportunity.value * 0.2).toLocaleString('pt-BR')} mensais.
Para garantir esses resultados, preciso entender as prioridades do ${opportunity.power_sponsor || 'Gerente de Operações'}.
Podemos incluí-lo numa call de 20 minutos esta semana?"

Se objetar:
"Entendo. Que informação ele precisaria para avaliar uma solução que economiza R$${Math.round(opportunity.value * 2.4).toLocaleString('pt-BR')} ao ano?"` : ''}

FECHAMENTO:
"Baseado no que conversamos, vejo claro potencial de [eliminar violações/reduzir retrabalho].
Qual seria o melhor próximo passo na sua perspectiva?"

MANEJO "ENVIE INFORMAÇÕES":
"Claro. Para enviar o mais relevante, sua prioridade é reduzir violações ou eliminar retrabalho?"
[RESPONDE E ENTÃO]
"Perfeito. Envio o case da [Amazon/McCain] que é similar. Revisamos juntos na quinta?"`;
}

// Para Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    maxDuration: 30,
  },
};
