import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users, TrendingUp, AlertTriangle, Clock, Target,
  DollarSign, Activity, Bot, Send, Loader2, ChevronRight,
  ChevronDown, ChevronUp, BarChart2, Zap, Shield, Eye,
  CheckCircle, XCircle, Calendar
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const daysSince = (dateStr) => {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
};

const STAGE_NAMES = {
  1: 'Prospecção', 2: 'Qualificação', 3: 'Proposta',
  4: 'Negociação', 5: 'Fechamento', 6: 'Pós-venda',
};

const severityOf = (days) =>
  days >= 30 ? 'critical' : days >= 14 ? 'warning' : 'low';

const severityClasses = {
  critical: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    row:   'border-l-4 border-red-400 bg-red-50',
    dot:   'bg-red-500',
    label: '🔴 Crítico',
  },
  warning: {
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    row:   'border-l-4 border-orange-400 bg-orange-50',
    dot:   'bg-orange-400',
    label: '🟠 Atenção',
  },
  low: {
    badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    row:   'border-l-4 border-yellow-300 bg-yellow-50',
    dot:   'bg-yellow-400',
    label: '🟡 Leve',
  },
};

// ── VentusAdmin sidebar ───────────────────────────────────────────────────────
const VentusAdmin = ({ currentUser, vendorStats, stagnationAlerts }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const suggestions = [
    '📋 Quais oportunidades estão mal preenchidas?',
    '🔴 Onde estão os pontos fracos do pipeline?',
    '💪 Quais são os pontos fortes que devo explorar?',
    '💡 O que devo cobrar em cada vendedor essa semana?',
  ];

  const send = useCallback(async (text) => {
    if (!text?.trim() || isLoading) return;
    setMessages(p => [...p, { role: 'user', content: text, ts: new Date().toISOString() }]);
    setInput(''); setIsLoading(true);
    try {
      // Helper: analyze opportunity completeness
      const analyzeOpp = (opp) => {
        const scales = opp.scales || {};
        const scaleNames = ['dor','poder','visao','valor','controle','compras'];
        const scaleScores = {};
        let scaleTotal = 0; let scaleCount = 0;
        const weakScales = []; const strongScales = [];
        scaleNames.forEach(s => {
          const score = scales[s]?.score || 0;
          scaleScores[s] = score;
          scaleTotal += score; scaleCount++;
          if (score <= 3) weakScales.push(s.toUpperCase());
          if (score >= 7) strongScales.push(s.toUpperCase());
        });

        const missing = [];
        if (!opp.power_sponsor?.trim()) missing.push('power_sponsor');
        if (!opp.sponsor?.trim()) missing.push('sponsor');
        if (!opp.influencer?.trim()) missing.push('influenciador');
        if (!opp.next_action?.trim()) missing.push('proxima_acao');
        if (!opp.expected_close) missing.push('data_fechamento');
        if (!opp.product?.trim()) missing.push('produto');
        if (!opp.industry?.trim()) missing.push('industria');
        if ((!opp.product_lines || opp.product_lines.length === 0)) missing.push('linhas_produto');

        const completeness = Math.round(((8 - missing.length) / 8) * 100);

        return {
          client: opp.client,
          name: opp.name,
          stage: opp.stage,
          value: opp.value,
          daysSinceActivity: opp.daysSinceActivity,
          scaleAvg: scaleCount > 0 ? Math.round(scaleTotal / scaleCount * 10) / 10 : 0,
          weakScales,
          strongScales,
          missing,
          completeness,
          hasContacts: !!(opp.power_sponsor?.trim() || opp.sponsor?.trim()),
          hasNextAction: !!opp.next_action?.trim(),
        };
      };

      const statsPayload = Object.values(vendorStats).map(v => {
        const opps = v.opportunities.map(analyzeOpp);
        const avgCompleteness = opps.length
          ? Math.round(opps.reduce((s, o) => s + o.completeness, 0) / opps.length)
          : 0;
        const avgScales = opps.length
          ? Math.round(opps.reduce((s, o) => s + o.scaleAvg, 0) / opps.length * 10) / 10
          : 0;
        const withoutNextAction = opps.filter(o => !o.hasNextAction).length;
        const withoutContacts = opps.filter(o => !o.hasContacts).length;

        return {
          name: v.name,
          totalOpps: v.opportunities.length,
          totalValue: v.totalValue,
          stagnated: v.stagnated.length,
          recentActivity7d: v.recentActivity,
          byStage: v.byStage,
          avgDaysSinceActivity: v.opportunities.length
            ? Math.round(v.opportunities.reduce((s, o) => s + o.daysSinceActivity, 0) / v.opportunities.length)
            : 0,
          avgCompleteness,
          avgScales,
          withoutNextAction,
          withoutContacts,
          opportunities: opps,
        };
      });

      const res = await fetch('/api/admin-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          adminName: currentUser,
          vendorStats: statsPayload,
          stagnationAlerts: stagnationAlerts.slice(0, 25).map(a => ({
            vendor: a.vendor,
            client: a.opportunity.client,
            oppName: a.opportunity.name,
            days: a.daysSinceActivity,
            stage: a.opportunity.stage,
            value: a.opportunity.value,
          })),
        }),
      });
      const d = await res.json();
      setMessages(p => [...p, { role: 'assistant', content: d.response || '❌ Sem resposta', ts: new Date().toISOString() }]);
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: '❌ Erro de conexão.', ts: new Date().toISOString() }]);
    } finally { setIsLoading(false); }
  }, [isLoading, vendorStats, stagnationAlerts, currentUser]);

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`fixed top-1/2 -translate-y-1/2 z-50 flex items-center gap-2 py-4 px-2 rounded-l-xl shadow-lg transition-all duration-300 ${
          isOpen ? 'right-[420px]' : 'right-0'
        } bg-gradient-to-b from-indigo-700 to-purple-700 text-white hover:from-indigo-800 hover:to-purple-800`}
        title={isOpen ? 'Fechar Ventus Manager' : 'Abrir Ventus Manager'}
      >
        {isOpen ? <ChevronRight className="w-5 h-5" /> : (
          <div className="flex flex-col items-center gap-1">
            <Shield className="w-5 h-5" />
            <span className="text-xs font-bold" style={{ writingMode: 'vertical-lr' }}>VENTUS</span>
            {stagnationAlerts.filter(a => severityOf(a.daysSinceActivity) === 'critical').length > 0 && (
              <span className="w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse" />
            )}
          </div>
        )}
      </button>

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-[420px] z-40 bg-white shadow-2xl border-l border-gray-200 flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white p-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6" />
            <div>
              <h3 className="font-bold text-base">Ventus Manager</h3>
              <p className="text-sm opacity-90">Assistente exclusivo para gestão de equipe</p>
            </div>
          </div>
          {stagnationAlerts.length > 0 && (
            <div className="mt-2 flex gap-3 text-sm bg-white/15 rounded-lg px-3 py-1.5">
              <span>🔴 {stagnationAlerts.filter(a => severityOf(a.daysSinceActivity) === 'critical').length} críticos</span>
              <span>🟠 {stagnationAlerts.filter(a => severityOf(a.daysSinceActivity) === 'warning').length} atenção</span>
              <span>📋 {stagnationAlerts.length} total estagnados</span>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-indigo-100">
                <p className="font-semibold text-base text-indigo-700 mb-1">👋 Olá, {currentUser}!</p>
                <p className="text-sm text-gray-600">Sou o Ventus no modo gerencial. Posso analisar o desempenho do time, identificar gargalos e sugerir ações de coaching.</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 px-1 uppercase tracking-wide">Sugestões</p>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="w-full text-left text-sm bg-white hover:bg-indigo-50 p-3 rounded-xl border border-gray-200 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl rounded-tr-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
              } p-3`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mb-1">
                    <Shield className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs text-indigo-500 font-medium">Ventus Manager</span>
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                <div className="text-xs opacity-40 mt-1">
                  {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-2xl rounded-tl-sm p-3 shadow-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                <span className="text-sm text-gray-500">Analisando equipe...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t bg-white flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isLoading && input.trim()) send(input); }}
              placeholder="Pergunte sobre a equipe..."
              className="flex-1 px-3 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
              disabled={isLoading}
            />
            <button onClick={() => send(input)} disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-2 rounded-xl hover:shadow disabled:opacity-50">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1 px-1">Modo Gerencial · Claude + PPVVCC</p>
        </div>
      </div>
    </>
  );
};

// ── VendorCard ────────────────────────────────────────────────────────────────
const VendorCard = ({ stat, isExpanded, onToggle }) => {
  const health = stat.opportunities.length > 0
    ? Math.round(stat.opportunities.reduce((s, o) => s + (10 - Math.min(o.daysSinceActivity / 5, 10)), 0) / stat.opportunities.length)
    : 0;

  const healthColor = health >= 7 ? 'text-green-600' : health >= 4 ? 'text-yellow-600' : 'text-red-600';
  const stagnatedPct = stat.opportunities.length
    ? Math.round((stat.stagnated.length / stat.opportunities.length) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow">
              {(stat.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base">{stat.name || 'Sem vendedor'}</h3>
              <p className="text-xs text-gray-500">{stat.opportunities.length} oportunidade{stat.opportunities.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stat.stagnated.length > 0 && (
              <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                {stat.stagnated.length} estagnada{stat.stagnated.length !== 1 ? 's' : ''}
              </span>
            )}
            <button onClick={onToggle} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Metrics row */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Pipeline</p>
            <p className="text-sm font-bold text-blue-600">{fmtBRL(stat.totalValue)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Saúde</p>
            <p className={`text-sm font-bold ${healthColor}`}>{health}/10</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Ativ. 7d</p>
            <p className="text-sm font-bold text-green-600">{stat.recentActivity}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">Estagnadas</p>
            <p className={`text-sm font-bold ${stagnatedPct >= 50 ? 'text-red-600' : stagnatedPct >= 25 ? 'text-orange-600' : 'text-gray-600'}`}>
              {stagnatedPct}%
            </p>
          </div>
        </div>

        {/* Stage progress bar */}
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-1.5">Distribuição por etapa</p>
          <div className="flex gap-1 h-2">
            {[1, 2, 3, 4, 5, 6].map(stage => {
              const count = stat.byStage[stage] || 0;
              const pct = stat.opportunities.length ? (count / stat.opportunities.length) * 100 : 0;
              const colors = ['bg-gray-300', 'bg-blue-300', 'bg-indigo-400', 'bg-yellow-400', 'bg-orange-400', 'bg-green-500'];
              return (
                <div key={stage} className="flex-1 bg-gray-100 rounded-full overflow-hidden" title={`${STAGE_NAMES[stage]}: ${count}`}>
                  <div className={`h-full rounded-full ${colors[stage - 1]} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3, 4, 5, 6].map(stage => (
              <div key={stage} className="flex-1 text-center">
                <span className="text-[10px] text-gray-400">{stat.byStage[stage] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded: opp list */}
      {isExpanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {stat.opportunities
            .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
            .map(opp => {
              const sev = severityOf(opp.daysSinceActivity);
              const cls = severityClasses[sev];
              return (
                <div key={opp.id} className={`px-5 py-3 flex items-center justify-between ${opp.daysSinceActivity >= 14 ? cls.row : ''}`}>
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="text-sm font-medium text-gray-800 truncate">{opp.client}</p>
                    <p className="text-xs text-gray-500 truncate">{opp.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Etapa {opp.stage} · {fmtBRL(opp.value)}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {opp.daysSinceActivity >= 14 ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cls.badge}`}>
                        {opp.daysSinceActivity}d sem atividade
                      </span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium">✓ {opp.daysSinceActivity}d</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

// ── AdminDashboard (main) ─────────────────────────────────────────────────────
const AdminDashboard = ({ supabase, opportunities, vendors, currentUser }) => {
  const [vendorStats, setVendorStats] = useState({});
  const [stagnationAlerts, setStagnationAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [stagnationDays, setStagnationDays] = useState(14);
  const [alertFilter, setAlertFilter] = useState('all'); // 'all' | 'critical' | 'warning'
  const [vendorFilter, setVendorFilter] = useState('all');

  const buildStats = useCallback(async () => {
    if (!supabase || !opportunities.length) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: activities } = await supabase
        .from('activities')
        .select('opportunity_id, created_at, vendor')
        .order('created_at', { ascending: false });

      // Map: oppId → activities[]
      const actMap = {};
      (activities || []).forEach(a => {
        if (!actMap[a.opportunity_id]) actMap[a.opportunity_id] = [];
        actMap[a.opportunity_id].push(a);
      });

      const stats = {};
      const alerts = [];
      const now = Date.now();

      opportunities.forEach(opp => {
        const vendor = opp.vendor?.trim() || 'Sin asignar';
        if (!stats[vendor]) {
          stats[vendor] = {
            name: vendor,
            opportunities: [],
            totalValue: 0,
            stagnated: [],
            recentActivity: 0,
            byStage: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
          };
        }

        const oppActs = actMap[opp.id] || [];
        const lastAct = oppActs.length > 0
          ? new Date(oppActs[0].created_at).getTime()
          : new Date(opp.last_update || opp.created_at).getTime();

        const days = Math.floor((now - lastAct) / 86_400_000);
        const recent7d = oppActs.filter(a => (now - new Date(a.created_at).getTime()) < 7 * 86_400_000).length;

        const enriched = { ...opp, daysSinceActivity: days, activitiesCount: oppActs.length };
        stats[vendor].opportunities.push(enriched);
        stats[vendor].totalValue += opp.value || 0;
        stats[vendor].recentActivity += recent7d;
        stats[vendor].byStage[opp.stage] = (stats[vendor].byStage[opp.stage] || 0) + 1;

        if (days >= stagnationDays) {
          stats[vendor].stagnated.push(enriched);
          alerts.push({ vendor, opportunity: opp, daysSinceActivity: days });
        }
      });

      alerts.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
      setVendorStats(stats);
      setStagnationAlerts(alerts);
    } catch (e) {
      console.error('AdminDashboard error:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase, opportunities, stagnationDays]);

  useEffect(() => { buildStats(); }, [buildStats]);

  // Summary numbers (filtered)
  const filteredOpps = vendorFilter === 'all'
    ? opportunities
    : opportunities.filter(o => (o.vendor?.trim() || '') === vendorFilter);
  const totalOpps = filteredOpps.length;
  const totalValue = filteredOpps.reduce((s, o) => s + (o.value || 0), 0);
  const criticalCount = vendorFilteredAlerts.filter(a => severityOf(a.daysSinceActivity) === 'critical').length;
  const warningCount = vendorFilteredAlerts.filter(a => severityOf(a.daysSinceActivity) === 'warning').length;

  const vendorFilteredAlerts = vendorFilter === 'all'
    ? stagnationAlerts
    : stagnationAlerts.filter(a => a.vendor === vendorFilter);

  const filteredAlerts = alertFilter === 'all'
    ? vendorFilteredAlerts
    : vendorFilteredAlerts.filter(a => severityOf(a.daysSinceActivity) === alertFilter);

  const vendorList = Object.values(vendorStats)
    .filter(v => v.name !== 'Sin asignar')
    .filter(v => vendorFilter === 'all' || v.name === vendorFilter)
    .sort((a, b) => b.totalValue - a.totalValue);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-3 text-gray-500 text-base">Carregando dados da equipe...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Gestão de Equipe
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão exclusiva para administradores · {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Vendedor</label>
            <select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[160px]"
            >
              <option value="all">👥 Todos</option>
              {Object.values(vendorStats)
                .filter(v => v.name !== 'Sin asignar')
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(v => <option key={v.name} value={v.name}>👤 {v.name}</option>)
              }
            </select>
            {vendorFilter !== 'all' && (
              <button onClick={() => setVendorFilter('all')}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap">
                Limpar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Alerta após</label>
            <select
              value={stagnationDays}
              onChange={e => setStagnationDays(Number(e.target.value))}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={21}>21 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Vendedores ativos</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{vendorList.length}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Oportunidades</p>
          </div>
          <p className="text-3xl font-bold text-gray-800">{totalOpps}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Pipeline total</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{fmtBRL(totalValue)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${criticalCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
              <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
            </div>
            <p className="text-sm text-gray-500 font-medium">Estagnadas</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-800">{vendorFilteredAlerts.length}</p>
            {criticalCount > 0 && (
              <span className="text-sm font-semibold text-red-600">{criticalCount} críticas</span>
            )}
          </div>
        </div>
      </div>

      {/* Main grid: vendor cards + alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Vendor cards — 3/5 */}
        <div className="xl:col-span-3 space-y-4">
          <h2 className="font-bold text-gray-700 text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            Desempenho por Vendedor
          </h2>
          {vendorList.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum vendedor encontrado.</p>
          ) : (
            vendorList.map(stat => (
              <VendorCard
                key={stat.name}
                stat={stat}
                isExpanded={expandedVendor === stat.name}
                onToggle={() => setExpandedVendor(expandedVendor === stat.name ? null : stat.name)}
              />
            ))
          )}
        </div>

        {/* Stagnation alerts — 2/5 */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-700 text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Alertas de Estagnação
            </h2>
            <div className="flex gap-1">
              {['all', 'critical', 'warning'].map(f => (
                <button
                  key={f}
                  onClick={() => setAlertFilter(f)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    alertFilter === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'critical' ? '🔴 Crítico' : '🟠 Atenção'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filteredAlerts.length === 0 ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-700">Nenhum alerta ativo!</p>
                <p className="text-xs text-green-600 mt-1">Todas as oportunidades estão com atividade recente.</p>
              </div>
            ) : (
              filteredAlerts.map((alert, i) => {
                const sev = severityOf(alert.daysSinceActivity);
                const cls = severityClasses[sev];
                return (
                  <div key={i} className={`${cls.row} rounded-xl p-4 bg-white shadow-sm border border-gray-100`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls.dot}`} />
                          <p className="text-sm font-semibold text-gray-800 truncate">{alert.opportunity.client}</p>
                        </div>
                        <p className="text-xs text-gray-500 truncate pl-3.5">{alert.opportunity.name}</p>
                        <div className="flex items-center gap-2 mt-1.5 pl-3.5">
                          <span className="text-xs text-gray-400">
                            👤 {alert.vendor}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-400">
                            Etapa {alert.opportunity.stage}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-400">
                            {fmtBRL(alert.opportunity.value)}
                          </span>
                        </div>
                      </div>
                      <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg border ${cls.badge}`}>
                        {alert.daysSinceActivity}d
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Ventus Manager sidebar */}
      <VentusAdmin
        currentUser={currentUser}
        vendorStats={vendorStats}
        stagnationAlerts={stagnationAlerts}
      />
    </div>
  );
};

export default AdminDashboard;
