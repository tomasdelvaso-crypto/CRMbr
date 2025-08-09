import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap } from 'lucide-react';

// NUEVO: Componente para renderizar mensajes con botones
const MessageRenderer = ({ content, onButtonClick }) => {
    // Regex para encontrar el patrón de botón: [Texto del botón|acción:param1:param2]
    const buttonRegex = /\[([^|]+)\|([^\]]+)\]/g;
    const parts = content.split(buttonRegex);

    return (
        <p className="text-sm whitespace-pre-wrap">
            {parts.map((part, index) => {
                // Si el índice es 1, 3, 5, etc., es el texto del botón
                if (index % 3 === 1) {
                    const actionPayload = parts[index + 1];
                    return (
                        <button
                            key={index}
                            onClick={() => onButtonClick(actionPayload)}
                            className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-all text-sm font-semibold mx-1 my-2 inline-block"
                        >
                            {part}
                        </button>
                    );
                }
                // Si el índice es 2, 4, 6, etc., es el payload de la acción, que no renderizamos directamente
                if (index % 3 === 2) {
                    return null;
                }
                // Si no, es texto normal
                return part;
            })}
        </p>
    );
};


const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  
  const [assistantActiveOpportunity, setAssistantActiveOpportunity] = useState(null);

  useEffect(() => {
    if (supabase) {
      loadPipelineData();
    }
  }, [currentUser, supabase]);

  useEffect(() => {
    const opportunityToAnalyze = assistantActiveOpportunity || currentOpportunity;
    if (opportunityToAnalyze) {
      analyzeOpportunity(opportunityToAnalyze);
      checkOpportunityHealth(opportunityToAnalyze);
    }
  }, [currentOpportunity, assistantActiveOpportunity, allOpportunities]); // Añadir allOpportunities para re-analizar si cambia

  const loadPipelineData = async () => {
    if (!supabase) {
      console.warn('Supabase no disponible');
      return;
    }
    
    try {
      const vendorFilter = currentUser ? { column: 'vendor', value: currentUser } : {};
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq(vendorFilter.column, vendorFilter.value) // Filtrar por vendedor actual
        .order('value', { ascending: false });

      if (!error && data) {
        setAllOpportunities(data);
        analyzePipelineHealth(data);
      }
    } catch (err) {
      console.error('Error loading pipeline:', err);
    }
  };

  const analyzePipelineHealth = (opportunities) => {
    const totalValue = opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
    
    const riskOpps = opportunities.filter(opp => {
      const avgScale = calculateHealthScore(opp.scales || {});
      return avgScale < 4 && opp.value > 50000;
    });

    setPipelineHealth({
      total: opportunities.length,
      totalValue,
      atRisk: riskOpps.length,
      riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0)
    });
  };

  const getScaleValue = (scale) => {
    if (!scale) return 0;
    if (typeof scale === 'object' && scale.score !== undefined) {
      return scale.score;
    }
    if (typeof scale === 'number') {
      return scale;
    }
    return 0;
  };

  const calculateHealthScore = (scales) => {
    if (!scales) return 0;
    
    const values = [
      getScaleValue(scales.dor || scales.pain),
      getScaleValue(scales.poder || scales.power),
      getScaleValue(scales.visao || scales.vision),
      getScaleValue(scales.valor || scales.value),
      getScaleValue(scales.controle || scales.control),
      getScaleValue(scales.compras || scales.purchase)
    ];
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    return values.length > 0 ? sum / values.length : 0;
  };

  const analyzeOpportunity = (opp) => {
    if (!opp || !opp.scales) return;

    const scaleValues = {
      pain: getScaleValue(opp.scales.dor || opp.scales.pain),
      power: getScaleValue(opp.scales.poder || opp.scales.power),
      vision: getScaleValue(opp.scales.visao || opp.scales.vision),
      value: getScaleValue(opp.scales.valor || opp.scales.value),
      control: getScaleValue(opp.scales.controle || opp.scales.control),
      purchase: getScaleValue(opp.scales.compras || opp.scales.purchase)
    };
    
    const avgScale = calculateHealthScore(opp.scales);
    
    const inconsistencies = [];
    
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      inconsistencies.push({
        type: 'critical',
        message: '🔴 INCONSISTÊNCIA GRAVE: Apresentando sem DOR confirmada! Cliente não vai comprar.',
        action: 'Voltar para qualificação URGENTE'
      });
    }
    
    if (opp.value > 100000 && scaleValues.power < 4) {
      inconsistencies.push({
        type: 'critical',
        message: '⛔ PROBLEMA: R$' + opp.value.toLocaleString() + ' sem falar com decisor. Vai perder.',
        action: 'Conseguir acesso ao POWER hoje'
      });
    }
    
    if (opp.stage >= 4 && scaleValues.value < 6) {
      inconsistencies.push({
        type: 'warning',
        message: '⚠️ RISCO: Negociando sem VALOR claro. Cliente vai pedir desconto enorme.',
        action: 'Calcular ROI específico AGORA'
      });
    }
    
    if (opp.stage >= 2 && scaleValues.vision < 4) {
      inconsistencies.push({
        type: 'warning',
        message: '🚨 Cliente ainda acha que é "só trocar a fita". Não entende nossa solução.',
        action: 'Demo urgente com caso de sucesso'
      });
    }

    let probability = 0;
    if (scaleValues.pain >= 7 && scaleValues.power >= 6 && scaleValues.value >= 6) {
      probability = 75;
    } else if (scaleValues.pain >= 5 && scaleValues.power >= 4 && scaleValues.value >= 4) {
      probability = 40;
    } else if (scaleValues.pain >= 3) {
      probability = 15;
    } else {
      probability = 5;
    }

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability,
      scaleValues,
      inconsistencies,
      nextAction: generateNextAction(opp, scaleValues, inconsistencies)
    });
  };

  const generateNextAction = (opp, scaleValues, inconsistencies) => {
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: `AÇÃO IMEDIATA: ${inconsistencies[0].message}`
      };
    }
    
    if (scaleValues.pain < 5) {
      return {
        action: "🎯 Fazer cliente ADMITIR o problema",
        script: "Pergunta matadora: 'Quantas horas por mês vocês perdem com retrabalho de caixas violadas? E quanto isso custa em R$?'"
      };
    }
    if (scaleValues.power < 4) {
      return {
        action: "👔 Acessar o DECISOR hoje",
        script: "Script direto: 'Para desenhar a melhor solução, preciso entender a visão do gerente de logística. Podemos incluí-lo na próxima call?'"
      };
    }
    if (scaleValues.vision < 5) {
      return {
        action: "🎬 Demo com caso MercadoLibre",
        script: "Mostrar: 'Veja como o MercadoLibre reduziu 40% do retrabalho com nossa solução completa BP555e + VENOM'"
      };
    }
    if (scaleValues.value < 5) {
      return {
        action: "💰 Calcular ROI específico",
        script: "Demonstrar: 'Com 10.000 envios/mês, vocês economizam R$25.000 mensais. ROI em 4 meses.'"
      };
    }
    if (scaleValues.control < 5) {
      return {
        action: "📅 Definir próximos passos com DATAS",
        script: "Fechar: 'Vamos agendar o teste para terça-feira? Preciso só 2 horas do seu time.'"
      };
    }
    return {
      action: "✅ FECHAR o negócio",
      script: "Closing: 'Podemos começar a implementação em 30 dias. Qual processo interno preciso seguir?'"
    };
  };

  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) {
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} dias sem contato - VAI PERDER! Ligar HOJE.`,
          action: 'reactivate'
        });
      } else if (daysSince > 3) {
        newAlerts.push({
          type: 'warning',
          message: `⚠️ ${daysSince} dias sem follow-up. Cliente esfriando.`,
          action: 'followup'
        });
      }
    }

    const avgScale = calculateHealthScore(opp.scales || {});
    if (avgScale < 4 && opp.value > 100000) {
      newAlerts.push({
        type: 'critical',
        message: `💣 R$${opp.value.toLocaleString()} em RISCO ALTO! Score: ${avgScale.toFixed(1)}/10`,
        action: 'rescue'
      });
    }

    if (opp.created_at) {
      const daysInPipeline = Math.floor((new Date() - new Date(opp.created_at)) / (1000 * 60 * 60 * 24));
      if (daysInPipeline > 60 && opp.stage < 4) {
        newAlerts.push({
          type: 'warning',
          message: `🐌 ${daysInPipeline} dias no pipeline. Criar urgência ou desqualificar.`,
          action: 'urgency'
        });
      }
    }

    setAlerts(newAlerts);
  };

  const searchOpportunity = async (clientName) => {
    if (!supabase) {
      console.warn('Supabase no disponible para búsqueda');
      return null;
    }
    
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('opportunities')
        .select('*')
        .or(`client.ilike.%${clientName}%,name.ilike.%${clientName}%`);
      
      if (clientError) throw clientError;
      
      if (clientData && clientData.length > 0) {
        return clientData;
      }
      
      const { data: productData, error: productError } = await supabase
        .from('opportunities')
        .select('*')
        .or(`product.ilike.%${clientName}%,industry.ilike.%${clientName}%`);
      
      if (productError) throw productError;
      return productData || [];
      
    } catch (err) {
      console.error('Error buscando oportunidad:', err);
      return null;
    }
  };

  const searchGoogle = async (searchTerm) => {
    try {
      const response = await fetch('/api/google-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchTerm })
      });
      
      const data = await response.json();
      
      if (data.success && data.results && data.results.length > 0) {
        return data.results;
      }
      return null;
    } catch (err) {
      console.error('Error buscando en Google:', err);
      return null;
    }
  };

const detectOpportunityQuery = (message) => {
  const searchPatterns = [
    /(?:como está|status de|situação de|análise de|info sobre|información sobre|dados de|escalas de|ppvvcc de)\s+(.+?)(?:\?|$)/i,
    /(?:mostrar|ver|buscar|encontrar|analizar|checar)\s+(?:oportunidad|oportunidade|deal|negócio|cliente)\s+(.+?)(?:\?|$)/i,
    /(?:qual|como|qué)\s+(?:está|anda|vai)\s+(.+?)(?:\?|$)/i,
    /^buscar\s+(.+)/i,
    /^encontrar\s+(.+)/i,
    /^cliente\s+(.+?)(?:\s|$)/i
  ];
  
  const contextIndicators = [
    'tengo', 'tenho', 'nueva', 'novo', 'voy a', 'vou', 'visitaré', 
    'reunión', 'meeting', 'demo', 'presentación', 'llamé', 'contacté',
    'hablé', 'falei', 'admitieron', 'dijeron', 'quieren', 'necesitan',
    'atualizar', 'mudar', 'subir', 'aumentar' // NUEVO: Evitar que la actualización de CRM se confunda con búsqueda
  ];
  
  const lowerMessage = message.toLowerCase();
  
  if (contextIndicators.some(indicator => lowerMessage.includes(indicator))) {
    return null;
  }
  
  for (const pattern of searchPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  const words = message.trim().split(/\s+/);
  if (words.length === 1 && words[0].length > 2) {
    if (!message.includes('.') && !message.includes(',')) {
      return words[0];
    }
  }
  
  return null;
};

  // Quick Actions dinámicas
  const getQuickActions = () => {
    const activeOpp = assistantActiveOpportunity || currentOpportunity;
    
    // Acciones globales (sin oportunidad activa)
    if (!activeOpp) {
      return [
        { icon: <Calendar size={18} />, label: 'Plan Semanal', prompt: 'plan_semanal' }, // NUEVA ACCIÓN
        { icon: <TrendingUp size={18} />, label: 'Top 5 Deals', prompt: 'Cuáles son las 5 mejores oportunidades para cerrar este mes?' },
        { icon: <AlertTriangle size={18} />, label: 'Deals en Riesgo', prompt: 'Muéstrame todas las oportunidades en riesgo con análisis PPVVCC' },
        { icon: <Globe size={18} />, label: 'Buscar Cliente', prompt: 'Listar todas las oportunidades disponibles en el CRM' },
      ];
    }
    
    if (!activeOpp.scales) return [];
    
    const actions = [];
    const scales = activeOpp.scales;
    
    const painValue = getScaleValue(scales.dor || scales.pain);
    const powerValue = getScaleValue(scales.poder || scales.power);
    const visionValue = getScaleValue(scales.visao || scales.vision);
   
    // Prioridad 1: Reactivar urgente
    if (alerts.length > 0 && alerts.some(a => a.action === 'reactivate')) {
      actions.push({ icon: <Zap size={18} />, label: 'Reativar URGENTE', prompt: `Gerar email e script de ligação para reativar ${activeOpp.client} que está há muitos dias sem contato.` });
    }

    // Prioridad 2: Corregir inconsistencias
    if (analysis && analysis.inconsistencies && analysis.inconsistencies.length > 0) {
        actions.push({ icon: <AlertTriangle size={18} />, label: 'Corrigir Problema', prompt: `PROBLEMA DETECTADO em ${activeOpp.client}: ${analysis.inconsistencies[0].message}. Como corrijo isso IMEDIATAMENTE?` });
    }
    
    // Prioridad 3: Basado en la escala más baja
    const lowestScaleValue = Math.min(painValue, powerValue, visionValue);
    if (painValue === lowestScaleValue && painValue < 7) {
      actions.push({ icon: <Target size={18} />, label: 'Gerar DOR', prompt: `Preciso de 5 perguntas SPIN MATADORAS para ${activeOpp.client} focadas em ${activeOpp.industry || 'logística'}.` });
    } else if (powerValue === lowestScaleValue && powerValue < 6) {
      actions.push({ icon: '👔', label: 'Acessar Decisor', prompt: `Me dê 3 formas diferentes de conseguir acesso ao decisor em ${activeOpp.client}.` });
    }

    // Acción genérica si todo está bien
    if (actions.length < 2) {
      actions.push({ icon: <Globe size={18} />, label: 'Google Empresa', prompt: `buscar en Google ${activeOpp.client}` });
    }
    
    // Siempre agregar opción de cambiar cliente
    actions.push({ icon: <RefreshCw size={18} />, label: 'Trocar Cliente', prompt: 'Listar todas las oportunidades disponibles para seleccionar otra' });
    
    return actions.slice(0, 4);
  };

  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

 // NUEVO: Manejar clicks en botones de acción dentro del chat
 const handleActionClick = async (actionPayload) => {
    if (!actionPayload) return;

    const [action, ...params] = actionPayload.split(':');

    if (action === 'cancel') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Ação cancelada.' }]);
        return;
    }

    if (action === 'update' && params.length >= 2) {
        const [scale, newValue, oppId] = params;
        const opportunityToUpdateId = oppId || getActiveOpportunity()?.id;
        
        if (!opportunityToUpdateId) {
             setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro: Não sei qual oportunidade atualizar.' }]);
             return;
        }

        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('opportunities')
                .update({ 
                    scales: { 
                        ...(allOpportunities.find(o => o.id === opportunityToUpdateId)?.scales || {}),
                        [scale]: parseInt(newValue) 
                    },
                    last_update: new Date().toISOString()
                })
                .eq('id', opportunityToUpdateId)
                .select();

            if (error) throw error;

            setMessages(prev => [...prev, { role: 'assistant', content: `✅ Sucesso! A escala de **${scale.toUpperCase()}** em **${data[0].client}** foi atualizada para **${newValue}/10**.` }]);
            // Forzar recarga de datos para reflejar el cambio
            await loadPipelineData();

        } catch (error) {
            console.error('Error actualizando oportunidad:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Falha ao atualizar no CRM: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    }
 };


  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    // NUEVO: Manejo de acciones especiales que no son mensajes
    if (messageText === 'plan_semanal') {
        const userMessage = { role: 'user', content: "Me dê meu plano para a semana" };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
             const response = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    specialRequestType: 'weekly_plan',
                    pipelineData: {
                        allOpportunities: allOpportunities,
                        vendorName: currentUser
                    }
                })
            });
            const data = await response.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        } catch (error) {
             console.error('Error fetching weekly plan:', error);
             setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro ao gerar o plano semanal.' }]);
        } finally {
            setIsLoading(false);
            setInput('');
            return;
        }
    }


    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Búsqueda en Google
      if (messageText.toLowerCase().startsWith('google') || messageText.toLowerCase().startsWith('buscar web')) {
        const searchTerm = messageText.replace(/google|buscar web/i, '').trim() || getActiveOpportunity()?.client;
        if (!searchTerm) {
            setMessages(prev => [...prev, { role: 'assistant', content: '❌ Especifique o que buscar no Google.' }]);
            setIsLoading(false);
            return;
        }
        const results = await searchGoogle(searchTerm + ' Brasil empresa');
        let googleResponse = `❌ Não encontrei nada sobre "${searchTerm}" no Google.`;
        if (results && results.length > 0) {
            googleResponse = `🔍 **Resultados de Google para "${searchTerm}":**\n\n` +
                results.map((r, idx) => `${idx + 1}. **${r.title}**\n   ${r.snippet}\n   🔗 [Ver mais](${r.link})`).join('\n\n');
        }
        setMessages(prev => [...prev, { role: 'assistant', content: googleResponse }]);
        setIsLoading(false);
        return;
      }

    // Búsqueda en CRM
    const possibleClient = detectOpportunityQuery(messageText);
    let searchedOpportunity = null;
    let searchResults = [];
    const isNewOpportunity = ['tengo una nueva', 'nova oportunidade', 'nuevo cliente'].some(ind => messageText.toLowerCase().includes(ind));

    if (possibleClient && !isNewOpportunity && supabase) {
        searchResults = await searchOpportunity(possibleClient);
        if (searchResults && searchResults.length > 0) {
          searchedOpportunity = searchResults[0];
          setAssistantActiveOpportunity(searchedOpportunity);
          analyzeOpportunity(searchedOpportunity);
          checkOpportunityHealth(searchedOpportunity);
        }
      }
      
      // Listar oportunidades
      if (messageText.toLowerCase().includes('listar') || messageText.toLowerCase().includes('todas')) {
        const listMessage = `📋 **Suas Oportunidades no CRM:**\n\n` +
          allOpportunities.map((opp, idx) => 
            `${idx + 1}. **${opp.client}** - R$ ${opp.value.toLocaleString('pt-BR')} | Saúde: ${calculateHealthScore(opp.scales || {}).toFixed(1)}/10`
          ).join('\n') +
          `\n\n💡 **Tip:** Escreva o nome do cliente para analisar em detalhe.`;
        
        setMessages(prev => [...prev, { role: 'assistant', content: listMessage }]);
        setIsLoading(false);
        return;
      }

      // Preparar contexto para la API
      const ventapelContext = { /* ... */ }; // Mantener el contexto de Ventapel
      const opportunityToAnalyze = searchedOpportunity || assistantActiveOpportunity || currentOpportunity;
      
      const opportunityContext = opportunityToAnalyze ? {
        ...opportunityToAnalyze,
        scales: {
          pain: getScaleValue(opportunityToAnalyze.scales?.dor || opportunityToAnalyze.scales?.pain),
          power: getScaleValue(opportunityToAnalyze.scales?.poder || opportunityToAnalyze.scales?.power),
          vision: getScaleValue(opportunityToAnalyze.scales?.visao || opportunityToAnalyze.scales?.vision),
          value: getScaleValue(opportunityToAnalyze.scales?.valor || opportunityToAnalyze.scales?.value),
          control: getScaleValue(opportunityToAnalyze.scales?.controle || opportunityToAnalyze.scales?.control),
          purchase: getScaleValue(opportunityToAnalyze.scales?.compras || opportunityToAnalyze.scales?.purchase)
        },
        diagnostico: analysis
      } : null;

      const searchContext = searchedOpportunity ? { found: true } : (possibleClient && searchResults.length === 0 ? { found: false, searchTerm: possibleClient } : null);

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: messageText,
          opportunityData: opportunityContext,
          ventapelContext,
          searchContext,
          isNewOpportunity,
          pipelineData: {
              allOpportunities: allOpportunities,
              pipelineHealth: pipelineHealth,
              vendorName: currentUser
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response || 'Erro ao processar resposta.' 
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro na API. Verificar configuração.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Panel de Análisis PPVVCC en el CRM */}
      {getActiveOpportunity() && analysis && (
        // El código del panel de análisis se mantiene igual
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
           {/* ... Contenido del panel sin cambios ... */}
        </div>
      )}

      {/* Botón flotante del asistente */}
      {/* ... Contenido del botón flotante sin cambios ... */}

      {/* Chat del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
            {/* ... Contenido del header del chat sin cambios ... */}
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b">
            <div className="grid grid-cols-2 gap-2">
              {getQuickActions().map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(action.prompt)}
                  className="bg-white border-2 border-gray-300 rounded-lg px-3 py-2 text-xs hover:bg-blue-50 hover:border-blue-400 transition flex items-center gap-2 font-semibold"
                  disabled={isLoading}
                >
                  <span className="text-lg">{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Mensaje de bienvenida sin cambios */}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    {/* NUEVO: Usar el MessageRenderer para mensajes del asistente */}
                    {msg.role === 'assistant' ? (
                        <MessageRenderer content={msg.content} onButtonClick={handleActionClick} />
                    ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                </div>
              </div>
            ))}
            
            {isLoading && ( /* Indicador de carga sin cambios */ )}
          </div>

          {/* Input sin cambios */}
        </div>
      )}
    </>
  );
};

export default AIAssistant;
