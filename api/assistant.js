// api/assistant.js

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
      description: 'Solução estándar de alta eficiência'
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
• Caixas processadas/mês: ${Math.round(opportunity.value / 100).toLocaleString()}
• Caixas violadas/mês: ${losses.violatedBoxes.toLocaleString()}
• Perda mensal: R$ ${losses.totalMonthlyLoss.toLocaleString()}
• Perda anual: R$ ${(losses.totalMonthlyLoss * 12).toLocaleString()}

🎯 **SOLUÇÃO RECOMENDADA:**
• Equipamento: ${solution.implementation.equipment}
• Consumível: ${solution.implementation.tape}
• Estações: ${solution.implementation.stations}
• Investimento: R$ ${solution.investment.toLocaleString()}

✅ **RESULTADOS PROJETADOS:**
• Redução violações: 95% (garantido ou devolvemos)
• Melhoria eficiência: +40%
• Economia mensal: R$ ${savings.totalMonthlySavings.toLocaleString()}
• Economia anual: R$ ${savings.annualSavings.toLocaleString()}
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
• Cada mês sem decidir = R$ ${losses.totalMonthlyLoss.toLocaleString()} perdidos
• Em 3 meses = R$ ${(losses.totalMonthlyLoss * 3).toLocaleString()} no lixo
• Em 6 meses = R$ ${(losses.totalMonthlyLoss * 6).toLocaleString()} desperdiçados

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
        reason: `💣 R$${opp.value.toLocaleString()} com score ${healthScore.toFixed(1)}/10`,
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
  
  // Métricas de la semana con datos reales
  const totalPipeline = opportunities.reduce((sum, opp) => sum + opp.value, 0);
  const totalClosing = closing.reduce((sum, opp) => sum + opp.value, 0);
  const totalAtRisk = atRisk.reduce((sum, opp) => sum + opp.value, 0);
  
  plan += `**📊 MÉTRICAS DA SEMANA:**\n`;
  plan += `• Pipeline Total: R$ ${totalPipeline.toLocaleString('pt-BR')}\n`;
  plan += `• Para Fechar: R$ ${totalClosing.toLocaleString('pt-BR')}\n`;
  plan += `• Em Risco: R$ ${totalAtRisk.toLocaleString('pt-BR')}\n\n`;
  
  plan += `**💡 CONTEXTO BRASIL (dados reais):**\n`;
  plan += `• 10% das mercadorias são perdidas por violação (IBEVAR)\n`;
  plan += `• 80% das avarias são por embalagem inadequada\n`;
  plan += `• ROI médio Ventapel: 2-3 meses comprovado\n\n`;
  
  // LUNES - Reactivación y emergencias
  plan += `**📅 SEGUNDA-FEIRA - Reativação e Emergências**\n`;
  if (urgent.length > 0) {
    urgent.slice(0, 3).forEach(opp => {
      const roiCalc = calculateVentapelROI(opp);
      plan += `🔴 **${opp.client}** (R$ ${opp.value.toLocaleString()})\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n`;
      plan += `   Script: "Descobri que empresas como vocês perdem ${(roiCalc.benchmark.violationRate * 100).toFixed(0)}% em violação. `;
      plan += `Com nossa solução, economia de R$${roiCalc.projectedSavings.totalMonthlySavings.toLocaleString()}/mês garantida."\n`;
      plan += `   [Atualizar DOR|update:dor:7:${opp.id}] `;
      plan += `   [Agendar reunião|schedule:meeting:${opp.id}]\n\n`;
    });
  } else {
    plan += `✅ Sem emergências - focar em prospecção\n\n`;
  }
  
  // MARTES - Corregir inconsistencias
  plan += `**📅 TERÇA-FEIRA - Corrigir Problemas PPVVC**\n`;
  if (critical.length > 0) {
    critical.slice(0, 3).forEach(opp => {
      plan += `⚠️ **${opp.client}** - Etapa ${opp.stage}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n`;
      
      const painValue = getScaleValue(opp.scales?.dor);
      const powerValue = getScaleValue(opp.scales?.poder);
      
      if (painValue < 5) {
        plan += `   Pergunta SPIN: "Vocês sabem que ${opp.industry || 'o mercado'} perde 10% em violação? Quanto isso representa para vocês?"\n`;
        plan += `   [Confirmar DOR|update:dor:7:${opp.id}]\n`;
      }
      if (powerValue < 4) {
        plan += `   Script: "Para garantir o ROI de 3 meses, preciso falar com quem aprova investimentos em logística."\n`;
        plan += `   [Acessar PODER|update:poder:5:${opp.id}]\n`;
      }
      plan += `\n`;
    });
  } else {
    plan += `✅ PPVVC alinhado em todas as oportunidades\n\n`;
  }
  
  // MIÉRCOLES - Deals en riesgo  
  plan += `**📅 QUARTA-FEIRA - Resgatar Deals em Risco**\n`;
  if (atRisk.length > 0) {
    atRisk.slice(0, 2).forEach(opp => {
      const roiCalc = calculateVentapelROI(opp);
      plan += `💣 **${opp.client}** - R$ ${opp.value.toLocaleString()}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n`;
      plan += `   📝 Script: "Vi que ${opp.industry || 'empresas similares'} perdem ${(roiCalc.benchmark.violationRate * 100).toFixed(0)}% em violação. `;
      plan += `L'Oréal eliminou 100% dos furtos com nossa solução. Posso mostrar como?"\n`;
      plan += `   [Agendar demo L'Oréal|demo:loreal:${opp.id}]\n\n`;
    });
  } else {
    plan += `✅ Sem deals em risco alto\n\n`;
  }
  
  // JUEVES - Avanzar negociaciones
  plan += `**📅 QUINTA-FEIRA - Fechar Negócios**\n`;
  if (closing.length > 0) {
    closing.forEach(opp => {
      const roiCalc = calculateVentapelROI(opp);
      plan += `💰 **${opp.client}** - R$ ${opp.value.toLocaleString()}\n`;
      plan += `   ${opp.reason}\n`;
      plan += `   ➤ ${opp.action}\n`;
      plan += `   Argumento final: "Com investimento de R$${roiCalc.ventapelSolution.investment.toLocaleString()}, `;
      plan += `ROI em ${roiCalc.roi.paybackMonths} meses. Cada mês sem decidir = R$${roiCalc.currentLosses.totalMonthlyLoss.toLocaleString()} perdidos."\n`;
      
      const controlValue = getScaleValue(opp.scales?.controle);
      const comprasValue = getScaleValue(opp.scales?.compras);
      
      if (controlValue < 7) {
        plan += `   ⚠️ CONTROLE baixo (${controlValue}/10) - Definir próximos passos\n`;
        plan += `   [Atualizar CONTROLE|update:controle:8:${opp.id}]\n`;
      }
      if (comprasValue < 6) {
        plan += `   ⚠️ COMPRAS não mapeado (${comprasValue}/10)\n`;
        plan += `   [Mapear processo|update:compras:7:${opp.id}]\n`;
      }
      plan += `\n`;
    });
  } else {
    plan += `⚠️ Nenhum fechamento previsto - PROBLEMA!\n\n`;
  }
  
  // VIERNES - Follow ups y prospección
  plan += `**📅 SEXTA-FEIRA - Follow-ups e Prospecção**\n`;
  if (followUp.length > 0) {
    plan += `📧 Follow-ups necessários:\n`;
    followUp.slice(0, 5).forEach(opp => {
      plan += `• **${opp.client}** - ${opp.reason}\n`;
    });
  }
  plan += `\n🎯 Meta de prospecção: 20 calls novos\n`;
  plan += `   Foco: E-commerce (10% violação - maior problema Brasil)\n`;
  plan += `   Script abertura: "Vocês sabem que o e-commerce brasileiro perde R$3 bilhões/ano em fraudes e violação?"\n\n`;
  
  // Acciones rápidas generales
  plan += `**⚡ AÇÕES RÁPIDAS DA SEMANA:**\n`;
  plan += `[📊 Calcular ROI todos deals|action:calculate_all_roi]\n`;
  plan += `[📧 Gerar emails da semana|action:generate_emails]\n`;
  plan += `[🎯 Atualizar todas PPVVC|action:update_all_ppvvc]\n`;
  plan += `[📈 Relatório para Tomás|action:weekly_report]\n\n`;
  
  // Recordatorios basados en datos reales
  plan += `**💡 ARGUMENTOS COM DADOS REAIS BRASIL:**\n`;
  plan += `• "10% de perdas por violação é a média Brasil (IBEVAR)"\n`;
  plan += `• "80% das avarias são por embalagem inadequada"\n`;
  plan += `• "E-commerce perde R$3 bilhões/ano em fraudes e violação"\n`;
  plan += `• "L'Oréal, Nike, MercadoLibre já eliminaram esse problema"\n`;
  plan += `• "ROI garantido em 3 meses ou devolvemos seu dinheiro"\n`;
  
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

function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  const last = new Date(lastUpdate);
  const now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// ============= DETECTAR INTENCIÓN DE ACTUALIZACIÓN =============
function detectUpdateIntent(context) {
  const lowerContext = context.toLowerCase();
  const intentKeywords = ['atualizar', 'mudar', 'subir', 'aumentar', 'agora é', 'confirmado'];
  
  if (!intentKeywords.some(kw => lowerContext.includes(kw))) {
    return null;
  }

  const scaleKeywords = {
    dor: ['dor', 'pain'],
    poder: ['poder', 'power'],
    visao: ['visão', 'vision', 'visao'],
    valor: ['valor', 'value'],
    controle: ['controle', 'control'],
    compras: ['compras', 'purchase']
  };

  let foundScale = null;
  for (const scale in scaleKeywords) {
    if (scaleKeywords[scale].some(kw => lowerContext.includes(kw))) {
      foundScale = scale;
      break;
    }
  }

  if (!foundScale) return null;

  const valueMatch = lowerContext.match(/(\d{1,2})\s*\/\s*10|\b(\d{1,2})\b(?!.*\b(dias|horas|minutos)\b)/);
  if (!valueMatch) return null;

  const newValue = valueMatch[2] || valueMatch[1];
  
  if (newValue === null || isNaN(parseInt(newValue)) || parseInt(newValue) > 10) return null;

  const clientMatch = lowerContext.match(/(?:em|para|de)\s+([A-Z][A-Za-z0-9\s]+)/);
  const client = clientMatch ? clientMatch[1].trim() : null;

  return {
    scale: foundScale,
    newValue: parseInt(newValue),
    client: client
  };
}

// ============= HANDLER PRINCIPAL =============
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

  const { 
    messages, 
    context, 
    opportunityData, 
    pipelineData, 
    searchContext,
    isNewOpportunity,
    ventapelContext,
    specialRequestType 
  } = req.body;

  // MANEJO DE SOLICITUDES ESPECIALES
  if (specialRequestType === 'weekly_plan' && pipelineData) {
    const weeklyPlan = generateWeeklyPlan(pipelineData.allOpportunities, pipelineData.vendorName);
    return res.status(200).json({ response: weeklyPlan });
  }

  // Manejo de cálculo de ROI
  if (context && context.toLowerCase().includes('roi') && opportunityData) {
    const roiAnalysis = calculateVentapelROI(opportunityData);
    return res.status(200).json({ 
      response: roiAnalysis.summary 
    });
  }

  // Detectar intención de actualización
  const updateIntent = detectUpdateIntent(context);
  if (updateIntent) {
    const confirmationMessage = `Entendido. Detectei uma atualização para **${updateIntent.client || opportunityData?.client}**.
    
    Você quer que eu atualize a escala de **${updateIntent.scale.toUpperCase()}** para **${updateIntent.newValue}/10** no CRM?
    
    [Sim, atualizar agora|update:${updateIntent.scale}:${updateIntent.newValue}:${opportunityData?.id}]
    [Cancelar|cancel]`;
    return res.status(200).json({ response: confirmationMessage });
  }

  // Calcular ROI antes del systemPrompt si hay opportunityData
  let roiAnalysisText = '';
  if (opportunityData) {
    const roiCalc = calculateVentapelROI(opportunityData);
    roiAnalysisText = `
ANÁLISIS ROI ESPECÍFICO para ${opportunityData.client}:
  - Pérdida actual mensual: R$${roiCalc.currentLosses.totalMonthlyLoss.toLocaleString()}
  - Ahorro proyectado mensual: R$${roiCalc.projectedSavings.totalMonthlySavings.toLocaleString()}
  - ROI: ${roiCalc.roi.paybackMonths} meses
  - Solución recomendada: ${roiCalc.ventapelSolution.implementation.equipment}
`;
  }

  // System prompt mejorado con datos reales de Brasil
  const systemPrompt = `
Eres el asesor experto en ventas consultivas de Ventapel Brasil.
Utilizas la metodología PPVVCC (Pain, Power, Vision, Value, Control, Compras) para analizar y mejorar oportunidades.
Respondes directo, sin rodeos, como si fueras el CEO aconsejando al equipo.

DATOS REALES DEL MERCADO BRASIL (2024-2025):
- 10% de las mercaderías son perdidas por violación/robo (fuente: IBEVAR)
- 80% de las averías son por embalaje inadecuado (estudio sectorial)
- E-commerce pierde R$3 mil millones/año en fraudes y violación
- Costos logísticos: 18.4% del PIB Brasil
- 60% del transporte es rodoviário con alta incidencia de robo

BENCHMARKS POR INDUSTRIA (datos reales):
- E-commerce: 10% violación + fraudes (mayor problema Brasil)
- Cosmética: 6-10% violación (alto valor unitario)
- Farmacéutica: 7-10% (regulación ANVISA + cadena fría)
- Logística/3PL: 4-8% (múltiples manipulaciones)
- Automotriz: 3-5% (piezas alto valor)
- Alimentos: 5-8% (temperatura + plazo validez)

CONTEXTO VENTAPEL:
- Solución: Reducción garantizada 95% violación o devolvemos dinero
- Máquinas selladoras: BP555e, BP755, BP333, BP222, RSA (Random Sealer Automated)
- Cintas: VENOM (3-way reinforced water-activated), Gorilla (300m y 700m)
- ROI típico: 2-3 meses COMPROBADO
- Precio promedio: R$45,000 - R$350,000 según volumen

CASOS DE ÉXITO REALES:
- L'Oréal: 100% furtos eliminados, +50% eficiência, ROI 3 meses
- Nike: Furtos zero, +30% eficiência, ROI 2 meses
- MercadoLibre: 40% reducción retrabalho, ahorro R$180k/mes
- Natura: 60% menos violaciones, ahorro R$85k/mes
- Centauro: 95% reducción furtos, economía R$50M/año
- Honda Argentina: +40% velocidad, 100% reducción faltantes

COMPETIDORES Y DIFERENCIADORES:
- 3M: 30% más caro, solo cinta, sin máquinas
- Scotch: Calidad inferior, sin soporte técnico
- Genéricos chinos: 70% más baratos pero sin garantía ni soporte
- NUESTRO DIFERENCIAL: Solución completa (máquina + cinta + soporte) con garantía de reducción 95%

ARGUMENTOS CON DATOS REALES:
- Siempre citar fuentes: IBEVAR, estudios sectoriales, casos reales
- Usar el 10% de pérdida promedio Brasil como baseline
- Mencionar los R$3 bil/año de pérdidas en e-commerce
- Enfatizar que 80% de averías son evitables con embalaje correcto

${roiAnalysisText}

INSTRUCCIONES CRÍTICAS:
1. SIEMPRE usar datos reales: 10% pérdida Brasil, R$3 bil e-commerce, 80% por embalaje
2. NUNCA inventar métricas - usar benchmarks de arriba
3. Calcular ROI con la función calculateVentapelROI para cada oportunidad
4. Citar fuentes: IBEVAR, NTC&Logística, casos L'Oréal/Nike/MercadoLibre
5. Crear urgencia con pérdida acumulada mensual

PREGUNTA DEL USUARIO: ${context}
`;

  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('No se encontró API key de Claude');
      
      // Fallback mejorado con ROI calculator
      if (opportunityData) {
        const roiCalc = calculateVentapelROI(opportunityData);
        return res.status(200).json({ 
          response: roiCalc.summary
        });
      }
      
      return res.status(200).json({ 
        response: '❌ Erro na configuração da API. Entre em contato com suporte.'
      });
    }

    // Llamada a Claude API
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
          { role: 'user', content: context || 'Analiza esta oportunidad con ROI' }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de Claude API:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    
    res.status(200).json({ 
      response: data.content?.[0]?.text || (opportunityData ? calculateVentapelROI(opportunityData).summary : 'Erro ao processar'),
      analysis: opportunityData ? calculateVentapelROI(opportunityData) : null
    });

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    // Fallback con ROI calculator
    if (opportunityData) {
      const roiCalc = calculateVentapelROI(opportunityData);
      return res.status(200).json({ 
        response: roiCalc.summary
      });
    }
    
    res.status(200).json({ 
      response: '❌ Erro temporário. Tente novamente em alguns segundos.'
    });
  }
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
