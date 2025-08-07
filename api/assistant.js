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

  // Detectar tipo de solicitud
  const requestType = detectRequestType(context);

  // System prompt mejorado con capacidades de email y más contexto
  const systemPrompt = `
Eres el asesor experto en ventas consultivas de Ventapel Brasil.
Utilizas la metodología PPVVCC (Pain, Power, Vision, Value, Control, Compras) para analizar y mejorar oportunidades.
Respondes directo, sin rodeos, como si fueras el CEO aconsejando al equipo.

CAPACIDADES ESPECIALES:
1. Generar emails de venta consultiva
2. Crear scripts de llamadas telefónicas
3. Preparar presentaciones y demos
4. Analizar competencia
5. Calcular ROI específico
6. Diseñar estrategias de cuenta
7. Resolver objeciones específicas

REGLAS CRÍTICAS - NUNCA VIOLAR:
1. SOLO usar datos REALES proporcionados en opportunityData o pipelineData
2. Si no hay datos de una oportunidad, responder: "No encontré esa oportunidad en el CRM. Use 'listar' para ver todas las disponibles."
3. NUNCA inventar clientes, valores, contactos o métricas
4. Si opportunityData es null, NO ASUMIR ningún dato
5. Si pipelineData.allOpportunities está vacío, decir que no hay oportunidades
6. NUNCA crear ejemplos ficticios de clientes que no existen

VALIDACIÓN DE DATOS:
- Si opportunityData === null → "No hay oportunidad seleccionada"
- Si searchContext?.found === false → "No encontré esa oportunidad"
- Solo usar clientes que aparezcan en pipelineData.allOpportunities

CONTEXTO VENTAPEL:
- Vendemos soluciones de empaquetado que reducen violación de cajas (3-5% promedio industria)
- Máquinas selladoras BP + cinta personalizada
- ROI típico: 3-6 meses
- Precio promedio: R$50,000 - R$200,000
- Casos de éxito: 
  * MercadoLibre: 40% reducción retrabalho, ROI 4 meses
  * Natura: 60% menos violaciones, ahorro R$85k/mes
  * Magazine Luiza: 35% reducción devoluciones
  * Dafiti: Eliminó retrabalho manual completamente

COMPETIDORES Y DIFERENCIADORES:
- 3M: Más caro (30%), solo cinta, sin máquinas
- Scotch: Calidad inferior, sin soporte técnico
- Genéricos chinos: 70% más baratos pero sin garantía ni soporte
- NUESTRO DIFERENCIAL: Solución completa (máquina + cinta + soporte) con garantía de reducción 40% o devolvemos dinero

${requestType === 'email' ? getEmailTemplates() : ''}
${requestType === 'script' ? getCallScriptTemplates() : ''}
${requestType === 'objection' ? getObjectionHandlers() : ''}

${pipelineData ? `
ANÁLISIS DEL PIPELINE COMPLETO:
Total oportunidades activas: ${pipelineData.allOpportunities?.length || 0}
Valor total en pipeline: R$${pipelineData.pipelineHealth?.totalValue?.toLocaleString() || 0}
Salud promedio del pipeline: ${pipelineData.pipelineHealth?.averageHealth || 0}/10
Oportunidades en riesgo: ${pipelineData.pipelineHealth?.atRisk || 0}
Valor en riesgo: R$${pipelineData.pipelineHealth?.riskValue?.toLocaleString() || 0}

TOP 3 DEALS PARA CERRAR ESTE MES:
${getTopDealsToClose(pipelineData)}
` : ''}

${opportunityData ? `
DATOS ESPECÍFICOS DE ${opportunityData.client}:
Valor: R$${opportunityData.value}
Industria: ${opportunityData.industry || 'No especificada'}
Etapa actual: ${getStageNameInPortuguese(opportunityData.stage)}
Vendedor: ${opportunityData.vendor}
Último contacto: ${opportunityData.last_update}
Días sin contacto: ${getDaysSinceLastContact(opportunityData.last_update)}

CONTACTOS EN LA CUENTA:
- Power Sponsor: ${opportunityData.power_sponsor || 'No identificado ⚠️'}
- Sponsor: ${opportunityData.sponsor || 'No identificado'}
- Influenciador: ${opportunityData.influencer || 'No identificado'}
- Contacto Apoyo: ${opportunityData.support_contact || 'No identificado'}

ESCALAS PPVVCC ACTUALES:
- DOR: ${opportunityData.scales?.pain || 0}/10 ${opportunityData.scales?.pain < 5 ? '🔴 CRÍTICO - Cliente no admite problema' : opportunityData.scales?.pain < 7 ? '🟡 Dolor admitido pero no urgente' : '🟢 Dolor crítico y urgente'}
- PODER: ${opportunityData.scales?.power || 0}/10 ${opportunityData.scales?.power < 4 ? '🔴 CRÍTICO - Sin acceso al decisor' : opportunityData.scales?.power < 7 ? '🟡 Acceso parcial al poder' : '🟢 Control total del poder'}
- VISÃO: ${opportunityData.scales?.vision || 0}/10 ${opportunityData.scales?.vision < 5 ? '🔴 No ve nuestra solución' : '🟢 Visión alineada'}
- VALOR: ${opportunityData.scales?.value || 0}/10 ${opportunityData.scales?.value < 5 ? '🔴 ROI no validado' : '🟢 ROI claro'}
- CONTROLE: ${opportunityData.scales?.control || 0}/10
- COMPRAS: ${opportunityData.scales?.purchase || 0}/10

ANÁLISIS SITUACIONAL:
${generateSituationalAnalysis(opportunityData)}

PRÓXIMA MEJOR ACCIÓN:
${generateNextBestAction(opportunityData)}
` : ''}

INSTRUCCIONES PARA RESPONDER:
${getResponseInstructions(requestType, context)}

PREGUNTA DEL USUARIO: ${context}
`;

  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('No se encontró API key de Claude');
      return res.status(200).json({ 
        response: generateEnhancedFallbackResponse(opportunityData, context, requestType)
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
        max_tokens: 3000, // Aumentado para emails largos
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
      response: data.content?.[0]?.text || generateEnhancedFallbackResponse(opportunityData, context, requestType),
      analysis: opportunityData ? generateSituationalAnalysis(opportunityData) : null
    });

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    res.status(200).json({ 
      response: generateEnhancedFallbackResponse(opportunityData, context, requestType)
    });
  }
}

// Detectar tipo de solicitud
function detectRequestType(context) {
  const lowerContext = context?.toLowerCase() || '';
  
  if (lowerContext.includes('email') || lowerContext.includes('correo') || lowerContext.includes('mensaje')) {
    return 'email';
  }
  if (lowerContext.includes('llamada') || lowerContext.includes('llamar') || lowerContext.includes('teléfono') || lowerContext.includes('script')) {
    return 'script';
  }
  if (lowerContext.includes('objeción') || lowerContext.includes('objection') || lowerContext.includes('caro') || lowerContext.includes('precio')) {
    return 'objection';
  }
  if (lowerContext.includes('demo') || lowerContext.includes('presentación')) {
    return 'demo';
  }
  if (lowerContext.includes('roi') || lowerContext.includes('retorno')) {
    return 'roi';
  }
  if (lowerContext.includes('competencia') || lowerContext.includes('3m') || lowerContext.includes('scotch')) {
    return 'competition';
  }
  
  return 'general';
}

// Templates de email según situación
function getEmailTemplates() {
  return `
TEMPLATES DE EMAIL SEGÚN SITUACIÓN:

1. PRIMER CONTACTO (DOR < 3):
Asunto: [Empresa] redujo 40% violación de cajas - caso relevante para [Cliente]
Estructura:
- Gancho con caso similar a su industria
- Problema específico que resolvemos (con números)
- Pregunta que genere reflexión
- CTA suave para conversar

2. REACTIVACIÓN (>7 días sin contacto):
Asunto: ¿Sigue siendo prioridad reducir los R$[cantidad] en retrabalho?
Estructura:
- Referencia última conversación
- Nuevo insight o caso de éxito
- Crear urgencia (competidor ya implementó)
- CTA específico con fecha/hora

3. AVANCE A DEMO (DOR > 6, PODER > 4):
Asunto: Demo personalizada Ventapel - [fecha] - reducción 40% violaciones
Estructura:
- Confirmar dolor específico admitido
- Agenda clara de la demo (30 min)
- Quién debe participar
- Resultados esperados post-demo

4. PROPUESTA COMERCIAL (VALOR > 6):
Asunto: Propuesta Ventapel [Cliente] - ROI 4.5 meses - Garantía 40% reducción
Estructura:
- Resumen ejecutivo con ROI
- Inversión y condiciones
- Garantías y casos de éxito
- Próximos pasos claros

5. FOLLOW-UP POST-DEMO:
Asunto: Próximos pasos - Implementación Ventapel en [Cliente]
Estructura:
- Recap de puntos clave de la demo
- Respuestas a preguntas pendientes
- Timeline de implementación
- Urgencia por disponibilidad de agenda
`;
}

// Scripts de llamada
function getCallScriptTemplates() {
  return `
SCRIPTS DE LLAMADA SEGÚN OBJETIVO:

1. LLAMADA DE CALIFICACIÓN (SPIN):
SITUACIÓN: "¿Cómo manejan hoy el empaquetado en el CD?"
PROBLEMA: "¿Qué % de cajas llegan violadas al cliente?"
IMPLICACIÓN: "¿Cuánto tiempo dedican a re-embalar?"
NEED-PAYOFF: "¿Qué valor tendría eliminar ese retrabalho?"

2. LLAMADA PARA ACCEDER AL PODER:
"[Nombre], para diseñar la mejor solución necesito entender las prioridades del gerente de operaciones. 
¿Podríamos incluirlo en una call de 20 minutos esta semana?"

3. LLAMADA DE CIERRE:
"[Nombre], ya identificamos R$[X] en ahorros mensuales.
Tengo disponibilidad para comenzar implementación en 2 semanas.
¿Qué necesitamos resolver para avanzar con el pedido de compra?"
`;
}

// Manejadores de objeciones
function getObjectionHandlers() {
  return `
MANEJO DE OBJECIONES COMUNES:

"ES MUY CARO":
1. Reframe a inversión: "Entiendo. ¿Comparado con los R$[X] que pierden mensualmente en retrabalho?"
2. Mostrar ROI: "La inversión se paga en 4 meses. Después es ahorro puro."
3. Caso similar: "MercadoLibre pensó lo mismo. Hoy ahorran R$180k/mes."

"YA TENEMOS PROVEEDOR (3M)":
1. No atacar: "3M es buena empresa. ¿Están 100% satisfechos con los resultados?"
2. Complementar: "Muchos clientes usan ambos. Nosotros para líneas críticas, 3M para el resto."
3. Prueba sin riesgo: "¿Probamos en una línea por 30 días? Si no reduce 40%, no cobro."

"NO ES PRIORIDAD AHORA":
1. Crear urgencia: "¿Saben que su competidor [X] ya redujo 35% sus costos con esto?"
2. Costo de no actuar: "Cada mes sin actuar son R$[X] perdidos. En 6 meses son R$[X*6]."
3. Facilitar: "Implementamos sin interrumpir operación. 2 horas y está funcionando."

"NECESITO PENSARLO":
1. Identificar concern real: "Perfecto. ¿Qué aspecto específico necesita evaluar?"
2. Crear deadline: "La promoción del 15% termina el viernes. ¿Lo revisamos el jueves?"
3. Involucrar: "¿Quién más participa en la decisión? Hagamos una call todos juntos."
`;
}

// Instrucciones específicas según tipo de request
function getResponseInstructions(requestType, context) {
  const instructions = {
    'email': `
GENERA UN EMAIL ESPECÍFICO:
- Asunto llamativo y específico
- Máximo 150 palabras
- Bullets para facilitar lectura
- CTA claro y único
- P.D. con urgencia o beneficio extra
- Tono profesional pero cercano
- Usa números concretos siempre`,
    
    'script': `
GENERA UN SCRIPT DE LLAMADA:
- Apertura de máximo 15 segundos
- Preguntas SPIN específicas
- Manejo de objeciones probables
- Frases exactas palabra por palabra
- Pausas marcadas [PAUSA]
- Máximo 5 minutos total`,
    
    'objection': `
RESPONDE LA OBJECIÓN:
- Nunca discutas o confrontes
- Primero valida su preocupación
- Reframe al valor/problema
- Usa caso de éxito similar
- Cierra con pregunta que avance`,
    
    'demo': `
PREPARA LA DEMO:
- Agenda de 30 minutos exactos
- 3 momentos WOW específicos
- Casos de su industria
- ROI calculado con sus números
- Dejar algo pendiente para próxima call`,
    
    'roi': `
CALCULA ROI ESPECÍFICO:
- Usa números reales del cliente
- Desglose mensual y anual
- Comparación con no hacer nada
- Casos similares con resultados
- Gráfico simple con payback`,
    
    'competition': `
ANALIZA COMPETENCIA:
- Nunca hables mal de competidores
- Resalta diferencias, no defectos
- Posiciónate en categoría diferente
- Casos donde coexisten
- Tu unique selling proposition`,
    
    'general': `
RESPONDE CON ANÁLISIS Y ACCIÓN:
- Diagnóstico brutal y directo
- Acción específica para HOY
- Script o mensaje exacto
- Consecuencia de no actuar
- Probabilidad real de cierre`
  };
  
  return instructions[requestType] || instructions.general;
}

// Análisis situacional mejorado
function generateSituationalAnalysis(opportunity) {
  if (!opportunity || !opportunity.scales) return 'Sin datos para análisis';
  
  const scales = opportunity.scales;
  const avg = (scales.pain + scales.power + scales.vision + 
               scales.value + scales.control + scales.purchase) / 6;
  
  let analysis = [];
  
  // Estado general
  if (avg < 4) {
    analysis.push('🔴 DEAL MORIBUNDO - Considerar descarte o intervención de emergencia');
  } else if (avg < 6) {
    analysis.push('🟡 DEAL TIBIO - Necesita trabajo intensivo esta semana');
  } else {
    analysis.push('🟢 DEAL CALIENTE - Presionar para cierre inmediato');
  }
  
  // Análisis por industria
  const industryInsights = {
    'e-commerce': 'Black Friday/Navidad cerca - Crear urgencia con timeline de implementación',
    'farmaceutica': 'ANVISA puede ser aliado - Mencionar compliance y trazabilidad',
    '3pl': 'Márgenes ajustados - Enfocar en reducción costo por pedido',
    'alimentos': 'Pérdida de producto = pérdida directa - Calcular valor producto perdido'
  };
  
  if (opportunity.industry && industryInsights[opportunity.industry.toLowerCase()]) {
    analysis.push(`\n💡 INSIGHT ${opportunity.industry}: ${industryInsights[opportunity.industry.toLowerCase()]}`);
  }
  
  // Días sin contacto
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  if (daysSince > 7) {
    analysis.push(`\n🚨 ${daysSince} DÍAS SIN CONTACTO - Deal enfriándose rápidamente`);
  }
  
  // Multi-threading
  const contacts = [opportunity.power_sponsor, opportunity.sponsor, opportunity.influencer].filter(Boolean);
  if (contacts.length < 2) {
    analysis.push('\n⚠️ SINGLE-THREADED - Alto riesgo si contacto se va o cambia prioridades');
  }
  
  return analysis.join('\n');
}

// Generar siguiente mejor acción mejorada
function generateNextBestAction(opportunity) {
  const scales = opportunity.scales;
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  // Prioridad 1: Deals fríos
  if (daysSince > 7) {
    return `
🚨 ACCIÓN URGENTE: Reactivar YA
EMAIL ASUNTO: "¿Sigue siendo prioridad reducir los R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales en retrabalho?"
CONTENIDO: Referencia última conversación + nuevo caso de éxito + crear urgencia
FOLLOW-UP: Llamar 2 horas después del email`;
  }
  
  // Prioridad 2: Dolor no admitido
  if (scales.pain < 5) {
    return `
🔴 ACCIÓN: Reunión para admitir dolor
SCRIPT: "${opportunity.client}, empresas similares pierden 3-5% por violación. 
Con sus ${opportunity.value / 50} envíos mensuales, son R$${Math.round(opportunity.value * 0.03).toLocaleString()} perdidos.
¿Cuál es su experiencia con este problema?"`;
  }
  
  // Prioridad 3: Sin acceso al poder
  if (scales.power < 4) {
    return `
🔴 ACCIÓN: Acceder al decisor esta semana
EMAIL: "Para garantizar el ROI de R$${Math.round(opportunity.value * 2.5).toLocaleString()} anual,
necesito 20 minutos con quien aprueba inversiones en logística.
¿Lo incluimos en nuestra call del jueves?"`;
  }
  
  // Prioridad 4: Avanzar al cierre
  if (scales.pain >= 7 && scales.power >= 6 && scales.value >= 6) {
    return `
🟢 ACCIÓN: Cerrar esta semana
LLAMADA: "Ya validamos R$${Math.round(opportunity.value * 0.2).toLocaleString()}/mes en ahorros.
Puedo comenzar implementación el lunes.
¿Qué necesitamos para el pedido de compra hoy?"`;
  }
  
  return 'ACCIÓN: Actualizar escalas PPVVCC para determinar siguiente paso';
}

// Funciones auxiliares
function getStageNameInPortuguese(stage) {
  const stages = {
    1: 'Prospecção',
    2: 'Qualificação', 
    3: 'Apresentação',
    4: 'Validação/Teste',
    5: 'Negociação',
    6: 'Fechado'
  };
  return stages[stage] || 'Desconhecido';
}

function getDaysSinceLastContact(lastUpdate) {
  if (!lastUpdate) return 999;
  const last = new Date(lastUpdate);
  const now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

function getTopDealsToClose(pipelineData) {
  if (!pipelineData?.allOpportunities) return 'Sin datos';
  
  const hotDeals = pipelineData.allOpportunities
    .filter(opp => {
      const avg = opp.scales ? 
        Object.values(opp.scales).reduce((a, b) => a + b, 0) / 6 : 0;
      return avg > 6 && opp.stage >= 3;
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  
  return hotDeals.map((deal, idx) => 
    `${idx + 1}. ${deal.client}: R$${deal.value.toLocaleString()} - ${deal.stage === 5 ? 'CERRAR YA' : 'Acelerar cierre'}`
  ).join('\n');
}

// Respuesta fallback mejorada con capacidad de email
function generateEnhancedFallbackResponse(opportunityData, context, requestType) {
  if (requestType === 'email' && opportunityData) {
    return generateEmailTemplate(opportunityData, context);
  }
  
  if (requestType === 'script' && opportunityData) {
    return generateCallScript(opportunityData, context);
  }
  
  if (!opportunityData) {
    return `No puedo generar contenido específico sin datos de la oportunidad.
    
Pero aquí está la estructura que necesitás:

📧 PARA EMAIL:
- Asunto con beneficio específico
- Párrafo de gancho (caso similar)
- Bullets con valor cuantificado  
- CTA con fecha específica
- P.D. con urgencia

📞 PARA LLAMADA:
- Apertura con referencia conocida
- Preguntas SPIN en secuencia
- Manejo de "no tengo tiempo"
- Cierre con próximo paso acordado

Cargá una oportunidad para contenido personalizado.`;
  }
  
  // Análisis estándar si no es email ni script
  const scales = opportunityData.scales || {};
  const avg = scales ? 
    (scales.pain + scales.power + scales.vision + scales.value + scales.control + scales.purchase) / 6 : 0;
  
  return `Análisis de ${opportunityData.client}:

ESTADO: ${avg < 4 ? '🔴 CRÍTICO' : avg < 7 ? '🟡 TIBIO' : '🟢 CALIENTE'} (${avg.toFixed(1)}/10)

PROBLEMA PRINCIPAL: ${
  scales.pain < 5 ? 'Cliente no admite el dolor' :
  scales.power < 4 ? 'Sin acceso al decisor' :
  scales.value < 5 ? 'ROI no validado' :
  'Listo para cerrar'
}

PRÓXIMA ACCIÓN:
${generateNextBestAction(opportunityData)}

💡 Preguntame específicamente:
- "Email para reactivar"
- "Script para llamada"  
- "Cómo manejar objeción de precio"
- "Preparar demo para ${opportunityData.client}"`;
}

// Generar template de email específico
function generateEmailTemplate(opportunity, context) {
  const scales = opportunity.scales;
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  if (daysSince > 7) {
    return `📧 EMAIL DE REACTIVACIÓN para ${opportunity.client}:

ASUNTO: ¿Sigue siendo prioridad reducir los R$${Math.round(opportunity.value * 0.15).toLocaleString()} en retrabalho?

${opportunity.power_sponsor || opportunity.sponsor || 'Estimado cliente'},

En nuestra última conversación del ${opportunity.last_update}, identificamos una oportunidad de ahorro de R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales en su operación.

Desde entonces, ayudamos a [empresa similar] a:
• Reducir 40% las violaciones de cajas
• Eliminar 3 horas diarias de retrabalho
• ROI completo en 4 meses

¿Sigue siendo prioridad resolver este tema en ${opportunity.client}?

¿Podemos agendar 15 minutos esta semana para mostrarle los resultados?

Saludos,
${opportunity.vendor}

P.D. Tengo un slot el jueves 10am o viernes 3pm. ¿Cuál prefiere?`;
  }
  
  if (scales.pain < 5) {
    return `📧 EMAIL PARA ADMITIR DOLOR - ${opportunity.client}:

ASUNTO: MercadoLibre redujo R$180k/mes en retrabalho - caso relevante para ${opportunity.client}

${opportunity.power_sponsor || 'Estimado cliente'},

Empresas de ${opportunity.industry || 'logística'} pierden en promedio 3-5% de sus envíos por violación de cajas.

Para ${opportunity.client}, con su volumen, esto representa aproximadamente:
• ${Math.round(opportunity.value / 50)} cajas violadas/mes
• R$${Math.round(opportunity.value * 0.15).toLocaleString()} en retrabalho mensual
• ${Math.round(opportunity.value / 50 * 0.03)} clientes insatisfechos

MercadoLibre tenía números similares. Hoy ahorra R$180k/mes.

¿Cómo manejan este tema en ${opportunity.client}?

¿Podemos conversar 20 minutos esta semana?

Saludos,
${opportunity.vendor}`;
  }
  
  // Email genérico si no hay caso específico
  return `📧 EMAIL PERSONALIZADO para ${opportunity.client}:

ASUNTO: Propuesta de valor Ventapel - ${opportunity.client}

${opportunity.power_sponsor || 'Estimado cliente'},

[PÁRRAFO APERTURA - Referencia a última conversación o trigger event]

Ventapel puede ayudar a ${opportunity.client} a:
• Reducir 40% las violaciones de cajas
• Ahorrar R$${Math.round(opportunity.value * 0.15).toLocaleString()}/mes en retrabalho
• Mejorar satisfacción del cliente final

[PÁRRAFO CASO DE ÉXITO - Similar a su industria]

¿Podemos agendar 30 minutos esta semana?

Saludos,
${opportunity.vendor}

P.D. [Urgencia o beneficio adicional]`;
}

// Generar script de llamada específico
function generateCallScript(opportunity, context) {
  const scales = opportunity.scales;
  
  return `📞 SCRIPT DE LLAMADA para ${opportunity.client}:

APERTURA (10 segundos):
"Hola ${opportunity.power_sponsor || opportunity.sponsor || 'María'}, soy ${opportunity.vendor} de Ventapel. 
¿Tiene 30 segundos? Le llamo por el tema de reducción de violaciones que conversamos."

[PAUSA - Esperar confirmación]

GANCHO (20 segundos):
"Perfecto. Desde nuestra última charla, ayudamos a [empresa similar] a reducir 40% sus violaciones.
Calculé que ${opportunity.client} podría ahorrar R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales."

PREGUNTAS SPIN:

SITUACIÓN:
"¿Cómo están manejando hoy el tema de cajas violadas en el CD?"
[ESCUCHAR - Tomar notas]

PROBLEMA:
"¿Qué porcentaje de sus ${Math.round(opportunity.value / 50)} envíos mensuales llegan dañados?"
[Si no sabe]: "La industria maneja 3-5%. ¿Creen estar en ese rango?"

IMPLICACIÓN:
"Con ese %, ¿cuánto tiempo dedica su equipo a re-embalar productos?"
"¿Cuál es el costo de cada devolución por daño?"

NEED-PAYOFF:
"Si pudieran eliminar ese retrabalho, ¿qué impacto tendría en su operación?"
"¿Qué valor le asignarían a reducir 40% las devoluciones?"

CIERRE (15 segundos):
"${opportunity.power_sponsor || 'Basado en lo que me cuenta'}, veo potencial de ahorro de R$${Math.round(opportunity.value * 2.5).toLocaleString()} anual.
¿Podemos agendar 30 minutos esta semana para mostrarle exactamente cómo?"

MANEJO DE OBJECIONES:

"No tengo tiempo ahora":
→ "Entiendo perfectamente. ¿Cuándo sería mejor? ¿Jueves 10am o viernes 3pm?"

"Envíeme información por email":
→ "Claro. Para enviarle info relevante, ¿cuál es su mayor desafío: violaciones, retrabalho o devoluciones?"

"Ya tenemos proveedor":
→ "Excelente. ¿Están 100% satisfechos con los resultados? La mayoría usa ambos proveedores."

CIERRE ALTERNATIVO:
"Le envío un video de 2 minutos mostrando el antes/después en MercadoLibre. ¿Lo vemos juntos el jueves?"`;
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
