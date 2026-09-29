import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Paperclip, ChevronUp, ChevronDown, SkipForward, Check, CloudOff, Cloud, Loader2 } from 'lucide-react';

// Ficha de Valor (espelho do Word "Ficha_de_Valor_Ventapel" v2).
// Tabela fichas_valor, 1 linha por oportunidade. Tudo texto livre — quem interpreta é o Ventus/Claude.
// dados = { hoje: { <id>: { t, o, ts } }, ventapel: { ... } }   o = 'vi' | 'contaram' | 'estimei' | null
// Offline-first: cada mudança vai primeiro para o localStorage e sobe quando há rede.

const VERSAO = 'v2';

export const ORIGENS = [
  { id: 'vi', label: 'Vi' },
  { id: 'contaram', label: 'Me contaram' },
  { id: 'estimei', label: 'Estimei' },
];

// como: só critério ou sugestão (o "como fazer" do Word não entra); ref: placeholder "Se o cliente não diz, use"
export const FICHA_CAMPOS = {
  hoje: [
    { s: 'base', id: 'base_caixa', label: 'Caixa mais usada: modelo, medidas, comprimento em cm', ref: 'Comprimento da tira ≈ comprimento da caixa + 10 cm' },
    { s: 'base', id: 'base_caixas_dia', label: 'Caixas fechadas por dia (dessa caixa e no total)', },
    { s: 'base', id: 'base_turnos', label: 'Turnos, dias/mês, bancadas e operadores por bancada', },
    { s: 'base', id: 'base_picos', label: 'Picos: meses, volume no pico, hora extra', ref: 'Intelbras: +1.000/dia no fim do mês' },

    { s: 'perdas', id: 'perdas_pct', label: '% de caixas com reclamação de avaria ou violação', como: 'Pedir número, não opinião', ref: '0,5% (cliente médio) a 5% (média nacional). Comece com 0,5% e marque como estimado' },
    { s: 'perdas', id: 'perdas_valor', label: 'Valor médio do conteúdo de uma caixa', ref: 'R$ 200/caixa (referência WAT); autopeças e eletrônicos muito acima' },
    { s: 'perdas', id: 'perdas_processo', label: 'O que acontece quando uma caixa chega aberta (quem cuida, quanto tempo, quanto custa em R$)', ref: 'Cada passo é uma linha de custo oculto no slide do desafio' },
    { s: 'perdas', id: 'perdas_evidencia', label: 'Sinais de que o fechamento falha hoje (fita soltando, caixa com 4 tiras, reforço com fita extra)', como: 'O que se vê na bancada ou na doca mostrando que a fita atual não segura a caixa', ref: 'É a foto do slide "O desafio"' },

    { s: 'mo', id: 'mo_seg', label: 'Segundos para fechar a caixa comum HOJE', ref: 'Manual com 3-4 tiras: 30-40 seg; gomada manual com reforço: mais' },
    { s: 'mo', id: 'mo_operadores', label: 'Operadores fechando caixa por turno', },
    { s: 'mo', id: 'mo_custo', label: 'Custo mensal de um operador com encargos', como: 'Nunca perguntam salário: estime e marque', ref: 'R$ 3.500/mês ≈ R$ 20/h (referência)' },
    { s: 'mo', id: 'mo_he', label: 'No pico, quantas horas extras por semana na expedição? Como resolvem os picos?', como: 'Hora extra, temporários, turno a mais… e com que frequência acontece', ref: 'Ex.: ~10 h/semana em nov-dez; chamam temporários' },

    { s: 'caixa', id: 'cx_custo', label: 'Custo da caixa comum; é impressa?', como: 'Operações pode não saber: dá para estimar bem pelo tamanho, onda e impressão', ref: 'R$ 5,00 impressa / R$ 4,70 simples (referência WAT). Caixa grande: mais' },
    { s: 'caixa', id: 'cx_reaprov', label: 'Caixas reaproveitadas (de fornecedor / retorno): que %? Tiram a fita original? Qual a largura dela?', como: 'Só se usarem caixa reaproveitada', ref: 'Intelbras: 50%. Caixa reutilizada = fita acrílica não cola = 4 tiras' },
    { s: 'caixa', id: 'cx_gramagem', label: 'Já tentaram baixar gramagem ou cortar um pouco as abas? Por que não deu?', ref: 'Se a resposta é "a caixa abre", a Venom resolve a causa' },

    { s: 'fita', id: 'fita_atual', label: 'Fita atual: tipo, largura, metros por rolo', ref: 'Acrílica 72 mm × 100 m é o padrão de mercado' },
    { s: 'fita', id: 'fita_tiras', label: 'Tiras por caixa hoje (e nas reutilizadas)', ref: 'Novas 2-3 tiras; reutilizadas 4 (Intelbras)' },
    { s: 'fita', id: 'fita_preco', label: 'Preço do rolo atual e qualidade da fita plástica', como: 'Não vão dizer: estime e deixe o cliente corrigir', ref: 'Acrílica 72×100 m ≈ R$ 15/rolo (gomada c/ reforço: tabela Ventapel). Qualidade: marca, espessura, se solta' },
    { s: 'fita', id: 'fita_rolos', label: 'Rolos por mês', ref: 'Metros/caixa × caixas/mês ÷ metros do rolo' },

    { s: 'ergo', id: 'ergo_cortes', label: 'Cortes com estilete / pistola e afastamentos de punho/ombro no último ano', ref: '1 afastamento ≈ R$ 10k (referência WAT), sem contar reposição e processo' },
    { s: 'ergo', id: 'ergo_bancada', label: 'Estiletes, pistolas plásticas e movimento repetitivo na bancada', como: 'A BP333 substitui 64 pistolas na vida útil', },
    { s: 'ergo', id: 'ergo_rotatividade', label: 'Rotatividade e dificuldade de contratar', ref: 'Innova Log: +30% de necessidade de mão de obra' },

    { s: 'decide', id: 'decide_quem', label: 'Quem decide e quem compra (nome, cargo, processo)', como: 'Cada número precisa de um dono no cliente', semOrigem: true },
  ],
  ventapel: [
    { s: 'antes', id: 'v_valida', label: 'Quem valida os números do teste (nome, cargo)', como: 'Combinar antes de começar', semOrigem: true },
    { s: 'antes', id: 'v_criterio', label: 'Critério de sucesso combinado antes do teste', como: 'Frase com número', ref: 'Ex.: fechar a caixa média em menos de 25 seg com 2 tiras', semOrigem: true },

    { s: 'teste', id: 'v_como', label: 'Como foi o teste: quantos dias, o que o cliente testou', },

    { s: 'perdas', id: 'v_avarias', par: 'perdas_pct', label: 'Avarias e furtos durante o teste', ref: '"0 em 300" é um número; "nenhuma" não é' },
    { s: 'mo', id: 'v_seg', par: 'mo_seg', label: 'Segundos para fechar com o sistema Ventapel', ref: 'BP555 + Venom: ~20 seg na caixa média, 2 tiras' },
    { s: 'fita', id: 'v_tiras', par: 'fita_tiras', label: 'Tiras por caixa com Venom', como: 'Metros = tiras × comprimento da tira', ref: '2 tiras é o padrão, 1 em H em caixa nova' },

    { s: 'operacao', id: 'v_retrabalho', label: 'Retrabalhos (caixa refeita, fita reaplicada)', ref: 'Ex.: nenhum em 2 semanas' },
    { s: 'operacao', id: 'v_maquina', label: 'Máquina e fita: paradas, colou nas duas abas, reforço, caixa reutilizada', como: '"Feedback positivo" não é resultado', },
    { s: 'operacao', id: 'v_quem', label: 'Quem estava, frase de quem manda, o que a Ventapel NÃO acompanhou', como: 'Não inventar resultado do que não viu', ref: 'Ex.: "nunca vi a caixa ficar tão firme" — Carlos, gerente de expedição', semOrigem: true },
  ],
};

const SECOES = {
  hoje: [
    { id: 'base', label: 'Base', titulo: '0 · A base — a caixa mais comum' },
    { id: 'perdas', label: 'Perdas', titulo: '1 · Perdas — furto, avaria, caixa aberta' },
    { id: 'mo', label: 'Mão de obra', titulo: '2 · Mão de obra' },
    { id: 'caixa', label: 'Caixa', titulo: '3 · Caixa' },
    { id: 'fita', label: 'Fita', titulo: '4 · Fita' },
    { id: 'ergo', label: 'Ergonomia', titulo: '5 · Ergonomia e segurança' },
    { id: 'decide', label: 'Decisão', titulo: '7 · Quem decide' },
  ],
  ventapel: [
    { id: 'antes', label: 'Antes', titulo: 'Antes do teste' },
    { id: 'teste', label: 'O teste', titulo: 'O teste' },
    { id: 'perdas', label: 'Perdas', titulo: 'Perdas' },
    { id: 'mo', label: 'Mão de obra', titulo: 'Mão de obra' },
    { id: 'fita', label: 'Fita', titulo: 'Fita' },
    { id: 'operacao', label: 'Operação', titulo: 'Na operação' },
  ],
};

const TOTAL_CAMPOS = FICHA_CAMPOS.hoje.length + FICHA_CAMPOS.ventapel.length;
const LABEL_BY_ID = Object.fromEntries(
  ['hoje', 'ventapel'].flatMap(lado => FICHA_CAMPOS[lado].map(c => [`${lado}.${c.id}`, c.label]))
);

const temTexto = (e) => !!(e && typeof e.t === 'string' && e.t.trim());

export const contarPreenchidos = (dados) => {
  if (!dados) return 0;
  let n = 0;
  for (const lado of ['hoje', 'ventapel']) {
    for (const c of FICHA_CAMPOS[lado]) if (temTexto(dados[lado]?.[c.id])) n++;
  }
  return n;
};

// Mescla campo a campo: vence o mais recente (ts). Mudança só de origem também conta.
const mesclar = (a, b) => {
  const out = { hoje: {}, ventapel: {} };
  for (const lado of ['hoje', 'ventapel']) {
    const ka = (a && a[lado]) || {};
    const kb = (b && b[lado]) || {};
    for (const id of new Set([...Object.keys(ka), ...Object.keys(kb)])) {
      const ea = ka[id], eb = kb[id];
      out[lado][id] = !ea ? eb : !eb ? ea : ((eb.ts || 0) > (ea.ts || 0) ? eb : ea);
    }
  }
  return out;
};

// ============= STORE (cache + rascunho local + sync) =============
const LS_PREFIX = 'fv:v1:';
const lsGet = (id) => { try { return JSON.parse(localStorage.getItem(LS_PREFIX + id) || 'null'); } catch { return null; } };
const lsSet = (id, v) => { try { localStorage.setItem(LS_PREFIX + id, JSON.stringify(v)); } catch { /* storage cheio/bloqueado */ } };
const lsPendentes = () => {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX) && lsGet(k.slice(LS_PREFIX.length))?.pendente) ids.push(k.slice(LS_PREFIX.length));
    }
  } catch { /* sem storage */ }
  return ids;
};

const store = {
  sb: null,
  user: null,
  cache: new Map(),      // oppId(string) -> dados
  status: new Map(),     // oppId -> 'salvo' | 'pendente' | 'salvando'
  listeners: new Set(),
  loaded: false,
  syncing: new Set(),
};
const notify = () => store.listeners.forEach(fn => fn());

const setStatus = (id, s) => { store.status.set(String(id), s); notify(); };

async function syncOne(id) {
  id = String(id);
  const draft = lsGet(id);
  if (!draft?.pendente || !store.sb) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus(id, 'pendente'); return; }
  if (store.syncing.has(id)) return;
  store.syncing.add(id);
  setStatus(id, 'salvando');
  try {
    const { data: srv, error: e1 } = await store.sb.from('fichas_valor').select('dados').eq('opportunity_id', Number(id)).maybeSingle();
    if (e1) throw e1;
    const merged = mesclar(srv?.dados, draft.dados);
    const { error: e2 } = await store.sb.from('fichas_valor').upsert(
      { opportunity_id: Number(id), versao: VERSAO, dados: merged, updated_by: store.user || null },
      { onConflict: 'opportunity_id' }
    );
    if (e2) throw e2;
    // Se o vendedor digitou enquanto subia, o rascunho ficou mais novo: mantém pendente
    const atual = lsGet(id);
    const mudouNoMeio = atual && JSON.stringify(atual.dados) !== JSON.stringify(draft.dados);
    const final = mudouNoMeio ? mesclar(merged, atual.dados) : merged;
    lsSet(id, { dados: final, pendente: !!mudouNoMeio });
    store.cache.set(id, final);
    store.syncing.delete(id);
    setStatus(id, mudouNoMeio ? 'pendente' : 'salvo');
    if (mudouNoMeio) syncOne(id);
  } catch (e) {
    console.error('Ficha de Valor: sync falhou, fica pendente', e);
    store.syncing.delete(id);
    setStatus(id, 'pendente');
  }
}

const flushPendentes = () => { lsPendentes().forEach(syncOne); };

function initStore(sb, user) {
  if (user) store.user = user;
  if (store.sb) return;
  store.sb = sb;
  if (typeof window !== 'undefined') {
    window.addEventListener('online', flushPendentes);
    setInterval(() => { if (lsPendentes().length) flushPendentes(); }, 30_000);
  }
  // Carrega todas as fichas visíveis (RLS filtra) para os badges
  sb.from('fichas_valor').select('opportunity_id, dados').then(({ data, error }) => {
    if (error) { console.error('Ficha de Valor: erro ao carregar', error); return; }
    for (const row of data || []) {
      const id = String(row.opportunity_id);
      const d = lsGet(id);
      store.cache.set(id, d?.pendente ? mesclar(row.dados, d.dados) : row.dados);
    }
    // Rascunhos que nunca subiram (ficha nova feita offline)
    for (const id of lsPendentes()) if (!store.cache.has(id)) store.cache.set(id, lsGet(id).dados);
    store.loaded = true;
    notify();
    flushPendentes();
  });
}

// O cache já contém os rascunhos pendentes (mesclados no initStore e gravados em
// salvarCampo); o localStorage só é lido enquanto a carga inicial não terminou.
// Importa porque cada card chama isto a cada tecla digitada na ficha.
function getDados(id) {
  id = String(id);
  const c = store.cache.get(id);
  if (c || store.loaded) return c || null;
  const d = lsGet(id);
  return d?.pendente ? d.dados : null;
}

function salvarCampo(oppId, lado, campo, patch) {
  const id = String(oppId);
  const base = getDados(id) || { hoje: {}, ventapel: {} };
  const prev = (base[lado] && base[lado][campo]) || {};
  const next = {
    ...base,
    [lado]: { ...(base[lado] || {}), [campo]: { t: prev.t || '', o: prev.o || null, ...patch, ts: Date.now() } },
  };
  lsSet(id, { dados: next, pendente: true });
  store.cache.set(id, next);
  setStatus(id, 'pendente');
}

function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(x => x + 1);
    store.listeners.add(fn);
    return () => store.listeners.delete(fn);
  }, []);
}

// Nº de campos preenchidos de uma oportunidade. Só re-renderiza quando o número
// muda (os cards não redesenham a cada tecla digitada na ficha).
function usePreenchidos(oppId) {
  const [n, setN] = useState(() => contarPreenchidos(getDados(oppId)));
  useEffect(() => {
    const fn = () => setN(contarPreenchidos(getDados(oppId)));
    fn();
    store.listeners.add(fn);
    return () => store.listeners.delete(fn);
  }, [oppId]);
  return n;
}

// Para o Ventus: só os campos com texto, compacto. null se a ficha está vazia ou não existe.
export async function carregarFichaParaVentus(sb, oppId) {
  if (!sb || !oppId) return null;
  let dados = null;
  try {
    const { data } = await sb.from('fichas_valor').select('dados').eq('opportunity_id', oppId).maybeSingle();
    dados = data?.dados || null;
  } catch { /* segue com o rascunho local */ }
  const d = lsGet(String(oppId));
  if (d?.pendente) dados = dados ? mesclar(dados, d.dados) : d.dados;
  if (!dados || contarPreenchidos(dados) === 0) return null;
  const origemLabel = Object.fromEntries(ORIGENS.map(o => [o.id, o.label]));
  const out = { hoje: [], ventapel: [] };
  for (const lado of ['hoje', 'ventapel']) {
    for (const c of FICHA_CAMPOS[lado]) {
      const e = dados[lado]?.[c.id];
      if (!temTexto(e)) continue;
      out[lado].push({ campo: LABEL_BY_ID[`${lado}.${c.id}`], texto: e.t.trim().slice(0, 500), origem: e.o ? origemLabel[e.o] : null });
    }
  }
  return out;
}

// ============= BOTÃO + BADGE (card da oportunidade) =============
export const FichaValorButton = ({ opportunity, supabase, currentUser }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => { initStore(supabase, currentUser); }, [supabase, currentUser]);
  const n = usePreenchidos(opportunity.id);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={'p-2.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors relative'}
        title="Ficha de Valor (dados do cliente e do teste)"
      >
        <Paperclip className="w-5 h-5" />
        {n > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full" />}
      </button>
      {open && <FichaValorModal opportunity={opportunity} onClose={() => setOpen(false)} />}
    </>
  );
};

// Só aparece quando a ficha já foi começada
export const FichaValorBadge = ({ opportunity, supabase, currentUser }) => {
  useEffect(() => { initStore(supabase, currentUser); }, [supabase, currentUser]);
  const n = usePreenchidos(opportunity.id);
  if (!n) return null;
  return (
    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full flex items-center">
      <Paperclip className="w-3 h-3 mr-1" />
      Ficha: {Math.round((n / TOTAL_CAMPOS) * 100)}%
    </span>
  );
};

// ============= MODAL =============
const Como = ({ texto }) => (texto ? <p className="text-xs text-gray-500 mt-0.5">{texto}</p> : null);

const autoGrow = (el) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 44) + 'px';
};

const Campo = React.memo(({ campo, entrada, onTexto, onOrigem, registerRef, refHoje }) => {
  const taRef = useRef(null);
  const [expandHoje, setExpandHoje] = useState(false);
  useLayoutEffect(() => { autoGrow(taRef.current); }, [entrada?.t]);
  return (
    <div className="py-3" data-campo={campo.id}>
      {refHoje !== undefined && (
        <button
          type="button"
          onClick={() => setExpandHoje(x => !x)}
          className="w-full text-left mb-1.5 px-2 py-1 rounded bg-gray-50 border border-gray-100"
        >
          <span className="text-[11px] text-gray-500">
            <span className="font-semibold">Hoje: </span>
            {temTexto(refHoje)
              ? <span className={expandHoje ? '' : 'line-clamp-2'}>{refHoje.t}{refHoje.o ? ` · ${ORIGENS.find(o => o.id === refHoje.o)?.label}` : ''}</span>
              : <span className="italic">não anotado</span>}
          </span>
        </button>
      )}
      <label className="block text-sm font-semibold text-gray-900 leading-snug" htmlFor={'fv-' + campo.id}>{campo.label}</label>
      <Como texto={campo.como} />
      <textarea
        id={'fv-' + campo.id}
        ref={(el) => { taRef.current = el; registerRef(campo.id, el); }}
        value={entrada?.t || ''}
        onChange={(e) => { onTexto(campo.id, e.target.value); autoGrow(e.target); }}
        placeholder={campo.ref || ''}
        rows={2}
        className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg text-base leading-snug resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 placeholder:text-sm"
        style={{ minHeight: 44 }}
      />
      {!campo.semOrigem && (
        <div className="flex gap-1.5 mt-1.5">
          {ORIGENS.map(o => {
            const ativo = entrada?.o === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onPointerDown={(e) => e.preventDefault()} // não tira o foco do campo (teclado fica aberto)
                onClick={() => onOrigem(campo.id, ativo ? null : o.id)}
                className={'px-2.5 py-1 rounded-full text-xs border transition-colors ' +
                  (ativo ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

// Altura/offset do viewport visível: com o teclado aberto no celular, o modal
// encolhe para caber acima dele (iOS não redimensiona o layout viewport).
function useVisualViewport() {
  const [vv, setVv] = useState(() => ({
    h: typeof window !== 'undefined' ? (window.visualViewport?.height || window.innerHeight) : 0,
    top: 0,
  }));
  useEffect(() => {
    const v = window.visualViewport;
    const upd = () => setVv({ h: v ? v.height : window.innerHeight, top: v ? v.offsetTop : 0 });
    upd();
    if (v) { v.addEventListener('resize', upd); v.addEventListener('scroll', upd); }
    window.addEventListener('resize', upd);
    return () => {
      if (v) { v.removeEventListener('resize', upd); v.removeEventListener('scroll', upd); }
      window.removeEventListener('resize', upd);
    };
  }, []);
  return vv;
}

const StatusSync = ({ status }) => {
  if (status === 'salvando') return <span className="flex items-center gap-1 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando…</span>;
  if (status === 'pendente') return <span className="flex items-center gap-1 text-xs text-amber-600" title="Guardado no celular; sobe quando tiver sinal"><CloudOff className="w-3.5 h-3.5" />Pendente</span>;
  if (status === 'salvo') return <span className="flex items-center gap-1 text-xs text-emerald-600"><Cloud className="w-3.5 h-3.5" />Salvo</span>;
  return null;
};

export const FichaValorModal = ({ opportunity, onClose }) => {
  useStore();
  const oppId = String(opportunity.id);
  const [aba, setAba] = useState('hoje');
  const [focado, setFocado] = useState(null);
  const refs = useRef({});
  const scrollRef = useRef(null);
  const syncTimer = useRef(null);
  const vv = useVisualViewport();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onR = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // Trava o scroll da página por trás
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Ao abrir: se não está no cache (ex.: store ainda carregando), busca do servidor
  useEffect(() => {
    if (store.cache.has(oppId) || !store.sb) return;
    store.sb.from('fichas_valor').select('dados').eq('opportunity_id', Number(oppId)).maybeSingle().then(({ data }) => {
      if (!data?.dados || store.cache.has(oppId)) return;
      const d = lsGet(oppId);
      store.cache.set(oppId, d?.pendente ? mesclar(data.dados, d.dados) : data.dados);
      notify();
    });
  }, [oppId]);

  const dados = getDados(oppId) || { hoje: {}, ventapel: {} };
  const status = store.status.get(oppId) || (lsGet(oppId)?.pendente ? 'pendente' : null);

  const agendarSync = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => syncOne(oppId), 1200);
  }, [oppId]);

  // Ao fechar, sobe na hora o que estiver pendente
  useEffect(() => () => { clearTimeout(syncTimer.current); syncOne(oppId); }, [oppId]);

  const onTexto = useCallback((campo, t) => { salvarCampo(oppId, aba, campo, { t }); agendarSync(); }, [oppId, aba, agendarSync]);
  const onOrigem = useCallback((campo, o) => { salvarCampo(oppId, aba, campo, { o }); agendarSync(); }, [oppId, aba, agendarSync]);
  const registerRef = useCallback((id, el) => { if (el) refs.current[id] = el; else delete refs.current[id]; }, []);

  const campos = FICHA_CAMPOS[aba];
  const secoes = SECOES[aba];
  const ordem = campos.map(c => c.id);

  const focar = (id) => {
    const el = refs.current[id];
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try { el.setSelectionRange(len, len); } catch { /* ok */ }
    requestAnimationFrame(() => el.closest('[data-campo]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  // Teclado abriu/fechou: mantém o campo ativo visível
  useEffect(() => {
    if (!focado) return;
    const el = refs.current[focado];
    if (el) requestAnimationFrame(() => el.closest('[data-campo]')?.scrollIntoView({ block: 'nearest' }));
  }, [vv.h, focado]);

  const mover = (delta) => {
    const i = focado ? ordem.indexOf(focado) : -1;
    const j = Math.min(ordem.length - 1, Math.max(0, i + delta));
    focar(ordem[j]);
  };

  const proximoVazio = () => {
    const start = focado ? ordem.indexOf(focado) + 1 : 0;
    const rot = [...ordem.slice(start), ...ordem.slice(0, start)];
    const alvo = rot.find(id => !temTexto(dados[aba]?.[id]));
    if (alvo) focar(alvo);
    else {
      // Aba completa: sugere a outra
      const outra = aba === 'hoje' ? 'ventapel' : 'hoje';
      const vazioOutra = FICHA_CAMPOS[outra].find(c => !temTexto(dados[outra]?.[c.id]));
      if (vazioOutra) { trocarAba(outra); setTimeout(() => focar(vazioOutra.id), 50); }
    }
  };

  const trocarAba = (a) => {
    if (a === aba) return;
    setAba(a);
    setFocado(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const irSecao = (sid) => {
    const el = scrollRef.current?.querySelector(`[data-secao="${sid}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 4, behavior: 'smooth' });
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nAba = (lado) => FICHA_CAMPOS[lado].filter(c => temTexto(dados[lado]?.[c.id])).length;
  const nTotal = contarPreenchidos(dados);

  // Teclado aberto (pouca altura): cabeçalho enxuto para sobrar espaço para o campo
  const compacto = !!focado && vv.h < 600;

  const containerStyle = isMobile
    ? { position: 'fixed', left: 0, right: 0, top: vv.top, height: vv.h }
    : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/40 md:flex md:items-center md:justify-center" onClick={isMobile ? undefined : onClose}>
      <div
        style={containerStyle}
        className="bg-white flex flex-col overflow-hidden md:relative md:rounded-xl md:shadow-2xl md:w-full md:max-w-2xl md:h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho fixo */}
        <div className="flex-shrink-0 border-b border-gray-200">
          <div className={"flex items-center gap-2 px-3 " + (compacto ? "py-0.5" : "pt-3 pb-2")}>
            <button onClick={onClose} className="p-2 -ml-1 text-gray-500 hover:text-gray-800 rounded-lg" title="Fechar">
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 leading-tight">Ficha de Valor</p>
              {!compacto && <p className="text-xs text-gray-500 truncate">{opportunity.client}{opportunity.name ? ` · ${opportunity.name}` : ''}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-700">{Math.round((nTotal / TOTAL_CAMPOS) * 100)}%</p>
              <StatusSync status={status} />
            </div>
          </div>
          <div className="flex px-3 gap-1">
            {[['hoje', 'Hoje'], ['ventapel', 'Com sistema Ventapel']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => trocarAba(id)}
                className={'flex-1 px-2 ' + (compacto ? 'py-1' : 'py-2') + ' text-sm font-semibold rounded-t-lg border-b-2 transition-colors ' +
                  (aba === id ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'border-transparent text-gray-500 hover:text-gray-700')}
              >
                {id === 'ventapel'
                  ? <><span className="sm:hidden">Com Ventapel</span><span className="hidden sm:inline">{label}</span></>
                  : label} <span className="text-xs font-normal">({nAba(id)}/{FICHA_CAMPOS[id].length})</span>
              </button>
            ))}
          </div>
          <div className={"flex gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar" + (compacto ? " hidden" : "")}>
            {secoes.map(s => {
              const cs = campos.filter(c => c.s === s.id);
              const cheio = cs.length > 0 && cs.every(c => temTexto(dados[aba]?.[c.id]));
              return (
                <button
                  key={s.id}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => irSecao(s.id)}
                  className={'flex-shrink-0 px-2.5 py-1 rounded-full text-xs border whitespace-nowrap ' +
                    (cheio ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-300 text-gray-600')}
                >
                  {cheio && <Check className="w-3 h-3 inline mr-0.5 -mt-px" />}{s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campos */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 relative"
          onFocus={(e) => { const w = e.target.closest?.('[data-campo]'); if (w) setFocado(w.getAttribute('data-campo')); }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocado(null); }}
        >
          {aba === 'ventapel' && (
            <p className="text-xs text-gray-500 mt-3 bg-gray-50 rounded-lg px-3 py-2">
              Resultado da demo ou do teste. Em cinza, o que foi anotado em Hoje para comparar.
            </p>
          )}
          {secoes.map(s => {
            const cs = campos.filter(c => c.s === s.id);
            if (!cs.length) return null;
            return (
              <section key={s.id} data-secao={s.id} className="pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 bg-slate-100 -mx-4 px-4 py-1.5">{s.titulo}</h3>
                <div className="divide-y divide-gray-100">
                  {cs.map(c => (
                    <Campo
                      key={aba + c.id}
                      campo={c}
                      entrada={dados[aba]?.[c.id]}
                      onTexto={onTexto}
                      onOrigem={onOrigem}
                      registerRef={registerRef}
                      refHoje={aba === 'ventapel' && c.par ? (dados.hoje?.[c.par] || null) : undefined}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="text-[11px] text-gray-400 text-center pt-6">Ficha de Valor {VERSAO} · tudo opcional · a calculadora é feita fora do CRM</p>
        </div>

        {/* Barra inferior: fica logo acima do teclado */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-2 py-1.5 flex items-center gap-1" style={{ paddingBottom: focado ? 6 : 'max(6px, env(safe-area-inset-bottom))' }}>
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mover(-1)}
            disabled={!focado || ordem.indexOf(focado) === 0}
            className="p-2.5 rounded-lg text-gray-700 hover:bg-gray-200 disabled:opacity-30"
            title="Campo anterior"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mover(1)}
            disabled={focado ? ordem.indexOf(focado) === ordem.length - 1 : false}
            className="p-2.5 rounded-lg text-gray-700 hover:bg-gray-200 disabled:opacity-30"
            title="Próximo campo"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={proximoVazio}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <SkipForward className="w-4 h-4" /> Próximo vazio
          </button>
          <div className="flex-1" />
          {focado ? (
            <button
              onClick={() => refs.current[focado]?.blur()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white"
            >
              OK
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-white">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
