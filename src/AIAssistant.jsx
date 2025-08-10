import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Calendar, DollarSign } from 'lucide-react';

const AIAssistant = ({ currentOpportunity, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  const [historicalPatterns, setHistoricalPatterns] = useState(null);

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
    if (currentOpportunity && allOpportunities.length > 0) {
      analyzeOpportunityWithContext(currentOpportunity);
    }
  }, [currentOpportunity, allOpportunities]);

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

  // Extraer patrones de TUS datos históricos
  const extractHistoricalPatterns = (opportunities) => {
    const patterns = {
      byIndustry: {},
      byVendor: {},
      successfulDeals: [],
      averageCloseTime: 0
    };

    // Analizar deals cerrados exitosamente
    const closedWon = opportunities.filter(opp => opp.stage === 6);
    patterns.successfulDeals = closedWon;

    // Calcular tasas de pérdida REALES por industria basadas en TUS datos
    const industries = [...new Set(opportunities.map(o => o.industry).filter(Boolean))];
    
    industries.forEach(industry => {
      const industryOpps = opportunities.filter(o => o.industry === industry);
      const avgValue = industryOpps.reduce((sum, o) => sum + (o.value || 0), 0) / industryOpps.length;
      
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
        actualLossRate: lossRates.length > 0 ? 
          lossRates.reduce((a, b) => a + b, 0) / lossRates.length : 
          null,
        closedWon: industryOpps.filter(o => o.stage === 6).length,
        winRate: industryOpps.length > 0 ? industryOpps.filter(o => o.stage === 6).length / industryOpps.length : 0
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
        winRate: vendorOpps.length > 0 ? vendorOpps.filter(o => o.stage === 6).length / vendorOpps.length : 0
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
      potentialMonthlyLoss: Math.round(potentialLosses)
    });
  };

  const getScaleValue = (scale) => {
    if (!scale && scale !== 0) return 0;
    if (typeof scale === 'number') return scale;
    if (typeof scale === 'object' && scale !== null) {
      if ('score' in scale) return Number(scale.score) || 0;
      if ('value' in scale) return Number(scale.value) || 0;
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

  // Análisis con contexto completo del CRM
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
    const newAlerts = [];
    
    // Verificar inconsistencias considerando el contexto COMPLETO
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      const admittedPainInNotes = opp.notes && 
        (opp.notes.toLowerCase().includes('admitió') || 
         opp.notes.toLowerCase().includes('reconoce') ||
         opp.notes.toLowerCase().includes('problema'));
      
      if (!admittedPainInNotes) {
        inconsistencies.push({
          type: 'critical',
          message: '🔴 Apresentando sem DOR confirmada! Cliente não vai comprar.',
          action: 'Voltar para qualificação URGENTE'
        });
      }
    }
    
    // Verificar acceso a poder
    if (opp.value > 100000 && scaleValues.power < 4) {
      const hasPowerContact = opp.power_sponsor || opp.sponsor;
      if (!hasPowerContact) {
        inconsistencies.push({
          type: 'critical',
          message: `⛔ R$${opp.value.toLocaleString()} sem decisor mapeado!`,
          action: 'Mapear Power Sponsor URGENTE'
        });
      }
    }
    
    // Verificar próxima ação
    if (!opp.next_action || opp.next_action.trim() === '') {
      inconsistencies.push({
        type: 'warning',
        message: '📝 Sem próxima ação definida',
        action: 'Definir próximo passo específico'
      });
    }

    // Alertas baseados em último contato
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) {
        const loss = calculateRealPotentialLoss(opp);
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} dias sem contato! Perdendo R$${loss.monthlyLoss.toLocaleString()}/mês`
        });
      }
    }

    // Calcular probabilidad real
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
    
    // Ajustar basado en patrones históricos
    if (historicalPatterns && opp.industry) {
      const industryData = historicalPatterns.byIndustry[opp.industry];
      if (industryData && industryData.winRate) {
        probability = (probability * 0.7) + (industryData.winRate * 100 * 0.3);
      }
    }

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability: Math.round(probability),
      scaleValues,
      inconsistencies,
      potentialLoss: calculateRealPotentialLoss(opp)
    });
    
    setAlerts(newAlerts);
  };

  // Calcular pérdida potencial con datos REALES
  const calculateRealPotentialLoss = (opp, allOpps = allOpportunities) => {
    // Prioridad 1: Buscar en las notas del cliente
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
          confidence: 'MÉDIA'
        };
      }
    }
    
    // Prioridad 3: Benchmarks de Brasil (último recurso)
    const industry = opp.industry?.toLowerCase() || 'default';
    const fallbackRate = fallbackBenchmarks.industries[industry]?.rate || fallbackBenchmarks.averageLoss;
    const monthlyVolume = Math.round(opp.value / 100);
    const monthlyLoss = Math.round(monthlyVolume * fallbackRate * 35);
    
    return {
      monthlyLoss,
      annualLoss: monthlyLoss * 12,
      lossRate: (fallbackRate * 100).toFixed(1),
      source: fallbackBenchmarks.industries[industry]?.source || 'IBEVAR - média Brasil',
      confidence: 'BAIXA'
    };
  };

  const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Contexto completo para el asistente
      const ventapelContext = {
        historicalData: historicalPatterns,
        pipelineHealth: pipelineHealth,
        totalOpportunities: allOpportunities.length
      };

      const opportunityContext = currentOpportunity ? {
        ...currentOpportunity,
        analysis: analysis,
        potentialLoss: calculateRealPotentialLoss(currentOpportunity)
      } : null;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: messageText,
          opportunityData: opportunityContext,
          ventapelContext,
          pipelineData: {
            allOpportunities: allOpportunities,
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
        content: '❌ Erro na conexão. Tente novamente.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Panel de Análisis en el CRM - SIMPLIFICADO */}
      {currentOpportunity && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> 
              Análise: {currentOpportunity.client}
            </h3>
            <div className="text-2xl font-bold text-blue-600">
              {analysis.probability}%
              <div className="text-xs text-gray-600">Probabilidade real</div>
            </div>
          </div>

          {/* ROI con confianza */}
          {analysis.potentialLoss && (
            <div className="bg-white/70 p-3 rounded mb-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Perda mensal:</span>
                  <span className="font-bold text-red-600 ml-2">
                    R${analysis.potentialLoss.monthlyLoss.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Fonte:</span>
                  <span className="font-bold ml-2">{analysis.potentialLoss.source}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-gray-600">
                    Confiança: <strong className={
                      analysis.potentialLoss.confidence === 'ALTA' ? 'text-green-600' :
                      analysis.potentialLoss.confidence === 'MÉDIA' ? 'text-yellow-600' :
                      'text-red-600'
                    }>{analysis.potentialLoss.confidence}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Semáforo PPVVCC */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {[
              { key: 'pain', label: 'DOR', value: analysis.scaleValues.pain },
              { key: 'power', label: 'PODER', value: analysis.scaleValues.power },
              { key: 'vision', label: 'VISÃO', value: analysis.scaleValues.vision },
              { key: 'value', label: 'VALOR', value: analysis.scaleValues.value },
              { key: 'control', label: 'CTRL', value: analysis.scaleValues.control },
              { key: 'purchase', label: 'COMPRAS', value: analysis.scaleValues.purchase }
            ].map(({ key, label, value }) => (
              <div key={key} className={`text-center p-2 rounded ${
                value < 4 ? 'bg-red-500' : 
                value < 7 ? 'bg-yellow-500' : 
                'bg-green-500'
              } text-white`}>
                <div className="text-xs">{label}</div>
                <div className="text-xl font-bold">{value}</div>
              </div>
            ))}
          </div>

          {/* Inconsistencias detectadas */}
          {analysis.inconsistencies.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded p-2 mb-3">
              {analysis.inconsistencies.map((inc, idx) => (
                <div key={idx} className="text-sm text-red-600 mb-1">
                  • {inc.message}
                </div>
              ))}
            </div>
          )}

          {/* Alertas */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div key={idx} className={`p-2 rounded text-sm ${
                  alert.type === 'urgent' ? 'bg-red-100 text-red-700 font-bold' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {alert.message}
                </div>
              ))}
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
        {alerts.some(a => a.type === 'urgent') && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        )}
      </button>

      {/* Chat del asistente - SIMPLIFICADO */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg flex justify-between items-center">
            <div>
              <h3 className="font-semibold">Assistente Ventapel</h3>
              <div className="text-xs opacity-90">
                {historicalPatterns ? 
                  `${historicalPatterns.successfulDeals.length} deals fechados • Ciclo: ${historicalPatterns.averageCloseTime || 'N/A'} dias` :
                  'Analisando pipeline...'}
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded p-1">
              <X size={20} />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b grid grid-cols-2 gap-2">
            <button
              onClick={() => sendMessage('Calcular ROI para ' + currentOpportunity?.client)}
              className="bg-white border rounded px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2"
              disabled={isLoading || !currentOpportunity}
            >
              <DollarSign size={16} />
              ROI Real
            </button>
            <button
              onClick={() => sendMessage('plan_semanal')}
              className="bg-white border rounded px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2"
              disabled={isLoading}
            >
              <Calendar size={16} />
              Plan Semanal
            </button>
            <button
              onClick={() => sendMessage('Análise completa de ' + currentOpportunity?.client)}
              className="bg-white border rounded px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2"
              disabled={isLoading || !currentOpportunity}
            >
              <Target size={16} />
              Análise PPVVCC
            </button>
            <button
              onClick={() => sendMessage('Quais deals estão em risco?')}
              className="bg-white border rounded px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2"
              disabled={isLoading}
            >
              <AlertTriangle size={16} />
              Deals em Risco
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="bg-blue-50 p-3 rounded text-sm">
                <p className="font-bold mb-2">👋 Olá {currentUser}!</p>
                <p className="text-xs text-gray-600 mb-2">
                  Uso dados REAIS do seu CRM:
                </p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• {allOpportunities.length} oportunidades analisadas</li>
                  <li>• R${(pipelineHealth?.totalValue || 0).toLocaleString()} em pipeline</li>
                  {historicalPatterns?.successfulDeals.length > 0 && (
                    <li>• {historicalPatterns.successfulDeals.length} casos de sucesso</li>
                  )}
                  <li>• Perdas calculadas com dados admitidos</li>
                </ul>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
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
                placeholder="Digite sua pergunta..."
                className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
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
