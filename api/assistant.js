// api/assistant.js
// Configuración para Edge Runtime - MÁS RÁPIDO, sin timeout de 10s
export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

// ============= ROI CALCULATOR INTEGRADO CON DATOS REALES BRASIL =============
function calculateVentapelROI(opportunity, monthlyVolume = null) {
  // Benchmarks reales basados en datos de Brasil 2024-2025
  const industryBenchmarks = {
    'e-commerce': { 
      violationRate: 0.10, // 10% según IBEVAR
      reworkCost: 30, // R$ por caja
      laborHours: 0.15, // horas por reempaque
      customerComplaints: 0.05, // 5% de reclamaciones
      source: 'IBEVAR 2024 - 10% pérdidas en Brasil'
    },
    'logística': { 
      violationRate: 0.06, // 6% múltiples manipulaciones
      reworkCost: 35,
      laborHours: 0.20,
      customerComplaints: 0.03,
      source: 'NTC&Logística - 3PL Brasil'
    },
    'cosmética': {
      violationRate: 0.08, // 8% por alto valor
      reworkCost: 50,
      laborHours: 0.25,
      customerComplaints: 0.04,
      source: 'Casos L\'Oréal y Natura'
    },
    'farmacéutica': {
      violationRate: 0.09, // 9% regulación + temperatura
      reworkCost: 70,
      laborHours: 0.30,
      customerComplaints: 0.05,
      source: 'ANVISA + cadena fría'
    },
    'automotriz': {
      violationRate: 0.04, // 4% piezas alto valor
      reworkCost: 90,
      laborHours: 0.35,
      customerComplaints: 0.02,
      source: 'Caso Honda Argentina'
    },
    'alimentos': {
      violationRate: 0.07, // 7% temperatura + plazo
      reworkCost: 25,
      laborHours: 0.18,
      customerComplaints: 0.04,
      source: 'Cadena fría Brasil'
    },
    'default': {
      violationRate: 0.10, // 10% promedio Brasil IBEVAR
      reworkCost: 35,
      laborHours: 0.20,
      customerComplaints: 0.03,
      source: 'Promedio mercado Brasil'
    }
  };

  // Obtener benchmark de la industria
  const industry = opportunity?.industry?.toLowerCase() || 'default';
  const benchmark = industryBenchmarks[industry] || industryBenchmarks.default;
  
  // Estimar volumen mensual si no se proporciona
  const estimatedMonthlyVolume = monthlyVolume || Math.round(opportunity.value / 100);
  
  // Cálculos de pérdidas actuales
  const currentLosses = {
    violatedBoxes: Math.round(estimatedMonthlyVolume * benchmark.violationRate),
    reworkCostMonthly: Math.round(estimatedMonthlyVolume * benchmark.violationRate * benchmark.reworkCost),
    laborCostMonthly: Math.round(estimatedMonthlyVolume * benchmark.violationRate * benchmark.laborHours * 120), // R$120/hora promedio
    complaintsMonthly: Math.round(estimatedMonthlyVolume * benchmark.customerComplaints),
    totalMonthlyLoss: 0
  };
  
  currentLosses.totalMonthlyLoss = currentLosses.reworkCostMonthly + currentLosses.laborCostMonthly;
  
  // Solución Ventapel - basado en casos reales
  const ventapelSolution = {
    violationReduction: 0.95, // 95% reducción (conservador vs 100% de L'Oréal)
    efficiencyGain: 0.40, // 40% mejora en productividad (promedio casos)
    implementation: getSolutionRecommendation(estimatedMonthlyVolume),
    investment: calculateInvestment(estimatedMonthlyVolume)
  };
  
  // Ahorros proyectados
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
  
  // ROI Calculation
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

// Función para recomendar solución basada en volumen
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

// Calcular inversión basada en volumen
function calculateInvestment(monthlyVolume) {
  if (monthlyVolume < 5000) return 45000;
  if (monthlyVolume < 20000) return 95000;
  if (monthlyVolume < 50000) return 180000;
  return 350000;
}

// Generar resumen ejecutivo del ROI
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
• Retorno 3 anos: ${roi.threeYearROI}%

🏆 **CASOS DE SUCESSO SIMILARES:**
${opportunity.industry?.toLowerCase().includes('cosm') ? 
  '• L\'Oréal: 100% furtos eliminados, ROI 3 meses' :
  opportunity.industry?.toLowerCase().includes('commerce') ?
  '• MercadoLibre: 40% redução retrabalho, ROI 2 meses' :
  opportunity.industry?.toLowerCase().includes('auto') ?
  '• Honda Argentina: +40% velocidade, 100% redução faltantes' :
  '• Nike: Furtos zero, +30% eficiência, ROI 2 meses'}

⚡ **URGÊNCIA - PERDA ACUMULADA:**
• Cada mês sem decidir = R$ ${losses.totalMonthlyLoss.toLocaleString('pt-BR')} perdidos
• Em 3 meses = R$ ${(losses.totalMonthlyLoss * 3).toLocaleString('pt-BR')} no lixo
• Em 6 meses = R$ ${(losses.totalMonthlyLoss * 6).toLocaleString('pt-BR')} desperdiçados

💡 **DADO CRÍTICO:** 80% das avarias no Brasil são por embalagem inadequada (fonte: estudo setorial 2024)`;
}

// ============= PLAN SEMANAL MEJORADO =============
function generateWeeklyPlan(opportunities, vendorName = "Vendedor") {
  if (!opportunities || opportunities.length === 0) {
    return "📋 Não há oportunidades no pipeline para planejar a semana.";
  }

  const today = new Date();
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Categorizar oportunidades
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
    
    // URGENTE: Sin contacto > 7 días
    if (daysSinceContact > 7) {
      urgent.push({
        ...opp,
        reason: `🔴 ${daysSinceContact} dias sem contato - VAI PERDER!`,
        action: `Ligar HOJE para ${opp.power_sponsor || opp.sponsor || 'contato'}`,
        priority: 1
      });
    }
    
    // CRÍTICO: Inconsistencias PPVVCC graves
    if (opp.stage >= 3 && getScaleValue(opp.scales?.dor) < 5) {
      critical.push({
        ...opp,
        reason: '⛔ Apresentando sem DOR confirmada',
        action: 'Voltar para qualificação URGENTE',
        priority: 2
      });
    }
    
    // EN RIESGO: Deals grandes con score bajo
    if (opp.value > 100000 && healthScore < 4) {
      atRisk.push({
        ...opp,
        reason: `💣 R$${opp.value.toLocaleString('pt-BR')} com score ${healthScore.toFixed(1)}/10`,
        action: 'Reunião de resgate esta semana',
        priority: 3
      });
    }
    
    // CLOSING: Expected close esta semana
    if (expectedClose && expectedClose <= weekEnd && opp.stage >= 4) {
      closing.push({
        ...opp,
        reason: `💰 Fecha prevista: ${expectedClose.toLocaleDateString('pt-BR')}`,
        action: 'Finalizar negociação e fechar',
        priority: 4
      });
    }
    
    // FOLLOW UP: Necesita acción regular
    if (daysSinceContact >= 3 && daysSinceContact <= 7) {
      followUp.push({
        ...opp,
        reason: `📅 ${daysSinceContact} dias - manter momentum`,
        action: 'Email ou WhatsApp de follow-up',
        priority: 5
      });
    }
  });

  // Construir el plan estructurado
  let plan = `📋 **PLANO SEMANAL - ${vendorName}**\n`;
  plan += `📅 Semana: ${today.toLocaleDateString('pt-BR')} - ${weekEnd.toLocaleDateString('pt-BR')}\n\n`;
  
  // Métricas de la semana
  const totalPipeline = opportunities.reduce((sum, opp) => sum + opp.value, 0);
  const totalClosing = closing.reduce((sum, opp) => sum + opp.value, 0);
  const totalAtRisk = atRisk.reduce((sum, opp) => sum + opp.value, 0);
  
  plan += `**📊 MÉTRICAS DA SEMANA:**\n`;
  plan += `• Pipeline Total: R$ ${totalPipeline.toLocaleString('pt-BR')}\n`;
  plan += `• Para Fechar: R$ ${totalClosing.toLocaleString('pt-BR')}\n`;
  plan += `• Em Risco: R$ ${totalAtRisk.toLocaleString('pt-BR')}\n\n`;
  
  // Plan día por día
  plan += `**📅 SEGUNDA-FEIRA - Reativação e Emergências**\n`;
  if (urgent.length > 0) {
    urgent.slice(0, 3).forEach(opp => {
      plan += `🔴 **${opp.client}** (R$ ${opp.value.toLocaleString('pt-BR')})\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n\n`;
    });
  } else {
    plan += `✅ Sem emergências - focar em prospecção\n\n`;
  }
  
  plan += `**📅 TERÇA-FEIRA - Corrigir Problemas PPVVCC**\n`;
  if (critical.length > 0) {
    critical.slice(0, 3).forEach(opp => {
      plan += `⚠️ **${opp.client}** - Etapa ${opp.stage}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n\n`;
    });
  } else {
    plan += `✅ PPVVCC alinhado em todas as oportunidades\n\n`;
  }
  
  plan += `**📅 QUARTA-FEIRA - Resgatar Deals em Risco**\n`;
  if (atRisk.length > 0) {
    atRisk.slice(0, 2).forEach(opp => {
      plan += `💣 **${opp.client}** - R$ ${opp.value.toLocaleString('pt-BR')}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n\n`;
    });
  } else {
    plan += `✅ Sem deals em risco alto\n\n`;
  }
  
  plan += `**📅 QUINTA-FEIRA - Fechar Negócios**\n`;
  if (closing.length > 0) {
    closing.forEach(opp => {
      plan += `💰 **${opp.client}** - R$ ${opp.value.toLocaleString('pt-BR')}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n\n`;
    });
  } else {
    plan += `⚠️ Nenhum fechamento previsto - PROBLEMA!\n\n`;
  }
  
  plan += `**📅 SEXTA-FEIRA - Follow-ups e Prospecção**\n`;
  if (followUp.length > 0) {
    plan += `📧 Follow-ups necessários:\n`;
    followUp.slice(0, 5).forEach(opp => {
      plan += `• **${opp.client}** - ${opp.reason}\n`;
    });
  }
  plan += `\n🎯 Meta de prospecção: 20 calls novos\n`;
  plan += `   Foco: E-commerce (10% violação - maior problema Brasil)\n\n`;
  
  return plan;
}

// ============= FUNCIONES HELPER =============
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
      similarDeals 
    } = body;

    // CASO 1: Plan Semanal
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

    // CASO 2: Calcular ROI
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

    // CASO 3: Análisis de oportunidad con contexto inteligente
    if (opportunityData && intelligentContext) {
      let response = `📊 **Análisis Inteligente - ${opportunityData.client}**\n\n`;
      
      // Mostrar fuente de datos
      response += `📌 **Fuente de datos: ${intelligentContext.dataSource}**\n\n`;
      
      // Si hay notas del cliente (prioridad 1)
      if (intelligentContext.priority1_clientNotes?.hasData) {
        response += `**📝 Basado en lo que el cliente dijo:**\n`;
        intelligentContext.priority1_clientNotes.notes.forEach(note => {
          response += `• ${note}\n`;
        });
        response += `\n`;
      }
      
      // Si hay deals similares (prioridad 2)
      if (intelligentContext.priority2_similarDeals?.hasData) {
        response += `**🔄 Patrones de ${intelligentContext.priority2_similarDeals.count} deals similares:**\n`;
        response += `• Valor promedio: R$ ${intelligentContext.priority2_similarDeals.avgValue.toLocaleString('pt-BR')}\n`;
        response += `• Tiempo promedio de cierre: ${intelligentContext.priority2_similarDeals.avgCloseTime} días\n`;
        
        if (intelligentContext.priority2_similarDeals.commonPatterns) {
          intelligentContext.priority2_similarDeals.commonPatterns.forEach(pattern => {
            response += `• ${pattern}\n`;
          });
        }
        response += `\n`;
      }
      
      // Análisis PPVVCC
      const healthScore = calculateHealthScore(opportunityData.scales || {});
      response += `**🎯 Estado PPVVCC:**\n`;
      response += `• Score general: ${healthScore.toFixed(1)}/10\n`;
      response += `• DOR: ${getScaleValue(opportunityData.scales?.dor)}/10\n`;
      response += `• PODER: ${getScaleValue(opportunityData.scales?.poder)}/10\n`;
      response += `• VISÃO: ${getScaleValue(opportunityData.scales?.visao)}/10\n`;
      response += `• VALOR: ${getScaleValue(opportunityData.scales?.valor)}/10\n`;
      response += `• CONTROLE: ${getScaleValue(opportunityData.scales?.controle)}/10\n`;
      response += `• COMPRAS: ${getScaleValue(opportunityData.scales?.compras)}/10\n\n`;
      
      // Generar recomendación
      response += `**➡️ Próxima acción recomendada:**\n`;
      
      const dorScore = getScaleValue(opportunityData.scales?.dor);
      const poderScore = getScaleValue(opportunityData.scales?.poder);
      
      if (dorScore < 5) {
        response += `🎯 **Hacer que el cliente ADMITA el problema**\n`;
        response += `Script: "¿Sabían que empresas como ustedes pierden ${(0.10 * 100).toFixed(0)}% en violación de cajas? `;
        response += `¿Cuánto les está costando esto mensualmente?"\n`;
      } else if (poderScore < 4) {
        response += `👔 **Acceder al DECISOR**\n`;
        response += `Script: "Para garantizar el ROI de 3 meses que calculamos, necesito validar con quien aprueba inversiones. `;
        response += `¿Podemos incluirlo en la próxima reunión?"\n`;
      } else {
        response += `💰 **Presentar ROI y cerrar**\n`;
        const roiCalc = calculateVentapelROI(opportunityData);
        response += `Script: "Con una inversión de R$ ${roiCalc.ventapelSolution.investment.toLocaleString('pt-BR')}, `;
        response += `ahorran R$ ${roiCalc.projectedSavings.totalMonthlySavings.toLocaleString('pt-BR')}/mes. `;
        response += `ROI garantizado en ${roiCalc.roi.paybackMonths} meses. ¿Cuándo podemos empezar?"\n`;
      }
      
      return new Response(
        JSON.stringify({ response }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // CASO 4: Respuesta genérica
    let genericResponse = "👋 Hola! Soy tu asistente Ventapel con datos reales de Brasil.\n\n";
    genericResponse += "**Puedo ayudarte con:**\n";
    genericResponse += "• 📊 Análisis PPVVCC de oportunidades\n";
    genericResponse += "• 💰 Cálculo de ROI con datos reales\n";
    genericResponse += "• 📅 Plan semanal personalizado\n";
    genericResponse += "• 🔍 Búsqueda de deals similares\n";
    genericResponse += "• 🎯 Scripts de venta basados en casos de éxito\n\n";
    genericResponse += "Escribe el nombre de un cliente para empezar el análisis.";
    
    return new Response(
      JSON.stringify({ response: genericResponse }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error en API assistant:', error);
    
    // Respuesta de error mejorada
    return new Response(
      JSON.stringify({ 
        response: '❌ Error procesando la solicitud. Usando modo local.',
        error: error.message 
      }),
      { 
        status: 200, // Devolvemos 200 para que el frontend pueda manejar el error
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
