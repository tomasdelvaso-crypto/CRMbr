import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, Loader, TrendingUp, AlertTriangle, CheckCircle, Search, Lightbulb, BarChart3, Target, Sparkles, ChevronDown, ChevronUp, Brain, Zap, Shield, DollarSign, Users, Calendar, FileText, ArrowRight, Clock, Activity, Calculator, TrendingDown } from 'lucide-react';
import { VENTAPEL_COMMERCIAL_CONTEXT, PPVVCC_SCORING_GUIDE, ROI_CALCULATION_TEMPLATE, OBJECTION_HANDLING_SCRIPTS, SUCCESS_STORIES_DETAILED } from './contexts/VentapelCommercialContext';

// Interfaces
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Opportunity {
  id: number;
  name: string;
  client: string;
  vendor: string;
  value: number;
  stage: number;
  priority: string;
  probability: number;
  expected_close?: string;
  next_action?: string;
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

interface AIAssistantProps {
  opportunities: Opportunity[];
  currentOpportunity?: Opportunity | null;
}

// Funciones auxiliares para llamar a las APIs a través del proxy
const searchWeb = async (query: string): Promise<any> => {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'search',
        data: {
          q: query,
          gl: 'br',
          hl: 'pt',
          num: 10
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching web:', error);
    throw error;
  }
};

const generateWithClaude = async (messages: any[], system?: string): Promise<string> => {
  // System prompt enriquecido con el contexto comercial completo
  const enrichedSystemPrompt = `
${VENTAPEL_COMMERCIAL_CONTEXT}

${PPVVCC_SCORING_GUIDE || ''}

${ROI_CALCULATION_TEMPLATE || ''}

INFORMACIÓN ADICIONAL DE REFERENCIA:
${OBJECTION_HANDLING_SCRIPTS ? `
Scripts de manejo de objeciones disponibles:
${JSON.stringify(OBJECTION_HANDLING_SCRIPTS, null, 2)}
` : ''}

${SUCCESS_STORIES_DETAILED ? `
Casos de éxito detallados:
${JSON.stringify(SUCCESS_STORIES_DETAILED, null, 2)}
` : ''}

INSTRUCCIONES ESPECÍFICAS PARA EL ASISTENTE:

1. IDENTIDAD Y ROL:
   - Sos el asistente de ventas senior de Ventapel Brasil
   - Tenés acceso completo a toda la información comercial de la empresa
   - Tu objetivo es ayudar a cerrar negocios rentables y hacer crecer las oportunidades

2. ESTILO DE COMUNICACIÓN:
   - Directo y sin vueltas (estilo Tomás, CEO)
   - Siempre basado en datos concretos y evidencia
   - Usá portugués brasileño con clientes brasileños
   - Español rioplatense para comunicación interna
   - Profesional pero cercano y consultivo

3. AL ANALIZAR OPORTUNIDADES:
   - SIEMPRE evaluá usando la metodología PPVVCC (0-10 cada dimensión)
   - Score total <30: Oportunidad en riesgo, requiere acción urgente
   - Score 30-45: Oportunidad viable, necesita trabajo
   - Score >45: Oportunidad madura, lista para cierre
   - Relacioná cada oportunidad con casos de éxito similares
   - Calculá ROI específico basado en el volumen real o estimado

4. AL BUSCAR INFORMACIÓN DE EMPRESAS:
   - Identificá: industria, tamaño, volumen de operación
   - Buscá iniciativas de sustentabilidad publicadas
   - Identificá decisores clave en LinkedIn
   - Estimá volumen de cajas/día basado en su operación
   - Detectá qué competidor podrían estar usando
   - Sugerí el approach inicial más efectivo

5. AL GENERAR ESTRATEGIAS:
   - Usá el manual de ventas completo incluido
   - Adaptá el pitch según la industria específica
   - Incluí al menos 1 caso de éxito relevante
   - Proponé secuencia de próximos 3 pasos concretos
   - Identificá recursos necesarios (demo, piloto, visita)

6. CÁLCULOS Y MÉTRICAS:
   - Siempre mostrá números concretos
   - Usá las fórmulas de ROI incluidas
   - Compará con métricas de casos similares
   - Proyectá ahorros a 12, 24 y 36 meses

7. INFORMACIÓN CONFIDENCIAL:
   - Nunca compartir márgenes internos con clientes
   - No mencionar descuentos máximos autorizados
   - Proteger información de otros clientes

8. PRIORIDADES ESTRATÉGICAS:
   - Foco en valor, no en precio
   - Piloto gratis es nuestra herramienta clave
   - Sustentabilidad es diferenciador principal
   - Servicio técnico local es ventaja competitiva

${system ? `\nCONTEXTO ADICIONAL DEL USUARIO: ${system}` : ''}

Ahora respondé con todo el conocimiento comercial de Ventapel Brasil, como un experto senior en ventas consultivas B2B.
`;

  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'claude',
        data: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: messages,
          system: enrichedSystemPrompt
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating with Claude:', error);
    throw error;
  }
};

// Componente de Health Score
export const HealthScoreIndicator: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
  const calculateHealthScore = () => {
    if (!opportunity.scales) return 0;
    
    const weights = {
      dor: 0.2,
      poder: 0.25,
      visao: 0.15,
      valor: 0.2,
      controle: 0.1,
      compras: 0.1
    };
    
    const weightedScore = Object.entries(opportunity.scales).reduce((total, [key, value]) => {
      return total + (value.score * weights[key as keyof typeof weights]);
    }, 0);
    
    return Math.round(weightedScore);
  };

  const score = calculateHealthScore();
  const getHealthStatus = () => {
    if (score >= 7) return { text: 'Saludable', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle };
    if (score >= 4) return { text: 'Atención', color: 'text-yellow-600', bg: 'bg-yellow-100', icon: AlertTriangle };
    return { text: 'Crítico', color: 'text-red-600', bg: 'bg-red-100', icon: AlertTriangle };
  };

  const status = getHealthStatus();
  const Icon = status.icon;

  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-full ${status.bg} ${status.color}`}>
      <Icon className="w-4 h-4 mr-1" />
      <span className="font-semibold text-sm">{score}/10</span>
      <span className="ml-2 text-xs">{status.text}</span>
    </div>
  );
};

// Componente de Insights Panel
export const InsightsPanel: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
  const [expanded, setExpanded] = useState(true);

  const insights = React.useMemo(() => {
    const totalValue = opportunities.reduce((sum, opp) => sum + opp.value, 0);
    const avgProbability = opportunities.reduce((sum, opp) => sum + opp.probability, 0) / opportunities.length;
    
    const riskOpportunities = opportunities.filter(opp => {
      const avgScore = Object.values(opp.scales).reduce((sum, scale) => sum + scale.score, 0) / 6;
      return avgScore < 4;
    });

    const highValueOpps = opportunities.filter(opp => opp.value > 100000);
    
    const stuckOpps = opportunities.filter(opp => {
      const daysSinceUpdate = Math.floor((new Date().getTime() - new Date(opp.expected_close || new Date()).getTime()) / (1000 * 3600 * 24));
      return daysSinceUpdate > 30;
    });

    // Calcular score PPVVCC promedio
    const avgPPVVCC = opportunities.length > 0 ? 
      opportunities.reduce((sum, opp) => {
        const oppScore = Object.values(opp.scales).reduce((s, scale) => s + scale.score, 0) / 6;
        return sum + oppScore;
      }, 0) / opportunities.length : 0;

    return {
      totalValue,
      avgProbability,
      avgPPVVCC,
      riskCount: riskOpportunities.length,
      highValueCount: highValueOpps.length,
      stuckCount: stuckOpps.length,
      recommendations: [
        riskOpportunities.length > 0 && `⚠️ ${riskOpportunities.length} oportunidades necesitan atención urgente en PPVVCC`,
        stuckOpps.length > 0 && `🕐 ${stuckOpps.length} oportunidades están estancadas hace más de 30 días`,
        highValueOpps.length > 0 && `💎 Foco en ${highValueOpps.length} oportunidades de alto valor (>R$100k)`,
        avgProbability < 50 && '📈 La probabilidad promedio es baja. Revisar calificación de leads',
        avgPPVVCC < 5 && '🎯 Score PPVVCC promedio bajo. Necesario mejorar calificación'
      ].filter(Boolean)
    };
  }, [opportunities]);

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl shadow-lg border border-purple-200 overflow-hidden">
      <div 
        className="p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Brain className="w-5 h-5 mr-2" />
          <h3 className="font-bold">AI Insights Ventapel</h3>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </div>
      
      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-3 rounded-lg border border-purple-200">
              <div className="flex items-center text-purple-600 mb-1">
                <DollarSign className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Pipeline Total</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                R$ {(insights.totalValue / 1000000).toFixed(1)}M
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <div className="flex items-center text-blue-600 mb-1">
                <Activity className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Prob. Media</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.avgProbability.toFixed(0)}%
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-indigo-200">
              <div className="flex items-center text-indigo-600 mb-1">
                <BarChart3 className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">PPVVCC Avg</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.avgPPVVCC.toFixed(1)}/10
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-red-200">
              <div className="flex items-center text-red-600 mb-1">
                <AlertTriangle className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">En Riesgo</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.riskCount}
              </p>
            </div>
            
            <div className="bg-white p-3 rounded-lg border border-green-200">
              <div className="flex items-center text-green-600 mb-1">
                <Target className="w-4 h-4 mr-1" />
                <span className="text-xs font-medium">Alto Valor</span>
              </div>
              <p className="text-lg font-bold text-gray-800">
                {insights.highValueCount}
              </p>
            </div>
          </div>

          {insights.recommendations.length > 0 && (
            <div className="bg-white rounded-lg border border-purple-200 p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                <Lightbulb className="w-4 h-4 mr-2 text-yellow-500" />
                Recomendaciones AI - Ventapel
              </h4>
              <div className="space-y-2">
                {insights.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start">
                    <ArrowRight className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Componente principal AIAssistant
const AIAssistant: React.FC<AIAssistantProps> = ({ opportunities, currentOpportunity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInsights, setShowInsights] = useState(true);

  // Quick actions mejoradas para ventas
  const quickActions = [
    { icon: Search, label: 'Investigar empresa', action: 'search' },
    { icon: BarChart3, label: 'Análisis PPVVCC', action: 'analyze' },
    { icon: Calculator, label: 'Calcular ROI', action: 'roi' },
    { icon: Lightbulb, label: 'Estrategia cierre', action: 'strategy' },
    { icon: FileText, label: 'Generar propuesta', action: 'proposal' },
    { icon: TrendingDown, label: 'Manejo objeciones', action: 'objections' }
  ];

  const handleQuickAction = async (action: string) => {
    if (!currentOpportunity && action !== 'search') {
      setInputMessage('Por favor, selecciona una oportunidad primero');
      return;
    }

    const prompts: { [key: string]: string } = {
      search: `Investigá la empresa ${currentOpportunity?.client || 'mencionada'}. Necesito:
1. Tamaño de la empresa y volumen de operación
2. Si tienen e-commerce o operaciones logísticas importantes
3. Iniciativas de sustentabilidad publicadas
4. Identificar decisores clave (Director Operaciones, Logística, Sustentabilidad, CFO)
5. Qué solución de embalaje están usando actualmente
6. Estimar volumen de cajas/día basado en su industria y tamaño
7. Principal dolor que Ventapel puede resolver
8. Competidores que podrían estar atendiendo
9. Noticias recientes relevantes para nuestro approach`,
      
      analyze: `Realizá un análisis PPVVCC completo de la oportunidad "${currentOpportunity?.name}" con ${currentOpportunity?.client}:

Scores actuales en el CRM:
- PODER: ${currentOpportunity?.scales.poder.score}/10 - ${currentOpportunity?.scales.poder.description || 'Sin descripción'}
- DOLOR: ${currentOpportunity?.scales.dor.score}/10 - ${currentOpportunity?.scales.dor.description || 'Sin descripción'}
- VISIÓN: ${currentOpportunity?.scales.visao.score}/10 - ${currentOpportunity?.scales.visao.description || 'Sin descripción'}
- VALOR: ${currentOpportunity?.scales.valor.score}/10 - ${currentOpportunity?.scales.valor.description || 'Sin descripción'}
- CONTROL: ${currentOpportunity?.scales.controle.score}/10 - ${currentOpportunity?.scales.controle.description || 'Sin descripción'}
- COMPRAS: ${currentOpportunity?.scales.compras.score}/10 - ${currentOpportunity?.scales.compras.description || 'Sin descripción'}

Necesito:
1. Evaluación detallada de cada dimensión con justificación basada en la información disponible
2. Score total actual y semáforo (🔴 <30, 🟡 30-45, 🟢 >45)
3. Las 3 acciones prioritarias para mejorar los scores más bajos
4. Probabilidad real de cierre basada en tu análisis (no la del CRM)
5. Próximos 5 pasos específicos y tácticos
6. Riesgos principales y cómo mitigarlos
7. Caso de éxito similar que podamos referenciar`,
      
      roi: `Calculá el ROI detallado para ${currentOpportunity?.client} considerando:

Información de la oportunidad:
- Producto interesado: ${currentOpportunity?.product || 'No especificado'}
- Valor estimado: R$ ${currentOpportunity?.value.toLocaleString('pt-BR')}

Por favor calculá:
1. Volumen estimado de cajas/día para su industria
2. Inversión inicial requerida (equipos + setup + training)
3. Costo mensual actual estimado vs Ventapel
4. Ahorro en insumos (30% típico)
5. Ahorro en mano de obra (50% reducción tiempo)
6. Reducción de pérdidas por apertura (estimar %)
7. Período de payback en meses
8. VPN (Valor Presente Neto) a 3 años
9. TIR (Tasa Interna de Retorno)
10. Gráfico mes a mes del ahorro acumulado
11. Comparación con caso similar exitoso
12. Beneficios intangibles cuantificados (sustentabilidad, imagen marca, NPS)`,
      
      strategy: `Diseñá una estrategia completa de cierre para "${currentOpportunity?.name}" con ${currentOpportunity?.client}:

Contexto actual:
- Valor: R$ ${currentOpportunity?.value.toLocaleString('pt-BR')}
- Etapa: ${currentOpportunity?.stage}
- Producto: ${currentOpportunity?.product || 'No especificado'}
- Score PPVVCC total: ${Object.values(currentOpportunity?.scales || {}).reduce((sum, s) => sum + s.score, 0)}

Necesito estrategia detallada:
1. Approach específico para su industria y momento
2. Caso de éxito más relevante para compartir (con números)
3. Secuencia de las próximas 3 reuniones (objetivo, participantes, materiales)
4. Recursos necesarios (demo en planta, piloto, muestras)
5. Manejo anticipado de las 3 objeciones más probables
6. Estrategia de pricing (descuentos autorizados, condiciones)
7. Timeline realista hasta el cierre
8. Plan B si rechazan propuesta inicial
9. Cómo involucrar a otros stakeholders
10. Métricas de éxito para cada etapa`,
      
      proposal: `Generá los elementos clave para la propuesta comercial de ${currentOpportunity?.client}:

Necesito:
1. Resumen ejecutivo (3 párrafos máximo)
2. Problema identificado y cuantificado
3. Solución Ventapel propuesta específica
4. Inversión requerida y opciones de pago
5. ROI proyectado con gráficos
6. Caso de éxito relevante (1 página)
7. Diferenciadores vs competencia
8. Plan de implementación por fases
9. Garantías y SLAs ofrecidos
10. Próximos pasos y call to action
11. Anexo técnico con especificaciones

Formato: Estructura lista para armar en PowerPoint/PDF`,
      
      objections: `Analizá las objeciones potenciales para ${currentOpportunity?.client} y dame scripts de respuesta:

Contexto:
- Industria del cliente
- Producto interesado: ${currentOpportunity?.product}
- Valor: R$ ${currentOpportunity?.value.toLocaleString('pt-BR')}

Dame scripts específicos para manejar:
1. "Es muy caro" - con números y comparación TCO
2. "Ya tenemos proveedor" - diferenciación clara
3. "No es el momento" - crear urgencia
4. "Necesito aprobación corporativa" - estrategia para escalar
5. "No veo el ROI" - casos concretos y garantías
6. "El cambio es muy complejo" - plan de migración
7. "Queremos evaluar otras opciones" - por qué Ventapel ahora
8. Objeciones técnicas específicas de su industria

Para cada objeción incluí:
- Script de respuesta (máx 3 párrafos)
- Caso o dato que respalde
- Material de soporte a compartir`
    };

    if (prompts[action]) {
      setInputMessage(prompts[action]);
      await handleSendMessage(prompts[action]);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    const text = messageText || inputMessage;
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      let assistantResponse = '';

      // Detectar si necesita búsqueda web
      if (text.toLowerCase().includes('busca') || 
          text.toLowerCase().includes('investiga') || 
          text.toLowerCase().includes('información') || 
          text.toLowerCase().includes('empresa')) {
        
        const searchQuery = text.replace(/busca|investiga|información|sobre|empresa|la|el|de/gi, '').trim();
        
        try {
          const searchResults = await searchWeb(searchQuery + ' Brasil empresa');
          
          const searchContext = searchResults.organic?.slice(0, 5).map((result: any) => 
            `${result.title}: ${result.snippet}`
          ).join('\n\n') || 'No se encontraron resultados';

          const claudeMessages = [
            { 
              role: 'user', 
              content: `Contexto de búsqueda web sobre "${searchQuery}":\n\n${searchContext}\n\nBasándote en esta información y tu conocimiento de Ventapel, ${text}` 
            }
          ];

          assistantResponse = await generateWithClaude(claudeMessages);
        } catch (error) {
          assistantResponse = 'Error al buscar información. Por favor, intenta de nuevo.';
        }
      } else {
        // Análisis con contexto completo de Ventapel
        const opportunityContext = currentOpportunity ? `
CONTEXTO DE LA OPORTUNIDAD ACTUAL:
- Nombre: ${currentOpportunity.name}
- Cliente: ${currentOpportunity.client}
- Valor: R$ ${currentOpportunity.value.toLocaleString('pt-BR')}
- Etapa: ${currentOpportunity.stage}
- Producto interesado: ${currentOpportunity.product || 'No especificado'}
- Próxima acción: ${currentOpportunity.next_action || 'No definida'}
- Cierre esperado: ${currentOpportunity.expected_close || 'No definido'}

SCORES PPVVCC ACTUALES:
- DOR: ${currentOpportunity.scales.dor.score}/10 - ${currentOpportunity.scales.dor.description}
- PODER: ${currentOpportunity.scales.poder.score}/10 - ${currentOpportunity.scales.poder.description}
- VISÃO: ${currentOpportunity.scales.visao.score}/10 - ${currentOpportunity.scales.visao.description}
- VALOR: ${currentOpportunity.scales.valor.score}/10 - ${currentOpportunity.scales.valor.description}
- CONTROLE: ${currentOpportunity.scales.controle.score}/10 - ${currentOpportunity.scales.controle.description}
- COMPRAS: ${currentOpportunity.scales.compras.score}/10 - ${currentOpportunity.scales.compras.description}
- TOTAL: ${Object.values(currentOpportunity.scales).reduce((sum, s) => sum + s.score, 0)}/60
        ` : 'No hay oportunidad seleccionada.';

        const claudeMessages = [
          { 
            role: 'user', 
            content: `${opportunityContext}\n\nSolicitud: ${text}` 
          }
        ];

        assistantResponse = await generateWithClaude(claudeMessages);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 flex items-center group"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="ml-2 max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap">
          Ventapel AI Assistant
        </span>
        <Sparkles className="w-4 h-4 ml-2 animate-pulse" />
      </button>

      {/* Panel del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[450px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col" style={{ height: '650px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-xl flex justify-between items-center">
            <div className="flex items-center">
              <Brain className="w-5 h-5 mr-2" />
              <h3 className="font-bold">Ventapel AI Sales Assistant</h3>
              <Zap className="w-4 h-4 ml-2 text-yellow-300" />
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Insights Panel */}
          {showInsights && opportunities.length > 0 && (
            <div className="border-b p-3 bg-gradient-to-r from-purple-50 to-blue-50">
              <InsightsPanel opportunities={opportunities} />
            </div>
          )}

          {/* Quick Actions */}
          <div className="p-3 border-b bg-gray-50">
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.action)}
                    className="flex flex-col items-center p-2 bg-white border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-purple-600 mb-1" />
                    <span className="text-xs text-gray-700">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <img 
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='50' font-size='50' text-anchor='middle' dominant-baseline='middle'%3E📦%3C/text%3E%3C/svg%3E"
                  alt="Ventapel"
                  className="w-16 h-16 mx-auto mb-3 opacity-50"
                />
                <p className="text-sm font-semibold">¡Hola! Soy tu asistente Ventapel AI</p>
                <p className="text-xs mt-2">Tengo acceso completo a:</p>
                <ul className="text-xs mt-2 space-y-1 text-left max-w-[300px] mx-auto">
                  <li>• Manual de ventas y productos Ventapel</li>
                  <li>• Casos de éxito y testimoniales</li>
                  <li>• Calculadoras de ROI y pricing</li>
                  <li>• Scripts de manejo de objeciones</li>
                  <li>• Análisis PPVVCC avanzado</li>
                  <li>• Búsqueda de información de empresas</li>
                  <li>• Estrategias por industria</li>
                </ul>
                <p className="text-xs mt-3 text-purple-600 font-medium">
                  Seleccioná una oportunidad o hacé una pregunta
                </p>
              </div>
            )}
            
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs mt-1 opacity-70">
                    {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg border border-gray-200">
                  <Loader className="w-5 h-5 animate-spin text-purple-600" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-white rounded-b-xl">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                placeholder="Preguntá sobre productos, ROI, estrategias..."
                className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputMessage.trim()}
                className="p-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Export default
export default AIAssistant;
