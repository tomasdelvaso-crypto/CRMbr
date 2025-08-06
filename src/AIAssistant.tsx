import React, { useState, useEffect } from 'react';
import { MessageCircle, X, Send, Loader, Phone, DollarSign, Shield, Zap, Target, AlertTriangle, CheckCircle, Brain, FileText, ArrowRight, Clock, TrendingUp, XCircle, ChevronDown, Users, Sparkles } from 'lucide-react';
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

// Funciones auxiliares para llamar a las APIs
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
  // System prompt AGRESIVO para VENDER
  const salesKillerPrompt = `
${VENTAPEL_COMMERCIAL_CONTEXT}

${PPVVCC_SCORING_GUIDE || ''}

${ROI_CALCULATION_TEMPLATE || ''}

SCRIPTS DE MANEJO DE OBJECIONES:
${OBJECTION_HANDLING_SCRIPTS ? JSON.stringify(OBJECTION_HANDLING_SCRIPTS, null, 2) : ''}

CASOS DE ÉXITO PARA USAR:
${SUCCESS_STORIES_DETAILED ? JSON.stringify(SUCCESS_STORIES_DETAILED, null, 2) : ''}

🔥 INSTRUCCIONES CRÍTICAS - MODO VENDEDOR KILLER 🔥

TU ÚNICO OBJETIVO: Ayudar al vendedor a CERRAR DEALS YA.

REGLAS INQUEBRANTABLES:
1. Máximo 3-4 bullets por respuesta
2. SIEMPRE terminar con "⚡ PRÓXIMA ACCIÓN: [algo específico para hacer YA]"
3. Usar verbos de acción: "Llamá", "Enviá", "Pedí", "Cerrá", "Presioná"
4. Dar scripts EXACTOS, palabra por palabra
5. Crear URGENCIA en cada interacción
6. NO análisis largos, solo ACCIONES

FORMATO DE RESPUESTA PARA OBJECIONES:
🎯 OBJECIÓN DETECTADA: [cual es]
💬 RESPUESTA EXACTA: "[script palabra por palabra]"
📊 DATO KILLER: [caso o número que destruye la objeción]
⚡ PRÓXIMA ACCIÓN: [qué hacer inmediatamente]

FORMATO PARA CIERRE:
💰 TÉCNICA: [nombre de la técnica]
🗣️ SCRIPT: "[exactamente qué decir]"
⏰ CREAR URGENCIA: "[frase específica]"
⚡ PRÓXIMA ACCIÓN: [cerrar o siguiente paso]

LENGUAJE:
- Directo, sin vueltas (estilo Tomás)
- Argentino/Brasileño según el cliente
- Confianza total: "Esto se cierra hoy"
- Mentalidad ganadora SIEMPRE

ALERTAS PROACTIVAS:
- Si hay más de 7 días sin contacto: "🔥 ALERTA: Llamar YA o se enfría"
- Si PPVVCC > 40: "💎 MADURO PARA CIERRE - Pedir la orden HOY"
- Si DOLOR > 7: "🎯 Cliente con dolor alto - PRESIONAR para demo YA"

${system ? `\nCONTEXTO ADICIONAL: ${system}` : ''}

Ahora respondé como el mejor closer de Ventapel. Cada palabra debe empujar hacia el CIERRE.
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
          system: salesKillerPrompt
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

// Componente de Alertas de Venta
const SalesAlerts: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
  const alerts = React.useMemo(() => {
    const urgentAlerts = [];
    
    for (const opp of opportunities) {
      const totalScore = Object.values(opp.scales).reduce((sum, s) => sum + s.score, 0);
      
      // Oportunidades maduras para cerrar
      if (totalScore > 40) {
        urgentAlerts.push({
          type: 'close',
          icon: DollarSign,
          color: 'text-green-600 bg-green-100',
          message: `💎 ${opp.client} está MADURO (score ${totalScore}/60) - CERRAR YA`,
          action: `Llamar HOY y pedir la orden`
        });
      }
      
      // Alto dolor sin acción
      if (opp.scales.dor.score >= 7 && opp.scales.poder.score < 5) {
        urgentAlerts.push({
          type: 'poder',
          icon: Target,
          color: 'text-red-600 bg-red-100',
          message: `🔥 ${opp.client} tiene DOLOR alto (${opp.scales.dor.score}) pero no tenés al decisor`,
          action: `Exigir reunión con el jefe HOY`
        });
      }
      
      // Oportunidades enfriándose
      const lastUpdate = new Date(opp.expected_close || new Date());
      const daysSince = Math.floor((new Date().getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24));
      if (daysSince > 7) {
        urgentAlerts.push({
          type: 'cold',
          icon: AlertTriangle,
          color: 'text-yellow-600 bg-yellow-100',
          message: `⚠️ ${opp.client} - ${daysSince} días sin contacto - SE ENFRÍA`,
          action: `WhatsApp AHORA: "Tengo novedades importantes"`
        });
      }
    }
    
    return urgentAlerts.slice(0, 3); // Top 3 alertas
  }, [opportunities]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 p-3 bg-red-50 border-b border-red-200">
      <h4 className="font-bold text-sm text-red-800 flex items-center">
        <Zap className="w-4 h-4 mr-1 animate-pulse" />
        ACCIONES URGENTES - HACER YA
      </h4>
      {alerts.map((alert, idx) => {
        const Icon = alert.icon;
        return (
          <div key={idx} className={`p-2 rounded-lg flex items-start ${alert.color}`}>
            <Icon className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold">{alert.message}</p>
              <p className="text-xs mt-1">→ {alert.action}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Componente principal AIAssistant
const AIAssistant: React.FC<AIAssistantProps> = ({ opportunities, currentOpportunity }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Quick Actions KILLER para VENDER
  const quickActions = [
    { 
      icon: Phone, 
      label: '📞 Qué decir AHORA', 
      action: 'call_script',
      color: 'hover:bg-green-100 hover:border-green-500'
    },
    { 
      icon: DollarSign, 
      label: '💰 CERRAR este deal', 
      action: 'close_now',
      color: 'hover:bg-yellow-100 hover:border-yellow-500'
    },
    { 
      icon: Shield, 
      label: '🚫 Vencer objeción', 
      action: 'objection',
      color: 'hover:bg-red-100 hover:border-red-500'
    },
    { 
      icon: Zap, 
      label: '⚡ Crear URGENCIA', 
      action: 'urgency',
      color: 'hover:bg-orange-100 hover:border-orange-500'
    },
    { 
      icon: Target, 
      label: '🎯 Próximo paso', 
      action: 'next_step',
      color: 'hover:bg-blue-100 hover:border-blue-500'
    },
    { 
      icon: FileText, 
      label: '📧 Email que cierra', 
      action: 'email_template',
      color: 'hover:bg-purple-100 hover:border-purple-500'
    }
  ];

  // Comandos rápidos
  const quickCommands = {
    '/llamada': 'call_script',
    '/cerrar': 'close_now',
    '/objecion': 'objection',
    '/urgencia': 'urgency',
    '/siguiente': 'next_step',
    '/email': 'email_template',
    '/precio': 'price_objection',
    '/competencia': 'competition',
    '/demo': 'demo_script'
  };

  const handleQuickAction = async (action: string) => {
    if (!currentOpportunity && action !== 'general') {
      setInputMessage('⚠️ Seleccioná una oportunidad primero');
      return;
    }

    const prompts: { [key: string]: string } = {
      call_script: `Dame el script EXACTO para llamar a ${currentOpportunity?.client} AHORA.

Contexto:
- Etapa: ${currentOpportunity?.stage}
- Score DOLOR: ${currentOpportunity?.scales.dor.score}
- Score PODER: ${currentOpportunity?.scales.poder.score}
- Último contacto: ${currentOpportunity?.next_action}

Necesito:
1. Primera frase para abrir (máx 2 líneas)
2. Pregunta poderosa para crear dolor
3. Cómo pedir la reunión/demo
4. Si dice "no tengo tiempo": respuesta exacta
5. Cierre de la llamada

TODO palabra por palabra, listo para leer.`,
      
      close_now: `ESTRATEGIA PARA CERRAR ${currentOpportunity?.client} HOY.

Situación:
- Valor: R$ ${currentOpportunity?.value.toLocaleString('pt-BR')}
- Score total PPVVCC: ${Object.values(currentOpportunity?.scales || {}).reduce((sum, s) => sum + s.score, 0)}/60
- Producto: ${currentOpportunity?.product}

Dame:
1. Técnica de cierre específica a usar
2. Script EXACTO del cierre (palabra por palabra)
3. Cómo crear urgencia REAL
4. Si pide descuento: respuesta exacta
5. Si dice "lo tengo que pensar": contra-respuesta
6. Frase para sellar el deal

MODO KILLER: Este deal se cierra HOY.`,
      
      objection: `MANEJO DE OBJECIONES para ${currentOpportunity?.client}.

Top 5 objeciones probables y RESPUESTA EXACTA:

1. "Es muy caro"
   → Script completo (3 frases máximo)
   → Caso de éxito con números
   
2. "Ya tenemos proveedor"
   → Script de respuesta
   → Diferenciador KILLER
   
3. "No es el momento"
   → Crear urgencia (script exacto)
   → Costo de no actuar
   
4. "Necesito pensarlo"
   → Técnica para cerrar ahora
   → Pregunta que compromete
   
5. "No veo el ROI"
   → Números específicos
   → Garantía para ofrecer

Para cada una: QUÉ DECIR EXACTAMENTE.`,
      
      urgency: `Crear URGENCIA REAL para ${currentOpportunity?.client}.

Dame 5 formas de crear urgencia HOY:
1. Urgencia por precio (qué decir exacto)
2. Urgencia por disponibilidad 
3. Urgencia por competencia
4. Urgencia por pérdida actual
5. Urgencia por oportunidad única

Para cada una:
- Script exacto (máx 2 frases)
- Por qué funciona
- Cuándo usarla

OBJETIVO: Que firme esta semana.`,
      
      next_step: `PRÓXIMA ACCIÓN EXACTA para ${currentOpportunity?.client}.

Estado actual:
- Etapa: ${currentOpportunity?.stage}
- Scores PPVVCC: ${JSON.stringify(currentOpportunity?.scales)}
- Último contacto: ${currentOpportunity?.next_action}

Dame:
1. QUÉ hacer en las próximas 24 horas (específico)
2. A QUIÉN contactar y cómo encontrarlo
3. QUÉ decir/escribir (script exacto)
4. QUÉ documento/demo preparar
5. CÓMO asegurar la siguiente reunión
6. Plan B si no responde

SÉ ESPECÍFICO: Nada de "hacer seguimiento", quiero acciones exactas.`,
      
      email_template: `Email KILLER para ${currentOpportunity?.client}.

Necesito email listo para copiar/pegar:

OPCIÓN A - Email para conseguir reunión
- Asunto que garantiza apertura
- Cuerpo (máx 5 líneas)
- Call to action claro

OPCIÓN B - Email post-demo para cerrar
- Asunto urgente
- Recordar valor principal (1 línea)
- Crear urgencia
- Pedir la orden

OPCIÓN C - Email para reactivar (no responde)
- Asunto provocador
- Mensaje super corto
- Pregunta que obliga respuesta

Formato listo para enviar.`,

      price_objection: `OBJECIÓN DE PRECIO para ${currentOpportunity?.client}.

"Es muy caro" / "No tenemos presupuesto"

Dame:
1. SCRIPT EXACTO de respuesta (método Ventapel)
2. Cómo convertir precio en inversión
3. Caso de éxito con ROI específico
4. Cálculo de pérdida actual (números)
5. Opciones de pago/financiación disponibles
6. Pregunta de cierre post-objeción

Todo palabra por palabra, probado y efectivo.`,

      competition: `${currentOpportunity?.client} menciona COMPETIDORES.

Respuestas EXACTAS para:
1. "Estamos viendo a 3M también"
2. "El otro proveedor es más barato"
3. "Ya trabajamos con [competidor]"
4. "Vamos a comparar propuestas"

Para cada situación:
- Script de respuesta (máx 3 frases)
- Diferenciador ÚNICO de Ventapel
- Pregunta para retomar control
- Cómo evitar guerra de precios

OBJETIVO: Ganar sin bajar precio.`,

      demo_script: `DEMO PERFECTA para ${currentOpportunity?.client}.

Guión de demo que VENDE:
1. Apertura (crear expectativa) - 1 min
2. Dolor principal a atacar - 2 min
3. Solución Ventapel (solo lo relevante) - 3 min
4. Caso de éxito similar - 2 min
5. ROI específico para ellos - 2 min
6. Cierre con próximos pasos - 1 min

Para cada parte:
- Qué decir EXACTAMENTE
- Qué mostrar/demostrar
- Pregunta de confirmación

Total: 11 minutos que cierran deals.`
    };

    if (prompts[action]) {
      setInputMessage(prompts[action]);
      await handleSendMessage(prompts[action]);
    }
  };

  const handleSendMessage = async (messageText?: string) => {
    let text = messageText || inputMessage;
    
    // Chequear comandos rápidos
    const command = text.trim().toLowerCase();
    if (quickCommands[command]) {
      await handleQuickAction(quickCommands[command]);
      return;
    }

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

      // Detectar necesidad de búsqueda
      if (text.toLowerCase().includes('busca') || 
          text.toLowerCase().includes('investiga') || 
          text.toLowerCase().includes('información')) {
        
        const searchQuery = text.replace(/busca|investiga|información|sobre|empresa|la|el|de/gi, '').trim();
        
        try {
          const searchResults = await searchWeb(searchQuery + ' Brasil empresa');
          
          const searchContext = searchResults.organic?.slice(0, 3).map((result: any) => 
            `${result.title}: ${result.snippet}`
          ).join('\n\n') || 'No se encontraron resultados';

          const claudeMessages = [
            { 
              role: 'user', 
              content: `Info encontrada sobre "${searchQuery}":\n\n${searchContext}\n\nDame ACCIONES ESPECÍFICAS para venderles. ${text}` 
            }
          ];

          assistantResponse = await generateWithClaude(claudeMessages);
        } catch (error) {
          assistantResponse = '❌ Error en búsqueda. Igual te doy acciones para vender.';
        }
      } else {
        // Respuesta normal con contexto
        const opportunityContext = currentOpportunity ? `
OPORTUNIDAD ACTUAL - ${currentOpportunity.name}:
- Cliente: ${currentOpportunity.client}
- Valor: R$ ${currentOpportunity.value.toLocaleString('pt-BR')}
- Etapa: ${currentOpportunity.stage}
- Producto: ${currentOpportunity.product || 'No definido'}

SCORES PPVVCC:
- DOR: ${currentOpportunity.scales.dor.score}/10
- PODER: ${currentOpportunity.scales.poder.score}/10  
- VISÃO: ${currentOpportunity.scales.visao.score}/10
- VALOR: ${currentOpportunity.scales.valor.score}/10
- CONTROLE: ${currentOpportunity.scales.controle.score}/10
- COMPRAS: ${currentOpportunity.scales.compras.score}/10
- TOTAL: ${Object.values(currentOpportunity.scales).reduce((sum, s) => sum + s.score, 0)}/60

${Object.values(currentOpportunity.scales).reduce((sum, s) => sum + s.score, 0) > 40 ? 
  '🔥 ALERTA: OPORTUNIDAD MADURA - PRESIONAR PARA CIERRE' : 
  '⚠️ NECESITA TRABAJO - SUBIR SCORES BAJOS URGENTE'}
        ` : '';

        const claudeMessages = [
          { 
            role: 'user', 
            content: `${opportunityContext}\n\n${text}` 
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
        content: '❌ Error. Igual hacé esto: Llamá al cliente AHORA y pedí la reunión. No esperes.',
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
        className="fixed bottom-6 right-6 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50 flex items-center group animate-pulse hover:animate-none"
      >
        <Zap className="w-6 h-6" />
        <span className="ml-2 max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 whitespace-nowrap font-bold">
          VENDER AHORA
        </span>
        <DollarSign className="w-4 h-4 ml-2" />
      </button>

      {/* Panel del asistente */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[450px] bg-white rounded-xl shadow-2xl border-2 border-red-500 z-50 flex flex-col" style={{ height: '650px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white p-4 rounded-t-xl flex justify-between items-center">
            <div className="flex items-center">
              <DollarSign className="w-6 h-6 mr-2 animate-pulse" />
              <h3 className="font-bold text-lg">VENTAPEL SALES KILLER</h3>
              <Zap className="w-5 h-5 ml-2 text-yellow-300" />
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sales Alerts */}
          {opportunities.length > 0 && (
            <SalesAlerts opportunities={opportunities} />
          )}

          {/* Quick Actions GRID */}
          <div className="p-3 border-b bg-gradient-to-r from-gray-50 to-red-50">
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleQuickAction(action.action)}
                    className={`flex flex-col items-center p-2 bg-white border-2 border-gray-300 rounded-lg transition-all ${action.color} hover:scale-105`}
                  >
                    <Icon className="w-5 h-5 text-red-600 mb-1" />
                    <span className="text-xs font-bold text-gray-700">{action.label}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Comandos rápidos info */}
            <div className="mt-2 text-xs text-gray-600 text-center">
              Comandos: /llamada /cerrar /objecion /precio /demo
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-700 mt-8">
                <div className="text-4xl mb-3">💰🔥🎯</div>
                <p className="text-sm font-bold">ASISTENTE KILLER ACTIVADO</p>
                <p className="text-xs mt-2 text-red-600 font-semibold">Objetivo: CERRAR DEALS</p>
                
                <div className="mt-4 p-3 bg-white rounded-lg border-2 border-red-200">
                  <p className="text-xs font-bold text-gray-700 mb-2">LO QUE HAGO:</p>
                  <ul className="text-xs space-y-1 text-left">
                    <li>✅ Scripts exactos para llamadas</li>
                    <li>✅ Técnicas de cierre que funcionan</li>
                    <li>✅ Respuestas a TODAS las objeciones</li>
                    <li>✅ Emails que consiguen reuniones</li>
                    <li>✅ Crear urgencia real</li>
                    <li>✅ Próximos pasos específicos</li>
                  </ul>
                </div>
                
                <p className="text-xs mt-3 text-red-600 font-bold animate-pulse">
                  Seleccioná una oportunidad y VAMOS A VENDER
                </p>
              </div>
            )}
            
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white font-medium' 
                    : 'bg-white text-gray-800 border-2 border-red-200 shadow-md'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs mt-1 opacity-70">
                    {message.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white p-3 rounded-lg border-2 border-red-200 shadow-md">
                  <div className="flex items-center">
                    <Loader className="w-5 h-5 animate-spin text-red-600 mr-2" />
                    <span className="text-xs text-gray-600">Preparando estrategia killer...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t-2 border-red-200 bg-white rounded-b-xl">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                placeholder="¿Cómo cierro este deal? ¿Qué le digo?"
                className="flex-1 p-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm font-medium"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputMessage.trim()}
                className="p-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed animate-pulse hover:animate-none"
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
