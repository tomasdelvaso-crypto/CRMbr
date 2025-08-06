import React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, TrendingUp, Phone, Target, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  const [userPerformance, setUserPerformance] = useState(null);

  // Cargar todas las oportunidades al iniciar
  useEffect(() => {
    loadPipelineData();
    if (currentUser) {
      calculateUserPerformance();
    }
  }, [currentUser]);

  // Analizar oportunidad cuando cambia
  useEffect(() => {
    if (currentOpportunity) {
      analyzeOpportunity(currentOpportunity);
      checkOpportunityHealth(currentOpportunity);
    }
  }, [currentOpportunity]);

  // Calcular performance del vendedor actual
  const calculateUserPerformance = async () => {
    if (!currentUser) return;
    
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .eq('vendor', currentUser);
        
      if (data && !error) {
        const totalValue = data.reduce((sum, opp) => sum + (opp.value || 0), 0);
        
        // Calcular promedio de escalas correctamente
        const avgScales = data.length > 0 ? 
          data.reduce((sum, opp) => {
            if (!opp.scales) return sum;
            
            // Manejar tanto formato antiguo como nuevo
            let scaleSum = 0;
            let scaleCount = 0;
            
            Object.values(opp.scales).forEach(scale => {
              // Si es objeto con .score
              if (typeof scale === 'object' && scale.score !== undefined) {
                scaleSum += scale.score;
                scaleCount++;
              }
              // Si es número directo (formato antiguo)
              else if (typeof scale === 'number') {
                scaleSum += scale;
                scaleCount++;
              }
            });
            
            const avgForOpp = scaleCount > 0 ? scaleSum / scaleCount : 0;
            return sum + avgForOpp;
          }, 0) / data.length : 0;
        
        const thisMonth = data.filter(opp => {
          const closeDate = new Date(opp.expected_close || opp.last_update);
          const now = new Date();
          return closeDate.getMonth() === now.getMonth() && 
                 closeDate.getFullYear() === now.getFullYear();
        });
        
        setUserPerformance({
          totalOpps: data.length,
          totalValue,
          avgHealth: avgScales.toFixed(1),
          thisMonthTarget: thisMonth.reduce((sum, opp) => sum + (opp.value || 0), 0),
          closedThisMonth: data.filter(opp => opp.stage === 6).length
        });
      }
    } catch (err) {
      console.error('Error calculating user performance:', err);
    }
  };

  // Cargar datos del pipeline completo
  const loadPipelineData = async () => {
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
    
    const avgScales = opportunities.map(opp => {
      if (!opp.scales) return 0;
      
      let scaleSum = 0;
      let scaleCount = 0;
      
      Object.values(opp.scales).forEach(scale => {
        if (typeof scale === 'object' && scale.score !== undefined) {
          scaleSum += scale.score;
          scaleCount++;
        } else if (typeof scale === 'number') {
          scaleSum += scale;
          scaleCount++;
        }
      });
      
      return scaleCount > 0 ? scaleSum / scaleCount : 0;
    });
    
    const riskOpps = opportunities.filter(opp => {
      if (!opp.scales) return false;
      
      let avg = 0;
      let count = 0;
      Object.values(opp.scales).forEach(scale => {
        if (typeof scale === 'object' && scale.score !== undefined) {
          avg += scale.score;
          count++;
        } else if (typeof scale === 'number') {
          avg += scale;
          count++;
        }
      });
      
      avg = count > 0 ? avg / count : 0;
      return avg < 4 && opp.value > 50000;
    });

    setPipelineHealth({
      total: opportunities.length,
      totalValue,
      atRisk: riskOpps.length,
      riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0),
      averageHealth: avgScales.length > 0 ? 
        (avgScales.reduce((a, b) => a + b, 0) / avgScales.length).toFixed(1) : '0'
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

  // Función para analizar la oportunidad actual
  const analyzeOpportunity = (opp) => {
    if (!opp || !opp.scales) return;

    const scales = opp.scales;
    
    // Calcular promedio manejando ambos formatos
    let totalScore = 0;
    let count = 0;
    
    const scaleValues = {
      pain: getScaleValue(scales.dor || scales.pain),
      power: getScaleValue(scales.poder || scales.power),
      vision: getScaleValue(scales.visao || scales.vision),
      value: getScaleValue(scales.valor || scales.value),
      control: getScaleValue(scales.controle || scales.control),
      purchase: getScaleValue(scales.compras || scales.purchase)
    };
    
    Object.values(scaleValues).forEach(val => {
      totalScore += val;
      count++;
    });
    
    const avgScale = count > 0 ? totalScore / count : 0;
    
    // Identificar escalas críticas
    const criticalScales = [];
    if (scaleValues.pain < 5) {
      criticalScales.push({ 
        name: 'DOR', 
        value: scaleValues.pain, 
        issue: 'Cliente no admite el problema' 
      });
    }
    if (scaleValues.power < 4) {
      criticalScales.push({ 
        name: 'PODER', 
        value: scaleValues.power, 
        issue: 'Sin acceso al decisor' 
      });
    }
    if (scaleValues.vision < 4) {
      criticalScales.push({ 
        name: 'VISÃO', 
        value: scaleValues.vision, 
        issue: 'Cliente no ve la solución' 
      });
    }
    if (scaleValues.value < 4) {
      criticalScales.push({ 
        name: 'VALOR', 
        value: scaleValues.value, 
        issue: 'No percibe el ROI' 
      });
    }

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
      nextAction: generateNextAction(opp, scaleValues)
    });
  };

  // Generar próxima acción recomendada
  const generateNextAction = (opp, scaleValues) => {
    if (scaleValues.pain < 5) {
      return {
        action: "Identificar y documentar el dolor",
        script: "Necesitás que admita el problema. Preguntá: '¿Cuántas horas por mes dedican a re-embalar productos dañados?'"
      };
    }
    if (scaleValues.power < 4) {
      return {
        action: "Acceder al tomador de decisión",
        script: "Pedí acceso directo: 'Para diseñar la mejor solución, ¿podríamos incluir al gerente de logística en la próxima reunión?'"
      };
    }
    if (scaleValues.vision < 5) {
      return {
        action: "Construir visión de solución",
        script: "Mostrá el valor completo: 'Les muestro cómo reducimos 40% el retrabalho en MercadoLibre con nuestra solución integrada'"
      };
    }
    if (scaleValues.value < 5) {
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
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 5) {
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} días sin contacto - LLAMAR HOY`,
          action: 'generateReengagement'
        });
      }
    }

    // Verificar escalas vs valor
    let avgScale = 0;
    let count = 0;
    
    if (opp.scales) {
      Object.values(opp.scales).forEach(scale => {
        const value = getScaleValue(scale);
        avgScale += value;
        count++;
      });
      avgScale = count > 0 ? avgScale / count : 0;
    }
    
    if (avgScale < 4 && opp.value > 100000) {
      newAlerts.push({
        type: 'warning',
        message: `⚠️ R$${opp.value.toLocaleString()} en riesgo - Escalas bajas (${avgScale.toFixed(1)}/10)`,
        action: 'generateRecoveryPlan'
      });
    }

    // Verificar etapa vs escalas
    const painValue = opp.scales ? getScaleValue(opp.scales.dor || opp.scales.pain) : 0;
    if (opp.stage === 3 && painValue < 7) {
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
    if (!currentOpportunity || !currentOpportunity.scales) return [];
    
    const actions = [];
    const scales = currentOpportunity.scales;
    
    const painValue = getScaleValue(scales.dor || scales.pain);
    const powerValue = getScaleValue(scales.poder || scales.power);
    const valueValue = getScaleValue(scales.valor || scales.value);

    if (painValue < 5) {
      actions.push({
        icon: '🎯',
        label: 'Generar preguntas SPIN',
        prompt: `Dame 5 preguntas SPIN específicas para que ${currentOpportunity.client} admita problemas de violación y retrabalho en su operación logística`
      });
    }

    if (powerValue < 4) {
      actions.push({
        icon: '👔',
        label: 'Script para acceder al decisor',
        prompt: `Dame un script exacto para pedirle a mi contacto actual que me presente al gerente de operaciones de ${currentOpportunity.client}`
      });
    }

    if (valueValue < 5) {
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

    // === NUEVOS QUICK ACTIONS PARA EMAIL Y VENTAS ===
    
    // Calcular días sin contacto
    const daysSince = currentOpportunity.last_update ? 
      Math.floor((new Date() - new Date(currentOpportunity.last_update)) / (1000 * 60 * 60 * 24)) : 0;

    // Email contextualizado (siempre visible)
    actions.push({
      icon: '📧',
      label: daysSince > 7 ? 'Email reactivación' : 'Generar email',
      prompt: `Genera un email profesional para ${currentOpportunity.client}. 
        Contexto: DOR=${painValue}/10, PODER=${powerValue}/10, VALOR=${valueValue}/10.
        ${daysSince > 7 ? `URGENTE: ${daysSince} días sin contacto, necesito reactivar este deal frío.` : ''} 
        ${painValue < 5 ? 'Objetivo principal: que admita el problema de violación de cajas.' : 
          powerValue < 4 ? 'Objetivo principal: conseguir acceso al tomador de decisión.' : 
          valueValue < 5 ? 'Objetivo principal: validar ROI y valor de la solución.' :
          'Objetivo principal: avanzar al cierre con propuesta formal.'}
        Industria: ${currentOpportunity.industry || 'logística'}.
        Valor del deal: R$${currentOpportunity.value}.
        Contactos: Power Sponsor: ${currentOpportunity.power_sponsor || 'no identificado'}, 
        Sponsor: ${currentOpportunity.sponsor || 'no identificado'}.`
    });

    // Script de llamada (siempre visible)
    actions.push({
      icon: '📞',
      label: 'Script de llamada',
      prompt: `Dame un script completo de llamada telefónica para ${currentOpportunity.client}. 
        Industria: ${currentOpportunity.industry || 'logística'}. 
        Escalas actuales: DOR=${painValue}/10, PODER=${powerValue}/10, VALOR=${valueValue}/10.
        Contacto actual: ${currentOpportunity.power_sponsor || currentOpportunity.sponsor || 'no identificado'}.
        Incluye: apertura de 15 segundos, preguntas SPIN específicas, manejo de objeciones comunes, y cierre con próximo paso.`
    });

    // Demo (solo si dolor admitido y algo de poder)
    if (painValue >= 5 && powerValue >= 3) {
      actions.push({
        icon: '🎬',
        label: 'Preparar demo',
        prompt: `Prepara una agenda detallada de demo de 30 minutos para ${currentOpportunity.client}. 
          Valor del deal: R$${currentOpportunity.value}. 
          Industria: ${currentOpportunity.industry || 'logística'}.
          Dolor principal admitido (score ${painValue}/10).
          Incluye: 3 momentos WOW específicos, casos de éxito de ${currentOpportunity.industry || 'su industria'}, 
          cálculo de ROI personalizado, y dejar algo pendiente para próxima reunión.`
      });
    }

    // Manejo de objeciones (si valor no está validado)
    if (valueValue < 7) {
      actions.push({
        icon: '💡',
        label: 'Manejar objeción precio',
        prompt: `${currentOpportunity.client} probablemente objetará el precio de R$${currentOpportunity.value}. 
          Dame 3 formas diferentes de responder a "es muy caro" sin confrontar. 
          Usa casos de éxito de ${currentOpportunity.industry || 'la industria'}, 
          ROI específico, y reframe a inversión vs costo.`
      });
    }

    // Estrategia para deals grandes
    if (currentOpportunity.value > 100000) {
      actions.push({
        icon: '🎖️',
        label: 'Estrategia de cuenta',
        prompt: `Diseña una estrategia completa para cerrar ${currentOpportunity.client} (R$${currentOpportunity.value}). 
          Situación actual: DOR=${painValue}, PODER=${powerValue}, VALOR=${valueValue}.
          Incluye: mapa de todos los stakeholders, timeline de 30-60-90 días, 
          principales riesgos y mitigación, competencia probable, y próximos 5 pasos concretos.`
      });
    }

    // Análisis de competencia (siempre útil)
    actions.push({
      icon: '⚔️',
      label: 'Vs Competencia',
      prompt: `${currentOpportunity.client} está evaluando alternativas (3M, Scotch, o soluciones genéricas). 
        Dame argumentos diferenciadores clave de Ventapel vs cada competidor, 
        sin hablar mal de la competencia. 
        Foco en nuestra solución integral (máquina + cinta + soporte) y garantía de 40% reducción.
        Industria: ${currentOpportunity.industry || 'logística'}.`
    });

    // Casos de éxito relevantes
    actions.push({
      icon: '🏆',
      label: 'Casos de éxito',
      prompt: `Dame 3 casos de éxito relevantes para ${currentOpportunity.client} en industria ${currentOpportunity.industry || 'similar'}. 
        Incluye: empresa, problema inicial, solución implementada, resultados cuantificados, ROI logrado.
        Casos disponibles: MercadoLibre (40% reducción retrabalho), Natura (60% menos violaciones), 
        Magazine Luiza (35% reducción devoluciones), Dafiti (eliminó retrabalho manual).`
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
      // Preparar contexto con formato correcto de escalas
      const opportunityContext = currentOpportunity ? {
        ...currentOpportunity,
        scales: {
          pain: getScaleValue(currentOpportunity.scales?.dor || currentOpportunity.scales?.pain),
          power: getScaleValue(currentOpportunity.scales?.poder || currentOpportunity.scales?.power),
          vision: getScaleValue(currentOpportunity.scales?.visao || currentOpportunity.scales?.vision),
          value: getScaleValue(currentOpportunity.scales?.valor || currentOpportunity.scales?.value),
          control: getScaleValue(currentOpportunity.scales?.controle || currentOpportunity.scales?.control),
          purchase: getScaleValue(currentOpportunity.scales?.compras || currentOpportunity.scales?.purchase)
        }
      } : null;

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: messageText,
          opportunityData: opportunityContext,
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
        content: data.response || 'No se pudo procesar la respuesta.' 
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error al procesar la solicitud. Por favor, verifica la configuración del API.' 
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
            <div className="flex items-center gap-4">
              <button
                onClick={loadPipelineData}
                className="text-blue-600 hover:text-blue-800"
                title="Actualizar datos"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{analysis.probability}%</div>
                <div className="text-xs text-gray-600">Probabilidad cierre</div>
              </div>
            </div>
          </div>

          {/* Info del Pipeline Total */}
          {pipelineHealth && (
            <div className="bg-white/50 p-2 rounded mb-3 text-xs">
              <div className="flex justify-between">
                <span>Pipeline Total: R${pipelineHealth.totalValue.toLocaleString()}</span>
                <span className="text-red-600">En Riesgo: R${pipelineHealth.riskValue.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Semáforo de Escalas */}
          {currentOpportunity.scales && (
            <div className="grid grid-cols-6 gap-2 mb-4">
              {[
                { key: 'dor', label: 'DOR', altKey: 'pain' },
                { key: 'poder', label: 'PODER', altKey: 'power' },
                { key: 'visao', label: 'VISÃO', altKey: 'vision' },
                { key: 'valor', label: 'VALOR', altKey: 'value' },
                { key: 'controle', label: 'CONTROL', altKey: 'control' },
                { key: 'compras', label: 'COMPRAS', altKey: 'purchase' }
              ].map(({ key, label, altKey }) => {
                const value = getScaleValue(currentOpportunity.scales[key] || currentOpportunity.scales[altKey]);
                return (
                  <div key={key} className={`text-center p-2 rounded-lg ${
                    value < 4 ? 'bg-red-500' : 
                    value < 7 ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}>
                    <div className="text-white text-xs font-semibold">{label}</div>
                    <div className="text-white text-xl font-bold">{value}</div>
                  </div>
                );
              })}
            </div>
          )}

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
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Asistente Ventapel AI</h3>
              <button onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {currentUser && userPerformance && (
              <div className="text-xs opacity-90">
                Hola {currentUser} • {userPerformance.totalOpps || 0} oportunidades • 
                R${userPerformance.totalValue?.toLocaleString() || 0} en gestión
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="p-3 bg-gray-50 border-b overflow-x-auto">
            <div className="flex gap-2 flex-nowrap">
              {getQuickActions().map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(action.prompt)}
                  className="flex-shrink-0 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs hover:bg-gray-100 transition flex items-center gap-1"
                  disabled={isLoading}
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
                <p className="text-xs mt-2">💡 Pregúntame sobre:</p>
                <ul className="text-xs text-left mt-1 space-y-1">
                  <li>• Email de reactivación o follow-up</li>
                  <li>• Script para llamada telefónica</li>
                  <li>• Cómo preparar la demo</li>
                  <li>• Manejo de objeciones de precio</li>
                  <li>• Estrategia contra competencia</li>
                </ul>
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
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                placeholder="Pregunta sobre la oportunidad..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
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
