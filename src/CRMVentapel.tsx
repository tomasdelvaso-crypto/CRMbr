import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { Plus, Search, DollarSign, TrendingUp, User, Target, Eye, ShoppingCart, Edit3, Save, X, AlertCircle, BarChart3, Package, Factory, ChevronRight, Check, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp, Clock, Calendar, Users, Brain, HelpCircle, FileQuestion, LogOut, Lock, Mail, Phone, SlidersHorizontal } from 'lucide-react';
import { createClient, Session } from '@supabase/supabase-js';
import AIAssistant from './AIAssistant';
import { ActivityPanel, ActivityDashboard } from './ActivityComponents';
import AdminDashboard from './AdminDashboard';
import { CadenciaDashboard } from './CadenciaComponents';
// Lógica PPVVCC compartilhada com o backend (fonte única de verdade)
import {
  getScaleValue,
  calculateHealthScore,
  checkStageRequirements as checkScaleGates,
  SCALE_DEFINITIONS,
} from '../api/_lib/ppvvcc.js';

// --- CONFIGURAÇÃO DE SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- TIPOS E INTERFACES ---
interface Scale {
  score: number;
  description: string;
}

interface Scales {
  dor: Scale;
  poder: Scale;
  visao: Scale;
  valor: Scale;
  controle: Scale;
  compras: Scale;
}

interface Opportunity {
  id: number;
  name: string;
  client: string;
  vendor: string;
  value: number;
  stage: number;
  priority: string;
  created_at: string;
  last_update: string;
  next_action?: string;
  next_action_date?: string;
  probability: number;
  expected_close?: string;
  product?: string;
  power_sponsor?: string;
  sponsor?: string;
  influencer?: string;
  support_contact?: string;
  scales: Scales;
  industry?: string;
  product_lines?: string[];
  outcome?: 'won' | 'lost' | 'abandoned' | null;
  outcome_notes?: string;
}

interface OpportunityFormData {
  name: string;
  client: string;
  vendor: string;
  value: string;
  stage: number;
  priority: string;
  expected_close?: string;
  next_action?: string;
  next_action_date?: string;
  product?: string;
  power_sponsor?: string;
  sponsor?: string;
  influencer?: string;
  support_contact?: string;
  scales: Scales;
  industry?: string;
  product_lines?: string[];
  outcome?: 'won' | 'lost' | 'abandoned' | null;
  outcome_notes?: string;
}

interface StageRequirement {
  id: number;
  name: string;
  probability: number;
  color: string;
  requirements: string[];
  checklist?: Record<string, string>;
}

interface VendorInfo {
  name: string;
  email?: string;
  role?: string;
  is_admin?: boolean;
  auth_user_id?: string;
  auth_id?: string;
}

// --- UTILIDADES ---
const emptyScales = (): Scales => ({
  dor: { score: 0, description: '' },
  poder: { score: 0, description: '' },
  visao: { score: 0, description: '' },
  valor: { score: 0, description: '' },
  controle: { score: 0, description: '' },
  compras: { score: 0, description: '' }
});

const getScaleScore = (scale: Scale | number | undefined | null): number => getScaleValue(scale);

// --- PRODUCT LINES CONFIG ---
const PRODUCT_LINES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  better_pack: { label: 'Máquinas Better Pack', icon: '⚙️', color: 'text-blue-700', bg: 'bg-blue-100' },
  better_pack_venom: { label: 'Better Pack + Venom', icon: '📦', color: 'text-green-700', bg: 'bg-green-100' },
  ecomfill_resmas: { label: 'E-comfill + Resmas', icon: '🛍️', color: 'text-orange-700', bg: 'bg-orange-100' },
  ecombag: { label: 'E-Combag', icon: '📨', color: 'text-purple-700', bg: 'bg-purple-100' },
  servico_manutencao: { label: 'Serviço de Manutenção', icon: '🔧', color: 'text-yellow-700', bg: 'bg-yellow-100' },
};

// --- NORMALIZAÇÃO DE OPORTUNIDADES (usada no fetch e nos eventos realtime) ---
const normalizeScales = (scales: any): Scales => {
  if (!scales || typeof scales !== 'object') {
    return emptyScales();
  }

  try {
    if (scales.dor && typeof scales.dor === 'object' && 'score' in scales.dor) {
      return scales;
    }

    if (typeof scales.dor === 'number' || typeof scales.pain === 'number') {
      return {
        dor: { score: scales.dor || scales.pain || 0, description: '' },
        poder: { score: scales.poder || scales.power || 0, description: '' },
        visao: { score: scales.visao || scales.vision || 0, description: '' },
        valor: { score: scales.valor || scales.value || 0, description: '' },
        controle: { score: scales.controle || scales.control || 0, description: '' },
        compras: { score: scales.compras || scales.purchase || 0, description: '' }
      };
    }
  } catch (e) {
    console.error('Error normalizando scales:', e);
  }

  return emptyScales();
};

const normalizeOpportunity = (opp: any): Opportunity => ({
  ...opp,
  scales: normalizeScales(opp.scales),
  value: Number(opp.value) || 0,
  probability: Number(opp.probability) || 0
});

// --- API SERVICE ---
class SupabaseService {
  async fetchOpportunities(): Promise<Opportunity[]> {
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('value', { ascending: false });

      if (error) throw error;

      return (data || []).map(normalizeOpportunity);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      throw error;
    }
  }

  async fetchVendors(): Promise<VendorInfo[]> {
    const { data: vendorsData, error: vendorsError } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true);

    if (vendorsError) throw vendorsError;

    if (!vendorsData || vendorsData.length === 0) {
      throw new Error('Nenhum vendedor ativo encontrado na tabela vendors');
    }

    return vendorsData;
  }

  async insertOpportunity(data: Omit<Opportunity, 'id' | 'created_at'>): Promise<Opportunity> {
    try {
      const { data: result, error } = await supabase
        .from('opportunities')
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      console.error('Error inserting opportunity:', error);
      throw error;
    }
  }

  async updateOpportunity(id: number, data: Partial<Opportunity>): Promise<Opportunity> {
    try {
      const { data: result, error } = await supabase
        .from('opportunities')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      console.error('Error updating opportunity:', error);
      throw error;
    }
  }

  async deleteOpportunity(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('opportunities')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting opportunity:', error);
      throw error;
    }
  }
}

const supabaseService = new SupabaseService();

// --- COMPONENTE OpportunityHealthScore ---
const OpportunityHealthScore: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
  const score = Math.round(calculateHealthScore(opportunity.scales));
  const getColor = () => {
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <span className={`font-bold ${getColor()}`}>
      ♥ {score}/10
    </span>
  );
};

// --- DEFINIÇÕES DE ETAPAS E ESCALAS (apresentação/UI; gates vêm do módulo compartilhado) ---
const stages: StageRequirement[] = [
  {
    id: 1,
    name: 'Prospecção',
    probability: 0,
    color: 'bg-gray-500',
    requirements: ['Identificar dor do cliente', 'Contato inicial estabelecido'],
    checklist: {
      'Identificou a empresa potencial': 'empresa_identificada',
      'Pesquisou sobre o negócio do cliente': 'pesquisa_negocio',
      'Identificou pessoa de contato': 'contato_identificado',
      'Realizou primeiro contato': 'primeiro_contato'
    }
  },
  {
    id: 2,
    name: 'Qualificação',
    probability: 20,
    color: 'bg-blue-500',
    requirements: ['Score DOR ≥ 5', 'Score PODER ≥ 4', 'Budget confirmado'],
    checklist: {
      'Cliente admite ter problema/dor (DOR ≥ 5)': 'dor_admitida',
      'Identificou tomador de decisão (PODER ≥ 4)': 'decisor_identificado',
      'Budget disponível confirmado': 'budget_confirmado',
      'Timeline do projeto definida': 'timeline_definida',
      'Critérios de decisão entendidos': 'criterios_entendidos'
    }
  },
  {
    id: 3,
    name: 'Apresentação',
    probability: 40,
    color: 'bg-yellow-500',
    requirements: ['Score VISÃO ≥ 5', 'Apresentação agendada', 'Stakeholders definidos'],
    checklist: {
      'Visão de solução criada (VISÃO ≥ 5)': 'visao_criada',
      'Demo/Apresentação realizada': 'demo_realizada',
      'Todos stakeholders presentes': 'stakeholders_presentes',
      'Objeções principais identificadas': 'objecoes_identificadas',
      'Próximos passos acordados': 'proximos_passos'
    }
  },
  {
    id: 4,
    name: 'Validação/Teste',
    probability: 60,
    color: 'bg-orange-500',
    requirements: ['Score VALOR ≥ 6', 'Teste/POC executado', 'ROI validado'],
    checklist: {
      'POC/Teste iniciado': 'poc_iniciado',
      'Critérios de sucesso definidos': 'criterios_sucesso',
      'ROI calculado e validado (VALOR ≥ 6)': 'roi_validado',
      'Resultados documentados': 'resultados_documentados',
      'Aprovação técnica obtida': 'aprovacao_tecnica'
    }
  },
  {
    id: 5,
    name: 'Negociação',
    probability: 80,
    color: 'bg-green-500',
    requirements: ['Score CONTROLE ≥ 7', 'Score COMPRAS ≥ 6', 'Proposta enviada'],
    checklist: {
      'Proposta comercial enviada': 'proposta_enviada',
      'Termos negociados (COMPRAS ≥ 6)': 'termos_negociados',
      'Controle do processo (CONTROLE ≥ 7)': 'controle_processo',
      'Aprovação verbal recebida': 'aprovacao_verbal',
      'Contrato em revisão legal': 'revisao_legal'
    }
  },
  {
    id: 6,
    name: 'Fechado',
    probability: 100,
    color: 'bg-emerald-600',
    requirements: ['Contrato assinado', 'Pagamento processado'],
    checklist: {
      'Contrato assinado': 'contrato_assinado',
      'Pedido de compra emitido': 'pedido_compra',
      'Kickoff agendado': 'kickoff_agendado',
      'Pagamento processado': 'pagamento_processado'
    }
  }
];

const scales = [
  {
    id: 'dor',
    name: 'DOR',
    icon: AlertCircle,
    description: 'Dor identificada e admitida',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    questions: [
      'Cliente admite ter o problema?',
      'Problema está custando dinheiro?',
      'Consequências são mensuráveis?',
      'Urgência para resolver?'
    ]
  },
  {
    id: 'poder',
    name: 'PODER',
    icon: User,
    description: 'Acesso ao decisor',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    questions: [
      'Conhece o decisor final?',
      'Tem acesso direto ao decisor?',
      'Decisor participa das reuniões?',
      'Processo de decisão mapeado?'
    ]
  },
  {
    id: 'visao',
    name: 'VISÃO',
    icon: Eye,
    description: 'Visão de solução construída',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    questions: [
      'Cliente vê valor na solução?',
      'Benefícios estão claros?',
      'Solução resolve a dor?',
      'Cliente consegue visualizar implementação?'
    ]
  },
  {
    id: 'valor',
    name: 'VALOR',
    icon: DollarSign,
    description: 'ROI/Benefícios validados',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    questions: [
      'ROI foi calculado?',
      'Cliente concorda com ROI?',
      'Valor justifica investimento?',
      'Benefícios são mensuráveis?'
    ]
  },
  {
    id: 'controle',
    name: 'CONTROLE',
    icon: Target,
    description: 'Controle do processo',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    questions: [
      'Você conduz o processo?',
      'Próximos passos definidos?',
      'Timeline acordada?',
      'Competidores identificados?'
    ]
  },
  {
    id: 'compras',
    name: 'COMPRAS',
    description: 'Processo de compras',
    icon: ShoppingCart,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    questions: [
      'Processo de compras mapeado?',
      'Budget aprovado?',
      'Procurement envolvido?',
      'Documentação necessária conhecida?'
    ]
  }
];

// Definições de nível 0-10 por escala — importadas do módulo compartilhado
const scaleDefinitions = SCALE_DEFINITIONS;

// ===== PERGUNTAS SPIN EM PORTUGUÊS =====
const spinQuestions = {
  dor: {
    situacao: [
      "Como realizam o processo de fechamento de caixas hoje?",
      "Quantas caixas processam por dia/mês?",
      "Que tipo de fita usam atualmente?",
      "Têm processos manuais ou automatizados?"
    ],
    problema: [
      "Acontece de as caixas se abrirem antes de chegar ao cliente?",
      "Com que frequência precisam refazer o trabalho por problemas de fechamento?",
      "Têm reclamações de clientes por caixas violadas ou danificadas?",
      "Quanto tempo perdem em retrabalho?"
    ],
    implicacao: [
      "Qual é o nível de reclamações de clientes por mês?",
      "Quanto custa cada retrabalho em tempo e dinheiro?",
      "Como isso afeta a imagem da empresa?",
      "Que impacto tem nos contratos com marketplaces?"
    ],
    needPayoff: [
      "Como seria se pudessem eliminar 100% as violações?",
      "Que impacto teria em seus KPIs reduzir o retrabalho a zero?",
      "Quanto economizariam mensalmente com zero devoluções?",
      "Como melhoraria seu NPS com o cliente final?"
    ]
  },
  poder: {
    situacao: [
      "Como é o processo de decisão na sua empresa?",
      "Quem participa em decisões de investimento em logística?",
      "Têm um comitê de compras?"
    ],
    problema: [
      "Há alinhamento entre áreas sobre esta necessidade?",
      "Que obstáculos veem para implementar mudanças?",
      "A área de finanças entende o ROI de melhorar o packaging?"
    ],
    implicacao: [
      "O que acontece se não tomarem uma decisão em breve?",
      "Como isso afeta outras áreas da empresa?",
      "Estão perdendo contratos por problemas de entrega?"
    ],
    needPayoff: [
      "Que valor teria ter apoio total da diretoria?",
      "Como isso aceleraria a implementação?",
      "O que significaria para sua área resolver isso rapidamente?"
    ]
  },
  visao: {
    situacao: [
      "Conhecem soluções de fechamento com fita ativada por água?",
      "Já viram sistemas automatizados de fechamento?",
      "Que soluções avaliaram antes?"
    ],
    problema: [
      "Por que as soluções anteriores não funcionaram?",
      "Que limitações tem seu sistema atual?",
      "Há resistência à mudança na equipe?"
    ],
    implicacao: [
      "Quanto estão perdendo por não modernizar?",
      "A concorrência está mais avançada nisso?",
      "Afeta sua capacidade de crescer?"
    ],
    needPayoff: [
      "Como seria ter um sistema 100% inviolável?",
      "O que significaria fechar 40% mais rápido?",
      "Quanto melhoraria a ergonomia da equipe?"
    ]
  },
  valor: {
    situacao: [
      "Como avaliam investimentos em melhorias operacionais?",
      "Que ROI esperam de projetos logísticos?",
      "Têm orçamento designado para isso?"
    ],
    problema: [
      "O custo atual de falhas é conhecido por finanças?",
      "Calcularam o custo total do sistema atual?",
      "Incluem custos ocultos como retrabalho?"
    ],
    implicacao: [
      "Quanto perdem anualmente por não otimizar?",
      "Isso afeta margens ou competitividade?",
      "Poderiam perder clientes grandes por isso?"
    ],
    needPayoff: [
      "O que significaria um ROI de 3 meses?",
      "Como impactaria economizar R$ 50k/mês?",
      "Isso justificaria o investimento perante o board?"
    ]
  },
  controle: {
    situacao: [
      "Como gerenciam projetos de melhoria?",
      "Têm um cronograma definido?",
      "Quem lidera este projeto internamente?"
    ],
    problema: [
      "Há outros fornecedores em avaliação?",
      "O que poderia atrasar a decisão?",
      "Têm experiências negativas anteriores?"
    ],
    implicacao: [
      "O que acontece se atrasar a implementação?",
      "Perderão o orçamento se não decidirem logo?",
      "A concorrência poderia se adiantar?"
    ],
    needPayoff: [
      "Que valor tem implementar antes do pico?",
      "Como ajudaria ter um parceiro confiável?",
      "Preferem um fornecedor que lidere o processo?"
    ]
  },
  compras: {
    situacao: [
      "Como funciona o processo de compras aqui?",
      "Que documentação precisam para aprovar?",
      "Têm fornecedores homologados?"
    ],
    problema: [
      "Há requisitos especiais de compliance?",
      "Procurement entende o valor técnico?",
      "Precisam comparar 3 cotações?"
    ],
    implicacao: [
      "Procurement poderia frear mesmo que operações aprove?",
      "Há risco de escolherem por preço sem ver valor?",
      "Isso poderia se alongar por meses?"
    ],
    needPayoff: [
      "Como seria se pudéssemos acelerar a aprovação?",
      "Ajudaria ter um business case pronto?",
      "Preferem leasing vs compra direta?"
    ]
  }
};

// ===== COMPONENTE: Painel de Perguntas SPIN =====
interface SPINQuestionsPanelProps {
  scaleId: string;
  onQuestionUsed?: (question: string) => void;
}

const SPINQuestionsPanel: React.FC<SPINQuestionsPanelProps> = ({ scaleId, onQuestionUsed }) => {
  const [expanded, setExpanded] = useState(false);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());

  const questions = spinQuestions[scaleId as keyof typeof spinQuestions];
  if (!questions) return null;

  const toggleQuestion = (question: string) => {
    const newUsed = new Set(usedQuestions);
    if (newUsed.has(question)) {
      newUsed.delete(question);
    } else {
      newUsed.add(question);
      onQuestionUsed?.(question);
    }
    setUsedQuestions(newUsed);
  };

  const getUsedCount = () => {
    return usedQuestions.size;
  };

  const getTotalCount = () => {
    return Object.values(questions).flat().length;
  };

  return (
    <div className="mt-3 bg-yellow-50 rounded-lg p-3 border border-yellow-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center space-x-2">
          <FileQuestion className="w-4 h-4 text-yellow-700" />
          <span className="text-sm font-medium text-yellow-800">
            Perguntas SPIN Sugeridas
          </span>
          <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full">
            {getUsedCount()}/{getTotalCount()} usadas
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''} text-yellow-700`} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {Object.entries(questions).map(([tipo, perguntas]) => (
            <div key={tipo} className="bg-white rounded-lg p-3">
              <h5 className="text-xs font-bold text-yellow-700 uppercase mb-2 flex items-center">
                {tipo === 'situacao' ? '🔍 SITUAÇÃO' :
                 tipo === 'problema' ? '⚠️ PROBLEMA' :
                 tipo === 'implicacao' ? '💥 IMPLICAÇÃO' :
                 '✅ NEED-PAYOFF'}
              </h5>
              <div className="space-y-1">
                {perguntas.map((pergunta, idx) => (
                  <label key={idx} className="flex items-start cursor-pointer hover:bg-yellow-50 p-2 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={usedQuestions.has(pergunta)}
                      onChange={() => toggleQuestion(pergunta)}
                      className="mt-0.5 mr-2 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className={`text-xs ${usedQuestions.has(pergunta) ? 'line-through text-gray-500' : 'text-gray-700'}`}>
                      {pergunta}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 p-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              💡 <strong>Dica:</strong> Marque as perguntas enquanto fala com o cliente.
              As respostas chave adicione nas observações da escala.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== FUNÇÃO PARA CALCULAR PROGRESSO SPIN =====
const TOTAL_SPIN_QUESTIONS = Object.values(spinQuestions).reduce(
  (sum, category) => sum + Object.values(category).reduce((s, qs) => s + qs.length, 0),
  0
);

const calculateSPINProgress = (opportunity: Opportunity) => {
  let questionsAnswered = 0;

  Object.values(opportunity.scales || {}).forEach(scale => {
    if (scale.description) {
      questionsAnswered += (scale.description.match(/✓/g) || []).length;
    }
  });

  if (TOTAL_SPIN_QUESTIONS === 0) return 0;
  return Math.round((questionsAnswered / TOTAL_SPIN_QUESTIONS) * 100);
};

// --- CONTEXT API ---
interface OpportunitiesContextType {
  opportunities: Opportunity[];
  loading: boolean;
  error: string | null;
  vendors: VendorInfo[];
  currentUser: string | null;
  setCurrentUser: (user: string | null) => void;
  setError: (error: string | null) => void;
  loadOpportunities: () => Promise<void>;
  loadVendors: () => Promise<void>;
  createOpportunity: (data: OpportunityFormData) => Promise<boolean>;
  updateOpportunity: (id: number, data: OpportunityFormData) => Promise<boolean>;
  deleteOpportunity: (id: number) => Promise<void>;
  moveStage: (opportunity: Opportunity, newStage: number) => Promise<void>;
  assumeOpportunity: (opportunity: Opportunity) => Promise<void>;
  logout: () => Promise<void>;
}

const OpportunitiesContext = createContext<OpportunitiesContextType | null>(null);

const useOpportunitiesContext = () => {
  const context = useContext(OpportunitiesContext);
  if (!context) {
    throw new Error('useOpportunitiesContext must be used within OpportunitiesProvider');
  }
  return context;
};

// --- PROVIDER COMPONENT ---
const OpportunitiesProvider: React.FC<{ children: React.ReactNode; session: Session }> = ({ children, session }) => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [vendors, setVendors] = useState<VendorInfo[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upsert local de uma oportunidade (mutações próprias e eventos realtime)
  const upsertOpportunity = useCallback((row: any) => {
    const normalized = normalizeOpportunity(row);
    setOpportunities(prev => {
      const exists = prev.some(o => o.id === normalized.id);
      const next = exists
        ? prev.map(o => (o.id === normalized.id ? normalized : o))
        : [...prev, normalized];
      return next.sort((a, b) => (b.value || 0) - (a.value || 0));
    });
  }, []);

  const loadVendors = useCallback(async () => {
    try {
      const vendorData = await supabaseService.fetchVendors();
      setVendors(vendorData);

      // Resolve currentUser from authenticated session
      const authUserId = session.user.id;
      const matchedVendor = vendorData.find(v =>
        v.auth_user_id === authUserId || (v as any).auth_id === authUserId
      );
      if (matchedVendor) {
        setCurrentUser(matchedVendor.name);
      } else {
        console.error('No vendor found for auth user:', authUserId);
        setError('Usuário autenticado não vinculado a um vendedor');
      }
    } catch (err) {
      console.error('Erro ao carregar vendedores:', err);
      setError('Erro ao carregar vendedores');
    }
  }, [session.user.id]);

  const loadOpportunities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await supabaseService.fetchOpportunities();
      setOpportunities(data);
    } catch (err) {
      console.error('Erro ao carregar oportunidades:', err);
      setError('Erro ao carregar oportunidades. Por favor, tente novamente.');
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const createOpportunity = useCallback(async (formData: OpportunityFormData): Promise<boolean> => {
    try {
      setError(null);

      if (!formData.name?.trim() || !formData.client?.trim() || !formData.value) {
        setError('Por favor, preencha os campos obrigatórios: Nome, Cliente e Valor');
        return false;
      }

      let safeScales = formData.scales;
      if (!safeScales || typeof safeScales !== 'object') {
        console.warn('⚠️ Scales inválidas, usando valores padrão');
        safeScales = emptyScales();
      }

      const newOpportunity = {
        name: formData.name.trim(),
        client: formData.client.trim(),
        vendor: formData.vendor || currentUser || 'Tomás',
        value: parseFloat(formData.value.toString()) || 0,
        stage: parseInt(formData.stage?.toString() || '1'),
        priority: formData.priority || 'média',
        probability: stages.find(s => s.id === (parseInt(formData.stage?.toString() || '1')))?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: safeScales,
        expected_close: formData.expected_close || null,
        product: formData.product?.trim() || null,
        power_sponsor: formData.power_sponsor?.trim() || null,
        sponsor: formData.sponsor?.trim() || null,
        influencer: formData.influencer?.trim() || null,
        support_contact: formData.support_contact?.trim() || null,
        industry: formData.industry?.trim() || null,
        product_lines: formData.product_lines || [],
        outcome: formData.outcome || null,
        outcome_notes: formData.outcome_notes?.trim() || null,
      };
      const created = await supabaseService.insertOpportunity(newOpportunity as any);
      upsertOpportunity(created);
      return true;

    } catch (err) {
      console.error('❌ Erro ao criar oportunidade:', err);
      setError(`Erro ao criar oportunidade: ${(err as Error).message || 'Verifique os dados'}`);
      return false;
    }
  }, [currentUser, upsertOpportunity]);

  const updateOpportunity = useCallback(async (id: number, formData: OpportunityFormData): Promise<boolean> => {
    try {
      setError(null);

      let safeScales = formData.scales;
      if (!safeScales || typeof safeScales !== 'object') {
        console.warn('⚠️ Scales inválidas em update, usando valores padrão');
        safeScales = emptyScales();
      }

      const updatedData = {
        name: formData.name.trim(),
        client: formData.client.trim(),
        vendor: formData.vendor || currentUser || 'Tomás',
        value: parseFloat(formData.value.toString()) || 0,
        stage: parseInt(formData.stage?.toString() || '1'),
        priority: formData.priority || 'média',
        probability: stages.find(s => s.id === (parseInt(formData.stage?.toString() || '1')))?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: safeScales,
        expected_close: formData.expected_close || null,
        product: formData.product?.trim() || null,
        power_sponsor: formData.power_sponsor?.trim() || null,
        sponsor: formData.sponsor?.trim() || null,
        influencer: formData.influencer?.trim() || null,
        support_contact: formData.support_contact?.trim() || null,
        industry: formData.industry?.trim() || null,
        product_lines: formData.product_lines || [],
        outcome: formData.outcome || null,
        outcome_notes: formData.outcome_notes?.trim() || null,
      };

      const updated = await supabaseService.updateOpportunity(id, updatedData as any);
      upsertOpportunity(updated);
      return true;

    } catch (err) {
      console.error('❌ Erro ao atualizar oportunidade:', err);
      setError(`Erro ao atualizar: ${(err as Error).message || 'Verifique os dados'}`);
      return false;
    }
  }, [currentUser, upsertOpportunity]);

  const deleteOpportunity = useCallback(async (id: number): Promise<void> => {
    if (!confirm('Tem certeza de que deseja excluir esta oportunidade?')) {
      return;
    }

    try {
      setError(null);
      await supabaseService.deleteOpportunity(id);
      setOpportunities(prev => prev.filter(opp => opp.id !== id));
    } catch (err) {
      console.error('Erro ao excluir oportunidade:', err);
      setError('Erro ao excluir oportunidade. Por favor, tente novamente.');
      await loadOpportunities();
    }
  }, [loadOpportunities]);

  const moveStage = useCallback(async (opportunity: Opportunity, newStage: number): Promise<void> => {
    const stage = stages.find(s => s.id === newStage);
    if (!stage) {
      console.error('Etapa não encontrada:', newStage);
      return;
    }

    try {
      setError(null);

      const updatedData = {
        stage: newStage,
        probability: stage.probability,
        last_update: new Date().toISOString().split('T')[0]
      };

      await supabaseService.updateOpportunity(opportunity.id, updatedData);

      setOpportunities(prev => prev.map(opp =>
        opp.id === opportunity.id
          ? { ...opp, ...updatedData }
          : opp
      ));
    } catch (err) {
      console.error('Erro ao mover etapa:', err);
      setError('Erro ao atualizar etapa. Por favor, tente novamente.');
      await loadOpportunities();
    }
  }, [loadOpportunities]);

  // "Assumir" oportunidade sem vendedor — sem recarregar a página
  const assumeOpportunity = useCallback(async (opportunity: Opportunity): Promise<void> => {
    if (!currentUser) return;
    try {
      setError(null);
      const updated = await supabaseService.updateOpportunity(opportunity.id, {
        vendor: currentUser,
        last_update: new Date().toISOString().split('T')[0]
      });
      upsertOpportunity(updated);
    } catch (err) {
      console.error('Erro ao assumir:', err);
      setError('Erro ao assumir oportunidade.');
    }
  }, [currentUser, upsertOpportunity]);

  useEffect(() => {
    loadVendors();
    loadOpportunities();

    // Realtime: aplicar o payload do evento direto no estado,
    // sem refazer o fetch completo da tabela a cada mudança.
    const subscription = supabase
      .channel('opportunities-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'opportunities' },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId !== undefined) {
              setOpportunities(prev => prev.filter(o => o.id !== deletedId));
            }
            return;
          }
          if (payload.new) {
            upsertOpportunity(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('ventapel_user', currentUser);
    }
  }, [currentUser]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    localStorage.removeItem('ventapel_user');
  }, []);

  const value = useMemo(() => ({
    opportunities,
    loading,
    error,
    vendors,
    currentUser,
    setCurrentUser,
    setError,
    loadOpportunities,
    loadVendors,
    createOpportunity,
    updateOpportunity,
    deleteOpportunity,
    moveStage,
    assumeOpportunity,
    logout
  }), [opportunities, loading, error, vendors, currentUser, loadOpportunities, loadVendors, createOpportunity, updateOpportunity, deleteOpportunity, moveStage, assumeOpportunity, logout]);

  return (
    <OpportunitiesContext.Provider value={value}>
      {children}
    </OpportunitiesContext.Provider>
  );
};

// --- HOOKS UTILITÁRIOS ---
const useFilters = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterInactivity, setFilterInactivity] = useState('all');
  const [filterProductLine, setFilterProductLine] = useState('all');

  return {
    searchTerm,
    setSearchTerm,
    filterStage,
    setFilterStage,
    filterVendor,
    setFilterVendor,
    filterInactivity,
    setFilterInactivity,
    filterProductLine,
    setFilterProductLine
  };
};

// --- COMPONENTES ---
const ErrorAlert: React.FC<{ error: string; onClose: () => void }> = ({ error, onClose }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center">
      <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
      <span className="text-red-800">{error}</span>
      <button onClick={onClose} className="ml-auto text-red-600 hover:text-red-800">
        <X className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const LoadingSpinner: React.FC = () => (
  <div className="text-center py-12 bg-white rounded-xl border">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
    <p className="mt-4 text-gray-600">Carregando oportunidades...</p>
  </div>
);

// --- FUNÇÕES AUXILIARES ---
const checkStageRequirements = (opportunity: Opportunity, stageId: number): boolean => {
  if (!opportunity.scales) return false;
  return checkScaleGates(opportunity.scales, stageId);
};

const checkInactivity = (lastUpdate: string, days: number): boolean => {
  const lastUpdateDate = new Date(lastUpdate);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - lastUpdateDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= days;
};

// --- DASHBOARD (componente top-level: não é recriado a cada render do pai) ---
interface DashboardMetrics {
  totalValue: number;
  weightedValue: number;
  totalOpportunities: number;
  avgScore: number;
  avgProbability: number;
  stageDistribution: (StageRequirement & { count: number; value: number; weightedValue: number; opportunities: Opportunity[] })[];
}

interface DashboardViewProps {
  metrics: DashboardMetrics;
  currentVendorInfo: VendorInfo | null;
  dashboardVendorFilter: string;
  setDashboardVendorFilter: (v: string) => void;
  selectedStageForList: number | null;
  setSelectedStageForList: (v: number | null) => void;
  onEdit: (opp: Opportunity) => void;
  onAnalyze: (opp: Opportunity) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  currentVendorInfo,
  dashboardVendorFilter,
  setDashboardVendorFilter,
  selectedStageForList,
  setSelectedStageForList,
  onEdit,
  onAnalyze,
}) => {
  const { error, setError, vendors, currentUser } = useOpportunitiesContext();

  return (
    <div className="space-y-8">
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-4 sm:p-6 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">🎯 CRM VENTAPEL - Pepito</h2>
            <p className="hidden sm:block text-blue-100">Sistema de Vendas Consultivas - Metodologia PPVVCC</p>
            <p className="hidden sm:block text-blue-100 text-base">🔗 Conectado ao Supabase</p>
            {currentUser && (
              <p className="text-yellow-300 text-sm sm:text-base sm:mt-1">
                👤 {currentUser} {currentVendorInfo?.role && `(${currentVendorInfo.role})`}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-2xl sm:text-3xl font-bold">R$ {metrics.totalValue.toLocaleString('pt-BR')}</div>
            <div className="text-blue-100 text-sm sm:text-base">Pipeline Total</div>
            <div className="text-base sm:text-lg font-semibold text-yellow-300 mt-1">
              R$ {metrics.weightedValue.toLocaleString('pt-BR')} ponderado
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 sm:p-6 rounded-xl shadow-sm border border-green-200">
          <div className="flex items-center">
            <div className="hidden sm:block p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
            <div className="sm:ml-4 min-w-0">
              <p className="text-sm sm:text-base font-medium text-green-700">Pipeline Total</p>
              <p className="text-lg sm:text-2xl font-bold text-green-800 truncate">
                R$ {metrics.totalValue.toLocaleString('pt-BR')}
              </p>
              <p className="text-xs sm:text-base text-green-600 truncate">
                Ponderado: R$ {metrics.weightedValue.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-3 sm:p-6 rounded-xl shadow-sm border border-blue-200">
          <div className="flex items-center">
            <div className="hidden sm:block p-3 bg-blue-100 rounded-lg">
              <Target className="w-8 h-8 text-blue-600" />
            </div>
            <div className="sm:ml-4 min-w-0">
              <p className="text-sm sm:text-base font-medium text-blue-700">Oportunidades</p>
              <p className="text-lg sm:text-2xl font-bold text-blue-800">{metrics.totalOpportunities}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-3 sm:p-6 rounded-xl shadow-sm border border-purple-200">
          <div className="flex items-center">
            <div className="hidden sm:block p-3 bg-purple-100 rounded-lg">
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
            <div className="sm:ml-4 min-w-0">
              <p className="text-sm sm:text-base font-medium text-purple-700">Score PPVVCC</p>
              <p className="text-lg sm:text-2xl font-bold text-purple-800">{metrics.avgScore.toFixed(1)}/10</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-3 sm:p-6 rounded-xl shadow-sm border border-orange-200">
          <div className="flex items-center">
            <div className="hidden sm:block p-3 bg-orange-100 rounded-lg">
              <TrendingUp className="w-8 h-8 text-orange-600" />
            </div>
            <div className="sm:ml-4 min-w-0">
              <p className="text-sm sm:text-base font-medium text-orange-700">Prob. Média</p>
              <p className="text-lg sm:text-2xl font-bold text-orange-800">{metrics.avgProbability.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800">📊 Funil de Vendas</h3>
          <div className="flex items-center gap-2 sm:gap-4">
            <label className="hidden sm:block text-base font-medium text-gray-700">Filtrar por vendedor:</label>
            <select
              value={dashboardVendorFilter}
              onChange={(e) => setDashboardVendorFilter(e.target.value)}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
              disabled={!currentVendorInfo?.is_admin && Boolean(currentUser)}
            >
              <option value="all">👥 Todos vendedores</option>
              {vendors.map(vendor => (
                <option key={vendor.name} value={vendor.name}>
                  {vendor.name} {vendor.role && `(${vendor.role})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {metrics.stageDistribution.slice(0, 5).map(stage => (
            <div key={stage.id}>
              <div
                className="cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                onClick={() => setSelectedStageForList(selectedStageForList === stage.id ? null : stage.id)}
              >
                {/* Linha superior no mobile: nome + valores */}
                <div className="flex md:hidden items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{stage.name}</span>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">R$ {stage.value.toLocaleString('pt-BR')}</span>
                    <ChevronDown className={'w-4 h-4 text-gray-400 transition-transform ' + (selectedStageForList === stage.id ? 'rotate-180' : '')} />
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="hidden md:block w-40 text-base font-medium text-gray-700">{stage.name}</div>
                  <div className="flex-1 md:mx-6">
                    <div className="bg-gray-200 rounded-full h-6 md:h-8 relative">
                      <div
                        className={stage.color + ' h-6 md:h-8 rounded-full transition-all duration-500'}
                        style={{ width: Math.max((stage.count / Math.max(...metrics.stageDistribution.map(s => s.count), 1)) * 100, 5) + '%' }}
                      ></div>
                      <div className="absolute inset-0 flex items-center justify-center text-sm md:text-base font-medium text-white">
                        {stage.count > 0 && (stage.count + ' oportunidades')}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block w-20 text-base text-gray-600 text-center">{stage.count}</div>
                  <div className="hidden md:block w-48 text-base font-medium text-right text-gray-800">
                    R$ {stage.value.toLocaleString('pt-BR')}
                  </div>
                  <div className="hidden md:block w-48 text-base text-right text-gray-600">
                    Pond: R$ {stage.weightedValue.toLocaleString('pt-BR')}
                  </div>
                  <ChevronDown className={'hidden md:block w-5 h-5 ml-4 text-gray-400 transition-transform ' + (selectedStageForList === stage.id ? 'rotate-180' : '')} />
                </div>
              </div>

              {selectedStageForList === stage.id && stage.opportunities.length > 0 && (
                <div className="mt-4 md:mx-8 p-2 sm:p-4 bg-gray-50 rounded-lg overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm sm:text-base">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        <th className="pb-2 font-medium text-gray-700">Oportunidade</th>
                        <th className="pb-2 font-medium text-gray-700">Cliente</th>
                        <th className="pb-2 font-medium text-gray-700">Vendedor</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Valor</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Prob.</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">SPIN</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Valor Pond.</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage.opportunities.map(opp => (
                        <tr key={opp.id} className="border-b border-gray-100 hover:bg-white cursor-pointer">
                          <td className="py-2">{opp.name}</td>
                          <td className="py-2">{opp.client}</td>
                          <td className="py-2">{opp.vendor}</td>
                          <td className="py-2 text-right">R$ {opp.value.toLocaleString('pt-BR')}</td>
                          <td className="py-2 text-right">{opp.probability}%</td>
                          <td className="py-2 text-right">
                            <span className="text-xs text-purple-600 font-medium">
                              {calculateSPINProgress(opp)}%
                            </span>
                          </td>
                          <td className="py-2 text-right font-medium">
                            R$ {(opp.value * opp.probability / 100).toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2">
                            <div className="flex space-x-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit(opp);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Ver detalhes"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAnalyze(opp);
                                }}
                                className="text-purple-600 hover:text-purple-800"
                                title="Analisar com Coach IA"
                              >
                                <Brain className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-lg font-semibold text-gray-800">
              Total Geral:
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900">
                R$ {metrics.totalValue.toLocaleString('pt-BR')}
              </div>
              <div className="text-sm text-gray-600">
                Ponderado: R$ {metrics.weightedValue.toLocaleString('pt-BR')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- CARD DE OPORTUNIDADE (top-level) ---
interface OpportunityCardProps {
  opportunity: Opportunity;
  isSelected: boolean;
  onEdit: (opp: Opportunity) => void;
  onAnalyze: (opp: Opportunity) => void;
  onMoveStage: (opp: Opportunity, newStage: number) => void;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ opportunity, isSelected, onEdit, onAnalyze, onMoveStage }) => {
  const { currentUser, deleteOpportunity, assumeOpportunity } = useOpportunitiesContext();

  const stage = stages.find(s => s.id === opportunity.stage);
  const nextStage = stages.find(s => s.id === opportunity.stage + 1);
  const prevStage = stages.find(s => s.id === opportunity.stage - 1);

  const avgScore = calculateHealthScore(opportunity.scales);

  const canAdvance = nextStage && checkStageRequirements(opportunity, opportunity.stage);
  const isInactive7Days = checkInactivity(opportunity.last_update, 7);
  const isInactive30Days = checkInactivity(opportunity.last_update, 30);

  return (
    <div className={'bg-white rounded-xl shadow-sm border p-4 sm:p-6 hover:shadow-lg transition-all ' +
      (isInactive30Days ? 'border-red-300 bg-red-50' : isInactive7Days ? 'border-yellow-300 bg-yellow-50' : '')}>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4 sm:mb-6">
        <div className="flex-1 min-w-0 w-full">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">{opportunity.name}</h3>
            <OpportunityHealthScore opportunity={opportunity} />
            {/* Indicador SPIN */}
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center">
              <FileQuestion className="w-3 h-3 mr-1" />
              SPIN: {calculateSPINProgress(opportunity)}%
            </span>
            {isInactive30Days && (
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                +30 dias sem movimento
              </span>
            )}
            {!isInactive30Days && isInactive7Days && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                +7 dias sem movimento
              </span>
            )}
            {opportunity.outcome === 'won' && (
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold">✅ Ganhou</span>
            )}
            {opportunity.outcome === 'lost' && (
              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-semibold">❌ Perdeu</span>
            )}
            {opportunity.outcome === 'abandoned' && (
              <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full font-semibold">⏸️ Abandonada</span>
            )}
            <button
              onClick={() => onEdit(opportunity)}
              className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Editar oportunidade"
            >
              <Edit3 className="w-5 h-5" />
            </button>
            <button
              onClick={() => onAnalyze(opportunity)}
              className="p-2.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
              title="Analisar com Coach IA"
            >
              <Brain className="w-5 h-5" />
            </button>
            <button
              onClick={() => deleteOpportunity(opportunity.id)}
              className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Excluir oportunidade"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xl font-semibold text-blue-600">{opportunity.client}</p>
            {opportunity.vendor && opportunity.vendor.trim() ? (
              <p className="text-base text-gray-600">👤 {opportunity.vendor}</p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-base text-orange-600 font-semibold">👤 Sem vendedor</p>
                {currentUser && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      assumeOpportunity(opportunity);
                    }}
                    className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    🙋 Assumir
                  </button>
                )}
              </div>
            )}
            {opportunity.product_lines && opportunity.product_lines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {opportunity.product_lines.map(pl => {
                  const config = PRODUCT_LINES[pl];
                  return config ? (
                    <span key={pl} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                      {config.icon} {config.label}
                    </span>
                  ) : null;
                })}
              </div>
            )}
            <p className="text-base text-purple-600">📦 {opportunity.product}</p>
            {opportunity.industry && (
              <p className="text-base text-gray-600">🏭 {opportunity.industry}</p>
            )}
            {opportunity.expected_close && (
              <p className="text-base text-gray-600">📅 Fechamento: {new Date(opportunity.expected_close).toLocaleDateString('pt-BR')}</p>
            )}
          </div>
          {opportunity.next_action && (
            <div className={'mt-3 p-3 rounded-lg border ' + (opportunity.next_action_date && opportunity.next_action_date < new Date().toISOString().slice(0, 10) ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200')}>
              <p className={'text-base ' + (opportunity.next_action_date && opportunity.next_action_date < new Date().toISOString().slice(0, 10) ? 'text-red-800' : 'text-blue-800')}>
                📅 <strong>Próxima ação:</strong> {opportunity.next_action}
                {opportunity.next_action_date
                  ? ` — ${new Date(opportunity.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}${opportunity.next_action_date < new Date().toISOString().slice(0, 10) ? ' ⚠️ vencida' : ''}`
                  : ' — sem data'}
              </p>
            </div>
          )}
          <div className="mt-2 text-sm text-gray-500">
            Última atualização: {new Date(opportunity.last_update).toLocaleDateString('pt-BR')}
          </div>
        </div>
        <div className="w-full sm:w-auto sm:text-right flex sm:block flex-wrap items-center gap-x-3 gap-y-1 flex-shrink-0">
          <p className="text-xl sm:text-2xl font-bold text-green-600 sm:mb-2">
            R$ {(opportunity.value || 0).toLocaleString('pt-BR')}
          </p>
          <span className={'inline-block px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold text-white ' + (stage?.color || '') + ' sm:mb-2'}>
            {stage?.name} ({opportunity.probability || 0}%)
          </span>
          <p className="text-xs sm:text-sm text-gray-600 font-medium">
            Ponderado: R$ {((opportunity.value || 0) * (opportunity.probability || 0) / 100).toLocaleString('pt-BR')}
          </p>
        </div>
      </div>

      <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h4 className="font-semibold text-gray-700">🎯 Gestão de Etapa</h4>
          <div className="flex flex-wrap gap-2">
            {prevStage && (
              <button
                onClick={() => onMoveStage(opportunity, prevStage.id)}
                className="px-3 py-2 sm:py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                ← {prevStage.name}
              </button>
            )}
            {nextStage && (
              <button
                onClick={() => onMoveStage(opportunity, nextStage.id)}
                className={'px-3 py-2 sm:py-1 text-xs rounded-md transition-colors flex items-center ' + (canAdvance
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-red-100 text-red-600 cursor-not-allowed')}
              >
                {nextStage.name} →
                {canAdvance ? <Check className="w-3 h-3 ml-1" /> : <X className="w-3 h-3 ml-1" />}
              </button>
            )}
          </div>
        </div>

        {nextStage && (
          <div className="text-xs text-gray-600">
            <p className="font-medium mb-1">Requisitos para {nextStage.name}:</p>
            <ul className="space-y-1">
              {nextStage.requirements?.map((req, idx) => (
                <li key={idx} className="flex items-center">
                  <div className={'w-2 h-2 rounded-full mr-2 ' + (checkStageRequirements(opportunity, opportunity.stage) ? 'bg-green-500' : 'bg-red-500')}></div>
                  {req}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-base font-bold text-gray-700">📊 Score PPVVCC Geral</span>
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold text-gray-900">{avgScore.toFixed(1)}/10</span>
            {isSelected && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center">
                <Brain className="w-3 h-3 mr-1" />
                Em análise
              </span>
            )}
          </div>
        </div>
        <div className="bg-gray-200 rounded-full h-4 mb-4">
          <div
            className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: (avgScore / 10) * 100 + '%' }}
          ></div>
        </div>

        {opportunity.scales && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {scales.map(scale => {
              const Icon = scale.icon;
              const scaleData = opportunity.scales[scale.id as keyof Scales];
              const scoreValue = getScaleScore(scaleData);
              return (
                <div key={scale.id} className={scale.bgColor + ' ' + scale.borderColor + ' border rounded-lg p-2 cursor-pointer hover:shadow-md transition-all'}
                     onClick={() => onEdit(opportunity)}
                     title={scaleData.description || scale.name}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Icon className={'w-4 h-4 mr-1 ' + scale.color} />
                      <span className="text-sm font-bold">{scale.name}</span>
                    </div>
                    <span className="text-xl font-bold text-gray-800">{scoreValue}</span>
                  </div>
                  {scaleData.description && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{scaleData.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <h4 className="text-base font-semibold text-gray-700 mb-3">👥 Contatos Principais</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-base">
          {opportunity.power_sponsor && (
            <div className="flex items-center">
              <span className="font-medium text-gray-600 mr-2">Power Sponsor:</span>
              <span className="text-gray-800">{opportunity.power_sponsor}</span>
            </div>
          )}
          {opportunity.sponsor && (
            <div className="flex items-center">
              <span className="font-medium text-gray-600 mr-2">Sponsor:</span>
              <span className="text-gray-800">{opportunity.sponsor}</span>
            </div>
          )}
          {opportunity.influencer && (
            <div className="flex items-center">
              <span className="font-medium text-gray-600 mr-2">Influenciador:</span>
              <span className="text-gray-800">{opportunity.influencer}</span>
            </div>
          )}
          {opportunity.support_contact && (
            <div className="flex items-center">
              <span className="font-medium text-gray-600 mr-2">Contato Apoio:</span>
              <span className="text-gray-800">{opportunity.support_contact}</span>
            </div>
          )}
        </div>
      </div>

      <ActivityPanel
        opportunity={opportunity}
        currentUser={currentUser}
        supabase={supabase}
      />
    </div>
  );
};

// --- FORMULÁRIO DE OPORTUNIDADE (top-level: não perde estado com re-renders do pai) ---
interface OpportunityFormProps {
  opportunity?: Opportunity | null;
  onClose: () => void;
}

const OpportunityForm: React.FC<OpportunityFormProps> = ({ opportunity, onClose }) => {
  const { vendors, currentUser, createOpportunity, updateOpportunity } = useOpportunitiesContext();
  const currentVendorInfo = useMemo(() => vendors.find(v => v.name === currentUser) || null, [vendors, currentUser]);

  const [formData, setFormData] = useState<OpportunityFormData>({
    name: opportunity?.name || '',
    client: opportunity?.client || '',
    vendor: opportunity?.vendor || currentUser || vendors[0]?.name || '',
    value: opportunity?.value?.toString() || '',
    stage: opportunity?.stage || 1,
    priority: opportunity?.priority || 'média',
    expected_close: opportunity?.expected_close || '',
    next_action: opportunity?.next_action || '',
    next_action_date: opportunity?.next_action_date || '',
    product: opportunity?.product || '',
    power_sponsor: opportunity?.power_sponsor || '',
    sponsor: opportunity?.sponsor || '',
    influencer: opportunity?.influencer || '',
    support_contact: opportunity?.support_contact || '',
    scales: opportunity?.scales || emptyScales(),
    industry: opportunity?.industry || '',
    product_lines: opportunity?.product_lines || [],
    outcome: opportunity?.outcome || null,
    outcome_notes: opportunity?.outcome_notes || '',
  });

  const [activeScale, setActiveScale] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showScaleSelector, setShowScaleSelector] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!formData.name?.trim()) {
      alert('❌ Por favor, insira o nome da oportunidade');
      return;
    }

    if (!formData.client?.trim()) {
      alert('❌ Por favor, insira o nome do cliente');
      return;
    }

    const valueNum = parseFloat(formData.value?.toString() || '0');
    if (isNaN(valueNum) || valueNum <= 0) {
      alert('❌ Por favor, insira um valor válido maior que 0');
      return;
    }

    setSubmitting(true);

    try {
      const dataToSend = {
        ...formData,
        scales: formData.scales || emptyScales()
      };

      const success = opportunity
        ? await updateOpportunity(opportunity.id, dataToSend)
        : await createOpportunity(dataToSend);

      if (success) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateScale = (scaleId: string, field: 'score' | 'description', value: string | number) => {
    if (field === 'score') {
      const numValue = typeof value === 'string' ? parseInt(value) : value;
      if (numValue < 0 || numValue > 10) return;
    }

    setFormData(prev => ({
      ...prev,
      scales: {
        ...prev.scales,
        [scaleId]: {
          ...prev.scales[scaleId as keyof Scales],
          [field]: field === 'score' ? (typeof value === 'string' ? parseInt(value) || 0 : value) : value
        }
      }
    }));
  };

  const selectScaleLevel = (scaleId: string, level: number, description: string) => {
    updateScale(scaleId, 'score', level);
    updateScale(scaleId, 'description', description);
    setShowScaleSelector(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      {/* No celular o form abre em tela cheia (sheet); no desktop mantém o modal centrado */}
      <div className="bg-white rounded-none sm:rounded-xl max-w-6xl w-full min-h-full sm:min-h-0 sm:my-8 sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-8">
          <div className="flex justify-between items-center mb-5 sm:mb-8 sticky top-0 bg-white z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 sm:py-0 border-b sm:border-0">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-3xl font-bold text-gray-900 truncate">
                {opportunity ? '✏️ Editar Oportunidade' : '➕ Nova Oportunidade'}
              </h2>
              <p className="hidden sm:block text-gray-600 mt-1">
                {opportunity ? 'Atualize os dados da oportunidade' : 'Adicione uma nova oportunidade ao pipeline Ventapel'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 sm:p-3 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0"
              disabled={submitting}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
            <div className="space-y-6">
              <div className="bg-blue-50 rounded-xl p-4 sm:p-6 border border-blue-200">
                <h3 className="text-lg font-semibold mb-4 text-blue-800">📋 Informações Básicas</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Nome da Oportunidade *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Solução de Fechamento Amazon"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Cliente *</label>
                    <input
                      type="text"
                      value={formData.client}
                      onChange={(e) => setFormData({...formData, client: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Nome da empresa"
                      disabled={submitting}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Vendedor *</label>
                      <select
                        value={formData.vendor}
                        onChange={(e) => setFormData({...formData, vendor: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={submitting || (!currentVendorInfo?.is_admin && !!currentUser)}
                      >
                        {vendors.map(vendor => (
                          <option key={vendor.name} value={vendor.name}>
                            {vendor.name} {vendor.role && `(${vendor.role})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Valor (R$) *</label>
                      <input
                        type="number"
                        value={formData.value}
                        onChange={(e) => setFormData({...formData, value: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="250000"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Etapa *</label>
                      <select
                        value={formData.stage}
                        onChange={(e) => setFormData({...formData, stage: parseInt(e.target.value)})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                      >
                        {stages.slice(0, 5).map(stage => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name} ({stage.probability}%)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Prioridade</label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({...formData, priority: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                      >
                        <option value="baixa">Baixa</option>
                        <option value="média">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Linhas de Produto</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(PRODUCT_LINES).map(([key, pl]) => {
                        const selected = (formData.product_lines || []).includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const current = formData.product_lines || [];
                              const updated = selected ? current.filter(k => k !== key) : [...current, key];
                              setFormData({...formData, product_lines: updated});
                            }}
                            disabled={submitting}
                            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${selected ? `${pl.bg} ${pl.color} border-current ring-2 ring-current ring-opacity-30` : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}
                          >
                            {pl.icon} {pl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Produto</label>
                      <input
                        type="text"
                        value={formData.product}
                        onChange={(e) => setFormData({...formData, product: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Máquinas BP + Fita"
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Indústria</label>
                      <input
                        type="text"
                        value={formData.industry}
                        onChange={(e) => setFormData({...formData, industry: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: E-commerce, Farmacêutica"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Fechamento Previsto</label>
                      <input
                        type="date"
                        value={formData.expected_close}
                        onChange={(e) => setFormData({...formData, expected_close: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        disabled={submitting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Próxima Ação</label>
                      <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700">
                        {formData.next_action
                          ? <>{formData.next_action}{formData.next_action_date ? ` — ${new Date(formData.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}` : ' — sem data'}</>
                          : <span className="text-gray-400">Nenhuma ação planejada</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">📅 Gerenciada no painel Atividades &amp; Ações (Planejar) ou pelo Ventus Bot</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-4 sm:p-6 border border-green-200">
                <h3 className="text-lg font-semibold mb-4 text-green-800">👥 Contatos Principais</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Power Sponsor</label>
                    <input
                      type="text"
                      value={formData.power_sponsor}
                      onChange={(e) => setFormData({...formData, power_sponsor: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Quem assina o contrato"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Sponsor</label>
                    <input
                      type="text"
                      value={formData.sponsor}
                      onChange={(e) => setFormData({...formData, sponsor: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Decisor usuário"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Principal Influenciador</label>
                    <input
                      type="text"
                      value={formData.influencer}
                      onChange={(e) => setFormData({...formData, influencer: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Influencia a decisão"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-700">Contato de Apoio</label>
                    <input
                      type="text"
                      value={formData.support_contact}
                      onChange={(e) => setFormData({...formData, support_contact: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Suporte interno"
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-purple-50 rounded-xl p-4 sm:p-6 border border-purple-200">
                <h3 className="text-lg font-semibold mb-4 text-purple-800">📊 Escalas PPVVCC</h3>
                <div className="space-y-4">
                  {scales.map(scale => {
                    const Icon = scale.icon;
                    const scaleData = formData.scales[scale.id as keyof Scales];
                    const isActive = activeScale === scale.id;
                    const isSelectorOpen = showScaleSelector === scale.id;

                    return (
                      <div key={scale.id} className={scale.bgColor + ' ' + scale.borderColor + ' border-2 rounded-lg p-4 transition-all ' + (isActive ? 'ring-2 ring-purple-400' : '')}>
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setActiveScale(isActive ? null : scale.id)}
                        >
                          <div className="flex items-center">
                            <Icon className={'w-5 h-5 mr-3 ' + scale.color} />
                            <div>
                              <span className="font-bold text-sm">{scale.name}</span>
                              <p className="text-xs text-gray-600">{scale.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-2xl font-bold">{scaleData.score}</span>
                            <ChevronRight className={'w-4 h-4 transition-transform ' + (isActive ? 'rotate-90' : '')} />
                          </div>
                        </div>

                        {isActive && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <label className="block text-sm font-medium">Score (0-10)</label>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowScaleSelector(isSelectorOpen ? null : scale.id);
                                    }}
                                    className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200 transition-colors flex items-center"
                                  >
                                    Ver opções de escala
                                    {isSelectorOpen ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                                  </button>
                                </div>

                                {isSelectorOpen && (
                                  <div className="mb-4 bg-white rounded-lg p-3 max-h-60 overflow-y-auto border border-purple-200">
                                    {scaleDefinitions[scale.id as keyof typeof scaleDefinitions].map((def) => (
                                      <button
                                        key={def.level}
                                        type="button"
                                        onClick={() => selectScaleLevel(scale.id, def.level, def.text)}
                                        className={'w-full text-left p-2 mb-1 rounded-lg transition-colors ' +
                                          (scaleData.score === def.level
                                            ? 'bg-purple-100 border-2 border-purple-500'
                                            : 'hover:bg-gray-50 border border-gray-200')}
                                      >
                                        <div className="flex items-start">
                                          <span className="font-bold text-purple-700 mr-2 min-w-[20px]">{def.level}</span>
                                          <span className="text-xs text-gray-700">{def.text}</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                <input
                                  type="range"
                                  min="0"
                                  max="10"
                                  value={scaleData.score}
                                  onChange={(e) => updateScale(scale.id, 'score', parseInt(e.target.value))}
                                  className="w-full"
                                  disabled={submitting}
                                />
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                  <span>0</span>
                                  <span className="font-bold">{scaleData.score}</span>
                                  <span>10</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium mb-2">Observações</label>
                                <textarea
                                  value={scaleData.description}
                                  onChange={(e) => updateScale(scale.id, 'description', e.target.value)}
                                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  rows={3}
                                  placeholder="Descreva a situação atual..."
                                  disabled={submitting}
                                />
                              </div>

                              {/* INTEGRAÇÃO DO PAINEL SPIN */}
                              <SPINQuestionsPanel
                                scaleId={scale.id}
                                onQuestionUsed={(question) => {
                                  const currentDesc = scaleData.description || '';
                                  const newDesc = currentDesc ?
                                    currentDesc + '\n✓ ' + question :
                                    '✓ ' + question;
                                  updateScale(scale.id, 'description', newDesc);
                                }}
                              />

                              <div className="bg-white p-3 rounded-lg">
                                <p className="text-xs font-medium text-gray-700 mb-2">Perguntas-chave gerais:</p>
                                <ul className="text-xs text-gray-600 space-y-1">
                                  {scale.questions?.map((question, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="text-purple-500 mr-2">•</span>
                                      {question}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {/* Resultado Final */}
          {opportunity && (
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 mt-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
                🏁 Resultado Final
              </h3>
              <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
                {([
                  { value: null, label: 'Em andamento', color: 'bg-blue-100 text-blue-700 border-blue-300', activeColor: 'bg-blue-500 text-white border-blue-600' },
                  { value: 'won', label: '✅ Ganhou', color: 'bg-green-50 text-green-700 border-green-300', activeColor: 'bg-green-500 text-white border-green-600' },
                  { value: 'lost', label: '❌ Perdeu', color: 'bg-red-50 text-red-700 border-red-300', activeColor: 'bg-red-500 text-white border-red-600' },
                  { value: 'abandoned', label: '⏸️ Abandonada', color: 'bg-gray-100 text-gray-600 border-gray-300', activeColor: 'bg-gray-500 text-white border-gray-600' },
                ] as const).map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setFormData({...formData, outcome: opt.value as any})}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      formData.outcome === opt.value ? opt.activeColor : opt.color
                    } hover:shadow-sm`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {formData.outcome && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    📝 Lições aprendidas / Observações para o futuro
                  </label>
                  <textarea
                    value={formData.outcome_notes || ''}
                    onChange={e => setFormData({...formData, outcome_notes: e.target.value})}
                    placeholder={
                      formData.outcome === 'won' ? 'O que funcionou bem? Que argumentos convenceram? O que replicar...' :
                      formData.outcome === 'lost' ? 'Por que perdemos? O que faltou? O que o concorrente ofereceu...' :
                      'Por que foi abandonada? Vale retomar no futuro?'
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}

          {/* Activity Panel - solo al editar */}
          {opportunity && (
            <div className="mt-6">
              <ActivityPanel
                opportunity={opportunity}
                currentUser={currentUser}
                supabase={supabase}
              />
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 mt-6 sm:mt-8 pt-5 sm:pt-6 border-t">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 flex items-center justify-center transition-colors font-medium disabled:opacity-50"
              disabled={submitting}
            >
              {submitting ? (
                <React.Fragment>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Salvando...
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Save className="w-5 h-5 mr-2" />
                  {opportunity ? 'Atualizar' : 'Criar'} Oportunidade
                </React.Fragment>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE CHECKLIST DE ETAPA (top-level; hooks sempre no topo) ---
interface StageChecklistModalProps {
  opportunity: Opportunity;
  targetStage: number;
  onConfirm: (opportunity: Opportunity, targetStage: number) => Promise<void>;
  onClose: () => void;
}

const StageChecklistModal: React.FC<StageChecklistModalProps> = ({ opportunity, targetStage, onConfirm, onClose }) => {
  const currentStage = stages.find(s => s.id === opportunity.stage);
  const target = stages.find(s => s.id === targetStage);

  const [checkedItems, setCheckedItems] = useState<{[key: string]: boolean}>(() => {
    const items: {[key: string]: boolean} = {};
    if (currentStage?.checklist) {
      Object.values(currentStage.checklist).forEach(key => {
        items[key] = false;
      });
    }
    return items;
  });

  if (!currentStage || !target) return null;

  const handleCheckChange = (key: string) => {
    setCheckedItems(prev => ({...prev, [key]: !prev[key]}));
  };

  const allChecked = currentStage.checklist && Object.values(currentStage.checklist).every(key => checkedItems[key] === true);

  const confirmStageChange = async () => {
    if (!allChecked) {
      alert('Por favor, complete todos os itens do checklist antes de avançar.');
      return;
    }

    try {
      await onConfirm(opportunity, targetStage);
      onClose();
    } catch (error) {
      console.error('Erro ao mover etapa:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-xl max-w-2xl w-full min-h-full sm:min-h-0 sm:max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">
            ✅ Checklist para avançar para {target.name}
          </h3>
          <p className="text-gray-600 mt-1">
            Complete todos os itens antes de mover a oportunidade
          </p>
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-2">📋 {opportunity.name}</h4>
            <p className="text-sm text-blue-700">{opportunity.client}</p>
          </div>

          <div className="space-y-3">
            {currentStage.checklist && Object.entries(currentStage.checklist).map(([label, key]) => {
              const isChecked = checkedItems[key] === true;
              return (
                <label key={key} className="flex items-start p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleCheckChange(key)}
                    className="mt-0.5 mr-3 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-gray-800 font-medium">{label}</span>
                    {isChecked && (
                      <CheckCircle className="inline-block w-5 h-5 text-green-600 ml-2" />
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-800">
              <AlertCircle className="inline-block w-4 h-4 mr-1" />
              <strong>Atenção:</strong> Confirme que todos os requisitos foram cumpridos antes de avançar.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={confirmStageChange}
            className={'w-full sm:w-auto px-6 py-3 rounded-lg transition-colors flex items-center justify-center font-medium ' +
              (allChecked
                ? 'bg-gradient-to-r from-blue-600 to-green-600 text-white hover:from-blue-700 hover:to-green-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed')}
            disabled={!allChecked}
          >
            <Check className="w-5 h-5 mr-2" />
            Confirmar e Avançar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
const CRMVentapel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [dashboardVendorFilter, setDashboardVendorFilter] = useState('all');
  const [selectedStageForList, setSelectedStageForList] = useState<number | null>(null);
  const [showStageChecklist, setShowStageChecklist] = useState<{ opportunity: Opportunity, targetStage: number } | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  // No celular os filtros ficam recolhidos para não empurrar a lista para baixo
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const {
    opportunities,
    loading,
    error,
    vendors,
    currentUser,
    setError,
    moveStage,
    logout
  } = useOpportunitiesContext();

  const filters = useFilters();

  const currentVendorInfo = useMemo(() => {
    return vendors.find(v => v.name === currentUser) || null;
  }, [vendors, currentUser]);

  const userOpportunities = useMemo(() => {
    if (!currentUser) return opportunities;
    if (currentVendorInfo?.is_admin) return opportunities;
    return opportunities.filter(opp => opp.vendor === currentUser || !opp.vendor || !opp.vendor.trim());
  }, [opportunities, currentUser, currentVendorInfo]);

  const filteredOpportunities = useMemo(() => {
    return userOpportunities.filter(opp => {
      const matchesSearch = opp.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                           opp.client.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                           (opp.product && opp.product.toLowerCase().includes(filters.searchTerm.toLowerCase()));
      const matchesStage = filters.filterStage === 'all' || opp.stage.toString() === filters.filterStage;
      const matchesVendor = filters.filterVendor === 'all' || opp.vendor === filters.filterVendor;

      let matchesInactivity = true;
      if (filters.filterInactivity === '7days') {
        matchesInactivity = checkInactivity(opp.last_update, 7);
      } else if (filters.filterInactivity === '30days') {
        matchesInactivity = checkInactivity(opp.last_update, 30);
      }

      const matchesProductLine = filters.filterProductLine === 'all' ||
        (opp.product_lines && opp.product_lines.includes(filters.filterProductLine));

      return matchesSearch && matchesStage && matchesVendor && matchesInactivity && matchesProductLine;
    });
  }, [userOpportunities, filters.searchTerm, filters.filterStage, filters.filterVendor, filters.filterInactivity, filters.filterProductLine]);

  const dashboardOpportunities = useMemo(() => {
    const baseOpps = currentVendorInfo?.is_admin ? opportunities : userOpportunities;
    if (dashboardVendorFilter === 'all') return baseOpps;
    return baseOpps.filter(opp => opp.vendor === dashboardVendorFilter);
  }, [opportunities, userOpportunities, dashboardVendorFilter, currentVendorInfo]);

  const metrics: DashboardMetrics = useMemo(() => {
    // Uma única passada pelo array para totais e distribuição por etapa
    const byStage = new Map<number, { count: number; value: number; weightedValue: number; opportunities: Opportunity[] }>();
    stages.forEach(s => byStage.set(s.id, { count: 0, value: 0, weightedValue: 0, opportunities: [] }));

    let totalValue = 0;
    let weightedValue = 0;
    let scoreSum = 0;
    let probabilitySum = 0;

    dashboardOpportunities.forEach(opp => {
      const value = opp.value || 0;
      const weighted = value * (opp.probability || 0) / 100;
      totalValue += value;
      weightedValue += weighted;
      probabilitySum += opp.probability || 0;
      scoreSum += calculateHealthScore(opp.scales);

      const bucket = byStage.get(opp.stage);
      if (bucket) {
        bucket.count++;
        bucket.value += value;
        bucket.weightedValue += weighted;
        bucket.opportunities.push(opp);
      }
    });

    const n = dashboardOpportunities.length;
    return {
      totalValue,
      weightedValue,
      totalOpportunities: n,
      avgScore: n > 0 ? scoreSum / n : 0,
      avgProbability: n > 0 ? probabilitySum / n : 0,
      stageDistribution: stages.map(stage => ({
        ...stage,
        ...byStage.get(stage.id)!
      }))
    };
  }, [dashboardOpportunities]);

  const openAssistantWithOpportunity = useCallback((opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setIsAssistantOpen(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openAssistant'));
    }, 100);
  }, []);

  const handleEditOpportunity = useCallback((opportunity: Opportunity) => {
    setEditingOpportunity(opportunity);
    setSelectedOpportunity(opportunity);
  }, []);

  const handleMoveStage = useCallback(async (opportunity: Opportunity, newStage: number) => {
    if (newStage > opportunity.stage && !checkStageRequirements(opportunity, opportunity.stage)) {
      setShowStageChecklist({ opportunity, targetStage: newStage });
      return;
    }

    await moveStage(opportunity, newStage);
  }, [moveStage]);

  const opportunityListContent = (
    <div className="space-y-6">
      {error && <ErrorAlert error={error} onClose={() => setError(null)} />}

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-lg font-semibold text-gray-800">🔍 Filtros e Busca</h3>
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={'md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ' +
              (showMobileFilters ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-300')}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por cliente, oportunidade ou produto..." style={{fontSize: "16px"}}
                value={filters.searchTerm}
                onChange={(e) => filters.setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className={(showMobileFilters ? '' : 'hidden') + ' md:block'}>
            <select
              value={filters.filterStage}
              onChange={(e) => filters.setFilterStage(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">📊 Todas as etapas</option>
              {stages.slice(0, 5).map(stage => (
                <option key={stage.id} value={stage.id.toString()}>
                  {stage.name} ({stage.probability}%)
                </option>
              ))}
            </select>
          </div>
          <div className={(showMobileFilters ? '' : 'hidden') + ' md:block'}>
            <select
              value={filters.filterVendor}
              onChange={(e) => filters.setFilterVendor(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={!currentVendorInfo?.is_admin}
            >
              <option value="all">👥 Todos vendedores</option>
              {vendors.map(vendor => (
                <option key={vendor.name} value={vendor.name}>
                  {vendor.name} {vendor.role && `(${vendor.role})`}
                </option>
              ))}
            </select>
          </div>
          <div className={(showMobileFilters ? '' : 'hidden') + ' md:block'}>
            <select
              value={filters.filterInactivity}
              onChange={(e) => filters.setFilterInactivity(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">⏰ Todas atividades</option>
              <option value="7days">🟡 +7 dias sem movimento</option>
              <option value="30days">🔴 +30 dias sem movimento</option>
            </select>
          </div>
          <div className={(showMobileFilters ? '' : 'hidden') + ' md:block'}>
            <select
              value={filters.filterProductLine}
              onChange={(e) => filters.setFilterProductLine(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">📦 Todas as linhas</option>
              {Object.entries(PRODUCT_LINES).map(([key, pl]) => (
                <option key={key} value={key}>{pl.icon} {pl.label}</option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={() => setShowNewOpportunity(true)}
              className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 font-bold transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nova Oportunidade
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {filteredOpportunities.map(opportunity => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              isSelected={selectedOpportunity?.id === opportunity.id}
              onEdit={handleEditOpportunity}
              onAnalyze={openAssistantWithOpportunity}
              onMoveStage={handleMoveStage}
            />
          ))}
          {filteredOpportunities.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border">
              <Factory className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma oportunidade encontrada</h3>
              <p className="text-gray-600 mb-6">Ajuste os filtros ou adicione uma nova oportunidade Ventapel</p>
              <button
                onClick={() => setShowNewOpportunity(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 transition-colors font-bold"
              >
                ➕ Adicionar Oportunidade
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-50">
      <div className="sticky top-0 z-40 bg-white">
      <header className="bg-white shadow-sm border-b border-blue-200">
        <div className="mx-auto px-3 sm:px-6 lg:px-10">
          <div className="flex justify-between items-center py-2 sm:py-3">
            <div className="flex items-center min-w-0">
              <div className="p-2 sm:p-3 bg-gradient-to-r from-blue-600 to-green-600 rounded-xl flex-shrink-0">
                <Factory className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="ml-3 sm:ml-4 min-w-0">
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent truncate">
                  CRM VENTAPEL - Pepito
                </h1>
                <p className="hidden sm:block text-sm text-gray-600">Metodologia PPVVCC - Gestão Completa de Oportunidades</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 bg-blue-50 border border-blue-200 rounded-lg max-w-[38vw] sm:max-w-none">
                  <User className="w-4 h-4 text-blue-600 mr-1.5 sm:mr-2 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-blue-800 truncate">
                    {currentUser} {currentVendorInfo?.role && `(${currentVendorInfo.role})`}
                  </span>
                  {currentVendorInfo?.is_admin && (
                    <span className="hidden sm:inline ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">Admin</span>
                  )}
                </div>
                <button
                  onClick={logout}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-sm font-medium text-blue-600">🌎 ventapel.com.br</p>
                <div className="flex items-center text-xs text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  {currentUser ? `${currentUser} online` : 'Online'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs superiores — só desktop; no celular a navegação fica na barra inferior */}
      <nav className="hidden md:block bg-white shadow-sm border-b border-gray-200">
        <div className="mx-auto px-6 lg:px-10">
          <div className="flex space-x-4 lg:space-x-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={'py-3 px-3 border-b-2 font-bold text-base flex items-center ' + (activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('opportunities')}
              className={'py-3 px-3 border-b-2 font-bold text-base flex items-center ' + (activeTab === 'opportunities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <Target className="w-4 h-4 mr-2" />
              🎯 {currentVendorInfo?.is_admin ? 'Todas Oportunidades' : 'Minhas Oportunidades'}
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={'py-3 px-3 border-b-2 font-bold text-base flex items-center ' + (activeTab === 'activities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <Clock className="w-4 h-4 mr-2" />
              📋 Gestão de Atividades
            </button>
            <button
              onClick={() => setActiveTab('cadencia')}
              className={'py-3 px-3 border-b-2 font-bold text-base flex items-center ' + (activeTab === 'cadencia'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              📞 Cadência
            </button>
            {currentVendorInfo?.is_admin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={'py-3 px-3 border-b-2 font-bold text-base flex items-center ' + (activeTab === 'admin'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700')}
              >
                <Users className="w-4 h-4 mr-2" />
                🛡️ Gestão de Equipe
              </button>
            )}
          </div>
        </div>
      </nav>
      </div>

      <main className="mx-auto pl-3 pr-3 sm:pl-6 sm:pr-16 lg:pl-10 pt-4 sm:pt-6 pb-24 md:pb-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            metrics={metrics}
            currentVendorInfo={currentVendorInfo}
            dashboardVendorFilter={dashboardVendorFilter}
            setDashboardVendorFilter={setDashboardVendorFilter}
            selectedStageForList={selectedStageForList}
            setSelectedStageForList={setSelectedStageForList}
            onEdit={handleEditOpportunity}
            onAnalyze={openAssistantWithOpportunity}
          />
        )}
        {activeTab === 'opportunities' && opportunityListContent}
          {activeTab === 'activities' && (
          <ActivityDashboard
            supabase={supabase}
            currentUser={currentUser}
            isAdmin={currentVendorInfo?.is_admin || false}
          />
        )}
        {activeTab === 'cadencia' && (
          <CadenciaDashboard
            supabase={supabase}
            currentUser={currentUser}
            isAdmin={currentVendorInfo?.is_admin || false}
            vendors={vendors}
          />
        )}
        {activeTab === 'admin' && currentVendorInfo?.is_admin && (
          <AdminDashboard
            supabase={supabase}
            opportunities={opportunities}
            vendors={vendors}
            currentUser={currentUser}
          />
        )}

      </main>

      {/* Barra de navegação inferior — só mobile (padrão de app) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {([
            { id: 'dashboard', label: 'Painel', icon: BarChart3 },
            { id: 'opportunities', label: 'Vendas', icon: Target },
            { id: 'activities', label: 'Atividades', icon: Clock },
            { id: 'cadencia', label: 'Cadência', icon: Phone },
            ...(currentVendorInfo?.is_admin ? [{ id: 'admin', label: 'Equipe', icon: Users }] : []),
          ] as { id: string; label: string; icon: React.ElementType }[]).map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); window.scrollTo({ top: 0 }); }}
                className={'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors ' +
                  (active ? 'text-blue-600' : 'text-gray-500 active:text-gray-700')}
              >
                <Icon className={'w-5 h-5 ' + (active ? 'stroke-[2.5]' : '')} />
                <span className={'text-[10px] leading-tight ' + (active ? 'font-bold' : 'font-medium')}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showNewOpportunity && (
        <OpportunityForm
          onClose={() => setShowNewOpportunity(false)}
        />
      )}

      {editingOpportunity && (
        <OpportunityForm
          opportunity={editingOpportunity}
          onClose={() => {
            setEditingOpportunity(null);
            setSelectedOpportunity(null);
          }}
        />
      )}

      {showStageChecklist && (
        <StageChecklistModal
          key={`${showStageChecklist.opportunity.id}-${showStageChecklist.targetStage}`}
          opportunity={showStageChecklist.opportunity}
          targetStage={showStageChecklist.targetStage}
          onConfirm={moveStage}
          onClose={() => setShowStageChecklist(null)}
        />
      )}

      <AIAssistant
        currentOpportunity={selectedOpportunity || editingOpportunity}
        onOpportunityUpdate={async (updated) => {
          if (selectedOpportunity?.id === updated.id) {
            setSelectedOpportunity(updated);
          }
          if (editingOpportunity?.id === updated.id) {
            setEditingOpportunity(updated);
          }
        }}
        currentUser={currentUser}
        supabase={supabase}
        isAdmin={!!currentVendorInfo?.is_admin}
      />
    </div>
  );
};

// --- LOGIN SCREEN ---
const LoginScreen: React.FC<{ onLogin: (session: Session) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;
      if (data.session) {
        onLogin(data.session);
      }
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email ou senha incorretos'
        : err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-gradient-to-r from-blue-600 to-green-600 rounded-2xl mb-4">
            <Factory className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
            CRM VENTAPEL - Pepito
          </h1>
          <p className="text-sm text-gray-500 mt-1">Metodologia PPVVCC</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">Entrar</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@ventapel.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                  autoComplete="current-password"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-base"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">🌎 ventapel.com.br</p>
      </div>
    </div>
  );
};

// --- APP WRAPPER CON AUTH ---
const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex p-4 bg-gradient-to-r from-blue-600 to-green-600 rounded-2xl mb-4 animate-pulse">
            <Factory className="w-10 h-10 text-white" />
          </div>
          <p className="text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  return (
    <OpportunitiesProvider session={session}>
      <CRMVentapel />
    </OpportunitiesProvider>
  );
};

export default App;
