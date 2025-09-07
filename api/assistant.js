// api/assistant.js - VERSIÓN MEJORADA: Casos como evidencia, no como receta

export const config = {
 runtime: 'edge',
 maxDuration: 30,
};

// ============= CASOS DE ÉXITO REALES VENTAPEL - VERSIÓN AMPLIADA =============
const CASOS_EXITO_REALES = {
 'honda': {
   empresa: 'Honda Argentina',
   sector: 'Automotriz',
   problema: 'Velocidad limitada, 1% pérdidas, problemas ergonómicos',
   solucion: 'BP555 + Fita Gorilla 300m',
   resultados: {
     velocidad: '+40%',
     perdidas: '100% eliminadas',
     roi_meses: 3,
     inversion: 150000,
     ahorro_anual: 600000
   },
   tags: ['automotriz', 'concesionarias', 'alta-seguridad', 'ergonomía', 'ruido-laboral', 'espacio-limitado'],
   metricas_detalle: {
     empleados: '>1000',
     region: 'Argentina',
     mejora_ergonomia: 'Permitió diversidad de operadores',
     reduccion_ruido: 'Significativa'
   }
 },
 
 'loreal': {
   empresa: "L'Oréal Brasil",
   sector: 'Cosmética',
   problema: '+10% pérdidas por robo, cuellos de botella',
   solucion: 'RSA + Fita Gorilla 700m',
   resultados: {
     robos: '100% eliminados',
     eficiencia: '+50%',
     roi_meses: 3,
     inversion: 280000,
     ahorro_anual: 2500000,
     capacidad: '12 cajas/minuto',
     trazabilidad: '100% implementada'
   },
   tags: ['cosmética', 'alto-valor', 'anti-robo', 'trazabilidad', 'ROI-rápido', 'espacio-limitado'],
   metricas_detalle: {
     empleados: '>5000',
     region: 'Brasil',
     volumen: 'Alto volumen diario',
     espacio: 'Sin posibilidad de expansión'
   }
 },
 
 'nike': {
   empresa: 'Nike Brasil',
   sector: 'Calzado/Textil',
   problema: '10% pérdidas en transporte',
   solucion: 'BP755 + Fita Gorilla 300m',
   resultados: {
     perdidas: '100% eliminadas',
     eficiencia: '+30%',
     roi_meses: 2,
     inversion: 200000,
     ahorro_anual: 1200000,
     disputas: '100% reducción con transportadoras'
   },
   tags: ['textil', 'calzado', 'e-commerce', 'transportadoras', 'salud-ocupacional', 'ROI-rápido'],
   metricas_detalle: {
     empleados: '>3000',
     region: 'Brasil',
     problema_salud: 'Dolores en operadores eliminados',
     control_visual: 'Mejorado inmediatamente'
   }
 },
 
 'mercadolibre': {
   empresa: 'MercadoLibre',
   sector: 'E-commerce',
   problema: 'Alto retrabajo, pérdidas en fulfillment',
   solucion: 'BP555e + Fita VENOM',
   resultados: {
     retrabajo: '-100%',
     ahorro_mensual: 180000,
     roi_meses: 2,
     inversion: 360000
   },
   tags: ['e-commerce', 'marketplace', 'fulfillment', 'alto-volumen'],
   metricas_detalle: {
     tipo_operacion: 'Fulfillment center',
     picos: 'Estacionales significativos'
   }
 },

'correo_argentino': {
  empresa: 'Correo Argentino',
  sector: 'Logística/Postal',
  problema: 'Robos de celulares en tránsito, departamento de seguridad cuestionaba la cinta gomada por posible violación sin evidencia',
  solucion: 'BP555e + Fita VENOM + protocolo de cierre estandarizado + proceso de verificación inmediata',
  resultados: {
    robos: 'Detección inmediata de violaciones',
    evidencia: '100% trazabilidad de apertura',
    proceso: 'Estandarización completa del cierre',
    roi_meses: 2, // Estimado típico para seguridad
    inversion: 180000 // Estimado basado en volumen postal
  },
  tags: ['logística', 'postal', 'anti-robo', 'celulares', 'alta-seguridad', 'trazabilidad', 'protocolo'],
  metricas_detalle: {
    region: 'Argentina',
    tipo_carga: 'Celulares y electrónicos',
    solucion_clave: 'Protocolo de detección: cliente reporta inmediatamente cualquier anomalía en peso o apariencia',
    mejora_proceso: 'Cierre estandarizado permite detección visual inmediata de violación',
    departamento_involucrado: 'Seguridad y prevención de robos'
  },
  aprendizaje_clave: 'La cinta gomada SIEMPRE deja evidencia de violación. El éxito depende de: 1) Estandarizar el método de cierre, 2) Entrenar al receptor para detectar anomalías, 3) Protocolo de reporte inmediato'
},
 
 'pet_usa': {
   empresa: 'Pet Supplies Company',
   sector: 'E-commerce/Pet',
   problema: 'Tiempo 8+ min/caja, desperdicio 14.6m cinta/caja',
   solucion: '24 unidades BP con WAT',
   resultados: {
     reduccion_tiempo: '87.5% (de 8 min a <1 min)',
     reduccion_cinta: '75%',
     productividad: '+800% por operador',
     roi_meses: 1,
     inversion: 550000
   },
   tags: ['pet', 'suscripción', 'e-commerce', 'fulfillment', 'alta-frecuencia', 'multi-sitio'],
   metricas_detalle: {
     empleados: '>500',
     region: 'USA',
     modelo: 'Suscripción con alta frecuencia',
     expansion: 'Implementado en múltiples ubicaciones'
   }
 },

 'fulfillment_3pl': {
   empresa: 'Centro Logística Fulfillment',
   sector: 'E-commerce/3PL',
   problema: 'No podían mantener demanda, alto riesgo lesiones',
   solucion: '20 dispensadores BP 555eS',
   resultados: {
     productividad: '+100%',
     uso_cinta: '-66% (de 3 a 1 tira)',
     lesiones: '0 reportadas post-implementación',
     satisfaccion: '100% aprobación operadores',
     roi_meses: 0,
     inversion: 440000
   },
   tags: ['fulfillment', '3PL', 'picos-estacionales', 'ergonomía', 'alto-volumen', 'ROI-inmediato'],
   metricas_detalle: {
     empleados: '>1000',
     region: 'Internacional',
     picos: 'Navidad y promociones',
     presentacion: 'Mejorada significativamente'
   }
 },

 'meal_kit': {
   empresa: 'Meal Kit Delivery',
   sector: 'Alimentos Frescos',
   problema: '150k kits/semana, necesidad sustentabilidad, cadena frío crítica',
   solucion: 'Chill-R + Selladoras IPG + X-Pad + Tishma Vision',
   resultados: {
     valor_termico: 'Superior a 3 competidores',
     reduccion_refrigerante: '30%',
     facturacion_actual: 66000000,
     proyeccion_adicional: 110000000,
     roi_meses: 6,
     inversion: 2200000
   },
   tags: ['alimentos', 'cadena-frío', 'sustentable', 'alto-volumen', 'meal-kit', 'automatización-completa'],
   metricas_detalle: {
     volumen: '150.000 kits/semana',
     region: 'USA',
     sustentabilidad: 'Material reciclable implementado',
     optimizacion: 'Por ruta y estación'
   }
 },

 'multi_florida': {
   empresa: 'Empresa Multi-ubicación Florida',
   sector: 'Multi-sector',
   problema: 'Necesidad solución integral, competencia prometía 4-5 meses',
   solucion: 'Bundle: Film stretch + CST impreso + evaluación TAS',
   resultados: {
     tiempo_implementacion: 'Inmediato vs 4-5 meses competencia',
     cobertura: '100% de ubicaciones',
     ventaja_competitiva: 'Velocidad de respuesta',
     roi_meses: 2,
     inversion: 330000
   },
   tags: ['multi-sitio', 'bundle-completo', 'implementación-rápida', 'ventaja-competitiva'],
   metricas_detalle: {
     tipo: 'Múltiples ubicaciones',
     region: 'USA - Florida',
     urgencia: 'Alta',
     evaluacion: 'TAS completa en todos los sitios'
   }
 },

 '3pl_canada': {
   empresa: '3PL Canadiense - Autopartes',
   sector: 'Logística/Autopartes',
   problema: 'Programa invernal urgente, alta demanda estacional',
   solucion: '2 selladoras USA-2024-WAT (superior/inferior)',
   resultados: {
     consolidacion: '4 máquinas reemplazadas por 2',
     productividad: '+50%',
     reduccion_mano_obra: '50%',
     costos_operacionales: '-40%',
     roi_meses: 3,
     inversion: 385000
   },
   tags: ['3PL', 'autopartes', 'estacional', 'primera-instalación', 'heavy-duty', 'canadá'],
   metricas_detalle: {
     region: 'Canadá',
     tipo: 'Primera instalación automatizada WAT en Canadá',
     restricciones: 'No afectar RRHH ni seguridad',
     especificaciones: 'Motores 1/3 HP para cajas pesadas'
   }
 },

 'interbras': {
   empresa: 'Interbras',
   sector: 'Logística/Distribución',
   problema: '15-30% cajas reutilizadas, robos frecuentes, cortes operarios',
   solucion: '3x BP555e + 3x BP333 + Cinta 80mm',
   resultados: {
     cajas_reutilizadas: 'Problema resuelto con cinta 80mm',
     robos: 'En proceso de medición',
     ergonomia: 'Mejora significativa esperada',
     roi_meses: 4,
     inversion: 360000
   },
   tags: ['logística', 'distribución', 'cajas-reutilizadas', 'anti-robo', 'ergonomía', 'alto-volumen'],
   metricas_detalle: {
     galpon: '48.000 m2',
     volumen_normal: '600-700 cajas/día',
     volumen_pico: '1.000 cajas/día',
     concentracion: '90% del volumen en este centro',
     bancadas: '6 subutilizadas'
   }
 }
};

// ============= MÉTRICAS AGREGADAS PARA BENCHMARKING =============
const METRICAS_BENCHMARK = {
 roi_por_sector: {
   'Cosmética/Alto valor': { min: 2, max: 3, promedio: 2.5 },
   'E-commerce/Fulfillment': { min: 0, max: 2, promedio: 1 },
   'Automotriz': { min: 2, max: 4, promedio: 3 },
   'Alimentos frescos': { min: 6, max: 12, promedio: 9 },
   'Logística/3PL': { min: 2, max: 3, promedio: 2.5 }
 },
 
 mejoras_productividad: {
   'automatizacion_completa': { min: 50, max: 100, promedio: 75 },
   'semi_automatizacion': { min: 30, max: 50, promedio: 40 },
   'mejoras_ergonomicas': { min: 20, max: 40, promedio: 30 }
 },
 
 reduccion_perdidas: {
   'robos_hurtos': { min: 90, max: 100, promedio: 100 },
   'danos_transporte': { min: 90, max: 100, promedio: 95 },
   'disputas_transportadoras': { min: 80, max: 100, promedio: 90 }
 },
 
 inversion_por_tamano: {
   'pequena': { min: 150000, max: 300000, estaciones: '1-5' },
   'mediana': { min: 300000, max: 600000, estaciones: '5-20' },
   'grande': { min: 600000, max: 2500000, estaciones: '20+' }
 }
};

// ============= HELPERS =============
function getScaleValue(scale) {
 if (!scale) return 0;
 if (typeof scale === 'object' && scale.score !== undefined) return scale.score;
 if (typeof scale === 'number') return scale;
 return 0;
}

function calculateHealthScore(scales) {
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
 return values.length > 0 ? (sum / values.length).toFixed(1) : 0;
}

function getDaysSinceLastContact(lastUpdate) {
 if (!lastUpdate) return 999;
 const last = new Date(lastUpdate);
 const now = new Date();
 return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// ============= FUNCIÓN MEJORADA PARA BUSCAR CASOS RELEVANTES =============
function findRelevantCases(opportunity) {
 if (!opportunity) return [];
 
 const relevantCases = [];
 const oppTags = [];
 
 // Generar tags de la oportunidad actual
 if (opportunity.industry) {
   oppTags.push(opportunity.industry.toLowerCase());
 }
 if (opportunity.value > 500000) {
   oppTags.push('enterprise', 'alto-volumen');
 }
 if (opportunity.scales?.dor?.description?.includes('robo')) {
   oppTags.push('anti-robo');
 }
 if (opportunity.scales?.dor?.description?.includes('ergon')) {
   oppTags.push('ergonomía');
 }
 
 // Buscar casos con tags coincidentes
 Object.entries(CASOS_EXITO_REALES).forEach(([key, caso]) => {
   let score = 0;
   
   // Coincidencia por sector
   if (caso.sector.toLowerCase().includes(opportunity.industry?.toLowerCase() || '')) {
     score += 3;
   }
   
   // Coincidencia por tags
   if (caso.tags) {
     caso.tags.forEach(tag => {
       if (oppTags.includes(tag)) {
         score += 1;
       }
     });
   }
   
   // Coincidencia por problema similar
   if (opportunity.scales?.dor?.description && caso.problema) {
     const problemWords = opportunity.scales.dor.description.toLowerCase().split(' ');
     const casoWords = caso.problema.toLowerCase().split(' ');
     const matches = problemWords.filter(word => casoWords.includes(word));
     score += matches.length * 0.5;
   }
   
   if (score > 0) {
     relevantCases.push({ ...caso, score, key });
   }
 });
 
 // Ordenar por relevancia y devolver top 3
 return relevantCases
   .sort((a, b) => b.score - a.score)
   .slice(0, 3);
}

// ============= MOTOR DE ANÁLISIS DE PIPELINE =============
function analyzePipelineHealth(opportunities) {
 if (!opportunities || opportunities.length === 0) {
   return {
     total: 0,
     totalValue: 0,
     atRisk: 0,
     riskValue: 0,
     averageHealth: 0,
     topDeals: [],
     vendorPerformance: {}
   };
 }

 const totalValue = opportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
 const weightedValue = opportunities.reduce((sum, opp) => 
   sum + ((opp.value || 0) * (opp.probability || 0) / 100), 0
 );
 
 // Oportunidades en riesgo (health < 4 o sin contacto > 7 días)
 const riskOpps = opportunities.filter(opp => {
   const health = parseFloat(calculateHealthScore(opp.scales));
   const daysSince = getDaysSinceLastContact(opp.last_update);
   return health < 4 || daysSince > 7;
 });

 // Top deals para cerrar este mes
 const topDeals = opportunities
   .filter(opp => {
     const health = parseFloat(calculateHealthScore(opp.scales));
     return health > 6 && opp.stage >= 3;
   })
   .sort((a, b) => b.value - a.value)
   .slice(0, 5)
   .map(deal => ({
     client: deal.client,
     value: deal.value,
     health: calculateHealthScore(deal.scales),
     vendor: deal.vendor,
     action: deal.stage === 5 ? 'CERRAR YA' : 'Acelerar cierre'
   }));

 // Performance por vendedor
 const vendorPerformance = {};
 opportunities.forEach(opp => {
   if (!opp.vendor) return;
   if (!vendorPerformance[opp.vendor]) {
     vendorPerformance[opp.vendor] = {
       count: 0,
       totalValue: 0,
       avgHealth: 0,
       closed: 0
     };
   }
   vendorPerformance[opp.vendor].count++;
   vendorPerformance[opp.vendor].totalValue += opp.value || 0;
   vendorPerformance[opp.vendor].avgHealth += parseFloat(calculateHealthScore(opp.scales));
   if (opp.stage === 6) vendorPerformance[opp.vendor].closed++;
 });

 // Calcular promedios
 Object.keys(vendorPerformance).forEach(vendor => {
   vendorPerformance[vendor].avgHealth = 
     (vendorPerformance[vendor].avgHealth / vendorPerformance[vendor].count).toFixed(1);
 });

 return {
   total: opportunities.length,
   totalValue,
   weightedValue,
   atRisk: riskOpps.length,
   riskValue: riskOpps.reduce((sum, opp) => sum + (opp.value || 0), 0),
   averageHealth: (opportunities.reduce((sum, opp) => 
     sum + parseFloat(calculateHealthScore(opp.scales)), 0) / opportunities.length).toFixed(1),
   topDeals,
   vendorPerformance
 };
}

// ============= ANÁLISIS DE OPORTUNIDAD INDIVIDUAL =============
function analyzeOpportunity(opportunity) {
 if (!opportunity) return null;

 const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
 const daysSince = getDaysSinceLastContact(opportunity.last_update);
 
 // Calcular probabilidad basada en escalas
 let probability = 0;
 if (healthScore >= 8) probability = 85;
 else if (healthScore >= 7) probability = 70;
 else if (healthScore >= 5) probability = 40;
 else if (healthScore >= 3) probability = 20;
 else probability = 5;

 // Ajustar por días sin contacto
 if (daysSince > 30) probability = Math.max(probability - 50, 5);
 else if (daysSince > 14) probability = Math.max(probability - 20, 10);
 else if (daysSince > 7) probability = Math.max(probability - 10, 15);

 // Identificar escalas críticas
 const criticalScales = [];
 const scales = opportunity.scales || {};
 
 const dorScore = getScaleValue(scales.dor || scales.pain);
 const poderScore = getScaleValue(scales.poder || scales.power);
 const visaoScore = getScaleValue(scales.visao || scales.vision);
 const valorScore = getScaleValue(scales.valor || scales.value);
 const controleScore = getScaleValue(scales.controle || scales.control);
 const comprasScore = getScaleValue(scales.compras || scales.purchase);

 if (dorScore < 5) {
   criticalScales.push({
     name: 'DOR',
     value: dorScore,
     issue: 'Cliente no admite el problema',
     action: 'Aplicar técnica SPIN para elevar dolor'
   });
 }
 if (poderScore < 4) {
   criticalScales.push({
     name: 'PODER',
     value: poderScore,
     issue: 'Sin acceso al decisor',
     action: 'Identificar y acceder al Power Sponsor'
   });
 }
 if (visaoScore < 4) {
   criticalScales.push({
     name: 'VISÃO',
     value: visaoScore,
     issue: 'Cliente no ve la solución',
     action: 'Demo con caso de éxito relevante'
   });
 }
 if (valorScore < 4) {
   criticalScales.push({
     name: 'VALOR',
     value: valorScore,
     issue: 'ROI no percibido',
     action: 'Calcular y presentar ROI específico'
   });
 }

 return {
   healthScore,
   probability,
   daysSince,
   criticalScales,
   scaleBreakdown: {
     dor: dorScore,
     poder: poderScore,
     visao: visaoScore,
     valor: valorScore,
     controle: controleScore,
     compras: comprasScore
   }
 };
}

// ============= GENERACIÓN DE ALERTAS INTELIGENTES =============
function generateAlerts(opportunity, pipelineContext) {
 const alerts = [];
 if (!opportunity) return alerts;

 const daysSince = getDaysSinceLastContact(opportunity.last_update);
 const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
 const scales = opportunity.scales || {};

 // Alerta por días sin contacto
 if (daysSince > 30) {
   alerts.push({
     type: 'critical',
     priority: 1,
     message: `💀 DEAL MUERTO: ${daysSince} días sin contacto`,
     action: 'Llamar HOY con oferta especial o descartar'
   });
 } else if (daysSince > 14) {
   alerts.push({
     type: 'urgent',
     priority: 2,
     message: `🔴 URGENTE: ${daysSince} días sin contacto - Deal enfriándose`,
     action: 'Email de reactivación + llamada en 24h'
   });
 } else if (daysSince > 7) {
   alerts.push({
     type: 'warning',
     priority: 3,
     message: `⚠️ ATENCIÓN: ${daysSince} días sin contacto`,
     action: 'Enviar email con nuevo caso de éxito'
   });
 }

 // Alerta por valor en riesgo
 if (healthScore < 4 && opportunity.value > 100000) {
   alerts.push({
     type: 'critical',
     priority: 1,
     message: `💣 R$ ${opportunity.value.toLocaleString('pt-BR')} EN RIESGO CRÍTICO (Health: ${healthScore}/10)`,
     action: 'Reunión de emergencia con decisor o escalar a CEO'
   });
 } else if (healthScore < 5 && opportunity.value > 50000) {
   alerts.push({
     type: 'urgent',
     priority: 2,
     message: `⚠️ Deal de R$ ${opportunity.value.toLocaleString('pt-BR')} necesita intervención`,
     action: 'Plan de recuperación en 48h'
   });
 }

 // Alerta por inconsistencia PPVVCC
 const dorScore = getScaleValue(scales.dor || scales.pain);
 const poderScore = getScaleValue(scales.poder || scales.power);
 
 if (opportunity.stage >= 3 && dorScore < 5) {
   alerts.push({
     type: 'warning',
     priority: 2,
     message: `⛔ FRENO: En etapa '${opportunity.stage}' sin DOLOR confirmado (${dorScore}/10)`,
     action: 'Volver a Cualificación - No avanzar sin dolor'
   });
 }

 if (opportunity.stage >= 4 && poderScore < 4) {
   alerts.push({
     type: 'warning',
     priority: 2,
     message: `⛔ FRENO: Intentando cerrar sin acceso al PODER (${poderScore}/10)`,
     action: 'Conseguir sponsor para llegar al decisor'
   });
 }

 // Alerta por oportunidad caliente
 if (healthScore >= 8 && opportunity.stage < 5) {
   alerts.push({
     type: 'opportunity',
     priority: 3,
     message: `🔥 OPORTUNIDAD: Deal caliente (${healthScore}/10) - Acelerar cierre`,
     action: 'Proponer contrato esta semana'
   });
 }

 // Ordenar por prioridad
 return alerts.sort((a, b) => a.priority - b.priority);
}

// ============= NEXT BEST ACTION INTELIGENTE =============
function generateNextBestAction(opportunity, pipelineContext) {
 if (!opportunity?.scales) return null;

 const daysSince = getDaysSinceLastContact(opportunity.last_update);
 const healthScore = parseFloat(calculateHealthScore(opportunity.scales));
 const scales = opportunity.scales || {};
 
 const dorScore = getScaleValue(scales.dor || scales.pain);
 const poderScore = getScaleValue(scales.poder || scales.power);
 const visaoScore = getScaleValue(scales.visao || scales.vision);
 const valorScore = getScaleValue(scales.valor || scales.value);
 const controleScore = getScaleValue(scales.controle || scales.control);

 // Prioridad 1: Deals muertos
 if (daysSince > 30) {
   return {
     priority: 'CRÍTICA',
     title: '💀 DEAL MUERTO - Última oportunidad',
     action: 'Llamada de rescate HOY',
     strategy: 'Crear urgencia con oferta limitada',
     script: `"${opportunity.sponsor || 'Hola'}, hace ${daysSince} días que no hablamos. Tengo una oferta especial de 20% descuento válida solo esta semana. ¿15 minutos hoy para verla?"`,
     expectedOutcome: 'Reactivar o descartar definitivamente'
   };
 }

 // Prioridad 2: Deals fríos
 if (daysSince > 7) {
   return {
     priority: 'URGENTE',
     title: `🔴 ${daysSince} días sin contacto - Reactivar YA`,
     action: 'Email + Llamada en 2 horas',
     strategy: 'Usar competencia o pérdida como trigger',
     script: `ASUNTO: "${opportunity.client} - ¿Siguen perdiendo R$ ${Math.round(opportunity.value * 0.15).toLocaleString('pt-BR')}/mes?"\n\nCONTENIDO: "Vi que ${opportunity.competitor || 'su competidor'} ya implementó nuestra solución. ¿Vale 15 minutos para ver los resultados?"`,
     expectedOutcome: 'Reunión agendada en 48h'
   };
 }

 // Prioridad 3: Sin dolor admitido
 if (dorScore < 5) {
   return {
     priority: 'ALTA',
     title: '🎯 Sin DOLOR = Sin venta',
     action: 'Sesión SPIN profunda',
     strategy: 'Cuantificar pérdidas ocultas',
     script: `"${opportunity.client}, con su volumen de ${Math.round(opportunity.value/100)} cajas/mes, ¿cuánto les cuesta cada caja que se abre en tránsito? ¿Y el tiempo de retrabajo?"`,
     expectedOutcome: 'Dolor admitido y cuantificado'
   };
 }

 // Prioridad 4: Sin acceso al poder
 if (poderScore < 4) {
   return {
     priority: 'ALTA',
     title: '👔 Necesitas el DECISOR',
     action: 'Escalar esta semana',
     strategy: 'Hacer que el contacto sea el héroe',
     script: `"${opportunity.sponsor}, para garantizar el ROI de R$ ${Math.round(opportunity.value * 2.5).toLocaleString('pt-BR')}/año, necesito que me ayudes a preparar los números para tu jefe. ¿Lo presentamos juntos?"`,
     expectedOutcome: 'Reunión con decisor en 7 días'
   };
 }

 // Prioridad 5: Sin visión clara
 if (visaoScore < 5) {
   return {
     priority: 'MEDIA',
     title: '👁️ Construir VISIÓN de solución',
     action: 'Demo personalizada',
     strategy: 'Mostrar el futuro sin problemas actuales',
     script: `"Imagina tu operación sin cajas abiertas, sin reclamos, con 30% menos tiempo de cerrado. Te muestro exactamente cómo lograrlo con tu volumen específico."`,
     expectedOutcome: 'Visión clara y diferenciada'
   };
 }

 // Prioridad 6: Sin valor percibido
 if (valorScore < 5) {
   return {
     priority: 'MEDIA',
     title: '💰 Demostrar ROI concreto',
     action: 'Presentar business case',
     strategy: 'Números específicos del cliente',
     script: `"Preparé un análisis específico para ${opportunity.client}: inversión de R$ ${Math.round(opportunity.value * 0.5).toLocaleString('pt-BR')}, ahorro anual de R$ ${Math.round(opportunity.value * 1.8).toLocaleString('pt-BR')}. ¿Lo revisamos juntos?"`,
     expectedOutcome: 'ROI validado y aceptado'
   };
 }

 // Prioridad 7: Listo para cerrar
 if (dorScore >= 7 && poderScore >= 6 && valorScore >= 6 && controleScore >= 6) {
   return {
     priority: 'OPORTUNIDAD',
     title: '🏆 CERRAR ESTA SEMANA',
     action: 'Presionar para firma',
     strategy: 'Crear urgencia positiva',
     script: `"${opportunity.power_sponsor || opportunity.sponsor}, ya validamos todo: problema, solución y ROI. Puedo comenzar implementación el lunes. ¿Firmamos hoy para aprovechar el descuento del mes?"`,
     expectedOutcome: 'Contrato firmado en 72h'
   };
 }

 // Default: Mantener momentum
 return {
   priority: 'NORMAL',
   title: '📈 Mantener momentum',
   action: 'Avanzar metodología',
   strategy: 'Siguiente paso según PPVVCC',
   script: 'Revisar escalas y avanzar la más baja',
   expectedOutcome: 'Progreso en escalas'
 };
}

// ============= QUICK ACTIONS DINÁMICAS =============
function generateQuickActions(opportunity, alerts) {
 if (!opportunity) {
   return [
     {
       icon: '📊',
       label: 'Ver pipeline completo',
       prompt: 'Muéstrame un análisis del pipeline completo con oportunidades en riesgo',
       color: 'bg-blue-500'
     },
     {
       icon: '🏆',
       label: 'Top deals para cerrar',
       prompt: '¿Cuáles son los 5 mejores deals para cerrar este mes?',
       color: 'bg-green-500'
     }
   ];
 }

 const actions = [];
 const scales = opportunity.scales || {};
 const dorScore = getScaleValue(scales.dor || scales.pain);
 const poderScore = getScaleValue(scales.poder || scales.power);
 const valorScore = getScaleValue(scales.valor || scales.value);
 const comprasScore = getScaleValue(scales.compras || scales.purchase);

 // Acciones basadas en escalas bajas
 if (dorScore < 5) {
   actions.push({
     icon: '🎯',
     label: 'Elevar dolor',
     prompt: `Dame 5 preguntas SPIN específicas para que ${opportunity.client} admita sus pérdidas por cajas abiertas y retrabajo`,
     color: 'bg-red-500'
   });
 }

 if (poderScore < 4) {
   actions.push({
     icon: '👔',
     label: 'Acceder al decisor',
     prompt: `Script exacto para pedirle a ${opportunity.sponsor || 'mi contacto'} que me presente al decisor de ${opportunity.client}`,
     color: 'bg-purple-500'
   });
 }

 if (valorScore < 5) {
   actions.push({
     icon: '💰',
     label: 'Calcular ROI',
     prompt: `Calcula el ROI específico para ${opportunity.client} con volumen de ${Math.round(opportunity.value/100)} cajas/mes`,
     color: 'bg-green-500'
   });
 }

 if (comprasScore < 4) {
   actions.push({
     icon: '📝',
     label: 'Navegar compras',
     prompt: `${opportunity.client} tiene proceso de compras complejo. Dame estrategia para evitar compulsa y acelerar aprobación`,
     color: 'bg-yellow-500'
   });
 }

 // Acciones basadas en alertas
 if (alerts && alerts.length > 0) {
   if (alerts[0].type === 'critical') {
     actions.push({
       icon: '🚨',
       label: 'Plan de rescate',
       prompt: `${opportunity.client} está en riesgo crítico. Dame un plan de rescate de emergencia para salvar este deal de R$ ${opportunity.value.toLocaleString('pt-BR')}`,
       color: 'bg-red-600'
     });
   } else if (alerts[0].type === 'urgent') {
     actions.push({
       icon: '📧',
       label: 'Email reactivación',
       prompt: `Escribe un email potente para reactivar a ${opportunity.client} después de ${getDaysSinceLastContact(opportunity.last_update)} días sin contacto`,
       color: 'bg-orange-500'
     });
   }
 }

 // Acciones generales siempre disponibles
 if (actions.length < 5) {
   actions.push({
     icon: '📊',
     label: 'Análisis PPVVCC',
     prompt: `Análisis completo PPVVCC de ${opportunity.client} con acciones específicas para subir cada escala`,
     color: 'bg-indigo-500'
   });
 }

 if (actions.length < 6) {
   actions.push({
     icon: '🎬',
     label: 'Preparar demo',
     prompt: `¿Cómo estructuro una demo ganadora para ${opportunity.client} en ${opportunity.industry || 'su industria'}?`,
     color: 'bg-blue-500'
   });
 }

 return actions.slice(0, 6);
}

// ============= BÚSQUEDA EN GOOGLE (si está configurada) =============
async function searchGoogleForContext(query) {
 const SERPER_API_KEY = process.env.SERPER_API_KEY;
 if (!SERPER_API_KEY) {
   return null;
 }
 
 try {
   const response = await fetch('https://google.serper.dev/search', {
     method: 'POST',
     headers: {
       'X-API-KEY': SERPER_API_KEY,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       q: query,
       gl: 'br',
       hl: 'pt',
       num: 5,
       type: 'search'
     })
   });
   
   const data = await response.json();
   
   if (data.organic && data.organic.length > 0) {
     const results = data.organic.map(r => ({
       title: r.title,
       snippet: r.snippet,
       link: r.link
     }));
     
     return results.map((r, idx) => 
       `${idx + 1}. ${r.title}\n   ${r.snippet}`
     ).join('\n\n');
   }
   return null;
 } catch (error) {
   console.error('Error buscando en Google:', error);
   return null;
 }
}

// ============= MOTOR DE ANÁLISIS COMPLETO =============
function buildCompleteAnalysis(opportunityData, pipelineData, vendorName) {
 const analysis = {
   timestamp: new Date().toISOString(),
   opportunity: null,
   pipeline: null,
   alerts: [],
   nextBestAction: null,
   quickActions: [],
   insights: [],
   relevantCases: []
 };

 // Análisis del pipeline
 if (pipelineData?.allOpportunities) {
   analysis.pipeline = analyzePipelineHealth(pipelineData.allOpportunities);
   
   // Insights del pipeline
   if (analysis.pipeline.atRisk > 0) {
     analysis.insights.push({
       type: 'warning',
       message: `📊 ${analysis.pipeline.atRisk} oportunidades en riesgo por R$ ${analysis.pipeline.riskValue.toLocaleString('pt-BR')}`
     });
   }
   
   if (analysis.pipeline.topDeals.length > 0) {
     analysis.insights.push({
       type: 'opportunity',
       message: `🎯 ${analysis.pipeline.topDeals.length} deals listos para cerrar este mes`
     });
   }
 }

 // Análisis de la oportunidad actual
 if (opportunityData) {
   analysis.opportunity = analyzeOpportunity(opportunityData);
   analysis.alerts = generateAlerts(opportunityData, pipelineData);
   analysis.nextBestAction = generateNextBestAction(opportunityData, pipelineData);
   analysis.quickActions = generateQuickActions(opportunityData, analysis.alerts);
   analysis.relevantCases = findRelevantCases(opportunityData);
   
   // Insights de la oportunidad
   if (analysis.opportunity.probability > 70) {
     analysis.insights.push({
       type: 'success',
       message: `✅ ${opportunityData.client}: Alta probabilidad de cierre (${analysis.opportunity.probability}%)`
     });
   } else if (analysis.opportunity.probability < 30) {
     analysis.insights.push({
       type: 'danger',
       message: `⚠️ ${opportunityData.client}: Baja probabilidad (${analysis.opportunity.probability}%)`
     });
   }

   // Insight basado en casos similares
   if (analysis.relevantCases.length > 0) {
     const avgRoi = analysis.relevantCases.reduce((sum, c) => sum + (c.resultados.roi_meses || 3), 0) / analysis.relevantCases.length;
     analysis.insights.push({
       type: 'info',
       message: `📚 ${analysis.relevantCases.length} casos similares con ROI promedio: ${Math.round(avgRoi)} meses`
     });
   }
 }

 // Análisis del vendedor
 if (vendorName && analysis.pipeline?.vendorPerformance?.[vendorName]) {
   const vendorStats = analysis.pipeline.vendorPerformance[vendorName];
   analysis.vendor = {
     name: vendorName,
     stats: vendorStats,
     performance: vendorStats.avgHealth > 6 ? 'excellent' : 
                  vendorStats.avgHealth > 4 ? 'good' : 'needs-improvement'
   };
 }

 return analysis;
}

// ============= LLAMADA A CLAUDE API MEJORADA - CASOS COMO EVIDENCIA =============
async function callClaudeAPI(opportunityData, userInput, ventapelContext, toolsAvailable, webSearchResults = null, completeAnalysis = null) {
 const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
 
 if (!ANTHROPIC_API_KEY) {
   console.log('⚠️ Claude API no configurada, usando análisis local');
   return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
 }

 const toolDescriptions = toolsAvailable.map(t => 
   `- **${t.name}**: ${t.description}`
 ).join('\n');

 // Preparar casos relevantes como referencia opcional
 const relevantCasesForReference = completeAnalysis?.relevantCases?.length > 0 
   ? completeAnalysis.relevantCases.map(c => ({
       empresa: c.empresa,
       problema: c.problema,
       roi_meses: c.resultados.roi_meses,
       key_metric: c.resultados.perdidas || c.resultados.robos || c.resultados.productividad
     }))
   : [];

 const promptTemplate = `Eres "Ventus", un coach de ventas experto en metodología PPVVCC de Ventapel Brasil.
Tu CEO te describió como: "directo, sin vueltas, basado en evidencia y lógica". NO uses adulación ni frases motivacionales vacías.

**ESTRUCTURA OBLIGATORIA DE TUS RESPUESTAS:**

1. **DIAGNÓSTICO** - Qué está pasando realmente (análisis de la situación)
2. **ESTRATEGIA** - Por qué es importante actuar (el principio detrás)
3. **TÁCTICA** - Qué hacer específicamente (acciones concretas)
4. **EVIDENCIA** - Solo si aplica, menciona UN caso relevante como prueba (opcional)

**REGLAS CRÍTICAS:**
- NUNCA empieces con "En el caso de X empresa..." 
- PRIMERO explica QUÉ hacer y POR QUÉ
- Los casos son EVIDENCIA OPCIONAL al final, no el punto de partida
- Si mencionas un caso, que sea para reforzar credibilidad, no como receta
- Personaliza TODO al contexto específico del cliente actual

---
**CONTEXTO ACTUAL:**

Cliente: ${opportunityData?.client || 'No seleccionado'}
Industria: ${opportunityData?.industry || 'No especificada'}
Valor deal: R$ ${opportunityData?.value?.toLocaleString('pt-BR') || '0'}
Stage: ${opportunityData?.stage || 0}/6

**ANÁLISIS PPVVCC:**
${completeAnalysis?.opportunity ? `
- Health Score: ${completeAnalysis.opportunity.healthScore}/10
- Probabilidad: ${completeAnalysis.opportunity.probability}%
- Días sin contacto: ${completeAnalysis.opportunity.daysSince}
- Escalas:
  • DOR: ${completeAnalysis.opportunity.scaleBreakdown.dor}/10
  • PODER: ${completeAnalysis.opportunity.scaleBreakdown.poder}/10
  • VISÃO: ${completeAnalysis.opportunity.scaleBreakdown.visao}/10
  • VALOR: ${completeAnalysis.opportunity.scaleBreakdown.valor}/10
  • CONTROLE: ${completeAnalysis.opportunity.scaleBreakdown.controle}/10
  • COMPRAS: ${completeAnalysis.opportunity.scaleBreakdown.compras}/10
` : 'No disponible'}

${completeAnalysis?.alerts?.length > 0 ? `
**ALERTAS ACTIVAS:**
${completeAnalysis.alerts.slice(0, 3).map(a => `- ${a.message}`).join('\n')}
` : ''}

${webSearchResults ? `
**INFO ACTUALIZADA DE INTERNET:**
${webSearchResults}
` : ''}

**CASOS DISPONIBLES COMO REFERENCIA (usar solo si aporta valor):**
${relevantCasesForReference.length > 0 ? JSON.stringify(relevantCasesForReference, null, 2) : 'Ninguno relevante'}

---
**PREGUNTA DEL VENDEDOR:**
"${userInput}"

---
**INSTRUCCIONES FINALES:**
1. Responde DIRECTAMENTE a la pregunta
2. Estructura: Diagnóstico → Estrategia → Táctica → Evidencia (si aplica)
3. Termina SIEMPRE con UNA acción específica para HOY
4. Si mencionas un caso, que sea breve y al final: "Esto funcionó con [empresa] que logró [resultado]"
5. Máximo 300 palabras total
6. Sin sermones, sin motivación barata, solo estrategia pura`;

 try {
   const response = await fetch("https://api.anthropic.com/v1/messages", {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
       "x-api-key": ANTHROPIC_API_KEY,
       "anthropic-version": "2023-06-01"
     },
     body: JSON.stringify({
       model: "claude-3-5-sonnet-20241022",
       max_tokens: 2000,
       temperature: 0.3,
       messages: [
         { role: "user", content: promptTemplate }
       ]
     })
   });

   if (!response.ok) {
     console.log('❌ Error en Claude API:', response.status);
     return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
   }

   const data = await response.json();
   const responseText = data.content[0].text;
   
   return { type: 'direct_response', content: responseText };
   
 } catch (error) {
   console.error('❌ Error llamando a Claude:', error);
   return { type: 'fallback', content: generateSmartFallback(opportunityData, userInput, completeAnalysis) };
 }
}

// ============= FALLBACK INTELIGENTE =============
function generateSmartFallback(opportunityData, userInput, analysis) {
 if (!opportunityData) {
   return "❌ No hay oportunidad seleccionada. Selecciona un cliente del CRM para comenzar el análisis.";
 }

 let response = `📊 **Análisis de ${opportunityData.client}**\n\n`;
 
 if (analysis?.opportunity) {
   response += `**Estado:** Health ${analysis.opportunity.healthScore}/10 | Probabilidad ${analysis.opportunity.probability}%\n\n`;
 }
 
 if (analysis?.alerts?.length > 0) {
   response += `**⚠️ ALERTAS:**\n`;
   analysis.alerts.slice(0, 3).forEach(alert => {
     response += `• ${alert.message}\n`;
   });
   response += '\n';
 }
 
 if (analysis?.nextBestAction) {
   response += `**🎯 PRÓXIMA ACCIÓN:**\n`;
   response += `${analysis.nextBestAction.title}\n`;
   response += `${analysis.nextBestAction.action}\n\n`;
   if (analysis.nextBestAction.script) {
     response += `**Script sugerido:**\n`;
     response += `"${analysis.nextBestAction.script}"\n`;
   }
 }
 
 // Casos al final si hay
 if (analysis?.relevantCases?.length > 0) {
   response += `\n**📚 Referencia:**\n`;
   response += `${analysis.relevantCases[0].empresa} enfrentó algo similar y logró ROI en ${analysis.relevantCases[0].resultados.roi_meses} meses.`;
 }
 
 return response;
}

// ============= HANDLER PRINCIPAL =============
export default async function handler(req) {
 // Configurar CORS
 const headers = {
   'Access-Control-Allow-Credentials': 'true',
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
   'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
   'Content-Type': 'application/json'
 };

 if (req.method === 'OPTIONS') {
   return new Response(null, { status: 200, headers });
 }

 if (req.method !== 'POST') {
   return new Response(
     JSON.stringify({ error: 'Method not allowed' }),
     { status: 405, headers }
   );
 }

 try {
   const body = await req.json();
   const { 
     userInput, 
     opportunityData, 
     vendorName,
     pipelineData,
     isNewOpportunity
   } = body;

   console.log('🧠 Backend recibió:', { 
     userInput: userInput?.substring(0, 50), 
     hasOpportunity: !!opportunityData,
     vendor: vendorName,
     pipelineSize: pipelineData?.allOpportunities?.length || 0
   });

   // PASO 1: EJECUTAR MOTOR DE ANÁLISIS
   console.log('📊 Ejecutando motor de análisis completo...');
   const completeAnalysis = buildCompleteAnalysis(opportunityData, pipelineData, vendorName);
   
   // Validación básica
   if (!opportunityData && !isNewOpportunity && !pipelineData?.allOpportunities?.length) {
     return new Response(
       JSON.stringify({ 
         response: "❌ **No hay datos disponibles**\n\nSelecciona un cliente del CRM o crea una nueva oportunidad.",
         analysis: completeAnalysis
       }),
       { status: 200, headers }
     );
   }

   // Si no hay input, dar resumen
   if (!userInput || userInput.trim() === '') {
     let summaryResponse = '';
     
     if (completeAnalysis.pipeline) {
       summaryResponse = `📊 **Resumen del Pipeline**\n\n`;
       summaryResponse += `• Total: ${completeAnalysis.pipeline.total} oportunidades\n`;
       summaryResponse += `• Valor: R$ ${completeAnalysis.pipeline.totalValue.toLocaleString('pt-BR')}\n`;
       summaryResponse += `• En riesgo: ${completeAnalysis.pipeline.atRisk} deals\n`;
       summaryResponse += `• Health promedio: ${completeAnalysis.pipeline.averageHealth}/10\n`;
     }
     
     if (opportunityData && completeAnalysis.nextBestAction) {
       summaryResponse += `\n**Para ${opportunityData.client}:**\n`;
       summaryResponse += `${completeAnalysis.nextBestAction.title}\n`;
       summaryResponse += `👉 ${completeAnalysis.nextBestAction.action}`;
     }
     
     return new Response(
       JSON.stringify({ 
         response: summaryResponse || "💬 ¿En qué puedo ayudarte con las ventas?",
         analysis: completeAnalysis
       }),
       { status: 200, headers }
     );
   }

   // PASO 2: BÚSQUEDA WEB SI ES NECESARIA
   let webSearchResults = null;
   const needsWebSearch = userInput.toLowerCase().includes('actualiz') || 
                         userInput.toLowerCase().includes('noticia') ||
                         userInput.toLowerCase().includes('reciente');
   
   if (needsWebSearch && opportunityData?.client) {
     console.log('🔍 Buscando en Google para:', opportunityData.client);
     webSearchResults = await searchGoogleForContext(
       `${opportunityData.client} Brasil ${opportunityData.industry || ''} noticias 2024 2025`
     );
   }

   // PASO 3: DEFINIR HERRAMIENTAS DISPONIBLES
   const availableTools = [
     { 
       name: 'analizar', 
       description: 'Análisis PPVVCC completo con diagnóstico y próximos pasos',
       function: () => {
         let result = `📊 **ANÁLISIS DE ${opportunityData?.client || 'PIPELINE'}**\n\n`;
         
         if (completeAnalysis.opportunity) {
           result += `**Diagnóstico:**\n`;
           result += `Health Score: ${completeAnalysis.opportunity.healthScore}/10\n`;
           result += `Probabilidad: ${completeAnalysis.opportunity.probability}%\n`;
           result += `Días sin contacto: ${completeAnalysis.opportunity.daysSince}\n\n`;
           
           if (completeAnalysis.opportunity.criticalScales.length > 0) {
             result += `**Escalas críticas a trabajar:**\n`;
             completeAnalysis.opportunity.criticalScales.forEach(scale => {
               result += `• ${scale.name}: ${scale.value}/10\n`;
               result += `  → Acción: ${scale.action}\n`;
             });
           }
           
           if (completeAnalysis.nextBestAction) {
             result += `\n**Estrategia recomendada:**\n`;
             result += `${completeAnalysis.nextBestAction.strategy}\n\n`;
             result += `**Próxima acción:**\n`;
             result += completeAnalysis.nextBestAction.action;
           }
         }
         
         return result;
       }
     }
   ];

   // PASO 4: LLAMADA A CLAUDE
   console.log('🤖 Llamando a Claude con estructura mejorada...');
   
   const claudeResponse = await callClaudeAPI(
     opportunityData,
     userInput,
     { casos: CASOS_EXITO_REALES },
     availableTools,
     webSearchResults,
     completeAnalysis
   );

   // PASO 5: DEVOLVER RESPUESTA ESTRUCTURADA
   return new Response(
     JSON.stringify({ 
       response: claudeResponse.content,
       analysis: completeAnalysis
     }),
     { status: 200, headers }
   );

 } catch (error) {
   console.error('❌ Error en backend:', error);
   
   return new Response(
     JSON.stringify({ 
       response: '❌ **Error procesando solicitud**\n\nPor favor, intenta de nuevo.',
       error: error.message,
       analysis: null
     }),
     { status: 200, headers }
   );
 }
}
