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

  // System prompt con metodología PPVVCC mejorado
  const systemPrompt = `
Eres el asesor experto en ventas consultivas de Ventapel Brasil.
Utilizas la metodología PPVVCC (Pain, Power, Vision, Value, Control, Compras) para analizar y mejorar oportunidades.
Respondes directo, sin rodeos, como si fueras el CEO aconsejando al equipo.

CONTEXTO VENTAPEL:
- Vendemos soluciones de empaquetado que reducen violación de cajas, retrabalho y costos logísticos
- No vendemos productos, vendemos soluciones a problemas
- Casos de éxito: MercadoLibre (40% reducción retrabalho), Natura (60% menos violaciones)
- ROI típico: 3-6 meses
- Precio promedio: R$50,000 - R$200,000

METODOLOGÍA PPVVCC - EVALÚA SIEMPRE:
1. DOR (0-10): ¿El cliente admite y cuantifica el problema?
2. PODER (0-10): ¿Estamos hablando con quien decide?
3. VISÃO (0-10): ¿Entiende nuestra solución completa?
4. VALOR (0-10): ¿Reconoce el ROI y valor más allá del precio?
5. CONTROLE (0-10): ¿Tenemos un plan claro con fechas?
6. COMPRAS (0-10): ¿Conocemos su proceso de compra?

REGLAS CRÍTICAS:
- NUNCA avanzar si DOR < 5 (el decisor no admitió el problema)
- NUNCA presentar si PODER < 4 (no tienes acceso al decisor)
- NUNCA negociar precio si VALOR < 5 (no ve el ROI)
- Si promedio PPVVCC < 4: Oportunidad en riesgo crítico
- Si hace > 5 días sin contacto: Alerta urgente de reactivación

MÉTODO SPIN PARA EVOLUCIONAR ESCALAS:
- Situación: Estado actual del proceso
- Problema: Síntomas y dificultades específicas
- Implicación: Costo real del problema (horas, dinero, retrabalho)
- Need-Payoff: Valor de resolver el problema

INDUSTRIAS Y SUS DOLORES TÍPICOS:
- E-commerce: Devoluciones por daños (3-5% típico)
- Farmacéutica: Contaminación y compliance
- Alimentos: Violación y pérdida de producto
- 3PL: Retrabalho y multas de clientes
- Manufactura: Ergonomía y productividad

${pipelineData ? `
ANÁLISIS DEL PIPELINE COMPLETO:
Total oportunidades activas: ${pipelineData.allOpportunities?.length || 0}
Valor total en pipeline: R$${pipelineData.pipelineHealth?.totalValue?.toLocaleString() || 0}
Salud promedio del pipeline: ${pipelineData.pipelineHealth?.averageHealth || 0}/10
Oportunidades en riesgo: ${pipelineData.pipelineHealth?.atRisk || 0}
Valor en riesgo: R$${pipelineData.pipelineHealth?.riskValue?.toLocaleString() || 0}
` : ''}

${opportunityData ? `
DATOS ESPECÍFICOS DE LA OPORTUNIDAD:
Cliente: ${opportunityData.client}
Valor: R$${opportunityData.value}
Industria: ${opportunityData.industry || 'No especificada'}
Etapa actual: ${opportunityData.stage}
Vendedor: ${opportunityData.vendor}

ESCALAS PPVVCC ACTUALES:
- DOR: ${opportunityData.scales?.pain || 0}/10 ${opportunityData.scales?.pain < 5 ? '⚠️ CRÍTICO' : ''}
- PODER: ${opportunityData.scales?.power || 0}/10 ${opportunityData.scales?.power < 4 ? '⚠️ CRÍTICO' : ''}
- VISÃO: ${opportunityData.scales?.vision || 0}/10
- VALOR: ${opportunityData.scales?.value || 0}/10
- CONTROLE: ${opportunityData.scales?.control || 0}/10
- COMPRAS: ${opportunityData.scales?.purchase || 0}/10

Promedio: ${opportunityData.scales ? 
  ((opportunityData.scales.pain + opportunityData.scales.power + opportunityData.scales.vision + 
    opportunityData.scales.value + opportunityData.scales.control + opportunityData.scales.purchase) / 6).toFixed(1) 
  : 0}/10

ANÁLISIS INMEDIATO:
${analyzeOpportunity(opportunityData)}
` : ''}

ESTILO DE RESPUESTA:
- Directo y sin rodeos (sos el CEO, no hay tiempo que perder)
- Usa números y datos concretos siempre
- Da scripts palabra por palabra cuando sea necesario
- Señala riesgos sin diplomatismo
- Enfoque en cerrar ventas, no en ser amable
- Responde en español rioplatense
- Si no tenés datos específicos, pedí la información que necesitás

PREGUNTA DEL USUARIO: ${context}
`;

  function analyzeOpportunity(opp) {
    if (!opp || !opp.scales) return 'Sin datos de escalas para analizar';
    
    const scales = opp.scales;
    const avg = (scales.pain + scales.power + scales.vision + 
                 scales.value + scales.control + scales.purchase) / 6;
    
    let analysis = [];

    // Análisis de bloqueos críticos
    if (scales.pain < 5) {
      analysis.push('🔴 BLOQUEADO: Cliente no admite el problema. NO AVANCES hasta documentar dolor cuantificado.');
    }
    if (scales.power < 4) {
      analysis.push('🔴 RIESGO: Sin acceso al decisor real. Conseguí reunión con gerente YA.');
    }
    if (scales.vision < 4) {
      analysis.push('⚠️ Cliente no entiende la solución completa. Necesita demo con caso similar.');
    }
    if (scales.value < 4) {
      analysis.push('⚠️ No ve el ROI. Calculá savings específicos con sus números.');
    }

    // Recomendación de próximo paso
    if (scales.pain < 5) {
      analysis.push('\n✅ PRÓXIMO PASO: Reunión para mapear proceso actual y cuantificar retrabalho/violaciones.');
    } else if (scales.power < 4) {
      analysis.push('\n✅ PRÓXIMO PASO: Pedí acceso al gerente de logística/operaciones HOY.');
    } else if (scales.vision < 5) {
      analysis.push('\n✅ PRÓXIMO PASO: Demo personalizada mostrando caso de éxito en su industria.');
    } else if (scales.value < 5) {
      analysis.push('\n✅ PRÓXIMO PASO: Presentación ROI con sus números reales.');
    } else if (avg > 7) {
      analysis.push('\n✅ PRÓXIMO PASO: Propuesta formal y plan de implementación 30 días.');
    }

    // Probabilidad de cierre real
    let prob = 0;
    if (avg >= 7) prob = 70;
    else if (avg >= 5) prob = 40;
    else if (avg >= 3) prob = 20;
    else prob = 5;
    
    analysis.push(`\n📊 Probabilidad real de cierre: ${prob}%`);
    
    // Días sin contacto
    if (opp.last_update) {
      const daysSince = Math.floor((Date.now() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 5) {
        analysis.push(`\n🚨 ALERTA: ${daysSince} días sin contacto. Deal enfriándose!`);
      }
    }

    return analysis.join('\n');
  }

  try {
    // Verificar si tenemos API key de Claude
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('No se encontró API key de Claude');
      // Respuesta de fallback sin API
      return res.status(200).json({ 
        response: generateFallbackResponse(opportunityData, context)
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
        model: 'claude-3-5-sonnet-20241022', // Modelo más nuevo y eficiente
        max_tokens: 2000,
        temperature: 0.7,
        system: systemPrompt,
        messages: messages && messages.length > 0 ? messages : [
          { role: 'user', content: context || 'Analiza esta oportunidad' }
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
      response: data.content?.[0]?.text || 'No se pudo procesar la respuesta de Claude.',
      analysis: opportunityData ? analyzeOpportunity(opportunityData) : null
    });

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    // Respuesta de fallback mejorada
    res.status(200).json({ 
      response: generateFallbackResponse(opportunityData, context)
    });
  }
}

// Función de fallback mejorada cuando no hay API o falla
function generateFallbackResponse(opportunityData, context) {
  if (!opportunityData) {
    return `No puedo analizar sin datos de la oportunidad. 
    
Necesito que me proporciones:
- Cliente y valor del deal
- Escalas PPVVCC actuales
- Etapa del pipeline
- Último contacto

Mientras tanto, recordá las reglas de oro:
1. Sin dolor admitido = No hay venta
2. Sin acceso al poder = Deal estancado
3. Sin ROI claro = Objeción de precio garantizada`;
  }

  const scales = opportunityData.scales || {};
  const avg = scales ? 
    (scales.pain + scales.power + scales.vision + scales.value + scales.control + scales.purchase) / 6 : 0;

  let response = `Análisis rápido de ${opportunityData.client}:\n\n`;

  // Diagnóstico principal
  if (avg < 4) {
    response += `🔴 DEAL EN RIESGO CRÍTICO (${avg.toFixed(1)}/10)\n`;
    response += `Este deal tiene alta probabilidad de perderse.\n\n`;
  } else if (avg < 7) {
    response += `🟡 DEAL TIBIO (${avg.toFixed(1)}/10)\n`;
    response += `Necesita trabajo urgente para no perder momentum.\n\n`;
  } else {
    response += `🟢 DEAL CALIENTE (${avg.toFixed(1)}/10)\n`;
    response += `Excelente posición. Presioná para cerrar.\n\n`;
  }

  // Problema principal
  if (scales.pain < 5) {
    response += `⛔ PROBLEMA CRÍTICO: Cliente no admite el dolor (${scales.pain}/10)\n`;
    response += `ACCIÓN: No avances hasta que admita y cuantifique el problema.\n`;
    response += `SCRIPT: "¿Cuánto les está costando el retrabalho por cajas dañadas cada mes?"\n\n`;
  } else if (scales.power < 4) {
    response += `⛔ PROBLEMA CRÍTICO: Sin acceso al decisor (${scales.power}/10)\n`;
    response += `ACCIÓN: Conseguí reunión con el gerente esta semana o el deal morirá.\n`;
    response += `SCRIPT: "Para diseñar la mejor solución, necesito 20 minutos con quien aprueba esta inversión."\n\n`;
  } else if (scales.value < 5) {
    response += `⚠️ PROBLEMA: ROI no validado (${scales.value}/10)\n`;
    response += `ACCIÓN: Presentá números concretos de ahorro.\n`;
    response += `CÁLCULO: ${opportunityData.value} / 5 = R$${(opportunityData.value/5).toLocaleString()} ahorro mensual necesario\n\n`;
  }

  // Próximos pasos
  response += `PRÓXIMOS 3 PASOS:\n`;
  response += `1. ${scales.pain < 5 ? 'Cuantificar dolor con el cliente' : 'Validar dolor con decisor'}\n`;
  response += `2. ${scales.power < 4 ? 'Acceder al poder real' : 'Confirmar proceso de compra'}\n`;
  response += `3. ${scales.value < 5 ? 'Presentar ROI específico' : 'Proponer plan de implementación'}\n\n`;

  // Pregunta específica
  if (context.toLowerCase().includes('spin')) {
    response += `\nPREGUNTAS SPIN PARA ${opportunityData.client}:\n`;
    response += `S: "¿Cómo manejan hoy el empaquetado en su centro de distribución?"\n`;
    response += `P: "¿Qué porcentaje de sus envíos llegan dañados al cliente?"\n`;
    response += `I: "¿Cuánto tiempo dedican a re-embalar productos dañados?"\n`;
    response += `N: "¿Qué valor tendría reducir las devoluciones en un 40%?"\n`;
  }

  return response;
}

// Para Vercel
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
