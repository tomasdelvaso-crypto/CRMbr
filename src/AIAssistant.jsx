import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign, Database, Search, Mail, Phone, FileText, Users, Brain, Sparkles, Bot, Send, ChevronDown, Loader2, CheckCircle, XCircle, Award, AlertCircle, Edit3 } from 'lucide-react';

// ============= CASOS REALES DE ÉXITO VENTAPEL =============
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

// ============= COMPONENTE PRINCIPAL =============
const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [activeOpportunity, setActiveOpportunity] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [claudeContext, setClaudeContext] = useState([]);
  const messagesEndRef = useRef(null);

  // Cargar oportunidades al inicio
  useEffect(() => {
    if (supabase) {
      loadOpportunities();
    }
  }, [supabase]);

  // Actualizar oportunidad activa cuando cambia en el CRM
  useEffect(() => {
    if (currentOpportunity && !activeOpportunity) {
      setActiveOpportunity(currentOpportunity);
    }
  }, [currentOpportunity]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadOpportunities = async () => {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('value', { ascending: false });

      if (!error && data) {
        setAllOpportunities(data);
      }
    } catch (err) {
      console.error('Error loading opportunities:', err);
    }
  };

  // ============= FUNCIONES AUXILIARES =============
  const calculateHealthScore = (scales) => {
    if (!scales) return 0;
    const values = Object.values(scales).map(s => (s?.score || 0));
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
    return avg.toFixed(1);
  };

  const getScaleValue = (scale) => {
    if (!scale) return 0;
    return scale.score || 0;
  };

  // ============= LLAMADA A CLAUDE API (uso inteligente) =============
  const callClaudeAPI = useCallback(async (prompt, context = {}) => {
    // OPTIMIZACIÓN: Solo usar Claude para casos que lo requieren
    const shouldUseClaude = 
      context.useCase === 'complex_strategy' ||
      context.useCase === 'creative_solution' ||
      context.useCase === 'open_question' ||
      prompt.toLowerCase().includes('estrategia compleja') ||
      prompt.toLowerCase().includes('ayúdame a pensar') ||
      prompt.toLowerCase().includes('qué opinas') ||
      prompt.toLowerCase().includes('consejo');

    if (!shouldUseClaude) {
      console.log('📊 Usando lógica local (más rápido y consistente)');
      return null;
    }

    try {
      console.log('🤖 Consultando Claude para análisis avanzado...');
      
      const enrichedPrompt = `
Eres un experto en ventas consultivas PPVVCC de Ventapel Brasil.
IMPORTANTE: Sé DIRECTO y ESPECÍFICO. No inventes datos.

CONTEXTO:
${JSON.stringify(context, null, 2)}

SOLICITUD:
${prompt}

Da una respuesta ACCIONABLE y BREVE (máximo 5 líneas).`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500, // Reducido para respuestas más concisas
          temperature: 0.3, // Más determinístico
          messages: [
            ...claudeContext.slice(-2), // Solo últimos 2 mensajes para reducir tokens
            { role: "user", content: enrichedPrompt }
          ]
        })
      });

      if (!response.ok) {
        console.log('Claude API no disponible, usando lógica local');
        return null;
      }

      const data = await response.json();
      
      // Actualizar contexto mínimo
      setClaudeContext(prev => [
        ...prev.slice(-2),
        { role: "user", content: prompt },
        { role: "assistant", content: data.content[0].text }
      ]);
      
      return data.content[0].text;
    } catch (error) {
      console.log('Claude no disponible, continuando con lógica local');
      return null;
    }
  }, [claudeContext]);

  // ============= LLAMADA AL BACKEND API =============
  const callBackendAPI = useCallback(async (context, opportunityData) => {
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: context,
          opportunityData: opportunityData,
          pipelineData: {
            allOpportunities: allOpportunities,
            vendorName: currentUser
          },
          ventapelContext: {
            casos: CASOS_EXITO_REALES,
            metodologia: 'PPVVCC'
          }
        })
      });

      if (!response.ok) {
        console.log('Backend API no disponible');
        return null;
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.log('Error llamando al backend:', error);
      return null;
    }
  }, [allOpportunities, currentUser]);

  // ============= BÚSQUEDA EN GOOGLE VIA BACKEND =============
  const searchGoogle = useCallback(async (searchTerm) => {
    try {
      setIsThinking(true);
      
      // Intentar buscar via backend con Serper
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialRequestType: 'web_research',
          companyName: searchTerm,
          vendorName: currentUser
        })
      });

      if (response.ok) {
        const data = await response.json();
        setIsThinking(false);
        return data.response;
      }
      
      setIsThinking(false);
      return null;
    } catch (error) {
      console.log('Error buscando en Google:', error);
      setIsThinking(false);
      return null;
    }
  }, [currentUser]);

  // ============= ANÁLISIS LOCAL DE OPORTUNIDADES =============
  const analyzeOpportunity = useCallback((opp) => {
    if (!opp) return null;
    
    const daysSince = opp.last_update ? 
      Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 999;
    
    const healthScore = calculateHealthScore(opp.scales);
    
    let analysis = `📊 **ANÁLISIS DE ${opp.client}**\n\n`;
    
    // Información básica
    analysis += `💰 **Valor:** R$ ${(opp.value || 0).toLocaleString('pt-BR')}\n`;
    analysis += `📈 **Etapa:** ${opp.stage} - Probabilidad ${opp.probability}%\n`;
    analysis += `❤️ **Health Score:** ${healthScore}/10\n`;
    analysis += `📅 **Días sin contacto:** ${daysSince}\n`;
    
    if (opp.next_action) {
      analysis += `📌 **Próxima acción:** ${opp.next_action}\n`;
    }
    
    analysis += `\n**🎯 SCORES PPVVCC:**\n`;
    analysis += `• DOR: ${opp.scales?.dor?.score || 0}/10`;
    if (opp.scales?.dor?.description) {
      analysis += ` - "${opp.scales.dor.description}"`;
    }
    analysis += `\n`;
    
    analysis += `• PODER: ${opp.scales?.poder?.score || 0}/10`;
    if (opp.scales?.poder?.description) {
      analysis += ` - "${opp.scales.poder.description}"`;
    }
    analysis += `\n`;
    
    analysis += `• VISIÓN: ${opp.scales?.visao?.score || 0}/10\n`;
    analysis += `• VALOR: ${opp.scales?.valor?.score || 0}/10\n`;
    analysis += `• CONTROL: ${opp.scales?.controle?.score || 0}/10\n`;
    analysis += `• COMPRAS: ${opp.scales?.compras?.score || 0}/10\n\n`;
    
    // Alertas y riesgos
    const alerts = [];
    
    if (daysSince > 30) {
      alerts.push(`🔴 **CRÍTICO:** ${daysSince} días sin contacto - DEAL MUERTO`);
    } else if (daysSince > 7) {
      alerts.push(`⚠️ **ALERTA:** ${daysSince} días sin contacto - REACTIVAR URGENTE`);
    }
    
    if (!opp.power_sponsor) {
      alerts.push(`⚠️ **ALERTA:** Power Sponsor no identificado`);
    }
    
    if (opp.scales?.dor?.score < 5) {
      alerts.push(`⚠️ **ALERTA:** Dolor no admitido (${opp.scales?.dor?.score}/10) - NO hay venta posible`);
    }
    
    if (opp.stage >= 3 && opp.scales?.visao?.score < 5) {
      alerts.push(`⚠️ **ALERTA:** En presentación sin visión construida`);
    }
    
    if (alerts.length > 0) {
      analysis += `**🚨 ALERTAS:**\n`;
      alerts.forEach(alert => {
        analysis += `${alert}\n`;
      });
      analysis += `\n`;
    }
    
    // Acciones recomendadas
    analysis += `**✅ PRÓXIMOS PASOS RECOMENDADOS:**\n`;
    
    if (daysSince > 7) {
      analysis += `1. **HOY:** Llamar para reactivar - "Vi que no hablamos hace ${daysSince} días..."\n`;
    } else {
      analysis += `1. Mantener momentum con contacto esta semana\n`;
    }
    
    if (opp.scales?.dor?.score < 5) {
      analysis += `2. **URGENTE:** Recalificar dolor - Sin dolor admitido no hay venta\n`;
    } else if (opp.scales?.dor?.score < 8) {
      analysis += `2. Profundizar en el dolor - Llevar de ${opp.scales?.dor?.score} a 8+\n`;
    }
    
    if (!opp.power_sponsor) {
      analysis += `3. **CRÍTICO:** Identificar Power Sponsor - "¿Quién firma el contrato?"\n`;
    } else if (opp.scales?.poder?.score < 7) {
      analysis += `3. Conseguir acceso directo al Power Sponsor: ${opp.power_sponsor}\n`;
    }
    
    // Caso de éxito relevante
    analysis += `\n**💡 CASO DE ÉXITO A USAR:**\n`;
    
    if (opp.industry?.toLowerCase().includes('cosmé')) {
      analysis += `L'Oréal Brasil: 100% robos eliminados, ROI 3 meses\n`;
    } else if (opp.industry?.toLowerCase().includes('commerce')) {
      analysis += `MercadoLibre: 40% reducción retrabajo, ROI 2 meses\n`;
    } else {
      analysis += `Nike Brasil: Cero violaciones, +30% eficiencia, ROI 2 meses\n`;
    }
    
    return analysis;
  }, []);

  // ============= ESTRATEGIAS PARA RECALIFICAR DOLOR =============
  const generatePainStrategy = useCallback((opp) => {
    const painScore = opp.scales?.dor?.score || 0;
    
    let strategy = `🎯 **ESTRATEGIA PARA ELEVAR DOLOR DE ${opp.client}**\n\n`;
    strategy += `**Dolor actual:** ${painScore}/10\n`;
    strategy += `**Meta:** Llevar a 8+/10\n\n`;
    
    strategy += `**📞 SCRIPT DE LLAMADA SPIN:**\n\n`;
    
    strategy += `**1. SITUACIÓN (1 minuto):**\n`;
    strategy += `"${opp.sponsor || 'Hola'}, revisando nuestras conversaciones, mencionaste que procesan ${Math.round(opp.value/100)} cajas/mes. ¿Sigue siendo así?"\n\n`;
    
    strategy += `**2. PROBLEMA (3 minutos):**\n`;
    strategy += `• "¿Qué porcentaje de esas cajas llegan violadas al cliente final?"\n`;
    strategy += `• "¿Cuántas horas/semana dedica tu equipo a re-embalar productos?"\n`;
    strategy += `• "¿Cuántos reclamos reciben por mes por cajas dañadas?"\n\n`;
    
    strategy += `**3. IMPLICACIÓN (4 minutos) - AQUÍ GENERAMOS DOLOR:**\n`;
    strategy += `• "Si son ${Math.round(opp.value/100 * 0.03)} cajas violadas/mes, ¿cuánto cuesta cada re-empaque en mano de obra?"\n`;
    strategy += `• "Además del costo directo, ¿cuánto pierden en satisfacción del cliente?"\n`;
    strategy += `• "¿Han calculado cuánto representa esto al año? Serían R$ ${Math.round(opp.value * 0.1 * 12).toLocaleString('pt-BR')}"\n`;
    strategy += `• "¿Tu competencia tiene este mismo problema o ya lo resolvió?"\n\n`;
    
    strategy += `**4. NECESIDAD (2 minutos):**\n`;
    strategy += `• "Si pudieran eliminar 95% de esas violaciones, ¿qué impacto tendría?"\n`;
    strategy += `• "¿Cuánto vale para ${opp.client} resolver esto definitivamente?"\n\n`;
    
    strategy += `**📧 EMAIL DE SEGUIMIENTO:**\n\n`;
    strategy += `Asunto: ${opp.client} - R$ ${Math.round(opp.value * 0.1 * 12).toLocaleString('pt-BR')}/año en pérdidas evitables\n\n`;
    strategy += `${opp.sponsor || 'Hola'},\n\n`;
    strategy += `Hice algunos cálculos después de nuestra conversación:\n\n`;
    strategy += `Con ${Math.round(opp.value/100)} cajas/mes, están perdiendo:\n`;
    strategy += `• ${Math.round(opp.value/100 * 0.03)} cajas violadas mensualmente\n`;
    strategy += `• R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')}/mes en retrabajo\n`;
    strategy += `• R$ ${Math.round(opp.value * 0.1 * 12).toLocaleString('pt-BR')}/año tirados a la basura\n\n`;
    strategy += `${opp.industry === 'e-commerce' ? 'MercadoLibre' : "L'Oréal"} tenía números similares.\n`;
    strategy += `Hoy ahorran R$ ${opp.industry === 'e-commerce' ? '180.000' : '250.000'}/mes.\n\n`;
    strategy += `¿Vale la pena una llamada de 15 minutos para ver cómo?\n\n`;
    strategy += `PD: Cada mes sin actuar = R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')} perdidos.\n\n`;
    
    strategy += `**💡 DATOS DE IMPACTO PARA USAR:**\n`;
    strategy += `• Promedio Brasil: 10% pérdidas por violación (IBEVAR 2024)\n`;
    strategy += `• Costo retrabajo: R$ 30-50 por caja\n`;
    strategy += `• Tiempo perdido: 15-20 min por caja violada\n`;
    strategy += `• Clientes insatisfechos: 1 de cada 3 no compra de nuevo\n\n`;
    
    strategy += `**⚠️ OBJECIONES COMUNES:**\n`;
    strategy += `• "No es tan grave" → Mostrar cálculo anual\n`;
    strategy += `• "Es normal del sector" → Casos de éxito que lo eliminaron\n`;
    strategy += `• "No tenemos presupuesto" → ROI en 2-3 meses\n`;
    
    return strategy;
  }, []);

  // ============= PROCESAMIENTO PRINCIPAL DE MENSAJES =============
  const processMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    const userMessage = { 
      role: 'user', 
      content: text,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const lowerText = text.toLowerCase().trim();

    try {
      let response = '';

      // 1. COMANDOS ESPECIALES
      if (lowerText.includes('buscar en google') || lowerText.includes('google')) {
        const searchTerm = text.replace(/buscar en google|google/gi, '').trim() || activeOpportunity?.client;
        
        if (!searchTerm) {
          response = "❌ Especifica qué empresa buscar. Ejemplo: 'google Natura'";
        } else {
          response = await searchGoogle(searchTerm);
          if (!response) {
            response = `🔍 Buscando información sobre ${searchTerm}...\n\n`;
            response += `(La búsqueda en Google requiere que el backend esté configurado con Serper API)\n\n`;
            response += `Mientras tanto, puedo ayudarte con:\n`;
            response += `• Análisis de oportunidades existentes\n`;
            response += `• Estrategias PPVVCC\n`;
            response += `• Generación de emails y scripts\n`;
          }
        }
        
      } else if (lowerText === 'plan semanal' || lowerText.includes('plan de la semana')) {
        // Intentar obtener plan del backend
        const backendResponse = await callBackendAPI('plan_semanal', null);
        if (backendResponse) {
          response = backendResponse;
        } else {
          // Generar plan local
          response = `📅 **PLAN SEMANAL - ${currentUser}**\n\n`;
          
          const urgentOpps = allOpportunities.filter(opp => {
            const daysSince = opp.last_update ? 
              Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 999;
            return daysSince > 7;
          });
          
          if (urgentOpps.length > 0) {
            response += `**🔴 URGENTE - Reactivar HOY:**\n`;
            urgentOpps.forEach(opp => {
              response += `• ${opp.client} - ${Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24))} días sin contacto\n`;
            });
            response += `\n`;
          }
          
          response += `**📊 TOP 5 DEALS PARA CERRAR:**\n`;
          allOpportunities
            .filter(opp => opp.stage >= 3)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .forEach((opp, idx) => {
              response += `${idx + 1}. ${opp.client} - R$ ${opp.value.toLocaleString('pt-BR')} (Etapa ${opp.stage})\n`;
            });
        }
        
      } else {
        // 2. DETECTAR EMPRESA MENCIONADA O USAR CONTEXTO ACTIVO
        const foundOpp = allOpportunities.find(opp => {
          const clientLower = opp.client?.toLowerCase() || '';
          return lowerText.includes(clientLower) || 
                 clientLower.split(' ').some(word => word.length > 3 && lowerText.includes(word));
        });

        // Si encontramos una empresa, la establecemos como activa
        if (foundOpp) {
          setActiveOpportunity(foundOpp);
        }

        // Usar la oportunidad encontrada O la activa si existe
        const targetOpp = foundOpp || activeOpportunity;

        if (targetOpp) {
          // Verificar intención específica
          if (lowerText.includes('recalif') || lowerText.includes('dolor') || 
              (lowerText.includes('como') && (lowerText.includes('hacer') || lowerText.includes('hacemos'))) ||
              lowerText.includes('elevar') || lowerText.includes('aumentar')) {
            response = generatePainStrategy(targetOpp);
          } else if (lowerText.includes('estrategia completa') || 
                     lowerText.includes('plan completo') ||
                     lowerText.includes('estrategia') ||
                     lowerText.includes('que hacer') ||
                     lowerText.includes('qué hacer')) {
            // GENERAR ESTRATEGIA COMPLETA
            response = `🎯 **ESTRATEGIA COMPLETA PARA ${targetOpp.client}**\n\n`;
            response += `**SITUACIÓN ACTUAL:**\n`;
            response += `• Valor: R$ ${targetOpp.value.toLocaleString('pt-BR')}\n`;
            response += `• Etapa: ${targetOpp.stage} - Probabilidad ${targetOpp.probability}%\n`;
            response += `• Health Score: ${calculateHealthScore(targetOpp.scales)}/10 `;
            
            const healthScore = parseFloat(calculateHealthScore(targetOpp.scales));
            if (healthScore < 4) response += `🔴 CRÍTICO\n`;
            else if (healthScore < 7) response += `🟡 RIESGO\n`;
            else response += `🟢 SALUDABLE\n`;
            
            response += `\n**PROBLEMAS DETECTADOS:**\n`;
            
            const problems = [];
            if (targetOpp.scales?.dor?.score < 5) {
              problems.push(`❌ Dolor no admitido (${targetOpp.scales.dor.score}/10) - SIN DOLOR NO HAY VENTA`);
            }
            if (targetOpp.scales?.poder?.score < 5) {
              problems.push(`❌ Sin acceso al decisor (${targetOpp.scales.poder.score}/10)`);
            }
            if (targetOpp.scales?.visao?.score < 5) {
              problems.push(`⚠️ Visión no construida (${targetOpp.scales.visao.score}/10)`);
            }
            if (targetOpp.scales?.valor?.score < 5) {
              problems.push(`⚠️ ROI no validado (${targetOpp.scales.valor.score}/10)`);
            }
            
            problems.forEach(p => response += `${p}\n`);
            
            response += `\n**📋 PLAN DE ACCIÓN (PRÓXIMOS 5 DÍAS):**\n\n`;
            
            // Prioridad 1: Dolor
            if (targetOpp.scales?.dor?.score < 5) {
              response += `**DÍA 1-2: RECALIFICAR DOLOR (CRÍTICO)**\n`;
              response += `• Llamada SPIN de 20 minutos\n`;
              response += `• Preguntas clave:\n`;
              response += `  - "¿Cuántas cajas violadas por mes?"\n`;
              response += `  - "¿Costo de cada retrabajo?"\n`;
              response += `  - "¿Impacto anual = R$ ${Math.round(targetOpp.value * 0.1 * 12).toLocaleString('pt-BR')}?"\n`;
              response += `• Enviar email con cálculo de pérdidas\n\n`;
            }
            
            // Prioridad 2: Poder
            if (targetOpp.scales?.poder?.score < 5) {
              response += `**DÍA 3: ACCEDER AL DECISOR**\n`;
              response += `• Pedir reunión con ${targetOpp.power_sponsor || 'gerente de operaciones'}\n`;
              response += `• Script: "Para diseñar la mejor solución, necesito 15 min con quien aprueba inversiones"\n`;
              response += `• Si se niega: "¿Qué necesita ver el decisor para aprobar?"\n\n`;
            }
            
            // Prioridad 3: Visión y Valor
            response += `**DÍA 4: DEMO CON ROI**\n`;
            response += `• Demo de 30 minutos enfocada en:\n`;
            response += `  - Caso ${targetOpp.industry === 'e-commerce' ? 'MercadoLibre' : 'Nike'}\n`;
            response += `  - ROI específico: ${Math.ceil(targetOpp.value < 100000 ? 45000 : 95000 / (targetOpp.value * 0.1 * 0.95))} meses\n`;
            response += `  - Video de antes/después\n\n`;
            
            response += `**DÍA 5: CIERRE O PRUEBA**\n`;
            if (targetOpp.stage >= 4) {
              response += `• Proponer prueba piloto 1 semana\n`;
              response += `• "Si no reduce 40% violaciones, no cobro"\n`;
            } else {
              response += `• Avanzar a siguiente etapa\n`;
              response += `• Definir fecha de decisión\n`;
            }
            
            response += `\n**📞 SCRIPT DE APERTURA HOY:**\n`;
            response += `"${targetOpp.sponsor || 'Hola'}, revisando nuestra última conversación, `;
            response += `vi que procesan ${Math.round(targetOpp.value/100)} cajas/mes. `;
            response += `${targetOpp.industry === 'e-commerce' ? 'MercadoLibre' : 'Nike'} tenía el mismo volumen `;
            response += `y perdía R$ ${Math.round(targetOpp.value * 0.1).toLocaleString('pt-BR')}/mes. `;
            response += `Hoy ahorran 95% de eso. ¿Tienes 15 minutos para ver los números específicos para ${targetOpp.client}?"\n\n`;
            
            response += `**📧 EMAIL DE REACTIVACIÓN:**\n`;
            response += `Asunto: ${targetOpp.client} - Pérdida mensual R$ ${Math.round(targetOpp.value * 0.1).toLocaleString('pt-BR')} evitable\n\n`;
            
            response += `**⚡ ACCIÓN INMEDIATA (HOY):**\n`;
            if (targetOpp.scales?.dor?.score < 5) {
              response += `☎️ LLAMAR AHORA para recalificar dolor. Sin dolor admitido = sin venta.`;
            } else if (targetOpp.scales?.poder?.score < 5) {
              response += `📧 EMAIL pidiendo acceso al decisor ${targetOpp.power_sponsor || '(identificar quién es)'}.`;
            } else {
              response += `📅 AGENDAR demo/prueba para esta semana.`;
            }
          } else if (foundOpp) {
            // Si mencionó específicamente una empresa, mostrar análisis
            response = analyzeOpportunity(targetOpp);
            
            // Intentar enriquecer con Claude si está disponible
            if (lowerText.includes('estrategia') || lowerText.includes('completo')) {
              setIsThinking(true);
              const claudeResponse = await callClaudeAPI(
                `Analiza ${foundOpp.client} con estos datos: Valor R$${foundOpp.value}, Dolor ${foundOpp.scales?.dor?.score}/10, Poder ${foundOpp.scales?.poder?.score}/10. Dame 3 acciones específicas para cerrar.`,
                { cliente: foundOpp.client }
              );
              
              if (claudeResponse) {
                response += `\n\n🤖 **ANÁLISIS ENRIQUECIDO CON IA:**\n${claudeResponse}`;
              }
              setIsThinking(false);
            }
          }
          
        } else if (lowerText === 'hola' || lowerText === 'hey' || lowerText === 'hi') {
          response = `👋 ¡Hola ${currentUser}! Soy tu asistente Ventapel.\n\n`;
          response += `Tengo ${allOpportunities.length} oportunidades cargadas.\n\n`;
          response += `**Puedo ayudarte con:**\n`;
          response += `• Analizar cualquier cliente\n`;
          response += `• Buscar empresas en Google\n`;
          response += `• Estrategias PPVVCC\n`;
          response += `• Emails y scripts de venta\n`;
          response += `• Calcular ROI específico\n\n`;
          response += `**Comandos útiles:**\n`;
          response += `• "listar" - Ver oportunidades\n`;
          response += `• "[nombre]" - Analizar cliente\n`;
          response += `• "google [empresa]" - Buscar en web\n`;
          response += `• "plan semanal" - Tu agenda\n`;
          
        } else if (lowerText.includes('recalif') || 
                   (lowerText.includes('como') && lowerText.includes('dolor'))) {
          if (activeOpportunity) {
            response = generatePainStrategy(activeOpportunity);
          } else {
            response = `❌ No hay cliente seleccionado.\n\n`;
            response += `**Clientes con dolor bajo:**\n`;
            allOpportunities
              .filter(opp => (opp.scales?.dor?.score || 0) < 5)
              .slice(0, 5)
              .forEach((opp, idx) => {
                response += `${idx + 1}. ${opp.client} (Dolor: ${opp.scales?.dor?.score || 0}/10)\n`;
              });
            response += `\nEscribe el nombre del cliente para generar estrategia.`;
          }
          
        } else if (lowerText === 'listar' || lowerText === 'lista') {
          response = "📋 **OPORTUNIDADES EN PIPELINE:**\n\n";
          allOpportunities.slice(0, 15).forEach((opp, idx) => {
            const score = calculateHealthScore(opp.scales);
            const emoji = score > 7 ? '🟢' : score > 4 ? '🟡' : '🔴';
            response += `${idx + 1}. ${emoji} **${opp.client}** - R$ ${(opp.value || 0).toLocaleString('pt-BR')}\n`;
            response += `   Etapa: ${opp.stage} | Health: ${score}/10 | ${opp.vendor}\n\n`;
          });
          
        } else {
          // 3. INTENTAR CON BACKEND API
          const backendResponse = await callBackendAPI(text, activeOpportunity);
          if (backendResponse) {
            response = backendResponse;
          } else {
            // Respuesta local por defecto
            response = `🤔 No entendí "${text}".\n\n`;
            response += `**Comandos disponibles:**\n`;
            response += `• "listar" - Ver oportunidades\n`;
            response += `• "[cliente]" - Analizar cliente\n`;
            response += `• "google [empresa]" - Buscar en web\n`;
            response += `• "como recalifico dolor" - Estrategia\n`;
            response += `• "plan semanal" - Tu agenda\n`;
          }
        }
      }

      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Error procesando. Intenta de nuevo.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [allOpportunities, activeOpportunity, currentUser, analyzeOpportunity, generatePainStrategy, callClaudeAPI, callBackendAPI, searchGoogle]);

  // ============= GENERADORES DE CONTENIDO =============
  const generateEmail = useCallback((opp) => {
    const daysSince = opp.last_update ? 
      Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 0;
    
    let email = `📧 **EMAIL PARA ${opp.client}**\n\n`;
    
    if (daysSince > 7) {
      email += `**Asunto:** ${opp.client} - Actualización urgente sobre pérdidas\n\n`;
    } else {
      email += `**Asunto:** Caso ${opp.industry === 'e-commerce' ? 'MercadoLibre' : "L'Oréal"} - ROI 3 meses\n\n`;
    }
    
    email += `**Para:** ${opp.sponsor || opp.power_sponsor || 'Gerente'}\n\n`;
    email += `Hola ${opp.sponsor?.split(' ')[0] || 'equipo'},\n\n`;
    
    if (daysSince > 7) {
      email += `Hace ${daysSince} días que no hablamos.\n\n`;
    }
    
    email += `Empresas como la suya pierden 10% por violación de cajas.\n`;
    email += `Para ustedes: R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')}/mes.\n\n`;
    
    const caso = CASOS_EXITO_REALES[opp.industry?.includes('commerce') ? 'mercadolibre' : 'loreal'];
    email += `${caso.empresa} eliminó esto con ROI ${caso.resultados.roi_meses} meses.\n\n`;
    
    email += `¿30 minutos esta semana?\n\n`;
    email += `Saludos,\n${currentUser || 'Ventapel'}`;
    
    return email;
  }, [currentUser]);

  const generateCallScript = useCallback((opp) => {
    let script = `📞 **SCRIPT - ${opp.client}**\n\n`;
    
    script += `**APERTURA:**\n`;
    script += `"Hola, soy ${currentUser} de Ventapel.\n`;
    script += `Vi que procesan ${Math.round(opp.value/100)} cajas/mes.\n`;
    script += `¿15 minutos para mostrar cómo MercadoLibre eliminó pérdidas?"\n\n`;
    
    script += `**PREGUNTAS SPIN:**\n`;
    script += `• S: "¿Cuántas cajas procesan?"\n`;
    script += `• P: "¿Qué % llegan violadas?"\n`;
    script += `• I: "¿Cuánto cuesta cada retrabajo?"\n`;
    script += `• N: "¿Valor de eliminar esto?"\n\n`;
    
    script += `**CIERRE:**\n`;
    script += `"Demo 30 min. ¿Martes o jueves?"\n\n`;
    
    script += `**OBJECIONES:**\n`;
    script += `• "Sin presupuesto" → "ROI 3 meses"\n`;
    script += `• "Ya tenemos" → "¿95% efectivo?"\n`;
    
    return script;
  }, [currentUser]);

  const generateROI = useCallback((opp) => {
    const monthlyBoxes = Math.round(opp.value / 100);
    const monthlyLoss = Math.round(monthlyBoxes * 0.1 * 35);
    const investment = monthlyBoxes < 5000 ? 45000 : 95000;
    const monthlySavings = Math.round(monthlyLoss * 0.95);
    const paybackMonths = Math.ceil(investment / monthlySavings);
    
    let roi = `💰 **ROI - ${opp.client}**\n\n`;
    
    roi += `**ACTUAL:**\n`;
    roi += `• Cajas/mes: ${monthlyBoxes.toLocaleString('pt-BR')}\n`;
    roi += `• Pérdida: R$ ${monthlyLoss.toLocaleString('pt-BR')}/mes\n\n`;
    
    roi += `**CON VENTAPEL:**\n`;
    roi += `• Inversión: R$ ${investment.toLocaleString('pt-BR')}\n`;
    roi += `• Ahorro: R$ ${monthlySavings.toLocaleString('pt-BR')}/mes\n`;
    roi += `• **ROI: ${paybackMonths} MESES**\n`;
    
    return roi;
  }, []);

  // ============= QUICK ACTIONS =============
  const quickActions = activeOpportunity ? [
    {
      icon: <Target className="w-4 h-4" />,
      label: 'Dolor',
      action: () => processMessage(`como recalifico dolor de ${activeOpportunity.client}`),
      color: 'bg-red-500'
    },
    {
      icon: <Mail className="w-4 h-4" />,
      label: 'Email',
      action: () => processMessage(generateEmail(activeOpportunity)),
      color: 'bg-green-500'
    },
    {
      icon: <Globe className="w-4 h-4" />,
      label: 'Google',
      action: () => processMessage(`google ${activeOpportunity.client}`),
      color: 'bg-blue-500'
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'ROI',
      action: () => processMessage(generateROI(activeOpportunity)),
      color: 'bg-yellow-500'
    }
  ] : [
    {
      icon: <Database className="w-4 h-4" />,
      label: 'Listar',
      action: () => processMessage('listar'),
      color: 'bg-gray-500'
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      label: 'Plan',
      action: () => processMessage('plan semanal'),
      color: 'bg-purple-500'
    },
    {
      icon: <Globe className="w-4 h-4" />,
      label: 'Google',
      action: () => setInput('google '),
      color: 'bg-blue-500'
    },
    {
      icon: <AlertCircle className="w-4 h-4" />,
      label: 'Ayuda',
      action: () => processMessage('ayuda'),
      color: 'bg-indigo-500'
    }
  ];

  // ============= RENDER =============
  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
      </button>

      {/* Ventana del Chat */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[450px] h-[650px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <div>
                  <h3 className="font-bold">Asistente Ventapel AI</h3>
                  <p className="text-xs opacity-90">
                    {isThinking ? '🧠 Pensando...' : '✅ PPVVCC + Google + Claude'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {activeOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-3 py-1 flex justify-between items-center">
                <p className="text-xs">
                  🎯 {activeOpportunity.client} | DOR: {activeOpportunity.scales?.dor?.score || 0}/10
                </p>
                <button
                  onClick={() => setActiveOpportunity(null)}
                  className="text-xs hover:text-yellow-300"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b">
            <div className="grid grid-cols-4 gap-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={action.action}
                  className={`${action.color} text-white rounded-lg px-2 py-2 text-xs hover:opacity-90 transition-all flex flex-col items-center gap-1`}
                  disabled={isLoading}
                >
                  {action.icon}
                  <span className="font-medium text-[10px]">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {messages.length === 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-xl">
                <p className="font-bold text-purple-700 mb-2">
                  👋 ¡Hola {currentUser}!
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Sistema completo con:
                </p>
                <ul className="text-xs space-y-1 text-gray-600">
                  <li>✅ Análisis PPVVCC local</li>
                  <li>🌐 Búsqueda Google (Serper)</li>
                  <li>🤖 Claude AI (si disponible)</li>
                  <li>📊 Backend inteligente</li>
                </ul>
                <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <p className="text-xs font-bold text-yellow-800">
                    Prueba: "MWM" → "como recalifico dolor"
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-sm' 
                    : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
                } p-3`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mb-1">
                      <Bot className="w-3 h-3 text-purple-500" />
                      <span className="text-xs text-purple-500 font-medium">Ventapel AI</span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  <div className="text-xs opacity-60 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                    <span className="text-sm text-gray-600">
                      {isThinking ? 'Buscando en Google...' : 'Procesando...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && processMessage(input)}
                placeholder="Cliente, comando o pregunta..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={() => processMessage(input)}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-gray-500">
                  {allOpportunities.length} oportunidades
                </span>
              </div>
              <div className="flex gap-2 text-xs text-gray-400">
                <span>Local ✓</span>
                <span>Google {isThinking ? '⏳' : '✓'}</span>
                <span>Claude ?</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
