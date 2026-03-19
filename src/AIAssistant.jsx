import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Target, DollarSign, Brain, Send, Loader2, Bot, Sparkles, AlertCircle, Activity, BarChart3, Clock, Zap, AlertTriangle, Maximize2, Minimize2, RefreshCw, ChevronDown, ChevronUp, Check } from 'lucide-react';

const AnalysisPanel = ({ analysis }) => {
  if (!analysis) return null;
  const { opportunity, pipeline, alerts } = analysis;
  const hc = (s) => s >= 7 ? 'text-green-600' : s >= 4 ? 'text-yellow-600' : 'text-red-600';
  const ac = (t) => ({ critical:'bg-red-100 text-red-800 border-red-300', urgent:'bg-orange-100 text-orange-800 border-orange-300', warning:'bg-yellow-100 text-yellow-700 border-yellow-300', opportunity:'bg-green-100 text-green-800 border-green-300' }[t] || 'bg-gray-100 text-gray-700 border-gray-300');
  return (
    <div className="bg-gradient-to-b from-gray-50 to-white border-b overflow-hidden">
      {opportunity && (
        <div className="p-4 border-b border-gray-100">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white rounded-lg p-3 border"><Activity className={`w-5 h-5 mx-auto mb-1 ${hc(opportunity.healthScore)}`}/><div className={`text-xl font-bold ${hc(opportunity.healthScore)}`}>{opportunity.healthScore}/10</div><div className="text-sm text-gray-500">Saúde</div></div>
            <div className="bg-white rounded-lg p-3 border"><Target className="w-5 h-5 mx-auto mb-1 text-blue-600"/><div className="text-xl font-bold text-blue-600">{opportunity.probability}%</div><div className="text-sm text-gray-500">Probabilidade</div></div>
            <div className="bg-white rounded-lg p-3 border"><Clock className="w-5 h-5 mx-auto mb-1 text-gray-600"/><div className="text-xl font-bold text-gray-700">{opportunity.daysSince}d</div><div className="text-sm text-gray-500">Sem contato</div></div>
          </div>
          {opportunity.scaleBreakdown && (
            <div className="mt-3 grid grid-cols-6 gap-1">
              {Object.entries(opportunity.scaleBreakdown).map(([k,v]) => (
                <div key={k} className="text-center"><div className="text-xs font-semibold text-gray-500 uppercase">{k.slice(0,3)}</div><div className={`text-base font-bold ${v>=7?'text-green-600':v>=4?'text-yellow-600':'text-red-600'}`}>{v}</div></div>
              ))}
            </div>
          )}
        </div>
      )}
      {alerts && alerts.length > 0 && (
        <div className="p-3 space-y-2">
          {alerts.slice(0,2).map((a,i) => (
            <div key={i} className={`text-sm p-3 rounded-lg border flex items-start ${ac(a.type)}`}>
              {a.type==='critical'&&<AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5"/>}
              {a.type==='urgent'&&<AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5"/>}
              {a.type==='opportunity'&&<Zap className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5"/>}
              <div><div className="font-semibold">{a.message}</div>{a.action&&<div className="opacity-90 mt-0.5">→ {a.action}</div>}</div>
            </div>
          ))}
        </div>
      )}
      {!opportunity && pipeline && (
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3 border"><BarChart3 className="w-5 h-5 text-blue-600 mb-1"/><div className="text-base font-bold">{pipeline.total}</div><div className="text-sm text-gray-500">Oportunidades</div></div>
            <div className="bg-white rounded-lg p-3 border"><DollarSign className="w-5 h-5 text-green-600 mb-1"/><div className="text-base font-bold">R$ {(pipeline.totalValue/1000000).toFixed(1)}M</div><div className="text-sm text-gray-500">Pipeline</div></div>
          </div>
          {pipeline.atRisk>0&&<div className="mt-2 text-sm bg-red-50 text-red-700 p-3 rounded-lg">⚠️ {pipeline.atRisk} em risco</div>}
        </div>
      )}
    </div>
  );
};

const RESULT_OPTIONS = [
  { key: 'positivo', icon: '✅', label: 'Positivo' },
  { key: 'neutro', icon: '➡️', label: 'Neutro' },
  { key: 'negativo', icon: '❌', label: 'Negativo' }
];

const ActionCard = ({ activity, onMarkDone, onDiscard, onUseInChat }) => {
  const [showDraft, setShowDraft] = useState(false);
  const [mode, setMode] = useState(null);
  const [result, setResult] = useState('positivo');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const scaleInfo = activity.ai_suggested_scales ? (() => { try { return JSON.parse(activity.ai_suggested_scales); } catch { return null; } })() : null;

  return (
    <div className="border-l-4 border-indigo-400 bg-indigo-50 rounded-lg p-4 hover:shadow-md transition-all">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-lg">🤖</span>
        {scaleInfo && <span className="text-sm bg-indigo-200 text-indigo-800 px-2 py-1 rounded font-mono font-semibold">{(scaleInfo.target||'').toUpperCase()} {scaleInfo.from}→{scaleInfo.to}</span>}
        <span className="text-sm text-gray-400 ml-auto">{new Date(activity.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span>
      </div>
      <p className="text-base font-semibold text-gray-900">{activity.next_action}</p>
      <p className="text-sm text-gray-600 mt-1">{activity.description}</p>

      {activity.ai_suggested_action && (
        <div className="mt-2">
          <button onClick={() => setShowDraft(!showDraft)} className="text-sm text-indigo-600 font-semibold flex items-center hover:text-indigo-800">
            {showDraft?<ChevronUp className="w-4 h-4 mr-1"/>:<ChevronDown className="w-4 h-4 mr-1"/>}
            {showDraft?'Ocultar rascunho':'Ver rascunho'}
          </button>
          {showDraft && <div className="mt-2 p-4 bg-white rounded-lg border text-sm text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto">{activity.ai_suggested_action}</div>}
        </div>
      )}

      {!mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setMode('done')} className="flex-1 min-w-[100px] py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 flex items-center justify-center"><Check className="w-4 h-4 mr-1"/> Feito</button>
          <button onClick={() => setMode('discard')} className="flex-1 min-w-[100px] py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 flex items-center justify-center"><X className="w-4 h-4 mr-1"/> Descartar</button>
          {onUseInChat && <button onClick={() => onUseInChat(activity)} className="py-2.5 px-4 bg-purple-600 text-white rounded-lg text-sm font-bold hover:bg-purple-700 flex items-center"><Send className="w-4 h-4 mr-1"/> Chat</button>}
          {activity.ai_suggested_action && <button onClick={() => {navigator.clipboard.writeText(activity.ai_suggested_action);alert('Copiado!');}} className="py-2.5 px-3 bg-white border text-gray-600 rounded-lg text-sm hover:bg-gray-50">📋</button>}
        </div>
      )}

      {mode === 'done' && (
        <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-green-800">Resultado:</p>
          <div className="flex gap-2">
            {RESULT_OPTIONS.map(o => <button key={o.key} onClick={() => setResult(o.key)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${result===o.key?'bg-green-600 text-white border-green-600':'bg-white text-gray-600 border-gray-300'}`}>{o.icon} {o.label}</button>)}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Observações (opcional)..." className="w-full p-3 border rounded-lg text-sm h-16 resize-none"/>
          <div className="flex gap-2">
            <button onClick={async () => {setSaving(true);try{await onMarkDone(activity.id,result,note||null);}finally{setSaving(false);}}} disabled={saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300">{saving?'⏳':'✅'} Confirmar</button>
            <button onClick={() => setMode(null)} className="px-4 py-2.5 text-gray-500 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {mode === 'discard' && (
        <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-red-800">Motivo do descarte (obrigatório):</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: cliente já tem contato, não aplica..." className="w-full p-3 border border-red-300 rounded-lg text-sm h-16 resize-none"/>
          <div className="flex gap-2">
            <button onClick={async () => {if(!reason.trim()){alert('Motivo obrigatório');return;}setSaving(true);try{await onDiscard(activity.id,reason.trim());}finally{setSaving(false);}}} disabled={saving||!reason.trim()} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300">{saving?'⏳':'❌'} Confirmar</button>
            <button onClick={() => setMode(null)} className="px-4 py-2.5 text-gray-500 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [generating, setGenerating] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { const h = () => setIsOpen(true); window.addEventListener('openAssistant', h); return () => window.removeEventListener('openAssistant', h); }, []);

  // DB ops
  const loadPendingFromDB = useCallback(async () => {
    if (!supabase || !currentOpportunity) { setPendingSuggestions([]); return; }
    try {
      const { data } = await supabase.from('activities').select('*').eq('opportunity_id', currentOpportunity.id).eq('source', 'ai_generated').eq('next_action_done', false).is('result', null).order('created_at', { ascending: true });
      setPendingSuggestions(data || []);
    } catch (e) { console.error(e); }
  }, [supabase, currentOpportunity]);

  const saveSuggestionsToDB = async (actions) => {
    if (!supabase || !currentOpportunity) return;
    const records = actions.map(a => ({
      opportunity_id: currentOpportunity.id, vendor: currentUser || 'Ventus', activity_type: 'ai_suggestion',
      description: a.title + ' — ' + a.description, result: null, stage_at_time: currentOpportunity.stage,
      methodology_code: null, ai_suggested_action: a.draft_content || null,
      ai_suggested_scales: a.target_scale ? JSON.stringify({ target: a.target_scale, from: a.current_score, to: a.target_score }) : null,
      ai_confidence: null, next_action: a.title,
      next_action_date: new Date(Date.now() + 2*86400000).toISOString().split('T')[0],
      next_action_done: false, source: 'ai_generated'
    }));
    try { await supabase.from('activities').insert(records); } catch (e) { console.error(e); }
  };

  const expireOld = async () => {
    if (!supabase || !currentOpportunity) return;
    try { await supabase.from('activities').update({ next_action_done: true, result: 'expirado' }).eq('opportunity_id', currentOpportunity.id).eq('source', 'ai_generated').eq('next_action_done', false).is('result', null); } catch (e) { console.error(e); }
  };

  const markDone = async (id, result, note) => {
    if (!supabase) return;
    const u = { next_action_done: true, result };
    if (note) {
      const { data: orig } = await supabase.from('activities').select('description').eq('id', id).single();
      u.description = (orig?.description || '') + '\n---\n✅ Vendedor (' + result + '): ' + note;
    }
    await supabase.from('activities').update(u).eq('id', id);
    await loadPendingFromDB();
  };

  const markDiscarded = async (id, reason) => {
    if (!supabase) return;
    const { data: orig } = await supabase.from('activities').select('description').eq('id', id).single();
    const desc = (orig?.description || '') + '\n---\n❌ Descartado: ' + reason;
    await supabase.from('activities').update({ next_action_done: true, result: 'descartado', description: desc }).eq('id', id);
    await loadPendingFromDB();
  };

  const generateActions = async () => {
    if (!currentOpportunity) return;
    setGenerating(true);
    try {
      await expireOld();
      // Fetch recent activity history to inform Ventus
      let activityHistory = [];
      try {
        const { data: histData } = await supabase.from('activities').select('*').eq('opportunity_id', currentOpportunity.id).order('created_at', { ascending: false }).limit(10);
        activityHistory = histData || [];
      } catch (e) { console.error('Error fetching history:', e); }
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'action_plan', opportunityData: currentOpportunity, vendorName: currentUser, pipelineData, activityHistory }) });
      if (r.ok) {
        const d = await r.json();
        if (d.actionPlan?.actions?.length > 0) await saveSuggestionsToDB(d.actionPlan.actions);
        if (d.analysis) setAnalysis(d.analysis);
      }
      await loadPendingFromDB();
    } catch (e) { console.error(e); alert('Erro ao gerar ações'); }
    finally { setGenerating(false); }
  };

  const loadPipelineData = async () => {
    if (!supabase) return;
    try { const { data } = await supabase.from('opportunities').select('*').order('value', { ascending: false }); if (data) setPipelineData({ allOpportunities: data }); } catch (e) { console.error(e); }
  };

  const getUpdatedAnalysis = async () => {
    if (!currentOpportunity) return;
    try {
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: '', opportunityData: currentOpportunity, vendorName: currentUser, pipelineData }) });
      if (r.ok) { const d = await r.json(); if (d.analysis) setAnalysis(d.analysis); }
    } catch (e) { console.error(e); }
  };

  const handleUseInChat = (activity) => {
    processMessage(`Me ajude a executar: ${activity.next_action || ''}. Contexto: ${activity.ai_suggested_action || activity.description || ''}`);
  };

  useEffect(() => { if (isOpen && supabase) loadPipelineData(); }, [isOpen]);
  useEffect(() => { if (currentOpportunity && isOpen) { getUpdatedAnalysis(); loadPendingFromDB(); } else { setPendingSuggestions([]); } }, [currentOpportunity?.id, isOpen]);

  const processMessage = async (text) => {
    if (!text?.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    try {
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: text, opportunityData: currentOpportunity, vendorName: currentUser, pipelineData }) });
      if (!r.ok) throw new Error('Server error');
      const d = await r.json();
      setMessages(prev => [...prev, { role: 'assistant', content: d.response || 'Erro', timestamp: new Date().toISOString() }]);
      if (d.analysis) setAnalysis(d.analysis);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro de conexão.', timestamp: new Date().toISOString() }]);
    } finally { setIsLoading(false); }
  };

  const getContextualSuggestions = () => {
    if (analysis?.insights?.length > 0) return analysis.insights.slice(0,3).map(i => i.message);
    if (!currentOpportunity?.scales) return [];
    const s = [];
    if ((currentOpportunity.scales?.dor?.score||0) < 5) s.push("🎯 Como fazer o cliente admitir sua dor?");
    if ((currentOpportunity.scales?.poder?.score||0) < 5) s.push("👤 Como acesso o tomador de decisão?");
    if (currentOpportunity.value > 100000) s.push("💰 Cliente diz que está caro, como manejo?");
    return s.slice(0,3);
  };

  const wc = isMaximized ? 'fixed inset-4 z-50' : 'fixed bottom-24 right-6 w-[900px] h-[calc(100vh-140px)] max-h-[900px] z-50';

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 group hover:scale-110">
        <Bot className="w-7 h-7"/><Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse"/>
        {!isOpen && currentOpportunity && analysis?.alerts?.length > 0 && <span className="absolute -top-2 -left-2 w-3 h-3 bg-red-500 rounded-full animate-ping"/>}
      </button>

      {isOpen && (
        <div className={`${wc} bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6"/>
                <div>
                  <h3 className="font-bold text-lg">Ventus - Coach IA PPVVCC</h3>
                  <p className="text-sm opacity-90">{currentOpportunity ? `🎯 ${currentOpportunity.client} - ${currentOpportunity.name}` : '📊 Pipeline'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsMaximized(!isMaximized)} className="hover:bg-white/20 p-2 rounded">{isMaximized?<Minimize2 className="w-5 h-5"/>:<Maximize2 className="w-5 h-5"/>}</button>
                <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-2 rounded"><X className="w-5 h-5"/></button>
              </div>
            </div>
            {currentOpportunity && (
              <div className="mt-2 bg-white/20 rounded-lg px-4 py-2">
                <div className="flex justify-between items-center text-sm">
                  <span>Etapa: {currentOpportunity.stage}/6</span>
                  <span>Prob: {currentOpportunity.probability||0}%</span>
                  <span>R$ {(currentOpportunity.value||0).toLocaleString('pt-BR')}</span>
                  {currentOpportunity.product && <span>🏷️ {currentOpportunity.product}</span>}
                </div>
              </div>
            )}
          </div>

          <div className={`flex-1 flex ${isMaximized ? 'flex-row' : 'flex-col'} overflow-hidden`}>
            {/* Left: Analysis + Actions */}
            <div className={`${isMaximized ? 'w-[480px] min-w-[480px]' : ''} flex-shrink-0 overflow-y-auto border-r`}>
              <AnalysisPanel analysis={analysis}/>

              {currentOpportunity && (
                <div className="border-b">
                  <div className="p-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
                    <div className="flex items-center"><Zap className="w-5 h-5 text-indigo-600 mr-2"/><span className="font-bold text-base text-indigo-800">Ações ({pendingSuggestions.length})</span></div>
                    <button onClick={generateActions} disabled={generating} className="flex items-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                      {generating?<Loader2 className="w-4 h-4 mr-1 animate-spin"/>:<RefreshCw className="w-4 h-4 mr-1"/>}
                      {generating?'Gerando...':pendingSuggestions.length>0?'Renovar':'Gerar ações'}
                    </button>
                  </div>
                  {generating && <div className="p-6 text-center bg-indigo-50"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2"/><p className="text-sm text-indigo-700">Gerando ações personalizadas...</p></div>}
                  {!generating && pendingSuggestions.length > 0 && (
                    <div className="p-4 space-y-3 bg-gradient-to-b from-indigo-50 to-white">
                      {pendingSuggestions.map(s => <ActionCard key={s.id} activity={s} onMarkDone={markDone} onDiscard={markDiscarded} onUseInChat={handleUseInChat}/>)}
                    </div>
                  )}
                  {!generating && pendingSuggestions.length === 0 && (
                    <div className="p-6 text-center bg-gray-50"><p className="text-sm text-gray-500 mb-2">Nenhuma ação pendente.</p><button onClick={generateActions} className="text-sm text-indigo-600 font-semibold hover:text-indigo-800">🤖 Gerar sugestões →</button></div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Chat only */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-gray-50 to-white">
                {messages.length === 0 && (
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-xl">
                    <p className="font-bold text-lg text-purple-700 mb-2">👋 Olá {currentUser}!</p>
                    {currentOpportunity ? (
                      <>
                        <p className="text-base text-gray-600 mb-3">Analisando: <strong>{currentOpportunity.client}</strong></p>
                        {analysis && <div className="text-sm bg-white rounded-lg p-3 mb-3 border border-purple-200"><span className="font-semibold text-purple-700">Estado:</span> Saúde {analysis.opportunity?.healthScore||'N/A'}/10 • Prob {analysis.opportunity?.probability||'N/A'}% • {analysis.alerts?.length||0} alertas</div>}
                        {getContextualSuggestions().length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-semibold text-purple-700">Pergunte-me:</p>
                            {getContextualSuggestions().map((s,i) => <button key={i} onClick={() => processMessage(s)} className="w-full text-left text-sm bg-white hover:bg-purple-50 p-3 rounded-lg border border-purple-200">{s}</button>)}
                          </div>
                        )}
                      </>
                    ) : <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-2"><p className="text-base text-yellow-800">⚠️ <strong>Selecione um cliente</strong> para análise</p></div>}
                  </div>
                )}

                {messages.map((msg,i) => (
                  <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'}`}>
                    <div className={`max-w-[85%] ${msg.role==='user'?'bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-sm':'bg-white border text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'} p-4`}>
                      {msg.role==='assistant'&&<div className="flex items-center gap-1 mb-1"><Bot className="w-4 h-4 text-purple-500"/><span className="text-sm text-purple-500 font-medium">Ventus</span></div>}
                      <div className="text-base whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      <div className="text-sm opacity-60 mt-1">{new Date(msg.timestamp).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                  </div>
                ))}

                {isLoading && <div className="flex justify-start"><div className="bg-white border rounded-2xl rounded-tl-sm p-4 shadow-sm flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-purple-500"/><span className="text-base text-gray-600">Analisando...</span><Brain className="w-5 h-5 text-purple-500 animate-pulse"/></div></div>}
                <div ref={messagesEndRef}/>
              </div>

              <div className="p-4 border-t bg-white flex-shrink-0">
                <div className="flex gap-2">
                  <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => {if(e.key==='Enter'&&!isLoading&&input.trim()) processMessage(input);}}
                    placeholder={currentOpportunity?"Pergunte, peça email, briefing, roteiro...":"Selecione um cliente..."}
                    className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-base disabled:bg-gray-100" disabled={isLoading}/>
                  <button onClick={() => processMessage(input)} disabled={isLoading||!input.trim()} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-5 py-3 rounded-xl hover:shadow-lg disabled:opacity-50">
                    {isLoading?<Loader2 className="w-5 h-5 animate-spin"/>:<Send className="w-5 h-5"/>}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentOpportunity?<><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/><span className="text-sm text-gray-500">{currentOpportunity.client}</span>{analysis?.opportunity&&<span className="text-sm text-gray-400">| Saúde {analysis.opportunity.healthScore}/10</span>}</>
                    :<><div className="w-2 h-2 bg-yellow-500 rounded-full"/><span className="text-sm text-gray-500">Pipeline</span></>}
                  </div>
                  <span className="text-sm text-gray-400">Claude AI + PPVVCC</span>
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
