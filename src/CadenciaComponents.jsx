import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, Plus, Search, Phone, Mail, MessageCircle, Linkedin,
  ChevronRight, X, CheckCircle, XCircle, Clock, AlertTriangle,
  Archive, RotateCcw, Target, Users, TrendingUp, Calendar,
  Building2, User, ExternalLink, ArrowRight, Brain, Edit3
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

const CADENCE_SCHEDULE = [
  { tp: 1, day: 1,  channel: 'linkedin',  label: 'Conexão + mensagem personalizada' },
  { tp: 2, day: 3,  channel: 'whatsapp',  label: 'Apresentação curta, pedir reunião' },
  { tp: 3, day: 6,  channel: 'email',     label: 'Email de valor com caso de referência' },
  { tp: 4, day: 10, channel: 'whatsapp',  label: 'Follow-up, perguntar se viu o email' },
  { tp: 5, day: 13, channel: 'phone',     label: 'Chamada direta' },
  { tp: 6, day: 17, channel: 'email',     label: 'Último email formal' },
  { tp: 7, day: 21, channel: 'whatsapp',  label: 'Mensagem de despedida' },
];

const CHANNEL_CONFIG = {
  linkedin:  { icon: Linkedin,       label: 'LinkedIn',  color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  whatsapp:  { icon: MessageCircle,  label: 'WhatsApp',  color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
  email:     { icon: Mail,           label: 'Email',     color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  phone:     { icon: Phone,          label: 'Telefone',  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
};

const RESULT_CONFIG = {
  no_response:       { label: 'Sem resposta',       icon: '⏳', color: 'text-gray-500',  bg: 'bg-gray-100' },
  interested:        { label: 'Respondeu interessado', icon: '🟢', color: 'text-green-600', bg: 'bg-green-100' },
  not_now:           { label: 'Respondeu "não agora"', icon: '🟡', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  not_interested:    { label: 'Não tem interesse',     icon: '🔴', color: 'text-red-600',   bg: 'bg-red-100' },
  meeting_scheduled: { label: 'Reunião agendada!',     icon: '🎯', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  other:             { label: 'Outro',                 icon: '📝', color: 'text-gray-600',   bg: 'bg-gray-100' },
};

const STAGE_CONFIG = {
  '1a': { label: '1A · Empresa identificada',    color: 'bg-gray-500',    lightBg: 'bg-gray-50' },
  '1b': { label: '1B · Contacto identificado',   color: 'bg-blue-500',    lightBg: 'bg-blue-50' },
  '1c': { label: '1C · Estimulando interesse',   color: 'bg-yellow-500',  lightBg: 'bg-yellow-50' },
  '1d': { label: '1D · Reunião agendada',        color: 'bg-green-500',   lightBg: 'bg-green-50' },
};

const daysBetween = (d1, d2) => Math.floor((d2 - d1) / 86400000);
const today = () => new Date().toISOString().split('T')[0];

function calcNextTouchpointDate(touchpointsCount, fromDate) {
  const next = CADENCE_SCHEDULE[touchpointsCount]; // 0-indexed: count=0 means next is TP1
  if (!next) return null;
  const base = fromDate ? new Date(fromDate) : new Date();
  base.setDate(base.getDate() + (next.day - (CADENCE_SCHEDULE[touchpointsCount - 1]?.day || 0)));
  return base.toISOString().split('T')[0];
}

// Empty scales for opportunity conversion
const emptyScales = () => ({
  dor:      { score: 0, description: '' },
  poder:    { score: 0, description: '' },
  visao:    { score: 0, description: '' },
  valor:    { score: 0, description: '' },
  controle: { score: 0, description: '' },
  compras:  { score: 0, description: '' },
});

// ── LeadService ──────────────────────────────────────────────────────────────

class LeadService {
  constructor(sb) { this.supabase = sb; }

  async getLeads(vendor, isAdmin, statusFilter = 'active') {
    let q = this.supabase.from('leads').select('*').order('next_touchpoint_date', { ascending: true, nullsFirst: false });
    if (statusFilter === 'archived') {
      q = q.eq('status', 'archived');
    } else if (statusFilter === 'converted') {
      q = q.eq('status', 'converted');
    } else {
      q = q.eq('status', 'active');
    }
    // RLS handles vendor filtering, but for admin with vendorFilter we add it
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async createLead(data) {
    const nextDate = calcNextTouchpointDate(0, today());
    const record = {
      ...data,
      touchpoints_count: 0,
      next_touchpoint_date: nextDate,
      status: 'active',
      stage: data.stage || '1a',
      created_at: new Date().toISOString(),
    };
    const { data: result, error } = await this.supabase.from('leads').insert([record]).select().single();
    if (error) throw error;
    return result;
  }

  async updateLead(id, data) {
    const { data: result, error } = await this.supabase.from('leads').update(data).eq('id', id).select().single();
    if (error) throw error;
    return result;
  }

  async archiveLead(id) {
    const { error } = await this.supabase.from('leads').update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      recycle_after: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    }).eq('id', id);
    if (error) throw error;
  }

  async recycleLead(id) {
    const nextDate = calcNextTouchpointDate(0, today());
    const { error } = await this.supabase.from('leads').update({
      status: 'active',
      archived_at: null,
      recycle_after: null,
      touchpoints_count: 0,
      next_touchpoint_date: nextDate,
      last_touchpoint_date: null,
      stage: '1a',
    }).eq('id', id);
    if (error) throw error;
  }

  async convertToOpportunity(lead) {
    // 1. Create opportunity
    const opp = {
      name: `Prospecção — ${lead.company_name}`,
      client: lead.company_name,
      vendor: lead.vendor,
      value: 0,
      stage: 1,
      priority: 'média',
      probability: 0,
      last_update: today(),
      scales: emptyScales(),
      sponsor: lead.contact_name || null,
      influencer: null,
      power_sponsor: null,
      support_contact: null,
      product: null,
      expected_close: null,
      next_action: `Reunião com ${lead.contact_name || 'contacto'} — lead convertido da cadência`,
      industry: null,
      product_lines: [],
    };
    const { data: newOpp, error: oppErr } = await this.supabase.from('opportunities').insert([opp]).select().single();
    if (oppErr) throw oppErr;

    // 2. Update lead
    const { error: leadErr } = await this.supabase.from('leads').update({
      status: 'converted',
      opportunity_id: newOpp.id,
    }).eq('id', lead.id);
    if (leadErr) throw leadErr;

    return newOpp;
  }

  async checkCollision(companyName, vendor) {
    const { data, error } = await this.supabase.rpc('check_company_collision', {
      p_company_name: companyName,
      p_vendor: vendor,
    });
    if (error) throw error;
    if (data && data.length > 0 && data[0].is_taken) {
      return { collision: true, takenBy: data[0].taken_by };
    }
    return { collision: false };
  }
}

// ── TouchpointService ────────────────────────────────────────────────────────

class TouchpointService {
  constructor(sb) { this.supabase = sb; }

  async getByLead(leadId) {
    const { data, error } = await this.supabase.from('touchpoints').select('*')
      .eq('lead_id', leadId).order('sequence_number', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async register(leadId, data) {
    // Get REAL count from DB to avoid stale state
    const { data: existing, error: countErr } = await this.supabase
      .from('touchpoints').select('id').eq('lead_id', leadId);
    if (countErr) throw countErr;
    const seqNum = (existing?.length || 0) + 1;

    if (seqNum > 7) throw new Error('Máximo de 7 touchpoints atingido');

    const tp = {
      lead_id: leadId,
      sequence_number: seqNum,
      channel: data.channel,
      result: data.result,
      notes: data.notes || null,
      executed_at: new Date().toISOString(),
    };
    const { error: tpErr } = await this.supabase.from('touchpoints').insert([tp]);
    if (tpErr) throw tpErr;

    // Get fresh lead data
    const { data: freshLead } = await this.supabase.from('leads').select('*').eq('id', leadId).single();

    // Stage progression:
    // meeting_scheduled → 1d
    // interested/not_now response → 1c (engagement)
    // has contact + at least 1 touchpoint → 1b
    let newStage = freshLead?.stage || '1a';
    if (data.result === 'meeting_scheduled') {
      newStage = '1d';
    } else if (['interested', 'not_now'].includes(data.result)) {
      newStage = '1c';
    } else if (newStage === '1a' && freshLead?.contact_name) {
      newStage = '1b';
    }

    const nextDate = seqNum < 7 ? calcNextTouchpointDate(seqNum, today()) : null;

    const { error: updErr } = await this.supabase.from('leads').update({
      touchpoints_count: seqNum,
      last_touchpoint_date: today(),
      next_touchpoint_date: nextDate,
      stage: newStage,
    }).eq('id', leadId);
    if (updErr) throw updErr;

    return { sequenceNumber: seqNum, result: data.result };
  }
}

// ── LeadCard ─────────────────────────────────────────────────────────────────

const LeadCard = ({ lead, onClick }) => {
  const daysSinceLast = lead.last_touchpoint_date
    ? daysBetween(new Date(lead.last_touchpoint_date), new Date())
    : daysBetween(new Date(lead.created_at), new Date());

  // Urgency: 3+ days = yellow, 5+ days = red
  const urgency = lead.status === 'active'
    ? (daysSinceLast >= 5 ? 'red' : daysSinceLast >= 3 ? 'yellow' : 'green')
    : 'none';

  const nextTP = CADENCE_SCHEDULE[lead.touchpoints_count] || null;
  const nextChannel = nextTP ? CHANNEL_CONFIG[nextTP.channel] : null;
  const NextIcon = nextChannel?.icon || Clock;

  const borderClass = urgency === 'red'
    ? 'border-l-4 border-red-500 bg-red-50/50'
    : urgency === 'yellow'
    ? 'border-l-4 border-yellow-400 bg-yellow-50/50'
    : 'border-gray-200 hover:border-blue-300';

  return (
    <div
      onClick={() => onClick(lead)}
      className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer hover:shadow-md transition-all ${borderClass}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800 text-sm truncate">{lead.company_name}</p>
          {lead.contact_name && (
            <p className="text-xs text-gray-500 truncate">{lead.contact_name}{lead.contact_title ? ` · ${lead.contact_title}` : ''}</p>
          )}
        </div>
        {urgency === 'red' && (
          <span className="flex-shrink-0 text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-2 animate-pulse">
            🔴 {daysSinceLast}d
          </span>
        )}
        {urgency === 'yellow' && (
          <span className="flex-shrink-0 text-xs font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full ml-2">
            🟡 {daysSinceLast}d
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        {/* Progress */}
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} className={`w-3 h-1.5 rounded-full ${
                i <= lead.touchpoints_count ? 'bg-blue-500' : 'bg-gray-200'
              }`} />
            ))}
          </div>
          <span className="text-xs text-gray-500 font-medium">{lead.touchpoints_count}/7</span>
        </div>

        {/* Next channel + days */}
        <div className="flex items-center gap-2">
          {nextChannel && (
            <span className={`${nextChannel.bg} ${nextChannel.color} p-1 rounded`}>
              <NextIcon className="w-3 h-3" />
            </span>
          )}
          <span className={`text-xs font-medium ${urgency === 'red' ? 'text-red-600' : urgency === 'yellow' ? 'text-yellow-600' : 'text-gray-400'}`}>
            {daysSinceLast}d
          </span>
        </div>
      </div>

      {lead.source && lead.source !== 'manual' && (
        <div className="mt-2">
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{lead.source}</span>
        </div>
      )}
    </div>
  );
};

// ── TouchpointPanel (sidebar) ────────────────────────────────────────────────

const TouchpointPanel = ({ lead, supabase, onClose, onUpdate, onConvert }) => {
  const [touchpoints, setTouchpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [ventusAdvice, setVentusAdvice] = useState(null);
  const [ventusLoading, setVentusLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [editingTp, setEditingTp] = useState(null); // { id, channel, result, notes }

  // Reset edit form when lead changes
  useEffect(() => {
    setEditing(false);
    setEditingTp(null);
    setVentusAdvice(null);
    setEditForm({
      company_name: lead.company_name || '',
      company_domain: lead.company_domain || '',
      contact_name: lead.contact_name || '',
      contact_title: lead.contact_title || '',
      contact_email: lead.contact_email || '',
      contact_phone: lead.contact_phone || '',
      contact_whatsapp: lead.contact_whatsapp || '',
      contact_linkedin: lead.contact_linkedin || '',
      notes: lead.notes || '',
    });
  }, [lead.id]);

  const tpSvc = useMemo(() => new TouchpointService(supabase), [supabase]);

  const loadTouchpoints = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tpSvc.getByLead(lead.id);
      setTouchpoints(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [lead.id, tpSvc]);

  useEffect(() => { loadTouchpoints(); }, [loadTouchpoints]);

  // Pre-fill next channel
  useEffect(() => {
    const next = CADENCE_SCHEDULE[lead.touchpoints_count];
    if (next) setChannel(next.channel);
  }, [lead.touchpoints_count]);

  const handleRegister = async () => {
    if (!channel || !result) return;
    if (result === 'other' && !notes.trim()) { alert('Para resultado "Outro", a nota é obrigatória.'); return; }
    setSaving(true);
    try {
      await tpSvc.register(lead.id, { channel, result, notes });
      setResult('');
      setNotes('');
      await loadTouchpoints();
      onUpdate(); // refresh parent lead list

      // Conversion: after updating everything, ask to convert
      if (result === 'meeting_scheduled') {
        // Fetch fresh lead for conversion
        const { data: freshLead } = await tpSvc.supabase.from('leads').select('*').eq('id', lead.id).single();
        if (freshLead) onConvert(freshLead);
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao registrar touchpoint: ' + (e.message || e));
    }
    finally { setSaving(false); }
  };

  const askVentus = async () => {
    setVentusLoading(true);
    setVentusAdvice(null);
    try {
      const nextTP = CADENCE_SCHEDULE[lead.touchpoints_count];
      const ch = nextTP ? CHANNEL_CONFIG[nextTP.channel] : null;
      const tpHistory = touchpoints.map(tp => {
        const r = RESULT_CONFIG[tp.result];
        return `TP${tp.sequence_number} (${CHANNEL_CONFIG[tp.channel]?.label || tp.channel}): ${r?.label || tp.result}${tp.notes ? ' — ' + tp.notes : ''}`;
      }).join('\n');

      const prompt = `Gere uma sugestão prática para o próximo touchpoint de prospecção.

LEAD:
- Empresa: ${lead.company_name}
- Contato: ${lead.contact_name || 'Não identificado'}${lead.contact_title ? ' (' + lead.contact_title + ')' : ''}
- Email: ${lead.contact_email || 'N/A'}
- Telefone: ${lead.contact_phone || 'N/A'}
- LinkedIn: ${lead.contact_linkedin || 'N/A'}
- Etapa: ${STAGE_CONFIG[lead.stage]?.label || lead.stage}
- Touchpoints: ${lead.touchpoints_count}/7

${tpHistory ? 'HISTÓRICO:\n' + tpHistory : 'Nenhum touchpoint ainda.'}

PRÓXIMO: TP${(lead.touchpoints_count || 0) + 1} via ${ch?.label || (nextTP?.channel || 'canal a definir')}
${nextTP ? 'Cadência sugere: ' + nextTP.label : ''}

Gere: 1) Mensagem pronta para enviar adaptada ao canal. 2) Dica rápida. Máximo 150 palavras.`;

      const resp = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: prompt, vendorName: lead.vendor, requestType: 'cadencia' })
      });
      const data = await resp.json();
      setVentusAdvice(data.response || 'Sem resposta do Ventus.');
    } catch (e) {
      console.error(e);
      setVentusAdvice('❌ Erro ao consultar o Ventus. Tente novamente.');
    }
    finally { setVentusLoading(false); }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const leadSvc = new LeadService(supabase);
      await leadSvc.updateLead(lead.id, {
        company_name: editForm.company_name.trim() || lead.company_name,
        company_domain: editForm.company_domain.trim() || null,
        contact_name: editForm.contact_name.trim() || null,
        contact_title: editForm.contact_title.trim() || null,
        contact_email: editForm.contact_email.trim() || null,
        contact_phone: editForm.contact_phone.trim() || null,
        contact_whatsapp: editForm.contact_whatsapp.trim() || null,
        contact_linkedin: editForm.contact_linkedin.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setEditing(false);
      onUpdate();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar: ' + (e.message || e));
    }
    finally { setSaving(false); }
  };

  const canRegister = lead.status === 'active' && lead.touchpoints_count < 7;
  const nextTP = CADENCE_SCHEDULE[lead.touchpoints_count];

  return (
    <div className="fixed top-0 right-0 h-full w-[440px] z-[55] bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header - fixed */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base truncate">{lead.company_name}</h3>
            {lead.contact_name && <p className="text-sm opacity-90 truncate">{lead.contact_name}{lead.contact_title ? ` — ${lead.contact_title}` : ''}</p>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 flex gap-3 text-sm bg-white/15 rounded-lg px-3 py-1.5">
          <span>📊 {lead.touchpoints_count}/7 TP</span>
          <span>📍 {STAGE_CONFIG[lead.stage]?.label.split('·')[0]}</span>
          <span className={`font-semibold ${lead.status === 'active' ? 'text-green-200' : lead.status === 'converted' ? 'text-yellow-200' : 'text-gray-300'}`}>
            {lead.status === 'active' ? '● Ativo' : lead.status === 'converted' ? '✓ Convertido' : '⏸ Arquivado'}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

      {/* Contact info / Edit form */}
      {!editing ? (
        <div className="p-3 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dados do Contato</span>
            <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Editar
            </button>
          </div>
          <div className="space-y-1.5">
            {lead.contact_email && (
              <a href={`mailto:${lead.contact_email}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {lead.contact_email}
              </a>
            )}
            {lead.contact_phone && (
              <a href={`tel:${lead.contact_phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {lead.contact_phone}
              </a>
            )}
            {(lead.contact_whatsapp || lead.contact_phone) && (
              <a href={`https://wa.me/${(() => { const n = ((lead.contact_whatsapp || lead.contact_phone) || '').replace(/[^0-9]/g, ''); return n.startsWith('55') ? n : '55' + n; })()}`}
                target="_blank" rel="noopener"
                className="text-xs text-green-700 hover:text-green-900 bg-green-100 px-2 py-1 rounded-lg font-semibold flex items-center gap-1.5 w-fit">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp {lead.contact_whatsapp || lead.contact_phone}
              </a>
            )}
            {lead.contact_linkedin && (
              <a href={lead.contact_linkedin.startsWith('http') ? lead.contact_linkedin : `https://${lead.contact_linkedin}`}
                target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-1.5">
                <Linkedin className="w-3.5 h-3.5" /> LinkedIn
              </a>
            )}
            {lead.company_domain && (
              <a href={lead.company_domain.startsWith('http') ? lead.company_domain : `https://${lead.company_domain}`}
                target="_blank" rel="noopener" className="text-xs text-gray-500 hover:underline flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" /> {lead.company_domain}
              </a>
            )}
            {lead.notes && <p className="text-xs text-gray-500 mt-1 italic">📝 {lead.notes}</p>}
            {!lead.contact_email && !lead.contact_phone && !lead.contact_linkedin && (
              <p className="text-xs text-gray-400">Nenhum dado de contato. <button onClick={() => setEditing(true)} className="text-blue-600 underline">Adicionar</button></p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 border-b bg-blue-50 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Editando Lead</span>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
          <input value={editForm.company_name} onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))}
            className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Empresa *" />
          <input value={editForm.company_domain} onChange={e => setEditForm(f => ({ ...f, company_domain: e.target.value }))}
            className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Domínio (empresa.com.br)" />
          <div className="grid grid-cols-2 gap-2">
            <input value={editForm.contact_name} onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))}
              className="border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Nome do contato" />
            <input value={editForm.contact_title} onChange={e => setEditForm(f => ({ ...f, contact_title: e.target.value }))}
              className="border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Cargo" />
          </div>
          <input value={editForm.contact_email} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))}
            className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Email" type="email" />
          <div className="grid grid-cols-2 gap-2">
            <input value={editForm.contact_phone} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))}
              className="border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="📞 Telefone" type="tel" />
            <input value={editForm.contact_whatsapp} onChange={e => setEditForm(f => ({ ...f, contact_whatsapp: e.target.value }))}
              className="border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="💬 WhatsApp" type="tel" />
          </div>
          <input value={editForm.contact_linkedin} onChange={e => setEditForm(f => ({ ...f, contact_linkedin: e.target.value }))}
            className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="LinkedIn URL" />
          <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none resize-none" rows={2} placeholder="Notas" />
          {/* Stage selector */}
          <div>
            <span className="text-[10px] text-gray-500 font-semibold">Etapa no Kanban:</span>
            <div className="flex gap-1 mt-1">
              {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                <button type="button" key={key}
                  onClick={async () => {
                    if (key === lead.stage) return;
                    try {
                      const svc = new LeadService(supabase);
                      await svc.updateLead(lead.id, { stage: key });
                      onUpdate();
                    } catch (e) { console.error(e); }
                  }}
                  className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-colors ${
                    lead.stage === key
                      ? `${cfg.color} text-white`
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button onClick={saveEdit} disabled={saving}
            className="w-full py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button"
            onClick={async () => {
              if (!confirm(`Arquivar lead "${lead.company_name}"?`)) return;
              try {
                const svc = new LeadService(supabase);
                await svc.archiveLead(lead.id);
                onClose();
                onUpdate();
              } catch (e) { console.error(e); alert('Erro ao arquivar: ' + (e.message || e)); }
            }}
            className="w-full py-1.5 bg-white text-red-500 border border-red-200 rounded text-xs font-medium hover:bg-red-50 flex items-center justify-center gap-1 mt-1">
            <Archive className="w-3 h-3" /> Arquivar lead
          </button>
        </div>
      )}

      {/* Cadence reference */}
      {canRegister && nextTP && (
        <div className="p-3 border-b bg-blue-50 flex-shrink-0">
          <p className="text-xs font-semibold text-blue-700 mb-1">Próximo: TP {nextTP.tp} — {CHANNEL_CONFIG[nextTP.channel].label}</p>
          <p className="text-xs text-blue-600">{nextTP.label}</p>
        </div>
      )}

      {/* Touchpoint timeline */}
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Timeline ({touchpoints.length} touchpoints)</p>
        {loading ? (
          <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
        ) : touchpoints.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum touchpoint registrado ainda.</p>
        ) : (
          <div className="space-y-3">
            {touchpoints.map((tp, i) => {
              const ch = CHANNEL_CONFIG[tp.channel];
              const res = RESULT_CONFIG[tp.result];
              const ChIcon = ch?.icon || Clock;
              const isEditingThis = editingTp?.id === tp.id;

              return (
                <div key={tp.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full ${ch?.bg || 'bg-gray-100'} flex items-center justify-center flex-shrink-0`}>
                      <ChIcon className={`w-3.5 h-3.5 ${ch?.color || 'text-gray-500'}`} />
                    </div>
                    {i < touchpoints.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    {!isEditingThis ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-700">TP {tp.sequence_number}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${res?.bg || 'bg-gray-100'} ${res?.color || 'text-gray-600'}`}>
                            {res?.icon} {res?.label}
                          </span>
                          {editing && (
                            <div className="ml-auto flex gap-1">
                              <button onClick={() => setEditingTp({ id: tp.id, channel: tp.channel, result: tp.result, notes: tp.notes || '' })}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">Editar</button>
                              <button onClick={async () => {
                                if (!confirm('Excluir este touchpoint?')) return;
                                await supabase.from('touchpoints').delete().eq('id', tp.id);
                                // Recalc lead touchpoints_count
                                const remaining = touchpoints.length - 1;
                                await supabase.from('leads').update({
                                  touchpoints_count: remaining,
                                  last_touchpoint_date: remaining > 0 ? null : null,
                                }).eq('id', lead.id);
                                await loadTouchpoints();
                                onUpdate();
                              }} className="text-[10px] text-red-500 hover:text-red-700 font-medium">Excluir</button>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {new Date(tp.executed_at).toLocaleDateString('pt-BR')} · {ch?.label}
                        </p>
                        {tp.notes && <p className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded">{tp.notes}</p>}
                      </>
                    ) : (
                      <div className="space-y-2 bg-blue-50 p-2 rounded-lg border border-blue-200">
                        <div className="flex gap-1">
                          {Object.entries(CHANNEL_CONFIG).map(([k, c]) => {
                            const I = c.icon;
                            return (
                              <button key={k} onClick={() => setEditingTp(p => ({ ...p, channel: k }))}
                                className={`flex-1 py-1 rounded text-[10px] font-medium border ${editingTp.channel === k ? `${c.bg} ${c.color} ${c.border}` : 'bg-white text-gray-400 border-gray-200'}`}>
                                <I className="w-3 h-3 mx-auto" />
                              </button>
                            );
                          })}
                        </div>
                        <select value={editingTp.result} onChange={e => setEditingTp(p => ({ ...p, result: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none">
                          {Object.entries(RESULT_CONFIG).map(([k, r]) => (
                            <option key={k} value={k}>{r.icon} {r.label}</option>
                          ))}
                        </select>
                        <input value={editingTp.notes} onChange={e => setEditingTp(p => ({ ...p, notes: e.target.value }))}
                          className="w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400 focus:outline-none" placeholder="Nota" />
                        <div className="flex gap-1">
                          <button onClick={async () => {
                            await supabase.from('touchpoints').update({
                              channel: editingTp.channel,
                              result: editingTp.result,
                              notes: editingTp.notes.trim() || null,
                            }).eq('id', tp.id);
                            setEditingTp(null);
                            await loadTouchpoints();
                            onUpdate();
                          }} className="flex-1 py-1 bg-blue-600 text-white rounded text-[10px] font-semibold">Salvar</button>
                          <button onClick={() => setEditingTp(null)}
                            className="flex-1 py-1 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Canal atual — referencia visual del próximo touchpoint */}
      {canRegister && nextTP && (
        <div className="p-3 border-t bg-white flex-shrink-0">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Canal do próximo touchpoint (TP {nextTP.tp})
          </p>
          <div className="flex gap-1">
            {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const isCurrent = nextTP.channel === key;
              return (
                <div key={key}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    isCurrent
                      ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current`
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{cfg.label}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ventus advice */}
      {canRegister && (
        <div className="p-3 border-t bg-purple-50 flex-shrink-0">
          {!ventusAdvice && !ventusLoading && (
            <button onClick={askVentus}
              className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" />
              Pedir sugestão ao Ventus
            </button>
          )}
          {ventusLoading && (
            <div className="flex items-center justify-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
              <span className="text-sm text-purple-600">Ventus analisando...</span>
            </div>
          )}
          {ventusAdvice && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-700 flex items-center gap-1"><Brain className="w-3 h-3" /> Ventus</span>
                <button onClick={() => setVentusAdvice(null)} className="text-xs text-purple-400 hover:text-purple-600">Fechar</button>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-white p-3 rounded-lg border border-purple-200 max-h-40 overflow-y-auto">
                {ventusAdvice}
              </div>
              <button onClick={askVentus}
                className="text-xs text-purple-500 hover:text-purple-700 font-medium">
                ↻ Gerar outra sugestão
              </button>
            </div>
          )}
        </div>
      )}

      {/* Register form */}
      {canRegister && (
        <div className="p-4 border-t bg-white flex-shrink-0 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Registrar Touchpoint {lead.touchpoints_count + 1}</p>

          {/* Channel select */}
          <div className="flex gap-1">
            {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={key} onClick={() => setChannel(key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    channel === key ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{cfg.label}
                </button>
              );
            })}
          </div>

          {/* Result select */}
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(RESULT_CONFIG).map(([key, cfg]) => (
              <button key={key} onClick={() => setResult(key)}
                className={`py-2 px-2 rounded-lg text-xs font-medium border transition-colors ${
                  result === key ? `${cfg.bg} ${cfg.color} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {cfg.icon} {cfg.label}
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none resize-none"
            rows={2} placeholder="Nota opcional..." />

          <button onClick={handleRegister} disabled={saving || !channel || !result || (result === 'other' && !notes.trim())}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Registrando...' : 'Registrar Touchpoint'}
          </button>
        </div>
      )}

      {/* Archived actions */}
      {lead.status === 'archived' && (
        <div className="p-4 border-t bg-gray-50 flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">
            Arquivado em {lead.archived_at ? new Date(lead.archived_at).toLocaleDateString('pt-BR') : '—'}
            {lead.recycle_after && ` · Reciclar após ${new Date(lead.recycle_after).toLocaleDateString('pt-BR')}`}
          </p>
        </div>
      )}

      {lead.status === 'converted' && lead.opportunity_id && (
        <div className="p-4 border-t bg-green-50">
          <p className="text-sm text-green-700 font-semibold flex items-center gap-1">
            <CheckCircle className="w-4 h-4" /> Convertido em oportunidade #{lead.opportunity_id}
          </p>
        </div>
      )}

      </div>{/* end scrollable content */}
    </div>
  );
};

// ── NewLeadModal ─────────────────────────────────────────────────────────────

const NewLeadModal = ({ supabase, currentUser, isAdmin, vendors, onClose, onCreated }) => {
  const [form, setForm] = useState({
    company_name: '', company_domain: '',
    contact_name: '', contact_title: '', contact_email: '', contact_phone: '', contact_whatsapp: '', contact_linkedin: '',
    source: 'manual', stage: '1a', notes: '',
    vendor: currentUser || '',
  });
  const [collision, setCollision] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const leadSvc = useMemo(() => new LeadService(supabase), [supabase]);

  const checkCollision = async () => {
    if (!form.company_name.trim()) return;
    setChecking(true);
    try {
      const res = await leadSvc.checkCollision(form.company_name.trim(), form.vendor);
      setCollision(res.collision ? res : null);
    } catch (e) { console.error(e); }
    finally { setChecking(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.company_name.trim()) return;
    setSaving(true);
    try {
      await leadSvc.createLead({
        vendor: form.vendor,
        source: form.source || 'manual',
        company_name: form.company_name.trim(),
        company_domain: form.company_domain.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_title: form.contact_title.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_whatsapp: form.contact_whatsapp.trim() || null,
        contact_linkedin: form.contact_linkedin.trim() || null,
        stage: form.stage,
        notes: form.notes.trim() || null,
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao criar lead: ' + (e.message || e));
    }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-[60] overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-10 mb-10">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold text-lg">📞 Novo Lead</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Company */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Empresa *</label>
            <input type="text" value={form.company_name}
              onChange={e => set('company_name', e.target.value)}
              onBlur={checkCollision}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
              placeholder="Nome da empresa" required />
            {checking && <p className="text-xs text-gray-400 mt-1">Verificando colisão...</p>}
            {collision && (
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                <p className="text-sm font-semibold text-yellow-800">⚠️ {collision.takenBy} já está prospectando esta empresa</p>
                <p className="text-xs text-yellow-700 mt-1">Você pode criar mesmo assim, mas saiba que já existe um lead ativo.</p>
              </div>
            )}
          </div>

          <input type="text" value={form.company_domain} onChange={e => set('company_domain', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            placeholder="Domínio (ex: empresa.com.br)" />

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={form.contact_name} onChange={e => set('contact_name', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="Nome do contato" />
            <input type="text" value={form.contact_title} onChange={e => set('contact_title', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="Cargo" />
          </div>

          <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="📧 Email" />

          <div className="grid grid-cols-2 gap-3">
            <input type="tel" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="📞 Telefone" />
            <input type="tel" value={form.contact_whatsapp} onChange={e => set('contact_whatsapp', e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" placeholder="💬 WhatsApp" />
          </div>

          <input type="text" value={form.contact_linkedin} onChange={e => set('contact_linkedin', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
            placeholder="🔗 LinkedIn URL" />

          {/* Vendor (admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Vendedor</label>
              <select value={form.vendor} onChange={e => set('vendor', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none">
                {vendors.filter(v => v.is_active !== false).map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Stage */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Etapa inicial</label>
            <div className="flex gap-2">
              {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                <button type="button" key={key} onClick={() => set('stage', key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    form.stage === key ? `${cfg.lightBg} text-gray-800 border-gray-400` : 'bg-white text-gray-500 border-gray-200'
                  }`}>
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none resize-none"
            rows={2} placeholder="Notas (opcional)" />

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !form.company_name.trim()}
              className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Criando...' : 'Criar Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── CadenciaDashboard (main) ─────────────────────────────────────────────────

export const CadenciaDashboard = ({ supabase, currentUser, isAdmin, vendors }) => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('active'); // 'active' | 'archived' | 'converted'
  const [vendorFilter, setVendorFilter] = useState(isAdmin ? 'all' : currentUser);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showNewLead, setShowNewLead] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const leadSvc = useMemo(() => new LeadService(supabase), [supabase]);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leadSvc.getLeads(currentUser, isAdmin, view);
      setLeads(data);
    } catch (e) { console.error('Error loading leads:', e); }
    finally { setLoading(false); }
  }, [leadSvc, currentUser, isAdmin, view]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  // Filter leads
  const filtered = useMemo(() => {
    let result = leads;
    if (vendorFilter !== 'all') result = result.filter(l => l.vendor === vendorFilter);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(l =>
        l.company_name.toLowerCase().includes(s) ||
        (l.contact_name || '').toLowerCase().includes(s)
      );
    }
    return result;
  }, [leads, vendorFilter, searchTerm]);

  // KPIs
  const activeLeads = filtered.filter(l => l.status === 'active');
  const overdueLeads = activeLeads.filter(l => {
    const d = l.last_touchpoint_date
      ? daysBetween(new Date(l.last_touchpoint_date), new Date())
      : daysBetween(new Date(l.created_at), new Date());
    return d >= 5;
  });
  const dueThisWeek = activeLeads.filter(l => {
    if (!l.next_touchpoint_date) return false;
    const d = new Date(l.next_touchpoint_date);
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    return d >= now && d <= weekEnd;
  });
  const convertedCount = leads.filter(l => l.status === 'converted').length;

  // Group by stage for kanban, sorted by company name so same-company leads are together
  const byStage = { '1a': [], '1b': [], '1c': [], '1d': [] };
  if (view === 'active') {
    filtered.forEach(l => {
      if (l.status === 'active' && byStage[l.stage]) byStage[l.stage].push(l);
    });
    // Sort each column by company name (case-insensitive)
    Object.keys(byStage).forEach(k => {
      byStage[k].sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', 'pt-BR', { sensitivity: 'base' }));
    });
  }

  const handleConvert = async (lead) => {
    if (!confirm(`Converter "${lead.company_name}" em oportunidade no CRM?`)) return;
    try {
      const opp = await leadSvc.convertToOpportunity(lead);
      alert(`✅ Oportunidade criada: ${opp.name} (ID: ${opp.id})`);
      setSelectedLead(null);
      loadLeads();
    } catch (e) {
      console.error(e);
      alert('Erro ao converter: ' + (e.message || e));
    }
  };

  const handleRecycle = async (lead) => {
    if (!confirm(`Reciclar lead "${lead.company_name}"? Touchpoints serão zerados.`)) return;
    try {
      await leadSvc.recycleLead(lead.id);
      setSelectedLead(null);
      loadLeads();
    } catch (e) { console.error(e); alert('Erro ao reciclar'); }
  };

  const handleArchive = async (lead) => {
    if (!confirm(`Arquivar lead "${lead.company_name}"?`)) return;
    try {
      await leadSvc.archiveLead(lead.id);
      setSelectedLead(null);
      loadLeads();
    } catch (e) { console.error(e); alert('Erro ao arquivar'); }
  };

  // Vendor names for filter
  const vendorNames = [...new Set(leads.map(l => l.vendor).filter(Boolean))].sort();

  if (loading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500 text-base">Carregando leads...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Phone className="w-6 h-6 text-blue-600" />
            Cadência de Prospecção
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">7 touchpoints · 21 dias · Foco na reunião</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none w-48"
              placeholder="Buscar lead..." />
          </div>

          {/* Vendor filter (admin) */}
          {isAdmin && (
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none min-w-[150px]">
              <option value="all">👥 Todos</option>
              {vendorNames.map(v => <option key={v} value={v}>👤 {v}</option>)}
            </select>
          )}

          {/* View toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            {[
              { key: 'active', label: 'Ativos' },
              { key: 'archived', label: 'Arquivados' },
              { key: 'converted', label: 'Convertidos' },
            ].map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  view === v.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}>
                {v.label}
              </button>
            ))}
          </div>

          {/* New Lead */}
          <button onClick={() => setShowNewLead(true)}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold text-sm hover:shadow-lg transition-all flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-blue-500" />
            <p className="text-xs text-gray-500 font-medium">Leads Ativos</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{activeLeads.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${overdueLeads.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            <p className="text-xs text-gray-500 font-medium">Atrasados</p>
          </div>
          <p className={`text-2xl font-bold ${overdueLeads.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>{overdueLeads.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-yellow-500" />
            <p className="text-xs text-gray-500 font-medium">Esta semana</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">{dueThisWeek.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-xs text-gray-500 font-medium">Convertidos</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{convertedCount}</p>
        </div>
      </div>

      {/* Kanban (active view) */}
      {view === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Object.entries(STAGE_CONFIG).map(([stageKey, cfg]) => (
            <div key={stageKey} className="flex flex-col">
              <div className={`${cfg.color} text-white px-3 py-2 rounded-t-xl flex items-center justify-between`}>
                <span className="text-sm font-bold">{cfg.label}</span>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{byStage[stageKey].length}</span>
              </div>
              <div className={`${cfg.lightBg} border border-t-0 border-gray-200 rounded-b-xl p-2 space-y-2 min-h-[120px] max-h-[60vh] overflow-y-auto`}>
                {byStage[stageKey].length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Nenhum lead</p>
                ) : (
                  byStage[stageKey].map(lead => (
                    <LeadCard key={lead.id} lead={lead} onClick={setSelectedLead} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view (archived/converted) */}
      {view !== 'active' && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
              <p className="text-gray-400">Nenhum lead {view === 'archived' ? 'arquivado' : 'convertido'}.</p>
            </div>
          ) : (
            filtered.map(lead => (
              <div key={lead.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition-all cursor-pointer"
                onClick={() => setSelectedLead(lead)}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{lead.company_name}</p>
                  <p className="text-xs text-gray-500">{lead.contact_name || '—'} · {lead.vendor} · TP {lead.touchpoints_count}/7</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {view === 'archived' && (
                    <button onClick={(e) => { e.stopPropagation(); handleRecycle(lead); }}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Reciclar
                    </button>
                  )}
                  {view === 'converted' && lead.opportunity_id && (
                    <span className="text-xs text-green-600 font-medium">Opp #{lead.opportunity_id}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TouchpointPanel sidebar */}
      {selectedLead && (
        <TouchpointPanel
          lead={selectedLead}
          supabase={supabase}
          onClose={() => setSelectedLead(null)}
          onUpdate={() => { loadLeads(); }}
          onConvert={handleConvert}
        />
      )}

      {/* New Lead modal */}
      {showNewLead && (
        <NewLeadModal
          supabase={supabase}
          currentUser={currentUser}
          isAdmin={isAdmin}
          vendors={vendors}
          onClose={() => setShowNewLead(false)}
          onCreated={loadLeads}
        />
      )}
    </div>
  );
};

export default CadenciaDashboard;
