// api/assistant.js - VERSIÓN DEFINITIVA (CONTEXTO COMPLETO SIEMPRE)

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

import PromptBuilder from './lib/promptBuilder.js';

// ============= CASOS DE ÉXITO REALES =============
const CASOS_EXITO_REAIS = {
  'honda': {
    empresa: 'Honda Argentina',
    setor: 'Automotivo',
    problema: 'Velocidade limitada, 1% perdas, problemas ergonomicos',
    solucao: 'BP555 + Fita Gorilla 300m',
    resultados: {
      velocidade: '+40%',
      perdas: '100% eliminadas',
      roi_meses: 3,
      investimento: 150000,
      economia_anual: 600000
    },
    tags: ['automotivo', 'concessionarias', 'alta-seguranca', 'ergonomia']
  },
  
  'loreal': {
    empresa: "L'Oreal Brasil",
    setor: 'Cosmetica',
    problema: '+10% perdas por roubo, gargalos de producao',
    solucao: 'RSA + Fita Gorilla 700m',
    resultados: {
      roubos: '100% eliminados',
      eficiencia: '+50%',
      roi_meses: 3,
      investimento: 280000,
      economia_anual: 2500000,
      capacidade: '12 caixas/minuto',
      rastreabilidade: '100% implementada'
    },
    tags: ['cosmetica', 'alto-valor', 'anti-roubo', 'rastreabilidade']
  },
  
  'nike': {
    empresa: 'Nike Brasil',
    setor: 'Calcado/Textil',
    problema: '10% perdas em transporte',
    solucao: 'BP755 + Fita Gorilla 300m',
    resultados: {
      perdas: '100% eliminadas',
      eficiencia: '+30%',
      roi_meses: 2,
      investimento: 200000,
      economia_anual: 1200000,
      disputas: '100% reducao com transportadoras'
    },
    tags: ['textil', 'calcado', 'e-commerce', 'transportadoras']
  },
  
  'mercadolibre': {
    empresa: 'MercadoLibre',
    setor: 'E-commerce',
    problema: 'Alto retrabalho, perdas em fulfillment',
    solucao: 'BP555e + Fita VENOM',
    resultados: {
      retrabalho: '-100%',
      economia_mensal: 180000,
      roi_meses: 2,
      investimento: 360000
    },
    tags: ['e-commerce', 'marketplace', 'fulfillment', 'alto-volume']
  },

  'correio_argentino': {
    empresa: 'Correo Argentino',
    setor: 'Logistica/Postal',
    problema: 'Roubos de celulares em transito',
    solucao: 'BP555e + Fita VENOM + protocolo padronizado',
    resultados: {
      roubos: 'Deteccao imediata',
      evidencia: '100% rastreabilidade',
      processo: 'Padronizacao completa',
      roi_meses: 2,
      investimento: 180000
    },
    tags: ['logistica', 'postal', 'anti-roubo', 'celulares']
  }
};

// ============= HELPERS =============
function getScaleValue(scale) {
  if (!scale) return 0;
  if (typeof scale === 'object' && scale.score !== undefined) return scale.score;
  if (typeof scale === 'number') return scale;
  return 0;
}

function getScaleDescription(scale) {
  if (!scale) return '';
  if (typeof scale === 'object' && scale.description !== undefined) {
    return scale.description || '';
  }
  return '';
}

function calculateHealthScore(scales) {
  if (!scales) return 0;
  const values = [
    getScaleValue(scales.dor || scales.pain),
    getScaleValue(scales.poder || scales.power),
    getScaleValue(scales.visao || scales.vision),
    getScaleValue(scales.valor || scales.value),
    getScaleValue(scales.controle || scales.control),
    getScaleValue(scales.compras || scales.purchase)
  ];
  const sum = values.reduce((acc, val) => acc + val, 0);
  return values.length > 0 ? (sum / values.length).toFixed(1) : 0;
}

function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  try {
    const last = new Date(lastUpdate);
    const now = new Date();
    return Math.floor((now - last) / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}

// ============= BUSCAR CASOS RELEVANTES =============
function findRelevantCases(opportunity) {
  if (!opportunity) return [];
  
  const relevantCases = [];
  const oppTags = [];
  
  // Generar tags de la oportunidad
  if (opportunity.industry) {
    oppTags.push(opportunity.industry.toLowerCase());
  }
  if (opportunity.product) {
    if (opportunity.product.toLowerCase().includes('bp')) oppTags.push('maquina');
    if (opportunity.product.toLowerCase().includes('fita')) oppTags.push('fita');
    if (opportunity.product.toLowerCase().includes('venom')) oppTags.push('anti-roubo');
  }
  if (opportunity.value > 500000) {
    oppTags.push('enterprise', 'alto-volume');
  }
  
  // Buscar casos coincidentes
  Object.entries(CASOS_EXITO_REAIS).forEach(([key, caso]) => {
    let score = 0;
    
    // Coincidencia por sector
    if (opportunity.industry && caso.setor.toLowerCase().includes(opportunity.industry.toLowerCase())) {
      score += 3;
    }
    
    // Coincidencia por tags
    if (caso.tags) {
      caso.tags.forEach(tag => {
        if (oppTags.includes(tag)) {
          score += 1;
        }
      });
    }
    
    // Coincidencia por problema similar
    if (opportunity.scales?.dor?.description && caso.problema) {
      const problemWords = opportunity.scales.dor.description.toLowerCase().split(' ');
      const casoWords = caso.problema.toLowerCase().split(' ');
      const matches = problemWords.filter(word => casoWords.includes(word));
      score += matches.length * 0.5;
    }
    
    if (score > 0) {
      relevantCases.push({ ...caso, score, key });
    }
  });
  
  return relevantCases
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ============= ANÁLISIS DE OPORTUNIDAD =============
function analyzeOpportunity(opportunity) {
  if (!opportunity) return null;

  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  // Calcular probabilidad
  let probability = 0;
  if (healthScore >= 8) probability = 85;
  else if (healthScore >= 7) probability = 70;
  else if (healthScore >= 5) probability = 40;
  else if (healthScore >= 3) probability = 20;
  else probability = 5;

  // Ajustar por dias sin contacto
  if (daysSince > 30) probability = Math.max(probability - 50, 5);
  else if (daysSince > 14) probability = Math.max(probability - 20, 10);
  else if (daysSince > 7) probability = Math.max(probability - 10, 15);

  // Identificar escalas criticas
  const criticalScales = [];
  const scales = opportunity.scales || {};
  
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  const visaoScore = getScaleValue(scales.visao || scales.vision);
  const valorScore = getScaleValue(scales.valor || scales.value);
  const controleScore = getScaleValue(scales.controle || scales.control);
  const comprasScore = getScaleValue(scales.compras || scales.purchase);

  const scaleDescriptions = {
    dor: getScaleDescription(scales.dor || scales.pain),
    poder: getScaleDescription(scales.poder || scales.power),
    visao: getScaleDescription(scales.visao || scales.vision),
    valor: getScaleDescription(scales.valor || scales.value),
    controle: getScaleDescription(scales.controle || scales.control),
    compras: getScaleDescription(scales.compras || scales.purchase)
  };

  if (dorScore < 5) {
    criticalScales.push({
      name: 'DOR',
      value: dorScore,
      issue: 'Cliente nao admite o problema',
      action: 'Aplicar tecnica SPIN para elevar dor',
      description: scaleDescriptions.dor
    });
  }

  if (poderScore < 4) {
    criticalScales.push({
      name: 'PODER',
      value: poderScore,
      issue: 'Sem acesso ao decisor',
      action: opportunity.power_sponsor 
        ? `Conseguir reuniao com ${opportunity.power_sponsor}` 
        : 'Identificar e acessar o Power Sponsor',
      description: scaleDescriptions.poder
    });
  }

  if (visaoScore < 4) {
    criticalScales.push({
      name: 'VISAO',
      value: visaoScore,
      issue: 'Cliente nao ve a solucao',
      action: 'Demo com caso de exito relevante',
      description: scaleDescriptions.visao
    });
  }

  if (valorScore < 4) {
    criticalScales.push({
      name: 'VALOR',
      value: valorScore,
      issue: 'ROI nao percebido',
      action: 'Calcular e apresentar ROI especifico',
      description: scaleDescriptions.valor
    });
  }

  return {
    healthScore,
    probability,
    daysSince,
    criticalScales,
    scaleBreakdown: {
      dor: dorScore,
      poder: poderScore,
      visao: visaoScore,
      valor: valorScore,
      controle: controleScore,
      compras: comprasScore
    },
    scaleDescriptions,
    contacts: {
      power_sponsor: opportunity.power_sponsor,
      sponsor: opportunity.sponsor,
      influencer: opportunity.influencer,
      support_contact: opportunity.support_contact
    },
    product: opportunity.product,
    next_action: opportunity.next_action,
    expected_close: opportunity.expected_close
  };
}

// ============= GENERACIÓN DE ALERTAS =============
function generateAlerts(opportunity) {
  const alerts = [];
  if (!opportunity) return alerts;

  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const scales = opportunity.scales || {};

  // Alertas por dias sin contacto
  if (daysSince > 30) {
    const contactName = opportunity.sponsor || opportunity.power_sponsor || 'o contato';
    alerts.push({
      type: 'critical',
      priority: 1,
      message: `NEGOCIO MORTO: ${daysSince} dias sem falar com ${contactName}`,
      action: `Ligar HOJE para ${contactName} com oferta especial ou descartar`
    });
  } else if (daysSince > 14) {
    alerts.push({
      type: 'urgent',
      priority: 2,
      message: `URGENTE: ${daysSince} dias sem contato - Negocio esfriando`,
      action: opportunity.next_action || 'Email de reativacao + ligacao em 24h'
    });
  } else if (daysSince > 7) {
    alerts.push({
      type: 'warning',
      priority: 3,
      message: `ATENCAO: ${daysSince} dias sem contato`,
      action: opportunity.next_action || 'Enviar email com novo caso de exito'
    });
  }

  // Alerta por valor em risco
  if (healthScore < 4 && opportunity.value > 100000) {
    const productInfo = opportunity.product ? ` (${opportunity.product})` : '';
    alerts.push({
      type: 'critical',
      priority: 1,
      message: `R$ ${opportunity.value.toLocaleString('pt-BR')}${productInfo} EM RISCO CRITICO`,
      action: opportunity.power_sponsor 
        ? `Reuniao de emergencia com ${opportunity.power_sponsor}`
        : 'Reuniao de emergencia com decisor'
    });
  } else if (healthScore < 5 && opportunity.value > 50000) {
    alerts.push({
      type: 'urgent',
      priority: 2,
      message: `Negocio de R$ ${opportunity.value.toLocaleString('pt-BR')} precisa de intervencao`,
      action: 'Plano de recuperacao em 48h'
    });
  }

  // Alerta por inconsistencia PPVVCC
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  
  if (opportunity.stage >= 3 && dorScore < 5) {
    alerts.push({
      type: 'warning',
      priority: 2,
      message: `FREIO: Na etapa ${opportunity.stage} sem DOR confirmada (${dorScore}/10)`,
      action: 'Voltar para Qualificacao - Nao avancar sem dor'
    });
  }

  if (opportunity.stage >= 4 && poderScore < 4) {
    const contactToUse = opportunity.sponsor || opportunity.influencer || 'alguem interno';
    alerts.push({
      type: 'warning',
      priority: 2,
      message: `FREIO: Tentando fechar sem acesso ao PODER (${poderScore}/10)`,
      action: `Pedir para ${contactToUse} te apresentar ao decisor`
    });
  }

  // Alerta por oportunidade quente
  if (healthScore >= 8 && opportunity.stage < 5) {
    alerts.push({
      type: 'opportunity',
      priority: 3,
      message: `OPORTUNIDADE: Negocio quente (${healthScore}/10) - Acelerar fechamento`,
      action: 'Propor contrato esta semana'
    });
  }

  // Alerta baseado na proxima acao registrada
  if (opportunity.next_action && daysSince > 2) {
    alerts.push({
      type: 'warning',
      priority: 3,
      message: `Acao pendente: "${opportunity.next_action}"`,
      action: 'Executar acao registrada ou atualizar plano'
    });
  }

  return alerts.sort((a, b) => a.priority - b.priority);
}

// ============= NEXT BEST ACTION =============
function generateNextBestAction(opportunity) {
  if (!opportunity?.scales) return null;

  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const scales = opportunity.scales || {};
  
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  const visaoScore = getScaleValue(scales.visao || scales.vision);
  const valorScore = getScaleValue(scales.valor || scales.value);
  const controleScore = getScaleValue(scales.controle || scales.control);

  const contactName = opportunity.sponsor || 'o contato';
  const decisionMaker = opportunity.power_sponsor || 'o decisor';

  // Prioridad 1: Negocios muertos
  if (daysSince > 30) {
    return {
      priority: 'CRITICA',
      title: 'NEGOCIO MORTO - Ultima oportunidade',
      action: `Ligacao de resgate HOJE para ${contactName}`,
      strategy: 'Criar urgencia com oferta limitada',
      script: `"${contactName}, faz ${daysSince} dias que nao conversamos. Tenho uma oferta especial valida apenas esta semana. 15 minutos hoje?"`,
      expectedOutcome: 'Reativar ou descartar definitivamente'
    };
  }

  // Si hay proxima accion registrada
  if (opportunity.next_action && daysSince > 2) {
    return {
      priority: 'ALTA',
      title: 'Executar acao planejada',
      action: opportunity.next_action,
      strategy: 'Manter compromissos e momentum',
      script: `Execute: "${opportunity.next_action}" conforme combinado`,
      expectedOutcome: 'Manter credibilidade e avancar processo'
    };
  }

  // Prioridad 2: Negocios frios
  if (daysSince > 7) {
    return {
      priority: 'URGENTE',
      title: `${daysSince} dias sem contato - Reativar JA`,
      action: `Email + Ligacao em 2 horas para ${contactName}`,
      strategy: 'Usar concorrencia ou perda como gatilho',
      script: `ASSUNTO: "${opportunity.client} - Ainda perdendo R$ ${Math.round(opportunity.value * 0.15).toLocaleString('pt-BR')}/mes?"`,
      expectedOutcome: 'Reuniao agendada em 48h'
    };
  }

  // Sin dolor admitida
  if (dorScore < 5) {
    const dorDescription = getScaleDescription(scales.dor || scales.pain);
    return {
      priority: 'ALTA',
      title: 'Sem DOR = Sem venda',
      action: `Sessao SPIN profunda com ${contactName}`,
      strategy: dorDescription ? `Explorar: "${dorDescription}"` : 'Quantificar perdas ocultas',
      script: `"Quanto custa cada caixa que se abre em transito?"`,
      expectedOutcome: 'Dor admitida e quantificada'
    };
  }

  // Sin acceso al poder
  if (poderScore < 4) {
    const sponsor = opportunity.sponsor || contactName;
    return {
      priority: 'ALTA',
      title: 'Voce precisa do DECISOR',
      action: opportunity.power_sponsor 
        ? `Agendar reuniao com ${opportunity.power_sponsor} esta semana`
        : 'Mapear e acessar o Power Sponsor',
      strategy: `Fazer ${sponsor} ser o heroi`,
      script: `"${sponsor}, para garantir o ROI, preciso da aprovacao de ${decisionMaker}. Apresentamos juntos?"`,
      expectedOutcome: 'Reuniao com decisor em 7 dias'
    };
  }

  // Sin vision clara
  if (visaoScore < 5) {
    const productFocus = opportunity.product || 'nossa solucao';
    return {
      priority: 'MEDIA',
      title: 'Construir VISAO da solucao',
      action: `Demo personalizada de ${productFocus}`,
      strategy: 'Mostrar o futuro sem os problemas atuais',
      script: `"Imagina sua operacao sem caixas abertas. Vou te mostrar como conseguir isso."`,
      expectedOutcome: 'Visao clara e diferenciada'
    };
  }

  // Sin valor percibido
  if (valorScore < 5) {
    return {
      priority: 'MEDIA',
      title: 'Demonstrar ROI concreto',
      action: `Apresentar business case para ${decisionMaker}`,
      strategy: 'Numeros especificos do cliente',
      script: `"Preparei analise especifica: economia anual de R$ ${Math.round(opportunity.value * 1.8).toLocaleString('pt-BR')}"`,
      expectedOutcome: 'ROI validado e aceito'
    };
  }

  // Pronto para fechar
  if (dorScore >= 7 && poderScore >= 6 && valorScore >= 6 && controleScore >= 6) {
    const closer = opportunity.power_sponsor || opportunity.sponsor || 'o responsavel';
    return {
      priority: 'OPORTUNIDADE',
      title: 'FECHAR ESTA SEMANA',
      action: 'Pressionar para assinatura',
      strategy: 'Criar urgencia positiva',
      script: `"${closer}, ja validamos tudo. Assinamos hoje para aproveitar o desconto?"`,
      expectedOutcome: 'Contrato assinado em 72h'
    };
  }

  // Default
  return {
    priority: 'NORMAL',
    title: 'Manter momentum',
    action: 'Avancar metodologia',
    strategy: 'Proximo passo segundo PPVVCC',
    script: 'Revisar escalas e avancar a mais baixa',
    expectedOutcome: 'Progresso nas escalas'
  };
}

// ============= LLAMADA A CLAUDE - SIEMPRE CON CONTEXTO COMPLETO =============
async function callClaudeAPI(opportunityData, userInput, completeAnalysis) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    console.log('WARNING: Claude API key not configured');
    return { 
      type: 'fallback', 
      content: generateSmartFallback(opportunityData, userInput, completeAnalysis) 
    };
  }

  try {
    // SIEMPRE construir prompt COMPLETO con PromptBuilder
    const promptBuilder = new PromptBuilder();
    
    // Agregar TODAS las secciones del contexto
    promptBuilder.addSystemRole();
    
    if (opportunityData) {
      promptBuilder.addOpportunityContext(opportunityData);
    }
    
    if (completeAnalysis) {
      promptBuilder.addScalesAnalysis(completeAnalysis);
      promptBuilder.addAlerts(completeAnalysis);
      promptBuilder.addScaleDescriptions(completeAnalysis);
    }
    
    if (opportunityData) {
      promptBuilder.addContacts(opportunityData);
      promptBuilder.addOperationalInfo(opportunityData);
    }
    
    if (completeAnalysis?.relevantCases) {
      promptBuilder.addRelevantCases(completeAnalysis.relevantCases);
    }
    
    // La pregunta del usuario SIEMPRE va al final con instrucciones
    promptBuilder.addUserQuestion(userInput || 'Faca uma analise completa');
    promptBuilder.addFinalInstructions();

    const promptTemplate = promptBuilder.build();
    const estimatedTokens = promptBuilder.estimateTokens();
    
    console.log(`Prompt built: ${estimatedTokens} estimated tokens`);
    console.log(`User question: "${userInput}"`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: "user", content: promptTemplate }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error text');
      console.error(`Claude API error: ${response.status} - ${errorText}`);
      return { 
        type: 'fallback', 
        content: generateSmartFallback(opportunityData, userInput, completeAnalysis) 
      };
    }

    const data = await response.json();
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error('Invalid response structure from Claude');
      return { 
        type: 'fallback', 
        content: generateSmartFallback(opportunityData, userInput, completeAnalysis) 
      };
    }
    
    return { 
      type: 'direct_response', 
      content: data.content[0].text 
    };
    
  } catch (error) {
    console.error('Error calling Claude:', error.message);
    return { 
      type: 'fallback', 
      content: generateSmartFallback(opportunityData, userInput, completeAnalysis) 
    };
  }
}

// ============= FALLBACK INTELIGENTE =============
function generateSmartFallback(opportunityData, userInput, analysis) {
  if (!opportunityData) {
    return "Selecione um cliente do CRM para comecar a analise.";
  }

  let response = `**Analise de ${opportunityData.client}**\n\n`;
  
  if (opportunityData.product) {
    response += `**Produto:** ${opportunityData.product}\n`;
  }
  
  if (analysis?.opportunity) {
    response += `**Estado:** Saude ${analysis.opportunity.healthScore}/10 | `;
    response += `Probabilidade ${analysis.opportunity.probability}%\n`;
    
    if (analysis.opportunity.contacts) {
      const contacts = analysis.opportunity.contacts;
      if (contacts.power_sponsor || contacts.sponsor) {
        response += `**Contatos:** ${contacts.power_sponsor || contacts.sponsor}\n`;
      }
    }
    response += '\n';
  }
  
  if (analysis?.alerts?.length > 0) {
    response += `**ALERTAS:**\n`;
    analysis.alerts.slice(0, 3).forEach(alert => {
      response += `- ${alert.message}\n`;
    });
    response += '\n';
  }
  
  if (analysis?.nextBestAction) {
    response += `**PROXIMA ACAO:**\n`;
    response += `${analysis.nextBestAction.title}\n`;
    response += `${analysis.nextBestAction.action}\n\n`;
    if (analysis.nextBestAction.script) {
      response += `**Script:**\n`;
      response += `"${analysis.nextBestAction.script}"\n`;
    }
  }
  
  if (opportunityData.next_action) {
    response += `\n**Acao registrada:** ${opportunityData.next_action}\n`;
  }
  
  if (analysis?.relevantCases?.length > 0) {
    response += `\n**Caso similar:** `;
    response += `${analysis.relevantCases[0].empresa} conseguiu ROI em ${analysis.relevantCases[0].resultados.roi_meses} meses.`;
  }
  
  return response;
}

// ============= CONSTRUCCIÓN DE ANÁLISIS COMPLETA =============
function buildCompleteAnalysis(opportunityData) {
  const analysis = {
    timestamp: new Date().toISOString(),
    opportunity: null,
    alerts: [],
    nextBestAction: null,
    relevantCases: []
  };

  if (opportunityData) {
    try {
      analysis.opportunity = analyzeOpportunity(opportunityData);
      analysis.alerts = generateAlerts(opportunityData);
      analysis.nextBestAction = generateNextBestAction(opportunityData);
      analysis.relevantCases = findRelevantCases(opportunityData);
    } catch (error) {
      console.error('Error in analysis:', error);
    }
  }

  return analysis;
}

// ============= HANDLER PRINCIPAL - FLUJO ÚNICO =============
export default async function handler(req) {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Solo POST permitido
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    );
  }

  let step = 'inicio';
  
  try {
    // PASO 1: Parsear body
    step = 'parse-body';
    const body = await req.json();
    const { userInput, opportunityData, vendorName, pipelineData } = body;

    console.log('Received:', { 
      hasInput: !!userInput,
      hasOpportunity: !!opportunityData,
      client: opportunityData?.client,
      vendor: vendorName
    });

    // PASO 2: Validacion basica
    step = 'validacion';
    if (!opportunityData) {
      return new Response(
        JSON.stringify({ 
          response: "Selecione um cliente do CRM para comecar.",
          analysis: null
        }),
        { status: 200, headers }
      );
    }

    // PASO 3: Ejecutar analisis completo
    step = 'analisis';
    const completeAnalysis = buildCompleteAnalysis(opportunityData);

    // PASO 4: Si no hay input, dar resumen
    step = 'check-input';
    if (!userInput || userInput.trim() === '') {
      let summaryResponse = `**${opportunityData.client}**\n\n`;
      
      if (opportunityData.product) {
        summaryResponse += `Produto: ${opportunityData.product}\n`;
      }
      
      if (completeAnalysis.opportunity) {
        summaryResponse += `Saude: ${completeAnalysis.opportunity.healthScore}/10\n`;
        summaryResponse += `Probabilidade: ${completeAnalysis.opportunity.probability}%\n`;
        summaryResponse += `Dias sem contato: ${completeAnalysis.opportunity.daysSince}\n`;
      }
      
      if (completeAnalysis.nextBestAction) {
        summaryResponse += `\n**Proxima acao:**\n${completeAnalysis.nextBestAction.action}`;
      }
      
      return new Response(
        JSON.stringify({ 
          response: summaryResponse,
          analysis: completeAnalysis
        }),
        { status: 200, headers }
      );
    }

    // PASO 5: Procesar pregunta CON CONTEXTO COMPLETO SIEMPRE
    step = 'process-question';
    console.log('Processing question with full context...');
    
    // SIEMPRE llamar a Claude con el contexto completo
    const claudeResponse = await callClaudeAPI(
      opportunityData,
      userInput,
      completeAnalysis
    );

    // PASO 6: Retornar respuesta
    step = 'return-response';
    return new Response(
      JSON.stringify({ 
        response: claudeResponse.content,
        analysis: completeAnalysis,
        debug: {
          step: 'success',
          tokensEstimated: Math.ceil((userInput || '').length / 4) + 800
        }
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error(`Error at step [${step}]:`, error);
    
    // Respuesta de error detallada
    return new Response(
      JSON.stringify({ 
        response: `Erro no processamento (${step}). Por favor, tente novamente.`,
        error: error.message,
        analysis: null,
        debug: {
          step,
          error: error.message
        }
      }),
      { status: 200, headers }
    );
  }
}
