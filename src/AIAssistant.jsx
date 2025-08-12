import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign, Database, Search, Mail, Phone, FileText, MessageSquare, Users, Brain, Sparkles, Bot, Send, ChevronDown, Loader2, CheckCircle, XCircle, TrendingDown, Award } from 'lucide-react';

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
  const [claudeContext, setClaudeContext] = useState([]);
  const [activeView, setActiveView] = useState('chat');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  // Cargar oportunidades
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

  // ============= LLAMADA A CLAUDE API =============
  const callClaudeAPI = async (prompt, context = {}) => {
    try {
      // Preparar el contexto enriquecido con TODOS los datos del CRM
      const enrichedPrompt = `
Eres un experto asesor de ventas de Ventapel Brasil. Tienes acceso a:

CONTEXTO ACTUAL DEL CRM:
- Cliente: ${context.cliente || 'No seleccionado'}
- Industria: ${context.industria || 'No especificada'}
- Valor oportunidad: R$ ${context.valor?.toLocaleString('pt-BR') || '0'}
- Etapa actual: ${context.etapa || 'Prospección'}
- Probabilidad: ${context.probabilidad || 0}%
- Score PPVVCC: ${context.ppvvcc || '0/10'}
- Última actualización: ${context.ultimaActualizacion || 'No registrada'}
- Días sin contacto: ${context.diasSinContacto || 'No calculado'}
- Próxima acción: ${context.proximaAccion || 'No definida'}

SCORES DETALLADOS PPVVCC:
- DOR (Pain): ${context.scoreDor || 0}/10 - ${context.descripcionDor || 'Sin notas'}
- PODER (Power): ${context.scorePoder || 0}/10 - ${context.descripcionPoder || 'Sin notas'}
- VISÃO (Vision): ${context.scoreVisao || 0}/10 - ${context.descripcionVisao || 'Sin notas'}
- VALOR (Value): ${context.scoreValor || 0}/10 - ${context.descripcionValor || 'Sin notas'}
- CONTROLE (Control): ${context.scoreControle || 0}/10 - ${context.descripcionControle || 'Sin notas'}
- COMPRAS (Purchase): ${context.scoreCompras || 0}/10 - ${context.descripcionCompras || 'Sin notas'}

CONTACTOS MAPEADOS:
- Power Sponsor: ${context.powerSponsor || 'No identificado'}
- Sponsor: ${context.sponsor || 'No identificado'}
- Influenciador: ${context.influencer || 'No identificado'}
- Soporte: ${context.supportContact || 'No identificado'}

PIPELINE CONTEXT:
- Total oportunidades vendedor: ${context.totalOportunidades || 0}
- Valor total pipeline: R$ ${context.valorTotalPipeline?.toLocaleString('pt-BR') || '0'}
- Oportunidades en riesgo: ${context.oportunidadesEnRiesgo || 0}
- Deals similares ganados: ${context.dealsSimilaresGanados || 'No hay datos'}

CASOS DE ÉXITO REALES (NO inventar otros):
${JSON.stringify(CASOS_EXITO_REALES, null, 2)}

BENCHMARKS BRASIL 2024:
${JSON.stringify(BENCHMARKS_BRASIL, null, 2)}

INSTRUCCIONES CRÍTICAS:
1. SOLO usa los casos de éxito que te proporcioné arriba. NO inventes casos.
2. Si mencionas ROI, calcula con los datos reales: 10% pérdidas promedio Brasil
3. Sé directo y sin rodeos. El CEO no quiere pérdida de tiempo.
4. Usa métricas reales, no genéricas.
5. Si no sabes algo, di que necesitas más información.

SOLICITUD DEL USUARIO:
${prompt}

Responde en español directo del Río de la Plata como el CEO espera.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            ...claudeContext,
            { role: 'user', content: enrichedPrompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Actualizar contexto de Claude
      setClaudeContext(prev => [
        ...prev.slice(-4), // Mantener últimos 4 mensajes
        { role: 'user', content: prompt },
        { role: 'assistant', content: data.content[0].text }
      ]);

      return data.content[0].text;
    } catch (error) {
      console.error('Error llamando a Claude:', error);
      return null;
    }
  };

  // ============= ANÁLISIS INTELIGENTE CON CLAUDE =============
  const analyzeWithClaude = async (opportunity) => {
    const prompt = `
Analiza esta oportunidad y dame una estrategia CONCRETA:
- Cliente: ${opportunity.client}
- Industria: ${opportunity.industry || 'General'}
- Valor: R$ ${opportunity.value}
- Etapa actual: ${opportunity.stage}
- Dolor actual: ${opportunity.scales?.dor?.score || 0}/10
- Poder: ${opportunity.scales?.poder?.score || 0}/10

Necesito:
1. ¿Qué caso de éxito real debo usar? (SOLO de los que tienes)
2. ¿Cuál es el problema principal a atacar?
3. Script exacto para la próxima llamada (máximo 5 líneas)
4. Objeción probable y cómo responder
5. ROI estimado con números reales

NO inventes casos. USA SOLO: Honda, L'Oréal, Nike, MercadoLibre, Natura o Centauro.`;

    const response = await callClaudeAPI(prompt, {
      cliente: opportunity.client,
      industria: opportunity.industry,
      valor: opportunity.value,
      etapa: opportunity.stage,
      ppvvcc: calculateHealthScore(opportunity.scales)
    });

    return response;
  };

  // ============= BÚSQUEDA WEB INTELIGENTE =============
  const searchCompanyWeb = async (companyName) => {
    setIsThinking(true);
    
    // Primero buscar en web via API
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        specialRequestType: 'web_research',
        companyName: companyName,
        vendorName: currentUser
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      // Ahora pedirle a Claude que analice los resultados
      const claudePrompt = `
Basándote en esta información de ${companyName}:
${data.response}

Crea una estrategia de approach ESPECÍFICA:
1. ¿Qué problema tienen que Ventapel resuelve?
2. ¿A quién debo contactar primero? (cargo específico)
3. ¿Qué caso de éxito usar? (SOLO Honda, L'Oréal, Nike, MercadoLibre, Natura o Centauro)
4. Mensaje de LinkedIn para primer contacto (máximo 3 líneas)
5. Estimación de pérdidas mensuales

Sé DIRECTO y ESPECÍFICO.`;

      const claudeAnalysis = await callClaudeAPI(claudePrompt, {
        cliente: companyName
      });

      setIsThinking(false);
      
      return `${data.response}\n\n🤖 **ANÁLISIS ESTRATÉGICO CLAUDE:**\n${claudeAnalysis}`;
    }
    
    setIsThinking(false);
    return null;
  };

  // ============= GENERADORES MEJORADOS =============
  const generateSmartEmail = async (opp) => {
    const prompt = `
Genera un email de venta para:
- Cliente: ${opp.client}
- Contacto: ${opp.sponsor || 'Gerente'}
- Industria: ${opp.industry || 'General'}
- Valor deal: R$ ${opp.value}
- Etapa: ${opp.stage}

El email debe:
1. Ser máximo 10 líneas
2. Mencionar UN caso de éxito relevante (de los reales)
3. Incluir UNA métrica de pérdida específica
4. Tener UN call-to-action claro
5. Asunto que genere urgencia

NO uses templates genéricos. Hazlo específico para este cliente.`;

    return await callClaudeAPI(prompt, {
      cliente: opp.client,
      industria: opp.industry,
      valor: opp.value
    });
  };

  const generateCallScript = async (opp) => {
    const prompt = `
Crea un script de llamada SPIN para:
- Cliente: ${opp.client}
- Dolor actual: ${opp.scales?.dor?.score || 0}/10
- Poder: ${opp.scales?.poder?.score || 0}/10

Dame:
1. Apertura (máximo 2 líneas)
2. 3 preguntas de SITUACIÓN específicas
3. 2 preguntas de PROBLEMA que duelen
4. 1 pregunta de IMPLICACIÓN financiera
5. Cierre con próximo paso concreto

Tiempo total: 15 minutos. Sé DIRECTO.`;

    return await callClaudeAPI(prompt, {
      cliente: opp.client
    });
  };

  const generateROIAnalysis = async (opp) => {
    const prompt = `
Calcula el ROI REAL para:
- Cliente: ${opp.client}
- Industria: ${opp.industry || 'General'}
- Valor mensual estimado: R$ ${opp.value}

Usa estos datos reales:
- Pérdidas promedio Brasil: 10% (IBEVAR 2024)
- Ventapel reduce: 95% de las pérdidas

Necesito:
1. Pérdidas actuales mensuales en R$
2. Ahorro mensual con Ventapel
3. Inversión estimada (basada en casos similares)
4. ROI en meses
5. Caso de éxito comparable con métricas

NO inventes números. Usa los casos reales y benchmarks que tienes.`;

    return await callClaudeAPI(prompt, {
      cliente: opp.client,
      industria: opp.industry,
      valor: opp.value
    });
  };

  // ============= FUNCIONES AUXILIARES =============
  const calculateHealthScore = (scales) => {
    if (!scales) return 0;
    const values = Object.values(scales).map(s => s?.score || 0);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  };

  const getScaleValue = (scale) => {
    if (!scale) return 0;
    return scale.score || 0;
  };

  // ============= PROCESAMIENTO DE MENSAJES =============
  const sendMessage = async (text = input) => {
    if (!text.trim()) return;

    const userMessage = { 
      role: 'user', 
      content: text,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const lowerText = text.toLowerCase();

    try {
      let response = '';

      // Detectar intención
      if (lowerText.includes('busca') || lowerText.includes('investiga')) {
        const company = text.replace(/busca|buscar|investiga|investigar|información de|sobre/gi, '').trim();
        response = await searchCompanyWeb(company);
        
      } else if (lowerText.includes('email')) {
        if (currentOpportunity) {
          response = await generateSmartEmail(currentOpportunity);
        } else {
          response = "❌ Selecciona un cliente primero para generar el email.";
        }
        
      } else if (lowerText.includes('llamada') || lowerText.includes('script')) {
        if (currentOpportunity) {
          response = await generateCallScript(currentOpportunity);
        } else {
          response = "❌ Selecciona un cliente primero para generar el script.";
        }
        
      } else if (lowerText.includes('roi') || lowerText.includes('retorno')) {
        if (currentOpportunity) {
          response = await generateROIAnalysis(currentOpportunity);
        } else {
          response = "❌ Selecciona un cliente primero para calcular ROI.";
        }
        
      } else if (lowerText.includes('estrategia') || lowerText.includes('plan')) {
        if (currentOpportunity) {
          response = await analyzeWithClaude(currentOpportunity);
        } else {
          response = "❌ Selecciona un cliente primero para crear la estrategia.";
        }
        
      } else if (lowerText === 'listar' || lowerText === 'lista') {
        response = generateOpportunitiesList();
        
      } else {
        // Pregunta general a Claude
        response = await callClaudeAPI(text, {
          cliente: currentOpportunity?.client,
          industria: currentOpportunity?.industry,
          valor: currentOpportunity?.value
        });
        
        if (!response) {
          response = "No pude procesar tu solicitud. Intenta ser más específico.";
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
  };

  const generateOpportunitiesList = () => {
    if (allOpportunities.length === 0) {
      return "📭 No hay oportunidades en el pipeline.";
    }

    let list = "📋 **OPORTUNIDADES EN PIPELINE:**\n\n";
    
    allOpportunities.slice(0, 10).forEach(opp => {
      const score = calculateHealthScore(opp.scales);
      const emoji = score > 7 ? '🟢' : score > 4 ? '🟡' : '🔴';
      
      list += `${emoji} **${opp.client}** - R$ ${opp.value?.toLocaleString('pt-BR')}\n`;
      list += `   Etapa: ${opp.stage} | Score: ${score}/10 | ${opp.vendor}\n\n`;
    });

    return list;
  };

  // ============= QUICK ACTIONS =============
  const quickActions = [
    {
      icon: <Search className="w-4 h-4" />,
      label: 'Buscar Empresa',
      action: () => setInput('busca información de '),
      color: 'bg-blue-500'
    },
    {
      icon: <Mail className="w-4 h-4" />,
      label: 'Email',
      action: () => sendMessage('genera email de venta'),
      color: 'bg-green-500'
    },
    {
      icon: <Phone className="w-4 h-4" />,
      label: 'Script',
      action: () => sendMessage('script de llamada SPIN'),
      color: 'bg-purple-500'
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'ROI',
      action: () => sendMessage('calcula ROI'),
      color: 'bg-yellow-500'
    },
    {
      icon: <Target className="w-4 h-4" />,
      label: 'Estrategia',
      action: () => sendMessage('estrategia completa'),
      color: 'bg-red-500'
    },
    {
      icon: <Database className="w-4 h-4" />,
      label: 'Listar',
      action: () => sendMessage('listar'),
      color: 'bg-gray-500'
    }
  ];

  // ============= RENDER PRINCIPAL =============
  return (
    <>
      {/* Botón flotante mejorado */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
        <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Claude AI Assistant
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
                  <h3 className="font-bold">Asistente Claude AI</h3>
                  <p className="text-xs opacity-90">Powered by Claude Opus 4.1</p>
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
                  👋 Hola {currentUser}! Soy tu asesor potenciado con Claude AI
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
                  Preguntame lo que necesites. Seré directo y específico.
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
                      <span className="text-xs text-purple-500 font-medium">Claude AI</span>
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
                      {isThinking ? 'Claude está analizando...' : 'Escribiendo...'}
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
                placeholder="Pregunta o comando..."
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
                <span className="text-xs text-gray-500">Claude AI activo</span>
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
