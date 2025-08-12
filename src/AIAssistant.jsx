import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign, Database, Search, Mail, Phone, FileText, MessageSquare, Users, Brain, Sparkles, Bot, Send, ChevronDown, Loader2, CheckCircle, XCircle, TrendingDown, Award, AlertCircle } from 'lucide-react';

// ============= CASOS REALES DE ÉXITO VENTAPEL =============
const CASOS_EXITO_REALES = {
  'honda': {
    empresa: 'Honda Argentina',
    sector: 'Automotriz',
    problema: 'Velocidad limitada, 1% pérdidas, problemas ergonómicos, ruido alto',
    solucion: 'BP555 + Fita Gorilla 300m',
    resultados: {
      velocidad: '+40%',
      perdidas: '100% eliminadas',
      roi_meses: 3,
      inversion: 150000,
      ahorro_anual: 600000
    },
    contacto: 'Gerente de Producción validó en planta',
    testimonio: 'La mejora ergonómica permitió incluir operadores diversos'
  },
  'loreal': {
    empresa: "L'Oréal Brasil",
    sector: 'Cosmética',
    problema: '+10% pérdidas por robo, cuellos de botella, sin espacio para crecer',
    solucion: 'RSA (Random Sealer Automated) + Fita Gorilla 700m',
    resultados: {
      robos: '100% eliminados',
      eficiencia: '+50%',
      roi_meses: 3,
      inversion: 280000,
      capacidad: '12 cajas/minuto',
      ahorro_anual: 2500000
    },
    contacto: 'Director de Operaciones Brasil',
    testimonio: 'Trazabilidad 100% implementada, cero robos desde instalación'
  },
  'nike': {
    empresa: 'Nike Brasil',
    sector: 'Calzado/Textil',
    problema: '10% pérdidas en transporte, disputas con transportadoras, salud ocupacional',
    solucion: 'BP755 + Fita Gorilla 300m',
    resultados: {
      perdidas: '100% eliminadas',
      eficiencia: '+30%',
      roi_meses: 2,
      inversion: 200000,
      disputas: '100% resueltas',
      ahorro_anual: 1200000
    },
    contacto: 'Supply Chain Manager',
    testimonio: 'Cero disputas con transportadoras, control visual mejorado'
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
      inversion: 360000,
      transicion: '3 días sin parar operación'
    },
    contacto: 'Head of Fulfillment',
    testimonio: 'Transición sin interrumpir operación fue clave'
  },
  'natura': {
    empresa: 'Natura',
    sector: 'Cosmética',
    problema: 'Violaciones en cadena, pérdidas en distribución',
    solucion: 'BP755 + Sistema completo',
    resultados: {
      violaciones: '-60%',
      ahorro_mensual: 85000,
      roi_meses: 4,
      inversion: 340000
    },
    contacto: 'Gerente de Logística',
    testimonio: 'Video testimonial disponible'
  },
  'centauro': {
    empresa: 'Centauro',
    sector: 'Deportes/Retail',
    problema: 'Furtos masivos en distribución',
    solucion: 'Sistema completo Ventapel',
    resultados: {
      furtos: '-95%',
      ahorro_anual: 50000000,
      roi_meses: 3,
      inversion: 500000
    },
    contacto: 'CFO aprobó inversión',
    testimonio: 'R$50 millones/año recuperados'
  }
};

// ============= DATOS REALES DE BRASIL 2024-2025 =============
const BENCHMARKS_BRASIL = {
  'e-commerce': {
    perdidas_promedio: 0.10,
    costo_retrabajo: 30,
    fuente: 'IBEVAR 2024',
    tendencia: 'Creciendo 15% anual'
  },
  'cosmética': {
    perdidas_promedio: 0.08,
    costo_retrabajo: 50,
    fuente: 'ABIHPEC 2024',
    tendencia: 'Alto valor, alto riesgo'
  },
  'automotriz': {
    perdidas_promedio: 0.04,
    costo_retrabajo: 90,
    fuente: 'ANFAVEA',
    tendencia: 'Just-in-time crítico'
  },
  'farmacéutica': {
    perdidas_promedio: 0.09,
    costo_retrabajo: 70,
    fuente: 'ANVISA + cadena fría',
    tendencia: 'Regulación estricta'
  },
  'alimentos': {
    perdidas_promedio: 0.07,
    costo_retrabajo: 25,
    fuente: 'ABIA',
    tendencia: 'Cadena fría crítica'
  }
};

// ============= COMPONENTE PRINCIPAL =============
const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [activeView, setActiveView] = useState('chat');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  // Cargar oportunidades al inicio
  useEffect(() => {
    if (supabase) {
      loadOpportunities();
    }
  }, [supabase]);

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

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // ============= LLAMADA A CLAUDE API MEJORADA =============
  const callClaudeAPI = useCallback(async (prompt, context = {}) => {
    try {
      // Preparar contexto completo para Claude
      const enrichedPrompt = `
Eres un experto asesor de ventas de Ventapel Brasil. Responde de forma directa y sin rodeos.

CONTEXTO ACTUAL:
${context.cliente ? `Cliente: ${context.cliente}` : ''}
${context.industria ? `Industria: ${context.industria}` : ''}
${context.valor ? `Valor: R$ ${context.valor.toLocaleString('pt-BR')}` : ''}
${context.etapa ? `Etapa: ${context.etapa}` : ''}
${context.scoreDor ? `Score DOR: ${context.scoreDor}/10` : ''}
${context.scorePoder ? `Score PODER: ${context.scorePoder}/10` : ''}

CASOS DE ÉXITO REALES (NO inventes otros):
- Honda: +40% velocidad, ROI 3 meses
- L'Oréal: 100% robos eliminados
- Nike: Cero violaciones
- MercadoLibre: -40% retrabajo
- Centauro: R$50M/año recuperados

SOLICITUD: ${prompt}

Responde en español directo y específico.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [
            { role: "user", content: enrichedPrompt }
          ]
        })
      });

      if (!response.ok) {
        console.error('Claude API error:', response.status);
        return null;
      }

      const data = await response.json();
      return data.content[0].text;
      
    } catch (error) {
      console.error('Error llamando a Claude:', error);
      return null;
    }
  }, []);

  // ============= ANÁLISIS LOCAL DE OPORTUNIDADES =============
  const analyzeOpportunityLocal = useCallback((opp) => {
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
    
    if (opp.industry?.toLowerCase().includes('cosmé') || opp.industry?.toLowerCase().includes('beleza')) {
      analysis += `L'Oréal Brasil: 100% robos eliminados, ROI 3 meses, R$2.5M ahorro anual\n`;
    } else if (opp.industry?.toLowerCase().includes('commerce')) {
      analysis += `MercadoLibre: 40% reducción retrabajo, ROI 2 meses\n`;
    } else if (opp.industry?.toLowerCase().includes('auto')) {
      analysis += `Honda Argentina: +40% velocidad, 100% pérdidas eliminadas\n`;
    } else {
      analysis += `Nike Brasil: Cero violaciones, +30% eficiencia, ROI 2 meses\n`;
    }
    
    return analysis;
  }, []);

  // ============= GENERADORES DE CONTENIDO =============
  const generateEmail = useCallback((opp) => {
    const daysSince = opp.last_update ? 
      Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24)) : 0;
    
    let email = `📧 **EMAIL PARA ${opp.client}**\n\n`;
    
    // Asunto
    if (daysSince > 7) {
      email += `**Asunto:** ${opp.client} - Actualización urgente sobre pérdidas detectadas\n\n`;
    } else if (opp.scales?.dor?.score >= 7) {
      email += `**Asunto:** ${opp.client} - Solución para eliminar R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')}/mes en pérdidas\n\n`;
    } else {
      email += `**Asunto:** Caso ${opp.industry === 'e-commerce' ? 'MercadoLibre' : 'L\'Oréal'} - ROI 3 meses garantizado\n\n`;
    }
    
    email += `**Para:** ${opp.sponsor || opp.power_sponsor || 'Gerente de Operaciones'}\n\n`;
    
    email += `---\n\n`;
    
    // Cuerpo del email
    email += `Hola ${opp.sponsor?.split(' ')[0] || 'equipo'},\n\n`;
    
    if (daysSince > 7) {
      email += `Hace ${daysSince} días que no conversamos y quería compartir algo importante.\n\n`;
    }
    
    // Dolor y datos
    if (opp.scales?.dor?.score >= 5) {
      email += `Entiendo que están perdiendo aproximadamente R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')}/mes en violaciones de cajas`;
      email += ` (basado en el promedio de ${(BENCHMARKS_BRASIL[opp.industry?.toLowerCase()] || BENCHMARKS_BRASIL['e-commerce']).perdidas_promedio * 100}% del sector).\n\n`;
    } else {
      email += `Empresas como la suya en ${opp.industry || 'el sector'} pierden en promedio `;
      email += `${(BENCHMARKS_BRASIL[opp.industry?.toLowerCase()] || BENCHMARKS_BRASIL['e-commerce']).perdidas_promedio * 100}% `;
      email += `por violación de cajas (fuente: ${(BENCHMARKS_BRASIL[opp.industry?.toLowerCase()] || BENCHMARKS_BRASIL['e-commerce']).fuente}).\n\n`;
    }
    
    // Caso de éxito
    const casoRelevante = opp.industry?.toLowerCase().includes('commerce') ? 'mercadolibre' : 
                          opp.industry?.toLowerCase().includes('cosmé') ? 'loreal' : 'nike';
    const caso = CASOS_EXITO_REALES[casoRelevante];
    
    email += `${caso.empresa} tenía el mismo problema. `;
    email += `Con nuestra solución ${caso.solucion}, lograron:\n`;
    email += `• ${caso.resultados.perdidas === '100% eliminadas' ? 'Eliminar 100% de las pérdidas' : caso.resultados.furtos || caso.resultados.retrabajo}\n`;
    email += `• ROI en ${caso.resultados.roi_meses} meses\n`;
    email += `• Ahorro de R$ ${(caso.resultados.ahorro_anual || caso.resultados.ahorro_mensual * 12).toLocaleString('pt-BR')}/año\n\n`;
    
    // Call to action
    if (opp.stage < 3) {
      email += `¿Podemos agendar 30 minutos esta semana para mostrarles exactamente cómo funciona?\n\n`;
      email += `Tengo disponible:\n`;
      email += `• Martes 14:00-17:00\n`;
      email += `• Miércoles 10:00-12:00\n`;
      email += `• Jueves todo el día\n\n`;
    } else if (opp.stage < 5) {
      email += `¿Cuándo podríamos hacer una prueba en su operación? `;
      email += `Garantizamos resultados o devolvemos el dinero.\n\n`;
    } else {
      email += `¿Hay algo pendiente para avanzar con la implementación?\n\n`;
    }
    
    email += `Saludos,\n${currentUser || 'Equipo Ventapel'}\n`;
    email += `📱 WhatsApp: +55 11 9xxxx-xxxx`;
    
    return email;
  }, [currentUser]);

  const generateCallScript = useCallback((opp) => {
    let script = `📞 **SCRIPT DE LLAMADA SPIN - ${opp.client}**\n\n`;
    
    script += `⏱️ **Duración objetivo:** 15 minutos\n\n`;
    
    script += `**1️⃣ APERTURA (30 segundos):**\n`;
    script += `"Hola ${opp.sponsor?.split(' ')[0] || '[NOMBRE]'}, soy ${currentUser} de Ventapel. `;
    script += `¿Tienes 15 minutos? Quiero compartir cómo ${opp.industry === 'e-commerce' ? 'MercadoLibre' : 'L\'Oréal'} `;
    script += `eliminó R$ ${opp.industry === 'e-commerce' ? '180.000' : '250.000'}/mes en pérdidas."\n\n`;
    
    script += `**2️⃣ SITUACIÓN (3 minutos):**\n`;
    script += `• "¿Cuántas cajas procesan por mes actualmente?"\n`;
    script += `• "¿Qué sistema de sellado usan hoy?"\n`;
    script += `• "¿Cómo miden las violaciones de cajas?"\n\n`;
    
    script += `**3️⃣ PROBLEMA (4 minutos):**\n`;
    script += `• "¿Qué porcentaje de cajas llegan violadas al cliente final?"\n`;
    script += `• "¿Cuánto tiempo pierden en retrabajo por cajas violadas?"\n`;
    
    if (!opp.power_sponsor) {
      script += `• "¿Quién en la empresa ve estos números de pérdidas?"\n\n`;
    } else {
      script += `• "¿${opp.power_sponsor} ve estos números mensualmente?"\n\n`;
    }
    
    script += `**4️⃣ IMPLICACIÓN (3 minutos):**\n`;
    script += `• "Si pierden ${(BENCHMARKS_BRASIL[opp.industry?.toLowerCase()] || BENCHMARKS_BRASIL['e-commerce']).perdidas_promedio * 100}% (promedio Brasil), `;
    script += `serían R$ ${Math.round(opp.value * 0.1).toLocaleString('pt-BR')}/mes. ¿Es correcto?"\n`;
    script += `• "¿Qué impacto tiene esto en la satisfacción del cliente?"\n`;
    script += `• "¿Han calculado el costo anual de este problema?"\n\n`;
    
    script += `**5️⃣ NECESIDAD-BENEFICIO (4 minutos):**\n`;
    script += `• "Si pudieran eliminar 95% de esas pérdidas, ¿qué significaría para ustedes?"\n`;
    script += `• "¿Cuánto valorarían una solución con ROI en 3 meses?"\n`;
    script += `• "¿Les interesaría ver cómo ${opp.industry === 'e-commerce' ? 'MercadoLibre' : 'Nike'} lo logró?"\n\n`;
    
    script += `**6️⃣ CIERRE (1 minuto):**\n`;
    
    if (opp.stage < 3) {
      script += `"Perfecto. Te propongo hacer una demo de 30 minutos donde te muestro:\n`;
      script += `1. El caso completo de ${opp.industry === 'e-commerce' ? 'MercadoLibre' : 'L\'Oréal'}\n`;
      script += `2. ROI específico para su volumen\n`;
      script += `3. Video de la solución funcionando\n\n`;
      script += `¿Martes o jueves te viene mejor?"\n`;
    } else {
      script += `"Excelente. El siguiente paso es hacer una prueba en su operación.\n`;
      script += `Traemos el equipo, lo probamos 1 día, y si no ven resultados, no hay compromiso.\n`;
      script += `¿Cuándo podríamos coordinar?"\n`;
    }
    
    script += `\n**⚠️ OBJECIONES COMUNES:**\n`;
    script += `• "No tenemos presupuesto" → "Por eso el ROI es en 3 meses, se paga solo"\n`;
    script += `• "Ya tenemos sistema" → "¿Está eliminando 95% de violaciones? Podemos mejorar eso"\n`;
    script += `• "No es prioridad" → "R$ ${Math.round(opp.value * 0.1 * 12).toLocaleString('pt-BR')}/año en pérdidas, ¿no es prioridad?"\n`;
    
    return script;
  }, [currentUser]);

  const generateROI = useCallback((opp) => {
    const benchmark = BENCHMARKS_BRASIL[opp.industry?.toLowerCase()] || BENCHMARKS_BRASIL['e-commerce'];
    const monthlyBoxes = Math.round(opp.value / 100);
    const monthlyLoss = Math.round(monthlyBoxes * benchmark.perdidas_promedio * benchmark.costo_retrabajo);
    const investment = monthlyBoxes < 5000 ? 45000 : 
                      monthlyBoxes < 20000 ? 95000 : 
                      monthlyBoxes < 50000 ? 180000 : 350000;
    const monthlySavings = Math.round(monthlyLoss * 0.95);
    const paybackMonths = Math.ceil(investment / monthlySavings);
    
    let roi = `💰 **ANÁLISIS ROI - ${opp.client}**\n\n`;
    
    roi += `**📊 SITUACIÓN ACTUAL:**\n`;
    roi += `• Industria: ${opp.industry || 'General'}\n`;
    roi += `• Cajas/mes: ${monthlyBoxes.toLocaleString('pt-BR')}\n`;
    roi += `• Tasa violación Brasil: ${(benchmark.perdidas_promedio * 100).toFixed(1)}% (${benchmark.fuente})\n`;
    roi += `• Cajas violadas/mes: ${Math.round(monthlyBoxes * benchmark.perdidas_promedio).toLocaleString('pt-BR')}\n`;
    roi += `• Costo retrabajo: R$ ${benchmark.costo_retrabajo}/caja\n`;
    roi += `• **Pérdida mensual: R$ ${monthlyLoss.toLocaleString('pt-BR')}**\n`;
    roi += `• **Pérdida anual: R$ ${(monthlyLoss * 12).toLocaleString('pt-BR')}**\n\n`;
    
    roi += `**🎯 SOLUCIÓN VENTAPEL:**\n`;
    
    if (monthlyBoxes < 5000) {
      roi += `• Equipo: BP222 Curby (compacto)\n`;
      roi += `• Consumible: Fita Gorilla 300m\n`;
    } else if (monthlyBoxes < 20000) {
      roi += `• Equipo: BP555e (alta eficiencia)\n`;
      roi += `• Consumible: Fita VENOM reinforced\n`;
    } else if (monthlyBoxes < 50000) {
      roi += `• Equipo: BP755 (alto volumen)\n`;
      roi += `• Consumible: Fita Gorilla 700m\n`;
    } else {
      roi += `• Equipo: RSA (Random Sealer Automated)\n`;
      roi += `• Consumible: Fita Gorilla 700m + VENOM\n`;
    }
    
    roi += `• Inversión total: R$ ${investment.toLocaleString('pt-BR')}\n`;
    roi += `• Instalación: 1-3 días\n`;
    roi += `• Garantía: 2 años\n\n`;
    
    roi += `**✅ RESULTADOS GARANTIZADOS:**\n`;
    roi += `• Reducción violaciones: 95%\n`;
    roi += `• Mejora velocidad: +40%\n`;
    roi += `• Ahorro mensual: R$ ${monthlySavings.toLocaleString('pt-BR')}\n`;
    roi += `• Ahorro anual: R$ ${(monthlySavings * 12).toLocaleString('pt-BR')}\n`;
    roi += `• **RETORNO DE INVERSIÓN: ${paybackMonths} MESES**\n`;
    roi += `• ROI primer año: ${Math.round(((monthlySavings * 12 - investment) / investment) * 100)}%\n`;
    roi += `• ROI 3 años: ${Math.round(((monthlySavings * 36 - investment) / investment) * 100)}%\n\n`;
    
    roi += `**📈 CASO SIMILAR:**\n`;
    const casoSimilar = opp.industry?.toLowerCase().includes('commerce') ? CASOS_EXITO_REALES.mercadolibre :
                        opp.industry?.toLowerCase().includes('cosmé') ? CASOS_EXITO_REALES.loreal :
                        CASOS_EXITO_REALES.nike;
    
    roi += `${casoSimilar.empresa}:\n`;
    roi += `• Inversión: R$ ${casoSimilar.resultados.inversion.toLocaleString('pt-BR')}\n`;
    roi += `• ROI: ${casoSimilar.resultados.roi_meses} meses\n`;
    roi += `• Ahorro anual: R$ ${(casoSimilar.resultados.ahorro_anual || casoSimilar.resultados.ahorro_mensual * 12).toLocaleString('pt-BR')}\n`;
    
    return roi;
  }, []);

  // ============= PROCESAMIENTO DE MENSAJES PRINCIPAL =============
  const sendMessage = useCallback(async (text = input) => {
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
      let useClaudeAPI = false;

      // 1. Buscar si mencionó una empresa del CRM
      const foundOpp = allOpportunities.find(opp => {
        const clientLower = opp.client?.toLowerCase() || '';
        return lowerText.includes(clientLower) || clientLower.includes(lowerText);
      });

      // 2. Procesar según el tipo de comando
      if (foundOpp) {
        // Análisis de oportunidad existente
        response = analyzeOpportunityLocal(foundOpp);
        
        // Intentar enriquecer con Claude si está disponible
        if (lowerText.includes('estrategia') || lowerText.includes('completo')) {
          setIsThinking(true);
          const claudeResponse = await callClaudeAPI(
            `Analiza ${foundOpp.client} y dame 3 acciones específicas para cerrar el deal`,
            {
              cliente: foundOpp.client,
              industria: foundOpp.industry,
              valor: foundOpp.value,
              scoreDor: foundOpp.scales?.dor?.score,
              scorePoder: foundOpp.scales?.poder?.score
            }
          );
          
          if (claudeResponse) {
            response += `\n\n🤖 **ANÁLISIS CLAUDE AI:**\n${claudeResponse}`;
          }
          setIsThinking(false);
        }
        
      } else if (lowerText === 'hola' || lowerText === 'hey' || lowerText === 'hi') {
        response = `👋 ¡Hola ${currentUser}! Soy tu asistente Ventapel.\n\n`;
        response += `Tengo ${allOpportunities.length} oportunidades cargadas.\n\n`;
        response += `**Puedo ayudarte con:**\n`;
        response += `• Escribir el nombre de cualquier cliente para análisis\n`;
        response += `• "email" - Generar email de venta\n`;
        response += `• "script" - Script de llamada SPIN\n`;
        response += `• "roi" - Calcular retorno de inversión\n`;
        response += `• "listar" - Ver todas las oportunidades\n`;
        response += `• "ayuda" - Ver todos los comandos\n`;
        
        if (currentOpportunity) {
          response += `\n📌 **Cliente actual:** ${currentOpportunity.client}`;
        }
        
      } else if (lowerText === 'ayuda' || lowerText === 'help' || lowerText === '?') {
        response = `📚 **COMANDOS DISPONIBLES:**\n\n`;
        response += `**ANÁLISIS DE CLIENTES:**\n`;
        allOpportunities.slice(0, 5).forEach(opp => {
          response += `• "${opp.client}" - Análisis completo\n`;
        });
        response += `\n**GENERACIÓN DE CONTENIDO:**\n`;
        response += `• "email" - Email personalizado para venta\n`;
        response += `• "script" - Script de llamada SPIN\n`;
        response += `• "roi" - Cálculo de ROI con datos reales\n`;
        response += `• "estrategia" - Plan de acción completo\n`;
        response += `\n**OTROS COMANDOS:**\n`;
        response += `• "listar" - Ver todas las oportunidades\n`;
        response += `• "casos" - Ver casos de éxito reales\n`;
        response += `• "ayuda" - Ver esta lista\n`;
        
      } else if (lowerText.includes('email')) {
        const targetOpp = currentOpportunity || allOpportunities[0];
        if (targetOpp) {
          response = generateEmail(targetOpp);
        } else {
          response = "❌ No hay oportunidades para generar email. Carga datos primero.";
        }
        
      } else if (lowerText.includes('script') || lowerText.includes('llamada')) {
        const targetOpp = currentOpportunity || allOpportunities[0];
        if (targetOpp) {
          response = generateCallScript(targetOpp);
        } else {
          response = "❌ No hay oportunidades para generar script.";
        }
        
      } else if (lowerText.includes('roi') || lowerText.includes('retorno')) {
        const targetOpp = currentOpportunity || allOpportunities[0];
        if (targetOpp) {
          response = generateROI(targetOpp);
        } else {
          response = "❌ No hay oportunidades para calcular ROI.";
        }
        
      } else if (lowerText === 'listar' || lowerText === 'lista') {
        if (allOpportunities.length === 0) {
          response = "📭 No hay oportunidades en el pipeline.";
        } else {
          response = "📋 **OPORTUNIDADES EN PIPELINE:**\n\n";
          allOpportunities.slice(0, 10).forEach(opp => {
            const score = calculateHealthScore(opp.scales);
            const emoji = score > 7 ? '🟢' : score > 4 ? '🟡' : '🔴';
            response += `${emoji} **${opp.client}** - R$ ${(opp.value || 0).toLocaleString('pt-BR')}\n`;
            response += `   Etapa: ${opp.stage} | Score: ${score}/10 | ${opp.vendor}\n\n`;
          });
        }
        
      } else if (lowerText === 'casos' || lowerText.includes('casos de éxito')) {
        response = "🏆 **CASOS DE ÉXITO REALES VENTAPEL:**\n\n";
        Object.values(CASOS_EXITO_REALES).forEach(caso => {
          response += `**${caso.empresa}** (${caso.sector}):\n`;
          response += `• Problema: ${caso.problema}\n`;
          response += `• Solución: ${caso.solucion}\n`;
          response += `• ROI: ${caso.resultados.roi_meses} meses\n`;
          response += `• Ahorro: R$ ${(caso.resultados.ahorro_anual || caso.resultados.ahorro_mensual * 12).toLocaleString('pt-BR')}/año\n\n`;
        });
        
      } else if (lowerText.includes('estrategia')) {
        // Para estrategia, intentar usar Claude si hay una oportunidad seleccionada
        const targetOpp = currentOpportunity || allOpportunities[0];
        if (targetOpp) {
          response = analyzeOpportunityLocal(targetOpp);
          
          // Intentar enriquecer con Claude
          setIsThinking(true);
          const claudeResponse = await callClaudeAPI(
            `Dame una estrategia de 5 pasos para cerrar ${targetOpp.client}. Sé específico y directo.`,
            {
              cliente: targetOpp.client,
              industria: targetOpp.industry,
              valor: targetOpp.value
            }
          );
          
          if (claudeResponse) {
            response += `\n\n🎯 **ESTRATEGIA PERSONALIZADA:**\n${claudeResponse}`;
          }
          setIsThinking(false);
        } else {
          response = "❌ Selecciona un cliente primero.";
        }
        
      } else {
        // Para cualquier otra pregunta, intentar interpretarla
        // Primero buscar si es una pregunta sobre algún cliente
        const possibleClient = allOpportunities.find(opp => 
          lowerText.includes(opp.client.toLowerCase())
        );
        
        if (possibleClient) {
          response = analyzeOpportunityLocal(possibleClient);
        } else {
          // Pregunta general - intentar con Claude
          setIsThinking(true);
          const claudeResponse = await callClaudeAPI(text, {
            oportunidadesDisponibles: allOpportunities.slice(0, 5).map(o => o.client).join(', ')
          });
          
          if (claudeResponse) {
            response = claudeResponse;
          } else {
            // Fallback si Claude no responde
            response = `🤔 No entendí bien "${text}".\n\n`;
            response += `**Prueba con:**\n`;
            response += `• Nombre de un cliente: ${allOpportunities.slice(0, 3).map(o => o.client).join(', ')}\n`;
            response += `• Comandos: email, script, roi, listar, casos\n`;
            response += `• "ayuda" para ver todo\n`;
          }
          setIsThinking(false);
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
        content: '❌ Error procesando. Por favor intenta de nuevo.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, allOpportunities, currentOpportunity, currentUser, analyzeOpportunityLocal, callClaudeAPI, generateEmail, generateCallScript, generateROI]);

  // ============= QUICK ACTIONS =============
  const quickActions = [
    {
      icon: <Mail className="w-4 h-4" />,
      label: 'Email',
      action: () => sendMessage('email'),
      color: 'bg-green-500'
    },
    {
      icon: <Phone className="w-4 h-4" />,
      label: 'Script',
      action: () => sendMessage('script'),
      color: 'bg-purple-500'
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'ROI',
      action: () => sendMessage('roi'),
      color: 'bg-yellow-500'
    },
    {
      icon: <Target className="w-4 h-4" />,
      label: 'Estrategia',
      action: () => sendMessage('estrategia'),
      color: 'bg-red-500'
    },
    {
      icon: <Database className="w-4 h-4" />,
      label: 'Listar',
      action: () => sendMessage('listar'),
      color: 'bg-gray-500'
    },
    {
      icon: <Award className="w-4 h-4" />,
      label: 'Casos',
      action: () => sendMessage('casos'),
      color: 'bg-blue-500'
    }
  ];

  // ============= RENDER PRINCIPAL =============
  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
        <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Asistente AI Ventapel
        </span>
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
                  <p className="text-xs opacity-90">Powered by Claude AI</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {currentOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-3 py-1">
                <p className="text-xs">
                  🎯 {currentOpportunity.client} | 
                  Etapa {currentOpportunity.stage} | 
                  Score {calculateHealthScore(currentOpportunity.scales)}/10
                </p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b">
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={action.action}
                  className={`${action.color} text-white rounded-lg px-2 py-2 text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1`}
                  disabled={isLoading}
                >
                  {action.icon}
                  <span className="font-medium">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {messages.length === 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-xl">
                <p className="font-bold text-purple-700 mb-2">
                  👋 ¡Hola {currentUser}! Soy tu asesor Ventapel AI
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  Tengo acceso a casos reales y datos de Brasil 2024:
                </p>
                <ul className="text-xs space-y-1 text-gray-600">
                  <li>✅ Honda: +40% velocidad, ROI 3 meses</li>
                  <li>✅ L'Oréal: 100% robos eliminados</li>
                  <li>✅ Nike: Cero violaciones</li>
                  <li>✅ MercadoLibre: -40% retrabajo</li>
                  <li>✅ Centauro: R$50M/año recuperados</li>
                </ul>
                <p className="text-xs font-bold text-purple-700 mt-3">
                  Escribe el nombre de cualquier cliente o "ayuda" para ver comandos.
                </p>
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
                      {isThinking ? 'Analizando con Claude AI...' : 'Procesando...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                placeholder="Cliente, comando o pregunta..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span className="text-xs text-gray-500">AI activo • {allOpportunities.length} oportunidades</span>
              </div>
              <span className="text-xs text-gray-400">
                Casos reales • Datos Brasil 2024
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
