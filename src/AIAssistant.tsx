import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, TrendingUp, Phone, Target } from 'lucide-react';
import { supabase } from './supabaseClient';

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);

  // Analizar oportunidad cuando cambia
  useEffect(() => {
    if (currentOpportunity) {
      analyzeOpportunity(currentOpportunity);
      checkOpportunityHealth(currentOpportunity);
    }
  }, [currentOpportunity]);

  // Función para analizar la oportunidad actual
  const analyzeOpportunity = (opp) => {
    if (!opp || !opp.scales) return;

    const scales = opp.scales;
    const avgScale = Object.values(scales).reduce((a, b) => a + b, 0) / 6;
    
    // Identificar escalas críticas
    const criticalScales = [];
    if (scales.pain < 5) criticalScales.push({ name: 'DOR', value: scales.pain, issue: 'Cliente no admite el problema' });
    if (scales.power < 4) criticalScales.push({ name: 'PODER', value: scales.power, issue: 'Sin acceso al decisor' });
    if (scales.vision < 4) criticalScales.push({ name: 'VISÃO', value: scales.vision, issue: 'Cliente no ve la solución' });
    if (scales.value < 4) criticalScales.push({ name: 'VALOR', value: scales.value, issue: 'No percibe el ROI' });

    // Calcular probabilidad de cierre
    let probability = 0;
    if (avgScale >= 7) probability = 70;
    else if (avgScale >= 5) probability = 40;
    else if (avgScale >= 3) probability = 20;
    else probability = 5;

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability,
      criticalScales,
      nextAction: generateNextAction(opp)
    });
  };

  // Generar próxima acción recomendada
  const generateNextAction = (opp) => {
    const scales = opp.scales;
    
    if (scales.pain < 5) {
      return {
        action: "Identificar y documentar el dolor",
        script: "Necesitás que admita el problema. Preguntá: '¿Cuántas horas por mes dedican a re-embalar productos dañados?'"
      };
    }
    if (scales.power < 4) {
      return {
        action: "Acceder al tomador de decisión",
        script: "Pedí acceso directo: 'Para diseñar la mejor solución, ¿podríamos incluir al gerente de logística en la próxima reunión?'"
      };
    }
    if (scales.vision < 5) {
      return {
        action: "Construir visión de solución",
        script: "Mostrá el valor completo: 'Les muestro cómo reducimos 40% el retrabalho en MercadoLibre con nuestra solución integrada'"
      };
    }
    if (scales.value < 5) {
      return {
        action: "Demostrar ROI concreto",
        script: "Cuantificá el retorno: 'Con su volumen de 10,000 envíos/mes, ahorrarían R$15,000 mensuales solo en retrabalho'"
      };
    }
    return {
      action: "Avanzar al cierre",
      script: "Cerrá con confianza: '¿Qué necesitamos para comenzar la implementación en 30 días?'"
    };
  };

  // Verificar salud de la oportunidad
  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    // Verificar último contacto
    if (opp.lastContact) {
      const daysSince = Math.floor((new Date() - new Date(opp.lastContact)) / (1000 * 60 * 60 * 24));
      if (daysSince > 5) {
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} días sin contacto - LLAMAR HOY`,
          action: 'generateReengagement'
        });
      }
    }

    // Verificar escalas vs valor
    const avgScale = Object.values(opp.scales).reduce((a, b) => a + b, 0) / 6;
    if (avgScale < 4 && opp.value > 100000) {
      newAlerts.push({
        type: 'warning',
        message: `⚠️ R$${opp.value.toLocaleString()} en riesgo - Escalas bajas (${avgScale.toFixed(1)}/10)`,
        action: 'generateRecoveryPlan'
      });
    }

    // Verificar etapa vs escalas
    if (opp.stage === 'presentation' && opp.scales.pain < 7) {
      newAlerts.push({
        type: 'danger',
        message: '⛔ NO presentes todavía - El dolor no está confirmado',
        action: 'backToQualification'
      });
    }

    setAlerts(newAlerts);
  };

  // Quick Actions dinámicas basadas en la oportunidad
  const getQuickActions = () => {
    if (!currentOpportunity) return [];
    
    const actions = [];
    const scales = currentOpportunity.scales;

    if (scales.pain < 5) {
      actions.push({
        icon: '🎯',
        label: 'Generar preguntas SPIN',
        prompt: `Dame 5 preguntas SPIN específicas para que ${currentOpportunity.client} admita problemas de violación y retrabalho en su operación logística`
      });
    }

    if (scales.power < 4) {
      actions.push({
        icon: '👔',
        label: 'Script para acceder al decisor',
        prompt: `Dame un script exacto para pedirle a mi contacto actual que me presente al gerente de operaciones de ${currentOpportunity.client}`
      });
    }

    if (scales.value < 5) {
      actions.push({
        icon: '💰',
        label: 'Calcular ROI específico',
        prompt: `Calcula el ROI para ${currentOpportunity.client} con inversión de R$${currentOpportunity.value}. Industria: ${currentOpportunity.industry || 'logística'}`
      });
    }

    if (alerts.length > 0) {
      actions.push({
        icon: '🚨',
        label: 'Plan de recuperación',
        prompt: `${currentOpportunity.client} está frío. Dame un plan de 3 pasos para reactivar esta oportunidad de R$${currentOpportunity.value}`
      });
    }

    actions.push({
      icon: '📊',
      label: 'Análisis PPVVCC completo',
      prompt: `Analiza las escalas actuales de ${currentOpportunity.client} y dame acciones específicas para subir cada una 2 puntos`
    });

    return actions;
  };

  // Enviar mensaje al asistente
  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Incluir contexto de la oportunidad actual
      const contextualPrompt = currentOpportunity ? `
        CONTEXTO DE LA OPORTUNIDAD ACTUAL:
        Cliente: ${currentOpportunity.client}
        Valor: R$${currentOpportunity.value}
        Etapa: ${currentOpportunity.stage}
        Escalas PPVVCC:
        - DOR: ${currentOpportunity.scales.pain}/10
        - PODER: ${currentOpportunity.scales.power}/10
        - VISÃO: ${currentOpportunity.scales.vision}/10
        - VALOR: ${currentOpportunity.scales.value}/10
        - CONTROLE: ${currentOpportunity.scales.control}/10
        - COMPRAS: ${currentOpportunity.scales.purchase}/10
        
        Último contacto: ${currentOpportunity.lastContact || 'No registrado'}
        Próximo paso: ${currentOpportunity.nextStep || 'No definido'}
        
        PREGUNTA: ${messageText}
      ` : messageText;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: contextualPrompt,
          opportunityData: currentOpportunity
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error al procesar la solicitud. Intenta nuevamente.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Panel de Análisis en el CRM */}
      {currentOpportunity && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> Análisis AI: {currentOpportunity.client}
            </h3>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{analysis.probability}%</div>
              <div className="text-xs text-gray-600">Probabilidad cierre</div>
            </div>
          </div>

          {/* Semáforo de Escalas */}
          <div className="grid grid-cols-6 gap-2 mb-4">
            {Object.entries(currentOpportunity.scales).map(([key, value]) => (
              <div key={key} className={`text-center p-2 rounded-lg ${
                value < 4 ? 'bg-red-500' : 
                value < 7 ? 'bg-yellow-500' : 
                'bg-green-500'
              }`}>
                <div className="text-white text-xs font-semibold">
                  {key === 'pain' ? 'DOR' :
                   key === 'power' ? 'PODER' :
                   key === 'vision' ? 'VISÃO' :
                   key === 'value' ? 'VALOR' :
                   key === 'control' ? 'CONTROL' :
                   'COMPRAS'}
                </div>
                <div className="text-white text-xl font-bold">{value}</div>
              </div>
            ))}
          </div>

          {/* Alertas Críticas */}
          {alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {alerts.map((alert, idx) => (
                <div key={idx} className={`p-2 rounded-lg flex items-center ${
                  alert.type === 'urgent' ? 'bg-red-100 text-red-700' :
                  alert.type === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  <AlertTriangle className="mr-2 w-4 h-4" />
                  <span className="text-sm font-medium">{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Próxima Acción Recomendada */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-sm mb-1 flex items-center">
                <TrendingUp className="mr-1 w-4 h-4" /> Próxima Acción:
              </h4>
              <p className="text-sm text-gray-700 mb-2">{analysis.nextAction.action}</p>
              <div className="bg-blue-50 p-2 rounded border-l-2 border-blue-400">
                <p className="text-xs text-gray-600 italic">"{analysis.nextAction.script}"</p>
              </div>
              <button 
                onClick={() => {
                  setIsOpen(true);
                  setInput(analysis.nextAction.script);
                }}
                className="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition"
              >
                Generar Script Completo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante del asistente */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50"
      >
        <MessageCircle size={24} />
        {alerts.length > 0 && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
        )}
      </button>

      {/* Chat del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg flex justify-between items-center">
            <h3 className="font-semibold">Asistente Ventapel AI</h3>
            <button onClick={() => setIsOpen(false)}>
              <X size={20} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b overflow-x-auto">
            <div className="flex gap-2">
              {getQuickActions().map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(action.prompt)}
                  className="flex-shrink-0 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs hover:bg-gray-100 transition flex items-center gap-1"
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && currentOpportunity && (
              <div className="text-center text-gray-500 text-sm">
                <p className="mb-2">Analizando {currentOpportunity.client}...</p>
                <p className="text-xs">Escalas promedio: {analysis?.avgScale}/10</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Pregunta sobre la oportunidad..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default AIAssistant;
