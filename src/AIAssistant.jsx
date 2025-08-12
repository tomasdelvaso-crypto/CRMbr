import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign, Database, Search } from 'lucide-react';

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
  const [similarDeals, setSimilarDeals] = useState([]);

  // Benchmarks reales de Brasil 2024-2025 (ÚLTIMA PRIORIDAD)
  const brazilBenchmarks = {
    averageLoss: 0.10,
    packagingImpact: 0.80,
    ecommerceLosses: 3000000000,
    logisticsCost: 0.184,
    industries: {
      'e-commerce': { rate: 0.10, source: 'IBEVAR 2024' },
      'cosmética': { rate: 0.08, source: 'Casos reales' },
      'farmacéutica': { rate: 0.09, source: 'ANVISA + cadena fría' },
      'logística': { rate: 0.06, source: 'NTC&Logística' },
      'automotriz': { rate: 0.04, source: 'Casos reales' },
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
      analyzeOpportunityWithContext(opportunityToAnalyze);
      checkOpportunityHealth(opportunityToAnalyze);
      findSimilarDeals(opportunityToAnalyze);
    }
  }, [currentOpportunity, assistantActiveOpportunity, allOpportunities]);

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

  // NUEVA FUNCIÓN: Buscar deals similares en el CRM (PRIORIDAD 2)
  const findSimilarDeals = async (opp) => {
    if (!opp || !supabase) return;

    try {
      // Buscar por industria similar
      const { data: industryDeals } = await supabase
        .from('opportunities')
        .select('*')
        .eq('industry', opp.industry)
        .neq('id', opp.id)
        .gte('stage', 5) // Solo deals avanzados/cerrados
        .limit(5);

      // Buscar por producto similar
      const { data: productDeals } = await supabase
        .from('opportunities')
        .select('*')
        .eq('product', opp.product)
        .neq('id', opp.id)
        .gte('stage', 5)
        .limit(5);

      // Buscar por rango de valor similar (±30%)
      const minValue = opp.value * 0.7;
      const maxValue = opp.value * 1.3;
      const { data: valueDeals } = await supabase
        .from('opportunities')
        .select('*')
        .gte('value', minValue)
        .lte('value', maxValue)
        .neq('id', opp.id)
        .gte('stage', 5)
        .limit(5);

      // Combinar y deduplicar
      const allSimilar = [...(industryDeals || []), ...(productDeals || []), ...(valueDeals || [])];
      const uniqueDeals = Array.from(new Map(allSimilar.map(d => [d.id, d])).values());
      
      setSimilarDeals(uniqueDeals);
      return uniqueDeals;
    } catch (err) {
      console.error('Error buscando deals similares:', err);
      return [];
    }
  };

  // NUEVA FUNCIÓN: Obtener contexto inteligente con priorización
  const getIntelligentContext = (opp) => {
    const context = {
      priority1_clientNotes: {},
      priority2_similarDeals: {},
      priority3_ventapelCases: {},
      priority4_brazilBenchmarks: {},
      dataSource: null
    };

    // PRIORIDAD 1: Lo que el cliente YA DIJO (notes y campos del CRM)
    if (opp) {
      context.priority1_clientNotes = {
        hasData: false,
        notes: []
      };

      // Extraer información de campos personalizados
      if (opp.next_action) {
        context.priority1_clientNotes.notes.push(`Próxima acción acordada: ${opp.next_action}`);
        context.priority1_clientNotes.hasData = true;
      }
      
      if (opp.scales?.dor?.description) {
        context.priority1_clientNotes.notes.push(`Cliente dijo sobre DOR: ${opp.scales.dor.description}`);
        context.priority1_clientNotes.hasData = true;
      }
      
      if (opp.scales?.poder?.description) {
        context.priority1_clientNotes.notes.push(`Sobre decisor: ${opp.scales.poder.description}`);
        context.priority1_clientNotes.hasData = true;
      }
      
      if (opp.scales?.valor?.description) {
        context.priority1_clientNotes.notes.push(`Sobre valor/ROI: ${opp.scales.valor.description}`);
        context.priority1_clientNotes.hasData = true;
      }

      // Contactos mencionados
      if (opp.power_sponsor || opp.sponsor) {
        context.priority1_clientNotes.notes.push(
          `Contactos identificados: ${[opp.power_sponsor, opp.sponsor, opp.influencer].filter(Boolean).join(', ')}`
        );
        context.priority1_clientNotes.hasData = true;
      }
    }

    // PRIORIDAD 2: Datos de deals similares EN TU CRM
    if (similarDeals.length > 0) {
      context.priority2_similarDeals = {
        hasData: true,
        count: similarDeals.length,
        avgValue: similarDeals.reduce((sum, d) => sum + d.value, 0) / similarDeals.length,
        avgCloseTime: calculateAvgCloseTime(similarDeals),
        commonPatterns: extractCommonPatterns(similarDeals),
        successfulApproaches: extractSuccessfulApproaches(similarDeals)
      };

      // Extraer lecciones específicas
      const closedDeals = similarDeals.filter(d => d.stage === 6);
      if (closedDeals.length > 0) {
        context.priority2_similarDeals.closedExamples = closedDeals.map(d => ({
          client: d.client,
          value: d.value,
          product: d.product,
          closeTime: calculateDaysInPipeline(d),
          keySuccess: d.next_action || 'Deal cerrado exitosamente'
        }));
      }
    }

    // PRIORIDAD 3: Casos de éxito Ventapel (solo si no hay datos mejores)
    if (!context.priority1_clientNotes.hasData && !context.priority2_similarDeals.hasData) {
      context.priority3_ventapelCases = {
        hasData: true,
        relevantCase: selectRelevantCase(opp)
      };
    }

    // PRIORIDAD 4: Benchmarks de Brasil (último recurso)
    if (!context.priority1_clientNotes.hasData && 
        !context.priority2_similarDeals.hasData && 
        !context.priority3_ventapelCases.hasData) {
      const industry = opp?.industry?.toLowerCase() || 'default';
      context.priority4_brazilBenchmarks = {
        hasData: true,
        lossRate: brazilBenchmarks.industries[industry]?.rate || brazilBenchmarks.averageLoss,
        source: brazilBenchmarks.industries[industry]?.source || 'IBEVAR média Brasil'
      };
    }

    // Determinar fuente de datos principal
    if (context.priority1_clientNotes.hasData) {
      context.dataSource = 'DATOS DEL CLIENTE';
    } else if (context.priority2_similarDeals.hasData) {
      context.dataSource = 'DEALS SIMILARES EN CRM';
    } else if (context.priority3_ventapelCases.hasData) {
      context.dataSource = 'CASOS VENTAPEL';
    } else {
      context.dataSource = 'BENCHMARKS BRASIL';
    }

    return context;
  };

  // Funciones auxiliares para análisis
  const calculateAvgCloseTime = (deals) => {
    const times = deals.map(d => calculateDaysInPipeline(d)).filter(t => t > 0);
    return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  };

  const calculateDaysInPipeline = (deal) => {
    if (!deal.created_at) return 0;
    const created = new Date(deal.created_at);
    const closed = deal.expected_close ? new Date(deal.expected_close) : new Date();
    return Math.floor((closed - created) / (1000 * 60 * 60 * 24));
  };

  const extractCommonPatterns = (deals) => {
    const patterns = [];
    
    // Patrón de productos más vendidos
    const productCounts = {};
    deals.forEach(d => {
      if (d.product) {
        productCounts[d.product] = (productCounts[d.product] || 0) + 1;
      }
    });
    
    const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0];
    if (topProduct) {
      patterns.push(`Producto más exitoso: ${topProduct[0]} (${topProduct[1]} deals)`);
    }

    // Patrón de etapa de cierre
    const avgStage = Math.round(deals.reduce((sum, d) => sum + d.stage, 0) / deals.length);
    patterns.push(`Etapa promedio: ${avgStage}`);

    return patterns;
  };

  const extractSuccessfulApproaches = (deals) => {
    const approaches = [];
    
    deals.forEach(deal => {
      if (deal.scales) {
        const avgScore = calculateHealthScore(deal.scales);
        if (avgScore > 7) {
          approaches.push({
            client: deal.client,
            approach: `Score PPVVCC alto (${avgScore.toFixed(1)}/10)`,
            value: deal.value
          });
        }
      }
    });

    return approaches;
  };

  const selectRelevantCase = (opp) => {
    const industry = opp?.industry?.toLowerCase() || '';
    const value = opp?.value || 0;

    // Mapeo de industrias a casos
    const caseMapping = {
      'cosmética': {
        name: 'L\'Oréal',
        results: '100% furtos eliminados, +50% eficiência, ROI 3 meses'
      },
      'e-commerce': {
        name: 'MercadoLibre',
        results: '40% redução retrabalho, economia R$180k/mês'
      },
      'farmacéutica': {
        name: 'Natura',
        results: '60% menos violações, economia R$85k/mês'
      },
      'varejo': {
        name: 'Centauro',
        results: '95% redução furtos, economia R$50mi/ano'
      },
      'automotriz': {
        name: 'Honda Argentina',
        results: '+40% velocidade, 100% redução faltantes'
      }
    };

    return caseMapping[industry] || caseMapping['e-commerce'];
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

  // FUNCIÓN MEJORADA: Analizar con contexto inteligente
  const analyzeOpportunityWithContext = (opp) => {
    if (!opp || !opp.scales) return;

    const context = getIntelligentContext(opp);
    
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
    
    // Análisis basado en contexto inteligente
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      let message = '🔴 INCONSISTÊNCIA: Apresentando sem DOR confirmada!';
      
      // Agregar contexto según prioridad
      if (context.priority1_clientNotes.hasData) {
        message += ` ${context.priority1_clientNotes.notes[0]}`;
      } else if (context.priority2_similarDeals.hasData && context.priority2_similarDeals.closedExamples) {
        message += ` Deals similares como ${context.priority2_similarDeals.closedExamples[0].client} necesitaron DOR > 7`;
      }
      
      inconsistencies.push({
        type: 'critical',
        message,
        action: 'Voltar para qualificação URGENTE',
        dataSource: context.dataSource
      });
    }
    
    if (opp.value > 100000 && scaleValues.power < 4) {
      let message = `⛔ PROBLEMA: R$${opp.value.toLocaleString()} sem falar com decisor.`;
      
      if (context.priority2_similarDeals.hasData) {
        message += ` Deals similares demoraram ${context.priority2_similarDeals.avgCloseTime} dias em média`;
      }
      
      inconsistencies.push({
        type: 'critical',
        message,
        action: 'Conseguir acesso ao POWER hoje',
        dataSource: context.dataSource
      });
    }

    // Calcular probabilidad basada en datos reales
    let probability = 0;
    
    // Si hay deals similares cerrados, usar su tasa de éxito
    if (context.priority2_similarDeals.hasData) {
      const closedCount = similarDeals.filter(d => d.stage === 6).length;
      const successRate = closedCount / similarDeals.length;
      
      if (scaleValues.pain >= 7 && scaleValues.power >= 6) {
        probability = Math.round(75 * successRate);
      } else if (scaleValues.pain >= 5 && scaleValues.power >= 4) {
        probability = Math.round(40 * successRate);
      } else {
        probability = Math.round(15 * successRate);
      }
    } else {
      // Usar cálculo estándar
      if (scaleValues.pain >= 7 && scaleValues.power >= 6 && scaleValues.value >= 6) {
        probability = 75;
      } else if (scaleValues.pain >= 5 && scaleValues.power >= 4 && scaleValues.value >= 4) {
        probability = 40;
      } else if (scaleValues.pain >= 3) {
        probability = 15;
      } else {
        probability = 5;
      }
    }

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability,
      scaleValues,
      inconsistencies,
      nextAction: generateSmartNextAction(opp, scaleValues, inconsistencies, context),
      context,
      similarDealsCount: similarDeals.length
    });
  };

  // FUNCIÓN MEJORADA: Generar próxima acción con contexto
  const generateSmartNextAction = (opp, scaleValues, inconsistencies, context) => {
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: `AÇÃO IMEDIATA: ${inconsistencies[0].message}`,
        dataSource: context.dataSource
      };
    }
    
    // Generar acciones basadas en el contexto disponible
    if (scaleValues.pain < 5) {
      let script = "Pergunta: ";
      
      if (context.priority1_clientNotes.hasData) {
        script += `'Você mencionou ${context.priority1_clientNotes.notes[0]}. Quanto isso custa em R$ por mês?'`;
      } else if (context.priority2_similarDeals.hasData && context.priority2_similarDeals.closedExamples) {
        const example = context.priority2_similarDeals.closedExamples[0];
        script += `'${example.client} tinha o mesmo problema e economizou R$${example.value.toLocaleString()}. Vocês têm desafios similares?'`;
      } else {
        script += `'Quantas horas por mês vocês perdem com retrabalho?'`;
      }
      
      return {
        action: "🎯 Fazer cliente ADMITIR o problema",
        script,
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.power < 4) {
      let script = "Script: ";
      
      if (context.priority1_clientNotes.notes.some(n => n.includes('decisor'))) {
        script += `'Você mencionou ${opp.sponsor || 'o decisor'}. Podemos incluí-lo na próxima reunião?'`;
      } else if (context.priority2_similarDeals.hasData) {
        script += `'Em ${context.priority2_similarDeals.count} casos similares, o decisor foi crucial. Podemos agendar com ele?'`;
      } else {
        script += `'Para avançar, preciso validar com quem assina. Consegue nos conectar?'`;
      }
      
      return {
        action: "👔 Acessar o DECISOR",
        script,
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.vision < 5) {
      let demoContent = "";
      
      if (context.priority2_similarDeals.hasData && context.priority2_similarDeals.closedExamples) {
        const example = context.priority2_similarDeals.closedExamples[0];
        demoContent = `caso ${example.client} com ${example.product}`;
      } else if (context.priority3_ventapelCases.relevantCase) {
        demoContent = `caso ${context.priority3_ventapelCases.relevantCase.name}`;
      } else {
        demoContent = "nossa solução completa";
      }
      
      return {
        action: "🎬 Demo urgente",
        script: `Mostrar: 'Veja o ${demoContent} - resultados em 3 meses'`,
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.value < 5) {
      let roiCalc = "";
      
      if (context.priority2_similarDeals.hasData) {
        const avgValue = context.priority2_similarDeals.avgValue;
        roiCalc = `'Baseado em ${context.priority2_similarDeals.count} casos similares, ROI médio de R$${avgValue.toLocaleString()}'`;
      } else {
        roiCalc = `'Com seu volume, economia de R$${(opp.value * 0.3).toLocaleString()}/ano'`;
      }
      
      return {
        action: "💰 Calcular ROI específico",
        script: roiCalc,
        dataSource: context.dataSource
      };
    }
    
    return {
      action: "✅ FECHAR o negócio",
      script: "Closing: 'Qual processo interno preciso seguir para começar?'",
      dataSource: context.dataSource
    };
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

  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    const context = getIntelligentContext(opp);
    
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) {
        let message = `🔴 ${daysSince} dias sem contato - VAI PERDER!`;
        
        // Agregar contexto de deals similares si existe
        if (context.priority2_similarDeals.hasData) {
          message += ` Deals similares fecham em ${context.priority2_similarDeals.avgCloseTime} dias`;
        }
        
        newAlerts.push({
          type: 'urgent',
          message,
          action: 'reactivate',
          dataSource: context.dataSource
        });
      }
    }

    const avgScale = calculateHealthScore(opp.scales || {});
    if (avgScale < 4 && opp.value > 100000) {
      newAlerts.push({
        type: 'critical',
        message: `💣 R$${opp.value.toLocaleString()} em RISCO! Score: ${avgScale.toFixed(1)}/10`,
        action: 'rescue',
        dataSource: context.dataSource
      });
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
      /^buscar\s+(.+)/i,
      /^cliente\s+(.+?)(?:\s|$)/i
    ];
    
    const contextIndicators = [
      'tengo', 'tenho', 'nueva', 'novo', 'voy a', 'vou',
      'reunión', 'meeting', 'demo', 'llamé', 'contacté',
      'falei', 'admitieron', 'dijeron', 'quieren', 'necesitan'
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
    
    return null;
  };

  const getQuickActions = () => {
    const activeOpp = assistantActiveOpportunity || currentOpportunity;
    
    if (!activeOpp) {
      return [
        { icon: <Database size={18} />, label: 'Ver Pipeline', prompt: 'Listar todas las oportunidades con análisis' },
        { icon: <Search size={18} />, label: 'Buscar Deal', prompt: 'Buscar oportunidad específica' },
        { icon: <AlertTriangle size={18} />, label: 'Deals en Riesgo', prompt: 'Mostrar deals en riesgo' },
        { icon: <Calendar size={18} />, label: 'Plan Semanal', prompt: 'plan_semanal' }
      ];
    }
    
    const actions = [];
    
    // Prioridad 1: Basado en datos del cliente
    if (analysis?.context?.priority1_clientNotes?.hasData) {
      actions.push({ 
        icon: <Database size={18} />, 
        label: 'Usar notas cliente', 
        prompt: `Generar estrategia basada en lo que ${activeOpp.client} ya dijo` 
      });
    }
    
    // Prioridad 2: Basado en deals similares
    if (similarDeals.length > 0) {
      actions.push({ 
        icon: <TrendingUp size={18} />, 
        label: `Ver ${similarDeals.length} similares`, 
        prompt: `Mostrar qué funcionó en deals similares a ${activeOpp.client}` 
      });
    }
    
    // Prioridad 3: Calcular ROI
    actions.push({ 
      icon: <DollarSign size={18} />, 
      label: 'Calcular ROI', 
      prompt: `Calcular ROI para ${activeOpp.client} con datos reales` 
    });
    
    // Siempre: Cambiar cliente
    actions.push({ 
      icon: <RefreshCw size={18} />, 
      label: 'Cambiar Cliente', 
      prompt: 'Listar todas las oportunidades' 
    });
    
    return actions.slice(0, 4);
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
      const opportunityToUpdateId = oppId || (assistantActiveOpportunity || currentOpportunity)?.id;
      
      if (!opportunityToUpdateId) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro: Não sei qual oportunidade atualizar.' }]);
        return;
      }

      setIsLoading(true);
      try {
        const currentOpp = allOpportunities.find(o => o.id === opportunityToUpdateId);
        const updatedScales = {
          ...(currentOpp?.scales || {}),
          [scale]: { 
            ...(currentOpp?.scales?.[scale] || {}),
            score: parseInt(newValue) 
          }
        };

        const { data, error } = await supabase
          .from('opportunities')
          .update({ 
            scales: updatedScales,
            last_update: new Date().toISOString()
          })
          .eq('id', opportunityToUpdateId)
          .select();

        if (error) throw error;

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ Atualizado! ${scale.toUpperCase()} = ${newValue}/10 para ${data[0].client}` 
        }]);

        await loadPipelineData();
      } catch (error) {
        console.error('Error actualizando:', error);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Erro: ${error.message}` 
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

const sendMessage = async (messageText = input) => {
  if (!messageText.trim()) return;

  // ... código existente ...

  try {
    // BÚSQUEDA MEJORADA - Detectar si quiere buscar una oportunidad
    let searchedOpportunity = null;
    let searchResults = [];
    
    // Buscar directamente si el mensaje es simple (ej: "intelbras", "mwm")
    const isSimpleSearch = messageText.split(' ').length <= 2 && 
                          !messageText.includes('?') && 
                          messageText.length > 2;
    
    if (isSimpleSearch || messageText.toLowerCase().includes('buscar')) {
      const searchTerm = messageText.replace(/buscar|encontrar|ver|mostrar/gi, '').trim();
      
      if (searchTerm && supabase) {
        console.log('Buscando:', searchTerm);
        
        // Buscar en todas las oportunidades cargadas primero (más rápido)
        searchResults = allOpportunities.filter(opp => 
          opp.client?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          opp.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (searchResults.length > 0) {
          searchedOpportunity = searchResults[0];
          setAssistantActiveOpportunity(searchedOpportunity);
          
          // Generar respuesta local sin llamar al API
          const analysis = analyzeOpportunityWithContext(searchedOpportunity);
          
          let response = `🎯 **${searchedOpportunity.client}**\n\n`;
          response += `**Valor:** R$ ${searchedOpportunity.value?.toLocaleString('pt-BR')}\n`;
          response += `**Etapa:** ${searchedOpportunity.stage}\n`;
          response += `**Score PPVVCC:** ${calculateHealthScore(searchedOpportunity.scales || {}).toFixed(1)}/10\n\n`;
          
          if (searchedOpportunity.scales) {
            response += `**Escalas:**\n`;
            response += `• DOR: ${getScaleValue(searchedOpportunity.scales.dor)}/10\n`;
            response += `• PODER: ${getScaleValue(searchedOpportunity.scales.poder)}/10\n`;
            response += `• VISÃO: ${getScaleValue(searchedOpportunity.scales.visao)}/10\n`;
            response += `• VALOR: ${getScaleValue(searchedOpportunity.scales.valor)}/10\n`;
            response += `• CONTROLE: ${getScaleValue(searchedOpportunity.scales.controle)}/10\n`;
            response += `• COMPRAS: ${getScaleValue(searchedOpportunity.scales.compras)}/10\n\n`;
          }
          
          // Agregar análisis
          if (analysis?.inconsistencies?.length > 0) {
            response += `**⚠️ Problemas detectados:**\n`;
            analysis.inconsistencies.forEach(inc => {
              response += `• ${inc.message}\n`;
            });
            response += `\n`;
          }
          
          if (analysis?.nextAction) {
            response += `**➡️ Próxima acción:**\n`;
            response += `${analysis.nextAction.action}\n`;
          }
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: response 
          }]);
          setIsLoading(false);
          return; // Salir sin llamar al API
        } else {
          // No se encontró localmente
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `❌ No encontré "${searchTerm}" en las oportunidades.\n\n¿Querés ver todas las disponibles? Escribí "listar"` 
          }]);
          setIsLoading(false);
          return;
        }
      }
    }

    // Listar oportunidades (tu código existente funciona bien)
    if (messageText.toLowerCase().includes('listar')) {
      // ... tu código de listar existente ...
      return;
    }

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Detectar búsqueda
      const possibleClient = detectOpportunityQuery(messageText);
      let searchedOpportunity = null;
      
      if (possibleClient && supabase) {
        const searchResults = await searchOpportunity(possibleClient);
        if (searchResults && searchResults.length > 0) {
          searchedOpportunity = searchResults[0];
          setAssistantActiveOpportunity(searchedOpportunity);
          await findSimilarDeals(searchedOpportunity);
          analyzeOpportunityWithContext(searchedOpportunity);
        }
      }
      
      // Listar oportunidades con contexto
      if (messageText.toLowerCase().includes('listar')) {
        let listMessage = `📋 **Oportunidades con Análisis Inteligente:**\n\n`;
        
        for (const opp of allOpportunities.slice(0, 10)) {
          const context = getIntelligentContext(opp);
          const score = calculateHealthScore(opp.scales || {});
          
          listMessage += `**${opp.client}** - R$${opp.value.toLocaleString()}\n`;
          listMessage += `  Score: ${score.toFixed(1)}/10 | Fuente: ${context.dataSource}\n`;
          
          if (context.priority2_similarDeals.hasData) {
            listMessage += `  📊 ${context.priority2_similarDeals.count} deals similares encontrados\n`;
          }
          
          listMessage += '\n';
        }
        
        setMessages(prev => [...prev, { role: 'assistant', content: listMessage }]);
        setIsLoading(false);
        return;
      }

      // Mostrar deals similares
      if (messageText.toLowerCase().includes('similar')) {
        const activeOpp = assistantActiveOpportunity || currentOpportunity;
        if (activeOpp && similarDeals.length > 0) {
          let similarMessage = `📊 **Deals Similares a ${activeOpp.client}:**\n\n`;
          
          similarDeals.slice(0, 5).forEach((deal, idx) => {
            const score = calculateHealthScore(deal.scales || {});
            similarMessage += `${idx + 1}. **${deal.client}** - ${deal.product || 'N/A'}\n`;
            similarMessage += `   Valor: R$${deal.value.toLocaleString()} | Score: ${score.toFixed(1)}/10\n`;
            similarMessage += `   Etapa: ${deal.stage} | Vendedor: ${deal.vendor}\n`;
            
            if (deal.next_action) {
              similarMessage += `   Lección: "${deal.next_action}"\n`;
            }
            similarMessage += '\n';
          });
          
          similarMessage += `💡 **Insight:** Usa estas referencias en tu pitch con ${activeOpp.client}`;
          
          setMessages(prev => [...prev, { role: 'assistant', content: similarMessage }]);
          setIsLoading(false);
          return;
        }
      }

      // Preparar contexto completo para API
      const opportunityToAnalyze = searchedOpportunity || assistantActiveOpportunity || currentOpportunity;
      const intelligentContext = opportunityToAnalyze ? getIntelligentContext(opportunityToAnalyze) : null;
      
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          currentOpportunity: opportunityToAnalyze,
          intelligentContext,
          similarDeals: similarDeals.slice(0, 3),
          vendorName: currentUser,
          pipelineData: {
            allOpportunities,
            pipelineHealth
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      
      // Agregar indicador de fuente de datos
      let finalResponse = data.response;
      if (intelligentContext?.dataSource) {
        finalResponse += `\n\n📊 *Fuente: ${intelligentContext.dataSource}*`;
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: finalResponse
      }]);
      
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ Error procesando. Intente nuevamente.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

  return (
    <>
      {/* Panel de Análisis PPVVCC Mejorado */}
      {getActiveOpportunity() && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> 
              Diagnóstico: {getActiveOpportunity().client}
              {analysis.context?.dataSource && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {analysis.context.dataSource}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {similarDeals.length > 0 && (
                <button
                  onClick={() => sendMessage('mostrar deals similares')}
                  className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                >
                  📊 {similarDeals.length} Similares
                </button>
              )}
              <button
                onClick={() => setShowROI(!showROI)}
                className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200"
              >
                💰 ROI
              </button>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{analysis.probability}%</div>
                <div className="text-xs text-gray-600">Probabilidad</div>
              </div>
            </div>
          </div>

          {/* Mostrar contexto inteligente */}
          {analysis.context?.priority1_clientNotes?.hasData && (
            <div className="bg-yellow-50 border border-yellow-300 rounded p-2 mb-3 text-xs">
              <strong>📝 Lo que el cliente dijo:</strong>
              <ul className="ml-4 mt-1">
                {analysis.context.priority1_clientNotes.notes.map((note, idx) => (
                  <li key={idx}>• {note}</li>
                ))}
              </ul>
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
                  </div>
                );
              })}
            </div>
          )}

          {/* Inconsistencias con fuente de datos */}
          {analysis.inconsistencies?.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
              <h4 className="font-bold text-red-700 text-sm mb-2">
                <AlertTriangle className="inline mr-1 w-4 h-4" /> 
                PROBLEMAS DETECTADOS
              </h4>
              {analysis.inconsistencies.map((inc, idx) => (
                <div key={idx} className="mb-2 text-sm">
                  <div className="text-red-600">• {inc.message}</div>
                  {inc.dataSource && (
                    <div className="text-xs text-gray-600 ml-4">Fuente: {inc.dataSource}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Próxima acción con contexto */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border-2 border-blue-400">
              <h4 className="font-semibold text-sm mb-2 text-blue-700">
                <Zap className="inline mr-1 w-4 h-4" /> 
                Próxima Acción 
                {analysis.nextAction.dataSource && (
                  <span className="text-xs font-normal ml-2">
                    (basada en {analysis.nextAction.dataSource})
                  </span>
                )}
              </h4>
              <p className="text-sm font-bold mb-2">{analysis.nextAction.action}</p>
              <div className="bg-blue-50 p-2 rounded">
                <p className="text-xs italic">"{analysis.nextAction.script}"</p>
              </div>
              <button 
                onClick={() => {
                  setIsOpen(true);
                  sendMessage(`Desarrolla: ${analysis.nextAction.action} para ${getActiveOpportunity().client}`);
                }}
                className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
              >
                Ejecutar →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50"
      >
        <MessageCircle size={24} />
        {alerts.some(a => a.type === 'urgent') && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        )}
      </button>

      {/* Chat */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Asistente Inteligente Ventapel</h3>
              <button onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {assistantActiveOpportunity && (
              <div className="text-xs bg-white/20 rounded px-2 py-1 mt-2">
                🎯 {assistantActiveOpportunity.client} | 
                {similarDeals.length > 0 && ` ${similarDeals.length} similares`}
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
                  className="bg-white border-2 border-gray-300 rounded-lg px-3 py-2 text-xs hover:bg-blue-50 hover:border-blue-400 transition flex items-center gap-2"
                  disabled={isLoading}
                >
                  {action.icon}
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
                  👋 Hola {currentUser}!
                </p>
                <div className="text-xs text-gray-600">
                  <p className="mb-2">Trabajo con datos en este orden:</p>
                  <ol className="ml-4 space-y-1">
                    <li>1️⃣ Lo que el cliente YA DIJO (notas)</li>
                    <li>2️⃣ Deals similares en TU CRM</li>
                    <li>3️⃣ Casos de éxito Ventapel</li>
                    <li>4️⃣ Benchmarks Brasil (último recurso)</li>
                  </ol>
                  <p className="mt-3 font-semibold">
                    💡 Escribe el nombre del cliente para análisis inteligente
                  </p>
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
                placeholder="Nombre del cliente o pregunta..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
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
