import React, { useState, useEffect } from 'react';
import { Plus, Search, DollarSign, TrendingUp, User, Target, Eye, ShoppingCart, Edit3, Save, X, AlertCircle, BarChart3, Package, Factory, ChevronRight, Check, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp, Clock, Calendar, Users, Bell, Brain, Mail, MessageSquare } from 'lucide-react';

// Configuración de Supabase
const supabaseUrl = 'https://wtrbvgqxgcfjacqcndmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0cmJ2Z3F4Z2NmamFjcWNuZG1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MTg4NjcsImV4cCI6MjA2OTM5NDg2N30.8PB0OjF2vvCtCCDnYCeemMSyvR51E2SAHe7slS1UyQU';

const VENDEDORES = ['Jordi', 'Renata', 'Carlos', 'Paulo', 'Tomás'];

// Interfaces TypeScript
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

// Cliente Supabase
const supabaseClient = {
  headers: {
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  
  async select(table: string, columns = '*'): Promise<Opportunity[]> {
    try {
      const url = `${supabaseUrl}/rest/v1/${table}?select=${columns}`;
      const response = await fetch(url, { headers: this.headers });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
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
      const url = `${supabaseUrl}/rest/v1/${table}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
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
      const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const text = await response.text();
      if (!text) return [];
      
      const result = JSON.parse(text);
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  },

  async delete(table: string, id: number): Promise<void> {
    try {
      const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }
};

// Configuración de etapas
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

// Escalas PPVVCC
const scales = [
  { 
    id: 'dor', 
    name: 'DOR', 
    icon: AlertCircle, 
    description: 'Dor identificada e admitida', 
    color: 'text-red-600', 
    bgColor: 'bg-red-50', 
    borderColor: 'border-red-200'
  },
  { 
    id: 'poder', 
    name: 'PODER', 
    icon: User, 
    description: 'Acesso ao decisor', 
    color: 'text-blue-600', 
    bgColor: 'bg-blue-50', 
    borderColor: 'border-blue-200'
  },
  { 
    id: 'visao', 
    name: 'VISÃO', 
    icon: Eye, 
    description: 'Visão de solução construída', 
    color: 'text-purple-600', 
    bgColor: 'bg-purple-50', 
    borderColor: 'border-purple-200'
  },
  { 
    id: 'valor', 
    name: 'VALOR', 
    icon: DollarSign, 
    description: 'ROI/Benefícios validados', 
    color: 'text-green-600', 
    bgColor: 'bg-green-50', 
    borderColor: 'border-green-200'
  },
  { 
    id: 'controle', 
    name: 'CONTROLE', 
    icon: Target, 
    description: 'Controle do processo', 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-50', 
    borderColor: 'border-orange-200'
  },
  { 
    id: 'compras', 
    name: 'COMPRAS', 
    description: 'Processo de compras', 
    icon: ShoppingCart, 
    color: 'text-indigo-600', 
    bgColor: 'bg-indigo-50', 
    borderColor: 'border-indigo-200'
  }
];

// Función para crear escalas vacías
const createEmptyScales = (): Scales => ({
  dor: { score: 0, description: '' },
  poder: { score: 0, description: '' },
  visao: { score: 0, description: '' },
  valor: { score: 0, description: '' },
  controle: { score: 0, description: '' },
  compras: { score: 0, description: '' }
});

const CRMVentapel: React.FC = () => {
  // Estados principales
  const [activeTab, setActiveTab] = useState('dashboard');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [showNewOpportunity, setShowNewOpportunity] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterVendor, setFilterVendor] = useState('all');
  const [dashboardVendorFilter, setDashboardVendorFilter] = useState('all');

  // Cargar oportunidades al inicializar
  useEffect(() => {
    loadOpportunities();
  }, []);

  const loadOpportunities = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await supabaseClient.select('opportunities');
      
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
      
      await supabaseClient.insert('opportunities', newOpportunity);
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
      
      await supabaseClient.update('opportunities', opportunityData.id, updatedData);
      await loadOpportunities();
      return true;
    } catch (error) {
      console.error('Erro ao atualizar oportunidade:', error);
      setError('Erro ao atualizar oportunidade. Tente novamente.');
      return false;
    }
  };

  const deleteOpportunity = async (id: number): Promise<void> => {
    if (!window.confirm('Tem certeza que deseja deletar esta oportunidade?')) {
      return;
    }

    try {
      setError(null);
      await supabaseClient.delete('opportunities', id);
      setOpportunities(prev => prev.filter(opp => opp.id !== id));
    } catch (error) {
      console.error('Erro ao deletar oportunidade:', error);
      setError('Erro ao deletar oportunidade. Tente novamente.');
      await loadOpportunities();
    }
  };

  // Filtrar oportunidades
  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch = opp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         opp.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (opp.product && opp.product.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStage = filterStage === 'all' || opp.stage.toString() === filterStage;
    const matchesVendor = filterVendor === 'all' || opp.vendor === filterVendor;
    
    return matchesSearch && matchesStage && matchesVendor;
  });

  // Oportunidades para dashboard
  const dashboardOpportunities = dashboardVendorFilter === 'all' 
    ? opportunities 
    : opportunities.filter(opp => opp.vendor === dashboardVendorFilter);

  // Métricas
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
    stageDistribution: stages.slice(0, 5).map(stage => ({
      ...stage,
      count: dashboardOpportunities.filter(opp => opp.stage === stage.id).length,
      value: dashboardOpportunities.filter(opp => opp.stage === stage.id).reduce((sum, opp) => sum + (opp.value || 0), 0)
    }))
  };

  // Componente Dashboard
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
              <p className="text-sm font-medium text-orange-700">Filtro Ativo</p>
              <p className="text-lg font-bold text-orange-800">
                {dashboardVendorFilter === 'all' ? 'Todos' : dashboardVendorFilter}
              </p>
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
          {metrics.stageDistribution.map(stage => (
            <div key={stage.id} className="flex items-center p-2 rounded-lg">
              <div className="w-32 text-sm font-medium text-gray-700">{stage.name}</div>
              <div className="flex-1 mx-6">
                <div className="bg-gray-200 rounded-full h-8 relative">
                  <div 
                    className={`${stage.color} h-8 rounded-full transition-all duration-500`}
                    style={{ width: Math.max((stage.count / Math.max(...metrics.stageDistribution.map(s => s.count), 1)) * 100, 5) + '%' }}
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

  // Componente Card de Oportunidade
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
              {opportunity.product && (
                <p className="text-sm text-purple-600">📦 {opportunity.product}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-600 mb-2">
              R$ {(opportunity.value || 0).toLocaleString('pt-BR')}
            </p>
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold text-white ${stage?.color || ''} mb-2`}>
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
              style={{ width: (avgScore / 10) * 100 + '%' }}
            ></div>
          </div>
          
          {opportunity.scales && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {scales.map(scale => {
                const Icon = scale.icon;
                const scaleData = opportunity.scales[scale.id as keyof Scales] || { score: 0, description: '' };
                return (
                  <div key={scale.id} 
                       className={`${scale.bgColor} ${scale.borderColor} border-2 rounded-lg p-3 cursor-pointer hover:shadow-md transition-all`}
                       onClick={() => setEditingOpportunity(opportunity)}>
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

  // Componente Lista de Oportunidades
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

  // Componente Formulario de Oportunidad
  const OpportunityForm: React.FC<{ opportunity?: Opportunity | null; onClose: () => void; }> = ({ opportunity, onClose }) => {
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

    const [submitting, setSubmitting] = useState(false);

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

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-screen overflow-y-auto">
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

                      return (
                        <div key={scale.id} className={`${scale.bgColor} ${scale.borderColor} border-2 rounded-lg p-4`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <Icon className={`w-5 h-5 mr-3 ${scale.color}`} />
                              <div>
                                <span className="font-bold text-sm">{scale.name}</span>
                                <p className="text-xs text-gray-600">{scale.description}</p>
                              </div>
                            </div>
                            <span className="text-2xl font-bold">{scaleData.score}</span>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium">Score (0-10)</label>
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
                                rows={2}
                                placeholder="Descreva a situação atual..."
                                disabled={submitting}
                              />
                            </div>
                          </div>
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
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    {opportunity ? 'Atualizar' : 'Criar'} Oportunidade
                  </>
                )}
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
              className={`py-4 px-2 border-b-2 font-bold text-sm flex items-center ${activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('opportunities')}
              className={`py-4 px-2 border-b-2 font-bold text-sm flex items-center ${activeTab === 'opportunities'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
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
