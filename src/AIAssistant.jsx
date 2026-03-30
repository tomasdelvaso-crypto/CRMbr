import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Target, Brain, Send, Loader2, Bot, Sparkles, Activity, Clock, Zap, AlertTriangle, AlertCircle, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase, isAdmin }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { const h = () => setIsOpen(true); window.addEventListener('openAssistant', h); return () => window.removeEventListener('openAssistant', h); }, []);

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

  useEffect(() => { if (isOpen && supabase) loadPipelineData(); }, [isOpen]);
  useEffect(() => { if (currentOpportunity && isOpen) getUpdatedAnalysis(); }, [currentOpportunity?.id, isOpen]);

  const processMessage = async (text) => {
    if (!text?.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    try {
      // Fetch activity history for context
      let activityHistory = [];
      if (supabase && currentOpportunity) {
        try {
          const { data: histData } = await supabase.from('activities').select('*').eq('opportunity_id', currentOpportunity.id).order('created_at', { ascending: false }).limit(10);
          activityHistory = histData || [];
        } catch (e) { console.error(e); }
      }
      const r = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: text, opportunityData: currentOpportunity, vendorName: currentUser, pipelineData, activityHistory, isAdmin }) });
      if (!r.ok) throw new Error('Server error');
      const d = await r.json();
      setMessages(prev => [...prev, { role: 'assistant', content: d.response || 'Erro', timestamp: new Date().toISOString() }]);
      if (d.analysis) setAnalysis(d.analysis);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erro de conexão.', timestamp: new Date().toISOString() }]);
    } finally { setIsLoading(false); }
  };

  const getContextualSuggestions = () => {
    if (!currentOpportunity?.scales) return [];
    const s = [];
    if ((currentOpportunity.scales?.dor?.score || 0) < 5) s.push("🎯 Como fazer o cliente admitir a dor?");
    if ((currentOpportunity.scales?.poder?.score || 0) < 5) s.push("👤 Como chego no tomador de decisão?");
    if ((currentOpportunity.scales?.valor?.score || 0) < 4) s.push("💰 Como quantifico o ROI pro cliente?");
    if ((currentOpportunity.scales?.visao?.score || 0) < 4) s.push("🔭 Como construo a visão da solução?");
    return s.slice(0, 3);
  };

  const hc = (s) => s >= 7 ? 'text-green-600' : s >= 4 ? 'text-yellow-600' : 'text-red-600';
  const alertColor = (t) => ({ critical: 'bg-red-50 text-red-800 border-red-200', urgent: 'bg-orange-50 text-orange-800 border-orange-200', warning: 'bg-yellow-50 text-yellow-700 border-yellow-200', opportunity: 'bg-green-50 text-green-800 border-green-200' }[t] || 'bg-gray-50 text-gray-700 border-gray-200');

  return (
    <>
      {/* Toggle tab — always visible on right edge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed top-1/2 -translate-y-1/2 z-50 flex items-center gap-2 py-4 px-2 rounded-l-xl shadow-lg transition-all duration-300 ${
          isOpen ? 'right-[420px]' : 'right-0'
        } bg-gradient-to-b from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700`}
        title={isOpen ? 'Fechar Ventus' : 'Abrir Ventus'}
      >
        {isOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        {!isOpen && (
          <div className="flex flex-col items-center gap-1">
            <Bot className="w-5 h-5" />
            <span className="text-xs font-bold writing-mode-vertical" style={{ writingMode: 'vertical-lr' }}>VENTUS</span>
            {currentOpportunity && analysis?.alerts?.length > 0 && (
              <span className="w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse" />
            )}
          </div>
        )}
      </button>

      {/* Sidebar panel */}
      <div className={`fixed top-0 right-0 h-full w-[420px] z-40 bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base">Ventus Coach</h3>
              <p className="text-sm opacity-90 truncate">
                {currentOpportunity ? `${currentOpportunity.client} - ${currentOpportunity.name}` : 'Pipeline'}
              </p>
            </div>
          </div>
          {currentOpportunity && analysis?.opportunity && (
            <div className="mt-2 flex items-center gap-3 text-sm bg-white/15 rounded-lg px-3 py-1.5">
              <span className={`font-bold ${hc(analysis.opportunity.healthScore)}`} style={{color: 'white'}}>
                ❤️ {analysis.opportunity.healthScore}/10
              </span>
              <span>📊 {analysis.opportunity.probability}%</span>
              <span>⏱️ {analysis.opportunity.daysSince}d</span>
              <span>Etapa {currentOpportunity.stage}/6</span>
            </div>
          )}
        </div>

        {/* Alerts — compact */}
        {analysis?.alerts?.length > 0 && (
          <div className="p-2 border-b space-y-1 flex-shrink-0 max-h-24 overflow-y-auto">
            {analysis.alerts.slice(0, 2).map((a, i) => (
              <div key={i} className={`text-sm px-3 py-1.5 rounded border ${alertColor(a.type)}`}>
                {a.type === 'critical' && '💀 '}{a.type === 'urgent' && '⚠️ '}{a.type === 'opportunity' && '✨ '}{a.message}
              </div>
            ))}
          </div>
        )}

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-purple-100">
                <p className="font-semibold text-base text-purple-700 mb-2">👋 Olá {currentUser}!</p>
                {currentOpportunity ? (
                  <p className="text-base text-gray-600">
                    Analisando <strong>{currentOpportunity.client}</strong>. Me pergunta qualquer coisa sobre a oportunidade, peça emails, roteiros de ligação, estratégias...
                  </p>
                ) : isAdmin ? (
                  <p className="text-base text-gray-600">
                    Nenhuma oportunidade selecionada. Como admin, posso analisar o <strong>pipeline completo</strong>, sugerir próximos passos e identificar riscos.
                  </p>
                ) : (
                  <p className="text-base text-yellow-700">⚠️ Selecione uma oportunidade para análise personalizada.</p>
                )}
              </div>
              {currentOpportunity && getContextualSuggestions().length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-500 px-1">Sugestões:</p>
                  {getContextualSuggestions().map((s, i) => (
                    <button key={i} onClick={() => processMessage(s)}
                      className="w-full text-left text-base bg-white hover:bg-purple-50 p-3 rounded-xl border border-gray-200 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {!currentOpportunity && isAdmin && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-500 px-1">Sugestões:</p>
                  {[
                    '📊 Como está o pipeline? Quais são as prioridades?',
                    '🔴 Quais oportunidades estão em risco?',
                    '💰 Quais são os maiores deals e como acelerar?',
                    '📋 Resumo geral: pontos fortes e fracos do time',
                  ].map((s, i) => (
                    <button key={i} onClick={() => processMessage(s)}
                      className="w-full text-left text-base bg-white hover:bg-purple-50 p-3 rounded-xl border border-gray-200 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-2xl rounded-tr-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
              } p-3`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-purple-500 font-medium">Ventus</span>
                  </div>
                )}
                <div className="text-base whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                <div className="text-xs opacity-50 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-2xl rounded-tl-sm p-3 shadow-sm flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                <span className="text-base text-gray-600">Analisando...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-white flex-shrink-0">
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyPress={e => { if (e.key === 'Enter' && !isLoading && input.trim()) processMessage(input); }}
              placeholder={currentOpportunity ? "Pergunte algo..." : "Selecione um cliente..."}
              className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-base" disabled={isLoading} />
            <button onClick={() => processMessage(input)} disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-3 rounded-xl hover:shadow-lg disabled:opacity-50">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              {currentOpportunity ? (
                <><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /><span className="text-sm text-gray-500">{currentOpportunity.client}</span></>
              ) : (
                <><div className="w-2 h-2 bg-yellow-500 rounded-full" /><span className="text-sm text-gray-500">Pipeline</span></>
              )}
            </div>
            <span className="text-xs text-gray-400">Claude + PPVVCC</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default AIAssistant;
