import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign } from 'lucide-react';

// Componente para renderizar mensajes con botones interactivos
const MessageRenderer = ({ content, onButtonClick }) => {
  const buttonRegex = /\[([^|]+)\|([^\]]+)\]/g;
  const parts = content.split(buttonRegex);

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((part, index) => {
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
        if (index % 3 === 2) return null;
        return <span key={index}>{part}</span>;
      })}
    </div>
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
  const [showROI, setShowROI] = useState(false);
  
  const [assistantActiveOpportunity, setAssistantActiveOpportunity] = useState(null);

  // Benchmarks reales de Brasil 2024-2025
  const brazilBenchmarks = {
    averageLoss: 0.10, // 10% según IBEVAR
    packagingImpact: 0.80, // 80% de averías por embalaje inadecuado
    ecommerceLosses: 3000000000, // R$3 bil/año
    logisticsCost: 0.184, // 18.4% del PIB
    industries: {
      'e-commerce': { rate: 0.10, source: 'IBEVAR 2024' },
      'cosmética': { rate: 0.08, source: 'Casos L\'Oréal, Natura' },
      'farmacéutica': { rate: 0.09, source: 'ANVISA + cadena fría' },
      'logística': { rate: 0.06, source: 'NTC&Logística' },
      'automotriz': { rate: 0.04, source: 'Honda Argentina' },
      'alimentos': { rate: 0.07, source: 'Cadena fría Brasil' }
    }
  };

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
  }, [currentOpportunity, assistantActiveOpportunity]);

  const loadPipelineData = async () => {
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
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

    // Calcular pérdidas potenciales con datos reales
    const potentialLosses = opportunities.reduce((sum, opp) => {
      const industry = opp.industry?.toLowerCase() || 'default';
      const lossRate = brazilBenchmarks.industries[industry]?.rate || brazilBenchmarks.averageLoss;
      return sum + (opp.value * lossRate);
    }, 0);

    setPipelineHealth({
      total: opportunities.length,
      totalValue,
      atRisk: riskOpps.length,
      riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0),
      potentialMonthlyLoss: Math.round(potentialLosses / 12),
      averageLossRate: brazilBenchmarks.averageLoss
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
        action: 'Voltar para qualificação URGENTE',
        dataPoint: 'Lembre: 10% de perdas é a média Brasil (IBEVAR)'
      });
    }
    
    if (opp.value > 100000 && scaleValues.power < 4) {
      inconsistencies.push({
        type: 'critical',
        message: '⛔ PROBLEMA: R$' + opp.value.toLocaleString() + ' sem falar com decisor. Vai perder.',
        action: 'Conseguir acesso ao POWER hoje',
        dataPoint: '80% das avarias são evitáveis com decisão correta'
      });
    }
    
    if (opp.stage >= 4 && scaleValues.value < 6) {
      inconsistencies.push({
        type: 'warning',
        message: '⚠️ RISCO: Negociando sem VALOR claro. Cliente vai pedir desconto enorme.',
        action: 'Calcular ROI específico AGORA',
        dataPoint: 'ROI médio Ventapel: 2-3 meses comprovado'
      });
    }
    
    if (opp.stage >= 2 && scaleValues.vision < 4) {
      inconsistencies.push({
        type: 'warning',
        message: '🚨 Cliente ainda acha que é "só trocar a fita". Não entende nossa solução.',
        action: 'Demo urgente com caso de sucesso',
        dataPoint: 'L\'Oréal: 100% furtos eliminados com nossa solução'
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
      nextAction: generateNextAction(opp, scaleValues, inconsistencies),
      potentialLoss: calculatePotentialLoss(opp)
    });
  };

  const calculatePotentialLoss = (opp) => {
    const industry = opp.industry?.toLowerCase() || 'default';
    const lossRate = brazilBenchmarks.industries[industry]?.rate || brazilBenchmarks.averageLoss;
    const monthlyVolume = Math.round(opp.value / 100);
    const monthlyLoss = Math.round(monthlyVolume * lossRate * 35); // R$35 promedio por caja
    return {
      monthlyLoss,
      annualLoss: monthlyLoss * 12,
      lossRate: (lossRate * 100).toFixed(1),
      source: brazilBenchmarks.industries[industry]?.source || 'IBEVAR - média Brasil'
    };
  };

  const generateNextAction = (opp, scaleValues, inconsistencies) => {
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: `AÇÃO IMEDIATA: ${inconsistencies[0].message}`,
        dataPoint: inconsistencies[0].dataPoint
      };
    }
    
    if (scaleValues.pain < 5) {
      return {
        action: "🎯 Fazer cliente ADMITIR o problema",
        script: "Pergunta matadora: 'Vocês sabem que o mercado brasileiro perde 10% em violação (IBEVAR)? Quanto isso representa para vocês em R$?'",
        dataPoint: "10% é a média Brasil - dados reais IBEVAR 2024"
      };
    }
    if (scaleValues.power < 4) {
      return {
        action: "👔 Acessar o DECISOR hoje",
        script: "Script direto: 'Com R$3 bilhões perdidos no e-commerce brasileiro, preciso falar com quem pode decidir sobre isso.'",
        dataPoint: "E-commerce Brasil perde R$3 bi/ano em fraudes e violação"
      };
    }
    if (scaleValues.vision < 5) {
      return {
        action: "🎬 Demo com caso real",
        script: "Mostrar: 'L'Oréal eliminou 100% dos furtos. MercadoLibre reduziu 40% do retrabalho. Posso mostrar como?'",
        dataPoint: "Casos reais com ROI de 2-3 meses"
      };
    }
    if (scaleValues.value < 5) {
      return {
        action: "💰 Calcular ROI específico",
        script: "Demonstrar: 'Com 80% das avarias por embalagem inadequada, vocês economizam R$X mensais. ROI garantido em 3 meses.'",
        dataPoint: "80% das avarias são por embalagem inadequada (estudo setorial)"
      };
    }
    if (scaleValues.control < 5) {
      return {
        action: "📅 Definir próximos passos com DATAS",
        script: "Fechar: 'Cada mês sem decidir = R$X perdidos. Vamos começar o teste terça-feira?'",
        dataPoint: "Perda acumulada aumenta mensalmente"
      };
    }
    return {
      action: "✅ FECHAR o negócio",
      script: "Closing: 'Com ROI garantido em 3 meses ou devolvemos seu dinheiro, qual processo interno preciso seguir?'",
      dataPoint: "Garantia Ventapel: ROI ou dinheiro de volta"
    };
  };

  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) {
        const potentialLoss = calculatePotentialLoss(opp);
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} dias sem contato - VAI PERDER! Perdendo R$${potentialLoss.monthlyLoss.toLocaleString()}/mês`,
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
        action: 'rescue',
        dataPoint: 'Média de perda no setor: ' + (brazilBenchmarks.industries[opp.industry?.toLowerCase()]?.rate * 100 || 10) + '%'
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
    if (!supabase) return null;
    
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
      'atualizar', 'mudar', 'subir', 'aumentar'
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

  const getQuickActions = () => {
    const activeOpp = assistantActiveOpportunity || currentOpportunity;
    
    if (!activeOpp) {
      return [
        { icon: <Calendar size={18} />, label: 'Plan Semanal', prompt: 'plan_semanal' },
        { icon: <DollarSign size={18} />, label: 'ROI Calculator', prompt: 'Calcular ROI para todas as oportunidades' },
        { icon: <TrendingUp size={18} />, label: 'Top 5 Deals', prompt: 'Cuáles son las 5 mejores oportunidades para cerrar este mes?' },
        { icon: <AlertTriangle size={18} />, label: 'Deals en Riesgo', prompt: 'Muéstrame todas las oportunidades en riesgo con análisis PPVVCC' }
      ];
    }
    
    if (!activeOpp.scales) return [];
    
    const actions = [];
    const scales = activeOpp.scales;
    
    const painValue = getScaleValue(scales.dor || scales.pain);
    const powerValue = getScaleValue(scales.poder || scales.power);
    
    // Prioridad 1: ROI Calculator
    actions.push({ 
      icon: <DollarSign size={18} />, 
      label: 'Calcular ROI', 
      prompt: `Calcular ROI específico para ${activeOpp.client} con datos reales de Brasil` 
    });
    
    // Prioridad 2: Reactivar urgente
    if (alerts.length > 0 && alerts.some(a => a.action === 'reactivate')) {
      actions.push({ 
        icon: <Zap size={18} />, 
        label: 'Reativar URGENTE', 
        prompt: `Gerar email e script para reativar ${activeOpp.client} mencionando que o mercado perde 10% (IBEVAR).` 
      });
    }

    // Prioridad 3: Corregir inconsistencias
    if (analysis && analysis.inconsistencies && analysis.inconsistencies.length > 0) {
      actions.push({ 
        icon: <AlertTriangle size={18} />, 
        label: 'Corrigir Problema', 
        prompt: `PROBLEMA em ${activeOpp.client}: ${analysis.inconsistencies[0].message}. Como corrijo com dados reais do Brasil?` 
      });
    }
    
    // Prioridad 4: Basado en la escala más baja
    if (painValue < 7) {
      actions.push({ 
        icon: <Target size={18} />, 
        label: 'Gerar DOR', 
        prompt: `Preciso de 5 perguntas SPIN para ${activeOpp.client} usando o dado que Brasil perde 10% em violação (IBEVAR).` 
      });
    }
    
    // Siempre agregar opción de cambiar cliente
    if (actions.length < 4) {
      actions.push({ 
        icon: <RefreshCw size={18} />, 
        label: 'Trocar Cliente', 
        prompt: 'Listar todas las oportunidades disponibles para seleccionar otra' 
      });
    }
    
    return actions.slice(0, 4);
  };

  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

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

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ Sucesso! A escala de **${scale.toUpperCase()}** em **${data[0].client}** foi atualizada para **${newValue}/10**.\n\n💡 Lembre-se: ${scale === 'dor' ? '10% de perdas é a média Brasil (IBEVAR)' : 'ROI médio Ventapel: 2-3 meses'}` 
        }]);
        
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

    // Manejo del plan semanal
    if (messageText === 'plan_semanal') {
      const userMessage = { role: 'user', content: "Me dê meu plano para a semana com dados reais do Brasil" };
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
      // Detectar búsqueda de oportunidad
      const possibleClient = detectOpportunityQuery(messageText);
      let searchedOpportunity = null;
      let searchResults = [];
      const isNewOpportunity = ['tengo una nueva', 'nova oportunidade', 'nuevo cliente'].some(ind => 
        messageText.toLowerCase().includes(ind)
      );

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
          allOpportunities.map((opp, idx) => {
            const loss = calculatePotentialLoss(opp);
            return `${idx + 1}. **${opp.client}** - R$ ${opp.value.toLocaleString('pt-BR')}\n` +
                   `   Saúde: ${calculateHealthScore(opp.scales || {}).toFixed(1)}/10 | ` +
                   `   Perda potencial: R${loss.monthlyLoss.toLocaleString()}/mês (${loss.lossRate}% - ${loss.source})`;
          }).join('\n\n') +
          `\n\n💡 **Tip:** Escreva o nome do cliente para análise detalhada com ROI.`;
        
        setMessages(prev => [...prev, { role: 'assistant', content: listMessage }]);
        setIsLoading(false);
        return;
      }

      // Preparar contexto con datos reales de Brasil
      const ventapelContext = {
        produtos: {
          maquinas: "Better Packages BP555e, BP755, BP222 Curby, Random Sealer Automated (RSA)",
          fitas: "VENOM (3-way reinforced, water-activated), Gorilla (300m e 700m)",
          solucao: "Sistema completo de fechamento: máquina + fita + suporte técnico",
          diferencial: "Redução de até 95% nas violações, ROI em 2-3 meses"
        },
        benchmarks_brasil: {
          perdas_promedio: "10% segundo IBEVAR 2024",
          ecommerce_fraudes: "R$ 3 bilhões/ano em perdas",
          avarias_embalagem: "80% das avarias por embalagem inadequada",
          custos_logisticos: "18.4% do PIB brasileiro",
          industries: brazilBenchmarks.industries
        },
        casos_sucesso: {
          loreal: {
            problema: "+10% furtos, produtividade baixa, espaço limitado",
            solucao: "RSA + Fita Gorilla 700m",
            resultados: "100% furtos eliminados, +50% eficiência, ROI 3 meses, 12 caixas/min"
          },
          nike: {
            problema: "10% caixas violadas, gargalos produção",
            solucao: "BP755 + Fita Gorilla 300m", 
            resultados: "Furtos eliminados, +30% eficiência, ROI 2 meses"
          },
          mercadolibre: "40% redução retrabalho, economia R$180k/mês",
          natura: "60% menos violações, economia R$85k/mês",
          centauro: "95% redução furtos, economia R$50mi/ano",
          honda_argentina: "+40% velocidade, 100% redução faltantes"
        },
        metodologia: "PPVVCC - Pain, Power, Vision, Value, Control, Compras",
        proposta_valor: [
          "Inviolabilidade garantida - redução 95% ou dinheiro de volta",
          "ROI comprovado em 2-3 meses",
          "Redução drástica de retrabalho (+30-50% eficiência)",
          "Dados reais: 10% perda média Brasil (IBEVAR)",
          "80% das avarias evitáveis com solução correta",
          "Suporte técnico próprio/dedicado"
        ]
      };

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
        diagnostico: analysis,
        potentialLoss: calculatePotentialLoss(opportunityToAnalyze)
      } : null;

      const searchContext = searchedOpportunity ? { found: true } : 
        (possibleClient && searchResults.length === 0 ? { found: false, searchTerm: possibleClient } : null);

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
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ Erro na API. Verificar configuração.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Panel de Análisis PPVVCC en el CRM */}
      {getActiveOpportunity() && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> Diagnóstico PPVVCC: {getActiveOpportunity().client}
            </h3>
            <div className="flex items-center gap-4">
              {assistantActiveOpportunity && (
                <button
                  onClick={() => setAssistantActiveOpportunity(null)}
                  className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200"
                  title="Voltar para oportunidade do CRM"
                >
                  🔄 Voltar CRM
                </button>
              )}
              <button
                onClick={() => setShowROI(!showROI)}
                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                title="Calcular ROI"
              >
                💰 ROI Calculator
              </button>
              <button
                onClick={loadPipelineData}
                className="text-blue-600 hover:text-blue-800"
                title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{analysis.probability}%</div>
                <div className="text-xs text-gray-600">Probabilidade real</div>
              </div>
            </div>
          </div>

          {/* ROI Calculator Quick View */}
          {showROI && analysis.potentialLoss && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-3">
              <h4 className="font-bold text-green-700 text-sm mb-2">
                💰 Análise ROI Rápida ({analysis.potentialLoss.source})
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600">Taxa violação setor:</span>
                  <span className="font-bold text-red-600 ml-1">{analysis.potentialLoss.lossRate}%</span>
                </div>
                <div>
                  <span className="text-gray-600">Perda mensal:</span>
                  <span className="font-bold text-red-600 ml-1">R${analysis.potentialLoss.monthlyLoss.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600">Perda anual:</span>
                  <span className="font-bold text-red-600 ml-1">R${analysis.potentialLoss.annualLoss.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600">ROI estimado:</span>
                  <span className="font-bold text-green-600 ml-1">2-3 meses</span>
                </div>
              </div>
              <button
                onClick={() => sendMessage(`Calcular ROI completo para ${getActiveOpportunity().client}`)}
                className="mt-2 bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 w-full"
              >
                Ver Análise Completa
              </button>
            </div>
          )}

          {/* Pipeline Info com dados reais */}
          {pipelineHealth && (
            <div className="bg-white/50 p-2 rounded mb-3 text-xs">
              <div className="flex justify-between">
                <span>Pipeline: R${pipelineHealth.totalValue.toLocaleString('pt-BR')}</span>
                <span className="text-orange-600">Perda potencial: R${pipelineHealth.potentialMonthlyLoss.toLocaleString()}/mês</span>
                <span className="text-red-600 font-bold">Em Risco: R${pipelineHealth.riskValue.toLocaleString('pt-BR')}</span>
              </div>
              <div className="text-center mt-1 text-gray-600">
                Média Brasil: {(pipelineHealth.averageLossRate * 100).toFixed(0)}% violação (IBEVAR)
              </div>
            </div>
          )}

          {/* Semáforo PPVVCC */}
          {getActiveOpportunity().scales && (
            <div className="grid grid-cols-6 gap-2 mb-4">
              {[
                { key: 'dor', label: 'DOR', altKey: 'pain' },
                { key: 'poder', label: 'PODER', altKey: 'power' },
                { key: 'visao', label: 'VISÃO', altKey: 'vision' },
                { key: 'valor', label: 'VALOR', altKey: 'value' },
                { key: 'controle', label: 'CTRL', altKey: 'control' },
                { key: 'compras', label: 'COMPRAS', altKey: 'purchase' }
              ].map(({ key, label, altKey }) => {
                const value = getScaleValue(getActiveOpportunity().scales[key] || getActiveOpportunity().scales[altKey]);
                const isCritical = value < 4;
                const isWarning = value >= 4 && value < 7;
                
                return (
                  <div key={key} className={`text-center p-2 rounded-lg transition-all ${
                    isCritical ? 'bg-red-500 animate-pulse' : 
                    isWarning ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}>
                    <div className="text-white text-xs font-semibold">{label}</div>
                    <div className="text-white text-xl font-bold">{value}</div>
                    {isCritical && <div className="text-white text-[10px]">CRÍTICO!</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* INCONSISTENCIAS DETECTADAS con datos reales */}
          {analysis.inconsistencies && analysis.inconsistencies.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
              <h4 className="font-bold text-red-700 text-sm mb-2 flex items-center">
                <AlertTriangle className="mr-1 w-4 h-4" /> PROBLEMAS DETECTADOS:
              </h4>
              {analysis.inconsistencies.map((inc, idx) => (
                <div key={idx} className="mb-2">
                  <div className="text-sm text-red-600">• {inc.message}</div>
                  {inc.dataPoint && (
                    <div className="text-xs text-gray-600 ml-4 italic">{inc.dataPoint}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Alertas Temporales */}
          {alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {alerts.map((alert, idx) => (
                <div key={idx} className={`p-2 rounded-lg flex flex-col ${
                  alert.type === 'urgent' ? 'bg-red-100 text-red-700 font-bold' :
                  alert.type === 'critical' ? 'bg-orange-100 text-orange-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  <span className="text-sm">{alert.message}</span>
                  {alert.dataPoint && (
                    <span className="text-xs italic mt-1">{alert.dataPoint}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Próxima Acción PPVVCC con datos reales */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border-2 border-blue-400">
              <h4 className="font-semibold text-sm mb-2 flex items-center text-blue-700">
                <TrendingUp className="mr-1 w-4 h-4" /> Próxima Ação Recomendada:
              </h4>
              <p className="text-sm font-bold text-gray-800 mb-2">{analysis.nextAction.action}</p>
              <div className="bg-blue-50 p-2 rounded border-l-4 border-blue-500">
                <p className="text-xs text-gray-700 italic">"{analysis.nextAction.script}"</p>
                {analysis.nextAction.dataPoint && (
                  <p className="text-xs text-gray-600 mt-1 font-semibold">
                    📊 {analysis.nextAction.dataPoint}
                  </p>
                )}
              </div>
              <button 
                onClick={() => {
                  setIsOpen(true);
                  sendMessage(`Desenvolva esta ação: ${analysis.nextAction.action} para ${getActiveOpportunity().client} usando dados reais do Brasil`);
                }}
                className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition font-semibold"
              >
                Executar Ação →
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
        {alerts.length > 0 && alerts.some(a => a.type === 'urgent') && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        )}
      </button>

      {/* Chat del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Assistente Ventapel PPVVCC</h3>
              <button onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {currentUser && (
              <div className="text-xs opacity-90">
                Vendedor: {currentUser} • Dados reais Brasil 2024-2025
              </div>
            )}
            {assistantActiveOpportunity && (
              <div className="text-xs bg-white/20 rounded px-2 py-1 mt-2">
                🎯 Analisando: {assistantActiveOpportunity.client} ({brazilBenchmarks.industries[assistantActiveOpportunity.industry?.toLowerCase()]?.rate * 100 || 10}% perda média)
              </div>
            )}
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
            {messages.length === 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="font-bold text-sm text-blue-700 mb-2">
                  👋 Olá {currentUser || 'Vendedor'}!
                </p>
                <div className="text-xs text-gray-600 space-y-2">
                  <p>Sou seu assistente com dados reais do Brasil:</p>
                  <ul className="ml-2 space-y-1">
                    <li>• 📊 10% perdas por violação (IBEVAR 2024)</li>
                    <li>• 💰 E-commerce perde R$3 bi/ano</li>
                    <li>• 📦 80% avarias por embalagem inadequada</li>
                    <li>• 🎯 ROI Calculator com benchmarks reais</li>
                    <li>• 📈 Casos L'Oréal, Nike, MercadoLibre</li>
                  </ul>
                  <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="font-semibold text-yellow-800">
                      💡 Comandos úteis:
                    </p>
                    <ul className="text-xs mt-1">
                      <li>• "listar" - Ver oportunidades com perda potencial</li>
                      <li>• "calcular ROI [cliente]" - ROI com dados reais</li>
                      <li>• "plan semanal" - Plano com métricas Brasil</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.role === 'assistant' ? (
                    <MessageRenderer content={msg.content} onButtonClick={handleActionClick} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
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
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                placeholder='Ex: "calcular ROI", "plan semanal", "listar"...'
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition disabled:opacity-50 font-semibold"
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
