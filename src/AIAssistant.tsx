import React, { useState, useCallback, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, TrendingUp, AlertTriangle, CheckCircle, Target, Lightbulb, Sparkles, ChevronRight, Brain, Activity, Globe, Building2, Search, FileText, Users, Briefcase, TrendingDown, Shield, Zap, Info } from 'lucide-react';

// Tipos
interface Opportunity {
  id: number;
  name: string;
  client: string;
  vendor: string;
  value: number;
  stage: number;
  priority: string;
  last_update: string;
  probability: number;
  product?: string;
  scales: {
    dor: { score: number; description: string };
    poder: { score: number; description: string };
    visao: { score: number; description: string };
    valor: { score: number; description: string };
    controle: { score: number; description: string };
    compras: { score: number; description: string };
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Insight {
  id: string;
  type: 'risk' | 'opportunity' | 'action' | 'success';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  opportunityId?: number;
}

interface ClientProfile {
  company: string;
  industry: string;
  size: string;
  website: string;
  technologies: string[];
  recentNews: string[];
  painPoints: string[];
  competitors: string[];
  opportunities: string[];
}

interface AIAssistantProps {
  opportunities: Opportunity[];
  currentOpportunity?: Opportunity | null;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ opportunities, currentOpportunity }) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [showInsights, setShowInsights] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'research' | 'intelligence'>('chat');
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [searchingClient, setSearchingClient] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Analisar pipeline e gerar insights ao carregar
  useEffect(() => {
    analyzeOpportunities();
  }, [opportunities]);

  const analyzeOpportunities = async () => {
    if (opportunities.length === 0) return;

    const prompt = `Analise este pipeline de vendas e identifique insights importantes:

Pipeline:
${opportunities.map(opp => `
- ${opp.name} (${opp.client}): R$ ${opp.value.toLocaleString('pt-BR')}
  Etapa: ${opp.stage}, Probabilidade: ${opp.probability}%
  Scores PPVVCC: DOR=${opp.scales.dor.score}, PODER=${opp.scales.poder.score}, 
  VISÃO=${opp.scales.visao.score}, VALOR=${opp.scales.valor.score},
  CONTROLE=${opp.scales.controle.score}, COMPRAS=${opp.scales.compras.score}
  Última atualização: ${opp.last_update}
`).join('')}

Identifique:
1. Oportunidades em risco (baixos scores, sem movimento)
2. Oportunidades prontas para avançar
3. Ações prioritárias para hoje
4. Padrões de sucesso

Responda em JSON com formato:
{
  "insights": [
    {
      "type": "risk|opportunity|action|success",
      "title": "título curto",
      "description": "descrição clara e acionável",
      "priority": "high|medium|low",
      "opportunityId": número ou null
    }
  ]
}`;

    try {
      const response = await callClaudeAPI(prompt);
      const data = JSON.parse(response);
      setInsights(data.insights);
    } catch (error) {
      console.error('Erro ao gerar insights:', error);
    }
  };

  const callClaudeAPI = async (prompt: string): Promise<string> => {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            { 
              role: "user", 
              content: `Você é um assistente de vendas especializado na metodologia PPVVCC para a Ventapel Brasil.
              Sempre responda em português do Brasil de forma direta e acionável.
              ${prompt}`
            }
          ]
        })
      });

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Erro na API:', error);
      return 'Desculpe, não consegui processar sua solicitação no momento.';
    }
  };

  const searchClientInfo = async () => {
    if (!clientSearchQuery.trim()) return;
    
    setSearchingClient(true);
    
    const prompt = `Pesquise informações sobre a empresa "${clientSearchQuery}" e crie um perfil detalhado.

Inclua:
1. Informações gerais (indústria, tamanho, localização)
2. Tecnologias que provavelmente usam
3. Notícias recentes ou mudanças importantes
4. Possíveis pontos de dor baseados na indústria
5. Principais competidores
6. Oportunidades de venda para produtos de embalagem/fechamento

Responda em JSON:
{
  "company": "nome da empresa",
  "industry": "indústria",
  "size": "tamanho estimado",
  "website": "website se conhecido",
  "technologies": ["lista de tecnologias"],
  "recentNews": ["notícias relevantes"],
  "painPoints": ["pontos de dor prováveis"],
  "competitors": ["competidores principais"],
  "opportunities": ["oportunidades de venda"]
}`;

    try {
      const response = await callClaudeAPI(prompt);
      const profile = JSON.parse(response);
      setClientProfile(profile);
    } catch (error) {
      console.error('Erro ao pesquisar cliente:', error);
    } finally {
      setSearchingClient(false);
    }
  };

  const generateSalesStrategy = async () => {
    const client = currentOpportunity?.client || clientSearchQuery;
    
    const prompt = `Gere uma estratégia de vendas personalizada para ${client}.

Contexto: Vendemos soluções de embalagem e fechamento (fitas adesivas, máquinas seladoras, etc.) para e-commerce e indústria.

${currentOpportunity ? `
Oportunidade atual:
- Etapa: ${currentOpportunity.stage}
- Scores: DOR=${currentOpportunity.scales.dor.score}, PODER=${currentOpportunity.scales.poder.score}
- Produto: ${currentOpportunity.product || 'Não especificado'}
` : ''}

Forneça:
1. Perguntas de descoberta específicas (5-7 perguntas)
2. Proposta de valor personalizada
3. Possíveis objeções e como responder
4. Estratégia para avançar na venda
5. Diferenciais competitivos relevantes`;

    setIsLoading(true);
    try {
      const response = await callClaudeAPI(prompt);
      
      const strategyMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, strategyMessage]);
      setActiveTab('chat');
    } catch (error) {
      console.error('Erro ao gerar estratégia:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Construir contexto para o Claude
    const context = currentOpportunity 
      ? `Oportunidade atual: ${currentOpportunity.name} (${currentOpportunity.client})
         Valor: R$ ${currentOpportunity.value.toLocaleString('pt-BR')}
         Etapa: ${currentOpportunity.stage}, Probabilidade: ${currentOpportunity.probability}%
         Produto: ${currentOpportunity.product || 'Não especificado'}
         Scores: DOR=${currentOpportunity.scales.dor.score}, PODER=${currentOpportunity.scales.poder.score}, 
         VISÃO=${currentOpportunity.scales.visao.score}, VALOR=${currentOpportunity.scales.valor.score},
         CONTROLE=${currentOpportunity.scales.controle.score}, COMPRAS=${currentOpportunity.scales.compras.score}`
      : `Pipeline total: ${opportunities.length} oportunidades, 
         Valor total: R$ ${opportunities.reduce((sum, opp) => sum + opp.value, 0).toLocaleString('pt-BR')}`;

    const prompt = `${context}

${clientProfile ? `
Perfil do cliente pesquisado:
- Empresa: ${clientProfile.company}
- Indústria: ${clientProfile.industry}
- Pontos de dor identificados: ${clientProfile.painPoints.join(', ')}
` : ''}

Pergunta do vendedor: ${inputMessage}

Responda de forma direta e prática, com foco em ações que o vendedor pode tomar hoje.
Se relevante, considere o contexto de vendas de soluções de embalagem e fechamento.`;

    try {
      const response = await callClaudeAPI(prompt);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'risk': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'opportunity': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'action': return <Target className="w-5 h-5 text-blue-500" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-purple-500" />;
      default: return <Lightbulb className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-red-500 bg-red-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-gray-300 bg-gray-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <>
      {/* Panel de Insights */}
      {showInsights && insights.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Brain className="w-6 h-6 text-purple-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-800">Insights do Assistente IA</h3>
              <Sparkles className="w-4 h-4 text-yellow-500 ml-2" />
            </div>
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid gap-3">
            {insights.slice(0, 5).map(insight => (
              <div
                key={insight.id}
                className={`p-4 rounded-lg border-2 ${getPriorityColor(insight.priority)} hover:shadow-md transition-shadow cursor-pointer`}
              >
                <div className="flex items-start">
                  <div className="mr-3 mt-0.5">{getInsightIcon(insight.type)}</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">{insight.title}</h4>
                    <p className="text-sm text-gray-600">{insight.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 ml-2" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-between items-center">
            <p className="text-sm text-gray-500">
              <Activity className="w-4 h-4 inline mr-1" />
              Atualizado há 5 minutos
            </p>
            <button
              onClick={analyzeOpportunities}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Atualizar análise
            </button>
          </div>
        </div>
      )}

      {/* Botão do Chat */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all flex items-center justify-center z-40"
      >
        <Bot className="w-6 h-6" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
      </button>

      {/* Chat Modal */}
      {isChatOpen && (
        <div className="fixed bottom-24 right-6 w-[480px] h-[700px] bg-white rounded-xl shadow-2xl border flex flex-col z-50">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Bot className="w-6 h-6 mr-2" />
                <div>
                  <h3 className="font-semibold">Assistente IA Ventapel</h3>
                  <p className="text-xs text-purple-100">Especialista em PPVVCC</p>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-white hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'chat' 
                    ? 'bg-white text-purple-600' 
                    : 'text-purple-100 hover:bg-purple-500'
                }`}
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Chat
              </button>
              <button
                onClick={() => setActiveTab('research')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'research' 
                    ? 'bg-white text-purple-600' 
                    : 'text-purple-100 hover:bg-purple-500'
                }`}
              >
                <Globe className="w-4 h-4 inline mr-1" />
                Pesquisa
              </button>
              <button
                onClick={() => setActiveTab('intelligence')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'intelligence' 
                    ? 'bg-white text-purple-600' 
                    : 'text-purple-100 hover:bg-purple-500'
                }`}
              >
                <Briefcase className="w-4 h-4 inline mr-1" />
                Estratégia
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                      <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Olá! Sou seu assistente de vendas.</p>
                      <p className="text-sm mt-2">Posso ajudar com:</p>
                      <div className="mt-3 space-y-2">
                        <div className="text-xs bg-purple-50 rounded-lg p-2">
                          💡 Análise de oportunidades PPVVCC
                        </div>
                        <div className="text-xs bg-blue-50 rounded-lg p-2">
                          📊 Estratégias para avançar deals
                        </div>
                        <div className="text-xs bg-green-50 rounded-lg p-2">
                          🎯 Perguntas de descoberta
                        </div>
                        <div className="text-xs bg-yellow-50 rounded-lg p-2">
                          🛡️ Como lidar com objeções
                        </div>
                      </div>
                    </div>
                  ) : (
                    messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-3 ${
                            message.role === 'user'
                              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs mt-1 opacity-70">
                            {message.timestamp.toLocaleTimeString('pt-BR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg p-3">
                        <div className="flex space-x-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Research Tab */}
            {activeTab === 'research' && (
              <div className="p-4 space-y-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                    <Search className="w-5 h-5 mr-2" />
                    Pesquisar Cliente
                  </h4>
                  <p className="text-sm text-blue-700 mb-3">
                    Descubra informações valiosas sobre seu cliente potencial
                  </p>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchClientInfo()}
                      placeholder="Nome da empresa..."
                      className="flex-1 px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={searchClientInfo}
                      disabled={searchingClient || !clientSearchQuery.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {searchingClient ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {clientProfile && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h5 className="font-semibold text-gray-800 mb-3 flex items-center">
                        <Building2 className="w-5 h-5 mr-2 text-gray-600" />
                        {clientProfile.company}
                      </h5>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Indústria:</span>
                          <p className="font-medium">{clientProfile.industry}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">Tamanho:</span>
                          <p className="font-medium">{clientProfile.size}</p>
                        </div>
                      </div>
                    </div>

                    {clientProfile.painPoints.length > 0 && (
                      <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                        <h6 className="font-semibold text-red-800 mb-2 flex items-center">
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Pontos de Dor Identificados
                        </h6>
                        <ul className="space-y-1">
                          {clientProfile.painPoints.map((pain, idx) => (
                            <li key={idx} className="text-sm text-red-700 flex items-start">
                              <span className="text-red-500 mr-2">•</span>
                              {pain}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {clientProfile.opportunities.length > 0 && (
                      <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                        <h6 className="font-semibold text-green-800 mb-2 flex items-center">
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Oportunidades de Venda
                        </h6>
                        <ul className="space-y-1">
                          {clientProfile.opportunities.map((opp, idx) => (
                            <li key={idx} className="text-sm text-green-700 flex items-start">
                              <span className="text-green-500 mr-2">✓</span>
                              {opp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {clientProfile.technologies.length > 0 && (
                      <div className="bg-purple-50 rounded-lg border border-purple-200 p-4">
                        <h6 className="font-semibold text-purple-800 mb-2 flex items-center">
                          <Zap className="w-4 h-4 mr-2" />
                          Tecnologias Utilizadas
                        </h6>
                        <div className="flex flex-wrap gap-2">
                          {clientProfile.technologies.map((tech, idx) => (
                            <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-xs">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Intelligence Tab */}
            {activeTab === 'intelligence' && (
              <div className="p-4 space-y-4">
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="font-semibold text-purple-800 mb-2 flex items-center">
                    <Briefcase className="w-5 h-5 mr-2" />
                    Inteligência Comercial
                  </h4>
                  <p className="text-sm text-purple-700 mb-4">
                    Gere estratégias personalizadas para suas oportunidades
                  </p>
                  
                  <div className="space-y-3">
                    <button
                      onClick={generateSalesStrategy}
                      disabled={isLoading}
                      className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-md transition-shadow disabled:opacity-50 text-sm font-medium"
                    >
                      <Lightbulb className="w-4 h-4 inline mr-2" />
                      Gerar Estratégia de Vendas
                    </button>
                    
                    <button
                      onClick={() => {
                        const prompt = "Quais são as melhores perguntas de descoberta para identificar necessidades de embalagem e fechamento?";
                        setInputMessage(prompt);
                        setActiveTab('chat');
                        sendMessage();
                      }}
                      className="w-full px-4 py-3 bg-white border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors text-sm font-medium"
                    >
                      <MessageSquare className="w-4 h-4 inline mr-2" />
                      Perguntas de Descoberta
                    </button>
                    
                    <button
                      onClick={() => {
                        const prompt = "Liste as principais objeções em vendas de soluções de embalagem e como respondê-las.";
                        setInputMessage(prompt);
                        setActiveTab('chat');
                        sendMessage();
                      }}
                      className="w-full px-4 py-3 bg-white border-2 border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
                    >
                      <Shield className="w-4 h-4 inline mr-2" />
                      Tratamento de Objeções
                    </button>
                  </div>
                </div>

                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <h5 className="font-semibold text-yellow-800 mb-2 flex items-center">
                    <Info className="w-4 h-4 mr-2" />
                    Dicas Rápidas
                  </h5>
                  <ul className="space-y-2 text-sm text-yellow-700">
                    <li className="flex items-start">
                      <span className="text-yellow-600 mr-2">1.</span>
                      Use o perfil do cliente para personalizar sua abordagem
                    </li>
                    <li className="flex items-start">
                      <span className="text-yellow-600 mr-2">2.</span>
                      Foque nos pontos de dor identificados na pesquisa
                    </li>
                    <li className="flex items-start">
                      <span className="text-yellow-600 mr-2">3.</span>
                      Prepare respostas para objeções comuns da indústria
                    </li>
                    <li className="flex items-start">
                      <span className="text-yellow-600 mr-2">4.</span>
                      Acompanhe os scores PPVVCC para saber quando avançar
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Input - Apenas para o tab de Chat */}
          {activeTab === 'chat' && (
            <div className="p-4 border-t">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Digite sua pergunta..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

// Componente de Health Score para cada oportunidade
export const OpportunityHealthScore: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
  const calculateHealthScore = () => {
    const scales = opportunity.scales;
    const avgScore = (scales.dor.score + scales.poder.score + scales.visao.score + 
                     scales.valor.score + scales.controle.score + scales.compras.score) / 6;
    
    // Fator de inatividade
    const lastUpdateDate = new Date(opportunity.last_update);
    const daysSinceUpdate = Math.floor((new Date().getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24));
    const inactivityPenalty = daysSinceUpdate > 7 ? (daysSinceUpdate > 30 ? 3 : 1) : 0;
    
    // Score final
    const healthScore = Math.max(0, avgScore - inactivityPenalty);
    
    return {
      score: healthScore,
      status: healthScore >= 7 ? 'healthy' : healthScore >= 5 ? 'warning' : 'critical',
      label: healthScore >= 7 ? 'Saudável' : healthScore >= 5 ? 'Atenção' : 'Crítico'
    };
  };

  const health = calculateHealthScore();
  
  const getHealthColor = () => {
    switch (health.status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getHealthColor()}`}>
      <Activity className="w-4 h-4 mr-1" />
      {health.label} ({health.score.toFixed(1)}/10)
    </div>
  );
};

export default AIAssistant;
