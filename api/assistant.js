// api/assistant.js - VERSIÓN HÍBRIDA: CLAUDE-FIRST + CAPACIDADES AVANZADAS

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

function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  const last = new Date(lastUpdate);
  const now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// ============= BÚSQUEDA EN GOOGLE =============
async function searchGoogleForContext(query) {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) {
    console.log('⚠️ Serper API no configurada');
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
        hasRevenue: r.snippet?.includes('R$') || r.snippet?.includes('milhões') || r.snippet?.includes('bilhões'),
        hasEmployees: r.snippet?.match(/\d+\s*(funcionários|empleados|employees)/i) !== null,
        hasExpansion: r.snippet?.toLowerCase().includes('expansão') || r.snippet?.toLowerCase().includes('novo centro'),
        hasProblems: r.snippet?.toLowerCase().includes('problema') || r.snippet?.toLowerCase().includes('desafio')
      }));
      
      // Formatear para Claude
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

// ============= HERRAMIENTAS LOCALES (TOOLS) =============

// 1. Análisis PPVVCC
function analyzeOpportunityLocal(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada.";
  
  const daysSince = getDaysSinceLastContact(opp.last_update);
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

// 2. Estrategia de Dolor (SPIN)
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
  
  const caso = opp.industry?.toLowerCase().includes('commerce') ? 'MercadoLibre' : 'Nike';
  strategy += `**💡 MENCIONAR:** "${caso} tenía el mismo problema, hoy ahorra R$ ${caso === 'MercadoLibre' ? '180.000' : '100.000'}/mes"`;
  
  return strategy;
}

// 3. Cálculo de ROI
function calculateROI(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const monthlyBoxes = Math.round(opp.value / 100);
  const violationRate = 0.10;
  const reworkCost = 35;
  const monthlyLoss = Math.round(monthlyBoxes * violationRate * reworkCost);
  
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
  
  const monthlySavings = Math.round(monthlyLoss * 0.95);
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
  
  const caso = monthlyBoxes < 5000 ? CASOS_EXITO_REALES.mercadolibre : 
               monthlyBoxes < 20000 ? CASOS_EXITO_REALES.nike : 
               CASOS_EXITO_REALES.loreal;
  
  roi += `**📊 CASO SIMILAR:**\n`;
  roi += `${caso.empresa}: ROI en ${caso.resultados.roi_meses} meses`;
  
  return roi;
}

// 4. Generación de Email
function generateEmail(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada";
  
  const daysSince = getDaysSinceLastContact(opp.last_update);
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

// 5. Script de Llamada
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

// 6. Estrategia Completa
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

// 7. Manejo de Nueva Oportunidad
function handleNewOpportunity(context, ventapelContext) {
  // Extraer información del contexto
  const companyMatch = context.match(/(?:empresa|cliente|company|oportunidad con|reunión con|visitar a?)\s+([A-Z][A-Za-z0-9+\-&\s]+)/i);
  const company = companyMatch ? companyMatch[1].trim() : '[Por definir]';
  
  const valueMatch = context.match(/R?\$?\s*(\d+(?:\.\d{3})*(?:,\d+)?)\s*(?:mil|k|reais)?/i);
  let value = 0;
  if (valueMatch) {
    value = valueMatch[1].replace(/\./g, '').replace(',', '.');
    if (context.match(/mil|k/i)) value = parseFloat(value) * 1000;
  }
  
  let response = `🎯 **NUEVA OPORTUNIDAD IDENTIFICADA**\n\n`;
  response += `**Empresa:** ${company}\n`;
  if (value) response += `**Valor estimado:** R$ ${Math.round(value).toLocaleString('pt-BR')}\n`;
  
  response += `\n📊 **ESTRUCTURA PPVVCC INICIAL:**\n\n`;
  
  response += `**DOR (0/10):** ❓ Por validar con preguntas SPIN\n`;
  response += `• ¿Qué % de cajas llegan violadas?\n`;
  response += `• ¿Cuánto cuesta el retrabajo?\n`;
  response += `• ¿Han medido el impacto en satisfacción?\n\n`;
  
  response += `**PODER (0/10):** ❓ Mapear estructura de decisión\n`;
  response += `• ¿Quién aprueba inversiones en logística?\n`;
  response += `• ¿Cuál es el proceso de compras?\n`;
  response += `• ¿Hay presupuesto asignado?\n\n`;
  
  response += `**VISÃO (0/10):** ❓ Construir con demo\n`;
  response += `• Mostrar caso ${company.includes('commerce') ? 'MercadoLibre' : 'Nike'}\n`;
  response += `• Demo de equipamiento específico\n`;
  response += `• ROI calculator en vivo\n\n`;
  
  response += `**🎬 PLAN PARA PRIMERA REUNIÓN:**\n`;
  response += `1. Validar dolor con SPIN (15 min)\n`;
  response += `2. Identificar poder de decisión (5 min)\n`;
  response += `3. Mini-demo con caso de éxito (10 min)\n`;
  response += `4. Calcular ROI preliminar (5 min)\n`;
  response += `5. Agendar próximos pasos (5 min)\n\n`;
  
  response += `**⚡ ACCIÓN INMEDIATA:**\n`;
  response += `📅 Agendar reunión con agenda clara\n`;
  response += `📊 Preparar caso de éxito relevante\n`;
  response += `💰 Tener calculadora ROI lista`;
  
  return response;
}

// ============= LLAMADA A CLAUDE API MEJORADA CON TOOLS =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext, toolsAvailable, webSearchResults = null) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ Claude API no configurada, usando análisis local');
    return { type: 'fallback', content: analyzeOpportunityLocal(opportunityData) };
  }

  // Descripción de herramientas disponibles
  const toolDescriptions = toolsAvailable.map(t => 
    `- **${t.name}**: ${t.description}`
  ).join('\n');

  const promptTemplate = `Eres "Ventus", un coach de ventas de clase mundial y experto absoluto en la metodología PPVVCC de Ventapel Brasil. 
Tu CEO te describió como: "directo, sin vueltas, basado en evidencia y lógica". 
Tu objetivo es ayudar a los vendedores a CERRAR DEALS proporcionando estrategias y acciones concretas.

**REGLAS FUNDAMENTALES:**
1. **SIEMPRE BASADO EN DATOS:** Analiza la oportunidad, casos de éxito, y cualquier información web disponible. No inventes.
2. **ACCIÓN CONCRETA:** Proporciona siempre un paso siguiente claro y ejecutable HOY.
3. **RESPUESTA DIRECTA:** Usa Markdown. Sé conciso pero completo. Sin adulación.
4. **PERSONALIZACIÓN:** Adapta tu respuesta al contexto específico del cliente.
5. **USAR INFO ACTUALIZADA:** Si hay información de web search, úsala para enriquecer la respuesta.

---
**CONTEXTO DE LA OPORTUNIDAD:**
${opportunityData ? JSON.stringify(opportunityData, null, 2) : 'No hay oportunidad seleccionada'}

**CASOS DE ÉXITO VENTAPEL:**
${JSON.stringify(ventapelContext.casos, null, 2)}

${webSearchResults ? `
**📰 INFORMACIÓN ACTUALIZADA DE INTERNET sobre ${opportunityData?.client}:**
${webSearchResults}

INSTRUCCIONES PARA USAR ESTA INFO:
- Si hay expansión mencionada → Es momento ideal para propuesta
- Si hay problemas logísticos → Conectar con nuestra solución
- Si hay datos financieros → Dimensionar la propuesta
- SIEMPRE menciona que tienes información actualizada cuando la uses
` : ''}

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
**INSTRUCCIONES ESPECÍFICAS:**

${userInput.toLowerCase().includes('nueva oportunidad') || userInput.toLowerCase().includes('nuevo cliente') ? 
`DETECTÉ NUEVA OPORTUNIDAD:
- Estructurar en formato PPVVCC
- Crear plan de acción para primera reunión
- Identificar información faltante crítica
- Sugerir preguntas SPIN específicas
- Usar herramienta 'nueva_oportunidad' si necesitas estructura completa` : ''}

${userInput.toLowerCase().includes('actualiz') || userInput.toLowerCase().includes('noticia') ? 
`USA LA INFORMACIÓN WEB:
- Menciona explícitamente que tienes info actualizada
- Conecta las noticias con oportunidades de venta
- Crea triggers basados en eventos recientes` : ''}

1. Analiza la solicitud del vendedor en el contexto de la oportunidad
2. Si puedes dar una respuesta completa y personalizada directamente, hazlo
3. Si necesitas datos específicos de una herramienta (como cálculos de ROI exactos), solicítala
4. Considera el estado PPVVCC actual para personalizar tu respuesta
5. SIEMPRE incluye un próximo paso accionable HOY

Responde de forma natural pero directa, como el CEO aconsejando al equipo de ventas.`;

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

// Segunda llamada a Claude con resultado de herramienta
async function callClaudeWithToolResult(opportunityData, userInput, toolName, toolResult, ventapelContext, webSearchResults = null) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    return toolResult;
  }

  const promptTemplate = `Eres "Ventus", coach de ventas experto en PPVVCC de Ventapel Brasil.
Directo, sin vueltas, basado en evidencia.

El vendedor preguntó: "${userInput}"

Para responder mejor, ejecutaste la herramienta "${toolName}" que devolvió:

--- RESULTADO DE LA HERRAMIENTA ---
${toolResult}
--- FIN DEL RESULTADO ---

**CONTEXTO DEL CLIENTE:**
${opportunityData ? JSON.stringify(opportunityData, null, 2) : 'No hay oportunidad'}

**CASOS DE ÉXITO RELEVANTES:**
${JSON.stringify(ventapelContext.casos, null, 2)}

${webSearchResults ? `
**📰 INFORMACIÓN ACTUALIZADA DE INTERNET:**
${webSearchResults}
` : ''}

**TAREA:**
1. Usa el resultado de la herramienta como base
2. Enriquece con insights adicionales del contexto
3. Si hay info web disponible, úsala para personalizar más
4. Personaliza para este cliente específico
5. Menciona casos de éxito similares si es relevante
6. SIEMPRE termina con un próximo paso claro para HOY

Responde en Markdown, siendo profesional pero directo como el CEO.`;

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
      console.log('❌ Error en segunda llamada a Claude');
      return toolResult;
    }

    const data = await response.json();
    return data.content[0].text;
    
  } catch (error) {
    console.error('❌ Error en segunda llamada a Claude:', error);
    return toolResult;
  }
}

// ============= HANDLER PRINCIPAL - ORQUESTADOR CLAUDE-FIRST =============
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
      searchContext,
      isNewOpportunity,
      ventapelContext 
    } = body;

    console.log('🧠 Backend recibió:', { 
      userInput: userInput?.substring(0, 50), 
      hasOpportunity: !!opportunityData,
      vendor: vendorName,
      isNewOpportunity: !!isNewOpportunity
    });

    // Validación básica
    if (!opportunityData && !isNewOpportunity) {
      // Si no hay oportunidad y no es nueva, buscar si el usuario está pidiendo info de un cliente
      const clientNameMatch = userInput?.match(/(?:cliente|empresa|oportunidad|deal|cuenta)\s+([A-Za-z0-9\s&\-]+)/i);
      
      if (clientNameMatch && pipelineData?.allOpportunities) {
        const clientName = clientNameMatch[1].trim().toLowerCase();
        const foundOpp = pipelineData.allOpportunities.find(o => 
          o.client?.toLowerCase().includes(clientName)
        );
        
        if (!foundOpp) {
          return new Response(
            JSON.stringify({ 
              response: `❌ **No encontré "${clientNameMatch[1]}" en el CRM**\n\n` +
                       `📋 **Clientes disponibles:**\n` +
                       pipelineData.allOpportunities.slice(0, 10).map(o => 
                         `• ${o.client} - R$ ${(o.value || 0).toLocaleString('pt-BR')}`
                       ).join('\n') +
                       `\n\n💡 Escribe el nombre exacto del cliente o usa "listar" para ver todos.`
            }),
            { status: 200, headers }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ 
          response: "❌ **No hay cliente seleccionado**\n\n" +
                   "Selecciona un cliente del CRM o dime:\n" +
                   '• "Nueva oportunidad con [empresa]" para registrar una nueva\n' +
                   '• "Listar oportunidades" para ver todas\n' +
                   '• El nombre específico del cliente que quieres analizar'
        }),
        { status: 200, headers }
      );
    }

    if (!userInput || userInput.trim() === '') {
      return new Response(
        JSON.stringify({ 
          response: "❓ **¿En qué puedo ayudarte?**\n\n" +
                   "Pregúntame sobre:\n" +
                   "• Estrategias PPVVCC\n" +
                   "• Scripts y emails de venta\n" +
                   "• Cálculos de ROI\n" +
                   "• Manejo de objeciones\n" +
                   "• Información actualizada del cliente"
        }),
        { status: 200, headers }
      );
    }

    // Buscar información en Google si es relevante
    let webSearchResults = null;
    const needsWebSearch = userInput.toLowerCase().includes('actualiz') || 
                          userInput.toLowerCase().includes('noticia') ||
                          userInput.toLowerCase().includes('reciente') ||
                          userInput.toLowerCase().includes('información') ||
                          userInput.toLowerCase().includes('expansion') ||
                          userInput.toLowerCase().includes('facturación');
    
    if (needsWebSearch && opportunityData?.client) {
      console.log('🔍 Buscando en Google para:', opportunityData.client);
      webSearchResults = await searchGoogleForContext(
        `${opportunityData.client} Brasil ${opportunityData.industry || ''} facturación empleados noticias 2024 2025`
      );
      if (webSearchResults) {
        console.log('✅ Información web encontrada');
      }
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
      },
      {
        name: 'nueva_oportunidad',
        description: 'Estructurar nueva oportunidad en formato PPVVCC',
        function: () => handleNewOpportunity(userInput, ventapelContext || { casos: CASOS_EXITO_REALES })
      }
    ];

    // Si es nueva oportunidad, manejar especialmente
    if (isNewOpportunity || userInput.toLowerCase().includes('nueva oportunidad') || userInput.toLowerCase().includes('nuevo cliente')) {
      const newOppResponse = handleNewOpportunity(userInput, ventapelContext || { casos: CASOS_EXITO_REALES });
      
      // Enviar a Claude para enriquecer si está disponible
      const claudeResponse = await callClaudeAPI(
        null,
        userInput,
        { casos: CASOS_EXITO_REALES },
        availableTools,
        webSearchResults
      );
      
      if (claudeResponse.type === 'direct_response') {
        return new Response(
          JSON.stringify({ response: claudeResponse.content }),
          { status: 200, headers }
        );
      }
      
      return new Response(
        JSON.stringify({ response: newOppResponse }),
        { status: 200, headers }
      );
    }

    // ============= PRIMERA LLAMADA A CLAUDE =============
    console.log('🤖 Llamando a Claude para:', userInput);
    
    const claudeResponse = await callClaudeAPI(
      opportunityData,
      userInput,
      { casos: CASOS_EXITO_REALES },
      availableTools,
      webSearchResults
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
          { casos: CASOS_EXITO_REALES },
          webSearchResults
        );
        
        return new Response(
          JSON.stringify({ response: finalResponse }),
          { status: 200, headers }
        );
      } else {
        console.log(`❌ Herramienta no encontrada: ${toolName}`);
        return new Response(
          JSON.stringify({ response: analyzeOpportunityLocal(opportunityData) }),
          { status: 200, headers }
        );
      }
    } else if (claudeResponse.type === 'direct_response') {
      // Claude respondió directamente
      console.log('✅ Claude respondió directamente');
      return new Response(
        JSON.stringify({ response: claudeResponse.content }),
        { status: 200, headers }
      );
    } else {
      // Fallback
      console.log('⚠️ Usando fallback local');
      return new Response(
        JSON.stringify({ response: claudeResponse.content }),
        { status: 200, headers }
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
