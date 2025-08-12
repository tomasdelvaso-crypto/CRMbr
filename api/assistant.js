// api/assistant.js - BACKEND INTELIGENTE - EL CEREBRO
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

// ============= LLAMADA A CLAUDE API - COACH DE VENTAS =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!ANTHROPIC_API_KEY) {
    console.log('⚠️ Claude API no configurada, usando análisis local');
    return null;
  }

  try {
    const promptTemplate = `Eres "Ventus", un coach de ventas de clase mundial y experto absoluto en la metodología de Ventas Consultivas PPVVCC de Ventapel Brasil. Tu único objetivo es ayudar a los vendedores a CERRAR MÁS VENTAS analizando oportunidades específicas y proporcionando ESTRATEGIAS y ACCIONES CONCRETAS para avanzar en el funil.

**REGLAS FUNDAMENTALES:**
1. **FOCO EN LA ACCIÓN:** Cada respuesta debe ser un paso tangible. No des consejos genéricos. Tu meta es ayudar a subir el score en las escalas PPVVCC y pasar a la siguiente etapa del funil.
2. **BASADO EN DATOS:** Basa tu análisis ESTRICTAMENTE en los datos proporcionados en el CONTEXTO. No inventes información.
3. **METODOLOGÍA ES REY:** Tu cerebro funciona 100% sobre la metodología PPVVCC (DOR, PODER, VISÃO, VALOR, CONTROLE, COMPRAS).
4. **CONCISO Y DIRECTO:** Usa Markdown (negritas, listas) para que la respuesta sea fácil de leer. Máximo 150 palabras a menos que se pida análisis profundo.

---

**CONTEXTO DE LA OPORTUNIDAD:**

**1. Oportunidad Actual:**
${JSON.stringify(opportunityData, null, 2)}

**2. Contexto Ventapel:**
{
  "casosExito": ${JSON.stringify(ventapelContext.casos, null, 2)},
  "metodologia": "PPVVCC - Dor, Poder, Visão, Valor, Controle, Compras"
}

**3. Solicitud del Vendedor:**
"${userInput}"

**TAREA:**
Basado en TODO el contexto anterior, responde siguiendo este formato de 3 pasos:

1. **Diagnóstico Rápido:** En una frase, identifica el principal cuello de botella según PPVVCC.

2. **Estrategia PPVVCC:** Plan de acción claro (2-3 puntos) para resolver el cuello de botella.

3. **Acción Inmediata:** Proporciona UNA herramienta lista para usar:
   - Un borrador de email corto y directo, O
   - Un script de apertura para llamada (2-3 líneas), O
   - 3 preguntas SPIN para la próxima reunión

Comienza tu respuesta directamente, sin saludos.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          { role: "user", content: promptTemplate }
        ]
      })
    });

    if (!response.ok) {
      console.log('Claude API no disponible, usando lógica local');
      return null;
    }

    const data = await response.json();
    return data.content[0].text;
    
  } catch (error) {
    console.log('Error llamando a Claude:', error);
    return null;
  }
}

// ============= ANÁLISIS LOCAL PPVVCC =============
function analyzeOpportunityLocal(opp) {
  if (!opp) return "❌ No hay oportunidad seleccionada. Selecciona un cliente del CRM.";
  
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

// ============= ESTRATEGIA DE DOLOR (SPIN) =============
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

// ============= CALCULAR ROI ESPECÍFICO =============
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

// ============= GENERAR EMAIL DE VENTA =============
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

// ============= GENERAR SCRIPT DE LLAMADA =============
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

// ============= ESTRATEGIA COMPLETA =============
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

// ============= HANDLER PRINCIPAL - EL CEREBRO =============
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { 
      action,
      userInput,
      opportunityData,
      vendorName
    } = body;

    console.log('🧠 Backend recibió:', { action, userInput, hasOpportunity: !!opportunityData });

    let response = '';

    // CAMBIO CLAVE: Si hay userInput con texto libre, SIEMPRE intentar Claude primero
    if (userInput && opportunityData) {
      const lowerInput = userInput.toLowerCase();
      
      // Detectar si es una pregunta compleja que requiere Claude
      const needsClaude = 
        lowerInput.includes('ayuda') ||
        lowerInput.includes('pens') ||
        lowerInput.includes('caro') ||
        lowerInput.includes('objeción') ||
        lowerInput.includes('precio') ||
        lowerInput.includes('claude') ||
        lowerInput.includes('?') ||
        lowerInput.length > 20 || // Textos más largos probablemente necesitan análisis
        !['analizar', 'dolor', 'roi', 'email', 'llamada', 'estrategia'].some(cmd => lowerInput.includes(cmd));
      
      if (needsClaude || action === 'chat') { // 'chat' para mensajes libres
        console.log('🤖 Intentando Claude para:', userInput);
        
        const claudeResponse = await callClaudeAPI(
          opportunityData,
          userInput,
          { casos: CASOS_EXITO_REALES }
        );
        
        if (claudeResponse) {
          console.log('✅ Claude respondió');
          return new Response(
            JSON.stringify({ response: claudeResponse }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('⚠️ Claude no disponible, usando lógica local');
        }
      }
    }

    // Lógica local según acción (como fallback o para botones rápidos)
    switch(action) {
      case 'analizar':
        response = analyzeOpportunityLocal(opportunityData);
        break;
        
      case 'dolor':
        response = generatePainStrategy(opportunityData);
        break;
        
      case 'roi':
        response = calculateROI(opportunityData);
        break;
        
      case 'email':
        response = generateEmail(opportunityData);
        break;
        
      case 'llamada':
        response = generateCallScript(opportunityData);
        break;
        
      case 'estrategia':
        response = generateCompleteStrategy(opportunityData);
        break;
        
      case 'chat': // Para mensajes de chat libre
      default:
        // Si llegamos aquí y hay userInput, procesar con lógica local mejorada
        if (userInput && opportunityData) {
          const lowerInput = userInput.toLowerCase();
          
          // Manejo de objeciones comunes
          if (lowerInput.includes('caro') || lowerInput.includes('precio')) {
            response = `💰 **MANEJO DE OBJECIÓN: "ES MUY CARO"**\n\n`;
            response += `**RESPUESTA TÁCTICA:**\n`;
            response += `"Entiendo tu preocupación. Déjame mostrarte algo:\n\n`;
            response += `• Pérdida actual: R$ ${Math.round(opportunityData.value * 0.1).toLocaleString('pt-BR')}/mes\n`;
            response += `• En 12 meses: R$ ${Math.round(opportunityData.value * 1.2).toLocaleString('pt-BR')}\n`;
            response += `• Nuestra solución: R$ 45.000 (única vez)\n`;
            response += `• ROI: 3-6 meses\n\n`;
            response += `No es un gasto, es dejar de perder dinero.\n`;
            response += `¿Qué es más caro: invertir R$ 45k o seguir perdiendo R$ 240k/año?"\n\n`;
            response += `**PREGUNTA DE CIERRE:**\n`;
            response += `"Si te muestro cómo recuperas la inversión en 3 meses, ¿lo considerarías?"`;
            
          } else if (lowerInput.includes('ayuda') || lowerInput.includes('pens')) {
            response = `🤔 **ANÁLISIS ESTRATÉGICO - ${opportunityData.client}**\n\n`;
            response += `**SITUACIÓN ACTUAL:**\n`;
            response += `• Dolor bajo (${getScaleValue(opportunityData.scales?.dor)}/10) = Sin urgencia\n`;
            response += `• Poder bajo (${getScaleValue(opportunityData.scales?.poder)}/10) = Sin decisor\n\n`;
            response += `**ESTRATEGIA RECOMENDADA:**\n`;
            response += `1. **HOY:** Llamada SPIN agresiva sobre pérdidas\n`;
            response += `2. **MAÑANA:** Email con caso Nike/MercadoLibre\n`;
            response += `3. **PASADO:** Pedir reunión con decisor real\n\n`;
            response += `**MENSAJE CLAVE:**\n`;
            response += `"Cada día sin actuar = R$ 667 perdidos"`;
            
          } else {
            // Fallback a análisis estándar
            response = analyzeOpportunityLocal(opportunityData);
          }
        } else if (!opportunityData) {
          response = `❌ **No hay cliente seleccionado**\n\n`;
          response += `Selecciona un cliente del CRM para análisis completo.`;
        } else {
          response = `👋 Hola ${vendorName || 'vendedor'}!\n\n`;
          response += `Soy tu Coach PPVVCC. ¿En qué puedo ayudarte?`;
        }
    }

    return new Response(
      JSON.stringify({ response }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error en backend:', error);
    
    return new Response(
      JSON.stringify({ 
        response: '❌ Error procesando. Intenta de nuevo.',
        error: error.message 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
