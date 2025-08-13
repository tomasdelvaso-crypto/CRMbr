// api/assistant.js - BACKEND INTELIGENTE CON CLAUDE-FIRST Y TOOL-USE

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
    getScaleValue(scales.dor),
    getScaleValue(scales.poder),
    getScaleValue(scales.visao),
    getScaleValue(scales.valor),
    getScaleValue(scales.controle),
    getScaleValue(scales.compras)
  ];
  const sum = values.reduce((acc, val) => acc + val, 0);
  return values.length > 0 ? (sum / values.length).toFixed(1) : 0;
}

// ============= FUNCIONES LOCALES (HERRAMIENTAS) =============
function analyzeOpportunityLocal(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada.";
  
  const daysSince = opp.last_update ? 
    Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 999;
  
  const healthScore = calculateHealthScore(opp.scales);
  const dorScore = getScaleValue(opp.scales?.dor);
  const poderScore = getScaleValue(opp.scales?.poder);
  
  let analysis = `📊 **ANÁLISIS DE ${opp.client}**\n\n`;
  
  analysis += `💰 **Valor:** R$ ${(opp.value || 0).toLocaleString('pt-BR')}\n`;
  analysis += `📈 **Etapa:** ${opp.stage} | Prob: ${opp.probability}%\n`;
  analysis += `❤️ **Health:** ${healthScore}/10\n`;
  analysis += `📅 **Último contacto:** ${daysSince} días\n\n`;
  
  // Diagnóstico principal
  if (daysSince > 30) {
    analysis += `🔴 **DIAGNÓSTICO: DEAL MUERTO**\n`;
    analysis += `${daysSince} días sin contacto. Requiere reactivación urgente.\n\n`;
  } else if (dorScore < 5) {
    analysis += `⚠️ **DIAGNÓSTICO: SIN DOLOR = SIN VENTA**\n`;
    analysis += `Dolor en ${dorScore}/10. Cliente no admite problema.\n\n`;
  } else if (poderScore < 5) {
    analysis += `⚠️ **DIAGNÓSTICO: SIN ACCESO AL DECISOR**\n`;
    analysis += `Poder en ${poderScore}/10. No llegas a quien firma.\n\n`;
  } else {
    analysis += `✅ **DIAGNÓSTICO: OPORTUNIDAD VIABLE**\n\n`;
  }
  
  // Acción inmediata
  analysis += `**🎯 ACCIÓN INMEDIATA:**\n`;
  if (daysSince > 7) {
    analysis += `☎️ **Llamar HOY** para reactivar\n`;
  } else if (dorScore < 5) {
    analysis += `📞 **Aplicar técnica SPIN** para elevar dolor\n`;
  } else if (!opp.power_sponsor) {
    analysis += `🎯 **Identificar Power Sponsor** esta semana\n`;
  } else {
    analysis += `✅ **Avanzar a siguiente etapa** del pipeline\n`;
  }
  
  return analysis;
}

function generatePainStrategy(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const painScore = getScaleValue(opp.scales?.dor) || 0;
  const monthlyBoxes = Math.round(opp.value / 100);
  const monthlyLoss = Math.round(opp.value * 0.1);
  const annualLoss = monthlyLoss * 12;
  
  let strategy = `🎯 **ESTRATEGIA SPIN PARA ${opp.client}**\n\n`;
  strategy += `**Dolor actual:** ${painScore}/10 → **Meta:** 8+/10\n\n`;
  
  strategy += `**📞 SCRIPT DE LLAMADA (10 minutos):**\n\n`;
  
  strategy += `**1. SITUACIÓN (1 min):**\n`;
  strategy += `"${opp.sponsor || 'Hola'}, vi que procesan ${monthlyBoxes.toLocaleString('pt-BR')} cajas/mes. ¿Correcto?"\n\n`;
  
  strategy += `**2. PROBLEMA (3 min):**\n`;
  strategy += `• "¿Qué % de cajas llegan violadas al cliente?"\n`;
  strategy += `• "¿Cuánto tiempo dedican a re-embalar?"\n`;
  strategy += `• "¿Cuántos reclamos reciben por mes?"\n\n`;
  
  strategy += `**3. IMPLICACIÓN (4 min) - CREAR DOLOR:**\n`;
  strategy += `• "Con 10% de violación, son ${Math.round(monthlyBoxes * 0.1).toLocaleString('pt-BR')} cajas/mes"\n`;
  strategy += `• "A R$35 por retrabajo = R$ ${monthlyLoss.toLocaleString('pt-BR')}/mes"\n`;
  strategy += `• "Eso es R$ ${annualLoss.toLocaleString('pt-BR')}/año tirados a la basura"\n`;
  strategy += `• "¿Tu competencia tiene este problema?"\n\n`;
  
  strategy += `**4. NECESIDAD (2 min):**\n`;
  strategy += `• "Si eliminaran 95% de violaciones, ¿qué impacto tendría?"\n`;
  strategy += `• "¿Vale la pena invertir 3 meses de pérdidas para eliminarlo para siempre?"\n\n`;
  
  // Caso de éxito relevante
  const caso = opp.industry?.toLowerCase().includes('commerce') ? 'MercadoLibre' : 'Nike';
  strategy += `**💡 MENCIONAR:** "${caso} tenía el mismo problema, hoy ahorra R$ ${caso === 'MercadoLibre' ? '180.000' : '100.000'}/mes"`;
  
  return strategy;
}

function calculateROI(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const monthlyBoxes = Math.round(opp.value / 100);
  const violationRate = 0.10; // 10% estándar Brasil
  const reworkCost = 35; // R$ por caja
  const monthlyLoss = Math.round(monthlyBoxes * violationRate * reworkCost);
  
  // Inversión según volumen
  let investment, solution;
  if (monthlyBoxes < 5000) {
    investment = 45000;
    solution = "BP222 + Gorilla 300m";
  } else if (monthlyBoxes < 20000) {
    investment = 95000;
    solution = "BP555e + VENOM";
  } else {
    investment = 180000;
    solution = "BP755 + Gorilla 700m";
  }
  
  const monthlySavings = Math.round(monthlyLoss * 0.95); // 95% reducción
  const paybackMonths = Math.ceil(investment / monthlySavings);
  const annualROI = Math.round(((monthlySavings * 12 - investment) / investment) * 100);
  
  let roi = `💰 **ROI PERSONALIZADO - ${opp.client}**\n\n`;
  
  roi += `**📊 NÚMEROS ACTUALES:**\n`;
  roi += `• Volumen: ${monthlyBoxes.toLocaleString('pt-BR')} cajas/mes\n`;
  roi += `• Violadas (10%): ${Math.round(monthlyBoxes * violationRate).toLocaleString('pt-BR')} cajas\n`;
  roi += `• Pérdida mensual: R$ ${monthlyLoss.toLocaleString('pt-BR')}\n`;
  roi += `• Pérdida anual: R$ ${(monthlyLoss * 12).toLocaleString('pt-BR')}\n\n`;
  
  roi += `**✅ SOLUCIÓN VENTAPEL:**\n`;
  roi += `• Equipamiento: ${solution}\n`;
  roi += `• Inversión: R$ ${investment.toLocaleString('pt-BR')}\n`;
  roi += `• Reducción violaciones: 95%\n\n`;
  
  roi += `**📈 RESULTADOS:**\n`;
  roi += `• Ahorro mensual: R$ ${monthlySavings.toLocaleString('pt-BR')}\n`;
  roi += `• Ahorro anual: R$ ${(monthlySavings * 12).toLocaleString('pt-BR')}\n`;
  roi += `• **PAYBACK: ${paybackMonths} MESES**\n`;
  roi += `• ROI primer año: ${annualROI}%\n\n`;
  
  // Caso similar
  const caso = monthlyBoxes < 5000 ? CASOS_EXITO_REALES.mercadolibre : 
               monthlyBoxes < 20000 ? CASOS_EXITO_REALES.nike : 
               CASOS_EXITO_REALES.loreal;
  
  roi += `**📊 CASO SIMILAR:**\n`;
  roi += `${caso.empresa}: ROI en ${caso.resultados.roi_meses} meses`;
  
  return roi;
}

function generateEmail(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const daysSince = opp.last_update ? 
    Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 0;
  
  const monthlyLoss = Math.round(opp.value * 0.1);
  const caso = opp.industry?.toLowerCase().includes('commerce') ? 'MercadoLibre' : 'Nike';
  
  let email = `📧 **EMAIL PARA ${opp.client}**\n\n`;
  email += `**Para:** ${opp.sponsor || opp.power_sponsor || 'Contacto'}\n`;
  
  if (daysSince > 7) {
    email += `**Asunto:** ${opp.client} - R$ ${(monthlyLoss * 12).toLocaleString('pt-BR')}/año en pérdidas evitables\n\n`;
    email += `Hola ${opp.sponsor?.split(' ')[0] || 'equipo'},\n\n`;
    email += `Hace ${daysSince} días que no hablamos.\n\n`;
    email += `Mientras tanto, están perdiendo R$ ${monthlyLoss.toLocaleString('pt-BR')}/mes en violación de cajas.\n\n`;
  } else {
    email += `**Asunto:** Caso ${caso} - Cómo eliminaron 95% de violaciones\n\n`;
    email += `Hola ${opp.sponsor?.split(' ')[0] || 'equipo'},\n\n`;
  }
  
  email += `Datos rápidos:\n`;
  email += `• Pérdida típica del sector: 10% de cajas violadas\n`;
  email += `• Para ustedes: R$ ${monthlyLoss.toLocaleString('pt-BR')}/mes\n`;
  email += `• ${caso} tenía el mismo problema\n`;
  email += `• Hoy ahorran R$ ${caso === 'MercadoLibre' ? '180.000' : '100.000'}/mes\n\n`;
  
  email += `¿15 minutos esta semana para ver los números específicos?\n\n`;
  email += `PD: Cada mes sin actuar = R$ ${monthlyLoss.toLocaleString('pt-BR')} perdidos.\n\n`;
  email += `Saludos,\n[Tu nombre]`;
  
  return email;
}

function generateCallScript(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const monthlyBoxes = Math.round(opp.value / 100);
  const monthlyLoss = Math.round(opp.value * 0.1);
  
  let script = `📞 **SCRIPT PARA ${opp.client}**\n\n`;
  
  script += `**APERTURA (30 seg):**\n`;
  script += `"Hola ${opp.sponsor || '[nombre]'}, soy [TU NOMBRE] de Ventapel.\n`;
  script += `Vi que procesan ${monthlyBoxes.toLocaleString('pt-BR')} cajas/mes.\n`;
  script += `MercadoLibre procesaba volumen similar y perdía R$ ${monthlyLoss.toLocaleString('pt-BR')}/mes.\n`;
  script += `Hoy ahorran 95% de eso. ¿15 minutos para mostrarle cómo?"\n\n`;
  
  script += `**SI DICE "NO TENGO TIEMPO":**\n`;
  script += `"Entiendo. Solo una pregunta rápida:\n`;
  script += `¿Cuántas cajas violadas tienen por mes?\n`;
  script += `[Esperar respuesta]\n`;
  script += `Eso son R$ [calcular] al año. ¿No vale 15 minutos?"\n\n`;
  
  script += `**SI DICE "YA TENEMOS SOLUCIÓN":**\n`;
  script += `"Excelente. ¿Qué % de efectividad tiene?\n`;
  script += `[Esperar respuesta]\n`;
  script += `Nosotros garantizamos 95% o devolvemos el dinero.\n`;
  script += `¿Vale la pena comparar?"\n\n`;
  
  script += `**SI DICE "NO ES PRIORIDAD":**\n`;
  script += `"¿R$ ${(monthlyLoss * 12).toLocaleString('pt-BR')}/año no es prioridad?\n`;
  script += `Con ROI en 3 meses, ¿qué podría ser más prioritario?"\n\n`;
  
  script += `**CIERRE:**\n`;
  script += `"¿Martes 10am o jueves 3pm le viene mejor?"`;
  
  return script;
}

function generateCompleteStrategy(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const healthScore = calculateHealthScore(opp.scales);
  const dorScore = getScaleValue(opp.scales?.dor);
  const poderScore = getScaleValue(opp.scales?.poder);
  const visaoScore = getScaleValue(opp.scales?.visao);
  
  let strategy = `🎯 **ESTRATEGIA COMPLETA - ${opp.client}**\n\n`;
  
  strategy += `**📊 DIAGNÓSTICO PPVVCC:**\n`;
  strategy += `• DOR: ${dorScore}/10 ${dorScore < 5 ? '🔴 CRÍTICO' : dorScore < 8 ? '🟡 MEJORAR' : '🟢 OK'}\n`;
  strategy += `• PODER: ${poderScore}/10 ${poderScore < 5 ? '🔴 SIN ACCESO' : poderScore < 8 ? '🟡 PARCIAL' : '🟢 TOTAL'}\n`;
  strategy += `• VISÃO: ${visaoScore}/10\n`;
  strategy += `• Health Total: ${healthScore}/10\n\n`;
  
  // Identificar prioridad
  let priority = '';
  let action = '';
  
  if (dorScore < 5) {
    priority = '🔴 PRIORIDAD 1: ELEVAR DOLOR';
    action = 'Sin dolor admitido NO HAY VENTA. Aplicar SPIN inmediatamente.';
  } else if (poderScore < 5) {
    priority = '🟡 PRIORIDAD 2: ACCEDER AL DECISOR';
    action = 'Identificar y acceder al Power Sponsor esta semana.';
  } else if (visaoScore < 5) {
    priority = '🔵 PRIORIDAD 3: CONSTRUIR VISIÓN';
    action = 'Demo con caso de éxito y ROI específico.';
  } else {
    priority = '✅ LISTO PARA CERRAR';
    action = 'Proponer prueba piloto o contrato.';
  }
  
  strategy += `**${priority}**\n`;
  strategy += `${action}\n\n`;
  
  strategy += `**📋 PLAN DE ACCIÓN (5 DÍAS):**\n\n`;
  
  strategy += `**DÍA 1-2:** ${dorScore < 5 ? 'Llamada SPIN para elevar dolor' : 'Mantener momentum'}\n`;
  strategy += `**DÍA 3:** ${poderScore < 5 ? 'Email pidiendo acceso al decisor' : 'Confirmar próximos pasos'}\n`;
  strategy += `**DÍA 4:** ${visaoScore < 5 ? 'Demo con ROI calculado' : 'Enviar propuesta'}\n`;
  strategy += `**DÍA 5:** Follow-up y definir fecha de decisión\n\n`;
  
  // Script de apertura
  strategy += `**📞 SCRIPT DE HOY:**\n`;
  strategy += `"${opp.sponsor || 'Hola'}, `;
  
  if (dorScore < 5) {
    strategy += `necesito validar algo: ¿cuántas cajas violadas tienen por mes?"`;
  } else if (poderScore < 5) {
    strategy += `para avanzar necesito 15 min con quien aprueba inversiones. ¿Quién sería?"`;
  } else {
    strategy += `ya tenemos todo listo. ¿Empezamos con prueba piloto o vamos directo al contrato?"`;
  }
  
  return strategy;
}

// ============= LLAMADA A CLAUDE API MEJORADA =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext, toolsAvailable) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ Claude API no configurada, usando análisis local');
    return { type: 'fallback', content: analyzeOpportunityLocal(opportunityData) };
  }

  // Descripción de herramientas disponibles
  const toolDescriptions = toolsAvailable.map(t => 
    `- **${t.name}**: ${t.description}`
  ).join('\n');

  const promptTemplate = `Eres "Ventus", un coach de ventas de clase mundial y experto absoluto en la metodología PPVVCC de Ventapel Brasil. Tu objetivo es ayudar a los vendedores a CERRAR DEALS proporcionando estrategias y acciones concretas.

**REGLAS FUNDAMENTALES:**
1. **SIEMPRE BASADO EN DATOS:** Analiza la oportunidad y los casos de éxito. No inventes información.
2. **ACCIÓN CONCRETA:** Proporciona siempre un paso siguiente claro y ejecutable.
3. **RESPUESTA DIRECTA:** Usa Markdown para formato. Sé conciso pero completo.
4. **PERSONALIZACIÓN:** Adapta tu respuesta al contexto específico del cliente.

---
**CONTEXTO DE LA OPORTUNIDAD:**
${JSON.stringify(opportunityData, null, 2)}

**CASOS DE ÉXITO VENTAPEL:**
${JSON.stringify(ventapelContext.casos, null, 2)}

**SOLICITUD DEL VENDEDOR:**
"${userInput}"

---
**HERRAMIENTAS DISPONIBLES:**
Puedes usar estas herramientas para obtener información precisa. Si necesitas usar una herramienta, responde ÚNICAMENTE con:
\`\`\`json
{"tool_to_use": "nombre_de_la_herramienta"}
\`\`\`

${toolDescriptions}

---
**INSTRUCCIONES:**
1. Analiza la solicitud del vendedor en el contexto de la oportunidad
2. Si puedes dar una respuesta completa y personalizada directamente, hazlo
3. Si necesitas datos específicos de una herramienta (como cálculos de ROI exactos), solicítala
4. Considera el estado PPVVCC actual para personalizar tu respuesta
5. Siempre incluye un próximo paso accionable

Responde de forma natural, como un coach experto que conoce bien el negocio y al cliente.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: "user", content: promptTemplate }
        ]
      })
    });

    if (!response.ok) {
      console.log('❌ Error en Claude API:', response.status);
      return { type: 'fallback', content: analyzeOpportunityLocal(opportunityData) };
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
    return { type: 'fallback', content: analyzeOpportunityLocal(opportunityData) };
  }
}

async function callClaudeWithToolResult(opportunityData, userInput, toolName, toolResult, ventapelContext) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    return toolResult; // Fallback: devolver el resultado de la herramienta directamente
  }

  const promptTemplate = `Eres "Ventus", coach de ventas experto en PPVVCC de Ventapel Brasil.

El vendedor preguntó: "${userInput}"

Para responder mejor, ejecutaste la herramienta "${toolName}" que devolvió:

--- RESULTADO DE LA HERRAMIENTA ---
${toolResult}
--- FIN DEL RESULTADO ---

**CONTEXTO DEL CLIENTE:**
${JSON.stringify(opportunityData, null, 2)}

**CASOS DE ÉXITO RELEVANTES:**
${JSON.stringify(ventapelContext.casos, null, 2)}

**TAREA:**
1. Usa el resultado de la herramienta como base para tu respuesta
2. Enriquece la respuesta con insights adicionales basados en el contexto
3. Personaliza la respuesta para este cliente específico
4. Si es relevante, menciona casos de éxito similares
5. SIEMPRE termina con un próximo paso claro y accionable

Responde en formato Markdown, siendo profesional pero cercano.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: "user", content: promptTemplate }
        ]
      })
    });

    if (!response.ok) {
      console.log('❌ Error en segunda llamada a Claude');
      return toolResult; // Fallback al resultado de la herramienta
    }

    const data = await response.json();
    return data.content[0].text;
    
  } catch (error) {
    console.error('❌ Error en segunda llamada a Claude:', error);
    return toolResult; // Fallback al resultado de la herramienta
  }
}

// ============= HANDLER PRINCIPAL - ORQUESTADOR CLAUDE-FIRST =============
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { userInput, opportunityData, vendorName } = body;

    console.log('🧠 Backend recibió:', { 
      userInput: userInput?.substring(0, 50), 
      hasOpportunity: !!opportunityData,
      vendor: vendorName 
    });

    // Validación básica
    if (!opportunityData) {
      return new Response(
        JSON.stringify({ 
          response: "❌ **No hay cliente seleccionado**\n\nSelecciona un cliente del CRM para que pueda ayudarte con estrategias específicas." 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!userInput || userInput.trim() === '') {
      return new Response(
        JSON.stringify({ 
          response: "❓ **¿En qué puedo ayudarte?**\n\nPregúntame sobre estrategias, objeciones, ROI, o cualquier aspecto de la venta." 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Definir las herramientas disponibles
    const availableTools = [
      { 
        name: 'analizar', 
        description: 'Análisis PPVVCC completo con diagnóstico y próximos pasos',
        function: analyzeOpportunityLocal 
      },
      { 
        name: 'dolor', 
        description: 'Estrategia SPIN y script para elevar el dolor del cliente',
        function: generatePainStrategy 
      },
      { 
        name: 'roi', 
        description: 'Cálculo detallado de ROI con payback y casos similares',
        function: calculateROI 
      },
      { 
        name: 'email', 
        description: 'Email de venta personalizado con casos de éxito',
        function: generateEmail 
      },
      { 
        name: 'llamada', 
        description: 'Script de llamada con manejo de objeciones comunes',
        function: generateCallScript 
      },
      { 
        name: 'estrategia', 
        description: 'Plan de acción completo de 5 días basado en PPVVCC',
        function: generateCompleteStrategy 
      }
    ];

    // ============= PRIMERA LLAMADA A CLAUDE =============
    console.log('🤖 Llamando a Claude para:', userInput);
    
    const claudeResponse = await callClaudeAPI(
      opportunityData,
      userInput,
      { casos: CASOS_EXITO_REALES },
      availableTools
    );

    // Procesar respuesta de Claude
    if (claudeResponse.type === 'tool_request') {
      // Claude pidió una herramienta
      const toolName = claudeResponse.tool;
      const tool = availableTools.find(t => t.name === toolName);
      
      if (tool) {
        console.log(`🔧 Ejecutando herramienta: ${toolName}`);
        const toolResult = tool.function(opportunityData);
        
        // ============= SEGUNDA LLAMADA A CLAUDE CON RESULTADO =============
        console.log('🤖 Enviando resultado de herramienta a Claude');
        const finalResponse = await callClaudeWithToolResult(
          opportunityData,
          userInput,
          toolName,
          toolResult,
          { casos: CASOS_EXITO_REALES }
        );
        
        return new Response(
          JSON.stringify({ response: finalResponse }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        console.log(`❌ Herramienta no encontrada: ${toolName}`);
        // Si no encuentra la herramienta, usar análisis local
        return new Response(
          JSON.stringify({ response: analyzeOpportunityLocal(opportunityData) }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else if (claudeResponse.type === 'direct_response') {
      // Claude respondió directamente
      console.log('✅ Claude respondió directamente');
      return new Response(
        JSON.stringify({ response: claudeResponse.content }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // Fallback
      console.log('⚠️ Usando fallback local');
      return new Response(
        JSON.stringify({ response: claudeResponse.content }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ Error en backend:', error);
    
    return new Response(
      JSON.stringify({ 
        response: '❌ **Error procesando solicitud**\n\nPor favor, intenta de nuevo o reformula tu pregunta.',
        error: error.message 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
