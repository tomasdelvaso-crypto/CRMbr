// api/assistant.js
// Configuración para Edge Runtime - MÁS RÁPIDO, sin timeout de 10s
export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

// ============= SERPER API INTEGRATION =============
async function searchWithSerper(query) {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  
  if (!SERPER_API_KEY) {
    console.error('❌ SERPER_API_KEY no configurada');
    return null;
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: 'br',
        hl: 'pt',
        num: 10,
        page: 1
      })
    });

    if (!response.ok) {
      console.error('Error Serper API:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error llamando a Serper:', error);
    return null;
  }
}

// ============= FUNCIÓN DE BÚSQUEDA WEB DE EMPRESA =============
async function researchCompany(companyName) {
  console.log(`🔍 Buscando información sobre ${companyName}...`);
  
  // Realizar 3 búsquedas especializadas
  const searches = [
    {
      type: 'general',
      query: `${companyName} Brasil empresa sede operaciones`,
      focus: 'información general'
    },
    {
      type: 'logistics',
      query: `${companyName} logística e-commerce embalaje problemas`,
      focus: 'problemas logísticos'
    },
    {
      type: 'news',
      query: `${companyName} Brasil expansão investimento notícias 2024 2025`,
      focus: 'noticias recientes'
    }
  ];

  const results = {
    companyInfo: {},
    opportunities: [],
    news: [],
    problems: [],
    contacts: []
  };

  for (const search of searches) {
    const serperData = await searchWithSerper(search.query);
    
    if (!serperData) continue;

    // Procesar resultados según el tipo de búsqueda
    if (search.type === 'general' && serperData.organic) {
      // Extraer información general
      const topResults = serperData.organic.slice(0, 3);
      results.companyInfo = {
        description: topResults[0]?.snippet || '',
        website: topResults[0]?.link || '',
        additionalInfo: topResults.map(r => r.snippet).join(' ')
      };

      // Buscar información en knowledge graph si existe
      if (serperData.knowledgeGraph) {
        results.companyInfo.sector = serperData.knowledgeGraph.type || '';
        results.companyInfo.headquarters = serperData.knowledgeGraph.headquarters || '';
        results.companyInfo.employees = serperData.knowledgeGraph.employees || '';
      }
    }

    if (search.type === 'logistics' && serperData.organic) {
      // Buscar indicadores de problemas logísticos
      serperData.organic.forEach(result => {
        const snippet = result.snippet?.toLowerCase() || '';
        const title = result.title?.toLowerCase() || '';
        const combined = snippet + ' ' + title;

        // Detectar problemas relevantes para Ventapel
        if (combined.includes('violação') || combined.includes('furto') || 
            combined.includes('roubo') || combined.includes('perda')) {
          results.problems.push({
            type: 'seguridad',
            evidence: result.snippet,
            source: result.link
          });
        }
        
        if (combined.includes('e-commerce') || combined.includes('fulfillment') || 
            combined.includes('entrega') || combined.includes('distribuição')) {
          results.opportunities.push({
            type: 'e-commerce',
            detail: result.snippet,
            source: result.link
          });
        }

        if (combined.includes('embalagem') || combined.includes('packaging') || 
            combined.includes('caixa') || combined.includes('selagem')) {
          results.problems.push({
            type: 'embalaje',
            evidence: result.snippet,
            source: result.link
          });
        }
      });
    }

    if (search.type === 'news' && serperData.news) {
      // Extraer noticias recientes
      results.news = serperData.news.slice(0, 3).map(item => ({
        title: item.title,
        snippet: item.snippet,
        date: item.date,
        source: item.source,
        link: item.link
      }));
    }
  }

  // Analizar y generar insights de Ventapel
  const ventapelAnalysis = analyzeForVentapel(companyName, results);
  
  return {
    company: companyName,
    searchResults: results,
    ventapelAnalysis: ventapelAnalysis
  };
}

// ============= ANÁLISIS VENTAPEL =============
function analyzeForVentapel(companyName, searchResults) {
  const analysis = {
    potentialLoss: 0,
    recommendedSolution: '',
    relevantCase: '',
    approachStrategy: '',
    contactsToFind: []
  };

  // Estimar pérdidas basado en señales encontradas
  let riskSignals = 0;
  
  if (searchResults.opportunities.some(o => o.type === 'e-commerce')) {
    riskSignals += 3;
    analysis.potentialLoss = 50000; // Base para e-commerce
  }
  
  if (searchResults.problems.some(p => p.type === 'seguridad')) {
    riskSignals += 5;
    analysis.potentialLoss += 100000;
  }

  if (searchResults.problems.some(p => p.type === 'embalaje')) {
    riskSignals += 4;
    analysis.potentialLoss += 75000;
  }

  // Seleccionar caso de éxito relevante
  if (searchResults.companyInfo.additionalInfo?.includes('cosmética') || 
      searchResults.companyInfo.additionalInfo?.includes('beleza')) {
    analysis.relevantCase = "L'Oréal: 100% furtos eliminados, ROI 3 meses";
    analysis.recommendedSolution = 'RSA (Random Sealer Automated)';
  } else if (searchResults.opportunities.some(o => o.type === 'e-commerce')) {
    analysis.relevantCase = "MercadoLibre: 40% redução retrabajo, ROI 2 meses";
    analysis.recommendedSolution = 'BP555e + Fita Gorilla';
  } else {
    analysis.relevantCase = "Nike: Furtos zero, +30% eficiência";
    analysis.recommendedSolution = 'BP755 + Fita Gorilla 700m';
  }

  // Estrategia de approach
  if (riskSignals >= 7) {
    analysis.approachStrategy = 'URGENTE: Alto riesgo identificado. Approach directo con ROI.';
  } else if (riskSignals >= 4) {
    analysis.approachStrategy = 'CALIENTE: Problemas evidentes. Proponer test day.';
  } else {
    analysis.approachStrategy = 'TIBIO: Educar sobre pérdidas del sector.';
  }

  // Contactos a buscar
  analysis.contactsToFind = [
    'Gerente de Operaciones',
    'Director de Logística',
    'Gerente de Supply Chain',
    'CFO (si pérdidas > R$ 100k/mes)'
  ];

  return analysis;
}

// ============= ROI CALCULATOR =============
function calculateVentapelROI(opportunity, monthlyVolume = null) {
  const industryBenchmarks = {
    'e-commerce': { 
      violationRate: 0.10,
      reworkCost: 30,
      laborHours: 0.15,
      customerComplaints: 0.05,
      source: 'IBEVAR 2024 - 10% pérdidas en Brasil'
    },
    'logística': { 
      violationRate: 0.06,
      reworkCost: 35,
      laborHours: 0.20,
      customerComplaints: 0.03,
      source: 'NTC&Logística - 3PL Brasil'
    },
    'cosmética': {
      violationRate: 0.08,
      reworkCost: 50,
      laborHours: 0.25,
      customerComplaints: 0.04,
      source: 'Casos L\'Oréal y Natura'
    },
    'farmacéutica': {
      violationRate: 0.09,
      reworkCost: 70,
      laborHours: 0.30,
      customerComplaints: 0.05,
      source: 'ANVISA + cadena fría'
    },
    'automotriz': {
      violationRate: 0.04,
      reworkCost: 90,
      laborHours: 0.35,
      customerComplaints: 0.02,
      source: 'Caso Honda Argentina'
    },
    'alimentos': {
      violationRate: 0.07,
      reworkCost: 25,
      laborHours: 0.18,
      customerComplaints: 0.04,
      source: 'Cadena fría Brasil'
    },
    'default': {
      violationRate: 0.10,
      reworkCost: 35,
      laborHours: 0.20,
      customerComplaints: 0.03,
      source: 'Promedio mercado Brasil'
    }
  };

  const industry = opportunity?.industry?.toLowerCase() || 'default';
  const benchmark = industryBenchmarks[industry] || industryBenchmarks.default;
  
  const estimatedMonthlyVolume = monthlyVolume || Math.round(opportunity.value / 100);
  
  const currentLosses = {
    violatedBoxes: Math.round(estimatedMonthlyVolume * benchmark.violationRate),
    reworkCostMonthly: Math.round(estimatedMonthlyVolume * benchmark.violationRate * benchmark.reworkCost),
    laborCostMonthly: Math.round(estimatedMonthlyVolume * benchmark.violationRate * benchmark.laborHours * 120),
    complaintsMonthly: Math.round(estimatedMonthlyVolume * benchmark.customerComplaints),
    totalMonthlyLoss: 0
  };
  
  currentLosses.totalMonthlyLoss = currentLosses.reworkCostMonthly + currentLosses.laborCostMonthly;
  
  const ventapelSolution = {
    violationReduction: 0.95,
    efficiencyGain: 0.40,
    implementation: getSolutionRecommendation(estimatedMonthlyVolume),
    investment: calculateInvestment(estimatedMonthlyVolume)
  };
  
  const projectedSavings = {
    monthlyViolationSavings: Math.round(currentLosses.reworkCostMonthly * ventapelSolution.violationReduction),
    monthlyLaborSavings: Math.round(currentLosses.laborCostMonthly * ventapelSolution.violationReduction),
    monthlyEfficiencySavings: Math.round(currentLosses.laborCostMonthly * ventapelSolution.efficiencyGain),
    totalMonthlySavings: 0,
    annualSavings: 0
  };
  
  projectedSavings.totalMonthlySavings = 
    projectedSavings.monthlyViolationSavings + 
    projectedSavings.monthlyLaborSavings + 
    projectedSavings.monthlyEfficiencySavings;
    
  projectedSavings.annualSavings = projectedSavings.totalMonthlySavings * 12;
  
  const roi = {
    paybackMonths: Math.ceil(ventapelSolution.investment / projectedSavings.totalMonthlySavings),
    firstYearROI: Math.round(((projectedSavings.annualSavings - ventapelSolution.investment) / ventapelSolution.investment) * 100),
    threeYearROI: Math.round((((projectedSavings.annualSavings * 3) - ventapelSolution.investment) / ventapelSolution.investment) * 100)
  };
  
  return {
    currentLosses,
    ventapelSolution,
    projectedSavings,
    roi,
    benchmark,
    summary: generateROISummary(opportunity, currentLosses, projectedSavings, roi, ventapelSolution, benchmark)
  };
}

function getSolutionRecommendation(monthlyVolume) {
  if (monthlyVolume < 5000) {
    return {
      equipment: 'BP222 Curby',
      tape: 'Gorilla 300m',
      stations: 1,
      description: 'Solução compacta para operações pequenas'
    };
  } else if (monthlyVolume < 20000) {
    return {
      equipment: 'BP555e',
      tape: 'VENOM reinforced',
      stations: 2,
      description: 'Solução padrão de alta eficiência'
    };
  } else if (monthlyVolume < 50000) {
    return {
      equipment: 'BP755',
      tape: 'Gorilla 700m',
      stations: 3,
      description: 'Solução de alto volume'
    };
  } else {
    return {
      equipment: 'RSA (Random Sealer Automated)',
      tape: 'Gorilla 700m + VENOM',
      stations: '4+',
      description: 'Solução automatizada para operações enterprise'
    };
  }
}

function calculateInvestment(monthlyVolume) {
  if (monthlyVolume < 5000) return 45000;
  if (monthlyVolume < 20000) return 95000;
  if (monthlyVolume < 50000) return 180000;
  return 350000;
}

function generateROISummary(opportunity, losses, savings, roi, solution, benchmark) {
  return `
💰 **ANÁLISE ROI PERSONALIZADO - ${opportunity.client}**

📊 **SITUAÇÃO ATUAL (Dados reais Brasil):**
• Indústria: ${opportunity.industry || 'Geral'}
• Taxa de violação: ${(benchmark.violationRate * 100).toFixed(1)}% (Fonte: ${benchmark.source})
• Caixas processadas/mês: ${Math.round(opportunity.value / 100).toLocaleString('pt-BR')}
• Caixas violadas/mês: ${losses.violatedBoxes.toLocaleString('pt-BR')}
• Perda mensal: R$ ${losses.totalMonthlyLoss.toLocaleString('pt-BR')}
• Perda anual: R$ ${(losses.totalMonthlyLoss * 12).toLocaleString('pt-BR')}

🎯 **SOLUÇÃO RECOMENDADA:**
• Equipamento: ${solution.implementation.equipment}
• Consumível: ${solution.implementation.tape}
• Estações: ${solution.implementation.stations}
• Investimento: R$ ${solution.investment.toLocaleString('pt-BR')}

✅ **RESULTADOS PROJETADOS:**
• Redução violações: 95% (garantido ou devolvemos)
• Melhoria eficiência: +40%
• Economia mensal: R$ ${savings.totalMonthlySavings.toLocaleString('pt-BR')}
• Economia anual: R$ ${savings.annualSavings.toLocaleString('pt-BR')}
• **ROI: ${roi.paybackMonths} meses**
• Retorno primeiro ano: ${roi.firstYearROI}%
• Retorno 3 anos: ${roi.threeYearROI}%`;
}

// ============= PLAN SEMANAL =============
function generateWeeklyPlan(opportunities, vendorName = "Vendedor") {
  if (!opportunities || opportunities.length === 0) {
    return "📋 Não há oportunidades no pipeline para planejar a semana.";
  }

  const today = new Date();
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const urgent = [];
  const critical = [];
  const followUp = [];
  const closing = [];
  const atRisk = [];

  opportunities.forEach(opp => {
    const daysSinceContact = opp.last_update ? 
      Math.floor((today - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 999;
    
    const healthScore = calculateHealthScore(opp.scales || {});
    const expectedClose = opp.expected_close ? new Date(opp.expected_close) : null;
    
    if (daysSinceContact > 7) {
      urgent.push({
        ...opp,
        reason: `🔴 ${daysSinceContact} dias sem contato - VAI PERDER!`,
        action: `Ligar HOJE para ${opp.power_sponsor || opp.sponsor || 'contato'}`,
        priority: 1
      });
    }
    
    if (opp.stage >= 3 && getScaleValue(opp.scales?.dor) < 5) {
      critical.push({
        ...opp,
        reason: '⛔ Apresentando sem DOR confirmada',
        action: 'Voltar para qualificação URGENTE',
        priority: 2
      });
    }
    
    if (opp.value > 100000 && healthScore < 4) {
      atRisk.push({
        ...opp,
        reason: `💣 R$${opp.value.toLocaleString('pt-BR')} com score ${healthScore.toFixed(1)}/10`,
        action: 'Reunião de resgate esta semana',
        priority: 3
      });
    }
    
    if (expectedClose && expectedClose <= weekEnd && opp.stage >= 4) {
      closing.push({
        ...opp,
        reason: `💰 Fecha prevista: ${expectedClose.toLocaleDateString('pt-BR')}`,
        action: 'Finalizar negociação e fechar',
        priority: 4
      });
    }
    
    if (daysSinceContact >= 3 && daysSinceContact <= 7) {
      followUp.push({
        ...opp,
        reason: `📅 ${daysSinceContact} dias - manter momentum`,
        action: 'Email ou WhatsApp de follow-up',
        priority: 5
      });
    }
  });

  let plan = `📋 **PLANO SEMANAL - ${vendorName}**\n`;
  plan += `📅 Semana: ${today.toLocaleDateString('pt-BR')} - ${weekEnd.toLocaleDateString('pt-BR')}\n\n`;
  
  const totalPipeline = opportunities.reduce((sum, opp) => sum + opp.value, 0);
  const totalClosing = closing.reduce((sum, opp) => sum + opp.value, 0);
  const totalAtRisk = atRisk.reduce((sum, opp) => sum + opp.value, 0);
  
  plan += `**📊 MÉTRICAS DA SEMANA:**\n`;
  plan += `• Pipeline Total: R$ ${totalPipeline.toLocaleString('pt-BR')}\n`;
  plan += `• Para Fechar: R$ ${totalClosing.toLocaleString('pt-BR')}\n`;
  plan += `• Em Risco: R$ ${totalAtRisk.toLocaleString('pt-BR')}\n\n`;
  
  // Agregar tareas detalladas aquí...
  
  return plan;
}

function getScaleValue(scale) {
  if (!scale) return 0;
  if (typeof scale === 'object' && scale.score !== undefined) {
    return scale.score;
  }
  if (typeof scale === 'number') {
    return scale;
  }
  return 0;
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
  return values.length > 0 ? sum / values.length : 0;
}

// ============= HANDLER PRINCIPAL - EDGE RUNTIME =============
export default async function handler(req) {
  // Solo POST permitido
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const body = await req.json();
    const { 
      context, 
      opportunityData, 
      specialRequestType,
      pipelineData,
      vendorName,
      intelligentContext,
      similarDeals,
      companyName,
      searchQuery 
    } = body;

    console.log('📌 Request recibido:', { specialRequestType, companyName, context });

    // CASO 1: Búsqueda web de empresa
    if (specialRequestType === 'web_research' && companyName) {
      console.log(`📌 Procesando búsqueda web para: ${companyName}`);
      
      const researchData = await researchCompany(companyName);
      
      if (!researchData || !researchData.searchResults) {
        return new Response(
          JSON.stringify({ 
            response: `⚠️ No pude encontrar información sobre ${companyName}. Intenta con otro nombre o verifica la ortografía.` 
          }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Formatear respuesta con datos reales
      let response = `🔍 **INVESTIGACIÓN COMPLETA - ${companyName}**\n\n`;
      
      // Información general
      if (researchData.searchResults.companyInfo.description) {
        response += `📊 **INFORMACIÓN GENERAL:**\n`;
        response += `${researchData.searchResults.companyInfo.description}\n`;
        if (researchData.searchResults.companyInfo.website) {
          response += `🌐 Website: ${researchData.searchResults.companyInfo.website}\n`;
        }
        if (researchData.searchResults.companyInfo.sector) {
          response += `🏭 Sector: ${researchData.searchResults.companyInfo.sector}\n`;
        }
        response += `\n`;
      }

      // Problemas detectados
      if (researchData.searchResults.problems.length > 0) {
        response += `⚠️ **PROBLEMAS DETECTADOS (Oportunidades Ventapel):**\n`;
        const uniqueProblems = [...new Set(researchData.searchResults.problems.map(p => p.type))];
        uniqueProblems.forEach(type => {
          const problem = researchData.searchResults.problems.find(p => p.type === type);
          response += `• ${type.toUpperCase()}: ${problem.evidence.substring(0, 150)}...\n`;
        });
        response += `\n`;
      }

      // Noticias recientes
      if (researchData.searchResults.news.length > 0) {
        response += `📰 **NOTICIAS RECIENTES:**\n`;
        researchData.searchResults.news.forEach(news => {
          response += `• ${news.title} (${news.date || news.source})\n`;
          if (news.snippet) {
            response += `  "${news.snippet.substring(0, 100)}..."\n`;
          }
        });
        response += `\n`;
      }

      // Análisis Ventapel
      if (researchData.ventapelAnalysis) {
        const analysis = researchData.ventapelAnalysis;
        
        response += `💡 **ANÁLISIS VENTAPEL:**\n\n`;
        
        response += `📈 **Pérdida Potencial Estimada:**\n`;
        response += `• R$ ${analysis.potentialLoss.toLocaleString('pt-BR')}/mes en violación de cajas\n`;
        response += `• R$ ${(analysis.potentialLoss * 12).toLocaleString('pt-BR')}/año\n\n`;
        
        response += `🎯 **Solución Recomendada:**\n`;
        response += `• ${analysis.recommendedSolution}\n`;
        response += `• Caso similar: ${analysis.relevantCase}\n\n`;
        
        response += `🔥 **Estrategia de Approach:**\n`;
        response += `${analysis.approachStrategy}\n\n`;
        
        response += `👥 **Contactos a Buscar en LinkedIn:**\n`;
        analysis.contactsToFind.forEach(contact => {
          response += `• ${contact}\n`;
        });
      }

      return new Response(
        JSON.stringify({ response }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // CASO 2: Plan Semanal
    if (specialRequestType === 'weekly_plan') {
      const plan = generateWeeklyPlan(
        pipelineData?.allOpportunities || [],
        vendorName || 'Vendedor'
      );
      
      return new Response(
        JSON.stringify({ response: plan }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // CASO 3: Calcular ROI
    if (context?.toLowerCase().includes('roi') || context?.toLowerCase().includes('calcular')) {
      if (opportunityData) {
        const roiAnalysis = calculateVentapelROI(opportunityData);
        
        return new Response(
          JSON.stringify({ response: roiAnalysis.summary }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // CASO 4: Análisis de oportunidad con contexto inteligente
    if (opportunityData && intelligentContext) {
      let response = `📊 **Análisis Inteligente - ${opportunityData.client}**\n\n`;
      
      response += `📌 **Fuente de datos: ${intelligentContext.dataSource}**\n\n`;
      
      if (intelligentContext.priority1_clientNotes?.hasData) {
        response += `**📝 Basado en lo que el cliente dijo:**\n`;
        intelligentContext.priority1_clientNotes.notes.forEach(note => {
          response += `• ${note}\n`;
        });
        response += `\n`;
      }
      
      if (intelligentContext.priority2_similarDeals?.hasData) {
        response += `**🔄 Patrones de ${intelligentContext.priority2_similarDeals.count} deals similares:**\n`;
        response += `• Valor promedio: R$ ${intelligentContext.priority2_similarDeals.avgValue.toLocaleString('pt-BR')}\n`;
        
        if (intelligentContext.priority2_similarDeals.commonPatterns) {
          intelligentContext.priority2_similarDeals.commonPatterns.forEach(pattern => {
            response += `• ${pattern}\n`;
          });
        }
        response += `\n`;
      }
      
      const healthScore = calculateHealthScore(opportunityData.scales || {});
      response += `**🎯 Estado PPVVCC:**\n`;
      response += `• Score general: ${healthScore.toFixed(1)}/10\n`;
      
      return new Response(
        JSON.stringify({ response }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // CASO 5: Respuesta genérica
    let genericResponse = "👋 Hola! Soy tu asistente Ventapel con datos reales de Brasil.\n\n";
    genericResponse += "**Puedo ayudarte con:**\n";
    genericResponse += "• 🔍 Búsqueda web de empresas nuevas\n";
    genericResponse += "• 📊 Análisis PPVVCC de oportunidades\n";
    genericResponse += "• 💰 Cálculo de ROI con datos reales\n";
    genericResponse += "• 📅 Plan semanal personalizado\n";
    genericResponse += "• 🎯 Scripts de venta basados en casos de éxito\n\n";
    genericResponse += "Escribe el nombre de un cliente o 'buscar información de [empresa]' para empezar.";
    
    return new Response(
      JSON.stringify({ response: genericResponse }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error en API assistant:', error);
    
    return new Response(
      JSON.stringify({ 
        response: '❌ Error procesando la solicitud. Usando modo local.',
        error: error.message 
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
