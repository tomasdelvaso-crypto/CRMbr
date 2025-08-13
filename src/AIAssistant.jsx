import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Target, Mail, Phone, DollarSign, TrendingUp, Brain, Send, Loader2, Bot, Sparkles, AlertCircle, Activity, BarChart3, Clock, CheckCircle, XCircle, ChevronRight, Zap, AlertTriangle } from 'lucide-react';

// ============= COMPONENTE PANEL DE ANÁLISIS =============
const AnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;

  const { opportunity, pipeline, alerts, nextBestAction, insights } = analysis;
  
  // Colores según el health score
  const getHealthColor = (score) => {
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Color según prioridad de alerta
  const getAlertColor = (type) => {
    switch(type) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'urgent': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'opportunity': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white border-b overflow-hidden">
      {/* Métricas principales */}
      {opportunity && (
        <div className="p-3 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Activity className={`w-4 h-4 mx-auto mb-1 ${getHealthColor(opportunity.healthScore)}`} />
              <div className={`text-lg font-bold ${getHealthColor(opportunity.healthScore)}`}>
                {opportunity.healthScore}/10
              </div>
              <div className="text-xs text-gray-500">Health</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Target className="w-4 h-4 mx-auto mb-1 text-blue-600" />
              <div className="text-lg font-bold text-blue-600">
                {opportunity.probability}%
              </div>
              <div className="text-xs text-gray-500">Probabilidad</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Clock className="w-4 h-4 mx-auto mb-1 text-gray-600" />
              <div className="text-lg font-bold text-gray-700">
                {opportunity.daysSince}d
              </div>
              <div className="text-xs text-gray-500">Sin contacto</div>
            </div>
          </div>

          {/* Breakdown de escalas */}
          {opportunity.scaleBreakdown && (
            <div className="mt-2 grid grid-cols-6 gap-1">
              {Object.entries(opportunity.scaleBreakdown).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div className="text-xs font-medium text-gray-600 uppercase">{key.slice(0, 3)}</div>
                  <div className={`text-sm font-bold ${value >= 7 ? 'text-green-600' : value >= 4 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alertas principales */}
      {alerts && alerts.length > 0 && (
        <div className="p-2 space-y-1">
          {alerts.slice(0, 2).map((alert, idx) => (
            <div key={idx} className={`text-xs p-2 rounded-lg border flex items-start ${getAlertColor(alert.type)}`}>
              {alert.type === 'critical' && <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              {alert.type === 'urgent' && <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              {alert.type === 'opportunity' && <Zap className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div className="font-semibold">{alert.message}</div>
                {alert.action && (
                  <div className="text-xs opacity-90 mt-0.5">→ {alert.action}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Next Best Action destacada */}
      {nextBestAction && (
        <div className="p-2 border-t border-gray-100">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-2 border border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Target className="w-4 h-4 text-purple-600 mr-2" />
                <div>
                  <div className="text-xs font-bold text-purple-800">{nextBestAction.priority}</div>
                  <div className="text-xs text-purple-700">{nextBestAction.title}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Mini Pipeline Stats (si no hay oportunidad seleccionada) */}
      {!opportunity && pipeline && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <BarChart3 className="w-4 h-4 text-blue-600 mb-1" />
              <div className="text-sm font-bold">{pipeline.total}</div>
              <div className="text-xs text-gray-500">Oportunidades</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <DollarSign className="w-4 h-4 text-green-600 mb-1" />
              <div className="text-sm font-bold">R$ {(pipeline.totalValue / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-gray-500">Pipeline Total</div>
            </div>
          </div>
          {pipeline.atRisk > 0 && (
            <div className="mt-2 text-xs bg-red-50 text-red-700 p-2 rounded-lg">
              ⚠️ {pipeline.atRisk} deals en riesgo (R$ {(pipeline.riskValue / 1000).toFixed(0)}k)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============= COMPONENTE PRINCIPAL MEJORADO =============
const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [dynamicActions, setDynamicActions] = useState([]);
  const [pipelineData, setPipelineData] = useState(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listener para abrir el asistente desde el CRM
  useEffect(() => {
    const handleOpenAssistant = () => {
      setIsOpen(true);
    };
    window.addEventListener('openAssistant', handleOpenAssistant);
    return () => window.removeEventListener('openAssistant', handleOpenAssistant);
  }, []);

  // Cargar datos del pipeline cuando se abre
  useEffect(() => {
    if (isOpen && supabase) {
      loadPipelineData();
    }
  }, [isOpen, supabase]);

  // Actualizar análisis cuando cambia la oportunidad
  useEffect(() => {
    if (currentOpportunity && isOpen) {
      // Hacer una llamada silenciosa al backend para obtener análisis actualizado
      getUpdatedAnalysis();
    }
  }, [currentOpportunity, isOpen]);

  const loadPipelineData = async () => {
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('value', { ascending: false });
      
      if (!error && data) {
        setPipelineData({ allOpportunities: data });
      }
    } catch (err) {
      console.error('Error cargando pipeline:', err);
    }
  };

  const getUpdatedAnalysis = async () => {
    if (!currentOpportunity) return;
    
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: '',  // Sin input para solo obtener análisis
          opportunityData: currentOpportunity,
          vendorName: currentUser,
          pipelineData: pipelineData
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.analysis) {
          setAnalysis(data.analysis);
          if (data.analysis.quickActions) {
            setDynamicActions(data.analysis.quickActions);
          }
        }
      }
    } catch (error) {
      console.error('Error obteniendo análisis:', error);
    }
  };

  // ============= FUNCIÓN PRINCIPAL MEJORADA =============
  const processMessage = async (text) => {
    if (!text?.trim()) return;

    // Agregar mensaje del usuario
    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          opportunityData: currentOpportunity,
          vendorName: currentUser,
          pipelineData: pipelineData
        })
      });

      if (!response.ok) {
        throw new Error('Error en el servidor');
      }

      const data = await response.json();
      
      // Agregar respuesta del asistente
      const assistantMessage = {
        role: 'assistant',
        content: data.response || 'No pude procesar tu solicitud',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // ACTUALIZAR ANÁLISIS Y ACCIONES DINÁMICAS
      if (data.analysis) {
        setAnalysis(data.analysis);
        if (data.analysis.quickActions) {
          setDynamicActions(data.analysis.quickActions);
        }
      }
      
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Error de conexión. Intenta de nuevo.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Usar acciones dinámicas del backend o fallback a las estáticas
  const effectiveActions = dynamicActions.length > 0 ? dynamicActions : [
    {
      icon: '🎯',
      label: 'Dolor',
      prompt: 'Genera una estrategia SPIN para elevar el dolor del cliente',
      color: 'bg-red-500'
    },
    {
      icon: '💰',
      label: 'ROI',
      prompt: 'Calcula el ROI específico para esta oportunidad',
      color: 'bg-green-500'
    },
    {
      icon: '📧',
      label: 'Email',
      prompt: 'Escribe un email de seguimiento potente',
      color: 'bg-blue-500'
    },
    {
      icon: '📞',
      label: 'Llamada',
      prompt: 'Dame un script de llamada con manejo de objeciones',
      color: 'bg-yellow-500'
    },
    {
      icon: '📈',
      label: 'Estrategia',
      prompt: 'Crea un plan de acción para los próximos 5 días',
      color: 'bg-indigo-500'
    },
    {
      icon: '📊',
      label: 'Análisis',
      prompt: 'Análisis PPVVCC completo con acciones concretas',
      color: 'bg-purple-500'
    }
  ];

  // Obtener sugerencias contextuales mejoradas
  const getContextualSuggestions = () => {
    // Si hay insights del análisis, usarlos
    if (analysis?.insights && analysis.insights.length > 0) {
      return analysis.insights.slice(0, 3).map(insight => insight.message);
    }
    
    // Fallback a sugerencias básicas
    if (!currentOpportunity?.scales) return [];
    
    const suggestions = [];
    const dorScore = currentOpportunity.scales?.dor?.score || 0;
    const poderScore = currentOpportunity.scales?.poder?.score || 0;
    
    if (dorScore < 5) {
      suggestions.push("🎯 ¿Cómo puedo hacer que el cliente admita su dolor?");
    }
    if (poderScore < 5) {
      suggestions.push("👤 ¿Cómo accedo al verdadero tomador de decisión?");
    }
    if (currentOpportunity.value > 100000) {
      suggestions.push("💰 El cliente dice que es muy caro, ¿cómo manejo esta objeción?");
    }
    
    return suggestions.slice(0, 3);
  };

  return (
    <>
      {/* Botón flotante mejorado */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group hover:scale-110"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
        {!isOpen && currentOpportunity && analysis?.alerts?.length > 0 && (
          <span className="absolute -top-2 -left-2 w-3 h-3 bg-red-500 rounded-full animate-ping" />
        )}
        {!isOpen && currentOpportunity && (
          <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Coach IA PPVVCC
          </span>
        )}
      </button>

      {/* Ventana del Chat Mejorada */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[500px] h-[700px] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
          
          {/* Header mejorado */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <div>
                  <h3 className="font-bold">Ventus - Coach IA PPVVCC</h3>
                  <p className="text-xs opacity-90">
                    {currentOpportunity 
                      ? `🎯 ${currentOpportunity.client} - ${currentOpportunity.name}` 
                      : '📊 Análisis de Pipeline'}
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
            
            {/* Mini stats en el header */}
            {currentOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center text-xs">
                  <span>Stage: {currentOpportunity.stage}/6</span>
                  <span>Prob: {currentOpportunity.probability || 0}%</span>
                  <span>R$ {(currentOpportunity.value || 0).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            )}
          </div>

          {/* PANEL DE ANÁLISIS EN VIVO */}
          <AnalysisPanel analysis={analysis} />

          {/* Quick Actions Dinámicas */}
          {currentOpportunity && effectiveActions.length > 0 && (
            <div className="p-3 bg-gray-50 border-b">
              <div className="grid grid-cols-3 gap-2">
                {effectiveActions.slice(0, 6).map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => processMessage(action.prompt)}
                    disabled={isLoading}
                    className={`${action.color || 'bg-gray-500'} text-white rounded-lg px-3 py-2 text-xs hover:opacity-90 transition-all flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={action.prompt}
                  >
                    <span className="text-base">{action.icon}</span>
                    <span className="font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages con diseño mejorado */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {messages.length === 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-xl">
                <p className="font-bold text-purple-700 mb-2">
                  👋 ¡Hola {currentUser}!
                </p>
                {currentOpportunity ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      Analizando: <strong>{currentOpportunity.client}</strong>
                    </p>
                    {analysis && (
                      <div className="text-xs bg-white rounded-lg p-2 mb-3 border border-purple-200">
                        <span className="font-semibold text-purple-700">Estado actual:</span>
                        <div className="mt-1">
                          • Health: {analysis.opportunity?.healthScore || 'N/A'}/10<br/>
                          • Probabilidad: {analysis.opportunity?.probability || 'N/A'}%<br/>
                          • {analysis.alerts?.length || 0} alertas activas
                        </div>
                      </div>
                    )}
                    
                    {/* Sugerencias contextuales */}
                    {getContextualSuggestions().length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-purple-700">Sugerencias inteligentes:</p>
                        {getContextualSuggestions().map((suggestion, idx) => (
                          <button
                            key={idx}
                            onClick={() => processMessage(suggestion)}
                            className="w-full text-left text-xs bg-white hover:bg-purple-50 p-2 rounded-lg border border-purple-200 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                    <p className="text-sm text-yellow-800">
                      ⚠️ <strong>Selecciona un cliente del CRM</strong> para análisis completo
                    </p>
                    {pipelineData && (
                      <p className="text-xs text-yellow-700 mt-1">
                        Pipeline actual: {pipelineData.allOpportunities?.length || 0} oportunidades
                      </p>
                    )}
                  </div>
                )}
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
                      <span className="text-xs text-purple-500 font-medium">Ventus Coach</span>
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
                    <span className="text-sm text-gray-600">Analizando con IA...</span>
                    <Brain className="w-4 h-4 text-purple-500 animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input mejorado con indicadores */}
          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isLoading && input.trim()) {
                    processMessage(input);
                  }
                }}
                placeholder={currentOpportunity 
                  ? "Pregúntame sobre estrategias, objeciones, ROI..." 
                  : "Selecciona un cliente o pregunta sobre el pipeline..."}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:bg-gray-100"
                disabled={isLoading}
              />
              <button
                onClick={() => processMessage(input)}
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
              <div className="flex items-center gap-2">
                {currentOpportunity ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-500">
                      {currentOpportunity.client}
                    </span>
                    {analysis && analysis.opportunity && (
                      <span className="text-xs text-gray-400">
                        | Health {analysis.opportunity.healthScore}/10
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    <span className="text-xs text-gray-500">
                      Modo Pipeline
                    </span>
                  </>
                )}
              </div>
              <span className="text-xs text-gray-400">
                Powered by Claude AI + PPVVCC
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
