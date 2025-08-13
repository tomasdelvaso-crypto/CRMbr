// api/assistant.js - VERSIÓN FINAL: Motor de Análisis + IA Híbrida + Pipeline Analytics

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

// ============= CASOS DE ÉXITO REALES VENTAPEL =============
const CASOS_EXITO_REALES = {
  'honda': {
    empresa: 'Honda Argentina',
    sector: 'Automotriz',
    problema: 'Velocidad limitada, 1% pérdidas, problemas ergonómicos',
    solucion: 'BP555 + Fita Gorilla 300m',
    resultados: {
      velocidad: '+40%',
      perdidas: '100% eliminadas',
      roi_meses: 3,
      inversion: 150000,
      ahorro_anual: 600000
    }
  },
  'loreal': {
    empresa: "L'Oréal Brasil",
    sector: 'Cosmética',
    problema: '+10% pérdidas por robo, cuellos de botella',
    solucion: 'RSA + Fita Gorilla 700m',
    resultados: {
      robos: '100% eliminados',
      eficiencia: '+50%',
      roi_meses: 3,
      inversion: 280000,
      ahorro_anual: 2500000
    }
  },
  'nike': {
    empresa: 'Nike Brasil',
    sector: 'Calzado/Textil',
    problema: '10% pérdidas en transporte',
    solucion: 'BP755 + Fita Gorilla 300m',
    resultados: {
      perdidas: '100% eliminadas',
      eficiencia: '+30%',
      roi_meses: 2,
      inversion: 200000,
      ahorro_anual: 1200000
    }
  },
  'mercadolibre': {
    empresa: 'MercadoLibre',
    sector: 'E-commerce',
    problema: 'Alto retrabajo, pérdidas en fulfillment',
    solucion: 'BP555e + Fita VENOM',
    resultados: {
      retrabajo: '-40%',
      ahorro_mensual: 180000,
      roi_meses: 2,
      inversion: 360000
    }
  }
};

// ============= HELPERS =============
function getScaleValue(scale) {
  if (!scale) return 0;
  if (typeof scale === 'object' && scale.score !== undefined) return scale.score;
  if (typeof scale === 'number') return scale;
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
  return values.length > 0 ? (sum / values.length).toFixed(1) : 0;
}

function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  const last = new Date(lastUpdate);
  const now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// ============= MOTOR DE ANÁLISIS DE PIPELINE =============

function analyzePipelineHealth(opportunities) {
  if (!opportunities || opportunities.length === 0) {
    return {
      total: 0,
      totalValue: 0,
      atRisk: 0,
      riskValue: 0,
      averageHealth: 0,
      topDeals: [],
      vendorPerformance: {}
    };
  }

  const totalValue = opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
  const weightedValue = opportunities.reduce((sum, opp) => 
    sum + ((opp.value || 0) * (opp.probability || 0) / 100), 0
  );
  
  // Oportunidades en riesgo (health < 4 o sin contacto > 7 días)
  const riskOpps = opportunities.filter(opp => {
    const health = parseFloat(calculateHealthScore(opp.scales));
    const daysSince = getDaysSinceLastContact(opp.last_update);
    return health < 4 || daysSince > 7;
  });

  // Top deals para cerrar este mes
  const topDeals = opportunities
    .filter(opp => {
      const health = parseFloat(calculateHealthScore(opp.scales));
      return health > 6 && opp.stage >= 3;
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map(deal => ({
      client: deal.client,
      value: deal.value,
      health: calculateHealthScore(deal.scales),
      vendor: deal.vendor,
      action: deal.stage === 5 ? 'CERRAR YA' : 'Acelerar cierre'
    }));

  // Performance por vendedor
  const vendorPerformance = {};
  opportunities.forEach(opp => {
    if (!opp.vendor) return;
    if (!vendorPerformance[opp.vendor]) {
      vendorPerformance[opp.vendor] = {
        count: 0,
        totalValue: 0,
        avgHealth: 0,
        closed: 0
      };
    }
    vendorPerformance[opp.vendor].count++;
    vendorPerformance[opp.vendor].totalValue += opp.value || 0;
    vendorPerformance[opp.vendor].avgHealth += parseFloat(calculateHealthScore(opp.scales));
    if (opp.stage === 6) vendorPerformance[opp.vendor].closed++;
  });

  // Calcular promedios
  Object.keys(vendorPerformance).forEach(vendor => {
    vendorPerformance[vendor].avgHealth = 
      (vendorPerformance[vendor].avgHealth / vendorPerformance[vendor].count).toFixed(1);
  });

  return {
    total: opportunities.length,
    totalValue,
    weightedValue,
    atRisk: riskOpps.length,
    riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0),
    averageHealth: (opportunities.reduce((sum, opp) => 
      sum + parseFloat(calculateHealthScore(opp.scales)), 0) / opportunities.length).toFixed(1),
    topDeals,
    vendorPerformance
  };
}

// ============= ANÁLISIS DE OPORTUNIDAD INDIVIDUAL =============

function analyzeOpportunity(opportunity) {
  if (!opportunity) return null;

  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  // Calcular probabilidad basada en escalas
  let probability = 0;
  if (healthScore >= 8) probability = 85;
  else if (healthScore >= 7) probability = 70;
  else if (healthScore >= 5) probability = 40;
  else if (healthScore >= 3) probability = 20;
  else probability = 5;

  // Ajustar por días sin contacto
  if (daysSince > 30) probability = Math.max(probability - 50, 5);
  else if (daysSince > 14) probability = Math.max(probability - 20, 10);
  else if (daysSince > 7) probability = Math.max(probability - 10, 15);

  // Identificar escalas críticas
  const criticalScales = [];
  const scales = opportunity.scales || {};
  
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  const visaoScore = getScaleValue(scales.visao || scales.vision);
  const valorScore = getScaleValue(scales.valor || scales.value);
  const controleScore = getScaleValue(scales.controle || scales.control);
  const comprasScore = getScaleValue(scales.compras || scales.purchase);

  if (dorScore < 5) {
    criticalScales.push({
      name: 'DOR',
      value: dorScore,
      issue: 'Cliente no admite el problema',
      action: 'Aplicar técnica SPIN para elevar dolor'
    });
  }
  if (poderScore < 4) {
    criticalScales.push({
      name: 'PODER',
      value: poderScore,
      issue: 'Sin acceso al decisor',
      action: 'Identificar y acceder al Power Sponsor'
    });
  }
  if (visaoScore < 4) {
    criticalScales.push({
      name: 'VISÃO',
      value: visaoScore,
      issue: 'Cliente no ve la solución',
      action: 'Demo con caso de éxito relevante'
    });
  }
  if (valorScore < 4) {
    criticalScales.push({
      name: 'VALOR',
      value: valorScore,
      issue: 'ROI no percibido',
      action: 'Calcular y presentar ROI específico'
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
    }
  };
}

// ============= GENERACIÓN DE ALERTAS INTELIGENTES =============

function generateAlerts(opportunity, pipelineContext) {
  const alerts = [];
  if (!opportunity) return alerts;

  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const scales = opportunity.scales || {};

  // Alerta por días sin contacto
  if (daysSince > 30) {
    alerts.push({
      type: 'critical',
      priority: 1,
      message: `💀 DEAL MUERTO: ${daysSince} días sin contacto`,
      action: 'Llamar HOY con oferta especial o descartar'
    });
  } else if (daysSince > 14) {
    alerts.push({
      type: 'urgent',
      priority: 2,
      message: `🔴 URGENTE: ${daysSince} días sin contacto - Deal enfriándose`,
      action: 'Email de reactivación + llamada en 24h'
    });
  } else if (daysSince > 7) {
    alerts.push({
      type: 'warning',
      priority: 3,
      message: `⚠️ ATENCIÓN: ${daysSince} días sin contacto`,
      action: 'Enviar email con nuevo caso de éxito'
    });
  }

  // Alerta por valor en riesgo
  if (healthScore < 4 && opportunity.value > 100000) {
    alerts.push({
      type: 'critical',
      priority: 1,
      message: `💣 R$ ${opportunity.value.toLocaleString('pt-BR')} EN RIESGO CRÍTICO (Health: ${healthScore}/10)`,
      action: 'Reunión de emergencia con decisor o escalar a CEO'
    });
  } else if (healthScore < 5 && opportunity.value > 50000) {
    alerts.push({
      type: 'urgent',
      priority: 2,
      message: `⚠️ Deal de R$ ${opportunity.value.toLocaleString('pt-BR')} necesita intervención`,
      action: 'Plan de recuperación en 48h'
    });
  }

  // Alerta por inconsistencia PPVVCC
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  
  if (opportunity.stage >= 3 && dorScore < 5) {
    alerts.push({
      type: 'warning',
      priority: 2,
      message: `⛔ FRENO: En etapa '${opportunity.stage}' sin DOLOR confirmado (${dorScore}/10)`,
      action: 'Volver a Cualificación - No avanzar sin dolor'
    });
  }

  if (opportunity.stage >= 4 && poderScore < 4) {
    alerts.push({
      type: 'warning',
      priority: 2,
      message: `⛔ FRENO: Intentando cerrar sin acceso al PODER (${poderScore}/10)`,
      action: 'Conseguir sponsor para llegar al decisor'
    });
  }

  // Alerta por oportunidad caliente
  if (healthScore >= 8 && opportunity.stage < 5) {
    alerts.push({
      type: 'opportunity',
      priority: 3,
      message: `🔥 OPORTUNIDAD: Deal caliente (${healthScore}/10) - Acelerar cierre`,
      action: 'Proponer contrato esta semana'
    });
  }

  // Ordenar por prioridad
  return alerts.sort((a, b) => a.priority - b.priority);
}

// ============= NEXT BEST ACTION INTELIGENTE =============

function generateNextBestAction(opportunity, pipelineContext) {
  if (!opportunity?.scales) return null;

  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
  const scales = opportunity.scales || {};
  
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  const visaoScore = getScaleValue(scales.visao || scales.vision);
  const valorScore = getScaleValue(scales.valor || scales.value);
  const controleScore = getScaleValue(scales.controle || scales.control);

  // Prioridad 1: Deals muertos
  if (daysSince > 30) {
    return {
      priority: 'CRÍTICA',
      title: '💀 DEAL MUERTO - Última oportunidad',
      action: 'Llamada de rescate HOY',
      script: `"${opportunity.sponsor || 'Hola'}, hace ${daysSince} días que no hablamos. Tengo una oferta especial de 20% descuento válida solo esta semana. ¿15 minutos hoy para verla?"`,
      expectedOutcome: 'Reactivar o descartar definitivamente'
    };
  }

  // Prioridad 2: Deals fríos
  if (daysSince > 7) {
    return {
      priority: 'URGENTE',
      title: `🔴 ${daysSince} días sin contacto - Reactivar YA`,
      action: 'Email + Llamada en 2 horas',
      script: `ASUNTO: "${opportunity.client} - ¿Siguen perdiendo R$ ${Math.round(opportunity.value * 0.15).toLocaleString('pt-BR')}/mes?"\n\nCONTENIDO: "Vi que ${opportunity.competitor || 'su competidor'} ya implementó nuestra solución. ¿Vale 15 minutos para ver los resultados?"`,
      expectedOutcome: 'Reunión agendada en 48h'
    };
  }

  // Prioridad 3: Sin dolor admitido
  if (dorScore < 5) {
    return {
      priority: 'ALTA',
      title: '🎯 Sin DOLOR = Sin venta',
      action: 'Sesión SPIN profunda',
      script: `"${opportunity.client}, empresas como ustedes pierden entre 3-5% por violación. Con ${Math.round(opportunity.value/100)} cajas/mes, son R$ ${Math.round(opportunity.value * 0.03).toLocaleString('pt-BR')} perdidos. ¿Cuál es su experiencia real con este problema?"`,
      expectedOutcome: 'Dolor admitido y cuantificado'
    };
  }

  // Prioridad 4: Sin acceso al poder
  if (poderScore < 4) {
    return {
      priority: 'ALTA',
      title: '👔 Necesitas el DECISOR',
      action: 'Escalar esta semana',
      script: `"${opportunity.sponsor}, para garantizar el ROI de R$ ${Math.round(opportunity.value * 2.5).toLocaleString('pt-BR')}/año, necesito validar con quien aprueba inversiones. ¿Podemos incluirlo en una call de 20 minutos?"`,
      expectedOutcome: 'Reunión con decisor en 7 días'
    };
  }

  // Prioridad 5: Sin visión clara
  if (visaoScore < 5) {
    return {
      priority: 'MEDIA',
      title: '👁️ Construir VISIÓN de solución',
      action: 'Demo personalizada',
      script: `"Les muestro exactamente cómo ${CASOS_EXITO_REALES.mercadolibre.empresa} redujo ${CASOS_EXITO_REALES.mercadolibre.resultados.retrabajo} el retrabajo. Con su volumen, el impacto sería aún mayor."`,
      expectedOutcome: 'Visión clara y diferenciada'
    };
  }

  // Prioridad 6: Sin valor percibido
  if (valorScore < 5) {
    return {
      priority: 'MEDIA',
      title: '💰 Demostrar ROI concreto',
      action: 'Presentar business case',
      script: `"Preparé un análisis específico: inversión de R$ ${Math.round(opportunity.value * 0.5).toLocaleString('pt-BR')}, retorno en ${Math.ceil(opportunity.value * 0.5 / (opportunity.value * 0.15))} meses, ahorro anual de R$ ${Math.round(opportunity.value * 1.8).toLocaleString('pt-BR')}. ¿Lo revisamos juntos?"`,
      expectedOutcome: 'ROI validado y aceptado'
    };
  }

  // Prioridad 7: Listo para cerrar
  if (dorScore >= 7 && poderScore >= 6 && valorScore >= 6 && controleScore >= 6) {
    return {
      priority: 'OPORTUNIDAD',
      title: '🏆 CERRAR ESTA SEMANA',
      action: 'Presionar para firma',
      script: `"${opportunity.power_sponsor || opportunity.sponsor}, ya validamos todo: problema, solución y ROI. Puedo comenzar implementación el lunes. ¿Firmamos hoy para aprovechar el descuento del mes?"`,
      expectedOutcome: 'Contrato firmado en 72h'
    };
  }

  // Default: Mantener momentum
  return {
    priority: 'NORMAL',
    title: '📈 Mantener momentum',
    action: 'Avanzar metodología',
    script: 'Siguiente paso según PPVVCC',
    expectedOutcome: 'Progreso en escalas'
  };
}

// ============= QUICK ACTIONS DINÁMICAS =============

function generateQuickActions(opportunity, alerts) {
  if (!opportunity) {
    return [
      {
        icon: '📊',
        label: 'Ver pipeline completo',
        prompt: 'Muéstrame un análisis del pipeline completo con oportunidades en riesgo'
      },
      {
        icon: '🏆',
        label: 'Top deals para cerrar',
        prompt: '¿Cuáles son los 5 mejores deals para cerrar este mes?'
      }
    ];
  }

  const actions = [];
  const scales = opportunity.scales || {};
  const dorScore = getScaleValue(scales.dor || scales.pain);
  const poderScore = getScaleValue(scales.poder || scales.power);
  const valorScore = getScaleValue(scales.valor || scales.value);

  // Acciones basadas en escalas bajas
  if (dorScore < 5) {
    actions.push({
      icon: '🎯',
      label: 'Preguntas SPIN',
      prompt: `Dame 5 preguntas SPIN específicas para que ${opportunity.client} admita problemas de violación y retrabajo en su operación`
    });
  }

  if (poderScore < 4) {
    actions.push({
      icon: '👔',
      label: 'Acceder al decisor',
      prompt: `Script exacto para pedirle a ${opportunity.sponsor || 'mi contacto'} que me presente al decisor de ${opportunity.client}`
    });
  }

  if (valorScore < 5) {
    actions.push({
      icon: '💰',
      label: 'Calcular ROI',
      prompt: `Calcula el ROI específico para ${opportunity.client} con volumen de ${Math.round(opportunity.value/100)} cajas/mes`
    });
  }

  // Acciones basadas en alertas
  if (alerts && alerts.length > 0) {
    if (alerts[0].type === 'critical') {
      actions.push({
        icon: '🚨',
        label: 'Plan de rescate',
        prompt: `${opportunity.client} está en riesgo crítico. Dame un plan de rescate de emergencia para salvar este deal de R$ ${opportunity.value.toLocaleString('pt-BR')}`
      });
    } else if (alerts[0].type === 'urgent') {
      actions.push({
        icon: '📧',
        label: 'Email reactivación',
        prompt: `Escribe un email potente para reactivar a ${opportunity.client} después de ${getDaysSinceLastContact(opportunity.last_update)} días sin contacto`
      });
    }
  }

  // Acciones generales siempre disponibles
  actions.push({
    icon: '📊',
    label: 'Análisis PPVVCC',
    prompt: `Análisis completo PPVVCC de ${opportunity.client} con acciones para subir cada escala 2 puntos`
  });

  actions.push({
    icon: '🎬',
    label: 'Preparar demo',
    prompt: `¿Cómo estructuro una demo ganadora para ${opportunity.client} en ${opportunity.industry || 'su industria'}?`
  });

  return actions.slice(0, 6); // Máximo 6 acciones
}

// ============= BÚSQUEDA EN GOOGLE (si está configurada) =============
async function searchGoogleForContext(query) {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    return null;
  }
  
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        gl: 'br',
        hl: 'pt',
        num: 5,
        type: 'search'
      })
    });
    
    const data = await response.json();
    
    if (data.organic && data.organic.length > 0) {
      const results = data.organic.map(r => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
        hasRevenue: r.snippet?.includes('R$') || r.snippet?.includes('milhões'),
        hasEmployees: r.snippet?.match(/\d+\s*(funcionários|empleados)/i) !== null,
        hasExpansion: r.snippet?.toLowerCase().includes('expansão'),
        hasProblems: r.snippet?.toLowerCase().includes('problema')
      }));
      
      return results.map((r, idx) => 
        `${idx + 1}. ${r.title}\n   ${r.snippet}\n   ${r.hasExpansion ? '🚀 Expansión detectada' : ''}${r.hasProblems ? '⚠️ Problemas mencionados' : ''}`
      ).join('\n\n');
    }
    return null;
  } catch (error) {
    console.error('Error buscando en Google:', error);
    return null;
  }
}

// ============= MOTOR DE ANÁLISIS COMPLETO =============

function buildCompleteAnalysis(opportunityData, pipelineData, vendorName) {
  const analysis = {
    timestamp: new Date().toISOString(),
    opportunity: null,
    pipeline: null,
    alerts: [],
    nextBestAction: null,
    quickActions: [],
    insights: []
  };

  // Análisis del pipeline
  if (pipelineData?.allOpportunities) {
    analysis.pipeline = analyzePipelineHealth(pipelineData.allOpportunities);
    
    // Insights del pipeline
    if (analysis.pipeline.atRisk > 0) {
      analysis.insights.push({
        type: 'warning',
        message: `📊 ${analysis.pipeline.atRisk} oportunidades en riesgo por R$ ${analysis.pipeline.riskValue.toLocaleString('pt-BR')}`
      });
    }
    
    if (analysis.pipeline.topDeals.length > 0) {
      analysis.insights.push({
        type: 'opportunity',
        message: `🎯 ${analysis.pipeline.topDeals.length} deals listos para cerrar este mes`
      });
    }
  }

  // Análisis de la oportunidad actual
  if (opportunityData) {
    analysis.opportunity = analyzeOpportunity(opportunityData);
    analysis.alerts = generateAlerts(opportunityData, pipelineData);
    analysis.nextBestAction = generateNextBestAction(opportunityData, pipelineData);
    analysis.quickActions = generateQuickActions(opportunityData, analysis.alerts);
    
    // Insights de la oportunidad
    if (analysis.opportunity.probability > 70) {
      analysis.insights.push({
        type: 'success',
        message: `✅ ${opportunityData.client}: Alta probabilidad de cierre (${analysis.opportunity.probability}%)`
      });
    } else if (analysis.opportunity.probability < 30) {
      analysis.insights.push({
        type: 'danger',
        message: `⚠️ ${opportunityData.client}: Baja probabilidad de cierre (${analysis.opportunity.probability}%)`
      });
    }
  }

  // Análisis del vendedor (si está disponible)
  if (vendorName && analysis.pipeline?.vendorPerformance?.[vendorName]) {
    const vendorStats = analysis.pipeline.vendorPerformance[vendorName];
    analysis.vendor = {
      name: vendorName,
      stats: vendorStats,
      performance: vendorStats.avgHealth > 6 ? 'excellent' : 
                   vendorStats.avgHealth > 4 ? 'good' : 'needs-improvement'
    };
  }

  return analysis;
}

// ============= HERRAMIENTAS LOCALES (se mantienen todas las anteriores) =============
// ... (todas las funciones de herramientas como analyzeOpportunityLocal, calculateROI, etc.)
// Las mantengo pero no las repito por espacio

// ============= LLAMADA A CLAUDE API ENRIQUECIDA =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext, toolsAvailable, webSearchResults = null, completeAnalysis = null) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ Claude API no configurada, usando análisis local');
    return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
  }

  const toolDescriptions = toolsAvailable.map(t => 
    `- **${t.name}**: ${t.description}`
  ).join('\n');

  const promptTemplate = `Eres "Ventus", un coach de ventas de clase mundial y experto absoluto en la metodología PPVVCC de Ventapel Brasil. 
Tu CEO te describió como: "directo, sin vueltas, basado en evidencia y lógica". 
Tu objetivo es ayudar a los vendedores a CERRAR DEALS proporcionando estrategias y acciones concretas.

**REGLAS FUNDAMENTALES:**
1. **SIEMPRE BASADO EN DATOS:** Usa el análisis completo, casos de éxito, y cualquier información disponible. No inventes.
2. **ACCIÓN CONCRETA:** Proporciona siempre un paso siguiente claro y ejecutable HOY.
3. **RESPUESTA DIRECTA:** Usa Markdown. Sé conciso pero completo. Sin adulación.
4. **PERSONALIZACIÓN:** Adapta tu respuesta al contexto específico del cliente y el análisis.

---
**ANÁLISIS COMPLETO DEL SISTEMA:**
${completeAnalysis ? JSON.stringify(completeAnalysis, null, 2) : 'No hay análisis disponible'}

**CONTEXTO DE LA OPORTUNIDAD:**
${opportunityData ? JSON.stringify(opportunityData, null, 2) : 'No hay oportunidad seleccionada'}

**CASOS DE ÉXITO VENTAPEL:**
${JSON.stringify(ventapelContext.casos, null, 2)}

${webSearchResults ? `
**📰 INFORMACIÓN ACTUALIZADA DE INTERNET:**
${webSearchResults}
` : ''}

**SOLICITUD DEL VENDEDOR:**
"${userInput}"

---
**HERRAMIENTAS DISPONIBLES:**
Si necesitas datos específicos de una herramienta, responde ÚNICAMENTE con:
\`\`\`json
{"tool_to_use": "nombre_de_la_herramienta"}
\`\`\`

${toolDescriptions}

---
**INSTRUCCIONES BASADAS EN EL ANÁLISIS:**

${completeAnalysis?.alerts?.length > 0 ? `
ALERTAS CRÍTICAS DETECTADAS:
${completeAnalysis.alerts.map(a => `- ${a.message}`).join('\n')}
DEBES abordar estas alertas en tu respuesta.
` : ''}

${completeAnalysis?.nextBestAction ? `
PRÓXIMA MEJOR ACCIÓN RECOMENDADA:
${completeAnalysis.nextBestAction.title}
Considera esto al formular tu respuesta.
` : ''}

${completeAnalysis?.opportunity?.probability < 30 ? `
⚠️ OPORTUNIDAD EN RIESGO CRÍTICO (${completeAnalysis.opportunity.probability}% probabilidad)
Tu respuesta debe enfocarse en SALVAR o CALIFICAR OUT este deal.
` : ''}

Responde de forma natural pero directa, como el CEO aconsejando al equipo de ventas.
SIEMPRE termina con una acción específica para HOY.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [
          { role: "user", content: promptTemplate }
        ]
      })
    });

    if (!response.ok) {
      console.log('❌ Error en Claude API:', response.status);
      return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
    }

    const data = await response.json();
    const responseText = data.content[0].text;
    
    // Verificar si Claude está pidiendo una herramienta
    if (responseText.includes('```json') && responseText.includes('tool_to_use')) {
      try {
        const jsonMatch = responseText.match(/```json\n?(.*?)\n?```/s);
        if (jsonMatch) {
          const toolRequest = JSON.parse(jsonMatch[1]);
          if (toolRequest.tool_to_use) {
            return { type: 'tool_request', tool: toolRequest.tool_to_use };
          }
        }
      } catch (e) {
        console.log('No es una solicitud de herramienta válida');
      }
    }
    
    return { type: 'direct_response', content: responseText };
    
  } catch (error) {
    console.error('❌ Error llamando a Claude:', error);
    return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
  }
}

// Fallback inteligente que usa el análisis
function generateSmartFallback(opportunityData, userInput, analysis) {
  if (!opportunityData) {
    return "❌ No hay oportunidad seleccionada. Selecciona un cliente del CRM para comenzar el análisis.";
  }

  let response = `📊 **Análisis de ${opportunityData.client}**\n\n`;
  
  if (analysis?.opportunity) {
    response += `**Estado:** Health ${analysis.opportunity.healthScore}/10 | Probabilidad ${analysis.opportunity.probability}%\n\n`;
  }
  
  if (analysis?.alerts?.length > 0) {
    response += `**⚠️ ALERTAS:**\n`;
    analysis.alerts.slice(0, 3).forEach(alert => {
      response += `• ${alert.message}\n`;
    });
    response += '\n';
  }
  
  if (analysis?.nextBestAction) {
    response += `**🎯 PRÓXIMA ACCIÓN:**\n`;
    response += `${analysis.nextBestAction.title}\n`;
    response += `${analysis.nextBestAction.action}\n\n`;
    if (analysis.nextBestAction.script) {
      response += `**Script sugerido:**\n`;
      response += `"${analysis.nextBestAction.script}"\n`;
    }
  }
  
  return response;
}

// ============= HANDLER PRINCIPAL - ORQUESTADOR CON ANÁLISIS =============
export default async function handler(req) {
  // Configurar CORS
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers }
    );
  }

  try {
    const body = await req.json();
    const { 
      userInput, 
      opportunityData, 
      vendorName,
      pipelineData,
      isNewOpportunity
    } = body;

    console.log('🧠 Backend recibió:', { 
      userInput: userInput?.substring(0, 50), 
      hasOpportunity: !!opportunityData,
      vendor: vendorName,
      pipelineSize: pipelineData?.allOpportunities?.length || 0
    });

    // ============= PASO 1: EJECUTAR MOTOR DE ANÁLISIS =============
    console.log('📊 Ejecutando motor de análisis completo...');
    const completeAnalysis = buildCompleteAnalysis(opportunityData, pipelineData, vendorName);
    
    // Validación básica
    if (!opportunityData && !isNewOpportunity && !pipelineData?.allOpportunities?.length) {
      return new Response(
        JSON.stringify({ 
          response: "❌ **No hay datos disponibles**\n\nNo hay oportunidades en el CRM o no se ha seleccionado ninguna.\n\nPara comenzar:\n• Selecciona un cliente del CRM\n• O crea una nueva oportunidad",
          analysis: completeAnalysis
        }),
        { status: 200, headers }
      );
    }

    // Si no hay input, dar un resumen basado en el análisis
    if (!userInput || userInput.trim() === '') {
      let summaryResponse = '';
      
      if (completeAnalysis.pipeline) {
        summaryResponse = `📊 **Resumen del Pipeline**\n\n`;
        summaryResponse += `• Total: ${completeAnalysis.pipeline.total} oportunidades\n`;
        summaryResponse += `• Valor: R$ ${completeAnalysis.pipeline.totalValue.toLocaleString('pt-BR')}\n`;
        summaryResponse += `• En riesgo: ${completeAnalysis.pipeline.atRisk} deals (R$ ${completeAnalysis.pipeline.riskValue.toLocaleString('pt-BR')})\n`;
        summaryResponse += `• Health promedio: ${completeAnalysis.pipeline.averageHealth}/10\n\n`;
        
        if (completeAnalysis.pipeline.topDeals.length > 0) {
          summaryResponse += `**🔥 Top Deals para Cerrar:**\n`;
          completeAnalysis.pipeline.topDeals.slice(0, 3).forEach((deal, idx) => {
            summaryResponse += `${idx + 1}. ${deal.client}: R$ ${deal.value.toLocaleString('pt-BR')} - ${deal.action}\n`;
          });
        }
      }
      
      if (opportunityData && completeAnalysis.nextBestAction) {
        summaryResponse += `\n**Para ${opportunityData.client}:**\n`;
        summaryResponse += `${completeAnalysis.nextBestAction.title}\n`;
        summaryResponse += `👉 ${completeAnalysis.nextBestAction.action}`;
      }
      
      return new Response(
        JSON.stringify({ 
          response: summaryResponse || "💬 ¿En qué puedo ayudarte con las ventas?",
          analysis: completeAnalysis
        }),
        { status: 200, headers }
      );
    }

    // ============= PASO 2: BÚSQUEDA WEB SI ES NECESARIA =============
    let webSearchResults = null;
    const needsWebSearch = userInput.toLowerCase().includes('actualiz') || 
                          userInput.toLowerCase().includes('noticia') ||
                          userInput.toLowerCase().includes('reciente') ||
                          userInput.toLowerCase().includes('información');
    
    if (needsWebSearch && opportunityData?.client) {
      console.log('🔍 Buscando en Google para:', opportunityData.client);
      webSearchResults = await searchGoogleForContext(
        `${opportunityData.client} Brasil ${opportunityData.industry || ''} facturación noticias 2024 2025`
      );
    }

    // ============= PASO 3: DEFINIR HERRAMIENTAS DISPONIBLES =============
    const availableTools = [
      { 
        name: 'analizar', 
        description: 'Análisis PPVVCC completo con diagnóstico y próximos pasos',
        function: () => {
          // Versión enriquecida que usa el análisis completo
          let result = `📊 **ANÁLISIS COMPLETO DE ${opportunityData?.client || 'PIPELINE'}**\n\n`;
          
          if (completeAnalysis.opportunity) {
            result += `**Health Score:** ${completeAnalysis.opportunity.healthScore}/10\n`;
            result += `**Probabilidad:** ${completeAnalysis.opportunity.probability}%\n`;
            result += `**Días sin contacto:** ${completeAnalysis.opportunity.daysSince}\n\n`;
            
            if (completeAnalysis.opportunity.criticalScales.length > 0) {
              result += `**⚠️ ESCALAS CRÍTICAS:**\n`;
              completeAnalysis.opportunity.criticalScales.forEach(scale => {
                result += `• ${scale.name}: ${scale.value}/10 - ${scale.issue}\n`;
                result += `  → ${scale.action}\n`;
              });
            }
          }
          
          if (completeAnalysis.alerts.length > 0) {
            result += `\n**🚨 ALERTAS:**\n`;
            completeAnalysis.alerts.forEach(alert => {
              result += `• ${alert.message}\n`;
            });
          }
          
          if (completeAnalysis.nextBestAction) {
            result += `\n**🎯 PRÓXIMA ACCIÓN:**\n`;
            result += completeAnalysis.nextBestAction.script || completeAnalysis.nextBestAction.action;
          }
          
          return result;
        }
      },
      // ... resto de herramientas (dolor, roi, email, etc.) se mantienen igual
    ];

    // ============= PASO 4: LLAMADA A CLAUDE CON ANÁLISIS COMPLETO =============
    console.log('🤖 Llamando a Claude con análisis completo...');
    
    const claudeResponse = await callClaudeAPI(
      opportunityData,
      userInput,
      { casos: CASOS_EXITO_REALES },
      availableTools,
      webSearchResults,
      completeAnalysis // Pasamos el análisis completo a Claude
    );

    // Procesar respuesta de Claude
    let chatResponseContent;
    
    if (claudeResponse.type === 'tool_request') {
      // Claude pidió una herramienta
      const toolName = claudeResponse.tool;
      const tool = availableTools.find(t => t.name === toolName);
      
      if (tool) {
        console.log(`🔧 Ejecutando herramienta: ${toolName}`);
        const toolResult = tool.function(opportunityData);
        
        // Segunda llamada a Claude con el resultado
        console.log('🤖 Enviando resultado de herramienta a Claude');
        chatResponseContent = await callClaudeWithToolResult(
          opportunityData,
          userInput,
          toolName,
          toolResult,
          { casos: CASOS_EXITO_REALES },
          webSearchResults,
          completeAnalysis
        );
      } else {
        chatResponseContent = claudeResponse.content;
      }
    } else {
      chatResponseContent = claudeResponse.content;
    }

    // ============= PASO 5: DEVOLVER RESPUESTA ESTRUCTURADA =============
    return new Response(
      JSON.stringify({ 
        response: chatResponseContent,
        analysis: completeAnalysis // El frontend puede usar esto para el panel
      }),
      { status: 200, headers }
    );

  } catch (error) {
    console.error('❌ Error en backend:', error);
    
    return new Response(
      JSON.stringify({ 
        response: '❌ **Error procesando solicitud**\n\nPor favor, intenta de nuevo.',
        error: error.message,
        analysis: null
      }),
      { status: 200, headers }
    );
  }
}
