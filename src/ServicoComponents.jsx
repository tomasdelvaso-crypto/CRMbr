import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, Loader2, Wrench, ChevronRight, RefreshCw, Save, Edit3 } from 'lucide-react';
import { ActivityPanel, ActivityService, PlannedCard } from './ActivityComponents';

// Área de Serviço (reparo/manutenção de cabeçotes, fita arrastada).
// Funil próprio em opportunities.servico_etapa — `stage` fica em 1 e nunca é
// alterado aqui, então os gates PPVVCC (trigger enforce_stage_gates) não se aplicam.
// A agenda é a mesma de Vendas: activities com next_action_done=false.

export const SERVICO_ETAPAS = [
  { id: 'contato', label: 'Contato', hint: 'Demanda ou pedido — agendar a visita', color: 'bg-gray-100 text-gray-700' },
  { id: 'visita', label: 'Visita técnica', hint: 'Diagnóstico / demonstração no cliente', color: 'bg-blue-100 text-blue-800' },
  { id: 'orcamento', label: 'Orçamento', hint: 'Orçamento enviado com Jordi por e-mail — aguardando resposta', color: 'bg-amber-100 text-amber-800' },
  { id: 'aprovado', label: 'Aprovado / PO', hint: 'Cliente aprovou — agendar a execução', color: 'bg-green-100 text-green-800' },
  { id: 'execucao', label: 'Execução', hint: 'Serviço em execução', color: 'bg-purple-100 text-purple-800' },
];

export const SERVICO_TIPOS = {
  reparo: { label: 'Reparo', icon: '🔧' },
  preventiva: { label: 'Preventiva / contrato', icon: '🗓️' },
  fita: { label: 'Fita', icon: '🎞️' },
};

const FITA_STATUS = {
  nao_oferecida: 'Não oferecida',
  cotada: 'Cotada',
  pedido: 'Pedido',
};

const LOSS_REASONS = [
  'Preço',
  'Sem verba / orçamento',
  'Fez com terceiro',
  'Fez internamente',
  'Equipamento desativado ou trocado',
  'Cliente não respondeu',
  'Outro',
];

// Visita técnica = activity 'meeting' com methodology_code SV-* e o relatório na
// descrição. O bot (digest do Jordi) reconhece as visitas por esse código.
export const VISITA_TIPOS = {
  diagnostico: { label: 'Diagnóstico / avaliação', icon: '🔍', code: 'SV-DIAGNOSTICO' },
  execucao: { label: 'Execução do serviço', icon: '🛠️', code: 'SV-EXECUCAO' },
  preventiva: { label: 'Preventiva', icon: '🗓️', code: 'SV-PREVENTIVA' },
  chamado: { label: 'Chamado / urgência', icon: '🚨', code: 'SV-CHAMADO' },
  acompanhamento: { label: 'Acompanhamento', icon: '👀', code: 'SV-ACOMPANHAMENTO' },
};
const visitaTipoByCode = (code) => Object.values(VISITA_TIPOS).find(t => t.code === code) || null;

// Próximo passo sugerido depois de cada tipo de visita
const PROXIMO_POR_VISITA = {
  diagnostico: { texto: 'Montar orçamento com Jordi e enviar por e-mail', dias: 3 },
  execucao: { texto: 'Confirmar com o cliente como ficou o equipamento', dias: 7 },
  preventiva: { texto: 'Agendar a próxima preventiva', dias: 90 },
  chamado: { texto: 'Retornar ao cliente sobre o chamado', dias: 3 },
  acompanhamento: { texto: 'Próximo contato com o cliente', dias: 14 },
};

// «O que mais viu?» — o técnico não vende: marca o que viu e cada gancho vira
// uma oportunidade com próxima ação e data.
const GANCHOS = [
  { id: 'cabecote', label: 'Outro cabeçote / equipamento em risco', tipo: 'reparo', acao: 'Montar orçamento com Jordi e enviar por e-mail', dias: 3, tipoAcao: 'proposal' },
  { id: 'fita', label: 'Fita: outra marca ou consumo a atender', tipo: 'fita', acao: 'Oferecer fita Ventapel', dias: 7, tipoAcao: 'call' },
  { id: 'preventiva', label: 'Preventiva / contrato', tipo: 'preventiva', acao: 'Propor preventiva / contrato', dias: 7, tipoAcao: 'proposal' },
  { id: 'pecas', label: 'Peças', tipo: 'reparo', acao: 'Montar orçamento de peças com Jordi e enviar por e-mail', dias: 3, tipoAcao: 'proposal' },
];

// Continuidade sugerida ao ganhar: o reparo abre a venda seguinte
const CONTINUIDADE = {
  preventiva: { tipo: 'preventiva', texto: 'Agendar a próxima preventiva', dias: 90 },
  reparo: { tipo: 'preventiva', texto: 'Oferecer preventiva / contrato', dias: 15 },
  fita: { tipo: 'fita', texto: 'Verificar reposição de fita', dias: 30 },
  _: { tipo: '', texto: 'Próximo passo com o cliente', dias: 30 },
};

// Datas no fuso do navegador (BRT), não em UTC
const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (fromIso, toIso) =>
  Math.round((new Date(toIso + 'T12:00:00').getTime() - new Date(fromIso + 'T12:00:00').getTime()) / 86400000);
const daysSince = (ts) => (ts ? Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)) : 0);
const fmtDate = (iso) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
const fmtMoney = (v) => (Number(v) > 0 ? 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '');
const etapaOf = (opp) => SERVICO_ETAPAS.find(e => e.id === (opp.servico_etapa || 'contato')) || SERVICO_ETAPAS[0];
const tipoLabel = (tipo) => SERVICO_TIPOS[tipo]?.label || 'Serviço';
const oppName = (client, tipo) => `${client.trim().toUpperCase()} — ${tipoLabel(tipo)}`;
const cleanInfo = (obj) => Object.fromEntries(
  Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== '' && v != null)
);
const errMsg = (e) => (e && (e.message || e.details)) || String(e);

class ServicoService {
  constructor(sb) { this.supabase = sb; }

  async getPlanned(ids) {
    if (!ids.length) return [];
    const { data, error } = await this.supabase.from('activities').select('*')
      .in('opportunity_id', ids).eq('next_action_done', false).not('next_action', 'is', null)
      .order('next_action_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data || [];
  }
  async updateOpp(id, patch) {
    const { data, error } = await this.supabase.from('opportunities').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  async insertOpp(row) {
    const { data, error } = await this.supabase.from('opportunities').insert([row]).select().single();
    if (error) throw error;
    return data;
  }
  // Mudança de etapa fica no histórico (fechada, sem próxima ação)
  async logEtapa(opp, fromLabel, toLabel, vendor) {
    const { error } = await this.supabase.from('activities').insert([{
      opportunity_id: opp.id, vendor: vendor || '', activity_type: 'stage_change',
      description: `Etapa: ${fromLabel} → ${toLabel}`, result: null, stage_at_time: opp.stage || 1,
      next_action: null, next_action_date: null, next_action_done: true,
      source: 'system', activity_date: todayLocal(),
    }]);
    if (error) throw error;
  }
  // Ao encerrar, as planejadas abertas saem da agenda
  async closePending(oppId) {
    const { error } = await this.supabase.from('activities').update({ next_action_done: true, result: 'expirado' })
      .eq('opportunity_id', oppId).eq('next_action_done', false).not('next_action', 'is', null);
    if (error) throw error;
  }
  async insertActivity(row) {
    const { error } = await this.supabase.from('activities').insert([row]);
    if (error) throw error;
  }
  // A visita (ou o orçamento) era a ação planejada: fecha como feita, na data dela
  async markPlannedDone(id, date = todayLocal()) {
    const { error } = await this.supabase.from('activities')
      .update({ next_action_done: true, result: 'positivo', activity_date: date }).eq('id', id);
    if (error) throw error;
  }
  // Tudo o que aconteceu nas oportunidades de Serviço desde `sinceIso` (feed do Jordi)
  async getRecent(ids, sinceIso) {
    if (!ids.length) return [];
    const { data, error } = await this.supabase.from('activities').select('*')
      .in('opportunity_id', ids).gte('created_at', sinceIso)
      .order('created_at', { ascending: false }).limit(400);
    if (error) throw error;
    return data || [];
  }
}

// Saúde de agenda: vermelho = sem ação/atrasada; amarelo = vence já ou parada na etapa
// plannedList === null: agenda não carregou — não dá para afirmar nada
const saudeDe = (opp, plannedList, today) => {
  if (plannedList === null) return { level: 'gray', label: 'Agenda indisponível' };
  const next = plannedList[0];
  if (!next) return { level: 'red', label: 'Sem próxima ação' };
  if (!next.next_action_date) return { level: 'red', label: 'Próxima ação sem data' };
  if (next.next_action_date < today) return { level: 'red', label: `Atrasada ${daysBetween(next.next_action_date, today)}d` };
  const dias = daysBetween(today, next.next_action_date);
  const naEtapa = daysSince(opp.servico_etapa_desde);
  if (dias <= 2) return { level: 'yellow', label: dias === 0 ? 'Ação hoje' : `Ação em ${dias}d` };
  if (opp.servico_etapa === 'orcamento' && naEtapa > 7) return { level: 'yellow', label: `Orçamento há ${naEtapa}d` };
  if (naEtapa > 21) return { level: 'yellow', label: `${naEtapa}d nesta etapa` };
  return { level: 'green', label: 'Em dia' };
};
const SAUDE_STYLE = {
  red: { border: 'border-red-400', badge: 'bg-red-100 text-red-700' },
  yellow: { border: 'border-amber-400', badge: 'bg-amber-100 text-amber-800' },
  green: { border: 'border-green-400', badge: 'bg-green-100 text-green-700' },
  gray: { border: 'border-gray-300', badge: 'bg-gray-100 text-gray-600' },
};

const EtapaChip = ({ opp }) => {
  const e = etapaOf(opp);
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${e.color}`}>{e.label}</span>;
};
const TipoChip = ({ tipo }) => (
  tipo && SERVICO_TIPOS[tipo]
    ? <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium">{SERVICO_TIPOS[tipo].icon} {SERVICO_TIPOS[tipo].label}</span>
    : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500">Tipo a definir</span>
);

const ServicoCard = ({ opp, plannedList, today, onOpen, showVendor }) => {
  const saude = saudeDe(opp, plannedList, today);
  const st = SAUDE_STYLE[saude.level];
  // Sem agenda carregada, mostra a próxima ação espelhada na oportunidade
  const next = plannedList
    ? plannedList[0]
    : (opp.next_action ? { next_action: opp.next_action, next_action_date: opp.next_action_date } : null);
  const info = opp.servico_info || {};
  return (
    <button onClick={() => onOpen(opp.id)}
      className={`w-full text-left bg-white rounded-xl shadow-sm border-l-4 ${st.border} border border-gray-200 p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">{opp.client}</p>
          <p className="text-xs text-gray-500 truncate">{opp.name}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap ${st.badge}`}>{saude.label}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <TipoChip tipo={opp.servico_tipo} />
        {showVendor && <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">👤 {opp.vendor}</span>}
        {fmtMoney(opp.value) && <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{fmtMoney(opp.value)}</span>}
      </div>
      {(info.equipamento || info.fita || info.fita_obs) && (
        <p className="text-xs text-gray-600 mt-2">
          {info.equipamento && <>⚙️ {info.equipamento}</>}
          {info.equipamento && (info.fita || info.fita_obs) && ' · '}
          {(info.fita || info.fita_obs) && <>🎞️ {[FITA_STATUS[info.fita], info.fita_obs].filter(Boolean).join(' — ')}</>}
        </p>
      )}
      <p className="text-sm text-gray-800 mt-2">
        {next
          ? <>➡️ {next.next_action} {next.next_action_date && <span className="text-gray-500">({fmtDate(next.next_action_date)})</span>}</>
          : plannedList
            ? <span className="text-red-600 font-semibold">⚠️ Planejar a próxima ação</span>
            : <span className="text-gray-400">—</span>}
      </p>
    </button>
  );
};

// --- Nova oportunidade de Serviço ---
const ServicoNovaForm = ({ supabase, currentUser, isAdmin, servicoVendors, onClose, onCreated }) => {
  const svc = useMemo(() => new ServicoService(supabase), [supabase]);
  const actSvc = useMemo(() => new ActivityService(supabase), [supabase]);
  const [f, setF] = useState({
    client: '', tipo: '', etapa: 'contato', equipamento: '', support_contact: '', value: '',
    acao: '', data: '', acaoTipo: 'call',
    vendor: isAdmin ? (servicoVendors[0] || '') : (currentUser || ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const valid = f.client.trim() && f.acao.trim() && f.data && f.vendor;

  const save = async () => {
    if (!valid) return;
    setSaving(true); setError(null);
    try {
      const tipo = f.tipo || null;
      const row = await svc.insertOpp({
        name: oppName(f.client, tipo),
        client: f.client.trim(),
        vendor: f.vendor,
        business_unit: 'servico',
        servico_tipo: tipo,
        servico_etapa: f.etapa,
        servico_etapa_desde: new Date().toISOString(),
        servico_info: cleanInfo({ equipamento: f.equipamento }),
        support_contact: f.support_contact.trim() || null,
        value: parseFloat(f.value) > 0 ? parseFloat(f.value) : null,
        product: 'Serviço — ' + (tipo ? tipoLabel(tipo) : 'a definir'),
        product_lines: ['servico_manutencao'],
        stage: 1,
        probability: 0,
        priority: 'média',
        next_action: f.acao.trim(),
        next_action_date: f.data,
        last_update: todayLocal(),
      });
      try {
        await actSvc.createPlanned(row.id, row.vendor, 1, { text: f.acao.trim(), date: f.data, type: f.acaoTipo });
      } catch (e) {
        console.error(e);
        alert('Oportunidade criada, mas a próxima ação não foi salva: ' + errMsg(e) + '\nAbra a ficha e planeje de novo.');
      }
      onCreated(row);
    } catch (e) {
      console.error(e);
      setError('Não foi possível criar: ' + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full p-2.5 border border-gray-300 rounded-lg text-base mt-1';
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-start sm:items-center justify-center overflow-y-auto">
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl shadow-xl min-h-screen sm:min-h-0 sm:my-8">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 sm:rounded-t-2xl">
          <h3 className="text-lg font-bold text-white flex items-center"><Wrench className="w-5 h-5 mr-2" /> Nova oportunidade de Serviço</h3>
          <button onClick={onClose} className="text-white p-1"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-4 space-y-3">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="text-sm font-semibold text-gray-700">Cliente *</label>
            <input value={f.client} onChange={set('client')} placeholder="Ex: Forno de Minas" className={input} autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Tipo</label>
              <select value={f.tipo} onChange={set('tipo')} className={input}>
                <option value="">A definir</option>
                {Object.entries(SERVICO_TIPOS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Etapa</label>
              <select value={f.etapa} onChange={set('etapa')} className={input}>
                {SERVICO_ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Equipamento</label>
            <input value={f.equipamento} onChange={set('equipamento')} placeholder="Modelo, quantidade de cabeçotes, linha" className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Contato técnico</label>
              <input value={f.support_contact} onChange={set('support_contact')} placeholder="Nome / telefone" className={input} />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Valor estimado (R$)</label>
              <input type="number" min="0" value={f.value} onChange={set('value')} placeholder="Opcional" className={input} />
            </div>
          </div>
          {isAdmin && (
            <div>
              <label className="text-sm font-semibold text-gray-700">Responsável *</label>
              {servicoVendors.length ? (
                <select value={f.vendor} onChange={set('vendor')} className={input}>
                  {servicoVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <p className="text-sm text-red-600 mt-1">Nenhum usuário de Serviço cadastrado.</p>
              )}
            </div>
          )}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <p className="text-sm font-semibold text-amber-900">📅 Primeira ação *</p>
            <input value={f.acao} onChange={set('acao')} placeholder="Ex: Agendar visita para avaliar os cabeçotes" className={input} />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={f.data} onChange={set('data')} className={input} />
              <select value={f.acaoTipo} onChange={set('acaoTipo')} className={input}>
                <option value="call">📞 Ligação</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="meeting">🤝 Visita</option>
                <option value="email">📧 Email</option>
                <option value="proposal">📋 Orçamento</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <button onClick={save} disabled={!valid || saving}
            className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-bold disabled:bg-gray-300 flex items-center justify-center">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Criar</>}
          </button>
          <button onClick={onClose} className="px-5 py-3 border rounded-lg text-gray-600">Cancelar</button>
        </div>
      </div>
    </div>
  );
};

// --- Registrar visita (relatório técnico + «O que mais viu?») ---
// Unidade de registro do técnico: o que fez e o que viu. A visita conclui a
// ação planejada, move a etapa, agenda o próximo passo e cada gancho marcado
// vira uma oportunidade nova — assim o Jordi acompanha dia a dia.
const RegistrarVisitaModal = ({ supabase, currentUser, isAdmin, servicoVendors, openOpps, initialOpp, onRows, onClose }) => {
  const svc = useMemo(() => new ServicoService(supabase), [supabase]);
  const actSvc = useMemo(() => new ActivityService(supabase), [supabase]);
  const today = todayLocal();
  const tipoInicial = initialOpp && ['aprovado', 'execucao'].includes(initialOpp.servico_etapa) ? 'execucao' : 'diagnostico';
  const [oppId, setOppId] = useState(initialOpp ? String(initialOpp.id) : '');
  const [novoCliente, setNovoCliente] = useState('');
  const [vendor, setVendor] = useState(isAdmin ? (servicoVendors[0] || '') : (currentUser || ''));
  const [tipo, setTipo] = useState(tipoInicial);
  const [data, setData] = useState(today);
  const [relatorio, setRelatorio] = useState('');
  const [ganchos, setGanchos] = useState(() =>
    Object.fromEntries(GANCHOS.map(g => [g.id, { on: false, texto: '', data: addDaysISO(today, g.dias) }])));
  const [pendentes, setPendentes] = useState([]);
  // Enquanto as planejadas carregam não dá para salvar: senão a ação anterior
  // fica aberta e a visita cria outra por cima
  const [pendLoading, setPendLoading] = useState(false);
  // Oportunidade criada numa tentativa que falhou depois: o retry a reaproveita
  const createdRef = useRef(null);
  const [concluir, setConcluir] = useState(true);
  const [encerrar, setEncerrar] = useState(false);
  const [proxTexto, setProxTexto] = useState(PROXIMO_POR_VISITA[tipoInicial].texto);
  const [proxData, setProxData] = useState(addDaysISO(today, PROXIMO_POR_VISITA[tipoInicial].dias));
  const [proxEditado, setProxEditado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const opp = oppId && oppId !== 'novo' ? openOpps.find(o => String(o.id) === oppId) || null : null;
  const oppKey = opp ? opp.id : null;

  // Planejadas abertas da oportunidade: a visita normalmente conclui a mais próxima
  useEffect(() => {
    let cancelled = false;
    setPendentes([]);
    if (!oppKey) { setPendLoading(false); return undefined; }
    setPendLoading(true);
    svc.getPlanned([oppKey])
      .then(rows => { if (!cancelled) setPendentes(rows); })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setPendLoading(false); });
    return () => { cancelled = true; };
  }, [svc, oppKey]);

  // Sugestão de próximo passo acompanha o tipo de visita até o usuário editar
  const escolherTipo = (t) => {
    setTipo(t);
    if (t !== 'execucao') setEncerrar(false);
    if (!proxEditado) {
      setProxTexto(PROXIMO_POR_VISITA[t].texto);
      setProxData(addDaysISO(today, PROXIMO_POR_VISITA[t].dias));
    }
  };
  const setGancho = (id, patch) => setGanchos(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const clientName = opp ? opp.client : novoCliente.trim();
  const ganchosOn = GANCHOS.filter(g => ganchos[g.id].on);
  const owner = opp ? (opp.vendor || currentUser) : vendor;
  const podeEncerrar = tipo === 'execucao' && !!opp;
  const valid = !!clientName && !!owner && relatorio.trim().length >= 3 && !!data && !pendLoading
    && ((podeEncerrar && encerrar) || (proxTexto.trim() && proxData))
    && ganchosOn.every(g => ganchos[g.id].data);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    const changed = [];
    const avisos = [];
    const vt = VISITA_TIPOS[tipo];
    let target = opp || createdRef.current;

    // 1) Oportunidade (nova, se a visita foi num cliente ainda sem ficha) e a visita
    try {
      if (!target) {
        target = await svc.insertOpp({
          name: oppName(clientName, null), client: clientName, vendor: owner, business_unit: 'servico',
          servico_tipo: null, servico_etapa: 'visita', servico_etapa_desde: new Date().toISOString(),
          servico_info: {}, product: 'Serviço — a definir', product_lines: ['servico_manutencao'],
          stage: 1, probability: 0, priority: 'média', last_update: today,
        });
        createdRef.current = target;
        changed.push(target);
        setOppId(String(target.id));
      }
      const ganchoLinhas = ganchosOn.map(g => `• ${g.label}${ganchos[g.id].texto.trim() ? ': ' + ganchos[g.id].texto.trim() : ''}`);
      await svc.insertActivity({
        opportunity_id: target.id, vendor: owner, activity_type: 'meeting',
        description: `${vt.icon} Visita — ${vt.label}\n${relatorio.trim()}`
          + (ganchoLinhas.length ? `\n\nO que mais viu:\n${ganchoLinhas.join('\n')}` : ''),
        result: null, stage_at_time: target.stage || 1, methodology_code: vt.code,
        ai_suggested_action: null, ai_suggested_scales: null, ai_confidence: null,
        next_action: null, next_action_date: null, next_action_done: true,
        source: 'manual', activity_date: data,
      });
    } catch (e) {
      console.error(e);
      if (changed.length) onRows(changed);
      setError('Não foi possível registrar a visita: ' + errMsg(e));
      setSaving(false);
      return;
    }

    // 2) A ação que levou à visita fica concluída
    if (concluir && pendentes[0]) {
      try { await svc.markPlannedDone(pendentes[0].id, data); } catch (e) { console.error(e); avisos.push('a ação planejada anterior não foi marcada como feita'); }
    }

    // 3) Etapa + próximo passo (ou encerramento como ganha)
    try {
      if (podeEncerrar && encerrar) {
        changed.push(await svc.updateOpp(target.id, {
          outcome: 'won', loss_reason: null, last_update: today,
          servico_info: cleanInfo({ ...(target.servico_info || {}), encerrada_em: data }),
        }));
        await svc.closePending(target.id);
      } else {
        const atual = target.servico_etapa || 'contato';
        const nova = tipo === 'execucao' ? 'execucao' : (atual === 'contato' ? 'visita' : atual);
        if (nova !== atual) {
          changed.push(await svc.updateOpp(target.id, {
            servico_etapa: nova, servico_etapa_desde: new Date().toISOString(), last_update: today,
          }));
          try {
            await svc.logEtapa(target, etapaOf(target).label, SERVICO_ETAPAS.find(e => e.id === nova).label, owner);
          } catch (e) { console.error(e); }
        }
        await actSvc.createPlanned(target.id, owner, target.stage || 1, { text: proxTexto.trim(), date: proxData, type: 'call' });
      }
      const synced = await actSvc.syncNextAction(target.id);
      if (synced) changed.push(synced);
    } catch (e) {
      console.error(e);
      avisos.push('o próximo passo não foi salvo (' + errMsg(e) + ') — planeje na ficha');
    }

    // 4) Ganchos → oportunidades novas com próxima ação
    for (const g of ganchosOn) {
      const gd = ganchos[g.id];
      const detalhe = gd.texto.trim();
      const acao = detalhe ? `${g.acao} — ${detalhe}` : g.acao;
      let created = null;
      try {
        created = await svc.insertOpp({
          name: oppName(target.client, g.tipo), client: target.client, vendor: owner, business_unit: 'servico',
          servico_tipo: g.tipo, servico_etapa: 'visita', servico_etapa_desde: new Date().toISOString(),
          servico_info: cleanInfo({
            equipamento: (target.servico_info && target.servico_info.equipamento) || '',
            fita_obs: g.id === 'fita' ? detalhe : '',
          }),
          support_contact: target.support_contact || null, power_sponsor: target.power_sponsor || null,
          industry: target.industry || null, product: 'Serviço — ' + tipoLabel(g.tipo),
          product_lines: ['servico_manutencao'], stage: 1, probability: 0, priority: 'média',
          next_action: acao, next_action_date: gd.data, last_update: today,
        });
        changed.push(created);
        await actSvc.createPlanned(created.id, owner, 1, { text: acao, date: gd.data, type: g.tipoAcao });
      } catch (e) {
        console.error(e);
        avisos.push(created ? `o gancho "${g.label}" foi criado sem próxima ação` : `o gancho "${g.label}" não foi criado (${errMsg(e)})`);
      }
    }

    onRows(changed);
    setSaving(false);
    if (avisos.length) alert('Visita registrada, mas ' + avisos.join('; ') + '.');
    onClose(true);
  };

  const input = 'w-full p-2.5 border border-gray-300 rounded-lg text-base mt-1';
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center overflow-y-auto">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-xl min-h-screen sm:min-h-0 sm:my-8">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 sm:rounded-t-2xl">
          <h3 className="text-lg font-bold text-white">📝 Registrar visita</h3>
          <button onClick={() => onClose(false)} className="text-white p-1"><X className="w-6 h-6" /></button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {/* Cliente */}
          {initialOpp ? (
            <p className="text-base"><span className="font-bold">{initialOpp.client}</span> <span className="text-gray-500 text-sm">· {initialOpp.name}</span></p>
          ) : (
            <div>
              <label className="text-sm font-semibold text-gray-700">Cliente *</label>
              <select value={oppId} onChange={e => setOppId(e.target.value)} className={input}>
                <option value="">Selecione...</option>
                {openOpps.map(o => <option key={o.id} value={String(o.id)}>{o.client} — {o.name}</option>)}
                <option value="novo">➕ Cliente novo (sem ficha)</option>
              </select>
              {oppId === 'novo' && (
                <>
                  <input value={novoCliente} onChange={e => setNovoCliente(e.target.value)} placeholder="Nome do cliente" className={input} />
                  {isAdmin && (
                    servicoVendors.length ? (
                      <select value={vendor} onChange={e => setVendor(e.target.value)} className={input}>
                        {servicoVendors.map(v => <option key={v} value={v}>👤 {v}</option>)}
                      </select>
                    ) : <p className="text-sm text-red-600 mt-1">Nenhum usuário de Serviço cadastrado.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tipo e data */}
          <div>
            <label className="text-sm font-semibold text-gray-700">Tipo de visita</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(VISITA_TIPOS).map(([k, t]) => (
                <button key={k} type="button" onClick={() => escolherTipo(k)}
                  className={'px-3 py-2 rounded-lg text-sm font-medium border ' +
                    (tipo === k ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300')}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">Data da visita</label>
              <input type="date" value={data} max={today} onChange={e => setData(e.target.value)} className={input} />
            </div>
          </div>

          {/* Relatório */}
          <div>
            <label className="text-sm font-semibold text-gray-700">Relatório técnico *</label>
            <textarea value={relatorio} onChange={e => setRelatorio(e.target.value)}
              placeholder="O que fez, o que encontrou, como ficou o equipamento... (pode colar o relatório que já manda ao cliente)"
              className="w-full p-2.5 border border-gray-300 rounded-lg text-base mt-1 h-32" />
          </div>

          {/* O que mais viu? */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-sm font-semibold text-blue-900">👁️ O que mais viu? <span className="font-normal text-blue-700">(cada item vira uma oportunidade com data)</span></p>
            {GANCHOS.map(g => {
              const gd = ganchos[g.id];
              return (
                <div key={g.id}>
                  <label className="flex items-center gap-2 text-sm text-gray-800 py-1">
                    <input type="checkbox" checked={gd.on} onChange={e => setGancho(g.id, { on: e.target.checked })} className="w-4 h-4" />
                    {g.label}
                  </label>
                  {gd.on && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 ml-6">
                      <input value={gd.texto} onChange={e => setGancho(g.id, { texto: e.target.value })}
                        placeholder="Detalhe (ex.: lâmina do cab. 2 gasta)" className="sm:col-span-2 p-2 border border-gray-300 rounded-lg text-sm" />
                      <input type="date" value={gd.data} onChange={e => setGancho(g.id, { data: e.target.value })}
                        className="p-2 border border-gray-300 rounded-lg text-sm" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ação que a visita conclui */}
          {pendentes[0] && (
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={concluir} onChange={e => setConcluir(e.target.checked)} className="w-4 h-4 mt-0.5" />
              <span>Esta visita conclui a ação planejada: <strong>{pendentes[0].next_action}</strong></span>
            </label>
          )}

          {/* Próximo passo / encerramento */}
          {podeEncerrar && (
            <label className="flex items-center gap-2 text-sm font-semibold text-green-800 p-2 bg-green-50 border border-green-200 rounded-lg">
              <input type="checkbox" checked={encerrar} onChange={e => setEncerrar(e.target.checked)} className="w-4 h-4" />
              Serviço concluído — encerrar esta oportunidade como Ganha
            </label>
          )}
          {!(podeEncerrar && encerrar) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-amber-900">📅 Próximo passo nesta oportunidade *</p>
              <input value={proxTexto} onChange={e => { setProxTexto(e.target.value); setProxEditado(true); }} className={input} />
              <input type="date" value={proxData} onChange={e => { setProxData(e.target.value); setProxEditado(true); }} className={input} />
            </div>
          )}
        </div>
        <div className="p-4 border-t flex gap-2">
          <button onClick={save} disabled={!valid || saving}
            className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-bold disabled:bg-gray-300 flex items-center justify-center">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Registrar</>}
          </button>
          <button onClick={() => onClose(false)} className="px-5 py-3 border rounded-lg text-gray-600">Cancelar</button>
        </div>
      </div>
    </div>
  );
};

// --- Ficha de uma oportunidade de Serviço ---
const formFromOpp = (opp) => {
  const info = opp.servico_info || {};
  return {
    client: opp.client || '',
    servico_tipo: opp.servico_tipo || '',
    equipamento: info.equipamento || '',
    support_contact: opp.support_contact || '',
    power_sponsor: opp.power_sponsor || '',
    caminho_po: info.caminho_po || '',
    fita: info.fita || '',
    fita_obs: info.fita_obs || '',
    value: Number(opp.value) > 0 ? String(opp.value) : '',
  };
};

const ServicoDetail = ({ opp, supabase, currentUser, onClose, onChange, onCreated, onRegistrarVisita, historyTick = 0 }) => {
  const svc = useMemo(() => new ServicoService(supabase), [supabase]);
  const actSvc = useMemo(() => new ActivityService(supabase), [supabase]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFromOpp(opp));
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(null); // 'won' | 'lost' | 'abandoned'
  const [motivo, setMotivo] = useState('');
  const [motivoOutro, setMotivoOutro] = useState('');
  const [notas, setNotas] = useState('');
  const [continuar, setContinuar] = useState(true);
  const [contTipo, setContTipo] = useState('');
  const [contTexto, setContTexto] = useState('');
  const [contData, setContData] = useState('');
  // Passo Orçamento: montado com o Jordi e enviado por e-mail
  const [orc, setOrc] = useState(null); // { valor, enviadoEm, cobrarEm, concluir, pendente, carregado }
  // Recarrega o histórico da ficha depois de escritas feitas fora do painel
  const [localTick, setLocalTick] = useState(0);

  // Sugestão de continuidade calculada ao abrir o encerramento, com o tipo atual
  const startClosing = (outcome) => {
    const cont = CONTINUIDADE[opp.servico_tipo] || CONTINUIDADE._;
    setContinuar(true);
    setContTipo(cont.tipo);
    setContTexto(cont.texto);
    setContData(addDaysISO(todayLocal(), cont.dias));
    setClosing(outcome);
  };

  useEffect(() => { if (!editing) setForm(formFromOpp(opp)); }, [opp, editing]);

  const owner = opp.vendor || currentUser;
  const etapa = etapaOf(opp);
  const info = opp.servico_info || {};
  const isClosed = !!opp.outcome;
  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const saveDados = async () => {
    setSaving(true);
    try {
      const tipo = form.servico_tipo || null;
      const client = form.client.trim() || opp.client;
      const row = await svc.updateOpp(opp.id, {
        client,
        // Nome segue cliente/tipo enquanto for o gerado automaticamente
        ...(opp.name === oppName(opp.client, opp.servico_tipo) ? { name: oppName(client, tipo) } : {}),
        servico_tipo: tipo,
        support_contact: form.support_contact.trim() || null,
        power_sponsor: form.power_sponsor.trim() || null,
        value: parseFloat(form.value) > 0 ? parseFloat(form.value) : null,
        servico_info: cleanInfo({
          ...info,
          equipamento: form.equipamento, caminho_po: form.caminho_po, fita: form.fita, fita_obs: form.fita_obs,
        }),
        last_update: todayLocal(),
      });
      onChange(row);
      setEditing(false);
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar: ' + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const abrirOrcamento = async () => {
    const hoje = todayLocal();
    setOrc({ valor: Number(opp.value) > 0 ? String(opp.value) : '', enviadoEm: hoje, cobrarEm: addDaysISO(hoje, 7), concluir: true, pendente: null, carregado: false });
    let pendente = null;
    try {
      const rows = await svc.getPlanned([opp.id]);
      pendente = rows[0] || null;
    } catch (e) { console.error(e); }
    setOrc(prev => (prev ? { ...prev, pendente, carregado: true } : prev));
  };

  const confirmarOrcamento = async () => {
    if (!orc || !orc.carregado || !orc.enviadoEm || !orc.cobrarEm || saving) return;
    setSaving(true);
    let row;
    try {
      const valor = parseFloat(orc.valor);
      row = await svc.updateOpp(opp.id, {
        servico_etapa: 'orcamento', servico_etapa_desde: new Date().toISOString(),
        ...(valor > 0 ? { value: valor } : {}),
        servico_info: cleanInfo({ ...info, orcamento_enviado_em: orc.enviadoEm }),
        last_update: todayLocal(),
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao registrar o orçamento: ' + errMsg(e));
      setSaving(false);
      return;
    }
    // Só publica a linha (e remonta o painel) depois de todas as escritas,
    // senão o histórico recarrega antes e mostra a ação antiga como pendente
    const avisos = [];
    let synced = null;
    try { await svc.logEtapa(opp, etapa.label, 'Orçamento', owner); } catch (e) { console.error(e); }
    if (orc.concluir && orc.pendente) {
      try { await svc.markPlannedDone(orc.pendente.id, orc.enviadoEm); } catch (e) { console.error(e); avisos.push('a ação anterior não foi marcada como feita'); }
    }
    try {
      await actSvc.createPlanned(opp.id, owner, opp.stage || 1, { text: 'Cobrar resposta do orçamento', date: orc.cobrarEm, type: 'call' });
      synced = await actSvc.syncNextAction(opp.id);
    } catch (e) { console.error(e); avisos.push('a cobrança não foi agendada — planeje na ficha'); }
    onChange(synced || row);
    setLocalTick(t => t + 1);
    setOrc(null);
    setSaving(false);
    if (avisos.length) alert('Orçamento registrado, mas ' + avisos.join('; ') + '.');
  };

  const changeEtapa = async (to) => {
    if (isClosed || saving || to === etapa.id) return;
    if (to === 'orcamento') { abrirOrcamento(); return; }
    const toEtapa = SERVICO_ETAPAS.find(e => e.id === to);
    setSaving(true);
    try {
      const row = await svc.updateOpp(opp.id, {
        servico_etapa: to, servico_etapa_desde: new Date().toISOString(), last_update: todayLocal(),
      });
      try { await svc.logEtapa(opp, etapa.label, toEtapa.label, owner); } catch (e) { console.error(e); }
      onChange(row);
    } catch (e) {
      console.error(e);
      alert('Erro ao mudar etapa: ' + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmClose = async () => {
    if (closing !== 'won' && !motivo) { alert('Motivo obrigatório'); return; }
    if (closing !== 'won' && motivo === 'Outro' && !motivoOutro.trim()) { alert('Descreva o motivo'); return; }
    if (closing === 'won' && continuar && (!contTexto.trim() || !contData)) { alert('Informe a próxima ação e a data da continuidade'); return; }
    setSaving(true);
    // Passos separados: se algo falha depois de encerrar, a UI reflete o que
    // de fato ficou gravado e o aviso diz exatamente o que faltou.
    let row;
    try {
      const lossReason = closing === 'won' ? null : (motivo === 'Outro' ? motivoOutro.trim() : motivo);
      row = await svc.updateOpp(opp.id, {
        outcome: closing, loss_reason: lossReason, outcome_notes: notas.trim() || null, last_update: todayLocal(),
        // updated_at muda com qualquer edição; a data de encerramento fica explícita
        servico_info: cleanInfo({ ...info, encerrada_em: todayLocal() }),
      });
      onChange(row);
    } catch (e) {
      console.error(e);
      alert('Erro ao encerrar: ' + errMsg(e));
      setSaving(false);
      return;
    }
    const avisos = [];
    try {
      await svc.closePending(opp.id);
      const synced = await actSvc.syncNextAction(opp.id);
      if (synced) onChange(synced);
    } catch (e) {
      console.error(e);
      avisos.push('as ações planejadas antigas não foram fechadas (' + errMsg(e) + ')');
    }
    if (closing === 'won' && continuar) {
      let created = null;
      try {
        const tipo = contTipo || null;
        created = await svc.insertOpp({
          name: oppName(opp.client, tipo),
          client: opp.client,
          vendor: opp.vendor,
          business_unit: 'servico',
          servico_tipo: tipo,
          servico_etapa: 'contato',
          servico_etapa_desde: new Date().toISOString(),
          servico_info: cleanInfo({ equipamento: info.equipamento }),
          support_contact: opp.support_contact || null,
          power_sponsor: opp.power_sponsor || null,
          industry: opp.industry || null,
          product: 'Serviço — ' + (tipo ? tipoLabel(tipo) : 'a definir'),
          product_lines: ['servico_manutencao'],
          stage: 1,
          probability: 0,
          priority: 'média',
          next_action: contTexto.trim(),
          next_action_date: contData,
          last_update: todayLocal(),
        });
        onCreated(created);
        await actSvc.createPlanned(created.id, created.vendor, 1, { text: contTexto.trim(), date: contData, type: 'call' });
      } catch (e) {
        console.error(e);
        avisos.push(created
          ? 'a continuidade foi criada, mas sem a próxima ação — planeje na ficha dela'
          : 'a continuidade não foi criada (' + errMsg(e) + ') — crie com "+ Nova"');
      }
    }
    setSaving(false);
    if (avisos.length) alert('Oportunidade encerrada, mas ' + avisos.join('; e ') + '.');
    onClose();
  };

  const reopen = async () => {
    if (!confirm('Reabrir esta oportunidade?')) return;
    setSaving(true);
    try {
      const { encerrada_em: _encerrada, ...infoAberta } = info;
      const row = await svc.updateOpp(opp.id, { outcome: null, loss_reason: null, last_update: todayLocal(), servico_info: infoAberta });
      onChange(row);
    } catch (e) {
      alert('Erro ao reabrir: ' + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full p-2.5 border border-gray-300 rounded-lg text-base mt-1';
  const OUTCOME = { won: '✅ Ganho', lost: '❌ Perdido', abandoned: '⏸️ Abandonado' };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center overflow-y-auto">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl shadow-xl min-h-screen sm:min-h-0 sm:my-8">
        {/* Cabeçalho */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 border-b bg-gradient-to-r from-amber-500 to-orange-500 sm:rounded-t-2xl">
          <div className="min-w-0 text-white">
            <h3 className="text-xl font-bold truncate">{opp.client}</h3>
            <p className="text-sm opacity-90 truncate">{opp.name} · 👤 {opp.vendor}</p>
          </div>
          <button onClick={onClose} className="text-white p-1 flex-shrink-0"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-4 space-y-5">
          {isClosed && (
            <div className="p-3 rounded-lg bg-gray-100 border flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-gray-800">{OUTCOME[opp.outcome] || opp.outcome}</p>
                {opp.loss_reason && <p className="text-sm text-gray-600">Motivo: {opp.loss_reason}</p>}
                {opp.outcome_notes && <p className="text-sm text-gray-600">{opp.outcome_notes}</p>}
              </div>
              <button onClick={reopen} disabled={saving} className="px-3 py-2 text-sm border rounded-lg bg-white">↩️ Reabrir</button>
            </div>
          )}

          {!isClosed && onRegistrarVisita && (
            <button onClick={onRegistrarVisita}
              className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold text-base hover:bg-orange-600">
              📝 Registrar visita / relatório
            </button>
          )}

          {/* Etapa */}
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">
              Etapa {opp.servico_etapa_desde && !isClosed && <span className="font-normal text-gray-400">· há {daysSince(opp.servico_etapa_desde)}d</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {SERVICO_ETAPAS.map((e, i) => {
                const active = e.id === etapa.id;
                const passed = SERVICO_ETAPAS.findIndex(x => x.id === etapa.id) > i;
                return (
                  <button key={e.id} onClick={() => changeEtapa(e.id)} disabled={isClosed || saving} title={e.hint}
                    className={'px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ' +
                      (active ? 'bg-orange-500 text-white border-orange-500'
                        : passed ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-orange-300')}>
                    {i + 1}. {e.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">{etapa.hint}</p>
            {orc && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-amber-900">📧 Orçamento enviado (montado com Jordi, por e-mail)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div><label className="text-xs font-semibold text-gray-600">Valor (R$)</label>
                    <input type="number" min="0" value={orc.valor} onChange={e => setOrc({ ...orc, valor: e.target.value })} className={input} /></div>
                  <div><label className="text-xs font-semibold text-gray-600">Enviado em</label>
                    <input type="date" value={orc.enviadoEm} onChange={e => setOrc({ ...orc, enviadoEm: e.target.value })} className={input} /></div>
                  <div><label className="text-xs font-semibold text-gray-600">Cobrar resposta em</label>
                    <input type="date" value={orc.cobrarEm} onChange={e => setOrc({ ...orc, cobrarEm: e.target.value })} className={input} /></div>
                </div>
                {orc.pendente && (
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={orc.concluir} onChange={e => setOrc({ ...orc, concluir: e.target.checked })} className="w-4 h-4 mt-0.5" />
                    <span>Concluir a ação planejada: <strong>{orc.pendente.next_action}</strong></span>
                  </label>
                )}
                <div className="flex gap-2">
                  <button onClick={confirmarOrcamento} disabled={saving || !orc.carregado || !orc.enviadoEm || !orc.cobrarEm}
                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-bold disabled:bg-gray-300">
                    {saving || !orc.carregado ? '⏳' : 'Confirmar'}
                  </button>
                  <button onClick={() => setOrc(null)} className="px-4 py-2.5 border rounded-lg text-gray-600">Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Dados */}
          <div className="border rounded-xl">
            <div className="flex items-center justify-between p-3 border-b bg-gray-50 rounded-t-xl">
              <p className="font-semibold text-gray-700">Dados do serviço</p>
              {!editing
                ? <button onClick={() => setEditing(true)} className="text-sm text-orange-600 font-semibold flex items-center"><Edit3 className="w-4 h-4 mr-1" /> Editar</button>
                : <button onClick={() => setEditing(false)} className="text-sm text-gray-500">Cancelar</button>}
            </div>
            {!editing ? (
              <dl className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-gray-500">Tipo</dt><dd><TipoChip tipo={opp.servico_tipo} /></dd></div>
                <div><dt className="text-gray-500">Valor estimado</dt><dd className="text-gray-900">{fmtMoney(opp.value) || '—'}</dd></div>
                {info.orcamento_enviado_em && (
                  <div className="sm:col-span-2"><dt className="text-gray-500">Orçamento enviado em</dt>
                    <dd className="text-gray-900">{fmtDate(info.orcamento_enviado_em)} · há {daysBetween(info.orcamento_enviado_em, todayLocal())}d</dd></div>
                )}
                <div className="sm:col-span-2"><dt className="text-gray-500">Equipamento</dt><dd className="text-gray-900">{info.equipamento || '—'}</dd></div>
                <div><dt className="text-gray-500">Contato técnico</dt><dd className="text-gray-900">{opp.support_contact || '—'}</dd></div>
                <div><dt className="text-gray-500">Quem aprova</dt><dd className="text-gray-900">{opp.power_sponsor || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-gray-500">Caminho do PO</dt><dd className="text-gray-900">{info.caminho_po || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-gray-500">Fita</dt><dd className="text-gray-900">{[FITA_STATUS[info.fita], info.fita_obs].filter(Boolean).join(' — ') || '—'}</dd></div>
              </dl>
            ) : (
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-sm font-semibold text-gray-600">Cliente</label>
                    <input value={form.client} onChange={set('client')} className={input} /></div>
                  <div><label className="text-sm font-semibold text-gray-600">Tipo</label>
                    <select value={form.servico_tipo} onChange={set('servico_tipo')} className={input}>
                      <option value="">A definir</option>
                      {Object.entries(SERVICO_TIPOS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                    </select></div>
                </div>
                <div><label className="text-sm font-semibold text-gray-600">Equipamento</label>
                  <input value={form.equipamento} onChange={set('equipamento')} placeholder="Modelo, quantidade de cabeçotes, linha" className={input} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="text-sm font-semibold text-gray-600">Contato técnico</label>
                    <input value={form.support_contact} onChange={set('support_contact')} className={input} /></div>
                  <div><label className="text-sm font-semibold text-gray-600">Quem aprova a compra</label>
                    <input value={form.power_sponsor} onChange={set('power_sponsor')} className={input} /></div>
                </div>
                <div><label className="text-sm font-semibold text-gray-600">Caminho do PO</label>
                  <input value={form.caminho_po} onChange={set('caminho_po')} placeholder="Cadastro de fornecedor, cotações, prazo de Compras..." className={input} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="text-sm font-semibold text-gray-600">Fita</label>
                    <select value={form.fita} onChange={set('fita')} className={input}>
                      <option value="">—</option>
                      {Object.entries(FITA_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select></div>
                  <div className="sm:col-span-2"><label className="text-sm font-semibold text-gray-600">Obs. fita</label>
                    <input value={form.fita_obs} onChange={set('fita_obs')} placeholder="Ex: consome 6151QT" className={input} /></div>
                </div>
                <div><label className="text-sm font-semibold text-gray-600">Valor estimado (R$)</label>
                  <input type="number" min="0" value={form.value} onChange={set('value')} className={input} /></div>
                <button onClick={saveDados} disabled={saving}
                  className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-bold disabled:bg-gray-300 flex items-center justify-center">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Salvar</>}
                </button>
              </div>
            )}
          </div>

          {/* Agenda e histórico — mesmo painel de Vendas, sem PPVVCC */}
          <ActivityPanel
            key={opp.id + ':' + (opp.servico_etapa || '') + ':' + (opp.outcome || '') + ':' + historyTick + ':' + localTick}
            opportunity={opp}
            currentUser={currentUser}
            supabase={supabase}
            onOpportunityChange={onChange}
            mode="servico"
            readOnly={isClosed}
          />

          {/* Encerrar */}
          {!isClosed && (
            <div className="border rounded-xl p-3">
              {!closing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-600 mr-auto">Encerrar oportunidade:</span>
                  <button onClick={() => startClosing('won')} className="px-3 py-2 rounded-lg text-sm font-bold bg-green-600 text-white">✅ Ganho</button>
                  <button onClick={() => startClosing('lost')} className="px-3 py-2 rounded-lg text-sm font-bold bg-red-600 text-white">❌ Perdido</button>
                  <button onClick={() => startClosing('abandoned')} className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-500 text-white">⏸️ Abandonado</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="font-bold text-gray-800">{OUTCOME[closing]}</p>
                  {closing !== 'won' && (
                    <>
                      <div><label className="text-sm font-semibold text-gray-600">Motivo *</label>
                        <select value={motivo} onChange={e => setMotivo(e.target.value)} className={input}>
                          <option value="">Selecione...</option>
                          {LOSS_REASONS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select></div>
                      {motivo === 'Outro' && <input value={motivoOutro} onChange={e => setMotivoOutro(e.target.value)} placeholder="Qual?" className={input} />}
                    </>
                  )}
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observações (opcional)" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm h-16 resize-none" />
                  {closing === 'won' && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-green-900">
                        <input type="checkbox" checked={continuar} onChange={e => setContinuar(e.target.checked)} />
                        Criar a continuidade com este cliente
                      </label>
                      {continuar && (
                        <>
                          <input value={contTexto} onChange={e => setContTexto(e.target.value)} className={input} />
                          <div className="grid grid-cols-2 gap-3">
                            <input type="date" value={contData} onChange={e => setContData(e.target.value)} className={input} />
                            <select value={contTipo} onChange={e => setContTipo(e.target.value)} className={input}>
                              <option value="">Tipo a definir</option>
                              {Object.entries(SERVICO_TIPOS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                            </select>
                          </div>
                          <p className="text-xs text-green-800">O reparo abre a venda seguinte: vira uma nova oportunidade na agenda.</p>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={confirmClose} disabled={saving}
                      className="flex-1 py-2.5 bg-gray-900 text-white rounded-lg font-bold disabled:bg-gray-300">
                      {saving ? '⏳' : 'Confirmar'}
                    </button>
                    <button onClick={() => setClosing(null)} className="px-4 py-2.5 border rounded-lg text-gray-600">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Acompanhamento (Jordi segue o Serviço dia a dia) ---
const isVisita = (a) => typeof a.methodology_code === 'string' && a.methodology_code.startsWith('SV-');
const RESULT_ICON = { positivo: '✅', neutro: '➡️', negativo: '❌' };
const OUTCOME_LABEL = { won: '✅ Ganha', lost: '❌ Perdida', abandoned: '⏸️ Abandonada' };
const localDateOf = (ts) => {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
// Dias úteis (seg–sex) depois de `iso` até hoje
const diasUteisDesde = (iso, today) => {
  let n = 0;
  for (let d = addDaysISO(iso, 1); d <= today; d = addDaysISO(d, 1)) {
    const wd = new Date(d + 'T12:00:00').getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
};
// Planejada = linha criada como plano (texto em next_action); o "Aconteceu"
// gera outra linha, com next_action nulo. Descartada continua sendo plano.
const isPlanejada = (a) => !!a.next_action
  && (a.result == null || a.result === 'descartado' || (a.result === 'positivo' && a.description === a.next_action));
// Registro de verdade: visita, mudança de etapa ou "Aconteceu"/registro manual.
// Planejar, reagendar ou descartar não conta (mesma regra do digest do bot).
const isRegistro = (a) => isVisita(a) || a.activity_type === 'stage_change'
  || (!a.next_action && !!a.result && a.result !== 'expirado');
// Data do encerramento: explícita em servico_info; last_update para as antigas
const encerradaEm = (o) => (o.servico_info && o.servico_info.encerrada_em) || o.last_update || null;

const ServicoAcompanhamento = ({ supabase, opportunities, open, planned, plannedByOpp, agendaOk, plannedError, today, onOpen, tick }) => {
  const svc = useMemo(() => new ServicoService(supabase), [supabase]);
  const [dias, setDias] = useState(7);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [aberto, setAberto] = useState({});
  const oppById = useMemo(() => new Map(opportunities.map(o => [o.id, o])), [opportunities]);
  const idsKey = opportunities.map(o => o.id).sort((a, b) => a - b).join(',');
  const desde = addDaysISO(today, -dias);
  const desdeTs = new Date(desde + 'T00:00:00').toISOString();

  useEffect(() => {
    let cancelled = false;
    // Sem isso, ao trocar 7↔30 dias os números misturam o feed do período anterior
    setLoading(true);
    (async () => {
      try {
        const rows = await svc.getRecent(idsKey ? idsKey.split(',').map(Number) : [], desdeTs);
        if (!cancelled) { setFeed(rows); setErr(null); }
      } catch (e) {
        console.error('Erro ao carregar acompanhamento:', e);
        if (!cancelled) setErr(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [svc, idsKey, desdeTs, tick]);

  const clientOf = (id) => (oppById.get(id) || {}).client || '?';

  // Linha do tempo: atividades + oportunidades novas e encerradas no período
  const eventos = useMemo(() => {
    const ev = [];
    feed.forEach(a => {
      if (a.result === 'expirado') return; // limpeza feita ao encerrar
      const base = { oppId: a.opportunity_id, ts: a.created_at, vendor: a.vendor };
      if (isVisita(a)) {
        const vt = visitaTipoByCode(a.methodology_code);
        const linhas = (a.description || '').split('\n');
        ev.push({ ...base, key: 'a' + a.id, dia: a.activity_date || localDateOf(a.created_at), icon: vt ? vt.icon : '🔧',
          titulo: `Visita — ${clientOf(a.opportunity_id)}`, sub: vt ? vt.label : '', corpo: linhas.slice(1).join('\n').trim(), visita: true });
      } else if (a.activity_type === 'stage_change') {
        ev.push({ ...base, key: 'a' + a.id, dia: localDateOf(a.created_at), icon: '📊', titulo: clientOf(a.opportunity_id), sub: a.description });
      } else if (isPlanejada(a)) {
        const feita = a.next_action_done && a.result === 'positivo';
        ev.push({ ...base, key: 'a' + a.id, dia: localDateOf(a.created_at), icon: '📅',
          titulo: `${clientOf(a.opportunity_id)} · planejou${feita ? ' (feita)' : ''}`,
          sub: a.next_action + (a.next_action_date ? ` — ${fmtDate(a.next_action_date)}` : '') });
      } else {
        ev.push({ ...base, key: 'a' + a.id, dia: a.activity_date || localDateOf(a.created_at), icon: RESULT_ICON[a.result] || '📝',
          titulo: clientOf(a.opportunity_id), sub: a.description });
      }
    });
    opportunities.forEach(o => {
      if (o.created_at && o.created_at >= desdeTs) {
        ev.push({ key: 'n' + o.id, oppId: o.id, ts: o.created_at, dia: localDateOf(o.created_at), icon: '🆕',
          titulo: `Nova oportunidade — ${o.client}`, sub: o.name, vendor: o.vendor });
      }
      const fechada = o.outcome ? encerradaEm(o) : null;
      if (fechada && fechada >= desde) {
        ev.push({ key: 'c' + o.id, oppId: o.id, ts: new Date(fechada + 'T23:59:00').toISOString(), dia: fechada, icon: '🏁',
          titulo: `${OUTCOME_LABEL[o.outcome] || o.outcome} — ${o.client}`,
          sub: [o.loss_reason && `Motivo: ${o.loss_reason}`, fmtMoney(o.value)].filter(Boolean).join(' · '), vendor: o.vendor });
      }
    });
    return ev.sort((x, y) => String(y.ts).localeCompare(String(x.ts)));
  }, [feed, opportunities, desde, desdeTs, oppById]);

  const porDia = useMemo(() => {
    const m = new Map();
    eventos.forEach(e => { if (!m.has(e.dia)) m.set(e.dia, []); m.get(e.dia).push(e); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [eventos]);

  // Números do período
  const visitas = eventos.filter(e => e.visita && e.dia >= desde).length;
  const orcs = opportunities.filter(o => o.servico_info && o.servico_info.orcamento_enviado_em && o.servico_info.orcamento_enviado_em >= desde);
  const ganhas = opportunities.filter(o => o.outcome === 'won' && (encerradaEm(o) || '') >= desde);
  const novas = opportunities.filter(o => o.created_at && o.created_at >= desdeTs);
  const soma = (list) => list.reduce((s, o) => s + (Number(o.value) || 0), 0);

  // O que precisa de atenção hoje
  const atencao = [];
  if (agendaOk) {
    planned.filter(a => a.next_action_date && a.next_action_date < today).forEach(a => atencao.push({
      key: 'p' + a.id, oppId: a.opportunity_id, cor: 'red',
      texto: `${clientOf(a.opportunity_id)}: ${a.next_action}`, tag: `atrasada ${daysBetween(a.next_action_date, today)}d`,
    }));
    open.filter(o => !plannedByOpp.has(o.id)).forEach(o => atencao.push({
      key: 's' + o.id, oppId: o.id, cor: 'red', texto: `${o.client}: sem próxima ação`, tag: etapaOf(o).label,
    }));
  }
  open.filter(o => o.servico_etapa === 'orcamento').forEach(o => {
    const base = (o.servico_info && o.servico_info.orcamento_enviado_em) || (o.servico_etapa_desde ? localDateOf(o.servico_etapa_desde) : null);
    const d = base ? daysBetween(base, today) : 0;
    if (d > 7) atencao.push({ key: 'o' + o.id, oppId: o.id, cor: 'amber', texto: `${o.client}: orçamento sem resposta`, tag: `${d}d${fmtMoney(o.value) ? ' · ' + fmtMoney(o.value) : ''}` });
  });
  open.filter(o => o.servico_etapa !== 'orcamento' && daysSince(o.servico_etapa_desde) > 21).forEach(o => atencao.push({
    key: 'e' + o.id, oppId: o.id, cor: 'amber', texto: `${o.client}: parada em ${etapaOf(o).label}`, tag: `${daysSince(o.servico_etapa_desde)}d`,
  }));

  // Último registro real (visita, Aconteceu, mudança de etapa) — planejar não conta
  const ultimo = feed.filter(isRegistro).map(a => a.created_at).sort().pop();
  const semRegistro = loading || err ? null
    : !ultimo ? `Nenhum registro nos últimos ${dias} dias`
    : diasUteisDesde(localDateOf(ultimo), today) >= 2 ? `Sem registro há ${diasUteisDesde(localDateOf(ultimo), today)} dias úteis` : null;

  const rotuloDia = (d) => (d === today ? 'Hoje' : d === addDaysISO(today, -1) ? 'Ontem'
    : new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-gray-800 text-lg">👁️ Acompanhamento</h3>
        <div className="flex gap-1">
          {[7, 30].map(n => (
            <button key={n} onClick={() => setDias(n)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${dias === n ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {n} dias
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Visitas</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '…' : visitas}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Orçamentos enviados</p>
          <p className="text-2xl font-bold text-amber-600">{orcs.length}</p>
          {soma(orcs) > 0 && <p className="text-xs text-gray-500">{fmtMoney(soma(orcs))}</p>}
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Ganhas</p>
          <p className="text-2xl font-bold text-green-600">{ganhas.length}</p>
          {soma(ganhas) > 0 && <p className="text-xs text-gray-500">{fmtMoney(soma(ganhas))}</p>}
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Oportunidades novas</p>
          <p className="text-2xl font-bold text-blue-600">{novas.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <p className="font-bold text-gray-800 mb-2">⚠️ Precisa de atenção ({atencao.length + (semRegistro ? 1 : 0)})</p>
        {plannedError && <p className="text-sm text-amber-700 mb-2">Agenda indisponível: não dá para listar atrasos agora.</p>}
        {semRegistro && <p className="text-sm font-semibold text-red-700 mb-2">📵 {semRegistro}</p>}
        {atencao.length === 0 && !semRegistro ? (
          <p className="text-sm text-green-700">Tudo em dia ✅</p>
        ) : (
          <div className="space-y-1.5">
            {atencao.map(a => (
              <button key={a.key} onClick={() => onOpen(a.oppId)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 border ${a.cor === 'red' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <span className="flex-1 min-w-0 truncate">{a.texto}</span>
                <span className="text-xs font-semibold whitespace-nowrap">{a.tag}</span>
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow">
        <p className="font-bold text-gray-800 p-4 border-b">🕒 Atividade recente</p>
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>
        ) : err ? (
          <p className="p-4 text-sm text-amber-700">Não foi possível carregar: {err}</p>
        ) : porDia.length === 0 ? (
          <p className="p-6 text-center text-gray-500">Nenhuma atividade nos últimos {dias} dias.</p>
        ) : (
          <div className="divide-y">
            {porDia.map(([dia, lista]) => (
              <div key={dia} className="p-4">
                <p className="text-xs font-bold uppercase text-gray-500 mb-2">{rotuloDia(dia)}</p>
                <div className="space-y-2">
                  {lista.map(e => (
                    <div key={e.key} className={`rounded-lg p-2.5 ${e.visita ? 'bg-orange-50 border border-orange-200' : ''}`}>
                      <button onClick={() => onOpen(e.oppId)} className="w-full text-left flex items-start gap-2">
                        <span className="text-base leading-6">{e.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold text-gray-900 text-sm">{e.titulo}</span>
                          {e.sub && <span className="block text-sm text-gray-600 whitespace-pre-wrap break-words">{e.sub}</span>}
                        </span>
                        {e.vendor && <span className="text-xs text-gray-400 whitespace-nowrap">👤 {e.vendor}</span>}
                      </button>
                      {e.visita && e.corpo && (
                        <div className="ml-7 mt-1">
                          <button onClick={() => setAberto(prev => ({ ...prev, [e.key]: !prev[e.key] }))}
                            className="text-sm text-orange-700 font-semibold">
                            {aberto[e.key] ? 'Ocultar relatório' : 'Ver relatório'}
                          </button>
                          {aberto[e.key] && <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{e.corpo}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Aba Serviço ---
export const ServicoDashboard =({ supabase, currentUser, isAdmin, vendors, opportunities, onOpportunityChange, onReload }) => {
  const svc = useMemo(() => new ServicoService(supabase), [supabase]);
  const actSvc = useMemo(() => new ActivityService(supabase), [supabase]);
  // Jordi (admin) abre no Acompanhamento; o técnico, na Agenda
  const [view, setView] = useState(isAdmin ? 'acompanhamento' : 'agenda');
  const [visitFor, setVisitFor] = useState(null); // null | 'nova' | oportunidade
  const [planned, setPlanned] = useState([]);
  // Spinner só na primeira carga: nos refresh a lista fica montada (senão os
  // cartões perdem foco e rascunhos a cada ação)
  const [loadingPlanned, setLoadingPlanned] = useState(true);
  const [plannedError, setPlannedError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [tick, setTick] = useState(0);
  const today = todayLocal();

  const servicoVendors = useMemo(
    () => (vendors || []).filter(v => v.business_unit === 'servico').map(v => v.name),
    [vendors]
  );
  const open = useMemo(() => opportunities.filter(o => !o.outcome), [opportunities]);
  const closed = useMemo(
    () => opportunities.filter(o => !!o.outcome).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
    [opportunities]
  );
  const oppById = useMemo(() => new Map(opportunities.map(o => [o.id, o])), [opportunities]);
  const idsKey = open.map(o => o.id).sort((a, b) => a - b).join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await svc.getPlanned(idsKey ? idsKey.split(',').map(Number) : []);
        if (!cancelled) { setPlanned(rows); setPlannedError(null); }
      } catch (e) {
        console.error('Erro ao carregar agenda de Serviço:', e);
        if (!cancelled) setPlannedError(errMsg(e));
      } finally {
        if (!cancelled) setLoadingPlanned(false);
      }
    })();
    return () => { cancelled = true; };
  }, [svc, idsKey, tick]);

  const refreshPlanned = () => setTick(t => t + 1);

  const plannedByOpp = useMemo(() => {
    const m = new Map();
    planned.forEach(a => {
      if (!m.has(a.opportunity_id)) m.set(a.opportunity_id, []);
      m.get(a.opportunity_id).push(a);
    });
    return m;
  }, [planned]);

  const sync = async (oppId) => {
    const row = await actSvc.syncNextAction(oppId);
    if (row) onOpportunityChange(row);
  };

  // Ações da agenda — mesmo fluxo do painel da ficha, em nome do dono da oportunidade
  const handleResolve = async (a, { result, note, nextText, nextDate }) => {
    const opp = oppById.get(a.opportunity_id);
    const owner = (opp && opp.vendor) || currentUser;
    try {
      await actSvc.resolvePlanned(a, owner, (opp && opp.stage) || 1, { result, note });
      if (nextText) await actSvc.createPlanned(a.opportunity_id, owner, (opp && opp.stage) || 1, { text: nextText, date: nextDate, type: a.activity_type });
      await sync(a.opportunity_id);
    } catch (e) {
      console.error(e);
      alert('Erro ao registrar: ' + errMsg(e));
    }
    refreshPlanned();
  };
  const handleReschedule = async (id, date) => {
    const a = planned.find(p => p.id === id);
    try {
      await actSvc.reschedulePlanned(id, date);
      if (a) await sync(a.opportunity_id);
    } catch (e) {
      console.error(e);
      alert('Erro ao reagendar: ' + errMsg(e));
    }
    refreshPlanned();
  };
  const handleDiscard = async (id, reason) => {
    const a = planned.find(p => p.id === id);
    try {
      await actSvc.markDiscarded(id, reason);
      if (a) await sync(a.opportunity_id);
    } catch (e) {
      console.error(e);
      alert('Erro ao descartar: ' + errMsg(e));
    }
    refreshPlanned();
  };

  const semAcao = open.filter(o => !plannedByOpp.has(o.id));
  const weekEnd = addDaysISO(today, 7);
  const groups = [
    { id: 'atrasadas', label: '🔴 Atrasadas', items: planned.filter(a => a.next_action_date && a.next_action_date < today) },
    { id: 'hoje', label: '🟠 Hoje', items: planned.filter(a => a.next_action_date === today) },
    { id: 'semana', label: '📅 Próximos 7 dias', items: planned.filter(a => a.next_action_date > today && a.next_action_date <= weekEnd) },
    { id: 'depois', label: '🗓️ Mais adiante', items: planned.filter(a => a.next_action_date > weekEnd) },
    { id: 'semdata', label: '⚠️ Sem data', items: planned.filter(a => !a.next_action_date) },
  ];
  const atrasadas = groups[0].items.length;
  const hoje = groups[1].items.length;
  // Sem a agenda carregada, lista vazia não significa "sem próxima ação"
  const agendaOk = !loadingPlanned && !plannedError;
  const kpi = (n) => (loadingPlanned ? '…' : plannedError ? '—' : n);
  const selectedOpp = selectedId ? oppById.get(selectedId) : null;

  const reload = async () => {
    if (onReload) await onReload();
    refreshPlanned();
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center"><Wrench className="w-5 h-5 mr-2 text-orange-500" /> Serviço</h2>
          <p className="text-sm text-gray-500">Reparos, preventivas e fita — agenda e acompanhamento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={reload} title="Atualizar" className="p-2.5 border border-gray-300 rounded-lg bg-white text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center px-4 py-2.5 bg-white border border-orange-400 text-orange-600 rounded-lg font-bold hover:bg-orange-50">
            <Plus className="w-5 h-5 mr-1" /> Nova
          </button>
          <button onClick={() => setVisitFor('nova')}
            className="flex items-center px-4 py-2.5 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600">
            📝 Registrar visita
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-orange-400">
          <p className="text-xs text-gray-500 font-semibold uppercase">Abertas</p>
          <p className="text-3xl font-bold text-gray-800">{open.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-500">
          <p className="text-xs text-gray-500 font-semibold uppercase">Sem próxima ação</p>
          <p className="text-3xl font-bold text-red-600">{kpi(semAcao.length)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-red-400">
          <p className="text-xs text-gray-500 font-semibold uppercase">Atrasadas</p>
          <p className="text-3xl font-bold text-red-500">{kpi(atrasadas)}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4 border-l-4 border-amber-400">
          <p className="text-xs text-gray-500 font-semibold uppercase">Hoje</p>
          <p className="text-3xl font-bold text-amber-600">{kpi(hoje)}</p>
        </div>
      </div>

      {/* Visões */}
      <div className="flex flex-wrap gap-2">
        {[
          ...(isAdmin ? [{ id: 'acompanhamento', label: '👁️ Acompanhamento', c: null }] : []),
          { id: 'agenda', label: '📅 Agenda', c: planned.length },
          { id: 'carteira', label: '🗂️ Carteira', c: open.length },
          { id: 'fechadas', label: '✅ Fechadas', c: closed.length },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`px-4 py-2.5 rounded-lg font-medium text-base ${view === t.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}{t.c != null ? ` (${t.c})` : ''}
          </button>
        ))}
      </div>

      {plannedError && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-amber-900">Não foi possível carregar a agenda</p>
            <p className="text-sm text-amber-800">Verifique a conexão. {plannedError}</p>
          </div>
          <button onClick={refreshPlanned} className="px-4 py-2 bg-amber-500 text-white rounded-lg font-bold">Tentar de novo</button>
        </div>
      )}

      {/* Sem próxima ação: tem que ficar em zero */}
      {agendaOk && semAcao.length > 0 && (view === 'agenda' || view === 'carteira') && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
          <p className="font-bold text-red-800">⚠️ Sem próxima ação ({semAcao.length})</p>
          <p className="text-sm text-red-700 mb-3">Toda oportunidade viva precisa de próxima ação com data — planeje ou encerre.</p>
          <div className="flex flex-wrap gap-2">
            {semAcao.map(o => (
              <button key={o.id} onClick={() => setSelectedId(o.id)}
                className="px-3 py-2 bg-white border border-red-300 rounded-lg text-sm font-semibold text-red-800 hover:bg-red-100 flex items-center gap-1">
                {o.client} <ChevronRight className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'agenda' && !plannedError && (
        loadingPlanned ? (
          <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500" /></div>
        ) : planned.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-4xl mb-2">🗓️</p>
            <p className="text-gray-600">Nenhuma ação planejada.</p>
            <button onClick={() => setShowNew(true)} className="mt-3 text-orange-600 font-semibold">+ Nova oportunidade</button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.filter(g => g.items.length).map(g => (
              <div key={g.id}>
                <h3 className="font-bold text-gray-700 mb-2">{g.label} ({g.items.length})</h3>
                <div className="space-y-4">
                  {g.items.map(a => {
                    const opp = oppById.get(a.opportunity_id);
                    if (!opp) return null;
                    return (
                      <div key={a.id}>
                        <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                          <button onClick={() => setSelectedId(opp.id)} className="flex items-center gap-2 flex-wrap text-left">
                            <span className="font-bold text-gray-900">{opp.client}</span>
                            <EtapaChip opp={opp} />
                            <TipoChip tipo={opp.servico_tipo} />
                            {isAdmin && <span className="text-xs text-gray-500">👤 {opp.vendor}</span>}
                          </button>
                          <span className="ml-auto flex items-center gap-3">
                            <button onClick={() => setVisitFor(opp)} className="text-sm text-orange-700 font-semibold">📝 Visita</button>
                            <button onClick={() => setSelectedId(opp.id)} className="text-sm text-orange-600 font-semibold flex items-center">Ficha <ChevronRight className="w-4 h-4" /></button>
                          </span>
                        </div>
                        <PlannedCard activity={a} onResolve={handleResolve} onDiscard={handleDiscard} onReschedule={handleReschedule} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'acompanhamento' && isAdmin && (
        <ServicoAcompanhamento
          supabase={supabase}
          opportunities={opportunities}
          open={open}
          planned={planned}
          plannedByOpp={plannedByOpp}
          agendaOk={agendaOk}
          plannedError={plannedError}
          today={today}
          onOpen={setSelectedId}
          tick={tick}
        />
      )}

      {view === 'carteira' && (
        open.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-4xl mb-2">🔧</p>
            <p className="text-gray-600">Nenhuma oportunidade de Serviço aberta.</p>
            <button onClick={() => setShowNew(true)} className="mt-3 text-orange-600 font-semibold">+ Nova oportunidade</button>
          </div>
        ) : (
          <div className="space-y-6">
            {SERVICO_ETAPAS.map(e => {
              const list = open.filter(o => (o.servico_etapa || 'contato') === e.id);
              if (!list.length) return null;
              return (
                <div key={e.id}>
                  <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${e.color}`}>{e.label}</span>
                    <span className="text-sm text-gray-500 font-normal">{list.length} · {e.hint}</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {list.map(o => (
                      <ServicoCard key={o.id} opp={o} plannedList={agendaOk ? (plannedByOpp.get(o.id) || []) : null} today={today}
                        onOpen={setSelectedId} showVendor={isAdmin} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {view === 'fechadas' && (
        closed.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border text-gray-500">Nenhuma oportunidade encerrada.</div>
        ) : (
          <div className="bg-white rounded-xl shadow divide-y">
            {closed.map(o => (
              <button key={o.id} onClick={() => setSelectedId(o.id)} className="w-full text-left p-4 hover:bg-gray-50 flex items-center gap-3">
                <span className="text-xl">{o.outcome === 'won' ? '✅' : o.outcome === 'lost' ? '❌' : '⏸️'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{o.client} <span className="text-sm font-normal text-gray-500">· {o.name}</span></p>
                  <p className="text-sm text-gray-500 truncate">
                    {o.loss_reason ? `Motivo: ${o.loss_reason}` : o.outcome_notes || ''}
                    {isAdmin && ` · 👤 ${o.vendor}`}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        )
      )}

      {showNew && (
        <ServicoNovaForm
          supabase={supabase}
          currentUser={currentUser}
          isAdmin={isAdmin}
          servicoVendors={servicoVendors}
          onClose={() => setShowNew(false)}
          onCreated={(row) => { onOpportunityChange(row); setShowNew(false); refreshPlanned(); }}
        />
      )}

      {selectedOpp && (
        <ServicoDetail
          key={selectedOpp.id}
          opp={selectedOpp}
          supabase={supabase}
          currentUser={currentUser}
          onClose={() => { setSelectedId(null); refreshPlanned(); }}
          onChange={onOpportunityChange}
          onCreated={(row) => { onOpportunityChange(row); refreshPlanned(); }}
          onRegistrarVisita={() => setVisitFor(selectedOpp)}
          historyTick={tick}
        />
      )}

      {visitFor && (
        <RegistrarVisitaModal
          supabase={supabase}
          currentUser={currentUser}
          isAdmin={isAdmin}
          servicoVendors={servicoVendors}
          openOpps={open}
          initialOpp={visitFor === 'nova' ? null : visitFor}
          onRows={(rows) => rows.forEach(onOpportunityChange)}
          onClose={(saved) => { setVisitFor(null); if (saved) refreshPlanned(); }}
        />
      )}
    </div>
  );
};
