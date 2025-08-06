// api/assistant.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, context, opportunityData } = req.body;

  // System prompt con metodología PPVVCC
  const systemPrompt = `
Eres el asesor experto en ventas consultivas de Ventapel Brasil.
Utilizas la metodología PPVVCC (Pain, Power, Vision, Value, Control, Compras) para analizar y mejorar oportunidades.

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

CÁLCULO DE ROI VENTAPEL:
- Costo retrabalho: Envíos/mes × % violación × R$15 por retrabalho
- Ahorro mano de obra: 2 segundos/caja × envíos × costo hora
- Reducción devoluciones: % actual × 40% mejora × costo devolución
- Payback típico: 3-6 meses

PERSONALIDADES DE DECISORES:
- Gerente Logística: Foco en KPIs y SLAs
- Gerente Operaciones: Productividad y costos
- Gerente Calidad: Satisfacción cliente y compliance
- Director General: ROI y ventaja competitiva
- Sustentabilidad: Reducción plástico y huella carbono

${opportunityData ? `
DATOS ESPECÍFICOS DE LA OPORTUNIDAD:
Cliente: ${opportunityData.client}
Valor: R$${opportunityData.value}
Industria: ${opportunityData.industry || 'No especificada'}
Etapa actual: ${opportunityData.stage}
Escalas PPVVCC actuales:
- DOR: ${opportunityData.scales.pain}/10 ${opportunityData.scales.pain < 5 ? '⚠️ CRÍTICO' : ''}
- PODER: ${opportunityData.scales.power}/10 ${opportunityData.scales.power < 4 ? '⚠️ CRÍTICO' : ''}
- VISÃO: ${opportunityData.scales.vision}/10
- VALOR: ${opportunityData.scales.value}/10
- CONTROLE: ${opportunityData.scales.control}/10
- COMPRAS: ${opportunityData.scales.purchase}/10
Promedio: ${(Object.values(opportunityData.scales).reduce((a,b) => a+b, 0) / 6).toFixed(1)}/10

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

Ahora responde la consulta del usuario de manera directa y accionable.
`;

  function analyzeOpportunity(opp) {
    const scales = opp.scales;
    const avg = Object.values(scales).reduce((a,b) => a+b, 0) / 6;
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

    // Probabilidad de cierre
    let prob = 0;
    if (avg >= 7) prob = 70;
    else if (avg >= 5) prob = 40;
    else if (avg >= 3) prob = 20;
    else prob = 5;
    
    analysis.push(`\n📊 Probabilidad de cierre: ${prob}%`);

    return analysis.join('\n');
  }

  try {
    // Si es una búsqueda web
    if (context && context.includes('investigar') || context.includes('buscar')) {
      const searchQuery = extractSearchQuery(context);
      if (searchQuery) {
        const searchResults = await searchWeb(searchQuery);
        // Procesar resultados de búsqueda
      }
    }

    // Llamada a Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          ...messages,
          { role: 'user', content: context || messages[messages.length - 1].content }
        ]
      })
    });

    const data = await response.json();
    
    res.status(200).json({ 
      response: data.content[0].text,
      analysis: opportunityData ? analyzeOpportunity(opportunityData) : null
    });

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    // Respuesta de fallback con análisis básico
    if (opportunityData) {
      const basicAnalysis = analyzeOpportunity(opportunityData);
      res.status(200).json({ 
        response: `Análisis rápido de ${opportunityData.client}:\n\n${basicAnalysis}\n\nRecomendación: Enfocate en la escala más baja y usá SPIN para evolucionar.`,
        analysis: basicAnalysis
      });
    } else {
      res.status(500).json({ 
        error: 'Error processing request',
        response: 'No pude procesar tu consulta. Intentá ser más específico sobre la oportunidad.' 
      });
    }
  }
}

// Función para búsqueda web si es necesario
async function searchWeb(query) {
  try {
    const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${process.env.SERPER_API_KEY}`);
    const data = await response.json();
    return data.organic_results || [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

function extractSearchQuery(context) {
  // Extraer términos de búsqueda del contexto
  const match = context.match(/investigar|buscar|información sobre\s+(.+)/i);
  return match ? match[1] : null;
}
