import React, { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, TrendingUp, User, Target, Eye, ShoppingCart, Edit3, Save, X, AlertCircle, BarChart3, Package, Factory } from 'lucide-react';

// Configuración Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtrbvgqxgcfjacqcndmb.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0cmJ2Z3F4Z2NmamFjcWNuZG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MTg4NjcsImV4cCI6MjA2OTM5NDg2N30.8PB0OjF2vvCtCCDnYCeemMSyvR51E2SAHe7slS1UyQU';

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
  
  async insert(table: string, data: any) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data)
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [loading, setLoading] = useState(true);

  const stages = [
    { id: 1, name: 'Prospecção', probability: 0, color: 'bg-gray-500' },
    { id: 2, name: 'Qualificação', probability: 20, color: 'bg-blue-500' },
    { id: 3, name: 'Apresentação', probability: 40, color: 'bg-yellow-500' },
    { id: 4, name: 'Validação/Teste', probability: 75, color: 'bg-orange-500' },
    { id: 5, name: 'Negociação', probability: 90, color: 'bg-green-500' },
    { id: 6, name: 'Fechado', probability: 100, color: 'bg-emerald-600' }
  ];

  const scales = [
    { id: 'dor', name: 'DOR', icon: AlertCircle, description: 'Dor identificada e admitida', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
    { id: 'poder', name: 'PODER', icon: User, description: 'Acesso ao decisor', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    { id: 'visao', name: 'VISÃO', icon: Eye, description: 'Visão de solução construída', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
    { id: 'valor', name: 'VALOR', icon: DollarSign, description: 'ROI/Benefícios validados', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
    { id: 'controle', name: 'CONTROLE', icon: Target, description: 'Controle do processo', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
    { id: 'compras', name: 'COMPRAS', description: 'Processo de compras', icon: ShoppingCart, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' }
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
    const avgScore = opportunity.scales ? 
      Object.values(opportunity.scales).reduce((sum, scale) => sum + (scale.score || 0), 0) / 6 : 0;

    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-lg transition-all">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-bold text-gray-900">{opportunity.name}</h3>
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
                  <div key={scale.id} className={`${scale.bgColor} ${scale.borderColor} border-2 rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center">
                        <Icon className={`w-4 h-4 mr-2 ${scale.color}`} />
                        <span className="text-xs font-bold">{scale.name}</span>
                      </div>
                      <span className="text-lg font-bold text-gray-800">{scaleData.score}</span>
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

  const NewOpportunityForm = () => {
    const [formData, setFormData] = useState({
      name: '',
      client: '',
      vendor: VENDEDORES[0], // Primer vendedor por defecto
      value: '',
      stage: 1,
      priority: 'média',
      expectedClose: '',
      nextAction: '',
      product: '',
      powerSponsor: '',
      sponsor: '',
      influencer: '',
      scales: {
        dor: { score: 0, description: '' },
        poder: { score: 0, description: '' },
        visao: { score: 0, description: '' },
        valor: { score: 0, description: '' },
        controle: { score: 0, description: '' },
        compras: { score: 0, description: '' }
      }
    });

    const handleSubmit = async () => {
      if (!formData.name || !formData.client || !formData.vendor || !formData.value) {
        alert('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      const success = await createOpportunity(formData);
      if (success) {
        setShowNewOpportunity(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-screen overflow-y-auto">
          <div className="p-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-900">➕ Nova Oportunidade</h2>
                <p className="text-gray-600 mt-1">Adicione uma nova oportunidade ao pipeline Ventapel</p>
              </div>
              <button 
                onClick={() => setShowNewOpportunity(false)}
                className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-semibold mb-4 text-blue-800">📋 Informações Básicas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <label className="block text-sm font-medium mb-2 text-gray-700">Produto</label>
                    <input
                      type="text"
                      value={formData.product}
                      onChange={(e) => setFormData({...formData, product: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Máquinas BP + Cinta"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setShowNewOpportunity(false)}
                  className="px-6 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-green-600 text-white rounded-lg hover:from-blue-700 hover:to-green-700 flex items-center transition-colors font-medium"
                >
                  <Save className="w-5 h-5 mr-2" />
                  Criar Oportunidade
                </button>
              </div>
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
                <p className="text-sm text-gray-600">Metodologia PPVVCC - Conectado ao Supabase</p>
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

      {showNewOpportunity && <NewOpportunityForm />}
    </div>
  );
};

export default CRMVentapel;
