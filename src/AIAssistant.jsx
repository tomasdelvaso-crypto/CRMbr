// CASO 1: Búsqueda web de empresa nueva
    if (intent === 'web_search') {
      // Extraer nombre de empresa del mensaje
      const companyMatch = messageText.match(/(?:buscar|investigar|información de|info de|busca sobre)\s+(.+?)(?:\s|$)/i);
      const companyName = companyMatch ? companyMatch[1].trim() : messageText.split(' ').slice(-1)[0];
      
      try {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `🔍 Buscando información sobre **${companyName}** en internet...` 
        }]);
        
        // Llamar al API con búsqueda web
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specialRequestType: 'web_research',
            companyName: companyName,
            searchQuery: `${companyName} Brasil logística e-commerce embalaje`,
            vendorName: currentUser,
            context: 'prospecting'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Generar approach basado en la investigación
          const approach = generateApproachFromResearch(companyName, data.response);
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: approach 
          }]);
          
          // Crear oportunidad en stage 1 si no existe
          const existingOpp = allOpportunities.find(o => 
            o.client.toLowerCase().includes(companyName.toLowerCase())
          );
          
          if (!existingOpp) {
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `\n💡 **¿Quieres crear esta oportunidad?**\n[Crear oportunidad ${companyName}|create:${companyName}]` 
            }]);
          }
        } else {
          throw new Error('Error en búsqueda web');
        }
      } catch (error) {
        // Fallback sin datos web
        constimport React, { useState, useEffect } from 'react';
import { MessageCircle, X, AlertTriangle, Target, RefreshCw, TrendingUp, Globe, Calendar, Zap, DollarSign, Database, Search, Mail, Phone, FileText, MessageSquare, Video, Users, BookOpen, Brain } from 'lucide-react';

// Componente para renderizar mensajes con botones interactivos
const MessageRenderer = ({ content, onButtonClick }) => {
  const buttonRegex = /\[([^|]+)\|([^\]]+)\]/g;
  const parts = content.split(buttonRegex);

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (index % 3 === 1) {
          const actionPayload = parts[index + 1];
          return (
            <button
              key={index}
              onClick={() => onButtonClick(actionPayload)}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-all text-sm font-semibold mx-1 my-2 inline-block"
            >
              {part}
            </button>
          );
        }
        if (index % 3 === 2) return null;
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
};

const AIAssistant = ({ currentOpportunity, onOpportunityUpdate, currentUser, supabase }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  const [showROI, setShowROI] = useState(false);
  const [assistantActiveOpportunity, setAssistantActiveOpportunity] = useState(null);
  const [similarDeals, setSimilarDeals] = useState([]);
  const [activeView, setActiveView] = useState('chat'); // chat, strategy, scripts, templates

  // ============= DATOS Y SCRIPTS DE VENTAPEL =============
  
  // Preguntas SPIN del Playbook
  const spinQuestions = {
    situacion: [
      "¿Qué tipo de cinta utilizan actualmente para sellar las cajas?",
      "¿Cómo es el proceso actual de embalaje en su operación?",
      "¿Cuántas cajas procesan diariamente/mensualmente?",
      "¿Tienen algún sistema para rastrear cajas violadas?",
      "¿Quién es responsable del proceso de embalaje actualmente?"
    ],
    problema: [
      "¿Con qué frecuencia tienen cajas que llegan abiertas al cliente?",
      "¿Cuántas veces necesitan rehacer el sellado por mala aplicación?",
      "¿Han calculado el tiempo perdido en retrabajo?",
      "¿Qué porcentaje de sus envíos tienen reclamos por violación?",
      "¿Cuánto material adicional usan por el retrabajo?"
    ],
    implicacion: [
      "¿Cuál es el costo de reponer un producto cuando hay un reclamo?",
      "¿Cómo afecta esto la satisfacción de sus clientes?",
      "¿Qué impacto tiene en la reputación de su marca?",
      "¿Los ejecutivos están al tanto de estas pérdidas?",
      "¿Compras está presionando para reducir estos costos?"
    ],
    necesidad: [
      "¿Qué tan importante es para ustedes eliminar las violaciones?",
      "Si pudieran reducir 95% las pérdidas, ¿qué significaría para su área?",
      "¿Cuánto estarían dispuestos a invertir para solucionar esto?",
      "¿Quién tomaría la decisión de implementar una solución?",
      "¿Cuál sería el proceso para aprobar esta inversión?"
    ]
  };

  // Manejo de objeciones del Playbook
  const objectionHandlers = {
    precio: {
      objecion: "Es muy caro",
      respuesta: "Entiendo su preocupación. Pero veamos los números: están perdiendo R$ [X] por mes. Nuestra solución cuesta R$ [Y] con ROI en 3 meses. No es un gasto, es una inversión con retorno garantizado. L'Oréal pensó lo mismo y ahora ahorra R$ 2.5M al año."
    },
    importado: {
      objecion: "Es importado, puede faltar material",
      respuesta: "Mantenemos stock para 6+ meses en Brasil. En 10 años jamás dejamos a un cliente sin material. Amazon, nuestro cliente más exigente, nunca tuvo faltantes. Además, incluimos cláusula de garantía de suministro en el contrato."
    },
    cambio_proceso: {
      objecion: "Requiere cambiar nuestro proceso",
      respuesta: "El cambio es mínimo y lo acompañamos. Incluimos 2 días de capacitación y soporte en sitio. MercadoLibre hizo la transición en 3 días sin parar la operación. El equipo prefiere nuestra solución porque es más ergonómica."
    },
    decisor_ausente: {
      objecion: "Necesito consultarlo con mi jefe",
      respuesta: "Perfecto, es una decisión importante. ¿Podemos agendar una reunión con él? Preparé un business case ejecutivo de 1 página. ¿Qué información necesita para tomar la decisión? Lo ayudo a preparar la presentación."
    }
  };

  // Casos de éxito para referencias
  const successCases = {
    'e-commerce': {
      empresa: 'MercadoLibre',
      resultado: '40% reducción retrabajo, ahorro R$ 180k/mes',
      roi: '2 meses',
      contacto: 'Podemos organizar una llamada con su par en ML'
    },
    'cosmética': {
      empresa: "L'Oréal",
      resultado: '100% furtos eliminados, +50% eficiencia',
      roi: '3 meses',
      contacto: 'Caso documentado con métricas certificadas'
    },
    'farmacéutica': {
      empresa: 'Natura',
      resultado: '60% menos violaciones, R$ 85k/mes ahorro',
      roi: '4 meses',
      contacto: 'Video testimonial disponible'
    },
    'automotriz': {
      empresa: 'Honda Argentina',
      resultado: '+40% velocidad, 100% reducción faltantes',
      roi: '3 meses',
      contacto: 'Visita a planta disponible'
    }
  };

  // Templates de acciones según etapa
  const stageActions = {
    1: { // Prospección
      llamada: "Hacer llamada de calificación SPIN (15 min)",
      email: "Enviar email con datos de pérdidas del sector",
      linkedin: "Conectar en LinkedIn con mensaje personalizado",
      whatsapp: "Enviar video caso de éxito (30 seg)",
      siguiente: "Agendar reunión de descubrimiento"
    },
    2: { // Calificación
      llamada: "Call de descubrimiento profundo (30 min)",
      email: "Enviar calculadora de ROI personalizada",
      demo: "Mostrar demo virtual con su producto",
      visita: "Visita técnica para assessment",
      siguiente: "Conseguir acceso al decisor"
    },
    3: { // Presentación
      llamada: "Presentación ejecutiva con decisor",
      email: "Enviar propuesta técnica detallada",
      demo: "Demo en vivo con sus cajas",
      caso: "Compartir caso de éxito similar",
      siguiente: "Proponer test/piloto"
    },
    4: { // Validación
      test: "Ejecutar test day en sus instalaciones",
      email: "Enviar resultados del test",
      roi: "Presentar business case final",
      referencias: "Conectar con cliente referencia",
      siguiente: "Negociar términos comerciales"
    },
    5: { // Negociación
      llamada: "Call de negociación con Compras",
      email: "Enviar propuesta comercial final",
      contrato: "Revisar términos del contrato",
      descuento: "Ofrecer incentivo por firma rápida",
      siguiente: "Cerrar el deal"
    }
  };

  // Benchmarks reales de Brasil 2024-2025
  const brazilBenchmarks = {
    averageLoss: 0.10,
    packagingImpact: 0.80,
    ecommerceLosses: 3000000000,
    logisticsCost: 0.184,
    industries: {
      'e-commerce': { rate: 0.10, source: 'IBEVAR 2024' },
      'cosmética': { rate: 0.08, source: 'Casos reales' },
      'farmacéutica': { rate: 0.09, source: 'ANVISA + cadena fría' },
      'logística': { rate: 0.06, source: 'NTC&Logística' },
      'automotriz': { rate: 0.04, source: 'Casos reales' },
      'alimentos': { rate: 0.07, source: 'Cadena fría Brasil' }
    }
  };

  // ============= FUNCIONES CORE DEL ASISTENTE =============

  useEffect(() => {
    if (supabase) {
      loadPipelineData();
    }
  }, [currentUser, supabase]);

  useEffect(() => {
    const opportunityToAnalyze = assistantActiveOpportunity || currentOpportunity;
    if (opportunityToAnalyze) {
      analyzeOpportunityWithContext(opportunityToAnalyze);
      checkOpportunityHealth(opportunityToAnalyze);
      findSimilarDeals(opportunityToAnalyze);
    }
  }, [currentOpportunity, assistantActiveOpportunity, allOpportunities]);

  const loadPipelineData = async () => {
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('opportunities')
        .select('*')
        .order('value', { ascending: false });

      if (!error && data) {
        setAllOpportunities(data);
        analyzePipelineHealth(data);
      }
    } catch (err) {
      console.error('Error loading pipeline:', err);
    }
  };

  const findSimilarDeals = async (opp) => {
    if (!opp || !supabase) return;

    try {
      const { data: industryDeals } = await supabase
        .from('opportunities')
        .select('*')
        .eq('industry', opp.industry)
        .neq('id', opp.id)
        .gte('stage', 5)
        .limit(5);

      const { data: productDeals } = await supabase
        .from('opportunities')
        .select('*')
        .eq('product', opp.product)
        .neq('id', opp.id)
        .gte('stage', 5)
        .limit(5);

      const minValue = opp.value * 0.7;
      const maxValue = opp.value * 1.3;
      const { data: valueDeals } = await supabase
        .from('opportunities')
        .select('*')
        .gte('value', minValue)
        .lte('value', maxValue)
        .neq('id', opp.id)
        .gte('stage', 5)
        .limit(5);

      const allSimilar = [...(industryDeals || []), ...(productDeals || []), ...(valueDeals || [])];
      const uniqueDeals = Array.from(new Map(allSimilar.map(d => [d.id, d])).values());
      
      setSimilarDeals(uniqueDeals);
      return uniqueDeals;
    } catch (err) {
      console.error('Error buscando deals similares:', err);
      return [];
    }
  };

  const getScaleValue = (scale) => {
    if (!scale) return 0;
    if (typeof scale === 'object' && scale.score !== undefined) {
      return scale.score;
    }
    if (typeof scale === 'number') {
      return scale;
    }
    return 0;
  };

  const calculateHealthScore = (scales) => {
    if (!scales) return 0;
    
    const values = [
      getScaleValue(scales.dor || scales.pain),
      getScaleValue(scales.poder || scales.power),
      getScaleValue(scales.visao || scales.vision),
      getScaleValue(scales.valor || scales.value),
      getScaleValue(scales.controle || scales.control),
      getScaleValue(scales.compras || scales.purchase)
    ];
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    return values.length > 0 ? sum / values.length : 0;
  };

  // ============= GENERADORES DE CONTENIDO =============
  
  // Generar estrategia completa
  const generateCompleteStrategy = (opp) => {
    if (!opp) return "Selecciona un cliente primero";

    const stage = opp.stage || 1;
    const dorScore = getScaleValue(opp.scales?.dor);
    const poderScore = getScaleValue(opp.scales?.poder);
    const visaoScore = getScaleValue(opp.scales?.visao);
    const valorScore = getScaleValue(opp.scales?.valor);
    const controleScore = getScaleValue(opp.scales?.controle);
    const comprasScore = getScaleValue(opp.scales?.compras);
    
    let strategy = `🎯 **ESTRATEGIA COMPLETA - ${opp.client}**\n\n`;
    
    // Diagnóstico
    strategy += `📊 **DIAGNÓSTICO ACTUAL:**\n`;
    strategy += `• Etapa: ${stage} - ${['', 'Prospección', 'Calificación', 'Presentación', 'Validación', 'Negociación', 'Cerrado'][stage]}\n`;
    strategy += `• Score PPVVCC: ${calculateHealthScore(opp.scales).toFixed(1)}/10\n`;
    strategy += `• Valor: R$ ${opp.value.toLocaleString('pt-BR')}\n`;
    
    // Problema principal
    strategy += `\n⚠️ **PROBLEMA PRINCIPAL:**\n`;
    if (dorScore < 5) {
      strategy += `❌ Cliente NO admite el problema (DOR: ${dorScore}/10)\n`;
      strategy += `→ Sin dolor admitido, no hay venta posible\n`;
    } else if (poderScore < 4) {
      strategy += `❌ Sin acceso al decisor (PODER: ${poderScore}/10)\n`;
      strategy += `→ Riesgo de perder tiempo con quien no decide\n`;
    } else if (comprasScore < 5) {
      strategy += `❌ Compras no está alineado (COMPRAS: ${comprasScore}/10)\n`;
      strategy += `→ Deal puede morir en el proceso de compra\n`;
    } else if (valorScore < 6) {
      strategy += `⚠️ ROI no validado (VALOR: ${valorScore}/10)\n`;
      strategy += `→ Sin business case, no hay presupuesto\n`;
    } else {
      strategy += `✅ Bien encaminado, falta cerrar\n`;
    }
    
    // Plan de acción detallado
    strategy += `\n📋 **PLAN DE ACCIÓN (próximos 7 días):**\n\n`;
    
    // DÍA 1-2
    strategy += `**📅 HOY/MAÑANA - Acción inmediata:**\n`;
    if (dorScore < 5) {
      strategy += `📞 Llamada SPIN de 15 minutos:\n`;
      strategy += `   1. Situación: "${spinQuestions.situacion[0]}"\n`;
      strategy += `   2. Problema: "${spinQuestions.problema[0]}"\n`;
      strategy += `   3. Implicación: "${spinQuestions.implicacion[0]}"\n`;
      strategy += `   4. Necesidad: "${spinQuestions.necesidad[0]}"\n`;
      strategy += `   Meta: Que admita pérdidas de R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')}/mes\n`;
    } else if (poderScore < 4) {
      strategy += `📧 Email al sponsor actual:\n`;
      strategy += `   Asunto: "Business case ${opp.client} - necesito 10 min con [decisor]"\n`;
      strategy += `   Mensaje: ROI calculado en ${Math.round(opp.value / (opp.value * 0.01 * 0.95))} meses\n`;
      strategy += `   CTA: Agendar reunión tripartita esta semana\n`;
    } else {
      strategy += `💰 Presentar propuesta con urgencia:\n`;
      strategy += `   "Cada día sin decidir = R$ ${Math.round(opp.value * 0.01 / 30).toLocaleString('pt-BR')} perdidos"\n`;
    }
    
    // DÍA 3-4
    strategy += `\n**📅 MIÉRCOLES/JUEVES - Construir momentum:**\n`;
    const industry = opp.industry?.toLowerCase() || 'default';
    const successCase = successCases[industry] || successCases['e-commerce'];
    strategy += `📹 Compartir caso ${successCase.empresa}:\n`;
    strategy += `   • Resultado: ${successCase.resultado}\n`;
    strategy += `   • ROI: ${successCase.roi}\n`;
    strategy += `   • Oferta: ${successCase.contacto}\n`;
    
    // DÍA 5-7
    strategy += `\n**📅 VIERNES/PRÓXIMA SEMANA - Cerrar compromiso:**\n`;
    if (stage < 4) {
      strategy += `🎯 Objetivo: Agendar TEST DAY\n`;
      strategy += `   • Propuesta: "Probemos con 100 cajas sin compromiso"\n`;
      strategy += `   • Fecha tentativa: ${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}\n`;
    } else {
      strategy += `✅ Objetivo: CERRAR EL DEAL\n`;
      strategy += `   • Incentivo: "10% descuento si firmamos esta semana"\n`;
      strategy += `   • Garantía: "ROI en 3 meses o devolvemos su dinero"\n`;
    }
    
    // Scripts y mensajes
    strategy += `\n📝 **MENSAJES CLAVE PARA USAR:**\n\n`;
    
    strategy += `**WhatsApp (copiar y pegar):**\n`;
    strategy += `"Hola [nombre], calculé que ${opp.client} pierde ~R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')}/mes por violación de cajas.\n`;
    strategy += `${successCase.empresa} tenía el mismo problema y ahora ahorra R$ millones.\n`;
    strategy += `¿10 minutos mañana para mostrarle los números?"\n\n`;
    
    strategy += `**LinkedIn:**\n`;
    strategy += `"Vi que ${opp.client} está creciendo en e-commerce. `;
    strategy += `¿Sabía que el sector pierde 10% por violación (IBEVAR 2024)? `;
    strategy += `Ayudamos a ${successCase.empresa} a eliminar este problema. ¿Charlamos?"\n\n`;
    
    strategy += `**Email asunto:**\n`;
    strategy += `"${opp.client}: Pérdida identificada R$ ${(opp.value * 0.01 * 12).toLocaleString('pt-BR')}/año"\n\n`;
    
    // Métricas de éxito
    strategy += `📈 **KPIs PARA MEDIR ÉXITO:**\n`;
    strategy += `• Esta semana: ${dorScore < 5 ? 'DOR ≥ 5' : poderScore < 4 ? 'PODER ≥ 4' : 'Propuesta enviada'}\n`;
    strategy += `• En 15 días: ${stage < 4 ? 'Test day agendado' : 'Contrato en revisión'}\n`;
    strategy += `• En 30 días: ${stage < 3 ? 'Etapa 3 alcanzada' : 'Deal cerrado'}\n\n`;
    
    // Recursos
    strategy += `🛠️ **RECURSOS DISPONIBLES:**\n`;
    strategy += `• [Calculadora ROI](calcular ROI ${opp.client})\n`;
    strategy += `• [Caso ${successCase.empresa}](mostrar caso ${successCase.empresa})\n`;
    strategy += `• [Demo en video](link demo Ventapel)\n`;
    strategy += `• [Propuesta template](generar propuesta)\n`;
    
    return strategy;
  };

  // Generar email específico
  const generateEmail = (opp, tipo = 'seguimiento') => {
    if (!opp) return "Selecciona un cliente primero";

    const stage = opp.stage || 1;
    const dorScore = getScaleValue(opp.scales?.dor);
    const poderScore = getScaleValue(opp.scales?.poder);
    const comprasScore = getScaleValue(opp.scales?.compras);
    
    let email = `📧 **EMAIL PARA ${opp.client.toUpperCase()}**\n\n`;
    
    // Diferentes tipos de email según situación
    if (tipo === 'primer_contacto' || stage === 1) {
      email += `**Asunto:** 🚨 ${opp.industry || 'Empresas'} pierden 10% en violación - Caso ${opp.client}\n\n`;
      email += `Estimado ${opp.sponsor || 'equipo de ' + opp.client},\n\n`;
      email += `¿Sabían que empresas del sector ${opp.industry || 'logístico'} en Brasil pierden en promedio 10% de sus envíos por violación de cajas? `;
      email += `(Fuente: IBEVAR 2024)\n\n`;
      email += `Para ${opp.client}, esto representa aproximadamente:\n`;
      email += `• R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')}/mes en pérdidas\n`;
      email += `• R$ ${Math.round(opp.value * 0.01 * 12).toLocaleString('pt-BR')}/año tirados a la basura\n\n`;
      email += `En Ventapel eliminamos este problema. Casos recientes:\n`;
      email += `• L'Oréal: 100% furtos eliminados, ROI 3 meses\n`;
      email += `• MercadoLibre: 40% menos retrabajo\n`;
      email += `• Nike: Cero violaciones, +30% eficiencia\n\n`;
      email += `¿Podemos agendar 15 minutos esta semana para mostrarle cuánto podría ahorrar ${opp.client}?\n\n`;
      email += `Días disponibles:\n`;
      email += `• Martes 2pm-5pm\n`;
      email += `• Miércoles 9am-12pm\n`;
      email += `• Jueves 2pm-5pm\n\n`;
      
    } else if (comprasScore < 5 && dorScore >= 5) {
      // Email para convencer a Compras
      email += `**Asunto:** ✅ Business Case ${opp.client} - ROI ${Math.round(opp.value / (opp.value * 0.01 * 0.95))} meses\n\n`;
      email += `${opp.sponsor || 'Estimado'},\n\n`;
      email += `Adjunto el business case completo para facilitar la aprobación con Compras:\n\n`;
      email += `**📊 NÚMEROS EJECUTIVOS:**\n`;
      email += `• Pérdida actual: R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')}/mes\n`;
      email += `• Inversión Ventapel: R$ ${opp.value.toLocaleString('pt-BR')}\n`;
      email += `• Ahorro mensual: R$ ${Math.round(opp.value * 0.01 * 0.95).toLocaleString('pt-BR')}\n`;
      email += `• ROI: ${Math.round(opp.value / (opp.value * 0.01 * 0.95))} meses\n`;
      email += `• TIR Año 1: ${Math.round(((opp.value * 0.01 * 0.95 * 12 - opp.value) / opp.value) * 100)}%\n\n`;
      email += `**✅ GARANTÍAS:**\n`;
      email += `• ROI en 3 meses o devolvemos su dinero\n`;
      email += `• 2 años garantía en equipos\n`;
      email += `• Stock garantizado (nunca faltó en 10 años)\n`;
      email += `• Soporte local en Brasil\n\n`;
      email += `**⚡ URGENCIA:**\n`;
      email += `Cada mes sin decidir = R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')} perdidos\n`;
      email += `En 6 meses = R$ ${Math.round(opp.value * 0.01 * 6).toLocaleString('pt-BR')} desperdiciados\n\n`;
      email += `¿Necesita algún documento adicional para Compras?\n\n`;
      
    } else if (stage >= 4) {
      // Email de cierre
      email += `**Asunto:** 🎯 Propuesta Final ${opp.client} - Decisión esta semana\n\n`;
      email += `${opp.power_sponsor || opp.sponsor || 'Estimado'},\n\n`;
      email += `Como acordamos, aquí está la propuesta final con condiciones especiales:\n\n`;
      email += `**✅ PROPUESTA APROBADA:**\n`;
      email += `• Inversión: R$ ${opp.value.toLocaleString('pt-BR')}\n`;
      email += `• Forma de pago: 30/60/90 días\n`;
      email += `• Instalación: Incluida\n`;
      email += `• Capacitación: 2 días en sitio\n\n`;
      email += `**🎁 BONUS por firmar esta semana:**\n`;
      email += `• 10% descuento adicional\n`;
      email += `• 3 meses de cinta sin costo\n`;
      email += `• Upgrade a soporte premium\n\n`;
      email += `**Para proceder:**\n`;
      email += `1. Confirme por este email\n`;
      email += `2. Enviamos contrato digital (DocuSign)\n`;
      email += `3. Instalación en 7 días hábiles\n\n`;
      email += `¿Cerramos hoy?\n\n`;
    }
    
    // Firma
    email += `Saludos,\n`;
    email += `${currentUser || '[Tu nombre]'}\n`;
    email += `Ventapel Brasil\n`;
    email += `📱 WhatsApp: [tu número]\n`;
    email += `🌐 www.ventapel.com.br\n\n`;
    email += `P.D.: ${successCases[opp.industry?.toLowerCase()]?.empresa || 'L\'Oréal'} también dudó al principio. `;
    email += `Hoy ahorran millones. No dejen pasar esta oportunidad.\n`;
    
    return email;
  };

  // Generar script de llamada
  const generateCallScript = (opp) => {
    if (!opp) return "Selecciona un cliente primero";

    const dorScore = getScaleValue(opp.scales?.dor);
    const poderScore = getScaleValue(opp.scales?.poder);
    
    let script = `📞 **SCRIPT DE LLAMADA - ${opp.client}**\n\n`;
    script += `⏱️ Duración objetivo: 15-20 minutos\n\n`;
    
    // Apertura
    script += `**🎯 APERTURA (30 seg):**\n`;
    script += `"Hola [nombre], soy ${currentUser} de Ventapel. `;
    script += `¿Tiene 2 minutos? Le llamo porque descubrí que empresas como ${opp.client} `;
    script += `pierden ~R$ ${Math.round(opp.value * 0.01).toLocaleString('pt-BR')}/mes por violación de cajas. `;
    script += `¿Esto es un tema relevante para ustedes?"\n\n`;
    
    // Preguntas SPIN
    script += `**❓ PREGUNTAS SPIN (10 min):**\n\n`;
    
    script += `**Situación:**\n`;
    spinQuestions.situacion.slice(0, 2).forEach((q, i) => {
      script += `${i + 1}. "${q}"\n`;
    });
    script += `→ Anotar: volumen, proceso actual, responsables\n\n`;
    
    script += `**Problema:**\n`;
    spinQuestions.problema.slice(0, 2).forEach((q, i) => {
      script += `${i + 1}. "${q}"\n`;
    });
    script += `→ Objetivo: Que admita % de pérdida\n\n`;
    
    script += `**Implicación:**\n`;
    spinQuestions.implicacion.slice(0, 2).forEach((q, i) => {
      script += `${i + 1}. "${q}"\n`;
    });
    script += `→ Objetivo: Que vea el impacto en R$\n\n`;
    
    script += `**Necesidad:**\n`;
    script += `"Si pudiera eliminar 95% de estas pérdidas con ROI en 3 meses, `;
    script += `¿sería prioridad para ${opp.client}?"\n\n`;
    
    // Presentación de valor
    script += `**💡 PRESENTACIÓN DE VALOR (5 min):**\n`;
    script += `"Basado en lo que me cuenta, Ventapel puede ayudarles:\n`;
    script += `• Eliminar 95% de violaciones (garantizado)\n`;
    script += `• ROI en 3 meses (o devolvemos su dinero)\n`;
    script += `• Caso similar: ${successCases[opp.industry?.toLowerCase()]?.empresa || 'L\'Oréal'}\n`;
    script += `  Resultado: ${successCases[opp.industry?.toLowerCase()]?.resultado || '100% furtos eliminados'}\n\n`;
    
    // Manejo de objeciones
    script += `**🛡️ OBJECIONES PROBABLES:**\n\n`;
    
    script += `Si dice "${objectionHandlers.precio.objecion}":\n`;
    script += `→ "${objectionHandlers.precio.respuesta}"\n\n`;
    
    script += `Si dice "${objectionHandlers.decisor_ausente.objecion}":\n`;
    script += `→ "${objectionHandlers.decisor_ausente.respuesta}"\n\n`;
    
    // Cierre
    script += `**✅ CIERRE (2 min):**\n`;
    if (dorScore < 5) {
      script += `"Le envío un análisis personalizado mostrando cuánto pierde ${opp.client}. `;
      script += `¿Podemos agendar 30 minutos la próxima semana para revisarlo juntos?"\n`;
    } else if (poderScore < 4) {
      script += `"Necesito validar estos números con quien toma la decisión. `;
      script += `¿Podemos incluir a [decisor] en una reunión de 20 minutos?"\n`;
    } else {
      script += `"El siguiente paso es un test en sus instalaciones. `;
      script += `¿Qué día de la próxima semana podríamos hacer una prueba con 100 cajas?"\n`;
    }
    
    script += `\n**📅 AGENDAR SIGUIENTE PASO:**\n`;
    script += `• Confirmar día y hora\n`;
    script += `• Enviar invitación de calendario\n`;
    script += `• WhatsApp de confirmación\n`;
    
    return script;
  };

  // Analizar oportunidad con contexto
  const analyzeOpportunityWithContext = (opp) => {
    if (!opp || !opp.scales) return;

    const context = getIntelligentContext(opp);
    
    const scaleValues = {
      pain: getScaleValue(opp.scales.dor || opp.scales.pain),
      power: getScaleValue(opp.scales.poder || opp.scales.power),
      vision: getScaleValue(opp.scales.visao || opp.scales.vision),
      value: getScaleValue(opp.scales.valor || opp.scales.value),
      control: getScaleValue(opp.scales.controle || opp.scales.control),
      purchase: getScaleValue(opp.scales.compras || opp.scales.purchase)
    };
    
    const avgScale = calculateHealthScore(opp.scales);
    const inconsistencies = [];
    
    // Detectar inconsistencias
    if (opp.stage >= 3 && scaleValues.pain < 5) {
      inconsistencies.push({
        type: 'critical',
        message: '🔴 INCONSISTENCIA: Presentando sin DOR confirmada!',
        action: 'Volver a calificación URGENTE',
        script: spinQuestions.problema[0]
      });
    }
    
    if (opp.value > 100000 && scaleValues.power < 4) {
      inconsistencies.push({
        type: 'critical',
        message: `⛔ PROBLEMA: R$${opp.value.toLocaleString('pt-BR')} sin hablar con decisor`,
        action: 'Conseguir acceso al POWER hoy',
        script: "Necesito validar con quien aprueba inversiones de este monto"
      });
    }

    // Calcular probabilidad real
    let probability = 0;
    if (scaleValues.pain >= 7 && scaleValues.power >= 6 && scaleValues.value >= 6) {
      probability = 75;
    } else if (scaleValues.pain >= 5 && scaleValues.power >= 4 && scaleValues.value >= 4) {
      probability = 40;
    } else if (scaleValues.pain >= 3) {
      probability = 15;
    } else {
      probability = 5;
    }

    setAnalysis({
      avgScale: avgScale.toFixed(1),
      probability,
      scaleValues,
      inconsistencies,
      nextAction: generateSmartNextAction(opp, scaleValues, inconsistencies, context),
      context,
      similarDealsCount: similarDeals.length
    });
  };

  const getIntelligentContext = (opp) => {
    const context = {
      priority1_clientNotes: {},
      priority2_similarDeals: {},
      priority3_ventapelCases: {},
      priority4_brazilBenchmarks: {},
      dataSource: null
    };

    // Prioridad 1: Notas del cliente
    if (opp) {
      context.priority1_clientNotes = {
        hasData: false,
        notes: []
      };

      if (opp.next_action) {
        context.priority1_clientNotes.notes.push(`Próxima acción: ${opp.next_action}`);
        context.priority1_clientNotes.hasData = true;
      }
      
      if (opp.scales?.dor?.description) {
        context.priority1_clientNotes.notes.push(`Dolor: ${opp.scales.dor.description}`);
        context.priority1_clientNotes.hasData = true;
      }
    }

    // Prioridad 2: Deals similares
    if (similarDeals.length > 0) {
      context.priority2_similarDeals = {
        hasData: true,
        count: similarDeals.length,
        avgValue: similarDeals.reduce((sum, d) => sum + d.value, 0) / similarDeals.length
      };
    }

    // Determinar fuente principal
    if (context.priority1_clientNotes.hasData) {
      context.dataSource = 'DATOS DEL CLIENTE';
    } else if (context.priority2_similarDeals.hasData) {
      context.dataSource = 'DEALS SIMILARES';
    } else {
      context.dataSource = 'BENCHMARKS BRASIL';
    }

    return context;
  };

  const generateSmartNextAction = (opp, scaleValues, inconsistencies, context) => {
    if (inconsistencies.length > 0 && inconsistencies[0].type === 'critical') {
      return {
        action: inconsistencies[0].action,
        script: inconsistencies[0].script,
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.pain < 5) {
      return {
        action: "🎯 Hacer que ADMITA el problema",
        script: spinQuestions.problema[0],
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.power < 4) {
      return {
        action: "👔 Acceder al DECISOR",
        script: "Para garantizar ROI de 3 meses, necesito validar con quien aprueba",
        dataSource: context.dataSource
      };
    }
    
    if (scaleValues.vision < 5) {
      return {
        action: "🎬 Demo urgente",
        script: `Mostrar caso ${successCases[opp.industry?.toLowerCase()]?.empresa || 'L\'Oréal'}`,
        dataSource: context.dataSource
      };
    }
    
    return {
      action: "✅ CERRAR el negocio",
      script: "¿Cuál es el proceso interno para aprobar esta inversión?",
      dataSource: context.dataSource
    };
  };

  const analyzePipelineHealth = (opportunities) => {
    const totalValue = opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
    const riskOpps = opportunities.filter(opp => {
      const avgScale = calculateHealthScore(opp.scales || {});
      return avgScale < 4 && opp.value > 50000;
    });

    setPipelineHealth({
      total: opportunities.length,
      totalValue,
      atRisk: riskOpps.length,
      riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0)
    });
  };

  const checkOpportunityHealth = (opp) => {
    const newAlerts = [];
    
    if (opp.last_update) {
      const daysSince = Math.floor((new Date() - new Date(opp.last_update)) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) {
        newAlerts.push({
          type: 'urgent',
          message: `🔴 ${daysSince} días sin contacto - VAI PERDER!`,
          action: 'reactivate'
        });
      }
    }

    setAlerts(newAlerts);
  };

  const searchOpportunity = async (clientName) => {
    if (!supabase) return null;
    
    try {
      const { data: clientData } = await supabase
        .from('opportunities')
        .select('*')
        .or(`client.ilike.%${clientName}%,name.ilike.%${clientName}%`);
      
      if (clientData && clientData.length > 0) {
        return clientData;
      }
      
      return [];
    } catch (err) {
      console.error('Error buscando:', err);
      return null;
    }
  };

  // Detectar intenciones del usuario - MEJORADO CON BÚSQUEDA WEB
  const detectUserIntent = (message) => {
    const lower = message.toLowerCase();
    
    // Detección de búsqueda web
    if (lower.includes('buscar online') || lower.includes('buscar en internet') || 
        lower.includes('investigar') || lower.includes('información de') ||
        lower.includes('research') || lower.includes('busca info')) {
      return 'web_search';
    }
    
    if (lower.includes('email') || lower.includes('mail') || lower.includes('correo')) {
      return 'email';
    }
    if (lower.includes('llamada') || lower.includes('call') || lower.includes('teléfono') || lower.includes('script')) {
      return 'call';
    }
    if (lower.includes('estrategia') || lower.includes('plan') || lower.includes('qué hacer')) {
      return 'strategy';
    }
    if (lower.includes('whatsapp') || lower.includes('mensaje')) {
      return 'whatsapp';
    }
    if (lower.includes('propuesta') || lower.includes('proposal')) {
      return 'proposal';
    }
    if (lower.includes('roi') || lower.includes('calcular')) {
      return 'roi';
    }
    if (lower.includes('objeción') || lower.includes('objection') || lower.includes('dice que')) {
      return 'objection';
    }
    
    return null;
  };

  // NUEVA FUNCIÓN: Generar approach basado en investigación web
  const generateApproachFromResearch = (companyName, webData) => {
    let approach = `🔍 **ESTRATEGIA DE APPROACH - ${companyName}**\n\n`;
    
    approach += `📊 **INFORMACIÓN ENCONTRADA:**\n`;
    approach += webData + '\n\n';
    
    approach += `🎯 **APPROACH RECOMENDADO:**\n\n`;
    
    approach += `**1. GANCHO INICIAL (basado en la investigación):**\n`;
    approach += `"Vi que ${companyName} [mencionar algo específico de la investigación]. `;
    approach += `Empresas similares están perdiendo 10% en violación de cajas. `;
    approach += `¿Es un tema relevante para ustedes?"\n\n`;
    
    approach += `**2. PUNTOS DE DOLOR PROBABLES:**\n`;
    approach += `• Si es e-commerce: Violación en última milla\n`;
    approach += `• Si es manufactura: Retrabajo en embalaje\n`;
    approach += `• Si es logística: Reclamos de clientes\n`;
    approach += `• Si es retail: Pérdidas en transporte\n\n`;
    
    approach += `**3. CONTACTOS A BUSCAR (LinkedIn):**\n`;
    approach += `• Gerente de Operaciones / Logística\n`;
    approach += `• Director de Supply Chain\n`;
    approach += `• Gerente de Calidad\n`;
    approach += `• CFO (si el valor es alto)\n\n`;
    
    approach += `**4. MENSAJE DE LINKEDIN:**\n`;
    approach += `"Hola [Nombre],\n\n`;
    approach += `Vi que ${companyName} está [dato de la investigación]. `;
    approach += `Ayudamos a empresas como L'Oréal y MercadoLibre a eliminar 100% las pérdidas por violación de cajas.\n\n`;
    approach += `¿Vale la pena una conversación de 15 minutos?"\n\n`;
    
    approach += `**5. EMAIL DE PRIMER CONTACTO:**\n`;
    approach += `Asunto: ${companyName} - Pérdidas evitables de R$ [estimar basado en tamaño]\n\n`;
    approach += `[Personalizar con datos de la investigación]\n\n`;
    
    approach += `**6. PREGUNTAS SPIN ESPECÍFICAS:**\n`;
    approach += `• Situación: "¿Cómo manejan actualmente el sellado de cajas?"\n`;
    approach += `• Problema: "¿Han medido el % de cajas que llegan violadas?"\n`;
    approach += `• Implicación: "¿Cuánto les cuesta cada reclamo por violación?"\n`;
    approach += `• Necesidad: "Si pudieran eliminar 95% de estas pérdidas..."\n\n`;
    
    approach += `**7. CASO DE ÉXITO RELEVANTE:**\n`;
    approach += `[Seleccionar basado en la industria identificada]\n\n`;
    
    approach += `**8. PRÓXIMOS PASOS:**\n`;
    approach += `□ Buscar contactos en LinkedIn\n`;
    approach += `□ Enviar InMail personalizado\n`;
    approach += `□ Preparar presentación con datos del sector\n`;
    approach += `□ Agendar llamada de 15 minutos\n`;
    
    return approach;
  };

  const handleActionClick = async (actionPayload) => {
    if (!actionPayload) return;

    const [action, ...params] = actionPayload.split(':');

    if (action === 'update' && params.length >= 2) {
      const [scale, newValue, oppId] = params;
      const opportunityToUpdateId = oppId || getActiveOpportunity()?.id;
      
      if (!opportunityToUpdateId) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: No sé qué oportunidad actualizar.' }]);
        return;
      }

      setIsLoading(true);
      try {
        const currentOpp = allOpportunities.find(o => o.id === opportunityToUpdateId);
        const updatedScales = {
          ...(currentOpp?.scales || {}),
          [scale]: { 
            ...(currentOpp?.scales?.[scale] || {}),
            score: parseInt(newValue) 
          }
        };

        const { data, error } = await supabase
          .from('opportunities')
          .update({ 
            scales: updatedScales,
            last_update: new Date().toISOString()
          })
          .eq('id', opportunityToUpdateId)
          .select();

        if (error) throw error;

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ Actualizado! ${scale.toUpperCase()} = ${newValue}/10 para ${data[0].client}` 
        }]);

        await loadPipelineData();
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Error: ${error.message}` 
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

const sendMessage = async (messageText = input) => {
    if (!messageText.trim()) return;

    const userMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Detectar intención
    const intent = detectUserIntent(messageText);
    const activeOpp = assistantActiveOpportunity || currentOpportunity;
    
    // CASO 1: Búsqueda web de empresa nueva - CORREGIDO
    if (intent === 'web_search') {
      // Extraer nombre de empresa del mensaje
      const companyMatch = messageText.match(/(?:buscar|investigar|información de|info de|busca sobre|buscar información de)\s+(.+?)(?:\s|$)/i);
      const companyName = companyMatch ? companyMatch[1].trim() : messageText.split(' ').slice(-1)[0];
      
      try {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `🔍 Buscando información sobre **${companyName}** en internet...` 
        }]);
        
        // CORRECCIÓN: Llamar al API con los parámetros correctos
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specialRequestType: 'web_research', // IMPORTANTE: Debe coincidir con el backend
            companyName: companyName,           // IMPORTANTE: Pasar el nombre de la empresa
            vendorName: currentUser,
            context: 'prospecting'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Mostrar la respuesta del API con información real
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.response  // La respuesta ya viene formateada del backend
          }]);
          
          // Verificar si la empresa ya existe en el CRM
          const existingOpp = allOpportunities.find(o => 
            o.client.toLowerCase().includes(companyName.toLowerCase())
          );
          
          if (!existingOpp && data.response && !data.response.includes('No pude encontrar')) {
            // Solo ofrecer crear oportunidad si se encontró información
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `\n💡 **¿Quieres crear esta oportunidad?**\n\n` +
                      `[✅ Crear oportunidad ${companyName}|create:${companyName}]\n` +
                      `[🔍 Buscar otra empresa|search:new]\n` +
                      `[📋 Ver pipeline actual|list:opportunities]`
            }]);
          }
        } else {
          throw new Error('Error en búsqueda web');
        }
      } catch (error) {
        console.error('Error en búsqueda web:', error);
        
        // Fallback mejorado sin datos web
        const fallbackApproach = `⚠️ **No pude buscar online en este momento**\n\n` +
          `Pero aquí está el approach estándar para ${companyName}:\n\n` +
          `**📋 CHECKLIST DE INVESTIGACIÓN MANUAL:**\n` +
          `□ Buscar en Google: "${companyName} Brasil logística"\n` +
          `□ LinkedIn: Buscar empleados y estructura\n` +
          `□ Sitio web: Identificar productos/servicios\n` +
          `□ Noticias: Buscar expansión o problemas recientes\n\n` +
          
          `**📧 TEMPLATE DE PRIMER CONTACTO:**\n` +
          `"Hola [Nombre],\n\n` +
          `Vi que ${companyName} está creciendo en [sector]. ` +
          `Empresas similares pierden 10% en violación de cajas (IBEVAR 2024).\n\n` +
          `L'Oréal eliminó 100% sus pérdidas con nuestra solución.\n` +
          `MercadoLibre redujo 40% el retrabajo.\n\n` +
          `¿15 minutos para mostrarle cuánto podría ahorrar ${companyName}?"\n\n` +
          
          `**👥 CONTACTOS A BUSCAR:**\n` +
          `• Gerente de Operaciones\n` +
          `• Director de Logística\n` +
          `• Gerente de Supply Chain\n` +
          `• CFO (si facturan > R$ 10M/año)\n\n` +
          
          `**💡 PRÓXIMOS PASOS:**\n` +
          `1. Identificar volumen de envíos mensuales\n` +
          `2. Detectar si usan e-commerce o 3PL\n` +
          `3. Buscar quejas de clientes por daños\n` +
          `4. Preparar ROI estimado basado en sector`;
          
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: fallbackApproach 
        }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    // CASO 2: Intenciones predefinidas con cliente activo
    if (intent && activeOpp) {
      let response = '';
      
      switch (intent) {
        case 'strategy':
          response = generateCompleteStrategy(activeOpp);
          break;
        case 'email':
          response = generateEmail(activeOpp);
          break;
        case 'call':
          response = generateCallScript(activeOpp);
          break;
        case 'whatsapp':
          response = `📱 **MENSAJE WHATSAPP para ${activeOpp.client}:**\n\n`;
          response += `Hola [nombre]! 👋\n\n`;
          response += `Calculé que ${activeOpp.client} pierde ~R$ ${Math.round(activeOpp.value * 0.01).toLocaleString('pt-BR')}/mes por violación de cajas 📦\n\n`;
          response += `${successCases[activeOpp.industry?.toLowerCase()]?.empresa || 'L\'Oréal'} tenía el mismo problema.\n`;
          response += `Resultado: ${successCases[activeOpp.industry?.toLowerCase()]?.resultado || '100% furtos eliminados'} ✅\n\n`;
          response += `¿10 minutos mañana para mostrarle cómo eliminar estas pérdidas?\n\n`;
          response += `Tengo estos horarios:\n`;
          response += `• 9:00 ⏰\n`;
          response += `• 14:00 ⏰\n`;
          response += `• 16:00 ⏰\n\n`;
          response += `¿Cuál le viene mejor? 🤔`;
          break;
        case 'objection':
          response = `🛡️ **MANEJO DE OBJECIONES - ${activeOpp.client}**\n\n`;
          Object.values(objectionHandlers).forEach(obj => {
            response += `**Si dice: "${obj.objecion}"**\n`;
            response += `✅ Responder: "${obj.respuesta}"\n\n`;
          });
          break;
        case 'roi':
          // Llamar al API para cálculo de ROI
          try {
            const apiResponse = await fetch('/api/assistant', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                context: 'calcular roi',
                opportunityData: activeOpp,
                vendorName: currentUser
              })
            });
            
            if (apiResponse.ok) {
              const data = await apiResponse.json();
              response = data.response;
            } else {
              // Fallback local
              response = `💰 **ROI ESTIMADO - ${activeOpp.client}**\n\n`;
              response += `• Pérdida mensual: R$ ${Math.round(activeOpp.value * 0.01).toLocaleString('pt-BR')}\n`;
              response += `• Inversión: R$ ${activeOpp.value.toLocaleString('pt-BR')}\n`;
              response += `• ROI: ${Math.round(activeOpp.value / (activeOpp.value * 0.01 * 0.95))} meses\n`;
            }
          } catch (error) {
            response = generateCompleteStrategy(activeOpp);
          }
          break;
        case 'proposal':
          response = `📄 **PROPUESTA COMERCIAL - ${activeOpp.client}**\n\n`;
          response += `**RESUMEN EJECUTIVO:**\n`;
          response += `${activeOpp.client} pierde aproximadamente R$ ${Math.round(activeOpp.value * 0.01).toLocaleString('pt-BR')}/mes `;
          response += `por violación de cajas en su operación logística.\n\n`;
          response += `**NUESTRA SOLUCIÓN:**\n`;
          response += `• Equipamiento: ${activeOpp.value > 200000 ? 'BP755' : 'BP555e'}\n`;
          response += `• Consumibles: Fita Gorilla (stock garantizado)\n`;
          response += `• Implementación: 7 días hábiles\n`;
          response += `• Capacitación: 2 días en sitio incluidos\n\n`;
          response += `**INVERSIÓN:**\n`;
          response += `• Total: R$ ${activeOpp.value.toLocaleString('pt-BR')}\n`;
          response += `• Forma de pago: 30/60/90 días\n`;
          response += `• Garantía: 2 años en equipos\n\n`;
          response += `**ROI GARANTIZADO:**\n`;
          response += `• Retorno en ${Math.round(activeOpp.value / (activeOpp.value * 0.01 * 0.95))} meses\n`;
          response += `• Si no cumplimos, devolvemos su dinero\n\n`;
          response += `**PRÓXIMOS PASOS:**\n`;
          response += `1. Aprobación de esta propuesta\n`;
          response += `2. Test day en sus instalaciones\n`;
          response += `3. Firma de contrato\n`;
          response += `4. Implementación inmediata`;
          break;
        default:
          response = `Analizando ${activeOpp.client}...`;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      setIsLoading(false);
      return;
    }

    // CASO 3: Plan semanal especial
    if (messageText.toLowerCase().includes('plan semanal') || messageText === 'plan_semanal') {
      try {
        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            specialRequestType: 'weekly_plan',
            pipelineData: {
              allOpportunities: allOpportunities.filter(o => o.vendor === currentUser),
              vendorName: currentUser
            },
            vendorName: currentUser
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        } else {
          throw new Error('API error');
        }
      } catch (error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '❌ Error generando plan. Intenta de nuevo.' 
        }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // CASO 4: Búsqueda simple de cliente existente
    const isSimpleSearch = messageText.split(' ').length <= 2 && messageText.length > 2;
    
    if (isSimpleSearch) {
      const searchTerm = messageText.trim();
      const searchResults = allOpportunities.filter(opp => 
        opp.client?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      if (searchResults.length > 0) {
        const found = searchResults[0];
        setAssistantActiveOpportunity(found);
        
        const response = generateCompleteStrategy(found);
        setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      } else {
        // Si no encuentra en CRM, ofrecer buscar en web
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ No encontré "${searchTerm}" en el CRM.\n\n` +
                   `**¿Qué quieres hacer?**\n\n` +
                   `[🔍 Buscar ${searchTerm} en internet|search:${searchTerm}]\n` +
                   `[📋 Ver todas las oportunidades|list:all]\n` +
                   `[➕ Crear nueva oportunidad|create:new]`
        }]);
      }
      setIsLoading(false);
      return;
    }

    // CASO 5: Listar oportunidades
    if (messageText.toLowerCase().includes('listar') || messageText.toLowerCase().includes('list')) {
      let listMessage = `📋 **TODAS LAS OPORTUNIDADES:**\n\n`;
      
      if (allOpportunities.length === 0) {
        listMessage = `📭 **No hay oportunidades en el pipeline**\n\n`;
        listMessage += `¿Quieres buscar una empresa nueva?\n`;
        listMessage += `Escribe: "buscar información de [nombre empresa]"`;
      } else {
        allOpportunities.slice(0, 10).forEach(opp => {
          const score = calculateHealthScore(opp.scales || {});
          listMessage += `**${opp.client}** - R$ ${opp.value?.toLocaleString('pt-BR')}\n`;
          listMessage += `  Etapa: ${opp.stage} | Score: ${score.toFixed(1)}/10\n`;
          listMessage += `  Vendedor: ${opp.vendor}\n`;
          listMessage += `  [Ver estrategia|select:${opp.id}]\n\n`;
        });
        
        if (allOpportunities.length > 10) {
          listMessage += `\n... y ${allOpportunities.length - 10} oportunidades más`;
        }
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: listMessage }]);
      setIsLoading(false);
      return;
    }

    // CASO 6: Preguntas complejas - LLAMAR A CLAUDE API (si está disponible)
    if (activeOpp && !intent) {
      try {
        // Preparar contexto completo para Claude
        const ventapelContext = {
          client: activeOpp.client,
          stage: activeOpp.stage,
          value: activeOpp.value,
          scales: activeOpp.scales,
          industry: activeOpp.industry,
          spinQuestions: spinQuestions,
          objectionHandlers: objectionHandlers,
          successCases: successCases[activeOpp.industry?.toLowerCase()] || successCases['e-commerce']
        };

        const response = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: messageText,
            opportunityData: activeOpp,
            vendorName: currentUser,
            ventapelContext: ventapelContext,
            intelligentContext: getIntelligentContext(activeOpp),
            similarDeals: similarDeals.slice(0, 3)
          })
        });

        if (response.ok) {
          const data = await response.json();
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.response 
          }]);
        } else {
          // Si el API falla, usar respuesta local inteligente
          let fallbackResponse = `📊 **Análisis para ${activeOpp.client}**\n\n`;
          
          // Intentar dar una respuesta útil basada en el contexto
          if (messageText.toLowerCase().includes('qué') || messageText.toLowerCase().includes('cómo')) {
            fallbackResponse += generateSmartNextAction(
              activeOpp, 
              {
                pain: getScaleValue(activeOpp.scales?.dor),
                power: getScaleValue(activeOpp.scales?.poder),
                vision: getScaleValue(activeOpp.scales?.visao),
                value: getScaleValue(activeOpp.scales?.valor),
                control: getScaleValue(activeOpp.scales?.controle),
                purchase: getScaleValue(activeOpp.scales?.compras)
              },
              [],
              getIntelligentContext(activeOpp)
            ).script;
          } else {
            fallbackResponse += generateCompleteStrategy(activeOpp);
          }
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: fallbackResponse 
          }]);
        }
      } catch (error) {
        console.error('Error llamando a Claude:', error);
        
        // Fallback con estrategia local
        const fallbackStrategy = generateCompleteStrategy(activeOpp);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: fallbackStrategy 
        }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // CASO 7: Sin cliente activo - Mensaje de ayuda mejorado
    const helpMessage = `
🤖 **SOY TU ASISTENTE DE VENTAS VENTAPEL**

Para ayudarte mejor, puedo:

**🔍 BUSCAR EMPRESAS EN INTERNET**
Ejemplo: "buscar información de Natura"
Ejemplo: "investigar Magazine Luiza"

**📊 ANALIZAR OPORTUNIDADES EXISTENTES**
Ejemplo: "MercadoLibre" (si ya está en CRM)
Ejemplo: "listar" (ver todas)

**🎯 GENERAR CONTENIDO DE VENTAS**
• "estrategia" - Plan completo de acción
• "email" - Email personalizado
• "script llamada" - Script SPIN
• "whatsapp" - Mensaje para WhatsApp
• "propuesta" - Propuesta comercial
• "calcular roi" - Análisis de ROI

**📅 ORGANIZAR TU SEMANA**
• "plan semanal" - Tu agenda optimizada

**Comandos rápidos:**
[🔍 Buscar empresa nueva|search:new]
[📋 Ver pipeline|list:opportunities]
[📅 Plan semanal|plan_semanal]
[💡 Ayuda|help]

¿Con qué quieres empezar?`;

    setMessages(prev => [...prev, { role: 'assistant', content: helpMessage }]);
    setIsLoading(false);
  };

  const handleActionClick = async (actionPayload) => {
    if (!actionPayload) return;

    const [action, ...params] = actionPayload.split(':');

    // Manejar búsqueda web desde botón
    if (action === 'search') {
      const searchTerm = params.join(':');
      if (searchTerm === 'new') {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: '🔍 **¿Qué empresa quieres investigar?**\n\nEscribe: "buscar información de [nombre empresa]"' 
        }]);
      } else {
        // Buscar empresa específica
        sendMessage(`buscar información de ${searchTerm}`);
      }
      return;
    }

    // Manejar creación de oportunidad
    if (action === 'create') {
      const companyName = params.join(':');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `➕ **Creando oportunidad para ${companyName}**\n\n` +
                 `Por favor, abre el formulario de nueva oportunidad y completa:\n` +
                 `• Cliente: ${companyName}\n` +
                 `• Etapa: 1 - Prospección\n` +
                 `• Valor estimado: Basado en la investigación\n\n` +
                 `[Formulario no disponible desde el chat - usa el botón principal del CRM]`
      }]);
      return;
    }

    // Manejar selección de oportunidad
    if (action === 'select') {
      const oppId = parseInt(params[0]);
      const selectedOpp = allOpportunities.find(o => o.id === oppId);
      if (selectedOpp) {
        setAssistantActiveOpportunity(selectedOpp);
        const strategy = generateCompleteStrategy(selectedOpp);
        setMessages(prev => [...prev, { role: 'assistant', content: strategy }]);
      }
      return;
    }

    // Manejar lista
    if (action === 'list') {
      sendMessage('listar');
      return;
    }

    // Manejar plan semanal
    if (action === 'plan_semanal') {
      sendMessage('plan semanal');
      return;
    }

    // Manejar ayuda
    if (action === 'help') {
      sendMessage('ayuda');
      return;
    }

    // Manejar actualización de scales (mantener código existente)
    if (action === 'update' && params.length >= 2) {
      const [scale, newValue, oppId] = params;
      const opportunityToUpdateId = oppId || getActiveOpportunity()?.id;
      
      if (!opportunityToUpdateId) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: No sé qué oportunidad actualizar.' }]);
        return;
      }

      setIsLoading(true);
      try {
        const currentOpp = allOpportunities.find(o => o.id === opportunityToUpdateId);
        const updatedScales = {
          ...(currentOpp?.scales || {}),
          [scale]: { 
            ...(currentOpp?.scales?.[scale] || {}),
            score: parseInt(newValue) 
          }
        };

        const { data, error } = await supabase
          .from('opportunities')
          .update({ 
            scales: updatedScales,
            last_update: new Date().toISOString()
          })
          .eq('id', opportunityToUpdateId)
          .select();

        if (error) throw error;

        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `✅ Actualizado! ${scale.toUpperCase()} = ${newValue}/10 para ${data[0].client}` 
        }]);

        await loadPipelineData();
      } catch (error) {
        console.error('Error:', error);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Error: ${error.message}` 
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getActiveOpportunity = () => {
    return assistantActiveOpportunity || currentOpportunity;
  };

  const getQuickActions = () => {
    const activeOpp = getActiveOpportunity();
    
    if (!activeOpp) {
      return [
        { icon: <Globe size={18} />, label: 'Buscar Empresa', prompt: 'buscar información de ' },
        { icon: <Database size={18} />, label: 'Ver Pipeline', prompt: 'listar' },
        { icon: <Calendar size={18} />, label: 'Plan Semanal', prompt: 'plan_semanal' },
        { icon: <Brain size={18} />, label: 'Ayuda', prompt: 'ayuda' }
      ];
    }
    
    return [
      { icon: <Brain size={18} />, label: 'Estrategia', prompt: 'estrategia' },
      { icon: <Mail size={18} />, label: 'Email', prompt: 'email' },
      { icon: <Phone size={18} />, label: 'Script', prompt: 'script llamada' },
      { icon: <DollarSign size={18} />, label: 'ROI', prompt: `calcular roi` }
    ];
  };

  return (
    <>
      {/* Panel de análisis PPVVCC */}
      {getActiveOpportunity() && analysis && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 mb-4 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-bold text-lg flex items-center">
              <Target className="mr-2" /> 
              {getActiveOpportunity().client}
              {analysis.context?.dataSource && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {analysis.context.dataSource}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{analysis.probability}%</div>
                <div className="text-xs text-gray-600">Probabilidad</div>
              </div>
            </div>
          </div>

          {/* Semáforo PPVVCC */}
          {getActiveOpportunity().scales && (
            <div className="grid grid-cols-6 gap-2 mb-4">
              {[
                { key: 'dor', label: 'DOR' },
                { key: 'poder', label: 'PODER' },
                { key: 'visao', label: 'VISÃO' },
                { key: 'valor', label: 'VALOR' },
                { key: 'controle', label: 'CTRL' },
                { key: 'compras', label: 'COMPRAS' }
              ].map(({ key, label }) => {
                const value = getScaleValue(getActiveOpportunity().scales[key]);
                const isCritical = value < 4;
                const isWarning = value >= 4 && value < 7;
                
                return (
                  <div key={key} className={`text-center p-2 rounded-lg transition-all ${
                    isCritical ? 'bg-red-500 animate-pulse' : 
                    isWarning ? 'bg-yellow-500' : 
                    'bg-green-500'
                  }`}>
                    <div className="text-white text-xs font-semibold">{label}</div>
                    <div className="text-white text-xl font-bold">{value}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Inconsistencias */}
          {analysis.inconsistencies?.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
              <h4 className="font-bold text-red-700 text-sm mb-2">
                <AlertTriangle className="inline mr-1 w-4 h-4" /> 
                PROBLEMAS DETECTADOS
              </h4>
              {analysis.inconsistencies.map((inc, idx) => (
                <div key={idx} className="mb-2 text-sm">
                  <div className="text-red-600">• {inc.message}</div>
                  <div className="text-xs text-gray-600 ml-4">Acción: {inc.action}</div>
                </div>
              ))}
            </div>
          )}

          {/* Próxima acción */}
          {analysis.nextAction && (
            <div className="bg-white p-3 rounded-lg border-2 border-blue-400">
              <h4 className="font-semibold text-sm mb-2 text-blue-700">
                <Zap className="inline mr-1 w-4 h-4" /> 
                Próxima Acción
              </h4>
              <p className="text-sm font-bold mb-2">{analysis.nextAction.action}</p>
              <div className="bg-blue-50 p-2 rounded">
                <p className="text-xs italic">"{analysis.nextAction.script}"</p>
              </div>
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => {
                    setIsOpen(true);
                    sendMessage('estrategia');
                  }}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700"
                >
                  Ver Estrategia →
                </button>
                <button 
                  onClick={() => {
                    setIsOpen(true);
                    sendMessage('email');
                  }}
                  className="bg-green-600 text-white px-3 py-1.5 rounded text-xs hover:bg-green-700"
                >
                  Generar Email →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-50"
      >
        <MessageCircle size={24} />
        {alerts.some(a => a.type === 'urgent') && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">🤖 Asistente de Ventas Ventapel</h3>
              <button onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
            {assistantActiveOpportunity && (
              <div className="text-xs bg-white/20 rounded px-2 py-1 mt-2">
                🎯 {assistantActiveOpportunity.client} | Etapa {assistantActiveOpportunity.stage}
              </div>
            )}
          </div>

          {/* Tabs de vista */}
          <div className="flex border-b bg-gray-50">
            <button
              onClick={() => setActiveView('chat')}
              className={`flex-1 py-2 text-xs font-medium ${activeView === 'chat' ? 'bg-white border-b-2 border-blue-500' : ''}`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveView('strategy')}
              className={`flex-1 py-2 text-xs font-medium ${activeView === 'strategy' ? 'bg-white border-b-2 border-blue-500' : ''}`}
            >
              🎯 Estrategia
            </button>
            <button
              onClick={() => setActiveView('scripts')}
              className={`flex-1 py-2 text-xs font-medium ${activeView === 'scripts' ? 'bg-white border-b-2 border-blue-500' : ''}`}
            >
              📝 Scripts
            </button>
            <button
              onClick={() => setActiveView('templates')}
              className={`flex-1 py-2 text-xs font-medium ${activeView === 'templates' ? 'bg-white border-b-2 border-blue-500' : ''}`}
            >
              📧 Templates
            </button>
          </div>

          {/* Quick Actions */}
          {activeView === 'chat' && (
            <div className="p-3 bg-gray-50 border-b">
              <div className="grid grid-cols-2 gap-2">
                {getQuickActions().map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(action.prompt)}
                    className="bg-white border-2 border-gray-300 rounded-lg px-3 py-2 text-xs hover:bg-blue-50 hover:border-blue-400 transition flex items-center gap-2"
                    disabled={isLoading}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeView === 'chat' && (
              <>
                {messages.length === 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="font-bold text-sm text-blue-700 mb-2">
                      👋 Hola {currentUser}! Soy tu coach de ventas
                    </p>
                    <div className="text-xs text-gray-600">
                      <p className="mb-2">Puedo ayudarte con:</p>
                      <ul className="ml-4 space-y-1">
                        <li>🔍 Buscar empresas en internet</li>
                        <li>📋 Estrategias completas de venta</li>
                        <li>📧 Emails persuasivos</li>
                        <li>📞 Scripts de llamadas SPIN</li>
                        <li>💰 Cálculos de ROI</li>
                        <li>🛡️ Manejo de objeciones</li>
                      </ul>
                      <p className="mt-3 font-semibold">
                        💡 Escribe "buscar información de [empresa]" para empezar
                      </p>
                    </div>
                  </div>
                )}
                
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-lg ${
                      msg.role === 'user' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <MessageRenderer content={msg.content} onButtonClick={handleActionClick} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 p-3 rounded-lg">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeView === 'strategy' && (
              <div className="space-y-4">
                <h4 className="font-bold text-gray-800">🎯 Estrategias Rápidas</h4>
                {getActiveOpportunity() ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('estrategia');
                      }}
                      className="w-full text-left p-3 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                      📋 Estrategia completa
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('calcular roi');
                      }}
                      className="w-full text-left p-3 bg-green-50 rounded-lg hover:bg-green-100"
                    >
                      💰 Calcular ROI
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('objeciones');
                      }}
                      className="w-full text-left p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100"
                    >
                      🛡️ Manejo de objeciones
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Selecciona un cliente primero</p>
                )}
              </div>
            )}

            {activeView === 'scripts' && (
              <div className="space-y-4">
                <h4 className="font-bold text-gray-800">📝 Scripts de Venta</h4>
                {getActiveOpportunity() ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('script llamada');
                      }}
                      className="w-full text-left p-3 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                      📞 Script de llamada SPIN
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('whatsapp');
                      }}
                      className="w-full text-left p-3 bg-green-50 rounded-lg hover:bg-green-100"
                    >
                      📱 Mensaje WhatsApp
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Selecciona un cliente primero</p>
                )}
              </div>
            )}

            {activeView === 'templates' && (
              <div className="space-y-4">
                <h4 className="font-bold text-gray-800">📧 Templates</h4>
                {getActiveOpportunity() ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('email');
                      }}
                      className="w-full text-left p-3 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                      📧 Email de seguimiento
                    </button>
                    <button
                      onClick={() => {
                        setActiveView('chat');
                        sendMessage('propuesta');
                      }}
                      className="w-full text-left p-3 bg-purple-50 rounded-lg hover:bg-purple-100"
                    >
                      📄 Propuesta comercial
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Selecciona un cliente primero</p>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          {activeView === 'chat' && (
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && sendMessage()}
                  placeholder="Buscar empresa o escribir pregunta..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AIAssistant;
