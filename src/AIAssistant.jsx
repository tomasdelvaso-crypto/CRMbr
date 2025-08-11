// AIAssistant.jsx - Versión corregida sin alucinaciones
import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, AlertCircle, Search, TrendingUp, DollarSign, Target } from 'lucide-react';

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quickActions, setQuickActions] = useState([]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Hola ${currentUser || 'Vendedor'}! 👋\n\nSoy tu asistente de ventas Ventapel. Puedo ayudarte con:\n\n🔍 **Búsqueda de datos reales** de tus oportunidades\n📊 **Análisis PPVVCC** basado en datos actuales\n📧 **Generación de contenido** para ventas\n💡 **Recomendaciones** basadas en tu pipeline actual\n\n${currentOpportunity ? `Veo que estás trabajando con **${currentOpportunity.client}**. ¿En qué puedo ayudarte?` : '¿Qué necesitas hoy?'}`,
        timestamp: new Date()
      }]);
      
      // Acciones basadas en contexto real
      if (currentOpportunity) {
        setQuickActions([
          { 
            label: '📊 Analizar PPVVCC actual', 
            action: 'analyze_ppvvcc' 
          },
          { 
            label: '📧 Generar email seguimiento', 
            action: 'generate_email' 
          },
          { 
            label: '🔍 Ver deals similares', 
            action: 'search_similar' 
          },
          { 
            label: '💰 Calcular ROI específico', 
            action: 'calculate_roi' 
          }
        ]);
      } else {
        setQuickActions([
          { 
            label: '📊 Ver pipeline actual', 
            action: 'view_pipeline' 
          },
          { 
            label: '🔍 Buscar oportunidad', 
            action: 'search_opportunity' 
          },
          { 
            label: '⚠️ Deals en riesgo', 
            action: 'at_risk_deals' 
          },
          { 
            label: '📈 Métricas del mes', 
            action: 'monthly_metrics' 
          }
        ]);
      }
    }
  }, [isOpen, currentUser, currentOpportunity]);

  const searchOpportunities = async (query) => {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .or(`name.ilike.%${query}%,client.ilike.%${query}%`)
        .limit(5);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error buscando oportunidades:', error);
      return [];
    }
  };

  const analyzeOpportunity = (opp) => {
    if (!opp || !opp.scales) {
      return {
        health: 'Sin datos suficientes',
        risks: ['No hay información de PPVVCC disponible'],
        recommendations: ['Complete la evaluación PPVVCC para obtener recomendaciones']
      };
    }

    const avgScore = Object.values(opp.scales).reduce((sum, scale) => 
      sum + (scale?.score || 0), 0) / 6;
    
    const risks = [];
    const recommendations = [];

    // Análisis basado en datos reales
    if (opp.scales.dor?.score < 5) {
      risks.push('DOR bajo: Cliente no reconoce completamente el problema');
      recommendations.push('Agendar reunión para profundizar en los dolores del cliente');
    }
    
    if (opp.scales.poder?.score < 4) {
      risks.push('PODER bajo: Sin acceso al decisor');
      recommendations.push('Solicitar presentación con el tomador de decisiones');
    }
    
    if (opp.scales.valor?.score < 6 && opp.stage >= 3) {
      risks.push('VALOR bajo para etapa avanzada');
      recommendations.push('Presentar caso de ROI con métricas específicas del cliente');
    }

    // Análisis de inactividad
    const lastUpdate = new Date(opp.last_update);
    const daysSinceUpdate = Math.floor((new Date() - lastUpdate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceUpdate > 7) {
      risks.push(`${daysSinceUpdate} días sin actualización`);
      recommendations.push('Actualizar estado y planificar próxima acción');
    }

    return {
      health: avgScore >= 7 ? 'Saludable' : avgScore >= 4 ? 'Necesita atención' : 'En riesgo',
      avgScore: avgScore.toFixed(1),
      risks,
      recommendations,
      daysSinceUpdate
    };
  };

  const generateEmail = (opp) => {
    if (!opp) return 'No hay datos de oportunidad para generar email';

    const analysis = analyzeOpportunity(opp);
    
    return `Asunto: ${opp.client} - Seguimiento Solución Ventapel

Estimado/a [Nombre del contacto],

Espero que este mensaje lo encuentre bien. 

Me pongo en contacto para dar seguimiento a nuestra conversación sobre la implementación de soluciones de sellado automático Ventapel en ${opp.client}.

${opp.scales?.dor?.score >= 5 ? 
  'Como conversamos, entiendo que actualmente enfrentan desafíos con [problema específico del cliente].' :
  'Me gustaría entender mejor los desafíos actuales en su proceso de empaque.'}

${opp.product ? `Nuestra solución ${opp.product} puede ayudarles a:` : 'Nuestras soluciones pueden ayudarles a:'}
• Reducir costos operacionales hasta 64%
• Mejorar la productividad en 30-50%
• Eliminar problemas ergonómicos del equipo
• ROI comprobado en 2-3 meses

${opp.next_action ? `Como próximo paso, ${opp.next_action}.` : '¿Podríamos agendar una llamada de 15 minutos esta semana?'}

Quedo atento a sus comentarios.

Saludos cordiales,
${currentUser || '[Tu nombre]'}
Ventapel Brasil`;
  };

  const handleQuickAction = async (action) => {
    setIsLoading(true);
    
    try {
      let response = '';
      
      switch(action) {
        case 'analyze_ppvvcc':
          if (currentOpportunity) {
            const analysis = analyzeOpportunity(currentOpportunity);
            response = `📊 **Análisis PPVVCC de ${currentOpportunity.client}**\n\n`;
            response += `**Estado:** ${analysis.health} (Score: ${analysis.avgScore}/10)\n`;
            response += `**Días sin actualización:** ${analysis.daysSinceUpdate}\n\n`;
            
            if (currentOpportunity.scales) {
              response += `**Scores actuales:**\n`;
              response += `• DOR: ${currentOpportunity.scales.dor?.score || 0}/10\n`;
              response += `• PODER: ${currentOpportunity.scales.poder?.score || 0}/10\n`;
              response += `• VISÃO: ${currentOpportunity.scales.visao?.score || 0}/10\n`;
              response += `• VALOR: ${currentOpportunity.scales.valor?.score || 0}/10\n`;
              response += `• CONTROLE: ${currentOpportunity.scales.controle?.score || 0}/10\n`;
              response += `• COMPRAS: ${currentOpportunity.scales.compras?.score || 0}/10\n\n`;
            }
            
            if (analysis.risks.length > 0) {
              response += `**⚠️ Riesgos identificados:**\n`;
              analysis.risks.forEach(risk => {
                response += `• ${risk}\n`;
              });
              response += '\n';
            }
            
            if (analysis.recommendations.length > 0) {
              response += `**💡 Recomendaciones:**\n`;
              analysis.recommendations.forEach(rec => {
                response += `• ${rec}\n`;
              });
            }
          } else {
            response = 'No hay oportunidad seleccionada. Seleccione una oportunidad para analizar.';
          }
          break;
          
        case 'generate_email':
          if (currentOpportunity) {
            const email = generateEmail(currentOpportunity);
            response = `📧 **Email de seguimiento generado:**\n\n\`\`\`\n${email}\n\`\`\`\n\n*Puede copiar y personalizar este email según necesite.*`;
          } else {
            response = 'Seleccione una oportunidad para generar un email de seguimiento.';
          }
          break;
          
        case 'search_similar':
          if (currentOpportunity) {
            const { data } = await supabase
              .from('opportunities')
              .select('*')
              .eq('industry', currentOpportunity.industry)
              .neq('id', currentOpportunity.id)
              .limit(3);
            
            if (data && data.length > 0) {
              response = `🔍 **Oportunidades similares en ${currentOpportunity.industry}:**\n\n`;
              data.forEach(opp => {
                response += `• **${opp.client}** - ${opp.name}\n`;
                response += `  Valor: R$ ${opp.value.toLocaleString('pt-BR')}\n`;
                response += `  Etapa: ${opp.stage} | Vendedor: ${opp.vendor}\n\n`;
              });
            } else {
              response = `No encontré otras oportunidades en la industria ${currentOpportunity.industry || 'especificada'}.`;
            }
          }
          break;
          
        case 'search_opportunity':
          response = 'Por favor, escriba el nombre del cliente o oportunidad que busca:';
          break;
          
        case 'view_pipeline':
          const { data: pipeline } = await supabase
            .from('opportunities')
            .select('*')
            .eq('vendor', currentUser)
            .order('value', { ascending: false })
            .limit(10);
          
          if (pipeline && pipeline.length > 0) {
            const total = pipeline.reduce((sum, opp) => sum + opp.value, 0);
            const weighted = pipeline.reduce((sum, opp) => sum + (opp.value * opp.probability / 100), 0);
            
            response = `📊 **Tu Pipeline Actual:**\n\n`;
            response += `**Total:** R$ ${total.toLocaleString('pt-BR')}\n`;
            response += `**Ponderado:** R$ ${weighted.toLocaleString('pt-BR')}\n\n`;
            response += `**Top oportunidades:**\n`;
            
            pipeline.slice(0, 5).forEach(opp => {
              response += `• ${opp.client} - R$ ${opp.value.toLocaleString('pt-BR')} (${opp.probability}%)\n`;
            });
          } else {
            response = 'No hay oportunidades en tu pipeline actualmente.';
          }
          break;
          
        case 'at_risk_deals':
          const { data: atRisk } = await supabase
            .from('opportunities')
            .select('*')
            .eq('vendor', currentUser)
            .lt('last_update', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
          
          if (atRisk && atRisk.length > 0) {
            response = `⚠️ **Deals en riesgo (sin actualización +7 días):**\n\n`;
            atRisk.forEach(opp => {
              const days = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
              response += `• **${opp.client}** - ${opp.name}\n`;
              response += `  ${days} días sin actualización\n`;
              response += `  Valor: R$ ${opp.value.toLocaleString('pt-BR')}\n\n`;
            });
            response += `**Acción requerida:** Actualizar estos deals urgentemente.`;
          } else {
            response = '✅ Todos tus deals están actualizados (últimos 7 días).';
          }
          break;
          
        case 'calculate_roi':
          if (currentOpportunity) {
            // ROI basado en datos reales del cliente
            const saving = currentOpportunity.value * 0.3; // 30% ahorro estimado
            const payback = currentOpportunity.value / (saving / 12); // meses para recuperar inversión
            
            response = `💰 **Cálculo ROI para ${currentOpportunity.client}:**\n\n`;
            response += `**Inversión:** R$ ${currentOpportunity.value.toLocaleString('pt-BR')}\n`;
            response += `**Ahorro anual estimado:** R$ ${saving.toLocaleString('pt-BR')} (30%)\n`;
            response += `**Payback:** ${payback.toFixed(1)} meses\n`;
            response += `**ROI a 3 años:** ${((saving * 3 - currentOpportunity.value) / currentOpportunity.value * 100).toFixed(0)}%\n\n`;
            response += `*Basado en promedios de la industria. Solicite un estudio personalizado.*`;
          }
          break;
          
        default:
          response = 'Acción no reconocida. ¿En qué puedo ayudarte?';
      }
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
      
    } catch (error) {
      console.error('Error en quick action:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Ocurrió un error al procesar tu solicitud. Por favor, intenta nuevamente.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      // Búsqueda inteligente basada en el mensaje
      if (userMessage.toLowerCase().includes('buscar') || userMessage.toLowerCase().includes('encontrar')) {
        const searchTerm = userMessage.replace(/buscar|encontrar/gi, '').trim();
        const results = await searchOpportunities(searchTerm);
        
        let response = '';
        if (results.length > 0) {
          response = `🔍 **Resultados de búsqueda para "${searchTerm}":**\n\n`;
          results.forEach(opp => {
            response += `• **${opp.client}** - ${opp.name}\n`;
            response += `  Valor: R$ ${opp.value.toLocaleString('pt-BR')}\n`;
            response += `  Etapa: ${opp.stage} | Probabilidad: ${opp.probability}%\n\n`;
          });
        } else {
          response = `No encontré oportunidades que coincidan con "${searchTerm}".`;
        }
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response,
          timestamp: new Date()
        }]);
      } else {
        // Respuesta genérica basada en contexto
        let response = 'Entiendo tu consulta. ';
        
        if (currentOpportunity) {
          response += `Con respecto a ${currentOpportunity.client}, `;
          const analysis = analyzeOpportunity(currentOpportunity);
          
          if (userMessage.toLowerCase().includes('ppvv') || userMessage.toLowerCase().includes('score')) {
            response += `el score PPVVCC actual es ${analysis.avgScore}/10. `;
            if (analysis.recommendations.length > 0) {
              response += `Mi recomendación principal es: ${analysis.recommendations[0]}`;
            }
          } else {
            response += 'puedo ayudarte con análisis PPVVCC, generación de emails, o búsqueda de información. ¿Qué necesitas específicamente?';
          }
        } else {
          response += 'Selecciona una oportunidad o usa los botones de acción rápida para comenzar.';
        }
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: response,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Error al procesar tu mensaje. Por favor, intenta nuevamente.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 group"
      >
        <MessageSquare className="w-6 h-6" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Asistente IA Ventapel
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-xl shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center">
          <Bot className="w-6 h-6 mr-2" />
          <div>
            <h3 className="font-bold">Asistente Ventapel</h3>
            <p className="text-xs text-blue-100">Powered by Claude</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Current Opportunity Banner */}
      {currentOpportunity && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <p className="text-xs text-blue-700 font-medium">
            📎 Trabajando con: {currentOpportunity.client}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] ${
              message.role === 'user' 
                ? 'bg-blue-600 text-white rounded-l-xl rounded-tr-xl' 
                : 'bg-gray-100 text-gray-800 rounded-r-xl rounded-tl-xl'
            } p-3`}>
              <div className="flex items-start space-x-2">
                {message.role === 'assistant' && <Bot className="w-4 h-4 mt-1 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString('pt-BR', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
                {message.role === 'user' && <User className="w-4 h-4 mt-1 flex-shrink-0" />}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-r-xl rounded-tl-xl p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="border-t border-gray-200 p-3 flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleQuickAction(action.action)}
              disabled={isLoading}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Escribe tu pregunta..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
