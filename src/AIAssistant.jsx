import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Target, Mail, Phone, DollarSign, TrendingUp, Brain, Send, Loader2, Bot, Sparkles, AlertCircle, FileText } from 'lucide-react';

// ============= COMPONENTE SIMPLIFICADO - SOLO MENSAJERO =============
const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ============= FUNCIÓN PRINCIPAL - LLAMAR AL BACKEND =============
  const processMessage = async (text, action = null) => {
    if (!text?.trim() && !action) return;

    // Agregar mensaje del usuario si hay texto
    if (text) {
      const userMessage = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }

    setIsLoading(true);

    try {
      // Llamar al backend con la oportunidad actual y el input
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          userInput: text,
          opportunityData: currentOpportunity,
          vendorName: currentUser
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

  // ============= BOTONES DE ACCIÓN RÁPIDA =============
  const quickActions = currentOpportunity ? [
    {
      icon: <Brain className="w-4 h-4" />,
      label: 'Analizar',
      action: () => processMessage('', 'analizar'),
      color: 'bg-purple-500',
      tooltip: 'Análisis PPVVCC completo'
    },
    {
      icon: <Target className="w-4 h-4" />,
      label: 'Dolor',
      action: () => processMessage('', 'dolor'),
      color: 'bg-red-500',
      tooltip: 'Estrategia para elevar dolor'
    },
    {
      icon: <DollarSign className="w-4 h-4" />,
      label: 'ROI',
      action: () => processMessage('', 'roi'),
      color: 'bg-green-500',
      tooltip: 'Calcular retorno de inversión'
    },
    {
      icon: <Mail className="w-4 h-4" />,
      label: 'Email',
      action: () => processMessage('', 'email'),
      color: 'bg-blue-500',
      tooltip: 'Generar email de venta'
    },
    {
      icon: <Phone className="w-4 h-4" />,
      label: 'Llamada',
      action: () => processMessage('', 'llamada'),
      color: 'bg-yellow-500',
      tooltip: 'Script para llamada'
    },
    {
      icon: <TrendingUp className="w-4 h-4" />,
      label: 'Estrategia',
      action: () => processMessage('', 'estrategia'),
      color: 'bg-indigo-500',
      tooltip: 'Plan completo de acción'
    }
  ] : [
    {
      icon: <AlertCircle className="w-4 h-4" />,
      label: 'Sin cliente',
      action: () => {},
      color: 'bg-gray-400',
      tooltip: 'Selecciona un cliente del CRM',
      disabled: true
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
        {!isOpen && currentOpportunity && (
          <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Coach PPVVCC
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
                  <h3 className="font-bold">Coach de Ventas PPVVCC</h3>
                  <p className="text-xs opacity-90">
                    {currentOpportunity 
                      ? `🎯 ${currentOpportunity.client}` 
                      : '⚠️ Selecciona un cliente'}
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
                  <span>
                    DOR: {currentOpportunity.scales?.dor?.score || 0}/10
                  </span>
                  <span>
                    PODER: {currentOpportunity.scales?.poder?.score || 0}/10
                  </span>
                  <span>
                    Etapa: {currentOpportunity.stage}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b">
            <div className="grid grid-cols-3 gap-2">
              {quickActions.slice(0, 6).map((action, idx) => (
                <button
                  key={idx}
                  onClick={action.action}
                  disabled={action.disabled || isLoading}
                  className={`${action.color} text-white rounded-lg px-3 py-2 text-xs hover:opacity-90 transition-all flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={action.tooltip}
                >
                  {action.icon}
                  <span className="font-medium">{action.label}</span>
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
                {currentOpportunity ? (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      Analizando: <strong>{currentOpportunity.client}</strong>
                    </p>
                    <p className="text-xs text-gray-500">
                      Usa los botones de arriba o escribe tu pregunta.
                    </p>
                  </>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                    <p className="text-sm text-yellow-800">
                      ⚠️ <strong>Selecciona un cliente del CRM</strong> para empezar
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
                      <span className="text-xs text-purple-500 font-medium">Coach PPVVCC</span>
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
                    <span className="text-sm text-gray-600">Analizando...</span>
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
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isLoading && input.trim()) {
                    processMessage(input);
                  }
                }}
                placeholder={currentOpportunity 
                  ? "Pregunta sobre el cliente o estrategia..." 
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
                      Cliente activo: {currentOpportunity.client}
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
                Powered by PPVVCC
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
