import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, Loader, TrendingUp, AlertTriangle, CheckCircle, Search, Lightbulb, BarChart3, Target, Sparkles, ChevronDown, ChevronUp, Brain, Zap, Shield, DollarSign, Users, Calendar, FileText, ArrowRight, Clock, Activity } from 'lucide-react';

// Interfaces
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Opportunity {
  id: number;
  name: string;
  client: string;
  vendor: string;
  value: number;
  stage: number;
  priority: string;
  probability: number;
  expected_close?: string;
  next_action?: string;
  product?: string;
  scales: {
    dor: { score: number; description: string };
    poder: { score: number; description: string };
    visao: { score: number; description: string };
    valor: { score: number; description: string };
    controle: { score: number; description: string };
    compras: { score: number; description: string };
  };
}

interface AIAssistantProps {
  opportunities: Opportunity[];
  currentOpportunity?: Opportunity | null;
}

// Funciones auxiliares para llamar a las APIs a través del proxy
const searchWeb = async (query: string): Promise<any> => {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'search',
        data: {
          q: query,
          gl: 'br',
          hl: 'pt',
          num: 10
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching web:', error);
    throw error;
  }
};

const generateWithClaude = async (messages: any[], system?: string): Promise<string> => {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'claude',
        data: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: messages,
          system: system || "Eres un asistente de ventas B2B experto en la metodología PPVVCC (Poder, Problema/Dolor, Visión, Valor, Control, Compras). Ayudas a analizar oportunidades comerciales y generar estrategias de venta consultiva."
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating with Claude:', error);
    throw error;
  }
};

// Componente de Health Score
export const HealthScoreIndicator: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
  const calculateHealthScore = () => {
    if (!opportunity.scales) return 0;
    
    const weights = {
      dor: 0.2,
      poder: 0.25,
      visao: 0.15,
      valor: 0.2,
      controle: 0.1,
      compras: 0.1
    };
    
    const weightedScore = Object.entries(opportunity.scales).reduce((total, [key, value]) => {
      return total + (value.score * weights[key as keyof typeof weights]);
    }, 0);
    
    return Math.round(weightedScore);
  };

  const score = calculateHealthScore();
  const getHealthStatus = () => {
    if (score >= 7) return { text: 'Saludable', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle };
    if (score >= 4) return { text: 'Atención', color: 'text-yellow-600', bg: 'bg-yellow-100', icon: AlertTriangle };
    return { text: 'Crítico', color: 'text-red-600', bg: 'bg-red-100', icon: AlertTriangle };
  };

  const status = getHealthStatus();
  const Icon = status.icon;

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full ${status.bg} ${status.color}`}>
      <Icon className="w-4 h-4 mr-1" />
      <span className="font-semibold text-sm">{score}/10</span>
      <span className="ml-2 text-xs">{status.text}</span>
    </div>
  );
};

// Componente de Insights Panel
export const InsightsPanel: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
  const [expanded, setExpanded] = useState(true);

  const insights = React.useMemo(() => {
    const totalValue = opportunities.reduce((sum, opp) => sum + opp.value, 0);
    const avgProbability = opportunities.reduce((sum, opp) => sum + opp.probability, 0) / opportunities.length;
    
    const riskOpportunities = opportunities.filter(opp => {
      const avgScore = Object.values(opp.scales).reduce((sum, scale) => sum + scale.score, 0) / 6;
      return avgScore < 4;
    });

    const highValueOpps = opportunities.filter(opp => opp.value > 100000);
    
    const stuckOpps = opportunities.filter(opp => {
      const daysSinceUpdate = Math.floor((new Date().getTime() - new Date(opp.expected_close || new Date()).getTime()) / (1000 * 3600 * 24));
      return daysSinceUpdate > 30;
    });

    return {
      totalValue,
      avgProbability,
      riskCount: riskOpportunities.length,
      highValueCount: highValueOpps.length,
      stuckCount: stuckOpps.length,
      recommendations: [
        riskOpportunities.length > 0 && `⚠️ ${riskOpportunities.length} oportunidades necesitan atención urgente en PPVVCC`,
        stuckOpps.length > 0 && `🕐 ${stuckOpps.length} oportunidades están estancadas hace más de 30 días`,
        highValueOpps.length > 0 && `💎 Foco en ${highValueOpps.length} oportunidades de alto valor (>R$100k)`,
        avgProbability < 50 && '📈 La probabilidad promedio es baja. Revisar calificación de leads'
      ].filter(Boolean)
    };
  }, [opportunities]);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl shadow-lg border border-purple-200 overflow-hidden">
      <div 
        className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Brain className="w-5 h-5 mr-2" />
          <h3 className="font-bold">AI Insights & Recomendaciones</h3>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </div>
      
      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-purple-200">
              <div className="flex items-center text-purple-600 mb-1">
                <DollarSign className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Pipeline Total</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                R$ {(insights.totalValue / 1000000).toFixed(1)}M
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <div className="flex items-center text-blue-600 mb-1">
                <Activity className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Prob. Media</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.avgProbability.toFixed(0)}%
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-red-200">
              <div className="flex items-center text-red-600 mb-1">
                <AlertTriangle className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">En Riesgo</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.riskCount}
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-green-200">
              <div className="flex items-center text-green-600 mb-1">
                <Target className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Alto Valor</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.highValueCount}
              </p>
            </div>
          </div>

          {insights.recommendations.length > 0 && (
            <div className="bg-white rounded-lg border border-purple-200 p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                <Lightbulb className="w-4 h-4 mr-2 text-yellow-500" />
                Recomendaciones AI
              </h4>
              <div className="space-y-2">
                {insights.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start">
                    <ArrowRight className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Componente principal AIAssistant
const AIAssistant: React.FC<AIAssistantProps> = ({ opportunities, currentOpportunity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(true);

  // Quick actions
  const quickActions = [
    { icon: Search, label: 'Buscar info cliente', action: 'search' },
    { icon: BarChart3, label: 'Análisis PPVVCC', action: 'analyze' },
    { icon: Lightbulb, label: 'Estrategia de venta', action: 'strategy' },
    { icon: FileText, label: 'Generar propuesta', action: 'proposal' }
  ];

  const handleQuickAction = async (action: string) => {
    if (!currentOpportunity && action !== 'search') {
      setInputMessage('Por favor, selecciona una oportunidad primero');
      return;
    }

    const prompts: { [key: string]: string } = {
      search: 'Busca información sobre el cliente ' + (currentOpportunity?.client || 'actual'),
      analyze: `Analiza esta oportunidad según PPVVCC: ${currentOpportunity?.name} con ${currentOpportunity?.client}. Scores: DOR=${currentOpportunity?.scales.dor.score}, PODER=${currentOpportunity?.scales.poder.score}, VISÃO=${currentOpportunity?.scales.visao.score}, VALOR=${currentOpportunity?.scales.valor.score}, CONTROLE=${currentOpportunity?.scales.controle.score}, COMPRAS=${currentOpportunity?.scales.compras.score}`,
      strategy: `Genera una estrategia de venta para: ${currentOpportunity?.name} con ${currentOpportunity?.client}`,
      proposal: `Ayúdame a crear una propuesta para: ${currentOpportunity?.name} con ${currentOpportunity?.client}`
    };

    if (prompts[action]) {
      setInputMessage(prompts[action]);
      await handleSendMessage(prompts[action]);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputMessage;
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      let assistantResponse = '';

      // Detectar si necesita búsqueda web
      if (text.toLowerCase().includes('busca') || text.toLowerCase().includes('información') || text.toLowerCase().includes('cliente')) {
        const searchQuery = text.replace(/busca|información|sobre|el|cliente/gi, '').trim();
        
        try {
          const searchResults = await searchWeb(searchQuery + ' Brasil empresa');
          
          const searchContext = searchResults.organic?.slice(0, 3).map((result: any) => 
            `${result.title}: ${result.snippet}`
          ).join('\n\n') || 'No se encontraron resultados';

          const claudeMessages = [
            { 
              role: 'user', 
              content: `Contexto de búsqueda web sobre "${searchQuery}":\n\n${searchContext}\n\nBasándote en esta información, ${text}` 
            }
          ];

          assistantResponse = await generateWithClaude(claudeMessages);
        } catch (error) {
          assistantResponse = 'Error al buscar información. Por favor, intenta de nuevo.';
        }
      } else {
        // Análisis PPVVCC o estrategia
        const context = currentOpportunity ? `
          Oportunidad: ${currentOpportunity.name}
          Cliente: ${currentOpportunity.client}
          Valor: R$ ${currentOpportunity.value.toLocaleString('pt-BR')}
          Etapa: ${currentOpportunity.stage}
          Scores PPVVCC:
          - DOR: ${currentOpportunity.scales.dor.score}/10
          - PODER: ${currentOpportunity.scales.poder.score}/10
          - VISÃO: ${currentOpportunity.scales.visao.score}/10
          - VALOR: ${currentOpportunity.scales.valor.score}/10
          - CONTROLE: ${currentOpportunity.scales.controle.score}/10
          - COMPRAS: ${currentOpportunity.scales.compras.score}/10
        ` : 'No hay oportunidad seleccionada.';

        const claudeMessages = [
          { 
            role: 'user', 
            content: `${context}\n\nSolicitud: ${text}` 
          }
        ];

        assistantResponse = await generateWithClaude(claudeMessages);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 flex items-center group"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="ml-2 max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap">
          AI Assistant
        </span>
        <Sparkles className="w-4 h-4 ml-2 animate-pulse" />
      </button>

      {/* Panel del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col" style={{ height: '600px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-xl flex justify-between items-center">
            <div className="flex items-center">
              <Brain className="w-5 h-5 mr-2" />
              <h3 className="font-bold">AI Sales Assistant</h3>
              <Zap className="w-4 h-4 ml-2 text-yellow-300" />
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Insights Panel (opcional) */}
          {showInsights && opportunities.length > 0 && (
            <div className="border-b p-3 bg-gradient-to-r from-purple-50 to-blue-50">
              <InsightsPanel opportunities={opportunities} />
            </div>
          )}

          {/* Quick Actions */}
          <div className="p-3 border-b bg-gray-50">
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.action)}
                    className="flex items-center p-2 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors text-sm"
                  >
                    <Icon className="w-4 h-4 mr-2 text-purple-600" />
                    <span className="text-gray-700">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <Sparkles className="w-12 h-12 mx-auto mb-3 text-purple-400" />
                <p className="text-sm">¡Hola! Soy tu asistente de ventas AI.</p>
                <p className="text-xs mt-2">Puedo ayudarte con:</p>
                <ul className="text-xs mt-2 space-y-1">
                  <li>• Búsqueda de información de clientes</li>
                  <li>• Análisis PPVVCC de oportunidades</li>
                  <li>• Estrategias de venta personalizadas</li>
                  <li>• Generación de propuestas</li>
                </ul>
              </div>
            )}
            
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs mt-1 opacity-70">
                    {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg border border-gray-200">
                  <Loader className="w-5 h-5 animate-spin text-purple-600" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-white rounded-b-xl">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                placeholder="Escribe tu pregunta..."
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputMessage.trim()}
                className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Export default
export default AIAssistant;
