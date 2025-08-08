import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe } from 'lucide-react';

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  
  // Estado para la oportunidad activa en el contexto del asistente
  const [assistantActiveOpportunity, setAssistantActiveOpportunity] = useState(null);

  // Cargar datos del pipeline al iniciar
  useEffect(() => {
    if (supabase) {
      loadPipelineData();
    }
  }, [currentUser, supabase]);

  // Usar oportunidad activa del asistente O la que viene del CRM
  useEffect(() => {
    const opportunityToAnalyze = assistantActiveOpportunity || currentOpportunity;
    if (opportunityToAnalyze) {
      analyzeOpportunity(opportunityToAnalyze);
      checkOpportunityHealth(opportunityToAnalyze);
    }
  }, [currentOpportunity, assistantActiveOpportunity]);

  // Cargar datos del pipeline completo
  const loadPipelineData = async () => {
    if (!supabase) {
      console.warn('Supabase no disponible');
      return;
    }
    
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

  // Analizar salud general del pipeline
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

  // Función para obtener el valor de una escala
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

  // Calcular health score promedio
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

  // Función para analizar la oportunidad actual con diagnóstico agresivo
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
    
    // Detectar INCONSISTENCIAS críticas
    const inconsistencies = [];
    
    // Inconsistencia 1: Etapa avanzada con escalas bajas
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      inconsistencies.push({
        type: 'critical',
        message: '🔴 INCONSISTÊNCIA GRAVE: Apresentando sem DOR confirmada! Cliente não vai comprar.',
        action: 'Voltar para qualificação URGENTE'
      });
    }
    
    // Inconsistencia 2: Valor alto sin acceso al poder
    if (opp.value > 100000 && scaleValues.power < 4) {
      inconsistencies.push({
        type: 'critical',
        message: '⛔ PROBLEMA: R$' + opp.value.toLocaleString() + ' sem falar com decisor. Vai perder.',
        action: 'Conseguir acesso ao POWER hoje'
      });
    }
    
    // Inconsistencia 3: Negociando sin valor validado
    if (opp.stage >= 4 && scaleValues.value < 6) {
      inconsistencies.push({
        type: 'warning',
        message: '⚠️ RISCO: Negociando sem VALOR claro. Cliente vai pedir desconto enorme.',
        action: 'Calcular ROI específico AGORA'
      });
    }
    
    // Inconsistencia 4: Sin visión de solución completa
    if (opp.stage >= 2 && scaleValues.vision < 4) {
      inconsistencies.push({
        type: 'warning',
        message: '🚨 Cliente ainda acha que é "só trocar a fita". Não entende nossa solução.',
        action: 'Demo urgente com caso de sucesso'
      });
    }

    // Calcular probabilidad real basada en PPVVCC
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

  // Generar próxima acción recomendada
  const generateNextAction = (opp, scaleValues, inconsistencies) => {
    // Si hay inconsistencias críticas, abordarlas primero
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: `AÇÃO IMEDIATA: ${inconsistencies[0].message}`
      };
    }
    
    // Acciones basadas en escalas más bajas
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

  // Verificar salud de la oportunidad
  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    // Verificar último contacto
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

    // Verificar deals grandes en riesgo
    const avgScale = calculateHealthScore(opp.scales || {});
    if (avgScale < 4 && opp.value > 100000) {
      newAlerts.push({
        type: 'critical',
        message: `💣 R$${opp.value.toLocaleString()} em RISCO ALTO! Score: ${avgScale.toFixed(1)}/10`,
        action: 'rescue'
      });
    }

    // Verificar ciclo de venta largo
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

  // Buscar oportunidad específica en Supabase
  const searchOpportunity = async (clientName) => {
    if (!supabase) {
      console.warn('Supabase no disponible para búsqueda');
      return null;
    }
    
    try {
      // Buscar por nombre del cliente o nombre de la oportunidad (case insensitive)
      const { data: clientData, error: clientError } = await supabase
        .from('opportunities')
        .select('*')
        .or(`client.ilike.%${clientName}%,name.ilike.%${clientName}%`);
      
      if (clientError) throw clientError;
      
      // Si hay resultados, retornarlos
      if (clientData && clientData.length > 0) {
        return clientData;
      }
      
      // Si no hay resultados exactos, buscar por producto o industria
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

  // NUEVO: Buscar en Google con Serper
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

// Detectar si el mensaje pregunta por una oportunidad específica
const detectOpportunityQuery = (message) => {
  // Primero verificar si es una CONSULTA sobre una oportunidad existente
  const searchPatterns = [
    /(?:como está|status de|situação de|análise de|info sobre|información sobre|dados de|escalas de|ppvvcc de)\s+(.+?)(?:\?|$)/i,
    /(?:mostrar|ver|buscar|encontrar|analizar|checar)\s+(?:oportunidad|oportunidade|deal|negócio|cliente)\s+(.+?)(?:\?|$)/i,
    /(?:qual|como|qué)\s+(?:está|anda|vai)\s+(.+?)(?:\?|$)/i,
    /^buscar\s+(.+)/i,
    /^encontrar\s+(.+)/i,
    /^cliente\s+(.+?)(?:\s|$)/i
  ];
  
  // Palabras que indican que NO es una búsqueda sino contexto nuevo
  const contextIndicators = [
    'tengo', 'tenho', 'nueva', 'novo', 'voy a', 'vou', 'visitaré', 
    'reunión', 'meeting', 'demo', 'presentación', 'llamé', 'contacté',
    'hablé', 'falei', 'admitieron', 'dijeron', 'quieren', 'necesitan'
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Si el mensaje contiene indicadores de contexto nuevo, NO es búsqueda
  if (contextIndicators.some(indicator => lowerMessage.includes(indicator))) {
    return null;
  }
  
  // Verificar patrones de búsqueda explícita
  for (const pattern of searchPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Solo si es UNA SOLA PALABRA podría ser nombre de empresa
  const words = message.trim().split(/\s+/);
  if (words.length === 1 && words[0].length > 2) {
    // Pero NO si parece ser parte de una oración
    if (!message.includes('.') && !message.includes(',')) {
      return words[0];
    }
  }
  
  return null;
};

  // Quick Actions dinámicas - MÁXIMO 4 BOTONES
  const getQuickActions = () => {
    // Usar la oportunidad activa del asistente O la del CRM
    const activeOpp = assistantActiveOpportunity || currentOpportunity;
    
    // Si no hay oportunidad activa, mostrar acciones de búsqueda y análisis general
    if (!activeOpp) {
      return [
        {
          icon: '🔍',
          label: 'Buscar cliente',
          prompt: 'Listar todas las oportunidades disponibles en el CRM'
        },
        {
          icon: '📊',
          label: 'Pipeline completo',
          prompt: 'Muéstrame un resumen del pipeline completo con las oportunidades más importantes y en riesgo'
        },
        {
          icon: '🎯',
          label: 'Top 5 deals',
          prompt: 'Cuáles son las 5 mejores oportunidades para cerrar este mes?'
        },
        {
          icon: '⚠️',
          label: 'Deals en riesgo',
          prompt: 'Muéstrame todas las oportunidades en riesgo con análisis PPVVCC'
        }
      ];
    }
    
    if (!activeOpp.scales) return [];
    
    const actions = [];
    const scales = activeOpp.scales;
    
    const painValue = getScaleValue(scales.dor || scales.pain);
    const powerValue = getScaleValue(scales.poder || scales.power);
    const visionValue = getScaleValue(scales.visao || scales.vision);
    const valueValue = getScaleValue(scales.valor || scales.value);
    const controlValue = getScaleValue(scales.controle || scales.control);
    
    // Prioridad 1: Si hay alertas críticas
    if (alerts.length > 0 && alerts[0].type === 'urgent') {
      actions.push({
        icon: '🚨',
        label: 'Reativar URGENTE',
        prompt: `${activeOpp.client} está FRIO há dias. Preciso reativar HOJE este deal de R$${activeOpp.value}. 
        Me dê:
        1. Email de reativação que gere resposta imediata
        2. Script de ligação de 30 segundos
        3. WhatsApp message casual mas efetivo
        Contexto: DOR=${painValue}, PODER=${powerValue}, última ação: ${activeOpp.next_action || 'não definida'}`
      });
    }
    
    // Prioridad 2: Buscar en Google
    actions.push({
      icon: '🌐',
      label: 'Google empresa',
      prompt: `buscar en Google ${activeOpp.client}`
    });
    
    // Prioridad 3: Diagnóstico de inconsistencias
    if (analysis && analysis.inconsistencies && analysis.inconsistencies.length > 0) {
      actions.push({
        icon: '⚠️',
        label: 'Corrigir problema',
        prompt: `PROBLEMA DETECTADO em ${activeOpp.client}: ${analysis.inconsistencies[0].message}
        Como corrijo isso IMEDIATAMENTE? Preciso de ações específicas para hoje.
        Valor do deal: R$${activeOpp.value}`
      });
    }
    
    // Prioridad 4: Basado en la escala más baja
    const lowestScale = Math.min(painValue, powerValue, visionValue, valueValue);
    
    if (lowestScale === painValue && painValue < 5) {
      actions.push({
        icon: '🎯',
        label: 'Gerar DOR',
        prompt: `${activeOpp.client} NÃO admite o problema (DOR=${painValue}/10).
        Preciso de 5 perguntas SPIN MATADORAS específicas para ${activeOpp.industry || 'logística'}.
        Foco: violação de caixas, retrabalho, custos ocultos.
        Quero perguntas que DOAM, que façam o cliente sentir o problema.`
      });
    } else if (lowestScale === powerValue && powerValue < 5) {
      actions.push({
        icon: '👔',
        label: 'Acessar decisor',
        prompt: `Preciso URGENTE acessar o decisor em ${activeOpp.client}.
        Poder atual: ${powerValue}/10. Contato atual: ${activeOpp.sponsor || 'não identificado'}.
        Me dê 3 formas diferentes de conseguir acesso ao gerente de logística/operações.
        Incluir: email, LinkedIn approach, e pedido direto.`
      });
    }
    
    // Siempre agregar opción de cambiar cliente
    actions.push({
      icon: '🔄',
      label: 'Cambiar cliente',
      prompt: 'Listar todas las oportunidades disponibles para seleccionar otra'
    });
    
    // Retornar máximo 4 acciones
    return actions.slice(0, 4);
  };

  // Obtener la oportunidad activa para mostrar en el panel
  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

  // Enviar mensaje al asistente
  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // NUEVO: Detectar búsqueda en Google
      if (messageText.toLowerCase().includes('google') || 
          messageText.toLowerCase().includes('buscar web') ||
          messageText.toLowerCase().includes('buscar en internet')) {
        
        // Extraer el término de búsqueda
        const searchTerm = messageText
          .replace(/buscar en google|buscar web|buscar en internet|google/gi, '')
          .trim() || getActiveOpportunity()?.client;
        
        if (!searchTerm) {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: '❌ Especifica qué empresa querés buscar.\n\nEjemplos:\n• "buscar Google MercadoLibre"\n• "Google Natura Brasil"\n• "buscar web Amazon"'
          }]);
          setIsLoading(false);
          return;
        }
        
        // Buscar en Google
        const results = await searchGoogle(searchTerm + ' Brasil empresa');
        
        if (results && results.length > 0) {
          const formatted = results.map((r, idx) => 
            `${idx + 1}. **${r.title}**\n` +
            `   ${r.snippet}\n` +
            `   🔗 [Ver más](${r.link})\n` +
            (r.hasRevenue ? '   💰 Menciona facturación\n' : '') +
            (r.hasEmployees ? '   👥 Menciona empleados\n' : '')
          ).join('\n');
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `🔍 **Resultados de Google para "${searchTerm}":**\n\n${formatted}\n\n` +
                     `💡 **Cómo usar esta info:**\n` +
                     `• **Dimensionar oportunidad** - Ver tamaño y facturación\n` +
                     `• **Preparar reunión** - Entender su negocio\n` +
                     `• **Encontrar pain points** - Buscar problemas en noticias\n` +
                     `• **Identificar decisores** - LinkedIn de los ejecutivos\n\n` +
                     `📝 **Próximo paso:** Actualiza el CRM con esta información relevante.`
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `❌ No encontré información sobre "${searchTerm}" en Google.\n\n` +
                     `Probá con búsquedas más específicas:\n` +
                     `• "${searchTerm} facturación 2024"\n` +
                     `• "${searchTerm} empleados Brasil"\n` +
                     `• "${searchTerm} noticias logística"\n` +
                     `• "${searchTerm} problemas distribución"`
          }]);
        }
        
        setIsLoading(false);
        return;
      }

      // Detectar si está preguntando por una oportunidad específica
      const possibleClient = detectOpportunityQuery(messageText);
      let searchedOpportunity = null;
      let searchResults = [];
      
      if (possibleClient && supabase) {
        searchResults = await searchOpportunity(possibleClient);
        if (searchResults && searchResults.length > 0) {
          searchedOpportunity = searchResults[0]; // Tomar la primera coincidencia
          
          // IMPORTANTE: Establecer la oportunidad activa en el contexto del asistente
          setAssistantActiveOpportunity(searchedOpportunity);
          
          // Analizar la nueva oportunidad
          analyzeOpportunity(searchedOpportunity);
          checkOpportunityHealth(searchedOpportunity);
        }
      }
      
      // Detectar si quiere listar todas las oportunidades
      if (messageText.toLowerCase().includes('listar') || 
          messageText.toLowerCase().includes('todas') ||
          messageText.toLowerCase().includes('mostrar oportunidades')) {
        const listMessage = `📋 **Oportunidades en el CRM:**\n\n` +
          allOpportunities.map((opp, idx) => 
            `${idx + 1}. **${opp.client}** - ${opp.name}\n` +
            `   💰 R$ ${opp.value.toLocaleString('pt-BR')} | Etapa: ${opp.stage} | Vendedor: ${opp.vendor}\n` +
            `   📊 Health Score: ${calculateHealthScore(opp.scales || {}).toFixed(1)}/10`
          ).join('\n\n') +
          `\n\n💡 **Tip:** Escribe el nombre del cliente para analizarlo en detalle.`;
        
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: listMessage
        }]);
        setIsLoading(false);
        return;
      }

      // Preparar contexto con toda la información de Ventapel
      const ventapelContext = {
        produtos: {
          maquinas: "Better Packages BP555e, BP755, BP222 Curby, Random Sealer Automated (RSA)",
          fitas: "VENOM (3-way reinforced, water-activated), Gorilla (300m e 700m)",
          solucao: "Sistema completo de fechamento: máquina + fita + suporte técnico",
          diferencial: "Redução de até 64% nos custos de fechamento, ROI em 2-3 meses"
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
          mercadolibre: "40% redução retrabalho",
          natura: "60% menos violações",
          magazine_luiza: "35% redução devoluções",
          centauro: "95% redução furtos, economia R$50mi/ano"
        },
        metodologia: "PPVVCC - Pain, Power, Vision, Value, Control, Compras",
        proposta_valor: [
          "Inviolabilidade garantida - furtos ZERO",
          "ROI comprovado em 2-3 meses",
          "Redução drástica de retrabalho (+30-50% eficiência)",
          "Melhoria ergonômica e eliminação de dores operadores",
          "Sustentabilidade (fita kraft reciclável)",
          "Suporte técnico próprio/dedicado"
        ]
      };

      // Usar la oportunidad activa del asistente O la buscada O la del CRM
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

      // Preparar información de búsqueda para el contexto
      const searchContext = searchedOpportunity ? {
        found: true,
        client: searchedOpportunity.client,
        multipleResults: searchResults.length > 1,
        totalFound: searchResults.length,
        allResults: searchResults.map(opp => ({
          client: opp.client,
          value: opp.value,
          stage: opp.stage,
          vendor: opp.vendor
        }))
      } : (possibleClient && searchResults.length === 0 ? {
        found: false,
        searchTerm: possibleClient
      } : null);

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: messageText,
          opportunityData: opportunityContext,
          ventapelContext: ventapelContext,
          searchContext: searchContext,
          language: 'português brasileiro',
          focusOn: 'venda consultiva PPVVCC, solução de fechamento, detectar problemas',
          instructions: {
            dataAccuracy: 'CRÍTICO: Ao buscar informações sobre empresas, use APENAS dados verificados e reais. NUNCA invente ou estime dados.',
            salesApproach: 'Seja direto e agressivo no diagnóstico PPVVCC. Detecte inconsistências e comunique sem rodeios.'
          },
          pipelineData: {
            currentOpportunity: opportunityContext,
            allOpportunities: allOpportunities,
            pipelineHealth: pipelineHealth
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

          {/* Pipeline Info */}
          {pipelineHealth && (
            <div className="bg-white/50 p-2 rounded mb-3 text-xs">
              <div className="flex justify-between">
                <span>Pipeline: R${pipelineHealth.totalValue.toLocaleString('pt-BR')}</span>
                <span className="text-red-600 font-bold">⚠️ Em Risco: R${pipelineHealth.riskValue.toLocaleString('pt-BR')}</span>
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

          {/* INCONSISTENCIAS DETECTADAS */}
          {analysis.inconsistencies && analysis.inconsistencies.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
              <h4 className="font-bold text-red-700 text-sm mb-2 flex items-center">
                <AlertTriangle className="mr-1 w-4 h-4" /> PROBLEMAS DETECTADOS:
              </h4>
              {analysis.inconsistencies.map((inc, idx) => (
                <div key={idx} className="text-sm text-red-600 mb-1">
                  • {inc.message}
                </div>
              ))}
            </div>
          )}

          {/* Alertas Temporales */}
          {alerts.length > 0 && (
            <div className="space-y-2 mb-4">
              {alerts.map((alert, idx) => (
                <div key={idx} className={`p-2 rounded-lg flex items-center ${
                  alert.type === 'urgent' ? 'bg-red-100 text-red-700 font-bold' :
                  alert.type === 'critical' ? 'bg-orange-100 text-orange-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Próxima Acción PPVVCC */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border-2 border-blue-400">
              <h4 className="font-semibold text-sm mb-2 flex items-center text-blue-700">
                <TrendingUp className="mr-1 w-4 h-4" /> Próxima Ação Recomendada:
              </h4>
              <p className="text-sm font-bold text-gray-800 mb-2">{analysis.nextAction.action}</p>
              <div className="bg-blue-50 p-2 rounded border-l-4 border-blue-500">
                <p className="text-xs text-gray-700 italic">"{analysis.nextAction.script}"</p>
              </div>
              <button 
                onClick={() => {
                  setIsOpen(true);
                  sendMessage(`Desenvolva esta ação: ${analysis.nextAction.action} para ${getActiveOpportunity().client}`);
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
                Vendedor: {currentUser} • Foco: Soluções de Fechamento
              </div>
            )}
            {assistantActiveOpportunity && (
              <div className="text-xs bg-white/20 rounded px-2 py-1 mt-2">
                🎯 Analisando: {assistantActiveOpportunity.client}
              </div>
            )}
          </div>

          {/* Quick Actions - MÁXIMO 4 BOTONES */}
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
                  <p>Sou seu assistente PPVVCC. Posso ajudar com:</p>
                  <ul className="ml-2 space-y-1">
                    <li>• 🔍 Buscar e analisar QUALQUER oportunidade</li>
                    <li>• 🌐 Buscar información en Google</li>
                    <li>• 📊 Diagnosticar escalas PPVVCC</li>
                    <li>• 📧 Gerar emails e scripts de venda</li>
                    <li>• 💰 Calcular ROI específico</li>
                    <li>• 🎯 Detectar problemas e inconsistências</li>
                  </ul>
                  <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="font-semibold text-yellow-800">
                      💡 Comandos útiles:
                    </p>
                    <ul className="text-xs mt-1">
                      <li>• "listar" - Ver todas las oportunidades</li>
                      <li>• "Amazon" - Analizar cliente específico</li>
                      <li>• "google MercadoLibre" - Buscar en internet</li>
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
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                placeholder='Ej: "listar", "Amazon", "google Natura"...'
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
