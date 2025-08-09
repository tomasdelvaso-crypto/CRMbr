// ============= FUNCIÓN PARA BUSCAR EN GOOGLE =============
async function searchGoogleForContext(query) {
  const SERPER_API_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_API_KEY) return null;
  
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
      return data.organic.map(r => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
        hasRevenue: r.snippet?.includes('R$') || r.snippet?.includes('milhões') || r.snippet?.includes('bilhões'),
        hasEmployees: r.snippet?.match(/\d+\s*(funcionários|empleados|employees)/i) !== null,
        hasExpansion: r.snippet?.toLowerCase().includes('expansão') || r.snippet?.toLowerCase().includes('novo centro'),
        hasProblems: r.snippet?.toLowerCase().includes('problema') || r.snippet?.toLowerCase().includes('desafio')
      }));
    }
    return null;
  } catch (error) {
    console.error('Error buscando en Google:', error);
    return null;
  }
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
    // NUEVO: Recibir el tipo de solicitud especial desde el frontend
    specialRequestType 
  } = req.body;

  // Detectar tipo de solicitud
  const requestType = detectRequestType(context);

  // ================================================================
  // NUEVO: MANEJO DE SOLICITUDES ESPECIALES
  // ================================================================
  if (specialRequestType === 'weekly_plan' && pipelineData) {
      const weeklyPlan = generateWeeklyPlan(pipelineData.allOpportunities, pipelineData.vendorName);
      return res.status(200).json({ response: weeklyPlan });
  }

  // Lógica para detectar intención de actualizar CRM
  const updateIntent = detectUpdateIntent(context);
  if (updateIntent) {
      const confirmationMessage = `Entendido. Detectei uma atualização para **${updateIntent.client || opportunityData?.client}**.
      
      Você quer que eu atualize a escala de **${updateIntent.scale.toUpperCase()}** para **${updateIntent.newValue}/10** no CRM?
      
      [Sim, atualizar agora|update:${updateIntent.scale}:${updateIntent.newValue}:${updateIntent.client || opportunityData?.id}]
      [Cancelar|cancel]`;
      return res.status(200).json({ response: confirmationMessage });
  }
  // ================================================================

  // MANEJO DE NUEVA OPORTUNIDAD
  if (isNewOpportunity) {
    return handleNewOpportunity(req, res, context, ventapelContext);
  }

  // VALIDAR SI LA BÚSQUEDA FALLÓ
  if (searchContext && searchContext.found === false) {
    return res.status(200).json({
      response: `❌ No encontré "${searchContext.searchTerm}" en el CRM.\n\n` +
                `📋 Oportunidades disponibles:\n` +
                (pipelineData?.allOpportunities?.slice(0, 10).map(o => 
                  `• ${o.client} - R$${o.value?.toLocaleString() || 0}`
                ).join('\n') || 'No hay oportunidades cargadas') +
                `\n\n💡 Usa "listar" para ver todas o escribe el nombre exacto del cliente.`
    });
  }

  // Buscar información adicional en Google si hay una oportunidad
  let googleContext = null;
  if (opportunityData && opportunityData.client) {
    const needsWebSearch = context.toLowerCase().includes('actualiz') || 
                          context.toLowerCase().includes('noticia') ||
                          context.toLowerCase().includes('reciente') ||
                          context.toLowerCase().includes('información') ||
                          context.toLowerCase().includes('expansion') ||
                          context.toLowerCase().includes('facturación');
    
    if (needsWebSearch) {
      console.log('Buscando en Google para:', opportunityData.client);
      googleContext = await searchGoogleForContext(
        `${opportunityData.client} Brasil ${opportunityData.industry || ''} facturación empleados noticias 2024 2025`
      );
    }
  }

  // System prompt mejorado
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
8. Usar información actualizada de internet cuando está disponible
9. Estructurar nuevas oportunidades en formato PPVVCC

REGLAS CRÍTICAS - NUNCA VIOLAR:
1. SOLO usar datos REALES proporcionados en opportunityData, pipelineData o googleContext
2. Si no hay datos de una oportunidad, responder: "No encontré esa oportunidad en el CRM. Use 'listar' para ver todas las disponibles."
3. NUNCA inventar clientes, valores, contactos o métricas
4. Si opportunityData es null, NO ASUMIR ningún dato
5. Si pipelineData.allOpportunities está vacío, decir que no hay oportunidades
6. NUNCA crear ejemplos ficticios de clientes que no existen
7. Si hay googleContext, usarlo para enriquecer la respuesta con información actualizada

CONTEXTO VENTAPEL:
- Vendemos soluciones de empaquetado que reducen violación de cajas (3-5% promedio industria)
- Máquinas selladoras: BP555e, BP755, BP333, BP222, RSA (Random Sealer Automated)
- Cintas: VENOM (reinforced water-activated), Gorilla (300m y 700m)
- ROI típico: 2-3 meses
- Precio promedio: R$50,000 - R$250,000
- Casos de éxito: 
  * L'Oréal: 100% furtos eliminados, +50% eficiencia, ROI 3 meses
  * Nike: Furtos zero, +30% eficiencia, ROI 2 meses
  * MercadoLibre: 40% reducción retrabalho, ahorro R$180k/mes
  * Natura: 60% menos violaciones, ahorro R$85k/mes
  * Magazine Luiza: 35% reducción devoluciones
  * Centauro: 95% reducción furtos, economía R$50M/año
  * Honda Argentina: +40% velocidad, 100% reducción faltantes

COMPETIDORES Y DIFERENCIADORES:
- 3M: Más caro (30%), solo cinta, sin máquinas
- Scotch: Calidad inferior, sin soporte técnico
- Genéricos chinos: 70% más baratos pero sin garantía ni soporte
- NUESTRO DIFERENCIAL: Solución completa (máquina + cinta + soporte) con garantía de reducción 40% o devolvemos dinero

${googleContext && googleContext.length > 0 ? `
📰 INFORMACIÓN ACTUALIZADA DE INTERNET sobre ${opportunityData?.client}:
${googleContext.map((r, idx) => `
${idx + 1}. ${r.title}
   ${r.snippet}
   ${r.hasRevenue ? '💰 Menciona facturación o números financieros' : ''}
   ${r.hasEmployees ? '👥 Menciona cantidad de empleados' : ''}
   ${r.hasExpansion ? '🚀 Menciona expansión o crecimiento' : ''}
   ${r.hasProblems ? '⚠️ Menciona problemas o desafíos' : ''}
   Fuente: ${r.link}
`).join('\n')}

INSTRUCCIONES PARA USAR ESTA INFO:
- Si hay expansión mencionada → Es momento ideal para propuesta (están invirtiendo)
- Si hay problemas logísticos → Conectar directamente con nuestra solución
- Si hay datos financieros → Dimensionar correctamente la propuesta
- Si hay cambios recientes → Usarlos como trigger para reactivar
- SIEMPRE mencionar que tienes información actualizada cuando la uses
` : ''}

${requestType === 'email' ? getEmailTemplates(googleContext) : ''}
${requestType === 'script' ? getCallScriptTemplates(googleContext) : ''}
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
${generateSituationalAnalysis(opportunityData, googleContext)}

PRÓXIMA MEJOR ACCIÓN:
${generateNextBestAction(opportunityData, googleContext)}
` : ''}

INSTRUCCIONES PARA RESPONDER:
${getResponseInstructions(requestType, context)}
${googleContext ? '\n- MENCIONA que tienes información actualizada de internet cuando sea relevante' : ''}

PREGUNTA DEL USUARIO: ${context}
`;

  try {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      console.error('No se encontró API key de Claude');
      return res.status(200).json({ 
        response: generateEnhancedFallbackResponse(opportunityData, context, requestType, googleContext)
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
        model: process.env.CLAUDE_MODEL_NAME || 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
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
      response: data.content?.[0]?.text || generateEnhancedFallbackResponse(opportunityData, context, requestType, googleContext),
      analysis: opportunityData ? generateSituationalAnalysis(opportunityData, googleContext) : null
    });

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    res.status(200).json({ 
      response: generateEnhancedFallbackResponse(opportunityData, context, requestType, googleContext)
    });
  }
}

// ================================================================
// NUEVA FUNCIÓN: Generar Plan Semanal
// ================================================================
function generateWeeklyPlan(opportunities, vendorName = "Vendedor") {
    if (!opportunities || opportunities.length === 0) {
        return "No hay oportunidades en tu pipeline para planificar la semana.";
    }

    const getHealthScore = (scales) => {
        if (!scales) return 0;
        const scaleValues = Object.values(scales);
        if (scaleValues.length === 0) return 0;
        return scaleValues.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0) / scaleValues.length;
    };

    const focus = opportunities
        .filter(opp => getHealthScore(opp.scales) >= 7 && opp.stage >= 4)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

    const atRisk = opportunities
        .filter(opp => getHealthScore(opp.scales) < 5 || getDaysSinceLastContact(opp.last_update) > 7)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
        
    const nurture = opportunities
        .filter(opp => getHealthScore(opp.scales) >= 5 && getHealthScore(opp.scales) < 7 && opp.stage < 4)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

    let plan = `📅 **Plano de Ação para sua Semana, ${vendorName}!**\n\n`;

    plan += "🔥 **FOCO MÁXIMO (Deals para Fechar ou Avançar para Proposta):**\n";
    if (focus.length > 0) {
        focus.forEach(opp => {
            plan += `* **${opp.client} (R$${opp.value.toLocaleString()})**: Saúde ${getHealthScore(opp.scales).toFixed(1)}/10. **Ação:** Pressionar para o fechamento. Validar últimos detalhes com Compras.\n`;
        });
    } else {
        plan += "* Nenhum deal quente no momento. Vamos aquecer o pipeline!\n";
    }

    plan += "\n⚠️ **ATENÇÃO URGENTE (Deals em Risco):**\n";
    if (atRisk.length > 0) {
        atRisk.forEach(opp => {
            const reason = getHealthScore(opp.scales) < 5 ? `Saúde baixa (${getHealthScore(opp.scales).toFixed(1)}/10)` : `${getDaysSinceLastContact(opp.last_update)} dias sem contato`;
            plan += `* **${opp.client} (R$${opp.value.toLocaleString()})**: Risco - ${reason}. **Ação:** Reativar HOJE com um email de valor ou uma chamada focada no problema.\n`;
        });
    } else {
        plan += "* Boas notícias! Nenhum deal em risco crítico esta semana.\n";
    }

    plan += "\n🌱 **NUTRIR E ACELERAR (Deals com Potencial):**\n";
    if (nurture.length > 0) {
        nurture.forEach(opp => {
            plan += `* **${opp.client} (R$${opp.value.toLocaleString()})**: Saúde ${getHealthScore(opp.scales).toFixed(1)}/10. **Ação:** Identificar o próximo passo para aumentar uma das escalas PPVVCC (ex: agendar demo, acessar poder).\n`;
        });
    } else {
        plan += "* Pipeline precisando de mais deals em qualificação.\n";
    }

    plan += "\n Lembre-se, um pipeline saudável é um pipeline em movimento. Vamos com tudo! 🚀";
    return plan;
}

// ================================================================
// NUEVA FUNCIÓN: Detectar Intención de Actualizar
// ================================================================
function detectUpdateIntent(context) {
    const lowerContext = context.toLowerCase();
    const intentKeywords = ['atualizar', 'mudar', 'subir', 'aumentar', 'agora é', 'confirmado'];
    
    if (!intentKeywords.some(kw => lowerContext.includes(kw))) {
        return null;
    }

    const scaleKeywords = {
        pain: ['dor', 'pain'],
        power: ['poder', 'power'],
        vision: ['visão', 'vision', 'visao'],
        value: ['valor', 'value'],
        control: ['controle', 'control'],
        purchase: ['compras', 'purchase']
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

    // Prioritize the number not followed by time units, or the first number found.
    const newValue = valueMatch[2] || valueMatch[1];
    
    if (newValue === null || isNaN(parseInt(newValue)) || parseInt(newValue) > 10) return null;

    // Opcional: Extraer nombre de cliente si se menciona
    const clientMatch = lowerContext.match(/(?:em|para|de)\s+([A-Z][A-Za-z0-9\s]+)/);
    const client = clientMatch ? clientMatch[1].trim() : null;

    return {
        scale: foundScale,
        newValue: parseInt(newValue),
        client: client
    };
}


// ============= FUNCIÓN PARA MANEJAR NUEVAS OPORTUNIDADES =============
async function handleNewOpportunity(req, res, context, ventapelContext) {
  // Extraer información de la nueva oportunidad del contexto
  const extractedInfo = extractOpportunityInfo(context);
  
  const response = `🎯 **NUEVA OPORTUNIDAD IDENTIFICADA**

${extractedInfo.company ? `**Empresa:** ${extractedInfo.company}` : '**Empresa:** [Por definir]'}
${extractedInfo.contact ? `**Contacto:** ${extractedInfo.contact}` : ''}
${extractedInfo.value ? `**Valor estimado:** R$${extractedInfo.value}` : ''}
${extractedInfo.stage ? `**Etapa sugerida:** ${extractedInfo.stage}` : ''}

📊 **ANÁLISIS PPVVCC INICIAL:**

**DOR (${extractedInfo.painScore}/10):**
${extractedInfo.pain || '❓ Necesita validación'}
${extractedInfo.painScore >= 5 ? '✅ Dolor admitido' : '⚠️ Validar dolor con preguntas SPIN'}

**PODER (${extractedInfo.powerScore}/10):**
${extractedInfo.power || '❓ Mapear estructura de decisión'}
${extractedInfo.powerScore >= 4 ? '✅ Decisor identificado' : '⚠️ Necesitas acceso al decisor real'}

**VISÃO (${extractedInfo.visionScore}/10):**
${extractedInfo.vision || '❓ Construir visión de solución'}
${extractedInfo.visionScore >= 5 ? '✅ Visión alineada' : '⚠️ Demo necesaria'}

**VALOR (${extractedInfo.valueScore}/10):**
${extractedInfo.value ? '💰 Potencial identificado' : '❓ Calcular ROI específico'}
${extractedInfo.valueScore >= 5 ? '✅ ROI claro' : '⚠️ Necesitas validar valor con el cliente'}

**CONTROLE (${extractedInfo.controlScore}/10):**
${extractedInfo.nextSteps || '❓ Definir próximos pasos claros'}

**COMPRAS (${extractedInfo.purchaseScore}/10):**
${extractedInfo.purchaseProcess || '❓ Mapear proceso de compras'}

🎬 **PLAN DE ACCIÓN PARA LA REUNIÓN/DEMO:**

1. **APERTURA (5 min):**
   - Confirmar asistentes y roles
   - Validar agenda y expectativas
   - ${extractedInfo.pain ? `Confirmar: "${extractedInfo.pain}"` : 'Confirmar problema principal'}

2. **DIAGNÓSTICO SPIN (15 min):**
   ${extractedInfo.painScore < 7 ? `
   - SITUACIÓN: "¿Cómo manejan hoy el proceso de empaquetado?"
   - PROBLEMA: "¿Qué % de cajas llegan violadas?"
   - IMPLICACIÓN: "¿Cuánto cuesta cada reempaquetado?"
   - NEED-PAYOFF: "¿Qué valor tendría eliminar ese retrabalho?"` : 
   '- Validar métricas específicas del problema'}

3. **DEMO PERSONALIZADA (20 min):**
   ${extractedInfo.equipment ? `- Enfocar en ${extractedInfo.equipment}` : '- Mostrar BP555e + cinta VENOM'}
   - Caso ${extractedInfo.industry ? `relevante de ${extractedInfo.industry}` : 'L\'Oréal o MercadoLibre'}
   - ROI calculator en vivo con sus números
   - Momento WOW: reducción 40% garantizada

4. **MANEJO DE OBJECIONES (10 min):**
   - Precio: "ROI en 3 meses, después es ahorro puro"
   - Timing: "Cada mes sin actuar = R$X perdidos"
   - Competencia: "Solución completa vs solo cinta"

5. **CIERRE Y PRÓXIMOS PASOS (10 min):**
   ${extractedInfo.nextSteps || 
   `- Proponer prueba piloto en una línea
   - Agendar visita técnica
   - Enviar propuesta formal
   - Definir fecha de decisión`}

📝 **INFORMACIÓN FALTANTE CRÍTICA:**
${!extractedInfo.company ? '❌ Nombre exacto de la empresa' : ''}
${!extractedInfo.value ? '❌ Volumen de operación/presupuesto' : ''}
${!extractedInfo.power ? '❌ Quién toma la decisión final' : ''}
${!extractedInfo.timeline ? '❌ Timeline de implementación' : ''}
${extractedInfo.painScore < 7 ? '❌ Métricas específicas del problema' : ''}

💡 **PREGUNTAS CLAVE PARA HACER:**
1. ${extractedInfo.painScore < 7 ? '"¿Cuántas cajas procesan mensualmente?"' : '"¿Cuál es el costo actual por caja?"'}
2. ${!extractedInfo.power ? '"¿Quién aprueba inversiones en logística?"' : '"¿Qué criterios usa para evaluar proveedores?"'}
3. ${!extractedInfo.timeline ? '"¿Para cuándo necesitan la solución operando?"' : '"¿Qué los frena para avanzar?"'}
4. "¿Ya evaluaron otras opciones? ¿Cuáles?"

⚡ **ACCIÓN INMEDIATA:**
${extractedInfo.nextMeeting ? 
`✅ Preparar para ${extractedInfo.nextMeeting}` : 
'📅 Agendar próxima reunión con poder de decisión'}

🎯 **PROBABILIDAD DE CIERRE:** ${calculateCloseProbability(extractedInfo)}%
📈 **FORECAST:** ${extractedInfo.value ? `R$${extractedInfo.value} en ` : ''}${extractedInfo.timeline || '60-90 días'}

---
💬 **Necesitas ayuda con algo específico para ${extractedInfo.company || 'esta oportunidad'}?**
Por ejemplo:
- "Email de follow-up post-demo"
- "Script para manejar objeción de precio"
- "Propuesta comercial formal"
- "Estrategia para acceder al CEO"`;

  res.status(200).json({ response });
}

// ============= FUNCIÓN PARA EXTRAER INFO DE NUEVA OPORTUNIDAD =============
function extractOpportunityInfo(context) {
  const info = {
    company: null,
    contact: null,
    pain: null,
    painScore: 0,
    power: null,
    powerScore: 0,
    vision: null,
    visionScore: 0,
    value: null,
    valueScore: 0,
    control: null,
    controlScore: 0,
    purchaseProcess: null,
    purchaseScore: 0,
    equipment: null,
    industry: null,
    timeline: null,
    nextSteps: null,
    nextMeeting: null
  };

  // Extraer nombre de empresa
  const companyMatch = context.match(/(?:empresa|cliente|company|oportunidad con|reunión con|visitar a?)\s+([A-Z][A-Za-z0-9+\-&\s]+)/i);
  if (companyMatch) info.company = companyMatch[1].trim();

  // Extraer dolor/problema
  if (context.match(/robos?|furtos?|violac/i)) {
    info.pain = "Problemas de violación/robo en transporte";
    info.painScore = 7;
  }
  if (context.match(/admitieron|reconocieron|dijeron que|problema/i)) {
    info.painScore = Math.max(info.painScore, 6);
  }

  // Extraer poder
  if (context.match(/director|gerente|CEO|decisor|manager/i)) {
    info.power = "Directores involucrados";
    info.powerScore = 6;
  }

  // Extraer visión
  if (context.match(/demo|demostración|presentación|les gustó|interesados/i)) {
    info.vision = "Demo realizada con interés";
    info.visionScore = 6;
  }

  // Extraer equipamiento mencionado
  const equipMatch = context.match(/(?:BP|RSA|máquina|equipo)\s*(\d+[a-z]*)/i);
  if (equipMatch) info.equipment = equipMatch[0];

  // Extraer valor si se menciona
  const valueMatch = context.match(/R?\$?\s*(\d+(?:\.\d{3})*(?:,\d+)?)\s*(?:mil|k|reais)?/i);
  if (valueMatch) {
    let value = valueMatch[1].replace(/\./g, '').replace(',', '.');
    if (context.match(/mil|k/i)) value = parseFloat(value) * 1000;
    info.value = Math.round(value);
    info.valueScore = 4;
  }

  // Extraer timeline
  if (context.match(/hoy|hoje|tarde|mañana|amanhã/i)) {
    info.timeline = "Inmediato";
    info.nextMeeting = "reunión hoy";
    info.controlScore = 7;
  }

  // Determinar industria por contexto
  if (context.match(/tecnolog|tech|software|TI/i)) info.industry = "Tecnología";
  if (context.match(/farmac|pharma|medicam/i)) info.industry = "Farmacéutica";
  if (context.match(/aliment|food|bebida/i)) info.industry = "Alimentos";
  if (context.match(/e-commerce|marketplace|online/i)) info.industry = "E-commerce";

  // Calcular stage sugerido
  if (info.painScore >= 5 && info.powerScore >= 4) {
    info.stage = "Qualificação";
  } else if (info.visionScore >= 5) {
    info.stage = "Apresentação";
  } else {
    info.stage = "Prospecção";
  }

  return info;
}

// ============= FUNCIÓN PARA CALCULAR PROBABILIDAD DE CIERRE =============
function calculateCloseProbability(info) {
  const avgScore = (
    info.painScore + 
    info.powerScore + 
    info.visionScore + 
    info.valueScore + 
    info.controlScore + 
    info.purchaseScore
  ) / 6;
  
  if (avgScore >= 7) return 75;
  if (avgScore >= 5) return 40;
  if (avgScore >= 3) return 20;
  return 10;
}

// ============= FUNCIONES AUXILIARES EXISTENTES =============

function detectRequestType(context) {
  const lowerContext = context?.toLowerCase() || '';
  
  if (lowerContext.includes('actualiz') || 
      lowerContext.includes('noticia') ||
      lowerContext.includes('reciente') ||
      lowerContext.includes('información')) {
    return 'web-enriched';
  }
  
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

function getEmailTemplates(googleContext) {
  const hasRecentNews = googleContext && googleContext.length > 0;
  const triggerEvent = hasRecentNews && googleContext[0].hasExpansion ? 
    `Vi que están expandiendo operaciones - ` : '';
  
  return `
TEMPLATES DE EMAIL SEGÚN SITUACIÓN:

1. PRIMER CONTACTO (DOR < 3):
Asunto: ${triggerEvent}[Empresa] redujo 40% violación de cajas
Estructura:
- ${hasRecentNews ? 'Referencia a noticia reciente de la empresa' : 'Gancho con caso similar'}
- Problema específico que resolvemos (con números)
- Pregunta que genere reflexión
- CTA suave para conversar

2. REACTIVACIÓN (>7 días sin contacto):
Asunto: ${triggerEvent}¿Sigue siendo prioridad reducir los R$[cantidad]?
Estructura:
- ${hasRecentNews ? 'Mencionar cambio/noticia reciente' : 'Referencia última conversación'}
- Nuevo insight o caso de éxito
- Crear urgencia (competidor ya implementó)
- CTA específico con fecha/hora

3. AVANCE A DEMO (DOR > 6, PODER > 4):
Asunto: Demo personalizada Ventapel - [fecha] - reducción 40% violaciones
Estructura:
- Confirmar dolor específico admitido
- ${hasRecentNews ? 'Conectar con situación actual de la empresa' : 'Agenda clara de la demo'}
- Quién debe participar
- Resultados esperados post-demo`;
}

function getCallScriptTemplates(googleContext) {
  const hasRecentInfo = googleContext && googleContext.length > 0;
  
  return `
SCRIPTS DE LLAMADA SEGÚN OBJETIVO:

1. LLAMADA DE CALIFICACIÓN (SPIN):
${hasRecentInfo ? 'APERTURA CON TRIGGER: "Vi que [mencionar noticia reciente]..."' : ''}
SITUACIÓN: "¿Cómo manejan hoy el empaquetado en el CD?"
PROBLEMA: "¿Qué % de cajas llegan violadas al cliente?"
IMPLICACIÓN: "¿Cuánto tiempo dedican a re-embalar?"
NEED-PAYOFF: "¿Qué valor tendría eliminar ese retrabalho?"

2. LLAMADA PARA ACCEDER AL PODER:
${hasRecentInfo ? 'GANCHO: "Con la [expansión/cambio] que están haciendo..."' : ''}
"[Nombre], para diseñar la mejor solución necesito entender las prioridades del gerente de operaciones. 
¿Podríamos incluirlo en una call de 20 minutos esta semana?"`;
}

function getObjectionHandlers() {
  return `
MANEJO DE OBJECIONES COMUNES:

"ES MUY CARO":
1. Reframe a inversión: "Entiendo. ¿Comparado con los R$[X] que pierden mensualmente en retrabalho?"
2. Mostrar ROI: "La inversión se paga en 4 meses. Después es ahorro puro."
3. Caso similar: "L'Oréal pensó lo mismo. Hoy ahorran R$280k/mes con ROI de 3 meses."

"YA TENEMOS PROVEEDOR (3M)":
1. No atacar: "3M es buena empresa. ¿Están 100% satisfechos con los resultados?"
2. Complementar: "Muchos clientes usan ambos. Nosotros para líneas críticas, 3M para el resto."
3. Prueba sin riesgo: "¿Probamos en una línea por 30 días? Si no reduce 40%, no cobro."`;
}

function getResponseInstructions(requestType, context) {
  const instructions = {
    'web-enriched': `
RESPONDE CON INFO ACTUALIZADA:
- Menciona explícitamente que tienes información reciente
- Conecta la info de web con la oportunidad
- Usa triggers de noticias para crear urgencia
- Personaliza con datos específicos encontrados`,
    
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

function generateSituationalAnalysis(opportunity, googleContext) {
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
  
  // Agregar insights de Google si están disponibles
  if (googleContext && googleContext.length > 0) {
    analysis.push('\n📰 CONTEXTO ACTUAL (información de internet):');
    
    googleContext.forEach((item, idx) => {
      if (item.hasExpansion) {
        analysis.push(`• 🚀 OPORTUNIDAD: Están expandiendo - momento IDEAL para propuesta`);
      }
      if (item.hasProblems) {
        analysis.push(`• ⚠️ PAIN POINT DETECTADO: Problemas mencionados que podemos resolver`);
      }
      if (item.hasRevenue) {
        analysis.push(`• 💰 DIMENSIÓN: Empresa con facturación significativa - ajustar propuesta`);
      }
    });
  }
  
  // Días sin contacto
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  if (daysSince > 7) {
    analysis.push(`\n🚨 ${daysSince} DÍAS SIN CONTACTO - Deal enfriándose rápidamente`);
  }
  
  return analysis.join('\n');
}

function generateNextBestAction(opportunity, googleContext) {
  const scales = opportunity.scales;
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  let triggerEvent = '';
  if (googleContext && googleContext.length > 0) {
    if (googleContext[0].hasExpansion) {
      triggerEvent = 'Vi que están expandiendo operaciones. ';
    } else if (googleContext[0].hasProblems) {
      triggerEvent = 'Vi los desafíos logísticos que mencionaron. ';
    }
  }
  
  // Prioridad 1: Deals fríos
  if (daysSince > 7) {
    return `
🚨 ACCIÓN URGENTE: Reactivar YA
EMAIL ASUNTO: "${triggerEvent}¿Sigue siendo prioridad reducir los R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales?"
CONTENIDO: ${triggerEvent}Referencia última conversación + nuevo caso de éxito + crear urgencia
FOLLOW-UP: Llamar 2 horas después del email`;
  }
  
  // Prioridad 2: Dolor no admitido
  if (scales.pain < 5) {
    return `
🔴 ACCIÓN: Reunión para admitir dolor
SCRIPT: "${opportunity.client}, ${triggerEvent}empresas similares pierden 3-5% por violación. 
Con sus ${Math.round(opportunity.value / 50)} envíos mensuales, son R$${Math.round(opportunity.value * 0.03).toLocaleString()} perdidos.
¿Cuál es su experiencia con este problema?"`;
  }
  
  // Prioridad 3: Sin acceso al poder
  if (scales.power < 4) {
    return `
🔴 ACCIÓN: Acceder al decisor esta semana
EMAIL: "${triggerEvent}Para garantizar el ROI de R$${Math.round(opportunity.value * 2.5).toLocaleString()} anual,
necesito 20 minutos con quien aprueba inversiones en logística.
¿Lo incluimos en nuestra call del jueves?"`;
  }
  
  return 'ACCIÓN: Actualizar escalas PPVVCC para determinar siguiente paso';
}

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

function generateEnhancedFallbackResponse(opportunityData, context, requestType, googleContext) {
  // Si no hay oportunidad, dar instrucciones
  if (!opportunityData) {
    return `❌ No hay ninguna oportunidad seleccionada o no existe en el CRM.

📋 Comandos disponibles:
• "listar" - Ver todas las oportunidades  
• Escribir el nombre exacto del cliente
• "buscar [nombre]" - Buscar cliente específico
• "tengo nueva oportunidad con [empresa]" - Registrar nueva oportunidad

💡 Para generar emails, scripts o análisis, primero necesito que selecciones una oportunidad real del CRM.`;
  }
  
  // Generar respuesta según tipo
  if (requestType === 'email' && opportunityData) {
    return generateEmailTemplate(opportunityData, context, googleContext);
  }
  
  if (requestType === 'script' && opportunityData) {
    return generateCallScript(opportunityData, context, googleContext);
  }
  
  // Análisis estándar
  const scales = opportunityData.scales || {};
  const avg = scales ? 
    (scales.pain + scales.power + scales.vision + scales.value + scales.control + scales.purchase) / 6 : 0;
  
  let response = `📊 Análisis de ${opportunityData.client}:

ESTADO: ${avg < 4 ? '🔴 CRÍTICO' : avg < 7 ? '🟡 TIBIO' : '🟢 CALIENTE'} (${avg.toFixed(1)}/10)`;

  // Agregar contexto web si está disponible
  if (googleContext && googleContext.length > 0) {
    response += `\n\n📰 INFORMACIÓN ACTUALIZADA (de internet):`;
    googleContext.slice(0, 3).forEach((item, idx) => {
      response += `\n${idx + 1}. ${item.title}`;
      if (item.hasExpansion) response += ` 🚀 [Expansión detectada]`;
      if (item.hasProblems) response += ` ⚠️ [Problemas mencionados]`;
    });
  }

  response += `\n\nPROBLEMA PRINCIPAL: ${
    scales.pain < 5 ? 'Cliente no admite el dolor' :
    scales.power < 4 ? 'Sin acceso al decisor' :
    scales.value < 5 ? 'ROI no validado' :
    'Listo para cerrar'
  }

PRÓXIMA ACCIÓN:
${generateNextBestAction(opportunityData, googleContext)}

💡 Pregúntame específicamente:
- "Email para reactivar"
- "Script para llamada"  
- "Cómo manejar objeción de precio"
- "Preparar demo para ${opportunityData.client}"
- "Información actualizada de ${opportunityData.client}"`;

  return response;
}

function generateEmailTemplate(opportunity, context, googleContext) {
  const scales = opportunity.scales;
  const daysSince = getDaysSinceLastContact(opportunity.last_update);
  
  let triggerEvent = '';
  if (googleContext && googleContext.length > 0) {
    if (googleContext[0].hasExpansion) {
      triggerEvent = `Vi que ${opportunity.client} está expandiendo operaciones. `;
    }
  }
  
  if (daysSince > 7) {
    return `📧 EMAIL DE REACTIVACIÓN para ${opportunity.client}:

ASUNTO: ${triggerEvent || ''}¿Sigue siendo prioridad reducir los R$${Math.round(opportunity.value * 0.15).toLocaleString()} en retrabalho?

${opportunity.power_sponsor || opportunity.sponsor || 'Estimado cliente'},

${triggerEvent}

En nuestra última conversación del ${opportunity.last_update}, identificamos una oportunidad de ahorro de R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales.

Desde entonces, ayudamos a L'Oréal a:
• Eliminar 100% los furtos
• Aumentar 50% la eficiencia
• ROI completo en 3 meses

¿Sigue siendo prioridad resolver este tema en ${opportunity.client}?

¿Podemos agendar 15 minutos esta semana?

Saludos,
${opportunity.vendor}

P.D. Tengo un slot el jueves 10am o viernes 3pm. ¿Cuál prefiere?`;
  }
  
  return `📧 EMAIL PERSONALIZADO para ${opportunity.client}:

ASUNTO: ${triggerEvent || 'Propuesta de valor Ventapel'} - ${opportunity.client}

${opportunity.power_sponsor || 'Estimado cliente'},

${triggerEvent}

Ventapel puede ayudar a ${opportunity.client} a:
• Reducir 40% las violaciones de cajas
• Ahorrar R$${Math.round(opportunity.value * 0.15).toLocaleString()}/mes
• Mejorar satisfacción del cliente final

Caso similar: L'Oréal eliminó 100% los furtos con ROI de 3 meses.

¿Podemos agendar 30 minutos esta semana?

Saludos,
${opportunity.vendor}`;
}

function generateCallScript(opportunity, context, googleContext) {
  let openingHook = '';
  if (googleContext && googleContext.length > 0) {
    if (googleContext[0].hasExpansion) {
      openingHook = `Vi que están expandiendo operaciones. `;
    }
  }
  
  return `📞 SCRIPT DE LLAMADA para ${opportunity.client}:

APERTURA (10 segundos):
"Hola ${opportunity.power_sponsor || 'María'}, soy ${opportunity.vendor} de Ventapel. 
${openingHook}¿Tiene 30 segundos?"

[PAUSA - Esperar confirmación]

GANCHO (20 segundos):
"Perfecto. ${openingHook}Ayudamos a L'Oréal a eliminar 100% sus furtos.
Calculé que ${opportunity.client} podría ahorrar R$${Math.round(opportunity.value * 0.15).toLocaleString()} mensuales."

PREGUNTAS SPIN:
SITUACIÓN: "¿Cómo manejan hoy las cajas violadas?"
PROBLEMA: "¿Qué % llegan dañados?"
IMPLICACIÓN: "¿Cuánto tiempo en re-embalar?"
NEED-PAYOFF: "¿Qué valor tendría eliminar eso?"

CIERRE:
"Veo potencial de R$${Math.round(opportunity.value * 2.5).toLocaleString()} anual.
¿Podemos agendar 30 minutos esta semana?"`;
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
