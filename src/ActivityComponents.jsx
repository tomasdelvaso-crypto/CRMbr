import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Save, Check, Clock, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, BarChart3, Target, Users } from 'lucide-react';

// ============= ACTIVITY TYPES =============
const ACTIVITY_TYPE_CONFIG = {
  call:          { icon: '📞', label: 'Ligação',      color: 'bg-blue-100 text-blue-800' },
  email:         { icon: '📧', label: 'Email',        color: 'bg-gray-100 text-gray-800' },
  meeting:       { icon: '🤝', label: 'Reunião',      color: 'bg-green-100 text-green-800' },
  whatsapp:      { icon: '💬', label: 'WhatsApp',     color: 'bg-emerald-100 text-emerald-800' },
  linkedin:      { icon: '🔗', label: 'LinkedIn',     color: 'bg-blue-100 text-blue-800' },
  demo:          { icon: '🖥️', label: 'Demo',         color: 'bg-purple-100 text-purple-800' },
  test:          { icon: '🧪', label: 'Teste/POC',    color: 'bg-orange-100 text-orange-800' },
  proposal:      { icon: '📋', label: 'Proposta',     color: 'bg-yellow-100 text-yellow-800' },
  negotiation:   { icon: '💰', label: 'Negociação',   color: 'bg-red-100 text-red-800' },
  note:          { icon: '📝', label: 'Nota',         color: 'bg-gray-100 text-gray-700' },
  ai_suggestion: { icon: '🤖', label: 'Sugestão IA',  color: 'bg-indigo-100 text-indigo-800' },
  stage_change:  { icon: '📊', label: 'Etapa',        color: 'bg-teal-100 text-teal-800' }
};

const RESULT_CONFIG = {
  positivo: { icon: '✅', color: 'text-green-600' },
  neutro:   { icon: '➡️', color: 'text-gray-500' },
  negativo: { icon: '❌', color: 'text-red-600' },
  pendente: { icon: '⏳', color: 'text-yellow-600' }
};

const URGENCY_CONFIG = {
  overdue:   { label: 'Atrasado',  color: 'bg-red-500 text-white' },
  today:     { label: 'Hoje',      color: 'bg-orange-500 text-white' },
  upcoming:  { label: 'Próximo',   color: 'bg-yellow-400 text-yellow-900' },
  scheduled: { label: 'Agendado',  color: 'bg-gray-200 text-gray-700' }
};

// ============= METHODOLOGY CODES PER STAGE =============
const METHODOLOGY_ACTIVITIES = {
  1: [
    { code: '1A', label: 'Empresa potencial identificada', type: 'note' },
    { code: '1B', label: 'Pessoa de Contato identificada', type: 'note' },
    { code: '1C', label: 'Contatos iniciados para estimular interesse', type: 'call' },
    { code: '1D', label: 'Reunião agendada', type: 'meeting' }
  ],
  2: [
    { code: '2A', label: 'Reunião de qualificação realizada, dor admitida', type: 'meeting' },
    { code: '2B', label: 'Visão de solução elaborada (atividade interna)', type: 'note' },
    { code: '2C', label: 'DEMO com Visão ideal admitida por Pessoa de Contato', type: 'demo' },
    { code: '2D', label: 'Pessoa de Contato confirma processo de Compras', type: 'meeting' },
    { code: '2F', label: 'Pessoa de Contato concorda em acessar Tomador de Decisão', type: 'meeting' },
    { code: '2G', label: 'Acesso ao Tomador de Decisão confirmado por escrito', type: 'email' }
  ],
  3: [
    { code: '3A', label: 'Reunião com Tomador de Decisão realizada', type: 'meeting' },
    { code: '3B', label: 'Tomador de Decisão admite dor', type: 'meeting' },
    { code: '3C', label: 'Solução revisada com pré-vendas (inputs do TD)', type: 'note' },
    { code: '3D', label: 'TD formaliza visão e processo de compra', type: 'meeting' },
    { code: '3E', label: 'Proposta de plano de avaliação apresentada ao TD', type: 'proposal' },
    { code: '3F', label: 'Aprovação formal do TD para plano de avaliação', type: 'email' }
  ],
  4: [
    { code: '4A', label: 'Plano de avaliação implementado', type: 'test' },
    { code: '4B', label: 'Plano de avaliação finalizado', type: 'test' },
    { code: '4C', label: 'Resultado e prova de capacitação documentado', type: 'note' },
    { code: '4D', label: 'Validação dos resultados com TD realizada', type: 'meeting' },
    { code: '4E', label: 'Condições para proposta definidas', type: 'negotiation' },
    { code: '4F', label: 'Proposta elaborada', type: 'proposal' },
    { code: '4G', label: 'Proposta apresentada', type: 'proposal' },
    { code: '4H', label: 'Aprovação verbal do TD', type: 'meeting' }
  ],
  5: [
    { code: '5A', label: 'Compras retorna sobre proposta', type: 'negotiation' },
    { code: '5B', label: 'Condições negociadas e aceitas', type: 'negotiation' },
    { code: '5C', label: 'Contrato assinado', type: 'negotiation' },
    { code: '5D', label: 'Pedido de Compra recebido', type: 'email' },
    { code: '5E', label: 'Kick off realizado', type: 'meeting' }
  ],
  6: [
    { code: '6A', label: 'Implementação acompanhada', type: 'meeting' },
    { code: '6B', label: 'Indicadores de sucesso mensurados', type: 'note' },
    { code: '6C', label: 'Processo de case de referência iniciado', type: 'note' }
  ]
};

// ============= ACTIVITY SERVICE =============
class ActivityService {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async getByOpportunity(opportunityId) {
    const { data, error } = await this.supabase
      .from('activities')
      .select('*')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async create(activity) {
    const { data, error } = await this.supabase
      .from('activities')
      .insert([activity])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markDone(activityId) {
    const { error } = await this.supabase
      .from('activities')
      .update({ next_action_done: true })
      .eq('id', activityId);
    if (error) throw error;
  }

  async getPendingActions(vendor) {
    let query = this.supabase
      .from('pending_actions')
      .select('*')
      .order('next_action_date', { ascending: true });
    if (vendor) query = query.eq('vendor', vendor);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getVendorSummaries() {
    const { data, error } = await this.supabase.from('vendor_activity_summary').select('*');
    if (error) throw error;
    return data || [];
  }

  async getStaleOpportunities(minDays = 7) {
    const { data, error } = await this.supabase
      .from('stale_opportunities')
      .select('*')
      .gte('days_since_last_activity', minDays);
    if (error) throw error;
    return data || [];
  }

  async getCompletedMethodologyCodes(opportunityId) {
    const { data, error } = await this.supabase
      .from('activities')
      .select('methodology_code')
      .eq('opportunity_id', opportunityId)
      .not('methodology_code', 'is', null);
    if (error) throw error;
    return (data || []).map(a => a.methodology_code).filter(Boolean);
  }

  getSuggestedNextStep(stage, completedCodes) {
    const stageActivities = METHODOLOGY_ACTIVITIES[stage] || [];
    for (const activity of stageActivities) {
      if (!completedCodes.includes(activity.code)) return activity;
    }
    return null;
  }
}

// ============= ACTIVITY PANEL (goes inside opportunity detail) =============
export const ActivityPanel = ({ opportunity, currentUser, supabase }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [suggestedStep, setSuggestedStep] = useState(null);
  const [completedCodes, setCompletedCodes] = useState([]);
  const [formType, setFormType] = useState('call');
  const [formDescription, setFormDescription] = useState('');
  const [formResult, setFormResult] = useState('pendente');
  const [formNextAction, setFormNextAction] = useState('');
  const [formNextDate, setFormNextDate] = useState('');
  const [formMethodCode, setFormMethodCode] = useState('');
  const [saving, setSaving] = useState(false);

  const activityService = useMemo(() => new ActivityService(supabase), [supabase]);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      const [acts, codes] = await Promise.all([
        activityService.getByOpportunity(opportunity.id),
        activityService.getCompletedMethodologyCodes(opportunity.id)
      ]);
      setActivities(acts);
      setCompletedCodes(codes);
      setSuggestedStep(activityService.getSuggestedNextStep(opportunity.stage, codes));
    } catch (err) {
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  }, [opportunity.id, opportunity.stage, activityService]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const handleSubmit = async () => {
    if (!formDescription.trim()) return;
    setSaving(true);
    try {
      await activityService.create({
        opportunity_id: opportunity.id,
        vendor: currentUser || 'Desconhecido',
        activity_type: formType,
        description: formDescription.trim(),
        result: formResult,
        stage_at_time: opportunity.stage,
        methodology_code: formMethodCode || null,
        ai_suggested_action: null,
        ai_suggested_scales: null,
        ai_confidence: null,
        next_action: formNextAction.trim() || null,
        next_action_date: formNextDate || null,
        next_action_done: false,
        source: 'manual'
      });
      setFormDescription(''); setFormResult('pendente'); setFormNextAction('');
      setFormNextDate(''); setFormMethodCode(''); setShowForm(false);
      await loadActivities();
    } catch (err) {
      console.error('Error creating activity:', err);
      alert('Erro ao registrar atividade');
    } finally { setSaving(false); }
  };

  const useSuggestion = (s) => {
    setFormType(s.type); setFormDescription(s.label);
    setFormMethodCode(s.code); setShowForm(true);
  };

  const markComplete = async (id) => {
    try { await activityService.markDone(id); await loadActivities(); }
    catch (err) { console.error('Error:', err); }
  };

  const stageActivities = METHODOLOGY_ACTIVITIES[opportunity.stage] || [];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center text-white">
            <Clock className="w-5 h-5 mr-2" />
            <h3 className="font-bold text-lg">Atividades</h3>
            <span className="ml-2 bg-white bg-opacity-20 rounded-full px-2 py-0.5 text-xs">{activities.length}</span>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors flex items-center">
            <Plus className="w-4 h-4 mr-1" /> Registrar
          </button>
        </div>
      </div>

      {/* Suggested next step */}
      {suggestedStep && (
        <div className="p-3 bg-indigo-50 border-b border-indigo-200">
          <div className="flex items-start">
            <span className="text-lg mr-2">🤖</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-indigo-700 uppercase">Próximo passo sugerido</p>
              <p className="text-sm text-indigo-900 font-medium mt-0.5">
                <span className="bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded text-xs font-mono mr-1">{suggestedStep.code}</span>
                {suggestedStep.label}
              </p>
              <button onClick={() => useSuggestion(suggestedStep)}
                className="mt-1.5 text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 transition-colors">
                Usar como template →
              </button>
            </div>
          </div>
        </div>
      )}

      {!suggestedStep && completedCodes.length > 0 && stageActivities.length > 0 &&
       stageActivities.every(a => completedCodes.includes(a.code)) && (
        <div className="p-3 bg-green-50 border-b border-green-200">
          <div className="flex items-center">
            <span className="text-lg mr-2">✅</span>
            <p className="text-sm text-green-800 font-medium">
              Todas as atividades da Etapa {opportunity.stage} concluídas. <strong>Pronto para avançar!</strong>
            </p>
          </div>
        </div>
      )}

      {/* Checklist PPVVCC */}
      {stageActivities.length > 0 && (
        <div className="p-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Checklist Etapa {opportunity.stage}</p>
          <div className="grid grid-cols-1 gap-1">
            {stageActivities.map(act => {
              const done = completedCodes.includes(act.code);
              return (
                <div key={act.code} className={`flex items-center text-xs py-1 ${done ? 'text-green-700' : 'text-gray-500'}`}>
                  <span className="w-5 text-center">{done ? '✅' : '⬜'}</span>
                  <span className="font-mono bg-gray-200 text-gray-600 px-1 rounded mr-1.5">{act.code}</span>
                  <span className={done ? 'line-through' : ''}>{act.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-600">Tipo</label>
                <select value={formType} onChange={e => setFormType(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm mt-0.5">
                  {Object.entries(ACTIVITY_TYPE_CONFIG)
                    .filter(([k]) => !['ai_suggestion', 'stage_change'].includes(k))
                    .map(([key, cfg]) => <option key={key} value={key}>{cfg.icon} {cfg.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Atividade PPVVCC</label>
                <select value={formMethodCode} onChange={e => setFormMethodCode(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm mt-0.5">
                  <option value="">— Opcional —</option>
                  {stageActivities.map(act =>
                    <option key={act.code} value={act.code}>{act.code}: {act.label.substring(0, 40)}</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">O que aconteceu?</label>
              <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)}
                placeholder="Descreva a atividade realizada..."
                className="w-full p-2 border rounded-lg text-sm mt-0.5 h-20 resize-none" />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Resultado</label>
              <div className="flex gap-2 mt-0.5">
                {Object.entries(RESULT_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setFormResult(key)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      formResult === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {cfg.icon} {key.charAt(0).toUpperCase() + key.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600">Próximo passo</label>
                <input type="text" value={formNextAction} onChange={e => setFormNextAction(e.target.value)}
                  placeholder="O que fazer a seguir?" className="w-full p-2 border rounded-lg text-sm mt-0.5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Data</label>
                <input type="date" value={formNextDate} onChange={e => setFormNextDate(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm mt-0.5" />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmit} disabled={saving || !formDescription.trim()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center justify-center">
                {saving ? '⏳ Salvando...' : <><Save className="w-4 h-4 mr-1" /> Registrar Atividade</>}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-gray-500 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <span className="animate-spin inline-block text-2xl">⏳</span>
            <p className="text-sm mt-2">Carregando atividades...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">Nenhuma atividade registrada.</p>
            <button onClick={() => setShowForm(true)} className="mt-2 text-blue-600 text-sm font-medium hover:underline">
              Registrar primeira atividade →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map(act => {
              const typeConfig = ACTIVITY_TYPE_CONFIG[act.activity_type] || ACTIVITY_TYPE_CONFIG.note;
              const resultConfig = act.result ? RESULT_CONFIG[act.result] : null;
              return (
                <div key={act.id} className="p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start">
                    <span className="text-lg mr-2 mt-0.5">{typeConfig.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                        {act.methodology_code && (
                          <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-1 rounded">{act.methodology_code}</span>
                        )}
                        {resultConfig && <span className={`text-xs ${resultConfig.color}`}>{resultConfig.icon}</span>}
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(act.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mt-1">{act.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {act.source === 'ai_generated' ? '🤖 Ventus' : `👤 ${act.vendor}`}
                        {act.stage_at_time ? ` • Etapa ${act.stage_at_time}` : ''}
                      </p>

                      {act.next_action && !act.next_action_done && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-yellow-800">⏭ Próximo passo:</p>
                            <p className="text-xs text-yellow-700">{act.next_action}</p>
                            {act.next_action_date && (
                              <p className="text-xs text-yellow-600 mt-0.5">
                                📅 {new Date(act.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                          <button onClick={() => markComplete(act.id)}
                            className="ml-2 p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors" title="Marcar como concluído">
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {act.next_action && act.next_action_done && (
                        <p className="text-xs text-green-600 mt-1 line-through">✅ {act.next_action}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============= ACTIVITY DASHBOARD (new tab for management) =============
export const ActivityDashboard = ({ supabase, currentUser, isAdmin }) => {
  const [vendorSummaries, setVendorSummaries] = useState([]);
  const [pendingActions, setPendingActions] = useState([]);
  const [staleOpportunities, setStaleOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('pending');

  const activityService = useMemo(() => new ActivityService(supabase), [supabase]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaries, pending, stale] = await Promise.all([
          activityService.getVendorSummaries(),
          activityService.getPendingActions(isAdmin ? undefined : currentUser || undefined),
          activityService.getStaleOpportunities(5)
        ]);
        setVendorSummaries(summaries);
        setPendingActions(pending);
        setStaleOpportunities(stale);
      } catch (err) { console.error('Error loading activity dashboard:', err); }
      finally { setLoading(false); }
    };
    load();
  }, [activityService, currentUser, isAdmin]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">
        <span className="animate-spin inline-block text-4xl">⏳</span>
        <p className="mt-2">Carregando dashboard de atividades...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-500 font-semibold uppercase">Ações Atrasadas</p>
          <p className="text-3xl font-bold text-red-600">{pendingActions.filter(a => a.urgency === 'overdue').length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 font-semibold uppercase">Para Hoje</p>
          <p className="text-3xl font-bold text-orange-600">{pendingActions.filter(a => a.urgency === 'today').length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-yellow-500">
          <p className="text-xs text-gray-500 font-semibold uppercase">Oport. Estagnadas</p>
          <p className="text-3xl font-bold text-yellow-600">{staleOpportunities.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 font-semibold uppercase">Pendentes Total</p>
          <p className="text-3xl font-bold text-blue-600">{pendingActions.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2">
        {[
          { id: 'pending', label: '⏳ Ações Pendentes', count: pendingActions.length },
          { id: 'vendors', label: '👥 Por Vendedor', count: vendorSummaries.length },
          { id: 'stale', label: '⚠️ Estagnadas', count: staleOpportunities.length }
        ].map(tab => (
          <button key={tab.id} onClick={() => setViewMode(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              viewMode === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Pending actions */}
      {viewMode === 'pending' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {pendingActions.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">🎉</p><p>Nenhuma ação pendente!</p>
              </div>
            ) : pendingActions.map(action => {
              const urg = URGENCY_CONFIG[action.urgency] || URGENCY_CONFIG.scheduled;
              return (
                <div key={action.activity_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${urg.color}`}>{urg.label}</span>
                        <span className="font-semibold text-sm">{action.opportunity_name}</span>
                        <span className="text-xs text-gray-400">({action.client})</span>
                      </div>
                      <p className="text-sm text-gray-700">{action.next_action}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        👤 {action.vendor} • Etapa {action.stage}
                        {action.next_action_date && ` • 📅 ${new Date(action.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vendor summaries */}
      {viewMode === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendorSummaries.map(vs => (
            <div key={vs.vendor} className="bg-white rounded-xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-lg">{vs.vendor}</h4>
                {vs.overdue_actions > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                    {vs.overdue_actions} atrasada{vs.overdue_actions > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-blue-50 p-2 rounded">
                  <p className="text-xs text-blue-600 font-semibold">Últimos 7 dias</p>
                  <p className="text-xl font-bold text-blue-800">{vs.activities_last_7d}</p>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <p className="text-xs text-green-600 font-semibold">Últimos 30 dias</p>
                  <p className="text-xl font-bold text-green-800">{vs.activities_last_30d}</p>
                </div>
                <div className="bg-yellow-50 p-2 rounded">
                  <p className="text-xs text-yellow-600 font-semibold">Pendentes</p>
                  <p className="text-xl font-bold text-yellow-800">{vs.pending_actions}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-xs text-gray-600 font-semibold">Última atividade</p>
                  <p className="text-sm font-bold text-gray-800">
                    {vs.last_activity_at ? new Date(vs.last_activity_at).toLocaleDateString('pt-BR') : 'Nunca'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stale opportunities */}
      {viewMode === 'stale' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {staleOpportunities.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p className="text-3xl mb-2">✅</p><p>Nenhuma oportunidade estagnada!</p>
              </div>
            ) : staleOpportunities.map(opp => (
              <div key={opp.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{opp.name}</p>
                    <p className="text-sm text-gray-500">{opp.client} • 👤 {opp.vendor || 'Sem vendedor'} • Etapa {opp.stage}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      opp.days_since_last_activity > 14 ? 'text-red-600' :
                      opp.days_since_last_activity > 7 ? 'text-orange-600' : 'text-yellow-600'
                    }`}>
                      {Math.round(opp.days_since_last_activity)} dias
                    </p>
                    <p className="text-xs text-gray-400">sem atividade</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
