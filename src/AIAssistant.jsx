import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Target, Mail, Phone, DollarSign, TrendingUp, Brain, Send, Loader2, Bot, Sparkles, AlertCircle, Activity, BarChart3, Clock, CheckCircle, XCircle, ChevronRight, Zap, AlertTriangle, Maximize2, Minimize2, RefreshCw, ChevronDown, ChevronUp, FileText, PhoneCall, Calendar } from 'lucide-react';

// ============= COMPONENTE PAINEL DE ANÁLISE =============
const AnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;

  const { opportunity, pipeline, alerts, nextBestAction } = analysis;
  
  const getHealthColor = (score) => {
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAlertColor = (type) => {
    switch(type) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'urgent': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'opportunity': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white border-b overflow-hidden">
      {opportunity && (
        <div className="p-3 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Activity className={`w-4 h-4 mx-auto mb-1 ${getHealthColor(opportunity.healthScore)}`} />
              <div className={`text-lg font-bold ${getHealthColor(opportunity.healthScore)}`}>
                {opportunity.healthScore}/10
              </div>
              <div className="text-xs text-gray-500">Saúde</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Target className="w-4 h-4 mx-auto mb-1 text-blue-600" />
              <div className="text-lg font-bold text-blue-600">
                {opportunity.probability}%
              </div>
              <div className="text-xs text-gray-500">Probabilidade</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <Clock className="w-4 h-4 mx-auto mb-1 text-gray-600" />
              <div className="text-lg font-bold text-gray-700">
                {opportunity.daysSince}d
              </div>
              <div className="text-xs text-gray-500">Sem contato</div>
            </div>
          </div>

          {opportunity.scaleBreakdown && (
            <div className="mt-2 grid grid-cols-6 gap-1">
              {Object.entries(opportunity.scaleBreakdown).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div className="text-xs font-medium text-gray-600 uppercase">{key.slice(0, 3)}</div>
                  <div className={`text-sm font-bold ${value >= 7 ? 'text-green-600' : value >= 4 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="p-2 space-y-1">
          {alerts.slice(0, 2).map((alert, idx) => (
            <div key={idx} className={`text-xs p-2 rounded-lg border flex items-start ${getAlertColor(alert.type)}`}>
              {alert.type === 'critical' && <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              {alert.type === 'urgent' && <AlertCircle className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              {alert.type === 'opportunity' && <Zap className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div className="font-semibold">{alert.message}</div>
                {alert.action && (
                  <div className="text-xs opacity-90 mt-0.5">→ {alert.action}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nextBestAction && !opportunity && (
        <div className="p-2 border-t border-gray-100">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-2 border border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Target className="w-4 h-4 text-purple-600 mr-2" />
                <div>
                  <div className="text-xs font-bold text-purple-800">{nextBestAction.priority}</div>
                  <div className="text-xs text-purple-700">{nextBestAction.title}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {!opportunity && pipeline && (
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <BarChart3 className="w-4 h-4 text-blue-600 mb-1" />
              <div className="text-sm font-bold">{pipeline.total}</div>
              <div className="text-xs text-gray-500">Oportunidades</div>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <DollarSign className="w-4 h-4 text-green-600 mb-1" />
              <div className="text-sm font-bold">R$ {(pipeline.totalValue / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-gray-500">Pipeline Total</div>
            </div>
          </div>
          {pipeline.atRisk > 0 && (
            <div className="mt-2 text-xs bg-red-50 text-red-700 p-2 rounded-lg">
              ⚠️ {pipeline.atRisk} negócios em risco (R$ {(pipeline.riskValue / 1000).toFixed(0)}k)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============= COMPONENTE ACTION PLAN CARD =============
const ACTION_TYPE_ICONS = {
  call: { icon: '📞', label: 'Ligação', color: 'border-blue-400 bg-blue-50' },
  email: { icon: '📧', label: 'Email', color: 'border-green-400 bg-green-50' },
  meeting: { icon: '🤝', label: 'Reunião', color: 'border-purple-400 bg-purple-50' },
  demo: { icon: '🖥️', label: 'Demo', color: 'border-orange-400 bg-orange-50' },
  proposal: { icon: '📋', label: 'Proposta', color: 'border-yellow-400 bg-yellow-50' },
  whatsapp: { icon: '💬', label: 'WhatsApp', color: 'border-emerald-400 bg-emerald-50' },
  linkedin: { icon: '🔗', label: 'LinkedIn', color: 'border-blue-400 bg-blue-50' }
};

const PRIORITY_COLORS = {
  critica: 'bg-red-500 text-white',
  alta: 'bg-orange-500 text-white',
  media: 'bg-yellow-400 text-yellow-900'
};

const ActionCard = ({ action, onUse, onDismiss, index }) => {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = ACTION_TYPE_ICONS[action.action_type] || ACTION_TYPE_ICONS.call;
  const priorityColor = PRIORITY_COLORS[action.priority] || PRIORITY_COLORS.media;

  return (
    <div className={`border-l-4 rounded-lg p-3 ${typeConfig.color} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${priorityColor}`}>
              {action.priority?.toUpperCase()}
            </span>
            <span className="text-xs font-medium text-gray-500">
              {typeConfig.icon} {typeConfig.label}
            </span>
            {action.target_scale && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">
                {action.target_scale.toUpperCase()} {action.current_score}→{action.target_score}
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-gray-900">{action.title}</p>
          <p className="text-xs text-gray-600 mt-0.5">{action.description}</p>
          
          {action.expected_outcome && (
            <p className="text-xs text-gray-500 mt-1 italic">
              🎯 {action.expected_outcome}
            </p>
          )}
        </div>
      </div>

      {/* Expandable draft content */}
      <div className="mt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 font-semibold flex items-center hover:text-indigo-800"
        >
          {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {expanded ? 'Ocultar rascunho' : 'Ver rascunho completo'}
          {action.tool_reference && (
            <span className="ml-2 text-gray-400">| Ref: {action.tool_reference}</span>
          )}
        </button>
        
        {expanded && action.draft_content && (
          <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap">
            {action.draft_content}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onUse(action)}
          className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center"
        >
          <Send className="w-3 h-3 mr-1" />
          Usar no chat
        </button>
        <button
          onClick={() => {
            if (action.draft_content) {
              navigator.clipboard.writeText(action.draft_content);
              alert('Rascunho copiado!');
            }
          }}
          className="px-3 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-lg text-xs hover:bg-gray-50 transition-colors"
        >
          📋 Copiar
        </button>
        <button
          onClick={() => onDismiss(index)}
          className="px-3 py-1.5 text-gray-400 hover:text-gray-600 text-xs transition-colors"
          title="Descartar"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ============= ACTION PLAN PANEL =============
const ActionPlanPanel = ({ actionPlan, isLoading, onRefresh, onUseAction, onDismissAction }) => {
  if (isLoading) {
    return (
      <div className="p-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-600 mr-2" />
          <span className="text-sm text-indigo-700 font-medium">Gerando plano de ações personalizado...</span>
        </div>
      </div>
    );
  }

  if (!actionPlan || !actionPlan.actions || actionPlan.actions.length === 0) return null;

  return (
    <div className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
      <div className="p-3 border-b border-indigo-200 flex items-center justify-between">
        <div className="flex items-center">
          <Zap className="w-4 h-4 text-indigo-600 mr-2" />
          <span className="font-bold text-sm text-indigo-800">
            Plano de Ações ({actionPlan.actions.length})
          </span>
          {actionPlan.source === 'claude' && (
            <span className="ml-2 text-xs bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded">IA</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded transition-colors"
          title="Gerar novas sugestões"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      
      {actionPlan.diagnosis && (
        <div className="px-3 py-2 bg-white bg-opacity-50 text-xs text-indigo-700 border-b border-indigo-100">
          🔍 {actionPlan.diagnosis}
        </div>
      )}

      <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
        {actionPlan.actions.map((action, idx) => (
          <ActionCard
            key={idx}
            action={action}
            index={idx}
            onUse={onUseAction}
            onDismiss={onDismissAction}
          />
        ))}
      </div>
    </div>
  );
};

// ============= COMPONENTE PRINCIPAL =============
const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [dynamicActions, setDynamicActions] = useState([]);
  const [pipelineData, setPipelineData] = useState(null);
  const [actionPlan, setActionPlan] = useState(null);
  const [actionPlanLoading, setActionPlanLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listener para abrir o assistente do CRM
  useEffect(() => {
    const handleOpenAssistant = () => setIsOpen(true);
    window.addEventListener('openAssistant', handleOpenAssistant);
    return () => window.removeEventListener('openAssistant', handleOpenAssistant);
  }, []);

  // Carregar pipeline
  const loadPipelineData = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('value', { ascending: false });
      if (!error && data) {
        setPipelineData({ allOpportunities: data });
      }
    } catch (err) {
      console.error('Erro carregando pipeline:', err);
    }
  };

  // Obter análise atualizada
  const getUpdatedAnalysis = async () => {
    if (!currentOpportunity) return;
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: '',
          opportunityData: currentOpportunity,
          vendorName: currentUser,
          pipelineData: pipelineData
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.analysis) {
          setAnalysis(data.analysis);
          if (data.analysis.quickActions) {
            setDynamicActions(data.analysis.quickActions);
          }
        }
      }
    } catch (error) {
      console.error('Erro obtendo análise:', error);
    }
  };

  // ============= ACTION PLAN =============
  const loadActionPlan = useCallback(async () => {
    if (!currentOpportunity) {
      setActionPlan(null);
      return;
    }
    
    setActionPlanLoading(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'action_plan',
          opportunityData: currentOpportunity,
          vendorName: currentUser,
          pipelineData: pipelineData
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.actionPlan) {
          setActionPlan(data.actionPlan);
        }
        if (data.analysis) {
          setAnalysis(data.analysis);
          if (data.analysis.quickActions) {
            setDynamicActions(data.analysis.quickActions);
          }
        }
      }
    } catch (error) {
      console.error('Erro gerando Action Plan:', error);
    } finally {
      setActionPlanLoading(false);
    }
  }, [currentOpportunity, currentUser, pipelineData]);

  const handleUseAction = (action) => {
    let prompt = '';
    switch (action.action_type) {
      case 'email':
        prompt = `Escreva um email completo para ${currentOpportunity?.client || 'o cliente'} com este objetivo: ${action.title}. Use o seguinte rascunho como base e melhore: ${action.draft_content || action.description}`;
        break;
      case 'call':
        prompt = `Me dê um roteiro completo de ligação para ${currentOpportunity?.client || 'o cliente'}: ${action.title}. Inclua perguntas SPIN, manejo de objeções e fechamento. Base: ${action.draft_content || action.description}`;
        break;
      case 'meeting':
        prompt = `Prepare um briefing completo para reunião com ${currentOpportunity?.client || 'o cliente'}: ${action.title}. Inclua pauta, pontos de dor a explorar e objetivo da reunião. Base: ${action.draft_content || action.description}`;
        break;
      default:
        prompt = `Me ajude a executar esta ação para ${currentOpportunity?.client || 'o cliente'}: ${action.title}. ${action.description}`;
    }
    processMessage(prompt);
  };

  const handleDismissAction = (index) => {
    if (!actionPlan) return;
    setActionPlan(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  // Carregar pipeline quando abre
  useEffect(() => {
    if (isOpen && supabase) {
      loadPipelineData();
    }
  }, [isOpen]);

  // Atualizar quando muda a oportunidade
  useEffect(() => {
    if (currentOpportunity && isOpen) {
      getUpdatedAnalysis();
      loadActionPlan();
    } else if (!currentOpportunity) {
      setActionPlan(null);
    }
  }, [currentOpportunity?.id, isOpen]);

  // ============= PROCESSAR MENSAGEM =============
  const processMessage = async (text) => {
    if (!text?.trim()) return;

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          opportunityData: currentOpportunity,
          vendorName: currentUser,
          pipelineData: pipelineData
        })
      });

      if (!response.ok) throw new Error('Erro no servidor');
      const data = await response.json();
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || 'Não consegui processar sua solicitação',
        timestamp: new Date().toISOString()
      }]);
      
      if (data.analysis) {
        setAnalysis(data.analysis);
        if (data.analysis.quickActions) {
          setDynamicActions(data.analysis.quickActions);
        }
      }
    } catch (error) {
      console.error('Erro:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Erro de conexão. Tente novamente.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick actions
  const effectiveActions = dynamicActions.length > 0 ? dynamicActions : [
    { icon: '🎯', label: 'Dor', prompt: 'Gere uma estratégia SPIN para elevar a dor do cliente', color: 'bg-red-500' },
    { icon: '💰', label: 'ROI', prompt: 'Calcule o ROI específico para esta oportunidade', color: 'bg-green-500' },
    { icon: '📧', label: 'Email', prompt: 'Escreva um email de follow-up poderoso', color: 'bg-blue-500' },
    { icon: '📞', label: 'Ligação', prompt: 'Me dê um roteiro de ligação com manejo de objeções', color: 'bg-yellow-500' },
    { icon: '📈', label: 'Estratégia', prompt: 'Crie um plano de ação para os próximos 5 dias', color: 'bg-indigo-500' },
    { icon: '📊', label: 'Análise', prompt: 'Análise PPVVCC completa com ações concretas', color: 'bg-purple-500' }
  ];

  const getContextualSuggestions = () => {
    if (analysis?.insights?.length > 0) {
      return analysis.insights.slice(0, 3).map(insight => insight.message);
    }
    if (!currentOpportunity?.scales) return [];
    const suggestions = [];
    const dorScore = currentOpportunity.scales?.dor?.score || 0;
    const poderScore = currentOpportunity.scales?.poder?.score || 0;
    if (dorScore < 5) suggestions.push("🎯 Como posso fazer o cliente admitir sua dor?");
    if (poderScore < 5) suggestions.push("👤 Como acesso o verdadeiro tomador de decisão?");
    if (currentOpportunity.value > 100000) suggestions.push("💰 O cliente diz que está muito caro, como manejo esta objeção?");
    return suggestions.slice(0, 3);
  };

  // ============= TAMAÑO DE VENTANA =============
  const windowClasses = isMaximized
    ? 'fixed inset-4 z-50'
    : 'fixed bottom-24 right-6 w-[900px] h-[calc(100vh-140px)] max-h-[900px] z-50';

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group hover:scale-110"
      >
        <Bot className="w-6 h-6" />
        <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
        {!isOpen && currentOpportunity && analysis?.alerts?.length > 0 && (
          <span className="absolute -top-2 -left-2 w-3 h-3 bg-red-500 rounded-full animate-ping" />
        )}
        {!isOpen && currentOpportunity && (
          <span className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Coach IA PPVVCC
          </span>
        )}
      </button>

      {/* Ventana del Chat */}
      {isOpen && (
        <div className={`${windowClasses} bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
          
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <div>
                  <h3 className="font-bold">Ventus - Coach IA PPVVCC</h3>
                  <p className="text-xs opacity-90">
                    {currentOpportunity 
                      ? `🎯 ${currentOpportunity.client} - ${currentOpportunity.name}` 
                      : '📊 Análise do Pipeline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="hover:bg-white/20 p-1.5 rounded transition-colors"
                  title={isMaximized ? 'Reduzir' : 'Maximizar'}
                >
                  {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="hover:bg-white/20 p-1.5 rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {currentOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-3 py-2">
                <div className="flex justify-between items-center text-xs">
                  <span>Etapa: {currentOpportunity.stage}/6</span>
                  <span>Prob: {currentOpportunity.probability || 0}%</span>
                  <span>R$ {(currentOpportunity.value || 0).toLocaleString('pt-BR')}</span>
                  {currentOpportunity.product && <span>🏷️ {currentOpportunity.product}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Layout: dos columnas si está maximizado, una si no */}
          <div className={`flex-1 flex ${isMaximized ? 'flex-row' : 'flex-col'} overflow-hidden`}>
            
            {/* Columna izquierda o superior: Análisis + Action Plan */}
            <div className={`${isMaximized ? 'w-[400px] border-r' : ''} flex-shrink-0 overflow-y-auto`}>
              <AnalysisPanel analysis={analysis} />
              
              {/* Action Plan */}
              {currentOpportunity && (
                <ActionPlanPanel
                  actionPlan={actionPlan}
                  isLoading={actionPlanLoading}
                  onRefresh={loadActionPlan}
                  onUseAction={handleUseAction}
                  onDismissAction={handleDismissAction}
                />
              )}
            </div>

            {/* Columna derecha o inferior: Chat */}
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* Quick Actions */}
              {currentOpportunity && effectiveActions.length > 0 && (
                <div className="p-3 bg-gray-50 border-b flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500">Ações rápidas</span>
                    <button 
                      onClick={() => setShowQuickActions(!showQuickActions)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {showQuickActions ? 'ocultar' : 'mostrar'}
                    </button>
                  </div>
                  {showQuickActions && (
                    <div className="grid grid-cols-3 gap-2">
                      {effectiveActions.slice(0, 6).map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => processMessage(action.prompt)}
                          disabled={isLoading}
                          className={`${action.color || 'bg-gray-500'} text-white rounded-lg px-3 py-2 text-xs hover:opacity-90 transition-all flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={action.prompt}
                        >
                          <span className="text-base">{action.icon}</span>
                          <span className="font-medium">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white">
                {messages.length === 0 && (
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-xl">
                    <p className="font-bold text-purple-700 mb-2">
                      👋 Olá {currentUser}!
                    </p>
                    {currentOpportunity ? (
                      <>
                        <p className="text-sm text-gray-600 mb-3">
                          Analisando: <strong>{currentOpportunity.client}</strong>
                        </p>
                        {analysis && (
                          <div className="text-xs bg-white rounded-lg p-2 mb-3 border border-purple-200">
                            <span className="font-semibold text-purple-700">Estado atual:</span>
                            <div className="mt-1">
                              • Saúde: {analysis.opportunity?.healthScore || 'N/A'}/10<br/>
                              • Probabilidade: {analysis.opportunity?.probability || 'N/A'}%<br/>
                              • {analysis.alerts?.length || 0} alertas ativos
                            </div>
                          </div>
                        )}
                        
                        {getContextualSuggestions().length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold text-purple-700">Pergunte-me:</p>
                            {getContextualSuggestions().map((suggestion, idx) => (
                              <button
                                key={idx}
                                onClick={() => processMessage(suggestion)}
                                className="w-full text-left text-xs bg-white hover:bg-purple-50 p-2 rounded-lg border border-purple-200 transition-colors"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                        <p className="text-sm text-yellow-800">
                          ⚠️ <strong>Selecione um cliente do CRM</strong> para análise completa
                        </p>
                        {pipelineData && (
                          <p className="text-xs text-yellow-700 mt-1">
                            Pipeline atual: {pipelineData.allOpportunities?.length || 0} oportunidades
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] ${
                      msg.role === 'user' 
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-sm' 
                        : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
                    } p-4`}>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1 mb-1">
                          <Bot className="w-3 h-3 text-purple-500" />
                          <span className="text-xs text-purple-500 font-medium">Ventus Coach</span>
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      <div className="text-xs opacity-60 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                        <span className="text-sm text-gray-600">Analisando com IA...</span>
                        <Brain className="w-4 h-4 text-purple-500 animate-pulse" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t bg-white flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isLoading && input.trim()) {
                        processMessage(input);
                      }
                    }}
                    placeholder={currentOpportunity 
                      ? "Pergunte sobre estratégias, peça um email, briefing de ligação..." 
                      : "Selecione um cliente ou pergunte sobre o pipeline..."}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm disabled:bg-gray-100"
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => processMessage(input)}
                    disabled={isLoading || !input.trim()}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-3 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentOpportunity ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs text-gray-500">{currentOpportunity.client}</span>
                        {analysis?.opportunity && (
                          <span className="text-xs text-gray-400">| Saúde {analysis.opportunity.healthScore}/10</span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                        <span className="text-xs text-gray-500">Modo Pipeline</span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    Powered by Claude AI + PPVVCC
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAssistant;
