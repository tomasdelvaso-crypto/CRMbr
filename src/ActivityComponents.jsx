import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Save, Check, Clock, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, BarChart3, Target, Users, X, Loader2, Zap } from 'lucide-react';

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

const RESULT_OPTIONS = [
  { key: 'positivo', icon: '✅', label: 'Positivo', color: 'text-green-600' },
  { key: 'neutro',   icon: '➡️', label: 'Neutro',   color: 'text-gray-500' },
  { key: 'negativo', icon: '❌', label: 'Negativo', color: 'text-red-600' }
];

const URGENCY_CONFIG = {
  overdue:   { label: 'Atrasado',  color: 'bg-red-500 text-white' },
  today:     { label: 'Hoje',      color: 'bg-orange-500 text-white' },
  upcoming:  { label: 'Próximo',   color: 'bg-yellow-400 text-yellow-900' },
  scheduled: { label: 'Agendado',  color: 'bg-gray-200 text-gray-700' }
};

const METHODOLOGY_ACTIVITIES = {
  1: [
    { code: '1A', label: 'Empresa potencial identificada', type: 'note' },
    { code: '1B', label: 'Pessoa de Contato identificada', type: 'note' },
    { code: '1C', label: 'Contatos iniciados', type: 'call' },
    { code: '1D', label: 'Reunião agendada', type: 'meeting' }
  ],
  2: [
    { code: '2A', label: 'Reunião de qualificação, dor admitida', type: 'meeting' },
    { code: '2B', label: 'Visão de solução elaborada (interna)', type: 'note' },
    { code: '2C', label: 'DEMO com Visão admitida por PC', type: 'demo' },
    { code: '2D', label: 'PC confirma processo de Compras', type: 'meeting' },
    { code: '2F', label: 'PC concorda em acessar TD', type: 'meeting' },
    { code: '2G', label: 'Acesso ao TD confirmado por escrito', type: 'email' }
  ],
  3: [
    { code: '3A', label: 'Reunião com TD realizada', type: 'meeting' },
    { code: '3B', label: 'TD admite dor', type: 'meeting' },
    { code: '3C', label: 'Solução revisada com pré-vendas', type: 'note' },
    { code: '3D', label: 'TD formaliza visão e compra', type: 'meeting' },
    { code: '3E', label: 'Plano de avaliação apresentado', type: 'proposal' },
    { code: '3F', label: 'Aprovação formal do TD', type: 'email' }
  ],
  4: [
    { code: '4A', label: 'Plano de avaliação implementado', type: 'test' },
    { code: '4B', label: 'Plano finalizado', type: 'test' },
    { code: '4C', label: 'Resultado documentado', type: 'note' },
    { code: '4D', label: 'Validação com TD', type: 'meeting' },
    { code: '4E', label: 'Condições definidas', type: 'negotiation' },
    { code: '4F', label: 'Proposta elaborada', type: 'proposal' },
    { code: '4G', label: 'Proposta apresentada', type: 'proposal' },
    { code: '4H', label: 'Aprovação verbal do TD', type: 'meeting' }
  ],
  5: [
    { code: '5A', label: 'Compras retorna', type: 'negotiation' },
    { code: '5B', label: 'Condições aceitas', type: 'negotiation' },
    { code: '5C', label: 'Contrato assinado', type: 'negotiation' },
    { code: '5D', label: 'PO recebido', type: 'email' },
    { code: '5E', label: 'Kick off realizado', type: 'meeting' }
  ],
  6: [
    { code: '6A', label: 'Implementação acompanhada', type: 'meeting' },
    { code: '6B', label: 'Indicadores mensurados', type: 'note' },
    { code: '6C', label: 'Case de referência iniciado', type: 'note' }
  ]
};

class ActivityService {
  constructor(sb) { this.supabase = sb; }

  async getByOpportunity(id) {
    const { data, error } = await this.supabase.from('activities').select('*').eq('opportunity_id', id).order('created_at', { ascending: false });
    if (error) throw error; return data || [];
  }
  async getPendingAISuggestions(id) {
    const { data, error } = await this.supabase.from('activities').select('*').eq('opportunity_id', id).eq('source', 'ai_generated').eq('next_action_done', false).is('result', null).order('created_at', { ascending: true });
    if (error) throw error; return data || [];
  }
  async create(a) {
    const { data, error } = await this.supabase.from('activities').insert([a]).select().single();
    if (error) throw error; return data;
  }
  async markDone(id, result, vendorNote) {
    const u = { next_action_done: true, result };
    if (vendorNote) {
      const { data: orig } = await this.supabase.from('activities').select('description').eq('id', id).single();
      u.description = (orig?.description || '') + '\n---\n✅ Vendedor (' + result + '): ' + vendorNote;
    }
    const { error } = await this.supabase.from('activities').update(u).eq('id', id);
    if (error) throw error;
  }
  async markDiscarded(id, reason) {
    const { data: orig } = await this.supabase.from('activities').select('description').eq('id', id).single();
    const desc = (orig?.description || '') + '\n---\n❌ Descartado: ' + reason;
    const { error } = await this.supabase.from('activities').update({ next_action_done: true, result: 'descartado', description: desc }).eq('id', id);
    if (error) throw error;
  }
  async expirePending(id) {
    const { error } = await this.supabase.from('activities').update({ next_action_done: true, result: 'expirado' }).eq('opportunity_id', id).eq('source', 'ai_generated').eq('next_action_done', false).is('result', null);
    if (error) throw error;
  }
  async saveSuggestions(oppId, actions, vendor, stage) {
    const records = actions.map(a => ({
      opportunity_id: oppId, vendor: vendor || 'Ventus', activity_type: 'ai_suggestion',
      description: a.title + ' — ' + a.description, result: null, stage_at_time: stage,
      methodology_code: null, ai_suggested_action: a.draft_content || null,
      ai_suggested_scales: a.target_scale ? JSON.stringify({ target: a.target_scale, from: a.current_score, to: a.target_score }) : null,
      ai_confidence: null, next_action: a.title,
      next_action_date: new Date(Date.now() + 2*86400000).toISOString().split('T')[0],
      next_action_done: false, source: 'ai_generated'
    }));
    const { data, error } = await this.supabase.from('activities').insert(records).select();
    if (error) throw error; return data || [];
  }
  async getPendingActions(v) {
    let q = this.supabase.from('pending_actions').select('*').order('next_action_date', { ascending: true });
    if (v) q = q.eq('vendor', v);
    const { data, error } = await q; if (error) throw error; return data || [];
  }
  async getVendorSummaries() {
    const { data, error } = await this.supabase.from('vendor_activity_summary').select('*');
    if (error) throw error; return data || [];
  }
  async getStaleOpportunities(d = 7) {
    const { data, error } = await this.supabase.from('stale_opportunities').select('*').gte('days_since_last_activity', d);
    if (error) throw error; return data || [];
  }
  async getCompletedCodes(id) {
    const { data, error } = await this.supabase.from('activities').select('methodology_code').eq('opportunity_id', id).not('methodology_code', 'is', null);
    if (error) throw error; return (data || []).map(a => a.methodology_code).filter(Boolean);
  }
  getSuggestedNextStep(stage, codes) {
    for (const a of (METHODOLOGY_ACTIVITIES[stage] || [])) { if (!codes.includes(a.code)) return a; }
    return null;
  }
}

const AISuggestionCard = ({ activity, onMarkDone, onDiscard }) => {
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
        {scaleInfo && <span className="text-sm bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded font-mono font-semibold">{(scaleInfo.target || '').toUpperCase()} {scaleInfo.from}→{scaleInfo.to}</span>}
        <span className="text-sm text-gray-400 ml-auto">{new Date(activity.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
      </div>
      <p className="text-base font-semibold text-gray-900">{activity.next_action}</p>
      <p className="text-sm text-gray-600 mt-1">{activity.description}</p>

      {activity.ai_suggested_action && (
        <div className="mt-2">
          <button onClick={() => setShowDraft(!showDraft)} className="text-sm text-indigo-600 font-semibold flex items-center hover:text-indigo-800">
            {showDraft ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            {showDraft ? 'Ocultar rascunho' : 'Ver rascunho'}
          </button>
          {showDraft && <div className="mt-2 p-3 bg-white rounded-lg border text-sm text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto">{activity.ai_suggested_action}</div>}
        </div>
      )}

      {!mode && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setMode('done')} className="flex-1 min-w-[120px] py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 flex items-center justify-center">
            <Check className="w-4 h-4 mr-1" /> Feito
          </button>
          <button onClick={() => setMode('discard')} className="flex-1 min-w-[120px] py-2.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-300 flex items-center justify-center">
            <X className="w-4 h-4 mr-1" /> Descartar
          </button>
          {activity.ai_suggested_action && (
            <button onClick={() => { navigator.clipboard.writeText(activity.ai_suggested_action); alert('Copiado!'); }}
              className="py-2.5 px-3 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">📋</button>
          )}
        </div>
      )}

      {mode === 'done' && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-green-800">Resultado:</p>
          <div className="flex gap-2">
            {RESULT_OPTIONS.map(o => (
              <button key={o.key} onClick={() => setResult(o.key)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${result === o.key ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                {o.icon} {o.label}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Observações (opcional)..." className="w-full p-2.5 border rounded-lg text-sm h-16 resize-none" />
          <div className="flex gap-2">
            <button onClick={async () => { setSaving(true); try { await onMarkDone(activity.id, result, note || null); } finally { setSaving(false); } }} disabled={saving}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300">{saving ? '⏳' : '✅'} Confirmar</button>
            <button onClick={() => setMode(null)} className="px-4 py-2.5 text-gray-500 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {mode === 'discard' && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg space-y-3">
          <p className="text-sm font-semibold text-red-800">Motivo do descarte (obrigatório):</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex: cliente já tem contato, não aplica..." className="w-full p-2.5 border border-red-300 rounded-lg text-sm h-16 resize-none" />
          <div className="flex gap-2">
            <button onClick={async () => { if (!reason.trim()) { alert('Motivo obrigatório'); return; } setSaving(true); try { await onDiscard(activity.id, reason.trim()); } finally { setSaving(false); } }} disabled={saving || !reason.trim()}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300">{saving ? '⏳' : '❌'} Confirmar</button>
            <button onClick={() => setMode(null)} className="px-4 py-2.5 text-gray-500 border rounded-lg text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ActivityPanel = ({ opportunity, currentUser, supabase }) => {
  const [activities, setActivities] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestedStep, setSuggestedStep] = useState(null);
  const [codes, setCodes] = useState([]);
  const [formType, setFormType] = useState('call');
  const [formDesc, setFormDesc] = useState('');
  const [formResult, setFormResult] = useState('pendente');
  const [formNext, setFormNext] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formActivityDate, setFormActivityDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const svc = useMemo(() => new ActivityService(supabase), [supabase]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [a, p, c] = await Promise.all([svc.getByOpportunity(opportunity.id), svc.getPendingAISuggestions(opportunity.id), svc.getCompletedCodes(opportunity.id)]);
      setActivities(a); setPending(p); setCodes(c);
      setSuggestedStep(svc.getSuggestedNextStep(opportunity.stage, c));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [opportunity.id, opportunity.stage, svc]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const generate = async () => {
    setGenerating(true);
    try {
      await svc.expirePending(opportunity.id);
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'action_plan', opportunityData: opportunity, vendorName: currentUser }) });
      if (res.ok) {
        const d = await res.json();
        if (d.actionPlan?.actions?.length > 0) await svc.saveSuggestions(opportunity.id, d.actionPlan.actions, currentUser, opportunity.stage);
      }
      await loadAll();
    } catch (e) { console.error(e); alert('Erro ao gerar ações'); }
    finally { setGenerating(false); }
  };

  const stageActs = METHODOLOGY_ACTIVITIES[opportunity.stage] || [];
  const history = activities.filter(a => a.next_action_done || a.result);
  const shown = showHistory ? history : history.slice(0, 3);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mt-6">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center text-white">
            <Clock className="w-5 h-5 mr-2" />
            <h3 className="font-bold text-lg">Atividades & Ações</h3>
            <span className="ml-2 bg-white bg-opacity-20 rounded-full px-3 py-0.5 text-sm">{activities.length}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={generate} disabled={generating}
              className="bg-white bg-opacity-20 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-opacity-30 flex items-center disabled:opacity-50">
              {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
              {generating ? 'Gerando...' : pending.length > 0 ? 'Renovar ações' : 'Gerar ações IA'}
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50 flex items-center">
              <Plus className="w-4 h-4 mr-1" /> Manual
            </button>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
          <div className="flex items-center mb-3">
            <Zap className="w-5 h-5 text-indigo-600 mr-2" />
            <span className="font-bold text-base text-indigo-800">Ações Sugeridas ({pending.length})</span>
          </div>
          <div className="space-y-3">
            {pending.map(s => <AISuggestionCard key={s.id} activity={s} onMarkDone={async (id, r, n) => { await svc.markDone(id, r, n); await loadAll(); }} onDiscard={async (id, reason) => { await svc.markDiscarded(id, reason); await loadAll(); }} />)}
          </div>
        </div>
      )}

      {pending.length === 0 && !loading && !generating && (
        <div className="p-4 bg-gray-50 border-b text-center">
          <p className="text-sm text-gray-500 mb-2">Nenhuma ação pendente.</p>
          <button onClick={generate} className="text-sm text-indigo-600 font-semibold hover:text-indigo-800">🤖 Gerar sugestões →</button>
        </div>
      )}

      {stageActs.length > 0 && (
        <div className="p-4 border-b bg-gray-50">
          <p className="text-sm font-semibold text-gray-600 uppercase mb-2">Checklist Etapa {opportunity.stage}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {stageActs.map(a => {
              const done = codes.includes(a.code);
              return (<div key={a.code} className={`flex items-center text-sm py-1.5 ${done ? 'text-green-700' : 'text-gray-500'}`}>
                <span className="w-6 text-center">{done ? '✅' : '⬜'}</span>
                <span className="font-mono bg-gray-200 text-gray-600 px-1.5 rounded mr-2 text-xs">{a.code}</span>
                <span className={done ? 'line-through' : ''}>{a.label}</span>
              </div>);
            })}
          </div>
          {suggestedStep && <div className="mt-3 p-2 bg-indigo-50 rounded-lg flex items-center"><span className="mr-2">🤖</span><span className="text-sm text-indigo-800">Próximo: <strong>{suggestedStep.code}</strong> — {suggestedStep.label}</span></div>}
        </div>
      )}

      {showForm && (
        <div className="p-4 bg-blue-50 border-b">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="text-sm font-semibold text-gray-600">Data da atividade</label>
                <input type="date" value={formActivityDate} onChange={e => setFormActivityDate(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm mt-1" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Tipo</label>
                <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm mt-1">
                  {Object.entries(ACTIVITY_TYPE_CONFIG).filter(([k]) => !['ai_suggestion','stage_change'].includes(k)).map(([k,c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
                </select></div>
              <div><label className="text-sm font-semibold text-gray-600">PPVVCC</label>
                <select value={formCode} onChange={e => setFormCode(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm mt-1">
                  <option value="">— Opcional —</option>
                  {stageActs.map(a => <option key={a.code} value={a.code}>{a.code}: {a.label}</option>)}
                </select></div>
            </div>
            <div><label className="text-sm font-semibold text-gray-600">O que aconteceu?</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descreva..." className="w-full p-2.5 border rounded-lg text-sm mt-1 h-20 resize-none" /></div>
            <div><label className="text-sm font-semibold text-gray-600">Resultado</label>
              <div className="flex gap-2 mt-1">
                {RESULT_OPTIONS.map(o => (<button key={o.key} onClick={() => setFormResult(o.key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${formResult === o.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>{o.icon} {o.label}</button>))}
              </div></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2"><label className="text-sm font-semibold text-gray-600">Próximo passo</label>
                <input type="text" value={formNext} onChange={e => setFormNext(e.target.value)} placeholder="O que fazer?" className="w-full p-2.5 border rounded-lg text-sm mt-1" /></div>
              <div><label className="text-sm font-semibold text-gray-600">Data</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full p-2.5 border rounded-lg text-sm mt-1" /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { if (!formDesc.trim()) return; setSaving(true); try { await svc.create({ opportunity_id: opportunity.id, vendor: currentUser||'', activity_type: formType, description: formDesc.trim(), result: formResult, stage_at_time: opportunity.stage, methodology_code: formCode||null, ai_suggested_action: null, ai_suggested_scales: null, ai_confidence: null, next_action: formNext.trim()||null, next_action_date: formDate||null, next_action_done: false, source: 'manual', activity_date: formActivityDate||null }); setFormDesc('');setFormResult('pendente');setFormNext('');setFormDate('');setFormCode('');setFormActivityDate(new Date().toISOString().split('T')[0]);setShowForm(false); await loadAll(); } catch(e){alert('Erro');} finally{setSaving(false);} }} disabled={saving||!formDesc.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:bg-gray-300 flex items-center justify-center">
                {saving ? '⏳' : <><Save className="w-4 h-4 mr-1" /> Registrar</>}</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-gray-500 border rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t">
        <div className="p-3 flex items-center justify-between bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">Histórico ({history.length})</span>
          {history.length > 3 && <button onClick={() => setShowHistory(!showHistory)} className="text-sm text-blue-600 font-medium">{showHistory ? 'Menos' : `Ver todas (${history.length})`}</button>}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          : shown.length === 0 ? <div className="p-6 text-center text-gray-400"><p className="text-2xl mb-1">📭</p><p className="text-sm">Nenhuma atividade ainda.</p></div>
          : <div className="divide-y">{shown.map(a => {
            const t = ACTIVITY_TYPE_CONFIG[a.activity_type]||ACTIVITY_TYPE_CONFIG.note;
            const r = RESULT_OPTIONS.find(o => o.key === a.result);
            const disc = a.result === 'descartado';
            const exp = a.result === 'expirado';
            return (<div key={a.id} className={`p-3 hover:bg-gray-50 ${disc||exp?'opacity-60':''}`}>
              <div className="flex items-start">
                <span className="text-base mr-2 mt-0.5">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${t.color}`}>{t.label}</span>
                    {a.methodology_code && <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-1.5 rounded">{a.methodology_code}</span>}
                    {r && <span className={`text-sm ${r.color}`}>{r.icon}</span>}
                    {disc && <span className="text-xs bg-red-100 text-red-600 px-1.5 rounded">Descartado</span>}
                    {exp && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">Expirado</span>}
                    <span className="text-xs text-gray-400 ml-auto">{new Date(a.activity_date || a.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}{!a.activity_date ? ' '+new Date(a.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}</span>
                  </div>
                  <p className="text-sm text-gray-800 mt-1">{a.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.source==='ai_generated'?'🤖 Ventus':'👤 '+a.vendor}{a.stage_at_time?' • Etapa '+a.stage_at_time:''}</p>
                </div>
              </div>
            </div>);
          })}</div>}
        </div>
      </div>
    </div>
  );
};

export const ActivityDashboard = ({ supabase, currentUser, isAdmin }) => {
  const [vendorSummaries, setVendorSummaries] = useState([]);
  const [allPending, setAllPending] = useState([]);
  const [allStale, setAllStale] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('pending');
  const [vendorFilter, setVendorFilter] = useState(isAdmin ? 'all' : (currentUser || 'all'));
  const svc = useMemo(() => new ActivityService(supabase), [supabase]);

  // Sync with header vendor selector (only for non-admins)
  useEffect(() => {
    if (currentUser && !isAdmin) setVendorFilter(currentUser);
  }, [currentUser, isAdmin]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { 
        const [v, p, s] = await Promise.all([
          svc.getVendorSummaries(), 
          svc.getPendingActions(), 
          svc.getStaleOpportunities(5)
        ]); 
        setVendorSummaries(v);
        setAllPending(p);
        setAllStale(s); 
      }
      catch(e){ console.error(e); } 
      finally{ setLoading(false); }
    })();
  }, [svc]);

  // Filter everything by selected vendor
  const pending = vendorFilter === 'all' ? allPending : allPending.filter(a => a.vendor === vendorFilter);
  const stale = vendorFilter === 'all' ? allStale : allStale.filter(o => {
    if (!o.vendor || !o.vendor.trim()) return vendorFilter === 'all';
    return o.vendor === vendorFilter;
  });
  const vendors = vendorFilter === 'all' ? vendorSummaries : vendorSummaries.filter(v => v.vendor === vendorFilter);

  // Build unique vendor list from all data sources
  const vendorNames = [...new Set([
    ...allPending.map(a => a.vendor),
    ...allStale.map(o => o.vendor),
    ...vendorSummaries.map(v => v.vendor)
  ].filter(v => v && v.trim()))].sort();

  if (loading) return <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" /><p className="text-base text-gray-400">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      {/* Header with filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">📋 Gestão de Atividades</h2>
        <div className="flex items-center gap-3">
          <span className="text-base text-gray-500 font-medium">Filtrar:</span>
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-base font-medium focus:ring-2 focus:ring-blue-500 min-w-[200px]">
            <option value="all">👥 Todos vendedores</option>
            {vendorNames.map(v => <option key={v} value={v}>👤 {v}</option>)}
          </select>
          {vendorFilter !== 'all' && (
            <button onClick={() => setVendorFilter('all')} 
              className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-red-500">
          <p className="text-sm text-gray-500 font-semibold uppercase">Atrasadas</p>
          <p className="text-4xl font-bold text-red-600 mt-1">{pending.filter(a => a.urgency === 'overdue').length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-orange-500">
          <p className="text-sm text-gray-500 font-semibold uppercase">Hoje</p>
          <p className="text-4xl font-bold text-orange-600 mt-1">{pending.filter(a => a.urgency === 'today').length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500 font-semibold uppercase">Estagnadas</p>
          <p className="text-4xl font-bold text-yellow-600 mt-1">{stale.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-5 border-l-4 border-blue-500">
          <p className="text-sm text-gray-500 font-semibold uppercase">Pendentes</p>
          <p className="text-4xl font-bold text-blue-600 mt-1">{pending.length}</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'pending', label: '⏳ Pendentes', c: pending.length },
          { id: 'vendors', label: '👥 Vendedores', c: vendors.length },
          { id: 'stale', label: '⚠️ Estagnadas', c: stale.length }
        ].map(t =>
          <button key={t.id} onClick={() => setView(t.id)} 
            className={`px-4 py-2.5 rounded-lg font-medium text-base ${view === t.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label} ({t.c})
          </button>
        )}
      </div>

      {/* Pending actions */}
      {view === 'pending' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {pending.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <p className="text-4xl mb-2">🎉</p>
                <p className="text-base">{vendorFilter !== 'all' ? `Nenhuma ação pendente para ${vendorFilter}` : 'Nenhuma ação pendente!'}</p>
              </div>
            ) : pending.map(a => {
              const u = URGENCY_CONFIG[a.urgency] || URGENCY_CONFIG.scheduled;
              return (
                <div key={a.activity_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${u.color}`}>{u.label}</span>
                    <span className="font-semibold text-base">{a.opportunity_name}</span>
                    <span className="text-sm text-gray-400">({a.client})</span>
                  </div>
                  <p className="text-base text-gray-700">{a.next_action}</p>
                  <p className="text-sm text-gray-400 mt-1">
                    👤 {a.vendor} • Etapa {a.stage}
                    {a.next_action_date && ` • 📅 ${new Date(a.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vendor summaries */}
      {view === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendors.length === 0 ? (
            <div className="col-span-2 p-10 text-center text-gray-400 bg-white rounded-xl shadow-lg">
              <p className="text-base">Nenhum vendedor com atividades registradas.</p>
            </div>
          ) : vendors.map(v => (
            <div key={v.vendor} className="bg-white rounded-xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-xl">{v.vendor}</h4>
                {v.overdue_actions > 0 && (
                  <span className="bg-red-500 text-white text-sm px-3 py-1 rounded-full font-bold">
                    {v.overdue_actions} atrasada{v.overdue_actions > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-600 font-semibold">7 dias</p>
                  <p className="text-2xl font-bold text-blue-800">{v.activities_last_7d}</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm text-green-600 font-semibold">30 dias</p>
                  <p className="text-2xl font-bold text-green-800">{v.activities_last_30d}</p>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg">
                  <p className="text-sm text-yellow-600 font-semibold">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-800">{v.pending_actions}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600 font-semibold">Última</p>
                  <p className="text-base font-bold text-gray-800">
                    {v.last_activity_at ? new Date(v.last_activity_at).toLocaleDateString('pt-BR') : 'Nunca'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stale opportunities */}
      {view === 'stale' && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {stale.length === 0 ? (
              <div className="p-10 text-center text-gray-400">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-base">{vendorFilter !== 'all' ? `Nenhuma estagnada para ${vendorFilter}` : 'Nenhuma estagnada!'}</p>
              </div>
            ) : stale.map(o => (
              <div key={o.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-base">{o.name}</p>
                    <p className="text-sm text-gray-500">{o.client} • 👤 {o.vendor || 'Sem vendedor'} • Etapa {o.stage}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${o.days_since_last_activity > 14 ? 'text-red-600' : o.days_since_last_activity > 7 ? 'text-orange-600' : 'text-yellow-600'}`}>
                      {Math.round(o.days_since_last_activity)} dias
                    </p>
                    <p className="text-sm text-gray-400">sem atividade</p>
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
