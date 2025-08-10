export default AIAssistant;import React, { useState, useEffect } from 'react';
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
  const [historicalPatterns, setHistoricalPatterns] = useState(null);
  
  const [assistantActiveOpportunity, setAssistantActiveOpportunity] = useState(null);

  // Benchmarks de respaldo - SOLO si no hay datos en el CRM
  const fallbackBenchmarks = {
    averageLoss: 0.10,
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
    if (opportunityToAnalyze && allOpportunities.length > 0) {
      analyzeOpportunityWithContext(opportunityToAnalyze);
      checkOpportunityHealth(opportunityToAnalyze);
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
        extractHistoricalPatterns(data);
      }
    } catch (err) {
      console.error('Error loading pipeline:', err);
    }
  };

  // NUEVO: Extraer patrones de TUS datos históricos
  const extractHistoricalPatterns = (opportunities) => {
    const patterns = {
      byIndustry: {},
      byVendor: {},
      successfulDeals: [],
      averageCloseTime: 0,
      commonObjections: [],
      bestPractices: []
    };

    // Analizar deals cerrados exitosamente
    const closedWon = opportunities.filter(opp => opp.stage === 6);
    patterns.successfulDeals = closedWon;

    // Calcular tasas de pérdida REALES por industria basadas en TUS datos
    const industries = [...new Set(opportunities.map(o => o.industry).filter(Boolean))];
    
    industries.forEach(industry => {
      const industryOpps = opportunities.filter(o => o.industry === industry);
      const avgValue = industryOpps.reduce((sum, o) => sum + (o.value || 0), 0) / industryOpps.length;
      const avgHealthScore = industryOpps.reduce((sum, o) => sum + calculateHealthScore(o.scales || {}), 0) / industryOpps.length;
      
      // Buscar menciones de pérdidas en las notas
      const lossRates = [];
      industryOpps.forEach(opp => {
        if (opp.notes) {
          const match = opp.notes.match(/(\d+)%?\s*(?:de\s*)?(?:perd|loss|viola)/i);
          if (match) {
            lossRates.push(parseInt(match[1]) / 100);
          }
        }
      });
      
      patterns.byIndustry[industry] = {
        count: industryOpps.length,
        avgValue,
        avgHealthScore,
        actualLossRate: lossRates.length > 0 ? 
          lossRates.reduce((a, b) => a + b, 0) / lossRates.length : 
          null,
        closedWon: industryOpps.filter(o => o.stage === 6).length,
        winRate: industryOpps.filter(o => o.stage === 6).length / industryOpps.length
      };
    });

    // Analizar patrones por vendedor
    const vendors = [...new Set(opportunities.map(o => o.vendor).filter(Boolean))];
    vendors.forEach(vendor => {
      const vendorOpps = opportunities.filter(o => o.vendor === vendor);
      patterns.byVendor[vendor] = {
        totalDeals: vendorOpps.length,
        wonDeals: vendorOpps.filter(o => o.stage === 6).length,
        avgDealSize: vendorOpps.reduce((sum, o) => sum + (o.value || 0), 0) / vendorOpps.length,
        winRate: vendorOpps.filter(o => o.stage === 6).length / vendorOpps.length
      };
    });

    // Calcular tiempo promedio de cierre
    const closedDeals = opportunities.filter(o => o.stage === 6 && o.created_at && o.expected_close);
    if (closedDeals.length > 0) {
      const cycleTimes = closedDeals.map(o => {
        const created = new Date(o.created_at);
        const closed = new Date(o.expected_close);
        return Math.floor((closed - created) / (1000 * 60 * 60 * 24));
      });
      patterns.averageCloseTime = Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length);
    }

    // Extraer objeciones comunes de las notas
    const objectionKeywords = ['precio', 'caro', 'presupuesto', 'duda', 'competencia', '3M', 'no necesita'];
    opportunities.forEach(opp => {
      if (opp.notes) {
        objectionKeywords.forEach(keyword => {
          if (opp.notes.toLowerCase().includes(keyword)) {
            patterns.commonObjections.push({
              keyword,
              client: opp.client,
              resolution: opp.stage === 6 ? 'Superada' : 'Pendiente'
            });
          }
        });
      }
    });

    setHistoricalPatterns(patterns);
    return patterns;
  };

  const analyzePipelineHealth = (opportunities) => {
    const totalValue = opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
    
    const riskOpps = opportunities.filter(opp => {
      const avgScale = calculateHealthScore(opp.scales || {});
      return avgScale < 4 && opp.value > 50000;
    });

    // Usar datos REALES del CRM para calcular pérdidas
    const potentialLosses = opportunities.reduce((sum, opp) => {
      const loss = calculateRealPotentialLoss(opp, opportunities);
      return sum + loss.monthlyLoss;
    }, 0);

    setPipelineHealth({
      total: opportunities.length,
      totalValue,
      atRisk: riskOpps.length,
      riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0),
      potentialMonthlyLoss: Math.round(potentialLosses),
      averageLossRate: potentialLosses / totalValue
    });
  };

  const getScaleValue = (scale) => {
    if (!scale && scale !== 0) return 0;
    
    if (typeof scale === 'number') {
      return scale;
    }
    
    if (typeof scale === 'object' && scale !== null) {
      if ('score' in scale) {
        return Number(scale.score) || 0;
      }
      if ('value' in scale) {
        return Number(scale.value) || 0;
      }
    }
    
    if (typeof scale === 'string') {
      const parsed = Number(scale);
      return isNaN(parsed) ? 0 : parsed;
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

  // NUEVO: Análisis con contexto completo del CRM
  const analyzeOpportunityWithContext = (opp) => {
    if (!opp) return;

    const scaleValues = {
      pain: getScaleValue(opp.scales?.dor || opp.scales?.pain),
      power: getScaleValue(opp.scales?.poder || opp.scales?.power),
      vision: getScaleValue(opp.scales?.visao || opp.scales?.vision),
      value: getScaleValue(opp.scales?.valor || opp.scales?.value),
      control: getScaleValue(opp.scales?.controle || opp.scales?.control),
      purchase: getScaleValue(opp.scales?.compras || opp.scales?.purchase)
    };
    
    const avgScale = calculateHealthScore(opp.scales || {});
    
    const inconsistencies = [];
    
    // Verificar inconsistencias considerando el contexto COMPLETO
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      // Pero verificar si en las notas ya admitió el dolor
      const admittedPainInNotes = opp.notes && 
        (opp.notes.toLowerCase().includes('admitió') || 
         opp.notes.toLowerCase().includes('reconoce') ||
         opp.notes.toLowerCase().includes('problema'));
      
      if (!admittedPainInNotes) {
        inconsistencies.push({
          type: 'critical',
          message: '🔴 INCONSISTÊNCIA GRAVE: Apresentando sem DOR confirmada! Cliente não vai comprar.',
          action: 'Voltar para qualificação URGENTE',
          dataPoint: opp.notes ? 'Revisar notas: pode ter pistas do problema real' : 'Descobrir o problema real do cliente'
        });
      }
    }
    
    // Verificar acceso a poder considerando los contactos
    if (opp.value > 100000 && scaleValues.power < 4) {
      const hasPowerContact = opp.power_sponsor || opp.sponsor;
      
      if (!hasPowerContact) {
        inconsistencies.push({
          type: 'critical',
          message: `⛔ PROBLEMA: R$${opp.value.toLocaleString()} sem contato decisor registrado.`,
          action: `Conseguir acesso ao POWER hoje`,
          dataPoint: 'Sem Power Sponsor ou Sponsor no CRM - CRÍTICO!'
        });
      } else {
        inconsistencies.push({
          type: 'warning',
          message: `⚠️ Tem contato (${hasPowerContact}) mas PODER baixo (${scaleValues.power}/10)`,
          action: `Validar se ${hasPowerContact} realmente decide`,
          dataPoint: 'Pode ser o contato errado - verificar hierarquia'
        });
      }
    }
    
    // Verificar próxima ação registrada
    if (!opp.next_action || opp.next_action.trim() === '') {
      inconsistencies.push({
        type: 'warning',
        message: '📝 Sem próxima ação definida no CRM',
        action: 'Definir próximo passo ESPECÍFICO com data',
        dataPoint: 'Deals sem próxima ação têm 70% mais chance de morrer'
      });
    }
    
    // Calcular probabilidad usando datos históricos
    let probability = calculateRealProbability(opp, scaleValues);

    // Análise de tempo no pipeline
    const daysInPipeline = opp.created_at ? 
      Math.floor((new Date() - new Date(opp.created_at)) / (1000 * 60 * 60 * 24)) : 0;
    
    const avgCloseTime = historicalPatterns?.averageCloseTime || 45;
    
    if (daysInPipeline > avgCloseTime * 1.5 && opp.stage < 5) {
      inconsistencies.push({
        type: 'warning',
        message: `🐌 ${daysInPipeline} dias no pipeline (média: ${avgCloseTime} dias)`,
        action: 'Criar urgência ou desqualificar',
        dataPoint: historicalPatterns?.byIndustry[opp.industry]?.winRate ? 
          `Taxa de ganho em ${opp.industry}: ${(historicalPatterns.byIndustry[opp.industry].winRate * 100).toFixed(0)}%` :
          'Deal estagnado - precisa de ação decisiva'
      });
    }

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability,
      scaleValues,
      inconsistencies,
      nextAction: generateContextualNextAction(opp, scaleValues, inconsistencies),
      potentialLoss: calculateRealPotentialLoss(opp, allOpportunities),
      contacts: {
        powerSponsor: opp.power_sponsor,
        sponsor: opp.sponsor,
        influencer: opp.influencer,
        support: opp.support_contact
      },
      timeline: {
        daysInPipeline,
        expectedClose: opp.expected_close,
        lastUpdate: opp.last_update,
        nextAction: opp.next_action
      }
    });
  };

  // NUEVO: Calcular probabilidad basada en datos históricos
  const calculateRealProbability = (opp, scaleValues) => {
    let probability = 0;
    
    // Base probability from scales
    if (scaleValues.pain >= 7 && scaleValues.power >= 6 && scaleValues.value >= 6) {
      probability = 75;
    } else if (scaleValues.pain >= 5 && scaleValues.power >= 4 && scaleValues.value >= 4) {
      probability = 40;
    } else if (scaleValues.pain >= 3) {
      probability = 15;
    } else {
      probability = 5;
    }
    
    // Ajustar basado en patrones históricos
    if (historicalPatterns && opp.industry) {
      const industryData = historicalPatterns.byIndustry[opp.industry];
      if (industryData && industryData.winRate) {
        // Ponderar con la tasa de éxito real de la industria
        probability = (probability * 0.7) + (industryData.winRate * 100 * 0.3);
      }
    }
    
    // Ajustar por vendedor
    if (historicalPatterns && opp.vendor) {
      const vendorData = historicalPatterns.byVendor[opp.vendor];
      if (vendorData && vendorData.winRate) {
        // Si el vendedor tiene buen track record, aumentar probabilidad
        if (vendorData.winRate > 0.5) {
          probability = Math.min(probability * 1.2, 95);
        } else if (vendorData.winRate < 0.3) {
          probability = probability * 0.8;
        }
      }
    }
    
    // Penalizar si no hay próxima acción
    if (!opp.next_action) {
      probability = probability * 0.7;
    }
    
    // Boost si tiene todos los contactos mapeados
    if (opp.power_sponsor && opp.sponsor && opp.influencer) {
      probability = Math.min(probability * 1.15, 95);
    }
    
    return Math.round(probability);
  };

  // NUEVO: Calcular pérdida potencial con datos REALES
  const calculateRealPotentialLoss = (opp, allOpps = allOpportunities) => {
    // Prioridad 1: Buscar en las notas del cliente actual
    if (opp.notes) {
      const lossMatch = opp.notes.match(/(\d+)%?\s*(?:de\s*)?(?:perd|loss|viola|furto|dano|avaria)/i);
      if (lossMatch) {
        const actualLossRate = parseInt(lossMatch[1]) / 100;
        const monthlyVolume = Math.round(opp.value / 100);
        const monthlyLoss = Math.round(monthlyVolume * actualLossRate * 35);
        return {
          monthlyLoss,
          annualLoss: monthlyLoss * 12,
          lossRate: (actualLossRate * 100).toFixed(1),
          source: 'Dados admitidos pelo cliente',
          confidence: 'ALTA'
        };
      }
    }
    
    // Prioridad 2: Usar datos de deals similares en TU CRM
    if (historicalPatterns && opp.industry) {
      const industryData = historicalPatterns.byIndustry[opp.industry];
      if (industryData && industryData.actualLossRate) {
        const monthlyVolume = Math.round(opp.value / 100);
        const monthlyLoss = Math.round(monthlyVolume * industryData.actualLossRate * 35);
        return {
          monthlyLoss,
          annualLoss: monthlyLoss * 12,
          lossRate: (industryData.actualLossRate * 100).toFixed(1),
          source: `Média de ${industryData.count} clientes em ${opp.industry}`,
          confidence: 'MÉDIA-ALTA'
        };
      }
    }
    
    // Prioridad 3: Buscar cliente similar exitoso
    const similarSuccessful = allOpps.find(o => 
      o.industry === opp.industry && 
      o.stage === 6 && 
      o.notes && 
      o.notes.includes('%')
    );
    
    if (similarSuccessful) {
      const match = similarSuccessful.notes.match(/(\d+)%?\s*(?:de\s*)?(?:perd|loss|viola)/i);
      if (match) {
        const similarLossRate = parseInt(match[1]) / 100;
        const monthlyVolume = Math.round(opp.value / 100);
        const monthlyLoss = Math.round(monthlyVolume * similarLossRate * 35);
        return {
          monthlyLoss,
          annualLoss: monthlyLoss * 12,
          lossRate: (similarLossRate * 100).toFixed(1),
          source: `Caso similar: ${similarSuccessful.client}`,
          confidence: 'MÉDIA'
        };
      }
    }
    
    // Prioridad 4: Último recurso - benchmarks de Brasil
    const industry = opp.industry?.toLowerCase() || 'default';
    const fallbackRate = fallbackBenchmarks.industries[industry]?.rate || fallbackBenchmarks.averageLoss;
    const monthlyVolume = Math.round(opp.value / 100);
    const monthlyLoss = Math.round(monthlyVolume * fallbackRate * 35);
    
    return {
      monthlyLoss,
      annualLoss: monthlyLoss * 12,
      lossRate: (fallbackRate * 100).toFixed(1),
      source: fallbackBenchmarks.industries[industry]?.source || 'IBEVAR - média Brasil',
      confidence: 'BAIXA - Usar dados reais do cliente'
    };
  };

  // NUEVO: Generar próxima acción basada en contexto completo
  const generateContextualNextAction = (opp, scaleValues, inconsistencies) => {
    // Si hay inconsistencias críticas, abordarlas primero
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: `AÇÃO IMEDIATA: ${inconsistencies[0].message}`,
        dataPoint: inconsistencies[0].dataPoint,
        contact: opp.power_sponsor || opp.sponsor || 'Identificar contato correto'
      };
    }
    
    // Si ya hay una próxima acción definida, reforzarla
    if (opp.next_action && opp.next_action.trim() !== '') {
      return {
        action: `📋 Executar: ${opp.next_action}`,
        script: `Ação já definida no CRM - executar HOJE`,
        dataPoint: `Último contato: ${opp.last_update ? new Date(opp.last_update).toLocaleDateString('pt-BR') : 'Desconhecido'}`,
        contact: opp.power_sponsor || opp.sponsor || opp.influencer
      };
    }
    
    // Generar acción basada en la escala más baja y contexto
    const lowestScale = Object.entries(scaleValues).reduce((min, [key, value]) => 
      value < min.value ? {key, value} : min, 
      {key: 'pain', value: scaleValues.pain}
    );
    
    const actions = {
      pain: {
        action: "🎯 Fazer cliente ADMITIR o problema específico",
        script: opp.notes && opp.notes.includes('%') ? 
          `Já sabemos que perdem ${opp.notes.match(/(\d+)%/)?.[1]}%. Precisam confirmar o impacto em R$` :
          `Pergunta: 'Vi que ${opp.industry || 'empresas similares'} perdem até ${historicalPatterns?.byIndustry[opp.industry]?.actualLossRate ? 
            (historicalPatterns.byIndustry[opp.industry].actualLossRate * 100).toFixed(0) : '10'}%. Quanto isso representa para vocês?'`,
        dataPoint: historicalPatterns?.byIndustry[opp.industry]?.count > 0 ?
          `Temos ${historicalPatterns.byIndustry[opp.industry].count} clientes em ${opp.industry}` :
          "Descobrir taxa real de perda",
        contact: opp.influencer || opp.sponsor || 'Operacional que sofre com o problema'
      },
      power: {
        action: "👔 Mapear e acessar o VERDADEIRO decisor",
        script: opp.power_sponsor ? 
          `Validar se ${opp.power_sponsor} tem orçamento para R$${Math.round(opp.value * 0.3).toLocaleString()}` :
          `Script: 'Para um investimento de R$${Math.round(opp.value * 0.3).toLocaleString()}, quem aprova?'`,
        dataPoint: opp.sponsor ? `Sponsor atual: ${opp.sponsor}` : "Mapear hierarquia completa",
        contact: opp.sponsor || 'Pedir indicação ao contato atual'
      },
      vision: {
        action: "🎬 Demo com caso ESPECÍFICO do setor",
        script: historicalPatterns?.successfulDeals?.find(d => d.industry === opp.industry) ?
          `Mostrar caso ${historicalPatterns.successfulDeals.find(d => d.industry === opp.industry).client}` :
          `Mostrar: 'L'Oréal eliminou 100% dos furtos. Posso mostrar como aplicar isso em ${opp.client}?'`,
        dataPoint: historicalPatterns?.byIndustry[opp.industry]?.closedWon > 0 ?
          `${historicalPatterns.byIndustry[opp.industry].closedWon} casos de sucesso em ${opp.industry}` :
          "Preparar demo personalizada",
        contact: opp.power_sponsor || opp.sponsor || 'Decisor + equipe técnica'
      },
      value: {
        action: "💰 Calcular ROI com números REAIS do cliente",
        script: `ROI específico: investimento R$${Math.round(opp.value * 0.3).toLocaleString()}, retorno em ${
          historicalPatterns?.averageCloseTime ? Math.round(historicalPatterns.averageCloseTime / 30) : 3} meses`,
        dataPoint: `Perda atual estimada: R$${calculateRealPotentialLoss(opp).monthlyLoss.toLocaleString()}/mês`,
        contact: opp.power_sponsor || 'CFO/Financeiro'
      },
      control: {
        action: "📅 Criar plano de implementação com DATAS",
        script: `Próximos passos: 1) ${opp.next_action || 'Teste piloto'} até ${
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}`,
        dataPoint: opp.expected_close ? 
          `Data esperada: ${new Date(opp.expected_close).toLocaleDateString('pt-BR')}` : 
          "Definir timeline com cliente",
        contact: opp.power_sponsor || opp.sponsor
      },
      purchase: {
        action: "📝 Mapear processo de compras completo",
        script: `Perguntas: Quem assina? Precisa licitação? Qual verba? Quando fecha o budget?`,
        dataPoint: opp.industry ? 
          `Processo típico em ${opp.industry}: ${historicalPatterns?.averageCloseTime || 45} dias` :
          "Entender burocracia interna",
        contact: 'Departamento de Compras + ' + (opp.power_sponsor || 'Sponsor')
      }
    };
    
    return actions[lowestScale.key] || actions.pain;
  };

  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    // Alertas baseados em último contato
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      
      if (daysSince > 7) {
        const potentialLoss = calculateRealPotentialLoss(opp);
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} dias sem contato - VAI PERDER! Perdendo R$${potentialLoss.monthlyLoss.toLocaleString()}/mês`,
          action: 'reactivate',
          contact: opp.power_sponsor || opp.sponsor || opp.influencer || 'Qualquer contato'
        });
      } else if (daysSince > 3) {
        newAlerts.push({
          type: 'warning',
          message: `⚠️ ${daysSince} dias sem follow-up. Cliente esfriando.`,
          action: 'followup',
          contact: opp.sponsor || opp.influencer
        });
      }
    }

    // Alertas baseados em valor e saúde
    const avgScale = calculateHealthScore(opp.scales || {});
    if (avgScale < 4 && opp.value > 100000) {
      const loss = calculateRealPotentialLoss(opp);
      newAlerts.push({
        type: 'critical',
        message: `💣 R$${opp.value.toLocaleString()} em RISCO ALTO! Score: ${avgScale.toFixed(1)}/10`,
        action: 'rescue',
        dataPoint: `Perda potencial: ${loss.lossRate}% (${loss.source})`,
        contact: opp.power_sponsor || 'Escalar para decisor URGENTE'
      });
    }

    // Alerta de ciclo de vendas
    if (opp.created_at && historicalPatterns) {
      const daysInPipeline = Math.floor((new Date() - new Date(opp.created_at)) / (1000 * 60 * 60 * 24));
      const avgCycle = historicalPatterns.averageCloseTime || 45;
      
      if (daysInPipeline > avgCycle * 2 && opp.stage < 5) {
        newAlerts.push({
          type: 'warning',
          message: `🐌 ${daysInPipeline} dias no pipeline (média: ${avgCycle} dias). Deal apodrecendo.`,
          action: 'urgency',
          dataPoint: historicalPatterns.byVendor[opp.vendor]?.avgDealSize ?
            `Média do vendedor: R$${historicalPatterns.byVendor[opp.vendor].avgDealSize.toLocaleString()}` :
            'Criar urgência ou desqualificar'
        });
      }
    }

    // Alerta de falta de informação crítica
    if (!opp.power_sponsor && opp.value > 50000) {
      newAlerts.push({
        type: 'critical',
        message: `❌ Deal de R$${opp.value.toLocaleString()} SEM Power Sponsor mapeado!`,
        action: 'identify_power',
        contact: 'URGENTE: Identificar quem aprova orçamento'
      });
    }

    if (!opp.next_action) {
      newAlerts.push({
        type: 'warning',
        message: `📝 Sem próxima ação definida - deal vai morrer`,
        action: 'define_next',
        contact: opp.vendor || currentUser
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
    
    const actions = [];
    
    // Prioridad 1: Si hay próxima acción definida
    if (activeOpp.next_action && activeOpp.next_action.trim() !== '') {
      actions.push({ 
        icon: <Zap size={18} />, 
        label: 'Executar Próxima', 
        prompt: `Como executar: "${activeOpp.next_action}" para ${activeOpp.client}?` 
      });
    }
    
    // Prioridad 2: ROI Calculator con datos reales
    actions.push({ 
      icon: <DollarSign size={18} />, 
      label: 'ROI Real', 
      prompt: `Calcular ROI específico para ${activeOpp.client} usando dados reais do CRM` 
    });
    
    // Prioridad 3: Basado en alertas
    if (alerts.length > 0) {
      const urgentAlert = alerts.find(a => a.type === 'urgent');
      if (urgentAlert) {
        actions.push({ 
          icon: <AlertTriangle size={18} />, 
          label: 'Resolver Urgente', 
          prompt: `${urgentAlert.message} - Como resolver para ${activeOpp.client}?` 
        });
      }
    }

    // Prioridad 4: Basado en contactos faltantes
    if (!activeOpp.power_sponsor) {
      actions.push({ 
        icon: <Target size={18} />, 
        label: 'Mapear Power', 
        prompt: `Como identificar o Power Sponsor em ${activeOpp.client}? ${activeOpp.sponsor ? `Temos ${activeOpp.sponsor} como sponsor` : ''}` 
      });
    }
    
    // Completar con análisis de contexto
    if (actions.length < 4 && analysis?.inconsistencies?.length > 0) {
      actions.push({ 
        icon: <RefreshCw size={18} />, 
        label: 'Corrigir PPVVCC', 
        prompt: `PROBLEMA: ${analysis.inconsistencies[0].message}. Como corrijo?` 
      });
    }
    
    // Si faltan acciones, agregar opción de cambiar cliente
    if (actions.length < 4) {
      actions.push({ 
        icon: <Globe size={18} />, 
        label: 'Outro Cliente', 
        prompt: 'Listar todas as oportunidades com análise contextual' 
      });
    }
    
    return actions.slice(0, 4);
  };

  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

  const handleActionClick = async (actionPayload) => {
    console.log('🔵 handleActionClick llamado con:', actionPayload);
    
    if (!actionPayload) {
      console.log('❌ No hay actionPayload');
      return;
    }

    const [action, ...params] = actionPayload.split(':');
    console.log('📝 Action:', action, 'Params:', params);

    if (action === 'cancel') {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ação cancelada.' }]);
      return;
    }

    if (action === 'update' && params.length >= 2) {
      const [scale, newValue, oppId] = params;
      console.log('🎯 Intentando actualizar:', { scale, newValue, oppId });
      
      const opportunityToUpdateId = oppId || getActiveOpportunity()?.id;
      console.log('📌 ID de oportunidad a actualizar:', opportunityToUpdateId);
      
      if (!opportunityToUpdateId) {
        console.log('❌ No hay ID de oportunidad');
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '❌ Erro: Não há oportunidade selecionada para atualizar.' 
        }]);
        return;
      }

      const valueInt = parseInt(newValue);
      console.log('🔢 Valor parseado:', valueInt);
      
      if (isNaN(valueInt) || valueInt < 0 || valueInt > 10) {
        console.log('❌ Valor inválido:', newValue);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Erro: O valor deve estar entre 0 e 10. Você tentou: ${newValue}` 
        }]);
        return;
      }

      setIsLoading(true);
      
      try {
        console.log('📡 Buscando oportunidad actual...');
        
        const { data: currentOpp, error: fetchError } = await supabase
          .from('opportunities')
          .select('*')
          .eq('id', opportunityToUpdateId)
          .single();

        if (fetchError || !currentOpp) {
          console.error('Error fetch:', fetchError);
          throw new Error('Oportunidade não encontrada');
        }
        
        console.log('📊 Oportunidad actual:', currentOpp);
        console.log('🔍 Escalas actuales:', currentOpp.scales);
        
        const normalizeScales = (scales) => {
          if (!scales) return {};
          
          if (typeof scales === 'object' && !Array.isArray(scales)) {
            const normalized = {};
            
            ['dor', 'pain', 'poder', 'power', 'visao', 'vision', 'valor', 'value', 'controle', 'control', 'compras', 'purchase'].forEach(key => {
              if (scales[key] !== undefined) {
                if (typeof scales[key] === 'object' && scales[key] !== null) {
                  normalized[key] = Number(scales[key].score || scales[key].value || 0);
                } else {
                  normalized[key] = Number(scales[key]) || 0;
                }
              }
            });
            
            return normalized;
          }
          
          if (typeof scales === 'string') {
            try {
              return normalizeScales(JSON.parse(scales));
            } catch (e) {
              console.error('Error parseando scales string:', e);
              return {};
            }
          }
          
          return {};
        };
        
        const currentScales = normalizeScales(currentOpp.scales);
        console.log('📋 Escalas normalizadas:', currentScales);
        
        const scaleMapping = {
          'dor': 'dor',
          'pain': 'dor',
          'poder': 'poder',
          'power': 'poder',
          'visao': 'visao',
          'vision': 'visao',
          'valor': 'valor',
          'value': 'valor',
          'controle': 'controle',
          'control': 'controle',
          'compras': 'compras',
          'purchase': 'compras'
        };

        const mappedScale = scaleMapping[scale.toLowerCase()] || scale.toLowerCase();
        console.log('🎯 Escala mapeada:', scale, '->', mappedScale);
        
        const updatedScales = {
          dor: currentScales.dor || currentScales.pain || 0,
          poder: currentScales.poder || currentScales.power || 0,
          visao: currentScales.visao || currentScales.vision || 0,
          valor: currentScales.valor || currentScales.value || 0,
          controle: currentScales.controle || currentScales.control || 0,
          compras: currentScales.compras || currentScales.purchase || 0
        };
        
        const oldValue = updatedScales[mappedScale];
        updatedScales[mappedScale] = valueInt;
        
        console.log('✅ Escalas actualizadas:', updatedScales);
        console.log('📤 Enviando actualización a Supabase...');
        
        let updateResult = await supabase
          .from('opportunities')
          .update({
            scales: updatedScales,
            last_update: new Date().toISOString()
          })
          .eq('id', opportunityToUpdateId)
          .select()
          .single();

        console.log('✅ Resultado intento 1 (simple):', updateResult);

        if (updateResult.error) {
          console.log('🔄 Intentando con estructura compleja...');
          
          const complexScales = {};
          Object.keys(updatedScales).forEach(key => {
            complexScales[key] = {
              score: updatedScales[key],
              description: ''
            };
          });
          
          updateResult = await supabase
            .from('opportunities')
            .update({
              scales: complexScales,
              last_update: new Date().toISOString()
            })
            .eq('id', opportunityToUpdateId)
            .select()
            .single();
            
          console.log('✅ Resultado intento 2 (complejo):', updateResult);
        }
        
        if (updateResult.error) {
          throw updateResult.error;
        }
        
        const scaleNameMap = {
          'dor': 'DOR (Pain)',
          'poder': 'PODER (Power)',
          'visao': 'VISÃO (Vision)',
          'valor': 'VALOR (Value)',
          'controle': 'CONTROLE (Control)',
          'compras': 'COMPRAS (Purchase)'
        };
        
        // Mensaje contextual basado en datos reales
        let contextMessage = '';
        if (mappedScale === 'dor' && valueInt >= 7) {
          const loss = calculateRealPotentialLoss(currentOpp);
          contextMessage = `💡 Cliente admite perda de ${loss.lossRate}% (${loss.source})`;
        } else if (mappedScale === 'poder' && valueInt >= 6) {
          contextMessage = `💡 Acesso confirmado: ${currentOpp.power_sponsor || 'Registrar Power Sponsor no CRM'}`;
        } else if (mappedScale === 'valor' && valueInt >= 6) {
          const loss = calculateRealPotentialLoss(currentOpp);
          contextMessage = `💡 ROI validado: R$${loss.monthlyLoss.toLocaleString()}/mês de economia`;
        }
        
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ **Atualização confirmada!**

**${currentOpp.client}**
**${scaleNameMap[mappedScale] || mappedScale.toUpperCase()}: ${oldValue} → ${valueInt}/10**

${contextMessage}

${valueInt >= 7 ? '🎯 Excelente! Avançar para próxima etapa.' : 
  valueInt >= 4 ? '⚠️ Melhorar antes de avançar.' :
  '🔴 CRÍTICO! Ação urgente com ' + (currentOpp.power_sponsor || currentOpp.sponsor || 'decisor')}` 
        }]);
        
        const updatedOpp = updateResult.data;
        
        if (assistantActiveOpportunity?.id === opportunityToUpdateId) {
          setAssistantActiveOpportunity(updatedOpp);
        }
        
        if (onOpportunityUpdate && typeof onOpportunityUpdate === 'function') {
          onOpportunityUpdate(updatedOpp);
        }
        
        await loadPipelineData();
        analyzeOpportunityWithContext(updatedOpp);
        checkOpportunityHealth(updatedOpp);
        
      } catch (error) {
        console.error('💥 Error completo:', error);
        
        let errorMessage = '❌ **Falha ao atualizar no CRM**\n\n';
        
        if (error.message) {
          errorMessage += `Erro: ${error.message}\n`;
        }
        
        if (error.code === '22P02') {
          errorMessage += '\n⚠️ Problema com formato de dados. Contacte suporte.';
        } else if (error.code === '42703') {
          errorMessage += '\n⚠️ Campo não encontrado na base de dados.';
        } else {
          errorMessage += '\n💡 Tente novamente ou verifique a conexão.';
        }
        
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: errorMessage 
        }]);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (action === 'schedule' && params[0] === 'meeting') {
      const opp = getActiveOpportunity();
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `📅 **Agendar reunião com ${opp?.power_sponsor || opp?.sponsor || 'contato'}**
        
Email sugerido: "${opp?.client}, descobrimos que empresas como vocês perdem ${calculateRealPotentialLoss(opp).lossRate}% em violação. Podemos mostrar como eliminamos isso em 15 minutos?"` 
      }]);
    }
    
    if (action === 'demo' && params[0] === 'loreal') {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `🎬 **Demo L'Oréal - Script Personalizado:**

"${getActiveOpportunity()?.client}, vou mostrar exatamente como a L'Oréal..."

**Resultados L'Oréal:**
• Furtos: 10% → 0% ELIMINADO
• Eficiência: +50% em velocidade
• ROI: 3 meses comprovado
• Capacidade: 12 caixas/minuto

**Para vocês significa:**
• Economia: R$${calculateRealPotentialLoss(getActiveOpportunity()).monthlyLoss.toLocaleString()}/mês
• ROI estimado: ${Math.round(getActiveOpportunity()?.value * 0.3 / calculateRealPotentialLoss(getActiveOpportunity()).monthlyLoss)} meses` 
      }]);
    }
  };

  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    if (messageText === 'plan_semanal') {
      const userMessage = { role: 'user', content: "Me dê meu plano para a semana com dados reais do CRM" };
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
              vendorName: currentUser,
              historicalPatterns: historicalPatterns
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
          analyzeOpportunityWithContext(searchedOpportunity);
          checkOpportunityHealth(searchedOpportunity);
        }
      }
      
      if (messageText.toLowerCase().includes('listar') || messageText.toLowerCase().includes('todas')) {
        const listMessage = `📋 **Suas Oportunidades no CRM (com dados REAIS):**\n\n` +
          allOpportunities.map((opp, idx) => {
            const loss = calculateRealPotentialLoss(opp);
            const health = calculateHealthScore(opp.scales || {});
            const hasContacts = opp.power_sponsor || opp.sponsor;
            const hasNextAction = opp.next_action && opp.next_action.trim() !== '';
            
            return `${idx + 1}. **${opp.client}** - R$ ${opp.value.toLocaleString('pt-BR')}
   📊 Saúde: ${health.toFixed(1)}/10 | Stage: ${opp.stage}/6
   💰 Perda: R$${loss.monthlyLoss.toLocaleString()}/mês (${loss.lossRate}% - ${loss.confidence})
   👤 Contatos: ${hasContacts ? '✅' : '❌ FALTA'} | Próxima ação: ${hasNextAction ? '✅' : '❌ FALTA'}
   ${opp.notes ? `📝 "${opp.notes.substring(0, 50)}..."` : ''}`;
          }).join('\n\n') +
          `\n\n💡 **Resumo Pipeline:**
   • Total: R$${pipelineHealth?.totalValue.toLocaleString('pt-BR')}
   • Em risco: R$${pipelineHealth?.riskValue.toLocaleString('pt-BR')}
   • Perda potencial/mês: R$${pipelineHealth?.potentialMonthlyLoss.toLocaleString()}
   
   Digite o nome do cliente para análise completa com contexto.`;
        
        setMessages(prev => [...prev, { role: 'assistant', content: listMessage }]);
        setIsLoading(false);
        return;
      }

      // Preparar contexto COMPLETO con datos del CRM
      const ventapelContext = {
        produtos: {
          maquinas: "Better Packages BP555e, BP755, BP222 Curby, Random Sealer Automated (RSA)",
          fitas: "VENOM (3-way reinforced, water-activated), Gorilla (300m e 700m)",
          solucao: "Sistema completo de fechamento: máquina + fita + suporte técnico",
          diferencial: "Redução de até 95% nas violações, ROI em 2-3 meses"
        },
        historicalData: historicalPatterns,
        pipelineContext: {
          totalOpportunities: allOpportunities.length,
          totalValue: pipelineHealth?.totalValue,
          atRisk: pipelineHealth?.atRisk,
          averageHealthScore: allOpportunities.reduce((sum, o) => sum + calculateHealthScore(o.scales || {}), 0) / allOpportunities.length
        },
        casos_sucesso_internos: historicalPatterns?.successfulDeals?.slice(0, 5).map(d => ({
          client: d.client,
          industry: d.industry,
          value: d.value,
          contacts: `${d.power_sponsor || 'N/A'} (Power), ${d.sponsor || 'N/A'} (Sponsor)`
        })) || [],
        metodologia: "PPVVCC - Pain, Power, Vision, Value, Control, Compras - ADAPTADO ao CRM"
      };

      const opportunityToAnalyze = searchedOpportunity || assistantActiveOpportunity || currentOpportunity;
      
      const opportunityContext = opportunityToAnalyze ? {
        ...opportunityToAnalyze,
        scales_normalized: {
          pain: getScaleValue(opportunityToAnalyze.scales?.dor || opportunityToAnalyze.scales?.pain),
          power: getScaleValue(opportunityToAnalyze.scales?.poder || opportunityToAnalyze.scales?.power),
          vision: getScaleValue(opportunityToAnalyze.scales?.visao || opportunityToAnalyze.scales?.vision),
          value: getScaleValue(opportunityToAnalyze.scales?.valor || opportunityToAnalyze.scales?.value),
          control: getScaleValue(opportunityToAnalyze.scales?.controle || opportunityToAnalyze.scales?.control),
          purchase: getScaleValue(opportunityToAnalyze.scales?.compras || opportunityToAnalyze.scales?.purchase)
        },
        diagnostico_completo: analysis,
        potentialLoss: calculateRealPotentialLoss(opportunityToAnalyze),
        contacts_mapped: {
          power_sponsor: opportunityToAnalyze.power_sponsor || 'NÃO MAPEADO',
          sponsor: opportunityToAnalyze.sponsor || 'NÃO MAPEADO',
          influencer: opportunityToAnalyze.influencer || 'NÃO MAPEADO',
          support: opportunityToAnalyze.support_contact || 'NÃO MAPEADO'
        },
        timeline: {
          days_in_pipeline: opportunityToAnalyze.created_at ? 
            Math.floor((new Date() - new Date(opportunityToAnalyze.created_at)) / (1000 * 60 * 60 * 24)) : 0,
          expected_close: opportunityToAnalyze.expected_close,
          last_contact: opportunityToAnalyze.last_update,
          next_action: opportunityToAnalyze.next_action || 'NÃO DEFINIDA'
        },
        notes_context: opportunityToAnalyze.notes || 'Sem notas registradas',
        similar_deals: allOpportunities.filter(o => 
          o.industry === opportunityToAnalyze.industry && 
          o.id !== opportunityToAnalyze.id
        ).slice(0, 3)
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
            vendorName: currentUser,
            historicalPatterns: historicalPatterns
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
      {/* Panel de Análisis PPVVCC CONTEXTUAL en el CRM */}
      {getActiveOpportunity() && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> Diagnóstico Contextual: {getActiveOpportunity().client}
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
                💰 ROI Real
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
                <div className="text-xs text-gray-600">Probabilidade ajustada</div>
              </div>
            </div>
          </div>

          {/* ROI Calculator com dados REAIS */}
          {showROI && analysis.potentialLoss && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-3">
              <h4 className="font-bold text-green-700 text-sm mb-2">
                💰 Análise ROI - {analysis.potentialLoss.confidence}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600">Fonte dados:</span>
                  <span className="font-bold text-blue-600 ml-1">{analysis.potentialLoss.source}</span>
                </div>
                <div>
                  <span className="text-gray-600">Taxa violação:</span>
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
                <div className="col-span-2 mt-2 p-2 bg-yellow-50 rounded">
                  <span className="text-gray-700 text-xs">
                    Confiança: <strong>{analysis.potentialLoss.confidence}</strong>
                    {analysis.potentialLoss.confidence === 'BAIXA - Usar dados reais do cliente' && 
                      ' - Perguntar taxa real ao cliente!'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => sendMessage(`Calcular ROI completo para ${getActiveOpportunity().client} usando todos os dados do CRM`)}
                className="mt-2 bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 w-full"
              >
                Ver Análise Completa com Contexto
              </button>
            </div>
          )}

          {/* Info de Contatos e Timeline */}
          {analysis.contacts && (
            <div className="bg-white/50 p-2 rounded mb-3 text-xs grid grid-cols-2 gap-2">
              <div>
                <span className="font-semibold">Contatos Mapeados:</span>
                <div className="ml-2">
                  Power: {analysis.contacts.powerSponsor || '❌ FALTA'}
                  {analysis.contacts.sponsor && <div>Sponsor: {analysis.contacts.sponsor}</div>}
                  {analysis.contacts.influencer && <div>Influencer: {analysis.contacts.influencer}</div>}
                </div>
              </div>
              <div>
                <span className="font-semibold">Timeline:</span>
                <div className="ml-2">
                  Dias no pipeline: {analysis.timeline?.daysInPipeline || 0}
                  {analysis.timeline?.expectedClose && <div>Fechar: {new Date(analysis.timeline.expectedClose).toLocaleDateString('pt-BR')}</div>}
                  {analysis.timeline?.nextAction && <div className="text-green-700 font-bold">📋 {analysis.timeline.nextAction}</div>}
                </div>
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

          {/* Próxima Acción CONTEXTUAL con contacto específico */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border-2 border-blue-400">
              <h4 className="font-semibold text-sm mb-2 flex items-center text-blue-700">
                <TrendingUp className="mr-1 w-4 h-4" /> Próxima Ação Recomendada:
              </h4>
              <p className="text-sm font-bold text-gray-800 mb-2">{analysis.nextAction.action}</p>
              {analysis.nextAction.contact && (
                <p className="text-xs text-gray-600 mb-2">
                  👤 Contactar: <strong>{analysis.nextAction.contact}</strong>
                </p>
              )}
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
                  sendMessage(`Desenvolva esta ação: ${analysis.nextAction.action} para ${getActiveOpportunity().client} com ${analysis.nextAction.contact || 'contato apropriado'}`);
                }}
                className="mt-2 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition font-semibold"
              >
                Executar com Contexto →
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
                Vendedor: {currentUser} • Dados reais CRM
              </div>
            )}
            {assistantActiveOpportunity && (
              <div className="text-xs bg-white/20 rounded px-2 py-1 mt-2">
                🎯 Analisando: {assistantActiveOpportunity.client}
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
                  <p>Sou seu assistente CONTEXTUAL com dados REAIS do CRM:</p>
                  <ul className="ml-2 space-y-1">
                    <li>• 📊 Uso dados dos SEUS clientes, não benchmarks genéricos</li>
                    <li>• 💰 ROI calculado com perdas admitidas pelos clientes</li>
                    <li>• 📈 {historicalPatterns?.successfulDeals?.length || 0} casos de sucesso no SEU pipeline</li>
                    <li>• 👤 Análise de contatos mapeados e próximas ações</li>
                    <li>• 🎯 Probabilidade ajustada ao histórico do vendedor</li>
                  </ul>
                  
                  {historicalPatterns && (
                    <div className="mt-3 p-2 bg-white rounded">
                      <p className="font-semibold text-gray-700">Seus Padrões:</p>
                      <ul className="text-xs mt-1">
                        <li>• Ciclo médio: {historicalPatterns.averageCloseTime || 'N/A'} dias</li>
                        <li>• Melhor indústria: {Object.entries(historicalPatterns.byIndustry || {})
                          .sort((a, b) => (b[1].winRate || 0) - (a[1].winRate || 0))[0]?.[0] || 'N/A'}</li>
                        <li>• Deals fechados: {historicalPatterns.successfulDeals?.length || 0}</li>
                      </ul>
                    </div>
                  )}
                  
                  <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="font-semibold text-yellow-800">
                      💡 Comandos inteligentes:
                    </p>
                    <ul className="text-xs mt-1">
                      <li>• "listar" - Ver TODAS as oportunidades com contexto</li>
                      <li>• "[nome_cliente]" - Análise completa com histórico</li>
                      <li>• "plan semanal" - Baseado em SEUS padrões</li>
                      <li>• "calcular ROI" - Com dados REAIS admitidos</li>
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
