import React, { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, TrendingUp, User, Target, Eye, ShoppingCart, Edit3, Save, X, AlertCircle, BarChart3, Package, Factory, ChevronRight, Check, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp, Clock, Calendar, Users } from 'lucide-react';

const supabaseUrl = 'https://wtrbvgqxgcfjacqcndmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0cmJ2Z3F4Z2NmamFjcWNuZG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MTg4NjcsImV4cCI6MjA2OTM5NDg2N30.8PB0OjF2vvCtCCDnYCeemMSyvR51E2SAHe7slS1UyQU';

const VENDEDORES = [
  'Jordi',
  'Renata', 
  'Carlos',
  'Paulo',
  'Tomás'
];

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
  probability: number;
  expected_close?: string;
  product?: string;
  power_sponsor?: string;
  sponsor?: string;
  influencer?: string;
  support_contact?: string;
  scales: Scales;
}

const supabaseClient = {
  headers: {
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  
  async select(table: string, columns = '*'): Promise<Opportunity[]> {
    try {
      const url = supabaseUrl + '/rest/v1/' + table + '?select=' + columns;
      const response = await fetch(url, {
        headers: this.headers
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Error ' + response.status + ': ' + response.statusText + ' - ' + errorText);
      }
      
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error in select:', error);
      throw error;
    }
  },
  
  async insert(table: string, data: any): Promise<Opportunity[]> {
    try {
      const url = supabaseUrl + '/rest/v1/' + table;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Error ' + response.status + ': ' + response.statusText + ' - ' + errorText);
      }
      
      const result = await response.json();
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      console.error('Error in insert:', error);
      throw error;
    }
  },

  async update(table: string, id: number, data: any): Promise<Opportunity[]> {
    try {
      const url = supabaseUrl + '/rest/v1/' + table + '?id=eq.' + id;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Error ' + response.status + ': ' + response.statusText + ' - ' + errorText);
      }
      
      const text = await response.text();
      if (!text) {
        return [];
      }
      
      const result = JSON.parse(text);
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  },

  async delete(table: string, id: number): Promise<void> {
    try {
      const url = supabaseUrl + '/rest/v1/' + table + '?id=eq.' + id;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.headers
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error('Error ' + response.status + ': ' + response.statusText + ' - ' + errorText);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }
};

// Definiciones de las escalas con niveles detallados
const scaleDefinitions = {
  dor: [
    { level: 0, text: "Não há identificação de necessidade ou dor pelo cliente" },
    { level: 1, text: "Vendedor assume necessidades do cliente" },
    { level: 2, text: "Pessoa de Contato admite necessidade" },
    { level: 3, text: "Pessoa de Contato admite razões e sintomas causadores de dor" },
    { level: 4, text: "Pessoa de Contato admite dor" },
    { level: 5, text: "Vendedor documenta dor e Pessoa de Contato concorda" },
    { level: 6, text: "Pessoa de Contato e outros necessidades do Tomador de Decisão" },
    { level: 7, text: "Tomador de Decisão admite necessidades" },
    { level: 8, text: "Tomador de Decisão admite razões e sintomas causadores de dor" },
    { level: 9, text: "Tomador de Decisão admite dor" },
    { level: 10, text: "Vendedor documenta dor e Power concorda" }
  ],
  poder: [
    { level: 0, text: "Tomador de Decisão não foi identificado ainda" },
    { level: 1, text: "Processo de decisão revelado por Pessoa de Contato" },
    { level: 2, text: "Tomador de Decisão Potencial identificado" },
    { level: 3, text: "Pedido de acesso a Tomador de Decisão concedido por Pessoa de Contato" },
    { level: 4, text: "Tomador de Decisão acessado" },
    { level: 5, text: "Tomador de Decisão concorda em explorar oportunidade" },
    { level: 6, text: "Processo de decisão e compra confirmado pelo Tomador de Decisão" },
    { level: 7, text: "Tomador de Decisão concorda em fazer uma Prova de Valor" },
    { level: 8, text: "Tomador de Decisão concorda com conteúdo da proposta" },
    { level: 9, text: "Tomador de Decisão confirma aprovação verbal" },
    { level: 10, text: "Tomador de Decisão aprova formalmente internamente" }
  ],
  visao: [
    { level: 0, text: "Nenhuma visão ou visão concorrente estabelecida" },
    { level: 1, text: "Visão do Pessoa de Contato criada em termos de produto" },
    { level: 2, text: "Visão Pessoa de Contato criada em termos: Situação/Problema/Implicação" },
    { level: 3, text: "Visão diferenciada criada com Pessoa de Contato (SPI)" },
    { level: 4, text: "Visão diferenciada documentada com Pessoa de Contato" },
    { level: 5, text: "Documentação concordada por Pessoa de Contato" },
    { level: 6, text: "Visão Power criada em termos de produto" },
    { level: 7, text: "Visão Power criada em termos: Situação/Problema/Implicação" },
    { level: 8, text: "Visão diferenciada criada com Tomador de Decisão (SPIN)" },
    { level: 9, text: "Visão diferenciada documentada com Tomador de Decisão" },
    { level: 10, text: "Documentação concordada por Tomador de Decisão" }
  ],
  valor: [
    { level: 0, text: "Pessoa de Contato explora a solução, mas valor não foi identificado" },
    { level: 1, text: "Vendedor identifica proposição de valor para o negócio" },
    { level: 2, text: "Pessoa de Contato concorda em explorar a proposta de valor" },
    { level: 3, text: "Tomador de Decisão concorda em explorar a proposta de valor" },
    { level: 4, text: "Critérios para definição de valor estabelecidos com Tomador de Decisão" },
    { level: 5, text: "Valor descoberto conduzido e visão Tomador de Decisão" },
    { level: 6, text: "Análise de valor conduzida por vendedor (demo)" },
    { level: 7, text: "Análise de valor conduzida pelo Pessoa de Contato (trial)" },
    { level: 8, text: "Tomador de Decisão concorda com análise de Valor" },
    { level: 9, text: "Conclusão da análise de valor documentada pelo vendedor" },
    { level: 10, text: "Tomador de Decisão confirma por escrito conclusões da análise" }
  ],
  controle: [
    { level: 0, text: "Nenhum follow documentado de conversa com Pessoa de Contato" },
    { level: 1, text: "1a visão (SPI) enviada para Pessoa de Contato" },
    { level: 2, text: "1a visão concordada ou modificada por Pessoa de Contato (SPIN)" },
    { level: 3, text: "1a visão enviada para Tomador de Decisão (SPI)" },
    { level: 4, text: "1a visão concordada ou modificada por Tomador de Decisão (SPIN)" },
    { level: 5, text: "Vendedor recebe aprovação para explorar Valor" },
    { level: 6, text: "Plano de avaliação enviado para Tomador de Decisão" },
    { level: 7, text: "Tomador de Decisão concorda ou modifica a Avaliação" },
    { level: 8, text: "Plano de Avaliação conduzido (quando aplicável)" },
    { level: 9, text: "Resultado da Avaliação aprovado pelo Tomador de Decisão" },
    { level: 10, text: "Tomador de Decisão aprova proposta para negociação final" }
  ],
  compras: [
    { level: 0, text: "Processo de compras desconhecido" },
    { level: 1, text: "Processo de compras esclarecido pela pessoa de contato" },
    { level: 2, text: "Processo de compras confirmado pelo Tomador de Decisão" },
    { level: 3, text: "Condições comerciais validadas com o cliente" },
    { level: 4, text: "Proposta apresentada para o cliente" },
    { level: 5, text: "Processo de negociação iniciado com departamento de compras" },
    { level: 6, text: "Condições comerciais aprovadas e formalizadas" },
    { level: 7, text: "Contrato assinado" },
    { level: 8, text: "Pedido de compras recebido" },
    { level: 9, text: "Cobrança emitida" },
    { level: 10, text: "Pagamento realizado" }
  ]
};

const CRMVentapel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [filterInactivity, setFilterInactivity] = useState('all');
  const [dashboardVendorFilter, setDashboardVendorFilter] = useState('all');
  const [selectedStageForList, setSelectedStageForList] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStageChecklist, setShowStageChecklist] = useState<{opportunity: Opportunity, targetStage: number} | null>(null);

  const stages = [
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
      probability: 75, 
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
      probability: 90, 
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

  const createEmptyScales = (): Scales => ({
    dor: { score: 0, description: '' },
    poder: { score: 0, description: '' },
    visao: { score: 0, description: '' },
    valor: { score: 0, description: '' },
    controle: { score: 0, description: '' },
    compras: { score: 0, description: '' }
  });

  const loadOpportunities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await supabaseClient.select('opportunities');
      console.log('Dados carregados:', data);
      
      const validatedData = data.map(opp => ({
        ...opp,
        scales: opp.scales || createEmptyScales(),
        value: Number(opp.value) || 0,
        probability: Number(opp.probability) || 0
      }));
      
      setOpportunities(validatedData);
    } catch (error) {
      console.error('Erro ao carregar oportunidades:', error);
      setError('Erro ao carregar oportunidades. Tente novamente.');
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  };

  const createOpportunity = async (opportunityData: any): Promise<boolean> => {
    try {
      setError(null);
      
      const newOpportunity = {
        name: opportunityData.name.trim(),
        client: opportunityData.client.trim(),
        vendor: opportunityData.vendor,
        value: parseFloat(opportunityData.value) || 0,
        stage: parseInt(opportunityData.stage) || 1,
        priority: opportunityData.priority || 'média',
        expected_close: opportunityData.expectedClose || null,
        next_action: opportunityData.nextAction?.trim() || null,
        product: opportunityData.product?.trim() || null,
        power_sponsor: opportunityData.powerSponsor?.trim() || null,
        sponsor: opportunityData.sponsor?.trim() || null,
        influencer: opportunityData.influencer?.trim() || null,
        support_contact: opportunityData.supportContact?.trim() || null,
        probability: stages.find(s => s.id === parseInt(opportunityData.stage))?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: opportunityData.scales || createEmptyScales()
      };

      console.log('Criando oportunidade:', newOpportunity);
      
      const result = await supabaseClient.insert('opportunities', newOpportunity);
      console.log('Oportunidade criada:', result);
      
      await loadOpportunities();
      return true;
    } catch (error) {
      console.error('Erro ao criar oportunidade:', error);
      setError('Erro ao criar oportunidade. Verifique os dados e tente novamente.');
      return false;
    }
  };

  const updateOpportunity = async (opportunityData: any): Promise<boolean> => {
    try {
      setError(null);
      
      if (!opportunityData.id) {
        throw new Error('ID da oportunidade não encontrado');
      }
      
      const updatedData = {
        name: opportunityData.name.trim(),
        client: opportunityData.client.trim(),
        vendor: opportunityData.vendor,
        value: parseFloat(opportunityData.value) || 0,
        stage: parseInt(opportunityData.stage) || 1,
        priority: opportunityData.priority || 'média',
        expected_close: opportunityData.expectedClose || null,
        next_action: opportunityData.nextAction?.trim() || null,
        product: opportunityData.product?.trim() || null,
        power_sponsor: opportunityData.powerSponsor?.trim() || null,
        sponsor: opportunityData.sponsor?.trim() || null,
        influencer: opportunityData.influencer?.trim() || null,
        support_contact: opportunityData.supportContact?.trim() || null,
        probability: stages.find(s => s.id === parseInt(opportunityData.stage))?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: opportunityData.scales || createEmptyScales()
      };

      console.log('Atualizando oportunidade ID:', opportunityData.id, 'com dados:', updatedData);
      
      const result = await supabaseClient.update('opportunities', opportunityData.id, updatedData);
      console.log('Oportunidade atualizada:', result);
      
      await loadOpportunities();
      return true;
    } catch (error) {
      console.error('Erro ao atualizar oportunidade:', error);
      setError('Erro ao atualizar oportunidade. Tente novamente.');
      return false;
    }
  };

  const deleteOpportunity = async (id: number): Promise<void> => {
    if (!confirm('Tem certeza que deseja deletar esta oportunidade?')) {
      return;
    }

    try {
      setError(null);
      console.log('Deletando oportunidade ID:', id);
      
      await supabaseClient.delete('opportunities', id);
      
      setOpportunities(prev => prev.filter(opp => opp.id !== id));
      
    } catch (error) {
      console.error('Erro ao deletar oportunidade:', error);
      setError('Erro ao deletar oportunidade. Tente novamente.');
      await loadOpportunities();
    }
  };

  const moveStage = async (opportunity: Opportunity, newStage: number): Promise<void> => {
    const stage = stages.find(s => s.id === newStage);
    if (!stage) {
      console.error('Estágio não encontrado:', newStage);
      return;
    }

    // Se está avançando, mostrar checklist
    if (newStage > opportunity.stage) {
      setShowStageChecklist({ opportunity, targetStage: newStage });
      return;
    }

    // Se está voltando, permitir diretamente
    try {
      setError(null);
      
      const updatedData = {
        stage: newStage,
        probability: stage.probability,
        last_update: new Date().toISOString().split('T')[0]
      };

      console.log('Movendo estágio da oportunidade ID:', opportunity.id, 'para estágio:', newStage);
      
      await supabaseClient.update('opportunities', opportunity.id, updatedData);
      
      setOpportunities(prev => prev.map(opp => 
        opp.id === opportunity.id 
          ? { ...opp, stage: newStage, probability: stage.probability, last_update: updatedData.last_update }
          : opp
      ));
      
    } catch (error) {
      console.error('Erro ao mover estágio:', error);
      setError('Erro ao atualizar estágio. Tente novamente.');
      await loadOpportunities();
    }
  };

  const checkStageRequirements = (opportunity: Opportunity, stageId: number): boolean => {
    if (!opportunity.scales) return false;

    switch (stageId) {
      case 2:
        return opportunity.scales.dor.score >= 5 && opportunity.scales.poder.score >= 4;
      case 3:
        return opportunity.scales.visao.score >= 5;
      case 4:
        return opportunity.scales.valor.score >= 6;
      case 5:
        return opportunity.scales.controle.score >= 7 && opportunity.scales.compras.score >= 6;
      default:
        return true;
    }
  };

  const checkInactivity = (lastUpdate: string, days: number): boolean => {
    const lastUpdateDate = new Date(lastUpdate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - lastUpdateDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= days;
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = opp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         opp.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (opp.product && opp.product.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStage = filterStage === 'all' || opp.stage.toString() === filterStage;
    const matchesVendor = filterVendor === 'all' || opp.vendor === filterVendor;
    
    let matchesInactivity = true;
    if (filterInactivity === '7days') {
      matchesInactivity = checkInactivity(opp.last_update, 7);
    } else if (filterInactivity === '30days') {
      matchesInactivity = checkInactivity(opp.last_update, 30);
    }
    
    return matchesSearch && matchesStage && matchesVendor && matchesInactivity;
  });

  const getFilteredOpportunitiesForDashboard = () => {
    if (dashboardVendorFilter === 'all') return opportunities;
    return opportunities.filter(opp => opp.vendor === dashboardVendorFilter);
  };

  const dashboardOpportunities = getFilteredOpportunitiesForDashboard();

  const metrics = {
    totalValue: dashboardOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0),
    weightedValue: dashboardOpportunities.reduce((sum, opp) => sum + ((opp.value || 0) * (opp.probability || 0) / 100), 0),
    totalOpportunities: dashboardOpportunities.length,
    avgScore: dashboardOpportunities.length > 0 ? 
      dashboardOpportunities.reduce((sum, opp) => {
        if (!opp.scales) return sum;
        const scaleScores = Object.values(opp.scales).map(s => s.score || 0);
        const avgOppScore = scaleScores.reduce((a, b) => a + b, 0) / scaleScores.length;
        return sum + avgOppScore;
      }, 0) / dashboardOpportunities.length : 0,
    avgProbability: dashboardOpportunities.length > 0 ?
      dashboardOpportunities.reduce((sum, opp) => sum + (opp.probability || 0), 0) / dashboardOpportunities.length : 0,
    stageDistribution: stages.map(stage => ({
      ...stage,
      count: dashboardOpportunities.filter(opp => opp.stage === stage.id).length,
      value: dashboardOpportunities.filter(opp => opp.stage === stage.id).reduce((sum, opp) => sum + (opp.value || 0), 0),
      weightedValue: dashboardOpportunities.filter(opp => opp.stage === stage.id).reduce((sum, opp) => sum + ((opp.value || 0) * (opp.probability || 0) / 100), 0),
      opportunities: dashboardOpportunities.filter(opp => opp.stage === stage.id)
    }))
  };

  const Dashboard = () => (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-6 rounded-xl shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">🎯 CRM Ventapel Brasil</h2>
            <p className="text-blue-100">Sistema de Vendas Consultivas - Metodologia PPVVCC</p>
            <p className="text-blue-100 text-sm">🔗 Conectado ao Supabase</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">R$ {metrics.totalValue.toLocaleString('pt-BR')}</div>
            <div className="text-blue-100">Pipeline Total</div>
            <div className="text-lg font-semibold text-yellow-300 mt-1">
              R$ {metrics.weightedValue.toLocaleString('pt-BR')} ponderado
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl shadow-sm border border-green-200">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-700">Pipeline Total</p>
              <p className="text-2xl font-bold text-green-800">
                R$ {metrics.totalValue.toLocaleString('pt-BR')}
              </p>
              <p className="text-sm text-green-600">
                Ponderado: R$ {metrics.weightedValue.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-xl shadow-sm border border-blue-200">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Target className="w-8 h-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-700">Oportunidades</p>
              <p className="text-2xl font-bold text-blue-800">{metrics.totalOpportunities}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl shadow-sm border border-purple-200">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-lg">
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-700">Score PPVVCC</p>
              <p className="text-2xl font-bold text-purple-800">{metrics.avgScore.toFixed(1)}/10</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-6 rounded-xl shadow-sm border border-orange-200">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-lg">
              <TrendingUp className="w-8 h-8 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-orange-700">Prob. Média</p>
              <p className="text-2xl font-bold text-orange-800">{metrics.avgProbability.toFixed(0)}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-800">📊 Funil de Vendas</h3>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Filtrar por vendedor:</label>
            <select
              value={dashboardVendorFilter}
              onChange={(e) => setDashboardVendorFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">👥 Todos vendedores</option>
              {VENDEDORES.map(vendor => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="space-y-4">
          {metrics.stageDistribution.slice(0, 5).map(stage => (
            <div key={stage.id}>
              <div 
                className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                onClick={() => setSelectedStageForList(selectedStageForList === stage.id ? null : stage.id)}
              >
                <div className="w-32 text-sm font-medium text-gray-700">{stage.name}</div>
                <div className="flex-1 mx-6">
                  <div className="bg-gray-200 rounded-full h-8 relative">
                    <div 
                      className={stage.color + ' h-8 rounded-full transition-all duration-500'}
                      style={{ width: Math.max((stage.count / Math.max(...metrics.stageDistribution.map(s => s.count), 1)) * 100, 5) + '%' }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
                      {stage.count > 0 && stage.count + ' oportunidades'}
                    </div>
                  </div>
                </div>
                <div className="w-20 text-sm text-gray-600 text-center">{stage.count}</div>
                <div className="w-40 text-sm font-medium text-right text-gray-800">
                  R$ {stage.value.toLocaleString('pt-BR')}
                </div>
                <div className="w-40 text-sm text-right text-gray-600">
                  Pond: R$ {stage.weightedValue.toLocaleString('pt-BR')}
                </div>
                <ChevronDown className={'w-5 h-5 ml-4 text-gray-400 transition-transform ' + (selectedStageForList === stage.id ? 'rotate-180' : '')} />
              </div>
              
              {selectedStageForList === stage.id && stage.opportunities.length > 0 && (
                <div className="mt-4 ml-8 mr-8 p-4 bg-gray-50 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-gray-200">
                        <th className="pb-2 font-medium text-gray-700">Oportunidade</th>
                        <th className="pb-2 font-medium text-gray-700">Cliente</th>
                        <th className="pb-2 font-medium text-gray-700">Vendedor</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Valor</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Prob.</th>
                        <th className="pb-2 font-medium text-gray-700 text-right">Valor Pond.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage.opportunities.map(opp => (
                        <tr key={opp.id} className="border-b border-gray-100">
                          <td className="py-2">{opp.name}</td>
                          <td className="py-2">{opp.client}</td>
                          <td className="py-2">{opp.vendor}</td>
                          <td className="py-2 text-right">R$ {opp.value.toLocaleString('pt-BR')}</td>
                          <td className="py-2 text-right">{opp.probability}%</td>
                          <td className="py-2 text-right font-medium">
                            R$ {(opp.value * opp.probability / 100).toLocaleString('pt-BR')}
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

  const OpportunityCard: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
    const stage = stages.find(s => s.id === opportunity.stage);
    const nextStage = stages.find(s => s.id === opportunity.stage + 1);
    const prevStage = stages.find(s => s.id === opportunity.stage - 1);
    const avgScore = opportunity.scales ? 
      Object.values(opportunity.scales).reduce((sum, scale) => sum + (scale.score || 0), 0) / 6 : 0;

    const canAdvance = nextStage && checkStageRequirements(opportunity, opportunity.stage);
    const isInactive7Days = checkInactivity(opportunity.last_update, 7);
    const isInactive30Days = checkInactivity(opportunity.last_update, 30);

    return (
      <div className={'bg-white rounded-xl shadow-sm border p-6 hover:shadow-lg transition-all ' + 
        (isInactive30Days ? 'border-red-300 bg-red-50' : isInactive7Days ? 'border-yellow-300 bg-yellow-50' : '')}>
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{opportunity.name}</h3>
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
              <button
                onClick={() => setEditingOpportunity(opportunity)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteOpportunity(opportunity.id)}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-blue-600">{opportunity.client}</p>
              <p className="text-sm text-gray-600">👤 {opportunity.vendor}</p>
              <p className="text-sm text-purple-600">📦 {opportunity.product}</p>
              {opportunity.expected_close && (
                <p className="text-sm text-gray-600">📅 Fechamento: {new Date(opportunity.expected_close).toLocaleDateString('pt-BR')}</p>
              )}
            </div>
            {opportunity.next_action && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">📅 <strong>Próxima ação:</strong> {opportunity.next_action}</p>
              </div>
            )}
            <div className="mt-2 text-xs text-gray-500">
              Última atualização: {new Date(opportunity.last_update).toLocaleDateString('pt-BR')}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600 mb-2">
              R$ {(opportunity.value || 0).toLocaleString('pt-BR')}
            </p>
            <span className={'inline-block px-4 py-2 rounded-full text-sm font-bold text-white ' + (stage?.color || '') + ' mb-2'}>
              {stage?.name} ({opportunity.probability || 0}%)
            </span>
            <p className="text-sm text-gray-600 font-medium">
              Ponderado: R$ {((opportunity.value || 0) * (opportunity.probability || 0) / 100).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-700">🎯 Gestão de Estágio</h4>
            <div className="flex space-x-2">
              {prevStage && (
                <button
                  onClick={() => moveStage(opportunity, prevStage.id)}
                  className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  ← {prevStage.name}
                </button>
              )}
              {nextStage && (
                <button
                  onClick={() => moveStage(opportunity, nextStage.id)}
                  className={'px-3 py-1 text-xs rounded-md transition-colors flex items-center ' + (canAdvance 
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
            <span className="text-sm font-bold text-gray-700">📊 Score PPVVCC Geral</span>
            <span className="text-lg font-bold text-gray-900">{avgScore.toFixed(1)}/10</span>
          </div>
          <div className="bg-gray-200 rounded-full h-4 mb-4">
            <div 
              className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-4 rounded-full transition-all duration-500"
              style={{ width: (avgScore / 10) * 100 + '%' }}
            ></div>
          </div>
          
          {opportunity.scales && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {scales.map(scale => {
                const Icon = scale.icon;
                const scaleData = opportunity.scales[scale.id as keyof Scales] || { score: 0, description: '' };
                return (
                  <div key={scale.id} className={scale.bgColor + ' ' + scale.borderColor + ' border-2 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all'}
                       onClick={() => setEditingOpportunity(opportunity)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center">
                        <Icon className={'w-4 h-4 mr-2 ' + scale.color} />
                        <span className="text-xs font-bold">{scale.name}</span>
                      </div>
                      <span className="text-lg font-bold text-gray-800">{scaleData.score}</span>
                    </div>
                    {scaleData.description && (
                      <p className="text-xs text-gray-600 mt-1">{scaleData.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Seção de Contatos */}
        <div className="border-t pt-4">
          <h4 className="font-semibold text-gray-700 mb-3">👥 Contatos Principais</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
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
      </div>
    );
  };

  const OpportunityList = () => (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">🔍 Filtros e Busca</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por cliente, oportunidade ou produto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
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
          <div>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">👥 Todos vendedores</option>
              {VENDEDORES.map(vendor => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterInactivity}
              onChange={(e) => setFilterInactivity(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">⏰ Todas atividades</option>
              <option value="7days">🟡 +7 dias sem movimento</option>
              <option value="30days">🔴 +30 dias sem movimento</option>
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
        <div className="text-center py-12 bg-white rounded-xl border">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando oportunidades...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredOpportunities.map(opportunity => (
            <OpportunityCard key={opportunity.id} opportunity={opportunity} />
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

  interface OpportunityFormProps {
    opportunity?: Opportunity | null;
    onClose: () => void;
  }

  const OpportunityForm: React.FC<OpportunityFormProps> = ({ opportunity, onClose }) => {
    const [formData, setFormData] = useState({
      id: opportunity?.id || 0,
      name: opportunity?.name || '',
      client: opportunity?.client || '',
      vendor: opportunity?.vendor || VENDEDORES[0],
      value: opportunity?.value?.toString() || '',
      stage: opportunity?.stage || 1,
      priority: opportunity?.priority || 'média',
      expectedClose: opportunity?.expected_close || '',
      nextAction: opportunity?.next_action || '',
      product: opportunity?.product || '',
      powerSponsor: opportunity?.power_sponsor || '',
      sponsor: opportunity?.sponsor || '',
      influencer: opportunity?.influencer || '',
      supportContact: opportunity?.support_contact || '',
      scales: opportunity?.scales || createEmptyScales()
    });

    const [activeScale, setActiveScale] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [showScaleSelector, setShowScaleSelector] = useState<string | null>(null);

    const handleSubmit = async () => {
      if (!formData.name || !formData.client || !formData.vendor || !formData.value) {
        alert('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      setSubmitting(true);
      
      try {
        const success = opportunity 
          ? await updateOpportunity(formData)
          : await createOpportunity(formData);
          
        if (success) {
          onClose();
        }
      } finally {
        setSubmitting(false);
      }
    };

    const updateScale = (scaleId: string, field: 'score' | 'description', value: string | number) => {
      setFormData(prev => ({
        ...prev,
        scales: {
          ...prev.scales,
          [scaleId]: {
            ...prev.scales[scaleId as keyof Scales],
            [field]: value
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-6xl w-full max-h-screen overflow-y-auto">
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">
                  {opportunity ? '✏️ Editar Oportunidade' : '➕ Nova Oportunidade'}
                </h2>
                <p className="text-gray-600 mt-1">
                  {opportunity ? 'Atualize os dados da oportunidade' : 'Adicione uma nova oportunidade ao pipeline Ventapel'}
                </p>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
                disabled={submitting}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Vendedor *</label>
                        <select
                          value={formData.vendor}
                          onChange={(e) => setFormData({...formData, vendor: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          disabled={submitting}
                        >
                          {VENDEDORES.map(vendor => (
                            <option key={vendor} value={vendor}>
                              {vendor}
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
                    <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Produto</label>
                        <input
                          type="text"
                          value={formData.product}
                          onChange={(e) => setFormData({...formData, product: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: Máquinas BP + Cinta"
                          disabled={submitting}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Fechamento Previsto</label>
                        <input
                          type="date"
                          value={formData.expectedClose}
                          onChange={(e) => setFormData({...formData, expectedClose: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Próxima Ação</label>
                      <input
                        type="text"
                        value={formData.nextAction}
                        onChange={(e) => setFormData({...formData, nextAction: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Demo técnica agendada para 15/02"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                  <h3 className="text-lg font-semibold mb-4 text-green-800">👥 Contatos Principais</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Power Sponsor</label>
                      <input
                        type="text"
                        value={formData.powerSponsor}
                        onChange={(e) => setFormData({...formData, powerSponsor: e.target.value})}
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
                        value={formData.supportContact}
                        onChange={(e) => setFormData({...formData, supportContact: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Suporte interno"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
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
                                <div className="bg-white p-3 rounded-lg">
                                  <p className="text-xs font-medium text-gray-700 mb-2">Perguntas-chave:</p>
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

            <div className="flex justify-end space-x-4 mt-8 pt-6 border-t">
              <button
                onClick={onClose}
                className="px-6 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 flex items-center transition-colors font-medium disabled:opacity-50"
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

  // Componente de Checklist para mudança de estágio
  const StageChecklistModal = () => {
    if (!showStageChecklist) return null;

    const currentStage = stages.find(s => s.id === showStageChecklist.opportunity.stage);
    const targetStage = stages.find(s => s.id === showStageChecklist.targetStage);
    
    // Inicializar todos os checkboxes como false
    const initCheckedItems = () => {
      const items: {[key: string]: boolean} = {};
      if (currentStage?.checklist) {
        Object.values(currentStage.checklist).forEach(key => {
          items[key] = false;
        });
      }
      return items;
    };
    
    const [checkedItems, setCheckedItems] = useState<{[key: string]: boolean}>(initCheckedItems);

    if (!currentStage || !targetStage) return null;

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
        setError(null);
        
        const updatedData = {
          stage: showStageChecklist.targetStage,
          probability: targetStage.probability,
          last_update: new Date().toISOString().split('T')[0]
        };

        await supabaseClient.update('opportunities', showStageChecklist.opportunity.id, updatedData);
        
        setOpportunities(prev => prev.map(opp => 
          opp.id === showStageChecklist.opportunity.id 
            ? { ...opp, stage: showStageChecklist.targetStage, probability: targetStage.probability, last_update: updatedData.last_update }
            : opp
        ));
        
        setShowStageChecklist(null);
      } catch (error) {
        console.error('Erro ao mover estágio:', error);
        setError('Erro ao atualizar estágio. Tente novamente.');
        await loadOpportunities();
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-2xl w-full">
          <div className="p-6 border-b">
            <h3 className="text-xl font-bold text-gray-900">
              ✅ Checklist para avançar para {targetStage.name}
            </h3>
            <p className="text-gray-600 mt-1">
              Complete todos os itens antes de mover a oportunidade
            </p>
          </div>

          <div className="p-6">
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2">📋 {showStageChecklist.opportunity.name}</h4>
              <p className="text-sm text-blue-700">{showStageChecklist.opportunity.client}</p>
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

          <div className="p-6 border-t flex justify-end space-x-4">
            <button
              onClick={() => setShowStageChecklist(null)}
              className="px-6 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmStageChange}
              className={'px-6 py-3 rounded-lg transition-colors flex items-center font-medium ' + 
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-50">
      <header className="bg-white shadow-lg border-b-2 border-blue-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-green-600 rounded-xl">
                <Factory className="w-8 h-8 text-white" />
              </div>
              <div className="ml-4">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                  🇧🇷 CRM Ventapel Brasil
                </h1>
                <p className="text-sm text-gray-600">Metodologia PPVVCC - Gestão Completa de Oportunidades</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-blue-600">🌐 ventapel.com.br</p>
              <div className="flex items-center text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                Online
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={'py-4 px-2 border-b-2 font-bold text-sm flex items-center ' + (activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('opportunities')}
              className={'py-4 px-2 border-b-2 font-bold text-sm flex items-center ' + (activeTab === 'opportunities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <Target className="w-4 h-4 mr-2" />
              🎯 Oportunidades
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'opportunities' && <OpportunityList />}
      </main>

      {showNewOpportunity && (
        <OpportunityForm 
          onClose={() => setShowNewOpportunity(false)} 
        />
      )}

      {editingOpportunity && (
        <OpportunityForm 
          opportunity={editingOpportunity}
          onClose={() => setEditingOpportunity(null)} 
        />
      )}

      <StageChecklistModal />
    </div>
  );
};

export default CRMVentapel;
