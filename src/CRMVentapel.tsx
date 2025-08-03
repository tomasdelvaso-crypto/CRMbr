import React, { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, TrendingUp, User, Target, Eye, ShoppingCart, Edit3, Save, X, AlertCircle, BarChart3, Package, Factory, ChevronRight, ArrowRight, Check, Clock, Trash2 } from 'lucide-react';

// Configuración Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wtrbvgqxgcfjacqcndmb.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0cmJ2Z3F4Z2NmamFjcWNuZG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MTg4NjcsImV4cCI6MjA2OTM5NDg2N30.8PB0OjF2vvCtCCDnYCeemMSyvR51E2SAHe7slS1UyQU';

// Lista de vendedores de Ventapel Brasil
const VENDEDORES = [
  'Jordi',
  'Renata', 
  'Carlos',
  'Paulo',
  'Tomás'
];

// Tipos para TypeScript
interface Scale {
  score: number;
  description: string;
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
  scales: {
    dor: Scale;
    poder: Scale;
    visao: Scale;
    valor: Scale;
    controle: Scale;
    compras: Scale;
  };
}

// Cliente Supabase simple
const supabaseClient = {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  },
  
  async select(table: string, columns = '*') {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${columns}`, {
      headers: this.headers
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },
  
 async update(table: string, id: number, data: any) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async update(table: string, id: number, data: any) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  async delete(table: string, id: number) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
};

const CRMVentapel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [loading, setLoading] = useState(true);

  const stages = [
    { 
      id: 1, 
      name: 'Prospecção', 
      probability: 0, 
      color: 'bg-gray-500',
      requirements: ['Identificar dor do cliente', 'Contato inicial estabelecido']
    },
    { 
      id: 2, 
      name: 'Qualificação', 
      probability: 20, 
      color: 'bg-blue-500',
      requirements: ['Score DOR ≥ 5', 'Score PODER ≥ 4', 'Budget confirmado']
    },
    { 
      id: 3, 
      name: 'Apresentação', 
      probability: 40, 
      color: 'bg-yellow-500',
      requirements: ['Score VISÃO ≥ 5', 'Apresentação agendada', 'Stakeholders definidos']
    },
    { 
      id: 4, 
      name: 'Validação/Teste', 
      probability: 75, 
      color: 'bg-orange-500',
      requirements: ['Score VALOR ≥ 6', 'Teste/POC executado', 'ROI validado']
    },
    { 
      id: 5, 
      name: 'Negociação', 
      probability: 90, 
      color: 'bg-green-500',
      requirements: ['Score CONTROLE ≥ 7', 'Score COMPRAS ≥ 6', 'Proposta enviada']
    },
    { 
      id: 6, 
      name: 'Fechado', 
      probability: 100, 
      color: 'bg-emerald-600',
      requirements: ['Contrato assinado', 'Pagamento processado']
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

  // Cargar datos desde Supabase
  const loadOpportunities = async () => {
    try {
      setLoading(true);
      const data = await supabaseClient.select('opportunities');
      console.log('Dados carregados:', data);
      setOpportunities(data || []);
    } catch (error) {
      console.error('Erro ao carregar oportunidades:', error);
      // Fallback con datos de ejemplo con vendedores reales
      setOpportunities([
        {
          id: 1,
          name: 'Solução BP + Cinta Amazon',
          client: 'Amazon Brasil',
          vendor: 'Jordi',
          value: 450000,
          stage: 3,
          priority: 'alta',
          created_at: '2025-01-15',
          last_update: '2025-01-21',
          next_action: 'Demo técnica agendada',
          probability: 40,
          expected_close: '2025-03-15',
          product: 'Máquinas BP + Cinta',
          power_sponsor: 'Diretor de Operações',
          sponsor: 'Gerente de Logística',
          influencer: 'Supervisor de Embalagem',
          scales: {
            dor: { score: 7, description: '15% das caixas têm violação durante transporte' },
            poder: { score: 6, description: 'Acesso ao Gerente de Logística confirmado' },
            visao: { score: 5, description: 'Cliente entende necessidade de sistema à prova de violação' },
            valor: { score: 4, description: 'ROI calculado: 64% redução custos' },
            controle: { score: 6, description: 'Plano de demo técnica acordado' },
            compras: { score: 3, description: 'Processo ainda não totalmente mapeado' }
          }
        },
        {
          id: 2,
          name: 'Sistema Fechamento Mercado Livre',
          client: 'Mercado Libre',
          vendor: 'Renata',
          value: 320000,
          stage: 2,
          priority: 'média',
          created_at: '2025-01-20',
          last_update: '2025-01-25',
          next_action: 'Reunião com stakeholders',
          probability: 20,
          expected_close: '2025-04-30',
          product: 'Sistema Fechamento Automático',
          power_sponsor: 'VP Logística',
          sponsor: 'Diretor Operações',
          influencer: 'Gerente Warehouse',
          scales: {
            dor: { score: 8, description: 'Alto volume de devoluções por violação' },
            poder: { score: 4, description: 'Ainda mapeando decisores' },
            visao: { score: 3, description: 'Cliente ainda analisando necessidades' },
            valor: { score: 2, description: 'ROI em discussão' },
            controle: { score: 5, description: 'Cronograma de reuniões definido' },
            compras: { score: 2, description: 'Processo de compras não conhecido' }
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Função para criar nova oportunidade
  const createOpportunity = async (opportunityData: any) => {
    try {
      const newOpportunity = {
        name: opportunityData.name,
        client: opportunityData.client,
        vendor: opportunityData.vendor,
        value: parseFloat(opportunityData.value),
        stage: opportunityData.stage,
        priority: opportunityData.priority,
        expected_close: opportunityData.expectedClose || null,
        next_action: opportunityData.nextAction,
        product: opportunityData.product,
        power_sponsor: opportunityData.powerSponsor,
        sponsor: opportunityData.sponsor,
        influencer: opportunityData.influencer,
        probability: stages.find(s => s.id === opportunityData.stage)?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: opportunityData.scales
      };

      const result = await supabaseClient.insert('opportunities', newOpportunity);
      console.log('Oportunidade criada:', result);
      
      await loadOpportunities();
      return true;
    } catch (error) {
      console.error('Erro ao criar oportunidade:', error);
      alert('Erro ao criar oportunidade. Tente novamente.');
      return false;
    }
  };

  // Função para atualizar oportunidade
  const updateOpportunity = async (opportunityData: any) => {
    try {
      const updatedOpportunity = {
        name: opportunityData.name,
        client: opportunityData.client,
        vendor: opportunityData.vendor,
        value: parseFloat(opportunityData.value),
        stage: opportunityData.stage,
        priority: opportunityData.priority,
        expected_close: opportunityData.expectedClose || null,
        next_action: opportunityData.nextAction,
        product: opportunityData.product,
        power_sponsor: opportunityData.powerSponsor,
        sponsor: opportunityData.sponsor,
        influencer: opportunityData.influencer,
        probability: stages.find(s => s.id === opportunityData.stage)?.probability || 0,
        last_update: new Date().toISOString().split('T')[0],
        scales: opportunityData.scales
      };

      const result = await supabaseClient.update('opportunities', opportunityData.id, updatedOpportunity);
      console.log('Oportunidade atualizada:', result);
      
      await loadOpportunities();
      return true;
    } catch (error) {
      console.error('Erro ao atualizar oportunidade:', error);
      alert('Erro ao atualizar oportunidade. Tente novamente.');
      return false;
    }
  };

  // Função para deletar oportunidade
  const deleteOpportunity = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta oportunidade?')) {
      return;
    }

    try {
      await supabaseClient.delete('opportunities', id);
      await loadOpportunities();
    } catch (error) {
      console.error('Erro ao deletar oportunidade:', error);
      alert('Erro ao deletar oportunidade. Tente novamente.');
    }
  };

  // Função para mover estágio
  const moveStage = async (opportunity: Opportunity, newStage: number) => {
    const stage = stages.find(s => s.id === newStage);
    if (!stage) return;

    // Verificar requisitos da etapa anterior
    const currentStage = stages.find(s => s.id === opportunity.stage);
    if (newStage > opportunity.stage) {
      const meetsRequirements = checkStageRequirements(opportunity, newStage - 1);
      if (!meetsRequirements) {
        alert(`Para avançar para ${stage.name}, você precisa completar os requisitos da etapa anterior.`);
        return;
      }
    }

    try {
      const updatedData = {
        stage: newStage,
        probability: stage.probability,
        last_update: new Date().toISOString().split('T')[0]
      };

      await supabaseClient.update('opportunities', opportunity.id, updatedData);
      await loadOpportunities();
    } catch (error) {
      console.error('Erro ao mover estágio:', error);
      alert('Erro ao atualizar estágio. Tente novamente.');
    }
  };

  // Verificar requisitos do estágio
  const checkStageRequirements = (opportunity: Opportunity, stageId: number): boolean => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage || !opportunity.scales) return false;

    switch (stageId) {
      case 2: // Qualificação
        return opportunity.scales.dor.score >= 5 && opportunity.scales.poder.score >= 4;
      case 3: // Apresentação  
        return opportunity.scales.visao.score >= 5;
      case 4: // Validação
        return opportunity.scales.valor.score >= 6;
      case 5: // Negociação
        return opportunity.scales.controle.score >= 7 && opportunity.scales.compras.score >= 6;
      default:
        return true;
    }
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
    return matchesSearch && matchesStage && matchesVendor;
  });

  const metrics = {
    totalValue: opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0),
    totalOpportunities: opportunities.length,
    avgScore: opportunities.length > 0 ? 
      opportunities.reduce((sum, opp) => {
        if (!opp.scales) return sum;
        const scaleScores = Object.values(opp.scales).map(s => s.score || 0);
        const avgOppScore = scaleScores.reduce((a, b) => a + b, 0) / scaleScores.length;
        return sum + avgOppScore;
      }, 0) / opportunities.length : 0,
    avgProbability: opportunities.length > 0 ?
      opportunities.reduce((sum, opp) => sum + (opp.probability || 0), 0) / opportunities.length : 0,
    stageDistribution: stages.map(stage => ({
      ...stage,
      count: opportunities.filter(opp => opp.stage === stage.id).length,
      value: opportunities.filter(opp => opp.stage === stage.id).reduce((sum, opp) => sum + (opp.value || 0), 0)
    }))
  };

  const Dashboard = () => (
    <div className="space-y-8">
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
        <h3 className="text-xl font-semibold mb-6 text-gray-800">📊 Funil de Vendas</h3>
        <div className="space-y-4">
          {metrics.stageDistribution.slice(0, 5).map(stage => (
            <div key={stage.id} className="flex items-center">
              <div className="w-32 text-sm font-medium text-gray-700">{stage.name}</div>
              <div className="flex-1 mx-6">
                <div className="bg-gray-200 rounded-full h-8 relative">
                  <div 
                    className={`h-8 rounded-full ${stage.color} transition-all duration-500`}
                    style={{ width: `${Math.max((stage.count / Math.max(...metrics.stageDistribution.map(s => s.count), 1)) * 100, 5)}%` }}
                  ></div>
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
                    {stage.count > 0 && `${stage.count} oportunidades`}
                  </div>
                </div>
              </div>
              <div className="w-20 text-sm text-gray-600 text-center">{stage.count}</div>
              <div className="w-40 text-sm font-medium text-right text-gray-800">
                R$ {stage.value.toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
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

    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-lg transition-all">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{opportunity.name}</h3>
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
            </div>
            {opportunity.next_action && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">📅 <strong>Próxima ação:</strong> {opportunity.next_action}</p>
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600 mb-2">
              R$ {(opportunity.value || 0).toLocaleString('pt-BR')}
            </p>
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold text-white ${stage?.color} mb-2`}>
              {stage?.name} ({opportunity.probability || 0}%)
            </span>
          </div>
        </div>

        {/* Controles de estágio */}
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
                  className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center ${
                    canAdvance 
                      ? 'bg-green-500 text-white hover:bg-green-600' 
                      : 'bg-red-100 text-red-600 cursor-not-allowed'
                  }`}
                  disabled={!canAdvance}
                >
                  {nextStage.name} →
                  {canAdvance ? <Check className="w-3 h-3 ml-1" /> : <X className="w-3 h-3 ml-1" />}
                </button>
              )}
            </div>
          </div>
          
          {/* Requisitos da próxima etapa */}
          {nextStage && (
            <div className="text-xs text-gray-600">
              <p className="font-medium mb-1">Requisitos para {nextStage.name}:</p>
              <ul className="space-y-1">
                {nextStage.requirements?.map((req, idx) => (
                  <li key={idx} className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      checkStageRequirements(opportunity, opportunity.stage) ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
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
              style={{ width: `${(avgScore / 10) * 100}%` }}
            ></div>
          </div>
          
          {opportunity.scales && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {scales.map(scale => {
                const Icon = scale.icon;
                const scaleData = opportunity.scales[scale.id as keyof typeof opportunity.scales] || { score: 0, description: '' };
                return (
                  <div key={scale.id} className={`${scale.bgColor} ${scale.borderColor} border-2 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all`}
                       onClick={() => setEditingOpportunity(opportunity)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center">
                        <Icon className={`w-4 h-4 mr-2 ${scale.color}`} />
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
      </div>
    );
  };

  const OpportunityList = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">🔍 Filtros e Busca</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

  const OpportunityForm = ({ opportunity, onClose }: { opportunity?: Opportunity | null, onClose: () => void }) => {
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
      scales: opportunity?.scales || {
        dor: { score: 0, description: '' },
        poder: { score: 0, description: '' },
        visao: { score: 0, description: '' },
        valor: { score: 0, description: '' },
        controle: { score: 0, description: '' },
        compras: { score: 0, description: '' }
      }
    });

    const [activeScale, setActiveScale] = useState<string | null>(null);

    const handleSubmit = async () => {
      if (!formData.name || !formData.client || !formData.vendor || !formData.value) {
        alert('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      const success = opportunity 
        ? await updateOpportunity(formData)
        : await createOpportunity(formData);
        
      if (success) {
        onClose();
      }
    };

    const updateScale = (scaleId: string, field: 'score' | 'description', value: string | number) => {
      setFormData(prev => ({
        ...prev,
        scales: {
          ...prev.scales,
          [scaleId]: {
            ...prev.scales[scaleId as keyof typeof prev.scales],
            [field]: value
          }
        }
      }));
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
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Informações básicas */}
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
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2 text-gray-700">Vendedor *</label>
                        <select
                          value={formData.vendor}
                          onChange={(e) => setFormData({...formData, vendor: e.target.value})}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                        >
                          <option value="baixa">Baixa</option>
                          <option value="média">Média</option>
                          <option value="alta">Alta</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Produto</label>
                      <input
                        type="text"
                        value={formData.product}
                        onChange={(e) => setFormData({...formData, product: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Máquinas BP + Cinta"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">Próxima Ação</label>
                      <input
                        type="text"
                        value={formData.nextAction}
                        onChange={(e) => setFormData({...formData, nextAction: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: Demo técnica agendada"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Escalas PPVVCC */}
              <div className="space-y-6">
                <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                  <h3 className="text-lg font-semibold mb-4 text-purple-800">📊 Escalas PPVVCC</h3>
                  <div className="space-y-4">
                    {scales.map(scale => {
                      const Icon = scale.icon;
                      const scaleData = formData.scales[scale.id as keyof typeof formData.scales];
                      const isActive = activeScale === scale.id;

                      return (
                        <div key={scale.id} className={`${scale.bgColor} ${scale.borderColor} border-2 rounded-lg p-4 transition-all ${isActive ? 'ring-2 ring-purple-400' : ''}`}>
                          <div 
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setActiveScale(isActive ? null : scale.id)}
                          >
                            <div className="flex items-center">
                              <Icon className={`w-5 h-5 mr-3 ${scale.color}`} />
                              <div>
                                <span className="font-bold text-sm">{scale.name}</span>
                                <p className="text-xs text-gray-600">{scale.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl font-bold">{scaleData.score}</span>
                              <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                            </div>
                          </div>

                          {isActive && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium mb-2">Score (0-10)</label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    value={scaleData.score}
                                    onChange={(e) => updateScale(scale.id, 'score', parseInt(e.target.value))}
                                    className="w-full"
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
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 flex items-center transition-colors font-medium"
              >
                <Save className="w-5 h-5 mr-2" />
                {opportunity ? 'Atualizar' : 'Criar'} Oportunidade
              </button>
            </div>
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
              className={`py-4 px-2 border-b-2 font-bold text-sm flex items-center ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`py-4 px-2 border-b-2 font-bold text-sm flex items-center ${
                activeTab === 'opportunities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
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
    </div>
  );
};

export default CRMVentapel;
