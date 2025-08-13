import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Target, Mail, Phone, DollarSign, TrendingUp, Brain, Send, Loader2, Bot, Sparkles, AlertCircle, BarChart3, Users, Clock, ChevronRight } from 'lucide-react';

const AIAssistant = ({ currentOpportunity, allOpportunities, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisPanel, setAnalysisPanel] = useState(null); // NUEVO: Estado para el panel
  const [showAnalysis, setShowAnalysis] = useState(true); // NUEVO: Toggle para mostrar/ocultar
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

  // ============= FUNCIÓN PRINCIPAL ACTUALIZADA =============
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
          // ACTUALIZADO: Ahora usa las oportunidades reales del CRM
          pipelineData: { 
            allOpportunities: allOpportunities || []
          }
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
      
      // NUEVO: Actualizar el panel de análisis si viene en la respuesta
      if (data.analysis) {
        setAnalysisPanel(data.analysis);
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

  // NUEVO: Componente para el Panel de Análisis
  const AnalysisPanel = () => {
    if (!analysisPanel || !showAnalysis) return null;

    const { opportunity, pipeline, alerts, nextBestAction } = analysisPanel;

    return (
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 mb-4 border border-purple-200">
        {/* Header del Panel */}
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-bold text-sm text-purple-800 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Análisis PPVVCC en Tiempo Real
          </h4>
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="text-purple-600 hover:text-purple-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Métricas de Oportunidad */}
        {opportunity && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white rounded-lg p-2">
              <div className="text-xs text-gray-600">Health Score</div>
              <div className={`text-lg font-bold ${
                opportunity.healthScore >= 7 ? 'text-green-600' : 
                opportunity.healthScore >= 4 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {opportunity.healthScore}/10
              </div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="text-xs text-gray-600">Probabilidad</div>
              <div className="text-lg font-bold text-blue-600">
                {opportunity.probability}%
              </div>
            </div>
          </div>
        )}

        {/* Alertas Críticas */}
        {alerts && alerts.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-gray-700 mb-1">⚠️ Alertas</div>
            {alerts.slice(0, 2).map((alert, idx) => (
              <div key={idx} className={`text-xs p-2 rounded mb-1 ${
                alert.type === 'critical' ? 'bg-red-100 text-red-700' :
                alert.type === 'urgent' ? 'bg-orange-100 text-orange-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Next Best Action */}
        {nextBestAction && (
          <div className="bg-green-100 rounded-lg p-3 border border-green-300">
            <div className="text-xs font-semibold text-green-800 mb-1">
              🎯 Próxima Acción Recomendada
            </div>
            <div className="text-xs text-green-700">{nextBestAction.title}</div>
            <button
              onClick={() => processMessage(nextBestAction.action)}
              className="mt-2 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              Ejecutar <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Pipeline Stats (si están disponibles) */}
        {pipeline && (
          <div className="mt-3 pt-3 border-t border-purple-200">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-600">Pipeline</div>
                <div className="font-bold text-purple-700">
                  {pipeline.total} deals
                </div>
              </div>
              <div>
                <div className="text-gray-600">En Riesgo</div>
                <div className="font-bold text-red-600">
                  {pipeline.atRisk}
                </div>
              </div>
              <div>
                <div className="text-gray-600">Health Avg</div>
                <div className="font-bold text-blue-600">
                  {pipeline.averageHealth}/10
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============= BOTONES CON PROMPTS NATURALES =============
  const quickActions = currentOpportunity ? [
    {
      icon: <Brain className="w-4 h-4" />,
      label: 'Analizar',
      prompt: 'Analiza esta oportunidad y dime cuál es el principal cuello de botella según PPVVCC',
      color: 'bg-purple-500',
      tooltip: 'Análisis PPVVCC completo'
    },
    {
      icon: <Target className="w-4 h-4" />,
      label: 'Dolor',
      prompt: 'Genera una estrategia SPIN para elevar el dolor del cliente. Incluye un script de llamada',
      color: 'bg-red-500',
      tooltip: 'Estrategia para elevar dolor'
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'ROI',
      prompt: 'Calcula el ROI específico para esta oportunidad con datos reales del sector',
      color: 'bg-green-500',
      tooltip: 'Calcular retorno de inversión'
    },
    {
      icon: <Mail className="w-4 h-4" />,
      label: 'Email',
      prompt: 'Escribe un email de seguimiento potente para este cliente, usando casos de éxito similares',
      color: 'bg-blue-500',
      tooltip: 'Generar email de venta'
    },
    {
      icon: <Phone className="w-4 h-4" />,
      label: 'Llamada',
      prompt: 'Dame un script de llamada de 2 minutos con manejo de las 3 objeciones más comunes',
      color: 'bg-yellow-500',
      tooltip: 'Script para llamada'
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      label: 'Estrategia',
      prompt: 'Crea un plan de acción detallado para los próximos 5 días para cerrar este deal',
      color: 'bg-indigo-500',
      tooltip: 'Plan completo de acción'
    }
  ] : [];

  // Sugerencias contextuales basadas en el análisis
  const getContextualSuggestions = () => {
    const suggestions = [];
    
    // Sugerencias basadas en el análisis si existe
    if (analysisPanel?.opportunity) {
      const { criticalScales } = analysisPanel.opportunity;
      if (criticalScales && criticalScales.length > 0) {
        criticalScales.slice(0, 2).forEach(scale => {
          suggestions.push(`🎯 ${scale.action}`);
        });
      }
    }
    
    // Fallback a sugerencias basadas en escalas
    if (!suggestions.length && currentOpportunity?.scales) {
      const dorScore = currentOpportunity.scales?.dor?.score || 0;
      const poderScore = currentOpportunity.scales?.poder?.score || 0;
      const visaoScore = currentOpportunity.scales?.visao?.score || 0;
      
      if (dorScore < 5) {
        suggestions.push("🎯 ¿Cómo puedo hacer que el cliente admita su dolor?");
      }
      if (poderScore < 5) {
        suggestions.push("👤 ¿Cómo accedo al verdadero tomador de decisión?");
      }
      if (visaoScore < 5) {
        suggestions.push("💡 ¿Cómo construyo una visión de solución convincente?");
      }
    }
    
    return suggestions.slice(0, 3);
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
        {!isOpen && currentOpportunity && (
          <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Coach IA PPVVCC
          </span>
        )}
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
                  <h3 className="font-bold">Ventus - Coach IA PPVVCC</h3>
                  <p className="text-xs opacity-90">
                    {currentOpportunity 
                      ? `🎯 ${currentOpportunity.client} - ${currentOpportunity.name}` 
                      : '⚠️ Selecciona un cliente del CRM'}
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
            
            {currentOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center text-xs">
                  <span>DOR: {currentOpportunity.scales?.dor?.score || 0}/10</span>
                  <span>PODER: {currentOpportunity.scales?.poder?.score || 0}/10</span>
                  <span>Valor: R$ {(currentOpportunity.value || 0).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {currentOpportunity && (
            <div className="p-3 bg-gray-50 border-b">
              <div className="grid grid-cols-3 gap-2">
                {quickActions.map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => processMessage(action.prompt)}
                    disabled={isLoading}
                    className={`${action.color} text-white rounded-lg px-3 py-2 text-xs hover:opacity-90 transition-all flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={action.tooltip}
                  >
                    {action.icon}
                    <span className="font-medium">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages Area con Panel de Análisis */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {/* NUEVO: Panel de Análisis al inicio */}
            {analysisPanel && <AnalysisPanel />}
            
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
                    <p className="text-xs text-gray-500 mb-3">
                      Soy tu coach IA experto en PPVVCC. Puedo ayudarte con estrategias, scripts, cálculos de ROI y más. 
                      ¡Pregúntame lo que necesites!
                    </p>
                    
                    {/* Sugerencias contextuales */}
                    {getContextualSuggestions().length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-purple-700">Sugerencias basadas en esta oportunidad:</p>
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
                      ⚠️ <strong>Selecciona un cliente del CRM</strong> para empezar el análisis
                    </p>
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
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input mejorado */}
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
                  : "Selecciona un cliente primero..."}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:bg-gray-100"
                disabled={isLoading || !currentOpportunity}
              />
              <button
                onClick={() => processMessage(input)}
                disabled={isLoading || !input.trim() || !currentOpportunity}
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
                {currentOpportunity ? (
                  <>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-500">
                      Analizando: {currentOpportunity.client}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                    <span className="text-xs text-gray-500">
                      Sin cliente seleccionado
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
